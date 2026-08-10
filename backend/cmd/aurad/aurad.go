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

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/core"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/encounter"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/prop"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
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

	// Persistence (step 8a chunk 1a). First thing after the conf, so a broken
	// database aborts before the content load rather than after it.
	//
	// ⚑ Since chunk 1c this is REQUIRED, not optional: the accounts endpoints
	// cannot answer without it, so a server that booted anyway would be one
	// nobody could get into. See openDatabase.
	db := openDatabase()
	// Unreachable today — Loop() below never returns, and the process is killed
	// outright. It becomes live with the graceful-shutdown flush (§2), which is
	// the chunk that gives shutdown something to do.
	defer db.Close()

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
	ascensionCatalog := loadAscensionCatalog(content.ascension, skillsRegistry, mobsRegistry, questsRegistry)
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
	mob.SetKillXP(config.Game.Player.KillXP)
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
		slog.Float64("combat.presenceRadius", float64(combat.PresenceRange())),
		// The kill-XP economy is the one knob whose absence used to be
		// indistinguishable from "nobody earns anything" (plan-xp-formula.md
		// L2/L5), so the resolved base + growth go in the boot log by name.
		slog.Float64("player.killXP.base", mob.KillXPConfig().Base),
		slog.Float64("player.killXP.growth", mob.KillXPConfig().Growth),
		// The resolved gray + tier fields belong here too: a conf authoring
		// only base+growth used to zero them, and printing just the two fields
		// that WERE set is what would have made that invisible.
		slog.Int("player.killXP.grayBase", mob.KillXPConfig().GrayBase),
		slog.Int("player.killXP.grayStep", mob.KillXPConfig().GrayStep),
		slog.Float64("player.killXP.taperStretch", mob.KillXPConfig().TaperStretch),
		slog.Float64("player.killXP.tierElite", mob.KillXPConfig().TierElite),
		slog.Float64("player.killXP.tierBoss", mob.KillXPConfig().TierBoss))

	g, err := core.NewGameWith(
		rnd.Int63(),
		core.Config(config),
		core.Registries(mobsRegistry),
		core.SkillRegistry(skillsRegistry),
		core.MilestoneUnlocks(milestoneUnlocks),
		core.Recipes(recipeRegistry),
		core.QuestRegistry(questsRegistry),
		core.AscensionCatalog(ascensionCatalog),
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
				ID:            c.ID,
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

	// Accounts & identity (step 8a chunk 1c): the eight HTTP/JSON endpoints,
	// mounted as one subtree. ⚑ The origin policy is built ONCE and handed to
	// both surfaces — the CORS headers below and the WebSocket handshake's
	// CheckOrigin — because a second copy of a security allowlist is one that
	// eventually disagrees with the first (backlog §43).
	originPolicy := buildOriginPolicy(config, dev)

	// ⚑ Tickets and sessions are created HERE and shared by both surfaces
	// (step 8a chunk 3). /select mints a ticket into this store and the game
	// redeems it from the same one; /select checks the account slot the game
	// claims. Two instances would each work perfectly in isolation and enforce
	// nothing between them — every ticket unknown, every account free.
	tickets := auth.NewTicketStore(auth.TicketTTL)
	sessions := auth.NewSessionRegistry()

	identity, ok := g.(sys.IdentitySink)
	if !ok {
		panic("game does not accept an identity seam")
	}
	identity.SetIdentity(tickets, sessions)

	// Persistence (step 8a chunk 4). The writer owns the only goroutine that
	// talks SQL for character state; the game hands it plain value snapshots and
	// never blocks on a write — §4's "snapshot inside the tick, write outside
	// it", which is the rule the single-goroutine game loop makes non-negotiable.
	characterWriter := persist.NewWriter(db)
	persistence, ok := g.(sys.PersistenceSink)
	if !ok {
		panic("game does not accept a persistence seam")
	}
	persistence.SetCharacterSaves(characterWriter)
	// The sacrifice transaction (plan-ascension.md C1) — a second seam beside the
	// writer because it is a one-shot irreversible write whose outcome the loop
	// has to observe, not a retryable snapshot.
	ascender := persist.NewAscender(db)
	persistence.SetCharacterAscensions(ascender)
	// The memorial's names (plan-ascension.md C3 step 5, D11): a third seam, and
	// the only one that READS. It exists because the memorial's rows are served on
	// the per-tick conversation path, where no provider may query a database, so
	// the read happens here on a timer and the loop only ever sees a snapshot.
	//
	// ⚑ It RE-READS rather than accumulating, because names can leave the
	// monument: DiscardAnonymousAccount erases them off the loop, and D11 rules
	// that erasure wins.
	graveyard := persist.NewGraveyard(db, memorialNameLimit, memorialRefreshInterval)
	defer graveyard.Stop()
	persistence.SetGraveyardNames(graveyard)
	// ⚑ Logged like the content counts above, and for the same reason: the boot
	// read is silent on success, so without this line "the monument is empty"
	// and "the read never happened" look identical in the log, and an empty
	// monument is a legitimate state, which is exactly what makes the pair
	// indistinguishable.
	// ⚑ And tell the memorial when a name is added, so it does not lag a whole
	// interval behind the one event that certainly changed it (PO feedback
	// 2026-08-11). The hook fires on the Ascender's own goroutine, off the game
	// loop, which is the only place a database read may be triggered from.
	ascender.OnCommitted(graveyard.RefreshSoon)
	slog.Info("Read the memorial's names",
		slog.Int("listed", len(graveyard.Latest().Names)),
		slog.Int("total", graveyard.Latest().Total))
	installShutdownFlush(persistence, characterWriter, db)

	accountsServer, err := buildAccountsServer(db, originPolicy, config, dev, tickets, sessions, identity)
	if err != nil {
		slog.Error("failed to start the accounts endpoints", slog.Any("err", err))
		panic(err)
	}
	// A subtree pattern: the accounts server routes /api/* itself, including the
	// method and {id} matching, so nothing here has to know its paths.
	sidecars["/api/"] = accountsServer.Handler()

	if err := bootHttp(g.Handler(originPolicy.CheckRequest), sidecars, config.Server, dev); err != nil {
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
	}
	if serveFrontend(cfg, dev) {
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
	}
	if serveFrontend(cfg, dev) {
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

// serveFrontend reports whether this boot mounts the game client at "/".
//
// ⚑ THIS USED TO BE `-dev` ALONE, AND THAT MADE `-dev` LOAD-BEARING IN
// PRODUCTION. The live systemd unit therefore ran with it, which was harmless
// until step 8a gave the flag two security jobs it never had before: it opens
// the reserved `hrnss_` character-name prefix (buildAccountsServer's
// AllowHarnessNames) and the loopback origin exception (buildOriginPolicy). The
// deployment could neither drop the flag — the site would serve a bare 204 and
// no client — nor keep it without contradicting both of those rules.
//
// Serving the client is a DEPLOYMENT question, so it is answered by the
// deployment's own conf: `server.frontendDir`. -dev still implies it, so every
// local workflow and harness script is unchanged.
//
// ⚑ conf.default.json ships a frontendDir, so this is true on essentially every
// boot and the 204 ping below survives only where frontendDir is explicitly
// empty. That is the intent — the ping exists for a deployment that serves no
// client, not as the common case. A frontendDir naming a directory that does not
// exist yields 404s rather than a boot failure (frontendHandler only takes the
// absolute path; it does not stat).
func serveFrontend(cfg cfg.Server, dev bool) bool {
	return dev || cfg.FrontendDir != ""
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
