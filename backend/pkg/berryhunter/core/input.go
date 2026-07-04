package core

import (
	"log"

	"github.com/EngoEngine/ecs"

	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

const inputBuffererCount = 3

//---- models for input

type clientMessage struct {
	playerId uint64
	body     []byte
}

type PlayerInputSystem struct {
	players model.Players
	game    *game
	// currently two, one to read and one to fill
	ibufs [inputBuffererCount]InputBufferer
}

func NewInputSystem(g *game) *PlayerInputSystem {
	return &PlayerInputSystem{game: g}
}

func (i *PlayerInputSystem) Priority() int {
	return 100
}

func (i *PlayerInputSystem) New(w *ecs.World) {
	// initialize buffers
	for idx := range i.ibufs {
		i.ibufs[idx] = NewInputBufferer()
	}
	log.Println("PlayerInputSystem nominal")
}

func (i *PlayerInputSystem) storeInput(playerId uint64, input *model.PlayerInput) {
	i.ibufs[i.game.Tick%inputBuffererCount][playerId] = input
}

func (i *PlayerInputSystem) AddPlayer(p model.PlayerEntity) {
	i.players = append(i.players, p)
}

func (i *PlayerInputSystem) Update(dt float32) {
	// get all inputs
	for _, p := range i.players {
		input := p.Client().NextInput()
		if input != nil {
			i.storeInput(p.Basic().ID(), input)
		}
	}

	// freeze input, concurrent reads are fine
	ibuf := i.ibufs[i.game.Tick%inputBuffererCount]
	lastBuf := i.ibufs[(i.game.Tick+inputBuffererCount-1)%inputBuffererCount]

	// apply inputs to player
	for _, p := range i.players {
		inputs, _ := ibuf[p.Basic().ID()]
		last, _ := lastBuf[p.Basic().ID()]
		i.updateInput(p, inputs, last)
	}

	// clear out buffer
	i.ibufs[i.game.Tick%inputBuffererCount] = NewInputBufferer()
}

// applies the inputs to a player
func (i *PlayerInputSystem) updateInput(p model.PlayerEntity, next, last *model.PlayerInput) {
	if next == nil {
		return
	}

	// Active-aura command. >= 0 switches to that slot; the -2 wire sentinel means
	// "explicitly deactivate" (maps to component slot -1 = Nothing); -1 (the wire
	// default) means the client said nothing, so we leave the active aura untouched.
	if next.ActiveAuraSlot >= 0 {
		p.SkillComponent().SetActiveAura(next.ActiveAuraSlot)
	} else if next.ActiveAuraSlot == model.ActiveAuraSlotDeactivate {
		p.SkillComponent().SetActiveAura(-1)
	}

	// Cooldown activations: queued here, fired by the SkillSystem later in
	// this same tick (update runs before skills). Invalid indices are dropped
	// by RequestCooldownActivation.
	for _, slot := range next.CooldownActivations {
		p.SkillComponent().RequestCooldownActivation(slot)
	}

	// do we even have inputs?
	if next.Movement != nil {
		// we can only move if we are still alive!
		if p.VitalSigns().Health != 0 {
			v := input2vec(next)
			// Passive movement-speed bonus (DerivedStats); config stays untouched.
			speed := p.Config().WalkingSpeedPerTick * (1 + p.SkillComponent().Derived.MovementSpeedBonus)
			v = v.Mult(speed)
			next := p.Position().Add(v)
			p.SetPosition(next)
		}
	}
}

func input2vec(i *model.PlayerInput) phy.Vec2f {
	x := i.Movement.X
	y := i.Movement.Y
	// prevent division by zero
	if x == 0 && y == 0 {
		return phy.Vec2f{}
	}
	v := phy.Vec2f{x, y}
	return v.Normalize()
}

func (i *PlayerInputSystem) Remove(b ecs.BasicEntity) {
	var delete int = -1
	for index, player := range i.players {
		if player.Basic().ID() == b.ID() {
			delete = index
			break
		}
	}
	if delete >= 0 {
		// e := p.players[delete]
		i.players = append(i.players[:delete], i.players[delete+1:]...)
	}
}

func NewInputBufferer() InputBufferer {
	return make(InputBufferer)
}

type InputBufferer map[uint64]*model.PlayerInput
