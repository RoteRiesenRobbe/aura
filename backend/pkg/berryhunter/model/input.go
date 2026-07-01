package model

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

// active_aura_slot wire values. NOTE: -2 is a wire-only sentinel — a workaround for
// FlatBuffers omitting a scalar equal to its schema default (-1), which makes an
// explicit -1 indistinguishable from an absent field. Keep this name and comment in
// sync with the frontend DEACTIVATE_AURA_SLOT constant (InputMessage.ts); together
// they form one wire contract. Collapse -2 onto -1 if the schema default is ever
// changed and regenerated.
const (
	ActiveAuraSlotNoChange   = -1 // client sent no active-aura command this input (wire default)
	ActiveAuraSlotDeactivate = -2 // client explicitly requests Nothing (no active aura)
)

type PlayerInput struct {
	Tick            uint64
	Movement        *phy.Vec2f
	Rotation        float32
	Action          *Action
	Aura            *AuraType
	ActiveAuraSlot  int // ActiveAuraSlotNoChange / ActiveAuraSlotDeactivate / >= 0 = switch to that slot
}

type ActionType int

type Action struct {
	Item items.ItemID
	Type ActionType
}

type AuraType byte

const (
	AuraTypeDamage AuraType = iota
	AuraTypeHeal
)
