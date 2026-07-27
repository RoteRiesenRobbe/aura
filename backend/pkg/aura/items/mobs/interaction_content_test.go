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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

// The grant walk survived the move from zone entry to mob definition intact:
// same skills, same order, same level gates.
func TestContent_TeachingOrderMatchesPreMigrationZone(t *testing.T) {
	found := conversants(t)

	for name, want := range expectedNpcTeachings {
		def, ok := found[name]
		require.True(t, ok, "%s must carry an interaction", name)
		require.Len(t, def.Interaction.Nodes, 1, "%s: 3a authors the degenerate one-node case", name)

		var got []grant
		for _, opt := range def.Interaction.Nodes[0].Options {
			for _, g := range opt.Grants {
				require.Equal(t, GrantTeachSkill, g.Kind, "%s", name)
				require.NotNil(t, g.Skill, "%s: the skill must be resolved at load", name)
				got = append(got, grant{g.Skill.Name, g.RequiredLevel})
			}
		}
		assert.Equal(t, want, got, "%s: teaching order/levels", name)
	}
}

// Every NPC still says something — the rule that used to live in the zone
// validator ("must have teachings or lore lines").
func TestContent_EveryConversantSpeaks(t *testing.T) {
	for name, def := range conversants(t) {
		node := def.Interaction.Nodes[0]
		grants := 0
		for _, opt := range node.Options {
			grants += len(opt.Grants)
		}
		assert.True(t, len(node.Lines) > 0 || grants > 0, "%s says nothing at all", name)
	}
}

// D11: nothing speaks unprompted. Every conversant authors the interact verb
// explicitly — and the assertion matters precisely because an ABSENT trigger
// still parses, defaulting to approach (D14 keeps that path for future ambient
// lore). Without this pin a 15th NPC that simply omits the key would ship
// ambushing players, and the failure would look like content, not a bug.
func TestContent_EveryConversantWaitsForTheKey(t *testing.T) {
	for name, def := range conversants(t) {
		assert.Equal(t, TriggerInteract, def.Interaction.Trigger,
			"%s must author trigger \"interact\" — an omitted trigger silently means approach", name)
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
