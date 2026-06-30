package model

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

type PlayerInput struct {
	Tick            uint64
	Movement        *phy.Vec2f
	Rotation        float32
	Action          *Action
	Aura            *AuraType
	ActiveAuraSlot  int // -1 = no change; >= 0 = switch to that slot
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
