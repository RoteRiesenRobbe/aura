package sys

import (
	"net/http"
	"testing"
	"testing/fstest"

	"github.com/EngoEngine/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/spectator"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// fakeClient is the first model.Client test double (chunk 4): queueable
// Join/Respawn messages, everything else inert.
type fakeClient struct {
	uuid     uuid.UUID
	joins    []*model.Join
	respawns []*model.Respawn
	sent     [][]byte
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

func (c *fakeClient) NextInput() *model.PlayerInput             { return nil }
func (c *fakeClient) NextCheat() *model.Cheat                   { return nil }
func (c *fakeClient) NextChatMessage() *model.ChatMessage       { return nil }
func (c *fakeClient) NextEquip() *model.EquipSkill              { return nil }
func (c *fakeClient) NextSpendSkillPoint() *model.SpendSkillPoint {
	return nil
}
func (c *fakeClient) SendMessage(b []byte) error { c.sent = append(c.sent, b); return nil }
func (c *fakeClient) Close()                     {}
func (c *fakeClient) UUID() uuid.UUID            { return c.uuid }

// minimal skill content so the real player.New can initialize its component
// (the C1 peasant start equips Harvest).
var stateTestHarvestJSON = []byte(`{
  "id": 41,
  "name": "Harvest",
  "category": "active_aura",
  "maxLevel": 1,
  "effects": [{"type": "damage_aura", "targetsEnemies": true}]
}`)

func stateTestSkillRegistry(t *testing.T) skills.Registry {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"harvest.json": {Data: stateTestHarvestJSON},
	})
	require.NoError(t, err)
	return r
}

// stateFakeGame routes add/remove the way the real game does for the
// ConnectionStateSystem: players/spectators register with the system, removal
// fans out synchronously to system.Remove. Corpses are only recorded.
type stateFakeGame struct {
	cs        *ConnectionStateSystem
	cfg       *cfg.GameConfig
	skillReg  skills.Registry
	players   []model.PlayerEntity
	corpses   []model.CorpseEntity
	removed   []uint64
	spectators []model.Spectator
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

func (g *stateFakeGame) Ticks() uint64                               { return 0 }
func (g *stateFakeGame) Bounds() (float32, float32)                  { return 60, 40 }
func (g *stateFakeGame) Config() *cfg.GameConfig                     { return g.cfg }
func (g *stateFakeGame) Skills() skills.Registry                     { return g.skillReg }
func (g *stateFakeGame) Handler() http.Handler                       { panic("unused") }
func (g *stateFakeGame) Loop()                                       { panic("unused") }
func (g *stateFakeGame) GetEntity(uint64) (model.BasicEntity, error) { panic("unused") }
func (g *stateFakeGame) Items() items.Registry                       { panic("unused") }
func (g *stateFakeGame) Mobs() mobs.Registry                         { panic("unused") }

// newStateFixture wires a ConnectionStateSystem to a fake game and returns both.
func newStateFixture(t *testing.T) (*ConnectionStateSystem, *stateFakeGame) {
	t.Helper()
	g := newStateFakeGame(t)
	s := NewConnectionStateSystem(g)
	g.cs = s
	return s, g
}

// joinPlayer runs the full join flow for a fresh client and returns the player.
func joinPlayer(t *testing.T, s *ConnectionStateSystem, g *stateFakeGame, c *fakeClient, name string) model.PlayerEntity {
	t.Helper()
	sp := spectatorFor(c)
	g.AddEntity(sp)
	c.joins = append(c.joins, &model.Join{PlayerName: name})
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
	fire := CampfireAnchor{Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}
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
	anchor := s.anchors[c.UUID()]
	assert.Equal(t, fire.Pos, anchor)
	assert.True(t, p.CampfireBound(), "completing the dwell must stamp campfire_bound")

	// the stamp is one-shot: staying at the fire doesn't re-stamp
	p.(interface{ ResetTickNumbers() }).ResetTickNumbers()
	s.Update(0)
	assert.False(t, p.CampfireBound(), "staying bound must not re-stamp")
}

func TestRespawn_SpawnsAtAnchorWithJitter(t *testing.T) {
	s, g := newStateFixture(t)
	fire := CampfireAnchor{Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}
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

func TestDisconnectWhileDead_CleansUpEverything(t *testing.T) {
	s, g := newStateFixture(t)
	s.SetCampfireAnchors([]CampfireAnchor{{Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}})
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
	assert.False(t, s.names.contains("Alice"), "name must be freed on disconnect-while-dead")
	assert.Empty(t, s.deadByClient)
	assert.Empty(t, s.anchors, "campfire bind must not outlive the connection")
}

func TestJoinWhileDead_FreesOldNameAndCorpse(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	p.SetProgression(model.PlayerProgression{Level: 5})
	kill(t, s, p)
	corpse := g.livingCorpses()[0]

	c.joins = append(c.joins, &model.Join{PlayerName: "Bob"})
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
	c.joins = append(c.joins, &model.Join{PlayerName: "Alice"})
	kill(t, s, p)
	s.Update(0)

	assert.Len(t, g.players, 1, "the stale Join must not silently respawn the player")
	assert.Empty(t, c.joins, "the stale Join must be drained at death")
}

func TestDisconnectAliveAfterRespawn_FreesName(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")
	kill(t, s, p)
	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)
	require.Len(t, g.players, 2)
	np := g.players[1]

	// disconnect while ALIVE: the delete-on-consume must have cleared the dead
	// marker, so the fan-out frees the name normally
	g.RemoveEntity(np.Basic())

	assert.False(t, s.names.contains("Alice"),
		"disconnect-while-alive after a respawn must free the name")
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
