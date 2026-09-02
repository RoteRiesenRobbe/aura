package skills

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// UI pass C8 (plan-ui-pass.md §5 C8): the Go half of the skill-vocabulary pins,
// following the §35 C4c shared-constants contract pattern verbatim.
//
// api/shared-constants.json is the one authored home for the four content-keyed
// vocabularies the skill tooltip restates BY HAND on the client - a `case` per
// effect type in effectBlock(), plus the SELECTOR_LABELS / GATE_KEY_LINES /
// STAT_LABELS tables. The client twin
// (frontend/src/client-data/SharedConstants.test.ts) asserts those tables
// against the same file, so a new effect type, selector, gate key or stat goes
// red on whichever side has not caught up yet instead of silently rendering a
// raw enum name (or nothing) in a tooltip.
//
// The pins live in this package, not in cmd/aurad beside the other half of the
// contract, because effectTypeMap, selectorMap and validStats are unexported -
// the accounts-error-codes precedent (respond.go's code* consts).
//
// Each pin is exhaustive in BOTH directions: a fixture entry with no Go member
// fails, and a Go member with no fixture entry fails.
type skillVocabularies struct {
	EffectTypes       []string          `json:"effectTypes"`
	Selectors         []string          `json:"selectors"`
	GateKeys          []string          `json:"gateKeys"`
	StatNames         []string          `json:"statNames"`
	CostChargeTrigger map[string]string `json:"costChargeTrigger"`
}

func loadSkillVocabularies(t *testing.T) skillVocabularies {
	t.Helper()
	raw, err := os.ReadFile("../../../../api/shared-constants.json")
	require.NoError(t, err)
	var fixture skillVocabularies
	require.NoError(t, json.Unmarshal(raw, &fixture))
	return fixture
}

// mapKeys is spelled out rather than pulled from a helper package: these four
// maps have four different value types, and a two-line generic keeps the test
// file free of an import whose only purpose is this.
func mapKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func TestSharedConstants_EffectTypes(t *testing.T) {
	fixture := loadSkillVocabularies(t)
	require.NotEmpty(t, fixture.EffectTypes, "the fixture must carry an effectTypes list")

	assert.ElementsMatch(t, fixture.EffectTypes, mapKeys(effectTypeMap),
		"skills.effectTypeMap has drifted from api/shared-constants.json - the client's tooltip switch carries one case per name, and an unlisted type renders as a raw enum")
}

func TestSharedConstants_Selectors(t *testing.T) {
	fixture := loadSkillVocabularies(t)
	require.NotEmpty(t, fixture.Selectors, "the fixture must carry a selectors list")

	// The "" alias parses as nearest but is not a NAME: catalog.go's
	// reverseNames skips it for exactly that reason, so no served effect ever
	// carries it and the client has no label for it.
	names := make([]string, 0, len(selectorMap))
	for name := range selectorMap {
		if name == "" {
			continue
		}
		names = append(names, name)
	}
	assert.ElementsMatch(t, fixture.Selectors, names,
		"skills.selectorMap has drifted from api/shared-constants.json - the client's SELECTOR_LABELS is keyed by these names")
}

func TestSharedConstants_GateKeys(t *testing.T) {
	fixture := loadSkillVocabularies(t)
	require.NotEmpty(t, fixture.GateKeys, "the fixture must carry a gateKeys list")

	assert.ElementsMatch(t, fixture.GateKeys, mapKeys(GateKeys),
		"skills.GateKeys has drifted from api/shared-constants.json - the client's GATE_KEY_LINES explains each key in the tooltip, and this vocabulary is CLOSED")
}

func TestSharedConstants_StatNames(t *testing.T) {
	fixture := loadSkillVocabularies(t)
	require.NotEmpty(t, fixture.StatNames, "the fixture must carry a statNames list")

	assert.ElementsMatch(t, fixture.StatNames, mapKeys(validStats),
		"skills.validStats has drifted from api/shared-constants.json - the client's STAT_LABELS names each stat in the tooltip")
}

// The chargeable types are a SUBSET of the effect types, and cheap to tie
// together here: the costChargeTrigger block is pinned against the client's
// TICKING_TYPES on the other side, so this stops it naming a type that no
// longer exists (or was never spelled the same way).
func TestSharedConstants_CostChargeTriggerNamesEffectTypes(t *testing.T) {
	fixture := loadSkillVocabularies(t)
	require.NotEmpty(t, fixture.CostChargeTrigger, "the fixture must carry a costChargeTrigger block")

	for name := range fixture.CostChargeTrigger {
		assert.Contains(t, fixture.EffectTypes, name,
			"costChargeTrigger names %q, which is not in the effectTypes list", name)
		_, known := effectTypeMap[name]
		assert.True(t, known, "costChargeTrigger names %q, which skills.effectTypeMap does not parse", name)
	}
}
