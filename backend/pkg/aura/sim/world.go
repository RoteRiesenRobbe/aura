package sim

import (
	"fmt"
	"math"
	"math/rand"
	"net/http"

	"github.com/EngoEngine/ecs"
	"github.com/google/uuid"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys/statuseffects"
)

// TicksPerSecond re-exports the game's tick rate for metric conversion.
const TicksPerSecond = constant.TicksPerSecond

// stepMillis is one fixed tick, mirroring core/game.go.
const stepMillis = 33.0

// World is one deterministic fight world: the real ECS systems in their
// real priority order (StatusEffects → Mob → Physics → Update → Skill), a
// real player and one or more real mobs, no net/websocket/scoreboard layer.
type World struct {
	game   *simGame
	Player model.PlayerEntity
	Mob    *mob.Mob // = Mobs[0]; the 1v1 read the chunk-1/2 call sites use
	Mobs   []*mob.Mob
}

// NewWorld builds the world for a scenario. All fight-relevant RNG (the
// mobs' spawn-HP rolls and the SkillSystem's variance/crit rolls) derives
// from seed, so the same (scenario, seed) pair replays the same fight. The
// mobs' own entity-ID-seeded rngs only drive behaviors a fight never reaches
// (idle wander rolls, kill-unlock rolls — no unlocks are declared).
func NewWorld(sc Scenario, seed int64) *World {
	packSize := sc.PackSize
	if packSize < 1 {
		packSize = 1
	}

	rng := rand.New(rand.NewSource(seed))
	// Fixed draw order — reordering these would silently change every result
	// under a given seed: mobSysSeed, skillSeed, then one spawn-HP roll per
	// mob in index order (a pack of 1 replays the chunk-1 sequence exactly).
	mobSysSeed := rng.Int63()
	skillSeed := rng.Int63()
	mobHPs := make([]vitals.VitalSign, packSize)
	for i := range mobHPs {
		mobHPs[i] = vitals.VitalSign(vitals.HP(vitals.RollVariance(sc.Mob.MaxHealth, sc.Mob.MaxHealthVariance, rng)))
	}

	regenTick := sc.RegenTick
	if regenTick <= 0 {
		regenTick = DefaultRegenTick
	}

	g := &simGame{
		entities: make(map[uint64]model.BasicEntity),
		config: &cfg.GameConfig{
			// [PLACEHOLDER] arena size; only the border wall reads it, and a
			// 1v1 at the center never touches the wall.
			Bounds:                 cfg.Bounds{Width: 60, Height: 40},
			MobChaseIntoAuraMargin: 0.05, // conf.default.json value
			PlayerConfig: cfg.PlayerConfig{
				// Out-of-combat regen, gated off during combat so it never
				// moves a fight — the chunk-4 chain runner's recovery knob.
				HealthGainTick: regenTick,
				BaseHealth:     sc.Player.MaxHealth,
				// The zero-value LevelCurve is neutral (f = 1 everywhere,
				// curve.F): the synthetic player is level 1 and stays there
				// (mob XP is 0), and the fixture generator (PlayerAt/MobAt)
				// models f by scaling the explicit numbers instead — the live
				// multiplier must not double-apply on top.
				LevelUpXPBase:         300,
				LevelUpXPGrowthFactor: 1.2,
				// Character-base crit (§4.3 v2) — the real SkillSystem reads
				// it off the player's config exactly like the live game.
				CritChance: sc.Player.CritChance,
			},
		},
		// The synthetic aura rides the start-loadout name player.New looks up
		// (Harvest — né TurnipPull — since the C1 peasant start) — the payload is still the
		// scenario's damage aura, only the lookup name follows the live game.
		registry: soloRegistry{sc.Player.Aura.definition(1, "Harvest")},
	}

	// The minimal real system set, added exactly like core.NewGameWith —
	// ecs.World orders them by priority (StatusEffects 101 → Mob 20 →
	// Physics 0 → Update -50 → Skill -65).
	p := sys.NewPhysicsSystem()
	g.AddSystem(p)

	wall := phy.NewInvAABB(phy.VEC2F_ZERO, g.config.Bounds.Width, g.config.Bounds.Height)
	wall.Shape().Layer = int(model.LayerBorderCollision)
	p.AddStaticBody(ecs.NewBasic(), wall)

	g.AddSystem(sys.NewMobSystem(g, mobSysSeed, nil, p.Space()))
	g.AddSystem(sys.NewUpdateSystem())

	sk := sys.NewSkillSystem(p.Space(), g)
	sk.SeedRNG(skillSeed)
	g.AddSystem(sk)

	g.AddSystem(statuseffects.NewStatusEffectsSystem())

	// The real player. Its skill registry holds exactly the synthetic aura
	// under the "Harvest" name.
	pl := player.New(g, nopClient{}, "sim-player")
	pl.SetPosition(phy.VEC2F_ZERO)
	// The start loadout is empty since triage item 11 (Harvest is now the
	// Farmer's teaching, not a spawn freebie), so the sim equips its synthetic
	// aura to slot 0 itself — the def the solo registry serves under "Harvest".
	harvest, err := g.Skills().GetByName("Harvest")
	if err != nil {
		panic(err) // the solo registry is built with this def — cannot happen
	}
	pl.SkillComponent().EquipAura(0, harvest, 1)
	pl.SkillComponent().Discover(harvest.ID)
	// Fresh spawns no longer auto-activate the start aura (PO 2026-07-17);
	// the sim's fighting player switches it on explicitly — TTD keeps
	// "nothing active" so an idle player does not fight back.
	if sc.PlayerAuraActive {
		pl.SkillComponent().SetActiveAura(0)
	}
	g.AddEntity(pl)

	// The real mobs, from synthetic definitions (one per mob — each def
	// carries that mob's rolled spawn-HP pool and variance 0). EntityType
	// "Dodo" only satisfies the wire-type lookup — nothing in a headless run
	// reads it. The pack spawns on an evenly-spaced ring of radius
	// StartDistance; mob 0 lands at (d, 0), exactly the 1v1 spawn. Mobs have
	// no mob-vs-mob collision, so the ring mainly synchronizes arrival.
	pack := make([]*mob.Mob, packSize)
	for i := range pack {
		def := &mobs.MobDefinition{
			ID:         mobs.MobID(1000 + i),
			Name:       "SimMob",
			EntityType: "Dodo",
			Factors: mobs.Factors{
				MaxHealth:            uint32(mobHPs[i]),
				Speed:                sc.Mob.Speed,
				FleeBelowHealthRatio: sc.Mob.FleeBelowHealthRatio,
				Experience:           0, // no XP: the player must not level mid-measurement
			},
			Body:   mobs.Body{Radius: sc.Mob.BodyRadius, AggroRadius: sc.Mob.AggroRadius},
			Skills: []mobs.MobSkill{{Def: sc.Mob.Aura.definition(skills.SkillID(2+i), "SimMobAura"), Level: 1}},
		}
		mb := mob.NewMob(def, g.config.MobChaseIntoAuraMargin, p.Space())
		angle := 2 * math.Pi * float64(i) / float64(packSize)
		mb.SetPosition(phy.Vec2f{
			X: sc.StartDistance * float32(math.Cos(angle)),
			Y: sc.StartDistance * float32(math.Sin(angle)),
		})
		g.AddEntity(mb)
		pack[i] = mb
	}

	return &World{game: g, Player: pl, Mob: pack[0], Mobs: pack}
}

// Step advances the world one fixed 33 ms tick.
func (w *World) Step() {
	w.game.World.Update(stepMillis)
	w.game.tick++
}

// simGame is the sim's model.Game: just enough for the systems and entity
// constructors the harness drives. No net layer, no join queue, no loop.
type simGame struct {
	ecs.World
	tick     uint64
	config   *cfg.GameConfig
	registry skills.Registry
	entities map[uint64]model.BasicEntity
}

var _ model.Game = (*simGame)(nil)

func (g *simGame) Ticks() uint64           { return g.tick }
func (g *simGame) Config() *cfg.GameConfig { return g.config }
func (g *simGame) Skills() skills.Registry { return g.registry }
func (g *simGame) Bounds() (float32, float32) {
	return g.config.Bounds.Width, g.config.Bounds.Height
}

// Items / Mobs are unused by the sim's system set (no crafting, no spawn
// effect in chunk 1); nil keeps an accidental dependency loud.
func (g *simGame) Items() items.Registry { return nil }
func (g *simGame) Mobs() mobs.Registry   { return nil }

// Handler / Loop belong to the net layer the sim deliberately does not
// stand up (plan §2).
func (g *simGame) Handler() http.Handler { panic("sim: no net layer") }
func (g *simGame) Loop()                 { panic("sim: the runner drives ticks via World.Step") }

func (g *simGame) GetEntity(id uint64) (model.BasicEntity, error) {
	e, ok := g.entities[id]
	if !ok {
		return nil, fmt.Errorf("entity with id %d not found", id)
	}
	return e, nil
}

// AddEntity mirrors core/game.go's routing for the two entity kinds a
// chunk-1 world contains.
func (g *simGame) AddEntity(e model.BasicEntity) {
	g.entities[e.Basic().ID()] = e

	switch v := e.(type) {
	case model.PlayerEntity:
		for _, system := range g.Systems() {
			switch s := system.(type) {
			case *sys.PhysicsSystem:
				s.AddEntity(v)
			case *sys.UpdateSystem:
				s.AddUpdateable(v)
			case *statuseffects.StatusEffectsSystem:
				s.Add(v, v)
			case *sys.SkillSystem:
				s.AddEntity(v)
			}
		}
	case model.MobEntity:
		for _, system := range g.Systems() {
			switch s := system.(type) {
			case *sys.PhysicsSystem:
				s.AddEntity(v)
			case *sys.MobSystem:
				s.AddEntity(v)
			case *statuseffects.StatusEffectsSystem:
				s.Add(v, v)
			case *sys.SkillSystem:
				s.AddEntity(v)
			}
		}
	default:
		panic(fmt.Sprintf("sim: unsupported entity type %T", e))
	}
}

func (g *simGame) RemoveEntity(e ecs.BasicEntity) {
	delete(g.entities, e.ID())
	g.World.RemoveEntity(e)
}

// soloRegistry is a skills.Registry over exactly one definition — the
// synthetic player aura, registered under the name player.New looks up.
type soloRegistry struct {
	def *skills.SkillDefinition
}

func (r soloRegistry) Get(id skills.SkillID) (*skills.SkillDefinition, error) {
	if id == r.def.ID {
		return r.def, nil
	}
	return nil, fmt.Errorf("skill ID %d not found", id)
}

func (r soloRegistry) GetByName(name string) (*skills.SkillDefinition, error) {
	if name == r.def.Name {
		return r.def, nil
	}
	return nil, fmt.Errorf("skill %q not found", name)
}

func (r soloRegistry) All() []*skills.SkillDefinition {
	return []*skills.SkillDefinition{r.def}
}

// nopClient satisfies model.Client for the headless player: no queued
// messages, sends vanish.
type nopClient struct{}

func (nopClient) NextInput() *model.PlayerInput               { return nil }
func (nopClient) NextJoin() *model.Join                       { return nil }
func (nopClient) NextCheat() *model.Cheat                     { return nil }
func (nopClient) NextChatMessage() *model.ChatMessage         { return nil }
func (nopClient) NextEquip() *model.EquipSkill                { return nil }
func (nopClient) NextSpendSkillPoint() *model.SpendSkillPoint { return nil }
func (nopClient) NextRespawn() *model.Respawn                 { return nil }
func (nopClient) SendMessage([]byte) error                    { return nil }
func (nopClient) Close()                                      {}
func (nopClient) UUID() uuid.UUID                             { return uuid.Nil }
