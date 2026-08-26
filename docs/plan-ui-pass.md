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
> first build's wiggly band (§4 CORRECTION block, §6 ledger); the C2+ order
> is PROPOSED, not PO-ratified.**
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

### Proposed chunk order (⚑ PROPOSED, not PO-ratified - only C1 was
### PO-named in advance; the PO may reorder C2+ at any session touch)

Derived from §4 Phase 2's dependency shape plus the two §2 sequencing rules
(structure before chrome; icons before the icon-only bar):

- **C1 - the ink chrome** (the ratified prerequisite; built this session,
  redone same day after the PO's look, detail below).
- **C2 - the layering & exclusivity policy** (§2): the matrix designed once,
  at the FRONT of the panel group so every later panel chunk executes
  against it; re-rules or names the four harness-pinned exceptions.
- **C3 - spellbook structural rework** (§2): openable/pagination/categories,
  tags separable; structure before chrome; harness sweep budgeted.
- **C4 - skill icons, shipped-ability subset** (§2 item 1 pulled forward):
  game-icons.net sourcing in the ink-ringed-token treatment; prerequisite of
  C5.
- **C5 - the ONE ability bar**: the §2 consolidation (icon-only, wood
  divider, utility island) + direction-C restyle; `.slotLabel` DOM contract
  kept, harness sweep budgeted.
- **C6 - panel chrome rollout**: every `.panel-chrome()` caller plus the
  one-off panels (tooltip, `#confirmRow`) onto the C1 treatment; the C1
  header strip onto every open-state UI; resource/XP bars ink-outlined;
  minimap chrome.
- **C7 - dialogue + journal restyle** (round-9 item 2's non-font half).
- **C8 - tooltip maintenance debt** (the three §2 shapes).
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

## 6. Chunk ledger

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
