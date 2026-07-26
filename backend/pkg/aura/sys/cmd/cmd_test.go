package cmd

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// fakeXpPlayer implements just enough of model.PlayerEntity for the XP
// command. The embedded nil interface panics on any method the test did not
// anticipate — a loud signal that the command grew.
type fakeXpPlayer struct {
	model.PlayerEntity
	gainedXp []uint64
}

func (f *fakeXpPlayer) AddExperience(xp uint64) {
	f.gainedXp = append(f.gainedXp, xp)
}

func strPtr(s string) *string { return &s }

func TestXpCommand_AddsExperience(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, strPtr("500"))

	assert.NoError(t, err)
	assert.Equal(t, []uint64{500}, p.gainedXp)
}

func TestXpCommand_MissingArgument(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, nil)

	assert.Error(t, err)
	assert.Empty(t, p.gainedXp)
}

func TestXpCommand_EmptyArgument(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, strPtr(""))

	assert.Error(t, err)
	assert.Empty(t, p.gainedXp)
}

func TestXpCommand_NonNumericArgument(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, strPtr("lots"))

	assert.Error(t, err)
	assert.Empty(t, p.gainedXp)
}

func TestXpCommand_NegativeArgumentRejected(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, strPtr("-5"))

	assert.Error(t, err)
	assert.Empty(t, p.gainedXp)
}

// --- SKILL cheat (item 11 Phase 2 Step 4) ---

// fakeSkillPlayer implements the slice of model.PlayerEntity the SKILL
// command touches: spellbook discovery + the recipe cascade.
type fakeSkillPlayer struct {
	model.PlayerEntity
	sc       *skills.SkillComponent
	cascades int
	client   *cmdFakeClient
}

// cmdFakeClient captures SendUnlock; the rest of model.Client is unused.
type cmdFakeClient struct {
	model.Client
	unlocks []struct {
		id     uint64
		source string
	}
}

func (c *cmdFakeClient) SendUnlock(id uint64, source string) error {
	c.unlocks = append(c.unlocks, struct {
		id     uint64
		source string
	}{id, source})
	return nil
}

func (f *fakeSkillPlayer) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeSkillPlayer) ApplyRecipeCascade()                    { f.cascades++ }
func (f *fakeSkillPlayer) Client() model.Client                   { return f.client }

func newFakeSkillPlayer() *fakeSkillPlayer {
	return &fakeSkillPlayer{sc: skills.NewSkillComponent(true), client: &cmdFakeClient{}}
}

// fakeSkillGame provides the skill registry the SKILL command resolves names
// against.
type fakeSkillGame struct {
	model.Game
	registry skills.Registry
}

func (f *fakeSkillGame) Skills() skills.Registry { return f.registry }

func skillTestGame(t *testing.T) *fakeSkillGame {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"fire-ward.json": {Data: []byte(`{
		  "id": 40, "name": "FireWard", "category": "active_aura", "maxLevel": 3,
		  "effects": [{"type": "resist_aura", "radius": 1.5, "resistTags": ["fire"], "resistFactor": 0.6, "targetsAllies": true, "targetsSelf": true}]
		}`)},
	})
	require.NoError(t, err)
	return &fakeSkillGame{registry: r}
}

func TestSkillCommand_DiscoversByNameAndCascades(t *testing.T) {
	g := skillTestGame(t)
	p := newFakeSkillPlayer()

	err := commands["SKILL"](g, p, strPtr("FireWard"))

	assert.NoError(t, err)
	assert.True(t, p.sc.HasDiscovered(skills.SkillID(40)))
	assert.Equal(t, 1, p.cascades, "discovery must run the recipe cascade like real unlock paths")
	require.Len(t, p.client.unlocks, 1, "the cheat exercises the same unlock UI")
	assert.Equal(t, uint64(40), p.client.unlocks[0].id)
	assert.Equal(t, "Cheat", p.client.unlocks[0].source)
}

func TestSkillCommand_UnknownNameFails(t *testing.T) {
	g := skillTestGame(t)
	p := newFakeSkillPlayer()

	err := commands["SKILL"](g, p, strPtr("NoSuchSkill"))

	assert.Error(t, err)
	assert.Empty(t, p.sc.Spellbook)
}

func TestSkillCommand_MissingArgument(t *testing.T) {
	g := skillTestGame(t)
	p := newFakeSkillPlayer()

	assert.Error(t, commands["SKILL"](g, p, nil))
	assert.Error(t, commands["SKILL"](g, p, strPtr("")))
}

// --- THREAT cheat (encounter-controller chunk 9) ---

// fakeCombatant is a threat source for seeding a mob's table.
type fakeCombatant struct {
	basic ecs.BasicEntity
}

func (f *fakeCombatant) Basic() ecs.BasicEntity { return f.basic }
func (f *fakeCombatant) Position() phy.Vec2f    { return phy.Vec2f{} }
func (f *fakeCombatant) Radius() float32        { return 0.25 }
func (f *fakeCombatant) Faction() model.Faction { return model.FactionAligned }
func (f *fakeCombatant) HealthRatio() float32   { return 1 }
func (f *fakeCombatant) InCombat() bool         { return false }

func threatTestMob(t *testing.T) *mob.Mob {
	t.Helper()
	return mob.NewMob(&mobs.MobDefinition{
		ID:      1,
		Name:    "Dodo",
		Body:    mobs.Body{Radius: 0.3, AggroRadius: 2.0},
		Factors: mobs.Factors{BaseMaxHealth: 40},
	}, 0, nil)
}

func TestThreatCommand_FormatContainsTableAndState(t *testing.T) {
	m := threatTestMob(t)
	src := &fakeCombatant{basic: ecs.NewBasic()}
	m.NoteThreat(src, 12.5)
	m.SetInvulnerable(true)

	report := formatThreatReport(m)

	assert.Contains(t, report, "Dodo", "the def name identifies the mob")
	assert.Contains(t, report, "invulnerable=true")
	assert.Contains(t, report, fmt.Sprintf("%d", src.basic.ID()), "the threat holder's entity ID")
	assert.Contains(t, report, "12.5", "the threat value")
}

// fakeThreatGame resolves entities by ID for the THREAT <id> form.
type fakeThreatGame struct {
	model.Game
	entities map[uint64]model.BasicEntity
}

func (f *fakeThreatGame) GetEntity(id uint64) (model.BasicEntity, error) {
	e, ok := f.entities[id]
	if !ok {
		return nil, fmt.Errorf("entity %d not found", id)
	}
	return e, nil
}

func TestThreatCommand_ByEntityID(t *testing.T) {
	m := threatTestMob(t)
	g := &fakeThreatGame{entities: map[uint64]model.BasicEntity{m.Basic().ID(): m}}
	cmd := threatCommand(nil)

	assert.NoError(t, cmd(g, nil, strPtr(fmt.Sprintf("%d", m.Basic().ID()))))
	assert.Error(t, cmd(g, nil, strPtr("99999")), "unknown entity ID fails")
	assert.Error(t, cmd(g, nil, strPtr("notanumber")))
}

func TestThreatCommand_MobsNearbyFindsMobBody(t *testing.T) {
	m := threatTestMob(t)
	m.SetPosition(phy.Vec2f{X: 3, Y: 0})

	space := phy.NewSpace()
	space.AddShape(m.Body)
	space.Update()

	found := mobsNearby(space, phy.Vec2f{X: 0, Y: 0}, 15)
	require.Len(t, found, 1, "the mob body within the dump radius is found")
	assert.Equal(t, m.Basic().ID(), found[0].Basic().ID())

	assert.Empty(t, mobsNearby(space, phy.Vec2f{X: 100, Y: 100}, 5),
		"nothing found far away")
}

// --- DAMAGE cheat ---

// fakeDamagePlayer carries the absolute-HP pool the DAMAGE cheat has to read.
// Player health has been absolute HP since item 11, so a percentage is a
// percentage OF MaxHealth, never of the vitals.VitalSign type ceiling.
type fakeDamagePlayer struct {
	model.PlayerEntity
	vitals   model.PlayerVitalSigns
	maxHP    vitals.VitalSign
	statusFx model.StatusEffects
}

func (f *fakeDamagePlayer) VitalSigns() *model.PlayerVitalSigns { return &f.vitals }
func (f *fakeDamagePlayer) MaxHealth() vitals.VitalSign         { return f.maxHP }
func (f *fakeDamagePlayer) StatusEffects() *model.StatusEffects { return &f.statusFx }

func newFakeDamagePlayer(maxHP vitals.VitalSign) *fakeDamagePlayer {
	return &fakeDamagePlayer{
		vitals:   model.PlayerVitalSigns{Health: maxHP},
		maxHP:    maxHP,
		statusFx: model.NewStatusEffects(),
	}
}

func TestDamageCommand_SubtractsFractionOfMaxHealth(t *testing.T) {
	p := newFakeDamagePlayer(200)

	require.NoError(t, commands["DAMAGE"](nil, p, strPtr("25")))

	assert.Equal(t, vitals.VitalSign(150), p.vitals.Health,
		"25 %% of a 200 HP pool is 50 HP, not a fraction of the VitalSign type max")
}

func TestDamageCommand_DoesNotKillOnASmallPercentage(t *testing.T) {
	p := newFakeDamagePlayer(500)

	require.NoError(t, commands["DAMAGE"](nil, p, strPtr("1")))

	assert.Equal(t, vitals.VitalSign(495), p.vitals.Health)
	assert.NotZero(t, p.vitals.Health, "the whole point: 1 %% must not be lethal")
}

func TestDamageCommand_AtOrAbove100Kills(t *testing.T) {
	for _, pct := range []string{"100", "250", "999999999999"} {
		p := newFakeDamagePlayer(200)

		require.NoError(t, commands["DAMAGE"](nil, p, strPtr(pct)))

		assert.Zero(t, p.vitals.Health, "DAMAGE %s empties the pool without underflowing", pct)
	}
}

func TestDamageCommand_SubtractsFromCurrentHealthNotMax(t *testing.T) {
	p := newFakeDamagePlayer(200)
	p.vitals.Health = 100

	require.NoError(t, commands["DAMAGE"](nil, p, strPtr("25")))

	assert.Equal(t, vitals.VitalSign(50), p.vitals.Health,
		"the percentage sizes the hit against max HP; the hit lands on current HP")
}

func TestDamageCommand_MarksDamaged(t *testing.T) {
	p := newFakeDamagePlayer(200)

	require.NoError(t, commands["DAMAGE"](nil, p, strPtr("10")))

	assert.Contains(t, p.statusFx.Effects(), model.StatusEffectDamaged)
}

func TestDamageCommand_RejectsBadArguments(t *testing.T) {
	p := newFakeDamagePlayer(200)

	assert.Error(t, commands["DAMAGE"](nil, p, nil))
	assert.Error(t, commands["DAMAGE"](nil, p, strPtr("")))
	assert.Error(t, commands["DAMAGE"](nil, p, strPtr("lots")))
	assert.Equal(t, vitals.VitalSign(200), p.vitals.Health, "a rejected command changes nothing")
}
