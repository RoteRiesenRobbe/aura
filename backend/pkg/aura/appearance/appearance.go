// Package appearance loads the catalog of looks a player character may wear
// (plan-appearance.md §4.1): portraits and rings, one file per item under
// api/appearance/. A ring names a ring family of the client's registry
// (client-data/Medallions.ts, D2); the art itself stays client-side.
//
// C3 ships the starter set only (D30): every item is owned by everyone.
// Unlock conditions and ownership scopes arrive with C5, so the loader refuses
// any item that is not a starter until then.
package appearance

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"sort"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
)

// Slot is what an item dresses: the portrait in the disc, or the ring around it.
type Slot string

const (
	SlotPortrait Slot = "portrait"
	SlotRing     Slot = "ring"
)

// The look every character wears unless it chose another. DefaultPortrait is
// the value every character row written before C3 already holds
// (characters.avatar), DefaultRing the backfill of characters.ring
// (migration 000004_appearance); the store test pins the two together.
const (
	DefaultPortrait = "default"
	DefaultRing     = "ring-plain"
)

// Item is one entry of the catalog. Name is the English, joined in from
// api/lang/en/appearance.arb (plan-localization.md D27).
type Item struct {
	ID      string `json:"id"`
	Slot    Slot   `json:"slot"`
	Family  string `json:"family,omitempty"`
	Starter bool   `json:"starter"`
	Name    string `json:"name"`
}

// Catalog is every item, each slot sorted by id. The position in that order
// is the item's wire value (Wire), stable for one server build.
type Catalog struct {
	portraits []Item
	rings     []Item
	byID      map[string]Item
}

var idPattern = regexp.MustCompile(`^[a-z0-9-]+$`)

// Load reads every *.json of fsys as one item.
func Load(fsys fs.FS) (Catalog, error) {
	files, err := fs.Glob(fsys, "*.json")
	if err != nil {
		return Catalog{}, err
	}
	c := Catalog{byID: map[string]Item{}}
	for _, f := range files {
		it, err := loadItem(fsys, f)
		if err != nil {
			return Catalog{}, err
		}
		if _, dup := c.byID[it.ID]; dup {
			return Catalog{}, fmt.Errorf("appearance/%s: duplicate id %q", f, it.ID)
		}
		c.byID[it.ID] = it
		if it.Slot == SlotPortrait {
			c.portraits = append(c.portraits, it)
		} else {
			c.rings = append(c.rings, it)
		}
	}
	byID := func(items []Item) func(i, j int) bool {
		return func(i, j int) bool { return items[i].ID < items[j].ID }
	}
	sort.Slice(c.portraits, byID(c.portraits))
	sort.Slice(c.rings, byID(c.rings))

	for _, want := range []struct {
		slot Slot
		id   string
	}{{SlotPortrait, DefaultPortrait}, {SlotRing, DefaultRing}} {
		if !c.starter(want.slot, want.id) {
			return Catalog{}, fmt.Errorf("appearance: the default %s %q must be a starter item", want.slot, want.id)
		}
	}
	return c, nil
}

func loadItem(fsys fs.FS, f string) (Item, error) {
	data, err := fs.ReadFile(fsys, f)
	if err != nil {
		return Item{}, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var doc struct {
		Comment string `json:"_comment"`
		Item
	}
	if err := dec.Decode(&doc); err != nil {
		return Item{}, fmt.Errorf("appearance/%s: cannot parse: %w", f, err)
	}
	it := doc.Item
	switch {
	case !idPattern.MatchString(it.ID):
		return Item{}, fmt.Errorf("appearance/%s: id %q must be a slug of a-z, 0-9 and '-'", f, it.ID)
	case path.Base(f) != it.ID+".json":
		return Item{}, fmt.Errorf("appearance/%s: the file must be named %s.json", f, it.ID)
	case it.Slot != SlotPortrait && it.Slot != SlotRing:
		return Item{}, fmt.Errorf("appearance/%s: slot %q must be %q or %q", f, it.Slot, SlotPortrait, SlotRing)
	case it.Slot == SlotRing && it.Family == "":
		return Item{}, fmt.Errorf("appearance/%s: a ring must name its family", f)
	case it.Slot == SlotPortrait && it.Family != "":
		return Item{}, fmt.Errorf("appearance/%s: only a ring names a family", f)
	case !it.Starter:
		return Item{}, fmt.Errorf("appearance/%s: every item is a starter until unlocks exist (plan-appearance.md C5)", f)
	case strings.TrimSpace(it.Name) == "":
		return Item{}, fmt.Errorf("appearance/%s: no name", f)
	}
	return it, nil
}

// Portraits is every portrait in wire order.
func (c Catalog) Portraits() []Item { return c.portraits }

// Rings is every ring in wire order.
func (c Catalog) Rings() []Item { return c.rings }

// Item looks an item up by id, in either slot.
func (c Catalog) Item(id string) (Item, bool) {
	it, ok := c.byID[id]
	return it, ok
}

// Wire is the item's wire value: 1 + its position in its slot's order, or 0
// (the slot's default on the client) for an id this slot does not hold.
func (c Catalog) Wire(slot Slot, id string) uint16 {
	items := c.rings
	if slot == SlotPortrait {
		items = c.portraits
	}
	for i, it := range items {
		if it.ID == id {
			return uint16(i + 1)
		}
	}
	return 0
}

// ID is Wire's inverse: the id at a wire value, or "" for 0 and anything past
// the slot's end.
func (c Catalog) ID(slot Slot, wire uint16) string {
	items := c.rings
	if slot == SlotPortrait {
		items = c.portraits
	}
	if wire == 0 || int(wire) > len(items) {
		return ""
	}
	return items[wire-1].ID
}

// WearableLook reports whether an in-game pick (SelectAppearance, C4) may be
// worn: a starter portrait and a starter ring, as wire values. C5 swaps the
// starter set for the character's owned set here.
func (c Catalog) WearableLook(portrait, ring uint16) bool {
	return c.starter(SlotPortrait, c.ID(SlotPortrait, portrait)) && c.starter(SlotRing, c.ID(SlotRing, ring))
}

func (c Catalog) starter(slot Slot, id string) bool {
	it, ok := c.byID[id]
	return ok && it.Slot == slot && it.Starter
}

// CheckStarterLook refuses a creation pick that is not a starter portrait
// and a starter ring.
func (c Catalog) CheckStarterLook(portrait, ring string) error {
	if !c.starter(SlotPortrait, portrait) {
		return fmt.Errorf("appearance: %q is not a starter portrait", portrait)
	}
	if !c.starter(SlotRing, ring) {
		return fmt.Errorf("appearance: %q is not a starter ring", ring)
	}
	return nil
}

// CatalogJSONIn is the /appearance payload in one language: each slot in
// wire order, so the client indexes the arrays as served.
func CatalogJSONIn(c Catalog, tr lang.Tr) ([]byte, error) {
	type entry struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Family  string `json:"family,omitempty"`
		Starter bool   `json:"starter"`
		// Default marks what wire value 0 draws, so the client never restates
		// DefaultPortrait or DefaultRing.
		Default bool `json:"default,omitempty"`
	}
	entries := func(items []Item) []entry {
		out := make([]entry, len(items))
		for i, it := range items {
			out[i] = entry{ID: it.ID, Name: tr(lang.AppearanceName(it.ID), it.Name), Family: it.Family, Starter: it.Starter,
				Default: it.ID == DefaultPortrait || it.ID == DefaultRing}
		}
		return out
	}
	return json.Marshal(struct {
		Portraits []entry `json:"portraits"`
		Rings     []entry `json:"rings"`
	}{entries(c.portraits), entries(c.rings)})
}

// CatalogHandler serves /appearance per locale. Mirrors quests.CatalogHandler.
func CatalogHandler(c Catalog, b *lang.Bundle) (http.Handler, error) {
	return lang.Handler(b, func(tr lang.Tr) ([]byte, error) { return CatalogJSONIn(c, tr) })
}
