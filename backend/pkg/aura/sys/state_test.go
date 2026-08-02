package sys

import (
	"net/http"
	"testing"
	"testing/fstest"

	"github.com/EngoEngine/ecs"
	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/spectator"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// fakeClient is the first model.Client test double (chunk 4): queueable
// Join/Respawn messages, everything else inert.
type fakeClient struct {
	uuid      uuid.UUID
	joins     []*model.Join
	respawns  []*model.Respawn
	interacts []*model.Interact
	sent      [][]byte
	unlocks   []capturedUnlock
	journals  []string
	abandons  []*model.AbandonQuest
}

// capturedUnlock records one SendUnlock call for the attribution tests.
type capturedUnlock struct {
	skillID uint64
	source  string
}

func newFakeClient() *fakeClient {
	return &fakeClient{uuid: uuid.New()}
}

func (c *fakeClient) NextJoin() *model.Join {
	if len(c.joins) == 0 {
		return nil
	}
	j := c.joins[0]
	c.joins = c.joins[1:]
	return j
}

func (c *fakeClient) NextRespawn() *model.Respawn {
	if len(c.respawns) == 0 {
		return nil
	}
	r := c.respawns[0]
	c.respawns = c.respawns[1:]
	return r
}

// A real queue, not an inert stub: the interact verb's whole server half is
// "what happens when this drains" (chunk 3b-i).
func (c *fakeClient) NextInteract() *model.Interact {
	if len(c.interacts) == 0 {
		return nil
	}
	i := c.interacts[0]
	c.interacts = c.interacts[1:]
	return i
}

func (c *fakeClient) NextInput() *model.PlayerInput       { return nil }
func (c *fakeClient) NextCheat() *model.Cheat             { return nil }
func (c *fakeClient) NextChatMessage() *model.ChatMessage { return nil }
func (c *fakeClient) NextEquip() *model.EquipSkill        { return nil }
func (c *fakeClient) NextSpendSkillPoint() *model.SpendSkillPoint {
	return nil
}

func (c *fakeClient) NextRespec() *model.Respec {
	return nil
}

// A real queue like the interacts above: the abandon verb's whole server half
// is what happens when this drains (chunk C3, D13).
func (c *fakeClient) NextAbandonQuest() *model.AbandonQuest {
	if len(c.abandons) == 0 {
		return nil
	}
	a := c.abandons[0]
	c.abandons = c.abandons[1:]
	return a
}

func (c *fakeClient) SendMessage(b []byte) error { c.sent = append(c.sent, b); return nil }
func (c *fakeClient) SendUnlock(id uint64, source string) error {
	c.unlocks = append(c.unlocks, capturedUnlock{id, source})
	return nil
}
func (c *fakeClient) SendJournal(text string) error {
	c.journals = append(c.journals, text)
	return nil
}
func (c *fakeClient) Close()          {}
func (c *fakeClient) UUID() uuid.UUID { return c.uuid }

// minimal skill content so the real player.New can initialize its component
// (the C1 peasant start equips Harvest).
var stateTestHarvestJSON = []byte(`{
  "id": 41,
  "name": "Harvest",
  "category": "active_aura",
  "maxLevel": 1,
  "effects": [{"type": "damage_aura", "radius": 1, "damageHP": 5, "targetsEnemies": true}]
}`)

func stateTestSkillRegistry(t *testing.T) skills.Registry {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"harvest.json": {Data: stateTestHarvestJSON},
	}, nil)
	require.NoError(t, err)
	return r
}

// stateFakeGame routes add/remove the way the real game does for the
// ConnectionStateSystem: players/spectators register with the system, removal
// fans out synchronously to system.Remove. Corpses are only recorded.
type stateFakeGame struct {
	cs         *ConnectionStateSystem
	cfg        *cfg.GameConfig
	skillReg   skills.Registry
	questReg   quests.Registry
	players    []model.PlayerEntity
	corpses    []model.CorpseEntity
	removed    []uint64
	spectators []model.Spectator
	tick       uint64
}

func newStateFakeGame(t *testing.T) *stateFakeGame {
	g := &stateFakeGame{
		cfg:      &cfg.GameConfig{},
		skillReg: stateTestSkillRegistry(t),
	}
	g.cfg.PlayerConfig.BaseHealth = 100
	return g
}

func (g *stateFakeGame) AddEntity(e model.BasicEntity) {
	switch v := e.(type) {
	case model.PlayerEntity:
		g.players = append(g.players, v)
		g.cs.AddPlayer(v)
	case model.Spectator:
		g.spectators = append(g.spectators, v)
		g.cs.AddSpectator(v)
	case model.CorpseEntity:
		g.corpses = append(g.corpses, v)
	}
}

func (g *stateFakeGame) RemoveEntity(e ecs.BasicEntity) {
	g.removed = append(g.removed, e.ID())
	g.cs.Remove(e)
}

func (g *stateFakeGame) wasRemoved(id uint64) bool {
	for _, r := range g.removed {
		if r == id {
			return true
		}
	}
	return false
}

// livingCorpses are corpses added but not (yet) removed.
func (g *stateFakeGame) livingCorpses() []model.CorpseEntity {
	var out []model.CorpseEntity
	for _, c := range g.corpses {
		if !g.wasRemoved(c.Basic().ID()) {
			out = append(out, c)
		}
	}
	return out
}

// livingSpectators are spectators added but not (yet) removed.
func (g *stateFakeGame) livingSpectators() []model.Spectator {
	var out []model.Spectator
	for _, sp := range g.spectators {
		if !g.wasRemoved(sp.Basic().ID()) {
			out = append(out, sp)
		}
	}
	return out
}

func (g *stateFakeGame) Ticks() uint64                                 { return g.tick }
func (g *stateFakeGame) Bounds() (float32, float32)                    { return 60, 40 }
func (g *stateFakeGame) Config() *cfg.GameConfig                       { return g.cfg }
func (g *stateFakeGame) Skills() skills.Registry                       { return g.skillReg }
func (g *stateFakeGame) Handler(func(*http.Request) bool) http.Handler { panic("unused") }
func (g *stateFakeGame) Loop()                                         { panic("unused") }
func (g *stateFakeGame) GetEntity(uint64) (model.BasicEntity, error)   { panic("unused") }
func (g *stateFakeGame) Mobs() mobs.Registry                           { panic("unused") }
func (g *stateFakeGame) Quests() quests.Registry                       { return g.questReg }

// newStateFixture wires a ConnectionStateSystem to a fake game and returns both.
//
// ⚑ It installs the REAL ticket store and session registry, not stubs. Both are
// pure in-memory Go with no database behind them, so the tests exercise the
// actual join path — ticket required, account slot claimed atomically — rather
// than a fallback that only exists in tests.
func newStateFixture(t *testing.T) (*ConnectionStateSystem, *stateFakeGame) {
	t.Helper()
	g := newStateFakeGame(t)
	s := NewConnectionStateSystem(g)
	s.SetIdentity(auth.NewTicketStore(auth.TicketTTL), auth.NewSessionRegistry())
	g.cs = s
	return s, g
}

// nextTestAccountID hands each test character its own account, so the
// one-session-per-account rule does not make two unrelated joins collide.
var nextTestAccountID int64

// ticketFor mints a real play ticket for a name, the way /select would.
func ticketFor(t *testing.T, s *ConnectionStateSystem, name string) string {
	t.Helper()
	nextTestAccountID++
	store, ok := s.tickets.(*auth.TicketStore)
	require.True(t, ok, "the fixture installs a real TicketStore")
	token, err := store.Mint(auth.Ticket{
		AccountID:   nextTestAccountID,
		CharacterID: nextTestAccountID,
		Name:        name,
		Avatar:      "default",
		Faction:     "aligned",
	})
	require.NoError(t, err)
	return token
}

// reconnectTicket mints a ticket for the account that owns a stashed character.
//
// ⚑ A reconnect must prove IDENTITY, not just possession of the token
// (plan-accounts-frontend.md §8): the stash records which account it belongs to,
// and a ticket naming a different one is refused. Tests therefore have to mint
// against the stash's account rather than a fresh one.
func reconnectTicket(t *testing.T, s *ConnectionStateSystem, token, name string) string {
	t.Helper()
	stash, ok := s.stashByToken[token]
	require.True(t, ok, "no stash for token %q", token)
	store, ok := s.tickets.(*auth.TicketStore)
	require.True(t, ok)
	minted, err := store.Mint(auth.Ticket{
		AccountID:   stash.accountID,
		CharacterID: stash.accountID,
		Name:        name,
		Avatar:      "default",
		Faction:     "aligned",
	})
	require.NoError(t, err)
	return minted
}

// joinPlayer runs the full join flow for a fresh client and returns the player.
func joinPlayer(t *testing.T, s *ConnectionStateSystem, g *stateFakeGame, c *fakeClient, name string) model.PlayerEntity {
	t.Helper()
	sp := spectatorFor(c)
	g.AddEntity(sp)
	// ⚑ The name rides the TICKET now, not the wire: a fresh join without one is
	// refused outright (step 8a chunk 3).
	c.joins = append(c.joins, &model.Join{PlayTicket: ticketFor(t, s, name)})
	before := len(g.players)
	s.Update(0)
	require.Len(t, g.players, before+1, "join should create a player")
	return g.players[len(g.players)-1]
}

func kill(t *testing.T, s *ConnectionStateSystem, p model.PlayerEntity) {
	t.Helper()
	p.VitalSigns().Health = 0
	s.Update(0)
}

func TestDeath_SpawnsCorpseAtDeathspotAndReservesName(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	deathspot := phy.Vec2f{X: 7, Y: -3}
	p.SetPosition(deathspot)

	kill(t, s, p)

	corpses := g.livingCorpses()
	require.Len(t, corpses, 1, "death must spawn exactly one corpse")
	assert.InDelta(t, deathspot.X, corpses[0].Position().X, 1e-5)
	assert.InDelta(t, deathspot.Y, corpses[0].Position().Y, 1e-5)

	// the name stays reserved while dead: a second joiner gets mangled
	assert.True(t, s.names.contains("Alice"), "dead player's name must stay reserved")
	c2 := newFakeClient()
	p2 := joinPlayer(t, s, g, c2, "Alice")
	assert.NotEqual(t, "Alice", p2.Name(), "second joiner must not get the reserved name")
}

func TestRespawn_ReusesNameRestoresStateRemovesCorpse(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetProgression(model.PlayerProgression{Level: 5})
	kill(t, s, p)
	corpse := g.livingCorpses()[0]

	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)

	require.Len(t, g.players, 2, "respawn should create a new player entity")
	np := g.players[1]
	assert.Equal(t, "Alice", np.Name(), "respawn must reuse the reserved name without mangling")
	assert.Equal(t, uint32(5), np.Progression().Level, "respawn must restore carried progression")
	assert.True(t, g.wasRemoved(corpse.Basic().ID()), "respawn must remove the corpse")
	assert.Empty(t, s.deadByClient, "dead state (incl. carried progression) must be consumed on respawn")
	assert.True(t, s.names.contains("Alice"), "name stays registered for the living player")
}

func TestRespawn_WithoutDeadStateIsIgnored(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	sp := spectatorFor(c)
	g.AddEntity(sp)

	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)

	assert.Empty(t, g.players, "a never-joined spectator's Respawn must be ignored")
	assert.Empty(t, c.respawns, "the stray Respawn must still be consumed")
}

func TestDwell_BindsAnchorAfterThresholdInsideDwellRadius(t *testing.T) {
	s, g := newStateFixture(t)
	fire := CampfireAnchor{ID: "spawnpoint-1", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}
	s.SetCampfireAnchors([]CampfireAnchor{fire})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	// outside the dwell radius but plausibly inside heal range: never binds
	p.SetPosition(phy.Vec2f{X: 11.2, Y: 10})
	for i := 0; i < campfireDwellTicks+10; i++ {
		s.Update(0)
	}
	assert.Empty(t, s.anchors, "standing outside the dwell radius must not bind")

	// inside, but leaving before the threshold resets the counter
	p.SetPosition(phy.Vec2f{X: 10.2, Y: 10})
	for i := 0; i < campfireDwellTicks-1; i++ {
		s.Update(0)
	}
	p.SetPosition(phy.Vec2f{X: 20, Y: 10})
	s.Update(0)
	p.SetPosition(phy.Vec2f{X: 10.2, Y: 10})
	for i := 0; i < campfireDwellTicks-1; i++ {
		s.Update(0)
	}
	assert.Empty(t, s.anchors, "leaving before the threshold must reset the dwell counter")

	// completing the dwell binds and stamps the one-tick feedback
	assert.False(t, p.CampfireBound(), "no bind stamp before the threshold")
	s.Update(0)
	require.Len(t, s.anchors, 1)
	assert.Equal(t, fire.ID, s.anchors[c.UUID()])
	assert.True(t, p.CampfireBound(), "completing the dwell must stamp campfire_bound")

	// the stamp is one-shot: staying at the fire doesn't re-stamp
	p.(interface{ ResetTickNumbers() }).ResetTickNumbers()
	s.Update(0)
	assert.False(t, p.CampfireBound(), "staying bound must not re-stamp")
}

func TestRespawn_SpawnsAtAnchorWithJitter(t *testing.T) {
	s, g := newStateFixture(t)
	fire := CampfireAnchor{ID: "spawnpoint-1", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}
	s.SetCampfireAnchors([]CampfireAnchor{fire})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetPosition(phy.Vec2f{X: 10, Y: 10})
	for i := 0; i < campfireDwellTicks; i++ {
		s.Update(0)
	}
	require.Len(t, s.anchors, 1, "dwell must bind before dying")

	kill(t, s, p)
	require.Len(t, s.anchors, 1, "the campfire bind must survive death")

	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)

	require.Len(t, g.players, 2)
	np := g.players[1]
	dist := np.Position().Sub(fire.Pos).Abs()
	assert.LessOrEqual(t, dist, float32(respawnJitterRadius)+1e-5,
		"respawn must land at the anchor (within jitter)")
}

// Triage item 5: fresh / unbound arrivals spawn only at campfires flagged
// startingSpawn, never at the others (here the Z2 fire) — so the west village
// fire is the deterministic start.
func TestDefaultSpawn_OnlyAtStartingSpawnFires(t *testing.T) {
	s, _ := newStateFixture(t)
	start := CampfireAnchor{ID: "spawnpoint-1", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75, StartingSpawn: true}
	other := CampfireAnchor{ID: "spawnpoint-2", Pos: phy.Vec2f{X: -30, Y: -30}, DwellRadius: 0.75}
	// Unflagged fire first, on purpose — a naive random pick would hit it ~half
	// the time.
	s.SetCampfireAnchors([]CampfireAnchor{other, start})

	for i := 0; i < 200; i++ {
		pos := s.defaultSpawnPosition()
		dist := pos.Sub(start.Pos).Abs()
		require.LessOrEqual(t, dist, float32(start.DwellRadius)+1e-4,
			"a fresh spawn must land at the flagged starting fire, never the unflagged one")
	}
}

// joinPlayerWithState runs the join flow for a client whose play ticket carries
// persisted character state — the COLD LOGIN path, the only one that reads
// home_campfire_id.
func joinPlayerWithState(t *testing.T, s *ConnectionStateSystem, g *stateFakeGame,
	c *fakeClient, name string, state persist.CharacterState) model.PlayerEntity {
	t.Helper()
	sp := spectatorFor(c)
	g.AddEntity(sp)
	nextTestAccountID++
	store, ok := s.tickets.(*auth.TicketStore)
	require.True(t, ok, "the fixture installs a real TicketStore")
	token, err := store.Mint(auth.Ticket{
		AccountID:   nextTestAccountID,
		CharacterID: nextTestAccountID,
		Name:        name,
		Avatar:      "default",
		Faction:     "aligned",
		State:       state,
	})
	require.NoError(t, err)
	c.joins = append(c.joins, &model.Join{PlayTicket: token})
	before := len(g.players)
	s.Update(0)
	require.Len(t, g.players, before+1, "join should create a player")
	return g.players[len(g.players)-1]
}

// The bind records the fire's SPAWN-POINT ID, not its position: the id is what
// survives a restart, and resolving it back to a position through the placed
// campfires is what lets a moved fire keep its dwellers.
func TestDwell_BindsSpawnPointID(t *testing.T) {
	s, g := newStateFixture(t)
	fire := CampfireAnchor{ID: "spawnpoint-7", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}
	s.SetCampfireAnchors([]CampfireAnchor{fire})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	p.SetPosition(phy.Vec2f{X: 10, Y: 10})
	for i := 0; i < campfireDwellTicks; i++ {
		s.Update(0)
	}

	require.Len(t, s.anchors, 1)
	assert.Equal(t, "spawnpoint-7", s.anchors[c.UUID()])
	pos, ok := s.AnchorOf(c.UUID())
	require.True(t, ok, "the bind must resolve back to a position")
	assert.Equal(t, fire.Pos, pos)
}

// ⚑ Found by the browser harness, not by reasoning: the dwell counter only ever
// reset when a player was near NO fire, so going straight from one fire's bind
// radius into another's kept incrementing the FIRST fire's count. Past the
// threshold the exactly-equal bind check never fires again, and the player stays
// bound to a campfire they have left — which is a wrong "last campfire" long
// before persistence gets involved.
func TestDwell_RebindsWhenMovingStraightToAnotherFire(t *testing.T) {
	s, g := newStateFixture(t)
	first := CampfireAnchor{ID: "spawnpoint-1", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75, StartingSpawn: true}
	second := CampfireAnchor{ID: "spawnpoint-2", Pos: phy.Vec2f{X: -30, Y: -30}, DwellRadius: 0.75}
	s.SetCampfireAnchors([]CampfireAnchor{first, second})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	p.SetPosition(first.Pos)
	for i := 0; i < campfireDwellTicks+20; i++ { // well past the threshold
		s.Update(0)
	}
	require.Equal(t, "spawnpoint-1", s.anchors[c.UUID()])

	// Straight from one bind radius into the other, never standing clear of both.
	p.SetPosition(second.Pos)
	for i := 0; i < campfireDwellTicks; i++ {
		s.Update(0)
	}

	assert.Equal(t, "spawnpoint-2", s.anchors[c.UUID()],
		"dwelling at a second fire must re-bind to it")
}

// The bug this whole change exists for: logging in put the character at a random
// starting fire because the bind lived only in memory.
func TestColdJoin_SpawnsAtThePersistedSpawnPoint(t *testing.T) {
	s, g := newStateFixture(t)
	start := CampfireAnchor{ID: "spawnpoint-1", Pos: phy.Vec2f{X: -20, Y: -20}, DwellRadius: 0.75, StartingSpawn: true}
	bound := CampfireAnchor{ID: "spawnpoint-2", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}
	s.SetCampfireAnchors([]CampfireAnchor{start, bound})

	c := newFakeClient()
	p := joinPlayerWithState(t, s, g, c, "Alice", persist.CharacterState{
		CharacterID: 1, Level: 3, HomeCampfireID: "spawnpoint-2",
	})

	dist := p.Position().Sub(bound.Pos).Abs()
	assert.LessOrEqual(t, dist, float32(respawnJitterRadius)+1e-5,
		"a cold login must land at the bound fire, not at a starting fire")
	// ⚑ The bind is re-installed, not merely used once: recall and the next
	// death both read s.anchors, and a player who logged in at their fire would
	// otherwise be unbound until they dwelled there again.
	assert.Equal(t, "spawnpoint-2", s.anchors[c.UUID()])
}

// A spawn point deleted in the zone editor must not strand or block its
// dwellers: the id simply stops resolving and the character is unbound, which
// falls through to the zone's default spawn — and the empty anchor map is what
// makes the next save write NULL and clear the dead id for good.
func TestColdJoin_UnknownSpawnPointFallsBackToDefaultSpawn(t *testing.T) {
	s, g := newStateFixture(t)
	start := CampfireAnchor{ID: "spawnpoint-1", Pos: phy.Vec2f{X: -20, Y: -20}, DwellRadius: 0.75, StartingSpawn: true}
	s.SetCampfireAnchors([]CampfireAnchor{start})

	c := newFakeClient()
	p := joinPlayerWithState(t, s, g, c, "Alice", persist.CharacterState{
		CharacterID: 1, Level: 3, HomeCampfireID: "spawnpoint-deleted",
	})

	dist := p.Position().Sub(start.Pos).Abs()
	assert.LessOrEqual(t, dist, float32(start.DwellRadius)+1e-4,
		"a retired spawn point must fall back to the zone's default spawn")
	assert.Empty(t, s.anchors, "an unresolvable id must leave the character UNBOUND, so the next save clears it")
}

func TestDisconnectWhileDead_StashesDeathSceneAndRemovesCorpse(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetCampfireAnchors([]CampfireAnchor{{ID: "spawnpoint-1", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetPosition(phy.Vec2f{X: 10, Y: 10})
	for i := 0; i < campfireDwellTicks; i++ {
		s.Update(0)
	}
	kill(t, s, p)
	corpse := g.livingCorpses()[0]
	require.Len(t, g.livingSpectators(), 1)

	// simulate the net-layer disconnect: RemoveEntity on the dead spectator
	g.RemoveEntity(g.livingSpectators()[0].Basic())

	assert.True(t, g.wasRemoved(corpse.Basic().ID()), "corpse must be removed on disconnect-while-dead")
	// Reconnect-token semantics: the character is stashed, so the name stays
	// reserved until the stash TTL expires (was: freed immediately).
	assert.True(t, s.names.contains("Alice"), "name must stay reserved while stashed")
	assert.Empty(t, s.deadByClient)
	assert.Empty(t, s.anchors, "campfire bind lives in the stash, not the live map")
	require.Len(t, s.stashByToken, 1, "disconnect-while-dead must stash the death scene")
	for _, stash := range s.stashByToken {
		assert.True(t, stash.dead)
		assert.NotEmpty(t, stash.anchor, "the campfire bind must be stashed")
	}
}

func TestJoinWhileDead_FreesOldNameAndCorpse(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetProgression(model.PlayerProgression{Level: 5})
	kill(t, s, p)
	corpse := g.livingCorpses()[0]

	c.joins = append(c.joins, &model.Join{PlayTicket: ticketFor(t, s, "Bob")})
	s.Update(0)

	require.Len(t, g.players, 2)
	np := g.players[1]
	assert.Equal(t, "Bob", np.Name())
	assert.Equal(t, uint32(5), np.Progression().Level, "a dead client's fresh Join still restores progression")
	assert.True(t, g.wasRemoved(corpse.Basic().ID()), "fresh Join must remove the corpse")
	assert.False(t, s.names.contains("Alice"), "fresh Join must free the previously reserved name")
	assert.Empty(t, s.deadByClient)
}

func TestSameTickDoubleDeath_ProcessesEachPlayerOnce(t *testing.T) {
	s, g := newStateFixture(t)
	cA, cB, cC := newFakeClient(), newFakeClient(), newFakeClient()
	pA := joinPlayer(t, s, g, cA, "A")
	pB := joinPlayer(t, s, g, cB, "B")
	pC := joinPlayer(t, s, g, cC, "C")
	_ = pB

	// A and C die in the same tick — the old live-slice iteration processed C
	// twice (double spectator + double corpse)
	pA.VitalSigns().Health = 0
	pC.VitalSigns().Health = 0
	s.Update(0)

	assert.Len(t, g.livingCorpses(), 2, "exactly one corpse per death")
	assert.Len(t, g.livingSpectators(), 2, "exactly one spectator per death")
}

func TestStaleJoin_DrainedOnDeath(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	// a Join banked while alive must not auto-revive the player on death
	c.joins = append(c.joins, &model.Join{PlayTicket: ticketFor(t, s, "Alice")})
	kill(t, s, p)
	s.Update(0)

	assert.Len(t, g.players, 1, "the stale Join must not silently respawn the player")
	assert.Empty(t, c.joins, "the stale Join must be drained at death")
}

// TestReconnectRestore_EmitsNoUnlockSpam pins that restoring a stashed
// character's spellbook on reconnect emits ZERO unlock attributions: reattach
// swaps the whole SkillComponent (SetSkillComponent), never routing through the
// Discover-per-grant sites — so a reload never re-announces the spellbook
// (plan-unlock-attribution.md).
func TestReconnectRestore_EmitsNoUnlockSpam(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	// A populated spellbook (as drops/teachings would build during play).
	p.SkillComponent().Discover(1)
	p.SkillComponent().Discover(2)

	token := s.tokenByClient[c.UUID()]
	require.NotEmpty(t, token, "first join mints a reconnect token")

	// Disconnect while alive → stash keyed by the token.
	g.RemoveEntity(p.Basic())
	require.Len(t, s.stashByToken, 1)

	// Reconnect: a fresh client Joins with the token; reattach restores.
	c2 := newFakeClient()
	sp := spectatorFor(c2)
	g.AddEntity(sp)
	c2.joins = append(c2.joins, &model.Join{ReconnectToken: token, PlayTicket: reconnectTicket(t, s, token, "Alice")})
	s.Update(0)

	np := g.players[len(g.players)-1]
	assert.True(t, np.SkillComponent().HasDiscovered(1), "spellbook restored")
	assert.True(t, np.SkillComponent().HasDiscovered(2), "spellbook restored")
	assert.Empty(t, c.unlocks, "original client sees no unlock on restore")
	assert.Empty(t, c2.unlocks, "reconnecting client sees no unlock spam")
}

func TestDisconnectAliveAfterRespawn_StashesInsteadOfDeadCleanup(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	kill(t, s, p)
	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)
	require.Len(t, g.players, 2)
	np := g.players[1]

	// disconnect while ALIVE: the delete-on-consume must have cleared the dead
	// marker, so the fan-out takes the alive-stash path (reconnect-token
	// semantics: name stays reserved in the stash, not freed).
	g.RemoveEntity(np.Basic())

	assert.True(t, s.names.contains("Alice"), "name stays reserved while stashed")
	assert.Empty(t, s.deadByClient, "no dead marker may survive the respawn")
	require.Len(t, s.stashByToken, 1)
	for _, stash := range s.stashByToken {
		assert.False(t, stash.dead, "an alive disconnect must stash an alive character")
	}
}

// --- revive (plan-skill-vocab chunk 3, §3.6) ---

func TestReviveAtCorpse_RestoresStateAtCorpseWithPartialHP(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetProgression(model.PlayerProgression{Level: 5})
	deathspot := phy.Vec2f{X: 12, Y: -8}
	p.SetPosition(deathspot)
	kill(t, s, p)
	corpse := g.livingCorpses()[0]
	spec := g.livingSpectators()[0]

	ok := s.ReviveAtCorpse(corpse.Basic().ID(), 0.3)
	require.True(t, ok, "reviving a waiting corpse must succeed")

	require.Len(t, g.players, 2, "revive rebuilds the player entity")
	np := g.players[1]
	assert.Equal(t, "Alice", np.Name(), "revive reuses the reserved name verbatim")
	assert.Equal(t, uint32(5), np.Progression().Level, "revive restores carried progression")
	assert.InDelta(t, deathspot.X, np.Position().X, 1e-5, "revive spawns at the corpse, not the anchor")
	assert.InDelta(t, deathspot.Y, np.Position().Y, 1e-5)
	assert.InDelta(t, float32(np.MaxHealth())*0.3, float32(np.VitalSigns().Health), 1e-3,
		"revived at the authored fraction of max HP")
	assert.True(t, g.wasRemoved(corpse.Basic().ID()), "revive removes the corpse")
	assert.True(t, g.wasRemoved(spec.Basic().ID()), "revive removes the dead client's spectator")
	assert.Empty(t, s.deadByClient, "the dead marker is consumed")
}

func TestReviveAtCorpse_UnknownCorpseNoOps(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	kill(t, s, p)

	ok := s.ReviveAtCorpse(9999, 0.3)
	assert.False(t, ok, "no corpse with that id → no revive")
	assert.Len(t, g.players, 1, "no new player built")
	assert.Len(t, s.deadByClient, 1, "the untouched dead marker stays")
}

func TestReviveAtCorpse_DisconnectRaceNoOps(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	kill(t, s, p)
	corpse := g.livingCorpses()[0]
	spec := g.livingSpectators()[0]

	// The dead client disconnects (spectator removed) before the revive lands:
	// removeFromSpectators consumes the marker, so the revive finds nothing.
	g.RemoveEntity(spec.Basic())
	assert.Empty(t, s.deadByClient, "disconnect-while-dead consumed the marker")

	ok := s.ReviveAtCorpse(corpse.Basic().ID(), 0.3)
	assert.False(t, ok, "a revive racing a disconnect must no-op")
	assert.Len(t, g.players, 1)
}

// spectatorFor builds a real spectator for a client at the origin.
func spectatorFor(c model.Client) model.Spectator {
	return spectator.NewSpectator(phy.VEC2F_ZERO, c)
}

// --- reconnect-token persistence (plan-reconnect-token.md) ---

// sentAcceptTokens decodes every Accept the client received and returns the
// reconnect tokens in order.
func sentAcceptTokens(t *testing.T, c *fakeClient) []string {
	t.Helper()
	var out []string
	for _, b := range c.sent {
		msg := AuraApi.GetRootAsServerMessage(b, 0)
		if msg.BodyType() != AuraApi.ServerMessageBodyAccept {
			continue
		}
		tbl := new(flatbuffers.Table)
		require.True(t, msg.Body(tbl))
		var acc AuraApi.Accept
		acc.Init(tbl.Bytes, tbl.Pos)
		out = append(out, string(acc.ReconnectToken()))
	}
	return out
}

// sentBodyTypes lists the body type of every server message the client received.
func sentBodyTypes(c *fakeClient) []AuraApi.ServerMessageBody {
	var out []AuraApi.ServerMessageBody
	for _, b := range c.sent {
		out = append(out, AuraApi.GetRootAsServerMessage(b, 0).BodyType())
	}
	return out
}

// reconnect runs the full join flow for a fresh connection presenting a token.
func reconnect(t *testing.T, s *ConnectionStateSystem, g *stateFakeGame, c *fakeClient, name, token string) {
	t.Helper()
	sp := spectatorFor(c)
	g.AddEntity(sp)
	// ⚑ A reconnect for a KNOWN stash must present a ticket for that stash's
	// account (identity, not possession); an unknown or already-live token has no
	// stash to match, so it carries an ordinary fresh ticket and degrades to a
	// fresh join — which is exactly what those two tests assert.
	ticket := ticketFor(t, s, name)
	if _, stashed := s.stashByToken[token]; stashed {
		ticket = reconnectTicket(t, s, token, name)
	}
	c.joins = append(c.joins, &model.Join{ReconnectToken: token, PlayTicket: ticket})
	s.Update(0)
}

func TestJoin_IssuesReconnectTokenOnAccept(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	joinPlayer(t, s, g, c, "Alice")

	tokens := sentAcceptTokens(t, c)
	require.Len(t, tokens, 1, "the join Accept must carry a reconnect token")
	assert.NotEmpty(t, tokens[0])
	assert.Equal(t, tokens[0], s.tokenByClient[c.UUID()], "the sent token must be registered for the connection")
}

func TestDisconnectAlive_StashesAndKeepsNameReserved(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	g.RemoveEntity(p.Basic()) // net-layer disconnect

	require.Len(t, s.stashByToken, 1, "disconnect must stash the character")
	assert.True(t, s.names.contains("Alice"), "name must stay reserved while stashed")
	assert.Empty(t, s.tokenByClient, "the dead connection's token registration must be dropped")

	c2 := newFakeClient()
	p2 := joinPlayer(t, s, g, c2, "Alice")
	assert.NotEqual(t, "Alice", p2.Name(), "a stash-reserved name must be mangled for new joiners")
}

func TestReconnect_RestoresCharacter(t *testing.T) {
	s, g := newStateFixture(t)
	fire := CampfireAnchor{ID: "spawnpoint-1", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}
	s.SetCampfireAnchors([]CampfireAnchor{fire})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetProgression(model.PlayerProgression{Level: 5, Experience: 1234})
	p.SetPosition(phy.Vec2f{X: 10, Y: 10})
	for i := 0; i < campfireDwellTicks; i++ {
		s.Update(0)
	}
	spot := phy.Vec2f{X: -13, Y: 4}
	p.SetPosition(spot)
	p.VitalSigns().Health = 42
	skillsBefore := p.SkillComponent()
	token := s.tokenByClient[c.UUID()]

	g.RemoveEntity(p.Basic()) // disconnect

	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)

	require.Len(t, g.players, 2, "reconnect must rebuild the player")
	np := g.players[1]
	assert.Equal(t, "Alice", np.Name(), "stashed name is reused verbatim — token wins over the Join name")
	assert.Equal(t, uint32(5), np.Progression().Level)
	assert.Equal(t, uint64(1234), np.Progression().Experience)
	assert.Same(t, skillsBefore, np.SkillComponent(), "the whole skill component is carried over")
	assert.InDelta(t, spot.X, np.Position().X, 1e-5, "reconnect restores the last position")
	assert.InDelta(t, spot.Y, np.Position().Y, 1e-5)
	assert.EqualValues(t, 42, np.VitalSigns().Health, "reconnect restores the exact HP, not full")
	assert.Equal(t, fire.ID, s.anchors[c2.UUID()], "the campfire bind survives the reconnect")
	assert.Empty(t, s.stashByToken, "the stash is consumed")
	assert.Equal(t, token, s.tokenByClient[c2.UUID()], "the token is re-registered for the new connection")

	tokens := sentAcceptTokens(t, c2)
	require.Len(t, tokens, 1)
	assert.Equal(t, token, tokens[0], "the reconnect Accept must carry the SAME token")
}

func TestReconnect_UnknownTokenJoinsFresh(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	reconnect(t, s, g, c, "Alice", "no-such-token")

	require.Len(t, g.players, 1, "an unknown token must degrade to a fresh join")
	p := g.players[0]
	assert.Equal(t, "Alice", p.Name())
	assert.Equal(t, uint32(1), p.Progression().Level)

	tokens := sentAcceptTokens(t, c)
	require.Len(t, tokens, 1)
	assert.NotEmpty(t, tokens[0])
	assert.NotEqual(t, "no-such-token", tokens[0], "a fresh token must be minted")
}

func TestReconnectWhileDead_RebuildsDeathScene(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetCampfireAnchors([]CampfireAnchor{{ID: "spawnpoint-1", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}})
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetProgression(model.PlayerProgression{Level: 5})
	p.SetPosition(phy.Vec2f{X: 10, Y: 10})
	for i := 0; i < campfireDwellTicks; i++ {
		s.Update(0)
	}
	deathspot := phy.Vec2f{X: 7, Y: -3}
	p.SetPosition(deathspot)
	token := s.tokenByClient[c.UUID()]
	kill(t, s, p)

	g.RemoveEntity(g.livingSpectators()[0].Basic()) // disconnect while dead
	require.Empty(t, g.livingCorpses(), "no lingering corpse while stashed")

	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)

	// the client is put back on the death overlay: Accept then Obituary
	types := sentBodyTypes(c2)
	require.Len(t, types, 2)
	assert.Equal(t, AuraApi.ServerMessageBodyAccept, types[0])
	assert.Equal(t, AuraApi.ServerMessageBodyObituary, types[1])

	corpses := g.livingCorpses()
	require.Len(t, corpses, 1, "the corpse is recreated at the deathspot")
	assert.InDelta(t, deathspot.X, corpses[0].Position().X, 1e-5)
	assert.InDelta(t, deathspot.Y, corpses[0].Position().Y, 1e-5)
	require.Len(t, g.livingSpectators(), 1, "the death-overlay spectator is rebuilt")
	require.Contains(t, s.deadByClient, c2.UUID(), "the dead marker is rebuilt under the new connection")

	// ... and the normal Respawn still works from here
	c2.respawns = append(c2.respawns, &model.Respawn{})
	s.Update(0)
	require.Len(t, g.players, 2, "respawn after a dead reconnect rebuilds the player")
	np := g.players[1]
	assert.Equal(t, "Alice", np.Name())
	assert.Equal(t, uint32(5), np.Progression().Level)
}

func TestStashTTL_ExpiryFreesNameAndStash(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	g.tick = 100
	g.RemoveEntity(p.Basic()) // disconnect at tick 100
	require.Len(t, s.stashByToken, 1)

	g.tick = 100 + reconnectStashTTLTicks - 1
	s.Update(0)
	assert.Len(t, s.stashByToken, 1, "the stash must survive until the TTL")
	assert.True(t, s.names.contains("Alice"))

	g.tick = 100 + reconnectStashTTLTicks
	s.Update(0)
	assert.Empty(t, s.stashByToken, "the TTL sweep must drop the stash")
	assert.False(t, s.names.contains("Alice"), "the TTL sweep must free the name")
}

func TestDeath_LeavesNoStash(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	token := s.tokenByClient[c.UUID()]

	kill(t, s, p)

	assert.Empty(t, s.stashByToken, "death while connected must not leave a spurious stash")
	assert.Equal(t, token, s.tokenByClient[c.UUID()], "the token must survive death for the respawn flow")
}

func TestReconnect_LiveTokenDegradesToFreshJoin(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	token := s.tokenByClient[c.UUID()]

	// duplicated tab: the token's character is still connected — no stash exists
	c2 := newFakeClient()
	reconnect(t, s, g, c2, "Alice", token)

	require.Len(t, g.players, 2)
	assert.Equal(t, "Alice", g.players[0].Name(), "the live character is untouched")
	assert.NotEqual(t, "Alice", g.players[1].Name(), "the duplicate joins fresh with a mangled name")
	assert.Equal(t, "Alice", p.Name())
	tokens := sentAcceptTokens(t, c2)
	require.Len(t, tokens, 1)
	assert.NotEqual(t, token, tokens[0], "the duplicate gets its own fresh token")
}

// --- quest-ledger carry (plan-quests.md C1, L11) ---

func stateTestQuestRegistry(t *testing.T) quests.Registry {
	t.Helper()
	r, err := quests.NewRegistry(&quests.QuestDefinition{
		ID: "cull", Title: "Cull",
		Stages: []*quests.Stage{
			{ID: "kill", Journal: "j", Objectives: []quests.Objective{{Kind: quests.ObjectiveKill, Target: 7, Count: 5}}, Next: "done"},
			{ID: "done", Journal: "j"},
		},
	})
	require.NoError(t, err)
	return r
}

// startQuestProgress accepts the fixture quest and banks one kill, returning
// the ledger for identity assertions.
func startQuestProgress(t *testing.T, p model.PlayerEntity) *quests.Ledger {
	t.Helper()
	require.NoError(t, p.QuestLedger().Accept("cull"))
	p.QuestLedger().NoteKill(7)
	return p.QuestLedger()
}

func assertQuestProgressCarried(t *testing.T, p model.PlayerEntity, ledger *quests.Ledger) {
	t.Helper()
	assert.Same(t, ledger, p.QuestLedger(), "the whole ledger is carried — the SkillComponent pointer pattern")
	assert.Equal(t, uint64(1), p.QuestLedger().KillCount(7), "lifetime counters survive")
	path, running, _ := p.QuestLedger().Progress("cull")
	assert.True(t, running, "the running quest survives")
	assert.Equal(t, []string{"kill"}, path)
}

// L11: the player struct is destroyed and rebuilt on death — without the
// deadState carry every death silently wipes quest progress, and no other gate
// would notice.
func TestRespawn_CarriesQuestLedger(t *testing.T) {
	s, g := newStateFixture(t)
	g.questReg = stateTestQuestRegistry(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	ledger := startQuestProgress(t, p)

	kill(t, s, p)
	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)

	require.Len(t, g.players, 2)
	assertQuestProgressCarried(t, g.players[1], ledger)
}

// L11, reconnect half: an alive disconnect stashes the ledger and reattach
// restores it.
func TestReconnect_CarriesQuestLedger(t *testing.T) {
	s, g := newStateFixture(t)
	g.questReg = stateTestQuestRegistry(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	ledger := startQuestProgress(t, p)
	token := s.tokenByClient[c.UUID()]

	g.RemoveEntity(p.Basic()) // disconnect

	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)

	require.Len(t, g.players, 2)
	assertQuestProgressCarried(t, g.players[1], ledger)
}

// L11, the long way round: death → disconnect while dead → reconnect (death
// scene rebuilt) → respawn. The ledger rides deadState → reconnectStash →
// deadState → the respawned player.
func TestReconnectWhileDead_CarriesQuestLedgerThroughRespawn(t *testing.T) {
	s, g := newStateFixture(t)
	g.questReg = stateTestQuestRegistry(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	ledger := startQuestProgress(t, p)
	token := s.tokenByClient[c.UUID()]

	kill(t, s, p)
	g.RemoveEntity(g.livingSpectators()[0].Basic()) // disconnect while dead

	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)
	c2.respawns = append(c2.respawns, &model.Respawn{})
	s.Update(0)

	require.Len(t, g.players, 2)
	assertQuestProgressCarried(t, g.players[1], ledger)
}

// L11: a dead client joining under a new name keeps its carried progression —
// the ledger included.
func TestJoinWhileDead_CarriesQuestLedger(t *testing.T) {
	s, g := newStateFixture(t)
	g.questReg = stateTestQuestRegistry(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	ledger := startQuestProgress(t, p)

	kill(t, s, p)
	np := joinPlayer(t, s, g, c, "Bob") // name change instead of Respawn

	assertQuestProgressCarried(t, np, ledger)
}

// ⚑ The carried ledger must ping the NEW client (chunk C3, D17). The ledger
// outlives the player struct, so a notifier captured once at ledger construction
// would keep firing journal banners into the dead player's closed client — the
// banner would simply stop existing after the first death, with nothing failing.
// Ownership and notification change hands together, which is what this pins.
func TestReconnect_JournalBannerFollowsTheNewClient(t *testing.T) {
	s, g := newStateFixture(t)
	g.questReg = stateTestQuestRegistry(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	startQuestProgress(t, p)
	require.Len(t, c.journals, 1, "accepting pinged the original client")
	token := s.tokenByClient[c.UUID()]

	g.RemoveEntity(p.Basic()) // disconnect
	c2 := newFakeClient()
	reconnect(t, s, g, c2, "ignored-name", token)
	require.Len(t, g.players, 2)

	// Four more kills finish the objective stage and complete the quest.
	for i := 0; i < 4; i++ {
		g.players[1].QuestLedger().NoteKill(7)
	}

	assert.Len(t, c.journals, 1, "the closed client hears nothing more")
	require.Len(t, c2.journals, 1, "the live client gets the banner")
	assert.Equal(t, "Quest complete: Cull", c2.journals[0])
}

// TestRejoiningTheSameCharacterKeepsItsName is the "HEer the ugly" regression
// (PO 2026-08-01).
//
// ⚑ A player who leaves to character-select and plays the SAME character again
// used to collide with their own stash. The stash deliberately keeps the name
// reserved so a reconnect can resume under it — so the second join found the
// name taken and the mangler renamed the player to "Alice the ugly".
//
// ⚑ It only reproduces on the SECOND entry, which is why nothing caught it: a
// first join has no stash to collide with, and the reconnect path (which does
// want the stash) returns before this code.
func TestRejoiningTheSameCharacterKeepsItsName(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	require.Equal(t, "Alice", p.Name())

	account := s.accountByClient[c.UUID()]
	require.NotZero(t, account, "the join must record the owning account")

	// Leave to character-select: the socket drops and the character is stashed
	// with its name still reserved.
	g.RemoveEntity(p.Basic())
	require.True(t, s.names.contains("Alice"), "the stash reserves the name")

	// Play the same character again, on a new connection and a fresh ticket for
	// the SAME account — which is exactly what character-select → Play does.
	c2 := newFakeClient()
	sp := spectatorFor(c2)
	g.AddEntity(sp)
	store, ok := s.tickets.(*auth.TicketStore)
	require.True(t, ok)
	token, err := store.Mint(auth.Ticket{
		AccountID: account, CharacterID: account,
		Name: "Alice", Avatar: "default", Faction: "aligned",
	})
	require.NoError(t, err)
	c2.joins = append(c2.joins, &model.Join{PlayTicket: token})
	s.Update(0)

	rejoined := g.players[len(g.players)-1]
	assert.Equal(t, "Alice", rejoined.Name(),
		"a player returning to their own character must keep its name, not be mangled")
}
