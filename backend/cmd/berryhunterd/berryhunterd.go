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
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/prop"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/logging"
	"golang.org/x/crypto/acme/autocert"
)

func main() {
	logging.SetupLogging()

	var dev, help, chieftain bool
	var contentDir string
	flag.BoolVar(&dev, "dev", false, "Serve frontend directly")
	flag.BoolVar(&help, "help", false, "Show usage help")
	flag.BoolVar(&chieftain, "chieftain", false, "Also boot embedded chieftain")
	flag.StringVar(&contentDir, "content", "", "Load items/mobs/skills/recipes/zones/props from this api/-layout directory instead of the embedded copies (e.g. ../api); skips cp-defs + rebuild for content edits")
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
	mobsRegistry := loadMobs(itemsRegistry, skillsRegistry, content.mobs)
	milestoneUnlocks := loadMilestoneUnlocks(skillsRegistry)
	recipeRegistry := loadRecipes(content.recipes, skillsRegistry)
	propsRegistry := loadProps(content.props)
	zone := loadZone(content.zones, mobsRegistry, propsRegistry)

	tokens := loadOrCreateTokens("./tokens.list")
	slog.Info("👮‍♀️ read tokens", slog.Int("token_count", len(tokens)))

	// boot embedded chieftain
	var err error
	var chieftainHandler http.Handler
	if chieftain {
		port := 3443
		addr := fmt.Sprintf("127.0.0.1:%d", port)
		config.Chieftain.Addr = addr
		slog.Info("booting embedded chieftain", slog.String("server_addr", addr))

		dir, err := determineStateDir()
		if err != nil {
			slog.Error("cannot determine state directory for chieftain", slog.Any("error", err))
			panic(err)
		}
		chieftainServer, err := bootChieftain(dir, port)
		if err != nil {
			slog.Error("failed to boot HTTP server", slog.Any("error", err))
			panic(err)
		}
		defer chieftainServer.Close()

		config.Chieftain.CaCertFile = chieftainServer.Certificates.CACertFile
		config.Chieftain.ClientCertFile = chieftainServer.Certificates.ClientCertFile
		config.Chieftain.ClientKeyFile = chieftainServer.Certificates.ClientKeyFile

		chieftainHandler = chieftainServer.ScoreHandler
	}

	// new game
	// radius still drives the circular mob respawn paths in sys/mob.go +
	// sys/respawn.go until chunk 4 replaces them with authored spawn points.
	var radius float32 = 20
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
		core.Radius(radius),
		core.Bounds(zone.Bounds.Width, zone.Bounds.Height),
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
			p.BlocksAura,
		))
	}

	//---- set up server

	if err := bootHttp(g.Handler(), chieftainHandler, config.Server, dev); err != nil {
		slog.Error("failed to boot HTTP server", slog.Any("error", err))
		panic(err)
	}

	g.Loop()
}

func bootHttp(gameHandler, chieftainHandler http.Handler, cfg cfg.Server, dev bool) error {
	if cfg.TlsHost != "" {
		return bootTlsServer(gameHandler, chieftainHandler, cfg, dev)
	} else {
		bootServer(gameHandler, chieftainHandler, cfg, dev)
	}
	return nil
}

func bootTlsServer(gameHandler, chieftainHandler http.Handler, cfg cfg.Server, dev bool) error {
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

	const chieftainPath = "/chieftain"
	if chieftainHandler != nil {
		slog.Info("Serving chieftain", slog.String("addr", fmt.Sprintf(":%d/%s", port, chieftainPath)))
		mux.Handle(chieftainPath+"/", http.StripPrefix(chieftainPath, chieftainHandler))
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

func determineStateDir() (string, error) {
	// explicit systemd state directory
	stateDir := os.Getenv("STATE_DIRECTORY")
	if stateDir != "" {
		return stateDir, nil
	}

	return os.UserCacheDir()
}

func bootServer(gameHandler, chieftainHandler http.Handler, cfg cfg.Server, dev bool) {
	port := cfg.Port

	slog.Info("🦄 Booting game-server", slog.String("addr", fmt.Sprintf(":%d/game", port)))
	addr := fmt.Sprintf(":%d", port)

	mux := http.NewServeMux()
	mux.Handle("/game", gameHandler)

	const chieftainPath = "/chieftain"
	if chieftainHandler != nil {
		slog.Info("Serving chieftain", slog.String("addr", fmt.Sprintf(":%d/%s", port, chieftainPath)))
		mux.Handle(chieftainPath+"/", http.StripPrefix(chieftainPath, chieftainHandler))
	}

	if dev {
		dbUrl := ""
		if chieftainHandler != nil {
			dbUrl = fmt.Sprintf("&dbUrl=http://localhost:%d%s", port, chieftainPath)
		}
		slog.Info("🔥 dev server running", slog.String("url", fmt.Sprintf("http://localhost:%d?wsUrl=ws://localhost:%d/game%s", port, port, dbUrl)))
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
