package placeable

import (
	"fmt"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"math"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

var _ = model.PlaceableEntity(&Placeable{})

type Placeable struct {
	model.BaseEntity
	item items.Item

	health        vitals.VitalSign
	ticksLeft     int
	statusEffects model.StatusEffects
}

func (p *Placeable) Update(dt float32) {
	p.ticksLeft -= 1

	// prevent underflow
	if p.ticksLeft < 0 {
		p.ticksLeft = 0
	}
}

func (p *Placeable) Decayed() bool {
	return p.ticksLeft <= 0 || p.health <= 0
}

func (p *Placeable) Item() items.Item {
	return p.item
}

func (p *Placeable) StatusEffects() *model.StatusEffects {
	return &p.statusEffects
}

func NewPlaceable(item items.Item) (*Placeable, error) {
	if item.ItemDefinition == nil {
		return nil, fmt.Errorf("No resource provided.")
	}

	if item.ItemDefinition.Body == nil {
		return nil, fmt.Errorf("ItemDefinition is missing body property.")
	}

	body := phy.NewCircle(phy.VEC2F_ZERO, item.Body.Radius)
	if item.Body.Solid {
		body.Shape().Layer =
			int(model.LayerPlayerStaticCollision |
				model.LayerMobStaticCollision |
				model.LayerActionCollision |
				model.LayerViewportCollision |
				model.LayerPlaceableCollision)
	} else {
		body.Shape().Layer =
			int(model.LayerViewportCollision |
				model.LayerPlaceableCollision)
		body.Shape().IsSensor = true
	}

	if body == nil {
		return nil, fmt.Errorf("No body provided.")
	}

	// set up the decay time
	var ticksLeft int = math.MaxInt32
	if item.Factors.DurationInTicks != 0 {
		ticksLeft = item.Factors.DurationInTicks
	}

	base := model.NewBaseEntity(body, model.EntityType(AuraApi.EntityTypePlaceable))
	p := &Placeable{
		BaseEntity:    base,
		item:          item,
		health:        vitals.Max,
		ticksLeft:     ticksLeft,
		statusEffects: model.NewStatusEffects(),
	}
	p.Body.Shape().UserData = p
	return p, nil
}

func (p *Placeable) takeDamage(damage float32, s model.StatusEffect) {
	vulnerability := p.item.Factors.Vulnerability
	if vulnerability == 0 {
		vulnerability = 1
	}

	dmgFraction := damage * vulnerability
	if dmgFraction > 0 {
		p.health = p.health.SubFraction(dmgFraction)
		p.StatusEffects().Add(s)
	}
}

func (p *Placeable) MobTouches(e model.MobEntity, factors mobs.Factors) {
	p.takeDamage(factors.StructureDamageFraction, model.StatusEffectDamagedAmbient)
}

func (p *Placeable) PlayerTouches(player model.PlayerEntity, damage model.Damage) {
	// Players do not deal ambient damage to structures.
}
