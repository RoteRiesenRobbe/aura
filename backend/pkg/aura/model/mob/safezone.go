package mob

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// Campfire hard safe-zones (playtest-1 feedback Pass A, decision 4, PO
// 2026-07-22). A campfire is a guaranteed-safe anchor: hostile mobs never
// enter its radius, and a chase breaks the moment the target reaches it —
// threat cleared, aura off, mob walks home. The tester had no reliable place
// to stop and read the screen; the fires now provide one.
//
// The zones are world data placed once at boot from zone.campfires (see
// cmd/aurad) and never move, so they live in one package-level slice rather
// than being threaded through all five NewMob call sites. Nothing installs
// them in the sim harness or in tests, where the slice stays nil and mob
// movement is exactly the pre-chunk geometry.

// CampfireSafeRadiusFactor [PLACEHOLDER] scales a campfire's heal radius into
// its safe radius. 1.0 = exactly the ring the client already draws, so the
// safe area is precisely what the player sees. Raising it pushes mobs further
// out (a fully splash-proof centre needs the widest mob aura on top).
const CampfireSafeRadiusFactor = 1.0

// SafeZone is one no-go circle: the campfire's visible heal ring.
type SafeZone struct {
	Center phy.Vec2f
	Radius float32
}

var safeZones []SafeZone

// SetSafeZones installs the world's campfire safe-zones. Called once at boot;
// nil clears (tests).
func SetSafeZones(zones []SafeZone) {
	safeZones = zones
}

// respectsSafeZones reports whether the fires bar this mob. Aligned mobs
// (player companions, summons, the campfire fixture itself) and the
// player-friendly front army walk in freely — the zone exists to keep the
// things that hunt players out.
func (m *Mob) respectsSafeZones() bool {
	if len(safeZones) == 0 {
		return false
	}
	return m.faction != model.FactionAligned && !m.definition.FriendlyToPlayers
}

// blockedBySafeZone reports whether p lies inside a fire — the acquisition
// filter and the chase-break check. Point-in-circle: the position handed in is
// a target's centre, so "inside the ring" is what the player sees on screen.
func (m *Mob) blockedBySafeZone(p phy.Vec2f) bool {
	if !m.respectsSafeZones() {
		return false
	}
	for i := range safeZones {
		if p.Sub(safeZones[i].Center).AbsSq() < safeZones[i].Radius*safeZones[i].Radius {
			return true
		}
	}
	return false
}

// clampOutOfSafeZones pushes a step destination back to the ring so the mob's
// BODY never overlaps a fire. Radial projection, not a step cancel: a mob
// walking past a campfire slides along the boundary instead of freezing at it.
func (m *Mob) clampOutOfSafeZones(p phy.Vec2f) phy.Vec2f {
	if !m.respectsSafeZones() {
		return p
	}
	for i := range safeZones {
		keepOut := safeZones[i].Radius + m.Radius()
		delta := p.Sub(safeZones[i].Center)
		d := delta.Abs()
		if d >= keepOut {
			continue
		}
		if d < 1e-4 {
			// Dead centre (a mob spawned on top of a fire): no radial direction
			// exists — leave along the current heading, like circleRepulsion's
			// dead-centre fallback.
			p = safeZones[i].Center.Add(m.heading.Mult(keepOut))
			continue
		}
		p = safeZones[i].Center.Add(delta.Div(d).Mult(keepOut))
	}
	return p
}

// moveTo is the single write point for every movement mode (chase, walk-home,
// flee, idle wander): the safe-zone clamp sits here so no mode can bypass it.
func (m *Mob) moveTo(p phy.Vec2f) {
	m.SetPosition(m.clampOutOfSafeZones(p))
}
