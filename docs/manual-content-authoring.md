# Content Authoring Manual

How to add or replace content by hand: **new mobs**, **new abilities**
(auras / passives / cooldowns), **ability VFX**, **mob / player icons**, and
**scripted encounters / boss fights**.

This is a how-to reference (`manual-` prefix). Current as of 2026-07-19
(post-C7 content pass). File paths and array orderings drift — if a step
doesn't match, trust the code. This manual is the **definition/art half**;
placing things in the world (props, spawns, campfires, dark areas, NPCs,
anchors — all via the in-game editor) is `docs/manual-zone-editor.md`.

## Conventions & build basics

- **Content lives in `api/`** (`api/mobs/`, `api/skills/`, `api/recipes/`,
  `api/props/`, `api/zones/`) as JSON; the FlatBuffers schemas live in
  `api/schema/`.
- **Two ways to load content:**
  - `make -C backend build` runs `cp-defs` (copies `api/*` into
    `backend/pkg/api/` for `go:embed`) then builds the binary. Required for any
    Go or `.fbs` change, and for anything embedded (see `milestone-unlocks.json`).
  - `./aurad -dev -content ../api` reads the repo `api/` directly —
    JSON-only edits skip **both** `cp-defs` and the rebuild. A **restart still
    applies them**. The boot log prints the content source.
- **Numbers are placeholders.** Every stat/radius/chance is `[PLACEHOLDER]` until
  a balance pass. Level scaling is always `base + (level−1) × perLevel`.
- **Sync gotcha:** always check the boot log counts after a restart
  (`Loaded skill definitions count=…`). A stale `aurad` process silently
  masks new content — `pkill aurad`, rebuild, re-check.

---

## 1. New mob

A mob's JSON `name` is resolved **directly against the `EntityType` enum**
(`backend/pkg/aura/model/mob/mob.go`, `types[d.Name]` — `log.Fatal` if the
name has no matching enum entry). So a **genuinely new mob type requires a new
`EntityType`** — the same "5-file path" the props work used.

**Variant mobs reusing existing art need NO wire/frontend work (chunk 9):**
give the def its own `name` plus an **`entityType`** key naming the sprite's
enum entry (e.g. `"name": "ProvingBoss", "entityType": "AngryMammoth"`). The
override is validated against the enum at load time; absent = the name
resolves, as before. This is how encounter/boss variants get their own stats,
faction and skills without a schema append (see §5 and
`api/mobs/proving-boss.json`).

### Backend / data

1. **`api/mobs/newmob.json`** — copy `api/mobs/dodo.json`:
   - `id`, `name` (must equal the enum name added in step 2), `type: "MOB"`
   - optional `faction`: a faction name from `api/factions/` (see
     "Factions" below; absent = the built-in `hostile` default — attacks
     players, ignores all mobs)
   - **`tier` + `curveLevel` + `factors.baseMaxHealth` — the C0
     tier+baseline rule (REQUIRED for content):** `tier` is a pure
     classification label (`normal`/`elite`/`boss` — eliteness lives in the
     baseline numbers, the tier multiplies nothing); `curveLevel` is the
     mob's position on the shared `f(L)` curve (zone number = curve
     position). The loader derives `maxHealth = baseMaxHealth ×
     f(curveLevel)` and applies the same `f(curveLevel)` to the mob's skill
     HP values at cast time — so **author the mob's skills (damage/heal HP)
     as curve-position-1 baselines too**, and a growth change re-derives
     everything with one conf knob. Raw `factors.maxHealth` **hard-fails at
     load**; raw absolute numbers sized to a zone are a review reject.
     (Absent `tier`/`curveLevel` default to `normal`/1 — for synthetic/test
     defs only, content always authors them explicitly.)
   - `factors`: `baseMaxHealth`, `maxHealthVariance`, `experience`, `speed`,
     `deltaPhi`, `turnRate`, optional `resistances` / `damageTags`
   - **Chore/gate tags are opt-in (C1):** gate-style damage (Harvest)
     carries `"gatedDamageTags": true` on its effect, which flips the resist
     default — the hit only damages mobs whose `resistances` **explicitly
     name** one of its tags (the `"*"` wildcard does not opt in). Combat
     mobs therefore need NO harvest entry; things the gate aura should
     affect opt in, like the turnip (`{ "*": 0, "harvest": 1 }`, see
     `api/mobs/turnip.json`), the C2 bramble walls and the C3 rockfall
     (`{ "*": 0, "smash": 1 }` — each gate obstacle picks its own tag +
     opener skill).
   - `body`: `radius`, `aggroRadius`
   - **Solid-obstacle mobs (brazier/bramble pattern):** optional
     `body.collisionLayer` / `collisionMask` override the defaults (layer
     34 = Viewport|Action, mask 80 = MobStatic|Border). Brazier `32/16` =
     unhittable, non-blocking scenery hazard; Bramble `99/16` (PlayerStatic
     1 + Action 2 + Viewport 32 + MobStatic 64) = blocks players AND mobs
     while staying aura-hittable, and mask 16 (Border only) means nothing
     pushes it. Pair with `speed: 0`, XP 0 and opt-in `resistances` for a
     destructible aura-gated wall (`api/mobs/bramble.json`,
     `api/mobs/rockfall.json`); the brazier form reskins as any always-on
     hazard (`api/mobs/poison-pool.json`).
   - `skills[]`: the mob's aura(s) by `skillName` (must exist in `api/skills/`)
   - optional `unlocks[]`: `{skillName, chance}` kill-drop payloads
2. **`api/schema/server.fbs`** — add the mob's name to the `EntityType` enum.
   **Append at the end** to keep the wire compatible.
3. **Regenerate bindings:** `cd api/schema && ./make.sh` (writes **both** Go and
   TS FlatBuffers).
4. If the mob uses a **new** aura, author that skill first (see §2).
5. **Make it spawn:** mobs only spawn from `zone.spawns`. Add a spawn referencing
   the mob's name via the in-game zone editor (`docs/manual-zone-editor.md`) or
   by hand-editing the zone file (`api/zones/world.json` for the live world;
   `api/zones/proving-grounds.json` for the debug map).
6. **Build:** `make -C backend build`, or run `-content ../api` + restart.

### Frontend / art

7. **Art:** `frontend/src/features/game-objects/assets/mobs/newmob.svg`.
8. **`frontend/src/client-data/Graphics.ts`** — new entry in the `mobs:` block:
   `file: require('.../mobs/newmob.svg')`, `minSize`/`maxSize`, `anchor`.
   (The aura ring needs NO entry since mob-depth chunk 3c: it is wire-driven
   via `Mob.aura_radius` — 0 while the aura is gated — and sized
   automatically.)
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

### Factions (mob-vs-mob hostility, chunk 6.6)

Mob allegiances live in **`api/factions/*.json`**, one file per faction:

```json
{ "name": "predator", "hostileTo": ["aligned", "prey", "tusker"] }
```

- `hostileTo` is **required**: who this faction attacks on sight AND may
  damage. Use `[]` for a passive faction (retaliates and flees per its own
  rules when hit, like any mob). Asymmetry is legal: the wolf hunts the
  rabbit, the rabbit lists nobody.
- Two **built-in, undeclarable** names exist and may be referenced:
  `aligned` (players + summons) and `hostile` (the default of every mob
  without a `faction` key: attacks players, ignores all mobs). Declaring a
  faction never changes mobs that don't opt in.
- **Mob-cast harm is two-layered:** a mob's damaging effects only hit
  factions in its `hostileTo` set (static) or entities on its threat table
  (dynamic — whoever hurt it is fair game, so retaliation always works).
  Neutral factions never splash each other into fights, and hazards never
  burn mobs that couldn't hurt them back. Same faction = never harmed.
  Player-sourced damage (including your summons) stays "different faction
  = may harm".
- Validation is boot-time hard-fail: unknown/self `hostileTo` references,
  duplicate/reserved names, a mob `faction` that matches no file, or
  `faction: "aligned"` (summon-only, set at spawn).
- Kill rewards: players recorded as damage participants get full XP/drops
  no matter who lands the killing blow; a pure mob-vs-mob kill grants
  nothing.

---

## 1b. New prop (circle or rectangle)

Props are static world objects from the authored zone (no HP, no gameplay
behavior — movement blockers + visuals). One JSON per type in `api/props/`:

```json
{ "name": "Rock",  "entityType": "Stone", "body": { "radius": 0.5 } }
{ "name": "House", "entityType": "House", "body": { "width": 4, "height": 3 } }
```

- **Body is exactly one form** (validated at boot): a circle (`radius`) or an
  axis-aligned rectangle (`width` + `height`, C1 rect-prop lift —
  `phy.SolidAABB` pushes players AND mobs out, and mob steering paths around
  it). **Rect bodies never rotate** — a zone prop's `rotation` is ignored for
  them (it isn't applied server-side for circles either, yet).
- `entityType` picks the sprite. Reusing an existing enum entry (the scaffold
  Tree/Rock way) needs no wire work; a **new** sprite is the same 5-file path
  as a new mob: enum append in `server.fbs` → `./make.sh` → SVG → a render
  class (`Resources.ts` — mirror `House`, which scales the sprite non-square
  from the prop def's aspect) → `gameObjectClasses` slot.
- The wire carries a single size scalar (max half-extent for rects); the
  `House` render class reads `api/props/house.json` directly for the aspect,
  so body edits keep the sprite in sync without a schema change.
- Placement: `zone.props` entries (`type`, `x`, `y`, `blocksMovement`) via the
  zone editor — rect props draw and hit-test as rectangles there.

## 1c. NPC sprite & size (zone-JSON `entityType`, C2)

This is the **definition/art half** of authoring an NPC. The placement half —
position, sensor radius, `tooLowLine`, lore lines, ordered teachings, all
editor-authorable — is the end-to-end walkthrough in
`docs/manual-zone-editor.md` §5c.

- **Sprite binding — JSON-only, deliberately.** Zone-JSON NPCs (`zone.npcs`)
  render as the Flower placeholder unless the entry names a sprite:
  `"entityType": "Signpost"` (validated against the `EntityType` enum at zone
  load; must be a **Resource-backed** entry — NPCs ride the Resource wire
  path, a Mob sprite class would expect health/aura fields). The zone editor
  round-trips the field (no panel control — hand-authored in the JSON). First
  user: the C2 forest signpost.
- **Visual size.** Not in zone data: the authored NPC radius is the *sensor*
  circle, and the wire sprite radius is a fixed placeholder
  (`model/npc/npc.go`). The drawn size comes from the matching entry in
  `frontend/src/client-data/Graphics.ts` `npcs:` (`maxSize`, sized like
  props) — edit that entry to resize an NPC on screen.
- **New art.** A **new** NPC sprite is the usual 5-file path: enum append →
  regen → SVG → a Resource render class (`Resources.ts`, mirror `Signpost`)
  → `gameObjectClasses` slot — plus its `Graphics.ts` `npcs:` entry. Follow
  the portrait style checklist in §4.

## 2. New ability (aura / passive / cooldown)

If it composes an **already-supported effect type**, this is mostly JSON with no
wire changes — skills ride the existing spellbook stream. A **brand-new effect
type** is Go work (payload struct + `effectKeys` allowlist + validator in
`backend/pkg/aura/skills/definition.go`, plus a dispatch case in
`backend/pkg/aura/sys/skills.go`).

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
     `backend/pkg/aura/skills/milestone-unlocks.json`.
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

### Portrait style checklist (applies to every creature/humanoid icon)

The world is top-down, but creatures and humanoids are **portrait icons**, not
top-down models (GDD §10). Every new or replacement mob/NPC/player SVG must
tick all of these:

- **Circle silhouette** — the art reads as a round icon (face-in-circle or a
  bust that fills a circular footprint).
- **Front-facing portrait/bust** — the creature looks *at* the viewer, not
  down from above.
- **No directionality baked in** — nothing in the art implies a heading
  (no "pointing" pose, no top-down body axis); the sprite must read correctly
  at any movement direction.
- **Sprites are NEVER rotated at runtime** — portraits stay upright
  regardless of the entity's wire heading. Don't design art that relies on
  rotation.
- **Reference files:** `frontend/src/features/game-objects/assets/mobs/`
  `saberToothCat.svg`, `dodo.svg`, `mammoth.svg`.

Inanimate props/hazards (pools, braziers, barricades) are exempt — no
portrait applies there.

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

## 5. Scripted encounter / boss fight (encounter controller)

An encounter is **one Go struct behind the `Encounter` interface**
(`backend/pkg/aura/encounter/`) — deliberately code-defined, not a
data/DSL format (roadmap decision F3; revisit only with many encounters + a
non-engineer author). The `encounter.System` runs every registered encounter's
lifecycle hooks each tick; everything the script *does* goes through exported
seams. **Reference implementation: `encounter/smoke.go`** (the proving-grounds
arena) — copy it, don't start blank. Zero wire changes are needed unless your
encounter wants client-visible world state (bridges opening etc. — that wire
work is deliberately deferred to the first real boss).

### The moving parts

| Piece | Where | What it gives you |
|---|---|---|
| `Encounter` interface | `encounter/system.go` | `Name()`, `OnTick(s *System)`, `OnMobDeath(s *System, mobID uint64)` — the only hooks in v1; proximity/phase triggers are conditions you check inside `OnTick` |
| `System.SpawnMob(defName, pos)` | `encounter/system.go` | Scripted spawn; returns the concrete `*mob.Mob` handle; **no spawn point ⇒ never respawns** — the encounter owns any respawn via its own timers |
| `System.Ticks()` | `encounter/system.go` | The game clock, for encounter-owned timers (`respawnAt = s.Ticks() + delay`) |
| `Mob.SetInvulnerable(on)` | `model/mob/mob.go` | Conditional immunity: an immune hit is a **non-event** (no damage, no number, no threat). Hit VFX still stamps — that ring-without-numbers IS the "immune" feedback |
| `Mob.SetFleeOverride(on)` | `model/mob/mob.go` | Scripted flee at any HP. Also counts as in-combat for the leash, so the **threat table survives the whole phase**; drop the override and retention re-targets the top threat automatically — no re-engage code |
| Threat seams | `model/mob/mob.go` | `NoteThreat`, `ForceThreatToTop`, `DropThreat`, `TargetsEntity`, `ThreatSnapshot` — script-side threat manipulation (same seams Taunt/Fade use) |
| Summon-era seams | `model/mob/mob.go` | `SetFaction`, `SetTTLTicks`, `RaiseMaxHealth`, `SetSummonPower` — usable on encounter spawns too if a phase wants them |
| `game.RegisterEncounter(e)` | `core/game.go` | Registration, called from `aurad.go` post-construction |

### Step by step

1. **Author the mobs** (`api/mobs/*.json`) as variant defs with the
   `entityType` override (§1) — own `id` (keep ids unique by hand, the
   registry silently overwrites duplicates), own stats/skills/faction. Two
   deliberate choices in the smoke content worth copying:
   - **No `faction` key** = built-in hostile default → the roaming faction
     ecosystem (predators, tuskers) ignores your arena and your arena mobs
     never fight each other.
   - **No `fleeBelowHealthRatio`** on the boss — flee should be *scripted*
     (the override), not autonomous, or the two will fight.
2. **Write the encounter struct** in `backend/pkg/aura/encounter/`
   (or a subpackage later, when there are many). Patterns from `smoke.go`:
   - **State is plain fields**: mob handles (`*mob.Mob`, nil = dead), per-slot
     respawn ticks, one-shot phase latches (`fled bool`), a reset tick.
     There is no timer/objective framework — deliberately (YAGNI; extract
     helpers when the second real boss repeats a pattern).
   - **First-tick spawn**: guard with a `spawned bool` in `OnTick`. The
     system runs after the MobSystem, so zone mobs already exist on tick 1.
   - **Re-derive conditions every tick, idempotently**:
     `boss.SetInvulnerable(anyGuardAlive())` needs no transition tracking —
     it's a flag write. Prefer this over "on guard death, check if last".
   - **Track deaths by ID** in `OnMobDeath`: compare against your stored
     handles' `Basic().ID()`; the hook fires for EVERY mob death in the
     world, filter for yours. Deaths are dispatched before the same tick's
     `OnTick`, so `OnTick` always sees post-death state.
   - **Windows emerge from respawn timers**: "kill all 3 within 60 s" is
     just per-slot `respawnAt` timestamps — no window bookkeeping.
   - **Own your resets**: since encounter spawns never respawn themselves,
     schedule an arena reset (`resetAt`) on boss death and clear pending
     per-slot timers when you respawn a slot, or a stale timer double-spawns.
3. **Register it** in `cmd/aurad/aurad.go` after prop
   placement, gated on the zone:
   ```go
   if zone.ID == "my-zone" {
       g.(encounter.Registrar).RegisterEncounter(encounter.NewMyBoss())
   }
   ```
   (Registration is Go-side by decision — no zone-JSON field yet.)
4. **Test it** with the `encounter/smoke_test.go` pattern: the package
   `fakeGame` + a `step` helper that replicates the MobSystem death loop
   (`m.Update(0)` false → `g.RemoveEntity` → `System.Update(0)` → `tick++`),
   hand-built `mobs.MobDefinition`s in the `fakeRegistry` (tests never
   depend on the JSON), damage via `PlayerTouches`/`MobTouches`. Same-package
   tests may read your encounter struct's fields directly.
5. **Verify in-game**: `make -C backend build`, restart, check the boot log
   (`Loaded mob definitions count=…`, your registration line), warp over
   (`WARP <x·120> <y·120>` — the cheat takes px; `SPEED [factor|off]`
   multiplies your movement for long traversals), and use the **`THREAT`
   cheat** (nearby mobs' threat tables, or `THREAT <entityID>`) to watch
   targeting/immunity through the phases in the server log.

### Gotchas

- **`SpawnMob` positions once** — `SetPosition` latches the spawn anchor +
  aggro sensor on the first call; never "correct" a position afterwards.
- **Immunity leaks, accepted v1**: attackers of an immune boss still become
  XP participants, and no threat accrues while immune (post-lift targeting
  starts from sensor acquisition). Fine for now; revisit at the real boss.
- **Clearance-check your arena** against props/spawn traffic (zone editor
  markers): the smoke arena deliberately sits in a low-traffic pocket so
  wandering factions don't wander in.
- **9f is not built**: timed world-state (a bridge open for 20 min) and
  dwell-capture triggers have no machinery yet — they land with the first
  real boss (content pass), because both need wire fields.

---

### Anchors: zone-owned positions (content pass C6)

Since C6, encounter positions come from the zone's `anchors` section
(`{"name", "x", "y"}`, editor-movable — manual-zone-editor.md §5b) instead
of Go constants: resolve them at the registration site in `aurad.go`
and **panic on a missing anchor** (content bug = loud boot failure). The
`OrcWarlordEncounter` is the reference: 4 anchors in, structure tunables as
named constants at the top of `encounter/warlord.go`, all WHAT-happens logic
in Go. `System.Despawn` removes a live encounter mob (empty-arena beats);
`Mob.KillCreditNames` feeds the server-wide kill broadcast
(`System.Announce`).

## Known hand-sync points

These duplicate a single source of truth and must be updated together — easy to
forget:

- **`EntityType` enum ↔ `gameObjectClasses` array** (positional index) ↔ mob JSON
  `name`.
- **`Skills.ts`** `SkillNames` / `SkillMaxLevels` / `SkillCategories` duplicate the
  backend skill registry.
- ~~`Graphics.ts` `damageAuraRadiusMeters`~~ **retired 2026-07-10 (mob-depth
  chunk 3c):** mob ring size is wire-driven (`Mob.aura_radius`, 0 = aura
  gated/off) — no hand-sync remains.

## Quick reference: what touches the wire?

| Task | JSON | Go | `.fbs` + regen | Frontend |
|------|------|-----|----------------|----------|
| New mob (new art) | ✅ | — | ✅ | ✅ |
| Mob variant (reused art via `entityType`) | ✅ | — | — | — |
| New skill (existing effect types) | ✅ | — | — | ✅ (`Skills.ts`) |
| New effect *type* | ✅ | ✅ | — | ✅ |
| Scripted encounter (existing seams) | ✅ (mob defs) | ✅ (one struct + registration) | — | — |
| Replace ability VFX | — | — | — | ✅ |
| Replace mob / player icon | — | — | — | ✅ |
