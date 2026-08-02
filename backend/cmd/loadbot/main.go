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
	// Skill LEVEL matters for cost: aura radius scales with it, and a bigger
	// radius spans more broadphase cells. Levels need skill points, which come
	// from player level, so this cheats XP first.
	skillLevel = flag.Int("skilllevel", 0, "raise every granted skill to this level (capped per skill maxLevel); 0 = leave at 1")
	// Cooldowns are never fired by the game on a player's behalf — only an
	// explicit activation does. Without this the equipped cooldown slots are
	// dead weight in the measurement.
	castEvery = flag.Duration("cast", 0, "request activation of every equipped cooldown slot this often; 0 = never")

	// ---- demo mode: a legible formation instead of a load pattern. -orbit
	// parks each bot on a concentric ring around a point and walks it round,
	// so a watching client sees ordered circles rather than a milling crowd.
	// It replaces -warp's jittered blob placement (they are mutually exclusive).
	orbit    = flag.String("orbit", "", "world coords 'x,y' to circle: bots ring out from it instead of -warp's blob")
	orbitR0  = flag.Float64("orbitr0", 4, "radius of the innermost ring, in world units")
	orbitGap = flag.Float64("orbitgap", 2, "radius added per ring")
	orbitPer = flag.Int("orbitper", 5, "bots per ring")
	// Names carry the point of a demo run — see .claude/skills/verify/botname.mjs,
	// which generates them. Cycled by bot index; falls back to bot%03d.
	// ⚑ SEMICOLON-separated, not comma: a generated name may itself contain a
	// comma ("Quest, the Untested" — the shape the server's own name mangler
	// uses), and comma-splitting silently turns 45 names into 50 half-names.
	nameList = flag.String("names", "", "semicolon-separated bot names, assigned in order (default bot000, bot001, …)")
)

// orbitOf returns the ring index, radius and starting angle for a bot.
func orbitOf(id int) (ring int, radius, angle float64) {
	per := *orbitPer
	if per < 1 {
		per = 1
	}
	ring = id / per
	radius = *orbitR0 + float64(ring)**orbitGap
	angle = 2 * math.Pi * float64(id%per) / float64(per)
	return ring, radius, angle
}

func nameOf(id int) string {
	if *nameList != "" {
		names := strings.Split(*nameList, ";")
		if len(names) > 0 {
			return strings.TrimSpace(names[id%len(names)])
		}
	}
	return fmt.Sprintf("bot%03d", id)
}

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
	// per-snapshot loadout census — the server's own account of what each bot
	// is carrying, averaged over the window. Same reasoning as auraLive: the
	// cheat/equip/spend paths are all silent on rejection, so the only proof
	// the build stuck is reading it back out of the bot's own GameState.
	passivesFilled atomic.Int64
	cdsFilled      atomic.Int64
	cdsOnCooldown  atomic.Int64 // >0 means the cooldown actually fired
	levelsSpent    atomic.Int64 // sum of (level-1) over the spellbook
)

// ---- resolved once in main, read-only for the bots

var (
	equipPlan    []loadout
	warpX, warpY float64
	// activateSlot is the aura slot the bots switch on after setup, or -1 when
	// the loadout has no active aura.
	activateSlot int8 = -1
	// cooldownSlots are the slot indices the bots mash every castTicks ticks.
	cooldownSlots []uint8
	castTicks     int
)

var castsSent atomic.Int64

// walkPerTick mirrors game.player.walkingSpeedPerTick (conf.default.json). The
// orbit turn rate w = v/r needs the real step size; a wrong value just makes
// the circle a slowly opening or closing spiral.
const walkPerTick = 0.05

type bot struct {
	id      int
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
// cds are cooldown slot indices to activate this tick; the server ignores any
// slot that is empty or still counting down, so pressing every button on an
// interval is a fair stand-in for a player mashing them.
func buildInput(tick uint64, mx, my, rot float32, auraSlot int8, cds []uint8) []byte {
	bl := flatbuffers.NewBuilder(64)
	var cdVec flatbuffers.UOffsetT
	if len(cds) > 0 {
		AuraApi.InputStartCooldownActivationsVector(bl, len(cds))
		for i := len(cds) - 1; i >= 0; i-- { // vectors are built back to front
			bl.PrependByte(cds[i])
		}
		cdVec = bl.EndVector(len(cds))
	}
	AuraApi.InputStart(bl)
	AuraApi.InputAddTick(bl, tick)
	AuraApi.InputAddMovement(bl, AuraApi.CreateVec2f(bl, mx, my))
	AuraApi.InputAddRotation(bl, rot)
	AuraApi.InputAddActiveAuraSlot(bl, auraSlot)
	if len(cds) > 0 {
		AuraApi.InputAddCooldownActivations(bl, cdVec)
	}
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

func buildSpend(skillID uint16) []byte {
	bl := flatbuffers.NewBuilder(64)
	AuraApi.SpendSkillPointStart(bl)
	AuraApi.SpendSkillPointAddSkillId(bl, skillID)
	body := AuraApi.SpendSkillPointEnd(bl)
	AuraApi.ClientMessageStart(bl)
	AuraApi.ClientMessageAddBodyType(bl, AuraApi.ClientMessageBodySpendSkillPoint)
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
	MaxLevel int    `json:"maxLevel"`
}

// loadout is one resolved skill plus the slot it goes to. The server routes by
// the skill's own category, so the slot index is per-category, not global.
type loadout struct {
	name     string
	category string
	id       uint16
	slot     int8
	maxLevel int
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
	// The endpoint wraps the list since the tooltip work: {"curve":…,"skills":[…]}.
	var payload struct {
		Skills []catalogEntry `json:"skills"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	cat := payload.Skills
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
		out = append(out, loadout{name: e.Name, category: e.Category, id: e.ID, slot: slot, maxLevel: e.MaxLevel})
	}
	return out, nil
}

// targetLevel is the level this skill is driven to: the -skilllevel request
// clamped to what the skill actually supports. Pass a big number to max out.
func (l loadout) targetLevel() int {
	if *skillLevel < 1 {
		return 1
	}
	if l.maxLevel > 0 && *skillLevel > l.maxLevel {
		return l.maxLevel
	}
	return *skillLevel
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
	if *skillLevel > 1 {
		// Skill points are derived from player level (level-1, one per level),
		// so buy the whole budget in one shot — XP overshoots freely, the
		// server clamps the level at the conf maxLevel.
		msgs = append(msgs, buildCheat(*token, "XP 100000000"))
		for _, l := range equipPlan {
			for lvl := 1; lvl < l.targetLevel(); lvl++ {
				msgs = append(msgs, buildSpend(l.id))
			}
		}
	}
	for _, l := range equipPlan {
		msgs = append(msgs, buildEquip(l.id, l.slot))
	}
	// WARP integer-divides by 120 before the float cast (sys/cmd/cmd.go:76),
	// so both placements land on whole world units — jitter has to be >= 1 unit
	// to bite, and a ring narrower than ~1 unit collapses onto its centre.
	switch {
	case *orbit != "":
		_, r, a := orbitOf(id)
		msgs = append(msgs, buildCheat(*token,
			fmt.Sprintf("WARP %d %d",
				int(math.Round((warpX+r*math.Cos(a))*120)),
				int(math.Round((warpY+r*math.Sin(a))*120)))))
	case *warpTo != "":
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

	b := &bot{id: id, name: nameOf(id), conn: c, stop: make(chan struct{})}
	if err := b.send(buildJoin(b.name)); err != nil {
		c.Close()
		return nil, err
	}

	var lastTick atomic.Uint64
	// -1 until setup finishes; then the writer sends the activation once and
	// puts it back to -1 (see buildInput's note on TickAccumulator).
	pendingAura := atomic.Int32{}
	pendingAura.Store(-1)
	// cooldown mashing only starts once the slots are actually filled
	casting := atomic.Bool{}

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

					// loadout census — same window, same denominator
					var pf, cf, cc, spent int64
					for j := 0; j < gs.PassiveSlotsLength(); j++ {
						if gs.PassiveSlots(j) != 0 {
							pf++
						}
					}
					for j := 0; j < gs.CooldownSlotsLength(); j++ {
						if gs.CooldownSlots(j) != 0 {
							cf++
						}
					}
					for j := 0; j < gs.CooldownRemainingTicksLength(); j++ {
						if gs.CooldownRemainingTicks(j) > 0 {
							cc++
						}
					}
					for j := 0; j < gs.SpellbookLevelsLength(); j++ {
						spent += int64(gs.SpellbookLevels(j)) - 1
					}
					passivesFilled.Add(pf)
					cdsFilled.Add(cf)
					cdsOnCooldown.Add(cc)
					levelsSpent.Add(spent)

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
	if len(equipPlan) > 0 || *god || *warpTo != "" || *orbit != "" {
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
			casting.Store(true)
		}()
	}

	// writer: 30 Hz input, wandering in a slow circle so physics/AI stay live
	go func() {
		t := time.NewTicker(time.Second / 30)
		defer t.Stop()
		phase := rand.Float64() * math.Pi * 2
		heading := rand.Float64() * math.Pi * 2 // fixed per-bot walk direction
		orbitRadius := 1.0
		if *orbit != "" {
			// Start on the tangent of the ring the bot was warped onto, so it
			// travels along the circle instead of cutting across it.
			_, r, a := orbitOf(b.id)
			orbitRadius, heading = r, a+math.Pi/2
		}
		// stagger the mash across bots so 140 activations don't land on one tick
		castCounter := rand.Intn(max(1, castTicks))
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
				switch {
				case *orbit != "":
					// Open loop: walk the tangent and turn at w = v/r, which
					// traces a circle of radius r. The bot never reads its own
					// position back, so physics nudges accumulate as drift —
					// fine for a demo, useless as a precise measurement.
					heading += walkPerTick / orbitRadius
					mx = float32(math.Cos(heading) * *roam)
					my = float32(math.Sin(heading) * *roam)
				case *disperse:
					mx = float32(math.Cos(heading) * *roam)
					my = float32(math.Sin(heading) * *roam)
				default:
					mx = float32(math.Cos(phase) * *roam)
					my = float32(math.Sin(phase) * *roam)
				}
				aura := int8(-1)
				if p := pendingAura.Swap(-1); p >= 0 {
					aura = int8(p)
					auraOn.Add(1)
				}
				var cds []uint8
				if castTicks > 0 && casting.Load() {
					castCounter++
					if castCounter >= castTicks {
						castCounter = 0
						cds = cooldownSlots
						castsSent.Add(1)
					}
				}
				if err := b.send(buildInput(lt+1, mx, my, float32(phase), aura, cds)); err != nil {
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

	if (*skillList != "" || *warpTo != "" || *orbit != "" || *god) && *token == "" {
		log.Fatal("-skills / -warp / -orbit / -god need -token (the server's tokens.list entry)")
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
			fmt.Printf("loadout: %-16s id=%-4d %-13s slot=%d level=%d\n",
				l.name, l.id, l.category, l.slot, l.targetLevel())
			if l.category == "active_aura" && l.slot == 0 {
				activateSlot = 0
			}
			if l.category == "cooldown" {
				cooldownSlots = append(cooldownSlots, uint8(l.slot))
			}
		}
	}
	if *castEvery > 0 {
		castTicks = int(castEvery.Seconds() * 30)
		if castTicks < 1 {
			castTicks = 1
		}
		if len(cooldownSlots) == 0 {
			log.Fatal("-cast needs at least one cooldown skill in -skills")
		}
	}
	if *warpTo != "" && *orbit != "" {
		log.Fatal("-warp and -orbit both place the bots; pick one")
	}
	if centre := *warpTo + *orbit; centre != "" {
		which := "-warp"
		if *orbit != "" {
			which = "-orbit"
		}
		p := strings.Split(centre, ",")
		if len(p) != 2 {
			log.Fatalf("bad %s %q, want 'x,y'", which, centre)
		}
		var err error
		if warpX, err = strconv.ParseFloat(strings.TrimSpace(p[0]), 64); err != nil {
			log.Fatalf("bad %s x: %v", which, err)
		}
		if warpY, err = strconv.ParseFloat(strings.TrimSpace(p[1]), 64); err != nil {
			log.Fatalf("bad %s y: %v", which, err)
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
		passivesFilled.Store(0)
		cdsFilled.Store(0)
		cdsOnCooldown.Store(0)
		levelsSpent.Store(0)
		castsSent.Store(0)
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
		if len(equipPlan) > 0 || *warpTo != "" || *orbit != "" {
			n := math.Max(1, float64(mobSamples.Load()))
			fmt.Fprintf(os.Stderr,
				"   (setup sent %d/%d, activations %d, auras CONFIRMED LIVE %d/%d | mobs/viewport %.1f, aggroed %.1f)\n",
				setupDone.Load(), liveBots, auraOn.Load(), auraLive.Load(), liveBots,
				float64(mobsSeen.Load())/n, float64(mobsAggro.Load())/n)
			// The rest of the build, read back the same way: per-bot averages
			// over the window. points/bot is the honest check that the spends
			// landed — it is the server's own (level-1) sum over the spellbook.
			if *skillLevel > 1 || castTicks > 0 {
				fmt.Fprintf(os.Stderr,
					"   (per bot: passives %.2f, cooldowns equipped %.2f, on-cooldown %.2f, points spent %.1f | casts requested %d)\n",
					float64(passivesFilled.Load())/n, float64(cdsFilled.Load())/n,
					float64(cdsOnCooldown.Load())/n, float64(levelsSpent.Load())/n,
					castsSent.Load())
			}
		}
	}

	for _, b := range bots {
		b.close()
	}
	fmt.Println("done.")
}
