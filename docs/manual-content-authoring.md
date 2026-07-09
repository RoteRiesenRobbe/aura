# Content Authoring Manual

How to add or replace content by hand: **new mobs**, **new abilities**
(auras / passives / cooldowns), **ability VFX**, and **mob / player icons**.

This is a how-to reference (`manual-` prefix). It reflects the wiring as of the
world-foundation work (2026-07-08). File paths and array orderings drift — if a
step doesn't match, trust the code.

## Conventions & build basics

- **Content lives in `api/`** (`api/mobs/`, `api/skills/`, `api/recipes/`,
  `api/props/`, `api/zones/`) as JSON; the FlatBuffers schemas live in
  `api/schema/`.
- **Two ways to load content:**
  - `make -C backend build` runs `cp-defs` (copies `api/*` into
    `backend/pkg/api/` for `go:embed`) then builds the binary. Required for any
    Go or `.fbs` change, and for anything embedded (see `milestone-unlocks.json`).
  - `./berryhunterd -dev -content ../api` reads the repo `api/` directly —
    JSON-only edits skip **both** `cp-defs` and the rebuild. A **restart still
    applies them**. The boot log prints the content source.
- **Numbers are placeholders.** Every stat/radius/chance is `[PLACEHOLDER]` until
  a balance pass. Level scaling is always `base + (level−1) × perLevel`.
- **Sync gotcha:** always check the boot log counts after a restart
  (`Loaded skill definitions count=…`). A stale `berryhunterd` process silently
  masks new content — `pkill berryhunterd`, rebuild, re-check.

---

## 1. New mob

A mob's JSON `name` is resolved **directly against the `EntityType` enum**
(`backend/pkg/berryhunter/model/mob/mob.go`, `types[d.Name]` — `log.Fatal` if the
name has no matching enum entry). So a **genuinely new mob type requires a new
`EntityType`** — the same "5-file path" the props work used. Reusing an existing
mob's art means reusing its name/EntityType.

### Backend / data

1. **`api/mobs/newmob.json`** — copy `api/mobs/dodo.json`:
   - `id`, `name` (must equal the enum name added in step 2), `type: "MOB"`
   - `factors`: `maxHealth`, `maxHealthVariance`, `experience`, `speed`,
     `deltaPhi`, `turnRate`, optional `resistances` / `damageTags`
   - `body`: `radius`, `aggroRadius`
   - `skills[]`: the mob's aura(s) by `skillName` (must exist in `api/skills/`)
   - optional `unlocks[]`: `{skillName, chance}` kill-drop payloads
2. **`api/schema/server.fbs`** — add the mob's name to the `EntityType` enum.
   **Append at the end** to keep the wire compatible.
3. **Regenerate bindings:** `cd api/schema && ./make.sh` (writes **both** Go and
   TS FlatBuffers).
4. If the mob uses a **new** aura, author that skill first (see §2).
5. **Make it spawn:** mobs only spawn from `zone.spawns`. Add a spawn referencing
   the mob's name via the in-game zone editor (`docs/manual-zone-editor.md`) or
   by hand-editing `api/zones/zone.json`.
6. **Build:** `make -C backend build`, or run `-content ../api` + restart.

### Frontend / art

7. **Art:** `frontend/src/features/game-objects/assets/mobs/newmob.svg`.
8. **`frontend/src/client-data/Graphics.ts`** — new entry in the `mobs:` block:
   `file: require('.../mobs/newmob.svg')`, `minSize`/`maxSize`, `anchor`, and
   optional `damageAuraRadiusMeters` (**must match the mob aura's effective
   radius** — hand-synced; see Known sync points).
9. **`frontend/src/features/game-objects/logic/Mobs.ts`** — a new `Mob`
   subclass (constructor picks a `Game.layers.mobs.*` / `bossMobs` layer), plus a
   `Preloading.registerGameObjectSVG(...)` line. Mirror `Dodo`.
   **⚠ A new layer is a TWO-step edit in `core/logic/Game.ts`:** the
   `createNamedContainer(...)` entry in the `layers.mobs` block AND the
   matching `this.cameraGroup.addChild(...)` in the "// Mobs" block below it.
   Miss the second and the mob is fully functional but **invisible** — its
   sprite renders into a container that is never on stage (bit the Totem,
   2026-07-09). Reusing an existing layer needs neither.
10. **`frontend/src/features/backend/logic/messages/incoming/GameStateMessage.ts`**
    — insert the new class into the `gameObjectClasses` array **at the index
    matching its `EntityType` ordinal**. The array is positional and must stay in
    sync with the enum.

> A new mob type is the only one of these four workflows that touches the wire
> (`.fbs` + regen) and the positional `gameObjectClasses` array.

---

## 2. New ability (aura / passive / cooldown)

If it composes an **already-supported effect type**, this is mostly JSON with no
wire changes — skills ride the existing spellbook stream. A **brand-new effect
type** is Go work (payload struct + `effectKeys` allowlist + validator in
`backend/pkg/berryhunter/skills/definition.go`, plus a dispatch case in
`backend/pkg/berryhunter/sys/skills.go`).

Existing effect `type`s to compose: `damage_aura`, `instant_damage`, `heal_aura`,
`self_heal`, `slow_aura`, `resist_aura`, `resist_passive`, `stat_multiplier`,
`dot_aura`, `instant_dot`.

### Backend / data

1. **`api/skills/newskill.json`** — copy `api/skills/damage-aura.json`:
   - `id`, `name`, `category` (`active_aura` / `passive` / `cooldown`), `maxLevel`
   - `effects[]`: one payload per effect; params follow
     `base + (level−1) × perLevel` (e.g. `damageHP` + `damageHPPerLevel`)
   - targeting is faction-relative: `targetsEnemies` / `targetsAllies`
     (+ `selector`, `maxTargets`, `tickInterval`, optional `variance`,
     `damageTags`, `hitStyle`)
2. **Pick an unlock source:**
   - **Milestone** — add to
     `backend/pkg/berryhunter/skills/milestone-unlocks.json`.
     ⚠️ This file is **embedded/code-adjacent**, so it needs a **rebuild even with
     `-content`**.
   - **Kill drop** — add `{skillName, chance}` to a mob's `unlocks[]`.
   - **Combination** — add `api/recipes/newcombo.json`
     (`result` + `ingredients[]` by name+level; curated/secret/backend-only).
3. **Build:** `make -C backend build`, or `-content ../api` + restart.

### Frontend (without this, the skill shows as "Skill #id")

4. **`frontend/src/client-data/Skills.ts`** — add the id to the three parallel
   maps: `SkillNames`, `SkillMaxLevels`, `SkillCategories`. These are hand-synced
   with the backend registry.
5. **Optional ring style:** to show a specific active-aura ring, add an
   `*_SKILL_ID` constant in `Skills.ts` and handle it in
   `Character.setActiveSkill`.

> No `.fbs` / FlatBuffers regen is needed for new skills.

---

## 3. Replacing ability VFX

Three distinct VFX surfaces — **all pure frontend, no backend, no wire.**

- **Aura ring** (the visible circular field): SVG assets
  `frontend/src/features/game-objects/assets/effects/damageAura.svg` and
  `healAura.svg`, referenced in `Graphics.ts` as `character.damageAuraFile` /
  `healAuraFile`. Replace the SVG (keep the filename, or repoint the `require`).
- **Per-hit VFX** (slash streak / fire cluster on each aura tick): **not an
  asset** — drawn programmatically in
  `frontend/src/features/game-objects/logic/_GameObject.ts` →
  `buildAuraHitFx(style)` (see `showAuraHit` above it). Edit that method to change
  the look. *Which* style plays (1 = slash, 2 = fire) is chosen **server-side**
  from the effect's `hitStyle` override or its `tickInterval` cadence.
- **Cooldown burst** (gold ring on cooldown activation): also programmatic in
  `_GameObject.ts`.

---

## 4. Replacing mob / player icons

Simplest case — **drop-in file replacement, frontend only.**

- **A mob's art:** replace the SVG at the path in `Graphics.ts` `mobs.<mob>.file`
  (e.g. `assets/mobs/mammoth.svg`; the boss `angryMammoth` currently points at
  `demon.svg`). Keep the filename to change nothing else, or repoint the
  `require`. If proportions differ, adjust `minSize` / `maxSize` / `anchor` in the
  same entry.
- **The player avatar:** replace
  `frontend/src/features/game-objects/assets/characters/player.svg` (referenced by
  `Graphics.ts` `character.file`). There is exactly one avatar file today (the old
  variant system was removed) — a clean single point.

Webpack picks up SVG changes on rebuild / HMR.

---

## Known hand-sync points

These duplicate a single source of truth and must be updated together — easy to
forget:

- **`EntityType` enum ↔ `gameObjectClasses` array** (positional index) ↔ mob JSON
  `name`.
- **`Skills.ts`** `SkillNames` / `SkillMaxLevels` / `SkillCategories` duplicate the
  backend skill registry.
- **`Graphics.ts` `damageAuraRadiusMeters`** duplicates the mob aura's effective
  radius (frontend ring size is not wire-driven yet).

## Quick reference: what touches the wire?

| Task | JSON | Go | `.fbs` + regen | Frontend |
|------|------|-----|----------------|----------|
| New mob (new art) | ✅ | — | ✅ | ✅ |
| New skill (existing effect types) | ✅ | — | — | ✅ (`Skills.ts`) |
| New effect *type* | ✅ | ✅ | — | ✅ |
| Replace ability VFX | — | — | — | ✅ |
| Replace mob / player icon | — | — | — | ✅ |
