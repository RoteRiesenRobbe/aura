package core

import (
	"log"

	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
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
	// lastMove holds a movement-only copy of each player's last applied input,
	// used to bridge a single input-starved tick (client/server clock drift).
	// See pickInput.
	lastMove map[uint64]*model.PlayerInput
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
	i.lastMove = make(map[uint64]*model.PlayerInput)
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

	// apply inputs to player
	for _, p := range i.players {
		id := p.Basic().ID()
		i.updateInput(p, i.pickInput(id, ibuf[id]), nil)
	}

	// clear out buffer
	i.ibufs[i.game.Tick%inputBuffererCount] = NewInputBufferer()
}

// pickInput chooses the input to apply for a player this tick. fresh is the
// input received this tick, or nil if the input queue was starved.
//
// The client sends inputs on its own free-running 33 ms timer while the server
// consumes one per 33 ms tick; ~0.1% clock drift starves the queue of an input
// roughly once every 30 s, which shows up as a one-tick movement hitch. To hide
// it, a starved tick is bridged with the last applied movement — but only once
// (the entry is consumed on use), so a genuinely disconnected client's
// character halts after one tick instead of sliding forever. The bridged copy
// carries movement only: it must never replay one-shot commands (aura switch,
// cooldown activation).
func (i *PlayerInputSystem) pickInput(id uint64, fresh *model.PlayerInput) *model.PlayerInput {
	if fresh != nil {
		i.lastMove[id] = &model.PlayerInput{
			Movement:       fresh.Movement,
			Rotation:       fresh.Rotation,
			ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		}
		return fresh
	}
	bridged := i.lastMove[id]
	delete(i.lastMove, id)
	return bridged
}

// applies the inputs to a player
func (i *PlayerInputSystem) updateInput(p model.PlayerEntity, next, last *model.PlayerInput) {
	if next == nil {
		return
	}

	// Active-aura command. >= 0 switches to that slot; the -2 wire sentinel means
	// "explicitly deactivate" (maps to component slot -1 = Nothing); -1 (the wire
	// default) means the client said nothing, so we leave the active aura untouched.
	// An aura command is a deliberate act: it cancels a running cast (chunk 4).
	if next.ActiveAuraSlot >= 0 {
		p.SkillComponent().CancelCast()
		p.SkillComponent().SetActiveAura(next.ActiveAuraSlot)
	} else if next.ActiveAuraSlot == model.ActiveAuraSlotDeactivate {
		p.SkillComponent().CancelCast()
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
			// Moving is a deliberate act: it cancels a running cast (chunk 4).
			// Only an actual vector counts — an idle/bridged movement packet
			// must not flicker the cast. The same non-zero vector is the dash
			// aim (chunk 5): record it as the last movement direction (already
			// unit-normalized) so a standing player dashes where they last
			// walked.
			if v != (phy.Vec2f{}) {
				p.SkillComponent().CancelCast()
				p.SetLastMoveDir(v)
			}
			// Passive movement-speed bonus (DerivedStats); config stays untouched.
			speed := p.Config().WalkingSpeedPerTick * (1 + p.SkillComponent().Derived.MovementSpeedBonus)
			if f := p.SpeedCheatFactor(); f > 0 {
				speed *= f
			}
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
	v := phy.Vec2f{X: x, Y: y}
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
