package world

// Cross-validation between the authored SKILLS and the shapes that name one:
// does every area effect a zone authors point at an effect that exists
// (plan-area-effects.md E1)?
//
// ⚑ Why it is a separate pass and not part of validate(), the reason
// CrossValidateTravelAnchors sits beside it in this package: the skill registry
// is built BEFORE any zone — boot loads factions, then skills, then mobs, then
// zones — but it is not an argument to the zone loader, because since the NPC
// merge "the zone no longer references skills at all" (see resolve). Rather than
// thread a fifth registry through ~70 LoadZoneFS call sites for a key no shipped
// zone authors, the check runs where both are already in scope.

import (
	"fmt"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// effectSource is the slice of skills.Registry this pass needs.
type effectSource interface {
	GetByName(name string) (*skills.SkillDefinition, error)
}

// areaEffectShapes visits every shape in a zone that names an effect, with the
// array and index the message has to quote.
//
// ⭐ THREE ARRAYS AND NOT FIVE, and the omissions are rulings rather than
// oversights. `regions` is the MATERIAL UNDERFOOT — the resolve() lookup for
// footsteps, music and ground colour — and an effect is a THING in a place, not
// a property of the ground everywhere that material appears. `clearings` names
// no look and carries no profile (A4/L7); it is an ERASE, and an erase that also
// burned you would be a second job for one shape, which is the ambiguity A4
// exists to have removed.
func areaEffectShapes(z *Zone, visit func(kind string, i int, effect string)) {
	for i := range z.Paths {
		if z.Paths[i].Effect != "" {
			visit("path", i, z.Paths[i].Effect)
		}
	}
	for i := range z.Polygons {
		if z.Polygons[i].Effect != "" {
			visit("polygon", i, z.Polygons[i].Effect)
		}
	}
	for i := range z.Atmospheres {
		if z.Atmospheres[i].Effect != "" {
			visit("atmosphere", i, z.Atmospheres[i].Effect)
		}
	}
}

// CrossValidateAreaEffects refuses the boot when a shape names an effect no
// skill file declares.
//
// ⭐ IT IS AN ERROR, NOT A WARNING, and that is the opposite call from
// CrossValidateTravelAnchors' definition half — for the reason that function's
// own comment gives: the split is whether a player can reach it. A misnamed
// anchor on an UNPLACED mob is content waiting for a zone. An area effect is
// already placed by construction — it IS a shape in a loaded zone — so a name
// that resolves to nothing is a hazard that draws, reads as dangerous, and does
// nothing at all. That is the failure mode the whole loader is written against.
//
// ⚑ The message names the effect, not merely "unknown" — the posture the crossed
// profile name already takes in Tiled (plan-region-atmosphere.md: "a crossed name
// names the table it belongs to instead of the true-but-useless unknown profile").
//
// ⛔ It checks EXISTENCE only, and E2 adds the second half separately
// (CrossValidateAreaEffectShapes): whether the named skill carries an effect an
// area can actually APPLY. The two stayed apart rather than merging because they
// answer to different owners — this one to the skill roster, that one to E2's
// ruling about which effect types an area consumes.
// CrossValidateAreaEffectShapes refuses the boot when a shape names a skill that
// exists but carries nothing an area can apply (plan-area-effects.md E2).
//
// ⭐ THE RULING E1 DELIBERATELY DID NOT MAKE, arriving with the chunk that can
// make it. E1's check was existence-only because E2 is what decides which effect
// types an area consumes, and inventing the rule a chunk early would have baked
// an unmade decision into the Tiled dropdown.
//
// ⛔ AN AREA CONSUMES dot_aura AND hot_aura, AND NOTHING ELSE. The two are the
// only effect types whose whole shape is "a thing that keeps happening to
// whoever is in range" — which is what an area IS (§2.2). Everything else in the
// vocabulary describes an ACT: a dash moves its caster, an instant_dot fires
// once on a trigger an area does not have, a shield_aura would need a caster to
// re-apply it. ⚑ A skill may carry several, and an area applies every applicable
// one; the inapplicable ones are ignored rather than refused, because a skill
// authored for a player legitimately mixes both.
//
// ⛔ The failure it catches is the one this whole feature is written against: a
// pool that draws, reads as dangerous, and does nothing. "Blight exists" is not
// enough — Blight authoring only a cooldown would pass E1's check and still be
// inert on the ground.
func CrossValidateAreaEffectShapes(sr effectSource, zones []*Zone) error {
	for _, z := range zones {
		var bad error
		areaEffectShapes(z, func(kind string, i int, effect string) {
			if bad != nil {
				return
			}
			def, err := sr.GetByName(effect)
			if err != nil {
				// The unknown-name case is CrossValidateAreaEffects' to report,
				// and it runs first. Silence here keeps one mistake to one
				// message.
				return
			}
			for _, e := range def.Effects {
				if e.Type == skills.EffectTypeDotAura || e.Type == skills.EffectTypeHotAura {
					return
				}
			}
			bad = fmt.Errorf("zone %q: %s %d names effect %q, which exists but carries no "+
				"dot_aura or hot_aura — an area applies those two and nothing else, so this "+
				"shape would draw, read as dangerous and do nothing "+
				"(plan-area-effects.md E2)", z.ID, kind, i, effect)
		})
		if bad != nil {
			return bad
		}
	}
	return nil
}

// PlacedAreaEffect is one shape that carries an effect, flattened out of the
// loaded zone set into WORLD coordinates (plan-area-effects.md E2).
//
// ⚑ The GameConfig.ZoneAnchors precedent, and for the same reason: the consumer
// asks "what is at this point", never "which file authored it", so one flat list
// is a faithful index rather than a lossy merge. Zones are kept apart by
// DISTANCE alone, so a shape from the underworld and a player on the surface are
// directly comparable once Place() has run.
//
// ⚑ Bounds is precomputed because it is free here and not free per tick — four
// floats, once at boot. Nothing consumes it in E2's first cut; it is §3.2's
// named escape hatch, sitting where the geometry is rather than being invented
// somewhere else later.
type PlacedAreaEffect struct {
	// Effect is the authored skill name. It is what AreaEffectName reports, so
	// a death or a log line can say what hit you.
	Effect string
	// Points is the shape's outline in WORLD coordinates.
	Points []Point
	// Bounds is the axis-aligned extent of Points.
	Bounds BoundingBox
	// Zone, Kind and Index identify the authored shape for messages: the zone
	// stem, "path"/"polygon"/"atmosphere", and the position in that array. ⚑ The
	// array index is the only handle an author has — no shape carries an id.
	Zone  string
	Kind  string
	Index int
}

// AreaEffectName satisfies model.AreaSource structurally, which is what lets a
// placed shape BE the damage source without this package importing model.
//
// ⚑ Go's structural interfaces are doing real work here: world describes the
// world and knows nothing about entities, model describes entities and knows
// nothing about zones, and neither has to import the other for a lava pool to
// hit a player.
func (a *PlacedAreaEffect) AreaEffectName() string { return a.Effect }

// CollectAreaEffects flattens every effect-bearing shape in the placed zone set.
//
// ⛔ It must run AFTER world.Place, and the failure if it does not is silent on
// the overworld and wrong everywhere else — an unplaced shape's points are
// zone-local, and origin {0,0} makes that indistinguishable from correct. See
// placeOne's note on why Atmospheres joined the offset list at E2.
//
// ⚑ Shapes with no effect are skipped here rather than at use, so the per-tick
// walk never sees a decorative shape at all (§3.2). A zone with 35 fog banks and
// 2 lava pools contributes 2 entries.
func CollectAreaEffects(zones []*Zone) []PlacedAreaEffect {
	var out []PlacedAreaEffect
	for _, z := range zones {
		areaEffectShapes(z, func(kind string, i int, effect string) {
			var points []Point
			switch kind {
			case "path":
				points = z.Paths[i].Points
			case "polygon":
				points = z.Polygons[i].Points
			case "atmosphere":
				points = z.Atmospheres[i].Points
			}
			out = append(out, PlacedAreaEffect{
				Effect: effect,
				Points: points,
				Bounds: BoundsOf(points),
				Zone:   z.ID,
				Kind:   kind,
				Index:  i,
			})
		})
	}
	return out
}

// ⛔ A PATH IS A STROKE, NOT AN AREA, and E2 treats it as its own outline
// anyway. plan-area-effects.md D1 puts `effect` on all three shapes, but a path
// has no inside: point-in-polygon over a road's centreline answers about the
// thin sliver the polyline encloses, which is nothing like the stroked corridor
// the player sees.
//
// ⚑ Recorded rather than fixed, because it is E3's problem to notice and the
// honest fix is not obvious: a path's area is its centreline EXPANDED by Width,
// which is a different predicate (distance-to-segment), not a different fixture.
// A closed path (P1) is the one case where the polygon reading is defensible,
// and even there it is the ring's interior rather than the stroke.
//
// ⚑ No content authors an effect on a path today, so this is inert. It is called
// out here because "it compiles and returns an answer" is exactly how a wrong
// predicate survives.

func CrossValidateAreaEffects(sr effectSource, zones []*Zone) error {
	for _, z := range zones {
		var bad error
		areaEffectShapes(z, func(kind string, i int, effect string) {
			if bad != nil {
				return
			}
			if _, err := sr.GetByName(effect); err != nil {
				bad = fmt.Errorf("zone %q: %s %d names effect %q, which no skill declares — "+
					"the area would draw and do nothing. Effects are authored in api/skills/ "+
					"(plan-area-effects.md E1)", z.ID, kind, i, effect)
			}
		})
		if bad != nil {
			return bad
		}
	}
	return nil
}
