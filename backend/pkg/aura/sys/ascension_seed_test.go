package sys

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// The bloodline gift these tests seed: a second skill beside the fixture's
// Harvest, so "was it seeded" and "was it restored" can never be the same
// assertion.
var seedTestBequestJSON = []byte(`{
  "id": 42,
  "name": "Bequest",
  "category": "passive",
  "maxLevel": 5,
  "effects": [{"type": "stat_multiplier", "stat": "maxHealth", "statBonus": 0.1}]
}`)

// withBloodlineSkills swaps in a registry that carries both Harvest and
// Bequest. player.New reads the registry at construction, so this must happen
// before the join.
func withBloodlineSkills(t *testing.T, g *stateFakeGame) {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"harvest.json": {Data: stateTestHarvestJSON},
		"bequest.json": {Data: seedTestBequestJSON},
	}, nil)
	require.NoError(t, err)
	g.skillReg = r
}

// joinWithBloodline is joinWithState plus D16's ticket carriage: the slot's
// accumulated unlocks, resolved at /select and applied at join.
func joinWithBloodline(t *testing.T, s *ConnectionStateSystem, g *stateFakeGame, c *fakeClient,
	name string, state persist.CharacterState, unlocks []string,
) model.PlayerEntity {
	t.Helper()
	nextTestAccountID++
	store, ok := s.tickets.(*auth.TicketStore)
	require.True(t, ok, "the fixture installs a real TicketStore")
	state.CharacterID = nextTestAccountID
	token, err := store.Mint(auth.Ticket{
		AccountID:        nextTestAccountID,
		CharacterID:      nextTestAccountID,
		Name:             name,
		Avatar:           "default",
		Faction:          "aligned",
		State:            state,
		BloodlineUnlocks: unlocks,
	})
	require.NoError(t, err)

	sp := spectatorFor(c)
	g.AddEntity(sp)
	c.joins = append(c.joins, &model.Join{PlayTicket: token})
	before := len(g.players)
	s.Update(0)
	require.Len(t, g.players, before+1, "join should create a player")
	return g.players[len(g.players)-1]
}

// The successor's whole reward, arriving: a brand-new character boots already
// knowing what its bloodline learned in every past life.
func TestJoinSeedsTheBloodlineUnlocks(t *testing.T) {
	s, g := newStateFixture(t)
	withBloodlineSkills(t, g)

	p := joinWithBloodline(t, s, g, newFakeClient(), "Heir", persist.CharacterState{}, []string{"Bequest"})

	assert.True(t, p.SkillComponent().HasDiscovered(42), "the bloodline gift is in the spellbook")
	assert.Equal(t, 1, p.SkillComponent().SkillLevel(42), "seeded at level 1")
}

// A first life seeds nothing and must not disturb what creation set up.
func TestJoinWithNoBloodlineChangesNothing(t *testing.T) {
	s, g := newStateFixture(t)
	withBloodlineSkills(t, g)

	p := joinWithBloodline(t, s, g, newFakeClient(), "Firstborn", persist.CharacterState{}, nil)

	assert.False(t, p.SkillComponent().HasDiscovered(42))
}

// ⚑ THE §7 PIN, and it runs against the REAL restore path rather than a fresh
// join, because that is where D16's "idempotent, harmless" claim meets an
// actual overwrite. A returning character has a non-empty persisted spellbook,
// so restoreCharacterState runs in full — including SetActiveAura, the call
// that made writing spellbook rows at creation the rejected design.
//
// The seed must leave every restored fact standing: levels, the equipped
// loadout, and the aura still switched ON.
func TestJoinSeedsWithoutDisturbingTheRestoredLoadout(t *testing.T) {
	s, g := newStateFixture(t)
	withBloodlineSkills(t, g)

	p := joinWithBloodline(t, s, g, newFakeClient(), "Returning", persist.CharacterState{
		Level:          5,
		Spellbook:      map[int32]int{41: 3},
		Loadout:        []persist.LoadoutSlot{{Type: persist.SlotAura, Index: 0, SkillID: 41}},
		ActiveAuraSlot: 0,
	}, []string{"Bequest"})

	sc := p.SkillComponent()
	assert.Equal(t, 0, sc.ActiveAuraSlot, "the restored aura is still ACTIVE, not switched off")
	require.NotNil(t, sc.AuraSlots[0])
	assert.Equal(t, skills.SkillID(41), sc.AuraSlots[0].Def.ID)
	assert.Equal(t, 3, sc.SkillLevel(41), "the persisted level survives")
	assert.True(t, sc.HasDiscovered(42), "and the bloodline gift arrived anyway")
}

// ⚑ Reapplying on every join until the first save persists them is the design
// (D16), so the seed must never overwrite a level. A bloodline skill trained to
// 4 that reset to 1 on every login would be a slow, silent theft.
func TestJoinSeedNeverResetsALeveledBloodlineSkill(t *testing.T) {
	s, g := newStateFixture(t)
	withBloodlineSkills(t, g)

	p := joinWithBloodline(t, s, g, newFakeClient(), "Veteran", persist.CharacterState{
		Level:          9,
		Spellbook:      map[int32]int{42: 4},
		ActiveAuraSlot: persist.NoActiveAura,
	}, []string{"Bequest"})

	assert.Equal(t, 4, p.SkillComponent().SkillLevel(42), "the trained level wins over the seed")
}

// The database outlives the catalog: a reward retired from api/ascension/ still
// has rows naming it. Dropping it is the same stance restoreCharacterState
// takes for a retired spellbook entry, and the rest of the bloodline must still
// arrive.
func TestJoinSkipsARetiredUnlockKey(t *testing.T) {
	s, g := newStateFixture(t)
	withBloodlineSkills(t, g)

	p := joinWithBloodline(t, s, g, newFakeClient(), "Heir", persist.CharacterState{},
		[]string{"SkillThatWasDeleted", "Bequest"})

	assert.True(t, p.SkillComponent().HasDiscovered(42), "one bad key must not lose the rest")
}

// The seed DISCOVERS, it does not equip. Handing a returning player a loadout
// they did not choose would re-equip a skill they deliberately took off, on
// every single login.
func TestJoinSeedDoesNotEquipAnything(t *testing.T) {
	s, g := newStateFixture(t)
	withBloodlineSkills(t, g)

	p := joinWithBloodline(t, s, g, newFakeClient(), "Heir", persist.CharacterState{}, []string{"Bequest"})

	sc := p.SkillComponent()
	for i, slot := range sc.PassiveSlots {
		assert.Nil(t, slot, "passive slot %d must stay as the player left it", i)
	}
}

// §7 asks for MULTIPLE accumulated unlocks specifically, and the reason is
// D16's wording: a successor is seeded with every unlock the bloodline ever
// won, not just the newest pick. A seed that applied only the last one would
// pass every single-unlock test in this file.
func TestJoinSeedsEveryAccumulatedUnlockNotJustTheNewest(t *testing.T) {
	s, g := newStateFixture(t)
	withBloodlineSkills(t, g)

	p := joinWithBloodline(t, s, g, newFakeClient(), "Third", persist.CharacterState{},
		[]string{"Harvest", "Bequest"})

	sc := p.SkillComponent()
	assert.True(t, sc.HasDiscovered(41), "the first life's pick")
	assert.True(t, sc.HasDiscovered(42), "and the second's")
}
