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

// Factors carries a mob's tuning values. DamageFraction and
// StructureDamageFraction are no longer part of the mob JSON — mob damage
// lives in the skill loadout (Phase 6.1). The fields remain because Factors
// doubles as the MobTouches payload: the SkillSystem fills them from the
// active skill's effect parameters and each target picks the fraction that
// applies to it (players: DamageFraction, structures: StructureDamageFraction).
type Factors struct {
	Vulnerability           float32
	DamageFraction          float32
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
		Vulnerability float32 `json:"vulnerability"`
		Speed         float32 `json:"speed"`
		DeltaPhi      float32 `json:"deltaPhi"`
		TurnRate      float32 `json:"turnRate"`
		Experience    uint32  `json:"experience"`
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

	mob := &MobDefinition{
		ID:   MobID(m.Id),
		Name: m.Name,
		Type: m.Type,
		Factors: Factors{
			Vulnerability: m.Factors.Vulnerability,
			Speed:         m.Factors.Speed,
			DeltaPhi:      m.Factors.DeltaPhi,
			TurnRate:      m.Factors.TurnRate,
			Experience:    m.Factors.Experience,
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
