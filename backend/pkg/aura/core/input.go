package core

import (
	"log"
	"log/slog"

	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

const inputBuffererCount = 3

// summaryIntervalTicks is the rolling inputstats emit cadence (~60 s). Derived
// from the game's own tick-rate source of truth, NOT a magic 1800, so it stays
// correct if the tick rate ever changes (e.g. chunk 3). See plan-input-jitter.md.
const summaryIntervalTicks = 60 * constant.TicksPerSecond

// maxHoldTicks bounds how many consecutive input-starved ticks the server coasts
// a player on their last movement direction before halting (chunk A,
// plan-input-jitter.md §3-4). Movement integrates as position += dir × speed per
// tick, so this is the worst-case drift ceiling for a genuine TOTAL client freeze
// while a key is held: at WalkingSpeedPerTick the player drifts at most
// maxHoldTicks steps (~0.5 s at 15 ticks / 30 Hz). The client's explicit release
// signal (chunk B) makes an ordinary key-release stop promptly, so this cap only
// bites on a true freeze — re-check it if WalkingSpeedPerTick changes. 15 covers
// 71 % of the jank runs measured live 2026-07-24. [PLACEHOLDER — confirm at the
// live re-measure.]
const maxHoldTicks = 15

// --- input-transport instrumentation (plan-input-jitter.md chunk 1) ---
//
// The starve-run histogram sized maxHoldTicks from real numbers (chunk 1). Its
// buckets, array size, bucket(n) and the log legend all come from ONE table:
// a wrong element count is a compile error, so they cannot drift apart.
const numStarveBuckets = 7

type bucketDef struct {
	maxRun int // inclusive upper bound; 0 in the final entry means "unbounded"
	label  string
}

var starveBuckets = [numStarveBuckets]bucketDef{
	{1, "1"}, {2, "2"}, {3, "3"}, {6, "4-6"}, {9, "7-9"}, {15, "10-15"}, {0, "16+"},
}

// bucket maps a starve-run length to its histogram index: the first bucket whose
// maxRun >= n, falling through to the last index (the unbounded "16+" bucket)
// when n exceeds every bound — no magic sentinel.
func bucket(n int) int {
	for idx := 0; idx < numStarveBuckets-1; idx++ {
		if n <= starveBuckets[idx].maxRun {
			return idx
		}
	}
	return numStarveBuckets - 1
}

// playerInputStats holds the tick-goroutine-side counters for one player. Plain
// fields — mutated only from the tick goroutine (pickInput/Update), no atomics.
type playerInputStats struct {
	starved, coasted, stalled uint64                   // cumulative since join; starved = coasted + stalled
	runLen                    int                      // consecutive starved ticks, in progress
	hist                      [numStarveBuckets]uint64 // starve-run length histogram
	lastEmit                  inputStatSnapshot        // baseline for the rolling interval delta
	lastEmitTick              uint64                   // tick of the last emit (rolling window origin)
	joinTick                  uint64                   // tick this player registered (final-line total window)
}

// inputStatSnapshot is the combined tick-side + transport-side cumulative
// baseline captured at each emit, so a rolling line reports the interval delta.
type inputStatSnapshot struct {
	starved, coasted, stalled             uint64
	evicted, dropped, arrivals, qDepthSum uint64
}

// inputTransportReporter is the narrow interface core uses to read the client's
// transport counters without widening model.Client (which would force the sim
// nopClient and six test fakes to implement it). See plan-input-jitter.md.
type inputTransportReporter interface {
	InputTransportStats() model.InputTransportStats
}

func transportStatsOf(p model.PlayerEntity) model.InputTransportStats {
	if r, ok := p.Client().(inputTransportReporter); ok {
		return r.InputTransportStats()
	}
	return model.InputTransportStats{}
}

//---- models for input

type clientMessage struct {
	playerId uint64
	body     []byte
}

type PlayerInputSystem struct {
	players model.Players
	game    *game
	// currently two, one to read and one to fill
	ibufs [inputBuffererCount]InputBufferer
	// lastMove holds a movement-only copy of each player's last applied input,
	// replayed to coast up to maxHoldTicks input-starved ticks. See pickInput.
	lastMove map[uint64]*model.PlayerInput
	// stats holds per-player input-transport instrumentation, parallel to
	// lastMove. Accessed only from the tick goroutine via statFor.
	stats map[uint64]*playerInputStats
}

func NewInputSystem(g *game) *PlayerInputSystem {
	return &PlayerInputSystem{game: g}
}

func (i *PlayerInputSystem) Priority() int {
	return 100
}

func (i *PlayerInputSystem) New(w *ecs.World) {
	// initialize buffers
	for idx := range i.ibufs {
		i.ibufs[idx] = NewInputBufferer()
	}
	i.lastMove = make(map[uint64]*model.PlayerInput)
	i.stats = make(map[uint64]*playerInputStats)
	log.Println("PlayerInputSystem nominal")
}

// statFor returns the stats entry for a player, lazily allocating the map and
// the entry. Nil-tolerant so the bare-literal &PlayerInputSystem{} the unit
// tests build (which skip New) does not panic.
func (i *PlayerInputSystem) statFor(id uint64) *playerInputStats {
	if i.stats == nil {
		i.stats = make(map[uint64]*playerInputStats)
	}
	st := i.stats[id]
	if st == nil {
		st = &playerInputStats{}
		i.stats[id] = st
	}
	return st
}

func (i *PlayerInputSystem) storeInput(playerId uint64, input *model.PlayerInput) {
	i.ibufs[i.game.Tick%inputBuffererCount][playerId] = input
}

func (i *PlayerInputSystem) AddPlayer(p model.PlayerEntity) {
	i.players = append(i.players, p)
	// Anchor the rolling-summary window to the join tick so win_ticks is honest
	// for a player who joins off a 60 s boundary (i.game is nil in unit tests
	// that never register through here).
	if i.game != nil {
		st := i.statFor(p.Basic().ID())
		st.lastEmitTick = i.game.Tick
		st.joinTick = i.game.Tick
	}
}

func (i *PlayerInputSystem) Update(dt float32) {
	// get all inputs
	for _, p := range i.players {
		input := p.Client().NextInput()
		if input != nil {
			i.storeInput(p.Basic().ID(), input)
		}
		// Baseline-utility presses (plan-downtime.md C1) ride their own
		// message kind, not Input — queued here like cooldown activations,
		// fired by the SkillSystem later this same tick. Health-gated the
		// way movement is: the dead do not recall.
		if u := p.Client().NextUseUtility(); u != nil && p.VitalSigns().Health != 0 {
			p.SkillComponent().RequestUtilityCast(u.Kind)
		}
	}

	// freeze input, concurrent reads are fine
	ibuf := i.ibufs[i.game.Tick%inputBuffererCount]

	// apply inputs to player
	for _, p := range i.players {
		id := p.Basic().ID()
		i.updateInput(p, i.pickInput(id, ibuf[id]), nil)
	}

	// clear out buffer
	i.ibufs[i.game.Tick%inputBuffererCount] = NewInputBufferer()

	// emit rolling input-transport summaries (chunk 1 instrumentation)
	i.emitStats(i.game.Tick)
}

// pickInput chooses the input to apply for a player this tick. fresh is the
// input received this tick, or nil if the input queue was starved.
//
// Root cause (proven live 2026-07-24, plan-input-jitter.md §2): the browser
// client drops input ticks under render-loop jank (its Tock timer coalesces
// missed ticks), so the server queue starves in bursts. To keep movement smooth
// across such a gap, a starved tick COASTS on the last applied movement — the
// held direction is replayed for up to maxHoldTicks consecutive starved ticks
// (chunk A), then the character halts (a truly disconnected client cannot slide
// forever). The held copy carries movement only: it must never replay one-shot
// commands (aura switch, cooldown activation). Coasting is safe against
// ghost-walk because the client sends an explicit zero-movement "stopped" state
// on key release (chunk B) — so a genuine stop clears the held direction and
// coasting a released key is a no-op; the cap only bites on a true client freeze.
//
// Counters (kept permanently as the regression detector): starved = queue-dry
// ticks; of those, coasted = ticks kept moving by the hold, stalled = ticks the
// character actually stood still (hold exhausted past the cap or none held). The
// run histogram buckets each starve run by length, but only when it ENDS with a
// real input, so a dropped client's permanent-starve tail is never bucketed.
func (i *PlayerInputSystem) pickInput(id uint64, fresh *model.PlayerInput) *model.PlayerInput {
	st := i.statFor(id)
	if fresh != nil {
		if st.runLen > 0 {
			st.hist[bucket(st.runLen)]++
			st.runLen = 0
		}
		// Held state is a movement-only copy of the latest real input — including
		// an explicit zero-movement "stopped" packet, whose replay is a harmless
		// no-op (that is what makes the coast safe).
		i.lastMove[id] = &model.PlayerInput{
			Movement:       fresh.Movement,
			Rotation:       fresh.Rotation,
			ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		}
		return fresh
	}
	// Starved this tick. Coast on the held movement while inside the cap; halt
	// past it. runLen (incremented here) is the current run length, so the first
	// maxHoldTicks ticks of a run coast and the rest stall — no separate counter.
	st.starved++
	st.runLen++
	if held := i.lastMove[id]; held != nil && st.runLen <= maxHoldTicks {
		st.coasted++
		return held
	}
	st.stalled++
	return nil
}

// emitStats logs one rolling "inputstats" line per player whose window shows
// activity, then re-anchors that player's interval baseline. Counters are
// reported as the delta since the player's last emit; the starve-run histogram
// ships cumulative (session-wide shape). A window with no starve/coast/stall/
// evict/drop activity is suppressed entirely, so the journal stays quiet for a
// player with no input trouble. Post-chunk-A the win to watch is stalled
// collapsing toward zero while coasted absorbs it.
func (i *PlayerInputSystem) emitStats(currentTick uint64) {
	for _, p := range i.players {
		id := p.Basic().ID()
		st := i.stats[id]
		if st == nil {
			continue
		}
		if currentTick-st.lastEmitTick < summaryIntervalTicks {
			continue
		}
		ts := transportStatsOf(p)
		cur := inputStatSnapshot{
			starved: st.starved, coasted: st.coasted, stalled: st.stalled,
			evicted: ts.Evicted, dropped: ts.Dropped, arrivals: ts.Arrivals, qDepthSum: ts.QDepthSum,
		}
		winTicks := currentTick - st.lastEmitTick
		base := st.lastEmit
		st.lastEmit = cur
		st.lastEmitTick = currentTick

		if cur.starved == base.starved && cur.coasted == base.coasted &&
			cur.stalled == base.stalled && cur.evicted == base.evicted && cur.dropped == base.dropped {
			continue // quiet window — nothing worth a line
		}
		logInputStats(id, winTicks, base, cur, st.hist[:])
	}
}

// logInputStats writes one structured JSON line (matching aurad's slog handler).
// The histogram ships as a slog array so nothing is string-formatted here.
func logInputStats(id, winTicks uint64, base, cur inputStatSnapshot, hist []uint64) {
	arrivals := cur.arrivals - base.arrivals
	attrs := []any{
		slog.Uint64("id", id),
		slog.Uint64("win_ticks", winTicks),
		slog.Uint64("starved", cur.starved-base.starved),
		slog.Uint64("coasted", cur.coasted-base.coasted),
		slog.Uint64("stalled", cur.stalled-base.stalled),
		slog.Uint64("evicted", cur.evicted-base.evicted),
		slog.Uint64("dropped", cur.dropped-base.dropped),
	}
	if arrivals > 0 { // guard q_mean against a window with no inputs
		attrs = append(attrs, slog.Float64("q_mean", float64(cur.qDepthSum-base.qDepthSum)/float64(arrivals)))
	}
	attrs = append(attrs, slog.Any("run_hist", hist))
	slog.Info("inputstats", attrs...)
}

// applies the inputs to a player
func (i *PlayerInputSystem) updateInput(p model.PlayerEntity, next, last *model.PlayerInput) {
	if next == nil {
		return
	}

	// A dead player neither moves (guarded below) nor coasts: drop the held
	// movement so a respawn (sys/state.go SetPosition) or teleport does not
	// replay the pre-death direction from the new position (plan-input-jitter.md
	// §7 item 4). updateInput runs after pickInput, so this tick's coast is
	// already Health-gated below; clearing here halts every subsequent tick.
	// delete on a nil/absent map or key is a safe no-op (bare-literal tests).
	if p.VitalSigns().Health == 0 {
		delete(i.lastMove, p.Basic().ID())
	}

	// Active-aura command. >= 0 switches to that slot; the -2 wire sentinel means
	// "explicitly deactivate" (maps to component slot -1 = Nothing); -1 (the wire
	// default) means the client said nothing, so we leave the active aura untouched.
	// An aura command is a deliberate act: it cancels a running cast (chunk 4).
	if next.ActiveAuraSlot >= 0 {
		p.SkillComponent().CancelCast()
		p.SkillComponent().SetActiveAura(next.ActiveAuraSlot)
	} else if next.ActiveAuraSlot == model.ActiveAuraSlotDeactivate {
		p.SkillComponent().CancelCast()
		p.SkillComponent().SetActiveAura(-1)
	}

	// Cooldown activations: queued here, fired by the SkillSystem later in
	// this same tick (update runs before skills). Invalid indices are dropped
	// by RequestCooldownActivation.
	for _, slot := range next.CooldownActivations {
		p.SkillComponent().RequestCooldownActivation(slot)
	}

	// do we even have inputs?
	if next.Movement != nil {
		// we can only move if we are still alive!
		if p.VitalSigns().Health != 0 {
			v := input2vec(next)
			// Moving is a deliberate act: it cancels a running cast (chunk 4).
			// Only an actual vector counts — an idle/bridged movement packet
			// must not flicker the cast. The same non-zero vector is the dash
			// aim (chunk 5): record it as the last movement direction (already
			// unit-normalized) so a standing player dashes where they last
			// walked.
			if v != (phy.Vec2f{}) {
				p.SkillComponent().CancelCast()
				p.SetLastMoveDir(v)
			}
			// Passive movement-speed bonus (DerivedStats) times the transient
			// one (speed_burst buffs vs. slows, composed in skills.Buffs);
			// config stays untouched. The mob's stepLength applies both of the
			// same factors (chunk 1a; Swift-as-a-cooldown).
			speed := p.Config().WalkingSpeedPerTick *
				p.SkillComponent().Derived.MovementSpeedFactor() *
				p.MovementFactor()
			if f := p.SpeedCheatFactor(); f > 0 {
				speed *= f
			}
			v = v.Mult(speed)
			next := p.Position().Add(v)
			p.SetPosition(next)
		}
	}
}

func input2vec(i *model.PlayerInput) phy.Vec2f {
	x := i.Movement.X
	y := i.Movement.Y
	// prevent division by zero
	if x == 0 && y == 0 {
		return phy.Vec2f{}
	}
	v := phy.Vec2f{X: x, Y: y}
	return v.Normalize()
}

func (i *PlayerInputSystem) Remove(b ecs.BasicEntity) {
	idx := -1
	for index, player := range i.players {
		if player.Basic().ID() == b.ID() {
			idx = index
			break
		}
	}
	if idx >= 0 {
		i.finalInputStats(i.players[idx])
		i.players = append(i.players[:idx], i.players[idx+1:]...)
	}
	// The stats/bridge entries outlive the players slice removal above; clear
	// them so a re-used entity id starts clean.
	id := b.ID()
	delete(i.stats, id)
	delete(i.lastMove, id)
}

// finalInputStats logs the cumulative session totals for a disconnecting player
// (best-effort — the rolling line is the robust fallback for a tab-close that
// never routes through Remove). Suppressed when the player had no input trouble.
func (i *PlayerInputSystem) finalInputStats(p model.PlayerEntity) {
	st := i.stats[p.Basic().ID()]
	if st == nil {
		return
	}
	ts := transportStatsOf(p)
	cur := inputStatSnapshot{
		starved: st.starved, coasted: st.coasted, stalled: st.stalled,
		evicted: ts.Evicted, dropped: ts.Dropped, arrivals: ts.Arrivals, qDepthSum: ts.QDepthSum,
	}
	if cur.starved == 0 && cur.coasted == 0 && cur.stalled == 0 && cur.evicted == 0 && cur.dropped == 0 {
		return
	}
	var winTicks uint64
	if i.game != nil {
		winTicks = i.game.Tick - st.joinTick
	}
	logInputStats(p.Basic().ID(), winTicks, inputStatSnapshot{}, cur, st.hist[:])
}

func NewInputBufferer() InputBufferer {
	return make(InputBufferer)
}

type InputBufferer map[uint64]*model.PlayerInput
