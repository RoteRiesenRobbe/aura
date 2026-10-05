package main

import (
	"log/slog"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/mapfog"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// campfireSkill is the skill every bind point's campfire casts; its light_aura
// radius is the static light the client punches at each fire
// (DarknessOverlay.ts reads the same file, api/skills/mobs/campfire-aura.json).
const campfireSkill = "CampfireAura"

// campfireLightRadius is the campfire's light, read from its skill, never
// restated (plan-map-fog-darkness.md C1). 0 when the skill is missing, which
// leaves campfires unlit on the map and says so.
func campfireLightRadius(sr skills.Registry) float32 {
	def, err := sr.GetByName(campfireSkill)
	if err != nil {
		slog.Warn("map reveal: no campfire skill, campfires light nothing on the map",
			slog.String("skill", campfireSkill))
		return 0
	}
	var r float32
	for _, e := range def.Effects {
		if e.Type == skills.EffectTypeLightAura && e.Radius > r {
			r = e.Radius
		}
	}
	return r
}

// mapFogDarkMask bakes where the map reveal needs light from the PLACED zones
// (plan-map-fog-darkness.md C1). ⛔ After world.Place, like the area effects.
func mapFogDarkMask(zones []*world.Zone, darkness map[string]float32, sr skills.Registry,
	pr world.PropRegistry) *mapfog.DarkMask {
	mask := mapfog.BuildDarkMask(mapfog.DarkWorldOf(zones, darkness, campfireLightRadius(sr), pr))
	slog.Info("🌑 map reveal darkness baked", slog.Int("cellsNeedingLight", mask.Cells()))
	return mask
}
