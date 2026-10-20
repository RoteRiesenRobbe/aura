package core

import (
	"testing"

	flatbuffers "github.com/google/flatbuffers/go"
	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

// plan-appearance.md C3: a player's look rides Character to every client, the
// own player's marshal and everybody else's alike.
func TestCharacterCarriesTheLook(t *testing.T) {
	p, _ := newWirePlayer(t)
	p.SetLook(3, 2)

	for name, marshal := range map[string]func(model.PlayerEntity, *flatbuffers.Builder) flatbuffers.UOffsetT{
		"own":   codec.CharacterMarshalFlatbuf,
		"other": codec.CharacterEntityFlatbufMarshal,
	} {
		b := flatbuffers.NewBuilder(256)
		b.Finish(marshal(p, b))
		c := AuraApi.GetRootAsCharacter(b.FinishedBytes(), 0)
		assert.Equal(t, uint16(3), c.Portrait(), name)
		assert.Equal(t, uint16(2), c.Ring(), name)
	}
}
