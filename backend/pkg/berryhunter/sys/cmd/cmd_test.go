package cmd

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
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

// --- SKILL cheat (item 11 Phase 2 Step 4) ---

// fakeSkillPlayer implements the slice of model.PlayerEntity the SKILL
// command touches: spellbook discovery + the recipe cascade.
type fakeSkillPlayer struct {
	model.PlayerEntity
	sc       *skills.SkillComponent
	cascades int
}

func (f *fakeSkillPlayer) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeSkillPlayer) ApplyRecipeCascade()                    { f.cascades++ }

// fakeSkillGame provides the skill registry the SKILL command resolves names
// against.
type fakeSkillGame struct {
	model.Game
	registry skills.Registry
}

func (f *fakeSkillGame) Skills() skills.Registry { return f.registry }

func skillTestGame(t *testing.T) *fakeSkillGame {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"fire-ward.json": {Data: []byte(`{
		  "id": 40, "name": "FireWard", "category": "active_aura", "maxLevel": 3,
		  "effects": [{"type": "resist_aura", "radius": 1.5, "resistTags": ["fire"], "resistFactor": 0.6, "targetsAllies": true, "targetsSelf": true}]
		}`)},
	})
	require.NoError(t, err)
	return &fakeSkillGame{registry: r}
}

func TestSkillCommand_DiscoversByNameAndCascades(t *testing.T) {
	g := skillTestGame(t)
	p := &fakeSkillPlayer{sc: skills.NewSkillComponent(true)}

	err := commands["SKILL"](g, p, strPtr("FireWard"))

	assert.NoError(t, err)
	assert.True(t, p.sc.HasDiscovered(skills.SkillID(40)))
	assert.Equal(t, 1, p.cascades, "discovery must run the recipe cascade like real unlock paths")
}

func TestSkillCommand_UnknownNameFails(t *testing.T) {
	g := skillTestGame(t)
	p := &fakeSkillPlayer{sc: skills.NewSkillComponent(true)}

	err := commands["SKILL"](g, p, strPtr("NoSuchSkill"))

	assert.Error(t, err)
	assert.Empty(t, p.sc.Spellbook)
}

func TestSkillCommand_MissingArgument(t *testing.T) {
	g := skillTestGame(t)
	p := &fakeSkillPlayer{sc: skills.NewSkillComponent(true)}

	assert.Error(t, commands["SKILL"](g, p, nil))
	assert.Error(t, commands["SKILL"](g, p, strPtr("")))
}
