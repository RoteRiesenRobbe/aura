package skills

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"unicode"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
)

// The skill catalog (plan-ui-polish chunk 1) serves the PARSED registry as
// JSON over HTTP — the client's single source of skill metadata (names,
// levels, effect numbers for tooltips). Serving the parsed form means load
// defaults (e.g. absent damageTags → [physical]) are already applied and
// `_comment` design notes are naturally dropped. The registry is immutable
// after boot, so the payload is marshaled exactly once.

// Enum → wire-string tables, derived from the parse maps so the two
// directions can never drift. The "" alias keys (selector, hitStyle) are
// skipped — they parse as defaults but are not names.
var (
	skillCategoryNames = reverseNames(skillCategoryMap)
	effectTypeNames    = reverseNames(effectTypeMap)
	selectorNames      = reverseNames(selectorMap)
	hitStyleNames      = reverseNames(hitStyleMap)
)

func reverseNames[T comparable](m map[string]T) map[T]string {
	names := make(map[T]string, len(m))
	for name, value := range m {
		if name == "" {
			continue
		}
		names[value] = name
	}
	return names
}

func marshalEnum[T comparable](names map[T]string, value T) ([]byte, error) {
	name, ok := names[value]
	if !ok {
		return nil, fmt.Errorf("no JSON name for %v", value)
	}
	return json.Marshal(name)
}

func (c SkillCategory) MarshalJSON() ([]byte, error) { return marshalEnum(skillCategoryNames, c) }
func (t EffectType) MarshalJSON() ([]byte, error)    { return marshalEnum(effectTypeNames, t) }
func (s Selector) MarshalJSON() ([]byte, error)      { return marshalEnum(selectorNames, s) }
func (h HitStyle) MarshalJSON() ([]byte, error)      { return marshalEnum(hitStyleNames, h) }

// DeriveDisplayName splits a CamelCase registry name into spaced words
// ("SummonTotem" → "Summon Totem"). Computed server-side so the client never
// re-implements the rule; the odd cases ("Long-Range Strike", "Call for
// Aid") author an explicit displayName override instead.
//
// Exported because the mob catalog (mobs.CatalogJSON) applies the identical
// rule to species names — two copies of a naming convention are exactly the
// kind of knowledge that drifts apart. It lives here because the skill
// catalog is where the rule and its override convention are defined.
func DeriveDisplayName(name string) string {
	var b strings.Builder
	b.Grow(len(name) + 4)
	for i, r := range name {
		if i > 0 && unicode.IsUpper(r) {
			b.WriteRune(' ')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// Catalog is the /skills payload. The skill list is the bulk of it; the curve
// rides along because authored effect numbers alone do not tell the client
// what a heal or a hit actually lands for — the server multiplies every
// HP-valued output by f(character level) (casterPowerScale, GDD §5), so
// without the curve a tooltip can only ever render the level-1 baseline
// (round-4 tooltip fix). Serving it beats hardcoding growth client-side:
// levelGrowth is a [WORKING LOCK], not a constant, and hand-syncing it is
// exactly the drift this endpoint was built to delete.
type Catalog struct {
	Curve  curve.Curve        `json:"curve"`
	Skills []*SkillDefinition `json:"skills"`
}

// CatalogJSON marshals every loaded skill definition sorted by ID, alongside
// the configured level curve. Mob-only and legacy skills are included —
// harmless, since the client only renders tooltips for spellbook-known ids.
func CatalogJSON(r Registry, c curve.Curve) ([]byte, error) {
	defs := r.All()
	sort.Slice(defs, func(i, j int) bool { return defs[i].ID < defs[j].ID })
	return json.Marshal(Catalog{Curve: c, Skills: defs})
}

// CatalogHandler serves the catalog on GET with a wildcard CORS origin: in
// dev the client runs on :2001 against aurad on :2000, and the catalog is
// public read-only content.
func CatalogHandler(r Registry, c curve.Curve) (http.Handler, error) {
	payload, err := CatalogJSON(r, c)
	if err != nil {
		return nil, err
	}
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(payload)
	}), nil
}

// Display is what a player should see this skill called: the authored
// `displayName` override when there is one, else Name split CamelCase→spaces.
//
// ⚑ It exists because reading the FIELD is only safe on a registry-loaded
// definition. RegistryFromFS fills DisplayName in at parse time, so the field is
// "always non-empty after parsing" as its own doc says, but a definition built
// in Go (every test stub, and any future non-registry path) leaves it empty, and
// a caller reading the field directly then renders a blank name. Two shipped
// call sites in the ascension row source did exactly that.
//
// ⚑ Callers must NOT re-implement this by calling DeriveDisplayName on the name:
// that silently drops the override, which is the whole reason the override
// exists ("Long-Range Strike", "Call for Aid", "Damage-Burst", "Hold the Line").
func (s *SkillDefinition) Display() string {
	if s == nil {
		return ""
	}
	if s.DisplayName != "" {
		return s.DisplayName
	}
	return DeriveDisplayName(s.Name)
}
