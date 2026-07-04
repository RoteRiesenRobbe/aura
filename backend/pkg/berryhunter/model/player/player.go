package player

import (
	"fmt"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"log/slog"
	"math"

	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"
	"github.com/trichner/berryhunter/pkg/berryhunter/minions"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/constant"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

var _ = model.PlayerEntity(&player{})

func New(g model.Game, c model.Client, name string) model.PlayerEntity {
	e := minions.NewCircleEntity(0.25)

	e.EntityType = model.EntityType(BerryhunterApi.EntityTypeCharacter)
	p := &player{
		BaseEntity:     e,
		client:         c,
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

	//--- initialize skill component
	sc, err := initializePlayerSkills(g.Skills())
	if err != nil {
		panic(err)
	}
	p.skills = sc
	p.milestoneUnlocks = g.Config().MilestoneUnlocks

	//--- setup vital signs
	p.PlayerVitalSigns.Health = vitals.Max
	p.PlayerVitalSigns.Satiety = vitals.Max
	p.PlayerVitalSigns.BodyTemperature = vitals.Max

	// setup hand sensor
	hand := phy.NewCircle(e.Body.Position(), 0.25)
	hand.Shape().IsSensor = true
	hand.Shape().Group = shapeGroup
	p.hand = model.Hand{Collider: hand}

	// setup the single aura sensor; SkillSystem resizes it per tick to the
	// active skill's EffectiveRadius (0 while nothing is active)
	aura := phy.NewCircle(e.Body.Position(), 0)
	aura.Shape().IsSensor = true
	aura.Shape().Group = shapeGroup
	aura.Shape().Layer = int(model.LayerNoneCollision)
	aura.Shape().Mask = int(model.LayerPlayerCollision | model.LayerActionCollision)
	p.aura = aura

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

	viewport *phy.Box
	aura     *phy.Circle

	hand model.Hand

	model.PlayerVitalSigns

	config *cfg.PlayerConfig

	ownedEntitites model.BasicEntities

	isGod  bool
	wasGod bool

	stats       model.Stats
	progression model.PlayerProgression

	skills           *skills.SkillComponent
	milestoneUnlocks []skills.MilestoneUnlock

	// healers inside the participation window (v1-roadmap item 10);
	// lazily initialized by NoteHealedBy
	recentHealers map[uint64]*healerEntry
}

func (p *player) StatusEffects() *model.StatusEffects {
	return &p.statusEffects
}


func (p *player) maxHealthFactor() float32 {
	level := p.progression.Level
	if level < 1 {
		level = 1
	}
	// Health is stored normalized (fraction of max), so a passive maxHealth
	// bonus preserves the current health *percentage* by construction.
	return 1 + float32(level-1)*p.config.MaxHealthLevelGainFraction + p.skills.Derived.MaxHealthBonus
}

// HealthRatio is the current/max health fraction (0..1), read by the
// lowest_health aura selector (v1-roadmap.md item 11). Health is stored
// normalized, so the raw fraction already is the ratio.
func (p *player) HealthRatio() float32 {
	return p.PlayerVitalSigns.Health.Fraction()
}

func (p *player) takeDamage(damage float32, s model.StatusEffect) {
	// Passive damage reduction (DerivedStats); 100% is the natural cap.
	if r := p.skills.Derived.DamageReductionBonus; r > 0 {
		if r > 1 {
			r = 1
		}
		damage *= 1 - r
	}
	if p.IsGod() {
		return
	}

	dmgFraction := damage / p.maxHealthFactor()
	if dmgFraction > 0 {
		h := p.PlayerVitalSigns.Health
		p.PlayerVitalSigns.Health = h.SubFraction(dmgFraction)
		p.StatusEffects().Add(s)
	}
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

func (p *player) Bodies() model.Bodies {
	b := make(model.Bodies, 4)
	b[0] = p.Body
	b[1] = p.hand.Collider
	b[2] = p.viewport
	b[3] = p.aura
	return b
}

func (p *player) VitalSigns() *model.PlayerVitalSigns {
	return &p.PlayerVitalSigns
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
	p.aura.SetPosition(v)
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
		p.applyMilestoneUnlocks(previousLevel+1, level)
	}
}

func (p *player) Progression() model.PlayerProgression {
	return p.progression
}

// AvailableSkillPoints is the unspent point count: the budget the player level
// earns minus the points bound in the spellbook. Derived on every call so free
// respec can never make the numbers drift.
func (p *player) AvailableSkillPoints() int {
	return skills.TotalSkillPoints(p.progression.Level, p.config.SkillPointsPerLevel) - p.skills.SpentPoints()
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

// AuraRadius is the effective radius of the active aura, 0 while nothing is
// active. Serialized as Character.aura_radius so all clients can size the ring.
func (p *player) AuraRadius() float32 {
	slot := p.skills.ActiveAuraSlot
	if slot < 0 || p.skills.AuraSlots[slot] == nil {
		return 0
	}
	return p.skills.AuraSlots[slot].EffectiveRadius()
}

// BurstRadius feeds the Character.burst_radius wire field (burst ring VFX).
func (p *player) BurstRadius() float32 {
	return p.skills.BurstRadius(skills.BurstVFXTicks)
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

// applyMilestoneUnlocks discovers any skills whose unlock level falls in [from, to].
// Called on level-up; from/to are both inclusive so a multi-level jump catches all entries.
func (p *player) applyMilestoneUnlocks(from, to uint32) {
	for _, u := range p.milestoneUnlocks {
		if u.Level >= from && u.Level <= to {
			p.skills.Discover(u.Skill.ID)
			slog.Info("milestone unlock", slog.String("player", p.name), slog.String("skill", u.Skill.Name), slog.Uint64("level", uint64(u.Level)))
		}
	}
}

func initializePlayerSkills(r skills.Registry) (*skills.SkillComponent, error) {
	damageAura, err := r.GetByName("DamageAura")
	if err != nil {
		return nil, fmt.Errorf("skill registry missing DamageAura: %w", err)
	}

	sc := skills.NewSkillComponent(true)
	sc.EquipAura(0, damageAura, 1)
	sc.Discover(damageAura.ID)
	sc.SetActiveAura(0)
	return sc, nil
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

func (p *player) SkillComponent() *skills.SkillComponent {
	return p.skills
}

// SetSkillComponent replaces the freshly-initialized skill component with a
// restored one (respawn), preserving the spellbook, equipped loadout and active
// aura the player had at death. The aura sensor created in New is resized to the
// active skill's radius by the SkillSystem on the next tick.
func (p *player) SetSkillComponent(sc *skills.SkillComponent) {
	if sc != nil {
		p.skills = sc
	}
}

func (p *player) AuraCollider() *phy.Circle {
	return p.aura
}

func (p *player) MaxHealthFactor() float32 {
	return p.maxHealthFactor()
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
