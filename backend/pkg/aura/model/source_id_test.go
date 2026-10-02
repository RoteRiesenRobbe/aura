package model

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
)

type sourceIDEntity struct{ b ecs.BasicEntity }

func (e sourceIDEntity) Basic() ecs.BasicEntity { return e.b }

type sourceIDArea struct{}

func (sourceIDArea) AreaEffectName() string { return "Blight" }
func (sourceIDArea) AreaID() uint64         { return 1<<32 + 1 }

// SourceID is the buff tray's caster key (plan-buff-tray.md C1): an entity by
// id, a place by its area id, anything else 0 rather than a panic.
func TestSourceID_EntityAreaOrNothing(t *testing.T) {
	e := sourceIDEntity{b: ecs.NewBasic()}
	assert.Equal(t, e.b.ID(), SourceID(e))
	assert.Equal(t, uint64(1<<32+1), SourceID(sourceIDArea{}))
	assert.Zero(t, SourceID(nil))
	assert.Zero(t, SourceID("a test double"))
}
