package main

import (
	"fmt"
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// Content pins for the ascension SITES (plan-ascension.md §12.4 C2a step 1,
// generalised to many stones by plan-ascension-sites.md C1).
//
// A site is an interaction-carrying mob rather than a prop (§4.1), placed as a
// fixed zone spawn. Both facts are invisible to every other test: the mob
// registry would happily hold a definition nobody places, and the zone loader
// would happily place one twice.
//
// ⭐ NOTHING HERE NAMES A STONE ANY MORE. Until D1 there was exactly one site
// and this file walked it by name; now a site IS "a def whose interaction
// carries an ascension_catalog rows node", so every stone a content author adds
// is pinned the day they add it, and a stone that stops offering the catalog
// stops being one. That is the same shape the row-source walk below already had.
//
// ⚑ WHAT THIS FILE STOPPED ASSERTING, and why: the level gate used to have to
// EQUAL `game.player.levelCurve.maxLevel`, because RequestAscension enforced
// that number in Go and the stone authored it a second time. D1 retired that
// rule — a site names its own price and the server enforces exactly what it
// authored — so the duplication, and the test that policed it, are both gone.
// What survives is the part that was never about the cap: every non-fallback
// node is gated, the row-source node among them.

// ascensionSiteRows is what makes a def a site: it serves the reward catalog.
const ascensionSiteRows = mobs.RowSourceAscensionCatalog

// ascensionSiteDefs is every def that offers the ascension catalog: the set the
// pins below walk, derived from the content rather than from a list here.
func ascensionSiteDefs(t *testing.T, registry mobs.Registry) map[string]*mobs.MobDefinition {
	t.Helper()
	sites := map[string]*mobs.MobDefinition{}
	for _, def := range registry.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for _, node := range def.Interaction.Nodes {
			if node.Rows == ascensionSiteRows {
				sites[def.Name] = def
				break
			}
		}
	}
	require.NotEmpty(t, sites, "the world has at least one ascension site; if this is empty the walk is broken")
	return sites
}

func ascensionSiteZone(t *testing.T) (*world.Zone, mobs.Registry) {
	t.Helper()
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	skillsRegistry, err := skills.RegistryFromFS(content.skills, mustLoadFactions(t, content))
	require.NoError(t, err)
	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)
	propsRegistry, err := world.PropRegistryFromFS(content.props)
	require.NoError(t, err)

	zone, err := world.LoadZoneFS(content.zones, "world", mobsRegistry, propsRegistry)
	require.NoError(t, err)
	return zone, mobsRegistry
}

// EVERY site has to STAND somewhere, exactly once. A definition that resolves
// but is never spawned is a feature no player can reach, and the loader has
// nothing to say about it; a definition spawned twice is the same irreversible
// act offered from two places with no way to tell them apart.
//
// ⚑ It is the SET that is pinned, not a count: D1 makes new stones ordinary
// content, so this must welcome a fourth one and still refuse an unplaced or
// duplicated one.
func TestAscensionSites_EachStandsInTheWorldExactlyOnce(t *testing.T) {
	zone, registry := ascensionSiteZone(t)

	authored := ascensionSiteDefs(t, registry)
	placed := map[string][]*world.Spawn{}
	for i := range zone.Spawns {
		if _, isSite := authored[zone.Spawns[i].Mob]; isSite {
			placed[zone.Spawns[i].Mob] = append(placed[zone.Spawns[i].Mob], &zone.Spawns[i])
		}
	}

	for name, def := range authored {
		spawns := placed[name]
		require.Len(t, spawns, 1, "api/zones/world.json places %q exactly once", name)
		require.NotNil(t, spawns[0].Def, "the spawn resolved against the mob registry")

		// Off the Action collision layer, the same two authored knobs the sign
		// and the crier use (plan-entity-model.md D5): no aura on either side
		// can target it, so a damage-aura player standing at a stone cannot
		// chip at the thing they came to talk to.
		assert.Zero(t, def.Body.CollisionLayer&2,
			"%q must not sit on the Action layer, or auras can target it", name)
		assert.Zero(t, def.Factors.XPFactor,
			"%q pays no XP and stays off the nameplate path", name)
		assert.Zero(t, def.Factors.Speed, "%q is a standing stone and does not walk", name)
	}
}

// ⛑ TWO SITES MUST NOT STAND WITHIN TALKING DISTANCE OF EACH OTHER, or of any
// other conversant. `E` goes to the NEAREST interactable, and C3 paid for that
// lesson with the memorial and the village stone 3 units apart: a run that
// measured the wrong one went green proving nothing. A player walking up to a
// stone priced at 25 must not open the one priced at 30.
func TestAscensionSites_StandClearOfEveryOtherConversant(t *testing.T) {
	zone, registry := ascensionSiteZone(t)
	authored := ascensionSiteDefs(t, registry)

	// Further apart than the wider of the two talk ranges, which is the rule the
	// memorial pin already applies to the pair it owns. ⚑ It is NOT a comfortable
	// margin: the village stone and the monument stand 3.0 units apart by design
	// (P25 wanted them beside each other), so this is deliberately the weakest
	// assertion that still makes "which one answers" a decision rather than a
	// coin flip.

	for i := range zone.Spawns {
		site := &zone.Spawns[i]
		if _, isSite := authored[site.Mob]; !isSite {
			continue
		}
		for j := range zone.Spawns {
			other := &zone.Spawns[j]
			if i == j || other.Def == nil || other.Def.Interaction == nil {
				continue
			}
			clear := float64(site.Def.Interaction.Range)
			if r := float64(other.Def.Interaction.Range); r > clear {
				clear = r
			}
			apart := math.Hypot(float64(site.X-other.X), float64(site.Y-other.Y))
			assert.Greater(t, apart, clear,
				"%q stands %.1f units from %q, and E goes to the nearest one",
				site.Mob, apart, other.Mob)
		}
	}
}

// ⭐ EVERY SITE PRICES ITSELF, AND EVERY SITE IS UNREACHABLE UNTIL IT IS PAID.
// This is what survived D1: the cap comparison went (a site names its own
// price, and Go enforces exactly that), but the STRUCTURE that makes a price
// mean anything did not.
//
// present() makes the FIRST node whose conditions pass the greeting, so an
// ungated node above the fallback becomes the greeting for everyone: an ungated
// catalog node showed a fresh level-1 character the reward list, found by
// c2a-ascension-site.mjs at C2a step 3. And applyGrant validates a row against
// its NODE's conditions before it reaches the row source, so the same gate is
// what stops a crafted message stashing a pick nobody paid for — the pick then
// carries those conditions to the ceremony, so an ungated node would also be an
// unpriced ascension.
//
// ⚑ L3's loader rule does NOT cover this. It refuses a conditional node sitting
// BELOW an unconditional one, which is a different mistake.
func TestAscensionSites_EveryNodeButTheFallbackIsGated(t *testing.T) {
	_, registry := ascensionSiteZone(t)

	for name, def := range ascensionSiteDefs(t, registry) {
		nodes := def.Interaction.Nodes
		require.GreaterOrEqual(t, len(nodes), 2,
			"%q needs a gated greeting and the fallback preview at least", name)

		for _, node := range nodes[:len(nodes)-1] {
			require.NotEmpty(t, node.Conditions,
				"%q node %q is not the fallback, so it must be gated or it becomes the greeting for everybody",
				name, node.ID)
		}

		var rowNode *mobs.InteractionNode
		for i := range nodes {
			if nodes[i].Rows == ascensionSiteRows {
				rowNode = &nodes[i]
			}
		}
		require.NotNil(t, rowNode, "%q generates its reward rows (C2a step 2/3)", name)
		assert.NotEmpty(t, rowNode.Conditions,
			"%q's row-source node must be gated: applyGrant checks the NODE, and the pick carries that gate to the ceremony",
			name)

		// The unconditional fallback is LAST, so a player who cannot pay still
		// gets a greeting instead of no panel at all.
		assert.Empty(t, nodes[len(nodes)-1].Conditions,
			"%q's preview is the final, unconditional node", name)
	}
}

// ⭐ THE SITES DO NOT ALL ASK THE SAME THING, which is the whole point of this
// plan and the one assertion that would go quietly green if a second stone were
// added by copy-paste. It is deliberately weak about WHAT they ask: prices are
// content and will be tuned, but "there is more than one price in the world"
// is the property C1 exists to create.
func TestAscensionSites_DoNotAllChargeTheSamePrice(t *testing.T) {
	_, registry := ascensionSiteZone(t)
	sites := ascensionSiteDefs(t, registry)
	if len(sites) < 2 {
		t.Skip("one site in the world; nothing to compare")
	}

	prices := map[string]bool{}
	for _, def := range sites {
		prices[fmt.Sprintf("%v", def.Interaction.Nodes[0].Conditions)] = true
	}
	assert.Greater(t, len(prices), 1,
		"every site charges the same thing, so nothing proves a site owns its price")
}

// ⚑ confMaxLevel WENT WITH D1. It read `game.player.maxLevel` out of
// conf.default.json so the stone's authored gate could be compared against it,
// and it was the only reason this file needed conf at all. No site is priced
// from conf any more.

// ⭐ Owed by C2a step 2 (§12.7): a `rows` kind that PARSES but has no provider
// case behind it is a permanently EMPTY list, which is the exact twin of C1's
// "a condition kind nothing evaluates is a permanently locked row". Both fail
// silently, and both look like content that simply has nothing to say.
//
// This is the guard. It walks every authored interaction node in the repo's
// content, and for each row source it finds, asks the real provider whether it
// serves that kind. A new RowSourceKind authored before its provider case exists
// goes red here rather than shipping as a node nobody can get anything out of.
//
// ⚑ It drives the provider through a TEST-ONLY catalog with one entry, because
// the shipped catalog is empty until C3 and an empty one answers with rows for
// reasons that have nothing to do with wiring.
func TestAuthoredRowSources_AreAllServedByTheProvider(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	skillsRegistry, err := skills.RegistryFromFS(content.skills, mustLoadFactions(t, content))
	require.NoError(t, err)
	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)

	probe, err := skillsRegistry.GetByName("Damage")
	require.NoError(t, err, "any real skill will do as the probe reward")

	// ⭐ EVERY registered provider, not just the catalog's (C3 step 6). This test
	// walks the authored kinds and demands each be served, so it is precisely
	// what goes red when a NEW row source is authored in content and never wired
	// which is what it did the moment the memorial's node landed.
	sources := map[mobs.RowSourceKind]sys.RowSource{
		mobs.RowSourceAscensionCatalog: sys.NewAscensionRows(ascension.CatalogOf(
			ascension.Entry{UnlockKey: probe.Name, Skill: probe},
		)),
		// One name is enough: this asserts WIRING, not content.
		mobs.RowSourceMemorialNames: sys.NewMemorialRows(func() persist.Graveyard {
			return persist.Graveyard{
				Names: []persist.GraveyardName{{Name: "Aelric", Level: 30, AccountID: 1}},
				Total: 1,
			}
		}),
	}

	// ⚑ The REAL authored node is what the provider is handed, not a node built
	// here to match: a provider takes the node since plan-ascension-sites.md P2,
	// and this test is the one place that can prove the shipped content and the
	// wired provider agree about it.
	type authoredNode struct {
		where string
		node  *mobs.InteractionNode
	}
	authored := map[mobs.RowSourceKind]authoredNode{}
	for _, def := range mobsRegistry.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for i := range def.Interaction.Nodes {
			node := &def.Interaction.Nodes[i]
			if node.Rows != "" {
				authored[node.Rows] = authoredNode{where: def.Name + "/" + node.ID, node: node}
			}
		}
	}
	require.NotEmpty(t, authored, "the ascension stone authors one; if this is empty the walk is broken")

	for kind, a := range authored {
		source, wired := sources[kind]
		if !assert.True(t, wired, "%s authors rows %q, and NOTHING is wired for that kind", a.where, kind) {
			continue
		}
		assert.NotEmpty(t, source.PresentRows(a.node, maxLevelLearner(t)),
			"%s authors rows %q, but the wired provider serves nothing for it", a.where, kind)
	}
}

// catalogRowsNode is the ascension catalog's node as a provider needs it: the
// `rows` key is what it dispatches on. Content tests that drive a provider
// directly build one rather than digging the authored node out of the registry,
// which is a different assertion (see the walk above).
func catalogRowsNode() *mobs.InteractionNode {
	return &mobs.InteractionNode{ID: "catalog", Rows: mobs.RowSourceAscensionCatalog}
}

// maxLevelLearner is the smallest thing the row source will talk to: a player
// at the cap with nothing spent, so an ungated entry is pickable and the walk
// above measures WIRING rather than eligibility.
//
// ⚑ `sys.learner` is unexported, which does not stop this: every method on it
// is exported, so a type declared here satisfies it and the call site type-checks.
type contentLearner struct{ sc *skills.SkillComponent }

func maxLevelLearner(t *testing.T) *contentLearner {
	t.Helper()
	return &contentLearner{sc: skills.NewSkillComponent(true)}
}

func (l *contentLearner) SkillComponent() *skills.SkillComponent { return l.sc }
func (l *contentLearner) Progression() model.PlayerProgression {
	return model.PlayerProgression{Level: 30}
}
func (l *contentLearner) ApplyRecipeCascade()         {}
func (l *contentLearner) QuestLedger() *quests.Ledger { return nil }
func (l *contentLearner) AddExperience(uint64)        {}
func (l *contentLearner) BloodlineUnlocks() []string  { return nil }
func (l *contentLearner) BloodlineAscensions() int    { return 0 }
func (l *contentLearner) AccountID() int64            { return 0 }
