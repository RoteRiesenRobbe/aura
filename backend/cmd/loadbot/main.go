package main

// Load-test harness — kept for capacity checks (see devops/loadtest.md).
//
// Spawns N headless websocket clients that join the game and send Input at the
// real 30 Hz cadence, then ramps the population through a series of steps and
// reports server tick-budget utilisation at each level.
//
// Usage:
//
//	go run ./cmd/loadbot -addr localhost:2000 -steps 25,50,100,200,400 -hold 40s
//
// The server must be running with -profile :6060 for tick stats.

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/gorilla/websocket"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
)

var (
	addr     = flag.String("addr", "localhost:2000", "game server host:port")
	scheme   = flag.String("scheme", "ws", "ws or wss")
	stepsRaw = flag.String("steps", "25,50,100,200,400", "comma-separated bot counts to ramp through")
	hold     = flag.Duration("hold", 40*time.Second, "how long to hold each step")
	settle   = flag.Duration("settle", 8*time.Second, "settling time after ramping before measuring")
	dialRate = flag.Float64("dialrate", 8, "new connections per second (server accepts 1/tick = 30/s max)")
	statsURL = flag.String("stats", "http://localhost:6060/tickstats", "tickstats endpoint; empty to skip")
	roam     = flag.Float64("roam", 1.0, "movement magnitude 0..1; 0 = stand still")
	disperse = flag.Bool("disperse", false, "walk each bot in a fixed random heading (spreads out) instead of circling in place")
)

// ---- metrics shared across bots

var (
	connected   atomic.Int64
	joinFails   atomic.Int64
	dropped     atomic.Int64
	rxBytes     atomic.Int64
	rxSnapshots atomic.Int64
)

type bot struct {
	name string
	conn *websocket.Conn
	stop chan struct{}
	once sync.Once
}

func (b *bot) close() {
	b.once.Do(func() {
		close(b.stop)
		b.conn.Close()
	})
}

func buildJoin(name string) []byte {
	bl := flatbuffers.NewBuilder(64)
	n := bl.CreateString(name)
	AuraApi.JoinStart(bl)
	AuraApi.JoinAddPlayerName(bl, n)
	body := AuraApi.JoinEnd(bl)
	AuraApi.ClientMessageStart(bl)
	AuraApi.ClientMessageAddBodyType(bl, AuraApi.ClientMessageBodyJoin)
	AuraApi.ClientMessageAddBody(bl, body)
	bl.Finish(AuraApi.ClientMessageEnd(bl))
	return bl.FinishedBytes()
}

func buildInput(tick uint64, mx, my, rot float32) []byte {
	bl := flatbuffers.NewBuilder(64)
	AuraApi.InputStart(bl)
	AuraApi.InputAddTick(bl, tick)
	AuraApi.InputAddMovement(bl, AuraApi.CreateVec2f(bl, mx, my))
	AuraApi.InputAddRotation(bl, rot)
	body := AuraApi.InputEnd(bl)
	AuraApi.ClientMessageStart(bl)
	AuraApi.ClientMessageAddBodyType(bl, AuraApi.ClientMessageBodyInput)
	AuraApi.ClientMessageAddBody(bl, body)
	bl.Finish(AuraApi.ClientMessageEnd(bl))
	return bl.FinishedBytes()
}

func spawnBot(id int) (*bot, error) {
	u := url.URL{Scheme: *scheme, Host: *addr, Path: "/game"}
	dialer := &websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	c, _, err := dialer.Dial(u.String(), nil)
	if err != nil {
		return nil, err
	}
	c.SetReadLimit(1 << 22)

	b := &bot{name: fmt.Sprintf("bot%03d", id), conn: c, stop: make(chan struct{})}
	if err := c.WriteMessage(websocket.BinaryMessage, buildJoin(b.name)); err != nil {
		c.Close()
		return nil, err
	}

	var lastTick atomic.Uint64

	// reader: drains snapshots, tracks the authoritative tick
	go func() {
		defer func() {
			dropped.Add(1)
			connected.Add(-1)
			b.close()
		}()
		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				return
			}
			rxBytes.Add(int64(len(msg)))
			sm := AuraApi.GetRootAsServerMessage(msg, 0)
			if sm.BodyType() == AuraApi.ServerMessageBodyGameState {
				rxSnapshots.Add(1)
				tbl := new(flatbuffers.Table)
				if sm.Body(tbl) {
					gs := new(AuraApi.GameState)
					gs.Init(tbl.Bytes, tbl.Pos)
					lastTick.Store(gs.Tick())
				}
			}
		}
	}()

	// writer: 30 Hz input, wandering in a slow circle so physics/AI stay live
	go func() {
		t := time.NewTicker(time.Second / 30)
		defer t.Stop()
		phase := rand.Float64() * math.Pi * 2
		heading := rand.Float64() * math.Pi * 2 // fixed per-bot walk direction
		for {
			select {
			case <-b.stop:
				return
			case <-t.C:
				lt := lastTick.Load()
				if lt == 0 {
					continue // no snapshot yet — the real client waits too
				}
				phase += 0.01
				var mx, my float32
				if *disperse {
					mx = float32(math.Cos(heading) * *roam)
					my = float32(math.Sin(heading) * *roam)
				} else {
					mx = float32(math.Cos(phase) * *roam)
					my = float32(math.Sin(phase) * *roam)
				}
				if err := c.WriteMessage(websocket.BinaryMessage,
					buildInput(lt+1, mx, my, float32(phase))); err != nil {
					b.close()
					return
				}
			}
		}
	}()

	connected.Add(1)
	return b, nil
}

type tickSummary struct {
	Samples    int    `json:"samples"`
	TotalTicks uint64 `json:"total_ticks"`
	P50        int64  `json:"p50_us"`
	P95        int64  `json:"p95_us"`
	P99        int64  `json:"p99_us"`
	Max        int64  `json:"max_us"`
	BudgetUs   int64  `json:"budget_us"`
}

func fetchStats(reset bool) (*tickSummary, error) {
	if *statsURL == "" {
		return nil, nil
	}
	u := *statsURL
	if reset {
		u += "?reset=1"
	}
	resp, err := http.Get(u)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var s tickSummary
	if err := json.NewDecoder(resp.Body).Decode(&s); err != nil {
		return nil, err
	}
	return &s, nil
}

func main() {
	flag.Parse()

	var steps []int
	for _, f := range strings.Split(*stepsRaw, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(f))
		if err != nil {
			log.Fatalf("bad -steps entry %q: %v", f, err)
		}
		steps = append(steps, n)
	}

	var bots []*bot
	nextID := 0

	fmt.Printf("%-6s %-9s %-8s %-8s %-8s %-8s %-7s %-9s %-8s\n",
		"bots", "connected", "p50ms", "p95ms", "p99ms", "maxms", "util%", "snap/s/bot", "kB/s/bot")

	for _, target := range steps {
		// ---- ramp up to the target, staggered to respect the 1-join-per-tick funnel
		gap := time.Duration(float64(time.Second) / *dialRate)
		for len(bots) < target {
			b, err := spawnBot(nextID)
			nextID++
			if err != nil {
				joinFails.Add(1)
			} else {
				bots = append(bots, b)
			}
			time.Sleep(gap)
		}

		time.Sleep(*settle)

		// ---- measurement window
		if _, err := fetchStats(true); err != nil {
			log.Printf("stats reset failed: %v", err)
		}
		rxBytes.Store(0)
		rxSnapshots.Store(0)
		start := time.Now()

		time.Sleep(*hold)

		elapsed := time.Since(start).Seconds()
		s, err := fetchStats(false)
		liveBots := connected.Load()

		snapPerBot := float64(rxSnapshots.Load()) / elapsed / math.Max(1, float64(liveBots))
		kbPerBot := float64(rxBytes.Load()) / 1024 / elapsed / math.Max(1, float64(liveBots))

		if err != nil || s == nil {
			fmt.Printf("%-6d %-9d %-8s %-8s %-8s %-8s %-7s %-9.1f %-8.1f\n",
				target, liveBots, "-", "-", "-", "-", "-", snapPerBot, kbPerBot)
		} else {
			ms := func(us int64) float64 { return float64(us) / 1000 }
			util := float64(s.P95) / float64(s.BudgetUs) * 100
			fmt.Printf("%-6d %-9d %-8.2f %-8.2f %-8.2f %-8.2f %-7.1f %-9.1f %-8.1f\n",
				target, liveBots, ms(s.P50), ms(s.P95), ms(s.P99), ms(s.Max), util, snapPerBot, kbPerBot)
		}

		if joinFails.Load() > 0 || dropped.Load() > 0 {
			fmt.Fprintf(os.Stderr, "   (join failures: %d, dropped connections: %d)\n",
				joinFails.Load(), dropped.Load())
		}
	}

	for _, b := range bots {
		b.close()
	}
	fmt.Println("done.")
}
