package skills

import "embed"

// The pattern must include subdirectories (mobs/): a bare *.json silently
// drops them and the server fails at startup resolving mob skill loadouts.
//
//go:embed *.json **/*.json
var Skills embed.FS
