package skills

import (
	"encoding/json"
	"fmt"
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plan-skill-vfx.md C0. The vocabulary's acceptance set is §4.3's nine PO
// examples at the bottom of this file: every one of them must load, with the
// one engine-drawn exception the C3a amendment ruled (§12g.1 item 2 - the hit
// mark on the victim is code, not content), or the seven kinds are the wrong
// seven.

// visualSkill wraps a `visual` block in the smallest skill file that parses.
// Effects are deliberately empty: nothing here is about effects, and an empty
// list is a shape the loader already accepts (definition_test.go's unknown
// category case).
func visualSkill(category, visual string) []byte {
	return []byte(fmt.Sprintf(
		`{"id":1,"name":"Fixture","category":%q,"maxLevel":1,"visual":%s,"effects":[]}`,
		category, visual))
}

func visualErr(t *testing.T, category, visual string) string {
	t.Helper()
	raw, err := parseSkillDefinition(visualSkill(category, visual))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	require.Error(t, err, "this visual block should not have loaded")
	return err.Error()
}

// The §4.2 example, field by field: the key lands on the SKILL (§10 Q1,
// PO 2026-09-19), it survives onto SkillDefinition, and every authored value
// arrives typed.
//
// ⚑ The example lost its third layer in the C3a amendment (§12g): the arrow's
// landing burst used to be an authored `impact`, and the engine now draws that
// mark itself on every damaging hit. The bow and the arrow are all a file says.
func TestVisual_ParsesTheDocumentedExample(t *testing.T) {
	def := mustParse(t, visualSkill("cooldown", `{
	  "layers": [
	    { "kind": "cast-pose",  "on": "fired", "body": "bow",   "ms": 250 },
	    { "kind": "projectile", "on": "hit",   "body": "arrow", "speed": 900 }
	  ]
	}`))

	require.NotNil(t, def.Visual)
	require.Len(t, def.Visual.Layers, 2)

	assert.Equal(t, "cast-pose", def.Visual.Layers[0].Kind)
	assert.Equal(t, "fired", def.Visual.Layers[0].On)
	assert.Equal(t, "bow", def.Visual.Layers[0].Body)
	assert.Equal(t, 250, def.Visual.Layers[0].MS)

	assert.Equal(t, "projectile", def.Visual.Layers[1].Kind)
	assert.Equal(t, "arrow", def.Visual.Layers[1].Body)
	assert.InDelta(t, 900, def.Visual.Layers[1].Speed, 1e-6)
	assert.Equal(t, 0, def.Visual.Layers[1].MS, "an unauthored tunable stays at its zero value")
}

// The common keys every kind accepts, on a kind that has its own besides.
func TestVisual_CommonKeysLandOnEveryKind(t *testing.T) {
	def := mustParse(t, visualSkill("active_aura", `{
	  "layers": [
	    { "kind": "emitter", "on": "ambient", "body": "mist", "tint": "#3fa9f5",
	      "scale": 1.5, "ms": 1200, "count": 12, "motion": "swirl" }
	  ]
	}`))
	require.NotNil(t, def.Visual)
	require.Len(t, def.Visual.Layers, 1)
	l := def.Visual.Layers[0]
	assert.Equal(t, "#3fa9f5", l.Tint)
	assert.InDelta(t, 1.5, l.Scale, 1e-6)
	assert.Equal(t, 1200, l.MS)
	assert.Equal(t, 12, l.Count)
	assert.Equal(t, "swirl", l.Motion)
}

// The beam's own two tunables (C2a, PO 2026-09-19). `curve` picks the
// envelope, `chain` re-reads one tick's hit events as a single caster→v1→v2
// polyline instead of a fan. An absent `curve` stays legal and means the
// kind's default (`flash`); `chain: false` is the same as omitting it.
func TestVisual_BeamCurveAndChain(t *testing.T) {
	def := mustParse(t, visualSkill("active_aura", `{
	  "layers": [
	    { "kind": "beam", "on": "hit", "curve": "flash",  "chain": true, "ms": 260 },
	    { "kind": "beam", "on": "hit", "curve": "extend", "chain": false },
	    { "kind": "beam", "on": "hit" }
	  ]
	}`))
	require.NotNil(t, def.Visual)
	require.Len(t, def.Visual.Layers, 3)

	assert.Equal(t, "flash", def.Visual.Layers[0].Curve)
	assert.True(t, def.Visual.Layers[0].Chain)
	assert.Equal(t, 260, def.Visual.Layers[0].MS)

	assert.Equal(t, "extend", def.Visual.Layers[1].Curve)
	assert.False(t, def.Visual.Layers[1].Chain)

	assert.Empty(t, def.Visual.Layers[2].Curve, "an unauthored curve stays empty and the renderer supplies the kind's default")
	assert.False(t, def.Visual.Layers[2].Chain)
}

// The strike's four styles (C2a amendment, PO 2026-09-19; `bite` added by the
// C3a amendment, PO 2026-09-21). A weapon starts at the ATTACKER and travels to
// the victim, and `curve` picks which weapon and which motion: a spear thrust,
// a blade swing, an overhead hammer, a pair of jaws closing over the victim.
// Absent means the kind's default (`thrust`), presence-gated like every other
// tunable, so an unauthored curve stays empty on the struct rather than being
// filled in here.
func TestVisual_StrikeCurves(t *testing.T) {
	def := mustParse(t, visualSkill("active_aura", `{
	  "layers": [
	    { "kind": "strike", "on": "hit", "curve": "thrust",   "ms": 200 },
	    { "kind": "strike", "on": "hit", "curve": "swing",    "ms": 280 },
	    { "kind": "strike", "on": "hit", "curve": "overhead", "ms": 460 },
	    { "kind": "strike", "on": "hit", "curve": "bite",     "body": "wolf-jaw", "ms": 200 },
	    { "kind": "strike", "on": "hit" }
	  ]
	}`))
	require.NotNil(t, def.Visual)
	require.Len(t, def.Visual.Layers, 5)

	assert.Equal(t, "thrust", def.Visual.Layers[0].Curve)
	assert.Equal(t, 200, def.Visual.Layers[0].MS)
	assert.Equal(t, "swing", def.Visual.Layers[1].Curve)
	assert.Equal(t, "overhead", def.Visual.Layers[2].Curve)
	assert.Equal(t, "bite", def.Visual.Layers[3].Curve)
	assert.Equal(t, "wolf-jaw", def.Visual.Layers[3].Body)
	assert.Empty(t, def.Visual.Layers[4].Curve, "an unauthored curve stays empty and the renderer supplies the kind's default")
}

// The wave (C3a amendment, PO 2026-09-21, asked for the mammoth stomp): rings
// expanding from the CASTER to the skill's reach. It plays once per cast, so
// `fired` is its only moment, and `count` stages a small number of them.
func TestVisual_Wave(t *testing.T) {
	def := mustParse(t, visualSkill("cooldown", `{
	  "layers": [
	    { "kind": "wave", "on": "fired", "ms": 500, "count": 2 },
	    { "kind": "wave", "on": "fired" }
	  ]
	}`))
	require.NotNil(t, def.Visual)
	require.Len(t, def.Visual.Layers, 2)

	assert.Equal(t, "wave", def.Visual.Layers[0].Kind)
	assert.Equal(t, 500, def.Visual.Layers[0].MS)
	assert.Equal(t, 2, def.Visual.Layers[0].Count)
	assert.Equal(t, 0, def.Visual.Layers[1].Count, "an unauthored count stays zero and the renderer draws the one ring it defaults to")
	assert.True(t, def.Visual.HasFired, "a wave is a `fired` layer, so the skill bills a FIRED event")
}

// The overwhelmingly common case: no `visual` at all. Nothing else changes.
func TestVisual_AbsentIsNil(t *testing.T) {
	def := mustParse(t, damageAuraJSON)
	assert.Nil(t, def.Visual)
}

// `body` is authored but UNCHECKED in C0: the atlas and the ERROR path are C3,
// and mapToSkillDefinition has no warning channel to degrade through.
func TestVisual_BodyIsUncheckedUntilTheAtlasExists(t *testing.T) {
	def := mustParse(t, visualSkill("active_aura",
		`{"layers":[{"kind":"strike","on":"hit","body":"no-such-body-anywhere"}]}`))
	require.NotNil(t, def.Visual)
	assert.Equal(t, "no-such-body-anywhere", def.Visual.Layers[0].Body)
}

func TestVisual_Refusals(t *testing.T) {
	cases := []struct {
		name     string
		category string
		visual   string
		contains []string
	}{
		{
			name:     "unknown kind",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"sparkle","on":"hit"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"sparkle"`},
		},
		{
			name:     "missing kind",
			category: "active_aura",
			visual:   `{"layers":[{"on":"hit"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", "kind"},
		},
		{
			// ⭐ The C3a amendment (§12g.1 item 3, §12g.2): `impact` left the
			// AUTHORING vocabulary outright, because the mark on the victim is
			// the engine's own now. A file that still authors one must
			// hard-fail rather than load and draw nothing, so content and code
			// can only land together.
			name:     "the retired impact kind",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"impact","on":"hit","curve":"burst","ms":200}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"impact"`, "the set is closed"},
		},
		{
			// `snap` went with it: the bite is an attack from the biter now, a
			// `strike` `bite`, and the old word must not be quietly ignored on
			// the kind that inherited the bite.
			name:     "the retired snap curve, on the kind that took the bite",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","curve":"snap","ms":160}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"strike"`, `"snap"`, "thrust", "swing", "overhead", "bite"},
		},
		{
			name:     "unknown trigger",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"whenever"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"whenever"`},
		},
		{
			name:     "missing trigger",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"on"`},
		},
		{
			name:     "trigger not legal for the kind",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"ambient"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"strike"`, `"ambient"`},
		},
		{
			name:     "a key the kind does not accept",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","speed":900}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"speed"`},
		},
		{
			name:     "a key no kind accepts",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","wobble":3}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"wobble"`},
		},
		{
			name:     "curve outside its set",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","curve":"wiggle"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"wiggle"`, "thrust"},
		},
		{
			// Curves are PER KIND (C2a, PO 2026-09-19): a beam plays flash or
			// extend, and a strike's thrust means nothing to it. A shared set
			// would load this clean and draw the beam's default forever.
			name:     "a strike curve on a beam",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"beam","on":"hit","curve":"thrust"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"beam"`, `"thrust"`, "flash", "extend"},
		},
		{
			name:     "a beam curve on a strike",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","curve":"flash"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"strike"`, `"flash"`, "thrust", "swing", "overhead"},
		},
		{
			// A strike is a weapon travelling from the attacker INTO a victim,
			// so it has no moment without one: `hit` and nothing else.
			name:     "a strike on the fired moment",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"fired"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"strike"`, `"fired"`, "hit"},
		},
		{
			name:     "a key the strike does not accept",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","speed":900}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"speed"`},
		},
		{
			// A wave leaves the caster once per cast and reaches whatever the
			// skill reaches, so it has no per-victim moment at all: `fired`
			// and nothing else (§12g.2). On `hit` it would draw one full set
			// of rings per victim, stacked on the same spot.
			name:     "a wave on the hit moment",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"wave","on":"hit"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"wave"`, `"hit"`, "fired"},
		},
		{
			name:     "a wave on the ambient moment",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"wave","on":"ambient"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"wave"`, `"ambient"`, "fired"},
		},
		{
			name:     "a key the wave does not accept",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"wave","on":"fired","curve":"burst"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"curve"`},
		},
		{
			name:     "wave count zero",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"wave","on":"fired","count":0}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"count"`, "1..3"},
		},
		{
			// The cap is the wave's own: past three staggered rings the set
			// reads as a smear rather than a pulse. Orbit and emitter have no
			// ceiling worth guessing at, so the cap is per kind.
			name:     "wave count above the cap",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"wave","on":"fired","count":4}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"count"`, "1..3"},
		},
		{
			// `chain` is the beam's alone: it re-reads one tick's hit events as
			// one polyline, which no other kind has a shape for.
			name:     "chain on a kind that is not a beam",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","chain":true}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"chain"`},
		},
		{
			name:     "motion outside its set",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"emitter","on":"ambient","motion":"drip"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"drip"`, "swirl"},
		},
		{
			name:     "ms zero",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","ms":0}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"ms"`},
		},
		{
			name:     "speed negative",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"projectile","on":"hit","speed":-1}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"speed"`},
		},
		{
			name:     "width zero",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"beam","on":"hit","width":0}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"width"`},
		},
		{
			name:     "scale zero",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","scale":0}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"scale"`},
		},
		{
			name:     "count zero",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"orbit","on":"fired","count":0}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"count"`},
		},
		{
			name:     "tint not lowercase hex",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","tint":"#3FA9F5"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"#3FA9F5"`},
		},
		{
			name:     "tint without the hash",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","tint":"3fa9f5"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"3fa9f5"`},
		},
		{
			name:     "visual present with an empty layer list",
			category: "active_aura",
			visual:   `{"layers":[]}`,
			contains: []string{`"Fixture"`, "layers"},
		},
		{
			name:     "visual present with no layers key at all",
			category: "active_aura",
			visual:   `{}`,
			contains: []string{`"Fixture"`, "layers"},
		},
		{
			name:     "the offending layer index is the real one",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit"},{"kind":"strike","on":"ambient"}]}`,
			contains: []string{"visual layer 1"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msg := visualErr(t, tc.category, tc.visual)
			for _, want := range tc.contains {
				assert.Contains(t, msg, want)
			}
		})
	}
}

// D2, enforced at load (PO 2026-09-19). "Passives only on their hit moments":
// a passive has no cast of its own and is never the running aura, and only an
// active aura has a "while active" moment at all, so ambient belongs to it
// alone. Both halves of each pair, so neither the rule nor its exception can
// rot into a blanket accept or a blanket refuse.
func TestVisual_D2TriggersByCategory(t *testing.T) {
	cases := []struct {
		category string
		on       string
		kind     string
		ok       bool
	}{
		{category: "passive", on: "hit", kind: "strike", ok: true},
		{category: "passive", on: "ambient", kind: "emitter", ok: false},
		{category: "passive", on: "fired", kind: "cast-pose", ok: false},
		// A wave is a `fired` layer and nothing else, so D2 is the whole of
		// its category rule: a passive has no cast to draw one on.
		{category: "passive", on: "fired", kind: "wave", ok: false},
		{category: "cooldown", on: "ambient", kind: "emitter", ok: false},
		{category: "cooldown", on: "fired", kind: "cast-pose", ok: true},
		{category: "cooldown", on: "fired", kind: "wave", ok: true},
		// PO 2026-09-20: the bow shows only when damage is done and aims at
		// the victim, so a cast-pose has a hit moment too.
		{category: "active_aura", on: "hit", kind: "cast-pose", ok: true},
		{category: "cooldown", on: "hit", kind: "strike", ok: true},
		{category: "active_aura", on: "ambient", kind: "emitter", ok: true},
		{category: "active_aura", on: "fired", kind: "orbit", ok: true},
		{category: "active_aura", on: "fired", kind: "wave", ok: true},
		{category: "active_aura", on: "hit", kind: "strike", ok: true},
	}
	for _, tc := range cases {
		t.Run(tc.category+"/"+tc.on+"/"+tc.kind, func(t *testing.T) {
			visual := fmt.Sprintf(`{"layers":[{"kind":%q,"on":%q}]}`, tc.kind, tc.on)
			if tc.ok {
				def := mustParse(t, visualSkill(tc.category, visual))
				require.NotNil(t, def.Visual)
				return
			}
			msg := visualErr(t, tc.category, visual)
			assert.Contains(t, msg, "D2", "the refusal must name the ruling it enforces")
			assert.Contains(t, msg, tc.category)
		})
	}
}

// Every category the loader knows has a trigger row, or the D2 gate would wave
// that category's layers through without anybody noticing.
func TestVisual_EveryCategoryHasATriggerRow(t *testing.T) {
	for name := range skillCategoryMap {
		assert.NotEmpty(t, visualTriggersByCategory[name],
			"skill category %q has no visualTriggersByCategory row", name)
	}
}

// The closed tables must agree with each other: a kind with no key row could
// author nothing, and a kind with no trigger row could be authored nowhere.
func TestVisual_TablesCoverEveryKind(t *testing.T) {
	for _, kind := range visualKinds {
		assert.NotEmpty(t, visualKeysByKind[kind], "kind %q has no key row", kind)
		assert.NotEmpty(t, visualTriggersByKind[kind], "kind %q has no trigger row", kind)
		for _, on := range visualTriggersByKind[kind] {
			assert.Contains(t, visualTriggers, on, "kind %q names trigger %q, which is not a trigger", kind, on)
		}
	}
	assert.Len(t, visualKeysByKind, len(visualKinds))
	assert.Len(t, visualTriggersByKind, len(visualKinds))
}

// Curves are per kind (C2a), so the curve table and the key table have to
// describe the same kinds from both sides: a kind reading `curve` with no
// curve row would refuse every value an author picked, and a curve row on a
// kind that does not read `curve` is a set nothing can reach.
func TestVisual_CurveTableMatchesTheKeyTable(t *testing.T) {
	for _, kind := range visualKinds {
		readsCurve := slices.Contains(visualKeysByKind[kind], "curve")
		_, hasCurves := visualCurvesByKind[kind]
		assert.Equal(t, readsCurve, hasCurves,
			"kind %q reads curve=%v but has a curve row=%v", kind, readsCurve, hasCurves)
	}
	for kind := range visualCurvesByKind {
		assert.Contains(t, visualKinds, kind, "visualCurvesByKind names %q, which is not a kind", kind)
	}
}

// ⭐ The acceptance set: §4.3's nine PO descriptions from 2026-09-11, each
// decomposed into layers by the plan and authored here with PLACEHOLDER
// numbers. "Every one of the nine is covered by the seven kinds with zero
// engine special-casing, which is the test the vocabulary has to keep
// passing" (§4.3). If a tenth animation cannot be written here, the answer is
// a plan amendment, not a quiet new kind.
//
// ⚑ The C3a amendment (§12g.1 item 2) put ONE engine special case back on
// purpose, and these layer counts are where it shows: the mark on the victim
// is drawn by the engine on every landed damage hit, so the four examples that
// used to author a landing `impact` now say one layer less, and the wolf bite
// is a `strike` `bite` from the BITER rather than teeth on the bitten. The
// descriptions are unchanged; what a file has to say about them shrank.
func TestVisual_TheNinePOExamples(t *testing.T) {
	cases := []struct {
		name     string
		category string
		visual   string
		layers   int
	}{
		{
			name:     "sword stab directly on the mob",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","body":"sword","curve":"thrust","ms":200}]}`,
			layers:   1,
		},
		{
			name:     "overhead mace, an arc from above the player down onto the mob",
			category: "active_aura",
			visual: `{"layers":[
			  {"kind":"strike","on":"hit","body":"mace","curve":"overhead","ms":460}]}`,
			layers: 1,
		},
		{
			name:     "wolf bite, the jaws reach over the victim and close",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"strike","on":"hit","body":"wolf-jaw","curve":"bite","ms":200}]}`,
			layers:   1,
		},
		{
			name:     "firebolt, straight line, constant speed",
			category: "active_aura",
			visual: `{"layers":[
			  {"kind":"projectile","on":"hit","body":"firebolt","speed":900}]}`,
			layers: 1,
		},
		{
			name:     "lightning, weak then bright and bold then fade",
			category: "cooldown",
			visual:   `{"layers":[{"kind":"beam","on":"hit","body":"lightning","curve":"flash","ms":420,"width":5}]}`,
			layers:   1,
		},
		{
			name:     "arrow, a bow in the hand and an arrow that flies and hits",
			category: "cooldown",
			visual: `{"layers":[
			  {"kind":"cast-pose","on":"fired","body":"bow","ms":250},
			  {"kind":"projectile","on":"hit","body":"arrow","speed":900}]}`,
			layers: 2,
		},
		{
			name:     "flame aura, pillars extend and return on up to three mobs",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"beam","on":"hit","body":"flame-pillar","curve":"extend","ms":600,"width":14}]}`,
			layers:   1,
		},
		{
			name:     "two axes spinning around the character, hitting everyone around",
			category: "cooldown",
			visual: `{"layers":[
			  {"kind":"orbit","on":"fired","body":"axe","count":2,"ms":3000}]}`,
			layers: 1,
		},
		{
			name:     "heal, green crosses and mist rise from the player's centre",
			category: "cooldown",
			visual: `{"layers":[
			  {"kind":"emitter","on":"fired","body":"cross","motion":"rise","count":8,"ms":900,"tint":"#5fd96a"},
			  {"kind":"emitter","on":"fired","body":"mist","motion":"rise","count":16,"ms":1400,"scale":1.4}]}`,
			layers: 2,
		},
	}
	require.Len(t, cases, 9, "the acceptance set is the NINE PO examples of plan-skill-vfx.md §4.3")
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			def := mustParse(t, visualSkill(tc.category, tc.visual))
			require.NotNil(t, def.Visual)
			assert.Len(t, def.Visual.Layers, tc.layers)
		})
	}
}

// --- HasFired, the FIRED emitter's gate (plan-skill-vfx.md §12a.4) ---

func TestVisual_HasFiredIsDerivedFromTheLayers(t *testing.T) {
	// An aura beats up to 30 times a second, so it bills a FIRED event only
	// when it actually draws on its beat. The flag is resolved once at load;
	// the emitter reads it and nothing else does.
	withFired := mustParseVisual(t, `{"layers":[{"kind":"emitter","on":"hit"},{"kind":"cast-pose","on":"fired"}]}`, "active_aura")
	assert.True(t, withFired.HasFired)

	hitOnly := mustParseVisual(t, `{"layers":[{"kind":"strike","on":"hit"}]}`, "active_aura")
	assert.False(t, hitOnly.HasFired)

	// A wave plays at no other moment, so authoring one is by itself the
	// decision to bill the event (C3a amendment, §12g.2).
	wave := mustParseVisual(t, `{"layers":[{"kind":"wave","on":"fired","ms":500,"count":2}]}`, "cooldown")
	assert.True(t, wave.HasFired)
}

func TestVisual_HasFiredIsNotAuthorable(t *testing.T) {
	// Derived, never authored: it carries `json:"-"`, so it stays off the HTTP
	// catalog and out of the content editor's round-trip.
	def := mustParseVisual(t, `{"layers":[{"kind":"cast-pose","on":"fired"}]}`, "active_aura")
	require.True(t, def.HasFired)

	out, err := json.Marshal(def)
	require.NoError(t, err)
	assert.NotContains(t, string(out), "HasFired")
	assert.NotContains(t, string(out), "hasFired")
}

func mustParseVisual(t *testing.T, raw, category string) *VisualDef {
	t.Helper()
	def, err := parseVisual(json.RawMessage(raw), category)
	require.NoError(t, err)
	require.NotNil(t, def)
	return def
}

// --- the `applied` trigger (plan-skill-vfx.md §12h, PO 2026-09-23) ---

// visualSkillWith is visualSkill with one authored effect, for the rules that
// read the effects: `applied` only fires where an over-time effect exists.
func visualSkillWith(category, visual, effect string) []byte {
	return []byte(fmt.Sprintf(
		`{"id":1,"name":"Fixture","category":%q,"maxLevel":1,"visual":%s,"effects":[%s]}`,
		category, visual, effect))
}

const (
	appliedDotAura    = `{"type":"dot_aura","radius":1,"tickInterval":20,"targetsEnemies":true,"damageHP":5,"dotTicks":3,"dotTickInterval":30}`
	appliedHotAura    = `{"type":"hot_aura","radius":1,"tickInterval":20,"healHP":5,"hotTicks":3,"hotTickInterval":30}`
	appliedDamageAura = `{"type":"damage_aura","radius":1,"tickInterval":20,"targetsEnemies":true,"damageHP":5}`
)

// An over-time skill may author `applied` for every kind that draws toward a
// victim: the look plays on application and on every refresh, and the ticks
// draw the engine's mark alone.
func TestVisual_AppliedLoadsOnAnOverTimeSkill(t *testing.T) {
	for _, effect := range []string{appliedDotAura, appliedHotAura} {
		for _, kind := range []string{"strike", "projectile", "beam", "cast-pose", "emitter"} {
			visual := fmt.Sprintf(`{"layers":[{"kind":%q,"on":"applied"}]}`, kind)
			def := mustParse(t, visualSkillWith("active_aura", visual, effect))
			require.NotNil(t, def.Visual, kind)
			assert.Equal(t, "applied", def.Visual.Layers[0].On)
			assert.False(t, def.Visual.HasFired, "an applied layer is not a fired one")
		}
	}
}

// Without an over-time effect nothing is ever applied, so the layer would load
// clean and never draw: the silent class, refused by name instead.
func TestVisual_AppliedRefusedWithoutAnOverTimeEffect(t *testing.T) {
	raw, err := parseSkillDefinition(visualSkillWith("active_aura",
		`{"layers":[{"kind":"projectile","on":"applied"}]}`, appliedDamageAura))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	require.Error(t, err)
	msg := err.Error()
	assert.Contains(t, msg, `"Fixture"`, "the refusal names the skill")
	for _, t4 := range []string{"dot_aura", "instant_dot", "hot_aura", "instant_hot"} {
		assert.Contains(t, msg, t4, "the refusal names the effect types that fire it")
	}
}

func TestVisual_AppliedRefusals(t *testing.T) {
	// D2: a passive dresses its hit alone.
	msg := visualErr(t, "passive", `{"layers":[{"kind":"strike","on":"applied"}]}`)
	assert.Contains(t, msg, "D2")
	// The kind table: a wave leaves the caster once per cast, an orbit
	// circles the actor; neither has a victim end to draw an application at.
	for _, kind := range []string{"wave", "orbit"} {
		msg := visualErr(t, "active_aura", fmt.Sprintf(`{"layers":[{"kind":%q,"on":"applied"}]}`, kind))
		assert.Contains(t, msg, `no "applied" moment`, kind)
	}
}

func TestVisual_AppliedCategoryRows(t *testing.T) {
	assert.Contains(t, visualTriggersByCategory["active_aura"], "applied")
	assert.Contains(t, visualTriggersByCategory["cooldown"], "applied")
	assert.NotContains(t, visualTriggersByCategory["passive"], "applied")
}
