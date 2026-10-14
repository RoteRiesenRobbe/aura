package mob

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/stretchr/testify/assert"
)

// NeverHurtBy is the selector's question (plan-immune-targets.md §6, D2): can
// this SPECIES ever be damaged by a hit with these tags and this gate key? It
// reads the definition alone, with the math takeDamage already uses.

func mobWithFactors(f mobs.Factors) *Mob {
	def := testMobDefinition()
	def.Factors.Resistances = f.Resistances
	def.Factors.GateKeys = f.GateKeys
	return NewMob(def, 0, nil)
}

func TestNeverHurtBy_GateKeys(t *testing.T) {
	turnip := mobWithFactors(mobs.Factors{Resistances: map[string]float32{"*": 0}, GateKeys: []string{"harvest"}})
	wolf := mobWithFactors(mobs.Factors{})

	assert.False(t, turnip.NeverHurtBy(nil, "harvest"),
		"the key holder is hurt by its gate: a gated hit carries no tags, so the wildcard never reads")
	assert.True(t, turnip.NeverHurtBy(nil, "smash"), "a key the species does not list never opens")
	assert.True(t, wolf.NeverHurtBy(nil, "harvest"), "a mob that names no key is never hurt by a gated hit")
}

func TestNeverHurtBy_Resistances(t *testing.T) {
	bramble := mobWithFactors(mobs.Factors{Resistances: map[string]float32{"*": 0}, GateKeys: []string{"harvest"}})
	skeleton := mobWithFactors(mobs.Factors{Resistances: map[string]float32{"poison": 0}})
	bear := mobWithFactors(mobs.Factors{Resistances: map[string]float32{"frost": 0.25}})
	wolf := mobWithFactors(mobs.Factors{})

	assert.True(t, bramble.NeverHurtBy([]string{"physical"}, ""), "the wildcard zero")
	assert.True(t, skeleton.NeverHurtBy([]string{"poison"}, ""), "a tag zero")
	assert.False(t, skeleton.NeverHurtBy([]string{"physical"}, ""), "a zero on another tag")
	assert.True(t, skeleton.NeverHurtBy([]string{"physical", "poison"}, ""),
		"a multi-tag hit multiplies per tag (L4), exactly as takeDamage does")
	assert.False(t, bear.NeverHurtBy([]string{"frost"}, ""), "a partial resistance never counts (D3)")
	assert.False(t, wolf.NeverHurtBy([]string{"physical"}, ""), "no resistances")
}

// L1: a bubble and the scripted invulnerability are temporary state, never the
// species (D2). The predicate must not read either.
func TestNeverHurtBy_IgnoresTemporaryImmunity(t *testing.T) {
	m := mobWithFactors(mobs.Factors{})
	m.SetInvulnerable(true)

	assert.False(t, m.NeverHurtBy([]string{"physical"}, ""))
}
