package mobs

// Content pin for the merged NPCs (plan-entity-model.md chunk 3a).
//
// This is the "zero behaviour change" proof. The teaching order and the level
// gates below are transcribed from api/zones/world.json's `npcs` section as it
// stood at HEAD 052244d5, immediately before the migration deleted it — so if
// a grant, a level or an ordering moved during the move from zone entry to mob
// definition, this test says so and the git history says what it used to be.
//
// It is a pin, not a rule: authoring a fifteenth NPC means adding a line here.

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	amobs "github.com/RoteRiesenRobbe/aura/pkg/api/mobs"
)

// grant is one expected teaching: skill name and the level it unlocks at.
type grant struct {
	skill string
	level uint32
}

// The pre-migration payload of all 14 world NPCs, in authored order.
var expectedNpcTeachings = map[string][]grant{
	"Farmer":            {{"Harvest", 1}},
	"Hermit":            {{"FirstAid", 2}, {"Heal", 3}},
	"Lamplighter":       {{"Torch", 0}},
	"Dog":               {{"SummonCompanion", 0}},
	"Miner":             {{"Pickaxe", 4}},
	"CityGuard":         {{"Strong", 3}},
	"VillageHealer":     {{"FirstAid", 2}, {"Revive", 8}},
	"FrontCaptain":      {{"Vanguard", 15}},
	"Shaman":            {{"Recover", 4}, {"SummonTotem", 5}},
	"Wanderer":          {{"Recall", 3}},
	"LamplessTraveller": nil, // pure flavour, and that is a first-class case
	"TownCrier":         {{"Damage", 1}, {"Recall", 3}},
	"ForestSign":        nil, // a sign-post: lore only
	"Emberkeeper":       {{"Torch", 1}, {"Ignite", 7}, {"Immolate", 12}},
}

func conversants(t *testing.T) map[string]*MobDefinition {
	t.Helper()
	found := map[string]*MobDefinition{}
	for _, def := range contentRegistry(t).Mobs() {
		if def.Interaction != nil {
			found[def.Name] = def
		}
	}
	return found
}

func TestContent_ConversantCensus(t *testing.T) {
	found := conversants(t)

	names := make([]string, 0, len(found))
	for name := range found {
		names = append(names, name)
	}
	want := make([]string, 0, len(expectedNpcTeachings))
	for name := range expectedNpcTeachings {
		want = append(want, name)
	}
	assert.ElementsMatch(t, want, names, "exactly the merged NPCs carry an interaction")
}

// The teaching payload survived BOTH moves intact: zone entry → mob definition
// (3a), and one flat multi-grant option → a browsable tree (3b-ii). Same skills,
// same order, same level gates.
//
// ⚑ 3a's version asserted a single node, because that was all anyone authored.
// 3b-ii authors real trees for three NPCs, so this walks every node — but the
// EXPECTATION is unchanged, which is the whole point: rearranging a conversation
// must not quietly change what it hands out.
func TestContent_TeachingOrderMatchesPreMigrationZone(t *testing.T) {
	found := conversants(t)

	for name, want := range expectedNpcTeachings {
		def, ok := found[name]
		require.True(t, ok, "%s must carry an interaction", name)

		var got []grant
		for _, node := range def.Interaction.Nodes {
			for _, opt := range node.Options {
				for _, g := range opt.Grants {
					require.Equal(t, GrantTeachSkill, g.Kind, "%s", name)
					require.NotNil(t, g.Skill, "%s: the skill must be resolved at load", name)
					got = append(got, grant{g.Skill.Name, g.RequiredLevel})
				}
			}
		}
		assert.Equal(t, want, got, "%s: teaching order/levels", name)
	}
}

// Every node still says something — the rule that used to live in the zone
// validator ("must have teachings or lore lines"), now applied to each node
// rather than to the one node an NPC used to have. A branch that lands on an
// empty screen is the panel-era version of a mute NPC.
func TestContent_EveryConversantSpeaks(t *testing.T) {
	for name, def := range conversants(t) {
		for _, node := range def.Interaction.Nodes {
			grants := 0
			for _, opt := range node.Options {
				grants += len(opt.Grants)
			}
			assert.True(t, len(node.Lines) > 0 || grants > 0,
				"%s: node %q says nothing at all", name, node.ID)
		}
	}
}

// D23: three NPCs are authored as real trees, and they are the ones the in-game
// pass looks at. A pin, not a rule — but a rule would be wrong here, since the
// other eleven are deliberately left flat to prove D17's auto-expansion renders
// them with zero content work.
func TestContent_AuthoredTrees(t *testing.T) {
	found := conversants(t)

	for _, name := range []string{"Emberkeeper", "TownCrier", "Wanderer"} {
		require.Greater(t, len(found[name].Interaction.Nodes), 1,
			"%s is one of D23's authored trees", name)
	}

	// The TownCrier is the NPC D18 exists for: it calls out as you pass AND
	// opens a tree on the key. Those were mutually exclusive under the retired
	// single-valued trigger, which is what forced its deletion.
	assert.NotEmpty(t, found["TownCrier"].Interaction.Ambient,
		"the TownCrier carries the game's only ambient lines")
	assert.Greater(t, len(found["TownCrier"].Interaction.Nodes), 1,
		"...and a conversation behind the key at the same time")

	// D22: the Wanderer is the one conversant that moves, so the hold is
	// provable in-game rather than shipped blind.
	assert.Greater(t, found["Wanderer"].Factors.Speed, float32(0),
		"the Wanderer must actually walk, or D22's hold is exercised by nothing")
	assert.Greater(t, found["Wanderer"].Factors.WanderRadius, float32(0))
}

// D18: nothing speaks unprompted, and that is no longer an authored value —
// it is the only behaviour there is. This inverts 3b-i's
// TestContent_EveryConversantWaitsForTheKey, which pinned the opposite.
//
// ⚑ The check is on the RAW JSON, not the loaded definition, and that is the
// point (L22): the mob loader is the one loader without DisallowUnknownFields,
// so a stale `"trigger"` would be silently ignored rather than rejected. The
// loader carries a tombstone that hard-fails it at boot — this pin is what
// says the 14 files were actually cleaned rather than merely capable of being.
func TestContent_NoConversantAuthorsTheRetiredTrigger(t *testing.T) {
	entries, err := amobs.Mobs.ReadDir(".")
	require.NoError(t, err)
	require.NotEmpty(t, entries)

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := amobs.Mobs.ReadFile(e.Name())
		require.NoError(t, err)

		var probe struct {
			Interaction *struct {
				Trigger string `json:"trigger"`
			} `json:"interaction"`
		}
		require.NoError(t, json.Unmarshal(raw, &probe), e.Name())
		if probe.Interaction != nil {
			assert.Empty(t, probe.Interaction.Trigger,
				"%s still authors interaction.trigger — retired in 3b-ii (D18)", e.Name())
		}
	}
}

// L26: talk range is what a conversation is torn down by now, not merely what
// lights a badge, so every conversant authors a real one rather than inheriting
// the 1.0 aggro radius it happened to be placed with.
func TestContent_EveryConversantAuthorsTalkRange(t *testing.T) {
	for name, def := range conversants(t) {
		assert.Greater(t, def.Interaction.Range, float32(1.0),
			"%s: an unauthored range falls back to aggroRadius, which is too tight to stand in", name)
	}
}

// The two knobs that keep a merged NPC unattackable (D5). Both are authored, so
// this is the pin that catches a content edit quietly making one killable —
// the behavioural half is pinned in model/mob and sys.
func TestContent_ConversantsAreUnattackableAndSensed(t *testing.T) {
	const layerAction = 2

	for name, def := range conversants(t) {
		assert.True(t, def.FriendlyToPlayers, "%s: player damage must skip it", name)
		assert.Zero(t, def.Body.CollisionLayer&layerAction,
			"%s: a body on the Action layer is aura-targetable by everything", name)
		assert.Zero(t, def.Factors.Experience, "%s: an NPC is not prey", name)
		assert.Greater(t, def.SenseRadius(), float32(0),
			"%s: a conversant nobody can reach is a mute NPC", name)
	}
}
