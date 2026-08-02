// Command authbench measures the CREDENTIALED account path under concurrency.
//
// `cmd/loadbot` already creates a real account per bot on its way into the world
// — but only the ANONYMOUS path (POST /api/characters), which is a SHA-256
// lookup key and deliberately bcrypt-free, so that a capacity ramp measures the
// game loop rather than a password hash. That leaves register and login, the
// two calls that DO hash, unmeasured on the live box.
//
// This tool measures exactly those. It answers the question
// pkg/aura/auth/password.go leaves open in as many words — "Revisit against a
// measurement on the VPS, alongside bcryptCost" — for both `DefaultGateSlots`
// (2, [PLACEHOLDER]) and `bcryptCost` (11, whose ~0.9 s live cost is an
// extrapolation from a dev machine, never confirmed on the VPS).
//
// # What a run does
//
// Per virtual player, three ordinary HTTP calls, the same ones a browser makes:
//
//	POST /api/characters      → mints an anonymous account + character (control:
//	                            no bcrypt, so it prices the box and the network)
//	POST /api/auth/register   → adds credentials to THAT account (bcrypt)
//	POST /api/auth/login      → verifies them (bcrypt again), -op both/login
//
// The create call is not incidental. Registration upgrades an existing
// anonymous account (accounts/auth.go: requireCaller, then who.registered()),
// so there is no way to reach register without one — and having timed it anyway
// gives every bcrypt figure a same-run, same-path control. A slow register with
// a slow create is a slow box; a slow register with a fast create is the gate.
//
// # ⚑ THE 503 IS NOT OBSERVABLE, AND THE TAIL DOES NOT GET ONE
//
// password.go describes the gate's overflow as "the tail of that queue gets a
// 503". On the live server it does not, and this tool cannot make it: Gate.do
// returns ErrBusy only when the CALLER's request context is done, and
// cmd/aurad/aurad.go builds its http.Server with no ReadTimeout, no
// WriteTimeout and no TimeoutHandler — so r.Context() ends only when the client
// disconnects. A queued caller therefore waits as long as the queue takes; one
// that hangs up first gets its 503 written into a closed connection, where
// nobody reads it.
//
// So a `busy` count here is expected to be 0, and the measurement that matters
// is the LATENCY DISTRIBUTION — p95/p99 are the queue depth made visible.
// Client timeouts are counted and reported separately, because with no server
// timeout they are the honest name for what happened: we gave up, the server
// did not refuse.
//
// # ⚑ Naming is a contract with devops/cleanup-loadbots.sql
//
// Characters AND usernames both take -name-prefix, because that script claims a
// bot account as "anonymous, OR registered under the prefix". A registered bot
// outside the prefix is not merely missed by cleanup — it lands outside the
// doomed set, its characters then match the pattern from an unclaimed account,
// and the guard aborts the whole transaction. One stray bot strands the run.
//
// Names also carry a per-run stamp (-stamp), which is not just tidiness: a
// colliding username costs a throttle step ON THE IP AXIS (accounts/auth.go, on
// store.ErrUsernameTaken), so replaying a run against its own leftovers would
// progressively delay this machine up to ThrottleMaxDelay and quietly corrupt
// the very latencies being measured.
//
// Usage against live (start small; each step is seconds):
//
//	go run ./cmd/authbench -addr aura-game.duckdns.org:443 -name-prefix loadbot_ -n 8 -c 2
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/accounts"
)

var (
	scheme     = flag.String("scheme", "https", "http or https")
	addr       = flag.String("addr", "aura-game.duckdns.org:443", "host:port of the server under test")
	namePrefix = flag.String("name-prefix", "loadbot_", "prefix for BOTH character names and usernames; must match the prefix given to cleanup-loadbots.sql, and must not be the reserved hrnss_")
	n          = flag.Int("n", 8, "how many accounts to put through the path")
	conc       = flag.Int("c", 2, "how many run at once (the gate holds 2 slots; -c above that is what makes a queue)")
	op         = flag.String("op", "register", "which hashing calls to make: register, login, or both")
	timeout    = flag.Duration("timeout", 120*time.Second, "per-call client timeout; see the note on the 503 — this is a giving-up point, not a server refusal")
	stamp      = flag.String("stamp", "", "per-run name stamp; defaults to UTC HHMM")

	// ⚑ Must satisfy ValidatePassword: >=8 runes, at least one non-alphanumeric,
	// not on the blocklist, and not equal to the username. The '!' is the
	// special character; nothing here normalises onto a blocklist entry.
	password = flag.String("password", "b3nch!aura-Qx", "password every bot registers with")
)

func main() {
	flag.Parse()
	if *n < 1 || *conc < 1 {
		log.Fatal("-n and -c must both be at least 1")
	}
	if strings.EqualFold(*namePrefix, "hrnss_") {
		log.Fatal("-name-prefix hrnss_ is the reserved harness namespace and a non-dev server refuses it; pick something else")
	}
	doRegister := *op == "register" || *op == "both"
	doLogin := *op == "login" || *op == "both"
	if !doRegister && !doLogin {
		log.Fatalf("-op %q: want register, login or both", *op)
	}
	// login-only still has to register first — there are no credentials to verify
	// otherwise. It just does not COUNT the register.
	// ⚑ SECONDS, not HHMM. Minute resolution is not enough: two runs inside the
	// same minute reuse the same names, and the second one takes a wall of 409
	// name_taken on /api/characters — which costs no throttle step (only
	// username_taken does that, in handleRegister) but silently shrinks the
	// sample, so a run reports fewer bots than it was asked for and the
	// concurrency it actually reached is not the concurrency on the flag.
	runStamp := *stamp
	if runStamp == "" {
		runStamp = time.Now().UTC().Format("150405")
	}

	base := *scheme + "://" + *addr
	client := &http.Client{Timeout: *timeout}

	// ⚑ Character names cap at 20 runes (auth.CharacterNameMaxLength) and must
	// end on a letter or digit. prefix + stamp + '_' + 4 digits is 8+6+1+4 = 19
	// for the default prefix — one rune of headroom, so a LONGER prefix trades
	// against -n's width. The server says so plainly if it does not fit.
	nameOf := func(i int) string { return fmt.Sprintf("%s%s_%04d", *namePrefix, runStamp, i) }

	fmt.Printf("authbench → %s\n", base)
	fmt.Printf("  n=%d  concurrency=%d  op=%s  names=%s…  timeout=%s\n\n",
		*n, *conc, *op, nameOf(0), *timeout)

	var (
		mu      sync.Mutex
		create  = &series{name: "create   (no bcrypt, control)"}
		regs    = &series{name: "register (bcrypt)"}
		logins  = &series{name: "login    (bcrypt)"}
		jobs    = make(chan int)
		wg      sync.WaitGroup
		started = time.Now()
	)

	for w := 0; w < *conc; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				name := nameOf(i)

				secret, _, d, outcome := createCharacter(client, base, name)
				mu.Lock()
				create.add(d, outcome)
				mu.Unlock()
				if outcome != ok {
					continue
				}

				d, outcome = registerAccount(client, base, name, secret)
				if doRegister {
					mu.Lock()
					regs.add(d, outcome)
					mu.Unlock()
				}
				if outcome != ok {
					continue
				}

				if doLogin {
					d, outcome = login(client, base, name)
					mu.Lock()
					logins.add(d, outcome)
					mu.Unlock()
				}
			}
		}()
	}
	for i := 0; i < *n; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()

	wall := time.Since(started)
	create.report()
	if doRegister {
		regs.report()
	}
	if doLogin {
		logins.report()
	}
	fmt.Printf("wall %s for %d account(s) at concurrency %d\n", wall.Round(time.Millisecond), *n, *conc)
	if regs.count(ok) > 0 {
		fmt.Printf("\n⚑ %d account(s) now hold credentials under %q. Clean up on the box:\n", regs.count(ok), *namePrefix)
		fmt.Printf("   sudo -u postgres psql -d aura -v ON_ERROR_STOP=1 -v prefix=%s -f /tmp/cleanup-loadbots.sql\n", *namePrefix)
	}
}

// outcome classifies a call for the summary. The distinction that matters is
// busy-vs-timeout: see the package comment on why busy is expected to be 0.
type outcome int

const (
	ok outcome = iota
	busy
	clientTimeout
	refused
	failed
)

func (o outcome) String() string {
	switch o {
	case ok:
		return "ok"
	case busy:
		return "busy(503)"
	case clientTimeout:
		return "timeout"
	case refused:
		return "refused"
	}
	return "error"
}

func createCharacter(c *http.Client, base, name string) (secret string, id int64, d time.Duration, out outcome) {
	var body struct {
		Character struct {
			ID int64 `json:"id"`
		} `json:"character"`
		AnonymousSecret string `json:"anonymousSecret"`
	}
	d, out = call(c, base+"/api/characters", "", map[string]any{"name": name}, &body)
	return body.AnonymousSecret, body.Character.ID, d, out
}

func registerAccount(c *http.Client, base, name, secret string) (time.Duration, outcome) {
	return call(c, base+"/api/auth/register", secret,
		map[string]any{"username": name, "password": *password}, nil)
}

func login(c *http.Client, base, name string) (time.Duration, outcome) {
	return call(c, base+"/api/auth/login", "",
		map[string]any{"username": name, "password": *password}, nil)
}

// call posts body and times the whole round trip, decoding into out when given.
func call(c *http.Client, url, secret string, body any, out any) (time.Duration, outcome) {
	encoded, err := json.Marshal(body)
	if err != nil {
		log.Fatalf("encoding a request body: %v", err) // our own bug, not the server's
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(encoded))
	if err != nil {
		log.Fatalf("building a request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if secret != "" {
		req.Header.Set(accounts.AnonymousSecretHeader, secret)
	}

	started := time.Now()
	resp, err := c.Do(req)
	d := time.Since(started)
	if err != nil {
		if strings.Contains(err.Error(), "Client.Timeout") {
			return d, clientTimeout
		}
		fmt.Fprintf(os.Stderr, "  %s: %v\n", url, err)
		return d, failed
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		var e struct {
			Error string `json:"error"`
			Code  string `json:"code"`
		}
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		_ = json.Unmarshal(raw, &e)
		fmt.Fprintf(os.Stderr, "  %s → %s %s %q\n", short(url), resp.Status, e.Code, e.Error)
		if resp.StatusCode == http.StatusServiceUnavailable {
			return d, busy
		}
		return d, refused
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			fmt.Fprintf(os.Stderr, "  %s: decoding the reply: %v\n", short(url), err)
			return d, failed
		}
	}
	return d, ok
}

func short(url string) string {
	if i := strings.Index(url, "/api/"); i >= 0 {
		return url[i:]
	}
	return url
}

// series collects the timings and outcomes of one kind of call.
type series struct {
	name     string
	samples  []time.Duration // successful calls only — a refusal times a different code path
	outcomes map[outcome]int
}

func (s *series) add(d time.Duration, o outcome) {
	if s.outcomes == nil {
		s.outcomes = map[outcome]int{}
	}
	s.outcomes[o]++
	if o == ok {
		s.samples = append(s.samples, d)
	}
}

func (s *series) count(o outcome) int { return s.outcomes[o] }

func (s *series) report() {
	total := 0
	for _, c := range s.outcomes {
		total += c
	}
	if total == 0 {
		return
	}
	fmt.Printf("%s  n=%d", s.name, total)
	for _, o := range []outcome{busy, clientTimeout, refused, failed} {
		if c := s.outcomes[o]; c > 0 {
			fmt.Printf("  %s=%d", o, c)
		}
	}
	fmt.Println()
	if len(s.samples) == 0 {
		fmt.Printf("    no successful calls to time\n")
		return
	}
	sort.Slice(s.samples, func(i, j int) bool { return s.samples[i] < s.samples[j] })
	fmt.Printf("    min %-9s p50 %-9s p95 %-9s p99 %-9s max %s\n",
		round(s.samples[0]), round(pct(s.samples, 50)), round(pct(s.samples, 95)),
		round(pct(s.samples, 99)), round(s.samples[len(s.samples)-1]))
}

// pct returns the p-th percentile by nearest-rank, which needs no interpolation
// and never invents a value the run did not actually see.
func pct(sorted []time.Duration, p int) time.Duration {
	rank := (p*len(sorted) + 99) / 100 // ceil(p/100 * n)
	if rank < 1 {
		rank = 1
	}
	if rank > len(sorted) {
		rank = len(sorted)
	}
	return sorted[rank-1]
}

func round(d time.Duration) time.Duration { return d.Round(time.Millisecond) }
