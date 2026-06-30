package equip

import (
	"log/slog"

	"github.com/EngoEngine/ecs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// equipEntity is the minimal surface EquipSystem requires from a player.
// model.PlayerEntity satisfies this interface at the call site in game.go.
type equipEntity interface {
	Basic() ecs.BasicEntity
	Name() string
	Client() model.Client
	SkillComponent() *skills.SkillComponent
}

// equipGame is the minimal surface EquipSystem requires from the game.
// model.Game satisfies this interface at the call site in game.go.
type equipGame interface {
	Skills() skills.Registry
}

type EquipSystem struct {
	players []equipEntity
	g       equipGame
}

func NewEquipSystem(g equipGame) *EquipSystem {
	return &EquipSystem{g: g}
}

func (*EquipSystem) New(w *ecs.World) {}

func (*EquipSystem) Priority() int { return 0 }

func (es *EquipSystem) Remove(e ecs.BasicEntity) {
	id := e.ID()
	for i, p := range es.players {
		if p.Basic().ID() == id {
			es.players = append(es.players[:i], es.players[i+1:]...)
			return
		}
	}
}

func (es *EquipSystem) AddPlayer(p equipEntity) {
	es.players = append(es.players, p)
}

func (es *EquipSystem) RemovePlayer(p equipEntity) {
	id := p.Basic().ID()
	for i, e := range es.players {
		if e.Basic().ID() == id {
			es.players = append(es.players[:i], es.players[i+1:]...)
			return
		}
	}
}

func (es *EquipSystem) Update(dt float32) {
	for _, player := range es.players {
		msg := player.Client().NextEquip()
		if msg == nil {
			continue
		}

		// Bounds check — slot comes from the client; an out-of-range value
		// would panic the server via AuraSlots[slot] array access.
		if msg.Slot < 0 || msg.Slot >= skills.MaxAuraSlots {
			slog.Warn("equip: slot out of range",
				slog.String("player", player.Name()),
				slog.Int("slot", msg.Slot),
				slog.Int("maxSlots", skills.MaxAuraSlots))
			continue
		}

		// Registry lookup — verify the skill ID is known.
		def, err := es.g.Skills().Get(msg.SkillID)
		if err != nil {
			slog.Warn("equip: unknown skill",
				slog.String("player", player.Name()),
				slog.Any("skillID", msg.SkillID))
			continue
		}

		// Discovery validation — prevent equipping skills not yet earned.
		sc := player.SkillComponent()
		if !sc.HasDiscovered(msg.SkillID) {
			slog.Warn("equip: skill not discovered",
				slog.String("player", player.Name()),
				slog.String("skill", def.Name))
			continue
		}

		// Equip — overwrite slot if occupied.
		// Level is always 1: Spellbook is map[SkillID]bool with no per-skill
		// discovery level. Using 1 is correct until skill-leveling is built.
		sc.UnequipAura(msg.Slot)
		sc.EquipAura(msg.Slot, def, 1)

		slog.Info("equip",
			slog.String("player", player.Name()),
			slog.String("skill", def.Name),
			slog.Int("slot", msg.Slot))
	}
}
