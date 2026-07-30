package main

import (
	"flag"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/core"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/encounter"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/prop"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"
	"github.com/RoteRiesenRobbe/aura/pkg/logging"
	"golang.org/x/crypto/acme/autocert"
)

func main() {
	logging.SetupLogging()

	var dev, help bool
	var contentDir, zoneName, profileAddr string
	flag.StringVar(&profileAddr, "profile", "", "serve net/http/pprof + /tickstats on this address for capacity checks (e.g. :6060); off by default, see devops/loadtest.md")
	flag.BoolVar(&dev, "dev", false, "Serve frontend directly")
	flag.BoolVar(&help, "help", false, "Show usage help")
	flag.StringVar(&contentDir, "content", "", "Load items/mobs/skills/recipes/zones/props from this api/-layout directory instead of the embedded copies (e.g. ../api); skips cp-defs + rebuild for content edits")
	flag.StringVar(&zoneName, "zone", "", "Select which zone to load by file stem (e.g. 'scaffold' for scaffold.json); overrides game.zone in conf.json. Empty loads the sole zone when only one exists")
	flag.Parse()
	if profileAddr != "" {
		startProfileServer(profileAddr)
	}
	if help {
		flag.Usage()
		os.Exit(1)
	}

	content := embeddedContent()
	contentSource := "embedded"
	if contentDir != "" {
		var err error
		if content, err = diskContent(contentDir); err != nil {
			slog.Error("failed to open content directory", slog.Any("err", err))
			panic(err)
		}
		contentSource = contentDir
	}
	// The boot log states the content source so a stale-server/stale-content
	// mixup is visible at a glance (see the testing gotcha in CLAUDE.md).
	slog.Info("Loading content", slog.String("source", contentSource))

	config := loadConf()
	// Factions load FIRST: since plan-faction-flips chunk 2 a skill may author
	// a targetFactions allowlist, resolved to bits at load (D8 — the faction
	// registry is boot-only, so names have exactly one chance to become bits).
	// Factions themselves depend on nothing.
	factionsRegistry := loadFactions(content.factions)
	skillsRegistry := loadSkills(content.skills, factionsRegistry)
	levelCurve := config.LevelCurve()
	mobsRegistry := loadMobs(skillsRegistry, factionsRegistry, levelCurve, content.mobs)
	milestoneUnlocks := loadMilestoneUnlocks(content.milestones, skillsRegistry)
	recipeRegistry := loadRecipes(content.recipes, skillsRegistry)
	questsRegistry := loadQuests(content.quests, mobsRegistry)
	propsRegistry := loadProps(content.props)
	// -zone flag overrides the game.zone config default.
	if zoneName == "" {
		zoneName = config.Game.Zone
	}
	zone := loadZone(content.zones, zoneName, mobsRegistry, propsRegistry)

	tokens := loadOrCreateTokens("./tokens.list")
	slog.Info("👮‍♀️ read tokens", slog.Int("token_count", len(tokens)))

	// new game
	// For different seeds see:
	// https://docs.google.com/spreadsheets/d/13EbpERJ05GpjUUXOp2zU4Od2FGqymeMV0F278_eBIcQ/edit#gid=0
	var seed int64 = 0xDEADBEEF + 4
	rnd := rand.New(rand.NewSource(seed))

	// The world seed above stays fixed (reproducible spawn positions); mob HP
	// variance + drop rolls instead ride a per-process salt so a fresh server
	// no longer re-rolls the same drops every restart (backlog §27.2.2). Logged
	// so a run's rolls can be reproduced if ever needed.
	mobSalt := time.Now().UnixNano()
	mob.SeedProcess(mobSalt)
	slog.Info("🎲 mob RNG salt", slog.Int64("salt", mobSalt))

	// Boot-time tuning knobs that live behind package-level setters rather than
	// on an entity/system (backlog §27.2.3 + §25 B). Both take effect before any
	// mob spawns or any hit is composed; both fall back to their built-in
	// defaults when the conf block is absent.
	mob.SetHealthGainTick(config.Game.Mob.HealthGainTick)
	mob.SetWalkingSpeedPerTick(config.Game.Mob.WalkingSpeedPerTick)
	combat := cfg.CombatConfig{
		DefaultCritFactor:  config.Game.Combat.DefaultCritFactor,
		HealerThreatFactor: config.Game.Combat.HealerThreatFactor,
		PresenceRadius:     config.Game.Combat.PresenceRadius,
	}
	sys.SetCombatFactors(combat)
	// Logged post-normalization: these live behind setters rather than in the
	// GameConfig dump, so this is the only place an operator can see what a
	// missing conf block actually resolved to.
	slog.Info("🎚️ tuning knobs",
		slog.Float64("mob.healthGainTick", float64(mob.HealthGainTick())),
		slog.Float64("mob.walkingSpeedPerTick", float64(mob.WalkingSpeedPerTick())),
		slog.Float64("combat.defaultCritFactor", float64(combat.CritFactor())),
		slog.Float64("combat.healerThreatFactor", float64(combat.HealerThreat())),
		slog.Float64("combat.presenceRadius", float64(combat.PresenceRange())))

	g, err := core.NewGameWith(
		rnd.Int63(),
		core.Config(config),
		core.Registries(mobsRegistry),
		core.SkillRegistry(skillsRegistry),
		core.MilestoneUnlocks(milestoneUnlocks),
		core.Recipes(recipeRegistry),
		core.QuestRegistry(questsRegistry),
		core.Tokens(tokens),
		core.Bounds(zone.Bounds.Width, zone.Bounds.Height),
		core.ZoneName(zone.ID),
		core.Spawns(zone.Spawns),
	)
	if err != nil {
		panic(err)
	}

	// The world is populated from the authored zone: mob spawn points flow to
	// the MobSystem via core.Spawns (chunk 4); props are placed once here as
	// static entities (chunk 3). Procedural generation is gone.
	for _, p := range zone.Props {
		pos := phy.Vec2f{X: p.X, Y: p.Y}
		entityType := model.EntityType(p.Def.EntityType)
		if p.Def.Body.IsRect() {
			g.AddEntity(prop.NewRect(entityType, pos, p.Def.Body.Width, p.Def.Body.Height, p.BlocksMovement))
		} else {
			g.AddEntity(prop.New(entityType, pos, p.Def.Body.Radius, p.BlocksMovement))
		}
	}

	// Fixed world campfires (atmosphere & recovery chunk 2): permanent aligned
	// heal fixtures placed Go-side like props — NOT zone spawns (they never
	// die, need no respawn machinery, and chunk 4 reads them as respawn
	// anchors). Def-level aligned authoring is impossible by design (the mob
	// loader rewrites aligned→hostile), so the side is joined
	// post-construction via Align() — the spawnSummon pattern.
	if len(zone.Campfires) > 0 {
		campfireDef, err := mobsRegistry.GetByName("Campfire")
		if err != nil {
			slog.Error("zone places campfires but no Campfire mob is defined", slog.String("zone", zone.ID), slog.Any("err", err))
			panic(err)
		}
		anchors := make([]sys.CampfireAnchor, 0, len(zone.Campfires))
		safeZones := make([]mob.SafeZone, 0, len(zone.Campfires))
		for _, c := range zone.Campfires {
			m := mob.NewMob(campfireDef, g.Config().MobChaseIntoAuraMargin, nil)
			m.SetPosition(phy.Vec2f{X: c.X, Y: c.Y})
			m.Align()
			// Respawn anchor (chunk 4): bind radius = heal radius × factor, so
			// players can heal at the edge of the fire without binding to it.
			// Streamed as Mob.dwell_radius — the client draws the bind circle
			// from the wire, keeping the factor server-side only.
			m.SetDwellRadius(m.AuraRadius() * sys.CampfireDwellRadiusFactor)
			g.AddEntity(m)
			anchors = append(anchors, sys.CampfireAnchor{
				Pos:           m.Position(),
				DwellRadius:   m.DwellRadius(),
				StartingSpawn: c.StartingSpawn,
			})
			// Hard safe-zone (playtest-1 feedback Pass A, decision 4): hostile
			// mobs never enter the fire's visible heal ring and break off the
			// chase at its edge. Radius = the heal radius the client already
			// draws, so the promise is exactly what the player sees.
			safeZones = append(safeZones, mob.SafeZone{
				Center: m.Position(),
				Radius: m.AuraRadius() * mob.CampfireSafeRadiusFactor,
			})
		}
		mob.SetSafeZones(safeZones)
		sink, ok := g.(sys.CampfireAnchorSink)
		if !ok {
			panic("game does not accept campfire anchors")
		}
		sink.SetCampfireAnchors(anchors)
		slog.Info("placed campfires",
			slog.Int("count", len(zone.Campfires)),
			slog.String("zone", zone.ID),
			slog.Float64("safeRadius", float64(safeZones[0].Radius)))
	}

	// Encounters are Go-registered per zone (chunk 9 decision: no zone-schema
	// field until the content pass needs designer-authored bindings). The
	// smoke encounter is throwaway spine-verification content.
	if zone.ID == "proving-grounds" {
		r, ok := g.(encounter.Registrar)
		if !ok {
			panic("game does not accept encounters")
		}
		r.RegisterEncounter(encounter.NewSmokeEncounter())
		slog.Info("registered smoke encounter", slog.String("zone", zone.ID))
	}

	// The Orc Warlord (content pass C6, §B): WHERE it plays out comes from
	// the zone's anchors (editor-movable), WHAT happens is the Go script. A
	// missing anchor is a content bug — abort the boot loudly, never fall
	// back to a silent default position.
	if zone.ID == "world" {
		r, ok := g.(encounter.Registrar)
		if !ok {
			panic("game does not accept encounters")
		}
		anchor := func(name string) phy.Vec2f {
			x, y, found := zone.AnchorPos(name)
			if !found {
				panic(fmt.Sprintf("zone %q: missing anchor %q (Orc Warlord encounter)", zone.ID, name))
			}
			return phy.Vec2f{X: x, Y: y}
		}
		r.RegisterEncounter(encounter.NewOrcWarlordEncounter(
			anchor(encounter.WarlordAnchorHome),
			anchor(encounter.WarlordAnchorBanner1),
			anchor(encounter.WarlordAnchorBanner2),
			anchor(encounter.WarlordAnchorWaveMouth),
		))
		slog.Info("registered orc warlord encounter", slog.String("zone", zone.ID))
	}

	//---- set up server

	// Sidecar endpoints, served on the same mux as /game. /skills and /mobs are
	// content catalogs — the parsed registries as JSON, the client's single
	// source of the per-definition metadata it renders (skill tooltips,
	// plan-ui-polish chunk 1; level-tinted nameplates, feedback pass C item 2),
	// static after boot. /skills also carries the level curve, without which
	// tooltips can only render the level-1 baseline (skills.Catalog).
	// /players is the one live one.
	skillsHandler, err := skills.CatalogHandler(skillsRegistry, levelCurve)
	if err != nil {
		slog.Error("failed to build skill catalog", slog.Any("error", err))
		panic(err)
	}
	mobsHandler, err := mobs.CatalogHandler(mobsRegistry)
	if err != nil {
		slog.Error("failed to build mob catalog", slog.Any("error", err))
		panic(err)
	}
	// /quests is the journal's words (plan-quests.md C3, D14): the wire carries
	// only quest + stage ids, so titles and diary prose come from here. A minimal
	// projection — nothing about objectives, the stage graph or rewards.
	questsHandler, err := quests.CatalogHandler(questsRegistry)
	if err != nil {
		slog.Error("failed to build quest catalog", slog.Any("error", err))
		panic(err)
	}
	counter, ok := g.(playerCounter)
	if !ok {
		panic("game does not report a player count")
	}
	sidecars := map[string]http.Handler{
		"/skills":  skillsHandler,
		"/mobs":    mobsHandler,
		"/quests":  questsHandler,
		"/players": playersHandler(counter),
	}

	if err := bootHttp(g.Handler(), sidecars, config.Server, dev); err != nil {
		slog.Error("failed to boot HTTP server", slog.Any("error", err))
		panic(err)
	}

	g.Loop()
}

func bootHttp(gameHandler http.Handler, sidecars map[string]http.Handler, cfg cfg.Server, dev bool) error {
	if cfg.TlsHost != "" {
		return bootTlsServer(gameHandler, sidecars, cfg, dev)
	} else {
		bootServer(gameHandler, sidecars, cfg, dev)
	}
	return nil
}

func bootTlsServer(gameHandler http.Handler, sidecars map[string]http.Handler, cfg cfg.Server, dev bool) error {
	host := cfg.TlsHost

	port := cfg.Port
	if port != 0 && port != 443 {
		slog.Warn("ignoring `port` config, TLS defaults to 443", slog.Int("configured_port", port))
	}

	hosts := []string{host}

	slog.Info("🦄 Booting TLS game-server", slog.String("addr", fmt.Sprintf("https://%s/game", host)), slog.Any("hosts", hosts))

	cacheDir, err := determineCacheDir()
	if err != nil {
		return err
	}

	cacheDir = filepath.Join(cacheDir, "aurad")

	slog.Info("🔐 Requesting ACME certificate", slog.Any("hosts", hosts), slog.String("cache_dir", cacheDir))

	m := &autocert.Manager{
		Cache:      autocert.DirCache(cacheDir),
		Prompt:     autocert.AcceptTOS,
		Email:      "dev@berryhunter.io",
		HostPolicy: autocert.HostWhitelist(hosts...),
	}

	mux := http.NewServeMux()

	mux.Handle("/game", gameHandler)
	for path, handler := range sidecars {
		mux.Handle(path, handler)
	}

	if dev {
		slog.Info("🔥 dev server running", slog.String("url", fmt.Sprintf("https://%s?wsUrl=wss://%s/game", host, host)))
		mux.Handle("/", frontendHandler(cfg.FrontendDir))
	} else {
		// 'ping' endpoint
		mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
			if req.URL.Path != "/" {
				http.NotFound(w, req)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	}

	s := &http.Server{
		Addr:      ":https",
		TLSConfig: m.TLSConfig(),
		Handler:   mux,
	}

	// Port 80 companion: serves the ACME http-01 challenge and redirects
	// everything else to https, so bare http:// links reach the game.
	go http.ListenAndServe(":http", m.HTTPHandler(nil))

	// start server
	go s.ListenAndServeTLS("", "")

	return nil
}

func determineCacheDir() (string, error) {
	// explicit systemd cache directory
	cacheDir := os.Getenv("CACHE_DIRECTORY")
	if cacheDir != "" {
		return cacheDir, nil
	}

	return os.UserCacheDir()
}

func bootServer(gameHandler http.Handler, sidecars map[string]http.Handler, cfg cfg.Server, dev bool) {
	port := cfg.Port

	slog.Info("🦄 Booting game-server", slog.String("addr", fmt.Sprintf(":%d/game", port)))
	addr := fmt.Sprintf(":%d", port)

	mux := http.NewServeMux()
	mux.Handle("/game", gameHandler)
	for path, handler := range sidecars {
		mux.Handle(path, handler)
	}

	if dev {
		slog.Info("🔥 dev server running", slog.String("url", fmt.Sprintf("http://localhost:%d?wsUrl=ws://localhost:%d/game", port, port)))
		mux.Handle("/", frontendHandler(cfg.FrontendDir))
	} else {
		// 'ping' endpoint for liveness probe
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/" {
				http.NotFound(w, r)
				return
			}
			w.WriteHeader(204)
		})
	}
	// start server
	go http.ListenAndServe(addr, mux)
}

func frontendHandler(fsPath string) http.Handler {
	frontendPath, err := filepath.Abs(fsPath)
	if err != nil {
		slog.Error("failed to serve frontend", slog.Any("err", err))
		panic(err)
	}
	slog.Info("🕸️ serving frontend", slog.String("path", frontendPath))
	return http.FileServer(http.Dir(frontendPath))
}
