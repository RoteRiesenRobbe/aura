package mob

// D3, criterion by criterion (plan-world-scale.md S3). Pristine is the whole
// safety argument for dormancy — every clause here is something that would
// otherwise keep advancing while the mob is frozen — so each one gets its own
// leg rather than riding on a composite fixture.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// pristineMob is a freshly spawned world mob: full health, no owner, no
// threat, nothing applied — the one state dormancy accepts.
func pristineMob(t *testing.T) *Mob {
	t.Helper()
	m := NewMob(testMobDefinition(), 0, nil)
	require.True(t, m.Pristine(), "fixture: a fresh world mob must be pristine")
	return m
}

func TestPristine_FreshWorldMobQualifies(t *testing.T) {
	m := pristineMob(t)
	assert.True(t, m.Pristine())
	assert.False(t, m.PlayerControlled(), "a world mob is nobody's")
}

// The clause that structurally closes Update's death check: a dormant mob
// cannot be sitting at 0 HP waiting to be collected.
func TestPristine_WoundedMobIsRefused(t *testing.T) {
	m := pristineMob(t)
	m.MobTouches(nil, mobs.Factors{Damage: 5})
	assert.False(t, m.Pristine(), "a wounded mob must keep ticking — it has regen owed")
}

// The clause that closes Update's TTL countdown.
func TestPristine_TTLIsRefused(t *testing.T) {
	m := pristineMob(t)
	m.SetTTLTicks(60)
	assert.False(t, m.Pristine(), "a TTL has to keep counting down")
}

// The clause that closes Update's charm expiry.
func TestPristine_CharmedMobIsRefused(t *testing.T) {
	m := pristineMob(t)
	m.Charm(newFakeAuraPlayer(), skills.SkillID(1), 60)
	require.NotNil(t, m.CreditTo(), "fixture: the charm took")
	assert.False(t, m.Pristine(), "a charm has to be able to expire")
	assert.True(t, m.PlayerControlled(), "and a charmed mob is itself a wake source (D4)")
}

func TestPristine_OwnedMobIsRefused(t *testing.T) {
	m := pristineMob(t)
	m.SetOwner(newFakeAuraPlayer())
	assert.False(t, m.Pristine(), "summons, totems and companions are excluded outright")
	assert.True(t, m.PlayerControlled(), "and are wake sources themselves (D4/L2)")
}

func TestPristine_ThreatIsRefused(t *testing.T) {
	m := pristineMob(t)
	m.ForceThreatToTop(newFakeCombatant(), 50)
	assert.False(t, m.Pristine(), "threat outlives the aggro target and must keep being processed")
}

func TestPristine_AppliedBuffIsRefused(t *testing.T) {
	m := pristineMob(t)
	m.ApplyDot(skills.SkillID(1), skills.DotBuff{HP: 3, Interval: 3}, 90)
	assert.False(t, m.Pristine(), "a dot must keep dealing its damage")
}

// A shield is the case Buffs.Empty exists for: it carries AppliedEffectNone
// because the wire ubyte has no bit left, so a predicate written against
// AppliedEffects would read a shielded mob as quiet and freeze a live shield
// mid-drain.
func TestPristine_ShieldIsRefusedDespiteCarryingNoPipBit(t *testing.T) {
	m := pristineMob(t)
	m.ApplyShield(skills.SkillID(1), 20, 90)
	require.Equal(t, skills.AppliedEffectNone, m.AppliedEffects(),
		"fixture: a shield shows no pip — that is the trap")
	assert.False(t, m.Pristine(), "but it is emphatically not nothing")
}

func TestPristine_StatusEffectIsRefused(t *testing.T) {
	m := pristineMob(t)
	m.StatusEffects().Add(model.StatusEffectDamagedAmbient)
	assert.False(t, m.Pristine(), "a status effect means something happened this tick")
}

// Structures are excluded deliberately and narrowly — see dormancy.go. They are
// respawn anchors and quest fixtures whose aura never gates, and there are a few
// dozen against ~15 000 wild spawns.
func TestPristine_StructureIsRefused(t *testing.T) {
	def := testMobDefinition()
	def.Role = mobs.RoleStructure
	m := NewMob(def, 0, nil)
	assert.False(t, m.Pristine(), "campfires and braziers do not sleep")
}

// The encounter-controller seams: a scripted phase is running whatever the
// mob's health says.
func TestPristine_ScriptedStateIsRefused(t *testing.T) {
	m := pristineMob(t)
	m.SetInvulnerable(true)
	assert.False(t, m.Pristine(), "a scripted invulnerability phase is not a quiet mob")

	m2 := pristineMob(t)
	m2.SetFleeOverride(true)
	assert.False(t, m2.Pristine(), "nor is a scripted flee")
}

// Dormant is pure bookkeeping owned by MobSystem — the mob never sets it
// itself, so the flag and the space surgery cannot drift apart.
func TestDormantFlag_RoundTrips(t *testing.T) {
	m := pristineMob(t)
	assert.False(t, m.Dormant(), "a fresh mob is awake")
	m.SetDormant(true)
	assert.True(t, m.Dormant())
	m.SetDormant(false)
	assert.False(t, m.Dormant())
}
