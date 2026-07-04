package recipes

import "embed"

// Recipes are flat (no subdirectories), so a bare *.json pattern is correct
// here — unlike skills, which nest mob auras under mobs/.
//
//go:embed *.json
var Recipes embed.FS
