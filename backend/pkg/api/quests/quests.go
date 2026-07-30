package quests

import "embed"

// The pattern is * rather than *.json: the directory ships only a README until
// C4 authors the first quest, and go:embed rejects a pattern that matches
// nothing. The loader skips non-.json files.
//
//go:embed *
var Quests embed.FS
