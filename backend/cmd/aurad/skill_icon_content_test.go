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

// Every authored PLAYER skill carries an icon (UI pass C4, ruling D1): all 78
// definitions in api/skills, cheat rigs and prototypes included, so no surface
// can ever render a blank token. A new skill without one fails HERE rather than
// at boot - a missing glyph is a content gap, not a reason to refuse to start.
//
// ⚑ Scoped to the TOP LEVEL of api/skills on purpose. api/skills/mobs holds the
// mob-embedded skills, which author no icon by the same ruling: they are in the
// 116-entry catalog but never appear in a spellbook. Walking the loaded registry
// instead of the directory would fail by construction.
//
// ⚑ This reads the repo's api/ tree, not the embedded copy. Content edits do not
// invalidate the Go test cache - run with `-count=1` after touching any JSON.
const skillContentDir = "../../../api/skills"

// The game-icons.net path shape the client's vendored set is keyed by:
// "author/name", both lowercase-with-hyphens. A typo'd shape would sail past a
// non-empty check and only surface as a letter fallback in-game.
var iconPathPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$`)

// The optional `packIcon` names an entry of the icon-pack manifest
// (frontend/src/client-data/icons/pack-manifest.json, README "Icons (PONETI
// pack)"): lowercase, digits, hyphens, the manifest's own NAME_RE. Membership is
// pinned by PackIcons.test.ts, where the manifest lives; only the shape is
// checked here, so a typo cannot hide behind the glyph fallback.
var packIconNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

type skillIconFields struct {
	Name     string `json:"name"`
	Icon     string `json:"icon"`
	PackIcon string `json:"packIcon"`
}

func skillIconValues(t *testing.T, dir string) map[string]skillIconFields {
	t.Helper()
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)

	icons := make(map[string]skillIconFields)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		require.NoError(t, err)
		var def skillIconFields
		require.NoError(t, json.Unmarshal(raw, &def), entry.Name())
		icons[entry.Name()] = def
	}
	require.NotEmpty(t, icons, "no skill definitions found in %s", dir)
	return icons
}

func TestSkillContent_EveryDefinitionAuthorsAnIcon(t *testing.T) {
	for file, def := range skillIconValues(t, skillContentDir) {
		assert.NotEmpty(t, def.Icon, "%s authors no `icon` (UI pass C4 D1: every api/skills definition needs one)", file)
		if def.Icon != "" {
			assert.Regexp(t, iconPathPattern, def.Icon,
				"%s: icon must be a game-icons.net \"author/name\" path (the pack icon goes in `packIcon`)", file)
		}
		if def.PackIcon != "" {
			assert.Regexp(t, packIconNamePattern, def.PackIcon,
				"%s: packIcon must be a pack-manifest name (lowercase, digits, hyphens)", file)
		}
	}
}

// The mob-embedded half of the ruling, asserted rather than assumed: those
// definitions deliberately have no icon of either kind, and one appearing there
// would mean the vocabulary had started leaking into content that never renders
// a row.
func TestSkillContent_MobEmbeddedSkillsAuthorNoIcon(t *testing.T) {
	for file, def := range skillIconValues(t, filepath.Join(skillContentDir, "mobs")) {
		assert.Empty(t, def.Icon, "mobs/%s authors an icon; mob-embedded skills render no row (D1)", file)
		assert.Empty(t, def.PackIcon, "mobs/%s authors a packIcon; mob-embedded skills render no row (D1)", file)
	}
}
