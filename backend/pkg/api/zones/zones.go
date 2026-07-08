package zones

import "embed"

// Zones are flat (no subdirectories), so a bare *.json pattern is correct here.
// Chunk 2 ships exactly one zone (zone.json); the loader hard-fails on more
// than one until multiple zones are supported.
//
//go:embed *.json
var Zones embed.FS
