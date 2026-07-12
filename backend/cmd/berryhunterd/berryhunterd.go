package main

import (
	"flag"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"

	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"

	"github.com/trichner/berryhunter/pkg/berryhunter/core"
	"github.com/trichner/berryhunter/pkg/berryhunter/encounter"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/mob"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/prop"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/logging"
	"golang.org/x/crypto/acme/autocert"
)

func main() {
	logging.SetupLogging()

	var dev, help bool
	var contentDir, zoneName string
	flag.BoolVar(&dev, "dev", false, "Serve frontend directly")
	flag.BoolVar(&help, "help", false, "Show usage help")
	flag.StringVar(&contentDir, "content", "", "Load items/mobs/skills/recipes/zones/props from this api/-layout directory instead of the embedded copies (e.g. ../api); skips cp-defs + rebuild for content edits")
	flag.StringVar(&zoneName, "zone", "", "Select which zone to load by file stem (e.g. 'scaffold' for scaffold.json); overrides game.zone in conf.json. Empty loads the sole zone when only one exists")
	flag.Parse()
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
	itemsRegistry := loadItems(content.items)
	skillsRegistry := loadSkills(content.skills)
	factionsRegistry := loadFactions(content.factions)
	mobsRegistry := loadMobs(itemsRegistry, skillsRegistry, factionsRegistry, content.mobs)
	milestoneUnlocks := loadMilestoneUnlocks(skillsRegistry)
	recipeRegistry := loadRecipes(content.recipes, skillsRegistry)
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
	g, err := core.NewGameWith(
		rnd.Int63(),
		core.Config(config),
		core.Registries(itemsRegistry, mobsRegistry),
		core.SkillRegistry(skillsRegistry),
		core.MilestoneUnlocks(milestoneUnlocks),
		core.Recipes(recipeRegistry),
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
		g.AddEntity(prop.New(
			model.EntityType(p.Def.EntityType),
			phy.Vec2f{X: p.X, Y: p.Y},
			p.Def.Body.Radius,
			p.BlocksMovement,
		))
	}

	// Fixed world campfires (atmosphere & recovery chunk 2): permanent aligned
	// heal fixtures placed Go-side like props — NOT zone spawns (they never
	// die, need no respawn machinery, and chunk 4 reads them as respawn
	// anchors). Def-level aligned authoring is impossible by design (the mob
	// loader rewrites aligned→hostile), so the faction is set
	// post-construction — the spawnSummon pattern.
	if len(zone.Campfires) > 0 {
		campfireDef, err := mobsRegistry.GetByName("Campfire")
		if err != nil {
			slog.Error("zone places campfires but no Campfire mob is defined", slog.String("zone", zone.ID), slog.Any("err", err))
			panic(err)
		}
		for _, c := range zone.Campfires {
			m := mob.NewMob(campfireDef, g.Config().MobChaseIntoAuraMargin, nil)
			m.SetPosition(phy.Vec2f{X: c.X, Y: c.Y})
			m.SetFaction(model.FactionAligned)
			g.AddEntity(m)
		}
		slog.Info("placed campfires", slog.Int("count", len(zone.Campfires)), slog.String("zone", zone.ID))
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

	//---- set up server

	if err := bootHttp(g.Handler(), config.Server, dev); err != nil {
		slog.Error("failed to boot HTTP server", slog.Any("error", err))
		panic(err)
	}

	g.Loop()
}

func bootHttp(gameHandler http.Handler, cfg cfg.Server, dev bool) error {
	if cfg.TlsHost != "" {
		return bootTlsServer(gameHandler, cfg, dev)
	} else {
		bootServer(gameHandler, cfg, dev)
	}
	return nil
}

func bootTlsServer(gameHandler http.Handler, cfg cfg.Server, dev bool) error {
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

	cacheDir = filepath.Join(cacheDir, "berryhunterd")

	slog.Info("🔐 Requesting ACME certificate", slog.Any("hosts", hosts), slog.String("cache_dir", cacheDir))

	m := &autocert.Manager{
		Cache:      autocert.DirCache(cacheDir),
		Prompt:     autocert.AcceptTOS,
		Email:      "dev@berryhunter.io",
		HostPolicy: autocert.HostWhitelist(hosts...),
	}

	mux := http.NewServeMux()

	mux.Handle("/game", gameHandler)

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

func bootServer(gameHandler http.Handler, cfg cfg.Server, dev bool) {
	port := cfg.Port

	slog.Info("🦄 Booting game-server", slog.String("addr", fmt.Sprintf(":%d/game", port)))
	addr := fmt.Sprintf(":%d", port)

	mux := http.NewServeMux()
	mux.Handle("/game", gameHandler)

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
