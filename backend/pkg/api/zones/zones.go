package zones

import "embed"

// The zone set is the flat *.json files; every one of them loads. The
// .debug/ set rides the same FS for `aurad -debug-zones`, and must be named
// explicitly because a bare directory pattern skips dot directories. The zone
// loader's own walk skips dot directories too, so it never leaks into the
// main set.
//
//go:embed *.json .debug/*.json
var Zones embed.FS
