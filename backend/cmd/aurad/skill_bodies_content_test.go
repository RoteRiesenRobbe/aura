package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The `skill bodies` stage (plan-skill-vfx.md §12f.4 E): an authored
// `visual.layers[i].body` must name a PNG the art folder actually carries.
//
// ⚑ Until C3a there was no list to check against, so a typo'd body loaded
// clean and drew the kind's procedural placeholder forever - exactly the
// silent class this project keeps paying for. The check cannot live in the
// skills package (it stays ignorant of the art folder, and
// mapToSkillDefinition has no warning channel), so it is a loadContent stage
// like every other cross-registry rule.
//
// ⚑ These read the repo's api/ tree. Content edits do not invalidate the Go
// test cache - run with `-count=1` after touching any JSON.

// ⭐ THE DRIFT PIN (plan-skill-vfx.md §12f.4 C). The PNG folder is the source
// of truth and api/skill-fx/bodies.json is Go's copy of it, so the two can
// disagree in two ways and both are silent in-game: a PNG nobody listed is a
// body the validator refuses although the art is right there, and a listed
// name with no PNG validates clean and draws the placeholder forever.
//
// ⚑ It compares BOTH directions for exactly that reason, and it reads the
// repo tree rather than the embedded copy - the list is generated, and the
// generator is the only thing allowed to write it.
//
// The shared_constants_test.go pattern: a repo-relative path out of
// backend/cmd/aurad/, which is three levels down.
func TestSkillFxBodies_MatchTheArtFolder(t *testing.T) {
	const artFolder = "../../../frontend/src/features/skill-fx/assets/bodies"

	entries, err := os.ReadDir(artFolder)
	require.NoError(t, err)
	var drawn []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".png") {
			continue
		}
		// The stem VERBATIM: the reserved frame naming (`foo_0.png`) lists as
		// `foo_0`, because grouping frames is the engine's job when it learns
		// to play them, never the manifest's.
		drawn = append(drawn, strings.TrimSuffix(e.Name(), ".png"))
	}
	require.NotEmpty(t, drawn, "no pilot bodies in %s - run `node tools/make-skill-fx-pilot.mjs`", artFolder)

	raw, err := os.ReadFile("../../../api/skill-fx/bodies.json")
	require.NoError(t, err)
	var list struct {
		Bodies []string `json:"bodies"`
	}
	require.NoError(t, json.Unmarshal(raw, &list))

	assert.ElementsMatch(t, drawn, list.Bodies,
		"api/skill-fx/bodies.json and the PNG folder disagree - re-run `node tools/make-skill-fx-manifest.mjs`")
	assert.True(t, sort.StringsAreSorted(list.Bodies), "the generated list must stay sorted")
}

// setSkillBody rewrites one skill file's first visual layer body in a temp
// copy of the content tree. It edits the RAW json rather than round-tripping
// through the loader's types, so the fixture cannot quietly acquire whatever
// the marshaller thinks the file should look like.
func setSkillBody(t *testing.T, file string, body string) {
	t.Helper()
	raw, err := os.ReadFile(file)
	require.NoError(t, err)

	var doc map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &doc))
	var visual struct {
		Layers []map[string]any `json:"layers"`
	}
	require.NoError(t, json.Unmarshal(doc["visual"], &visual))
	require.NotEmpty(t, visual.Layers, "%s authors no visual layers to patch", file)

	if body == "" {
		delete(visual.Layers[0], "body")
	} else {
		visual.Layers[0]["body"] = body
	}
	patched, err := json.Marshal(visual)
	require.NoError(t, err)
	doc["visual"] = patched

	out, err := json.Marshal(doc)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(file, out, 0o644))
}

// ⭐ The finding names the SKILL, the LAYER INDEX and the BODY. All three are
// needed to act on it: a skill may author several layers, and the name in the
// file is the only thing the author can search for.
func TestRunValidate_UnknownBodyIsAFinding(t *testing.T) {
	dir := copyRealContent(t)
	setSkillBody(t, filepath.Join(dir, "skills", "damage.json"), "sworrd")

	out, code := validateDir(t, dir)
	assert.Equal(t, validateExitFindings, code, out)
	assert.Contains(t, out, "skill bodies: ")
	assert.Contains(t, out, `"Damage"`)
	assert.Contains(t, out, "layer 0")
	assert.Contains(t, out, `"sworrd"`)
}

// A body the folder carries is clean - the pilot bodies are authored on three
// shipped skills, so the real tree exercises this path and not only the
// fixture.
func TestRunValidate_KnownBodyIsClean(t *testing.T) {
	dir := copyRealContent(t)
	setSkillBody(t, filepath.Join(dir, "skills", "heal.json"), "sword")

	out, code := validateDir(t, dir)
	assert.Equal(t, validateExitClean, code, out)
}

// An ABSENT body is clean and must stay clean: a body is optional, and a layer
// without one draws the kind's procedural placeholder, which is what 101 of
// the 105 shipped layers do (re-derived after the C3a amendment, §12g: 42
// authored `impact` layers were deleted and 18 attacks authored, and the two
// wolf bites took `wolf-jaw` with them).
func TestRunValidate_AbsentBodyIsClean(t *testing.T) {
	dir := copyRealContent(t)
	setSkillBody(t, filepath.Join(dir, "skills", "damage.json"), "")

	out, code := validateDir(t, dir)
	assert.Equal(t, validateExitClean, code, out)
	assert.NotContains(t, out, "skill bodies")
}

// The stage's inputs are the skill registry AND the list, so each missing one
// gets its own finding rather than a silent pass: a stage that did not run
// reads exactly like a stage that passed.
func TestRunValidate_SkillBodiesSkipWhenSkillsDidNotLoad(t *testing.T) {
	dir := copyRealContent(t)
	breakSkillWithUnknownKey(t, filepath.Join(dir, "skills", "aegis.json"))

	out, code := validateDir(t, dir)
	assert.Equal(t, validateExitFindings, code)
	assert.Contains(t, out, "skill bodies: skipped (skills did not load)")
}

func TestRunValidate_MissingBodiesListIsAFinding(t *testing.T) {
	dir := copyRealContent(t)
	require.NoError(t, os.Remove(filepath.Join(dir, "skill-fx", "bodies.json")))

	out, code := validateDir(t, dir)
	assert.Equal(t, validateExitFindings, code)
	assert.Contains(t, out, "skill bodies: ")
	assert.Contains(t, out, "bodies.json")
	assert.Contains(t, out, "make-skill-fx-manifest")
}

// ⭐ BOTH content paths, because they are two different copies of the file.
// The embedded one is honest only after `make -C backend build` (which runs
// cp-defs) - the portal-spells lesson.
func TestSkillBodies_BothContentPathsAreClean(t *testing.T) {
	config := mustDefaultConfig(t)
	disk, err := diskContent("../../../api")
	require.NoError(t, err)

	for name, src := range map[string]contentSources{"embedded": embeddedContent(), "disk": disk} {
		var out bytes.Buffer
		runValidate(&out, src, config, config.Game.StartZone)
		for _, line := range strings.Split(out.String(), "\n") {
			assert.False(t, strings.HasPrefix(line, "skill bodies"),
				"%s content: %s (embedded goes stale without `make -C backend build`)", name, line)
		}
	}
}
