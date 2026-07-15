package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/trichner/berryhunter/pkg/berryhunter/sim"
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
// preset roster for the dropdown.
func serve(addr string, presets []mobPreset) error {
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
	mux.HandleFunc("/mobs", handleMobs(presets))

	fmt.Printf("simharness explorer on http://%s (%d mob presets)\n", addr, len(presets))
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
