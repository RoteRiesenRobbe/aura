package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/sim"
)

//go:embed index.html
var indexHTML []byte

// runRequest is the explorer page's payload: the same specs the CLI builds
// from flags, plus the battery controls.
type runRequest struct {
	Player     sim.PlayerSpec `json:"player"`
	Mob        sim.MobSpec    `json:"mob"`
	Runs       int            `json:"runs"`
	Seed       int64          `json:"seed"`
	Distance   float32        `json:"distance"`
	MaxSeconds float64        `json:"maxSeconds"`
}

// validate keeps an accidental fat-finger (runs=2e9) from pinning a core;
// the bounds are generous — this is a local tool, not an exposed service.
func (r *runRequest) validate() error {
	if r.Runs < 1 || r.Runs > 5000 {
		return fmt.Errorf("runs must be in [1, 5000], got %d", r.Runs)
	}
	if r.MaxSeconds <= 0 || r.MaxSeconds > 600 {
		return fmt.Errorf("maxSeconds must be in (0, 600], got %v", r.MaxSeconds)
	}
	if r.Distance < 0 {
		return fmt.Errorf("distance must be >= 0, got %v", r.Distance)
	}
	return nil
}

// serve runs the local explorer UI: GET / is the embedded page, POST /run
// executes the TTK+TTD battery for the posted numbers and returns the same
// report the CLI would save as its artifact, GET /mobs is the authored-mob
// preset roster for the dropdown, GET /player-auras the player-skill one
// (content pass C5).
func serve(addr string, presets []mobPreset, playerPresets []playerAuraPreset) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(indexHTML)
	})
	mux.HandleFunc("/run", handleRun)
	mux.HandleFunc("/curve", handleCurve)
	mux.HandleFunc("/matrix", handleMatrix)
	mux.HandleFunc("/chain", handleChain)
	mux.HandleFunc("/mobs", handleMobs(presets))
	mux.HandleFunc("/player-auras", handlePlayerAuras(playerPresets))

	fmt.Printf("simharness explorer on http://%s (%d mob presets, %d player-aura presets)\n", addr, len(presets), len(playerPresets))
	return http.ListenAndServe(addr, mux)
}

// handleMobs serves the preset roster loaded at startup.
func handleMobs(presets []mobPreset) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(presets); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}
}

// handlePlayerAuras serves the player-aura preset roster (content pass C5).
func handlePlayerAuras(presets []playerAuraPreset) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(presets); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}
}

// validateCurve bounds the chunk-2 battery the same way runRequest.validate
// bounds the 1v1: generous local-tool limits plus a total-fight budget so a
// fat-fingered span×runs cannot pin the machine for minutes.
func validateCurve(cfg *sim.CurveConfig) error {
	if cfg.Runs < 1 || cfg.Runs > 2000 {
		return fmt.Errorf("runs must be in [1, 2000], got %d", cfg.Runs)
	}
	c := cfg.Fixture.Curve
	if c.MaxLevel < 1 || c.MaxLevel > 60 {
		return fmt.Errorf("curve.maxLevel must be in [1, 60], got %d", c.MaxLevel)
	}
	if c.Growth <= 0 {
		return fmt.Errorf("curve.growth must be > 0, got %v", c.Growth)
	}
	if cfg.MaxDelta < 0 || cfg.MaxDelta > 12 {
		return fmt.Errorf("maxDelta must be in [0, 12], got %d", cfg.MaxDelta)
	}
	if len(cfg.GrowthCandidates) > 8 || len(cfg.MaxLevelCandidates) > 8 {
		return fmt.Errorf("at most 8 growth / max-level candidates")
	}
	if cfg.Distance < 0 {
		return fmt.Errorf("distance must be >= 0, got %v", cfg.Distance)
	}
	fights := cfg.Runs * (2*c.MaxLevel + 2*(2*cfg.MaxDelta+1) + len(cfg.GrowthCandidates)*(cfg.MaxDelta+1))
	if fights > 100_000 {
		return fmt.Errorf("battery too large: %d fights (max 100000) — lower runs, the level span or the gap range", fights)
	}
	return nil
}

// handleCurve is the chunk-2 endpoint: a sim.CurveConfig in, the full curve
// report (level sweep + gap band + triple table) out — the same artifact the
// CLI's -levels mode saves.
func handleCurve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var cfg sim.CurveConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, fmt.Sprintf("bad request: %v", err), http.StatusBadRequest)
		return
	}
	if err := validateCurve(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(sim.RunCurve(cfg)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// validateMatrix bounds the chunk-3 battery like validateCurve does the
// chunk-2 one. The fight budget is pack-weighted — an n-mob fight costs
// roughly n 1v1s, so a row sums to maxPack·(maxPack+1)/2 fight-equivalents.
func validateMatrix(cfg *sim.MatrixConfig) error {
	if cfg.Runs < 1 || cfg.Runs > 2000 {
		return fmt.Errorf("runs must be in [1, 2000], got %d", cfg.Runs)
	}
	if cfg.MaxPackSize < 1 || cfg.MaxPackSize > 12 {
		return fmt.Errorf("maxPackSize must be in [1, 12], got %d", cfg.MaxPackSize)
	}
	if len(cfg.MaxTargetsCandidates) < 1 || len(cfg.MaxTargetsCandidates) > 6 {
		return fmt.Errorf("need 1-6 maxTargets candidates, got %d", len(cfg.MaxTargetsCandidates))
	}
	for _, c := range cfg.MaxTargetsCandidates {
		if c < 0 {
			return fmt.Errorf("maxTargets candidates must be >= 0 (0 = uncapped), got %d", c)
		}
	}
	if cfg.Distance < 0 {
		return fmt.Errorf("distance must be >= 0, got %v", cfg.Distance)
	}
	fights := cfg.Runs * len(cfg.MaxTargetsCandidates) * cfg.MaxPackSize * (cfg.MaxPackSize + 1) / 2
	if fights > 100_000 {
		return fmt.Errorf("battery too large: %d fight-equivalents (max 100000) — lower runs, candidates or the pack range", fights)
	}
	return nil
}

// handleMatrix is the chunk-3 endpoint: a sim.MatrixConfig in, the build ×
// pack-size report out — the same artifact the CLI's -matrix mode saves.
func handleMatrix(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var cfg sim.MatrixConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, fmt.Sprintf("bad request: %v", err), http.StatusBadRequest)
		return
	}
	if err := validateMatrix(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(sim.RunMatrix(cfg)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// validateChain bounds the chunk-4 battery. The budget counts chain cycles;
// a cycle costs roughly 14 fight-equivalents at the default regen (the
// recovery phase is ~3200 empty-world ticks vs ~240 fight ticks), so 25 000
// cycles [PLACEHOLDER] lands near the other endpoints' budgets.
func validateChain(cfg *sim.ChainConfig) error {
	if cfg.Runs < 1 || cfg.Runs > 1000 {
		return fmt.Errorf("runs must be in [1, 1000], got %d", cfg.Runs)
	}
	if cfg.ChainFights < 1 || cfg.ChainFights > 100 {
		return fmt.Errorf("chainFights must be in [1, 100], got %d", cfg.ChainFights)
	}
	if len(cfg.Levels) > 12 {
		return fmt.Errorf("at most 12 level brackets, got %d", len(cfg.Levels))
	}
	if len(cfg.Levels) > 0 && cfg.Curve.Growth <= 0 {
		return fmt.Errorf("curve.growth must be > 0 with level brackets, got %v", cfg.Curve.Growth)
	}
	if cfg.DowntimeSeconds < 0 || cfg.DowntimeSeconds > 3600 {
		return fmt.Errorf("downtimeSeconds must be in [0, 3600], got %v", cfg.DowntimeSeconds)
	}
	if cfg.RegenTick < 0 || cfg.RegenTick > 1 {
		return fmt.Errorf("regenTick must be in [0, 1], got %v", cfg.RegenTick)
	}
	if cfg.SelfHealLevel < 0 || cfg.SelfHealLevel > 10 {
		return fmt.Errorf("selfHealLevel must be in [0, 10], got %d", cfg.SelfHealLevel)
	}
	if cfg.MaxSecondsPerFight < 0 || cfg.MaxSecondsPerFight > 600 {
		return fmt.Errorf("maxSecondsPerFight must be in [0, 600], got %v", cfg.MaxSecondsPerFight)
	}
	brackets := len(cfg.Levels)
	if brackets == 0 {
		brackets = 1
	}
	cycles := brackets * 2 * cfg.Runs * cfg.ChainFights
	if cycles > 25_000 {
		return fmt.Errorf("battery too large: %d chain cycles (max 25000) — lower runs, chainFights or the brackets", cycles)
	}
	return nil
}

// handleChain is the chunk-4 endpoint: a sim.ChainConfig in, the chain
// report (facetank vs kite kills/hour + efficiency) out — the same artifact
// the CLI's -chain mode saves.
func handleChain(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var cfg sim.ChainConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, fmt.Sprintf("bad request: %v", err), http.StatusBadRequest)
		return
	}
	if err := validateChain(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(sim.RunChain(cfg)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var req runRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("bad request: %v", err), http.StatusBadRequest)
		return
	}
	if err := req.validate(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	maxTicks := int(req.MaxSeconds * sim.TicksPerSecond)
	report := sim.NewReport()
	for _, sc := range []sim.Scenario{
		sim.TTK(req.Player, req.Mob, req.Distance),
		sim.TTD(req.Player, req.Mob, req.Distance),
	} {
		sc.MaxTicks = maxTicks
		report.Run(sc, req.Seed, req.Runs)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(report); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
