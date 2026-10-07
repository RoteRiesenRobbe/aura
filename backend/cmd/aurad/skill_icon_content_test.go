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
// mob-embedded skills, which never appear in a spellbook; their own, narrower
// rule is the second test below. Walking the loaded registry instead of the
// directory would fail by construction.
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

// The mob-embedded half, amended by plan-buff-tray.md C0 (2026-10-03): a mob
// skill never renders a spellbook row, but since the buff tray its timed
// effects draw as circles on the PLAYER, keyed by the skill's icon. So every
// mob skill carrying an effect type that lands a timed effect on another entity
// authors an icon (and a well-formed one), and the rest stay bare: a bare one
// on the tray would draw a letter fallback nobody notices.
//
// ⚑ The list is the effect types whose payload the buff store holds AND that
// are applied to a target rather than the caster itself (a self tick_rate or
// speed_burst never reaches a player's tray). Grow it with the vocabulary.
var mobTimedEffectTypes = map[string]bool{
	"dot_aura": true, "instant_dot": true,
	"slow_aura": true, "instant_slow": true,
	"shield_aura": true, "instant_shield": true,
	"hot_aura": true, "instant_hot": true,
	"resist_aura": true, "instant_resist": true,
	"speed_aura": true, "calm": true, "charm": true, "stun": true, "retaliate_slow": true,
	"stat_aura": true, "instant_stat": true,
}

type skillEffectTypes struct {
	Effects []struct {
		Type string `json:"type"`
	} `json:"effects"`
}

func TestSkillContent_MobSkillsThatLandATimedEffectAuthorAnIcon(t *testing.T) {
	dir := filepath.Join(skillContentDir, "mobs")
	for file, def := range skillIconValues(t, dir) {
		raw, err := os.ReadFile(filepath.Join(dir, file))
		require.NoError(t, err)
		var effects skillEffectTypes
		require.NoError(t, json.Unmarshal(raw, &effects), file)
		landsTimed := false
		for _, e := range effects.Effects {
			landsTimed = landsTimed || mobTimedEffectTypes[e.Type]
		}
		if landsTimed {
			assert.NotEmpty(t, def.Icon, "mobs/%s lands a timed effect on a player and authors no `icon` (plan-buff-tray.md C0: the tray draws it)", file)
		}
		if def.Icon != "" {
			assert.Regexp(t, iconPathPattern, def.Icon,
				"mobs/%s: icon must be a game-icons.net \"author/name\" path (the pack icon goes in `packIcon`)", file)
		}
		if def.PackIcon != "" {
			assert.Regexp(t, packIconNamePattern, def.PackIcon,
				"mobs/%s: packIcon must be a pack-manifest name (lowercase, digits, hyphens)", file)
		}
	}
}
