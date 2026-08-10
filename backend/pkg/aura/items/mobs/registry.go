package mobs

import (
	"fmt"
	"io/fs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

type mobMap map[MobID]*MobDefinition

type registry struct {
	mobs mobMap
}

func (r *registry) Get(i MobID) (*MobDefinition, error) {
	mob, ok := r.mobs[i]
	if !ok {
		return nil, fmt.Errorf("MobDefinition '%d' not found.", i)
	}
	return mob, nil
}

func (r *registry) GetByName(name string) (*MobDefinition, error) {
	for _, m := range r.mobs {
		if m.Name == name {
			return m, nil
		}
	}
	return nil, fmt.Errorf("MobDefinition '%s' not found.", name)
}

func (r *registry) Mobs() []*MobDefinition {
	mobs := []*MobDefinition{}
	for _, m := range r.mobs {
		mobs = append(mobs, m)
	}
	return mobs
}

// add registers a definition; a duplicate authored id hard-fails — the quest
// ledger keys lifetime counters by MobID (plan-quests.md L12), so a silent
// overwrite would merge two species.
func (r *registry) add(m *MobDefinition) error {
	if existing, dup := r.mobs[m.ID]; dup {
		return fmt.Errorf("duplicate mob id %d: %q and %q", m.ID, existing.Name, m.Name)
	}
	r.mobs[m.ID] = m
	return nil
}

func newRegistry() *registry {
	return &registry{mobs: make(mobMap)}
}

type Registry interface {
	Get(i MobID) (*MobDefinition, error)
	GetByName(name string) (*MobDefinition, error)
	Mobs() []*MobDefinition
}

// RegistryFromFS loads every mob definition and derives its tier+baseline
// numbers against c — the SAME f(L) curve the players ride (C0, GDD §5: one
// growth knob), taken from the game conf at boot.
func RegistryFromFS(sr skills.Registry, fr factions.Registry, c curve.Curve, fileSystem fs.FS) (*registry, error) {
	mobs := newRegistry()

	err := fs.WalkDir(fileSystem, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("cannot read '%s': %w", path, err)
		}

		if d.IsDir() {
			return nil
		}

		data, err := fs.ReadFile(fileSystem, path)
		if err != nil {
			return fmt.Errorf("cannot read '%s': %w", path, err)
		}
		mobParsed, err := parseMobDefinition(data)
		if err != nil {
			return fmt.Errorf("cannot parse '%s': %w", path, err)
		}

		mob, err := mobParsed.mapToMobDefinition(sr, fr, c)
		if err != nil {
			return fmt.Errorf("cannot map '%s': %w\n", path, err)
		}
		if err := mobs.add(mob); err != nil {
			return fmt.Errorf("cannot register '%s': %w", path, err)
		}
		return nil
	})
	if err != nil {
		return mobs, err
	}

	if err := resolveConditionSpecies(mobs); err != nil {
		return mobs, err
	}

	return mobs, validateSpawnEffects(mobs, sr)
}

// resolveConditionSpecies fills in the MobID behind every kills_this_life gate
// authored on a dialogue node (plan-ascension.md D18 tier A, P20).
//
// ⚑ It has to run HERE rather than in mapToInteraction, for the same reason
// validateSpawnEffects below does: that maps one definition at a time, so a node
// gating on a species authored in another file has no registry to resolve
// against yet. This is the earliest moment every name in the world is known.
//
// ⚑ An unknown species is a BOOT FAILURE, not a gate that quietly never opens.
// conditionsPass fails closed, so an unresolved gate would render as a locked
// row nobody can ever unlock, indistinguishable from one that is merely hard,
// and discovered only by the player who spends a life chasing it.
//
// ⭐ It writes through the slice INDEX. Ranging over Conditions copies each
// struct, and the resolved id would land on the copy: the whole pass would run
// green and change nothing.
func resolveConditionSpecies(mobs *registry) error {
	for _, def := range mobs.mobs {
		if def.Interaction == nil {
			continue
		}
		for ni := range def.Interaction.Nodes {
			node := &def.Interaction.Nodes[ni]
			for ci := range node.Conditions {
				cond := &node.Conditions[ci]
				if cond.Kind != ConditionKillsThisLife {
					continue
				}
				species, err := mobs.GetByName(cond.Species)
				if err != nil {
					return fmt.Errorf("mob %q: interaction node %q gates on kills of %q, "+
						"which does not match any mob definition", def.Name, node.ID, cond.Species)
				}
				cond.SpeciesID = species.ID
			}
		}
	}
	return nil
}

// validateSpawnEffects resolves every spawn effect's mob name against the
// freshly built mob registry. Skills load before mobs (mob loadouts resolve
// against the skill registry), so this is the earliest moment a spawnMob typo
// can hard-fail at boot instead of at cast time.
//
// While it holds the resolved mob anyway, it attaches the summon's loadout to
// the spawn payload as catalog references (round-7 item 3) — the /skills
// catalog is where the tooltip learns what the summon does; see
// skills.SpawnParams.SummonLoadout for why the carve-out lives there.
func validateSpawnEffects(mobs *registry, sr skills.Registry) error {
	if sr == nil {
		return nil
	}
	for _, skill := range sr.All() {
		for _, effect := range skill.Effects {
			if effect.Spawn == nil {
				continue
			}
			summoned, err := mobs.GetByName(effect.Spawn.MobName)
			if err != nil {
				return fmt.Errorf("skill %q: spawnMob %q does not match any mob definition", skill.Name, effect.Spawn.MobName)
			}
			loadout := make([]skills.SummonSkillRef, 0, len(summoned.Skills))
			for _, ms := range summoned.Skills {
				loadout = append(loadout, skills.SummonSkillRef{SkillID: ms.Def.ID, Level: ms.Level})
			}
			effect.Spawn.SummonLoadout = loadout
		}
	}
	return nil
}
