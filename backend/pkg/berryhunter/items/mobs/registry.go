package mobs

import (
	"fmt"
	"io/fs"
	"io/ioutil"
	"os"
	"path/filepath"

	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
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

func (r *registry) add(m *MobDefinition) {
	r.mobs[m.ID] = m
}

func newRegistry() *registry {
	return &registry{mobs: make(mobMap)}
}

type Registry interface {
	Get(i MobID) (*MobDefinition, error)
	GetByName(name string) (*MobDefinition, error)
	Mobs() []*MobDefinition
}

func RegistryFromFS(r items.Registry, sr skills.Registry, fileSystem fs.FS) (*registry, error) {
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

		mob, err := mobParsed.mapToMobDefinition(r, sr)
		if err != nil {
			return fmt.Errorf("cannot map '%s': %w\n", path, err)
		}
		mobs.add(mob)
		return nil
	})
	if err != nil {
		return mobs, err
	}

	return mobs, validateSpawnEffects(mobs, sr)
}

// validateSpawnEffects resolves every spawn effect's mob name against the
// freshly built mob registry. Skills load before mobs (mob loadouts resolve
// against the skill registry), so this is the earliest moment a spawnMob typo
// can hard-fail at boot instead of at cast time.
func validateSpawnEffects(mobs *registry, sr skills.Registry) error {
	if sr == nil {
		return nil
	}
	for _, skill := range sr.All() {
		for _, effect := range skill.Effects {
			if effect.Spawn == nil {
				continue
			}
			if _, err := mobs.GetByName(effect.Spawn.MobName); err != nil {
				return fmt.Errorf("skill %q: spawnMob %q does not match any mob definition", skill.Name, effect.Spawn.MobName)
			}
		}
	}
	return nil
}

func RegistryFromPaths(r items.Registry, sr skills.Registry, f ...string) (*registry, error) {
	mobs := newRegistry()

	for _, path := range f {
		err := filepath.Walk(path, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return fmt.Errorf("Cannot read '%s': %s", path, err)
			}

			if !info.Mode().IsRegular() {
				return nil
			}

			data, err := ioutil.ReadFile(path)
			if err != nil {
				return fmt.Errorf("Cannot read '%s': %s", path, err)
			}
			mobParsed, err := parseMobDefinition(data)
			if err != nil {
				return fmt.Errorf("Cannot parse '%s': %s", path, err)
			}

			mob, err := mobParsed.mapToMobDefinition(r, sr)
			if err != nil {
				return fmt.Errorf("Cannot map '%s': %s\n", path, err)
			}
			mobs.add(mob)
			return nil
		})
		// bail if there was an error
		if err != nil {
			return nil, err
		}
	}

	return mobs, validateSpawnEffects(mobs, sr)
}
