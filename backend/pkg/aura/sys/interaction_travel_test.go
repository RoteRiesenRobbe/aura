package sys

// The travel_to grant: the first conversation row that moves a player instead of
// handing them something (plan-portal-spells.md C1, D3/D5).
//
// The two ends are pinned together on purpose. present() renders the row LOCKED
// when the destination cannot resolve and applyGrant refuses it in the same
// state, which is L24's rule applied to a kind whose wall is not a level but a
// campfire somebody else is (or is no longer) bound to.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// --- doubles ---

// fakeTravel is the seam as the evaluator sees it: reachable or not, and a
// record of whether the move was actually asked for.
type fakeTravel struct {
	reachable bool
	travelled []mobs.TravelMode
}

func (f *fakeTravel) CanReach(mode mobs.TravelMode) bool { return f.reachable && mode != "" }

func (f *fakeTravel) Travel(mode mobs.TravelMode) bool {
	if !f.CanReach(mode) {
		return false
	}
	f.travelled = append(f.travelled, mode)
	return true
}

// portalInteraction is the authored shape C1's content will carry: one node, one
// row, one travel grant.
func portalInteraction() *mobs.Interaction {
	return &mobs.Interaction{
		Range: 2.0,
		Nodes: []mobs.InteractionNode{{
			ID:    "root",
			Lines: []string{"A doorway hangs in the air."},
			Options: []mobs.InteractionOption{{
				Text: "Step through.",
				Grants: []mobs.InteractionGrant{{
					Kind:   mobs.GrantTravelTo,
					Travel: mobs.TravelHomeCampfire,
					Line:   "You step through.",
				}},
			}},
		}},
	}
}

// --- present(): the row, and the wall when there is no destination ---

func TestPresent_TravelRowRendersFromItsAuthoredText(t *testing.T) {
	rows := rowsOf(t, present(portalInteraction(), newLearner(1), noRows, &fakeTravel{reachable: true}), "root")

	require.Len(t, rows, 1)
	assert.Equal(t, "Step through.", rows[0].Text)
	assert.Equal(t, "You step through.", rows[0].Reply, "the panel speaks the grant's line")
	assert.False(t, rows[0].Locked)
	assert.Equal(t, uint8(0), rows[0].GrantIndex, "a takeable row is never the navigation sentinel")
}

// ⭐ The refusal is a WALL, not a missing row. A portal whose owner went offline
// still stands there, so a vanishing row would read as a broken prompt; the
// locked row names why nothing happens.
func TestPresent_TravelRowLocksWhenTheDestinationCannotResolve(t *testing.T) {
	rows := rowsOf(t, present(portalInteraction(), newLearner(1), noRows, &fakeTravel{reachable: false}), "root")

	require.Len(t, rows, 1)
	assert.True(t, rows[0].Locked)
	assert.Contains(t, rows[0].Text, "Step through.")
	assert.Contains(t, rows[0].Text, "locked")
	assert.Empty(t, rows[0].Reply, "a locked row is inert, so the panel has nothing to speak")
}

// A world with no seam wired at all is the same wall: fail closed, exactly like
// a missing RowSource.
func TestPresent_TravelRowLocksWithoutASeam(t *testing.T) {
	rows := rowsOf(t, present(portalInteraction(), newLearner(1), noRows, noTravel), "root")

	require.Len(t, rows, 1)
	assert.True(t, rows[0].Locked)
}

// --- applyGrant(): the move, and the refusals ---

func TestApplyGrant_TravelAsksTheSeamToMoveThePlayer(t *testing.T) {
	tr := &fakeTravel{reachable: true}
	reply, taught, ok := applyGrant(portalInteraction(), newLearner(1), noRows, tr, "root", 0, 0)

	require.True(t, ok)
	assert.Equal(t, "You step through.", reply)
	assert.Nil(t, taught, "travel_to hands over nothing, so there is no unlock banner")
	assert.Equal(t, []mobs.TravelMode{mobs.TravelHomeCampfire}, tr.travelled)
}

func TestApplyGrant_TravelRefusedWhenTheDestinationIsGone(t *testing.T) {
	tr := &fakeTravel{reachable: false}
	reply, taught, ok := applyGrant(portalInteraction(), newLearner(1), noRows, tr, "root", 0, 0)

	assert.False(t, ok, "a silent refusal, like every other stale click")
	assert.Empty(t, reply)
	assert.Nil(t, taught)
	assert.Empty(t, tr.travelled, "and nothing moved")
}

func TestApplyGrant_TravelRefusedWithoutASeam(t *testing.T) {
	_, _, ok := applyGrant(portalInteraction(), newLearner(1), noRows, noTravel, "root", 0, 0)
	assert.False(t, ok)
}

// L24 for the travel kind: whatever present() shows, applyGrant must agree with -
// swept over both states the seam can be in.
func TestPresentAndApplyTravel_CannotDisagree(t *testing.T) {
	for _, reachable := range []bool{true, false} {
		rows := rowsOf(t, present(portalInteraction(), newLearner(1), noRows, &fakeTravel{reachable: reachable}), "root")
		require.Len(t, rows, 1, "reachable=%v", reachable)
		row := rows[0]

		taker := &fakeTravel{reachable: reachable}
		reply, _, ok := applyGrant(portalInteraction(), newLearner(1), noRows, taker,
			"root", int(row.OptionIndex), int(row.GrantIndex))

		if row.Locked {
			assert.False(t, ok, "a locked row is inert")
			assert.Empty(t, row.Reply)
			assert.Empty(t, reply)
			continue
		}
		require.True(t, ok, "a presented available row must always be accepted")
		assert.Equal(t, row.Reply, reply, "the panel already said this")
	}
}

// --- portalTravel: the real seam, over the real anchor lookup ---

func TestPortalTravel_DeliversToTheOwnersAnchor(t *testing.T) {
	owner := newFakePlayer()
	rider := newFakePlayer()
	anchor := phy.Vec2f{X: 40, Y: -12}
	tr := portalTravel{anchors: &fakeConnState{anchor: anchor, bound: true}, owner: owner, rider: rider}
	rider.SetConversingWith(7)

	require.True(t, tr.CanReach(mobs.TravelHomeCampfire))
	require.True(t, tr.Travel(mobs.TravelHomeCampfire))

	dist := rider.Position().DistanceToSquared(anchor)
	assert.LessOrEqual(t, dist, float32(respawnJitterRadius*respawnJitterRadius),
		"delivered into the jitter disc around the owner's fire")
	assert.Equal(t, 1, rider.grounded, "the Recall/WARP recipe: Ground() before the jump")
	assert.Zero(t, rider.ConversingWith(), "the player is out of range now, so the panel closes with them")
}

// ⚑ ONE MISS COVERS BOTH REFUSALS the PO checklist names, and that is a property
// of AnchorOf rather than a shortcut: the anchor is CONNECTION state, deleted
// with the owner's connection, so "never bound" and "logged out" arrive here as
// the same false.
func TestPortalTravel_RefusesWithoutAnAnchor(t *testing.T) {
	rider := newFakePlayer()
	tr := portalTravel{anchors: &fakeConnState{bound: false}, owner: newFakePlayer(), rider: rider}

	assert.False(t, tr.CanReach(mobs.TravelHomeCampfire))
	assert.False(t, tr.Travel(mobs.TravelHomeCampfire))
	assert.Equal(t, phy.VEC2F_ZERO, rider.Position(), "nothing moved")
	assert.Zero(t, rider.grounded)
}

// A zone-placed conversant has no owner at all, so a travel row on one leads
// nowhere. Fails closed rather than reaching through a nil.
func TestPortalTravel_RefusesWithoutAnOwner(t *testing.T) {
	tr := portalTravel{anchors: &fakeConnState{anchor: phy.Vec2f{X: 1}, bound: true}, rider: newFakePlayer()}
	assert.False(t, tr.CanReach(mobs.TravelHomeCampfire))
	assert.False(t, tr.Travel(mobs.TravelHomeCampfire))
}

func TestPortalTravel_RefusesAnUnknownMode(t *testing.T) {
	tr := portalTravel{anchors: &fakeConnState{anchor: phy.Vec2f{X: 1}, bound: true}, owner: newFakePlayer(), rider: newFakePlayer()}
	assert.False(t, tr.CanReach("caster"), "C2's mode is not implemented, so it delivers nobody")
}

// --- end to end, through the system ---

// portalFixture is a RUNTIME-spawned conversant: the shape spawnSummon produces,
// with an owner bound and the anchor seam wired.
func portalFixture(t *testing.T, owner *fakePlayer, cs *fakeConnState) (
	*InteractionSystem, *phy.Space, *mob.Mob, *fakePlayer, *phy.Circle) {
	t.Helper()
	space := phy.NewSpace()

	m := mob.NewMob(npcDef("Portal", portalInteraction()), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	m.SetOwner(owner)
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.level = 10
	p.SetPosition(phy.Vec2f{X: 1, Y: 0})
	body := addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem()
	s.SetAnchors(cs)
	s.AddEntity(m)
	s.AddPlayer(p)
	// ⚑ The BODY comes back too: the fake's SetPosition moves only its aura
	// circle, while the sensor reads the body, so walking out of range means
	// moving both (the TestSession_EndsOnWalkingAway precedent).
	return s, space, m, p, body
}

func TestInteractionSystem_StepThroughDeliversToTheCastersFire(t *testing.T) {
	anchor := phy.Vec2f{X: 60, Y: 60}
	s, space, m, p, _ := portalFixture(t, newFakePlayer(), &fakeConnState{anchor: anchor, bound: true})
	step := stepper(s, space, p)

	takeRow(p, m.Basic().ID(), "root", 0, 0)
	step()

	dist := p.Position().DistanceToSquared(anchor)
	assert.LessOrEqual(t, dist, float32(respawnJitterRadius*respawnJitterRadius),
		"the clicking player lands at the OWNER's fire, not their own")
	assert.Empty(t, unlocksOf(p), "nothing entered the spellbook, so nothing is attributed")
	assert.Zero(t, p.ConversingWith(), "the step-through ends the conversation (§5)")
}

// PO checklist item 9: the caster logs out with the portal standing.
func TestInteractionSystem_StepThroughRefusedWhenTheOwnerIsGone(t *testing.T) {
	s, space, m, p, _ := portalFixture(t, newFakePlayer(), &fakeConnState{bound: false})
	step := stepper(s, space, p)

	pressInteract(p, m.Basic().ID())
	step()

	require.NotNil(t, p.conversation)
	rows := rowsOf(t, p.conversation, "root")
	require.Len(t, rows, 1)
	assert.True(t, rows[0].Locked, "the prompt names the wall instead of pretending to work")

	takeRow(p, m.Basic().ID(), "root", 0, 0)
	step()
	assert.Equal(t, phy.Vec2f{X: 1, Y: 0}, p.Position(), "and clicking it anyway moves nobody")
}

// Range enforcement is not special-cased for travel: the drain validates every
// Interact against the one stamp sense() wrote, so a click from a player who
// walked out of reach moves nobody (chunk 3b-i, L17).
func TestInteractionSystem_StepThroughRefusedOutOfRange(t *testing.T) {
	s, space, m, p, body := portalFixture(t, newFakePlayer(), &fakeConnState{anchor: phy.Vec2f{X: 60}, bound: true})
	step := stepper(s, space, p)

	// Out of the portal's sensor before the tick that drains the click.
	body.SetPosition(phy.Vec2f{X: 50, Y: 0})
	p.SetPosition(phy.Vec2f{X: 50, Y: 0})
	takeRow(p, m.Basic().ID(), "root", 0, 0)
	step()

	assert.Zero(t, p.Interactable(), "nothing is in range to stamp")
	assert.Equal(t, phy.Vec2f{X: 50, Y: 0}, p.Position(), "so the row is refused before it ever resolves")
}

// --- the spawned conversant's lifecycle (C1 step 2) ---

// Today's conversants are all zone-placed at boot. A portal is added while the
// world runs, which is what game.AddEntity's mob branch already does - pinned
// here because the whole spell depends on it.
func TestInteractionSystem_RegistersAConversantAddedMidRun(t *testing.T) {
	s, space, _, p, _ := portalFixture(t, newFakePlayer(), &fakeConnState{bound: true})
	step := stepper(s, space, p)

	late := mob.NewMob(npcDef("LatePortal", portalInteraction()), 0, nil)
	late.SetPosition(phy.Vec2f{X: 1.2, Y: 0})
	late.SetOwner(newFakePlayer())
	addNpcToSpace(t, space, late)
	s.AddEntity(late)

	step()

	assert.Equal(t, late.Basic().ID(), p.Interactable(),
		"the nearer of the two is offered, so the late arrival is live in the sensor pass")
}

// TTL death: the portal despawns while somebody is reading its prompt. The
// session must end and no ghost offer may survive it (PO checklist item 7).
func TestInteractionSystem_DespawningPortalClosesTheConversation(t *testing.T) {
	s, space, m, p, _ := portalFixture(t, newFakePlayer(), &fakeConnState{anchor: phy.Vec2f{X: 5}, bound: true})
	step := stepper(s, space, p)

	pressInteract(p, m.Basic().ID())
	step()
	require.Equal(t, m.Basic().ID(), p.ConversingWith())
	require.NotNil(t, p.conversation)

	// The death sweep's fan-out, verbatim: the entity leaves the space and every
	// system, and the tick's stamp is cleared first (ResetTickNumbers).
	for _, b := range m.Bodies() {
		space.RemoveShape(b)
	}
	s.Remove(m.Basic())
	step()

	assert.Zero(t, p.ConversingWith(), "the panel closes with the portal")
	assert.Zero(t, p.Interactable(), "and no ghost offer survives it")
}

// ⚑ THE COMBAT-GATE VERDICT (plan-portal-spells.md C1 step 2, D2). Conversant
// carries InCombat(), so the plan asked whether a portal under attack goes mute
// and whether EnlistUnder therefore has to become Align. It cuts NEITHER way,
// for two independent reasons, and both are pinned here so the content recipe
// can be authored against them:
//
//   - the interaction system stopped consulting InCombat() at all (Q1 §4.2 -
//     see TestSession_SurvivesCombat), so a fighting conversant still talks;
//   - the memorial-stone body recipe is not on either combatant layer, so no
//     aura mask can reach it and no aggro sensor can see it. Nothing can put it
//     in combat in the first place.
//
// EnlistUnder is therefore harmless on a portal built to this recipe.
func TestPortalRecipe_IsUnreachableByAurasAndAggro(t *testing.T) {
	const portalLayer = 97 // the memorial stone's: MobStatic|Viewport|PlayerStatic

	assert.Zero(t, portalLayer&int(model.LayerCombatants),
		"no aura mask can reach it: every damage/heal query masks LayerCombatants")

	// The aggro sensor's mask is built from the two combatant bits alone, so a
	// mob that aggros everything still cannot acquire this body.
	hostile := mob.NewMob(npcDef("Wolf", nil), 0, nil)
	hostile.Align()
	assert.Zero(t, portalLayer&hostile.Sensor().Shape().Mask,
		"and nothing can even see it to chase it")
}

// The seam is optional wiring, and a world without it must still hold
// conversations - the AddRowSource posture.
func TestInteractionSystem_UnwiredAnchorSeamLocksTravelRows(t *testing.T) {
	space := phy.NewSpace()
	m := mob.NewMob(npcDef("Portal", portalInteraction()), 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	m.SetOwner(newFakePlayer())
	addNpcToSpace(t, space, m)

	p := newFakePlayer()
	p.SetPosition(phy.Vec2f{X: 1, Y: 0})
	addPlayerCollider(space, p, phy.Vec2f{X: 1, Y: 0})

	s := NewInteractionSystem() // no SetAnchors
	s.AddEntity(m)
	s.AddPlayer(p)
	step := stepper(s, space, p)

	pressInteract(p, m.Basic().ID())
	step()

	require.NotNil(t, p.conversation)
	rows := rowsOf(t, p.conversation, "root")
	require.Len(t, rows, 1)
	assert.True(t, rows[0].Locked)
}
