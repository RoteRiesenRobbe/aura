package sys

import (
	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/minions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// AreaEffectSystem applies authored effects to whatever stands inside an
// effect-bearing shape (plan-area-effects.md E2).
//
// ⭐ THE WHOLE DESIGN IN ONE SENTENCE (§2.2): an area effect is an AURA whose
// range test is a polygon instead of a circle, and nothing more. Everything that
// makes it feel right is machinery that already existed — the buff store is the
// timer (D5), the refresh rule is the anti-hop fix (D6), and takeDamage is the
// resistance and immunity path (D11).
//
// ⛔ NO DWELL TIMER IS BUILT, and the absence is the ruling. DurationTicks() is
// TickCount*Interval + 1, so the first damage event lands at Interval rather
// than at application: the free first interval D4 asks for falls out of the buff
// lifetime, and adding a timer here would be a second source of truth for it.
//
// ⛔ AND NO PER-ENTITY MEMORY OF ANY KIND. Re-applying every tick is not a
// wasteful shortcut — it IS the mechanism: ApplyDot refreshes the duration while
// keeping the acting accumulator running, so standing still burns on schedule
// and hopping the edge cannot reset the phase. A system that remembered who was
// inside last tick would have to re-derive both of those and would get D6 wrong.
type AreaEffectSystem struct {
	areas    []world.PlacedAreaEffect
	resolved []resolvedArea
	entities []areaEntity
}

// resolvedArea is one placed shape with its authored effect already looked up —
// the per-tick walk must never touch the skill registry.
//
// ⚑ Resolution is at CONSTRUCTION, not per tick, and not lazily: boot has
// already refused an unknown name (world.CrossValidateAreaEffects) and a skill
// carrying nothing an area can apply (CrossValidateAreaEffectShapes), so by the
// time this exists every lookup has an answer.
type resolvedArea struct {
	// area is the geometry AND the damage source: *world.PlacedAreaEffect
	// satisfies model.AreaSource structurally through AreaEffectName.
	area *world.PlacedAreaEffect
	def  *skills.SkillDefinition
	// dots and hots are the applicable effects, split once so the tick loop
	// branches on neither type nor emptiness.
	dots []skills.EffectDef
	hots []skills.EffectDef
}

// areaAffectable is what an entity must be to stand in an area: it has a
// position, and it can carry the buff.
//
// ⚑ Optional-interface style, like dotBuffable and hotBuffable next door. ⚑ The
// dormancy seam is deliberately NOT here — see the note in Update.
type areaAffectable interface {
	Position() phy.Vec2f
	dotBuffable
	hotBuffable
}

// ⛔ THE COMPILE-TIME PROOF THAT SOMEBODY SATISFIES IT, and it is here because
// the first cut of this file did NOT. That version declared Position() against a
// hand-rolled `interface{ XY() (float32, float32) }` — phy.Vec2f has no such
// method, so areaAffectable matched NOTHING, AddEntity registered zero entities,
// and the whole system was a permanent no-op. ⛔ IT COMPILED, and every test
// that only asserted "no damage outside an area" would have passed.
//
// ⚑ An optional interface cannot be checked by the compiler at its use site —
// that is the whole point of one — so the check has to be written down. The
// assertions live in the test beside this file (a real player and a real mob
// both register), because sys cannot import model/player without a cycle.

type areaEntity struct {
	b model.BasicEntity
	a areaAffectable
}

// NewAreaEffectSystem builds the system over the placed shapes, resolving each
// one's effect against the skill registry.
//
// ⚑ An empty areas slice is the shipped world and must stay free: Update returns
// immediately, so a zone that authors no effect costs one length check per tick
// and nothing else.
func NewAreaEffectSystem(areas []world.PlacedAreaEffect, sr skills.Registry) *AreaEffectSystem {
	s := &AreaEffectSystem{areas: areas}
	for i := range areas {
		def, err := sr.GetByName(areas[i].Effect)
		if err != nil {
			// Unreachable: boot refuses an unknown name before this runs. A
			// shape that somehow got here is dropped rather than panicking
			// mid-construction — it can only under-apply, never mis-apply.
			continue
		}
		r := resolvedArea{area: &s.areas[i], def: def}
		for _, e := range def.Effects {
			switch e.Type {
			case skills.EffectTypeDotAura:
				r.dots = append(r.dots, e)
			case skills.EffectTypeHotAura:
				r.hots = append(r.hots, e)
			}
		}
		if len(r.dots) == 0 && len(r.hots) == 0 {
			continue
		}
		s.resolved = append(s.resolved, r)
	}
	return s
}

// Priority puts this after the physics step, so an entity is tested where it
// ENDED the tick rather than where it started — walking out of lava on the tick
// you leave should not burn you.
func (*AreaEffectSystem) Priority() int { return 102 }

func (s *AreaEffectSystem) AddEntity(e model.BasicEntity) {
	a, ok := e.(areaAffectable)
	if !ok {
		return
	}
	s.entities = append(s.entities, areaEntity{b: e, a: a})
}

func (s *AreaEffectSystem) Remove(e ecs.BasicEntity) {
	delete := minions.FindBasic(func(i int) model.BasicEntity { return s.entities[i].b }, len(s.entities), e)
	if delete >= 0 {
		s.entities = append(s.entities[:delete], s.entities[delete+1:]...)
	}
}

// Update applies every area an entity is standing in, once per tick.
//
// ⚑ The loop is areas-outer / entities-inner because the area count is
// AUTHORED and small while the entity count is emergent: hoisting the shape's
// slice header and effect list out of the inner loop is free and keeps the hot
// path a bare point test.
func (s *AreaEffectSystem) Update(float32) {
	if len(s.resolved) == 0 || len(s.entities) == 0 {
		return
	}
	for ri := range s.resolved {
		r := &s.resolved[ri]
		for _, e := range s.entities {
			// ⭐ D12: a dormant mob is skipped, and the reason is CONSISTENCY
			// rather than cost. A dormant mob is out of phy.Space, so it is
			// already unhittable by every aura and every projectile in the
			// game; an area that reached it would be the only thing that did.
			//
			// ⛔ The test is on the ENTITY, not on MobSystem's bookkeeping: this
			// system never sees MobSystem, and asking the mob itself is the only
			// reading that cannot go stale.
			if d, ok := e.a.(interface{ Dormant() bool }); ok && d.Dormant() {
				continue
			}
			pos := e.a.Position()
			x, y := pos.X, pos.Y
			if !r.area.Bounds.Contains(x, y) {
				continue
			}
			if !world.PointInPolygon(x, y, r.area.Points) {
				continue
			}
			s.applyTo(e.a, r)
		}
	}
}

// applyTo grants (or refreshes) every applicable effect of one area on one
// entity standing inside it.
//
// ⚑ LEVEL 1, ALWAYS, and it is a ruling rather than a placeholder: an area has
// no level and nothing to scale off. A skill's per-level growth describes a
// CASTER getting better at it, and a lava pool does not get better at being
// lava. Strength is authored per placement instead — which is D2's third reason
// for putting `effect` on the shape, arriving in code.
func (s *AreaEffectSystem) applyTo(target areaAffectable, r *resolvedArea) {
	const areaLevel = 1
	for i := range r.dots {
		e := &r.dots[i]
		target.ApplyDot(r.def.ID, skills.DotBuff{
			HP:       e.Dot.HPAt(areaLevel),
			Tags:     e.Dot.Tags,
			Variance: e.Dot.Variance,
			Interval: e.Dot.Interval,
			// ⭐ D8, and the shape it actually had to take. The plan called for
			// a "synthetic source id" to keep two areas of equal strength in
			// separate streams (L2) — and Caster turned out to be the
			// ATTRIBUTION DISPATCH as well, so a bare token would have been
			// dropped in silence by sys/skills.go. The placed shape itself is
			// both: distinct per area, and a model.AreaSource the dispatch
			// recognises.
			Caster: r.area,
		}, e.Dot.DurationTicks())
	}
	for i := range r.hots {
		e := &r.hots[i]
		target.ApplyHot(r.def.ID, skills.HotBuff{
			HP:       e.Hot.HPAt(areaLevel),
			Variance: e.Hot.Variance,
			Interval: e.Hot.Interval,
			Caster:   r.area,
		}, e.Hot.DurationTicks())
	}
}
