package mobs

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/stretchr/testify/assert"
)

func TestResolveEntityType(t *testing.T) {
	// Override wins over name.
	got, ok := ResolveEntityType("Dodo", "ProvingBoss")
	assert.True(t, ok)
	assert.Equal(t, AuraApi.EntityTypeDodo, got, "the override resolves, not the name")

	// Empty override falls back to the name.
	got, ok = ResolveEntityType("", "Dodo")
	assert.True(t, ok)
	assert.Equal(t, AuraApi.EntityTypeDodo, got, "empty override → resolve the def name")

	// Unknown key → not ok.
	_, ok = ResolveEntityType("", "NoSuchWireType")
	assert.False(t, ok, "a name that is no EntityType is unresolvable")

	_, ok = ResolveEntityType("NoSuchWireType", "Dodo")
	assert.False(t, ok, "a bad override is unresolvable even when the name would resolve")
}
