package sim

// C1.5 (docs/plan-xp-formula.md §13): the placement battery — what the AUTHORED
// WORLD pays, rung by rung. Every other battery measures a synthetic combatant
// pair standing on the curve; this one measures the species that actually stand
// at each placed level in world.json, priced with the live kill-XP economy.
//
// Rows are placed RUNGS, not regions (D12). The sim has no notion of a region:
// world.json carries (species, level) directly, and scripts/world-regions.py
// already opens by calling itself and plan-world-replacement.md §3.7 "one fact
// in two places" — transcribing the rectangles into Go would make three.
//
// ⚑ Fidelity caveats, both pre-existing and neither fixed here:
//
//   - The sim does not model factions. A creature's aura is gated on aggro and
//     nothing else, so the retaliation-only prey (Boar and Stag are
//     `hostileTo: []`) fight back here where in the world they wait to be
//     opened. Their cells read harder than the world is.
//   - The bot stands still, so what a cell reports is a STANCE, never a player.
//     ⚑ And the kite stance pins the mob (speed 0, role structure — chainScenario)
//     for the ideal ring, which means a FLEEING species is measurable there by
//     construction: the Stag that walks away from the facetank bot stands and
//     trades in the kite cell. Read the stance column, not just the rate.

import (
	"math"
	"sort"
	"time"
)

// PlacementSpec is one (species, placed level) group: everything the battery
// needs to fight it and to price the kill. Built by the caller from content —
// the sim package deliberately does not read JSON.
type PlacementSpec struct {
	Species string `json:"species"`
	// Level is the level the species STANDS at here, already resolved
	// (spawn override ?? species curveLevel) and already applied to Mob.
	Level  int `json:"level"`
	Spawns int `json:"spawns"`
	// Tier is the label, TierMultiplier its kill-XP weight
	// (mobs.MobDefinition.KillXPTierMultiplier), XPFactor the species' own
	// relative weight — 0 is meaningful and means "pays nothing".
	Tier           string  `json:"tier"`
	TierMultiplier float64 `json:"tierMultiplier"`
	XPFactor       float64 `json:"xpFactor"`
	Mob            MobSpec `json:"mob"`
}

// PlacementConfig is one placement battery — it maps 1:1 onto the CLI flags.
type PlacementConfig struct {
	Zone  string          `json:"zone"`
	Specs []PlacementSpec `json:"specs"`
	// Player is the LEVEL-1 baseline build; the battery inflates it per row
	// through the chunk-2 fixture, exactly as the guardrail battery does.
	Player PlayerSpec `json:"player"`
	Curve  Curve      `json:"curve"`
	XP     XPModel    `json:"xp"`
	// PlayerLevel is the reader's own level, and it is the axis the whole
	// battery exists for: 0 = the DIAGONAL (player level = placed level), the
	// at-level reading that answers "is each rung at level?". A fixed level is
	// what answers the question a calibration pass actually has — one player
	// meeting content placed all over the range, i.e. Δ ≠ 0.
	PlayerLevel        int     `json:"playerLevel"`
	ChainFights        int     `json:"chainFights"`
	DowntimeSeconds    float64 `json:"downtimeSeconds"`
	BaseSeed           int64   `json:"baseSeed"`
	Runs               int     `json:"runs"`
	MaxSecondsPerFight float64 `json:"maxSecondsPerFight,omitempty"`
}

// PlacementCell is one species at one rung, measured against one player level.
type PlacementCell struct {
	PlacementSpec
	PlayerLevel int `json:"playerLevel"`
	Delta       int `json:"delta"` // placed level − player level
	// Award is what ONE of these kills pays that player. 0 = gray (or an
	// xpFactor-0 species): the taper reached zero, and no number of them ever
	// levels anyone.
	Award    uint64    `json:"award"`
	Facetank ChainCell `json:"facetank"`
	Kite     ChainCell `json:"kite"`

	// Measurable is false when NEITHER stance completed a chain — the mob
	// outran the bot, fled, or killed it every time. The cell then carries no
	// rates, and its spawns are counted out of the row's aggregate rather than
	// dragged through it as zeros.
	//
	// ⚑ Derived from the MEASUREMENT, never from a curated species list: the
	// list would go stale the moment content moves, which is the whole failure
	// mode this battery is built to watch for.
	Measurable bool   `json:"measurable"`
	Stance     Stance `json:"stance,omitempty"` // which stance the rates below come from

	KillsPerHour float64 `json:"killsPerHour"`
	XPPerHour    float64 `json:"xpPerHour"`
	// KillsPerLevel is XPToNext(playerLevel) / Award; 0 when Award is 0 —
	// the honest answer there is +Inf, which encoding/json cannot carry, so
	// callers branch on Award instead (XPModel.KillsPerLevelAt says the same).
	KillsPerLevel float64 `json:"killsPerLevel"`
}

// PlacementRow is one placed rung: its species, and the spawn-weighted
// aggregate over the measurable ones.
type PlacementRow struct {
	Level       int `json:"level"`
	PlayerLevel int `json:"playerLevel"`
	Delta       int `json:"delta"`
	// Spawns is every combat spawn authored at this rung; MeasuredSpawns is
	// how many of them stand behind the aggregates. They differ whenever a
	// species is unmeasurable, and both are reported so a shrinking sample
	// can never look like a smaller world (§7.1: no silent caps).
	Spawns         int             `json:"spawns"`
	MeasuredSpawns int             `json:"measuredSpawns"`
	Cells          []PlacementCell `json:"cells"`

	KillsPerHour float64 `json:"killsPerHour"`
	XPPerHour    float64 `json:"xpPerHour"`
	// Award is the spawn-weighted mean pay of one kill at this rung, and
	// KillsPerLevel is XPToNext(playerLevel) / that; 0 means every measurable
	// species here is gray.
	Award         float64 `json:"award"`
	KillsPerLevel float64 `json:"killsPerLevel"`
}

// PlacementReport is the C1.5 artifact: config echo + the rung rows, diffable
// across calibration runs like every other battery's.
type PlacementReport struct {
	GeneratedAt    time.Time `json:"generatedAt"`
	TicksPerSecond int       `json:"ticksPerSecond"`
	PlacementConfig
	Rows []PlacementRow `json:"rows"`
	// TotalSpawns / UnmeasuredSpawns reconcile the whole run against the zone:
	// TotalSpawns must equal the combat-spawn count the enumeration found.
	TotalSpawns      int `json:"totalSpawns"`
	UnmeasuredSpawns int `json:"unmeasuredSpawns"`
}

// RunPlacements measures every (species, rung) group and folds them into rung
// rows. Deterministic: the same (config, seed) reproduces every number, so a
// diff between two calibration runs is a content or knob change, never luck.
func RunPlacements(cfg PlacementConfig) *PlacementReport {
	fx := Fixture{Curve: cfg.Curve, Player: cfg.Player, XP: cfg.XP}

	cells := make([]PlacementCell, len(cfg.Specs))
	parallelFor(len(cells), func(i int) {
		cells[i] = runPlacementCell(fx, cfg, cfg.Specs[i])
	})

	byLevel := map[int][]PlacementCell{}
	for _, c := range cells {
		byLevel[c.Level] = append(byLevel[c.Level], c)
	}
	levels := make([]int, 0, len(byLevel))
	for level := range byLevel {
		levels = append(levels, level)
	}
	sort.Ints(levels)

	rep := &PlacementReport{
		GeneratedAt:     time.Now(),
		TicksPerSecond:  TicksPerSecond,
		PlacementConfig: cfg,
	}
	for _, level := range levels {
		row := foldPlacementRow(cfg, level, byLevel[level])
		rep.Rows = append(rep.Rows, row)
		rep.TotalSpawns += row.Spawns
		rep.UnmeasuredSpawns += row.Spawns - row.MeasuredSpawns
	}
	return rep
}

// playerLevelFor resolves the config's player-level axis for one rung.
func (cfg PlacementConfig) playerLevelFor(placedLevel int) int {
	if cfg.PlayerLevel > 0 {
		return cfg.PlayerLevel
	}
	return placedLevel // the diagonal
}

// runPlacementCell fights one species at its placed level and prices the kill.
func runPlacementCell(fx Fixture, cfg PlacementConfig, spec PlacementSpec) PlacementCell {
	playerLevel := cfg.playerLevelFor(spec.Level)
	xpFactor := spec.XPFactor
	cell := PlacementCell{
		PlacementSpec: spec,
		PlayerLevel:   playerLevel,
		Delta:         spec.Level - playerLevel,
		Award:         cfg.XP.Award(playerLevel, spec.Level, spec.TierMultiplier, xpFactor),
	}

	rep := RunChain(ChainConfig{
		// The mob is the AUTHORED species already standing at its placed
		// level — never fx.MobAt, which would model a synthetic same-tier mob
		// and throw away the placement this battery exists to measure.
		Player:          fx.PlayerAt(playerLevel),
		Mob:             spec.Mob,
		ChainFights:     cfg.ChainFights,
		DowntimeSeconds: cfg.DowntimeSeconds,
		KillXP: &ChainKillXP{
			XP:             cfg.XP,
			PlayerLevel:    playerLevel,
			MobLevel:       spec.Level,
			TierMultiplier: spec.TierMultiplier,
			XPFactor:       &xpFactor,
		},
		BaseSeed:           cfg.BaseSeed,
		Runs:               cfg.Runs,
		MaxSecondsPerFight: cfg.MaxSecondsPerFight,
	})
	row := rep.Rows[0]
	cell.Facetank, cell.Kite = row.Facetank, row.Kite

	// The headline rate is the better of the two stances among those that
	// actually survive — a stance that dies is not a way to farm this species.
	for _, c := range []ChainCell{row.Facetank, row.Kite} {
		if !c.Feasible || c.SurviveRate < surviveThreshold || c.KillsPerHour.P50 <= 0 {
			continue
		}
		if !cell.Measurable || c.KillsPerHour.P50 > cell.KillsPerHour {
			cell.Measurable = true
			cell.Stance = c.Stance
			cell.KillsPerHour = c.KillsPerHour.P50
		}
	}
	// Kills-per-level is pure XP arithmetic — what one kill pays does not
	// depend on the bot managing it — so it is filled even for an unmeasurable
	// cell. The RATES are the part that needs a sample.
	if kpl := cfg.XP.KillsPerLevelAt(playerLevel, spec.Level, spec.TierMultiplier, xpFactor); !math.IsInf(kpl, 1) {
		cell.KillsPerLevel = kpl
	}
	if cell.Measurable {
		cell.XPPerHour = cell.KillsPerHour * float64(cell.Award)
	}
	return cell
}

// foldPlacementRow spawn-weights the measurable cells of one rung.
func foldPlacementRow(cfg PlacementConfig, level int, cells []PlacementCell) PlacementRow {
	sort.Slice(cells, func(i, j int) bool { return cells[i].Species < cells[j].Species })

	playerLevel := cfg.playerLevelFor(level)
	row := PlacementRow{
		Level:       level,
		PlayerLevel: playerLevel,
		Delta:       level - playerLevel,
		Cells:       cells,
	}
	var kph, xph, award float64
	for _, c := range cells {
		row.Spawns += c.Spawns
		if !c.Measurable {
			continue
		}
		row.MeasuredSpawns += c.Spawns
		w := float64(c.Spawns)
		kph += c.KillsPerHour * w
		xph += c.XPPerHour * w
		award += float64(c.Award) * w
	}
	if row.MeasuredSpawns > 0 {
		n := float64(row.MeasuredSpawns)
		row.KillsPerHour, row.XPPerHour, row.Award = kph/n, xph/n, award/n
		if row.Award > 0 {
			row.KillsPerLevel = cfg.XP.XPToNext(playerLevel) / row.Award
		}
	}
	return row
}

// WriteJSON saves the C1.5 placement artifact.
func (r *PlacementReport) WriteJSON(path string) error { return writeJSON(r, path) }
