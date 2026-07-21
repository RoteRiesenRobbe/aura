package model

import "testing"

// TestCollisionLayerBitsPinned pins the numeric value of every collision
// layer.
//
// These bits are NOT free to renumber. Every `body.collisionLayer` and
// `body.collisionMask` in `api/mobs/*.json` is authored as a **raw integer**
// (campfire/brazier/poison-pool/spike-barricade 32 = "Viewport only";
// totem/companions 160 = "Viewport|Player"; bramble/rockfall/warbanner-totem
// 99; mask 16 = "Border only"). Nothing validates those numbers against the
// enum at load time, so a shifted bit re-points those mobs at different
// layers *silently* — the build passes, the suite passes, and the boot log
// prints the expected counts.
//
// Regression guard for 2026-07-21: removing the dead `LayerHeatCollision`
// from the iota shifted every later bit down one position. Viewport went
// 32 → 16, so the campfire's literal 32 started meaning MobStatic. The
// campfire fell out of the viewport query and was never sent to clients —
// invisible in game while still present in the zone editor. The bit is now
// kept as a reserved `_` gap in layers.go.
//
// If a layer genuinely must be renumbered, every raw integer in
// `api/mobs/*.json` has to be re-derived in the same commit.
func TestCollisionLayerBitsPinned(t *testing.T) {
	for _, c := range []struct {
		name string
		got  CollisionLayer
		want CollisionLayer
	}{
		{"LayerPlayerStaticCollision", LayerPlayerStaticCollision, 1},
		{"LayerActionCollision", LayerActionCollision, 2},
		{"LayerWeaponCollision", LayerWeaponCollision, 4},
		// bit 8 is the reserved former LayerHeatCollision gap
		{"LayerBorderCollision", LayerBorderCollision, 16},
		{"LayerViewportCollision", LayerViewportCollision, 32},
		{"LayerMobStaticCollision", LayerMobStaticCollision, 64},
		{"LayerPlayerCollision", LayerPlayerCollision, 128},
		{"LayerPlaceableCollision", LayerPlaceableCollision, 256},
	} {
		if c.got != c.want {
			t.Errorf("%s = %d, want %d — see the doc comment: api/mobs/*.json "+
				"encode these as raw integers", c.name, c.got, c.want)
		}
	}
}

// TestCampfireLayerLiteralStillMeansViewport is the concrete case that broke:
// the campfire authors collisionLayer 32 and relies on it meaning "Viewport
// only", which is what gets it sent to clients at all.
func TestCampfireLayerLiteralStillMeansViewport(t *testing.T) {
	const campfireAuthoredLayer = 32
	if CollisionLayer(campfireAuthoredLayer) != LayerViewportCollision {
		t.Fatalf("campfire's authored collisionLayer 32 no longer resolves to "+
			"LayerViewportCollision (got %d) — world campfires will stop "+
			"rendering for clients while still showing in the zone editor",
			LayerViewportCollision)
	}
}
