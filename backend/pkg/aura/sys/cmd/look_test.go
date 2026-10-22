package cmd

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

// fakeLookPlayer implements the slice of model.PlayerEntity LOOK touches.
type fakeLookPlayer struct {
	model.PlayerEntity
	portrait, ring uint16
}

func (f *fakeLookPlayer) Look() (uint16, uint16) { return f.portrait, f.ring }
func (f *fakeLookPlayer) SetLook(p, r uint16)    { f.portrait, f.ring = p, r }

func lookCatalog(t *testing.T) appearance.Catalog {
	t.Helper()
	item := func(id, slot, family string) *fstest.MapFile {
		fam := ""
		if family != "" {
			fam = fmt.Sprintf(`, "family": %q`, family)
		}
		return &fstest.MapFile{Data: []byte(fmt.Sprintf(`{"id": %q, "slot": %q%s, "starter": true, "name": "x"}`, id, slot, fam))}
	}
	c, err := appearance.Load(fstest.MapFS{
		"default.json":      item("default", "portrait", ""),
		"green-hood.json":   item("green-hood", "portrait", ""),
		"ring-plain.json":   item("ring-plain", "ring", "grey"),
		"ring-leather.json": item("ring-leather", "ring", "leather"),
	}, nil)
	require.NoError(t, err)
	return c
}

// plan-appearance.md C3: LOOK <item-id> wears any catalog item, the slot read
// off the item, the other slot left alone. Live only: nothing persists it.
func TestLookWearsAnyCatalogItem(t *testing.T) {
	looks := lookCatalog(t)
	look := lookCommand(looks)
	p := &fakeLookPlayer{portrait: 1, ring: 1}

	arg := "green-hood"
	require.NoError(t, look(nil, p, &arg))
	assert.Equal(t, looks.Wire(appearance.SlotPortrait, "green-hood"), p.portrait)
	assert.Equal(t, uint16(1), p.ring, "the ring stays")

	arg = "ring-plain"
	require.NoError(t, look(nil, p, &arg))
	assert.Equal(t, looks.Wire(appearance.SlotRing, "ring-plain"), p.ring)
	assert.Equal(t, looks.Wire(appearance.SlotPortrait, "green-hood"), p.portrait, "the portrait stays")

	arg = "nobody"
	assert.Error(t, look(nil, p, &arg))
	assert.Error(t, look(nil, p, nil))
}
