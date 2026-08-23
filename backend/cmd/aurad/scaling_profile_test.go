package main

// scaling_profile_test.go — a THROWAWAY profiling harness, not part of the
// regular suite (it skips unless AURA_SCALING_PROFILE=1). It boots the real
// 16-system world from the real api/ content at scaled entity density
// (1x/2x/3x/4x/10x), ticks it headlessly, and reports per-system time,
// allocation pressure, viewport-visible entity counts, snapshot bytes and
// entity-removal (churn) cost as JSON on stdout / AURA_SCALING_OUT.
//
// Two modes per multiplier:
//   - density: fixed 144x72 bounds, cloned props/spawns jittered nearby
//   - area:    world tiled MxN (constant density, growing world)

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/EngoEngine/ecs"
	"github.com/google/uuid"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/core"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/prop"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// countingClient is a model.Client that swallows everything and counts the
// bytes the NetSystem sends it.
type countingClient struct {
	id    uuid.UUID
	bytes int64
	sends int64
}

func (c *countingClient) NextInput() *model.PlayerInput               { return nil }
func (c *countingClient) NextJoin() *model.Join                       { return nil }
func (c *countingClient) NextCheat() *model.Cheat                     { return nil }
func (c *countingClient) NextChatMessage() *model.ChatMessage         { return nil }
func (c *countingClient) NextEquip() *model.EquipSkill                { return nil }
func (c *countingClient) NextSpendSkillPoint() *model.SpendSkillPoint { return nil }
func (c *countingClient) NextRespawn() *model.Respawn                 { return nil }
func (c *countingClient) NextInteract() *model.Interact               { return nil }
func (c *countingClient) NextAbandonQuest() *model.AbandonQuest       { return nil }
func (c *countingClient) NextRespec() *model.Respec                   { return nil }
func (c *countingClient) NextUseUtility() *model.UseUtility           { return nil }
func (c *countingClient) NextStartFlight() *model.StartFlight         { return nil }
func (c *countingClient) SendMessage(b []byte) error {
	c.bytes += int64(len(b))
	c.sends++
	return nil
}
func (c *countingClient) SendUnlock(uint64, string) error { return nil }
func (c *countingClient) SendJournal(string) error        { return nil }
func (c *countingClient) Close()                          {}
func (c *countingClient) UUID() uuid.UUID                 { return c.id }

type scaleResult struct {
	Mode       string  `json:"mode"`
	Multiplier int     `json:"multiplier"`
	BoundsW    float32 `json:"boundsW"`
	BoundsH    float32 `json:"boundsH"`
	Props      int     `json:"props"`
	Spawns     int     `json:"spawns"`
	Players    int     `json:"players"`

	SpawnTickMs float64 `json:"spawnTickMs"` // the first tick (initial population)

	TickMeanMs float64 `json:"tickMeanMs"`
	TickP50Ms  float64 `json:"tickP50Ms"`
	TickP95Ms  float64 `json:"tickP95Ms"`
	TickMaxMs  float64 `json:"tickMaxMs"`

	PerSystemUs map[string]float64 `json:"perSystemUs"` // mean per tick

	AllocKBPerTick   float64 `json:"allocKBPerTick"`
	MallocsPerTick   float64 `json:"mallocsPerTick"`
	NumGC            uint32  `json:"numGC"`
	GCPauseTotalMs   float64 `json:"gcPauseTotalMs"`
	MeasuredTicks    int     `json:"measuredTicks"`
	MeasuredWallSecs float64 `json:"measuredWallSecs"`

	AvgVisiblePerPlayer  float64 `json:"avgVisiblePerPlayer"`
	SnapshotBytesPerTick float64 `json:"snapshotBytesPerPlayerPerTick"`

	RemoveEntityUs float64 `json:"removeEntityUs"` // churn micro-measure (add+remove a mob)
}

func TestScalingProfile(t *testing.T) {
	if os.Getenv("AURA_SCALING_PROFILE") == "" {
		t.Skip("profiling harness; set AURA_SCALING_PROFILE=1 to run")
	}

	content, err := diskContent("../../../api")
	if err != nil {
		t.Fatal(err)
	}
	config, err := cfg.ReadConfig("conf.default.json")
	if err != nil {
		t.Fatal(err)
	}

	factionsRegistry := loadFactions(content.factions)
	skillsRegistry := loadSkills(content.skills, factionsRegistry)
	levelCurve := config.LevelCurve()
	mobsRegistry := loadMobs(skillsRegistry, factionsRegistry, levelCurve, content.mobs)
	milestoneUnlocks := loadMilestoneUnlocks(content.milestones, skillsRegistry)
	recipeRegistry := loadRecipes(content.recipes, skillsRegistry)
	questsRegistry := loadQuests(content.quests, mobsRegistry)
	propsRegistry := loadProps(content.props)

	// Fixed process-level knobs, once, like main().
	mob.SeedProcess(12345)
	mob.SetHealthGainTick(config.Game.Mob.HealthGainTick)
	mob.SetWalkingSpeedPerTick(config.Game.Mob.WalkingSpeedPerTick)
	sys.SetCombatFactors(cfg.CombatConfig{
		DefaultCritFactor:  config.Game.Combat.DefaultCritFactor,
		HealerThreatFactor: config.Game.Combat.HealerThreatFactor,
		PresenceRadius:     config.Game.Combat.PresenceRadius,
	})

	// The lowest-level milestone skill is the players' active aura.
	var playerAura *skills.SkillDefinition
	for _, u := range milestoneUnlocks {
		if playerAura == nil || u.Level < 1 {
			playerAura = u.Skill
		}
	}
	if playerAura == nil {
		t.Fatal("no milestone unlock to use as the player aura")
	}
	t.Logf("player aura: %s", playerAura.Name)

	type runSpec struct {
		mode string
		mult int
	}
	runs := []runSpec{
		{"density", 1},
		{"density", 2}, {"density", 3}, {"density", 4}, {"density", 10},
		{"area", 2}, {"area", 3}, {"area", 4}, {"area", 10},
	}
	// AURA_SCALING_RUNS="density:10,area:2" narrows the sweep (for pprof runs).
	if filter := os.Getenv("AURA_SCALING_RUNS"); filter != "" {
		var picked []runSpec
		for _, r := range runs {
			if strings.Contains(filter, fmt.Sprintf("%s:%d", r.mode, r.mult)) {
				picked = append(picked, r)
			}
		}
		runs = picked
	}

	var results []scaleResult
	for _, r := range runs {
		zone := loadZone(content.zones, "world", mobsRegistry, propsRegistry)
		res := runScale(t, config, mobsRegistry, skillsRegistry, milestoneUnlocks,
			recipeRegistry, questsRegistry, zone, playerAura, r.mode, r.mult)
		results = append(results, res)
		b, _ := json.Marshal(res)
		t.Logf("RESULT %s", b)
	}

	out, _ := json.MarshalIndent(results, "", "  ")
	if path := os.Getenv("AURA_SCALING_OUT"); path != "" {
		if err := os.WriteFile(path, out, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	fmt.Printf("SCALING_RESULTS_JSON\n%s\n", out)
}

// scaleContent returns props/spawns/campfire-offset/bounds for a mode+multiplier.
func scaleContent(zone *world.Zone, mode string, mult int, rnd *rand.Rand) (props []world.Prop, spawns []world.Spawn, tile0 phy.Vec2f, w, h float32) {
	w, h = zone.Bounds.Width, zone.Bounds.Height

	if mode == "density" || mult == 1 {
		props = append(props, zone.Props...)
		spawns = append(spawns, zone.Spawns...)
		margin := float32(1.5)
		clampX := func(x float32) float32 {
			return float32(math.Max(float64(-w/2+margin), math.Min(float64(w/2-margin), float64(x))))
		}
		clampY := func(y float32) float32 {
			return float32(math.Max(float64(-h/2+margin), math.Min(float64(h/2-margin), float64(y))))
		}
		for k := 1; k < mult; k++ {
			for _, p := range zone.Props {
				dx := (rnd.Float32() - 0.5) * 8
				dy := (rnd.Float32() - 0.5) * 8
				c := p
				c.X, c.Y = clampX(p.X+dx), clampY(p.Y+dy)
				props = append(props, c)
			}
			for _, s := range zone.Spawns {
				dx := (rnd.Float32() - 0.5) * 8
				dy := (rnd.Float32() - 0.5) * 8
				c := s
				c.X, c.Y = clampX(s.X+dx), clampY(s.Y+dy)
				if len(s.Waypoints) > 0 {
					wp := make([]world.Waypoint, len(s.Waypoints))
					for i, p := range s.Waypoints {
						wp[i] = world.Waypoint{X: clampX(p.X + dx), Y: clampY(p.Y + dy)}
					}
					c.Waypoints = wp
				}
				spawns = append(spawns, c)
			}
		}
		return props, spawns, phy.Vec2f{}, w, h
	}

	// area mode: tile the zone into a cols x rows grid of mult copies.
	var cols, rows int
	switch mult {
	case 2:
		cols, rows = 2, 1
	case 3:
		cols, rows = 3, 1
	case 4:
		cols, rows = 2, 2
	case 10:
		cols, rows = 5, 2
	default:
		cols, rows = mult, 1
	}
	W, H := w*float32(cols), h*float32(rows)
	tileIdx := 0
	for row := 0; row < rows; row++ {
		for col := 0; col < cols; col++ {
			dx := (float32(col) - float32(cols-1)/2) * w
			dy := (float32(row) - float32(rows-1)/2) * h
			if tileIdx == 0 {
				tile0 = phy.Vec2f{X: dx, Y: dy}
			}
			for _, p := range zone.Props {
				c := p
				c.X, c.Y = p.X+dx, p.Y+dy
				props = append(props, c)
			}
			for _, s := range zone.Spawns {
				c := s
				c.X, c.Y = s.X+dx, s.Y+dy
				if len(s.Waypoints) > 0 {
					wp := make([]world.Waypoint, len(s.Waypoints))
					for i, p := range s.Waypoints {
						wp[i] = world.Waypoint{X: p.X + dx, Y: p.Y + dy}
					}
					c.Waypoints = wp
				}
				spawns = append(spawns, c)
			}
			tileIdx++
		}
	}
	return props, spawns, tile0, W, H
}

func runScale(t *testing.T, config *cfg.Config,
	mobsRegistry mobs.Registry, skillsRegistry skills.Registry,
	milestoneUnlocks []skills.MilestoneUnlock, recipeRegistry skills.RecipeRegistry,
	questsRegistry quests.Registry, zone *world.Zone,
	playerAura *skills.SkillDefinition, mode string, mult int) scaleResult {

	rnd := rand.New(rand.NewSource(0xC0FFEE))
	props, spawns, tile0, w, h := scaleContent(zone, mode, mult, rnd)

	g, err := core.NewGameWith(
		rnd.Int63(),
		core.Config(config),
		core.Registries(mobsRegistry),
		core.SkillRegistry(skillsRegistry),
		core.MilestoneUnlocks(milestoneUnlocks),
		core.Recipes(recipeRegistry),
		core.QuestRegistry(questsRegistry),
		core.Tokens([]string{"bench"}),
		core.Bounds(w, h),
		core.ZoneName(zone.ID),
		core.Spawns(spawns),
	)
	if err != nil {
		t.Fatal(err)
	}

	for i := range props {
		g.AddEntity(prop.FromZone(&props[i]))
	}

	// Campfires: originals only (tile 0 in area mode), exactly like main().
	campfireDef, err := mobsRegistry.GetByName("Campfire")
	if err != nil {
		t.Fatal(err)
	}
	anchors := make([]sys.CampfireAnchor, 0, len(zone.Campfires))
	safeZones := make([]mob.SafeZone, 0, len(zone.Campfires))
	for _, c := range zone.Campfires {
		m := mob.NewMob(campfireDef, g.Config().MobChaseIntoAuraMargin, nil)
		m.SetPosition(phy.Vec2f{X: c.X + tile0.X, Y: c.Y + tile0.Y})
		m.Align()
		m.SetDwellRadius(m.AuraRadius() * sys.CampfireDwellRadiusFactor)
		g.AddEntity(m)
		anchors = append(anchors, sys.CampfireAnchor{
			ID: c.ID, Pos: m.Position(), DwellRadius: m.DwellRadius(), StartingSpawn: c.StartingSpawn,
		})
		safeZones = append(safeZones, mob.SafeZone{
			Center: m.Position(), Radius: m.AuraRadius() * mob.CampfireSafeRadiusFactor,
		})
	}
	mob.SetSafeZones(safeZones)
	if sink, ok := g.(sys.CampfireAnchorSink); ok {
		sink.SetCampfireAnchors(anchors)
	}

	// Players: a fixed dispersed set, god-mode, active aura. Constant across
	// multipliers (density mode) / spread across the grown world (area mode)
	// so per-player local conditions stay comparable.
	const nPlayers = 10
	type benchPlayer struct {
		entity model.PlayerEntity
		client *countingClient
	}
	players := make([]benchPlayer, 0, nPlayers)
	for i := 0; i < nPlayers; i++ {
		cl := &countingClient{id: uuid.New()}
		pl := player.New(g, cl, fmt.Sprintf("bench-%d", i))
		col := i % 5
		row := i / 5
		px := (float32(col) - 2) * (w * 0.19)
		py := (float32(row) - 0.5) * (h * 0.5)
		pl.SetPosition(phy.Vec2f{X: px, Y: py})
		pl.SkillComponent().EquipAura(0, playerAura, 1)
		pl.SkillComponent().Discover(playerAura.ID)
		pl.SkillComponent().SetActiveAura(0)
		if god, ok := any(pl).(interface{ SetGodmode(bool) }); ok {
			god.SetGodmode(true)
		} else {
			t.Fatal("player has no SetGodmode")
		}
		g.AddEntity(pl)
		players = append(players, benchPlayer{entity: pl, client: cl})
	}

	sysHolder, ok := g.(interface{ Systems() []ecs.System })
	if !ok {
		t.Fatal("game does not expose Systems()")
	}
	systems := sysHolder.Systems()

	// g.Tick is an exported field on the unexported core.game; two systems
	// read it (roster cadence, respawns), so keep it honest via reflection.
	gv := reflect.ValueOf(g).Elem()
	tickField := gv.FieldByName("Tick")
	if !tickField.IsValid() || !tickField.CanSet() {
		t.Fatal("cannot reach game.Tick")
	}

	var tickNo uint64
	stepTimed := func(perSys []time.Duration) time.Duration {
		var total time.Duration
		for i, s := range systems {
			start := time.Now()
			s.Update(33.0)
			d := time.Since(start)
			if perSys != nil {
				perSys[i] += d
			}
			total += d
		}
		tickNo++
		tickField.SetUint(tickNo)
		return total
	}

	// First tick = initial population of every spawn point.
	spawnTick := stepTimed(nil)

	const warmupTicks = 150
	for i := 0; i < warmupTicks; i++ {
		stepTimed(nil)
	}

	measureTicks := 450
	if mode == "density" && mult >= 10 {
		measureTicks = 250
	}

	perSys := make([]time.Duration, len(systems))
	tickDur := make([]time.Duration, 0, measureTicks)
	var visibleSum int64
	for _, p := range players {
		p.client.bytes, p.client.sends = 0, 0
	}

	runtime.GC()
	var m0, m1 runtime.MemStats
	runtime.ReadMemStats(&m0)
	wallStart := time.Now()

	for i := 0; i < measureTicks; i++ {
		tickDur = append(tickDur, stepTimed(perSys))
		for _, p := range players {
			visibleSum += int64(len(p.entity.Viewport().Collisions()))
		}
	}

	wall := time.Since(wallStart)
	runtime.ReadMemStats(&m1)

	// Churn micro-measure: add a mob, then time its removal through the full
	// fan-out (all systems + the phy.Space full-sweep purge).
	const churnReps = 20
	var churnTotal time.Duration
	for i := 0; i < churnReps; i++ {
		m := mob.NewMob(campfireDef, g.Config().MobChaseIntoAuraMargin, nil)
		m.SetPosition(phy.Vec2f{X: w/2 - 3, Y: h/2 - 3})
		g.AddEntity(m)
		start := time.Now()
		g.RemoveEntity(m.Basic())
		churnTotal += time.Since(start)
	}

	sorted := append([]time.Duration(nil), tickDur...)
	sort.Slice(sorted, func(a, b int) bool { return sorted[a] < sorted[b] })
	var tickSum time.Duration
	for _, d := range tickDur {
		tickSum += d
	}
	pct := func(p float64) float64 {
		idx := int(p * float64(len(sorted)-1))
		return float64(sorted[idx].Microseconds()) / 1000
	}

	perSystemUs := map[string]float64{}
	for i, s := range systems {
		perSystemUs[fmt.Sprintf("%T", s)] += float64(perSys[i].Microseconds()) / float64(measureTicks)
	}

	var snapBytes int64
	for _, p := range players {
		snapBytes += p.client.bytes
	}

	return scaleResult{
		Mode: mode, Multiplier: mult, BoundsW: w, BoundsH: h,
		Props: len(props), Spawns: len(spawns), Players: nPlayers,
		SpawnTickMs: float64(spawnTick.Microseconds()) / 1000,
		TickMeanMs:  float64(tickSum.Microseconds()) / 1000 / float64(measureTicks),
		TickP50Ms:   pct(0.50), TickP95Ms: pct(0.95), TickMaxMs: pct(1.0),
		PerSystemUs:          perSystemUs,
		AllocKBPerTick:       float64(m1.TotalAlloc-m0.TotalAlloc) / 1024 / float64(measureTicks),
		MallocsPerTick:       float64(m1.Mallocs-m0.Mallocs) / float64(measureTicks),
		NumGC:                m1.NumGC - m0.NumGC,
		GCPauseTotalMs:       float64(m1.PauseTotalNs-m0.PauseTotalNs) / 1e6,
		MeasuredTicks:        measureTicks,
		MeasuredWallSecs:     wall.Seconds(),
		AvgVisiblePerPlayer:  float64(visibleSum) / float64(measureTicks) / float64(nPlayers),
		SnapshotBytesPerTick: float64(snapBytes) / float64(measureTicks) / float64(nPlayers),
		RemoveEntityUs:       float64(churnTotal.Microseconds()) / churnReps,
	}
}
