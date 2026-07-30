package quests

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// fakeMobs is the minimal mobs.Registry the quest loader resolves species
// names against.
type fakeMobs struct {
	mobs.Registry
	byName map[string]mobs.MobID
	legacy map[string]bool
}

func (f *fakeMobs) GetByName(name string) (*mobs.MobDefinition, error) {
	id, ok := f.byName[name]
	if !ok {
		return nil, assert.AnError
	}
	return &mobs.MobDefinition{ID: id, Name: name, Legacy: f.legacy[name]}, nil
}

func testMobs() *fakeMobs {
	return &fakeMobs{
		byName: map[string]mobs.MobID{"Wolf": 3, "Bramble": 7, "Farmer": 40, "Rabbit": 61, "TownCrier": 62},
		// 10 defs are legacy: true — proving-grounds content the live world never
		// spawns (L12).
		legacy: map[string]bool{"Rabbit": true},
	}
}

func loadOne(t *testing.T, quest string) Registry {
	t.Helper()
	r, err := RegistryFromFS(fstest.MapFS{"q.json": &fstest.MapFile{Data: []byte(quest)}}, testMobs())
	require.NoError(t, err)
	return r
}

const wolfCull = `{
	"_comment": "fixture",
	"id": "wolf-cull",
	"title": "The Wolf Cull",
	"stages": [
		{"id": "cull", "journal": "Kill wolves.", "objectives": [{"kind": "kill", "species": "Wolf", "count": 3}], "next": "report"},
		{"id": "report", "journal": "Report back."}
	]
}`

func TestLoad_ResolvesSpeciesToMobID(t *testing.T) {
	r := loadOne(t, wolfCull)

	q, err := r.Get("wolf-cull")
	require.NoError(t, err)
	assert.Equal(t, "The Wolf Cull", q.Title)
	assert.False(t, q.Repeatable, "repeatable defaults to false when unauthored (D6)")
	require.Len(t, q.Stages, 2)
	require.Len(t, q.Stages[0].Objectives, 1)
	assert.Equal(t, ObjectiveKill, q.Stages[0].Objectives[0].Kind)
	assert.Equal(t, mobs.MobID(3), q.Stages[0].Objectives[0].Target)
	assert.Equal(t, uint64(3), q.Stages[0].Objectives[0].Count)
}

// D6: the repeatable flag is schema room — it must round-trip when authored,
// default false when not (the unauthored half is asserted above).
func TestLoad_RepeatableRoundTrips(t *testing.T) {
	r := loadOne(t, `{"id": "q", "title": "Q", "repeatable": true, "stages": [{"id": "s", "journal": "j"}]}`)
	q, err := r.Get("q")
	require.NoError(t, err)
	assert.True(t, q.Repeatable)
}

func TestLoad_TalkToResolvesNPC(t *testing.T) {
	r := loadOne(t, `{"id": "q", "title": "Q", "stages": [
		{"id": "s", "journal": "j", "objectives": [{"kind": "talk_to", "npc": "Farmer"}], "next": "t"},
		{"id": "t", "journal": "done"}
	]}`)
	q, err := r.Get("q")
	require.NoError(t, err)
	o := q.Stages[0].Objectives[0]
	assert.Equal(t, ObjectiveTalkTo, o.Kind)
	assert.Equal(t, mobs.MobID(40), o.Target)
	assert.Equal(t, uint64(1), o.Count, "talk_to defaults to count 1")
}

// Q2: the objective line's display name is resolved at LOAD, through the one
// display-name path (§35 C3: skills.DeriveDisplayName, the same rule /mobs
// serves) — composition never touches the mob registry at runtime.
func TestLoad_ObjectiveTargetDisplayName(t *testing.T) {
	r := loadOne(t, `{"id": "q", "title": "Q", "stages": [
		{"id": "s", "journal": "j", "objectives": [{"kind": "talk_to", "npc": "TownCrier"}], "next": "t"},
		{"id": "t", "journal": "done"}
	]}`)
	q, err := r.Get("q")
	require.NoError(t, err)
	assert.Equal(t, "Town Crier", q.Stages[0].Objectives[0].TargetName)
}

// Q2: the authored tracker override rides any stage — an objective stage to
// fix wording the deriver gets wrong, a dialogue stage because it has nothing
// derivable at all.
func TestLoad_TrackerRoundTrips(t *testing.T) {
	r := loadOne(t, `{"id": "q", "title": "Q", "stages": [
		{"id": "s", "journal": "j", "tracker": "Wolves thinned: {n}/{m}", "objectives": [{"kind": "kill", "species": "Wolf", "count": 3}], "next": "t"},
		{"id": "t", "journal": "done", "tracker": "Report back to nobody in particular."}
	]}`)
	q, err := r.Get("q")
	require.NoError(t, err)
	assert.Equal(t, "Wolves thinned: {n}/{m}", q.Stages[0].Tracker)
	assert.Equal(t, "Report back to nobody in particular.", q.Stages[1].Tracker)
}

func loadErr(t *testing.T, quest string) error {
	t.Helper()
	_, err := RegistryFromFS(fstest.MapFS{"q.json": &fstest.MapFile{Data: []byte(quest)}}, testMobs())
	require.Error(t, err)
	return err
}

func TestLoad_Rejections(t *testing.T) {
	cases := map[string]string{
		"unknown key hard-fails": `{"id": "q", "title": "Q", "reward": 5, "stages": [{"id": "s", "journal": "j"}]}`,
		"missing id":             `{"title": "Q", "stages": [{"id": "s", "journal": "j"}]}`,
		"missing title":          `{"id": "q", "stages": [{"id": "s", "journal": "j"}]}`,
		"no stages":              `{"id": "q", "title": "Q", "stages": []}`,
		"missing journal":        `{"id": "q", "title": "Q", "stages": [{"id": "s"}]}`,
		"duplicate stage id": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "a"}, {"id": "s", "journal": "b"}]}`,
		"unknown species": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [{"kind": "kill", "species": "Ghost", "count": 1}], "next": "t"},
			{"id": "t", "journal": "done"}]}`,
		"unknown objective kind": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [{"kind": "fetch", "species": "Wolf", "count": 1}], "next": "t"},
			{"id": "t", "journal": "done"}]}`,
		"kill without species": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [{"kind": "kill", "count": 1}], "next": "t"},
			{"id": "t", "journal": "done"}]}`,
		"talk_to without npc": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [{"kind": "talk_to"}], "next": "t"},
			{"id": "t", "journal": "done"}]}`,
		"objectives without next": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [{"kind": "kill", "species": "Wolf", "count": 1}]}]}`,
		"next without objectives": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "next": "t"}, {"id": "t", "journal": "done"}]}`,
		"dangling next": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [{"kind": "kill", "species": "Wolf", "count": 1}], "next": "nowhere"}]}`,
		"next to self": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [{"kind": "kill", "species": "Wolf", "count": 1}], "next": "s"}]}`,
		// L12: 10 defs are legacy: true — proving-grounds content the live world
		// never spawns. `kill Rabbit` would boot green and be uncompletable.
		"legacy species as a kill target": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [{"kind": "kill", "species": "Rabbit", "count": 1}], "next": "t"},
			{"id": "t", "journal": "done"}]}`,
		"legacy npc as a talk_to target": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [{"kind": "talk_to", "npc": "Rabbit"}], "next": "t"},
			{"id": "t", "journal": "done"}]}`,
		// Q2: {n}/{m} substitute from a countable (kill/harvest) objective; on a
		// stage without one they would render literally forever.
		"count placeholder on a dialogue stage": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "tracker": "Kill {n} of {m} things"}]}`,
		"count placeholder on a talk_to-only stage": `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "tracker": "{n}/{m} met", "objectives": [{"kind": "talk_to", "npc": "Farmer"}], "next": "t"},
			{"id": "t", "journal": "done"}]}`,
	}
	for name, quest := range cases {
		t.Run(name, func(t *testing.T) { loadErr(t, quest) })
	}
}

// An objective-stage cycle would make the retroactive accept cascade loop
// forever once the counters satisfy every stage on it.
func TestLoad_ObjectiveChainCycleRejected(t *testing.T) {
	loadErr(t, `{"id": "q", "title": "Q", "stages": [
		{"id": "a", "journal": "j", "objectives": [{"kind": "kill", "species": "Wolf", "count": 1}], "next": "b"},
		{"id": "b", "journal": "j", "objectives": [{"kind": "kill", "species": "Wolf", "count": 2}], "next": "a"}]}`)
}

func TestLoad_DuplicateQuestIDAcrossFilesRejected(t *testing.T) {
	fsys := fstest.MapFS{
		"a.json": &fstest.MapFile{Data: []byte(`{"id": "q", "title": "A", "stages": [{"id": "s", "journal": "j"}]}`)},
		"b.json": &fstest.MapFile{Data: []byte(`{"id": "q", "title": "B", "stages": [{"id": "s", "journal": "j"}]}`)},
	}
	_, err := RegistryFromFS(fsys, testMobs())
	require.Error(t, err)
}

// The api/quests directory ships a README until C4 authors content; anything
// that is not a .json file is skipped, not parsed.
func TestLoad_NonJSONFilesSkipped(t *testing.T) {
	fsys := fstest.MapFS{
		"README.md": &fstest.MapFile{Data: []byte("# quests")},
		"q.json":    &fstest.MapFile{Data: []byte(wolfCull)},
	}
	r, err := RegistryFromFS(fsys, testMobs())
	require.NoError(t, err)
	assert.Len(t, r.All(), 1)
}

func TestRegistry_AllSortedByID(t *testing.T) {
	fsys := fstest.MapFS{
		"b.json": &fstest.MapFile{Data: []byte(`{"id": "zeta", "title": "Z", "stages": [{"id": "s", "journal": "j"}]}`)},
		"a.json": &fstest.MapFile{Data: []byte(`{"id": "alpha", "title": "A", "stages": [{"id": "s", "journal": "j"}]}`)},
	}
	r, err := RegistryFromFS(fsys, testMobs())
	require.NoError(t, err)
	all := r.All()
	require.Len(t, all, 2)
	assert.Equal(t, "alpha", all[0].ID)
	assert.Equal(t, "zeta", all[1].ID)
}
