package skills

import (
	"fmt"
	"io/fs"
	"strings"
)

// Registry is the read-only interface for looking up loaded skill definitions.
type Registry interface {
	Get(id SkillID) (*SkillDefinition, error)
	GetByName(name string) (*SkillDefinition, error)
	All() []*SkillDefinition
}

type registry struct {
	byID   map[SkillID]*SkillDefinition
	byName map[string]*SkillDefinition
}

// RegistryFromFS walks fileSystem for .json files, parses each as a SkillDefinition,
// and returns a Registry. Fails on malformed JSON, unknown categories/effect types,
// duplicate IDs, or duplicate names.
func RegistryFromFS(fileSystem fs.FS) (Registry, error) {
	r := &registry{
		byID:   make(map[SkillID]*SkillDefinition),
		byName: make(map[string]*SkillDefinition),
	}

	err := fs.WalkDir(fileSystem, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", path, err)
		}
		if d.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}

		data, err := fs.ReadFile(fileSystem, path)
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", path, err)
		}

		raw, err := parseSkillDefinition(data)
		if err != nil {
			return fmt.Errorf("cannot parse %q: %w", path, err)
		}

		def, err := raw.mapToSkillDefinition()
		if err != nil {
			return fmt.Errorf("cannot map %q: %w", path, err)
		}

		if existing, ok := r.byID[def.ID]; ok {
			return fmt.Errorf("duplicate skill ID %d: %q and %q", def.ID, existing.Name, def.Name)
		}
		if existing, ok := r.byName[def.Name]; ok {
			return fmt.Errorf("duplicate skill name %q: IDs %d and %d", def.Name, existing.ID, def.ID)
		}

		r.byID[def.ID] = def
		r.byName[def.Name] = def
		return nil
	})
	if err != nil {
		return nil, err
	}

	return r, nil
}

func (r *registry) Get(id SkillID) (*SkillDefinition, error) {
	def, ok := r.byID[id]
	if !ok {
		return nil, fmt.Errorf("skill ID %d not found", id)
	}
	return def, nil
}

func (r *registry) GetByName(name string) (*SkillDefinition, error) {
	def, ok := r.byName[name]
	if !ok {
		return nil, fmt.Errorf("skill %q not found", name)
	}
	return def, nil
}

func (r *registry) All() []*SkillDefinition {
	result := make([]*SkillDefinition, 0, len(r.byID))
	for _, def := range r.byID {
		result = append(result, def)
	}
	return result
}
