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
// ⛔ It checks EXISTENCE only. Whether the named skill carries an effect an area
// can actually apply — a dot_aura or its ApplyHot twin, rather than, say, a dash
// — is E2's ruling, because E2 is what decides which effect types an area
// consumes. Inventing that rule here would bake an unmade decision into the
// palette a day early.
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
