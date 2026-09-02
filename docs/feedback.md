# Feedback intake

The single landing surface for raw feedback: playtest reports, PO observations,
bug sightings, things said out loud during a session. Established 2026-08-24 as
the successor to `plan-playtest-feedback.md`'s intake role (that doc is
archived; its remaining open items were redistributed the same day).

## The pipeline

1. **Capture.** Every item lands here as a dated row (source, one line).
   Capture is cheap; nothing is lost because it seemed small.
2. **Triage.** Every item leaves this doc through exactly one of four doors,
   normally in the same session or the next one:
   - **→ plan** - it is scheduled work; it moves into an existing or new
     `docs/plan-*.md` (link it from the row before pruning).
   - **→ ruled** - the PO decides it on the spot; the ruling is recorded where
     it belongs (a CLAUDE.md standing lock, a plan doc, a backlog entry) and
     the row closes.
   - **→ watch** - not now, but with a NAMED re-open trigger; it becomes a
     `backlog.md` entry carrying that trigger.
   - **→ dropped** - closed with a one-line why.
3. **Prune.** A row that has exited stays only until the wrap of the session
   that moved it; the receiving doc is the record. This file stays short - if
   it grows past a screen or two, triage is overdue.

Standing rules:

- **Plan docs never double as intake.** Accumulating feedback rounds inside a
  plan doc is what grew `plan-playtest-feedback.md` to 3,400 lines and made
  its open items invisible.
- Content ideas (specific mobs, skills, lore) still go to the `content-*.md`
  catalogs; unscoped feature/system ideas to `backlog.md`. This doc is the
  funnel, not the archive.
- A watch item without a trigger is not a watch item - name the condition that
  re-opens it or pick another door.

## Open items

| Date | Source | Item | State |
|---|---|---|---|
| 2026-07-29 | playtest-feedback open question 8 | Does the pacifist healer's threat table have any consumer besides Taunt (`ForceThreatToTop`)? If not, the uniformity ruling still stands - but it should be said explicitly rather than by accident. | open question, awaiting ruling |
| 2026-08-24 | PO mockups (chat) | Animation wishes: ice-aura particle field, punch/sword strike at the hit target, fireball + slow-bolt projectiles with impact-timed damage numbers. PO rulings same day: dressing over normal aura ticks (no new targeting mechanic), own player first, one strike per victim (most auras are nearest-1 BY CONTENT), lane = prototype branch. | → plan: prototype BUILT on `prototype/skill-visuals` (`f2e4083c`, 2026-08-25), PO first pass "works"; extended testing + feedback round pending, its verdict routes the ship version into `plan-entity-presentation.md` §6 (row prunes on that verdict) |
| 2026-09-02 | PO, at the C8 play | Hovering a teaching row's ability tooltip while taking it, when it is the LAST skill the teacher offers: the conversation closes and the tooltip stays until another ability is hovered. Cause (read from code): `attachTooltips` hides on `pointerout`/`pointerdown`, but the taught tree re-renders under a stationary pointer (a `pointerover` re-shows the tooltip on the rebuilt row), then the server closes the conversation and `render()`'s closed branch removes the rows - a removed element fires no `pointerout`, so nothing hides it. Same shape as the 2026-08-30 `#confirmRow` fix (`b3283a2f`). Options: (A) the closed branch calls `hideTooltip()` beside `closeConfirmRow()` - one line + a red-first `Conversation.test.ts` case, local to the one panel that closes server-side; (B) generic: `attachTooltips` watches its container (MutationObserver, childList+subtree) and hides when `currentAnchor` is no longer connected - covers every list that rebuilds under the pointer, slightly more machinery; (C) both, A for the named case now, B if a second panel shows the same orphan. | open, awaiting PO ruling (recommendation: A) |
| 2026-09-02 | PO, at the C8 play | Learning a new skill no longer shows any VFX on the shut spellbook telling the player to open it. The mechanism is intact (`c4b-breadcrumb` green: `.breadcrumb` lands on both open buttons, `::after` animates `hud-breadcrumb-pulse`), so this is a VISIBILITY problem, measured 2026-09-02 with the 50% keyframe rendered statically: nothing clips the overlay (button and `#gameUI` both `overflow: visible`), but the peak is an 8px-blur / 2.4px-spread halo at 45% gold whose spread sits OVER the 2.5px ink border (the `::after` is inset to the padding box since C6) and whose blur fades into the grass - on screen it is a faint warm rim on the border and nothing outside it; a fresh unlock usually also lights `.hasPoints` (gold border + text), which hides even that; the old 5 s `spellbook-unlock-pulse` still fires but on `#spellbook`, a panel that is SHUT at that moment since C3 (invisible by construction). Options: (A) make the trail louder on the OPEN BUTTONS only (bigger spread, higher alpha, maybe a gold text flash) - one keyframe/selector edit, keeps the C4b one-marker design; (B) fire the strong one-shot `unlockPulse` on the open buttons as well as on the panel when the book is shut - the C3-era "big gold flash" returns, then the quiet trail lingers; (C) a badge-style marker (a "new" dot or the count of unseen spells) on the button, which is state rather than animation and survives being looked away from. | open, awaiting PO ruling (recommendation: B, with A's louder trail as the follow-through) |
