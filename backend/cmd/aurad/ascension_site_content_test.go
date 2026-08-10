package main

import (
	"encoding/json"
	"os"
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

// Content pins for the ascension site (plan-ascension.md §12.4, C2a step 1).
//
// The site is an interaction-carrying mob rather than a prop (§4.1), placed as
// a fixed zone spawn. Both facts are invisible to every other test: the mob
// registry would happily hold a definition nobody places, and the zone loader
// would happily place a second one.
//
// ⚑ The level gate is the reason this file lives in cmd/aurad rather than
// beside the other mob content tests: it is the one authored number in the
// content that MUST equal a tuning value from conf, and this package is the
// only one that sees both.

const ascensionSiteMob = "AscensionStone"

func ascensionSiteZone(t *testing.T) *world.Zone {
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
	return zone
}

// The site has to STAND somewhere. A definition that resolves but is never
// spawned is a feature no player can reach, and the loader has nothing to say
// about it - the ascension loop's entire in-world surface is this one spawn.
//
// ⚑ Exactly once, not at least once: D8 keeps a per-faction site possible as
// later CONTENT, but v1 has one site (§4.1), and two stones would be two places
// the same irreversible act can be started from with no way to tell them apart.
func TestAscensionSite_StandsInTheWorldExactlyOnce(t *testing.T) {
	zone := ascensionSiteZone(t)

	var found []*world.Spawn
	for i := range zone.Spawns {
		if zone.Spawns[i].Mob == ascensionSiteMob {
			found = append(found, &zone.Spawns[i])
		}
	}
	require.Len(t, found, 1, "api/zones/world.json places the ascension site exactly once")

	site := found[0]
	require.NotNil(t, site.Def, "the spawn resolved against the mob registry")
	require.NotNil(t, site.Def.Interaction, "the site is an object that TALKS — without an interaction block it is scenery")

	// Off the Action collision layer, the same two authored knobs the sign and
	// the crier use (plan-entity-model.md D5): no aura on either side can
	// target it, so a damage-aura player standing at the stone cannot chip at
	// the thing they came to talk to.
	assert.Zero(t, site.Def.Body.CollisionLayer&2,
		"the site must not sit on the Action layer, or auras can target it")
	assert.Zero(t, site.Def.Factors.XPFactor,
		"the site pays no XP and stays off the nameplate path")
	assert.Zero(t, site.Def.Factors.Speed, "a standing stone does not walk")
}

// ⭐ The greeting's level gate must equal the CONFIGURED level cap, because P1
// makes max level the whole entry price and RequestAscension enforces it
// against the live level from conf. Authoring the number in JSON duplicates it,
// and a cap change would otherwise leave the stone either unreachable (gate
// above the cap) or lying to a player it will refuse (gate below it).
//
// ⚑ This is the ONLY place the two are compared, and it is deliberately a
// content test rather than a loader rule: a gated dialogue node is generic
// machinery, and teaching the mob loader about the level curve to police one
// stone would be the wrong shape.
func TestAscensionSite_ReadyNodeIsGatedAtTheConfiguredMaxLevel(t *testing.T) {
	zone := ascensionSiteZone(t)

	var def *mobs.MobDefinition
	for i := range zone.Spawns {
		if zone.Spawns[i].Mob == ascensionSiteMob {
			def = zone.Spawns[i].Def
		}
	}
	require.NotNil(t, def)
	require.NotNil(t, def.Interaction)

	cap := confMaxLevel(t)
	nodes := def.Interaction.Nodes
	require.GreaterOrEqual(t, len(nodes), 2, "a gated greeting and the fallback preview at least")

	// ⭐ EVERY node but the last carries the cap gate, and the row-source node
	// carries it for TWO independent reasons rather than for symmetry.
	//
	// present() makes the FIRST node whose conditions pass the greeting, so an
	// ungated node above the fallback becomes the greeting for everyone below the
	// cap: an ungated catalog node showed a fresh level-1 character the reward
	// list, found by c2a-ascension-site.mjs at C2a step 3. And applyGrant
	// validates a row against its NODE's conditions before it reaches the row
	// source, so the same gate is what stops a crafted message stashing a pick
	// below the cap.
	//
	// ⚑ L3's loader rule does NOT cover this. It refuses a conditional node
	// sitting BELOW an unconditional one, which is a different mistake.
	gates := 0
	for i, node := range nodes[:len(nodes)-1] {
		require.NotEmpty(t, node.Conditions,
			"node %q is not the fallback, so it must be gated or it becomes the greeting below the cap", node.ID)
		for _, c := range node.Conditions {
			if c.Kind == mobs.ConditionMinLevel {
				gates++
				assert.Equal(t, cap, c.Value,
					"node %q (index %d): the gate has drifted from game.player.maxLevel", node.ID, i)
			}
		}
	}
	assert.GreaterOrEqual(t, gates, 2, "the greeting and the reward list are each gated at the cap")

	var rowNode *mobs.InteractionNode
	for i := range nodes {
		if nodes[i].Rows != "" {
			rowNode = &nodes[i]
		}
	}
	require.NotNil(t, rowNode, "the site generates its reward rows (C2a step 2/3)")
	assert.NotEmpty(t, rowNode.Conditions,
		"the row-source node must be gated: applyGrant checks the NODE before the row source sees the pick")

	// The unconditional fallback is LAST, so a player below the cap still gets a
	// greeting instead of no panel at all.
	assert.Empty(t, nodes[len(nodes)-1].Conditions,
		"the preview is the final, unconditional node")
}

func confMaxLevel(t *testing.T) int {
	t.Helper()
	raw, err := os.ReadFile("../../conf.default.json")
	require.NoError(t, err)

	var conf struct {
		Game struct {
			Player struct {
				MaxLevel int `json:"maxLevel"`
			} `json:"player"`
		} `json:"game"`
	}
	require.NoError(t, json.Unmarshal(raw, &conf))
	require.NotZero(t, conf.Game.Player.MaxLevel, "conf.default.json carries a level cap")
	return conf.Game.Player.MaxLevel
}

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

	authored := map[mobs.RowSourceKind]string{}
	for _, def := range mobsRegistry.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for _, node := range def.Interaction.Nodes {
			if node.Rows != "" {
				authored[node.Rows] = def.Name + "/" + node.ID
			}
		}
	}
	require.NotEmpty(t, authored, "the ascension stone authors one; if this is empty the walk is broken")

	for kind, where := range authored {
		source, wired := sources[kind]
		if !assert.True(t, wired, "%s authors rows %q, and NOTHING is wired for that kind", where, kind) {
			continue
		}
		assert.NotEmpty(t, source.PresentRows(kind, maxLevelLearner(t)),
			"%s authors rows %q, but the wired provider serves nothing for it", where, kind)
	}
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
