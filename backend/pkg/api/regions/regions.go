package regions

import "embed"

// The place list (plan-region-identity.md D2) is one flat file.
//
//go:embed *.json
var Regions embed.FS
