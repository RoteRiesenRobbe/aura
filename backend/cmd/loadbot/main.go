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

	// ---- skill mode: give the bots a real loadout so the aura sensor, the
	// broadphase cost it drags in, and the SkillSystem are all in the measurement.
	// Without this a bot's aura sensor stays at radius 0 and none of that is paid.
	token     = flag.String("token", "", "cheat token (required for -skills / -warp / -god)")
	skillList = flag.String("skills", "", "comma-separated skill names to grant and equip, e.g. 'Damage'")
	warpTo    = flag.String("warp", "", "world coords 'x,y' to warp bots to after setup (1-unit granularity)")
	warpJit   = flag.Float64("warpjitter", 3, "spread bots +/- this many units around -warp so they don't stack on one point")
	god       = flag.Bool("god", false, "godmode the bots — keeps population stable when warped onto mobs")
)

// ---- metrics shared across bots

var (
	connected   atomic.Int64
	joinFails   atomic.Int64
	dropped     atomic.Int64
	rxBytes     atomic.Int64
	rxSnapshots atomic.Int64
	setupDone   atomic.Int64
	auraOn      atomic.Int64
	// auraLive is the gauge that actually matters: bots whose OWN GameState
	// reports an occupied aura slot 0 and ActiveAuraSlot >= 0. A rejected cheat
	// token is silent on the wire, so this is the only proof the loadout stuck.
	auraLive atomic.Int64
	// per-snapshot mob census, averaged over the measurement window
	mobsSeen   atomic.Int64
	mobsAggro  atomic.Int64
	mobSamples atomic.Int64
)

// ---- resolved once in main, read-only for the bots

var (
	equipPlan    []loadout
	warpX, warpY float64
	// activateSlot is the aura slot the bots switch on after setup, or -1 when
	// the loadout has no active aura.
	activateSlot int8 = -1
)

type bot struct {
	name    string
	conn    *websocket.Conn
	stop    chan struct{}
	once    sync.Once
	writeMu sync.Mutex // gorilla forbids concurrent writers; setup and input race otherwise
}

func (b *bot) send(msg []byte) error {
	b.writeMu.Lock()
	defer b.writeMu.Unlock()
	return b.conn.WriteMessage(websocket.BinaryMessage, msg)
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

// auraSlot follows the wire sentinels: -1 = no change, -2 = deactivate, >=0 = activate.
// Send an activation exactly ONCE — SetActiveAura resets the slot's TickAccumulator
// on every call, so re-sending it each tick would keep an aura with tickInterval 40
// permanently at accumulator 0 and it would never fire.
func buildInput(tick uint64, mx, my, rot float32, auraSlot int8) []byte {
	bl := flatbuffers.NewBuilder(64)
	AuraApi.InputStart(bl)
	AuraApi.InputAddTick(bl, tick)
	AuraApi.InputAddMovement(bl, AuraApi.CreateVec2f(bl, mx, my))
	AuraApi.InputAddRotation(bl, rot)
	AuraApi.InputAddActiveAuraSlot(bl, auraSlot)
	body := AuraApi.InputEnd(bl)
	AuraApi.ClientMessageStart(bl)
	AuraApi.ClientMessageAddBodyType(bl, AuraApi.ClientMessageBodyInput)
	AuraApi.ClientMessageAddBody(bl, body)
	bl.Finish(AuraApi.ClientMessageEnd(bl))
	return bl.FinishedBytes()
}

func buildCheat(tok, command string) []byte {
	bl := flatbuffers.NewBuilder(64)
	t := bl.CreateString(tok)
	c := bl.CreateString(command)
	AuraApi.CheatStart(bl)
	AuraApi.CheatAddToken(bl, t)
	AuraApi.CheatAddCommand(bl, c)
	body := AuraApi.CheatEnd(bl)
	AuraApi.ClientMessageStart(bl)
	AuraApi.ClientMessageAddBodyType(bl, AuraApi.ClientMessageBodyCheat)
	AuraApi.ClientMessageAddBody(bl, body)
	bl.Finish(AuraApi.ClientMessageEnd(bl))
	return bl.FinishedBytes()
}

func buildEquip(skillID uint16, slot int8) []byte {
	bl := flatbuffers.NewBuilder(64)
	AuraApi.EquipStart(bl)
	AuraApi.EquipAddSkillId(bl, skillID)
	AuraApi.EquipAddSlot(bl, slot)
	body := AuraApi.EquipEnd(bl)
	AuraApi.ClientMessageStart(bl)
	AuraApi.ClientMessageAddBodyType(bl, AuraApi.ClientMessageBodyEquip)
	AuraApi.ClientMessageAddBody(bl, body)
	bl.Finish(AuraApi.ClientMessageEnd(bl))
	return bl.FinishedBytes()
}

// ---- skill catalog: resolve names to registry ids over GET /skills so the
// bot never hardcodes an id that a content edit could shift underneath it.

type catalogEntry struct {
	ID       uint16 `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
}

// loadout is one resolved skill plus the slot it goes to. The server routes by
// the skill's own category, so the slot index is per-category, not global.
type loadout struct {
	name     string
	category string
	id       uint16
	slot     int8
}

func resolveLoadout(names []string) ([]loadout, error) {
	base := "http://"
	if *scheme == "wss" {
		base = "https://"
	}
	resp, err := http.Get(base + *addr + "/skills")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var cat []catalogEntry
	if err := json.NewDecoder(resp.Body).Decode(&cat); err != nil {
		return nil, err
	}
	byName := make(map[string]catalogEntry, len(cat))
	for _, e := range cat {
		byName[e.Name] = e
	}

	perCategory := map[string]int8{}
	var out []loadout
	for _, n := range names {
		e, ok := byName[n]
		if !ok {
			return nil, fmt.Errorf("skill %q not in the server catalog (%d entries)", n, len(cat))
		}
		slot := perCategory[e.Category]
		if slot >= 3 { // MaxAuraSlots == MaxPassiveSlots == MaxCooldownSlots == 3
			return nil, fmt.Errorf("more than 3 %s skills requested", e.Category)
		}
		perCategory[e.Category] = slot + 1
		out = append(out, loadout{name: e.Name, category: e.Category, id: e.ID, slot: slot})
	}
	return out, nil
}

// setupSeq is the per-bot bring-up. Every one-shot client message rides a
// depth-2 channel that the server drains once per tick, so these are sent with
// a gap rather than in a burst. Equip is rejected while in combat, so the whole
// sequence runs before the bot is warped anywhere near a mob.
func setupSeq(id int) [][]byte {
	var msgs [][]byte
	if *god {
		msgs = append(msgs, buildCheat(*token, "GOD"))
	}
	for _, l := range equipPlan {
		msgs = append(msgs, buildCheat(*token, "SKILL "+l.name))
	}
	for _, l := range equipPlan {
		msgs = append(msgs, buildEquip(l.id, l.slot))
	}
	if *warpTo != "" {
		// WARP integer-divides by 120 before the float cast (sys/cmd/cmd.go:76),
		// so this lands on whole world units — jitter has to be >= 1 unit to bite.
		jx := (float64(id%7) - 3) / 3 * *warpJit
		jy := (float64((id/7)%7) - 3) / 3 * *warpJit
		msgs = append(msgs, buildCheat(*token,
			fmt.Sprintf("WARP %d %d", int(math.Round((warpX+jx)*120)), int(math.Round((warpY+jy)*120)))))
	}
	return msgs
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
	if err := b.send(buildJoin(b.name)); err != nil {
		c.Close()
		return nil, err
	}

	var lastTick atomic.Uint64
	// -1 until setup finishes; then the writer sends the activation once and
	// puts it back to -1 (see buildInput's note on TickAccumulator).
	pendingAura := atomic.Int32{}
	pendingAura.Store(-1)

	// reader: drains snapshots, tracks the authoritative tick
	go func() {
		armed := false
		defer func() {
			if armed {
				auraLive.Add(-1)
			}
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
					// own-state fields: the server's own account of this bot's loadout
					// A mob only reports a non-zero aura_radius once it has
					// aggroed (server.fbs:161), so this counts mobs actually
					// fighting inside this bot's viewport — the proof that the
					// run exercises combat and not just an idle aura sensor.
					ent := new(AuraApi.Entity)
					mb := new(AuraApi.Mob)
					et := new(flatbuffers.Table)
					var aggro, seen int64
					for j := 0; j < gs.EntitiesLength(); j++ {
						if !gs.Entities(ent, j) || ent.EType() != AuraApi.AnyEntityMob {
							continue
						}
						if ent.E(et) {
							mb.Init(et.Bytes, et.Pos)
							seen++
							if mb.AuraRadius() > 0 {
								aggro++
							}
						}
					}
					mobsSeen.Add(seen)
					mobsAggro.Add(aggro)
					mobSamples.Add(1)

					live := gs.ActiveAuraSlot() >= 0 && gs.AuraSlotsLength() > 0 && gs.AuraSlots(0) != 0
					if live != armed {
						armed = live
						if live {
							auraLive.Add(1)
						} else {
							auraLive.Add(-1)
						}
					}
				}
			}
		}
	}()

	// setup: grant + equip + warp, once snapshots confirm the bot has an entity.
	// Spaced out because each one-shot channel is depth 2, drained once per tick.
	if len(equipPlan) > 0 || *god || *warpTo != "" {
		go func() {
			for lastTick.Load() == 0 {
				select {
				case <-b.stop:
					return
				case <-time.After(50 * time.Millisecond):
				}
			}
			for _, msg := range setupSeq(id) {
				select {
				case <-b.stop:
					return
				case <-time.After(120 * time.Millisecond):
				}
				if err := b.send(msg); err != nil {
					b.close()
					return
				}
			}
			setupDone.Add(1)
			pendingAura.Store(int32(activateSlot))
		}()
	}

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
				aura := int8(-1)
				if p := pendingAura.Swap(-1); p >= 0 {
					aura = int8(p)
					auraOn.Add(1)
				}
				if err := b.send(buildInput(lt+1, mx, my, float32(phase), aura)); err != nil {
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

	if (*skillList != "" || *warpTo != "" || *god) && *token == "" {
		log.Fatal("-skills / -warp / -god need -token (the server's tokens.list entry)")
	}
	if *skillList != "" {
		var names []string
		for _, n := range strings.Split(*skillList, ",") {
			if n = strings.TrimSpace(n); n != "" {
				names = append(names, n)
			}
		}
		var err error
		if equipPlan, err = resolveLoadout(names); err != nil {
			log.Fatalf("resolving -skills: %v", err)
		}
		for _, l := range equipPlan {
			fmt.Printf("loadout: %-16s id=%-4d %-13s slot=%d\n", l.name, l.id, l.category, l.slot)
			if l.category == "active_aura" && l.slot == 0 {
				activateSlot = 0
			}
		}
	}
	if *warpTo != "" {
		p := strings.Split(*warpTo, ",")
		if len(p) != 2 {
			log.Fatalf("bad -warp %q, want 'x,y'", *warpTo)
		}
		var err error
		if warpX, err = strconv.ParseFloat(strings.TrimSpace(p[0]), 64); err != nil {
			log.Fatalf("bad -warp x: %v", err)
		}
		if warpY, err = strconv.ParseFloat(strings.TrimSpace(p[1]), 64); err != nil {
			log.Fatalf("bad -warp y: %v", err)
		}
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
		mobsSeen.Store(0)
		mobsAggro.Store(0)
		mobSamples.Store(0)
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
		// A rejected cheat token is silent on the wire — the server just logs and
		// drops it. These counters only prove the messages were SENT; the aura
		// radius in the snapshot is the real proof, checked separately.
		// Printed for the no-loadout control too: comparing an aura run against a
		// control is only valid if both saw a similar mob population.
		if len(equipPlan) > 0 || *warpTo != "" {
			n := math.Max(1, float64(mobSamples.Load()))
			fmt.Fprintf(os.Stderr,
				"   (setup sent %d/%d, activations %d, auras CONFIRMED LIVE %d/%d | mobs/viewport %.1f, aggroed %.1f)\n",
				setupDone.Load(), liveBots, auraOn.Load(), auraLive.Load(), liveBots,
				float64(mobsSeen.Load())/n, float64(mobsAggro.Load())/n)
		}
	}

	for _, b := range bots {
		b.close()
	}
	fmt.Println("done.")
}
