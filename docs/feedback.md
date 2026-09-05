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
| 2026-08-30 | PO, at the C6 look | An armed `#confirmRow` (ascension confirm + countdown) stays on screen when the conversation closes (walking out of range) - `render()`'s closed branch hides the panel but never touches the confirm row | → ruled: FIXED same session, `b3283a2f` (red-first spec; record = that commit + the §6 C6 ledger note) |
| 2026-08-30 | PO, at the C7 look | The scrollbars should be "cooler and less invasive" - rounded edges, subtle, not the browser default | → ruled: APPLIED same session, `70486cc0` (one global slim 8px wood-thumb restyle in `HUD.less`; record = that commit + the §6 C7 ledger, incl. the ⛑ WebKit-pseudo-elements-only gotcha) |
| 2026-09-05 | PO, mid-session | **Content census tests must not go red just because content was added.** Three tests in `pkg/aura/items/mobs` hardcode a roster or a count and so fail on any new mob/NPC that is otherwise perfectly authored: `TestContent_ConversantCensus` (an explicit name list), `TestContent_AuthoredRoleCensus` (a creature COUNT), `TestContent_XPFactorZeroSpeciesAreNotPrey` (`assert.Len(free, 34)`). The collaborator's Martin NPC (`6c2e6d5c`) tripped all three and they stayed red at HEAD for weeks, which is the real damage - a permanently-red suite stops being read. PO call the same day: **martin.json deleted** (unplaced stub, TODO opening line, referenced by no zone or quest - suite green again), and the tests themselves are the thing to fix: they should assert the INVARIANT (a conversant resolves its grants; a creature is not a structure; an xpFactor-0 species is not prey) and not the population. | open - needs a door: the fix is a plan-sized pass over the three, or a ruling that a census is worth its churn |
