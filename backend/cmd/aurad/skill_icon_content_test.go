package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Every authored PLAYER skill carries an icon (UI pass C4, ruling D1): all 72
// definitions in api/skills, cheat rigs and prototypes included, so no surface
// can ever render a blank token. A new skill without one fails HERE rather than
// at boot - a missing glyph is a content gap, not a reason to refuse to start.
//
// ⚑ Scoped to the TOP LEVEL of api/skills on purpose. api/skills/mobs holds the
// mob-embedded skills, which author no icon by the same ruling: they are in the
// 105-entry catalog but never appear in a spellbook. Walking the loaded registry
// instead of the directory would fail by construction.
//
// ⚑ This reads the repo's api/ tree, not the embedded copy. Content edits do not
// invalidate the Go test cache - run with `-count=1` after touching any JSON.
const skillContentDir = "../../../api/skills"

// The game-icons.net path shape the client's vendored set is keyed by:
// "author/name", both lowercase-with-hyphens. A typo'd shape would sail past a
// non-empty check and only surface as a letter fallback in-game.
var iconPathPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$`)

func skillIconValues(t *testing.T) map[string]string {
	t.Helper()
	entries, err := os.ReadDir(skillContentDir)
	require.NoError(t, err)

	icons := make(map[string]string)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(skillContentDir, entry.Name()))
		require.NoError(t, err)
		var def struct {
			Name string `json:"name"`
			Icon string `json:"icon"`
		}
		require.NoError(t, json.Unmarshal(raw, &def), entry.Name())
		icons[entry.Name()] = def.Icon
	}
	require.NotEmpty(t, icons, "no skill definitions found in %s", skillContentDir)
	return icons
}

func TestSkillContent_EveryDefinitionAuthorsAnIcon(t *testing.T) {
	for file, icon := range skillIconValues(t) {
		assert.NotEmpty(t, icon, "%s authors no `icon` (UI pass C4 D1: every api/skills definition needs one)", file)
		if icon != "" {
			assert.Regexp(t, iconPathPattern, icon,
				"%s: icon must be a game-icons.net \"author/name\" path", file)
		}
	}
}

// The mob-embedded half of the ruling, asserted rather than assumed: those
// definitions deliberately have no icon, and one appearing there would mean the
// vocabulary had started leaking into content that never renders a row.
func TestSkillContent_MobEmbeddedSkillsAuthorNoIcon(t *testing.T) {
	entries, err := os.ReadDir(filepath.Join(skillContentDir, "mobs"))
	require.NoError(t, err)

	seen := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(skillContentDir, "mobs", entry.Name()))
		require.NoError(t, err)
		var def struct {
			Icon string `json:"icon"`
		}
		require.NoError(t, json.Unmarshal(raw, &def), entry.Name())
		assert.Empty(t, def.Icon, "mobs/%s authors an icon; mob-embedded skills render no row (D1)", entry.Name())
		seen++
	}
	require.NotZero(t, seen)
}
