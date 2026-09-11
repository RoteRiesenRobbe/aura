package main

import (
	"bytes"
	"encoding/json"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
)

// contentSubdirs is the api/ layout diskContent insists on. The copy helper
// below reproduces exactly these, never api/schema/ or the loose fixture jsons
// beside them, which is the same set the editor's seam copies.
var contentSubdirs = []string{"mobs", "skills", "recipes", "zones", "props", "factions", "milestones", "quests", "ascension"}

// ⭐ THE REAL CONTENT MUST VALIDATE CLEAN. This is the pin that makes
// `aurad -validate` worth running at all: if it reported findings against the
// repo as shipped, every real finding would be noise nobody reads.
func TestRunValidate_RealApiIsClean(t *testing.T) {
	src, err := diskContent("../../../api")
	require.NoError(t, err)
	config := mustDefaultConfig(t)

	var out bytes.Buffer
	code := runValidate(&out, src, config, resolveZoneList("", "", config))
	assert.Equal(t, validateExitClean, code, "api/ must validate clean:\n%s", out.String())
	assert.Equal(t, "0 finding(s)\n", out.String())
}

// One broken skill file: exit 1, and the finding NAMES THE FILE. Naming it is
// the whole product here - the content editor shows these lines verbatim to
// whoever pressed Save.
func TestRunValidate_OneBrokenSkillIsNamedAndFails(t *testing.T) {
	dir := copyRealContent(t)
	breakSkillWithUnknownKey(t, filepath.Join(dir, "skills", "aegis.json"))

	out, code := validateDir(t, dir)
	assert.Equal(t, validateExitFindings, code)
	assert.Contains(t, out, "aegis.json")
	assert.Contains(t, out, "skills: ")
}

// ⭐ TWO broken skill files, BOTH named in one run (PO ruling 2026-09-11,
// per-file for skills). The walker used to stop at the first, so an author
// fixing one typo learned about the next one only on the next save.
func TestRunValidate_EveryBrokenSkillFileIsNamed(t *testing.T) {
	dir := copyRealContent(t)
	breakSkillWithUnknownKey(t, filepath.Join(dir, "skills", "aegis.json"))
	breakSkillWithUnknownKey(t, filepath.Join(dir, "skills", "antivenom.json"))

	out, code := validateDir(t, dir)
	assert.Equal(t, validateExitFindings, code)
	assert.Contains(t, out, "aegis.json")
	assert.Contains(t, out, "antivenom.json")
}

// ⭐ Two INDEPENDENT stages, both broken, both reported: skills and props share
// no inputs, so a run that stopped at the first failed stage would hide the
// prop. And every stage that could not run because of them says so by name,
// because a stage that silently did not run reads exactly like a stage that
// passed.
func TestRunValidate_IndependentStagesBothReportAndDependentsSkip(t *testing.T) {
	dir := copyRealContent(t)
	breakSkillWithUnknownKey(t, filepath.Join(dir, "skills", "aegis.json"))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "props", "rock.json"), []byte("{not json"), 0o644))

	out, code := validateDir(t, dir)
	assert.Equal(t, validateExitFindings, code)
	assert.Contains(t, out, "aegis.json")
	assert.Contains(t, out, "props: ")
	assert.Contains(t, out, "rock.json")

	// The dependent stages, each naming what it waited for.
	assert.Contains(t, out, "mobs: skipped (skills did not load)")
	assert.Contains(t, out, "milestones: skipped (skills did not load)")
	assert.Contains(t, out, "recipes: skipped (skills did not load)")
	assert.Contains(t, out, "quests: skipped (mobs did not load)")
	assert.Contains(t, out, "ascension: skipped (skills + mobs + quests did not load)")
	assert.Contains(t, out, "zones: skipped (mobs + props did not load)")
}

// A content directory that is not there is a finding about the content, not a
// broken validator: same exit code an unloadable file gets.
func TestValidateMain_MissingContentDirIsAFinding(t *testing.T) {
	var out bytes.Buffer
	code := validateMain(&out, filepath.Join(t.TempDir(), "nope"), "", "")
	assert.Equal(t, validateExitFindings, code)
	assert.Contains(t, out.String(), "content: ")
}

// ⭐ -validate MUST NOT WRITE A CONF (PO ruling 2026-09-11). The boot path falls
// back to setupDefaultConfig, which writes ./conf.json to disk; validate parses
// the same embedded bytes in memory instead. Without this pin someone later
// "simplifies" validateConf back to loadConf and every validation run starts
// leaving a conf.json in whatever directory it was invoked from - including the
// temp directory the editor's seam validates in.
func TestValidateConf_ReadsTheEmbeddedDefaultWithoutWritingIt(t *testing.T) {
	dir := t.TempDir()
	absent := filepath.Join(dir, "conf.json")
	t.Setenv("AURAD_CONF", absent)

	config, err := validateConf()
	require.NoError(t, err)
	require.NotNil(t, config)

	_, statErr := os.Stat(absent)
	assert.True(t, os.IsNotExist(statErr), "validate must not create %s", absent)
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	assert.Empty(t, entries, "validate must leave no file behind")
}

// The in-memory parse and the on-disk read are the same function underneath,
// and this is what says so: the embedded default parsed by ParseConfig must
// resolve identically to the same bytes read off a file by ReadConfig,
// defaults and all. If they ever diverge, validate measures a different world
// from the one that boots.
func TestParseConfig_MatchesReadConfigOnTheSameBytes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "conf.json")
	require.NoError(t, os.WriteFile(path, defaultConfig, 0o644))

	fromFile, err := cfg.ReadConfig(path)
	require.NoError(t, err)
	inMemory, err := cfg.ParseConfig(defaultConfig, "embedded conf.default.json")
	require.NoError(t, err)

	assert.Equal(t, fromFile, inMemory)
}

// validateDir runs the validator over a copied content tree and returns stdout
// plus the exit code. It goes through runValidate rather than the binary: the
// binary's own no-database exit is proved by hand (the chunk's verify tail),
// and a test that spawned a process would need one built first.
func validateDir(t *testing.T, dir string) (string, int) {
	t.Helper()
	src, err := diskContent(dir)
	require.NoError(t, err)
	config := mustDefaultConfig(t)
	var out bytes.Buffer
	code := runValidate(&out, src, config, resolveZoneList("", "", config))
	return out.String(), code
}

func mustDefaultConfig(t *testing.T) *cfg.Config {
	t.Helper()
	config, err := cfg.ParseConfig(defaultConfig, "embedded conf.default.json")
	require.NoError(t, err)
	return config
}

// copyRealContent copies api/'s nine content directories into a temp tree the
// test may vandalise.
//
// ⚑ It copies EVERY file, not only *.json: diskContent stats each of the nine
// subdirectories, so one that ended up with no files would fail the stat and
// the test would be measuring a missing directory instead of the file it broke.
func copyRealContent(t *testing.T) string {
	t.Helper()
	dst := t.TempDir()
	for _, name := range contentSubdirs {
		copyDir(t, filepath.Join("../../../api", name), filepath.Join(dst, name))
	}
	return dst
}

func copyDir(t *testing.T, from, to string) {
	t.Helper()
	require.NoError(t, filepath.WalkDir(from, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(from, path)
		if err != nil {
			return err
		}
		target := filepath.Join(to, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.Create(target)
		if err != nil {
			return err
		}
		defer out.Close()
		_, err = io.Copy(out, in)
		return err
	}))
}

// breakSkillWithUnknownKey adds a key no effect type allows, keeping the id and
// the name so nothing else in the tree loses its reference. This is the exact
// mistake the spell builder exists to catch: a hand-typed effect key that the
// loader refuses and that nothing else in the repo would notice.
func breakSkillWithUnknownKey(t *testing.T, path string) {
	t.Helper()
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	var raw map[string]any
	require.NoError(t, json.Unmarshal(data, &raw))
	effects, ok := raw["effects"].([]any)
	require.True(t, ok, "%s has no effects array", path)
	require.NotEmpty(t, effects)
	first, ok := effects[0].(map[string]any)
	require.True(t, ok)
	first["noSuchKeyAtAll"] = true
	out, err := json.MarshalIndent(raw, "", "  ")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(path, out, 0o644))
	require.True(t, strings.HasSuffix(path, ".json"))
}
