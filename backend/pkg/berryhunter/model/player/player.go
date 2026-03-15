package player

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"log"
	"math"

	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/minions"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/constant"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

var _ = model.PlayerEntity(&player{})

func New(g model.Game, c model.Client, name string) model.PlayerEntity {
	e := minions.NewCircleEntity(0.25)

	e.EntityType = model.EntityType(BerryhunterApi.EntityTypeCharacter)
	p := &player{
		BaseEntity:     e,
		client:         c,
		equipment:      items.NewEquipment(),
		name:           name,
		ownedEntitites: model.NewBasicEntities(),
		config:         &g.Config().PlayerConfig,
		stats:          model.Stats{BirthTick: g.Ticks()},
		progression:    model.PlayerProgression{Level: 1, Experience: 0},
		statusEffects:  model.NewStatusEffects(),
	}

	// setup body
	shapeGroup := int(p.ID())
	p.Body.Shape().UserData = p
	p.Body.Shape().Group = shapeGroup
	p.Body.Shape().Layer = int(model.LayerViewportCollision | model.LayerHeatCollision | model.LayerPlayerCollision)
	p.Body.Shape().Mask = int(model.LayerPlayerStaticCollision | model.LayerBorderCollision)

	// setup viewport
	p.viewport = phy.NewBox(e.Body.Position(), phy.Vec2f{constant.ViewPortWidth / 2, constant.ViewPortHeight / 2})

	p.viewport.Shape().IsSensor = true
	p.viewport.Shape().Mask = int(model.LayerViewportCollision)
	p.viewport.Shape().Group = shapeGroup

	//--- initialize inventory
	inventory, err := initializePlayerInventory(g.Items())
	if err != nil {
		panic(err)
	}
	p.inventory = inventory

	//--- setup vital signs
	p.PlayerVitalSigns.Health = vitals.Max
	p.PlayerVitalSigns.Satiety = vitals.Max
	p.PlayerVitalSigns.BodyTemperature = vitals.Max

	// setup hand sensor
	hand := phy.NewCircle(e.Body.Position(), 0.25)
	hand.Shape().IsSensor = true
	hand.Shape().Group = shapeGroup
	p.hand = model.Hand{Collider: hand}

	// setup damage aura
	damageAura := phy.NewCircle(e.Body.Position(), p.config.DamageAuraRadius)
	damageAura.Shape().IsSensor = true
	damageAura.Shape().Group = shapeGroup
	damageAura.Shape().Layer = int(model.LayerNoneCollision)
	damageAura.Shape().Mask = int(model.LayerActionCollision)
	p.damageAura = damageAura

	p.updateHand()

	return p
}

//---- player

type player struct {
	name string

	model.BaseEntity
	statusEffects    model.StatusEffects
	newStatusEffects model.StatusEffects

	angle  float32
	client model.Client

	viewport   *phy.Box
	damageAura *phy.Circle

	hand      model.Hand
	inventory items.Inventory
	equipment *items.Equipment

	model.PlayerVitalSigns

	config *cfg.PlayerConfig

	ownedEntitites model.BasicEntities

	ongoingAction model.PlayerAction

	isGod  bool
	wasGod bool

	stats       model.Stats
	progression model.PlayerProgression
}

func (p *player) StatusEffects() *model.StatusEffects {
	return &p.statusEffects
}

func (p *player) AddAction(a model.PlayerAction) {
	if p.ongoingAction != nil && p.ongoingAction.TicksRemaining() > 0 {

		log.Printf("😧 Already action going on.")
		return
	}

	a.Start()
	p.ongoingAction = a
}

func (p *player) CurrentAction() model.PlayerAction {
	return p.ongoingAction
}

func (p *player) takeDamage(damage float32, s model.StatusEffect) {
	if p.IsGod() {
		return
	}

	dmgFraction := damage // * vulnerability
	if dmgFraction > 0 {
		h := p.PlayerVitalSigns.Health
		p.PlayerVitalSigns.Health = h.SubFraction(dmgFraction)
		p.StatusEffects().Add(s)
	}
}

func (p *player) PlayerHitsWith(player model.PlayerEntity, item items.Item) {
	p.takeDamage(item.Factors.Damage, model.StatusEffectDamaged)
}

func (p *player) MobTouches(e model.MobEntity, factors mobs.Factors) {
	p.takeDamage(factors.DamageFraction, model.StatusEffectDamagedAmbient)
}

func (p *player) PlayerTouches(other model.PlayerEntity, damageFraction float32) {
	p.takeDamage(damageFraction, model.StatusEffectDamagedAmbient)
}

func (p *player) Name() string {
	return p.name
}

func (p *player) Equipment() *items.Equipment {
	return p.equipment
}

func (p *player) Bodies() model.Bodies {
	b := make(model.Bodies, 4)
	b[0] = p.Body
	b[1] = p.hand.Collider
	b[2] = p.viewport
	b[3] = p.damageAura
	return b
}

func (p *player) VitalSigns() *model.PlayerVitalSigns {
	return &p.PlayerVitalSigns
}

func (p *player) Inventory() *items.Inventory {
	return &p.inventory
}

func (p *player) Viewport() phy.DynamicCollider {
	return p.viewport
}

func (p *player) Client() model.Client {
	return p.client
}

func (p *player) Position() phy.Vec2f {
	return p.Body.Position()
}

func (p *player) SetPosition(v phy.Vec2f) {
	p.Body.SetPosition(v)
	p.viewport.SetPosition(v)
	p.damageAura.SetPosition(v)
	p.updateHand()
}

func (p *player) SetAngle(a float32) {
	p.angle = a
	p.updateHand()
}

func (p *player) Angle() float32 {
	return p.angle
}

func (p *player) Hand() *model.Hand {
	return &p.hand
}

func (p *player) Config() *cfg.PlayerConfig {
	return p.config
}

func (p *player) Stats() *model.Stats {
	return &p.stats
}

func (p *player) AddExperience(xp uint64) {
	if xp == 0 {
		return
	}
	previousLevel := p.progression.Level
	if previousLevel < 1 {
		previousLevel = 1
	}
	p.progression.Experience += xp

	level := p.levelForExperience(p.progression.Experience)
	if level < 1 {
		level = 1
	}
	p.progression.Level = level
	if level > previousLevel {
		p.PlayerVitalSigns.Health = vitals.Max
	}
}

func (p *player) Progression() model.PlayerProgression {
	return p.progression
}

func (p *player) SetProgression(progression model.PlayerProgression) {
	if progression.Level < 1 {
		progression.Level = 1
	}
	p.progression = progression
}

func (p *player) LoseCurrentLevelExperience() {
	level := p.progression.Level
	if level < 1 {
		level = 1
	}
	p.progression.Level = level
	p.progression.Experience = p.totalXPForLevel(level)
}

func (p *player) DamageAuraDamageFraction() float32 {
	levelBonus := float32(p.progression.Level-1) * p.config.DamageAuraLevelGainFraction
	return p.config.DamageAuraDamageFraction + levelBonus
}

func (p *player) LevelProgressFraction() float32 {
	level := p.progression.Level
	levelStartXP := p.totalXPForLevel(level)
	levelEndXP := p.totalXPForLevel(level + 1)
	if levelEndXP <= levelStartXP {
		return 1
	}

	gained := p.progression.Experience - levelStartXP
	required := levelEndXP - levelStartXP
	fraction := float32(gained) / float32(required)
	if fraction < 0 {
		return 0
	}
	if fraction > 1 {
		return 1
	}
	return fraction
}

func initializePlayerInventory(r items.Registry) (items.Inventory, error) {
	type startItem struct {
		name  string
		count int
	}
	inventory := items.NewInventory()

	// This is the inventory a new player starts with
	startItems := []startItem{
		//		{"IronTool", 1},
		//		{"BronzeSword", 1},
		//		{"Workbench", 1},
		//		{"BigCampfire", 3},
	}

	//--- initialize inventory
	var item items.Item
	var err error
	for _, i := range startItems {
		item, err = r.GetByName(i.name)
		if err != nil {
			return inventory, err
		}
		inventory.AddItem(items.NewItemStack(item, i.count))
	}

	return inventory, nil
}

func (p *player) startAction(tool items.Item) {
	p.hand.Item = tool
	p.hand.Collider.Shape().Mask = int(model.LayerRessourceCollision | model.LayerActionCollision)
}

func (p *player) experienceForNextLevel(level uint32) uint64 {
	if level < 1 {
		level = 1
	}

	baseXP := float64(p.config.LevelUpXPBase)
	growth := float64(p.config.LevelUpXPGrowthFactor)
	if growth <= 1.0 {
		growth = 1.2
	}

	// WoW-like feel: early levels are quick, later levels ramp up exponentially.
	required := baseXP * math.Pow(growth, float64(level-1))
	if required < 1 {
		required = 1
	}
	return uint64(math.Round(required))
}

func (p *player) totalXPForLevel(level uint32) uint64 {
	if level <= 1 {
		return 0
	}

	var total uint64
	for l := uint32(1); l < level; l++ {
		total += p.experienceForNextLevel(l)
	}
	return total
}

func (p *player) levelForExperience(xp uint64) uint32 {
	level := uint32(1)
	for {
		next := p.totalXPForLevel(level + 1)
		if xp < next {
			return level
		}
		level++

		// Safety guard for absurd values.
		if level >= 65535 {
			return level
		}
	}
}

var handOffset = phy.Vec2f{0.25, 0}

func (p *player) updateHand() {
	// could cache Rotation matrix/ handOffset
	relativeOffset := phy.NewRotMat2f(p.angle).Mult(handOffset)
	handPos := p.Position().Add(relativeOffset)
	p.hand.Collider.SetPosition(handPos)
}

func (p *player) OwnedEntities() model.BasicEntities {
	return p.ownedEntitites
}

func (p *player) SetGodmode(on bool) {
	p.isGod = on
	p.wasGod = p.wasGod || on
}

func (p *player) IsGod() bool {
	return p.isGod
}

func (p *player) WasGod() bool {
	return p.wasGod
}
