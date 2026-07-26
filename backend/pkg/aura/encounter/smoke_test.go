package encounter

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// fakePlayer implements the slices of model.PlayerEntity the mob hit path
// touches; unimplemented methods panic via the embedded nil interface.
type fakePlayer struct {
	model.PlayerEntity
	basic ecs.BasicEntity
	name  string
	pos   phy.Vec2f
}

func (f *fakePlayer) Basic() ecs.BasicEntity              { return f.basic }
func (f *fakePlayer) Name() string                        { return f.name }
func (f *fakePlayer) ApplyRecipeCascade()                 {}
func (f *fakePlayer) Position() phy.Vec2f                 { return f.pos }
func (f *fakePlayer) Radius() float32                     { return 0.25 }
func (f *fakePlayer) Faction() model.Faction              { return model.FactionAligned }
func (f *fakePlayer) HealthRatio() float32                { return 1 }
func (f *fakePlayer) InCombat() bool                      { return false }
func (f *fakePlayer) AddExperience(xp uint64)             {}
func (f *fakePlayer) RecentHealers() []model.PlayerEntity { return nil }

func newFakePlayer(pos phy.Vec2f) *fakePlayer {
	return &fakePlayer{basic: ecs.NewBasic(), pos: pos}
}

func smokeAuraSkill() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 198, Name: "SmokeTestAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 3,
		Effects: []skills.EffectDef{{
			Type:           skills.EffectTypeDamageAura,
			Radius:         0.5,
			TargetsEnemies: true,
			TickInterval:   1,
			Damage:         &skills.DamageParams{HP: 1},
		}},
	}
}

func smokeDef(id mobs.MobID, name, entityType string, maxHealth uint32, radius float32) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:         id,
		Name:       name,
		EntityType: entityType,
		Body:       mobs.Body{Radius: radius, AggroRadius: 5},
		Factors:    mobs.Factors{BaseMaxHealth: maxHealth, Speed: 1.0, Experience: 10},
		Skills:     []mobs.MobSkill{{Def: smokeAuraSkill(), Level: 1}},
	}
}

// arena drives the smoke encounter through the fakeGame, replicating the
// MobSystem death loop (Update reports dead → the game removes the entity →
// the encounter System dispatches next Update).
type arena struct {
	t   *testing.T
	s   *System
	g   *fakeGame
	enc *SmokeEncounter
}

func newArena(t *testing.T) *arena {
	g := newFakeGame()
	g.mobReg = &fakeRegistry{defs: map[string]*mobs.MobDefinition{
		smokeBossName:  smokeDef(10, smokeBossName, "AngryMammoth", 100, 1.7),
		smokeGuardName: smokeDef(11, smokeGuardName, "SaberToothCat", 40, 0.35),
		smokeAddName:   smokeDef(12, smokeAddName, "Rabbit", 40, 0.25),
	}}
	s := NewSystem(g, nil)
	g.es = s
	enc := NewSmokeEncounter()
	s.Register(enc)
	return &arena{t: t, s: s, g: g, enc: enc}
}

func (a *arena) liveMobs() []model.MobEntity {
	removed := map[uint64]bool{}
	for _, id := range a.g.removed {
		removed[id] = true
	}
	live := []model.MobEntity{}
	for _, m := range a.g.added {
		if !removed[m.Basic().ID()] {
			live = append(live, m)
		}
	}
	return live
}

func (a *arena) step(n int) {
	for i := 0; i < n; i++ {
		for _, m := range a.liveMobs() {
			if !m.Update(0) {
				a.g.RemoveEntity(m.Basic())
			}
		}
		a.s.Update(0)
		a.g.tick++
	}
}

// killGuards kills every live guard and steps once so the deaths dispatch.
func (a *arena) killGuards() {
	for _, guard := range a.enc.guards {
		if guard != nil {
			killMob(guard)
		}
	}
	a.step(1)
}

func TestSmoke_InitialSpawnAndImmunity(t *testing.T) {
	a := newArena(t)

	a.step(1)

	require.NotNil(t, a.enc.boss, "the boss spawns on the first tick")
	require.Len(t, a.g.added, 4, "boss + 3 guards")
	assert.Equal(t, smokeBossPos, a.enc.boss.Position())

	a.enc.boss.PlayerTouches(newFakePlayer(smokeBossPos), model.Damage{HP: 10})
	assert.Equal(t, a.enc.boss.MaxHealth(), a.enc.boss.Health(),
		"the boss is immune while its guards live")
}

func TestSmoke_ImmunityLiftsWhenAllGuardsDead(t *testing.T) {
	a := newArena(t)
	a.step(1)

	a.killGuards()

	a.enc.boss.PlayerTouches(newFakePlayer(smokeBossPos), model.Damage{HP: 10})
	assert.Equal(t, a.enc.boss.MaxHealth()-10, a.enc.boss.Health(),
		"all guards dead → the immunity lifts and damage lands")
}

func TestSmoke_GuardRespawnRestoresImmunity(t *testing.T) {
	a := newArena(t)
	a.step(1)
	a.killGuards()
	require.Len(t, a.g.added, 4, "no instant respawn")

	a.g.tick += guardRespawnTicks // encounter-owned timers come due
	a.step(1)

	require.Greater(t, len(a.g.added), 4, "guards respawn on the encounter's timer")
	a.enc.boss.PlayerTouches(newFakePlayer(smokeBossPos), model.Damage{HP: 10})
	assert.Equal(t, a.enc.boss.MaxHealth(), a.enc.boss.Health(),
		"a live guard restores the boss's immunity")
}

func TestSmoke_HalfHealthFleesAndSpawnsAdds(t *testing.T) {
	a := newArena(t)
	a.step(1)
	a.killGuards()

	// The attacker stands south of the boss and hits it to half health.
	p := newFakePlayer(smokeBossPos.Add(phy.Vec2f{X: 0, Y: -3}))
	boss := a.enc.boss
	boss.PlayerTouches(p, model.Damage{HP: 50}) // ratio 0.5 → flee latch
	added := len(a.g.added)
	a.step(1)

	assert.Equal(t, added+2, len(a.g.added), "the flee phase spawns 2 adds")

	// The boss runs AWAY from its top-threat attacker while the phase lasts.
	before := boss.Position().Sub(p.pos).Abs()
	a.step(3)
	assert.Greater(t, boss.Position().Sub(p.pos).Abs(), before,
		"the boss flees its attacker during the add phase")
}

func TestSmoke_AddsDeadReengagesRetainedThreat(t *testing.T) {
	a := newArena(t)
	a.step(1)
	a.killGuards()

	p := newFakePlayer(smokeBossPos.Add(phy.Vec2f{X: 0, Y: -3}))
	boss := a.enc.boss
	boss.PlayerTouches(p, model.Damage{HP: 50})
	a.step(3) // flee phase running

	for _, add := range a.enc.adds {
		killMob(add)
	}
	a.step(1) // deaths dispatch, override drops

	require.True(t, boss.TargetsEntity(p.basic.ID()),
		"the threat table survived the flee phase — the boss re-targets its attacker")
	before := boss.Position().Sub(p.pos).Abs()
	a.step(3)
	assert.Less(t, boss.Position().Sub(p.pos).Abs(), before,
		"the boss chases again once the adds are dead")
}

func TestSmoke_BossDeathResetsArenaAfterDelay(t *testing.T) {
	a := newArena(t)
	a.step(1)
	a.killGuards()

	firstBoss := a.enc.boss
	killMob(firstBoss)
	a.step(1)
	require.Nil(t, a.enc.boss, "the boss death is dispatched")

	a.step(1)
	assert.Nil(t, a.enc.boss, "no instant reset")

	a.g.tick += resetDelayTicks
	a.step(1)

	require.NotNil(t, a.enc.boss, "the arena resets after the delay")
	assert.NotEqual(t, firstBoss.Basic().ID(), a.enc.boss.Basic().ID(), "a fresh boss")
	for i, guard := range a.enc.guards {
		assert.NotNil(t, guard, "guard %d is back after the reset", i)
	}
	a.enc.boss.PlayerTouches(newFakePlayer(smokeBossPos), model.Damage{HP: 10})
	assert.Equal(t, a.enc.boss.MaxHealth(), a.enc.boss.Health(),
		"the fresh arena starts immune again")
}
