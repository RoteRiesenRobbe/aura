package areas

import "embed"

// The area list (plan-prop-draw-order.md P4b, D15) is one flat file.
//
//go:embed *.json
var Areas embed.FS
