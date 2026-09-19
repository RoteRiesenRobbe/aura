package skills

import (
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"sort"
	"strings"
)

// The `visual` key: what a skill LOOKS like (plan-skill-vfx.md, C0).
//
// A skill carries ONE optional top-level `visual` block holding a list of
// layers, and each layer names a KIND (what moves), a trigger (`on`: the
// moment it plays) and a handful of tunables. Nothing here reaches the
// simulation: the loader parses and refuses, the HTTP catalog serves the
// block verbatim, and the client's renderer is the only consumer. A skill
// that authors no `visual` gets a nil Visual and behaves exactly as before.
//
// Three properties are deliberate and worth keeping:
//
//   - **On the SKILL, never per effect** (§10 Q1, PO 2026-09-19). A hit event
//     carries the skill id, so the skill is the level the renderer can resolve
//     for free; a skill with two effects (damage + slow) has one look.
//   - **The seven kinds are ENGINE CODE and the set is CLOSED** (D4). Each one
//     is a client class with its own math; a new kind is a plan amendment plus
//     a renderer, not a content decision. Everything else about a layer is a
//     parameter, which is why the tunables are few and shared.
//   - **`body` is UNCHECKED here** (C0 scope). It names an atlas frame, and
//     the atlas does not exist until C3; an absent body draws the kind's
//     procedural placeholder. The ERROR path for a body no sheet carries is
//     C3's, and mapToSkillDefinition has no warning channel to degrade
//     through in the meantime, so C0 neither checks nor warns: a typo'd body
//     draws the placeholder and is caught when the atlas arrives.
//
// Every refusal below is a hard-fail at content load, naming the skill, the
// layer index and the rule, like the effect key allowlist it is modelled on.

// VisualDef is the authored `visual` block. One key, `layers`, and it must
// carry at least one: a `visual` object with nothing in it is an authoring
// accident, not a way to say "no dressing" (that is simply omitting the key).
type VisualDef struct {
	Layers []VisualLayer `json:"layers"`

	// HasFired is "at least one layer plays at the `fired` moment", resolved
	// once at load (plan-skill-vfx.md §12a.4). An AURA ticks up to 30 times a
	// second and only a skill that actually draws something on its beat is
	// worth a FIRED event per tick, so the emitter reads this and nothing else
	// does. Derived, never authored: json:"-" keeps it off the HTTP catalog
	// and out of the content editor's round-trip.
	//
	// ⚑ The SIMULATION never reads it. It gates an output event, exactly like
	// the events themselves.
	HasFired bool `json:"-"`
}

// VisualLayer is one dressing element: a kind, the moment it plays, and the
// tunables that kind reads. The zero value of a tunable means UNAUTHORED, and
// the renderer supplies the kind's default; an authored zero is refused below,
// so the two are never confused.
type VisualLayer struct {
	// Kind is one of visualKinds. Required.
	Kind string `json:"kind"`
	// On is one of visualTriggers, and must be a moment this kind has
	// (visualTriggersByKind) on a skill of this category (D2). Required.
	On string `json:"on"`

	// Body names an atlas frame; absent draws the kind's placeholder.
	// UNCHECKED in C0, see the file comment.
	Body string `json:"body,omitempty"`

	MS     int     `json:"ms,omitempty"`     // duration in milliseconds [PLACEHOLDER per skill]
	Speed  float32 `json:"speed,omitempty"`  // projectile travel speed
	Curve  string  `json:"curve,omitempty"`  // impact / strike / beam, one of the KIND's visualCurvesByKind set
	Count  int     `json:"count,omitempty"`  // orbit / emitter: how many bodies
	Motion string  `json:"motion,omitempty"` // emitter only, one of visualMotions
	Width  float32 `json:"width,omitempty"`  // beam only
	Tint   string  `json:"tint,omitempty"`   // overrides the palette; lowercase #rrggbb
	Scale  float32 `json:"scale,omitempty"`  // body size multiplier

	// Chain is the beam's alone (C2a, PO 2026-09-19): one tick's hit events
	// of one (caster, skill) draw as a single caster→v1→v2→v3 polyline
	// instead of a fan from the caster. VISUAL ONLY - every victim is already
	// inside the caster's ring and the server never sees this key. A true
	// chain selector (jump range measured from the previous victim) is
	// gameplay work nobody has asked for.
	Chain bool `json:"chain,omitempty"`
}

// visualTriggerFired is the one trigger name Go itself branches on (the FIRED
// emitter, plan-skill-vfx.md §12a.4), so it is a constant rather than a string
// literal repeated in two packages.
const visualTriggerFired = "fired"

// The closed tables. visualKinds and visualTriggers are the vocabulary; the
// per-kind maps say what each kind accepts. All six ride the generated
// api/skill-vocabulary.json (vocabulary_test.go), so the content editor and
// its smoke script read Go's own words rather than a hand-typed copy.
var (
	// visualKinds, in the order of plan-skill-vfx.md §4.1. `strike` took
	// `arc-swing`'s slot in the C2a amendment (§12c.1): the attacker's half of
	// a melee hit had no kind at all, because `impact` is anchored at the
	// VICTIM, and the arc was only one of the three weapon motions a melee
	// skill wants. Still seven.
	visualKinds = []string{"impact", "strike", "projectile", "beam", "cast-pose", "orbit", "emitter"}

	// visualTriggers: ambient = while this is the actor's running aura,
	// fired = a cast or an aura tick went off (targets or not), hit = once
	// per victim of a landing.
	visualTriggers = []string{"ambient", visualTriggerFired, "hit"}

	// visualCurvesByKind: `curve` picks a motion shape, and the shapes are
	// per KIND because they are per renderer (C2a, PO 2026-09-19). An impact
	// bursts or snaps on the victim; a strike thrusts, swings or comes down
	// overhead from the attacker, and the style also picks the placeholder
	// weapon (spear / blade / hammer); a beam either flashes (attack → peak →
	// fade, the lightning envelope) or extends (extend → retract, the flame
	// pillar). A shared set would let a beam author "thrust", load clean and
	// draw its default forever. Only the kinds whose visualKeysByKind row
	// carries "curve" have a row here, both ways.
	//
	// ⚑ `thrust` MOVED from impact to strike in the C2a amendment (§12c.1),
	// so it is now a refusal on an impact rather than its default motion.
	visualCurvesByKind = map[string][]string{
		"impact": {"burst", "snap"},
		"strike": {"thrust", "swing", "overhead"},
		"beam":   {"flash", "extend"},
	}

	visualMotions = []string{"swirl", "rise", "burst"}

	// The keys legal on EVERY layer, in the order the editor will draw them.
	visualKeysCommon = []string{"kind", "on", "body", "tint", "scale"}

	// visualKeysByKind is the FULL key list per kind: the common keys, then
	// the kind's own. Same shape and same purpose as effectKeys, and the same
	// rule: a key a kind does not read is a hard-fail, not a silent no-op.
	visualKeysByKind = map[string][]string{
		"impact":     mergeKeys(visualKeysCommon, []string{"ms", "curve"}),
		"strike":     mergeKeys(visualKeysCommon, []string{"ms", "curve"}),
		"projectile": mergeKeys(visualKeysCommon, []string{"speed"}),
		"beam":       mergeKeys(visualKeysCommon, []string{"ms", "width", "curve", "chain"}),
		"cast-pose":  mergeKeys(visualKeysCommon, []string{"ms"}),
		"orbit":      mergeKeys(visualKeysCommon, []string{"ms", "count"}),
		"emitter":    mergeKeys(visualKeysCommon, []string{"ms", "count", "motion"}),
	}

	// visualTriggersByKind: which moments a kind can play at. An `impact`
	// needs a victim, so it is a hit and nothing else, and a `strike` travels
	// INTO one, so it has no moment without a victim either; a `cast-pose` is
	// worn for the duration of a cast, so it is fired; only `emitter` spans
	// all three.
	visualTriggersByKind = map[string][]string{
		"impact":     {"hit"},
		"strike":     {"hit"},
		"projectile": {"hit"},
		"beam":       {"hit"},
		"cast-pose":  {"fired"},
		"orbit":      {"fired", "ambient"},
		"emitter":    {"ambient", "fired", "hit"},
	}

	// visualTriggersByCategory is D2, enforced at load (PO 2026-09-19).
	// "Every category gets visuals; passives only on their hit moments."
	//
	// A passive is never switched on and never cast, so it has neither a
	// "while active" moment nor a cast moment: it can dress only the hit it
	// causes (the FireShield reflect). A cooldown fires and lands but is
	// never the running aura, so ambient is not its moment either. Only an
	// active aura has all three. Authoring the wrong one would load clean and
	// draw nothing, which is exactly the silent class this project keeps
	// paying for, so it is a refusal instead.
	visualTriggersByCategory = map[string][]string{
		"active_aura": {"ambient", "fired", "hit"},
		"cooldown":    {"fired", "hit"},
		"passive":     {"hit"},
	}

	// Lowercase only: the client compares and the editor will offer these as
	// swatches, and two spellings of one colour is one spelling too many.
	visualTintPattern = regexp.MustCompile(`^#[0-9a-f]{6}$`)
)

// parseVisual turns the raw `visual` block into a validated VisualDef, or nil
// when the skill authors none. categoryName is the skill's authored category
// string, needed for D2 and for the message that reports it.
func parseVisual(raw json.RawMessage, categoryName string) (*VisualDef, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	// Layers stay raw for one more step so the per-layer key allowlist can
	// see keys the typed struct would drop in silence, the effects pattern.
	var wrapper struct {
		Layers []json.RawMessage `json:"layers"`
	}
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		return nil, fmt.Errorf("visual: %w", err)
	}
	if len(wrapper.Layers) == 0 {
		return nil, fmt.Errorf(`visual is authored with no "layers" - a skill with nothing to draw omits the whole "visual" key instead`)
	}

	layers := make([]VisualLayer, 0, len(wrapper.Layers))
	for i, rawLayer := range wrapper.Layers {
		layer, err := parseVisualLayer(rawLayer, categoryName)
		if err != nil {
			return nil, fmt.Errorf("visual layer %d: %w", i, err)
		}
		layers = append(layers, layer)
	}
	def := &VisualDef{Layers: layers}
	for _, l := range layers {
		if l.On == visualTriggerFired {
			def.HasFired = true
			break
		}
	}
	return def, nil
}

func parseVisualLayer(raw json.RawMessage, categoryName string) (VisualLayer, error) {
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(raw, &keys); err != nil {
		return VisualLayer{}, err
	}
	var layer VisualLayer
	if err := json.Unmarshal(raw, &layer); err != nil {
		return VisualLayer{}, err
	}

	// The kind first: without it there is no allowlist to sweep against and
	// no trigger set to test, so every later message would be a guess.
	allowedKeys, ok := visualKeysByKind[layer.Kind]
	if !ok {
		if layer.Kind == "" {
			return VisualLayer{}, fmt.Errorf(`no "kind" - every layer names one of the %d kinds: %s`,
				len(visualKinds), strings.Join(visualKinds, ", "))
		}
		return VisualLayer{}, fmt.Errorf("unknown kind %q - the kinds are engine code and the set is closed: %s "+
			"(a new one is a plan amendment plus a renderer, not content)", layer.Kind, strings.Join(visualKinds, ", "))
	}

	if layer.On == "" {
		return VisualLayer{}, fmt.Errorf(`kind %q has no "on" - every layer names the moment it plays: %s`,
			layer.Kind, strings.Join(visualTriggers, ", "))
	}
	if !slices.Contains(visualTriggers, layer.On) {
		return VisualLayer{}, fmt.Errorf("unknown trigger %q - the moments are: %s",
			layer.On, strings.Join(visualTriggers, ", "))
	}
	if legal := visualTriggersByKind[layer.Kind]; !slices.Contains(legal, layer.On) {
		return VisualLayer{}, fmt.Errorf("kind %q has no %q moment (it plays on: %s)",
			layer.Kind, layer.On, strings.Join(legal, ", "))
	}
	// D2, the category half.
	if legal := visualTriggersByCategory[categoryName]; !slices.Contains(legal, layer.On) {
		return VisualLayer{}, fmt.Errorf("trigger %q is not legal on a %s skill (D2: a %s skill may author %s) - "+
			"only an active aura is ever the running aura, and a passive is neither switched on nor cast, so it dresses its hit moments alone",
			layer.On, categoryName, categoryName, strings.Join(legal, ", "))
	}

	sorted := make([]string, 0, len(keys))
	for k := range keys {
		sorted = append(sorted, k)
	}
	sort.Strings(sorted)
	for _, k := range sorted {
		if !slices.Contains(allowedKeys, k) {
			return VisualLayer{}, fmt.Errorf("kind %q: field %q is not valid on this kind (it reads: %s)",
				layer.Kind, k, strings.Join(allowedKeys, ", "))
		}
	}

	// The curve set belongs to the KIND, so a value borrowed from another
	// kind's set is refused by name rather than quietly ignored.
	if legal := visualCurvesByKind[layer.Kind]; layer.Curve != "" && !slices.Contains(legal, layer.Curve) {
		return VisualLayer{}, fmt.Errorf("kind %q: curve %q is not one of: %s",
			layer.Kind, layer.Curve, strings.Join(legal, ", "))
	}
	if layer.Motion != "" && !slices.Contains(visualMotions, layer.Motion) {
		return VisualLayer{}, fmt.Errorf("kind %q: motion %q is not one of: %s",
			layer.Kind, layer.Motion, strings.Join(visualMotions, ", "))
	}

	// Range checks are PRESENCE-gated: an absent tunable is the kind's own
	// default and must stay legal, while an authored 0 is a mistake the
	// renderer would turn into an invisible or instant layer.
	if _, authored := keys["ms"]; authored && layer.MS <= 0 {
		return VisualLayer{}, visualPositiveErr(layer.Kind, "ms", layer.MS)
	}
	if _, authored := keys["speed"]; authored && layer.Speed <= 0 {
		return VisualLayer{}, visualPositiveErr(layer.Kind, "speed", layer.Speed)
	}
	if _, authored := keys["width"]; authored && layer.Width <= 0 {
		return VisualLayer{}, visualPositiveErr(layer.Kind, "width", layer.Width)
	}
	if _, authored := keys["scale"]; authored && layer.Scale <= 0 {
		return VisualLayer{}, visualPositiveErr(layer.Kind, "scale", layer.Scale)
	}
	if _, authored := keys["count"]; authored && layer.Count < 1 {
		return VisualLayer{}, fmt.Errorf(`kind %q: "count" must be >= 1 when authored, got %d (omit it for the kind's default)`,
			layer.Kind, layer.Count)
	}

	if _, authored := keys["tint"]; authored && !visualTintPattern.MatchString(layer.Tint) {
		return VisualLayer{}, fmt.Errorf(`kind %q: tint %q must be a lowercase hex colour like "#3fa9f5" (omit it to take the palette's colour from the skill's damage type)`,
			layer.Kind, layer.Tint)
	}

	return layer, nil
}

func visualPositiveErr(kind, key string, got any) error {
	return fmt.Errorf("kind %q: %q must be > 0 when authored, got %v (omit it for the kind's default)", kind, key, got)
}
