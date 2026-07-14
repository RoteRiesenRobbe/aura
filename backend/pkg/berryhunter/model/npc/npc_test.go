package npc

import (
	"testing"

	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

// TestSensorReportsOverlappingPlayer is the chunk-2 checkpoint: an NPC placed
// exactly as game.addNpcEntity places it — visual body STATIC, sensor DYNAMIC —
// reports an overlapping player-layer shape in the sensor's Collisions().
func TestSensorReportsOverlappingPlayer(t *testing.T) {
	space := phy.NewSpace()

	n := New(phy.Vec2f{X: 0, Y: 0}, 3)
	// Mirror addNpcEntity: visual body static, sensor dynamic.
	space.AddStaticShape(n.Bodies()[0])
	space.AddShape(n.Sensor())

	// A dynamic player-layer shape overlapping the sensor (radius 3, player at
	// distance 1).
	player := phy.NewCircle(phy.Vec2f{X: 1, Y: 0}, 0.5)
	player.Shape().Layer = int(model.LayerPlayerCollision)
	space.AddShape(player)

	space.Update()

	if _, ok := n.Sensor().Collisions()[player]; !ok {
		t.Fatalf("static-bodied NPC's dynamic sensor did not report the overlapping player")
	}
}

// TestSensorIgnoresPlayerOutOfRange guards the sensor radius: a player beyond
// the sensor circle is not reported.
func TestSensorIgnoresPlayerOutOfRange(t *testing.T) {
	space := phy.NewSpace()

	n := New(phy.Vec2f{X: 0, Y: 0}, 3)
	space.AddStaticShape(n.Bodies()[0])
	space.AddShape(n.Sensor())

	// Well outside the radius-3 sensor.
	player := phy.NewCircle(phy.Vec2f{X: 20, Y: 0}, 0.5)
	player.Shape().Layer = int(model.LayerPlayerCollision)
	space.AddShape(player)

	space.Update()

	if len(n.Sensor().Collisions()) != 0 {
		t.Fatalf("sensor reported a player out of range: %d collisions", len(n.Sensor().Collisions()))
	}
}

// TestStaticSensorReportsNothing documents WHY the NPC sensor is registered as
// a dynamic shape rather than a static one: the physics broadphase only records
// collisions onto dynamic shapes, so a static sensor is blind even when a
// player overlaps it. This is the pitfall addNpcEntity avoids.
func TestStaticSensorReportsNothing(t *testing.T) {
	space := phy.NewSpace()

	sensor := phy.NewCircle(phy.Vec2f{X: 0, Y: 0}, 3)
	sensor.Shape().Mask = int(model.LayerPlayerCollision)
	sensor.Shape().IsSensor = true
	space.AddStaticShape(sensor) // WRONG on purpose: static sensors never sense.

	player := phy.NewCircle(phy.Vec2f{X: 1, Y: 0}, 0.5)
	player.Shape().Layer = int(model.LayerPlayerCollision)
	space.AddShape(player)

	space.Update()

	if len(sensor.Collisions()) != 0 {
		t.Fatalf("expected a static sensor to report nothing, got %d collisions", len(sensor.Collisions()))
	}
}
