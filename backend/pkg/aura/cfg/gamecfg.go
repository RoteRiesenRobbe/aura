package cfg

import (
	"encoding/json"
	"log/slog"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// Bounds is the rectangular world size in server units (world foundation
// chunk 1).
type Bounds struct {
	Width  float32
	Height float32
}

// PlacedBounds is one zone's rectangle in the shared coordinate space: its
// size, plus where its centre sits (plan-underworld.md U1). A zone authored
// before Origin existed, and the overworld forever, sit at {0, 0}.
type PlacedBounds struct {
	Bounds
	OriginX float32
	OriginY float32
	// ZoneID is carried for the boot log and for error messages only — the
	// physics never learns that zones exist.
	ZoneID string
}

type GameConfig struct {
	Tokens []string
	// Bounds is the PRIMARY zone's rectangle, and deliberately not a union of
	// every loaded zone (plan-underworld.md L13). Two things read it besides
	// the border wall — Welcome.map_width/map_height, and the last-ditch
	// randomSpawnPosition fallback — and a union rectangle would break the
	// client's camera clamp and let that fallback drop a player in the empty
	// space BETWEEN zones. The walls come from Walls instead.
	Bounds Bounds

	// Walls is one rectangle per loaded zone, each becoming its own border
	// wall. Single-zone boots carry exactly one entry, equal to Bounds.
	Walls []PlacedBounds

	// ZoneName is the active zone's identity (its file stem), sent to the
	// client in the Welcome so it renders the matching terrain (chunk 6).
	// With several zones loaded this is the PRIMARY one.
	ZoneName string
	// ZoneNames is every loaded zone's stem, primary first (Walls is the same
	// set as geometry). Empty falls back to just ZoneName on the wire.
	ZoneNames        []string
	MobRegistry      mobs.Registry
	SkillRegistry    skills.Registry
	MilestoneUnlocks []skills.MilestoneUnlock
	Recipes          skills.RecipeRegistry
	QuestRegistry    quests.Registry

	// AscensionCatalog is the curated reward list an ascending bloodline picks
	// one entry from (plan-ascension.md D13). Empty until C3 authors it, and
	// empty is a legal world (D14).
	AscensionCatalog ascension.Catalog

	// Spawns are the authored mob spawn points from the zone (world foundation
	// chunk 4). The MobSystem spawns one mob per point and respawns it at the
	// same spot on death.
	Spawns []world.Spawn

	// ZoneAnchors is every loaded zone's named anchors, flattened into one
	// lookup in WORLD coordinates (plan-underworld.md U3). It is what an
	// anchor-mode travel_to row resolves its destination against.
	//
	// ⚑ Names are unique across the placed set (world.Place checkSetWide, L5b),
	// so flattening loses nothing: an anchor name identifies a point in the
	// shared space, and no caller needs to know which file authored it.
	//
	// ⚑ world.Point rather than phy.Vec2f deliberately: this package holds
	// authored content and stays out of the physics package. core converts once
	// when it wires the InteractionSystem.
	ZoneAnchors map[string]world.Point

	// PathCorridors are the static collision shapes the zone's blocking paths
	// ask for — rivers and anything else authored blocksMovement
	// (plan-world-paths.md C2). Built by world.PathCorridors at load time, with
	// the bridges already subtracted, so the game loop only has to register
	// them. Empty for every zone that authors no blocking path, which is all of
	// them today.
	PathCorridors []world.Corridor

	TotalDayCycleSeconds   uint64
	DayTimeSeconds         uint64
	MobChaseIntoAuraMargin float32

	// Mob dormancy's wake volume (plan-world-scale.md D6), as DIMENSIONLESS
	// multiples of the AOI box rather than distances in units: the volume is
	// derived from constant.ViewPortWidth/Height at the read site, so it tracks
	// the viewport automatically and inherits its api/shared-constants.json pin.
	//
	// A mob wakes inside MobWakeMargin × AOI and sleeps only outside
	// MobSleepMargin × AOI; the gap between them is the anti-thrash hysteresis
	// band. Both are [PLACEHOLDER] and TUNING-OPEN.
	//
	// ⚑ MobWakeMargin is the single highest-leverage number in the plan: awake
	// mob count scales with its SQUARE, so every doubling costs 4×. The first
	// draft's hand-set "wake 40 units" covered 21× the AOI box and would have
	// left 91 % of mobs awake — the chunk was not worth building at that value.
	MobWakeMargin  float32
	MobSleepMargin float32

	PlayerConfig PlayerConfig
	CombatConfig CombatConfig
}

// Built-in defaults for the combat factors [PLACEHOLDER], applied whenever the
// matching conf entry is absent (zero). They live here — not at the read sites
// — so a hand-built GameConfig (the sim harness, tests) and a real conf.json
// without a game.combat block resolve to the same numbers through one path.
const (
	DefaultCritFactor         = 2.0
	DefaultHealerThreatFactor = 0.5
	// DefaultPresenceRadius is the presence-participation range (chunk P, P1)
	// [PLACEHOLDER 8]: the viewport is 20×12 units, so ~8 reads as "clearly at
	// the fight, on your screen".
	DefaultPresenceRadius = 8.0
)

// CombatConfig holds combat factors that apply to EVERY acting entity — player,
// mob, summon alike — which is why they sit outside PlayerConfig next to the
// player-character-only CritChance (backlog §25 B). See §31 for the wider
// player/mob stat convergence these are the first instalment of.
type CombatConfig struct {
	// DefaultCritFactor multiplies crits on effects that author no critFactor
	// of their own (§4.3 v2, PO 2026-07-20); authored factors win.
	DefaultCritFactor float32

	// HealerThreatFactor weights landed healing into threat (§6.3, decided
	// 2026-07-10): healedHP × factor, credited on every mob in combat with the
	// heal target.
	HealerThreatFactor float32

	// PresenceRadius is the presence-participation range (chunk P, P1): a
	// player with an active aura ON within this range of a player-fought mob
	// joins its participant set — one fixed radius, flat for all mobs. The
	// mob's body radius is added at the query (the withinSensor convention),
	// so a large boss body doesn't shrink the effective ring.
	PresenceRadius float32
}

// CritFactor is DefaultCritFactor with the zero value normalized to the
// built-in default, so callers never have to check.
func (c CombatConfig) CritFactor() float32 {
	if c.DefaultCritFactor <= 0 {
		return DefaultCritFactor
	}
	return c.DefaultCritFactor
}

// HealerThreat is HealerThreatFactor with the zero value normalized to the
// built-in default. Note a deliberate consequence: healer threat cannot be
// switched OFF by authoring 0 — set a tiny value instead.
func (c CombatConfig) HealerThreat() float32 {
	if c.HealerThreatFactor <= 0 {
		return DefaultHealerThreatFactor
	}
	return c.HealerThreatFactor
}

// PresenceRange is PresenceRadius with the zero value normalized to the
// built-in default. Per the standing conf ruling, authoring 0 restores the
// default — it does not disable presence credit.
func (c CombatConfig) PresenceRange() float32 {
	if c.PresenceRadius <= 0 {
		return DefaultPresenceRadius
	}
	return c.PresenceRadius
}

func (g *GameConfig) LogValue() slog.Value {
	raw, err := json.Marshal(g)
	if err != nil {
		return slog.AnyValue(err)
	}

	var asMap map[string]any
	err = json.Unmarshal(raw, &asMap)
	if err != nil {
		return slog.AnyValue(err)
	}

	return slog.GroupValue(
		slog.Any("raw", asMap),
	)
}

type PlayerConfig struct {
	// constant for out-of-combat health regen
	HealthGainTick float32

	WalkingSpeedPerTick float32

	// FlightSpeedFactor × WalkingSpeedPerTick is the campfire-to-campfire
	// flight speed (plan-flight-paths.md D8). [PLACEHOLDER 4]
	FlightSpeedFactor float32

	// BaseHealth is the player's absolute HP pool at level 1 (item 11 Phase 1)
	// [PLACEHOLDER]; scaled by f(level) (LevelCurve) × passive bonuses.
	BaseHealth int

	// LevelCurve is f(character level) — the global HP-value inflation
	// multiplier (GDD §5): player max HP and HP-side skill output scale by
	// F(level); MaxLevel caps level-ups. Zero growth = neutral (curve.F).
	LevelCurve curve.Curve

	LevelUpXPBase         uint32
	LevelUpXPGrowthFactor float32

	// skill points earned per player level beyond 1 [PLACEHOLDER]
	SkillPointsPerLevel int

	// CritChance is the flat character-base crit chance on every direct hit
	// (§4.3 v2, PO 2026-07-20) [PLACEHOLDER]; additive with the critChance
	// passive stat and any skill-authored chance. Read in sys.rollHitDamage's
	// apply sites.
	CritChance float32
}

// Contains reports whether a world position falls inside this zone's rectangle.
// The rectangle is centred on the origin, exactly like the border wall built
// from it, so "inside" here and "the wall holds you" are the same question.
func (p PlacedBounds) Contains(x, y float32) bool {
	return x >= p.OriginX-p.Width/2 && x <= p.OriginX+p.Width/2 &&
		y >= p.OriginY-p.Height/2 && y <= p.OriginY+p.Height/2
}

// ZoneIndexAt returns the index of the zone containing a world position, or -1.
//
// ⚑ Zones cannot overlap — world.Place proves their walls do not even share
// broadphase cells — so the first hit is the only hit and there is no
// precedence rule to get wrong.
//
// -1 is reachable in exactly one situation worth naming: a position in the
// empty space BETWEEN zones. Nothing should ever be there (each zone's wall
// holds its occupants in), so a caller that gets -1 has found a bug, not a
// case to handle gracefully.
func ZoneIndexAt(zones []PlacedBounds, x, y float32) int {
	for i := range zones {
		if zones[i].Contains(x, y) {
			return i
		}
	}
	return -1
}
