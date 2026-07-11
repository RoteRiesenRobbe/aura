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
	p.recipes = g.Config().Recipes
	// A fresh spawn only has DamageAura at level 1, but run the cascade anyway
	// so a starter recipe keyed on that would still fire — keeps discovery paths
	// uniform.
	p.ApplyRecipeCascade()

	//--- setup vital signs
	p.PlayerVitalSigns.Health = p.MaxHealth() // absolute HP (item 11 Phase 1)

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
	recipes          skills.RecipeRegistry

	// healers inside the participation window (roadmap item 10);
	// lazily initialized by NoteHealedBy
	recentHealers map[uint64]*healerEntry

	// per-tick floating-number accumulators (roadmap item 11): health lost,
	// healing received (VitalSign units), and XP gained this tick; reset each
	// tick by ResetTickNumbers.
	damageTaken  vitals.VitalSign
	healReceived vitals.VitalSign
	xpGained     uint64

	// auraHitStyle is the aura-hit VFX a damage aura stamped on this player this
	// tick (item 11 Step 4); reset each tick alongside the accumulators above.
	auraHitStyle model.AuraHitStyle

	// healthRegen accumulates sub-1-HP out-of-combat regen (item 11 Phase 1):
	// with absolute integer HP the per-tick regen is often < 1 HP, so it is
	// carried here and applied once a whole HP has built up.
	healthRegen float32

	// buffs is the transient status-effect store (effect foundations Step 2):
	// resist_aura buffs and dot debuffs. Aged on the same per-tick lifecycle
	// as the accumulators above; dies with the entity — respawn starts clean
	// (carriedState stashes only progression + SkillComponent).
	buffs skills.Buffs

	// Companion combat signals (mob-depth chunk 6, §3.6): the last mob this
	// player directly damaged (assist) and the last mob that damaged this
	// player (defend), each valid for combatSignalWindowTicks. Aged in
	// ResetTickNumbers alongside the accumulators; die with the entity.
	attackTarget      model.Combatant
	attackTargetTicks int
	attacker          model.Combatant
	attackerTicks     int
}

// combatSignalWindowTicks [PLACEHOLDER] is how long a combat signal stays
// readable by a companion (~3 s) — long enough to bridge aura tick cadences,
// short enough that a companion doesn't chase stale grudges.
const combatSignalWindowTicks = 90

// NoteAttackDealt stamps the assist signal (model.AttackNotifier): called by
// Mob.PlayerTouches on direct hits only (Damage.Source == nil).
func (p *player) NoteAttackDealt(target model.Combatant) {
	p.attackTarget = target
	p.attackTargetTicks = combatSignalWindowTicks
}

// RecentAttackTarget is the assist half of model.CombatSignals: the last mob
// this player directly damaged, nil once expired or dead.
func (p *player) RecentAttackTarget() model.Combatant {
	return liveSignal(p.attackTarget, p.attackTargetTicks)
}

// RecentAttacker is the defend half of model.CombatSignals: the last mob that
// damaged this player, nil once expired or dead.
func (p *player) RecentAttacker() model.Combatant {
	return liveSignal(p.attacker, p.attackerTicks)
}

func liveSignal(c model.Combatant, ticks int) model.Combatant {
	if c == nil || ticks <= 0 || c.HealthRatio() == 0 {
		return nil
	}
	return c
}

func (p *player) StatusEffects() *model.StatusEffects {
	return &p.statusEffects
}

func (p *player) maxHealthFactor() float32 {
	level := p.progression.Level
	if level < 1 {
		level = 1
	}
	// Multiplier on baseHealth from level + passive bonuses (item 11 Phase 1).
	// Leveling raises maxHealth; current HP stays and regenerates up.
	return 1 + float32(level-1)*p.config.MaxHealthLevelGainFraction + p.skills.Derived.MaxHealthBonus
}

// MaxHealth is the player's absolute HP pool (item 11 Phase 1):
// round(baseHealth × maxHealthFactor). Serialized as the max_health wire field.
func (p *player) MaxHealth() vitals.VitalSign {
	return vitals.VitalSign(vitals.HP(float32(p.config.BaseHealth) * p.maxHealthFactor()))
}

// HealthRatio is the current/max health fraction (0..1), read by the
// lowest_health aura selector (roadmap.md item 11).
func (p *player) HealthRatio() float32 {
	maxHP := p.MaxHealth()
	if maxHP == 0 {
		return 0
	}
	return float32(p.PlayerVitalSigns.Health) / float32(maxHP)
}

// takeDamage subtracts absolute HP (item 11 Phase 1). Damage no longer scales
// by maxHealthFactor — a hit removes flat HP regardless of the player's pool.
// The hit's damage tags are carried for tag resistances (Phase 2); players
// have no base resistances, transient resist-aura buffs land in Step 3.
func (p *player) takeDamage(damage model.Damage, s model.StatusEffect) {
	// Tag resistances (Phase 2): resist passives (Derived) and transient
	// resist-aura buffs are distinct sources and stack multiplicatively.
	hp32 := damage.HP *
		skills.ResistMultiplier(damage.Tags, p.skills.Derived.Resistances) *
		p.buffs.ResistMultiplier(damage.Tags)
	// Passive damage reduction (DerivedStats); 100% is the natural cap.
	if r := p.skills.Derived.DamageReductionBonus; r > 0 {
		if r > 1 {
			r = 1
		}
		hp32 *= 1 - r
	}
	if p.IsGod() {
		return
	}

	hp := vitals.HP(hp32)
	if hp > 0 {
		h := p.PlayerVitalSigns.Health
		p.PlayerVitalSigns.Health = h.Sub(hp)
		p.damageTaken += h - p.PlayerVitalSigns.Health // actual loss after clamping
		p.StatusEffects().Add(s)
	}
}

// DamageTaken / HealReceived / XpGained expose the per-tick floating-number
// accumulators (roadmap item 11).
func (p *player) DamageTaken() vitals.VitalSign  { return p.damageTaken }
func (p *player) HealReceived() vitals.VitalSign { return p.healReceived }
func (p *player) XpGained() uint64               { return p.xpGained }

// NoteHealReceived records healing applied to this player this tick; the
// SkillSystem calls it when a heal aura lands.
func (p *player) NoteHealReceived(delta vitals.VitalSign) {
	p.healReceived += delta
}

// AuraHitStyle is the aura-hit VFX stamped on this player this tick (item 11
// Step 4); serialized as the Character aura_hit_style wire field.
func (p *player) AuraHitStyle() model.AuraHitStyle { return p.auraHitStyle }

// NoteAuraHit records the aura-hit VFX style for this tick; the SkillSystem
// calls it when a damage aura strikes this player.
func (p *player) NoteAuraHit(style model.AuraHitStyle) { p.auraHitStyle = style }

// ApplyResist grants a transient tag-resistance buff from a resist aura
// (item 11 Phase 2); re-applied each aura tick, it expires on the same
// per-tick lifecycle as the floating-number accumulators.
func (p *player) ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) {
	p.buffs.ApplyResist(source, tags, factor, ticks)
}

// ApplyDot grants a damage-over-time debuff (effect foundations Step 2); it
// runs its full authored duration independent of re-application, ticked by
// the SkillSystem via DueDotHits.
func (p *player) ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int) {
	p.buffs.ApplyDot(source, dot, ticks)
}

// DueDotHits advances and drains this tick's due dot damage events; called
// once per tick by the SkillSystem's acting site.
func (p *player) DueDotHits() []skills.DotHit {
	return p.buffs.DueDotHits()
}

// ResetTickNumbers clears the per-tick floating-number accumulators and ages
// the transient buff store; called by the StatusEffectsSystem at the start
// of each tick.
func (p *player) ResetTickNumbers() {
	p.damageTaken = 0
	p.healReceived = 0
	p.xpGained = 0
	p.auraHitStyle = model.AuraHitStyleNone
	p.buffs.Tick()
	// Age the companion combat signals (chunk 6); the refs stay until
	// re-stamped, the getters gate on the remaining window.
	if p.attackTargetTicks > 0 {
		p.attackTargetTicks--
	}
	if p.attackerTicks > 0 {
		p.attackerTicks--
	}
}

func (p *player) MobTouches(e model.MobEntity, factors mobs.Factors) {
	// Defend signal (chunk 6): any mob hitting this player is "attacking the
	// owner" for its companion, resisted or not.
	if c, ok := e.(model.Combatant); ok {
		p.attacker = c
		p.attackerTicks = combatSignalWindowTicks
	}
	p.takeDamage(model.Damage{HP: factors.Damage, Tags: factors.DamageTags}, model.StatusEffectDamagedAmbient)
}

func (p *player) PlayerTouches(other model.PlayerEntity, damage model.Damage) {
	p.takeDamage(damage, model.StatusEffectDamagedAmbient)
}

func (p *player) Name() string {
	return p.name
}

// Faction: players are always player-aligned (plan-effect-foundations F8).
func (p *player) Faction() model.Faction {
	return model.FactionAligned
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
	p.xpGained += xp // floating XP number (roadmap item 11)

	level := p.levelForExperience(p.progression.Experience)
	if level < 1 {
		level = 1
	}
	p.progression.Level = level
	if level > previousLevel {
		p.PlayerVitalSigns.Health = p.MaxHealth() // heal to (new) full on level-up
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
	gained, required := p.LevelProgressXP()
	if required == 0 {
		return 1
	}

	fraction := float32(gained) / float32(required)
	if fraction > 1 {
		return 1
	}
	return fraction
}

// LevelProgressXP is the absolute counterpart of LevelProgressFraction: XP
// gained within the current level and the level's total span. Serialized as
// Character.xp_in_level / xp_for_next_level for the HUD's XP-bar text.
func (p *player) LevelProgressXP() (gained, required uint64) {
	level := p.progression.Level
	levelStartXP := p.totalXPForLevel(level)
	levelEndXP := p.totalXPForLevel(level + 1)
	if levelEndXP <= levelStartXP {
		return 0, 0
	}

	required = levelEndXP - levelStartXP
	if p.progression.Experience < levelStartXP {
		return 0, required
	}
	gained = p.progression.Experience - levelStartXP
	if gained > required {
		gained = required
	}
	return gained, required
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
	// A milestone discovery can newly satisfy a recipe (Phase 9).
	p.ApplyRecipeCascade()
}

// ApplyRecipeCascade runs the combination recipes against the current spellbook
// and discovers any newly-satisfied results (Phase 9). Call it after any event
// that can newly satisfy a recipe — a milestone/kill discovery or a skill-level
// raise. The client turns each fresh discovery into the unlock glow via its
// spellbook diff, so no wire event is needed.
func (p *player) ApplyRecipeCascade() {
	if p.recipes == nil {
		return
	}
	for _, id := range skills.ApplyRecipes(p.skills, p.recipes) {
		slog.Info("combination unlock", slog.String("player", p.name), slog.Int("skillID", int(id)))
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
