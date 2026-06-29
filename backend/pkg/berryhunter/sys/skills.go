package sys

import (
	"log"

	"github.com/EngoEngine/ecs"
	"github.com/trichner/berryhunter/pkg/berryhunter/minions"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// skillEntity is the minimal interface SkillSystem requires.
// Satisfied by PlayerEntity (and later MobEntity) once they expose SkillComponent().
type skillEntity interface {
	model.BasicEntity
	SkillComponent() *skills.SkillComponent
}

// SkillSystem iterates over all registered entities each tick and applies
// their active skills. Effect application is not yet implemented — this is
// the structural skeleton that establishes the system's place in the ECS loop.
type SkillSystem struct {
	entities []skillEntity
	logTick  int
}

func NewSkillSystem() *SkillSystem {
	return &SkillSystem{}
}

func (*SkillSystem) Priority() int {
	return -65
}

func (s *SkillSystem) New(w *ecs.World) {
	log.Println("SkillSystem nominal")
}

func (s *SkillSystem) AddEntity(e skillEntity) {
	s.entities = append(s.entities, e)
}

func (s *SkillSystem) Update(dt float32) {
	// ~30 ticks/s; log once per second to confirm the system is running.
	s.logTick++
	if s.logTick >= 30 {
		log.Printf("[SkillSystem] tick — %d skill entities tracked", len(s.entities))
		s.logTick = 0
	}
}

func (s *SkillSystem) Remove(e ecs.BasicEntity) {
	idx := minions.FindBasic(func(i int) model.BasicEntity { return s.entities[i] }, len(s.entities), e)
	if idx >= 0 {
		s.entities = append(s.entities[:idx], s.entities[idx+1:]...)
	}
}
