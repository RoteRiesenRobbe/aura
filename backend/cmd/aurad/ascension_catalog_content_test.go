package main

import (
	"math"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// Content pins for the seed ascension catalog (plan-ascension.md C3 step 4,
// D26: eight entries, five naming skills authored for it and three naming
// skills the world already hands out).
//
// ⚑ They live in cmd/aurad because this is the only package that sees the
// catalog, the mob registry and the quest graph at once — which is exactly what
// a gate references, and exactly what the unit tests must stub.

// loadedCatalog builds the real catalog through the real boot wiring, so a gate
// that does not resolve panics here rather than shipping as a locked row.
func loadedCatalog(t *testing.T) (ascension.Catalog, mobs.Registry) {
	t.Helper()
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	skillsRegistry := loadSkills(content.skills, mustLoadFactions(t, content))
	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	mobsRegistry, err := mobs.RegistryFromFS(skillsRegistry, factionsRegistry, curve.Default(), content.mobs)
	require.NoError(t, err)
	questsRegistry := loadQuests(content.quests, mobsRegistry)
	return loadAscensionCatalog(content.ascension, skillsRegistry, mobsRegistry, questsRegistry), mobsRegistry
}

// ⭐ D26's shape, and D18's three mechanisms each with a real content consumer
// rather than only a test — which is the entire reason the PO chose to gate
// three of the eight (2026-08-09).
func TestAscensionCatalog_IsTheAuthoredSeed(t *testing.T) {
	catalog, _ := loadedCatalog(t)

	gates := map[string]mobs.ConditionKind{}
	var keys []string
	for _, entry := range catalog.All() {
		keys = append(keys, entry.UnlockKey)
		for _, cond := range entry.Conditions {
			gates[entry.UnlockKey] = cond.Kind
		}
	}

	assert.Equal(t, []string{
		"Blight", "Envenom", "FrostShield", "Frostbite",
		"KeenEye", "Lantern", "RimeBurst", "Venomward",
	}, keys, "eight entries, and the ORDER is the wire contract (sorted by unlock key)")

	// One entry per mechanism, and no more: a fourth gated entry would mean the
	// catalog's default became "locked", which D14's empty state reads as an
	// exhausted bloodline.
	assert.Equal(t, map[string]mobs.ConditionKind{
		"Blight":      mobs.ConditionKillsThisLife,       // tier A, the ledger
		"FrostShield": mobs.ConditionBloodlineAscensions, // tier B, the ticket
		"Lantern":     mobs.ConditionQuestAtStage,        // tier A, the shipped vocabulary
	}, gates)
}

// ⭐ P8 IN THE SHIPPED CONTENT: the quest gate is `quest_at_stage` + the
// `completed` sentinel, not a `quest_completed` kind that was never built. If
// this ever reads otherwise, D18's "the shipped vocabulary is genuinely reused"
// stopped being true of the content that was supposed to prove it.
func TestAscensionCatalog_TheQuestGateUsesTheShippedSentinel(t *testing.T) {
	catalog, _ := loadedCatalog(t)

	for _, entry := range catalog.All() {
		if entry.UnlockKey != "Lantern" {
			continue
		}
		require.Len(t, entry.Conditions, 1)
		cond := entry.Conditions[0]
		assert.Equal(t, mobs.ConditionQuestAtStage, cond.Kind)
		assert.Equal(t, "the-lost-lamp", cond.Quest)
		assert.Equal(t, mobs.QuestStageCompleted, cond.Stage)
		return
	}
	t.Fatal("the Lantern entry is gone")
}

// ⛑ The hunt gate's species must be RESOLVED, not merely authored. An unresolved
// one is the failure §13 step 2 exists for: the row renders locked forever and
// reads exactly like a gate that is merely hard.
func TestAscensionCatalog_TheHuntGateResolvesToARealSpecies(t *testing.T) {
	catalog, mobsRegistry := loadedCatalog(t)

	for _, entry := range catalog.All() {
		for _, cond := range entry.Conditions {
			if cond.Kind != mobs.ConditionKillsThisLife {
				continue
			}
			assert.NotZero(t, cond.SpeciesID, "entry %q gates on kills that never resolved", entry.UnlockKey)
			species, err := mobsRegistry.Get(cond.SpeciesID)
			require.NoError(t, err)
			assert.Equal(t, cond.Species, species.Name,
				"the id must name the same species the author wrote")
			assert.Positive(t, cond.Value)
		}
	}
}

// ⭐ THE WHOLE CATALOG AS A PLAYER MEETS IT, which is the assertion the unit
// tests cannot make: they stub the catalog, and this is the authored one.
//
// A first life at the cap sees five rows it can take and three it cannot, each
// locked row naming its own wall with this player's progress in it. ⚑ And D14's
// "ascend with no gift" row must NOT be there: it is offered only when nothing
// is pickable, so its presence beside five real choices would mean the filter
// had come apart.
func TestAscensionCatalog_AFirstLifeSeesFivePickableAndThreeLocked(t *testing.T) {
	catalog, _ := loadedCatalog(t)
	source := sys.NewAscensionRows(catalog)

	rows := source.PresentRows(mobs.RowSourceAscensionCatalog, newCatalogLearner())
	require.Len(t, rows, 8, "no empty-pick row while real choices are on screen (D14)")

	var locked []string
	pickable := 0
	for _, row := range rows {
		if !row.Locked {
			pickable++
			assert.NotEmpty(t, row.Reply, "a takeable row has something to speak")
			continue
		}
		assert.Empty(t, row.Reply, "a locked row is inert on both ends")
		locked = append(locked, row.Text)
	}
	assert.Equal(t, 5, pickable)
	require.Len(t, locked, 3)

	// The gate is NAMED and its progress composed per player (D18): a locked row
	// whose price a player cannot read is indistinguishable from a bug.
	for _, text := range locked {
		assert.Contains(t, text, "locked:", "a locked row names its wall")
	}
	assert.Contains(t, strings.Join(locked, "\n"),
		"slay 20 × Dire Wolf this life (0/20)",
		"the hunt row shows this player's own counter, not an authored threshold")
	assert.Contains(t, strings.Join(locked, "\n"),
		"3 ascensions in this line (0/3)")
	assert.Contains(t, strings.Join(locked, "\n"),
		`complete "the-lost-lamp"`)
}

// catalogLearner is a first life at the cap with a REAL (empty) quest ledger, so
// the two tier-A gates are evaluated for real rather than short-circuited by a
// nil. contentLearner in the sibling file deliberately returns nil there; this
// one has to be different, because a nil ledger is the one state that makes
// every quest and kill gate fail for a reason unrelated to the content.
type catalogLearner struct {
	sc     *skills.SkillComponent
	ledger *quests.Ledger
}

func newCatalogLearner() *catalogLearner {
	return &catalogLearner{
		sc:     skills.NewSkillComponent(true),
		ledger: quests.NewLedger(nil),
	}
}

func (l *catalogLearner) SkillComponent() *skills.SkillComponent { return l.sc }
func (l *catalogLearner) Progression() model.PlayerProgression {
	return model.PlayerProgression{Level: 30}
}
func (l *catalogLearner) ApplyRecipeCascade()         {}
func (l *catalogLearner) QuestLedger() *quests.Ledger { return l.ledger }
func (l *catalogLearner) AddExperience(uint64)        {}
func (l *catalogLearner) BloodlineUnlocks() []string  { return nil }
func (l *catalogLearner) BloodlineAscensions() int    { return 0 }
func (l *catalogLearner) AccountID() int64            { return 0 }

// --- the memorial's content (plan-ascension.md C3 step 6, D11) ---

// The monument has to STAND somewhere. A definition that resolves but is never
// spawned is a feature no player can reach, and the loader has nothing to say
// about it — the memorial's entire in-world surface is this one spawn.
//
// ⚑ It also asserts the monument is BESIDE the stone (P25) and far enough from
// it to be the nearest conversant when a player stands at it. `E` goes to the
// NEAREST eligible actor, so two talkers inside each other's interaction range
// would make which one answers a positional accident — the exact trap the
// verify skill records for the zone-1 conversant cluster.
func TestMemorial_StandsBesideTheStoneAndIsReachable(t *testing.T) {
	zone := ascensionSiteZone(t)

	var memorial, stone *world.Spawn
	for i := range zone.Spawns {
		switch zone.Spawns[i].Mob {
		case "MemorialStone":
			require.Nil(t, memorial, "exactly one monument, or two places claim one history")
			memorial = &zone.Spawns[i]
		case ascensionSiteMob:
			stone = &zone.Spawns[i]
		}
	}
	require.NotNil(t, memorial, "the memorial is authored but never placed")
	require.NotNil(t, stone)
	require.NotNil(t, memorial.Def, "the spawn resolved against the mob registry")

	dx := float64(memorial.X - stone.X)
	dy := float64(memorial.Y - stone.Y)
	apart := math.Hypot(dx, dy)
	assert.Less(t, apart, 12.0, "beside the stone, so one playtest walk reaches both (P25)")
	assert.Greater(t, apart, float64(memorial.Def.Interaction.Range),
		"further apart than the talk range, or which stone answers is a coin flip")
}

// ⭐ P26: THE MEMORIAL'S NODE IS UNGATED, and that is a ruling rather than an
// omission. Reading the names of the dead is not a reward, and P1 prices the
// ascension rather than the monument — a level gate here would hide the game's
// own history from exactly the players who have not made any of it yet.
func TestMemorial_ItsNodeIsUngatedAndServesTheGraveyard(t *testing.T) {
	zone := ascensionSiteZone(t)

	var def *mobs.MobDefinition
	for i := range zone.Spawns {
		if zone.Spawns[i].Mob == "MemorialStone" {
			def = zone.Spawns[i].Def
		}
	}
	require.NotNil(t, def)
	require.NotNil(t, def.Interaction)
	require.Len(t, def.Interaction.Nodes, 1)

	node := def.Interaction.Nodes[0]
	assert.Empty(t, node.Conditions, "no gate: the monument is not a reward (P26)")
	assert.Equal(t, mobs.RowSourceMemorialNames, node.Rows)
	assert.Empty(t, node.Options, "its rows are generated; an authored option would share their index space")
	assert.NotEmpty(t, node.Lines,
		"a generated list may come back empty, and then the lines are all the node has to say")
}
