package mobs

import (
	"encoding/json"
	"fmt"

	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

//{
//"id": 1,
//"name": "Dodo",
//"type": "MOB",
//"factors": {
//"vulnerability": 5.0
//},
//"drops": [
//{
//"item": "RawMeat",
//"count": 3
//}
//]
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
// Tags absent from the map are unresisted; nil = no base resistances. It
// replaced the former all-damage Vulnerability multiplier.
// DamageTags is payload-only (like Damage): the SkillSystem fills it from the
// active skill's effect so living targets can match their resistances against
// the mob's hit; it is not part of the mob JSON.
type Factors struct {
	MaxHealth               uint32
	MaxHealthVariance       float32
	Resistances             map[string]float32
	Damage                  float32
	DamageTags              []string
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

type RespawnBehavior int

const (
	RespawnBehaviorRandomLocation RespawnBehavior = iota
	RespawnBehaviorProcreation
)

var namesEnumRespawnBehavior = map[string]RespawnBehavior{
	"RandomLocation": RespawnBehaviorRandomLocation,
	"Procreation":    RespawnBehaviorProcreation,
}

type Generator struct {
	Weight          int
	Fixed           int
	RespawnBehavior RespawnBehavior
}

type Drops []*items.ItemStack

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
	ID        MobID
	Name      string
	Type      string
	Factors   Factors
	Drops     Drops
	Body      Body
	Generator Generator
	Skills    []MobSkill
	Unlocks   []MobUnlock
}

type mobDefinition struct {
	Id   uint64 `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`

	Factors struct {
		MaxHealth         uint32             `json:"maxHealth"`
		MaxHealthVariance float32            `json:"maxHealthVariance"`
		Resistances       map[string]float32 `json:"resistances"`
		Speed       float32            `json:"speed"`
		DeltaPhi    float32            `json:"deltaPhi"`
		TurnRate    float32            `json:"turnRate"`
		Experience  uint32             `json:"experience"`
	} `json:"factors"`

	Drops []struct {
		Item  string `json:"item"`
		Count int    `json:"count"`
	} `json:"drops"`

	Body struct {
		Radius         float32 `json:"radius"`
		CollisionLayer int     `json:"collisionLayer"`
		CollisionMask  int     `json:"collisionMask"`
		AggroRadius    float32 `json:"aggroRadius"`
	} `json:"body"`

	Generator struct {
		Weight          int    `json:"weight"`
		Fixed           int    `json:"fixed"`
		RespawnBehavior string `json:"respawnBehavior"`
	} `json:"generator"`

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

func (m *mobDefinition) mapToMobDefinition(r items.Registry, sr skills.Registry) (*MobDefinition, error) {
	respawnBehavior := RespawnBehaviorRandomLocation
	if m.Generator.RespawnBehavior != "" {
		respawnBehavior = namesEnumRespawnBehavior[m.Generator.RespawnBehavior]
	}

	// Mobs need an aggro territory; the former 4x-damage-radius fallback died
	// with Body.DamageRadius (Phase 6.1), so the value is now required.
	if m.Body.AggroRadius <= 0 {
		return nil, fmt.Errorf("mob %q: body.aggroRadius is required and must be > 0", m.Name)
	}

	// Variance ≥ 1 would allow a 0-HP (born dead) roll; negative is nonsense.
	if v := m.Factors.MaxHealthVariance; v < 0 || v >= 1 {
		return nil, fmt.Errorf("mob %q: factors.maxHealthVariance %v must be in [0, 1)", m.Name, v)
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

	mob := &MobDefinition{
		ID:   MobID(m.Id),
		Name: m.Name,
		Type: m.Type,
		Factors: Factors{
			MaxHealth:         m.Factors.MaxHealth,
			MaxHealthVariance: m.Factors.MaxHealthVariance,
			Resistances:       m.Factors.Resistances,
			Speed:             m.Factors.Speed,
			DeltaPhi:          m.Factors.DeltaPhi,
			TurnRate:          m.Factors.TurnRate,
			Experience:        m.Factors.Experience,
		},
		Drops: make(Drops, 0, 1),
		Body: Body{
			Radius:         m.Body.Radius,
			CollisionLayer: m.Body.CollisionLayer,
			CollisionMask:  m.Body.CollisionMask,
			AggroRadius:    m.Body.AggroRadius,
		},
		Generator: Generator{
			Weight:          m.Generator.Weight,
			Fixed:           m.Generator.Fixed,
			RespawnBehavior: respawnBehavior,
		},
	}

	// append drops
	for _, d := range m.Drops {
		i, err := r.GetByName(d.Item)
		if err != nil {
			return nil, err
		}
		if d.Count < 1 {
			return nil, fmt.Errorf("Invalid Mob Definition, drop count is %d", d.Count)
		}
		mob.Drops = append(mob.Drops, items.NewItemStack(i, d.Count))
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
		mob.Unlocks = append(mob.Unlocks, MobUnlock{Skill: def, Chance: chance})
	}

	return mob, nil
}
