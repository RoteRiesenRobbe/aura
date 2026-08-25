# Plan: the UI pass - one consolidated pass over HUD, panels, dialogue and mobile

> **Status: ROADMAP SET 2026-08-25 (PO session), not chunked.** Created
> 2026-08-24 to end the scatter: UI work used to live in four places
> (`plan-ui-polish.md` §Deferred, `plan-playtest-feedback.md` round 9,
> CLAUDE.md's mobile open items, `plan-ui-font.md`). This doc is now the
> single home. The 2026-08-25 session added §4 (the phased path to done, with
> three PO rulings) and §2's boot-to-game surface inventory. **The next
> concrete session is the §4 Phase 0 design-language mockup session.**
> Nothing below is chunked yet, and the PO's font investigation
> (`plan-ui-font.md`) is still running (PO-owned; design work does not block
> on it, ruling R3).

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
