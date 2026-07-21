package player

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
)

// healParticipationWindowTicks is how long a heal counts as combat
// participation (roadmap item 10): a healer of a mob's damage participant
// is rewarded on the mob's death if their last heal is at most this old.
// [PLACEHOLDER]
const healParticipationWindowTicks = 10 * constant.TicksPerSecond

type healerEntry struct {
	healer    model.PlayerEntity
	ticksLeft int
}

// NoteHealedBy registers (or refreshes) a healer for the participation window.
func (p *player) NoteHealedBy(healer model.PlayerEntity) {
	if p.recentHealers == nil {
		p.recentHealers = make(map[uint64]*healerEntry)
	}
	p.recentHealers[healer.Basic().ID()] = &healerEntry{
		healer:    healer,
		ticksLeft: healParticipationWindowTicks,
	}
}

// RecentHealers returns all healers still inside the participation window.
func (p *player) RecentHealers() []model.PlayerEntity {
	if len(p.recentHealers) == 0 {
		return nil
	}
	healers := make([]model.PlayerEntity, 0, len(p.recentHealers))
	for _, e := range p.recentHealers {
		healers = append(healers, e.healer)
	}
	return healers
}

// tickRecentHealers advances the participation window; called once per tick.
func (p *player) tickRecentHealers() {
	for id, e := range p.recentHealers {
		e.ticksLeft--
		if e.ticksLeft <= 0 {
			delete(p.recentHealers, id)
		}
	}
}
