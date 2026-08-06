package sim

// Chunk 4 (docs/archive/plan-sim-harness.md §6 + §8): the sustainable-kills/hour
// chain — repeat [fight → REAL out-of-combat regen to full → modeled
// downtime gap] — compared across the two stand-still bot stances, facetank
// vs kite. Efficiency = facetank ÷ kite is the parking-lot metric (GDD §4:
// the #1 "Tempo/Fun" design risk, measured).
//
// Each cycle builds a fresh world for the fight (every chain fight is
// byte-identical to RunFight under its per-fight seed), then keeps ticking
// the SAME world through recovery so the real combat-grace window and the
// real regen accumulator (and the real self_heal cooldown fire) set the
// recovery time. The downtime gap is a pure time cost on the chain clock
// (plan §6: a modeled walk, not a simulated one).

import (
	"math/rand"
	"time"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Stance is where the stand-still bot stands (plan §6).
type Stance string

const (
	// StanceFacetank puts the player at the mob's centre: inside the mob's
	// aura, taking full damage while dealing its own.
	StanceFacetank Stance = "facetank"
	// StanceKite puts the player in the ring where its aura hits the mob but
	// the mob's aura misses — the theoretical best a moving player
	// approximates. The mob is pinned (speed 0) for the ideal geometry and
	// authored as a structure so it still fights back from where it stands.
	StanceKite Stance = "kite"
)

// OutcomeChainDone is a chain that completed all its fights.
const OutcomeChainDone Outcome = "chain_done"

// playerBodyRadius mirrors the player body circle (model/player/player.go).
const playerBodyRadius = 0.25

// recoveryCapTicks bounds the recovery phase [PLACEHOLDER] — only reachable
// with a near-zero RegenTick; hitting it reads as "these numbers never
// recover", itself a finding.
const recoveryCapTicks = 600 * TicksPerSecond

// The synthetic self-heal cooldown, shaped like the authored FirstAid
// (api/skills/first-aid.json) [ALL PLACEHOLDER]. ID 90 stays clear of
// the player aura (1) and the mob auras (2+i).
const (
	selfHealSkillID          = 90
	selfHealCooldownTicks    = 900 // 30 s
	selfHealFraction         = 0.20
	selfHealFractionPerLevel = 0.05
)

// ChainConfig is one chain battery — it maps 1:1 onto the CLI flags and the
// explorer's /chain request.
type ChainConfig struct {
	Player PlayerSpec `json:"player"`
	Mob    MobSpec    `json:"mob"`
	// Curve + Levels are the optional level brackets: player and mob are
	// scaled same-tier via the chunk-2 fixture (HP values only). Empty
	// Levels = one bracket at the explicit numbers.
	Curve  Curve `json:"curve"`
	Levels []int `json:"levels,omitempty"`
	// ChainFights is the fixed number of fights per chain [PLACEHOLDER].
	ChainFights int `json:"chainFights"`
	// DowntimeSeconds is the modeled walk-to-the-next-pack gap added to the
	// chain clock after every recovery. Standard assumption 10 s — C8 regen/
	// downtime settlement (PO 2026-07-19; zone-density-dependent by design).
	DowntimeSeconds float64 `json:"downtimeSeconds"`
	// RegenTick overrides the out-of-combat regen (fraction of max HP per
	// tick); 0 = game default. Time-at-fire is explored by boosting this —
	// no dedicated mechanism.
	RegenTick float32 `json:"regenTick,omitempty"`
	// SelfHealLevel equips the synthetic self-heal cooldown at that level
	// (0 = off). Policy: fired at recovery start whenever ready and the
	// player is hurt; the cooldown runs on the chain clock, so downtime
	// counts toward it.
	SelfHealLevel int `json:"selfHealLevel,omitempty"`
	// KillXP prices the chain's kills so the cells can report XP/hour; nil
	// leaves the XP columns empty, which is what every caller before C1.5 got
	// (§13.1: "the chain battery reports no XP at all").
	KillXP             *ChainKillXP `json:"killXP,omitempty"`
	BaseSeed           int64        `json:"baseSeed"`
	Runs               int          `json:"runs"`
	MaxSecondsPerFight float64      `json:"maxSecondsPerFight,omitempty"` // 0 = the default fight timeout
}

// ChainKillXP prices one chain's kills (plan-xp-formula.md C1.5). The bracket
// level is the default for BOTH combatants — a bracket is same-tier by
// construction, so Δ = 0 and one kill pays base(P). The overrides exist for the
// placement battery, where the whole point is that the mob stands at a level
// the player is not.
type ChainKillXP struct {
	XP XPModel `json:"xp"`
	// PlayerLevel and MobLevel override the bracket level; 0 = the bracket's.
	// Both are required in the explicit-numbers bracket (level 0), which
	// carries no level of its own — without them the row reports no XP.
	PlayerLevel int `json:"playerLevel,omitempty"`
	MobLevel    int `json:"mobLevel,omitempty"`
	// TierMultiplier and XPFactor are the species terms; 0 → 1 for the tier
	// (an unpriced tier is normal), and 0 is MEANINGFUL for XPFactor — it is
	// how content spells "this pays nothing" — so it is a pointer.
	TierMultiplier float64  `json:"tierMultiplier,omitempty"`
	XPFactor       *float64 `json:"xpFactor,omitempty"`
}

// award is what one kill in a bracket pays, or 0 when the chain is unpriced.
func (k *ChainKillXP) award(bracketLevel int) uint64 {
	if k == nil {
		return 0
	}
	playerLevel, mobLevel := k.PlayerLevel, k.MobLevel
	if playerLevel == 0 {
		playerLevel = bracketLevel
	}
	if mobLevel == 0 {
		mobLevel = bracketLevel
	}
	if playerLevel < 1 || mobLevel < 1 {
		return 0 // the explicit-numbers bracket, unlevelled and unpriced
	}
	tier := k.TierMultiplier
	if tier <= 0 {
		tier = 1
	}
	xpFactor := 1.0
	if k.XPFactor != nil {
		xpFactor = *k.XPFactor
	}
	return k.XP.Award(playerLevel, mobLevel, tier, xpFactor)
}

// ChainCell is one stance in one bracket over N seeded chains.
type ChainCell struct {
	Stance Stance `json:"stance"`
	// Feasible is false when the kite ring does not exist (the mob outranges
	// the player) — no chains are run then.
	Feasible     bool    `json:"feasible"`
	KiteDistance float32 `json:"kiteDistance,omitempty"`
	// SurviveRate is the share of chains that completed all fights.
	SurviveRate float64 `json:"surviveRate"`
	// KillsPerHour is kills per simulated hour over the SURVIVING chains.
	KillsPerHour Distribution `json:"killsPerHour"`
	// Kills is kills-before-death over the DYING chains (Values are counts).
	// Timed-out chains appear in the outcome counts only.
	Kills Distribution `json:"killsBeforeDeath"`
	// Mean per-fight time split over the surviving chains, for
	// explainability (downtime is a config echo).
	MeanFightSeconds    float64 `json:"meanFightSeconds"`
	MeanRecoverySeconds float64 `json:"meanRecoverySeconds"`
	// XPPerHour is KillsPerHour.P50 × the row's award; 0 when the chain is
	// unpriced (no ChainKillXP) or the kill is gray.
	XPPerHour float64 `json:"xpPerHour,omitempty"`
}

// ChainRow is one level bracket: both stances plus their ratio.
type ChainRow struct {
	Level int     `json:"level"` // 0 = the explicit-numbers bracket
	F     float64 `json:"f,omitempty"`
	// Award is what one kill in this bracket pays the player, 0 = unpriced or
	// gray. ⚑ 0 is BOTH, deliberately: a report field cannot carry the +Inf
	// KillsPerLevelAt returns, so "did this pay anything" is the one question
	// the artifact answers, and the config echo says whether it was priced.
	Award uint64 `json:"award,omitempty"`
	// Facetank ÷ kite kills/hour (p50). 0 with Facetank.SurviveRate < 0.5
	// [PLACEHOLDER] means "facetank dies" (the GDD boss case); 0 with
	// !Kite.Feasible means "no kite ring".
	Efficiency float64   `json:"efficiency"`
	Facetank   ChainCell `json:"facetank"`
	Kite       ChainCell `json:"kite"`
}

// ChainReport is the chunk-4 artifact: config echo + the bracket rows,
// diffable across tuning sessions like the chunk-1/2/3 reports.
type ChainReport struct {
	GeneratedAt    time.Time `json:"generatedAt"`
	TicksPerSecond int       `json:"ticksPerSecond"`
	ChainConfig
	Rows []ChainRow `json:"rows"`
}

// KiteDistance is the centre of the kite ring [mobAura + playerBody,
// playerAura + mobBody): the mob's damage misses (the hit check is strict
// <) while the player's still lands. ok is false when the ring is empty —
// the mob outranges the player.
func KiteDistance(p PlayerSpec, m MobSpec) (float32, bool) {
	lo := m.Aura.Radius + playerBodyRadius
	hi := p.Aura.Radius + m.BodyRadius
	if hi <= lo {
		return 0, false
	}
	return (lo + hi) / 2, true
}

// chainScenario builds the fight scenario for one stance. Facetank spawns
// the mob at the player's position (body layers never collide — no
// separation) with its authored speed; kite pins the mob at the ring centre —
// speed 0 so it cannot close, role structure so its aura stays on and it
// still "fights back". ⚑ Those are two separate statements since chunk 2:
// pinning the speed alone would silently produce a mob that never attacks.
// ok is false for an infeasible kite.
func chainScenario(p PlayerSpec, m MobSpec, st Stance, maxTicks int, regen float32) (Scenario, float32, bool) {
	distance := float32(0)
	if st == StanceKite {
		d, ok := KiteDistance(p, m)
		if !ok {
			return Scenario{}, 0, false
		}
		distance = d
		m.Speed = 0
		m.Role = string(mobs.RoleStructure)
	}
	sc := TTK(p, m, distance)
	sc.Name = "CHAIN/" + string(st)
	if maxTicks > 0 {
		sc.MaxTicks = maxTicks
	}
	sc.RegenTick = regen
	return sc, distance, true
}

// selfHealDefinition is the synthetic self-heal cooldown definition.
func selfHealDefinition() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID:            selfHealSkillID,
		Name:          "SimSelfHeal",
		Category:      skills.SkillCategoryCooldown,
		MaxLevel:      10,
		CooldownTicks: selfHealCooldownTicks,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeSelfHeal,
			SelfHeal: &skills.SelfHealParams{
				FractionOfMax:         selfHealFraction,
				FractionOfMaxPerLevel: selfHealFractionPerLevel,
			},
		}},
	}
}

// recoverToFull keeps ticking the post-fight world until the player is back
// at max HP: the real combat grace (~3.3 s) runs out, then the real regen
// accumulator fills the pool (and a requested self-heal fires on the first
// step). Returns the ticks spent; full is false if the cap was hit.
func recoverToFull(w *World) (ticks int, full bool) {
	max := w.Player.MaxHealth()
	if w.Player.VitalSigns().Health >= max {
		return 0, true
	}
	for t := 1; t <= recoveryCapTicks; t++ {
		w.Step()
		if w.Player.VitalSigns().Health >= max {
			return t, true
		}
	}
	return recoveryCapTicks, false
}

// cycleResult is one fight + its recovery, kept per chain for tests and
// tick-by-tick debugging.
type cycleResult struct {
	Fight         FightResult
	RecoveryTicks int
	SelfHealed    bool
}

// chainResult is one full chain run.
type chainResult struct {
	Outcome Outcome
	Fights  int     // fights won (= kills; 1v1 cycles)
	Seconds float64 // chain clock: fights + recoveries + downtime gaps

	FightSeconds    float64 // sum over cycles
	RecoverySeconds float64 // sum over cycles

	Cycles []cycleResult
}

// runChain plays one seeded chain: ChainFights cycles of fight → recovery →
// downtime. Per-fight seeds derive from the chain seed, so every fight is
// byte-identical to RunFight under its seed. A lost or timed-out fight (or
// a capped recovery) ends the chain early.
func runChain(sc Scenario, cfg ChainConfig, seed int64) chainResult {
	rng := rand.New(rand.NewSource(seed))
	selfHealDef := selfHealDefinition()
	res := chainResult{}
	readyAt := 0.0 // chain-clock time the self-heal is ready again

	for f := 0; f < cfg.ChainFights; f++ {
		w := NewWorld(sc, rng.Int63())
		fight := runFightWorld(w, sc)
		res.Seconds += fight.Seconds
		res.FightSeconds += fight.Seconds
		cyc := cycleResult{Fight: fight}

		if fight.Outcome != OutcomeMobDied {
			res.Cycles = append(res.Cycles, cyc)
			res.Outcome = fight.Outcome
			return res
		}
		res.Fights++

		if cfg.SelfHealLevel > 0 && res.Seconds >= readyAt &&
			w.Player.VitalSigns().Health < w.Player.MaxHealth() {
			comp := w.Player.SkillComponent()
			comp.EquipCooldown(0, selfHealDef, cfg.SelfHealLevel)
			comp.RequestCooldownActivation(0)
			readyAt = res.Seconds + float64(selfHealCooldownTicks)/TicksPerSecond
			cyc.SelfHealed = true
		}

		rec, full := recoverToFull(w)
		cyc.RecoveryTicks = rec
		res.Seconds += seconds(rec)
		res.RecoverySeconds += seconds(rec)
		res.Cycles = append(res.Cycles, cyc)
		if !full {
			res.Outcome = OutcomeTimeout
			return res
		}

		res.Seconds += cfg.DowntimeSeconds
	}

	res.Outcome = OutcomeChainDone
	return res
}

// aggregateCell folds N chains into one cell: surviving chains feed the
// kills/hour samples (and the time-split means), dying chains the
// kills-before-death samples — the chunk-3 two-sample-set pattern.
func aggregateCell(st Stance, kiteD float32, results []chainResult) ChainCell {
	outcomes := make(map[Outcome]int)
	var kph, kills []float64
	var fightMeans, recoveryMeans float64
	for _, r := range results {
		outcomes[r.Outcome]++
		switch r.Outcome {
		case OutcomeChainDone:
			kph = append(kph, float64(r.Fights)/(r.Seconds/3600))
			fightMeans += r.FightSeconds / float64(r.Fights)
			recoveryMeans += r.RecoverySeconds / float64(r.Fights)
		case OutcomePlayerDied:
			kills = append(kills, float64(r.Fights))
		}
	}
	n := len(results)
	cell := ChainCell{
		Stance:       st,
		Feasible:     true,
		KiteDistance: kiteD,
		SurviveRate:  float64(outcomes[OutcomeChainDone]) / float64(n),
		KillsPerHour: summarize(n, outcomes, kph),
		Kills:        summarize(n, outcomes, kills),
	}
	if s := outcomes[OutcomeChainDone]; s > 0 {
		cell.MeanFightSeconds = fightMeans / float64(s)
		cell.MeanRecoverySeconds = recoveryMeans / float64(s)
	}
	return cell
}

// surviveThreshold: below this facetank survive rate the stance reads as
// "dies" and efficiency is 0 [PLACEHOLDER — mirrors the chunk-2/3 <50%
// cuts; the full rates stay in the cells].
const surviveThreshold = 0.5

// RunChain executes the full bracket × stance × run grid (chains in
// parallel — chunk-2 pool; chain i shares seed BaseSeed+i across all cells,
// variance-reducing the efficiency ratios) and derives per-bracket
// efficiency.
func RunChain(cfg ChainConfig) *ChainReport {
	levels := cfg.Levels
	if len(levels) == 0 {
		levels = []int{0} // the explicit-numbers bracket
	}
	fx := Fixture{Curve: cfg.Curve, Player: cfg.Player, Mob: cfg.Mob}
	maxTicks := 0
	if cfg.MaxSecondsPerFight > 0 {
		maxTicks = int(cfg.MaxSecondsPerFight * TicksPerSecond)
	}

	stances := []Stance{StanceFacetank, StanceKite}
	type cellSetup struct {
		scenario Scenario
		kiteD    float32
		feasible bool
	}
	cells := make([]cellSetup, len(levels)*len(stances))
	for li, level := range levels {
		p, m := cfg.Player, cfg.Mob
		if level > 0 {
			p, m = fx.PlayerAt(level), fx.MobAt(level)
		}
		for si, st := range stances {
			sc, kiteD, ok := chainScenario(p, m, st, maxTicks, cfg.RegenTick)
			cells[li*len(stances)+si] = cellSetup{scenario: sc, kiteD: kiteD, feasible: ok}
		}
	}

	// Flat parallelism over (cell × run): chains are the expensive unit and
	// brackets × 2 cells alone can undershoot NumCPU. Infeasible cells run
	// nothing.
	runs := cfg.Runs
	results := make([]chainResult, len(cells)*runs)
	parallelFor(len(results), func(i int) {
		cell := cells[i/runs]
		if !cell.feasible {
			return
		}
		results[i] = runChain(cell.scenario, cfg, cfg.BaseSeed+int64(i%runs))
	})

	rows := make([]ChainRow, 0, len(levels))
	for li, level := range levels {
		row := ChainRow{Level: level}
		if level > 0 {
			row.F = cfg.Curve.F(level)
		}
		rowCells := make([]ChainCell, len(stances))
		for si, st := range stances {
			ci := li*len(stances) + si
			if !cells[ci].feasible {
				rowCells[si] = ChainCell{Stance: st, Feasible: false}
				continue
			}
			rowCells[si] = aggregateCell(st, cells[ci].kiteD, results[ci*runs:(ci+1)*runs])
		}
		row.Award = cfg.KillXP.award(level)
		for si := range rowCells {
			rowCells[si].XPPerHour = float64(row.Award) * rowCells[si].KillsPerHour.P50
		}
		row.Facetank, row.Kite = rowCells[0], rowCells[1]
		if row.Facetank.SurviveRate >= surviveThreshold &&
			row.Kite.Feasible && row.Kite.KillsPerHour.P50 > 0 {
			row.Efficiency = row.Facetank.KillsPerHour.P50 / row.Kite.KillsPerHour.P50
		}
		rows = append(rows, row)
	}

	return &ChainReport{
		GeneratedAt:    time.Now(),
		TicksPerSecond: TicksPerSecond,
		ChainConfig:    cfg,
		Rows:           rows,
	}
}
