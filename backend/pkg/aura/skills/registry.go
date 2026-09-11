package skills

import (
	"errors"
	"fmt"
	"io/fs"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
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
//
// fr resolves the authored targetFactions allowlist (plan-faction-flips D8) and
// may be nil only where no skill authors one — production always passes the
// loaded registry, which is why boot now loads factions FIRST.
func RegistryFromFS(fileSystem fs.FS, fr factions.Registry) (Registry, error) {
	r := &registry{
		byID:   make(map[SkillID]*SkillDefinition),
		byName: make(map[string]*SkillDefinition),
	}

	// ⭐ ONE FINDING PER FILE, not one per walk (spell builder C2, PO ruling
	// 2026-09-11). A broken file is recorded and the walk CONTINUES, so an
	// author fixing a typo learns about every other broken file in the same
	// run rather than one per run. A file that failed is never inserted, so the
	// duplicate-id and duplicate-name checks below still see a consistent
	// registry and cannot invent a second finding out of the first one.
	var problems []error
	err := fs.WalkDir(fileSystem, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			problems = append(problems, fmt.Errorf("cannot read %q: %w", path, err))
			return nil
		}
		if d.IsDir() || !strings.HasSuffix(path, ".json") {
			return nil
		}

		data, err := fs.ReadFile(fileSystem, path)
		if err != nil {
			problems = append(problems, fmt.Errorf("cannot read %q: %w", path, err))
			return nil
		}

		raw, err := parseSkillDefinition(data)
		if err != nil {
			problems = append(problems, fmt.Errorf("cannot parse %q: %w", path, err))
			return nil
		}

		def, err := raw.mapToSkillDefinition(fr)
		if err != nil {
			problems = append(problems, fmt.Errorf("cannot map %q: %w", path, err))
			return nil
		}

		if existing, ok := r.byID[def.ID]; ok {
			problems = append(problems, fmt.Errorf("duplicate skill ID %d: %q and %q", def.ID, existing.Name, def.Name))
			return nil
		}
		if existing, ok := r.byName[def.Name]; ok {
			problems = append(problems, fmt.Errorf("duplicate skill name %q: IDs %d and %d", def.Name, existing.ID, def.ID))
			return nil
		}

		r.byID[def.ID] = def
		r.byName[def.Name] = def
		return nil
	})
	if err != nil {
		return nil, err
	}
	// errors.Join of a single error prints exactly that error, so every caller
	// that only ever sees one broken file reads the same message as before.
	if joined := errors.Join(problems...); joined != nil {
		return nil, joined
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
