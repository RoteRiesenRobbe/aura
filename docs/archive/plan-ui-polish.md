# Plan: UI Polish Pass — Rough First Pass (step 8, item-8 slice)

> **⛔ CLOSED AND ARCHIVED 2026-08-24 (collection-doc restructuring).** The
> whole §Deferred checklist (9 items) and the tooltip maintenance debt moved
> to **`docs/plan-ui-pass.md`**, the consolidated UI pass - that doc is now
> the single home for UI work. Chunk 1's ledger below stays the record of the
> tooltip conventions already ruled (full detail lines, anchored placement,
> colored labels) and is named as a design-session input there.

**Status (historical):** **CHUNK 1 DONE 2026-07-21 — PO-VERIFIED IN-GAME 2026-07-21 ×2
("it works and is correct" + text-size/color follow-up "it's great"),
committed `ae51d8b5`.** This pass's single chunk is complete; the rest of the
item-8 checklist stays deferred (see §Deferred). Full ledger below.

## Chunk 1 ledger (DONE 2026-07-21, `ae51d8b5`)

**PO rulings (choice prompts, in-session):** tooltip stat lines = **full
detail** (every authored non-zero mechanic gets a line — crit, execute,
berserker, lifesteal, variance, tags, self-cost; unauthored fields show
nothing); tooltip **anchored to the hovered element** (flips left on
overflow, viewport-clamped), not cursor-following. Follow-up pass (same day,
after first PO verify): **shared-line dedupe + font bump** (radius/targets
lines identical across all of a skill's effects print once at the bottom;
lines that differ stay grouped under their effect — Warbanner's 4 auras share
radius 1.2 but tick at 40/120/30/1, so radius merges and cadence can't) and
**colored label only** (the leading "Damage:"/"Heal:" label tints in the
effect's `AURA_CATEGORY_COLORS` ring/pip color, numbers stay neutral; types
without an aura category stay uncolored; colon-free colored lines like
"Emits light" tint fully).

**Judgment call (flagged to PO, accepted):** cadence folded into the main
line instead of a standalone "Ticks every" line — hit auras "Damage: 15 →
18.4 every 1.32s", state/over-time auras ", refreshed every 0.99s",
interval-1 (continuous) shows only the hit auras' "per tick". Warbanner ~15
→ 11 lines.

**Backend:** `skills/catalog.go` — `CatalogJSON` (parsed registry sorted by
id, marshaled once at boot) + `CatalogHandler` (`Content-Type` +
`Access-Control-Allow-Origin: *`), mounted as `GET /skills` on both muxes in
`aurad.go` (plain + TLS, like `/game`). JSON tags live on the REAL
`SkillDefinition`/`EffectDef`/payload structs (no DTO — an untagged new field
still marshals under its Go name, so drift is review-visible instead of
missing); enum wire strings via `MarshalJSON` on
`SkillCategory`/`EffectType`/`Selector`/`HitStyle` derived from the parse
maps (`reverseNames`, "" alias keys skipped) so the two directions can't
drift. `DisplayName` on `SkillDefinition`: authored `displayName` JSON
override else derived CamelCase→spaces server-side. Override audit found
exactly 4: **Call for Aid, Damage-Burst, Long-Range Strike, Hold the Line**
(authored in their JSONs); everything else derives clean.

**Frontend:** `client-data/Skills.ts` rewritten as the catalog module — the
three hand-sync maps are **deleted** (roadmap item-8 debt entry closed);
`skillDisplayName`/`skillMaxLevel`/`skillCategory` keep signatures, read the
fetched catalog (wsUrl-derived origin `ws://…/game` → `http://…/skills`,
fetched once at module init), degrade to `Skill #<id>` / `'aura'` on
failure; typed payload interfaces mirror the Go JSON; server category
`active_aura` maps to client `'aura'`; `activationRejectionMessage` stays.
New `HUD/logic/SkillTooltip.ts`: pure `formatSkillTooltip` (per-effect-type
line table over all ~20 types, current→next `prog()` values, ticks → seconds
at 33 ms, unknown-type console-warn tripwire) + one shared `#skillTooltip`
element on `document.body` (fixed positioning must not be re-rooted) with
delegated `pointerover`/`pointerout`/`pointerdown` on the spellbook and all
three loadout lists. `HUD.ts`: `currentSkillLevels` map (kept by
`updateSpellbook`, feeds slot tooltips too), `data-skill-id` stamped on
aura/passive/cooldown slot `li`s. Styles in `HUD.less` (`#skillTooltip`).

**Verified:** `go build` clean; full backend suite green (+4 catalog tests
in `catalog_test.go`: sorted+complete, display names, fields/defaults —
absent `damageTags` → `[physical]` survives into the catalog — handler
status/headers); `tsc` clean; prod build clean; boot `-content ../api`
**81 skills/14 factions/50 mobs/10 recipes/828 props/373 spawns/5 campfires/
14 npcs, 0 panics**; live curl pinned headers, id sort, overrides, parsed
defaults; headless Playwright smoke **10/10 PASS** (spellbook hover line
content, aura + cooldown slot tooltips incl. Cooldown progression line,
empty slot silent, Warbanner dedupe + 4 label colors, blocked `/skills` →
"Skill #1" fallback with no tooltip and no errors); PO in-game ×2.

**Watch items:** `#gameUI` is a zero-size positioning shell — Playwright's
visibility check never passes on it; wait on `classList.contains('hidden')`
instead. `AURA_CATEGORY_COLORS` lives in `AuraRings.ts` (game-objects) and
is now also a HUD dependency.

**Placeholders (none FINAL):** tooltip font 1.5rem body / 1.6rem title /
1.25rem subtitle, max-width 26rem, background `fade(black, 85%)` (all
`HUD.less`); line-wording per effect type in `SkillTooltip.ts`; label colors
ride the existing `AURA_CATEGORY_COLORS` placeholders.

**Scope ruling (PO 2026-07-21, choice prompts):** step 8 starts with the UI
side, and this pass is deliberately a **rough first pass focused on
playability and impact** — it contains **one chunk**: the skill-catalog
endpoint + ability hover tooltips. Everything else on the roadmap item-8
polish checklist (skill icons, unlock/level-up popups, ability-bar/bars
styling, minimap, panel chrome, aura VFX, avatar picker) stays deferred to
later passes. Standing ruling recorded on the way: **unlock/level-up popups
will use the existing in-game announcement system** (AlertBanner lane), not a
new overlay mechanism, whenever that item is picked up.

## What changes and why

Players currently see only a skill's name and a level badge. What an ability
actually does — damage, radius, who it targets, cooldown, what the next point
buys — is invisible in-game; the only source is the backend JSON. Hover info
on the spellbook and loadout slots is the highest-playability UI gap.

The blocker is data, not UI: the client's only skill metadata is
`frontend/src/client-data/Skills.ts` — three hand-maintained parallel maps
(name / maxLevel / category), a flagged tech debt that has already caused a
real bug (Haste mis-categorized, skill-vocab chunk 6). Descriptions and
numbers exist **only** in `api/skills/*.json`.

This chunk builds the data pipeline once and consumes it for tooltips:

1. **Skill-catalog HTTP endpoint** — `aurad` serves its *loaded* skill
   registry as JSON. Single source of truth = what the server actually runs
   (embedded or `-content ../api`), matching the "milestone table into api/"
   direction. No wire/.fbs change — this is an HTTP sidecar, not a game
   message.
2. **Ability hover tooltips** — stats-only condensed info, auto-generated
   from the catalog so it stays correct through every balance retune
   (everything is TUNING-OPEN): values at the player's current skill level,
   next-level preview, target rules, cooldown/cast time.
3. **`Skills.ts` retirement** — the three hand-sync maps are deleted; name,
   maxLevel, and category come from the catalog. Closes the roadmap item-8
   checklist debt entry. A new skill is then configured in ONE place.

## Decisions (PO 2026-07-21, via choice prompts)

1. **Data source: server HTTP endpoint** (over build-time JSON import or
   extending Skills.ts by hand) — truth follows the running server,
   `-content` iteration included.
2. **Stats-only tooltips first** — no flavor `description` field yet; the
   ~47-line authoring pass (drafted for PO review) is a later follow-up.
3. **Display names: derived + override** — CamelCase→spaces automatically
   (`SummonTotem` → "Summon Totem"); an optional `displayName` JSON field
   overrides the odd cases (`LongRangeStrike` → "Long-Range Strike",
   `CallForAid` → "Call for Aid", `DamageBurst` → "Damage-Burst" — audit the
   current `SkillNames` map for the full override set before deleting it).
4. **Current + next level values** — while below max level, lines show the
   next-level value too ("Damage: 14.7 → 16.8"), answering the spend
   decision directly.

## Chunk 1 — skill-catalog endpoint + hover tooltips

### Backend

- New handler (e.g. `GET /skills`) registered on the existing muxes in
  `cmd/aurad/aurad.go` (`bootServer`/`bootTlsServer` — both, like `/game`).
- Serves the **parsed** registry (`skills.SkillDefinition` + `EffectDef`)
  re-marshaled to JSON — NOT the raw files: parsing applies defaults (e.g.
  absent `damageTags` → `[physical]`) and naturally drops `_comment` design
  notes. Marshal once at boot; the registry is immutable at runtime.
  Execution detail: `EffectDef` needs JSON tags or a thin catalog DTO —
  prefer tags on the real struct so new fields can't silently miss the
  catalog (drift is the whole disease being cured here).
- Include everything (mob-only + `legacy` skills are harmless; the client
  only renders tooltips for spellbook-known ids). Ship `id`,
  `displayName` (derived+override, computed server-side so the client never
  re-implements the rule), `category`, `maxLevel`, `cooldownTicks(+PerLevel)`,
  `castTicks(+PerLevel)`, `castInterruptedByDamage`, `effects[]`.
- CORS: dev runs the client on :2001 against aurad on :2000 —
  `Access-Control-Allow-Origin: *` on this read-only public-content handler.

### Frontend

- **Catalog module** (replaces `client-data/Skills.ts`): fetch once at
  startup from the wsUrl-derived HTTP origin (`ws://host:2000/game` →
  `http://host:2000/skills`); expose `skillDisplayName` / `skillMaxLevel` /
  `skillCategory` with the same signatures so `HUD.ts` call sites barely
  change. Fallback to `Skill #<id>` / `'aura'` until loaded or on fetch
  failure (tooltips degrade, game never blocks on the catalog).
- **Formatter**: effect-type → condensed lines table over the ~20 effect
  types (most share fields; one table, same spirit as the `AuraCategory`
  exhaustive table). Lines: effect verb + amount at current level (+ next),
  radius, target rule (enemies/allies/self, selector, maxTargets), dot
  ticks×interval, cooldown/cast in seconds (tick = 33 ms). Unknown effect
  type → generic line + console warn (server data can't be
  compile-exhausted; the warn is the tripwire).
- **Hover UI**: one shared DOM tooltip element; `pointerenter`/`pointerleave`
  (delegated) on spellbook `li`s, aura/passive/cooldown loadout slots. The
  `MouseManager` pointerdown gotcha does not affect hover. Touch has no
  hover — out of scope for this pass.

### Tests / verification

- TDD Go: handler test — catalog serves the loaded registry (a known skill's
  id/category/maxLevel/effect fields present, defaults applied, CORS header
  set).
- Frontend: `tsc` clean + prod build; formatter unit-testable as a pure
  function if cheap, else covered by the smoke.
- Headless Playwright smoke (verify skill): hover a spellbook entry → tooltip
  visible with expected value lines; hover a loadout slot; catalog-fetch-
  failure path still renders names as fallback.
- Boot `-content ../api` log clean; PO in-game pass: hover reads correctly on
  an aura, a passive, and a cooldown at different levels.

## Deferred (the rest of the roadmap item-8 checklist — later passes)

Skill icons (game-icons.net sourcing) · unlock/level-up popups (**ruling: via
the in-game announcement system**) · ability-bar styling (hotkey labels,
cooldown sweep, active highlight) · resource/XP bar styling · minimap
restyle · panel chrome · aura-VFX/tick-indicator polish pass · avatar picker
+ icon-unlock track (`plan-avatar-system.md`; naturally follows the accounts
half) · flavor-description authoring pass (~47 one-liners, drafted for PO
review).

### Tooltip maintenance debt (found 2026-07-29, shipping the faction-scope line)

Chunk 1's thesis is that tooltips are *"auto-generated from the skill catalog so
they stay correct through every balance retune"*. That holds for **numbers**. It
does not hold for **words**, and the gap has three shapes, worst first:

1. **⚑ The per-effect-type cases restate DESIGN RULINGS in client English, with
   no link back to the ruling.** `'Any damage breaks it — including your own
   aura'` is `plan-faction-flips.md` §5.4 retold; `'It keeps its own level, and
   turns on you when the charm ends'` is D2 plus D11/L-F retold. Also taunt,
   detaunt, recall and light. **If a ruling changes, the tooltip lies and nothing
   catches it** — no test can, because the string *is* the assertion. A retune
   cannot break these; a re-design silently does.
2. **Content-keyed label tables degrade silently.** `GATED_TAG_LINES` knows
   `smash` and `harvest`; a new gated tag falls back to *"Only affects targets
   vulnerable to: X"* — the exact phrasing playtest feedback B#5 complained
   about. `STAT_LABELS` holds one entry per `validStat`, so the resource-cost
   pass's cost-reduction passive (the sixth) would render unlabelled.
   `SELECTOR_LABELS` prints the raw enum name for an unmapped selector.
3. **24 `case` clauses against 24 authored effect types.** A new effect *type*
   needs a case or the `default:` emits a console warning and a literal
   `(charm)`. That tripwire works — it is how chunk 3 knew to add its case — but
   it fires in a browser at runtime, not at build.

⭐ **The counter-example, shipped 2026-07-29 (`2fffe9ee`):** the faction-scope
line renders from `def.targetFactions` in the **skill-level** section, never as a
case in the per-effect switch, so a new faction-scoped skill needs no frontend
change at all — pinned by a vitest case using an invented skill scoped to an
invented faction. That is the shape the three items above should move toward:
**data the server already resolved, rendered generically.** Item 1 is the one
that cannot fully get there — a design ruling has to be authored as words
somewhere — but authoring it as skill **content** (a `description` on the skill
JSON) would at least put the words next to the ruling instead of in a switch.

Related: `backlog.md` §35 tier 5 (the enum mirrors in the same file).
