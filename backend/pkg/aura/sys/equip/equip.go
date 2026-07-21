package equip

import (
	"log/slog"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// equipEntity is the minimal surface EquipSystem requires from a player.
// model.PlayerEntity satisfies this interface at the call site in game.go.
type equipEntity interface {
	Basic() ecs.BasicEntity
	Name() string
	Client() model.Client
	InCombat() bool
	SkillComponent() *skills.SkillComponent
	AvailableSkillPoints() int
	// ApplyRecipeCascade discovers any combination recipes newly satisfied by a
	// skill-level raise (Phase 9).
	ApplyRecipeCascade()
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

func (es *EquipSystem) Update(dt float32) {
	for _, player := range es.players {
		es.handleEquip(player)
		es.handleSpendSkillPoint(player)
	}
}

func (es *EquipSystem) handleEquip(player equipEntity) {
	msg := player.Client().NextEquip()
	if msg == nil {
		return
	}

	// Loadout editing is an out-of-combat build activity: reject any equip
	// while the player is in combat. This closes the cooldown-refresh exploit
	// (re-slotting mints a fresh, ready EquippedSkill) without touching the
	// mid-fight lever — switching the active aura is a separate input path.
	if player.InCombat() {
		slog.Info("equip: rejected in combat",
			slog.String("player", player.Name()),
			slog.Any("skillID", msg.SkillID))
		return
	}

	// Registry lookup — verify the skill ID is known.
	def, err := es.g.Skills().Get(msg.SkillID)
	if err != nil {
		slog.Warn("equip: unknown skill",
			slog.String("player", player.Name()),
			slog.Any("skillID", msg.SkillID))
		return
	}

	// The skill's own category picks the slot array (decided: no category on
	// the wire). Bounds check per category — slot comes from the client; an
	// out-of-range value would panic the server via array access.
	var maxSlots int
	switch def.Category {
	case skills.SkillCategoryActiveAura:
		maxSlots = skills.MaxAuraSlots
	case skills.SkillCategoryPassive:
		maxSlots = skills.MaxPassiveSlots
	case skills.SkillCategoryCooldown:
		maxSlots = skills.MaxCooldownSlots
	default:
		slog.Warn("equip: category not equippable",
			slog.String("player", player.Name()),
			slog.String("skill", def.Name))
		return
	}
	if msg.Slot < 0 || msg.Slot >= maxSlots {
		slog.Warn("equip: slot out of range",
			slog.String("player", player.Name()),
			slog.Int("slot", msg.Slot),
			slog.Int("maxSlots", maxSlots))
		return
	}

	// Discovery validation — prevent equipping skills not yet earned.
	sc := player.SkillComponent()
	if !sc.HasDiscovered(msg.SkillID) {
		slog.Warn("equip: skill not discovered",
			slog.String("player", player.Name()),
			slog.String("skill", def.Name))
		return
	}

	// Equip at the spellbook level — overwrite slot if occupied.
	level := sc.SkillLevel(msg.SkillID)
	switch def.Category {
	case skills.SkillCategoryActiveAura:
		// Swapping the active slot's aura keeps the slot active: UnequipAura
		// resets ActiveAuraSlot, so re-activate the slot for the new aura —
		// otherwise the player is left with no aura at all (ring/effect/light
		// silently off; invisible under a dark-area overlay).
		wasActive := sc.ActiveAuraSlot == msg.Slot
		sc.UnequipAura(msg.Slot)
		sc.EquipAura(msg.Slot, def, level)
		if wasActive {
			sc.SetActiveAura(msg.Slot)
		}
	case skills.SkillCategoryPassive:
		sc.EquipPassive(msg.Slot, def, level)
	case skills.SkillCategoryCooldown:
		sc.EquipCooldown(msg.Slot, def, level)
	}

	slog.Info("equip",
		slog.String("player", player.Name()),
		slog.String("skill", def.Name),
		slog.Int("slot", msg.Slot))
}

func (es *EquipSystem) handleSpendSkillPoint(player equipEntity) {
	msg := player.Client().NextSpendSkillPoint()
	if msg == nil {
		return
	}

	def, err := es.g.Skills().Get(msg.SkillID)
	if err != nil {
		slog.Warn("spend: unknown skill",
			slog.String("player", player.Name()),
			slog.Any("skillID", msg.SkillID))
		return
	}

	sc := player.SkillComponent()
	if msg.Unspend {
		// Free respec: refunding frees a point, so no availability check.
		if !sc.LowerSkillLevel(def) {
			slog.Warn("spend: cannot unspend",
				slog.String("player", player.Name()),
				slog.String("skill", def.Name),
				slog.Int("level", sc.SkillLevel(def.ID)))
			return
		}
	} else {
		if player.AvailableSkillPoints() <= 0 {
			slog.Warn("spend: no skill points available",
				slog.String("player", player.Name()),
				slog.String("skill", def.Name))
			return
		}
		if !sc.RaiseSkillLevel(def) {
			slog.Warn("spend: cannot raise",
				slog.String("player", player.Name()),
				slog.String("skill", def.Name),
				slog.Int("level", sc.SkillLevel(def.ID)))
			return
		}
		// Only a level *raise* can newly satisfy a recipe; unspend never can.
		player.ApplyRecipeCascade()
	}

	slog.Info("spend",
		slog.String("player", player.Name()),
		slog.String("skill", def.Name),
		slog.Bool("unspend", msg.Unspend),
		slog.Int("newLevel", sc.SkillLevel(def.ID)))
}
