package mobs

// Content pin for the authored roles (plan-entity-model.md chunk 2).
//
// The roles are not derivable from anything any more — that is the point — so
// the only guard against a def drifting (or a new one forgetting the key and
// silently becoming a creature) is to state the census here. It is a pin, not a
// rule: adding a structure is fine, adding it *and* this line is the whole
// ceremony. D3 (PO 2026-07-27) deliberately declined a loader guard, because a
// stationary creature is a legal thing to want — so this is where a mistake
// gets caught instead.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	afactions "github.com/RoteRiesenRobbe/aura/pkg/api/factions"
	amobs "github.com/RoteRiesenRobbe/aura/pkg/api/mobs"
	askills "github.com/RoteRiesenRobbe/aura/pkg/api/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

func contentRegistry(t *testing.T) Registry {
	t.Helper()
	sr, err := skills.RegistryFromFS(askills.Skills, mustFactions(t))
	require.NoError(t, err)
	fr, err := factions.RegistryFromFS(afactions.Factions)
	require.NoError(t, err)
	mr, err := RegistryFromFS(sr, fr, curve.Default(), amobs.Mobs)
	require.NoError(t, err)
	return mr
}

func TestContent_AuthoredRoleCensus(t *testing.T) {
	byRole := map[Role][]string{}
	for _, def := range contentRegistry(t).Mobs() {
		byRole[def.Role] = append(byRole[def.Role], def.Name)
	}

	// ⚑ ProjectileBomb (docs/plan-prototype-projectile.md D1, P1) is the first
	// structure that is THROWN rather than placed or summoned beside its caster,
	// and it is a structure for the same reason the totems are: no AI, no chase,
	// no aggro sensor, and its loadout is its entire behaviour. Unlike the two
	// portals it is not a creature - it does not talk, it detonates.
	assert.ElementsMatch(t, []string{
		"Bramble", "Camp", "Campfire", "FireTotem", "PoisonPool", "ProjectileBomb",
		"Rockfall", "SpikeBarricade", "Totem", "Turnip", "WarbannerTotem",
	}, byRole[RoleStructure], "the authored structures")

	assert.ElementsMatch(t, []string{
		"Companion", "MedicCompanion", "ShieldbearerCompanion", "SoldierCompanion",
	}, byRole[RoleFollower], "the authored followers")

	// 36 before chunk 3a, plus the 14 merged NPCs: D4 authors them as creatures
	// that simply state speed 0, so that content can later give one a loadout
	// and a walk without changing what it IS. +1 for the AscensionStone and +1
	// for the MemorialStone, which are the same case twice more
	// (plan-ascension.md §4.1, C3 step 6): a stone is not a structure, it is a
	// creature that authors no movement. ⚑ The distinction is load-bearing rather
	// than pedantic: InteractionSystem registers MobEntitys, and a structure
	// runs its aura always-on, which is not what an object that merely talks is.
	// +1 again for the FrontAscensionStone (plan-ascension-sites.md C1), which
	// is the third time the same case is authored — and now an expected-to-grow
	// one, since D1 makes a differently-priced site ordinary content.
	// 44 → 45 with the PortalHome (plan-portal-spells.md C1): a fourth object that
	// talks and authors no movement, and the first that is spawned at runtime
	// rather than placed in a zone. ⚑ It is a creature for the reason spelled out
	// above and NOT because of the sprite it borrows: it reuses the FireTotem
	// entityType, which is a structure, so role and art disagree here on purpose.
	// 45 → 46 with the PortalSummon (plan-portal-spells.md C2): the same recipe
	// a fifth time, for the pair's other portal.
	assert.Len(t, byRole[RoleCreature], 46, "everything else is a creature")
	assert.Len(t, byRole, 3, "no def carries a role outside the three")
}

// The sensor rule the roles buy: a structure authors none (the ten 0.1 dummies
// are gone), and everything that moves toward something authors a real one.
func TestContent_OnlyStructuresOmitTheirSensor(t *testing.T) {
	for _, def := range contentRegistry(t).Mobs() {
		if def.Role == RoleStructure {
			assert.Zero(t, def.Body.AggroRadius,
				"%s is a structure — it acquires nothing, so the dummy sensor should be gone", def.Name)
			continue
		}
		assert.Greater(t, def.Body.AggroRadius, float32(0),
			"%s moves toward things and must author a sensor", def.Name)
	}
}

// mustFactions loads the embedded faction registry — the counterpart to the
// embedded skills the tests here parse, needed since a skill may author a
// targetFactions allowlist resolved at load (plan-faction-flips D8).
func mustFactions(t *testing.T) factions.Registry {
	t.Helper()
	fr, err := factions.RegistryFromFS(afactions.Factions)
	require.NoError(t, err)
	return fr
}
