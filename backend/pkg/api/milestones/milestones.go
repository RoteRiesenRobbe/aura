package milestones

import "embed"

// The milestone-unlock table is flat (a single file, no subdirectories), so a
// bare *.json pattern is correct here — as with recipes.
//
//go:embed *.json
var Milestones embed.FS
