package mob

// Mob factions & mob-vs-mob hostility (mob-depth chunk 6.6): the per-faction
// aggro set gates PROACTIVE sensor acquisition, while retaliation (threat),
// flee and damage eligibility stay pure faction-inequality. The aggro sensor
// mask follows the aggro set — a legacy mob (aggro set {aligned}) keeps its
// player-only sensor, a passive faction's sensor sees nothing at all.

import (
	"reflect"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

const (
	// Content faction IDs for tests (2+ = declared factions; 0/1 reserved).
	testFactionPredator model.Faction = 2
	testFactionPrey     model.Faction = 3
	testFactionOther    model.Faction = 4
)

// predatorDefinition hunts players and the prey faction.
func predatorDefinition() *mobs.MobDefinition {
	def := testMobDefinition()
	def.Name = "SaberToothCat"
	def.Faction = 2 // testFactionPredator, as factions.Faction via the def
	def.AggroMask = model.FactionAligned.Bit() | testFactionPrey.Bit()
	return def
}

// preyDefinition is passive (empty aggro set) and cowardly.
func preyDefinition() *mobs.MobDefinition {
	def := testMobDefinition()
	def.Name = "Rabbit"
	def.Faction = 3 // testFactionPrey
	def.AggroMask = 0
	def.Factors.FleeBelowHealthRatio = 0.5
	def.Factors.BaseMaxHealth = 20
	return def
}

func TestNewMob_AggroSensorMaskFollowsAggroSet(t *testing.T) {
	legacy := NewMob(testMobDefinition(), 0, nil)
	assert.Equal(t, int(model.LayerPlayerCollision), legacy.aggroAura.Shape().Mask,
		"legacy default (aggro set {aligned}): player-only sensor, zero new broadphase pairs")

	predator := NewMob(predatorDefinition(), 0, nil)
	assert.Equal(t, int(model.LayerPlayerCollision|model.LayerActionCollision), predator.aggroAura.Shape().Mask,
		"a mob faction in the aggro set adds the action layer")

	prey := NewMob(preyDefinition(), 0, nil)
	assert.Equal(t, int(model.LayerNoneCollision), prey.aggroAura.Shape().Mask,
		"a passive faction acquires nothing — its sensor needs no pairs at all")
}

func TestNewMob_BareDefinitionStaysHostileDefault(t *testing.T) {
	// Directly-constructed definitions (tests) leave Faction/AggroMask at their
	// zero values; the mob must fall back to the hostile default, mirroring the
	// defaultMobMaxHealth guard — FactionAligned is the zero value.
	m := NewMob(testMobDefinition(), 0, nil)

	assert.Equal(t, model.FactionHostile, m.Faction())
	assert.Equal(t, model.FactionAligned.Bit(), m.aggroMask)
}

func TestNewMob_FriendlyToPlayersDelegatesToDefinition(t *testing.T) {
	// §9 lift 6 (C5): the entity exposes the definition's flag through
	// model.PlayerFriendly for the sys damage-eligibility seam.
	soldierDef := testMobDefinition()
	soldierDef.Faction = 2
	soldierDef.FriendlyToPlayers = true
	soldier := NewMob(soldierDef, 0, nil)
	assert.True(t, soldier.FriendlyToPlayers())

	legacy := NewMob(testMobDefinition(), 0, nil)
	assert.False(t, legacy.FriendlyToPlayers())

	var _ model.PlayerFriendly = soldier
}

func TestMob_FindAggroTarget_AcquiresFactionInAggroSet(t *testing.T) {
	// The wolf-chases-rabbit acquisition: a predator's sensor sees a mob body
	// on the action layer and the prey faction is in its aggro set.
	wolf := NewMob(predatorDefinition(), 0, nil)
	rabbit := newFakeCombatant()
	rabbit.faction = testFactionPrey
	rabbit.pos = phy.Vec2f{X: 0.5, Y: 0}

	space := phy.NewSpace()
	space.AddShape(wolf.aggroAura)
	c := phy.NewCircle(rabbit.pos, 0.25)
	c.Shape().IsSensor = true
	c.Shape().Layer = int(model.LayerActionCollision)
	c.Shape().UserData = model.Combatant(rabbit)
	space.AddShape(c)
	space.Update()
	require.NotEmpty(t, wolf.aggroAura.Collisions())

	target := wolf.findAggroTarget()

	require.NotNil(t, target)
	assert.Same(t, rabbit, target)
}

func TestMob_FindAggroTarget_IgnoresFactionOutsideAggroSet(t *testing.T) {
	// A different faction the predator is NOT hostile to is seen by the sensor
	// (action layer) but never proactively acquired — the aggro-set gate.
	wolf := NewMob(predatorDefinition(), 0, nil)
	neutral := newFakeCombatant()
	neutral.faction = testFactionOther
	neutral.pos = phy.Vec2f{X: 0.5, Y: 0}

	space := phy.NewSpace()
	space.AddShape(wolf.aggroAura)
	c := phy.NewCircle(neutral.pos, 0.25)
	c.Shape().IsSensor = true
	c.Shape().Layer = int(model.LayerActionCollision)
	c.Shape().UserData = model.Combatant(neutral)
	space.AddShape(c)
	space.Update()
	require.NotEmpty(t, wolf.aggroAura.Collisions())

	assert.Nil(t, wolf.findAggroTarget(),
		"seen but not in the aggro set = not proactively acquired")
}

func TestMob_PassiveFactionRetaliatesAndFleesWhenWounded(t *testing.T) {
	// Same aggro rules as vs players: a hit seeds threat (retention acquires
	// the attacker), and below the flee threshold the prey runs away.
	rabbit := NewMob(preyDefinition(), 0, nil)
	rabbit.SetPosition(phy.VEC2F_ZERO)
	wolf := NewMob(predatorDefinition(), 0, nil)
	wolf.SetPosition(phy.Vec2f{X: 1, Y: 0})

	rabbit.MobTouches(wolf, mobs.Factors{Damage: 12}) // 20 HP → 8, below 0.5

	require.True(t, rabbit.Update(0))
	require.NotNil(t, rabbit.aggroTarget, "the hit retaliates via threat retention")
	assert.Same(t, model.Combatant(wolf), rabbit.aggroTarget)
	assert.Negative(t, rabbit.Position().X,
		"wounded below the flee threshold: moves away from the wolf")
}

func TestMob_MobTouches_SameFactionHitNeverBuildsThreat(t *testing.T) {
	// Splash from a same-faction aura (boss vs brazier era) stays off the
	// table — noteThreat's faction gate, unchanged under N factions.
	a := NewMob(predatorDefinition(), 0, nil)
	b := NewMob(predatorDefinition(), 0, nil)

	a.MobTouches(b, mobs.Factors{Damage: 5})

	assert.False(t, a.HasThreat(b.Basic().ID()))
}

func TestMob_AlignRecomputesAggroSet(t *testing.T) {
	// A summon flipped to aligned must not keep hunting the aligned faction;
	// flipped mobs default to hostile-to-all-others (equality still protects
	// the own faction in findAggroTarget).
	m := NewMob(testMobDefinition(), 0, nil)

	m.Align()

	assert.Zero(t, m.aggroMask&model.FactionAligned.Bit(), "never aggro the own faction")
	assert.NotZero(t, m.aggroMask&model.FactionHostile.Bit())
	assert.Equal(t, int(model.LayerActionCollision), m.aggroAura.Shape().Mask,
		"sensor mask follows the recomputed set — own (aligned) faction rides the player layer, so only the action layer is needed")
}

// --- the allegiance seam (plan-faction-flips.md chunk 1) ---
//
// SetFaction was one general-looking setter whose ^f.Bit() destination was
// defined for exactly one faction (aligned) and silently destroyed the
// species' authored hostileTo set for every other. It is now two named verbs.

func TestMob_Align_KeepsHarmRightsAgainstEveryOtherFaction(t *testing.T) {
	// The load-bearing property (plan §2 finding 3): sys/skills.go routes every
	// harmful effect through MayHarm, so a summon, totem or campfire that lost
	// its all-others aggro set would silently stop being able to hurt anything.
	// Derive Align's mask from the built-in aligned faction's own authored
	// (retaliation-only) mask and this test is what goes red.
	m := NewMob(predatorDefinition(), 0, nil)

	m.Align()

	require.Equal(t, model.FactionAligned, m.Faction())
	for _, f := range []model.Faction{
		model.FactionHostile, testFactionPredator, testFactionPrey, testFactionOther,
	} {
		assert.True(t, m.MayHarm(f, 0), "aligned may harm faction %d", f)
	}
	assert.False(t, m.MayHarm(model.FactionAligned, 0), "never the own side")
}

func TestMob_RevertFaction_RestoresTheExactAuthoredMask(t *testing.T) {
	// Asserted against the definition rather than a hand-written constant: the
	// point of the verb is that a curated hostileTo set survives the round
	// trip, so the test must not be able to agree with a reconstruction.
	def := predatorDefinition()
	m := NewMob(def, 0, nil)
	wantFaction, wantMask := m.Faction(), m.aggroMask
	wantSensor := m.aggroAura.Shape().Mask
	require.Equal(t, def.AggroMask, wantMask, "fixture sanity: a curated set")

	m.Align()
	require.NotEqual(t, wantMask, m.aggroMask)

	m.RevertFaction()

	assert.Equal(t, wantFaction, m.Faction())
	assert.Equal(t, wantMask, m.aggroMask)
	assert.Equal(t, wantSensor, m.aggroAura.Shape().Mask,
		"a round trip is identity on the sensor mask too")
}

func TestMob_RevertFaction_HonoursTheAlignedRewriteAtConstruction(t *testing.T) {
	// A directly-constructed definition leaves Faction at its zero value, which
	// IS FactionAligned — NewMob rewrites it to the hostile default. Reverting
	// must land on what the mob was born with, not on the raw definition
	// fields, or a reverted test mob comes back permanently player-aligned.
	m := NewMob(testMobDefinition(), 0, nil)
	require.Equal(t, model.FactionHostile, m.Faction())

	m.Align()
	m.RevertFaction()

	assert.Equal(t, model.FactionHostile, m.Faction())
	assert.Equal(t, model.FactionAligned.Bit(), m.aggroMask)
}

func TestMob_EnlistUnder_AdoptsTheSummonersWholeAllegiance(t *testing.T) {
	// Faction AND reaction table, together. The old SetFaction(caster.Faction())
	// took the first and invented the second, which is why a summoned squad
	// would have hunted every neutral faction it walked past.
	summoner := NewMob(predatorDefinition(), 0, nil)
	summon := NewMob(testMobDefinition(), 0, nil)
	require.NotEqual(t, summoner.aggroMask, summon.aggroMask)

	summon.EnlistUnder(summoner)

	assert.Equal(t, summoner.Faction(), summon.Faction())
	assert.Equal(t, summoner.AggroMask(), summon.AggroMask())
	assert.Zero(t, summon.aggroMask&testFactionOther.Bit(),
		"a neutral faction the summoner ignores stays ignored")
	assert.Equal(t, summoner.aggroAura.Shape().Mask, summon.aggroAura.Shape().Mask,
		"the sensor follows the adopted set")

	var _ model.Allegiance = summoner
}

func TestMob_AllegianceFlipsClearAggroOnBothEdges(t *testing.T) {
	// L-A. On the flip edge: updateEnemyTargeting reads highestThreatTarget
	// FIRST, so a player left on the table re-latches and the flipped mob
	// chases menacingly while MayHarm grants it nothing. On the revert edge an
	// empty table is what makes "it turns on you" fall out of ordinary
	// acquisition through the RESTORED mask, with no re-engage code.
	for _, tc := range []struct {
		name string
		flip func(*Mob)
	}{
		{"Align", (*Mob).Align},
		{"RevertFaction", (*Mob).RevertFaction},
		{"EnlistUnder", func(m *Mob) { m.EnlistUnder(NewMob(preyDefinition(), 0, nil)) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m := NewMob(predatorDefinition(), 0, nil)
			attacker := NewMob(testMobDefinition(), 0, nil)
			m.MobTouches(attacker, mobs.Factors{Damage: 5})
			m.aggroTarget = attacker
			m.leashTicks = 7
			require.True(t, m.HasThreat(attacker.Basic().ID()))

			tc.flip(m)

			assert.Nil(t, m.aggroTarget)
			assert.False(t, m.HasThreat(attacker.Basic().ID()))
			assert.Zero(t, m.leashTicks)
		})
	}
}

func TestMob_NoGeneralFactionSetterExists(t *testing.T) {
	// Tombstone (the jsonInteraction.Trigger precedent). The trap this chunk
	// closes is not a wrong value, it is a general-looking setter with exactly
	// one defined destination — so the guard is against the SHAPE returning,
	// under any name, years from now.
	forbidden := map[string]string{
		"SetFaction":   "use Align() or RevertFaction() — a faction is not a value to be set, it is a side to be joined or left",
		"SetAggroMask": "the aggro set is derived from the faction, never assigned",
	}
	typ := reflect.TypeOf(&Mob{})
	for i := 0; i < typ.NumMethod(); i++ {
		if why, bad := forbidden[typ.Method(i).Name]; bad {
			t.Errorf("*Mob.%s is back: %s", typ.Method(i).Name, why)
		}
	}
}

// --- kill rewards on a mob killing blow (chunk 6.6) ---

func TestMob_MobKillingBlowGrantsRewardsToParticipants(t *testing.T) {
	// At a frontline a mob often lands the final hit on something a player
	// damaged — recorded participants must still get their rewards (GDD: all
	// combat participants receive XP), regardless of who struck last.
	def := testMobDefinition()
	def.Factors.BaseMaxHealth = 100
	m := NewMob(def, 0, nil)
	p := newFakeAuraPlayer()
	wolf := NewMob(predatorDefinition(), 0, nil)

	m.PlayerTouches(p, model.Damage{HP: 10})
	require.Empty(t, p.xp, "still alive — no rewards yet")

	m.MobTouches(wolf, mobs.Factors{Damage: 1e6})

	require.Equal(t, []uint64{42}, p.xp,
		"the mob's killing blow triggers the participant rewards")
}

func TestMob_PureMobKillGrantsNothingEvenWhenPokedAfter(t *testing.T) {
	// No player participated: a mob-vs-mob kill must not create any reward
	// path — not even for a player touching the corpse afterwards (the
	// reward-leakage pin).
	m := NewMob(testMobDefinition(), 0, nil)
	wolf := NewMob(predatorDefinition(), 0, nil)

	m.MobTouches(wolf, mobs.Factors{Damage: 1e6})
	require.Zero(t, m.Health())
	assert.True(t, m.deathRewardGiven, "the death is settled with zero participants")

	p := newFakeAuraPlayer()
	m.PlayerTouches(p, model.Damage{HP: 5})
	assert.Empty(t, p.xp, "poking the corpse earns nothing")
}

// --- two-layer harm gate (chunk 6.6 in-game findings, 2026-07-11) ---

func TestMob_MayHarm_DeclaredHostilityOrCombatLink(t *testing.T) {
	wolf := NewMob(predatorDefinition(), 0, nil)
	assert.True(t, wolf.MayHarm(testFactionPrey, 0), "declared hostility (static layer)")
	assert.False(t, wolf.MayHarm(testFactionOther, 0), "neutral faction: no harm rights")

	rabbit := NewMob(preyDefinition(), 0, nil)
	assert.False(t, rabbit.MayHarm(model.FactionAligned, 123),
		"a passive faction may not splash bystanders it is not fighting")

	rabbit.MobTouches(wolf, mobs.Factors{Damage: 5})
	assert.True(t, rabbit.MayHarm(wolf.Faction(), wolf.Basic().ID()),
		"an attacker on the threat table is fair game (dynamic layer — retaliation)")
}
