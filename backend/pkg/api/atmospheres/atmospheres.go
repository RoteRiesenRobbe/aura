package atmospheres

import "embed"

// The atmosphere profile table (plan-map-fog-darkness.md C1) is one flat file,
// shared with the client, which draws from it.
//
//go:embed *.json
var Atmospheres embed.FS
