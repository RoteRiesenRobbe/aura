// Package npc implements the peaceful, hand-placed teaching/lore NPC
// (plan-npc-teaching.md) — the first non-hostile interactive entity. An NPC is
// unattackable by construction: no HP, not a Combatant, not a valid aura
// target, so no faction flag is needed.
//
// An NPC is two circles: a small STATIC visual body (rides the Resource wire
// path like a prop, reusing a placeholder sprite) and a larger DYNAMIC
// proximity sensor that reports the players standing in range. The sensor must
// be dynamic even though the NPC never moves: the physics broadphase only
// records collisions onto dynamic shapes (a static shape's Collisions() is
// always empty), so a static sensor would sense nothing. game.addNpcEntity
// registers the two bodies on their respective sides of the space; routing an
// NPC through the plain-Entity path would register only Bodies()[0] and
// silently drop the sensor.
package npc

import (
	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

// PlaceholderSprite is the reused client sprite an NPC renders as when its
// zone entry names no entityType (content pass C2 made the sprite authorable).
// It must be a Resource-backed EntityType because NPCs ride the Resource wire
// path (PropEntityFlatbufMarshal) — a Mob sprite class expects health/aura
// wire fields a Resource payload lacks.
const PlaceholderSprite = model.EntityType(BerryhunterApi.EntityTypeFlower)

// SpriteFor resolves an authored zone-JSON entityType name to the NPC's wire
// sprite. Empty = the placeholder; unknown names also fall back to it (the
// zone loader already hard-fails those — this is belt-and-braces, not a
// second validation site).
func SpriteFor(entityType string) model.EntityType {
	if entityType == "" {
		return PlaceholderSprite
	}
	if v, ok := BerryhunterApi.EnumValuesEntityType[entityType]; ok {
		return model.EntityType(v)
	}
	return PlaceholderSprite
}

// placeholderVisualRadius is the NPC's body/sprite radius in server units
// [PLACEHOLDER]. Distinct from the (larger) sensor radius, which is authored
// per NPC in the zone file. Slightly bigger than the player's 0.25 — an NPC
// should read person-sized, not landmark-sized (PO, C8 walkthrough 2026-07-20).
const placeholderVisualRadius float32 = 0.35

// Npc is a static teaching/lore NPC. The embedded BaseEntity holds the visual
// body (also what Bodies(), Position(), Radius() and the Resource marshal read);
// sensor is the separate dynamic proximity circle. teachings/tooLowLine/lines
// are the approach payload the NpcSystem reads (chunk 3) — decomposed model
// types built in the boot loop, so model/npc never imports world.
type Npc struct {
	model.BaseEntity
	sensor     *phy.Circle
	teachings  []model.Teaching
	tooLowLine string
	lines      []string
}

var _ = model.NpcEntity(&Npc{})

// New builds a static teaching/lore NPC at pos: a solid visual body plus a
// proximity sensor of sensorRadius that detects players (LayerPlayerCollision).
// sprite is the wire EntityType the NPC renders as (SpriteFor resolves the
// authored name; pass PlaceholderSprite when none is authored).
// teachings/tooLowLine/lines are the approach payload (chunk 3); a pure-lore
// NPC passes nil teachings + empty tooLowLine.
func New(pos phy.Vec2f, sensorRadius float32, sprite model.EntityType, teachings []model.Teaching, tooLowLine string, lines []string) *Npc {
	// Solid like a prop: players and mobs bump into the NPC, and it streams to
	// clients via the viewport layer.
	body := phy.NewCircle(pos, placeholderVisualRadius)
	body.Shape().Layer = int(model.LayerPlayerStaticCollision | model.LayerMobStaticCollision | model.LayerViewportCollision)

	// Sensor: sees players only, collides with nothing physically (Layer none +
	// IsSensor), so it perturbs no movement — it just reports Collisions().
	sensor := phy.NewCircle(pos, sensorRadius)
	sensor.Shape().Layer = int(model.LayerNoneCollision)
	sensor.Shape().Mask = int(model.LayerPlayerCollision)
	sensor.Shape().IsSensor = true

	n := &Npc{
		BaseEntity: model.NewBaseEntity(body, sprite),
		sensor:     sensor,
		teachings:  teachings,
		tooLowLine: tooLowLine,
		lines:      lines,
	}
	// UserData is how viewport queries (streaming) and the sensor's collision
	// readers find the entity behind a shape.
	body.Shape().UserData = n
	sensor.Shape().UserData = n
	return n
}

// Sensor is the NPC's proximity sensor, registered into the physics space as a
// DYNAMIC shape by game.addNpcEntity so its Collisions() report nearby players.
func (n *Npc) Sensor() phy.DynamicCollider {
	return n.sensor
}

// Teachings are the ordered skill grants this NPC offers on approach (chunk 3).
func (n *Npc) Teachings() []model.Teaching { return n.teachings }

// TooLowLine is spoken (nothing granted) when a player is below the required
// level of the next ungranted teaching.
func (n *Npc) TooLowLine() string { return n.tooLowLine }

// Lines are the lore/sign-post fallback, spoken when nothing is taught.
func (n *Npc) Lines() []string { return n.lines }
