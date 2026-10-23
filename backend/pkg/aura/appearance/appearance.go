// Package appearance loads the catalog of looks a player character may wear
// (plan-appearance.md §4.1): portraits and rings, one file per item under
// api/appearance/. A ring names a ring family of the client's registry
// (client-data/Medallions.ts, D2); the art itself stays client-side.
//
// A starter item is owned by everyone (D30). Every other item declares its
// conditions, in the shared condition vocabulary, and the scope it is owned
// at (D7, D15): a character that meets the conditions earns it there,
// permanently (D16).
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

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
)

// Slot is what an item dresses: the portrait in the disc, or the ring around it.
type Slot string

const (
	SlotPortrait Slot = "portrait"
	SlotRing     Slot = "ring"
)

// Scope is who owns an earned item (D7): one life, the slot's chain of
// lives, or every character of the account. The values are the
// appearance_unlocks.scope CHECK's.
type Scope string

const (
	ScopeCharacter Scope = "character"
	ScopeBloodline Scope = "bloodline"
	ScopeAccount   Scope = "account"
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
	// Scope, Conditions and ConditionsMode are a locked item's (C5); a
	// starter carries none of them. Gate is the conditions parsed and
	// resolved, what the evaluator judges.
	Scope          Scope                `json:"scope,omitempty"`
	Conditions     []mobs.JSONCondition `json:"conditions,omitempty"`
	ConditionsMode string               `json:"conditionsMode,omitempty"`
	Gate           mobs.Gate            `json:"-"`
	// GrantedBy marks a look nothing earns by itself (C5b, D21c): only the
	// named source grants it, so it carries a scope and no conditions.
	GrantedBy string `json:"grantedBy,omitempty"`
}

// GrantedByStone is a look an ascension stone grants on top of the pick: the
// stone's `bonusLooks` (D21c).
const GrantedByStone = "stone"

// StoneGift reports whether only an ascension stone grants the item. The
// evaluator must skip it: its empty gate would pass for everyone.
func (it Item) StoneGift() bool { return it.GrantedBy == GrantedByStone }

// World is what a locked item's conditions resolve against at load: the
// skill registry, the mob registry and the quest graph. Starter-only
// catalogs never call it, so a test may pass nil.
type World interface {
	mobs.SkillNamer
	mobs.ConditionRefs
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
func Load(fsys fs.FS, w World) (Catalog, error) {
	files, err := fs.Glob(fsys, "*.json")
	if err != nil {
		return Catalog{}, err
	}
	c := Catalog{byID: map[string]Item{}}
	for _, f := range files {
		it, err := loadItem(fsys, f, w)
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

func loadItem(fsys fs.FS, f string, w World) (Item, error) {
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
	case strings.TrimSpace(it.Name) == "":
		return Item{}, fmt.Errorf("appearance/%s: no name", f)
	case it.Starter && (len(it.Conditions) > 0 || it.Scope != "" || it.ConditionsMode != ""):
		return Item{}, fmt.Errorf("appearance/%s: a starter is owned by everyone and carries no conditions or scope", f)
	case it.GrantedBy != "" && it.GrantedBy != GrantedByStone:
		return Item{}, fmt.Errorf("appearance/%s: grantedBy %q must be %q", f, it.GrantedBy, GrantedByStone)
	case it.StoneGift() && (it.Starter || len(it.Conditions) > 0 || it.ConditionsMode != ""):
		return Item{}, fmt.Errorf("appearance/%s: a stone gift is earned by no condition and owned by nobody at first", f)
	case it.StoneGift() && it.Scope != ScopeBloodline && it.Scope != ScopeAccount:
		// Granted during the sacrifice, a character item would land on the life
		// that is ending (D21).
		return Item{}, fmt.Errorf("appearance/%s: a stone gift's scope must be %q or %q, not %q", f,
			ScopeBloodline, ScopeAccount, it.Scope)
	case !it.Starter && !it.StoneGift() && len(it.Conditions) == 0:
		return Item{}, fmt.Errorf("appearance/%s: an item that is not a starter needs the conditions that earn it", f)
	case !it.Starter && it.Scope != ScopeCharacter && it.Scope != ScopeBloodline && it.Scope != ScopeAccount:
		return Item{}, fmt.Errorf("appearance/%s: scope %q must be %q, %q or %q", f, it.Scope,
			ScopeCharacter, ScopeBloodline, ScopeAccount)
	}
	for i, jc := range it.Conditions {
		cond, err := mobs.ParseCondition(jc)
		// D15's four kinds only. A kill count moves no revision the
		// evaluator watches (sys/appearance_grants.go), so an item gated on
		// one would stay locked until an unrelated level-up.
		if err == nil && cond.Kind == mobs.ConditionKillsThisLife {
			err = fmt.Errorf("kills_this_life is not an appearance unlock: use minLevel, skill_level, " +
				"quest_at_stage or bloodline_ascensions")
		}
		if err == nil {
			err = mobs.ResolveCondition(&cond, w, w)
		}
		if err != nil {
			return Item{}, fmt.Errorf("appearance/%s: condition %d: %w", f, i, err)
		}
		it.Gate.Conditions = append(it.Gate.Conditions, cond)
	}
	mode, err := mobs.ParseConditionMode(it.ConditionsMode, len(it.Conditions))
	if err != nil {
		return Item{}, fmt.Errorf("appearance/%s: %w", f, err)
	}
	it.Gate.Mode = mode
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

// Flat is an item's position in the flat order, every portrait in wire order
// then every ring: the owned set's wire form (GameState.appearance_owned) and
// the unlock toast's entity_id. An unknown id answers 0 like Wire; callers
// hold ids the catalog served.
func (c Catalog) Flat(id string) uint16 {
	for i, it := range c.portraits {
		if it.ID == id {
			return uint16(i)
		}
	}
	for i, it := range c.rings {
		if it.ID == id {
			return uint16(len(c.portraits) + i)
		}
	}
	return 0
}

// AtFlat is Flat's inverse.
func (c Catalog) AtFlat(flat uint16) (Item, bool) {
	i := int(flat)
	switch {
	case i < len(c.portraits):
		return c.portraits[i], true
	case i < len(c.portraits)+len(c.rings):
		return c.rings[i-len(c.portraits)], true
	}
	return Item{}, false
}

// Gated is every locked item in flat order: what the evaluator walks.
func (c Catalog) Gated() []Item {
	var out []Item
	for _, items := range [][]Item{c.portraits, c.rings} {
		for _, it := range items {
			if !it.Starter {
				out = append(out, it)
			}
		}
	}
	return out
}

// WearableLook reports whether an in-game pick (SelectAppearance, C4) may be
// worn: in each slot a starter or an item of owned (flat indices), as wire
// values.
func (c Catalog) WearableLook(portrait, ring uint16, owned []uint16) bool {
	wearable := func(slot Slot, wire uint16) bool {
		id := c.ID(slot, wire)
		if c.starter(slot, id) {
			return true
		}
		if id == "" {
			return false
		}
		flat := c.Flat(id)
		for _, o := range owned {
			if o == flat {
				return true
			}
		}
		return false
	}
	return wearable(SlotPortrait, portrait) && wearable(SlotRing, ring)
}

func (c Catalog) starter(slot Slot, id string) bool {
	it, ok := c.byID[id]
	return ok && it.Slot == slot && it.Starter
}

// CheckOwnedLook refuses a creation pick (accounts, by id) that is not, in
// each slot, a starter or an item of owned.
func (c Catalog) CheckOwnedLook(portrait, ring string, owned []string) error {
	ownedItem := func(slot Slot, id string) bool {
		if c.starter(slot, id) {
			return true
		}
		it, ok := c.byID[id]
		if !ok || it.Slot != slot {
			return false
		}
		for _, o := range owned {
			if o == id {
				return true
			}
		}
		return false
	}
	if !ownedItem(SlotPortrait, portrait) {
		return fmt.Errorf("appearance: %q is not a portrait this character owns", portrait)
	}
	if !ownedItem(SlotRing, ring) {
		return fmt.Errorf("appearance: %q is not a ring this character owns", ring)
	}
	return nil
}

// StoneSites is the slice of mobs.Registry CrossValidateStones reads.
type StoneSites interface {
	Mobs() []*mobs.MobDefinition
}

// CrossValidateStones checks every stone's bonusLooks (C5b) against the
// catalog: each id must name a stone gift, or the stone would hand out an
// item something else earns (or nothing). A stone gift that no stone names
// is a warning: it loads, but nobody can ever own it.
func CrossValidateStones(sites StoneSites, c Catalog) ([]string, error) {
	named := map[string]bool{}
	for _, def := range sites.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for _, node := range def.Interaction.Nodes {
			for _, id := range node.BonusLooks {
				it, ok := c.byID[id]
				if !ok || !it.StoneGift() {
					return nil, fmt.Errorf("mob %q: interaction node %q: bonusLooks %q is not a look with "+
						"\"grantedBy\": %q", def.Name, node.ID, id, GrantedByStone)
				}
				named[id] = true
			}
		}
	}
	var warnings []string
	for _, items := range [][]Item{c.portraits, c.rings} {
		for _, it := range items {
			if it.StoneGift() && !named[it.ID] {
				warnings = append(warnings, fmt.Sprintf("appearance %q is a stone gift no stone grants", it.ID))
			}
		}
	}
	return warnings, nil
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
		// A locked item's scope and conditions, the conditions as lock data
		// the client words with this character's progress (D8, D25).
		Scope          Scope      `json:"scope,omitempty"`
		ConditionsMode string     `json:"conditionsMode,omitempty"`
		Locks          []lockJSON `json:"locks,omitempty"`
	}
	entries := func(items []Item) []entry {
		out := make([]entry, len(items))
		for i, it := range items {
			out[i] = entry{ID: it.ID, Name: tr(lang.AppearanceName(it.ID), it.Name), Family: it.Family, Starter: it.Starter,
				Default: it.ID == DefaultPortrait || it.ID == DefaultRing, Scope: it.Scope}
			if len(it.Gate.Conditions) > 0 {
				out[i].ConditionsMode = string(it.Gate.Mode)
			}
			for _, cond := range it.Gate.Conditions {
				r := mobs.LockReasonOf(cond)
				out[i].Locks = append(out[i].Locks, lockJSON{Kind: uint8(r.Kind), Value: r.Value,
					Quest: r.Quest, Stage: r.Stage, Species: r.Species, Skill: r.Skill})
			}
			if it.StoneGift() {
				out[i].Locks = append(out[i].Locks, lockJSON{Kind: uint8(mobs.LockStoneGift)})
			}
		}
		return out
	}
	return json.Marshal(struct {
		Portraits []entry `json:"portraits"`
		Rings     []entry `json:"rings"`
	}{entries(c.portraits), entries(c.rings)})
}

// lockJSON is a model.LockReason in /appearance, without the player's
// progress: the client counts that from its own state (D25).
type lockJSON struct {
	Kind    uint8  `json:"kind"`
	Value   uint32 `json:"value,omitempty"`
	Quest   string `json:"quest,omitempty"`
	Stage   string `json:"stage,omitempty"`
	Species uint64 `json:"species,omitempty"`
	Skill   uint16 `json:"skill,omitempty"`
}

// CatalogHandler serves /appearance per locale. Mirrors quests.CatalogHandler.
func CatalogHandler(c Catalog, b *lang.Bundle) (http.Handler, error) {
	return lang.Handler(b, func(tr lang.Tr) ([]byte, error) { return CatalogJSONIn(c, tr) })
}
