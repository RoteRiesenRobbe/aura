package mobs

import (
	"encoding/json"
	"fmt"
	"math"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Mob tiers (C0, plan-content-zones12.md §13): a classification label for
// thresholds, XP models and UI — eliteness itself is expressed in the
// authored baseline values, the tier does not multiply anything.
const (
	TierNormal = "normal"
	TierElite  = "elite"
	TierBoss   = "boss"
)

//{
//"id": 1,
//"name": "Dodo",
//"type": "MOB",
//"factors": {
//"vulnerability": 5.0
//}
//}

type MobID uint64

// Factors carries a mob's tuning values. Damage and StructureDamageFraction
// are no longer part of the mob JSON — mob damage lives in the skill loadout
// (Phase 6.1). Those two fields remain because Factors doubles as the
// MobTouches payload: the SkillSystem fills them from the active skill's effect
// parameters and each target picks the value that applies to it (players/mobs:
// Damage in absolute HP, structures: StructureDamageFraction as a fraction).
//
// MaxHealth is the mob's absolute HP pool (item 11 Phase 1); a definition with
// MaxHealth <= 0 falls back to a default at mob construction. MaxHealthVariance
// (item 11 Phase 3) is a percentage band rolled once at spawn: the mob's actual
// pool is uniform in [MaxHealth×(1−v), MaxHealth×(1+v)]. 0 = every spawn
// identical; valid range 0 <= v < 1 (players never get HP variance, C1).
//
// Resistances maps damage tags to incoming-damage multipliers (item 11
// Phase 2): 1 = normal, 0.5 = takes half, 0 = immune, > 1 = vulnerable.
// Tags absent from the map fall back to a "*" entry if present (per tag —
// skills.ResistWildcard, plan-skill-vocab chunk 1), else are unresisted;
// nil = no base resistances. It replaced the former all-damage Vulnerability
// multiplier.
// DamageTags is payload-only (like Damage): the SkillSystem fills it from the
// active skill's effect so living targets can match their resistances against
// the mob's hit; it is not part of the mob JSON.
// FleeBelowHealthRatio is the cowardice threshold (mob-depth chunk 2): while
// the mob's health ratio is strictly below it, the mob flees its aggro target
// instead of chasing. 0/absent = never flees; 1 = flees whenever damaged;
// valid range [0, 1].
//
// Idle-pacing fields (mob-depth chunk 5 pacing rework): WanderRadius is the
// TYPE-level default wander archetype — a spawn point without its own
// wanderRadius/waypoints inherits it (Dodos graze by default); applied only
// by the spawn-point system, so summons/companions are unaffected.
// IdleSpeedFactor scales chase speed down for all idle movement (wander legs
// AND patrol marching; evade return and walk-home stay full speed by design);
// 0/absent = the global default at mob construction, valid (0, 1].
// IdleDwellMin/MaxTicks is the stand time rolled between wander legs;
// 0/absent = global defaults.
type Factors struct {
	MaxHealth            uint32
	MaxHealthVariance    float32
	FleeBelowHealthRatio float32
	WanderRadius         float32
	IdleSpeedFactor      float32
	IdleDwellMinTicks    int
	IdleDwellMaxTicks    int
	Resistances          map[string]float32
	Damage               float32
	DamageTags           []string
	// Lifesteal / Crit / Gated are payload-only like DamageTags
	// (plan-skill-vocab chunk 1): the SkillSystem fills them per hit from the
	// casting effect; they are not part of the mob JSON. Gated marks opt-in
	// damage tags (content pass C1, skills.GateOpensFor).
	Lifesteal               float32
	Crit                    bool
	Gated                   bool
	Speed                   float32
	DeltaPhi                float32
	TurnRate                float32
	StructureDamageFraction float32
	Experience              uint32
}

type Body struct {
	Radius         float32
	CollisionLayer int
	CollisionMask  int
	AggroRadius    float32
}

// MobSkill is one entry of a mob's skill loadout, resolved against the skill
// registry at load time.
type MobSkill struct {
	Def   *skills.SkillDefinition
	Level int
}

// MobUnlock is a skill this mob may add to a killer's spellbook on death
// (unlock source #2, skill-system Phase 6.2). Chance is in (0, 1];
// 1.0 = guaranteed (mixed model, absent chance in JSON defaults to 1.0).
type MobUnlock struct {
	Skill  *skills.SkillDefinition
	Chance float32
}

type MobDefinition struct {
	ID   MobID
	Name string
	Type string

	// EntityType optionally decouples the wire EntityType from the def name
	// (chunk 9 content): a throwaway/variant def (e.g. an encounter boss)
	// reuses an existing sprite without a FlatBuffers enum append or any
	// frontend work. Empty = the def name IS the wire type (all legacy defs);
	// validated against the FlatBuffers enum at load time.
	EntityType string

	// Tier + CurveLevel are the C0 tier+baseline authoring axes: Tier is a
	// pure classification label (normal/elite/boss); CurveLevel is the mob's
	// hand-picked position on the f(L) curve (zone number = curve position,
	// GDD §5). Factors.MaxHealth arrives here already DERIVED
	// (baseMaxHealth × f(CurveLevel)); PowerScale = f(CurveLevel) multiplies
	// the mob's skill HP values at cast time (model.PowerScaled on the mob
	// entity), so mob-skill JSONs stay baseline-authored. A growth change
	// re-derives everything — one knob, no re-authoring.
	Tier       string
	CurveLevel int
	PowerScale float32

	// Legacy marks proving-grounds-only species (step-7 A.5): kept for the
	// legacy zone, sim presets and tests, never spawned by the live world.
	// LegacyRefs lists legacy-tagged content a LIVE mob references (skills,
	// unlocks, faction) — an authoring smell the boot loader warns about;
	// always empty on legacy mobs (legacy referencing legacy is expected).
	Legacy     bool
	LegacyRefs []string

	Factors Factors
	Body    Body
	Skills  []MobSkill
	Unlocks []MobUnlock

	// Faction is the species' allegiance, AggroMask the bitmask of faction IDs
	// it proactively acquires in its aggro sensor (mob-depth chunk 6.6, both
	// resolved against the factions registry at load time). A definition
	// without a faction key gets the built-in hostile faction with its
	// aggro-players-only mask — the pre-factions behavior. The numeric values
	// mirror model.Faction (the boot seam converts in NewMob).
	// FriendlyToPlayers rides the faction's flag (§9 lift 6, C5) onto the
	// species so the entity can expose it to the damage-eligibility seam.
	Faction           factions.Faction
	AggroMask         uint64
	FriendlyToPlayers bool
}

type mobDefinition struct {
	Id         uint64 `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	EntityType string `json:"entityType"` // absent → the name resolves the wire type
	Faction    string `json:"faction"`    // absent → the built-in hostile default
	Tier       string `json:"tier"`       // absent → "normal" (label only, C0)
	CurveLevel int    `json:"curveLevel"` // absent → 1 (baseline, f = 1)
	Legacy     bool   `json:"legacy"`     // absent → live content (step-7 A.5)

	Factors struct {
		// BaseMaxHealth is the tier+baseline authoring value (C0): the HP
		// pool at curve position 1. The derived pool is
		// baseMaxHealth × f(curveLevel). MaxHealth exists only to hard-fail
		// raw authoring — the pre-C0 field is a review reject.
		BaseMaxHealth        uint32             `json:"baseMaxHealth"`
		MaxHealth            uint32             `json:"maxHealth"`
		MaxHealthVariance    float32            `json:"maxHealthVariance"`
		FleeBelowHealthRatio float32            `json:"fleeBelowHealthRatio"`
		WanderRadius         float32            `json:"wanderRadius"`
		IdleSpeedFactor      float32            `json:"idleSpeedFactor"`
		IdleDwellMinTicks    int                `json:"idleDwellMinTicks"`
		IdleDwellMaxTicks    int                `json:"idleDwellMaxTicks"`
		Resistances          map[string]float32 `json:"resistances"`
		Speed                float32            `json:"speed"`
		DeltaPhi             float32            `json:"deltaPhi"`
		TurnRate             float32            `json:"turnRate"`
		Experience           uint32             `json:"experience"`
	} `json:"factors"`

	Body struct {
		Radius         float32 `json:"radius"`
		CollisionLayer int     `json:"collisionLayer"`
		CollisionMask  int     `json:"collisionMask"`
		AggroRadius    float32 `json:"aggroRadius"`
	} `json:"body"`

	Skills []struct {
		SkillName string `json:"skillName"`
		Level     int    `json:"level"` // absent → 1
	} `json:"skills"`

	Unlocks []struct {
		SkillName string   `json:"skillName"`
		Chance    *float32 `json:"chance"` // nil → 1.0 (guaranteed)
	} `json:"unlocks"`
}

// parseItemDefinition parses a json string from a byte array into the
// appropriate recipe object
func parseMobDefinition(data []byte) (*mobDefinition, error) {
	var mob mobDefinition
	err := json.Unmarshal(data, &mob)
	if err != nil {
		return nil, err
	}

	return &mob, nil
}

func (m *mobDefinition) mapToMobDefinition(sr skills.Registry, fr factions.Registry, c curve.Curve) (*MobDefinition, error) {
	// Mobs need an aggro territory; the former 4x-damage-radius fallback died
	// with Body.DamageRadius (Phase 6.1), so the value is now required.
	if m.Body.AggroRadius <= 0 {
		return nil, fmt.Errorf("mob %q: body.aggroRadius is required and must be > 0", m.Name)
	}

	// Tier + baseline authoring (C0): raw maxHealth hard-fails — the
	// mechanical form of the "raw stat numbers are a review reject" rule.
	// Absent tier/curveLevel default to the baseline (normal at curve
	// position 1, f = 1) so synthetic/test defs stay minimal.
	if m.Factors.MaxHealth != 0 {
		return nil, fmt.Errorf("mob %q: factors.maxHealth is raw authoring — author factors.baseMaxHealth + tier + curveLevel instead (C0 tier+baseline rule)", m.Name)
	}
	tier := m.Tier
	if tier == "" {
		tier = TierNormal
	}
	if tier != TierNormal && tier != TierElite && tier != TierBoss {
		return nil, fmt.Errorf("mob %q: tier %q must be one of normal/elite/boss", m.Name, tier)
	}
	curveLevel := m.CurveLevel
	if curveLevel == 0 {
		curveLevel = 1
	}
	if curveLevel < 1 {
		return nil, fmt.Errorf("mob %q: curveLevel %d must be >= 1", m.Name, m.CurveLevel)
	}
	powerScale := c.F(curveLevel)

	// Variance ≥ 1 would allow a 0-HP (born dead) roll; negative is nonsense.
	if v := m.Factors.MaxHealthVariance; v < 0 || v >= 1 {
		return nil, fmt.Errorf("mob %q: factors.maxHealthVariance %v must be in [0, 1)", m.Name, v)
	}

	// A health ratio lives in [0, 1]; 1 itself is valid (flees whenever damaged).
	if ratio := m.Factors.FleeBelowHealthRatio; ratio < 0 || ratio > 1 {
		return nil, fmt.Errorf("mob %q: factors.fleeBelowHealthRatio %v must be in [0, 1]", m.Name, ratio)
	}

	// Idle pacing (chunk 5): a stationary species cannot carry a default
	// wander; the factor is a fraction of chase speed; dwell is a band.
	if m.Factors.WanderRadius < 0 {
		return nil, fmt.Errorf("mob %q: factors.wanderRadius %v must not be negative", m.Name, m.Factors.WanderRadius)
	}
	if m.Factors.WanderRadius > 0 && m.Factors.Speed <= 0 {
		return nil, fmt.Errorf("mob %q: stationary mob (speed 0) cannot carry a default wanderRadius", m.Name)
	}
	if f := m.Factors.IdleSpeedFactor; f < 0 || f > 1 {
		return nil, fmt.Errorf("mob %q: factors.idleSpeedFactor %v must be in (0, 1] (or absent)", m.Name, f)
	}
	if m.Factors.IdleDwellMinTicks < 0 || m.Factors.IdleDwellMaxTicks < 0 {
		return nil, fmt.Errorf("mob %q: idle dwell ticks must not be negative", m.Name)
	}
	if m.Factors.IdleDwellMaxTicks > 0 && m.Factors.IdleDwellMinTicks > m.Factors.IdleDwellMaxTicks {
		return nil, fmt.Errorf("mob %q: idleDwellMinTicks %d exceeds idleDwellMaxTicks %d", m.Name, m.Factors.IdleDwellMinTicks, m.Factors.IdleDwellMaxTicks)
	}

	// Resistances: 0 = immune is valid, negative would heal on hit.
	for tag, multiplier := range m.Factors.Resistances {
		if tag == "" {
			return nil, fmt.Errorf("mob %q: resistances: empty tag", m.Name)
		}
		if multiplier < 0 {
			return nil, fmt.Errorf("mob %q: resistances[%q]: must be >= 0, got %v", m.Name, tag, multiplier)
		}
	}

	// entityType override (chunk 9): must name a real FlatBuffers EntityType —
	// failing here at load beats mob.NewMob's runtime fatal at first spawn.
	if m.EntityType != "" {
		if _, ok := AuraApi.EnumValuesEntityType[m.EntityType]; !ok {
			return nil, fmt.Errorf("mob %q: entityType %q is not a known EntityType", m.Name, m.EntityType)
		}
	}

	// Faction (chunk 6.6): absent = the built-in hostile default; an explicit
	// name resolves against the factions registry ("aligned" is summon-only,
	// set at spawn via SetFaction, never authored on a species).
	faction := factions.Hostile
	aggroMask := factions.Bit(factions.Aligned)
	friendlyToPlayers := false
	// Legacy-leak collection (step-7 A.5): a live mob pointing at
	// legacy-tagged content means the tag went stale — the boot loader warns.
	var legacyRefs []string
	if m.Faction != "" {
		if m.Faction == "aligned" {
			return nil, fmt.Errorf("mob %q: faction \"aligned\" is summon-only and cannot be authored", m.Name)
		}
		if fr == nil {
			return nil, fmt.Errorf("mob %q: declares faction %q but no factions are loaded", m.Name, m.Faction)
		}
		f, err := fr.GetByName(m.Faction)
		if err != nil {
			return nil, fmt.Errorf("mob %q: %w", m.Name, err)
		}
		faction = f.ID
		aggroMask = f.AggroMask
		friendlyToPlayers = f.FriendlyToPlayers
		if f.Legacy && !m.Legacy {
			legacyRefs = append(legacyRefs, "faction "+f.Name)
		}
	}

	mob := &MobDefinition{
		ID:                MobID(m.Id),
		Name:              m.Name,
		Type:              m.Type,
		EntityType:        m.EntityType,
		Faction:           faction,
		AggroMask:         aggroMask,
		FriendlyToPlayers: friendlyToPlayers,
		Tier:              tier,
		CurveLevel:        curveLevel,
		PowerScale:        float32(powerScale),
		Legacy:            m.Legacy,
		Factors: Factors{
			MaxHealth:            uint32(math.Round(float64(m.Factors.BaseMaxHealth) * powerScale)),
			MaxHealthVariance:    m.Factors.MaxHealthVariance,
			FleeBelowHealthRatio: m.Factors.FleeBelowHealthRatio,
			WanderRadius:         m.Factors.WanderRadius,
			IdleSpeedFactor:      m.Factors.IdleSpeedFactor,
			IdleDwellMinTicks:    m.Factors.IdleDwellMinTicks,
			IdleDwellMaxTicks:    m.Factors.IdleDwellMaxTicks,
			Resistances:          m.Factors.Resistances,
			Speed:                m.Factors.Speed,
			DeltaPhi:             m.Factors.DeltaPhi,
			TurnRate:             m.Factors.TurnRate,
			Experience:           m.Factors.Experience,
		},
		Body: Body{
			Radius:         m.Body.Radius,
			CollisionLayer: m.Body.CollisionLayer,
			CollisionMask:  m.Body.CollisionMask,
			AggroRadius:    m.Body.AggroRadius,
		},
	}

	// resolve skill loadout
	for _, s := range m.Skills {
		def, err := sr.GetByName(s.SkillName)
		if err != nil {
			return nil, fmt.Errorf("mob %q: skill %q not found: %w", m.Name, s.SkillName, err)
		}
		level := s.Level
		if level < 1 {
			level = 1
		}
		if def.Legacy && !m.Legacy {
			legacyRefs = append(legacyRefs, "skill "+def.Name)
		}
		mob.Skills = append(mob.Skills, MobSkill{Def: def, Level: level})
	}

	// resolve kill unlocks
	for _, u := range m.Unlocks {
		def, err := sr.GetByName(u.SkillName)
		if err != nil {
			return nil, fmt.Errorf("mob %q: unlock skill %q not found: %w", m.Name, u.SkillName, err)
		}
		chance := float32(1.0)
		if u.Chance != nil {
			chance = *u.Chance
		}
		if chance <= 0 || chance > 1 {
			return nil, fmt.Errorf("mob %q: unlock %q chance %f must be in (0, 1]", m.Name, u.SkillName, chance)
		}
		if def.Legacy && !m.Legacy {
			legacyRefs = append(legacyRefs, "unlock "+def.Name)
		}
		mob.Unlocks = append(mob.Unlocks, MobUnlock{Skill: def, Chance: chance})
	}

	mob.LegacyRefs = legacyRefs
	return mob, nil
}
