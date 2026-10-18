package world

// Exits: a way between places, authored as level geometry rather than as a
// talking mob in `spawns` (plan-passages.md P1, D1/D3).

import (
	"fmt"
	"math"
	"slices"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
)

// GenericDoor is the conversation definition an exit uses when it names no
// `door` (D3): the shipped CaveMouth, whose lines become every door's words
// until an exit or its destination authors better ones (P3).
const GenericDoor = "CaveMouth"

// PassageEntityType is the entityType a door definition must author (D4): a
// Passage draws nothing of its own, so the exit's look is the only picture.
const PassageEntityType = "Passage"

// The closed set an exit's `look` names (R4, D5). The client's look table
// (ExitLookTable.ts) draws each; Tiled offers them as AuraExitLook.
// [PLACEHOLDER] art for all but the cave mouth.
const (
	ExitLookCaveMouth  = "cave-mouth"
	ExitLookHidden     = "hidden"
	ExitLookStairsDown = "stairs-down"
	ExitLookStairsUp   = "stairs-up"
	ExitLookDoor       = "door"
)

// ExitLooks is that set, the default first.
var ExitLooks = []string{ExitLookCaveMouth, ExitLookHidden, ExitLookStairsDown, ExitLookStairsUp, ExitLookDoor}

// EffectiveLook is the look the client draws: absent is the cave mouth
// [PLACEHOLDER default, D1].
func (e *Exit) EffectiveLook() string {
	if e.Look == "" {
		return ExitLookCaveMouth
	}
	return e.Look
}

// DoorName is the definition this exit talks as.
func (e *Exit) DoorName() string {
	if e.Door == "" {
		return GenericDoor
	}
	return e.Door
}

// validateExits is the file-only half: what needs no registry.
func (z *Zone) validateExits() error {
	for i := range z.Exits {
		ref := objectRef("exit", z.Exits, i)
		e := &z.Exits[i]
		if strings.TrimSpace(e.Anchor) == "" {
			return fmt.Errorf("%s: anchor must not be empty (where does it lead?)", ref)
		}
		if e.ID != "" && !areaIDPattern.MatchString(e.ID) {
			return fmt.Errorf("%s: id %q must be a slug of a-z, 0-9 and '-' (e.g. \"barn-door\"): it keys "+
				"the exit's words (exit.<id>.text)", ref, e.ID)
		}
		if e.Door != "" && strings.TrimSpace(e.Door) == "" {
			return fmt.Errorf("%s: door must not be blank (omit it for the generic door)", ref)
		}
		if e.Look != "" && !slices.Contains(ExitLooks, e.Look) {
			return fmt.Errorf("%s: look %q must be one of %s (omit it for the cave mouth)",
				ref, e.Look, strings.Join(ExitLooks, ", "))
		}
		if e.X < -z.Bounds.Width/2 || e.X > z.Bounds.Width/2 ||
			e.Y < -z.Bounds.Height/2 || e.Y > z.Bounds.Height/2 {
			return fmt.Errorf("%s: (%g, %g) is outside the bounds", ref, e.X, e.Y)
		}
	}
	return nil
}

// validateExitAreas is validateExits for touch exits (P4): the same anchor,
// id and look rules, and an area that encloses something.
func (z *Zone) validateExitAreas() error {
	for i := range z.ExitAreas {
		ref := objectRef("exitArea", z.ExitAreas, i)
		a := &z.ExitAreas[i]
		if strings.TrimSpace(a.Anchor) == "" {
			return fmt.Errorf("%s: anchor must not be empty (where does it lead?)", ref)
		}
		if a.ID != "" && !areaIDPattern.MatchString(a.ID) {
			return fmt.Errorf("%s: id %q must be a slug of a-z, 0-9 and '-' (e.g. \"glow-pit\")", ref, a.ID)
		}
		if a.Look != "" && !slices.Contains(ExitLooks, a.Look) {
			return fmt.Errorf("%s: look %q must be one of %s (omit it for the cave mouth)",
				ref, a.Look, strings.Join(ExitLooks, ", "))
		}
		if len(a.Points) < 3 {
			return fmt.Errorf("%s: needs at least 3 points to enclose an area, got %d", ref, len(a.Points))
		}
	}
	return nil
}

// Centroid is the mean of the area's points: where its look is drawn (P5)
// and the "from" a crossing's direction is judged by (D8).
func (a *ExitArea) Centroid() Point {
	var c Point
	for _, p := range a.Points {
		c.X += p.X
		c.Y += p.Y
	}
	n := float32(len(a.Points))
	return Point{X: c.X / n, Y: c.Y / n}
}

// CrossValidateExitAreas refuses a touch exit that leads to an anchor no zone
// authors (a hazard that draws and moves nobody), and any anchor standing
// inside any touch exit (L3): a traveller landing there would arrive on a
// crossing, and two areas whose anchors sit in each other bounce a player
// forever. D8's disarm-on-arrival is the fix; this is the belt. After Place,
// so every position is a world coordinate.
func CrossValidateExitAreas(zones []*Zone) error {
	anchors := map[string]Point{}
	for _, z := range zones {
		for _, a := range z.Anchors {
			anchors[a.Name] = Point{X: a.X, Y: a.Y}
		}
	}
	for _, z := range zones {
		for i := range z.ExitAreas {
			area := &z.ExitAreas[i]
			ref := objectRef("exitArea", z.ExitAreas, i)
			if _, ok := anchors[area.Anchor]; !ok {
				return fmt.Errorf("zone %q: %s leads to anchor %q, which no loaded zone authors", z.ID, ref, area.Anchor)
			}
			for name, p := range anchors {
				if PointInPolygon(p.X, p.Y, area.Points) {
					return fmt.Errorf("zone %q: anchor %q stands inside %s (to %q): whoever travels there "+
						"would land on a crossing (plan-passages.md L3); move the anchor or the area",
						z.ID, name, ref, area.Anchor)
				}
			}
		}
	}
	return nil
}

// resolveExits binds each exit's door to its definition and refuses one that
// is not a door: exactly one anchor-mode travel_to row, or the exit's single
// anchor has no row to deliver through (none) or two rows to share (several).
func (z *Zone) resolveExits(mr mobs.Registry) error {
	for i := range z.Exits {
		e := &z.Exits[i]
		def, err := mr.GetByName(e.DoorName())
		if err != nil {
			return fmt.Errorf("%s: unknown door %q", objectRef("exit", z.Exits, i), e.DoorName())
		}
		rows := 0
		anchorGrants(def, func(string, *mobs.InteractionGrant) { rows++ })
		if rows != 1 {
			return fmt.Errorf("%s: door %q must have exactly one anchor-mode travel_to row, has %d",
				objectRef("exit", z.Exits, i), def.Name, rows)
		}
		if def.EntityType != PassageEntityType {
			return fmt.Errorf("%s: door %q must have entityType %q, has %q: the exit's look is the picture, "+
				"and any other entityType draws its own sprite, health bar and plate on top of it (D4)",
				objectRef("exit", z.Exits, i), def.Name, PassageEntityType, def.EntityType)
		}
		e.Def = def
	}
	return nil
}

// StockDoors are the shipped generic doors (D6 tier 3): their words are the
// last fallback, so a destination's words (tier 2) replace them. Any other
// door definition was authored for its doors (tier 0), so its words stand
// and only the exit's own (tier 1) beat them.
var StockDoors = []string{GenericDoor, "CaveExit"}

// Key is what the client looks the exit up by to name the panel (D6): its id,
// or "@" + its anchor for an exit without one.
func (e *Exit) Key() string {
	if e.ID != "" {
		return e.ID
	}
	return "@" + e.Anchor
}

// ApplyExitWords gives every exit's door its words (D6), from the English
// arb: per column, the exit's own (exit.<id>.text / .go), else the
// destination's text (anchor.<name>.text) on a stock door, else the
// definition's. Each exit gets its OWN copy of its door's definition, which
// also carries the exit's Key for the header; the registry's definition is
// never touched, because one definition serves every door in the world.
//
// ⚑ The keys travel, not the text: the line ids and the row id are the keys,
// so the client shows each in the player's language (plan-localization.md
// D27) and the English rides as the fallback.
//
// Runs once every zone and the English are loaded (loadContent).
func ApplyExitWords(zones []*Zone, english map[string]string) {
	for _, z := range zones {
		for i := range z.Exits {
			z.Exits[i].applyWords(english)
		}
	}
}

func (e *Exit) applyWords(en map[string]string) {
	text, row := e.wordKeys(en)
	in := *e.Def.Interaction
	in.ExitID = e.Key()
	in.Nodes = slices.Clone(in.Nodes)
	for ni := range in.Nodes {
		node := &in.Nodes[ni]
		oi := anchorOption(node)
		if oi < 0 {
			continue
		}
		// The words belong to the node the travel row stands in: on a stock
		// door that is its only node, on a custom one the node that moves you.
		if text != "" {
			node.Lines, node.LineIDs = []string{en[text]}, []string{text}
		}
		if row != "" {
			node.Options = slices.Clone(node.Options)
			node.Options[oi].Text, node.Options[oi].ID = en[row], row
		}
	}
	def := *e.Def
	def.Interaction = &in
	e.Def = &def
}

// wordKeys picks the key with English for each column, "" = the definition's.
func (e *Exit) wordKeys(en map[string]string) (text, row string) {
	if e.ID != "" {
		if k := lang.ExitText(e.ID); en[k] != "" {
			text = k
		}
		if k := lang.ExitGo(e.ID); en[k] != "" {
			row = k
		}
	}
	if k := lang.AnchorText(e.Anchor); text == "" && en[k] != "" && slices.Contains(StockDoors, e.Def.Name) {
		text = k
	}
	return text, row
}

// anchorOption is the index of the node's anchor-mode travel row, or -1.
func anchorOption(node *mobs.InteractionNode) int {
	for oi := range node.Options {
		for _, g := range node.Options[oi].Grants {
			if g.Kind == mobs.GrantTravelTo && g.Travel == mobs.TravelAnchor {
				return oi
			}
		}
	}
	return -1
}

// ExitSpawns is every exit as the spawn the MobSystem places (D3): the door's
// definition, standing where the exit stands, delivering to its anchor. Field
// for field what the door spawns it replaces authored (P1 changes no
// behaviour).
func (z *Zone) ExitSpawns() []Spawn {
	out := make([]Spawn, 0, len(z.Exits))
	for _, e := range z.Exits {
		out = append(out, Spawn{Mob: e.Def.Name, X: e.X, Y: e.Y, Anchor: e.Anchor, InArea: e.InArea, Def: e.Def})
	}
	return out
}

// CrossValidateExitClearance refuses a talk exit standing inside a campfire's
// dwell circle (D3, underworld L8, portal-spells D8): the client synthesizes a
// campfire interact offer that OVERRIDES the server's, so such a door loses
// every E press to the flight map, silently.
//
// ⚑ The bound is the two circles fully apart: the fire's dwell radius plus
// the door's own sensor (SenseRadius), so no spot that reaches the door is
// also claimed by the fire. dwellRadius is the caller's, because the boot
// derives it from the Campfire mob, which this package does not build.
//
// ⚑ One flat pass over the whole set: positions are world coordinates once
// placed, and Place keeps zones far enough apart that a cross-zone pair can
// never be near.
func CrossValidateExitClearance(zones []*Zone, dwellRadius float32) error {
	for _, ze := range zones {
		for i := range ze.Exits {
			e := &ze.Exits[i]
			clearance := float64(dwellRadius + e.Def.SenseRadius())
			for _, zf := range zones {
				for _, c := range zf.BindPoints {
					if d := math.Hypot(float64(c.X-e.X), float64(c.Y-e.Y)); d <= clearance {
						return fmt.Errorf("zone %q: %s to %q stands %.2f units from campfire %q, inside the "+
							"%.2f it needs (dwell radius %.2f + the door's reach %.2f); every E press there "+
							"would open the flight map instead (plan-passages.md D3). Move it further out",
							ze.ID, objectRef("exit", ze.Exits, i), e.Anchor, d, c.ID, clearance,
							dwellRadius, e.Def.SenseRadius())
					}
				}
			}
		}
	}
	return nil
}
