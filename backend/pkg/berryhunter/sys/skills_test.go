package sys

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

type fakeSkillEntity struct {
	ecs.BasicEntity
	sc *skills.SkillComponent
}

func (f *fakeSkillEntity) Basic() ecs.BasicEntity {
	return f.BasicEntity
}

func (f *fakeSkillEntity) SkillComponent() *skills.SkillComponent {
	return f.sc
}

func TestSkillSystem_TracksAddedEntity(t *testing.T) {
	sk := NewSkillSystem()

	e := &fakeSkillEntity{
		BasicEntity: ecs.NewBasic(),
		sc:          skills.NewSkillComponent(true),
	}
	sk.AddEntity(e)

	assert.Len(t, sk.entities, 1)
	assert.Equal(t, e.ID(), sk.entities[0].Basic().ID())
}

func TestSkillSystem_UpdateDoesNotPanic(t *testing.T) {
	sk := NewSkillSystem()
	e := &fakeSkillEntity{BasicEntity: ecs.NewBasic(), sc: skills.NewSkillComponent(true)}
	sk.AddEntity(e)

	assert.NotPanics(t, func() { sk.Update(33.0) })
}

func TestSkillSystem_RemoveDropsEntity(t *testing.T) {
	sk := NewSkillSystem()

	e1 := &fakeSkillEntity{BasicEntity: ecs.NewBasic(), sc: skills.NewSkillComponent(true)}
	e2 := &fakeSkillEntity{BasicEntity: ecs.NewBasic(), sc: skills.NewSkillComponent(true)}
	sk.AddEntity(e1)
	sk.AddEntity(e2)

	sk.Remove(e1.BasicEntity)

	assert.Len(t, sk.entities, 1)
	assert.Equal(t, e2.ID(), sk.entities[0].Basic().ID())
}
