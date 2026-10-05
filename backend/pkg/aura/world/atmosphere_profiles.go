package world

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"
)

// AtmosphereProfileFile is the atmosphere profile table, shared with the client
// (plan-map-fog-darkness.md C1): one source, so the map reveal and the drawn
// darkness read the same numbers.
const AtmosphereProfileFile = "profiles.json"

// LoadAtmosphereDarkness reads the `darkness` each atmosphere profile DECLARES,
// keyed by profile name. A profile that omits the key is absent from the map.
//
// ⚑ Only `darkness` is read. Every other key is client presentation and is
// deliberately not parsed, so a new look key never needs a Go change; an
// unknown profile name on a shape is never a boot failure either (the D8
// posture of plan-region-primitive.md): it simply darkens nothing.
func LoadAtmosphereDarkness(fsys fs.FS) (map[string]float32, error) {
	data, err := fs.ReadFile(fsys, AtmosphereProfileFile)
	if err != nil {
		return nil, fmt.Errorf("atmosphere profiles: %w", err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("%s: cannot parse: %w", AtmosphereProfileFile, err)
	}
	out := map[string]float32{}
	for name, body := range raw {
		if strings.HasPrefix(name, "_") {
			continue // documentation, the repo's _comment convention
		}
		var profile struct {
			Darkness *float32 `json:"darkness"`
		}
		if err := json.Unmarshal(body, &profile); err != nil {
			return nil, fmt.Errorf("%s: profile %q: %w", AtmosphereProfileFile, name, err)
		}
		if profile.Darkness == nil {
			continue
		}
		if d := *profile.Darkness; d < 0 || d > 1 {
			return nil, fmt.Errorf("%s: profile %q: darkness %g must be within 0..1", AtmosphereProfileFile, name, d)
		}
		out[name] = *profile.Darkness
	}
	return out, nil
}
