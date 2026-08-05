package mob

// The award site: kill XP is computed PER PARTICIPANT at that participant's
// own level (docs/plan-xp-formula.md D1), and everything else in the reward
// fan-out stays participation-based no matter what the award comes to (L3).

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func mobAtLevel(t *testing.T, level int, tier string, xpFactor float32) *Mob {
	t.Helper()
	def := testMobDefinition()
	def.CurveLevel = level
	def.Tier = tier
	def.Factors.XPFactor = xpFactor
	return NewMob(def, 0, nil)
}

func playerAtLevel(level uint32) *fakeAuraPlayer {
	p := newFakeAuraPlayer()
	p.prog = model.PlayerProgression{Level: level}
	return p
}

// THE mechanism, in one test: two players credited on ONE corpse are paid
// different amounts, each priced against their own level. Under the flat
// authored `experience` this was impossible to express.
func TestKillXP_TwoParticipantsOfDifferentLevelsArePricedSeparately(t *testing.T) {
	m := mobAtLevel(t, 10, mobs.TierNormal, 1)
	veteran := playerAtLevel(10)
	rookie := playerAtLevel(3)

	m.PlayerTouches(veteran, model.Damage{HP: 1})
	m.PlayerTouches(rookie, model.Damage{HP: 1000})

	k := curve.DefaultKillXP()
	require.Equal(t, []uint64{k.Award(10, 10, 1, 1)}, veteran.xp, "at level: a full at-level kill")
	require.Equal(t, []uint64{k.Award(3, 10, 1, 1)}, rookie.xp, "below level: bounded by their own curve")

	assert.NotEqual(t, veteran.xp[0], rookie.xp[0], "one corpse, two prices")
	assert.Greater(t, veteran.xp[0], rookie.xp[0],
		"the higher-level player earns more from the same kill — the exponential base outruns the +20% cap")
}

// Pull-through, closed: the carried level-3 gets a bounded multiple of THEIR
// own at-level kill, whatever died. Today's authored numbers paid them 600 for
// the same corpse (plan §3.2).
func TestKillXP_CarriedLowLevelIsBoundedAtAnEndgameBoss(t *testing.T) {
	boss := mobAtLevel(t, 23, mobs.TierBoss, 1)
	carried := playerAtLevel(3)

	boss.PlayerTouches(carried, model.Damage{HP: 100000})

	k := curve.DefaultKillXP()
	award := carried.xp[0]
	assert.EqualValues(t, k.Award(3, 23, k.TierBoss, 1), award)

	ceiling := uint64(float64(k.Award(3, 3, 1, 1)) * (1 + k.UpBonus*float64(k.UpCap)) * k.TierBoss)
	assert.LessOrEqual(t, award, ceiling+1,
		"no kill in the world can beat their own at-level kill × the up-cap × the tier")
}

// Gray farming, closed — and the L3 half in the same breath: the kill pays
// NOTHING and everything else still fires.
func TestKillXP_GrayKillPaysNothingButStillCreditsEverythingElse(t *testing.T) {
	rabbit := mobAtLevel(t, 1, mobs.TierNormal, 1)
	endgame := playerAtLevel(30)

	rabbit.PlayerTouches(endgame, model.Damage{HP: 1000})

	require.Equal(t, []uint64{0}, endgame.xp, "a level-30 farming level-1 mobs earns nothing")
	assert.Equal(t, uint64(1), endgame.ledger.KillCount(1),
		"L3: quest kill credit is participation-based and must survive a 0 award")
	assert.True(t, endgame.cascaded, "L3: the recipe cascade still runs")
}

// L3, the part that is invisible until it bites: the unlock roll is
// deliberately ALWAYS consumed so the per-mob RNG stream does not shift. An
// `if award == 0 { return }` early-out would skip it — and would also make an
// endgame player unable to farm a low-level skill drop at all.
func TestKillXP_GrayKillStillRollsAndCanWinTheUnlock(t *testing.T) {
	def := testMobDefinition()
	def.CurveLevel = 1
	def.Factors.XPFactor = 1
	unlockSkill := &skills.SkillDefinition{ID: 3, Name: "Wild", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	def.Unlocks = []mobs.MobUnlock{{Skill: unlockSkill, Chance: 1}} // guaranteed
	m := NewMob(def, 0, nil)

	endgame := playerAtLevel(30)
	m.PlayerTouches(endgame, model.Damage{HP: 1000})

	require.Equal(t, []uint64{0}, endgame.xp, "the kill is gray")
	assert.True(t, endgame.sc.HasDiscovered(unlockSkill.ID),
		"a gray kill still drops skills — discovery is participation-based, not XP-based")
}

// §3.3: an OWNED summon stands where its owner stands, so a companion's kills
// price by the owner's level with no extra wiring. The pet of a level-20
// player pays its owner what a level-20 mob would.
func TestKillXP_OwnedSummonPricesByItsOwnersLevel(t *testing.T) {
	summon := mobAtLevel(t, 1, mobs.TierNormal, 1)
	owner := playerAtLevel(20)
	summon.SetOwner(owner)
	require.Equal(t, 20, summon.Level(), "an owned summon reads its owner's level live")

	killer := playerAtLevel(20)
	summon.PlayerTouches(killer, model.Damage{HP: 1000})

	k := curve.DefaultKillXP()
	assert.Equal(t, []uint64{k.Award(20, 20, 1, 1)}, killer.xp,
		"the summon is an at-level kill for a level-20 killer, not a level-1 gray one")
}

// The bystander path was the loudest half of the exploit: NotePresence granted
// the mob's FULL authored XP for standing near a fight with an aura up. It is
// now priced like any other participant — by their own level.
func TestKillXP_PresenceBystanderIsPricedByTheirOwnLevel(t *testing.T) {
	m := mobAtLevel(t, 20, mobs.TierNormal, 1)
	fighter := playerAtLevel(20)
	bystander := playerAtLevel(4)

	m.PlayerTouches(fighter, model.Damage{HP: 1})
	m.NotePresence(bystander)
	m.PlayerTouches(fighter, model.Damage{HP: 1000})

	k := curve.DefaultKillXP()
	assert.Equal(t, []uint64{k.Award(20, 20, 1, 1)}, fighter.xp)
	assert.Equal(t, []uint64{k.Award(4, 20, 1, 1)}, bystander.xp,
		"standing next to an endgame kill pays a level-4 what a level-4 kill pays, +the cap")
}

// The species knob, end to end: xpFactor scales the award, and 0 means zero —
// the floor that keeps "almost gray" honest must not resurrect an NPC's pay.
func TestKillXP_XPFactorScalesTheAwardAndZeroPaysNothing(t *testing.T) {
	k := curve.DefaultKillXP()
	killer := playerAtLevel(5)

	kite := mobAtLevel(t, 5, mobs.TierNormal, 0.5)
	kite.PlayerTouches(killer, model.Damage{HP: 1000})
	assert.Equal(t, []uint64{k.Award(5, 5, 1, 0.5)}, killer.xp, "the surviving Session-⑥ kite rule")

	structure := mobAtLevel(t, 5, mobs.TierNormal, 0)
	fixture := playerAtLevel(5)
	structure.PlayerTouches(fixture, model.Damage{HP: 1000})
	assert.Equal(t, []uint64{0}, fixture.xp, "an xpFactor-0 species pays nothing at any level")
}

func TestKillXP_TierMultipliesWhatTheSameKillPays(t *testing.T) {
	k := curve.DefaultKillXP()
	awards := map[string]uint64{}
	for _, tier := range []string{mobs.TierNormal, mobs.TierElite, mobs.TierBoss} {
		p := playerAtLevel(8)
		mobAtLevel(t, 8, tier, 1).PlayerTouches(p, model.Damage{HP: 100000})
		awards[tier] = p.xp[0]
	}

	assert.Equal(t, k.Award(8, 8, 1, 1), awards[mobs.TierNormal])
	assert.Equal(t, k.Award(8, 8, k.TierElite, 1), awards[mobs.TierElite])
	assert.Equal(t, k.Award(8, 8, k.TierBoss, 1), awards[mobs.TierBoss])
	assert.Greater(t, awards[mobs.TierBoss], awards[mobs.TierElite])
	assert.Greater(t, awards[mobs.TierElite], awards[mobs.TierNormal])
}

// L5/L2 at the boot seam: an absent conf block must resolve to the built-in
// economy, never to Go zero values. A server booting on a conf that predates
// the block (the live one) keeps paying.
func TestSetKillXP_UnconfiguredRestoresTheDefault(t *testing.T) {
	t.Cleanup(func() { SetKillXP(curve.DefaultKillXP()) })

	SetKillXP(curve.KillXP{})
	assert.Equal(t, curve.DefaultKillXP(), KillXPConfig(), "an empty block is not an empty economy")

	// ⚑ The dangerous case is the PARTIAL block, not the empty one — it is what
	// a calibration pass actually writes. Authored fields must win; unauthored
	// ones must fall back PER FIELD, or the two knobs C2 moves take the other
	// six down with them, silently.
	SetKillXP(curve.KillXP{Base: 999, Growth: 1.1, TierBoss: 3})
	got, d := KillXPConfig(), curve.DefaultKillXP()
	assert.EqualValues(t, 999, got.Base, "an authored field is installed as authored")
	assert.EqualValues(t, 3, got.TierBoss)
	assert.Equal(t, d.GrayStep, got.GrayStep, "an unauthored gray step must not become 0")
	assert.Equal(t, d.GrayBase, got.GrayBase)
	assert.Equal(t, d.UpBonus, got.UpBonus)
	assert.Equal(t, d.UpCap, got.UpCap)
	assert.Equal(t, d.TierElite, got.TierElite, "an unauthored tier weight must not become 0")

	p := playerAtLevel(1)
	mobAtLevel(t, 1, mobs.TierNormal, 1).PlayerTouches(p, model.Damage{HP: 1000})
	assert.Equal(t, []uint64{999}, p.xp, "the award site reads the configured economy")

	// The two consequences the whole-block guard would have shipped: an elite
	// paying nothing, and everything below your level paying nothing.
	elite := playerAtLevel(1)
	mobAtLevel(t, 1, mobs.TierElite, 1).PlayerTouches(elite, model.Damage{HP: 100000})
	assert.Greater(t, elite.xp[0], uint64(0), "an unauthored tierElite must not zero every elite in the game")

	near := playerAtLevel(8)
	mobAtLevel(t, 7, mobs.TierNormal, 1).PlayerTouches(near, model.Damage{HP: 100000})
	assert.Greater(t, near.xp[0], uint64(0), "an unauthored grayStep must not make everything below you gray")
}
