package lang

import "embed"

// The localization tree (plan-localization.md C1, C5a): api/lang/<locale>/*.arb,
// the authored English (D27) and the translations. Synced by cp-defs like every
// other content directory (L3).
//
//go:embed */*.arb
var Lang embed.FS
