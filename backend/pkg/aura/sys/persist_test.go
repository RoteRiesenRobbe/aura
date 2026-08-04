package sys

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// recordingSaves stands in for the writer: it records what the loop hands it,
// without a database or a goroutine.
type recordingSaves struct {
	saved   []persist.CharacterState
	failing bool
}

func (r *recordingSaves) Save(state persist.CharacterState) {
	r.saved = append(r.saved, state)
}

func (r *recordingSaves) Failing() bool { return r.failing }

func (r *recordingSaves) last(t *testing.T) persist.CharacterState {
	t.Helper()
	require.NotEmpty(t, r.saved, "expected at least one save")
	return r.saved[len(r.saved)-1]
}

// withSaves installs a recorder on a fixture.
func withSaves(s *ConnectionStateSystem) *recordingSaves {
	saves := &recordingSaves{}
	s.SetCharacterSaves(saves)
	return saves
}

// joinWithState runs a cold join carrying persisted character state, the way
// /select would hand it over.
func joinWithState(t *testing.T, s *ConnectionStateSystem, g *stateFakeGame, c *fakeClient,
	name string, state persist.CharacterState) model.PlayerEntity {
	t.Helper()
	nextTestAccountID++
	store, ok := s.tickets.(*auth.TicketStore)
	require.True(t, ok, "the fixture installs a real TicketStore")
	state.CharacterID = nextTestAccountID
	token, err := store.Mint(auth.Ticket{
		AccountID:   nextTestAccountID,
		CharacterID: nextTestAccountID,
		Name:        name,
		Avatar:      "default",
		Faction:     "aligned",
		State:       state,
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

// TestCharacterStateRoundTripsThroughAPlayer is the GAME-SIDE half of chunk 4's
// acceptance test: what a live player is snapshotted into must, applied to a
// fresh player, snapshot into exactly the same thing.
//
// ⚑ The store round-trip proves the SQL agrees with itself; this proves the
// game agrees with the mapping. A field the builder writes and the restore path
// ignores passes the first test and fails this one.
func TestCharacterStateRoundTripsThroughAPlayer(t *testing.T) {
	s, g := newStateFixture(t)
	harvest, err := g.Skills().Get(41)
	require.NoError(t, err)

	s.SetCampfireAnchors([]CampfireAnchor{
		{ID: "spawnpoint-1", Pos: phy.Vec2f{X: -20, Y: -20}, DwellRadius: 0.75, StartingSpawn: true},
		{ID: "spawnpoint-2", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75},
	})

	originClient := newFakeClient()
	origin := joinPlayer(t, s, g, originClient, "Barney")
	origin.SetProgression(model.PlayerProgression{Level: 9, Experience: 4321})
	// Bind by really dwelling: the snapshot must pick up what the game wrote,
	// not what the test wished for.
	origin.SetPosition(phy.Vec2f{X: 10, Y: 10})
	for i := 0; i < campfireDwellTicks; i++ {
		s.Update(0)
	}
	require.Equal(t, "spawnpoint-2", s.anchors[originClient.UUID()])
	sc := origin.SkillComponent()
	sc.Discover(harvest.ID)
	sc.EquipAura(1, harvest, 1)
	sc.EquipPassive(0, harvest, 1)
	sc.EquipCooldown(2, harvest, 1)
	sc.SetActiveAura(1)
	origin.QuestLedger().NoteKill(7)
	origin.QuestLedger().NoteTalkedTo(11)

	saved := characterState(99, origin.Name(), s.anchors[originClient.UUID()],
		s.DiscoveredCampfires(originClient.UUID()),
		origin.Progression(), origin.SkillComponent(), origin.QuestLedger())

	// Apply it to a brand-new player and snapshot again.
	restoredClient := newFakeClient()
	restored := joinWithState(t, s, g, restoredClient, "Fred", saved)
	reSaved := characterState(99, "Barney", s.anchors[restoredClient.UUID()],
		s.DiscoveredCampfires(restoredClient.UUID()),
		restored.Progression(), restored.SkillComponent(), restored.QuestLedger())

	assert.Equal(t, saved, reSaved, "a restored character must snapshot identically")
	assert.Equal(t, uint32(9), restored.Progression().Level)
	assert.Equal(t, uint64(4321), restored.Progression().Experience)
	assert.Equal(t, 1, restored.SkillComponent().ActiveAuraSlot)
	assert.Equal(t, uint64(1), restored.QuestLedger().KillCount(7))
	assert.True(t, restored.QuestLedger().HasTalkedTo(11))
}

// TestColdJoinWithNoSavedStateKeepsTheFreshComponent: an empty spellbook means
// "never saved", and the restore path must leave a brand-new character's
// starting state alone rather than clearing it.
func TestColdJoinWithNoSavedStateKeepsTheFreshComponent(t *testing.T) {
	s, g := newStateFixture(t)
	p := joinWithState(t, s, g, newFakeClient(), "Pebbles", persist.CharacterState{
		Level: 1, ActiveAuraSlot: persist.NoActiveAura, Spellbook: map[int32]int{},
	})
	assert.Equal(t, uint32(1), p.Progression().Level)
	assert.Equal(t, persist.NoActiveAura, p.SkillComponent().ActiveAuraSlot)
	assert.NotNil(t, p.SkillComponent().Spellbook, "a fresh player still has a spellbook to fill")
}

// TestRestoreDropsASlotForARetiredSkill: content can retire a skill, and a
// loadout slot naming one must not lock the character out of the game.
func TestRestoreDropsASlotForARetiredSkill(t *testing.T) {
	s, g := newStateFixture(t)
	p := joinWithState(t, s, g, newFakeClient(), "Wilma", persist.CharacterState{
		Level: 3, ActiveAuraSlot: 0,
		Spellbook: map[int32]int{41: 1, 999: 4},
		Loadout: []persist.LoadoutSlot{
			{Type: persist.SlotAura, Index: 0, SkillID: 999}, // no such skill any more
			{Type: persist.SlotPassive, Index: 0, SkillID: 41},
		},
	})
	assert.Nil(t, p.SkillComponent().AuraSlots[0], "the retired skill's slot is empty")
	require.NotNil(t, p.SkillComponent().PassiveSlots[0])
	assert.Equal(t, uint32(3), p.Progression().Level, "the character still loaded")

	// The SPELLBOOK row gets the same treatment (R4 C1 — Recall's retirement
	// is the first real instance): an unvalidated ghost id would ship on the
	// wire every tick and keep pricing skill points the player can never
	// refund (SpentPoints treats an unresolvable entry pessimistically).
	assert.NotContains(t, p.SkillComponent().Spellbook, skills.SkillID(999),
		"the retired skill's spellbook entry is dropped")
	assert.Contains(t, p.SkillComponent().Spellbook, skills.SkillID(41),
		"the surviving skill's entry loads")
}

// TestReconnectIgnoresPersistedState is §5's rule: load-from-DB is for cold
// logins only. The stashed live character is newer than any row, and a
// reconnect that reloaded would hand the player back whatever they had at their
// last autosave — silently undoing the minutes the stash exists to protect.
func TestReconnectIgnoresPersistedState(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Betty")
	p.SetProgression(model.PlayerProgression{Level: 12, Experience: 900})
	token := sentAcceptTokens(t, c)[0]

	g.RemoveEntity(p.Basic()) // socket drops; the character is stashed
	require.Contains(t, s.stashByToken, token)

	// A reconnect ticket carrying a STALE snapshot must not be applied.
	stash := s.stashByToken[token]
	store, ok := s.tickets.(*auth.TicketStore)
	require.True(t, ok)
	minted, err := store.Mint(auth.Ticket{
		AccountID: stash.accountID, CharacterID: stash.characterID, Name: "Betty",
		State: persist.CharacterState{Level: 1, ActiveAuraSlot: persist.NoActiveAura},
	})
	require.NoError(t, err)

	back := newFakeClient()
	g.AddEntity(spectatorFor(back))
	back.joins = append(back.joins, &model.Join{ReconnectToken: token, PlayTicket: minted})
	s.Update(0)

	resumed := g.players[len(g.players)-1]
	assert.Equal(t, uint32(12), resumed.Progression().Level, "the live character wins over the row")
	assert.Equal(t, uint64(900), resumed.Progression().Experience)
}

// TestSaveOnDisconnect is §2's cheapest trigger, and the one that covers the
// common case.
func TestSaveOnDisconnect(t *testing.T) {
	s, g := newStateFixture(t)
	saves := withSaves(s)
	p := joinPlayer(t, s, g, newFakeClient(), "Barney")
	p.SetProgression(model.PlayerProgression{Level: 6, Experience: 77})

	g.RemoveEntity(p.Basic())

	require.Len(t, saves.saved, 1)
	assert.Equal(t, 6, saves.last(t).Level)
	assert.Equal(t, int64(77), saves.last(t).Experience)
}

// TestSaveOnDeathPersistsThePostDeathNumbers.
//
// ⚑ Death routes through the same removal fan-out as a disconnect, AFTER
// LoseCurrentLevelExperience has run. Saving the pre-death numbers would hand a
// player their lost XP back for the price of a crash.
func TestSaveOnDeathPersistsThePostDeathNumbers(t *testing.T) {
	s, g := newStateFixture(t)
	saves := withSaves(s)
	p := joinPlayer(t, s, g, newFakeClient(), "Barney")
	p.SetProgression(model.PlayerProgression{Level: 4, Experience: 999999})

	kill(t, s, p)

	require.NotEmpty(t, saves.saved)
	saved := saves.last(t)
	assert.Equal(t, 4, saved.Level, "the level survives death")
	assert.Less(t, saved.Experience, int64(999999), "the lost current-level XP is what gets persisted")
}

// TestForcedSaveOnLevelUpAndSkillChange covers §2's forced events — the ones
// too visible and memorable to leave to the 5-minute interval.
func TestForcedSaveOnLevelUpAndSkillChange(t *testing.T) {
	s, g := newStateFixture(t)
	saves := withSaves(s)
	p := joinPlayer(t, s, g, newFakeClient(), "Barney")
	harvest, err := g.Skills().Get(41)
	require.NoError(t, err)

	s.Update(0) // establishes the baseline; nothing has changed yet
	require.Empty(t, saves.saved, "an unchanged character rides the interval")

	p.SetProgression(model.PlayerProgression{Level: 2})
	s.Update(0)
	require.Len(t, saves.saved, 1, "a level-up saves immediately")

	p.SkillComponent().Discover(harvest.ID)
	s.Update(0)
	require.Len(t, saves.saved, 2, "learning a skill saves immediately")

	p.SkillComponent().EquipAura(0, harvest, 1)
	s.Update(0)
	require.Len(t, saves.saved, 3, "a loadout change saves immediately")

	s.Update(0)
	assert.Len(t, saves.saved, 3, "...and nothing else does")
}

// TestForcedSaveOnQuestProgress, and its counterpart: a kill counter must NOT
// force one, or every mob a player kills becomes a database write.
func TestForcedSaveOnQuestProgress(t *testing.T) {
	s, g := newStateFixture(t)
	g.questReg = stateTestQuestRegistry(t)
	saves := withSaves(s)
	p := joinPlayer(t, s, g, newFakeClient(), "Barney")
	s.Update(0)
	require.Empty(t, saves.saved)

	for i := 0; i < 20; i++ {
		p.QuestLedger().NoteKill(3) // a species no quest objective names
	}
	s.Update(0)
	require.Empty(t, saves.saved, "counters ride the interval, like XP does")

	require.NoError(t, p.QuestLedger().Accept("cull"))
	s.Update(0)
	assert.Len(t, saves.saved, 1, "accepting a quest is a forced-save event")
}

// TestFlushLiveCharactersSnapshotsEveryone is the graceful-shutdown path:
// without it, a routine deploy is indistinguishable from a crash for every
// connected player.
func TestFlushLiveCharactersSnapshotsEveryone(t *testing.T) {
	s, g := newStateFixture(t)
	saves := withSaves(s)
	joinPlayer(t, s, g, newFakeClient(), "Barney")
	joinPlayer(t, s, g, newFakeClient(), "Fred")

	done := make(chan struct{})
	s.FlushLiveCharacters(done)
	s.Update(0)

	select {
	case <-done:
	default:
		t.Fatal("the flush request was never answered")
	}
	assert.Len(t, saves.saved, 2, "every live character is snapshotted")
}

// TestSessionExpirySavesFromTheStash is §2's last trigger. It normally writes
// nothing new — the writer's fingerprint drops an identical snapshot — but it is
// the only save left if the disconnect one never reached a database that has
// since come back.
func TestSessionExpirySavesFromTheStash(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Barney")
	p.SetProgression(model.PlayerProgression{Level: 8, Experience: 42})
	g.RemoveEntity(p.Basic())

	saves := withSaves(s) // installed AFTER the disconnect, so only the sweep records
	g.tick += reconnectStashTTLTicks + 1
	s.Update(0)

	require.Len(t, saves.saved, 1)
	assert.Equal(t, 8, saves.last(t).Level)
	assert.Equal(t, "Barney", saves.last(t).Name)
}

// TestDeathKeepsTheAccountConnected.
//
// ⚑ Death runs through removeFromPlayers, which does the full disconnect
// bookkeeping — including marking the account's session STASHED and forgetting
// which character the connection plays — while the socket is still open and the
// player is one click from respawning. Without handleDeath putting both back, a
// death quietly freed the account's slot to a second tab, and the respawned
// character then saved to nowhere.
func TestDeathKeepsTheAccountConnected(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Barney")
	accountID := s.accountByClient[c.UUID()]
	characterID := s.characterByClient[c.UUID()]
	require.NotZero(t, accountID)
	require.NotZero(t, characterID)

	kill(t, s, p)

	assert.Equal(t, accountID, s.accountByClient[c.UUID()], "a dead player is still logged in")
	assert.Equal(t, characterID, s.characterByClient[c.UUID()])
	sessions, ok := s.sessions.(*auth.SessionRegistry)
	require.True(t, ok)
	_, connected := sessions.Connected(accountID)
	assert.True(t, connected, "dying must not free the account's session slot")
}

// TestRespawnedCharacterStillSaves is the consequence of the above: the save
// path has to still know which row a respawned player writes to.
func TestRespawnedCharacterStillSaves(t *testing.T) {
	s, g := newStateFixture(t)
	saves := withSaves(s)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Barney")
	characterID := s.characterByClient[c.UUID()]
	kill(t, s, p)

	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)
	revived := g.players[len(g.players)-1]
	revived.SetProgression(model.PlayerProgression{Level: 5})
	s.Update(0)

	saved := saves.last(t)
	assert.Equal(t, characterID, saved.CharacterID)
	assert.Equal(t, 5, saved.Level)
}

// TestFailingSavesWarnThePlayer is §5b: a persistent write failure must reach
// the player. Silently accruing forty minutes of doomed progress is worse.
//
// ⚑ The grace period is the part worth pinning. The writer reports Failing()
// after ONE failed attempt, which a database restart produces routinely and the
// retry ladder then fixes by itself — warning on that would train players to
// ignore the message that matters.
func TestFailingSavesWarnThePlayer(t *testing.T) {
	s, g := newStateFixture(t)
	saves := withSaves(s)
	c := newFakeClient()
	joinPlayer(t, s, g, c, "Barney")

	saves.failing = true
	s.Update(0)
	assert.Empty(t, c.journals, "a momentary blip is not worth a banner")

	g.tick += saveFailureGraceTicks
	s.Update(0)
	require.Len(t, c.journals, 1, "a sustained failure is")
	assert.Contains(t, c.journals[0], "cannot save")

	s.Update(0)
	assert.Len(t, c.journals, 1, "and it does not repeat every tick")

	saves.failing = false
	s.Update(0)
	require.Len(t, c.journals, 2)
	assert.Contains(t, c.journals[1], "saved again", "recovery is worth saying too")
}

// TestCharacterStateEncodesTheQuestLedgerAsThreeRows keeps the game-side
// builder honest about the flag shape the schema expects.
func TestCharacterStateEncodesTheQuestLedgerAsThreeRows(t *testing.T) {
	ledger := quests.NewLedger(nil)
	ledger.NoteKill(3)
	ledger.NoteTalkedTo(9)

	state := characterState(7, "Barney", "", nil, model.PlayerProgression{Level: 1},
		skills.NewSkillComponent(true), ledger)

	assert.Equal(t, json.RawMessage(`{"3":1}`), state.Flags[quests.FlagKillCounts])
	assert.Equal(t, json.RawMessage(`[9]`), state.Flags[quests.FlagTalkedTo])
}
