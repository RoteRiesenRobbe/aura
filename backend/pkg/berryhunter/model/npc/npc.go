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

// placeholderSprite is the reused client sprite every NPC renders as until a
// dedicated NPC sprite exists (chunk 2). It must be a Resource-backed
// EntityType because NPCs ride the Resource wire path (PropEntityFlatbufMarshal)
// — a Mob sprite class expects health/aura wire fields a Resource payload lacks.
const placeholderSprite = model.EntityType(BerryhunterApi.EntityTypeFlower)

// placeholderVisualRadius is the NPC's body/sprite radius in server units
// [PLACEHOLDER]. Distinct from the (larger) sensor radius, which is authored
// per NPC in the zone file.
const placeholderVisualRadius float32 = 1.0

// Npc is a static teaching/lore NPC. The embedded BaseEntity holds the visual
// body (also what Bodies(), Position(), Radius() and the Resource marshal read);
// sensor is the separate dynamic proximity circle.
type Npc struct {
	model.BaseEntity
	sensor *phy.Circle
}

var _ = model.NpcEntity(&Npc{})

// New builds a static teaching/lore NPC at pos: a solid visual body plus a
// proximity sensor of sensorRadius that detects players (LayerPlayerCollision).
func New(pos phy.Vec2f, sensorRadius float32) *Npc {
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
		BaseEntity: model.NewBaseEntity(body, placeholderSprite),
		sensor:     sensor,
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
