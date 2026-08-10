package ascension

import "embed"

// The pattern is * rather than *.json: the directory ships only a README until
// C3 authors the first reward entry, and go:embed rejects a pattern that matches
// nothing. The loader skips non-.json files.
//
//go:embed *
var Ascension embed.FS
