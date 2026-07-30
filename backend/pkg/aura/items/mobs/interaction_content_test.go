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

// The 14 world NPCs that carry an interaction.
//
// ⚑ This used to be a map of name → the exact teaching payload each NPC had
// before the 3a migration, and a companion test asserted the grants had not
// moved. That pin was RETIRED 2026-07-29 (PO): it had done its job — it proved
// the zone-entry → mob-definition move (3a) and the flat-option → tree move
// (3b-ii) were payload-preserving — and content has since deliberately moved
// past it (`3b1b3ef6` gave the Hermit Calm@10 and CharmBeast@10), so from then
// on it only reported that authoring had happened. The census below is the part
// that still earns its keep: it says WHO can talk, which no other test does.
var expectedConversants = []string{
	"Farmer", "Hermit", "Lamplighter", "Dog", "Miner", "CityGuard",
	"VillageHealer", "FrontCaptain", "Shaman", "Wanderer",
	"LamplessTraveller", // pure flavour, and that is a first-class case
	"TownCrier",
	"ForestSign", // a sign-post: lore only
	"Emberkeeper",
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
	assert.ElementsMatch(t, expectedConversants, names, "exactly the merged NPCs carry an interaction")
}

// Every grant an NPC hands out is a resolved teach-skill grant. This is the part
// of the retired teaching-order pin that was never about the migration: an
// unresolved skill or a grant kind nobody implemented is a load-time defect at
// any point in the content's life, whereas WHICH skills an NPC teaches is
// authoring the PO changes on purpose.
func TestContent_EveryGrantIsAResolvedTeach(t *testing.T) {
	found := conversants(t)
	require.NotEmpty(t, found)

	for name, def := range found {
		for _, node := range def.Interaction.Nodes {
			for _, opt := range node.Options {
				for _, g := range opt.Grants {
					assert.Equal(t, GrantTeachSkill, g.Kind, "%s", name)
					assert.NotNil(t, g.Skill, "%s: the skill must be resolved at load", name)
				}
			}
		}
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
// ⚑ The check is on the RAW JSON, not the loaded definition. That used to be
// load-bearing because the mob loader was the one loader without
// DisallowUnknownFields, so a stale `"trigger"` would have been silently
// ignored; R1 closed that gap (definitions.go:296) and the loader also carries a
// tombstone, so an authored trigger now fails boot twice over. What the raw probe
// still buys is the DIAGNOSIS: a loader failure fails every test that touches
// contentRegistry at once, whereas this one names the file.
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
