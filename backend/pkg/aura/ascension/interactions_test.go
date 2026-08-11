package ascension

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// fakeConversants is the slice of mobs.Registry this pass reads, following the
// quests.CrossValidate test's own helper.
type fakeConversants []*mobs.MobDefinition

func (f fakeConversants) Mobs() []*mobs.MobDefinition { return f }

// site is the smallest mob carrying one catalog node offering these keys, which
// is the shape every ascension stone has.
func site(name string, rewards ...string) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		Name: name,
		Interaction: &mobs.Interaction{Nodes: []mobs.InteractionNode{{
			ID:      "catalog",
			Lines:   []string{"pick one"},
			Rows:    mobs.RowSourceAscensionCatalog,
			Rewards: rewards,
		}}},
	}
}

func twoEntryCatalog() Catalog {
	return CatalogOf(
		Entry{UnlockKey: "RimeBurst", Skill: &skills.SkillDefinition{Name: "RimeBurst"}},
		Entry{UnlockKey: "KeenEye", Skill: &skills.SkillDefinition{Name: "KeenEye"}},
	)
}

func TestCrossValidate_AcceptsListsOfKnownRewards(t *testing.T) {
	warnings, err := CrossValidate(fakeConversants{
		site("VillageStone", "RimeBurst", "KeenEye"),
		site("FrontStone", "KeenEye"),
	}, twoEntryCatalog())
	require.NoError(t, err)
	assert.Empty(t, warnings, "every entry is offered somewhere")
}

// ⭐ P4, and it is C3's own lesson from the archived plan repeated one layer up:
// an unvalidated reference does not fail loudly, it renders as a row that is
// locked, unpickable and indistinguishable from a gate that is merely hard —
// discovered, if ever, by the player who spent a life chasing it.
func TestCrossValidate_RejectsARewardKeyNoEntryClaims(t *testing.T) {
	_, err := CrossValidate(fakeConversants{
		site("VillageStone", "RimeBurst", "Paralyze"),
	}, twoEntryCatalog())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Paralyze")
	// The mob and the node, because "which file do I open" is the whole value of
	// a boot failure over a silent one.
	assert.Contains(t, err.Error(), "VillageStone")
	assert.Contains(t, err.Error(), "catalog")
}

// P7: the mirror hazard. Under D5 nothing is served implicitly any more, so a
// reward file nobody placed on a stone is dead content — and a WARNING rather
// than a failure, following quests.CrossValidate's rule for content that loads
// but cannot be reached: authoring the file and placing it are two edits and the
// order between them stays free.
func TestCrossValidate_WarnsAboutAnEntryNoSiteOffers(t *testing.T) {
	warnings, err := CrossValidate(fakeConversants{
		site("VillageStone", "RimeBurst"),
	}, twoEntryCatalog())
	require.NoError(t, err, "unreachable content loads and runs; it is not a boot failure")
	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "KeenEye")
}

// A node that generates no rows, and one that generates the MEMORIAL's, carry no
// reward list and must not be read as sites. The loader already refuses `rewards`
// on either, so this is the belt to that braces: a second row source landing here
// must not silently start consuming the catalog.
func TestCrossValidate_IgnoresEveryNodeThatIsNotACatalogNode(t *testing.T) {
	plain := &mobs.MobDefinition{
		Name: "TownCrier",
		Interaction: &mobs.Interaction{Nodes: []mobs.InteractionNode{
			{ID: "root", Lines: []string{"news"}},
			{ID: "dead", Lines: []string{"the fallen"}, Rows: mobs.RowSourceMemorialNames},
		}},
	}
	warnings, err := CrossValidate(fakeConversants{plain, site("VillageStone", "RimeBurst", "KeenEye")}, twoEntryCatalog())
	require.NoError(t, err)
	assert.Empty(t, warnings)
}

// A mob with no conversation at all is the overwhelming majority of the roster,
// so the nil deref would be found by the first boot rather than by a test — but
// it would be found by a boot, which is the whole point of pinning it.
func TestCrossValidate_SkipsMobsThatDoNotTalk(t *testing.T) {
	_, err := CrossValidate(fakeConversants{
		{Name: "Wolf"},
		site("VillageStone", "RimeBurst", "KeenEye"),
	}, twoEntryCatalog())
	require.NoError(t, err)
}

// ⚑ An EMPTY catalog with no site offering anything is legitimate: the directory
// shipped README-only once, and D14 makes an exhausted list an ordinary end
// state. Nothing to check and nothing to warn about.
func TestCrossValidate_AcceptsAnEmptyCatalogAndAnEmptySite(t *testing.T) {
	warnings, err := CrossValidate(fakeConversants{site("VillageStone")}, CatalogOf())
	require.NoError(t, err)
	assert.Empty(t, warnings)
}
