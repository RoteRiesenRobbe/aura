# Plan: UI Polish Pass — Rough First Pass (step 8, item-8 slice)

**Status:** PLANNED 2026-07-21 (this doc) — chunk 1 not started.

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
