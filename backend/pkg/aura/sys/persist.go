package sys

import (
	"encoding/json"
	"log"
	"log/slog"
	"math/rand"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/google/uuid"
)

// saveIntervalTicks is the baseline autosave period per character: 5 minutes,
// the number the ~5-minute acceptable-crash-loss figure is the other half of
// (plan-accounts-implementation.md §1). [PLACEHOLDER]
//
// ⚑ NOT the session hold. reconnectStashTTLTicks is also ten-ish minutes and
// also about disconnected players, and the two once read the same — but one
// governs how much progress a crash can cost and the other how long a dropped
// socket stays resumable. Coupling them in code because the numbers rhyme is the
// mistake §1 calls out by name.
const saveIntervalTicks = 5 * 60 * constant.TicksPerSecond

// CharacterSaves accepts a finished character snapshot. Implemented by
// *persist.Writer.
//
// ⚑ Declared HERE as the narrowest thing the game needs, following the
// PlayTickets/AccountSessions precedent: the game must never hold a
// *store.Store, or a "just this once" synchronous query inside a save trigger
// becomes a two-line change instead of an architectural one. Save() is a memory
// copy; everything that talks SQL is on the other side of this interface.
type CharacterSaves interface {
	Save(state persist.CharacterState)
	// Failing reports that writes are not landing, so the world can say so
	// (implementation.md §5b). Silently accruing forty minutes of doomed
	// progress is worse than a warning.
	Failing() bool
}

// CharacterAscensions is the sacrifice transaction, seen from the loop
// (plan-ascension.md §4.6). Implemented by *persist.Ascender.
//
// ⚑ THE FIRST MID-SESSION GAME-WORLD→DB WRITE IN THE CODEBASE, and it is a
// second seam rather than a method on CharacterSaves because the two have
// opposite policies: a save is a fire-and-forget snapshot that may be retried
// and may be dropped, this is a one-shot irreversible transaction whose OUTCOME
// the loop must observe before it ends a session.
//
// ⚑ Completed() is drained on the loop, in the drainLogoutRequests style: the
// transaction finishes on another goroutine, and the world belongs to this one.
type CharacterAscensions interface {
	// Ascend requests one sacrifice. It returns immediately.
	Ascend(req persist.AscensionRequest)
	// Completed hands over every attempt that has finished since the last call.
	Completed() []persist.AscensionResult
}

// GraveyardNames is the memorial's roster, seen from the loop
// (plan-ascension.md C3 step 5, D11). Implemented by *persist.GraveyardReader.
//
// ⭐ THE THIRD SEAM, and it is a third one rather than a method on either
// existing seam because its POLICY is different from both: a save is
// fire-and-forget, an ascension is a one-shot transaction whose outcome the loop
// must observe, and this is a value that is simply always available and always
// slightly stale.
//
// ⚑ IT IS A READ, WHICH IS WHY IT IS A SNAPSHOT AT ALL. The memorial's rows come
// from a RowSource, and that contract forbids a provider querying a database:
// PresentRows runs per tick per conversing player (L15). So the database read
// happens on a timer on the other side of this seam, and the loop only ever
// takes what is already in memory.
//
// ⚑ Latest() must stay O(1) and allocation-free for that reason. The
// implementation is one atomic load.
type GraveyardNames interface {
	// Latest is the most recent listing: the newest names, and how many there
	// are in total so the memorial can say how many it is not showing.
	Latest() persist.Graveyard
}

// PersistenceSink is the game seen from cmd/aurad's wiring, following the
// CampfireAnchorSink / IdentitySink precedent.
type PersistenceSink interface {
	SetCharacterSaves(saves CharacterSaves)
	SetCharacterAscensions(ascensions CharacterAscensions)
	SetGraveyardNames(names GraveyardNames)
	FlushLiveCharacters(done chan<- struct{})
}

// saveWatch is what the last save of one live character was taken against.
// A change in any of the three forces the next save (§2's forced events); the
// tick is the interval baseline underneath them.
type saveWatch struct {
	nextTick uint64
	level    uint32
	skillRev uint64
	questRev uint64
	anchor   string
	// discovered is the SIZE of the discovered-campfire set, which is a faithful
	// change detector because the set only ever grows.
	//
	// ⚑ It is redundant against `anchor` today — discovery and the bind fire on
	// the same tick, so a new fire always moves both — and it is here precisely
	// so that stops being load-bearing. If the two triggers are ever separated,
	// the coupling breaks silently: discoveries would simply stop being saved
	// until something else forced a write.
	discovered int
}

// SetCharacterSaves installs the persistence writer.
//
// ⚑ Nil is a supported state, exactly like the identity seam: every existing
// test builds this system with a bare game, and a build with no writer must
// still run a world — it simply forgets everything, which is what the whole
// project did until this chunk.
func (s *ConnectionStateSystem) SetCharacterSaves(saves CharacterSaves) {
	s.saves = saves
}

// SetCharacterAscensions installs the sacrifice seam. Nil is supported for the
// same reason the writer's is: a build with no database behind it still runs a
// world, it simply cannot ascend anybody.
func (s *ConnectionStateSystem) SetCharacterAscensions(ascensions CharacterAscensions) {
	s.ascensions = ascensions
}

// RequestAscension asks for a character to be sacrificed, reporting whether the
// request was accepted. It is the loop-side entry point the ascension site's
// grant will call (C2); C1 builds and proves the machinery behind it.
//
// ⭐ IT PRICES NOTHING (plan-ascension-sites.md D1). This used to hold P1 — a
// `p.Progression().Level < levelCurve.MaxLevel` refusal, the same number the
// stone authored — and that duplication is exactly what a world of
// differently-priced sites cannot have: a stone gated at 25 would show its rows,
// take the pick, channel for ten seconds and then be refused here. The price is
// the SITE's, snapshotted onto the pick when the row is clicked and re-judged by
// applyAscension when the channel lands.
//
// ⚑ THE LIVE-PLAYER PROPERTY SURVIVED THE MOVE, and it is why neither check was
// ever in SQL: the character row's level is eventually consistent — saves are
// periodic, and the teardown below skips the final one on purpose — so a
// `level >= maxLevel` clause in the transaction would refuse a player who just
// reached it. Its replacement reads the live player through the same
// conditionsPass the panel used.
//
// ⚑ Accepting is not committing. The session survives until the transaction is
// observed to have succeeded; see drainAscensions.
func (s *ConnectionStateSystem) RequestAscension(p model.PlayerEntity, unlockKey string) bool {
	if s.ascensions == nil {
		return false
	}

	clientUUID := p.Client().UUID()
	accountID, characterID := s.accountByClient[clientUUID], s.characterByClient[clientUUID]
	if accountID == 0 || characterID == 0 {
		// No persisted identity behind this connection — a sim or test world.
		// There is no row to sacrifice, so there is nothing to do but refuse.
		return false
	}

	s.ascensions.Ascend(persist.AscensionRequest{
		AccountID:   accountID,
		CharacterID: characterID,
		ClientUUID:  clientUUID,
		UnlockKey:   unlockKey,
	})
	return true
}

// drainAscensions observes finished sacrifices and ends the sessions that
// committed.
//
// ⚑ A FAILED ATTEMPT COMMITS NOTHING — the transaction is atomic — so the
// character is still alive, still owns everything it owned, and simply keeps
// playing. Tearing down here would end a life the database still holds.
func (s *ConnectionStateSystem) drainAscensions() {
	if s.ascensions == nil {
		return
	}
	for _, done := range s.ascensions.Completed() {
		if done.Err != nil {
			// P14: the character is untouched, so nothing is lost — but a player
			// who just watched a ten-second ceremony is owed a word about why
			// they are still standing there.
			log.Printf("⚰️ ascension failed for character %d: %v", done.CharacterID, done.Err)
			if p := s.playerByClient(done.ClientUUID); p != nil {
				sayToPlayer(p, ascensionRefusedLine)
			}
			continue
		}
		log.Printf("⚰️ character %d ascended (account %d)", done.CharacterID, done.AccountID)
		s.endAscendedSession(done)
	}
}

// endAscendedSession tears down the world session of a character that no longer
// exists. Every line here is load-bearing and none of them is obvious.
func (s *ConnectionStateSystem) endAscendedSession(done persist.AscensionResult) {
	client := done.ClientUUID

	// ① THE SAVE KILL SWITCH, FIRST. saveCharacter refuses a connection with no
	// character id, and the disconnect that follows takes the ordinary save
	// trigger with it — so this is what stops a pre-sacrifice snapshot being
	// queued against a graveyard row.
	delete(s.characterByClient, client)
	s.forgetSaveWatch(client)

	// ② No account on the connection either, so the disconnect fan-out neither
	// stashes this account's session nor stamps the account onto anything. ⚑ It
	// matters because the release below happens NOW while the fan-out happens
	// whenever the socket actually goes: without this, that later Stash could
	// land on the successor's freshly claimed session.
	delete(s.accountByClient, client)

	// ③ No reconnect stash, in both directions: dropping the token makes
	// removeFromPlayers free the name instead of stashing (the stash is the one
	// path that would re-queue a pre-sacrifice snapshot minutes later), and
	// discardStashFor clears any stash this account already had.
	delete(s.tokenByClient, client)
	s.discardStashFor(done.AccountID)

	// ④ The socket goes. The player's client falls back to character-select,
	// which is exactly where the successor is created (§4.7).
	s.closeClient(client)

	// ⑤ RELEASED, not stashed — the difference between ascension and a dropped
	// socket. The player's very next action is creating their heir, and that
	// needs the account's one session slot free immediately rather than after
	// the stash TTL.
	if s.sessions != nil && done.AccountID != 0 {
		s.sessions.Release(done.AccountID)
	}
}

// FlushLiveCharacters queues a snapshot of every live character and closes done
// once they are all queued.
//
// ⚑ Called from the SIGTERM handler, on another goroutine, so it only POSTS the
// request — the loop performs it. Snapshotting s.players from a signal handler
// would race the game loop, the same reason logout has an inbox rather than a
// direct reach into the world.
//
// ⚑ Closing done means "queued", not "written". Durability is the writer's
// Flush, which is a separate wait with its own timeout, because the two can fail
// independently: a stuck loop and a stuck database want different diagnoses.
func (s *ConnectionStateSystem) FlushLiveCharacters(done chan<- struct{}) {
	s.flushRequests.Store(done, struct{}{})
}

// drainFlushRequests answers the shutdown flush on the loop.
func (s *ConnectionStateSystem) drainFlushRequests() {
	s.flushRequests.Range(func(key, _ any) bool {
		s.flushRequests.Delete(key)
		for _, p := range s.players {
			s.saveCharacter(p)
		}
		log.Printf("💾 flushed %d live character(s) for shutdown", len(s.players))
		if done, ok := key.(chan<- struct{}); ok {
			close(done)
		}
		return true
	})
}

// trackCharacterSaves is the save scheduler: the 5-minute interval plus §2's
// forced events, evaluated once per tick per live character.
//
// ⚑ Three integer comparisons per player, deliberately. "Did anything worth
// saving change" could also be answered by re-deriving the snapshot and
// comparing it, but that walks the spellbook ~30 times a second per player for
// an answer that is almost always no — and the idle loop's allocation
// discipline is a standing rule in this codebase, not a preference.
func (s *ConnectionStateSystem) trackCharacterSaves() {
	if s.saves == nil {
		return
	}
	now := s.game.Ticks()
	for _, p := range s.players {
		clientUUID := p.Client().UUID()
		if s.characterByClient[clientUUID] == 0 {
			continue // no row to write to (tests, and any pre-accounts join)
		}
		current := saveWatch{
			level:      p.Progression().Level,
			skillRev:   p.SkillComponent().Revision(),
			questRev:   p.QuestLedger().Revision(),
			anchor:     s.anchors[clientUUID],
			discovered: len(s.discovered[clientUUID]),
		}
		watch, known := s.saveWatch[clientUUID]
		if !known {
			// First sight: record the baseline and STAGGER the first interval
			// save somewhere inside the window, so a hundred players who joined
			// together do not all snapshot on the same tick five minutes later.
			current.nextTick = now + uint64(rand.Intn(saveIntervalTicks)) + 1
			s.saveWatch[clientUUID] = current
			continue
		}
		forced := current.level != watch.level ||
			current.skillRev != watch.skillRev ||
			current.questRev != watch.questRev ||
			current.anchor != watch.anchor ||
			current.discovered != watch.discovered
		if !forced && now < watch.nextTick {
			continue
		}
		s.saveCharacter(p)
		current.nextTick = now + saveIntervalTicks
		s.saveWatch[clientUUID] = current
	}
}

// saveCharacter queues a snapshot of one live player. A no-op without a writer
// or without a character row.
func (s *ConnectionStateSystem) saveCharacter(p model.PlayerEntity) {
	if s.saves == nil {
		return
	}
	characterID := s.characterByClient[p.Client().UUID()]
	if characterID == 0 {
		return
	}
	s.saves.Save(characterState(characterID, p.Name(), s.anchors[p.Client().UUID()],
		s.DiscoveredCampfires(p.Client().UUID()),
		p.Progression(), p.SkillComponent(), p.QuestLedger()))
}

// saveStash queues a snapshot of a DISCONNECTED character from its stash — §2's
// session-expiry trigger.
//
// ⚑ It looks redundant against the disconnect save, and mostly is: nothing
// mutates a stashed character, so the snapshot is normally byte-identical and
// the writer's fingerprint drops it without a write. It earns its place in the
// case where the disconnect save never landed — the database was down for those
// ten minutes and has since come back — which is precisely when the write
// matters most.
func (s *ConnectionStateSystem) saveStash(stash reconnectStash) {
	if s.saves == nil || stash.characterID == 0 {
		return
	}
	s.saves.Save(characterState(stash.characterID, stash.name, stash.anchor,
		sortedSet(stash.discovered),
		stash.progression, stash.skills, stash.quests))
}

// characterState is THE save half of plan-accounts-implementation.md §4's
// field-by-field mapping. Its load half is restoreCharacterState below, and the
// two are kept adjacent on purpose: a column written by one and ignored by the
// other is the classic silent persistence bug, and it is invisible from either
// side alone.
//
// It takes the pieces rather than a player because the session-expiry trigger
// snapshots a stash, which has no player left to ask.
//
// ⚑ homeCampfireID and discovered are passed in rather than read off the player
// because a character's bind and its discovered set are CONNECTION state
// (s.anchors, s.discovered), not player state — and the session-expiry save has
// neither, only a stash.
func characterState(characterID int64, name, homeCampfireID string, discovered []string,
	prog model.PlayerProgression, sc *skills.SkillComponent, ledger *quests.Ledger) persist.CharacterState {

	state := persist.CharacterState{
		CharacterID:         characterID,
		Name:                name,
		HomeCampfireID:      homeCampfireID,
		DiscoveredCampfires: discovered,
		Level:               int(prog.Level),
		Experience:          int64(prog.Experience),
		ActiveAuraSlot:      persist.NoActiveAura,
		Spellbook:           map[int32]int{},
	}
	if sc != nil {
		state.ActiveAuraSlot = sc.ActiveAuraSlot
		for id, level := range sc.Spellbook {
			state.Spellbook[int32(id)] = level
		}
		state.Loadout = loadoutSlots(sc)
	}

	flags, err := quests.EncodeFlags(ledger)
	if err != nil {
		// The quest half is lost, the rest is not. Dropping the whole snapshot
		// would turn one unserialisable ledger into permanent silent progress
		// loss for that character.
		slog.Error("💾 could not encode a quest ledger for saving",
			slog.Int64("character_id", characterID), slog.String("name", name), slog.Any("err", err))
		flags = map[string]json.RawMessage{}
	}
	state.Flags = persist.CanonicalFlags(flags)
	return state
}

// loadoutSlots projects the three slot arrays into rows. Occupied slots only —
// an empty slot is an absent row (persist.LoadoutSlot).
func loadoutSlots(sc *skills.SkillComponent) []persist.LoadoutSlot {
	var slots []persist.LoadoutSlot
	appendSlots := func(slotType string, equipped []*skills.EquippedSkill) {
		for i, es := range equipped {
			if es == nil || es.Def == nil {
				continue
			}
			slots = append(slots, persist.LoadoutSlot{
				Type: slotType, Index: i, SkillID: int32(es.Def.ID),
			})
		}
	}
	appendSlots(persist.SlotAura, sc.AuraSlots[:])
	appendSlots(persist.SlotPassive, sc.PassiveSlots[:])
	appendSlots(persist.SlotCooldown, sc.CooldownSlots[:])
	persist.SortLoadout(slots)
	return slots
}

// restoreCharacterState is the LOAD half of the §4 mapping — read it beside
// characterState above.
//
// ⚑ An EMPTY SPELLBOOK MEANS "never saved", and the skill component is left
// exactly as player.New built it. A played character always knows at least one
// skill, so the two cases cannot collide; clearing unconditionally would take a
// brand-new character's starting state away on their first join.
//
// ⚑ A loadout slot naming a skill the registry no longer has is SKIPPED, not
// fatal. Content is authored and can retire a skill, and refusing to load the
// character would lock them out of the game over a slot they can re-fill in one
// click.
// seedBloodlineUnlocks discovers every skill this character's SLOT has unlocked
// across its past ascensions (plan-ascension.md D16). The keys ride the play
// ticket, resolved off-loop at /select, because the game loop must never query
// the database to answer a Join.
//
// ⚑ IT DISCOVERS, IT DOES NOT EQUIP. The creation seed pre-equips its starting
// aura because a brand-new character has empty slots to fill; a bloodline gift
// arriving on an established character does not — equipping would put back, on
// every single login, a skill the player deliberately took off.
//
// ⚑ Idempotent by construction, which is what makes "reapply on every join
// until the first save persists them" harmless: Discover only writes level 1
// into an entry that is 0, so a bloodline skill trained to 4 stays at 4.
//
// ⚑ A key naming a skill that no longer exists is DROPPED, not fatal — the same
// stance restoreCharacterState takes for a retired spellbook entry. The
// database holds what a bloodline picked historically and the catalog is free
// to change under it.
func seedBloodlineUnlocks(p model.PlayerEntity, keys []string, registry skills.Registry) {
	if len(keys) == 0 {
		return
	}
	sc := p.SkillComponent()
	discovered := false
	for _, key := range keys {
		def, err := registry.GetByName(key)
		if err != nil {
			slog.Warn("dropping a bloodline unlock for a skill that no longer exists",
				slog.String("player", p.Name()), slog.String("unlock_key", key))
			continue
		}
		if sc.HasDiscovered(def.ID) {
			continue
		}
		sc.Discover(def.ID)
		discovered = true
	}
	// A bloodline skill can complete a combination recipe, exactly as any other
	// discovery can. Skipped when nothing was new, so a returning character does
	// not pay for a cascade that cannot change anything.
	if discovered {
		p.ApplyRecipeCascade()
	}
}

func restoreCharacterState(p model.PlayerEntity, state persist.CharacterState, registry skills.Registry) {
	if state.Level >= 1 {
		p.SetProgression(model.PlayerProgression{
			Level:      uint32(state.Level),
			Experience: uint64(state.Experience),
		})
	}

	if ledgerState, err := quests.DecodeFlags(state.Flags); err != nil {
		slog.Error("could not decode a character's quest flags",
			slog.Int64("character_id", state.CharacterID), slog.Any("err", err))
	} else {
		p.QuestLedger().Restore(ledgerState)
	}

	if len(state.Spellbook) == 0 {
		return
	}

	sc := p.SkillComponent()
	for id, level := range state.Spellbook {
		// The loadout rule below, applied to its sibling (R4 C1): a retired
		// skill is skipped, not fatal. Left unvalidated, a ghost id survives
		// into live state, onto the wire (Discovered() ships raw ids) and
		// into SpentPoints, which prices an unresolvable entry pessimistically
		// against its own level — points the player could never refund.
		if _, err := registry.Get(skills.SkillID(id)); err != nil {
			slog.Warn("dropping a spellbook entry for a skill that no longer exists",
				slog.Int64("character_id", state.CharacterID),
				slog.Int("skill_id", int(id)))
			continue
		}
		if level < 1 {
			level = 1
		}
		sc.Spellbook[skills.SkillID(id)] = level
	}
	for _, slot := range state.Loadout {
		def, err := registry.Get(skills.SkillID(slot.SkillID))
		if err != nil {
			slog.Warn("dropping a loadout slot for a skill that no longer exists",
				slog.Int64("character_id", state.CharacterID),
				slog.String("slot_type", slot.Type),
				slog.Int("slot_index", slot.Index),
				slog.Int("skill_id", int(slot.SkillID)))
			continue
		}
		level := sc.Spellbook[def.ID]
		if level < 1 {
			level = 1
		}
		switch slot.Type {
		case persist.SlotAura:
			if slot.Index >= 0 && slot.Index < skills.MaxAuraSlots {
				sc.EquipAura(slot.Index, def, level)
			}
		case persist.SlotPassive:
			if slot.Index >= 0 && slot.Index < skills.MaxPassiveSlots {
				sc.EquipPassive(slot.Index, def, level)
			}
		case persist.SlotCooldown:
			if slot.Index >= 0 && slot.Index < skills.MaxCooldownSlots {
				sc.EquipCooldown(slot.Index, def, level)
			}
		}
	}
	// Equipping happens first so the index points at something.
	sc.SetActiveAura(state.ActiveAuraSlot)

	// Combination recipes are content, not state: re-running the cascade means a
	// recipe authored since the last save still fires for a returning character
	// (plan-accounts-schema.md — discoveries "fall out of the spellbook via the
	// recipe cascade" and are deliberately not stored).
	p.ApplyRecipeCascade()

	// ⚑ Health LAST, for the triage-item-14 reason the respawn path documents:
	// MaxHealth reads the +maxHealth passives that were only just re-equipped,
	// so a pool stamped before this point is the base one.
	p.VitalSigns().Health = p.MaxHealth()
}

// saveFailureGraceTicks is how long writes must keep failing before players are
// told, and saveFailureWarnIntervalTicks how often they are reminded.
// [PLACEHOLDER]
//
// ⚑ The grace period is the difference between a warning and an alarm. The
// writer reports Failing() after ONE failed attempt, which a single blip or a
// database restart produces routinely and the retry ladder then fixes on its
// own; warning on that would train players to ignore the message that matters.
const (
	saveFailureGraceTicks        = 30 * constant.TicksPerSecond
	saveFailureWarnIntervalTicks = 120 * constant.TicksPerSecond
)

// warnAboutFailingSaves tells live players when their progress is not reaching
// the database — implementation.md §5b's "persistent in-client warning".
//
// ⚑ It rides the existing journal-banner channel rather than adding a wire
// message. The client renders a Journal EntityMessage's text verbatim in the
// alert banner, so this needs no schema change, no regenerated bindings and no
// frontend work — and the one chunk that may touch client.fbs should not be
// spent on a string the wire can already carry.
func (s *ConnectionStateSystem) warnAboutFailingSaves() {
	if s.saves == nil {
		return
	}
	now := s.game.Ticks()
	if !s.saves.Failing() {
		if s.saveWarningSent {
			s.tellPlayers("Your progress is being saved again.")
		}
		s.saveFailureActive, s.saveWarningSent = false, false
		return
	}
	// ⚑ A separate flag rather than `failingSince == 0`: tick 0 is a real tick,
	// and a zero-value sentinel would leave a failure that started on the very
	// first tick permanently "just noticed" and never warned about.
	if !s.saveFailureActive {
		s.saveFailureActive, s.failingSince = true, now
		return
	}
	if now-s.failingSince < saveFailureGraceTicks {
		return
	}
	if s.saveWarningSent && now-s.lastSaveWarning < saveFailureWarnIntervalTicks {
		return
	}
	s.saveWarningSent, s.lastSaveWarning = true, now
	s.tellPlayers("⚠ Aura cannot save your progress right now. Recent progress may be lost.")
}

// tellPlayers puts one line in front of every live player.
func (s *ConnectionStateSystem) tellPlayers(text string) {
	for _, p := range s.players {
		_ = p.Client().SendJournal(text)
	}
}

// forgetSaveWatch drops a client's save bookkeeping. Called wherever the
// connection's world presence ends.
func (s *ConnectionStateSystem) forgetSaveWatch(clientUUID uuid.UUID) {
	delete(s.saveWatch, clientUUID)
}
