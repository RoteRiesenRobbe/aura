package sys

import (
	"slices"

	"github.com/google/uuid"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
)

// grantWatch is what a player's last appearance evaluation was taken against
// (plan-appearance.md C5, §4.4). The plan names four callers: the join, a
// level-up, a quest stage change and a skill raise. The last three are
// exactly the three revisions below, so one watch is all four callers: the
// first sight of a connection is the join's catch-up, and a change in any
// revision re-evaluates. It also catches the XP, SKILL and QUEST cheats,
// which a hook at each call site would have to be told about.
type grantWatch struct {
	level    uint32
	skillRev uint64
	questRev uint64
}

// grantAppearance runs the evaluator for every player whose watch moved.
// A handful of integer compares per player per tick, the saveWatch rule.
func (s *ConnectionStateSystem) grantAppearance() {
	for _, p := range s.players {
		clientUUID := p.Client().UUID()
		current := grantWatch{
			level:    p.Progression().Level,
			skillRev: p.SkillComponent().Revision(),
			questRev: p.QuestLedger().Revision(),
		}
		if watch, known := s.grantWatch[clientUUID]; known && watch == current {
			continue
		}
		s.grantWatch[clientUUID] = current
		s.grantEarned(p)
	}
}

// grantEarned is the evaluator, appearance.Grant(p) in the plan: every locked
// item not yet owned whose conditions p meets is owned from now on and
// announced. It only ever adds (D16): a respec, or anything else that later
// fails a condition, revokes nothing. The save persists the grant at its
// scope (saveWatch watches the owned set's size).
//
// What stays locked is listed with this player's progress for the owner
// block (C5c), through the conversation rows' lockReasons. The watch's
// revisions are a subset of the owner block's gate, so the tick a progress
// value moves is a tick the block is sent.
func (s *ConnectionStateSystem) grantEarned(p model.PlayerEntity) {
	owned := p.AppearanceOwned()
	var earned []uint16
	var locks []model.AppearanceLock
	for _, it := range s.looks.Gated() {
		flat := s.looks.Flat(it.ID)
		if slices.Contains(owned, flat) {
			continue
		}
		// ⚑ A stone gift's gate is empty and would pass: only a stone grants it.
		if it.StoneGift() {
			locks = append(locks, model.AppearanceLock{Item: flat, Reasons: []model.LockReason{{Kind: mobs.LockStoneGift}}})
			continue
		}
		if conditionsPass(it.Gate, p) {
			earned = append(earned, flat)
		} else {
			locks = append(locks, model.AppearanceLock{Item: flat, Reasons: lockReasons(it.Gate, p)})
		}
	}
	p.SetAppearanceLocks(locks)
	if len(earned) == 0 {
		return
	}
	next := append(slices.Clone(owned), earned...)
	slices.Sort(next)
	p.SetAppearanceOwned(next)
	for _, flat := range earned {
		// entity_id carries the item's flat index, the way a skill unlock
		// carries the skill id; the key tells the client which one it is.
		_ = p.Client().SendUnlock(uint64(flat), lang.Message{Key: lang.KeyUnlockAppearance,
			English: "Wear it under Appearance"})
	}
}

// forgetGrantWatch drops a client's evaluator bookkeeping with its save watch.
func (s *ConnectionStateSystem) forgetGrantWatch(clientUUID uuid.UUID) {
	delete(s.grantWatch, clientUUID)
}

// appearanceGrants is the owned set as the save names it: ids with the scope
// each is owned at (persist.CharacterState.AppearanceGrants).
func appearanceGrants(looks appearance.Catalog, owned []uint16) []persist.AppearanceGrant {
	var out []persist.AppearanceGrant
	for _, flat := range owned {
		if it, ok := looks.AtFlat(flat); ok && !it.Starter {
			out = append(out, persist.AppearanceGrant{Item: it.ID, Scope: string(it.Scope)})
		}
	}
	return out
}

// ascended is a player as the evaluator sees them one ascension later.
type ascended struct{ model.PlayerEntity }

func (a ascended) BloodlineAscensions() int { return a.PlayerEntity.BloodlineAscensions() + 1 }

// ascensionAppearance is what a sacrifice earns by count (D21a): every
// bloodline or account item not yet owned whose conditions pass at the new
// ascension count. Granted in AscendCharacter's transaction rather than at
// the heir's first join, so creation's picker and its preselect (D12) already
// see it. Character items stay out: they would land on the life that ends.
//
// The stone's bonus (C5b, D21c) follows: its stone gifts not yet owned. An id
// the catalog lacks is dropped (the loader checked the ids, so only a content
// change under a running channel reaches it).
func (s *ConnectionStateSystem) ascensionAppearance(p model.PlayerEntity, bonusLooks []string) []persist.AppearanceGrant {
	owned := p.AppearanceOwned()
	var out []persist.AppearanceGrant
	for _, it := range s.looks.Gated() {
		if it.Scope == appearance.ScopeCharacter || it.StoneGift() || slices.Contains(owned, s.looks.Flat(it.ID)) {
			continue
		}
		if conditionsPass(it.Gate, ascended{p}) {
			out = append(out, persist.AppearanceGrant{Item: it.ID, Scope: string(it.Scope)})
		}
	}
	for _, id := range bonusLooks {
		it, ok := s.looks.Item(id)
		if !ok || !it.StoneGift() || slices.Contains(owned, s.looks.Flat(id)) {
			continue
		}
		out = append(out, persist.AppearanceGrant{Item: it.ID, Scope: string(it.Scope)})
	}
	return out
}
