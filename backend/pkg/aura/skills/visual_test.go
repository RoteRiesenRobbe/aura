package skills

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plan-skill-vfx.md C0. The vocabulary's acceptance set is §4.3's nine PO
// examples at the bottom of this file: every one of them must load, with no
// engine special-casing, or the seven kinds are the wrong seven.

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
func TestVisual_ParsesTheDocumentedExample(t *testing.T) {
	def := mustParse(t, visualSkill("cooldown", `{
	  "layers": [
	    { "kind": "cast-pose",  "on": "fired", "body": "bow",       "ms": 250 },
	    { "kind": "projectile", "on": "hit",   "body": "arrow",     "speed": 900 },
	    { "kind": "impact",     "on": "hit",   "body": "arrow-hit", "curve": "snap" }
	  ]
	}`))

	require.NotNil(t, def.Visual)
	require.Len(t, def.Visual.Layers, 3)

	assert.Equal(t, "cast-pose", def.Visual.Layers[0].Kind)
	assert.Equal(t, "fired", def.Visual.Layers[0].On)
	assert.Equal(t, "bow", def.Visual.Layers[0].Body)
	assert.Equal(t, 250, def.Visual.Layers[0].MS)

	assert.Equal(t, "projectile", def.Visual.Layers[1].Kind)
	assert.Equal(t, "arrow", def.Visual.Layers[1].Body)
	assert.InDelta(t, 900, def.Visual.Layers[1].Speed, 1e-6)

	assert.Equal(t, "impact", def.Visual.Layers[2].Kind)
	assert.Equal(t, "snap", def.Visual.Layers[2].Curve)
	assert.Equal(t, 0, def.Visual.Layers[2].MS, "an unauthored tunable stays at its zero value")
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

// The overwhelmingly common case: no `visual` at all. Nothing else changes.
func TestVisual_AbsentIsNil(t *testing.T) {
	def := mustParse(t, damageAuraJSON)
	assert.Nil(t, def.Visual)
}

// `body` is authored but UNCHECKED in C0: the atlas and the ERROR path are C3,
// and mapToSkillDefinition has no warning channel to degrade through.
func TestVisual_BodyIsUncheckedUntilTheAtlasExists(t *testing.T) {
	def := mustParse(t, visualSkill("active_aura",
		`{"layers":[{"kind":"impact","on":"hit","body":"no-such-body-anywhere"}]}`))
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
			name:     "unknown trigger",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"impact","on":"whenever"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"whenever"`},
		},
		{
			name:     "missing trigger",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"impact"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"on"`},
		},
		{
			name:     "trigger not legal for the kind",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"impact","on":"ambient"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"impact"`, `"ambient"`},
		},
		{
			name:     "a key the kind does not accept",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"impact","on":"hit","speed":900}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"speed"`},
		},
		{
			name:     "a key no kind accepts",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"impact","on":"hit","wobble":3}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"wobble"`},
		},
		{
			name:     "curve outside its set",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"impact","on":"hit","curve":"wiggle"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"wiggle"`, "thrust"},
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
			visual:   `{"layers":[{"kind":"impact","on":"hit","ms":0}]}`,
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
			visual:   `{"layers":[{"kind":"impact","on":"hit","scale":0}]}`,
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
			visual:   `{"layers":[{"kind":"impact","on":"hit","tint":"#3FA9F5"}]}`,
			contains: []string{`"Fixture"`, "visual layer 0", `"#3FA9F5"`},
		},
		{
			name:     "tint without the hash",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"impact","on":"hit","tint":"3fa9f5"}]}`,
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
			visual:   `{"layers":[{"kind":"impact","on":"hit"},{"kind":"impact","on":"ambient"}]}`,
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
		{category: "passive", on: "hit", kind: "impact", ok: true},
		{category: "passive", on: "ambient", kind: "emitter", ok: false},
		{category: "passive", on: "fired", kind: "cast-pose", ok: false},
		{category: "cooldown", on: "ambient", kind: "emitter", ok: false},
		{category: "cooldown", on: "fired", kind: "cast-pose", ok: true},
		{category: "cooldown", on: "hit", kind: "impact", ok: true},
		{category: "active_aura", on: "ambient", kind: "emitter", ok: true},
		{category: "active_aura", on: "fired", kind: "orbit", ok: true},
		{category: "active_aura", on: "hit", kind: "impact", ok: true},
	}
	for _, tc := range cases {
		t.Run(tc.category+"/"+tc.on, func(t *testing.T) {
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

// ⭐ The acceptance set: §4.3's nine PO descriptions from 2026-09-11, each
// decomposed into layers by the plan and authored here with PLACEHOLDER
// numbers. "Every one of the nine is covered by the seven kinds with zero
// engine special-casing, which is the test the vocabulary has to keep
// passing" (§4.3). If a tenth animation cannot be written here, the answer is
// a plan amendment, not a quiet new kind.
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
			visual:   `{"layers":[{"kind":"impact","on":"hit","body":"sword","curve":"thrust","ms":180}]}`,
			layers:   1,
		},
		{
			name:     "overhead mace, an arc from above the player down onto the mob",
			category: "active_aura",
			visual: `{"layers":[
			  {"kind":"arc-swing","on":"hit","body":"mace-arc","ms":320},
			  {"kind":"impact","on":"hit","body":"mace-hit","curve":"burst","ms":160}]}`,
			layers: 2,
		},
		{
			name:     "wolf bite, teeth appear and snap shut",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"impact","on":"hit","body":"wolf-teeth","curve":"snap","ms":160}]}`,
			layers:   1,
		},
		{
			name:     "firebolt, straight line, constant speed",
			category: "active_aura",
			visual: `{"layers":[
			  {"kind":"projectile","on":"hit","body":"firebolt","speed":900},
			  {"kind":"impact","on":"hit","body":"fire-burst","curve":"burst","ms":200}]}`,
			layers: 2,
		},
		{
			name:     "lightning, weak then bright and bold then fade",
			category: "cooldown",
			visual:   `{"layers":[{"kind":"beam","on":"hit","body":"lightning","ms":420,"width":0.35}]}`,
			layers:   1,
		},
		{
			name:     "arrow, a bow in the hand and an arrow that flies and hits",
			category: "cooldown",
			visual: `{"layers":[
			  {"kind":"cast-pose","on":"fired","body":"bow","ms":250},
			  {"kind":"projectile","on":"hit","body":"arrow","speed":900},
			  {"kind":"impact","on":"hit","body":"arrow-hit","curve":"snap","ms":150}]}`,
			layers: 3,
		},
		{
			name:     "flame aura, pillars extend and return on up to three mobs",
			category: "active_aura",
			visual:   `{"layers":[{"kind":"beam","on":"hit","body":"flame-pillar","ms":600,"width":0.5}]}`,
			layers:   1,
		},
		{
			name:     "two axes spinning around the character, hitting everyone around",
			category: "cooldown",
			visual: `{"layers":[
			  {"kind":"orbit","on":"fired","body":"axe","count":2,"ms":3000},
			  {"kind":"impact","on":"hit","body":"axe-hit","curve":"snap","ms":140}]}`,
			layers: 2,
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

	hitOnly := mustParseVisual(t, `{"layers":[{"kind":"impact","on":"hit"}]}`, "active_aura")
	assert.False(t, hitOnly.HasFired)
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
