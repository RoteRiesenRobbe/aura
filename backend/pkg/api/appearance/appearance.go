package appearance

import "embed"

// The look catalog (plan-appearance.md §4.1): one file per portrait or ring.
//
//go:embed *.json
var Appearance embed.FS
