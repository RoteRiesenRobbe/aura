package main

import (
	"fmt"
	"net/http"
)

// playerCounter is implemented by the game, which delegates to the
// ConnectionStateSystem. Narrow interface asserted at boot, the
// sys.CampfireAnchorSink pattern.
type playerCounter interface {
	PlayerCount() int
}

// playersHandler serves the live number of joined players for the start
// screen's "players online" readout.
//
// Unlike the /skills and /mobs catalogs this cannot be marshaled once at boot,
// so it writes per request — which costs one atomic load and ~15 bytes, and
// idle start screens poll it every 10 s. Explicitly uncached: a proxy or
// browser caching this would freeze the number.
func playersHandler(c playerCounter) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprintf(w, `{"players":%d}`, c.PlayerCount())
	})
}
