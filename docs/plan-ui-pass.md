# Plan: the UI pass - one consolidated pass over HUD, panels, dialogue and mobile

> **Status: ROADMAP SET 2026-08-25 · Phase 0 RATIFIED 2026-08-25 (direction
> C "Inked Panel", §4) · PHASE 1 CHUNKED 2026-08-26 (§5).** Created
> 2026-08-24 to end the scatter: UI work used to live in four places
> (`plan-ui-polish.md` §Deferred, `plan-playtest-feedback.md` round 9,
> CLAUDE.md's mobile open items, `plan-ui-font.md`). This doc is now the
> single home. The 2026-08-25 session added §4 (the phased path to done, with
> three PO rulings) and §2's boot-to-game surface inventory. The 2026-08-26
> session added §5: **C1 (the ink chrome) is detailed there and was executed
> the same session - then REDONE that day after the PO's look rejected the
> first build's wiggly band (§4 CORRECTION block, §6 ledger). The C2+ order
> was RATIFIED 2026-08-26 at the C2 session (choice prompt).**
> The PO's font investigation (`plan-ui-font.md`) is still running (PO-owned;
> design work does not block on it, ruling R3).

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
  ⚑ Since 2026-08-25 this is one instance of the GENERAL layering policy
  below - the policy owns it; this row stays only as the named worst case.

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

### Spellbook rework (PO 2026-08-25, via `feedback.md`)

Not chrome - a structural change to the spellbook panel, wanted alongside the
restyle:

1. **Openable, not always-on.** Today the spellbook sits permanently in the
   left column; it becomes a panel you open and close (hotkey + button, like
   the journal). Frees screen space in combat and is the natural fix for the
   mobile ☰-sheet crowding this pass already owns.
2. **Pagination.** The list scrolls today; a growing collection wants pages.
   (Fits the ratified direction: an openable, paginated *book* leans into the
   tabletop identity rather than fighting it.)
3. **Category grouping.** Sections beyond the three shipped categories
   (aura / passive / cooldown), e.g. "utility".
4. **Maybe a tag dropdown selector**, if spells get tags.

⚑ **The tag half has a data dimension the rest does not.** Skills carry no
tags today: tags mean an authoring vocabulary in `api/skills/*.json` plus the
`/skills` catalog serving them (small Go rider; `combatTarget`/the medallion
faction field are the precedent for a deliberate catalog exception). The
three shipped categories can section the book on day one with zero backend
work; the tag axis is separable and can land later without reshaping the
panel.

⚑ **Sequencing rule for the Phase 1 session: structure before chrome.** This
rework must be chunked BEFORE (or as the first part of) whatever chunk
restyles the spellbook, or the direction-C chrome gets built twice on two
different panel structures. The equip/spend interactions the harnesses drive
(`.spendBtn`, row-click equip, `#spellbookList li.selected`) must survive or
the scripts that use the spellbook as a fixture break in a body
(`chunk2-follower`, `r1-focus-cost`, `c1-front-stone`, …) - budget the
harness sweep into the chunk.

### Quest-tracker consolidation (PO 2026-08-26, via `feedback.md`)

The right-side tracker (M Map / J Journal buttons + per-quest entries) should
read as ONE piece of the journal, not a stack of same-looking individual
boxes: one panel that holds the journal header and all tracked quests, grows
with the quest count, and scrolls when it runs out of room. Today every quest
row is its own bordered box. Lands with **C7** (the journal restyle) - it is
tracker structure + chrome, and C7 already owns the journal family's look.

⚑ **Superseded at the C7 detailing session (2026-08-30): the shape is NOT
"one panel holding the journal header" any more** - see §5 C7 D2: a
WoW-classic text list on a plain scrim, buttons untouched. Execute from §5,
not from this paragraph.

### Layering & exclusivity policy (PO 2026-08-25, via `feedback.md`)

The biggest wish besides sizes: **what closes what, what may overlay what.**
Today panels open independently and stack (journal over dialogue is the named
worst case, round-9 item 3 above). The ask, in order of preference:

1. **An explicit open-combination policy** - only certain panels may be open
   together; opening one closes what it conflicts with. The policy is a
   design deliverable of its own (a small matrix: spellbook / journal /
   dialogue / map / settings / tooltip), not something each panel improvises.
2. **No overlap** where combinations are allowed - allowed-together panels
   get non-overlapping placement.
3. **Where stacking is unavoidable, NO transparency** - a panel that sits on
   another must be opaque so text never reads through text. (Direction C's
   panel background is 90% moss; the policy forces 100% on any panel in a
   stacking position - a token variant, not a new look.)

⚑ Existing behaviour the policy must not silently break, all harness-pinned:
the world map deliberately covers EVERY HUD panel (`c1-world-map`), settings
overlays start/end screens (`@z-settings`), Escape's close targets
(journal-not-map, `chunkC3-journal`), and the conversation panel's
non-blocking design (`chunk3b-ii-conversation`). The policy chunk re-rules
these on purpose or leaves them named exceptions - either way the affected
scripts get rewritten with the change, never left red.

### Ability-bar consolidation (PO 2026-08-25, via `feedback.md`)

Sizes are the other half of the wish; interactions and sortings stay as they
are.

1. **Icon-only slots.** The aura-slot and cooldown bars shrink to icons -
   no name text in the bar; the icon says what it is, hover keeps the full
   tooltip. Hotkey labels stay (they are §2 item 3's ask).
2. **Utility stands alone.** Recall and Camp become their own icons,
   independent of the spell bars.
3. ⭐ **SETTLED (PO 2026-08-25, "yeah that works" on the mockup): ONE
   bottom ability bar** - auras + cooldowns as one icon row with a wood
   divider between the families, the utility icons beside it as their own
   island. The ratified shape is the **"C - Icon Bar" board** on the Phase 0
   canvas (link in §4): slot anatomy active-rim / equipped / empty /
   cooldown-sweep, hotkey chips kept, spellbook closed. The split-bars
   fallback is dead.

⚑ **Hard dependency: icons must exist first.** Icon-only slots need §2 item
1 (skill icons, game-icons.net, in the ratified ink-ringed-token treatment) -
today skills have no icons at all, so the current Phase 2 shape (icons at
item 7, bars at item 2) is in the wrong order for this ask. The Phase 1
session re-orders: icon sourcing (at least for the shipped ability set)
moves ahead of or into the bar chunk.

⚑ Harness contract: scripts read slot names via `li[data-slot] .slotLabel`
and equip by clicking rows. Icon-only slots must keep the name in the DOM
(the tooltip/accessible label), or a body of scripts breaks at once
(`chunk2-follower`, `backlog33-prehot`, `chunkP-presence`, `r7-respec-cost`,
…). Budget the sweep into the bar chunk.

### Boot-to-game surfaces (inventory gap closed 2026-08-25)

The original inventory was HUD-heavy; these player-facing surfaces belong to
this pass too and were in no plan (seeded from `plan-localization.md` §1's
2026-08-23 text-surface survey and `plan-ui-font.md` §5.7, which found the
start and account screens carry three of the six small-caps sites and were
never screenshot in the font pass):

1. Start screen (incl. the `Capture Smallz` AURA logo - keep-or-replace is a
   font-plan open question, `plan-ui-font.md` §6.3).
2. Registration / login / account screens (14 accounts HTTP error messages
   render here; already key-shaped per `accounts/respond.go`).
3. Character-slot select (3 slots, soft-delete, per-slot bloodline history
   on the cards - `CharacterSelect.ts`).
4. Death / respawn overlay.
5. Settings surface (`GameSettings`: mute/volume today; localization D2 adds
   a language toggle here later).
6. Transient banners: "Connection lost" (incl. the backlog §47 wrong-message
   case), the registration nag, announcements (AlertBanner lane).

## 3. Inputs for the design session

- `plan-ui-font.md` - the font groundwork + the PO's ongoing investigation.
- `docs/archive/plan-ui-polish.md` chunk 1 ledger - the tooltip conventions
  already ruled (full detail lines, anchored placement, colored labels).
- The round-9 screenshots / notes in `docs/archive/plan-playtest-feedback.md`.
- `frontend-design` skill for the aesthetic direction work; the `design`
  canvas skill for producing PO-reactable mockups.
- `plan-entity-medallions.md` - the only ratified visual identity the project
  has ("the entity presentation is a token in a frame", PO art direction, an
  artist engaged through D16-D18). The HUD design language should harmonize
  with it, not be invented independently of it.

## 4. The path to done (roadmap set 2026-08-25, PO session)

### Rulings (PO 2026-08-25, choice prompts)

- **R1 - nothing hard-gates the release-map playtest.** "For that it just
  needs to be functional... any working state is enough, this will be a
  continuous process." The pass's focus is exactly **the UI elements no other
  plan owns** (the §2 inventory); the world-presentation lane keeps its own
  pace and its own plans. The earlier "before the release map goes to
  playtesters" slot is a target, not a gate.
- **R2 - the first concrete session is the design-language mockup session**
  (Phase 0 below), not the font decision and not more bookkeeping.
- **R3 - the font stays PO-owned and undecided.** The readability-vs-tone
  question (`plan-ui-font.md` §6.2) is deliberately open; design-language
  work does not block on the face. ⚑ One constraint hardened since the font
  doc was written: `plan-localization.md` D4 makes **glyph coverage for the
  shipped locales (German umlauts/ß) a hard requirement** on whatever face is
  picked; the current all-sans shortlist was never screened for it.

### Phase 0 - Direction (next up)

1. **Design-language mockup session** (R2, the named next session): 2-3
   reactable visual directions - palette, panel chrome style, bar styling,
   iconography direction, spacing rhythm - anchored on the medallion art
   direction, produced with the `design` canvas skill against real game
   screenshots. Output: a PO-ratified direction this doc records, which every
   Phase 2 chunk then executes against. No production code.

   **RAN 2026-08-25. The canvas (keep this link):**
   <https://claude.ai/code/artifact/770e98ea-d9de-4c86-bb04-1995add6f58e>

   Four boards: a baseline of today's UI (fresh HEAD screenshots of world+HUD,
   tooltip, journal, dialogue, creation, settings, plus the current
   `variables.less` tokens) and three directions varying ONE axis - how much
   of the medallion's token materiality enters the HUD chrome:
   - **A - Carved Table**: full materiality - wooden panels, leather straps,
     parchment tooltip, token-socket slots. Strongest identity tie, heaviest
     visual weight and build cost.
   - **B - Quiet Frame**: today's dark glass disciplined - one gold hairline,
     strict 8px rhythm, a small ring ornament per title, line icons. Best
     readability, cheapest, least distinctive.
   - **C - Inked Panel**: dark panels with thick irregular ink edges + wood
     inlay, wood header strips, mini-token slots where the wooden rim marks
     the ACTIVE slot (the medallions' D12 rule applied to the HUD). Middle
     cost; wants one reusable border treatment first.

   Constants across all three: layout untouched (chrome language only), every
   shipped semantic hue kept (focus crimson, XP purple, ember), type rendered
   in today's stone-age as an explicit placeholder (R3). Board A would fold
   the two golds into the medallion ring gold - flagged there explicitly.

   **⭐ RATIFIED (PO 2026-08-25, choice prompt): direction C - Inked Panel.**
   Every Phase 2 chunk executes against board C: dark panels with thick
   irregular ink edges + a thin wood inlay, wood header strips with gold
   small-caps, mini-token slots with the wooden rim marking the ACTIVE slot,
   ink-outlined bars, solid parchment glyphs in ink-ringed tokens
   (game-icons.net sourced), 10/14/22 spacing. C's named prerequisite rides
   into Phase 1: ONE reusable ink-border treatment (border-image or 9-slice)
   built before the panel chunks consume it. Palette adds moss #10261a, ink
   #14100b, wood #7c4f22, parchment #ecdcb8; both shipped golds and all
   semantic hues stay.

   ⚑ **CORRECTED (PO 2026-08-26, choice prompts): the SPEC is the RENDERED
   mockup CSS, not the board prose.** The prose above ("thick irregular ink
   edges", "border-image or 9-slice") produced a 14px wobbly 9-slice band in
   C1's first build; the PO rejected it on sight: *"I don't want this type of
   wiggly form around the UIs at all. we will make simple clean and slightly
   stylized UIs for now that work, look better than the current placeholder
   but might not be artistically finalized."* What board C actually renders
   (`.panelC`/`.hdrC` in the canvas artboards) and what is now ratified:
   - a STRAIGHT `3px solid @ink` border - no wobble, no band, no SVG asset;
   - a thin wood ring INSET inside it (`inset 0 0 0 2px fade(@wood, 45%)`)
     plus a soft drop shadow - PO confirmed this ink+inlay pair over a solid
     brown border;
   - the moss body at 90% stays (it is the mockup's panel field);
   - the one hand-drawn cue is the CORNER MOTIF: per-corner radii
     `13px 7px 15px 9px` - wider top-left/bottom-right, tighter
     top-right/bottom-left, repeated at smaller scale on buttons (9/5/10/6)
     and key chips (5/3/6/4). PO: keep exactly what the mockup uses;
   - the wood header strip (`linear-gradient(172deg, @wood, #5f3b18)`, gold
     title, 2px ink bottom edge, top radii 10px/4px) goes on OPEN-STATE UIs
     (journal, spellbook, ...) - it is part of the base treatment since the
     C1 redo, not a C6 extra;
   - the ability bar is the "C - Icon Bar" board verbatim (icon-only slots).
   ⛔ C6 and every later chunk style against THIS list; do not resurrect the
   band from the prose or from `git log`.

   ⭐ **Font RULED the same day** (full record + what stays open:
   `plan-ui-font.md` §6 banner): **stone-age is out of the HUD - one
   readable neutral sans everywhere**, hierarchy by weight/size/color, no
   small-caps. The C boards render it as Inter, the shippable stand-in for
   the Segoe class the PO picked by eye; the FAMILY is the remaining open
   pick (umlaut/ß screening required), and in-world Pixi text + the
   Capture Smallz logo are the two named open edges. This narrows R3: the
   direction is decided, only the family is still PO-owned.
2. **Font pick** (R3): lands whenever the PO's investigation is ripe.
   Preferred before the chrome chunks, because the size retune
   (`plan-ui-font.md` F3/F4) reflows every panel - but it does not block
   them (Phase 1 note).
3. ~~Surface inventory completion~~ - done 2026-08-25, §2 "Boot-to-game
   surfaces".

### Phase 1 - The chunking session

Runs once the **direction** is ratified; it does NOT wait on the font (R3 -
the investigation has no timeline, and R1's spirit is continuous progress).
If the face is still open, the font swap becomes its own chunk that lands
whenever the pick exists, accepting that it may force a second size retune
over already-styled panels. The session chunks the whole §2 inventory,
order the chunks, and pin per-chunk verification (the existing instruments:
`round4-tooltip.mjs` and `mobile-layout.mjs` own the text-bearing layout
assertions and are the natural regression gates for any size retune;
`mobile-layout.mjs` leg 7 stays legitimately red until the ☰-nag chunk).

### Phase 2 - Execution chunks (shape, not commitment)

Rough dependency order; the chunking session owns the real one:

1. Font swap + size retune, ideally first (it reflows everything under it);
   slips to whenever the pick exists per the Phase 1 note.
2. Panel chrome + resource/XP bars + ability bar + minimap (the §2 items
   3-6). ⚑ The §2 spellbook rework (openable/pagination/categories) lands
   BEFORE the spellbook's restyle - structure before chrome, see that
   section's sequencing rule. ⚑ The ability bar executes the §2
   consolidation (icon-only, one bar, utility separate) and therefore needs
   the ability-set icons FIRST - item 7's sourcing partially pulls forward.
3. Dialogue + journal (round-9 item 2's non-font half), and the §2
   **layering & exclusivity policy** - the policy matrix is designed once
   and every panel chunk executes against it, so it belongs at the FRONT of
   this group, not appended to it.
4. Tooltip maintenance debt (the three §2 shapes; direction: server-resolved
   data rendered generically, per the `2fffe9ee` counter-example).
5. Mobile (☰-sheet nag, the two "J Journal" nodes, marker sizing,
   `MOBILE_MAX_RESOLUTION` if perf asks).
6. Boot-to-game surfaces (§2's new list).
7. Skill icons + flavor descriptions (content-shaped riders; icons want the
   ratified iconography direction from Phase 0). ⚑ No longer purely last:
   the shipped-ability subset of the icons is a prerequisite of item 2's
   icon-only bar (see §2 "Ability-bar consolidation"); the long tail
   (every spellbook entry) can stay here.

### Lanes owned elsewhere (pointers, not scope)

- **World presentation**: `plan-entity-medallions.md` (first, PO 2026-08-24)
  → `plan-entity-presentation.md` (state layer + wire widening). Parallel by
  R1; the design languages should converge via the §3 anchor.
- **Avatar picker**: `plan-avatar-system.md`, sequenced after medallions
  D6/D7 (frame customization is claimed there); its persistence prerequisite
  has been satisfied since 8a.
- **Strings**: `plan-localization.md` C0-C4. Coordination point: C0's string
  extraction and this pass both touch every HUD surface; whichever runs
  second inherits merge friction, worth a sequencing word at the Phase 1
  session.

## 5. Phase 1 - the chunk plan (session 2026-08-26)

### Chunk order (⭐ RATIFIED as proposed, PO 2026-08-26, choice prompt at
### the C2 session; the PO may still reorder at any session touch)

Derived from §4 Phase 2's dependency shape plus the two §2 sequencing rules
(structure before chrome; icons before the icon-only bar):

- **C1 - the ink chrome** (the ratified prerequisite; built this session,
  redone same day after the PO's look, detail below).
- **C2 - the layering & exclusivity policy** (§2): the matrix designed once,
  at the FRONT of the panel group so every later panel chunk executes
  against it; re-rules or names the four harness-pinned exceptions.
  (Detailed + ruled below, 2026-08-26.)
- **C3 - spellbook structural rework** (§2): openable/pagination/categories,
  tags separable; structure before chrome; harness sweep budgeted.
  (Detailed + ruled below, 2026-08-27.)
- **C4 - skill icons, shipped-ability subset** (§2 item 1 pulled forward):
  game-icons.net sourcing in the ink-ringed-token treatment; prerequisite of
  C5. (Detailed + ruled below, 2026-08-28.)
- **C4b - the unlock breadcrumb trail** (PO-asked + slotted before C5 at the
  C4 wrap, 2026-08-28 - an amendment to the D4-ratified order): an UNSEEN
  new spell pulses the spellbook's open buttons lightly; opening the book
  moves the pulse to the spell's category tab; within that tab the pager
  pulses while the spell is off the current page; the row itself pulses in
  view. Every pulse stops only once ALL unseen spells have been seen.
  (Detailed + ruled below, 2026-08-29 - session-only by D1, so the
  reload-persistence question resolved to "does not survive, on purpose".)
- **C5 - the ONE ability bar**: the §2 consolidation (icon-only, wood
  divider, utility island) + direction-C restyle; `.slotLabel` DOM contract
  kept, harness sweep budgeted. (Detailed + ruled below, 2026-08-29.)
- **C6 - panel chrome rollout**: every `.panel-chrome()` caller plus the
  one-off panels (tooltip, `#confirmRow`) onto the C1 treatment; the C1
  header strip onto every open-state UI; resource/XP bars ink-outlined;
  minimap chrome. (Detailed + ruled below, 2026-08-30.)
- **C7 - dialogue + journal restyle** (round-9 item 2's non-font half),
  incl. the §2 quest-tracker consolidation (one tracker panel, not
  per-quest boxes; PO 2026-08-26). (Detailed + ruled below, 2026-08-30 -
  the tracker shape re-ruled at the session: a WoW-classic text list on a
  plain scrim, superseding the §2 "holds the journal header" wording.)
- **C8 - tooltip maintenance debt** (the three §2 shapes). (Detailed +
  ruled below, 2026-09-01 - the survey reframed it: no live gaps at HEAD,
  so pins + the served `description` field, not gap-filling.)
- **C9 - mobile** (☰-sheet nag, the two "J Journal" nodes, marker sizing,
  `MOBILE_MAX_RESOLUTION` if perf asks).
- **C10 - boot-to-game surfaces** (§2's list).
- **C11 - icon long tail + flavor descriptions**.
- **Font swap floats** (R3): its own chunk whenever the family pick exists;
  accepts a possible second size retune over already-styled panels.

### C1 - the ink chrome (detailed + executed 2026-08-26; REDONE same day)

**Deliverable:** the ONE reusable direction-C panel treatment (§4's named
prerequisite) as plain-CSS LESS mixins, proven on one pilot panel. NOT a
restyle of the HUD - the rollout is C6.

⚑ **History, kept so C6 does not repeat it:** the first build read §4's
prose ("thick irregular ink edges", "border-image or 9-slice") literally and
shipped a 14px wobbly 9-slice `ink-border.svg` band. The PO's look at the
pilot rejected the wiggly form outright; the §4 CORRECTION above records the
ruling and the real spec (the mockup's rendered `.panelC`/`.hdrC` CSS). The
SVG, its mixin and the whole border-image mechanism were deleted - none of
the band-era findings (shorthand ordering, background-clip, periodic edge
authoring, negative-padding subtraction) apply to the shipped treatment.

Scope as redone, all in `frontend/`:

1. **Four ratified palette tokens** in `variables.less`: `@moss #10261a`,
   `@ink #14100b`, `@wood #7c4f22`, `@parchment #ecdcb8`. ⚑ All four are
   OUTSIDE the `Theme.test.ts` pin set (`@brand`/`@gold-levelup`/
   `@focus-color`/`@shield-fill`/`@land-color`); the five pinned tokens stay
   untouched. The header's gold is the EXISTING `@gold-levelup #ffd75e` -
   the mockup uses that exact value, no fifth token.
2. **`.ink-panel-chrome()`** beside `.panel-chrome()` in `HUD.less`: moss
   body at 90%, straight 3px ink border, the 2px wood inset ring, corner
   motif `13px 7px 15px 9px`, soft drop shadow, unchanged @panel-padding.
   ⛔ NOT a rework of `.panel-chrome()` - flipping the shared mixin restyles
   every HUD panel at once, which is C6's job, not C1's.
3. **`.ink-panel-header(@pad-y, @pad-x)`**: the wood strip (gradient @wood →
   #5f3b18, 2px ink bottom edge, nested top radii 10px/4px), full-bleed to
   the border via NEGATIVE MARGINS sized to the panel padding (defaults to
   the @panel-padding split; a caller with custom padding passes its own).
4. **Pilot: `#journal`** - chrome + header strip (gold 600 title, parchment
   ✕). ⚑ Mobile is NOT untouched-by-construction any more: the fullscreen
   sheet resets `border`/`background`/`padding` but not `box-shadow`, and
   the header's negative margins are desktop-sized - `HUD.mobile.less` now
   explicitly resets box-shadow + the whole header treatment (incl. title/✕
   colors), keeping the phone's pre-C1 look wholesale. Verified by computed-
   style probe + screenshot.

**Verification tail:** `npm test` · `npm run typecheck` · `npm run build` ·
the `chunkC3-journal` harness · desktop + mobile screenshots. **Schema
NONE** (pure client CSS).

### C2 - the layering & exclusivity policy (detailed + ruled 2026-08-26)

**Deliverable:** the ruled open-combination matrix (recorded here, every
later panel chunk executes against it) plus ONE tiny central exclusivity
registry that enforces it, replacing today's ad-hoc cross-module close
calls. Behavior only: no chrome, no z-index changes (the `variables.less`
scale stays; `c1-world-map` check 9 - the map covers every HUD surface -
must stay green untouched). **Schema NONE** (pure client).

**Rulings (PO 2026-08-26, choice prompts):**

- **D1 - FULL MUTUAL EXCLUSION.** Journal, Help, Conversation, Settings and
  the Spellbook (once C3 makes it openable) form one exclusive family:
  opening any one closes the others. The mobile ☰ sheet joined as a FULL
  family member: its old one-sheet rule (PO 2026-08-02, journal/help only)
  is subsumed, and two cross-closes are NEW under D1 - opening the sheet
  now also closes settings (and vice versa) and leaves an active
  conversation. ⚑ Both are consequences of D1, not separately ratified;
  the sheet↔conversation direction (opening the menu sends Leave to the
  NPC) is the game-feel question to confirm at the PO look, and neither
  new cross-close has a harness leg yet (`c2-layering` leg D covers
  sheet↔journal/help). If the PO narrows, the change is a filter in
  `notifyOpened`; if confirmed, the legs get added.
- **D2 - Escape stays the BLANKET close-all** (no stack pop; with D1 at
  most one family panel is open anyway). **Settings joins**: it gains an
  Escape close it never had and enters the family. Its forced close on
  entering the world (`BackendStateChangedEvent` → PLAYING) stays.
- **D3 - the no-transparency rule's tooltip application is DEFERRED to
  C6.** The rule stands (a panel in a stacking position gets a fully
  opaque body); the tooltip - the only real stacking survivor under D1 -
  keeps its translucency until its C6 restyle.
- **D4 - the §5 chunk order C2-C11 is RATIFIED as proposed.**

**The matrix:**

| Surface | Rule |
| --- | --- |
| Journal · Help · Conversation · Settings · Spellbook (from C3) · ☰ sheet | ONE exclusive family - at most one open; opening one closes the rest |
| World map | Covers EVERYTHING, closes nothing - the named exception (`c1-world-map` pin) |
| Tooltip | Transient hover overlay, outside the matrix; opacity rule lands at C6 |
| Chat / dev console | Unchanged (they suppress Escape while open; not panels) |
| Pre-game screens, death overlay, registration nag | Unchanged, outside the matrix |

**Named consequences, ruled on purpose (not defects):**

- Opening journal/help/settings mid-dialogue sends Leave to the NPC, and
  talking to an NPC closes whatever family panel is open.
- A QuestTracker row click (`Journal.openQuest()`) mid-conversation now
  leaves the NPC too.
- ⚑ The conversation's close is SERVER-CONFIRMED (`leave()` waits for the
  tree to drop): a both-visible window of roughly a tick plus RTT exists
  and is ACCEPTED. Harness assertions must poll for eventual close - an
  instant-close assert is a flake by construction.
- ⚑ The conversation's exclusivity trigger on OPEN is the `render()`
  closed→open transition (the panel is server-driven; E is not the event).
- Pre-game surfaces are untouched by the Escape change: the blanket
  handler attaches in the `Controls` constructor, which exists only
  in-world (built on join, removed on teardown).

**Implementation shape (all `frontend/`):**

1. A tiny registry module (e.g. `user-interface/logic/PanelExclusivity.ts`):
   `register(id, closeFn)` + `notifyOpened(id)` closes every other
   registrant. The registry is the seam - panel modules must NOT grow new
   cross-imports of each other. TDD it first (vitest, fake registrants).
2. Wire the registrants: Journal (`open`/`toggle`/`openQuest`), Help,
   Conversation (the render transition), `GameSettingsUI.show()`, and
   `MobileMenu.setOpen(true)` - the sheet's direct `Journal.close()`/
   `Help.close()` calls move into the registry.
3. Escape: add `GameSettingsUI.hide()` to the `Controls.ts` blanket list.
4. ⛔ The spellbook is in the MATRIX but not in C2's enforcement - it is
   always-on at HEAD and registers at C3. Do not make it closable now.

**Harness plan (the §2 "never left red" rule):**

- `chunkC3-journal.mjs` is a REWRITE, not a re-run: it deliberately pins
  journal + conversation open together (the exact combination D1 outlaws).
- `chunk3b-ii-conversation.mjs`: record its pre-existing 28/34 baseline
  BEFORE the change, compare after - do not chase its known reds.
- `c1-world-map.mjs` must stay green untouched.
- A new `c2-layering.mjs` asserts the matrix cells (polling for the
  conversation's eventual close) and the sheet's unchanged one-sheet rule.

**Verification tail:** `npm test` · `npm run typecheck` · `npm run build` ·
the four harnesses above · a mobile probe/screenshot (the sheet's
exclusivity is rerouted through the registry).

### C3 - spellbook structural rework (detailed + ruled 2026-08-27)

**Deliverable:** the §2 rework - the spellbook stops being always-on and
becomes an openable, category-tabbed, paginated panel on desktop AND mobile.
Structure only: no direction-C chrome (that is C6), no restyle beyond what
the tabs/pager physically require. **Schema NONE** (pure client - the
utility-category data was deferred, see D3).

**Rulings (PO 2026-08-27, choice prompts):**

- **D1 - IN-PLACE TOGGLE.** The opened book lives in the spellbook's
  current side-column spot with the same footprint; the loadout slots stay
  visible, and the click-row-then-click-slot equip flow (plus
  hotkey-bind-while-pending) survives untouched. Placement may still move
  at the C6 restyle - that is chrome, not structure.
- **D2 - CATEGORY TABS + PAGES WITHIN.** Tabs Auras / Passives / Cooldowns
  (the §2 grouping ask), page flipping within a tab (the §2 pagination
  ask). Page size **~8 entries, a PLACEHOLDER** per the standing numbers
  rule. Page count derives from **discovered entries only** and an empty
  category hides its tab - both are the existing zero-hint policy, kept.
- **D3 - UTILITY CATEGORY DEFERRED.** The three shipped categories section
  the book; new sections ride with the later tag axis (§2's separability
  finding). No `api/skills` field, no catalog rider, no Go.
- **D4 - MOBILE IN SCOPE.** The ☰ sheet gets a Spellbook button (like
  Journal/Help) opening the same panel full-screen; the embedded spellbook
  leaves the sheet. The spellbook is a real C2-D1 family member on both
  platforms - no platform divergence.
- **D5 - HOTKEY B.** Verified free in `Controls.ts` 2026-08-27; sits
  behind the same chat/console guard chain as J and M (typing "b" in chat
  can never open it).

**Plan defaults (stated, not asked):**

- Closed by default on join; the panel is a panel now.
- The `hasPoints` glow and the skill-points badge migrate to the open
  button (desktop) and the sheet's Spellbook button (mobile). Unlocks
  while closed are already covered by the server-authored discovery
  banner; the lingering state is the button badge. ⭐ AMENDED at the PO
  look (2026-08-28): the badge shows in BOTH places - the open buttons
  AND the panel title between "Spellbook" and Reset - so the count stays
  visible while spending. One update path feeds every `.skillPointsBadge`.
- Opening and spending in combat stay allowed (as today); only equips
  keep the existing combat lock, untouched.

**Implementation shape (all `frontend/`):**

1. A Spellbook open/close module on the Journal pattern: `toggle`/`close`
   (close a no-op when already shut - the registry ⚑), `'spellbook'`
   joins the `PanelId` union and registers in `PanelExclusivity`, every
   open path calls `notifyOpened('spellbook')`.
2. `Controls.ts`: a `KeyB` branch in `handleFunctionKeys` (J/M comment
   style incl. the verified-free date) + `Spellbook.close()` joins the
   blanket Escape list.
3. A desktop open button (the `#mapButton` pattern, "B Spellbook") plus
   the mobile sheet entry; both carry the points badge/glow.
4. Tabs + pager inside the panel. Tab and page state survive
   `updateSpellbook`'s per-tick rebuilds (the `selectedSkillId`
   discipline); the page index clamps when the discovered list changes;
   an unlock lands on whatever page it lands on - no auto-flip.
5. ⚑ **Harness-compat rule, load-bearing:** the spellbook DOM stays
   RENDERED at all times - open/close toggles a class, and tab/page
   filtering hides entries via class, never removes them from the DOM.
   `page.evaluate` queries and dispatched pointerdowns against
   `#spellbookList` then keep working with the book closed; only
   visibility assertions and Playwright locator clicks need an
   open-the-book step.
6. SimpleBar on `#spellbookScroll`: pages replace scrolling; drop it or
   keep it as overflow safety - builder's call, record it in the ledger.
7. ⚑ **Mobile passive equip is the one open flow question.** Passive
   slots live in the ☰ sheet; with the book its own panel, a pending
   passive needs the sheet. Default: selecting a passive on mobile closes
   the book and opens the sheet (the mirror of today's
   `MobileMenu.close()` on non-passive select, which becomes
   Spellbook-close). Flag it at the PO look.

**Harness plan (the §2 budgeted sweep):**

- **32 of the 61 verify scripts query spellbook selectors directly**
  (`#spellbookList` / `.spendBtn` / `.unspendBtn` / `#skillPointsBadge`;
  no shared helper exists): backlog33-prehot · c0-honest-plate ·
  c1-bloodline-seed · c1-front-stone · c1-kill-quests · c1-open-portal ·
  c2-frost-shield · c2-kill-quests · c2-pull-through ·
  c2b-bloodline-select · c3-invulnerability · c3-paralyze · c4-ally-speed
  · c5-bars · c6-theme · chunk2-calm · chunk2-follower · chunk3-charm ·
  chunk3b-interact · chunk3b-ii-conversation · chunk4-persistence ·
  chunkC3-journal · chunkC4-quests · chunkP-presence · mobile-layout ·
  n1-shield-bar · r1-focus-cost · r3-lifesteal-burst · r7-respec-cost ·
  r7-strong · round4-tooltip · swift-cooldown. Under the DOM-stays-
  rendered rule most survive unchanged; the sweep = run all 32, add an
  open step (B) only where a script asserts visibility or locator-clicks.
- Known-red baselines stand: `chunk3-charm` 6-8/9 and
  `chunk3b-ii-conversation` 28/34 are compared against their baselines,
  not chased.
- `mobile-layout.mjs` changes on purpose (sheet loses the embedded
  spellbook, gains the button) - update, don't preserve.
- A new `c3-spellbook.mjs`: open/close via B + button + Escape · the five
  exclusivity legs (spellbook ↔ journal / help / settings / conversation
  / sheet; poll the conversation close per the accepted window) · tab
  switching · discovered-only page count · pending-equip flow with the
  book open · tab/page state surviving a tick rebuild.
- `c1-world-map` (map covers everything) and `c2-layering` stay green
  untouched; the new family legs live in `c3-spellbook.mjs`.

**Verification tail:** `npm test` · `npm run typecheck` · `npm run build` ·
the 32-script sweep + `c3-spellbook` · mobile probe/screenshots at both
resolutions.

**Execution:** delegated to an Opus 5 agent, reviewed line-by-line (the
C1/C2 discipline).

### C4 - skill icons (detailed + ruled 2026-08-28)

**Deliverable:** every authored player skill gets an icon, rendered as the
ratified ink-ringed token (solid parchment glyph in an ink ring, the §4
board-C treatment) on the spellbook rows, plus the reusable token component
and the asset/mapping pipeline C5's icon-only bar consumes. Prerequisite of
C5. **Schema NONE** (no DB) - but ⚑ the first UI-pass chunk that is NOT pure
client: content JSON (`api/skills`) + a one-field Go catalog rider + client.

**Rulings (PO 2026-08-28, choice prompts):**

- **D1 - ALL 72 authored player skills.** Not just the ~57 obtainable at
  HEAD: cheat rigs (Omni trio), prototypes (ThrowMine/ThrowBomb,
  OpenPortal) and the unwired few included, so no surface ever shows a
  blank token. C11's icon half shrinks to future skills + the flavor
  descriptions. Mob-embedded skills (BearSwipe etc. - in the 105-entry
  catalog but not in `api/skills/`) author NO icon and never render one.
- **D2 - SPELLBOOK ROWS are C4's visible surface.** The token sits before
  `.skillName` in each row. Loadout slots, ability bars and `#utilityBar`
  DOM stay untouched - those are C5's surface (the 32-script
  `li[data-slot] .slotLabel` contract is not touched at all here).
- **D3 - FUNCTIONAL PLACEHOLDER VOCABULARY.** PO verbatim: "find common
  geometric or iconic forms to use for for example damage types, ability
  type, range or similar ... full expectation is that all of them will be
  replaced, they should for now just refer to their spell and be not
  creative, only functional." So: a SMALL shared glyph set (roughly 15-25
  game-icons.net picks) keyed to what a skill does - damage type (physical
  / fire / frost / poison / nature), role (heal, shield, speed, slow/CC,
  summon, light, harvest, ...) - reused across skills; two skills with the
  same role sharing a glyph is correct, not a collision. No per-skill
  creative picks, no contact-sheet gate; review happens in-game at the PO
  look. Category (aura/passive/cooldown) is NOT encoded in the glyph - the
  C3 tabs and C5's wood divider already carry it.

**Plan defaults (stated, not asked):**

- **The mapping is CONTENT**: an `icon` string on each `api/skills/*.json`
  definition, carried through the Go definition struct and served by the
  `/skills` catalog - the `displayName` precedent exactly. ⛔ Not a
  frontend name→icon table: that is the §2 "content-keyed label tables
  degrade silently" landmine by construction.
- **The value is the game-icons.net path `author/name`** (e.g.
  `lorc/flame`), so CC BY attribution and re-download stay derivable from
  content alone. Duplicated values across same-role skills are the D3
  point.
- **Assets are VENDORED**: the used glyph SVGs are downloaded once by a
  fetch script in `scripts/` (never a build step), stripped (background
  rect and hardcoded fills removed so `currentColor` tints the glyph
  parchment), and checked in under `frontend/`. No runtime fetches to
  game-icons.net, no per-icon HTTP requests in prod; exact bundling
  mechanism (inline symbol sprite vs generated module) is builder's call,
  recorded in the ledger.
- **Attribution**: game-icons.net is CC BY 3.0. A NOTICE entry listing the
  glyph authors used rides with the vendored assets; player-facing credits
  can join the Help panel at C6+ if wanted.
- **Completeness is pinned twice**: a Go content test asserts every
  `api/skills` definition authors a non-empty `icon` (new skills hard-fail
  the suite, not the boot), and a vitest test asserts every authored icon
  value exists in the bundled glyph set (a typo'd path cannot ship
  silently). ⚑ Content edits do not invalidate the Go test cache - the
  tail runs `go test -count=1`.
- **The client accessor degrades**: `skillIcon(id)` falls back to an
  initial-letter token when the catalog fetch failed or a skill has no
  icon (mob skills, future gaps) - same degrade discipline as every other
  catalog accessor.
- **The utility island rides along**: Recall and Camp get icons via a tiny
  mapped table beside `UTILITY_NAMES` in `Utilities.ts` (utilities are
  deliberately not catalog content, D1 of plan-downtime), pinned by the
  existing twin-table test pattern. Ascend renders no button, gets no
  icon. This closes C5's utility-island icon dependency now.
- **Mobile inherits the rows** (the C3 full-screen book renders the same
  DOM). ⚑ The C1 lesson stands: check whether `HUD.mobile.less` needs an
  explicit token reset/size, probe before shipping.

**Implementation shape:**

1. `scripts/` fetch script: vocabulary list in, stripped SVGs +
   generated manifest out. One-time tool, committed output.
2. Go: `Icon string` on the skill definition struct + catalog
   passthrough + the content completeness test. `make -C backend build`
   once for the struct; icon-pick iteration then rides
   `-content ../api` restarts.
3. `api/skills/*.json`: author `icon` on all 72 (the vocabulary
   assignment - the judgment half).
4. Client: token component CSS (`.ink-token`: parchment glyph, ink ring,
   sized for a list row; C5 re-sizes it for slots), `skillIcon(id)`
   accessor + fallback, the token span prepended in `updateSpellbook`'s
   row builder before `.skillName`.
5. `Utilities.ts` twin table + the two utility icons (asset only at C4 -
   no utility DOM changes).

**Harness plan:**

- The 32-script sweep should survive UNTOUCHED - a span prepended before
  `.skillName` changes no selector any script uses. Budget: re-run
  `c3-spellbook` (26/26 baseline) in full plus spot-check 2-3 sweep
  scripts (e.g. `backlog33-prehot`, `chunk2-follower`); do not re-run all
  32 unless a spot-check goes red.
- One new leg (extend `c3-spellbook.mjs` or a tiny `c4-skill-icons.mjs`,
  builder's call): every visible spellbook row carries a token that is
  NOT the letter fallback.
- Mobile probe/screenshot: the full-screen book's rows at phone
  resolution.
- Known-red baselines stand (`chunk3-charm` 6-8/9,
  `chunk3b-ii-conversation` 28/34, and the three HEAD-identical reds
  recorded at C3).

**Verification tail:** `npm test` · `npm run typecheck` · `npm run build` ·
`cd backend && go test -count=1 ./...` (content + catalog tests) ·
`c3-spellbook` + spot-checks + the new icon leg · mobile probe · PO look
in-game (the D3 review venue).

### C4b - the unlock breadcrumb trail (detailed + ruled 2026-08-29)

**Deliverable:** the C4-wrap ask as a working trail - while any spell
discovered THIS SESSION has not been seen, a light pulse leads to it: the
spellbook open buttons pulse while the book is shut; opening it moves the
pulse to the unseen spell's category tab; within that tab the pager pulses
while the spell is off the displayed page; the row itself pulses in view,
and a short dwell marks it seen. Every pulse stops only once ALL unseen
spells have been seen. **Schema NONE** - pure client by D1.

**Rulings (PO 2026-08-29, choice prompts):**

- **D1 - SESSION-ONLY, FULLY FRONTEND.** "Session only sounds good, ideally
  fully frontend." The unseen set is client memory; a reload clears it. No
  wire field, no Go, no persistence. The server option was priced at the
  session and declined: it would NOT have been a migration
  (`game.character_flags` was designed insert-not-migration, and
  `quests.DecodeFlags` explicitly ignores foreign keys - "the table is
  shared"), but it would have needed a GameState append + a new client
  message + a second tenant beside the quest encode in
  `sys/persist.go:characterState()`. That pricing stands recorded here in
  case a later pass revives it. Consequence of D1: the join baseline is
  all-seen BY CONSTRUCTION - exactly `updateSpellbook`'s existing
  `isBaseline` discipline, reused.
- **D2 - SEEN = ON-PAGE + SHORT DWELL.** A row counts as seen once its page
  has been displayed in the open book for **0.5 s (⚑ PLACEHOLDER; built at
  1 s, halved at the PO look 2026-08-29)**. Flipping
  past at speed does not mark; landing on the page does. ⚑ The dwell runs on
  WALL-CLOCK timers (`setTimeout`), never rAF - a hidden Playwright page
  throttles rAF to 6 fps ([[project-input-jitter]]), so an rAF dwell would
  flake every headless leg by construction.
- **D3 - THE ☰ TOGGLE PULSES TOO.** On mobile the trail has one extra hop:
  `#mobileMenuButton` pulses (the sheet's Spellbook row is invisible until
  the sheet opens) → the sheet's `.spellbookOpenButton` row → tab → pager
  → row.
- **D4 - NO TUTORIAL PULSE.** PO: "only on new discoveries that are not
  already there from the start of the session." D1's baseline rule gives
  this for free; a fresh character's starting skills never pulse, and the
  creation-path variant (an empty seen-set written at CreateCharacter) is
  dead with the server option.

**Plan defaults (stated, not asked):**

- **The unseen set lives in `Spellbook.ts`** - the module already owns
  visibility, tab and page, so it is the only place that knows what is
  actually displayed. `HUD.ts` calls a new `Spellbook.noteUnlocked(ids)`
  exactly where it stamps `.unlocked` today (the post-baseline diff in
  `updateSpellbook`); the module stays CATALOG-FREE - unseen ids are matched
  against rows by `data-skillId`/`data-category`, so the jsdom fixture keeps
  working untouched.
- **The trail is computed in `render()`**, which already runs on every
  open/close/tab/page change and after every rebuild (never per tick -
  `updateSpellbook` early-returns on no change): book shut → `.breadcrumb`
  on both `.spellbookOpenButton`s + `#mobileMenuButton`; book open → every
  NON-ACTIVE tab holding unseen pulses; in the active tab the pager step(s)
  TOWARD a page holding unseen pulse (both may); unseen rows on the
  displayed page pulse and arm the dwell.
- **One dwell timer per render pass**, covering all unseen rows on the
  displayed page together; any re-render cancels and re-arms it; firing
  marks those ids seen and re-renders. `document.hidden` is deliberately NOT
  consulted (KISS) - alt-tabbing away with the book open on the page counts
  as seen, accepted.
- **Stale ids self-heal**: render() prunes unseen ids that match no row, so
  a retired skill cannot pulse forever.
- The existing one-shot `.unlocked` row marker and the panel `unlockPulse`
  stay untouched - C4b is the lingering layer on top of them, not a
  replacement.
- **Pulse look is a functional placeholder** (the C4 D3 stance): one
  `.breadcrumb` class + keyframe, light per the ask, and it MUST compose
  with `.hasPoints`' glow - both can sit on the same button at once. The
  chrome-final look belongs to C6.
- A family close mid-dwell needs no special case: timers cancel, the set
  stands, the buttons resume pulsing - it all falls out of render().
- Respec/unspend never removes a discovery, so ids do not vanish mid-trail.

**Implementation shape (all `frontend/`):**

1. `Spellbook.ts`: the set, `noteUnlocked(ids)`, trail classes + dwell in
   `render()`. ⚑ Respect the `wired` guard discipline for anything bound in
   `setup()`.
2. `HUD.ts`: one call beside the `.unlocked` stamp; nothing else.
3. `HUD.less`: the `.breadcrumb` keyframe on buttons/tabs/pager/rows. ⚑ The
   C1 lesson: probe whether `HUD.mobile.less` needs a reset (expected no -
   it is a glow, not a box - but probe, never assume).
4. `Spellbook.test.ts`: trail specs on the jsdom fixture, fake timers for
   the dwell (TDD - the module is pure enough to red-first).

**Harness plan:**

- New `c4b-breadcrumb.mjs`: baseline never pulses · SKILL-cheat unlock with
  the book shut → open buttons pulse · open the book → the pulse MOVES to
  the category tab (buttons stop) · tab active but off-page → pager pulses ·
  flip to the page → row pulses → dwell clears every pulse · two unseen in
  different categories → seeing one leaves the other tab pulsing (the ALL
  rule) · close with unseen remaining → buttons resume · mobile probe: ☰
  pulses. Legs that wait on the dwell wait wall-clock ~2× the placeholder.
  ⚑ Leg construction: the tab-pulse leg needs the cheat-unlocked skill in a
  NON-active category (the book opens on `aura` - unlock a passive or
  cooldown), and the pager leg needs >8 discovered in the active category
  (PAGE_SIZE 8) before the unlock lands off-page.
- `c3-spellbook` 26/26 must hold. The 32-script sweep should survive
  UNTOUCHED (pure class additions; the DOM-stays-rendered rule is
  unaffected) - spot-check 2-3 (e.g. `backlog33-prehot`,
  `chunk2-follower`), full sweep only if a spot-check goes red. Known-red
  baselines stand.

**Verification tail:** `npm test` · `npm run typecheck` · `npm run build` ·
`c3-spellbook` + the new `c4b-breadcrumb` + spot-checks · mobile
probe/screenshot · PO look in-game. **Schema NONE.**

### C5 - the ONE ability bar (detailed + ruled 2026-08-29)

**Deliverable:** the §2 ability-bar consolidation in the ratified direction-C
language: ONE bottom bar (aura slots | wood divider | cooldown slots) with the
utility island beside it, all slots icon-only in the "C - Icon Bar" board's
slot anatomy; the passive panel goes icon-only too and anchors bottom-left
(D1). ⛔ **The spec is the board's RENDERED CSS** (`.slotI`/`.keyC`/`.panelC`
in the `IconBar.dc.html` artboard on the §4 canvas), the §4 CORRECTION rule -
not the board prose. **Schema NONE** - pure client.

**Rulings (PO 2026-08-29, choice prompts):**

- **D1 - PASSIVES: ICON SLOTS, BOTTOM-ANCHORED LEFT COLUMN.** PO verbatim:
  "They stay in the left column but are anchored to the bottom of the
  screen", and the follow-up ruled they take the same 52px token anatomy as
  the bar (no hotkeys, click only for pending-equip). Consequence: the
  passive DOM contract is NORMALIZED - each passive `li` gains the
  `.slotLabel` span (bare `textContent` today), and the 3-4 harness scripts
  that match the `li` text move onto the standard selector in the sweep.
  ⚑ Side effect: `c1-bloodline-seed.mjs:137`'s pre-existing DEAD selector
  (`.passiveSlot .slotLabel`, matched nothing at HEAD) starts matching -
  that leg is re-checked, not "fixed" silently.
- **D2 - MOBILE: ICONS INHERIT, LAYOUT STAYS.** Slots become icon tiles
  through the shared markup; the mobile layout itself is untouched: tile
  row, hidden hotkeys, utility as the fixed right-edge thumb column. C9
  owns any real mobile rework. ⚑ Not zero mobile work: `HUD.mobile.less`
  RESTATES the whole tile box for `.activeSlot`/`.hasPendingSkill` (built
  against the old desktop padding-shift) - those restatements are
  reconciled against the new circular anatomy, and the probe is mandatory.

**Plan defaults (stated, not asked):**

- **The board anatomy verbatim** (from the extracted `IconBar.dc.html`):
  52px circular slot, 3px `@ink` border, `#0e1811` well; ACTIVE aura =
  wooden rim `box-shadow: 0 0 0 4px #8a5a2b, 0 0 0 6px @ink,
  0 0 10px rgba(227,115,19,0.45)` (the D12 rule) + the ember dot below;
  EMPTY = opacity 0.55; ON COOLDOWN = conic-gradient ink sweep overlay +
  centered seconds; hotkey chip 17px at the slot's top-left (-6px), corner
  radii 5/3/6/4; divider 2×42px `fade(@wood, 55%)`; both bar and island
  are `.panelC`-treated containers (the C1 mixins), island gap 22px,
  Camp's charge count as the bottom-right chip badge.
- **The ember dot IS the metronome.** `.beatPip` keeps its element, class
  and the `HUD.ts:376` query (`.auraSlot.activeSlot .beatPip`); it is
  restyled/repositioned as the mockup's ember dot under the active slot
  and keeps pulsing via `hudBeatPulse`. Zero TS changes; flag at the PO
  look.
- **DOM strategy: wrap, never rename.** `#auraLoadout` and
  `#cooldownLoadout` (and their `ul#auraSlotList`/`ul#cooldownSlotList`)
  survive inside a new shared bar container; they lose their own
  `.panel-chrome()` and titles, the chrome moves to the wrapper, the
  divider is a new element between them. Every existing selector keeps
  matching. Titles ("Aura Slots" etc.) disappear from the whole bar
  family - the hover tooltip carries the names (already wired,
  `attachSkillTooltips`).
- **Contract pins, all load-bearing:** `.slotLabel` stays RENDERED (may be
  visually hidden) in every slot AND in the utility `li`s
  (`r4-camp`/`r4-recall-utility` read it there) · `.activeSlot` is
  contract BY NAME (`mobile-layout.mjs:320`) · keep stamping
  `li.dataset.skillId` on every update or all bar tooltips die silently ·
  `#actionBars.flightLocked` (opacity/grayscale, pointer-events kept)
  survives the restyle · utility markup order Recall-then-Camp is
  load-bearing for the mobile thumb column - never reorder.
- **Icons ride C4's rails**: `createIconToken`/`skillIcon(id)` with the
  letter fallback; utility icons from the C4 `UTILITY_ICONS` table. ⛔ The
  `.ink-token` treatment gets a SIZE VARIANT for the 52px slot, never a
  restated treatment (the C4 rule: C5 re-sizes it, never restates it).
- **`.hasPendingSkill` re-stated for the circular anatomy** (the pending
  equip target highlight must read on a circle); the click-row-then-
  click-slot equip flow itself is untouched.
- ⚑ **Hotkey chips stay two independent literals** (labels in `HUD.html`,
  bindings in `Controls.ts:69-70`) - do NOT unify them into a shared
  constant this chunk (YAGNI).
- **Cooldown sweep is NEW work** (today: text seconds + `.onCooldown`
  dim). `.cdRemaining` is free to restyle - only `.slotLabel` is
  harness-read in cooldown slots. Sweep progress may ride the existing
  per-tick `updateCooldownLoadout` data (no rAF requirement; it updates
  ~30/s already).
- **Passive island placement**: the passive panel anchors to the bottom
  of the left column; the open spellbook's in-place spot (C3 D1) sits
  above it - both visible at once is REQUIRED (the equip flow needs book
  row + passive slot clickable together). Probe for overlap at small
  viewport heights.

**Implementation shape (all `frontend/`):**

1. `HUD.html`: the shared bar wrapper + divider element; `.slotLabel`
   spans added to passive `li`s; titles removed from the bar family.
2. `HUD.less`: the slot anatomy (`.slotI`-equivalent on `.auraSlot`
   within the bars), the wrapper chrome via the C1 mixins, divider,
   ember-dot `.beatPip` restyle, `.hasPendingSkill`/`.activeSlot` on
   circles, cooldown sweep + seconds, utility island + charge badge,
   bottom-anchored passive panel.
3. `HUD.ts`: token rendering into slots on the three update paths
   (`updateAuraLoadout`/`updatePassiveLoadout`/`updateCooldownLoadout` -
   passives move onto the `.slotLabel` write), sweep progress hook in
   `updateCooldownLoadout`. Interactions untouched.
4. `HUD.mobile.less`: reconcile the `.activeSlot`/`.hasPendingSkill` tile
   restatements with the circular anatomy; everything else stays.

**Harness plan:**

- New `c5-ability-bar.mjs` (⚑ NOT `c5-bars.mjs` - that name is taken by
  an earlier pass): one-bar structure (both families + divider in one
  container) · icon tokens in filled slots, letter fallback never shown
  for shipped skills · active-aura rim + `.activeSlot` · cooldown press
  shows sweep + seconds then clears · pending-equip highlight on circles
  · utility island with Camp charges · passive slots carry tokens +
  `.slotLabel` · flightLocked still applied when flying.
- The sweep: re-run the slot-reading scripts from the §survey
  (`backlog33-prehot`, `c3-spellbook` 26/26, `c5-bars`, `n1-shield-bar`,
  `r3-lifesteal-burst`, `mobile-layout`, `c1-open-portal`,
  `c2-pull-through`, `c3-flight-client`, `r7-respec-cost`) plus the
  passive-contract movers (`r1-focus-cost`, `c2-frost-shield`,
  `r7-strong`, `c1-bloodline-seed`). ⚑ `#bottomCenter` geometry changes
  (three 18rem panels → two compact islands) - exactly where C3's
  dead-strip-eats-clicks defect lived; watch for click interception.
- Known-red baselines stand (`chunk3-charm` 6-8/9,
  `chunk3b-ii-conversation` 28/34, the three HEAD-identical reds).
- Mobile probe/screenshots at phone resolution: tiles, thumb column,
  ☰ sheet's passive rows with tokens.

**Verification tail:** `npm test` · `npm run typecheck` · `npm run build` ·
the sweep above + the new `c5-ability-bar` · mobile probe · PO look
in-game. **Schema NONE.**

**Execution:** delegated to an Opus 5 agent, reviewed line-by-line (the
C1-C4b discipline).

**⭐ AMENDED at the PO look (2026-08-29, same session).** The bar itself was
approved as shipped; two changes were asked and applied, both root-caused
before they were fixed:

1. **The metronome pip barely read.** Root cause PRE-EXISTING, only
   SURFACED by C5's bigger ember dot: the detector layer was proven correct
   first (45/45 beats over 60 s on the PO's exact Reaper path), which put
   the fault in the shared `Utils.ts playCssAnimation` helper (written at
   `b457cc06`, wired to the pip by numbers-rewrite N5 `14b35f98`). Two real
   defects there: (a) the restart idiom was `remove` → rAF → re-add, which
   is ENGINE-DEPENDENT - Chromium happens to restart the animation, an
   engine that runs frame callbacks before the style flush does not, so the
   pulse worked by luck; (b) the `.beatPulse` class was never removed, so
   re-displaying the element replayed a spurious pulse on every aura
   switch. Fixed in the shared helper (both consumers audited): synchronous
   forced-reflow restart (`remove` → `void offsetWidth` → `add`), the class
   removed on `animationend`/`animationcancel`, and the WeakMap drops a
   superseded call's cleanup first. ⚑ **Load-bearing addition caught by the
   line-by-line review, fixed red-first: animation events BUBBLE.** Without
   an `event.target !== element` guard, `#spellbook`'s `unlockPulse` is
   stripped mid-glow the moment a child row's `.breadcrumb` (C4b) cancels.
   A Web-Animations migration was considered and declined - the keyframes
   live in LESS. New `Utils.test.ts`, 7 specs, red-first proven.
2. **The cooldown seconds were too small to read** against the new 52px
   circle. New `@slot-glyph: 26px` is now the single source for BOTH the
   in-slot token and the digits; `.cdRemaining` went 14px → 26px at weight
   700 with a stronger ink halo, and `.longCd` steps down (17.68px) so a
   four-character string ("140s") still fits. Mobile needed NO override -
   measured, both lengths fit the 56px tile.

Consequence for the tail: the harness script grew from 27 to **30 legs**
(pip pulses repeatedly, wall-clock-counted via `animationstart` · the class
returns OFF between beats · digits render at glyph scale) and vitest went
554 → **569** (+8 CooldownSweep, +7 Utils, all red-first).

### C6 - panel chrome rollout (detailed + ruled 2026-08-30)

**Deliverable:** the direction-C treatment rolled out across the remaining
HUD - the `.panel-chrome()` callers, the HUD buttons, the one-off panels
(tooltip, `#confirmRow`, settings), the resource/XP bars and the minimap -
plus the wood header strip on the remaining open-state UIs. ⛔ **The spec is
the board's RENDERED CSS** (`.panelC`/`.hdrC`/`.btnC`/`.keyC` plus the
board's bar/minimap/tooltip markup on the §4 canvas), the §4 CORRECTION
rule - not the board prose. **Schema NONE** - pure client CSS (no TS
expected; the breadcrumb rework is CSS-only).

⚑ **Name collision, for the commit message and the reader:** HUD.less's
"panel vocabulary mixins (code-health C6)" comment is a DIFFERENT C6 (the
archived `plan-code-health.md`). This chunk is ui-pass C6.

**Rulings (PO 2026-08-30, choice prompts):**

- **D1 - THE QUEST TRACKER STAYS LEGACY UNTIL C7.** The per-quest
  `.questTrackerQuest` boxes keep `.panel-chrome()` although the scope line
  reads "every caller": C7 owns the tracker consolidation into ONE panel
  (structure before chrome, the ruled precedent), so C6 does not style a
  structure C7 replaces. Consequence: `.panel-chrome()` SURVIVES C6 with
  the tracker as its last caller - migrate call sites one by one, ⛔ never
  flip the shared mixin. The tracker is knowingly the one dark-glass
  remnant for exactly one chunk.
- **D2 - CONVERSATION: INK BODY ONLY.** `#conversation` gets the mechanical
  `.panel-chrome()` → `.ink-panel-chrome()` swap so the C2 family reads
  coherent after C6; NO header strip, interior untouched - C7 (dialogue
  restyle) owns the real look. The board is silent on this panel; this is
  the minimal coherence move, ruled as such.
- **D3 - SETTINGS JOINS C6.** `#gameSettingsPanel` (not a `.panel-chrome()`
  caller - it sits on bare `@backgroundColor`) is inked now rather than at
  C10: it is a C2 exclusivity-family member and would otherwise be the only
  in-game family member left in the old look. It keeps overlaying start/end
  screens (`@z-settings`); appearing inked there is accepted.
- **D4 - FRESH-UNLOCK ROWS: GLOW ONLY.** The C4b flagged limit is settled:
  during `.unlocked`'s 5 s one-shot window the row shows the loud glow
  alone. The breadcrumb pulse moves onto an `::after` pseudo-element in C6
  (forced by the wood-inset collision below), which would otherwise let
  both render at once - ONE explicit suppression rule
  (`.unlocked.breadcrumb::after { animation: none; }`) keeps today's
  one-signal-at-a-time read on purpose. The deeper unification (glow driven
  from the C4b unseen set) was presented and declined for C6 - it is a
  behavior redesign, not a cleanup.
- **D5 - THE TICK PIP STAYS AS-IS.** The C5-flagged rhythm/duration call is
  taken: no retune. Its jitter is snapshot cadence, not CSS; revisit only
  if it still bothers in play.

**Plan defaults (stated, not asked) - the board-ratified treatments:**

- **Panels** - `.ink-panel-chrome()` replaces `.panel-chrome()` on
  `#conversation` (D2), `#spellbook` and `#help`; the journal already wears
  it (C1). `#gameSettingsPanel` (D3) gets `.ink-panel-chrome()` fresh (it
  had no shared mixin), NO header strip - board-silent, the same
  minimal-coherence stance as D2; its `h2` stays plain. The C2 D3 leftover
  lands: any panel in a STACKING position gets a fully opaque body - in
  practice the tooltip (below); the family panels are mutually exclusive
  since C2 and keep the 90% moss.
- **Header strips** - `.ink-panel-header()` onto `.spellbookTitle` (the
  board renders "Spellbook | Reset" as an `.hdrC`; badge + `#respecButton`
  ride inside the strip, wrap-never-rename) and `.helpHeader` (same
  overlay pattern as the journal, same treatment). Journal keeps its C1
  strip; conversation none (D2); the bar family stays icon-only (C5).
- **Buttons** - `.hud-button-chrome()` re-bodies onto the board's `.btnC`:
  moss 90%, 2.5px ink border, corner motif 9/5/10/6, 2px wood inset ring
  (`inset 0 0 0 2px fade(@wood, 40%)`), parchment text; the hotkey spans
  become the board's `.keyC` chip (ink block, radii 5/3/6/4). Callers:
  `#journalButton`, `#mapButton`, both `.spellbookOpenButton`s,
  `#questTrackerJournal`. ⚑ `.hasPoints` now recolors a 2.5px border
  instead of 1px - louder on purpose, the PO look judges it.
- **Tooltip** - `#skillTooltip` takes the board's panelC variant: radii
  `9px 14px 8px 12px`, padding 10px 14px 12px, 3px ink border + wood
  inset - with the body at FULL opacity (C2 D3: the tooltip is the one
  stacking survivor; the 90% moss becomes 100%). The `--tooltip-gap`/
  `--tooltip-margin` knobs and the title/subtitle structure stay;
  `round4-tooltip.mjs` is the layout gate.
- **`#confirmRow`** - ink chrome, but its warning-red border SURVIVES as
  the danger accent (a semantic hue, not chrome - the same rule that keeps
  focus crimson).
- **Bars** (`vitalSigns.less`) - the board verbatim: pill radius
  (height/2), 3px ink border, dark well `rgba(10,8,5,0.72)`, thin wood
  inset (`inset 0 0 0 1.5px fade(@wood, 40%)`), `overflow: hidden`. Fills
  become the board's vertical gradients SHADING the shipped hues - focus
  `#de4560 → crimson 55% → #a01030` (center stays `@focus-color`), XP
  `#7b4bb5 → #5b2f91`. ⚑ The five `Theme.test.ts` pins stay untouched;
  gradient endpoints are shading, not new semantic tokens. ⚑ The
  `shieldIndicator`, both delta indicators and `.barText` must survive
  inside the new well - they are positioned children of the bar and the
  overflow clip must not eat the text shadow.
- **Minimap** - the board's "double ink ring with a wood band":
  `border: 3px solid @ink` +
  `box-shadow: 0 0 0 6px fade(@wood, 60%), 0 0 0 9px @ink,
  0 4px 10px fade(black, 40%)`, replacing the Cornsilk fade. The corner
  motif is meaningless on a circle - the double ring IS the treatment.
  Compass labels stay above the clip wrapper, untouched.
- **The breadcrumb rework** (forced, then D4): `.btnC` keeps its wood
  inset in `box-shadow`, and `.breadcrumb`'s keyframes animate box-shadow
  from a zero-spread base - the pulse would strip the inlay every cycle.
  The pulse moves onto `::after` (absolute inset 0,
  `border-radius: inherit`, `pointer-events: none`, the existing
  keyframes), which composes with ANY base box-shadow on any of its four
  landing spots. ⚑ Each landing spot needs a positioning context - verify
  buttons/tabs/pager-steps/rows are (or become) `position: relative`.
  ⚑ The `c4b-breadcrumb` harness reads animation state off the ELEMENT -
  it gets a retrofit to probe `::after`, budgeted, never left red.
- **Mobile** - the C1 pattern extends: every newly inked surface gets its
  `HUD.mobile.less` reset so phones keep the pre-ink look wholesale (C9
  owns real mobile work). Rider from C5: the mobile `.cdSweep` corner
  overhang gets its one-line `border-radius: inherit` candidate fix here.
  Probe + screenshot mandatory.

**Harness plan (the §2 "never left red" rule):**

- `round4-tooltip.mjs` - the tooltip layout gate for the padding/chrome
  change.
- `c4b-breadcrumb` 17/17 - RETROFIT for the pseudo-element move (the one
  script whose probes the chunk breaks by design).
- Stay green untouched: `c3-spellbook` 26/26 · `chunkC3-journal` ·
  `c2-layering` · `c1-world-map` (the z-scale is untouched; the map still
  covers every - now inked - panel) · `c5-ability-bar` 30/30.
- ⚑ The two scripts that probe the RESTYLED bars: `n1-shield-bar` 4/4 (it
  asserts the exact `shieldIndicator` the bars bullet flags as
  must-survive) and `c5-bars` - stay green, or get a budgeted retrofit if
  the `overflow: hidden` well changes what they can read.
- `mobile-layout.mjs` green except leg 7 (the documented HEAD baseline).
- Known-red baselines stand (the CLAUDE.md list); ⚑ measure before
  diagnosing any flake, and suspect the non-monotonic wall clock first on
  any elapsed-time red.

**Verification tail:** `npm test` · `npm run typecheck` · `npm run build` ·
the harness set above · desktop + mobile screenshots (every re-chromed
surface eyeballed) · PO look. **Schema NONE** - pure client.

### C7 - dialogue + journal restyle (detailed + ruled 2026-08-30)

**Deliverable:** direction-C interiors for the two prose surfaces C6
deliberately left alone - the conversation panel (round-9 item 2's "cleaner
dialogue UI", the non-font half) and the journal - plus the §2 quest-tracker
consolidation, rebuilt to the PO's WoW-classic reference (D2 below, which
SUPERSEDES the §2 "holds the journal header" wording). ⛔ The spec discipline
is the §4 CORRECTION rule, with one twist verified first-hand against the
canvas artboards: **the board renders NEITHER open-state interior** (no
journal-open, no dialogue-open scene exists on board C), so C7 extends the
board's own vocabulary - the `.hdrC` wood strip, gold `sa` labels, parchment
`rd` text, the `rgba(20,16,11,0.7)` ink row dividers - rather than inventing
new forms. **Schema NONE** - but ⚑ **NOT a CSS-only chunk, unlike C6**: the
tracker consolidation rewrites `QuestTracker.ts`'s render and the
`#questTracker` markup in `HUD.html` (small TS + HTML; `questTrackerRows` in
`JournalModel.ts` stays untouched, so the vitest surface does not move).

**Rulings (PO 2026-08-30, choice prompts):**

- **D1 - THE CONVERSATION GETS THE WOOD HEADER STRIP.** Full
  `.ink-panel-header()`: actor name gold on wood, ✕ in the strip. The family
  precedent was split (journal/spellbook/help wear it, settings was ruled
  plain at C6 D3); ruled with the tradeoff named - the strip appears and
  vanishes over live gameplay with every conversation.
- **D2 - THE TRACKER IS A WOW-CLASSIC TEXT LIST, NOT A PANEL** (the PO
  showed a WoW-classic tracker screenshot as the reference; supersedes both
  the §2 wording and the board's own per-quest `.panelC` render, and this
  prose is the durable record of it). The M/J buttons stay exactly as
  C6 styled them; below them ONE rectangular semi-transparent scrim wraps
  the whole tracking space, denoting its edges in all directions; inside,
  LEFT-ALIGNED text - each quest a small gold title with its objective line
  beneath ("- " prefix), one quest after the other, **no per-quest boxes**;
  the inside scrolls when out of room.
- **D3 - THE SCRIM IS PLAIN, NOT INK.** No `.ink-panel-chrome()`, no wood
  inlay: a borderless (or at most hairline-edged) dark translucent
  rectangle - the lightest permanent footprint. The ruled exception to the
  C6 family look, on purpose: the tracker sits on screen at all times over
  the world.
- **D4 - THE GOLD IS PER-QUEST.** "Write a small gold title over each of
  the quests, similar to the wow classic reference" - each quest's title is
  the small gold line. (Whether a box-level "Quests (n)" header line also
  exists was NOT explicitly ruled - see the plan default below; the PO look
  judges it.)

**Plan defaults (stated, not asked):**

- **Tracker behavior** - grows with content up to today's max-height cap and
  scrolls beyond (the §2 feedback's "grows... and scrolls" survives D2);
  zero running quests hides the scrim wholesale (today's rule). Title in
  `@gold-levelup`, small; objective line parchment-bright, indented, the
  existing `::before` "- " prefix survives. Left-aligned - today's
  `text-align: right` / `flex-end` alignment FLIPS by ruling. A row click
  keeps opening the journal at that quest. ⚑ **ONE objective line per quest
  is what the ledger carries** (the server-composed current-stage line); the
  WoW reference's multi-line quests would be a data change and are out of
  scope. **No box-level title line** [DEFAULT, not ruled - flagged for the
  PO look]: the quests start at the top of the scrim; the J Journal button
  directly above labels the area (the reference image does carry a
  "Quests (9/15)" line, so the look may add one back).
- ⚑ **Wrap, never rename:** `#questTrackerJournal` survives on the button
  element - three scripts pin it (`c6-panel-chrome` clicks it, `c6-theme`
  opens the journal via it, `chunkC3-journal` asserts its existence). The
  tracker INTERNALS are provably unpinned - no script reads
  `.questTrackerQuest`, `#questTrackerList`, `.questTrackerTitle` or
  `.questTrackerLine` - which is what makes the structure free to change;
  keep the class names anyway wherever the element survives.
- **Conversation interior** - lines stay italic, go parchment; the row list
  keeps every selector and swaps `@panel-row-divider` for the board's ink
  divider inside the panel; hover stays a light lift; locked rows greyed
  as today with the named wall; the Leave./Back exit affordances keep
  today's muted treatment restated in the C vocabulary (muted gold - the
  board's accent for interactive labels; the PO look judges it).
- **Journal interior** - section titles ("Running"/"Completed") take the
  board's gold uppercase small-label treatment (the spellbook board's
  "Auras" line: `@gold-levelup`, uppercase, letterspaced); quest rows keep
  hover/selected with a parchment lift; ink dividers replace
  `@panel-row-divider`; the detail title parchment-bright; diary prose
  stays italic and muted; the objective line bright; Abandon muted with
  hover. All selectors survive.
- **`.panel-chrome()` DIES with its last caller** (`.questTrackerQuest`).
  Check for newly orphaned tokens once it goes - `@panel-bg`,
  `@panel-border`, `@panel-border-radius` - and remove any left
  caller-less. ⚑ `.panel-header-bar()` SURVIVES via `.worldMapHeader`: the
  world map is out of C7's scope, named here so nobody "finishes the
  cleanup" by mistake.
- **Mobile** - the tracker is hidden at the `#questTracker` level on
  mobile, so its internals are exempt. But the conversation/journal
  interior rules land on mobile too, and ⚑ the C6 durable finding applies
  with teeth: `HUD.mobile.less` holds id-scoped journal-interior rules
  (e.g. `#journal .journalQuests > li`) - check every new desktop rule
  against that sheet's specificity, and remember the C6 lesson that a
  style probe can read the wrong twin. ⚑ Specifically for D1:
  `.ink-panel-header()`'s negative margins must match the caller's
  padding, and `variables.less` itself warns that `HUD.mobile.less`
  resets this on panels whose mobile padding differs - `#conversation`
  HAS mobile rules (HUD.mobile.less ~267), so the strip needs its mobile
  counterpart or it overflows the panel there. Probe + both-layout
  screenshots mandatory.

**Harness plan (the §2 "never left red" rule):**

- NEW `c7-tracker.mjs` (the one-script-per-chunk pattern): the
  consolidation has zero existing pins - assert one scrim around N quests
  (no per-quest boxes), left alignment, row click opens the journal at the
  quest, scrolling at overflow, scrim hidden at zero quests.
- `chunkC3-journal` - expected green (it reads `#questTrackerJournal`
  existence plus journal interior classes, all surviving); budgeted
  retrofit only if tripped.
- `chunk3b-ii-conversation` - the C2 precedent verbatim: record its
  pre-existing 28/34 baseline BEFORE the change, compare after; do not
  chase its known reds.
- Stay green untouched: `c2-layering` · `c6-panel-chrome` · `c6-theme` ·
  `c4b-breadcrumb` 17/17 · `chunkC4-quests` · `round4-tooltip`.
- `mobile-layout.mjs` green except leg 7 (the documented HEAD baseline).
- Known-red baselines stand (the CLAUDE.md list); ⚑ measure before
  diagnosing any flake, and suspect the non-monotonic wall clock first on
  any elapsed-time red.

**Verification tail:** `npm test` · `npm run typecheck` · `npm run build` ·
the harness set above · desktop + mobile screenshots (conversation open
with the strip, journal open, tracker with 2+ quests) · PO look.
**Schema NONE.**

**⭐ AMENDED at the build and the PO look (2026-08-30, same day).** The spec
above stands as ruled; two things it predicted turned out otherwise, recorded
here rather than rewritten (the C4b/C5 precedent - annotate, never silently
edit a ruled block):

1. ⭐ **"NOT a CSS-only chunk" was WRONG - C7 landed CSS-only after all.**
   The prediction assumed the D2 consolidation needed a new render, and it
   did not: `QuestTracker.ts` **already** emitted exactly the shape the
   WoW-classic reference asks for - one `li` per quest holding a
   `.questTrackerTitle` div over a `.questTrackerLine` div - because the
   2026-08-23 tracker put the box around that same markup. So the per-quest
   box died in the stylesheet (`.panel-chrome()`'s last caller went with
   it), `#questTrackerList` itself became the one scrim, and the only edits
   to `QuestTracker.ts` and `HUD.html` were comments. ⚑ **The durable
   lesson, worth a check before any future structural chunk: read what the
   render already emits before planning a rewrite of it.** Both landmines
   the spec budgeted for survive by construction, since nothing in the
   render moved - `renderedSignature`'s early-out still guards the per-tick
   rebuild, and the row handler is still `pointerdown`.
2. **The PO look added the global scrollbar restyle** (PO 2026-08-30, the
   one ask of the session; everything built was approved with zero change
   requests). Slim 8px, transparent track, rounded `fade(@wood, 50%)` thumb
   brightening to 80% on hover, authored once as a global rule in
   `HUD.less` so every scroll region - the conversation body, both journal
   panes, the new tracker scrim - shares it. ⚑ Its gotcha is in the code
   comment and the §6 banner: **WebKit pseudo-elements ONLY.**

### C8 - tooltip maintenance debt (detailed + ruled 2026-09-01)

**Deliverable:** close the three §2 tooltip-debt shapes. ⭐ **The survey
REFRAMED the chunk before ruling: shapes 2 and 3 have NO live gaps at
HEAD** - every count re-derived from disk this session, because the §2
write-up (2026-07-29) has drifted and stays as-written per the
annotate-never-edit rule:

- The client `effectBlock()` switch carries **34 cases == the server
  `effectTypeMap`'s 34 names** (§2 says 24; 33 are authored across
  `api/skills/**`, plus the utility-only `recall`).
- `STAT_LABELS` covers **all 6** `validStats` (the costReduction gap §2
  names was closed at round 7).
- `GATE_KEY_LINES` (§2's stale name `GATED_TAG_LINES`) covers both members
  of the CLOSED `GateKeys` set (`smash`, `harvest`).
- `SELECTOR_LABELS`' raw-enum fallback is **unreachable for served data**:
  `catalog.go`'s `reverseNames()` derives wire strings from the same parse
  maps, so only valid names ever leave the server.
- `TICKING_TYPES` (8 members) == the `costChargeTrigger` key set in
  `api/shared-constants.json` exactly - this closes the CLAUDE.md unowned
  leftover "`TICKING_TYPES` silent-failure set" (wrap job: retire that
  line).

So shapes 2/3 need **pins, not fixes**: the drift class is real (the §2
counts themselves drifted), the defense is the ratified §35-C4c
shared-constants contract pattern, extended. Shape 1's §2 direction
("data the server already resolved, rendered generically, the `2fffe9ee`
shape") is **unexecutable as written**: the faction-scope line worked
because an authored datum existed; the ruling sentences (calm, charm,
stun, retaliate, lifesteal) describe hardcoded type semantics with no
authored datum behind them, and inventing parameters to carry them is
YAGNI. The ruled fix is §2's own named partial fix: **author the prose as
skill content**. **Schema NONE** - the `description` field rides the
existing HTTP catalog JSON; no FlatBuffers change, no DB.

**Rulings (PO 2026-09-01, choice prompts):**

- **D1 - THE RULING PROSE BECOMES A SERVED `description` FIELD**, an
  optional per-skill string in the skill JSON, catalog-served, rendered
  as one prose block per skill. **Prose-only by the same ruling**: the
  field cannot carry live or scaled numbers (no placeholder/template
  system in C8 - explicitly out of scope); every number-bearing line
  stays auto-generated so retune survival (the chunk-1 thesis) is
  untouched. Ruled with the tradeoff named: duplication across skills
  sharing a mechanic (the charm pair) is normal content duplication.
- **D2 - THE DESCRIPTION RENDERS UNDER THE SUBTITLE**, before the effect
  blocks: plain-language "what does this do" first, then the numbers
  (the reverse of the WoW flavor-text-at-bottom convention, chosen
  deliberately for a game whose mechanics are undocumented in-game).
- **D3 - ONE FIELD, SHARED WITH C11.** The C11 "flavor descriptions"
  line item and this field are the same thing; C11 authors more of them,
  it does not add a second field.
- **D4 - OWN EXECUTION SESSION.** C8 is one chunk, planned here, built
  in its own session.

**Plan defaults (stated, not asked):**

- **The pin design** (the §35-C4c pattern verbatim, no new machinery):
  `api/shared-constants.json` gains `effectTypes`, `selectors`,
  `gateKeys` and `statNames` lists. The Go twin
  (`shared_constants_test.go`) pins each against `effectTypeMap` /
  `selectorMap` / `GateKeys` / `validStats`, exhaustive BOTH directions.
  The client twin (`SharedConstants.test.ts`) pins `STAT_LABELS`,
  `GATE_KEY_LINES` and `SELECTOR_LABELS` against the same lists, plus a
  fixture-per-type render sweep through `formatSkillTooltip`: every
  effect type in the list renders WITHOUT the `default:` fallback line
  (no `(type)` output, no console.warn). `TICKING_TYPES` is pinned ==
  the `costChargeTrigger` key set. `EFFECT_COLOR_KEYS` is partial BY
  DESIGN, so it gets a **partition pin**: colored keys plus a named
  deliberately-neutral list must equal all effect types, disjoint - a
  new type then fails vitest until someone decides its tint.
- **Per-sentence disposition** - ⚑ only STANDALONE prose moves;
  number-bearing lines stay generated even when they sit adjacent:
  - calm: `'Any damage breaks it — including your own aura'` moves.
  - charm: `'It keeps its own level, and turns on you when the charm
    ends'` moves.
  - stun: the duration line ("Holds one enemy for X…") is
    number-bearing and **STAYS generated**; only `'Damage does not
    break it'` moves.
  - retaliate_slow / retaliate_damage: `'Being hit is enough — it fires
    even when the hit is fully absorbed'` moves (both call sites).
  - retaliate_burst: `'The share is of the hit as thrown, before your
    own mitigation'` moves.
  - lifesteal_burst: `'Works with whichever aura you have on'` moves.
- ⚑ **The per-TYPE → per-SKILL shift is a real coverage step, not a
  refactor detail.** Today the switch prints the sentence for EVERY
  skill carrying the type; after the move, a skill without an authored
  description silently loses its explanation. The census at spec time:
  **10 authored skills** carry an affected type (`bloodthirst`, `calm`,
  `charm-beast`, `charm-elemental`, `fire-shield`, `frost-shield`,
  `omni-passive`, `omni-strike`, `paralyze`, `retribution`), none under
  `mobs/`. The build re-derives this census from disk and authors every
  one (the omni test rigs and the mob-cast `paralyze` included - cheap,
  and it keeps the invariant simple: affected type ⇒ description).
- **Rendering** - one block, once per skill regardless of effect count,
  directly under the `Category · Lv X/Y` subtitle; styling default is
  the journal's diary treatment (italic, slightly muted parchment), the
  PO look judges it. Line-wraps within today's tooltip width.
- **Test updates** - the per-type describes in `SkillTooltip.test.ts`
  assert the moving sentences verbatim; those assertions follow the
  sentences (fixture skills gain a `description`, the assertion checks
  the description block renders where D2 says). Red-first where a seam
  exists.
- **Content pipeline** - the field lands in `definition.go`'s skill
  struct + the 10 JSONs; `make -C backend cp-defs` (or `-content
  ../api`) after JSON edits, and ⚑ `go test -count=1` - a content edit
  does not invalidate the Go test cache.

**Harness plan (the §2 "never left red" rule):**

- `round4-tooltip.mjs` is the layout gate - expected green; budgeted
  retrofit if the new description block shifts an asserted line.
- The pins themselves are vitest + `go test` surfaces, no new Playwright
  script - C8's runtime change (one prose block) is too small to earn
  one; `round4-tooltip` covers the composition.
- Stay green untouched: `c6-panel-chrome` · `c6-theme` · `c7-tracker` ·
  `chunkC4-quests` baseline.
- Known-red baselines stand (the CLAUDE.md list) - ⚑ including the
  **3 census tests in `pkg/aura/items/mobs` RED at HEAD** (the Martin
  NPC counts): the Go tail will not be fully green and that is NOT a C8
  regression. Measure before diagnosing any flake.

**Verification tail:** `npm test` (both pin twins green) · `npm run
typecheck` · `npm run build` · `cd backend && go test -count=1 ./...`
(modulo the census-red baseline) · `round4-tooltip` · in-game PO look at
a described tooltip (Calm or FrostShield) for the D2 placement.
**Schema NONE** (wire = the HTTP catalog JSON only). **Wrap jobs:**
retire the CLAUDE.md "`TICKING_TYPES` silent-failure set" leftover line;
note in the §2 debt block that C8 closed it.

## 6. Chunk ledger

### C7 - dialogue + journal restyle ✅ 2026-08-30 `70486cc0`

Rulings D1-D4, the full spec and the ⭐ AMENDED block (the CSS-only finding
plus the PO-look scrollbar) live in the §5 C7 section - detailed, ruled,
built and played in one day. Shipped, all `frontend/` + one new harness
script, built by an Opus 5 agent and reviewed line-by-line. Schema NONE,
pure client.

- **The conversation (D1)** wears the full `.ink-panel-header()`: the actor
  name in `@gold-levelup` at weight 600, ✕ inside the strip, C6's ink body
  below it. The interior extends the board's own vocabulary rather than
  inventing forms - spoken lines italic on `@parchment`, `fade(@ink, 70%)`
  row dividers where `@panel-row-divider` was, a parchment hover lift, and
  Leave./Back as muted gold brightening to full gold on hover (the board's
  accent for an interactive label). Every selector survived, the greyed
  level-walled rows included.
- **The journal interior** took the same swap: "Running"/"Completed" as the
  spellbook's gold uppercase letterspaced label, ink dividers throughout,
  hover and `.selected` as a parchment lift instead of a white wash, a
  parchment detail title and objective line, the diary italic at 70 %
  parchment, Abandon muted with a bright hover.
- ⭐ **The tracker consolidation was CSS-ONLY, and that is the finding.**
  The §5 block predicted a `QuestTracker.ts` render rewrite; the render
  already emitted the D2 shape - a `.questTrackerTitle` div over a
  `.questTrackerLine` div per `li` - because the 2026-08-23 tracker drew its
  box around that same markup. So `#questTrackerList` itself BECAME the one
  scrim (it already spans every quest, already hides at zero, and is already
  the element the max-height cap scrolls), the per-quest `.panel-chrome()`
  box died in the stylesheet, `align-self: stretch` gave the scrim the
  tracker's width while the J button keeps the column's flex-end alignment,
  and `text-align` flipped right → left. Only comments moved in
  `QuestTracker.ts` and `HUD.html`. ⚑ Both budgeted landmines survive by
  construction: `renderedSignature`'s early-out still guards the per-tick
  rebuild, and the row handler is still `pointerdown`. **The durable lesson,
  cheap to apply next time: read what the render already emits before
  planning a rewrite of it.**
- **D3 held - the scrim is PLAIN**: `@panel-bg`, 0.4rem radius, no ink
  chrome and no wood inlay. The one panel that sits over live play at all
  times keeps the lightest permanent footprint of the family, the ruled
  exception to C6. D4's gold is per-quest, as ruled.
- **`.panel-chrome()` is GONE** with its last caller - the mixin the pass has
  been retiring since C1, so C7 is the chunk that closes it. Its three tokens
  were re-checked rather than removed on reflex: `@panel-bg` feeds the new
  scrim, and all three feed `HUD.mobile.less`'s pre-ink reverts. ⚑
  `.panel-header-bar()` SURVIVES via `.worldMapHeader` - the world map is out
  of scope, named in the spec so nobody "finishes the cleanup" by mistake.
- **Mobile, two id-scoped reverts, both the C6 finding applied**: the header
  strip goes back to its hairline-under-plain-title form
  (`#conversation > .conversationHeader`), and the journal keeps
  `@panel-row-divider` on its section and detail titles - the ink rule reads
  as a drawn line on the desktop panel's moss field and as NOTHING on the
  phone's 95 %-black one (measured on the C7 mobile screenshot: darker than
  what it sits on). Both selectors carry the id, because a bare-class revert
  loses to an id-scoped desktop rule silently.
- ⭐ **The one PO-look change: the global scrollbar** (PO 2026-08-30,
  "cooler and less invasive, rounded edges, subtle"). 8px wide, transparent
  track and corner, a `fade(@wood, 50%)` thumb at 4px radius going to 80 % on
  hover - authored once as a global `*::-webkit-scrollbar…` rule in the
  always-loaded sheet, so the conversation body, both journal panes, the new
  scrim and every future scroll region share it. ⚑ **Durable gotcha, kept in
  the code comment: WebKit pseudo-elements ONLY.** In Chrome 121+ a non-auto
  `scrollbar-width` OR `scrollbar-color` disables ALL `::-webkit-scrollbar`
  styling, so the standards properties must never be added beside the
  pseudos; Firefox keeps its default bar, accepted.
- **Flagged at the look, all accepted by the play with no change asked**:
  the scrim's 0.4rem radius against D2's "rectangular" · a mid-line clip
  when the list hits the scroll cap · no box-level "Quests (n)" line (the
  plan default, which the WoW reference image does carry).

Verified, first-hand split stated: the build agent ran the sweep at its
tree - vitest **571/571** (the 569 of C6 plus the two red-first `confirmRow`
specs from `b3283a2f`; C7 adds none, since `questTrackerRows` never moved) ·
tsc · prod build · the new **`c7-tracker` 10/10** (⚑ "boxless" is asserted as
COMPUTED STYLE, not DOM structure - the list still renders one `li` per
quest, so the claim that survives a re-render is that the entries paint no
background and no border while the ul around them does; the click leg uses
the SECOND quest deliberately, because the journal's own fallback selects the
first) · `chunkC3-journal` 29 PASS + 1 documented SKIP · `c2-layering` 11/11 ·
`c4b-breadcrumb` 17/17 · `round4-tooltip` all passed · the `c6-panel-chrome`
and `c6-theme` look probes clean · `mobile-layout` green except the
documented leg 7 · desktop + mobile screenshots of every touched surface.
⚑ `chunk3b-ii-conversation` was run BEFORE the change on a clean tree (the C2
discipline, baseline recorded first): **28/34 before and 28/34 after,
identical FAIL set**, and its ✕ leg still passes on `SPAN.conversationLeave`
now that the button lives inside the strip. ⚑ `chunkC4-quests`' 20/6/3 was
SETTLED as pre-existing rather than chased - the §6 C3 ledger's
stash-and-rerun line plus the mechanism: the script opens the journal once
with KeyJ and C2's exclusivity closes it at the first `talkTo`, so every
later detail read hits a closed panel; `chunkC3-journal` green proves the
render itself healthy.

⚑ **The wrap re-ran two scripts against a FRESH prod build**, because the
scrollbar landed via HMR at the look and a 15px → 8px scrollbar changes every
scroll container's client width: `c7-tracker` **10/10** and `round4-tooltip`
**all passed**, both first-hand at the wrap, 0 console errors and 0 WebGL
context losses. (The only `scrollbar-width` left in the bundle is SimpleBar's
own vendor rule, scoped to the wrappers whose native bar it deliberately
hides - not a conflict with the global pseudos.) ⭐ **PO played 2026-08-30,
"all good" - ZERO change requests on the built surfaces**; the scrollbar was
the session's single addition, applied and re-verified the same day.

### C6 - panel chrome rollout ✅ 2026-08-30 `a2a1595b`

Rulings D1-D5 and the full board-ratified spec live in the §5 C6 section
(detailed + ruled in its own session, same day). Shipped, all `frontend/` +
one harness retrofit + one new look probe, built by an Opus 5 agent and
reviewed line-by-line - ⭐ **the review caught a real bug** (below). Schema
NONE, pure client CSS.

- **The rollout as ruled:** `.ink-panel-chrome()` onto `#conversation`
  (body only, D2), `#spellbook` + `#help` (both with the wood header strip,
  wrap-never-rename - badge and `#respecButton` ride inside the spellbook's
  strip untouched) and `#gameSettingsPanel` (D3, no header); the tooltip as
  the opaque panelC variant (C2 D3 landed); `#confirmRow` inked by hand so
  its warning-red danger border survives; the four HUD buttons on the
  board's `.btnC` with 19px `.keyC` hotkey chips; both bars as ink-outlined
  pills (999px radius - neither bar authors a height, and 180deg gradients
  mean the JS x-scale cannot distort them); the minimap's double ink ring.
  **D1 held**: `.panel-chrome()` survives with exactly ONE caller,
  `.questTrackerQuest`, until C7 replaces that structure.
- **Structural moves, both reversible:** the two ink mixins live in
  `variables.less` now - every feature sheet is its own LESS entry
  (`gameSettings.less` imports variables, not HUD.less), and parametric
  mixins emit no CSS so the double-import rule holds. New
  `.hud-key-chip(@size, @font)` = the board's `.keyC`; C5's slot chip now
  CALLS it at `@slot-hotkey`/11px (the C4 re-size-never-restate rule
  applied to the second reused component).
- **The breadcrumb pulse rides `::after` now** (forced: `.btnC` keeps its
  wood inlay in box-shadow, and the old element-level keyframe stripped it
  every cycle - probe-proven both ways: inlay intact mid-pulse under the
  overlay, and the D4 4-state matrix shows glow-only on a fresh row). Four
  `position: relative` landing spots are load-bearing;
  `c4b-breadcrumb.mjs`'s two animation-state probes read the pseudo now.
- ⭐ **The review-caught bug - a mobile reset must OUT-RANK what it
  reverts:** the phone's hotkey-chip revert was authored as a bare class
  under `html.mobile` (0,2,1), and the desktop chip rule is id-scoped
  `#journalButton > .journalButtonHotkey` (1,1,0) - an id beats any pile of
  classes, so the ink chip silently persisted in the ☰ sheet. Fixed with
  the id in the revert selector, probe-proven on both twins. ⚑ The trap has
  a second face: `querySelector('.journalButtonHotkey')` reads the FIRST
  match in DOM order, which is the tracker's HIDDEN copy - a style dump can
  green-light the wrong twin, so the settle was a targeted probe of both.
- **Deviations flagged at the look, ALL PO-approved with zero change
  requests** (the pass's first such chunk): minimap margins +9px so the
  outer ring clears the viewport · its rim ink-filled (the spec left a
  hole) · the ring passing ~13px behind `#mapButton` · the 19px chips ·
  `.hasPoints` recoloring a 2.5px border · the darker XP gradient (board
  literals) · settings padding via the mixin · the mobile `.cdSweep` rider
  as a partial fix (~3px residual spill, `inset: -3px` kept).
- ⚑ **Surfaced at the look, not caused** (new intake → `docs/feedback.md`,
  PO-ruled fix-now same session): an armed `#confirmRow` outlives the
  conversation - `render()`'s closed branch hides the panel but never
  touches the confirm row or its countdown.

Verified, first-hand split stated: the build agent ran the sweep at its
tree - `c2-layering` 11/11 · `c1-world-map` 12/12 · `c5-ability-bar` 30/30
· `chunkC3-journal` · `c5-bars` · `round4-tooltip` · `c3-spellbook` 26/26 ·
stash-proof that `mobile-layout` leg 7's 3 reds are byte-identical at HEAD.
The coordinator re-ran post-fix: vitest **569/569** · tsc · prod build ·
`c4b-breadcrumb` **17/17** · `n1-shield-bar` **4/4** · `mobile-layout`
green except the documented leg 7 · the `c6-panel-chrome` look probe ×2 +
a targeted chip probe · desktop + mobile screenshots eyeballed (the
desktop sweep carries over: the one post-sweep change is `html.mobile`-
scoped). ⭐ **PO played 2026-08-30, everything checked out.**

### C5 - the ONE ability bar ✅ 2026-08-29 `cc5ebe8f`

Rulings D1-D2, the full spec and the ⭐ AMENDED block (the two PO-look
changes) live in the §5 C5 section - detailed, ruled, built, played and
amended in one day. Shipped, all `frontend/` + one new harness script + 3
retrofitted ones, built by two Opus 5 agents (build wave, then fix wave)
and reviewed line-by-line between them:

- **`HUD.html` - wrap, never rename.** A new `#abilityBar` holds the
  surviving `#auraLoadout` and `#cooldownLoadout` around a `.barDivider`
  (wood, 2×42px); `#utilityBar` sits beside it as its own island. Every
  existing harness selector keeps matching. ⚑ Passive `li`s gained the
  standard `.slotLabel` span (bare `textContent` before, D1's normalization)
  and cooldown `li`s a `.cdSweep`; every slot `li` now authors
  `data-skill-id="0"` so "empty" is a CSS-readable fact.
- **`HUD.less` - ONE `.auraSlot` anatomy serves all four lists** (aura,
  cooldown, utility, passive), board-verbatim: 52px circle, 3px ink ring,
  `#0e1811` well, 17px corner-motif hotkey chip at -6px, empty =
  `opacity .55` via `[data-skill-id="0"]`, active = the D12 wooden-rim
  box-shadow. `.ink-panel-chrome()` moved onto the three islands.
  `.ink-token` is **re-sized** to 26px with the ring drawn by the slot -
  the C4 rule (C5 re-sizes it, never restates it) held.
- ⚑ **Pending vs active compose because they use DIFFERENT properties:**
  `.hasPendingSkill` is a gold BORDER, `.activeSlot` a box-shadow rim - the
  C4b animation lesson applied in reverse (one property, one winner; two
  properties, both render).
- **`#leftColumn` is bottom-anchored with `pointer-events: none` and
  `auto` on its children** - the C3 dead-strip-eats-clicks defect one level
  up, pre-empted rather than rediscovered. The open spellbook sits above the
  passive island, both clickable, as the equip flow requires.
- **Titles are hidden, NOT removed** (the standing rendered-DOM rule);
  `.auraLoadoutTitle` was re-homed standalone because the mobile ☰ sheet
  un-hides the passive one. `.outOfCharges` moved off the now-hidden label
  onto the glyph, and Camp's charge count is the bottom-right chip.
- **`HUD.ts`**: `renderSlotToken` rides the existing diff, owns
  `data-skill-id`, and rebuilds a letter fallback once the catalog lands
  late; `updatePassiveLoadout` writes `.slotLabel`; cooldown seconds are
  whole (`4s`, ceil) and feed `--cd-sweep` plus a `.longCd` class for
  >3-char strings. New pure **`CooldownSweep.ts`** (8 red-first specs)
  keeps peak-remaining memory with no catalog coupling.
- **`Utilities.ts`** renders the C4 `UTILITY_ICONS` glyphs once at wiring,
  double-setup guarded. ⚑ The Recall-then-Camp markup order stays
  load-bearing for the mobile thumb column - never reorder it.
- **`HUD.mobile.less` (D2)**: bar chrome off, divider hidden, the
  `.activeSlot`/`.hasPendingSkill` tile restatements reconciled against the
  circular anatomy, `overflow: visible` for the ember dot, the passive
  island restated as a labelled list inside the ☰ sheet. Thumb order
  untouched. ⚑ Mobile overrides the shared anatomy BY ID SCOPE - a change
  to `.auraSlot` now lands on four lists and two layouts at once.
- ⚑ **The PO-look pip fix is the durable finding** (details in §5): a
  bubbled animation event. `playCssAnimation` is shared, and without its
  new `event.target !== element` guard a child row's `.breadcrumb` cancel
  strips `#spellbook`'s `unlockPulse` mid-glow. The review caught the gap
  after the fix agent had already landed the rest; fixed red-first.
- **Deviations flagged at the look, no change asked:** the desktop passive
  island carries no label at all (titles hidden) · seconds read `4s`, not
  `4.0s` · token chrome is stripped inside slots.
- ⚑ **Surfaced, not caused** (all unowned, none blocking): this host's wall
  clock is **NON-MONOTONIC** (a ~66 s backwards jump measured) and it
  explained all three transient sweep reds - it will bite any elapsed-time
  harness leg again · `r7-respec-cost` screenshots BETWEEN its two Reset
  presses, which on a loaded box overruns the 4 s confirm window (4335 ms
  measured); the one-line fix (screenshot after the confirm) is a PO call,
  deliberately NOT applied · on mobile the `.cdSweep` circle (inset -3px)
  overhangs the rounded-square tile's corners - candidate
  `border-radius: inherit`, left to C6 · the pip's rhythm carries snapshot
  jitter (817-1740 ms against a true 1333 ms cadence, ±35%) and its
  scale-up phase is 70 ms of 0.28 s - enlarging or lengthening it is a
  design call, deliberately not taken.
- Harness idioms reconfirmed for the next author: 7+ verify scripts read
  `argv[2]` as the URL, not a label · spellbook rows must be clicked at
  **x+25**, never centre · `c1-bloodline-seed.mjs:137`'s previously DEAD
  `.passiveSlot .slotLabel` selector now matches for the right reason
  (5/5), it was re-checked rather than silently "fixed".

Verified on the final tree: vitest **569/569** (554 + 15 new, red-first:
8 CooldownSweep + 7 Utils) · tsc · prod build · new `c5-ability-bar`
**30/30** (27 at the build wave, 3 added at the fix wave), 0 console
errors · sweep green: `c3-spellbook` 26/26 · `c4b-breadcrumb` 17/17 ·
`backlog33-prehot` 4/4 · `n1-shield-bar` 4/4 · `r3-lifesteal-burst` 7/7 ·
`c2-frost-shield` 7/7 · `r1-focus-cost` · `r7-strong` ·
`c1-bloodline-seed` 5/5 · `c5-bars` exit 0 · `c1-open-portal` 17/0/1 and
`c2-pull-through` 22/0/1 (each script's own dwell race, settled on retry) ·
`c3-flight-client` 35/35 with `flightLocked` proven in a real flight ·
`r7-respec-cost` settled by probe (the timing flag above) ·
`mobile-layout` green except leg 7 = the documented HEAD baseline · mobile
probe + screenshots at both waves. Known-red baselines stood throughout.
⚑ **First-hand split, stated for honesty:** the coordinator re-ran
vitest/tsc/build/`c5-ability-bar` (27/27 pre-fix) and eyeballed the
screenshots; the full sweep tallies are the build agent's; the fix agent
re-ran `c5-ability-bar` 30/30 plus `c3-spellbook` and `c4b-breadcrumb`
first-hand after the target guard. ⭐ **PO played 2026-08-29**; the bar
approved as shipped, the two look changes applied and re-verified the same
session. **Schema NONE** - pure client.

### C4b - the unlock breadcrumb trail ✅ 2026-08-29 `c22eadc0`

Rulings D1-D4 and the full spec live in the §5 C4b section (detailed + PO
choice prompts same day, one session before the build). Shipped, all
`frontend/` + one harness script, built by an Opus 5 agent and reviewed
line-by-line:

- **`Spellbook.ts`** owns the unseen set and the whole trail: record-only
  `noteUnlocked(ids)` (⚑ it is called mid-rebuild before every row exists -
  rendering there would let the prune eat ids whose rows are not appended
  yet; the trailing `Spellbook.refresh()` is the render), one `applyTrail()`
  at the end of `render()`, one wall-clock dwell timer cancelled at the top
  of every pass, the stale-id prune SKIPPED against an empty list
  (updateSpellbook clears the list before refilling it). All class
  applications are `toggle(..., bool)` - the trail moves and clears with no
  bookkeeping of its own.
- **`HUD.ts`**: one array push inside the existing `.unlocked` diff + one
  `noteUnlocked` call before `Spellbook.refresh()`. ⚑ LOAD-BEARING: the
  trail rides the SAME diff as the `.unlocked` stamp, which is what makes
  the join/respawn baseline all-seen (D4) - a second diff computed anywhere
  else silently breaks it the first time the two disagree.
- **`.breadcrumb`** (HUD.less, top-level): animates BOX-SHADOW ONLY so it
  composes with `.hasPoints` (which owns border-color/color on the same
  buttons - a fresh unlock always grants a point too; screenshot-proven
  both classes at once). Mobile needed NO reset - probed (box, keyframe,
  iteration-count read back at 390x844), not assumed.
- ⚑ **Known composition limit, flagged + shown at the PO look, no change
  requested:** a row that still carries the one-shot `.unlocked` shows the
  5 s gold unlock glow instead of the breadcrumb pulse - the id-scoped
  `.unlocked` rule wins the `animation` property outright (CSS animations
  do not merge across rules). Deliberately not fought: the spec keeps the
  one-shot untouched, the louder glow plays during exactly that window, and
  the JS seen-marking is unaffected. C6 settles it if the pulse should win.
- **`SEEN_DWELL_MS` 1000 → 500** at the PO look (the one change request);
  still ⚑ PLACEHOLDER. The harness mirrors it (`DWELL`) and waits ~2×, so a
  retune does not turn the script red.
- Harness preamble (construction, not a leg): `XP 20000` buys the points
  leg 2's composition claim needs; its milestone unlocks are themselves
  unseen, so `dwellBookClean()` walks the book clean once and the run
  hard-exits if it cannot.
- ⚑ `chunk2-follower` leg 6 (companion XP) reported INCONCLUSIVE during the
  sweep - settled by stash-and-rerun: IDENTICAL at HEAD (companion focused
  and killed in ~8 s, the documented D9 fragility the script is tri-state
  for). Pre-existing, not this chunk's.

Verified first-hand after line-by-line review (agent green not taken on
faith): vitest **554/554** (543 + 11 trail specs, red-first) · tsc · prod
build · new `c4b-breadcrumb` **17/17** twice (at 1000 ms and re-run at
500 ms), 0 console errors · `c3-spellbook` **26/26** held · spot-checks
`backlog33-prehot` 4/4 + `c4-skill-icons` 6/6 · mobile probe + screenshots
(⚑ `verify/*.png` is gitignored - they do not ride the commit). ⭐ **PO
played 2026-08-29**; the look approved the trail and asked the one halving,
applied + re-verified same session. **Schema NONE.**

### C4 - skill icons ✅ 2026-08-28 `1400e4fc`

Rulings D1-D3 and the full spec live in the §5 C4 section (PO choice
prompts same day). Shipped: content + a one-field Go rider + client +
harness (⚑ the first UI-pass chunk that is NOT pure client), built by an
Opus 5 agent and reviewed line-by-line:

- **All 72 `api/skills` definitions author `icon: "author/name"`** (a
  game-icons.net path); Go carries it as `Icon` on the definition struct +
  catalog passthrough (the `displayName` precedent exactly), mob-embedded
  skills serve `""`. Completeness pinned twice:
  `skill_icon_content_test.go` (every top-level api/skills entry authors a
  shape-valid icon; `api/skills/mobs` authors none - both directions
  asserted) and `SkillIcons.test.ts` (every authored value is bundled, no
  hardcoded fill; reads api/ from disk under jsdom).
- **Vocabulary: D3's functional placeholders landed at 33 glyphs** (⚑
  above the ruled "roughly 15-25": each damage tag and stat axis carries a
  genuinely different function - flagged as a deviation, PO approved as
  shipped). Reuse heavy where it matters: broadsword 6 skills, ward-shield
  7, totem 6, healing 5. Judgment calls flagged + approved: HoldTheLine
  reads summon, FireVulnerability reads fire.
- **Pipeline:** `scripts/fetch-skill-icons.mjs` (one-time tool, never a
  build step; `--force`/`--offline`; the strip HARD-FAILS if a fill/rect/
  style survives, so an un-tintable glyph cannot ship) vendors stripped
  SVGs under `client-data/icons/vendor/`, generates
  `SkillIcons.generated.ts` (~42 KB inline viewBox+body: tint via
  `currentColor`, no runtime HTTP, no webpack rule change) and `NOTICE.md`
  (CC BY 3.0, per-author). Utility glyphs ride its EXTRAS list.
- **`.ink-token`** (HUD.less, `@ink-token-size` 2.2rem): the direction-C
  glyph treatment as ONE reusable class - parchment glyph, ink ring, wood
  inset, corner motif at button scale; C5 re-sizes it for slots.
  `IconToken.ts` builds glyph or `.letterFallback` initial. Prepended
  before `.skillName` in `updateSpellbook`; `.skillName` gained `flex: 1`
  (the row is three flex children now). ⚑ Zero extra row height (the row
  pitch is set by its text line) and mobile needed NO reset (probed).
- **Utilities:** `UTILITY_ICONS` = Recall + Camp only, Ascend deliberately
  absent, pinned as an EXACT key set (not equality with `UTILITY_NAMES`).
  Asset only - C5 renders them.
- ⚑ **Pre-existing red SURFACED, not caused:** 3 census tests in
  `pkg/aura/items/mobs` fail at HEAD on the collaborator's Martin NPC
  (`6c2e6d5c`) - `backend/pkg/api/mobs/` is gitignored and was STALE, so
  the suite was green by accident until this chunk's `make build` ran
  cp-defs. Proven by remove/restore of the embedded file. NOT fixed here;
  the hardcoded censuses belong to whoever added Martin (CLAUDE.md open
  item).

Verified: vitest **543/543** (538 + 5) · tsc · prod build ·
`go test -count=1` green in `skills` + `cmd/aurad` (store/accounts skip
without `AURA_TEST_DB_URL`, expected for schema-NONE) · `c3-spellbook`
**26/26** held (run twice) · new `c4-skill-icons` **6/6** ·
spot-checks `backlog33-prehot` 4/4 + `chunk2-follower` 6/6 · desktop +
mobile + portrait screenshots. ⭐ PO approved 2026-08-28, same session;
the look also routed C4b (the unlock breadcrumb trail, §5).
**Schema NONE.**

### C3 - the spellbook structural rework ✅ 2026-08-28 `9cc6cd74`

Rulings D1-D5 and the full spec live in the §5 C3 section (PO choice
prompts 2026-08-27). Shipped, all `frontend/` + harness, built by an Opus
5 agent and reviewed line-by-line (the agent died to a session limit in
its closing pass; every remaining step was re-run and settled first-hand):

- **`Spellbook.ts`** (~200 lines) owns visibility, tab and page, nothing
  else: rows and their interactions stay HUD.ts's, which stamps each row
  `data-category` so the module is catalog-free (17 TDD'd vitest specs on
  a jsdom fixture). `'spellbook'` joined the `PanelId` union; every open
  path notifies, `close()` no-ops when shut. `KeyB` + the blanket Escape
  in `Controls.ts` (J/M pattern); in-place toggle per D1 - desktop equip
  flow untouched.
- ⚑ **The harness-compat rule is load-bearing:** the whole panel DOM stays
  RENDERED - open/close and tab/page filtering toggle classes
  (`hidden`/`offPage`), never remove nodes. `page.evaluate` queries survive
  a shut book; only boundingBox/locator access needs the book open, via the
  new `lib/spellbook.mjs` (`showSkillRow`/`showSkillRowAt`) - 27 scripts
  retrofitted through it, no hand-rolled variants.
- ⭐ Badge in BOTH places (PO look 2026-08-28): the unspent-points count
  rides the open buttons (desktop "B Spellbook" under #mapButton, the ☰
  sheet row) AND the panel title; `updateSkillPointsDisplay` feeds every
  `.skillPointsBadge` so they cannot disagree. `hasPoints` glow on the
  buttons.
- Mobile (D4): the book is a full-screen panel; the sheet keeps only a
  Spellbook row. ⚑ Selecting a PASSIVE closes the book and opens the sheet
  (its slots live there) via `MobileMenu.openSheet()`; aura/cooldown just
  close the book. Confirmed at the PO look.
- ⭐ Two product defects the new legs caught, fixed in-chunk:
  `#bottomCenter`'s transparent strip swallowed pager clicks (new
  `@z-left-column` token) · the `.offPage` rule lost a same-specificity
  source-order tie to `.sectionHeader`'s `display: block` - the rule sits
  AFTER it on purpose, do not reorder.
- SimpleBar KEPT as overflow backstop only - pages are the reading
  mechanism (`#spellbookScroll` clamp grew 24rem → 30rem for the tab row +
  pager).

Verified: vitest **538/538** (521 + 17) · tsc · prod build ·
new `c3-spellbook` **26/26** (incl. the five exclusivity legs + D4 flows) ·
`c1-world-map` **12/12** and `c2-layering` **11/11** untouched · **full
32-script sweep**, every red settled: `chunk3-charm` 6/9 +
`chunk3b-ii-conversation` 28/34 baseline-identical · `mobile-layout`
(rewritten) red only in leg 7's three checks = the documented
registration-nag cover, screenshot-confirmed · `r7-respec-cost`,
`c0-honest-plate`, `chunkC4-quests` fail IDENTICALLY at HEAD
(stash-and-rerun settlement), pre-existing · `c2-pull-through` 22/22 + 1
known-inconclusive after one dwell-window flake · `harnessdb -cleanup` ran
(72 accounts). ⭐ **PO clicked through 2026-08-28**; the look routed one
wish - the badge in both places - applied and re-verified same session.
**Schema NONE.**

### C2 - the layering & exclusivity policy ✅ 2026-08-26 `a284ff00`

Rulings D1-D4 and the full spec live in the §5 C2 section (PO choice
prompts, same session). Shipped, all `frontend/` + harness, built by an
Opus 5 agent and reviewed line-by-line:

- **`PanelExclusivity.ts`** (~20 lines): `register(id, closeFn)` +
  `notifyOpened(id)` closes every other registrant; the `PanelId` union
  makes a typo'd id a compile error (spellbook joins the union at C3). The
  registry is the only copy of the matrix - MobileMenu's direct
  `Journal.close()`/`Help.close()` calls and cross-imports are gone. TDD'd
  red-first (6 vitest specs, fake registrants).
- Wired: Journal (`toggle`/`openQuest`), Help, Conversation (the
  server-driven `render()` closed→open transition; close is `leave()`),
  Settings (`show()` notifies; `hide()` gained an already-shut guard so
  `resetFocus()` stops firing on every blanket call), MobileMenu.
  `GameSettingsUI.hide()` joined the `Controls.ts` blanket Escape list -
  in-world only (the handler attaches in the `Controls` constructor).
- ⚑ **The ☰ sheet is a FULL family member** - broader than the 2026-08-02
  one-sheet rule: opening the sheet now also closes settings (and vice
  versa) and leaves an active conversation. Consequences of D1, flagged at
  the PO look ("works"); ⚑ those two cross-closes have no harness legs yet
  (`c2-layering` leg D covers sheet↔journal/help) - narrow = a filter in
  `notifyOpened`, confirm = add the legs.
- ⚑ Registered close functions MUST be no-ops when already shut (they run
  on EVERY family open); all five are.

Verified: vitest **521/521** (515 + 6) · tsc · prod build · `c1-world-map`
**12/12** untouched · `chunkC3-journal` REWRITTEN (it pinned the outlawed
journal+conversation pair) - green + a new D1 leg · `chunk3b-ii-conversation`
**28/34 before AND after**, the six reds byte-identical to the pre-change
baseline (all pre-existing) · new `c2-layering` **11/11** (polls the
conversation close per the accepted round-trip window) · `mobile-layout`
unchanged. ⭐ **PO clicked through in-game same day: "works".** **Schema
NONE.**

### C1 - the ink chrome ✅ 2026-08-26 `ed9a9f4a` (REDONE same day)

**The first build (a 14px wobbly 9-slice `ink-border.svg` band) was REJECTED
at the PO's look and deleted the same day** - "no wiggly forms around the
UIs"; the ruling + the real spec (the rendered mockup CSS) live in the §4
CORRECTION block. Nothing of the band survives: no SVG, no border-image, no
padding subtraction, none of the band-era findings.

Shipped instead (the mockup's `.panelC`/`.hdrC` translated 1:1):

- the four ratified tokens in `variables.less` (all outside the
  `Theme.test.ts` pin set; the header gold is the EXISTING `@gold-levelup`,
  which the mockup uses verbatim) · `@panel-padding` split into `-y`/`-x`
  with the composite unchanged (the header's negative margins read it);
- **`.ink-panel-chrome()`**: `fade(@moss, 90%)` body · straight
  `3px solid @ink` · wood inlay `inset 0 0 0 2px fade(@wood, 45%)` + soft
  drop shadow · corner motif `13px 7px 15px 9px` (wider TL/BR, tighter
  TR/BL - the mockup repeats it on buttons 9/5/10/6 and key chips 5/3/6/4,
  ready for C5/C6) · unchanged @panel-padding (`.panel-chrome()` untouched);
- **`.ink-panel-header(@pad-y, @pad-x)`**: the wood strip, full-bleed via
  negative margins sized to the panel padding; gradient ends at the
  mockup-literal `#5f3b18`, `align-items: center` per the mockup (the old
  header bar was `baseline`);
- **`#journal` pilot**: chrome + header, gold 600 title, parchment ✕.

Findings the C6 rollout must know:

- ⚑ **Mobile needs EXPLICIT resets now** (the old "untouched by
  construction" died with the band): the fullscreen sheet's `border: none` /
  `background:` do NOT clear `box-shadow` (the inlay ring), and the header's
  negative margins are desktop-sized. `HUD.mobile.less` resets box-shadow +
  the full header treatment incl. title/✕ colors; any C6/C9 panel flip on a
  mobile-restyled surface needs the same audit.
- ⚑ **Negative margins in LESS want parens**: `(-@panel-padding-y)` - a bare
  `-@var` in a value list can parse as subtraction.
- The wood inlay paints above the background but UNDER content, so the
  header strip covering it at the top is the mockup's own rendering, not a
  defect to fix.
- Tight callers are a non-issue now (the 3px border replaces a 1px one; no
  padding subtraction exists to go negative).

Verified after the redo: vitest **515/515** · tsc · prod build (3
pre-existing asset-size warnings) · `chunkC3-journal` **15 PASS + 1 SKIP**
(probe quest not installed - skip-by-construction for a frontend-only chunk)
at both 1280x800 and 2560x1440, 0 console errors · mobile computed-style
probe (border 0, shadow none, plain header) + screenshot: the phone matches
its pre-C1 look. **Schema NONE.**

⭐ **PO looked at the redone pilot in-game same day: "looks much better
now"** - the look is APPROVED as shipped; none of the offered knobs (edge
weight, corner motif, moss 90%, moss-vs-no-green body) drew a change
request, so all stay at the mockup literals. They remain available at the
C6 rollout if the treatment reads differently on other panels: the edge is
a two-number thickening (the 3px/2px pair was authored against 13-16px
board type vs the game's 1.7rem), the body opacity/green are one-token
changes, and §2's layering policy still wants 100% on stacking panels (a
token variant, not a new look). The §5 C2+ order still wants PO
ratification.
