package skills

import (
	"io/fs"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/be"
)

// TestEmbeddedSkillsIncludeSubdirectories pins the embed pattern: the mob aura
// skills live in the mobs/ subdirectory, and a bare *.json pattern silently
// drops them — the running server then fails at startup while resolving mob
// skill loadouts, even though every disk-based test stays green.
func TestEmbeddedSkillsIncludeSubdirectories(t *testing.T) {
	topLevel, err := fs.ReadDir(Skills, ".")
	be.NoError(t, err)
	be.True(t, len(topLevel) > 0)

	mobSkills, err := fs.ReadDir(Skills, "mobs")
	be.NoError(t, err)
	be.True(t, len(mobSkills) >= 4)
}
