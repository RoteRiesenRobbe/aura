package lang

import "embed"

// The localization tree (plan-localization.md C1): api/lang/<locale>/*.arb,
// the generated English sources and the translation overlays. Synced by
// cp-defs like every other content directory (L3).
//
//go:embed */*.arb stock.json
var Lang embed.FS
