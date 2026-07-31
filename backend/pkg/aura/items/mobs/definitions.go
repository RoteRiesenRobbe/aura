package mobs

import (
	"bytes"
	"encoding/json"
	"fmt"

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

// TierRank is the wire encoding of the tier label (triage item 15): the client
// draws the portrait frame ring from it, so the authored label stays the single
// source and the client needs no EntityType→tier table of its own.
//
// Ordered, not arbitrary — normal < elite < boss — so the client can treat it as
// a severity and a future tier slots in without a wire break. Serialized as the
// Mob.tier ubyte.
type TierRank uint8

const (
	TierRankNormal TierRank = 0
	TierRankElite  TierRank = 1
	TierRankBoss   TierRank = 2
)

var tierRanks = map[string]TierRank{
	TierNormal: TierRankNormal,
	TierElite:  TierRankElite,
	TierBoss:   TierRankBoss,
}

// Rank is the definition's tier as its wire byte. An absent or unrecognised
// label reports normal, matching the JSON loader's own "absent → normal"
// default; TestTierRank_CoversEveryTier guards the table against a new tier
// constant being added without an encoding.
func (d *MobDefinition) Rank() TierRank { return tierRanks[d.Tier] }

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
// BaseMaxHealth is the mob's HP pool at the baseline curve position — the
// authored factors.baseMaxHealth verbatim (C0 tier+baseline authoring). The
// f(CurveLevel) inflation is NOT baked in here: *Mob.MaxHealth applies it live
// at the mob's CURRENT level, the same way the player's pool is derived
// (plan-entity-model.md chunk 1b — an owned summon stands at its owner's
// level, so a frozen pool would be wrong the moment the owner levels).
// BaseMaxHealth <= 0 falls back to a default at mob construction.
// MaxHealthVariance (item 11 Phase 3) is a percentage band rolled once at
// spawn into a lifetime multiplier on that base; 0 = every spawn identical,
// valid range 0 <= v < 1 (players never get HP variance, C1).
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
//
// SupportThreshold is the role-as-loadout knob (playtest round 3): the ally
// health ratio at or below which a mob carrying a heal/shield aura breaks off to
// support, switching its active aura to the support slot. 0/absent = 1.0 (any
// ally short of full health — the pre-round-3 seek-healer behaviour); 0.5 makes
// a guardian that cleaves until an ally drops below half. Valid range [0, 1].
// Inert on a mob whose loadout carries no support aura.
type Factors struct {
	BaseMaxHealth        uint32
	MaxHealthVariance    float32
	FleeBelowHealthRatio float32
	SupportThreshold     float32
	WanderRadius         float32
	IdleSpeedFactor      float32
	IdleDwellMinTicks    int
	IdleDwellMaxTicks    int
	Resistances          map[string]float32
	// GateKeys are the lock-and-key tags this mob opts into (D4): a gated hit
	// damages it only if its key is named here. Separate from Resistances so a
	// gate cannot be typo'd into a resistance or vice versa, and so adding a
	// damage type can never change what a gated hit reaches.
	GateKeys   []string
	Damage     float32
	DamageTags []string
	// Lifesteal / Crit / GateKey are payload-only like DamageTags
	// (plan-skill-vocab chunk 1): the SkillSystem fills them per hit from the
	// casting effect; they are not part of the mob JSON. GateKey is the
	// lock-and-key tag (content pass C1, skills.GateOpensFor).
	Lifesteal               float32
	Crit                    bool
	GateKey                 string
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
	// GDD §5), and the level a mob stands at unless it is owned. Both the HP
	// pool and the mob's skill output are f(level) × the authored baseline, so
	// mob JSONs stay baseline-authored and a growth change re-derives
	// everything — one knob, no re-authoring.
	Tier       string
	CurveLevel int

	// Role is the authored actor discriminator (chunk 2, role.go): creature,
	// structure or follower. Absent in JSON → creature; the zero value is the
	// empty string, so NewMob re-applies that default for definitions built
	// directly (tests, the sim harness).
	Role Role

	// Curve is f(L) itself — the same curve.Curve value the player reads live
	// (model/player.PowerScale). It is the ONLY representation of the curve on
	// a definition: nothing is pre-derived at load, so a mob evaluates f at its
	// CURRENT level (plan-entity-model.md chunks 1a/1b, gap 3 — it was always
	// one curve, the mob side just had no way to re-evaluate it). The zero
	// value is neutral — Curve.F returns 1 at every level for growth <= 0 —
	// which is what hand-built definitions in tests and the sim harness get.
	Curve curve.Curve

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

	// Interaction is the conversation this actor carries (chunk 3a,
	// interaction.go); nil for the overwhelming majority that carry none. It
	// is what replaced the separate model/npc type — an NPC is an ordinary
	// actor with this field set, which is why role and "being an NPC" are
	// orthogonal (a teaching guard that fights bandits is a creature with an
	// interaction block, needing no new type and no new branch).
	Interaction *Interaction

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
	// Comment is parsed and discarded: the _comment key is the content
	// convention for authoring notes (the factions precedent), and it has to be
	// declared for DisallowUnknownFields to let it through. 60 of 64 mob files
	// carry one.
	Comment string `json:"_comment"`

	Id         uint64 `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	EntityType string `json:"entityType"` // absent → the name resolves the wire type
	Faction    string `json:"faction"`    // absent → the built-in hostile default
	Tier       string `json:"tier"`       // absent → "normal" (label only, C0)
	Role       string `json:"role"`       // absent → "creature" (chunk 2)
	CurveLevel int    `json:"curveLevel"` // absent → 1 (baseline, f = 1)
	Legacy     bool   `json:"legacy"`     // absent → live content (step-7 A.5)

	// Interaction is the authored conversation (chunk 3a); absent → nil, which
	// is every mob that is not an NPC.
	Interaction *jsonInteraction `json:"interaction"`

	Factors struct {
		// BaseMaxHealth is the tier+baseline authoring value (C0): the HP
		// pool at curve position 1. The derived pool is
		// baseMaxHealth × f(curveLevel). MaxHealth exists only to hard-fail
		// raw authoring — the pre-C0 field is a review reject.
		BaseMaxHealth        uint32             `json:"baseMaxHealth"`
		MaxHealth            uint32             `json:"maxHealth"`
		MaxHealthVariance    float32            `json:"maxHealthVariance"`
		FleeBelowHealthRatio float32            `json:"fleeBelowHealthRatio"`
		SupportThreshold     float32            `json:"supportThreshold"`
		WanderRadius         float32            `json:"wanderRadius"`
		IdleSpeedFactor      float32            `json:"idleSpeedFactor"`
		IdleDwellMinTicks    int                `json:"idleDwellMinTicks"`
		IdleDwellMaxTicks    int                `json:"idleDwellMaxTicks"`
		Resistances          map[string]float32 `json:"resistances"`
		GateKeys             []string           `json:"gateKeys"`
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

// parseMobDefinition parses one authored mob definition. Unknown keys are
// rejected so typos and stale renames fail by name rather than silently drop —
// the same contract zones, props and factions have always had. This loader was
// the last one without it, which is why a retired key needed a hand-written
// tombstone to be noticed at all (see jsonInteraction.Trigger); content here is
// hand-edited against -content ../api by someone who does not run `go test`, so
// a silently-ignored key is a line of authored content nobody ever sees.
func parseMobDefinition(data []byte) (*mobDefinition, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()

	var mob mobDefinition
	if err := dec.Decode(&mob); err != nil {
		return nil, err
	}

	return &mob, nil
}

func (m *mobDefinition) mapToMobDefinition(sr skills.Registry, fr factions.Registry, c curve.Curve) (*MobDefinition, error) {
	// The authored actor discriminator (chunk 2). Resolved before the body
	// checks because the sensor rule depends on it.
	role, ok := ParseRole(m.Role)
	if !ok {
		return nil, fmt.Errorf("mob %q: role %q must be one of %s", m.Name, m.Role, RoleNames())
	}

	// Mobs need an aggro territory; the former 4x-damage-radius fallback died
	// with Body.DamageRadius (Phase 6.1), so the value is required — for
	// everything that moves toward something. A structure acquires nothing (its
	// aura is always-on and it does not chase), so it authors no sensor;
	// requiring one is what produced the 0.1 dummy on all ten of them.
	if m.Body.AggroRadius <= 0 && role != RoleStructure {
		return nil, fmt.Errorf("mob %q: body.aggroRadius is required and must be > 0 for role %q", m.Name, role)
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
	// tierRanks is the single source of valid tiers: a tier is authorable
	// exactly when it has a wire encoding, so a new one cannot be accepted by
	// the loader while rendering as an unmarked normal on the client.
	if _, ok := tierRanks[tier]; !ok {
		return nil, fmt.Errorf("mob %q: tier %q must be one of normal/elite/boss", m.Name, tier)
	}
	curveLevel := m.CurveLevel
	if curveLevel == 0 {
		curveLevel = 1
	}
	if curveLevel < 1 {
		return nil, fmt.Errorf("mob %q: curveLevel %d must be >= 1", m.Name, m.CurveLevel)
	}
	// Variance ≥ 1 would allow a 0-HP (born dead) roll; negative is nonsense.
	if v := m.Factors.MaxHealthVariance; v < 0 || v >= 1 {
		return nil, fmt.Errorf("mob %q: factors.maxHealthVariance %v must be in [0, 1)", m.Name, v)
	}

	// A health ratio lives in [0, 1]; 1 itself is valid (flees whenever damaged).
	if ratio := m.Factors.FleeBelowHealthRatio; ratio < 0 || ratio > 1 {
		return nil, fmt.Errorf("mob %q: factors.fleeBelowHealthRatio %v must be in [0, 1]", m.Name, ratio)
	}

	// Likewise a ratio (round 3). Absent → the 1.0 default at construction; an
	// authored value above 1 would be a support threshold no ally can be under.
	if ratio := m.Factors.SupportThreshold; ratio < 0 || ratio > 1 {
		return nil, fmt.Errorf("mob %q: factors.supportThreshold %v must be in [0, 1] (or absent for 1.0)", m.Name, ratio)
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

	// Resistances: 0 = immune is valid, negative would heal on hit. Keys are
	// DAMAGE TYPES from the closed vocabulary, or the "*" wildcard — a gate key
	// here is the exact confusion D4 split apart, so it is named and rejected.
	for tag, multiplier := range m.Factors.Resistances {
		if tag == "" {
			return nil, fmt.Errorf("mob %q: resistances: empty tag", m.Name)
		}
		if tag != skills.ResistWildcard && !skills.DamageTypes[tag] {
			if skills.GateKeys[tag] {
				return nil, fmt.Errorf("mob %q: resistances[%q]: that is a GATE KEY, not a damage type — author it in factors.gateKeys", m.Name, tag)
			}
			return nil, fmt.Errorf("mob %q: resistances[%q]: unknown damage type", m.Name, tag)
		}
		if multiplier < 0 {
			return nil, fmt.Errorf("mob %q: resistances[%q]: must be >= 0, got %v", m.Name, tag, multiplier)
		}
	}

	// gateKeys: the lock-and-key tags this mob opts into. Closed vocabulary for
	// the same reason the skill side is — a typo here is a gate that can never
	// be opened, and nothing else would fail.
	for _, key := range m.Factors.GateKeys {
		if !skills.GateKeys[key] {
			if skills.DamageTypes[key] {
				return nil, fmt.Errorf("mob %q: gateKeys: %q is a DAMAGE TYPE, not a gate key — author it in factors.resistances", m.Name, key)
			}
			return nil, fmt.Errorf("mob %q: gateKeys: unknown gate key %q", m.Name, key)
		}
	}

	// The wire EntityType is the override if present, else the def name
	// (mob.NewMob's fallback). Validate whichever will actually be looked up so an
	// unresolvable name fails here at load (a boot error) instead of at first spawn
	// (a live-server crash — §27.2.1), matching the override's existing fail-fast.
	if _, ok := ResolveEntityType(m.EntityType, m.Name); !ok {
		if m.EntityType != "" {
			return nil, fmt.Errorf("mob %q: entityType %q is not a known EntityType", m.Name, m.EntityType)
		}
		return nil, fmt.Errorf("mob %q: name is not a known EntityType and no entityType override is set", m.Name)
	}

	// Faction (chunk 6.6): absent = the built-in hostile default; an explicit
	// name resolves against the factions registry ("aligned" is summon-only,
	// set at spawn via mob.Align(), never authored on a species).
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
		Role:              role,
		CurveLevel:        curveLevel,
		Curve:             c,
		Legacy:            m.Legacy,
		Factors: Factors{
			BaseMaxHealth:        m.Factors.BaseMaxHealth,
			MaxHealthVariance:    m.Factors.MaxHealthVariance,
			FleeBelowHealthRatio: m.Factors.FleeBelowHealthRatio,
			SupportThreshold:     m.Factors.SupportThreshold,
			WanderRadius:         m.Factors.WanderRadius,
			IdleSpeedFactor:      m.Factors.IdleSpeedFactor,
			IdleDwellMinTicks:    m.Factors.IdleDwellMinTicks,
			IdleDwellMaxTicks:    m.Factors.IdleDwellMaxTicks,
			Resistances:          m.Factors.Resistances,
			GateKeys:             m.Factors.GateKeys,
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

	// resolve the interaction container (chunk 3a)
	interaction, err := m.mapToInteraction(sr, &legacyRefs)
	if err != nil {
		return nil, err
	}
	mob.Interaction = interaction
	// A conversant nobody can ever reach is indistinguishable from a content
	// typo, and it would present in-game as a mute NPC. A structure omits
	// aggroRadius legitimately, so range is then the only radius it has.
	if mob.Interaction != nil && mob.SenseRadius() <= 0 {
		return nil, fmt.Errorf("mob %q: an interaction needs a sensor — author interaction.range or body.aggroRadius", m.Name)
	}
	// L12: an omitted collisionLayer is 0, and model/mob substitutes
	// LayerViewportCollision|LayerActionCollision for it — so the DEFAULT for a
	// conversant is walk-through and aura-targetable, i.e. killable. This does
	// NOT say what a conversant's layer must be (a teaching guard that fights
	// bandits is a legal actor — role and capabilities are orthogonal); it only
	// removes "unset" as a way of saying it, for exactly the defs where the
	// substituted default is dangerous.
	if mob.Interaction != nil && m.Body.CollisionLayer <= 0 {
		return nil, fmt.Errorf("mob %q: a mob carrying an interaction must author body.collisionLayer explicitly — the unset default is aura-targetable", m.Name)
	}

	mob.LegacyRefs = legacyRefs
	return mob, nil
}

// SenseRadius is the radius of the actor's one sensor: the wider of its aggro
// territory and its interaction reach (chunk 3a, D7). A mob's aggro aura and an
// NPC's proximity sensor were always the same mechanism — "approach" is aggro,
// for something friendly — so there is one circle, sized by whichever job needs
// to see further.
func (d *MobDefinition) SenseRadius() float32 {
	r := d.Body.AggroRadius
	if d.Interaction != nil && d.Interaction.Range > r {
		r = d.Interaction.Range
	}
	return r
}
