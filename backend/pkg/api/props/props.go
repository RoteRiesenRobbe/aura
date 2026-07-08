package props

import "embed"

// Props are flat (no subdirectories), so a bare *.json pattern is correct here
// (see the go:embed subdirectory gotcha pinned in pkg/api/skills/skills_test.go).
//
//go:embed *.json
var Props embed.FS
