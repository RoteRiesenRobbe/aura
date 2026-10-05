package mapfog

import (
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// DarkRevealThreshold is how dark the stacked atmospheres must be before a
// cell needs light to be mapped (plan-map-fog-darkness.md D5). [PLACEHOLDER]
// 1.0 takes `Cave Air` and `Darkness` and leaves `Gloom`, `Canopy` and
// `Storm Sky` mapped like daylight, because the ground shows through them.
const DarkRevealThreshold = 1.0

// MinRevealLight is the smallest own light radius, in world units, that maps
// complete darkness (D2, RULED; lowered from 3 by the PO 2026-10-05).
// [PLACEHOLDER] The Torch passive maps a cave from its first level (2.5 u),
// the Lantern (4 u) wider; the bare sight floor does not. Static lights are
// not gated by it.
const MinRevealLight = 2.5

// Circle is a circle in world units.
type Circle struct{ X, Y, R float32 }

// DarkShape is one atmosphere that declares darkness, in world units.
type DarkShape struct {
	Darkness float32
	Points   []world.Point
}

// DarkWorld is everything the mask is baked from, all in WORLD coordinates
// (zones placed, plan-map-fog-darkness.md C1).
type DarkWorld struct {
	// Circles are the dark areas at their AUTHORED radius: the fade ring
	// drawn outside it is not complete darkness (D5).
	Circles []Circle
	// Atmospheres are the shapes whose profile declares darkness.
	Atmospheres []DarkShape
	// Clearings are the shapes that cut darkness (`darkness` or `both`).
	Clearings [][]world.Point
	// Lights are the static lights: campfires and light-casting props.
	Lights []Circle
}

// DarkMask marks every cell that is completely dark and that no static light
// reaches, judged at the cell's CENTRE (D4). Only such a cell needs the
// player's own light to be mapped.
//
// ⚑ Baked once at boot on the fog's own chunk grid, and only for chunks a dark
// shape touches: a world with no darkness is an empty map and costs nothing.
// The nil mask is valid and means "nothing is dark".
type DarkMask struct {
	hidden map[chunkKey]*[chunkBytes]byte
}

// BuildDarkMask bakes the mask from placed darkness.
func BuildDarkMask(w DarkWorld) *DarkMask {
	m := &DarkMask{hidden: map[chunkKey]*[chunkBytes]byte{}}
	bake := func(minX, minY, maxX, maxY float32) {
		for cy := cellOf(minY); cy <= cellOf(maxY); cy++ {
			for cx := cellOf(minX); cx <= cellOf(maxX); cx++ {
				x, y := cellCentre(cx), cellCentre(cy)
				if w.dark(x, y) && !w.lit(x, y) {
					key, bit := locate(cx, cy)
					bits := m.hidden[key]
					if bits == nil {
						bits = new([chunkBytes]byte)
						m.hidden[key] = bits
					}
					bits[bit/8] |= 1 << (bit % 8)
				}
			}
		}
	}
	for _, c := range w.Circles {
		bake(c.X-c.R, c.Y-c.R, c.X+c.R, c.Y+c.R)
	}
	for _, a := range w.Atmospheres {
		if len(a.Points) == 0 {
			continue
		}
		box := world.BoundsOf(a.Points)
		bake(box.MinX, box.MinY, box.MaxX, box.MaxY)
	}
	return m
}

// NeedsLight reports whether a cell is completely dark and statically unlit.
func (m *DarkMask) NeedsLight(cx, cy int) bool {
	if m == nil || len(m.hidden) == 0 {
		return false
	}
	key, bit := locate(cx, cy)
	bits := m.hidden[key]
	return bits != nil && bits[bit/8]&(1<<(bit%8)) != 0
}

// dark is D5: inside a dark area's authored radius, or under atmospheres whose
// STACKED darkness reaches the threshold, and not inside a clearing.
//
// ⭐ STACKED, never last-declaring-wins (PO 2026-10-05): the client paints
// every atmosphere as its own alpha group, so 1.0 under a later 0.5 draws
// black in either order, and the map follows the screen.
func (w DarkWorld) dark(x, y float32) bool {
	for _, c := range w.Clearings {
		if world.PointInPolygon(x, y, c) {
			return false
		}
	}
	for _, c := range w.Circles {
		if inCircle(x, y, c) {
			return true
		}
	}
	through := float32(1) // how much of the ground still shows
	for _, a := range w.Atmospheres {
		if world.PointInPolygon(x, y, a.Points) {
			through *= 1 - a.Darkness
		}
	}
	return 1-through >= DarkRevealThreshold
}

func (w DarkWorld) lit(x, y float32) bool {
	for _, l := range w.Lights {
		if inCircle(x, y, l) {
			return true
		}
	}
	return false
}

func inCircle(x, y float32, c Circle) bool {
	dx, dy := x-c.X, y-c.Y
	return dx*dx+dy*dy <= c.R*c.R
}

// cellCentre is the world coordinate of a cell's centre on one axis.
func cellCentre(c int) float32 {
	return float32((float64(c) + 0.5) * CellSize)
}

// ownLightReaches is rule 3 of §3: the player's own light maps a dark cell
// when it is at least MinRevealLight and the cell's centre is inside it.
func ownLightReaches(px, py, light float32, cx, cy int) bool {
	if light < MinRevealLight {
		return false
	}
	return inCircle(cellCentre(cx), cellCentre(cy), Circle{px, py, light})
}

// DarkWorldOf collects the darkness of PLACED zones (world.Place has run, so
// every array below is in world coordinates).
//
// darkness is each atmosphere profile's declared darkness (api/atmospheres/);
// campfireLight is the campfire's light radius, read from its skill by the
// caller; props resolves which placements cast a static light
// (PropDefinition.LightFraction, a fraction of campfireLight). The same three
// sources the client's darkness overlay draws from, never a Go copy of them.
func DarkWorldOf(zones []*world.Zone, darkness map[string]float32, campfireLight float32,
	props world.PropRegistry) DarkWorld {
	var w DarkWorld
	for _, z := range zones {
		for _, a := range z.DarkAreas {
			w.Circles = append(w.Circles, Circle{a.X, a.Y, a.Radius})
		}
		for _, a := range z.Atmospheres {
			if d, ok := darkness[a.Profile]; ok && d > 0 {
				w.Atmospheres = append(w.Atmospheres, DarkShape{Darkness: d, Points: a.Points})
			}
		}
		for _, c := range z.Clearings {
			if clears := strings.TrimSpace(c.Clears); clears == world.ClearsDarkness || clears == world.ClearsBoth {
				w.Clearings = append(w.Clearings, c.Points)
			}
		}
		for _, f := range z.BindPoints {
			w.Lights = append(w.Lights, Circle{f.X, f.Y, campfireLight})
		}
		for _, p := range z.Props {
			def, err := props.GetByName(p.Type)
			if err != nil || def.LightFraction <= 0 {
				continue
			}
			w.Lights = append(w.Lights, Circle{p.X, p.Y, campfireLight * def.LightFraction})
		}
	}
	return w
}

// Cells is how many cells need light to be mapped, for the boot log.
func (m *DarkMask) Cells() int {
	if m == nil {
		return 0
	}
	n := 0
	for _, bits := range m.hidden {
		for _, b := range bits {
			for ; b != 0; b &= b - 1 {
				n++
			}
		}
	}
	return n
}
