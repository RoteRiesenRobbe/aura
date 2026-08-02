// Package persist is the handover between the running game and the database:
// the character-state value struct both halves agree on, and the writer
// goroutine that keeps SQL off the game loop.
//
// ⚑ IT DEPENDS ON NOTHING ELSE IN AURA, and that is what makes it the right
// home for CharacterState. The struct has four consumers that must not depend on
// each other: `store` writes and reads it, `auth` carries it on a play ticket,
// `sys` builds it from a live player and applies it to a fresh one, and
// cmd/aurad wires the writer between them. Putting it in `store` would make the
// game import the database layer; putting it in `sys` would make the database
// layer import the game.
//
// ⚑ ONE STRUCT FOR BOTH DIRECTIONS, deliberately
// (plan-accounts-implementation.md §4). A load/save mismatch is *the* classic
// silent persistence bug — a column written by one half and ignored by the other
// looks like working code from either side alone. Round-trip is therefore the
// acceptance test: snapshot → write → load → identical.
package persist

import (
	"bytes"
	"encoding/json"
	"sort"
)

// The three loadout arrays, spelled exactly as the character_loadout_slots
// CHECK constraint spells them. Constants because the string appears in the
// snapshot builder, the restore path and two SQL statements.
const (
	SlotAura     = "aura"
	SlotPassive  = "passive"
	SlotCooldown = "cooldown"
)

// NoActiveAura is SkillComponent.ActiveAuraSlot's "nothing is active" value.
//
// ⚑ The column is nullable and a never-saved character reads NULL, so the load
// path maps NULL to this rather than to slot 0 — which would silently switch on
// whatever aura happened to be in the first slot.
const NoActiveAura = -1

// LoadoutSlot is one occupied loadout slot: which array, which index, which
// skill.
//
// ⚑ EMPTY SLOTS GET NO ROW. The column is nullable, so a row with a NULL
// skill_id would also be legal — but then "empty" has two representations and
// the round-trip test only ever exercises whichever one the builder happens to
// emit. Absence is the one representation.
type LoadoutSlot struct {
	Type    string `json:"type"`
	Index   int    `json:"index"`
	SkillID int32  `json:"skillId"`
}

// CharacterState is everything about one character that outlives a restart.
//
// What is deliberately absent — HP, position, charges, DerivedStats, cooldowns,
// buffs, status effects — is listed in plan-accounts-schema.md §"What is and
// isn't stored". A character returns at full health with charges reset, because
// a respawn happens at a campfire and campfires reset charges anyway.
type CharacterState struct {
	CharacterID int64 `json:"characterId"`

	// Name is DIAGNOSTIC ONLY: read on load, never written on save.
	//
	// ⚑ Deliberately asymmetric, and the asymmetry is the design rather than an
	// oversight in the one struct whose halves are supposed to agree. The name
	// column is globally unique, is decided at character creation and is what
	// /select proved ownership against a moment ago; a save path that wrote it
	// could only ever write back what it read, while giving the game loop a way
	// to rename a character by accident. It is carried so a failed shutdown flush
	// can name the characters it lost (§2) instead of listing bare ids.
	Name string `json:"name"`

	Level      int   `json:"level"`
	Experience int64 `json:"experience"`
	// ActiveAuraSlot is an index into the aura array, or NoActiveAura.
	ActiveAuraSlot int `json:"activeAuraSlot"`

	// Spellbook is skill id → level, mirroring SkillComponent.Spellbook.
	//
	// ⚑ An EMPTY spellbook means "this character has never been saved", and the
	// restore path leans on that: it leaves a freshly built skill component
	// alone rather than clearing it. A played character always knows at least
	// one skill, so the two cases cannot be confused.
	Spellbook map[int32]int `json:"spellbook"`

	// Loadout holds the occupied slots only, sorted by SortLoadout.
	Loadout []LoadoutSlot `json:"loadout"`

	// Flags is character_flags verbatim: opaque key → JSONB value.
	//
	// ⚑ Opaque on purpose. Today it carries the quest ledger, encoded by
	// package quests (which owns its own shape); tomorrow it carries whatever
	// else needs a key/value home. Teaching this package what a quest is would
	// make every new flag kind a change here as well as there.
	Flags map[string]json.RawMessage `json:"flags"`
}

// SortLoadout orders slots by (type, index) — the same order the load query's
// `ORDER BY slot_type, slot_index` produces.
//
// ⚑ Both halves call it, and that is the point: without a shared ordering the
// round-trip test compares a builder's array order against Postgres's sort and
// fails for a reason that has nothing to do with persistence.
func SortLoadout(slots []LoadoutSlot) {
	sort.Slice(slots, func(i, j int) bool {
		if slots[i].Type != slots[j].Type {
			return slots[i].Type < slots[j].Type
		}
		return slots[i].Index < slots[j].Index
	})
}

// CanonicalFlags rewrites every flag value into Go's canonical JSON encoding:
// compact, with object keys sorted.
//
// ⚑ IT EXISTS BECAUSE JSONB IS NOT A STRING COLUMN. Postgres parses a jsonb
// value and re-renders it on the way out — whitespace gone, object keys in its
// own order — so the bytes that come back are almost never the bytes that went
// in. Without a shared canonical form the round-trip property this package is
// built around would be false for the flags alone, and the fingerprint that
// suppresses redundant writes would consider every reloaded character dirty.
//
// Numbers are decoded with UseNumber so a counter survives as its own literal
// rather than through float64.
func CanonicalFlags(flags map[string]json.RawMessage) map[string]json.RawMessage {
	if len(flags) == 0 {
		return flags
	}
	out := make(map[string]json.RawMessage, len(flags))
	for key, value := range flags {
		out[key] = canonical(value)
	}
	return out
}

func canonical(raw json.RawMessage) json.RawMessage {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var value any
	if err := dec.Decode(&value); err != nil {
		return raw // not our JSON to fix; the database will reject it loudly
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return raw
	}
	return encoded
}

// Fingerprint is a deterministic digest of everything this state would write.
//
// It is what makes "save only if dirty" (§2's session-expiry trigger) a real
// rule rather than a comment: the writer skips a snapshot identical to the one
// it last wrote for that character, so an idle player's 5-minute autosave and
// the redundant expiry write both cost nothing.
//
// ⚑ json.Marshal is deterministic here, which is why it is used instead of a
// hand-rolled hash: struct fields serialise in declaration order and map keys
// are sorted, and Loadout is sorted by SortLoadout before it ever gets here.
func (c CharacterState) Fingerprint() string {
	raw, err := json.Marshal(c)
	if err != nil {
		// Unreachable — every field is a plain JSON-able type — and a wrong
		// answer here costs one redundant write, never a lost one.
		return ""
	}
	return string(raw)
}
