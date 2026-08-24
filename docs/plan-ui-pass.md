# Plan: the UI pass - one consolidated pass over HUD, panels, dialogue and mobile

> **Status: COLLECTION 2026-08-24, not scheduled.** Created to end the
> scatter: UI work used to live in four places (`plan-ui-polish.md`
> §Deferred, `plan-playtest-feedback.md` round 9, CLAUDE.md's mobile open
> items, `plan-ui-font.md`). This doc is now the single home. It **owes a
> design session** before execution - nothing below is chunked yet, and the
> PO's font investigation (`plan-ui-font.md`) is still running. Slot per the
> 2026-08-24 ordering discussion: before the release map goes to playtesters.

## 1. Scope: what this pass owns

Everything player-facing chrome: HUD styling, panel chrome, dialogue UI,
journal, mobile layout, font. Explicitly NOT here: the entity-presentation
rework (backlog §39 - overlays, per-effect art, medallions; that is a
world-rendering conversation, not a HUD one) and any balance number.

## 2. The inventory (absorbed 2026-08-24)

### From `plan-ui-polish.md` §Deferred (the roadmap item-8 checklist rest)

1. Skill icons (game-icons.net sourcing).
2. Unlock/level-up popups - ruling already taken: via the in-game
   announcement system.
3. Ability-bar styling: hotkey labels, cooldown sweep, active highlight.
4. Resource/XP bar styling.
5. Minimap restyle.
6. Panel chrome.
7. Aura-VFX / tick-indicator polish pass.
8. Avatar picker + icon-unlock track - waits on `plan-avatar-system.md`;
   naturally follows the accounts half.
9. Flavor-description authoring pass (~47 one-liners, drafted for PO review).

### Tooltip maintenance debt (found 2026-07-29, was ui-polish §Deferred)

Chunk 1's thesis - tooltips auto-generate so they survive retunes - holds for
numbers, not for words. Three shapes, worst first:

1. ⚑ **Per-effect-type cases restate DESIGN RULINGS in client English with no
   link back** (e.g. "Any damage breaks it - including your own aura" retells
   `plan-faction-flips.md` §5.4). If a ruling changes, the tooltip lies and
   nothing catches it - no test can, the string IS the assertion. Direction:
   the faction-scope line (`2fffe9ee`) shape - data the server already
   resolved, rendered generically; partial fix is authoring the ruling as
   skill content (a `description` on the JSON).
2. **Content-keyed label tables degrade silently**: `GATED_TAG_LINES` knows
   only `smash`/`harvest`; `STAT_LABELS` misses the cost-reduction passive;
   `SELECTOR_LABELS` prints the raw enum for an unmapped selector. Related:
   `backlog.md` §35 tier 5. (The `TICKING_TYPES` silent-failure set named in
   CLAUDE.md's unowned leftovers is this same family.)
3. **24 `case` clauses vs 24 authored effect types** - the `default:` tripwire
   fires in a browser at runtime, not at build.

### From playtest round 9 (was `plan-playtest-feedback.md` §Intake)

- **Cleaner UI + cleaner dialogue UI** (round 9 item 2; the font half is
  `plan-ui-font.md` - read it FIRST, a swap always costs a size retune).
- **Journal opened during dialogue overlaps it** (round 9 item 3). Cheapest
  standalone fix if it ever ships early: one exclusivity rule - opening the
  journal closes the dialogue or vice versa; no visual redesign.

### Mobile (was CLAUDE.md Open items, deferred to this pass PO 2026-08-14)

- `#registrationNag` covers the open mobile ☰ sheet - the journal is
  unreachable on phones; `mobile-layout.mjs` leg 7 is legitimately red for
  exactly this. Mobile is playable meanwhile.
- Merge the two "J Journal" DOM nodes (since the quest tracker 2026-08-23 the
  sheet's `#journalButton` is mobile-only, `#questTrackerJournal` desktop-only
  - deliberate then, this pass inherits unifying them).
- Mobile perf ceiling, PO: "works for now". Cheapest next step:
  `MOBILE_MAX_RESOLUTION` 1.5; the minimap is a second per-frame GL context.

### Map/marker residue (was the "fast-travel + map tuning" open line)

- Map **marker sizing** - PO ruled it a non-issue for now (2026-08-14), lands
  here when the pass runs.

### Combat-readability residue (was `plan-intermission-triage.md`)

- Category-band width is a fixed 4 px regardless of aura size - switch to a
  fraction-of-radius with a px floor if a small multi-category ring ever
  reads badly.

## 3. Inputs for the design session

- `plan-ui-font.md` - the font groundwork + the PO's ongoing investigation.
- `docs/archive/plan-ui-polish.md` chunk 1 ledger - the tooltip conventions
  already ruled (full detail lines, anchored placement, colored labels).
- The round-9 screenshots / notes in `docs/archive/plan-playtest-feedback.md`.
- `frontend-design` skill for the aesthetic direction work.
