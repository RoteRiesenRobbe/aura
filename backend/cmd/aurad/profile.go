package main

// Load-test instrumentation — kept for capacity checks (see devops/loadtest.md).
// Enabled only by the -profile flag; the production path never binds this, so
// pprof/tickstats stay off unless a capacity run explicitly asks for them.

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/pprof"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/core"
)

func startProfileServer(addr string) {
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/heap", pprof.Index)

	mux.HandleFunc("/tickstats", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Has("reset") {
			core.TickStats.Reset()
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(core.TickStats.Summarize())
	})

	slog.Info("🔬 profiling endpoint", slog.String("addr", addr))
	go func() {
		if err := http.ListenAndServe(addr, mux); err != nil {
			slog.Error("profile server", slog.Any("error", err))
		}
	}()
}
