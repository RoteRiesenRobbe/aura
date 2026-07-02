package cmd

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
)

// fakeXpPlayer implements just enough of model.PlayerEntity for the XP
// command. The embedded nil interface panics on any method the test did not
// anticipate — a loud signal that the command grew.
type fakeXpPlayer struct {
	model.PlayerEntity
	gainedXp []uint64
}

func (f *fakeXpPlayer) AddExperience(xp uint64) {
	f.gainedXp = append(f.gainedXp, xp)
}

func strPtr(s string) *string { return &s }

func TestXpCommand_AddsExperience(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, strPtr("500"))

	assert.NoError(t, err)
	assert.Equal(t, []uint64{500}, p.gainedXp)
}

func TestXpCommand_MissingArgument(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, nil)

	assert.Error(t, err)
	assert.Empty(t, p.gainedXp)
}

func TestXpCommand_EmptyArgument(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, strPtr(""))

	assert.Error(t, err)
	assert.Empty(t, p.gainedXp)
}

func TestXpCommand_NonNumericArgument(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, strPtr("lots"))

	assert.Error(t, err)
	assert.Empty(t, p.gainedXp)
}

func TestXpCommand_NegativeArgumentRejected(t *testing.T) {
	p := &fakeXpPlayer{}

	err := commands["XP"](nil, p, strPtr("-5"))

	assert.Error(t, err)
	assert.Empty(t, p.gainedXp)
}
