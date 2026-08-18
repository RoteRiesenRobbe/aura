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
	// The ascension site (plan-ascension.md §12.4 step 1). An object that
	// talks, on the ForestSign shape, and the ONLY conversant whose greeting is
	// gated on a level: below the cap it is a preview, at the cap it is the
	// stone (§4.2). Its reward rows are generated, not authored, so it stays a
	// two-node lore tree in the content until step 3.
	"AscensionStone",
	// The SECOND ascension site (plan-ascension-sites.md C1). It exists to be
	// priced differently from the one above — level 25 and a finished "Thin the
	// Orc Line", where the village stone asks for level 30 — which is what D1
	// made possible by retiring the global entry rule. ⚑ Its being a second
	// conversant of the same shape is the point: sites are ordinary content now,
	// so this list is expected to grow.
	"FrontAscensionStone",
	// The memorial (plan-ascension.md D11, C3 step 6). The second object that
	// talks and the second consumer of the generated-row hook, and the only
	// conversant in the world whose rows come from the DATABASE rather than from
	// content. Deliberately UNGATED (P26): reading the names of the dead is not
	// a reward, so unlike the stone beside it there is nothing to qualify for.
	"MemorialStone",
	// ⭐ THE FIRST CONVERSANT THAT IS NEVER PLACED IN A ZONE (plan-portal-spells.md
	// C1): every name above it stands somewhere in `api/zones/`, while the portal
	// is spawned at runtime by the OpenPortal cooldown and dies with its TTL. It
	// is here because this census asks who CAN talk, which is a property of the
	// definition and not of where the world puts it - and it is also the only
	// conversant whose rows can be locked by something outside the content: its
	// travel row needs the OWNER's campfire anchor to resolve.
	"PortalHome",
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

// Every grant an NPC hands out is fully resolved FOR ITS KIND. This is the part
// of the retired teaching-order pin that was never about the migration: an
// unresolved skill or a half-authored payload is a load-time defect at any point
// in the content's life, whereas WHICH skills an NPC teaches is authoring the PO
// changes on purpose.
//
// ⚑ It used to assert every grant was a teach_skill. C2 relaxed that: the quest
// vocabulary makes three more kinds legal, and C4 authors them. What survives is
// the invariant that actually catches defects — each kind carries exactly the
// payload its runtime case reads, and nothing is left nil for the player who
// clicks the row nobody tested.
func TestContent_EveryGrantIsResolvedForItsKind(t *testing.T) {
	found := conversants(t)
	require.NotEmpty(t, found)

	for name, def := range found {
		for _, node := range def.Interaction.Nodes {
			for _, opt := range node.Options {
				for _, g := range opt.Grants {
					switch g.Kind {
					case GrantTeachSkill:
						assert.NotNil(t, g.Skill, "%s: the skill must be resolved at load", name)
						assert.Empty(t, g.Quest, "%s: a teach carries no quest", name)
					case GrantOfferQuest:
						assert.NotEmpty(t, g.Quest, "%s", name)
						assert.Nil(t, g.Skill, "%s: a quest grant resolves no skill", name)
					case GrantAdvanceQuest:
						assert.NotEmpty(t, g.Quest, "%s", name)
						assert.NotEmpty(t, g.FromStage, "%s: the edge is the row", name)
						assert.NotEmpty(t, g.ToStage, "%s: the edge is the row", name)
					case GrantXP:
						assert.NotZero(t, g.XP, "%s", name)
					case GrantTravelTo:
						// ⭐ THE ONE KIND THAT HANDS OVER NOTHING
						// (plan-portal-spells.md D3), so the invariant is the
						// mirror image of the four above: a resolved destination
						// and every payload field empty. An unresolved mode is
						// the defect this catches - a portal that swallows the
						// keypress and moves nobody.
						assert.NotEmpty(t, g.Travel, "%s: the destination mode must resolve at load", name)
						assert.Nil(t, g.Skill, "%s: travel teaches nothing", name)
						assert.Empty(t, g.Quest, "%s: travel drives no quest", name)
						assert.Zero(t, g.XP, "%s: travel pays nothing", name)
					default:
						t.Errorf("%s: grant kind %q has no content invariant — add one here", name, g.Kind)
					}
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

// D23's three original authored trees, still the ones the in-game pass looks
// at first. ⚑ Since conversation-journal Q4 EVERY conversant is authored to
// R1's tree shape (greeting at root, teachings behind named rows, quests
// behind their own rows) — the nameless multi-grant option D17 auto-expands is
// no longer authored anywhere, so that presenter path is covered only by the
// unit tests beside it.
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
		assert.Zero(t, def.Factors.XPFactor, "%s: an NPC is not prey", name)
		assert.Greater(t, def.SenseRadius(), float32(0),
			"%s: a conversant nobody can reach is a mute NPC", name)
	}
}
