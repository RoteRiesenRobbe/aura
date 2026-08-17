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
enum entry (e.g. `"name": "ScriptedBoss", "entityType": "OrcWarlord"`). The
override is validated against the enum at load time; absent = the name
resolves, as before. This is how encounter/boss variants get their own stats,
faction and skills without a schema append (see §5).

### Backend / data

1. **`api/mobs/newmob.json`** — copy `api/mobs/wolf.json`:
   - `id`, `name` (must equal the enum name added in step 2), `type: "MOB"`
   - ⚑ **A mob's `name` IS its player-facing name.** Unlike skills (§2), mobs
     have **no `displayName` override**: `mobs.CatalogJSON` always derives the
     label with `skills.DeriveDisplayName` (CamelCase→spaces), and nameplates,
     quest objective prose and `GET /mobs` all read that derivation. So one
     string does three jobs — enum member, content join key (`api/zones/`
     spawns, quest targets, `spawn` effects) and the label on screen — and
     re-flavouring a species means moving all three together. Adding an
     override would be a small change mirroring the skill side; nothing has
     wanted one yet.
   - optional `faction`: a faction name from `api/factions/` (see
     "Factions" below; absent = the built-in `hostile` default — attacks
     players, ignores all mobs)
   - **`tier` + `curveLevel` + `factors.baseMaxHealth` — the C0
     tier+baseline rule (REQUIRED for content):** `tier` is a pure
     classification label (`normal`/`elite`/`boss` — eliteness lives in the
     baseline numbers, the tier multiplies nothing); `curveLevel` is the
     mob's position on the shared `f(L)` curve (zone number = curve
     position). The loader stores `baseMaxHealth` **verbatim** and
     `*Mob.MaxHealth()` derives the pool live as `baseMaxHealth × f(Level()) ×
     MaxHealthFactor()` (entity-model chunk 1b — for a **summon**, `Level()` is
     the *owner's* current level, so its pool tracks the owner as they ding).
     The same `f(Level())` applies to the mob's skill HP values at cast time —
     so **author the mob's skills (damage/heal HP) as curve-position-1
     baselines too**, and a growth change re-derives everything with one conf
     knob. Raw `factors.maxHealth` **hard-fails at
     load**; raw absolute numbers sized to a zone are a review reject.
     (Absent `tier`/`curveLevel` default to `normal`/1 — for synthetic/test
     defs only, content always authors them explicitly.)
   - **`role` — what the actor IS** (`creature` / `structure` / `follower`;
     absent = `creature`). `creature` chases what it aggros and its aura runs
     only while it has a target; `structure` does not chase and its aura is
     **always on** (totems, campfires, gate obstacles); `follower`
     acquires from its owner's combat signals and trails the owner (the
     companion summons). ⚑ **Role is not a speed.** A stationary creature (a
     hazard that gates its aura on aggro) and a moving structure are both
     legal and neither is warned about — author the role you mean. Before
     chunk 2 this was inferred (`speed: 0` = structure, owner + moving =
     follower), which is why old defs carried a dummy `aggroRadius`.
   - ⭐ **THE ARCHETYPE RULE — the Wolf is the unit, and strength must be paid
     for** (D6, `plan-world-replacement.md` §3.8, PO 2026-08-06). Read every
     species' numbers as **ratios to one reference mob**:

     | axis | the unit (Wolf) | where it lives |
     | --- | --- | --- |
     | HP | **55** | `factors.baseMaxHealth` |
     | damage | **7.5 dps** | its skill: 6 `damageHP` / 24 `tickInterval` |
     | speed | **0.7** | `factors.speed` |
     | aggro | **3.0** | `body.aggroRadius` |

     > **A species above 1.5 × the unit's HP must pay with `speed` ≤ 0.8 × or
     > damage ≤ 0.8 ×.**

     A species may be *differently shaped*, never simply **bigger**. The Bear is
     the worked example: 3.49 × HP, 1.07 × damage, **0.57 × speed** — tankier
     than a wolf, hits about as hard, and slower. Enforced by
     `TestGuardrails_ArchetypeTrade` (`cmd/simharness/guardrail_test.go`), which
     asserts the **whole catalog** — a new mob is checked by default and
     exempting one means writing the reason into `archetypeExempt` beside the
     single entry already there.
     ⚑ **The ratios are level-independent, which is why this is not a
     `curveLevel` question.** `MaxHealth = baseMaxHealth × f(L)` and skill
     damage = `damageHP × f(L)` — the same `f` on both sides, so it cancels and
     `base / 55` is the shape at *every* level. `curveLevel` says only **where
     the fight belongs**; these ratios say **what shape it is**. Keeping the two
     apart is the whole point (it is landmine L1 in that plan).
   - `factors`: `baseMaxHealth`, `maxHealthVariance`, `xpFactor`, `speed`,
     `deltaPhi`, `turnRate`, `ccImmune`, optional `resistances` / `damageTags`
   - ⚑ **`xpFactor` is RELATIVE, and absolute `experience` hard-fails**
     (`plan-xp-formula.md` C1, the `maxHealth` precedent): kill XP is computed
     from the *killer's* level, so a per-mob XP number is not a smaller balance
     input, it is a stale one. Absent → **1** = a full at-level kill for its
     tier; `0` = pays nothing (every NPC, structure, totem, summon, sign) and
     also takes it off the nameplate path; fractions for species whose fight is
     nothing like a normal one (the Turnip is 0.05, and the Session-⑥ kite rule
     now reads "kite mobs author `xpFactor` 0.5").
   - ⚑ **`ccImmune` is REQUIRED at tier ≥ elite** (`plan-cc-and-retaliation.md`
     C1, D1/A1): an elite or boss definition that omits the key does not boot.
     `true` refuses every crowd-control effect — slow, calm, charm — at the
     entity's own doors, so anything added to the CC family later inherits it.
     Absent → `false` (CC-able), which is what every normal-tier mob is unless
     it opts in; a deliberately CC-able elite authors `false` and boots fine —
     that escape hatch is the reason the flag is authored per mob instead of
     derived from `tier`, which stays a label that multiplies nothing.
     ⚑ Unrelated to a `resistances` entry of `0`: this stops *effects*, not
     damage. It is also invisible in-game — an immune mob simply shows no pip.
     The nine elite/boss definitions all author `true` today, and the census pin
     is `TestCCImmune_ContentCensus`.
   - **Chore/gate keys are opt-in (C1; the vocabulary split is D4):**
     gate-style damage (Harvest) carries `"gateKey": "harvest"` on its effect,
     and a mob opts in by listing that key in **`factors.gateKeys`**. Combat
     mobs therefore need no entry at all; things the gate aura should affect
     opt in, like the turnip (`"resistances": { "*": 0 }` +
     `"gateKeys": ["harvest"]`, see `api/mobs/turnip.json`), the C2 bramble
     walls and the C3 rockfall (`"gateKeys": ["smash"]`).
   - ⚑ **`resistances` and `gateKeys` are DIFFERENT QUESTIONS and must not be
     mixed.** `resistances` maps a **damage type** to an incoming multiplier
     (`0.5` half, `1.5` vulnerable, `0` immune, `"*"` the per-type fallback);
     `gateKeys` is a list of locks. Both vocabularies are closed and each
     rejects the other's words by name, because until D4 they shared one map —
     which meant "a turnip resists everything except harvest" and "a troll takes
     half damage from bleed" were written identically, and a mistyped key
     shipped as a skill that silently hit nothing.
   - ⚑ **A `"*"` wildcard covers damage types that do not exist yet.** A mob at
     `{"*": 0}` is automatically immune to any type added later — right for a
     turnip, wrong the first time someone uses the wildcard as shorthand for
     "tough".
   - ⚑ **Think twice before authoring a `physical` resistance.** The C8 tier
     guardrail drives its bot with authored `Damage` at L1, which is physical,
     so a physical entry anywhere re-calibrates the tier thresholds — a test
     (`TestNoCuratedResistanceTouchesPhysical`) makes that a deliberate act
     rather than a surprise.
   - `body`: `radius`, `aggroRadius` (required and `> 0` for `creature` and
     `follower`; **omit it on a `structure`** — a structure acquires nothing,
     and requiring one is what produced the old `0.1` dummies)
   - **Solid-obstacle mobs (campfire/bramble pattern):** optional
     `body.collisionLayer` / `collisionMask` override the defaults (layer
     34 = Viewport|Action, mask 80 = MobStatic|Border). Campfire `32/16` =
     unhittable, non-blocking scenery hazard; Bramble `99/16` (PlayerStatic
     1 + Action 2 + Viewport 32 + MobStatic 64) = blocks players AND mobs
     while staying aura-hittable, and mask 16 (Border only) means nothing
     pushes it. Pair with `role: "structure"` + `speed: 0`, XP 0 and opt-in
     `resistances` for a destructible aura-gated wall (`api/mobs/bramble.json`,
     `api/mobs/rockfall.json`); the campfire form reskins as any always-on
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
   by hand-editing the zone file (`api/zones/world.json`, the live world).
6. **Build:** `make -C backend build`, or run `-content ../api` + restart.

### Frontend / art

7. **Art:** `frontend/src/features/game-objects/assets/mobs/newmob.svg`.
8. **`frontend/src/client-data/Graphics.ts`** — new entry in the `mobs:` block:
   `file: require('.../mobs/newmob.svg')`, `minSize`/`maxSize`, `anchor`.
   (The aura ring needs NO entry since mob-depth chunk 3c: it is wire-driven
   via `Mob.aura_radius` — 0 while the aura is gated — and sized
   automatically.)
9. **`frontend/src/features/game-objects/logic/Mobs.ts`** — a new `Mob`
   subclass (constructor picks a `Game.layers.mobs.*` layer), plus a
   `Preloading.registerGameObjectSVG(...)` line. Mirror `Wolf`.
   **⚠ A new layer is a TWO-step edit in `core/logic/Game.ts`:** the
   `createNamedContainer(...)` entry in the `layers.mobs` block AND the
   matching `this.cameraGroup.addChild(...)` in the "// Mobs" block below it.
   Miss the second and the mob is fully functional but **invisible** — its
   sprite renders into a container that is never on stage (bit the Totem,
   2026-07-09). Reusing an existing layer needs neither.
10. **`frontend/src/features/backend/logic/messages/incoming/GameStateMessage.ts`**
    — add a `[AuraApi.EntityType.YourMob]: Mobs.YourMob` entry to the
    `gameObjectClasses` record. It is keyed by the generated enum, so a missing
    (or extra) entry is a compile error — `npm run typecheck` catches it.

> A new mob type is the only one of these four workflows that touches the wire
> (`.fbs` + regen) and the `gameObjectClasses` record.

---

### Factions (mob-vs-mob hostility, chunk 6.6)

Mob allegiances live in **`api/factions/*.json`**, one file per faction:

```json
{ "name": "wildlife_predator", "hostileTo": ["aligned", "wildlife_prey"] }
```

- `hostileTo` is **required**: who this faction attacks on sight AND may
  damage. Use `[]` for a passive faction (retaliates and flees per its own
  rules when hit, like any mob). Asymmetry is legal: the wolf hunts the
  boar, the boar lists nobody.
- ⚑ **Factions have a `displayName`, and its fallback rule differs from the
  skill one.** `name` is the key mobs and skills reference; `displayName` is
  what a tooltip prints. Absent, it falls back to `name` **verbatim** —
  *not* CamelCase→spaces like skills and mobs — because faction keys are
  snake_case (`wildlife_predator`), which that rule would not fix anyway.
  Every faction file authors one today, so the fallback is effectively
  untested by content; author it.
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
- ⚑ **`slow_aura` does not honour any of the above.** `applySlowAura`
  (`sys/skills.go:1544`) slows every entity in range that can be slowed, with
  no faction check and no hostility gate — the one aura path that skips both.
  Harmless today because no mob authors a slow aura and players cannot be
  slowed at all, and **nothing but a comment pins that**. If you are the first
  to give a mob a `slow_aura`, expect it to slow its own pack mates, and route
  the effect through `eligibleByTargetFlags[slowable]` first (backlog §25).

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

## 1c. NPC sprite & size

⚑ **Rewritten for the actor merge (entity-model chunk 3a).** There is no such
thing as an NPC type any more. **An NPC is an ordinary mob definition carrying
an `interaction` block**, placed as an ordinary `zone.spawns` entry. The
`model/npc` package, the `zone.npcs` array and the zone editor's NPC mode are
all **deleted** — if you find a doc telling you to author `zone.npcs`, it is
stale and the JSON will hard-fail at boot.

So authoring an NPC is §1a (a new mob) plus an `interaction` block. What is
specific to the talking half:

- **Sprite binding.** Same as any mob: `"entityType"` on the **mob**
  definition, validated against the `EntityType` enum at load. Since NPCs now
  ride the **Mob** wire path, the sprite class lives in `Mobs.ts`, not
  `Resources.ts`. Omit it and you get the name-based fallback; author
  `"entityType": "NpcPlaceholder"` for the deliberate missing-art marker.
- **Visual size.** NPCs are the one actor kind that sizes from the **wire**
  rather than from `GraphicsConfig` — `body.radius` is both the sensor and the
  drawn size. (`Mob.radius` had been in the schema unwritten since the project
  began; 3a's one-NPC pilot is what found it.)
- **Health bars.** NPCs get them, accepted deliberately (D3). Nameplates and
  tier frames are gated off for free.
- **Talk range.** `interaction.range` (all 14 currently author `2.0`
  **[PLACEHOLDER]**). The sensor is `max(body.aggroRadius, interaction.range)`;
  a conversant with neither hard-fails at boot. Range is enforced continuously —
  walking out of it **tears down** an open conversation.
- **The conversation itself** is a tree of `nodes`, each with `lines` and
  `options`; an option either `grants` something or navigates via `next`. See
  `api/mobs/emberkeeper.json` for the fullest authored example (a teaching list
  plus a directions branch) and `api/mobs/town-crier.json` for the only
  `ambient` lines in the game.
- **Unknown keys are rejected at boot** (as of the R1 hygiene pass) — a typo
  fails by name rather than silently dropping the line you wrote.
- **New art.** The usual 5-file path: enum append → regen → SVG → a **Mob**
  render class (`Mobs.ts`) → `gameObjectClasses` slot, plus its `Graphics.ts`
  `npcs:` entry. Follow the portrait style checklist in §4.

## 2. New ability (aura / passive / cooldown)

If it composes an **already-supported effect type**, this is mostly JSON with no
wire changes — skills ride the existing spellbook stream. A **brand-new effect
type** is Go work (payload struct + `effectKeys` allowlist + validator in
`backend/pkg/aura/skills/definition.go`, plus a dispatch case in
`backend/pkg/aura/sys/skills.go`) **and two hand-synced frontend edits** — the
params interface in `frontend/src/client-data/Skills.ts` and a case in
`SkillTooltip.ts`. Without them the skill works and its tooltip renders a bare
`(your_type)` with a console warning; the warning is the tripwire, not a build
error. If the type also puts a buff on an entity, it needs a pip decision in
`applied_effects.go` (compile-enforced) and a matching entry in `EffectPips.ts`.

Existing effect `type`s to compose (the authoritative list is `effectTypeMap` in
`backend/pkg/aura/skills/definition.go` — 26 as of 2026-08-01):
`damage_aura`, `instant_damage`, `heal_aura`, `self_heal`, `hot_aura`,
`instant_hot`, `dot_aura`, `instant_dot`, `shield_aura`, `instant_shield`,
`slow_aura`, `resist_aura`, `resist_passive`, `stat_multiplier`, `light_aura`,
`taunt`, `detaunt`, `spawn`, `recall`, `revive`, `dash`, `tick_rate`, `calm`,
`charm`, `speed_burst`, `lifesteal_burst`.

Each type has its **own allowlist of legal fields** (`effectKeys`), enforced at
load: an unknown or renamed key hard-fails the boot naming the field and its
replacement, rather than silently reading as zero. Authoring against the wrong
type is therefore a boot error, not a mystery in play.

⚑ **The two healing types do NOT target alike, and it is not authorable.**
`heal_aura` only ever affects a **wounded** ally (`HealthRatio() < 1`, hardcoded
in `applyHealAura`); `hot_aura`, `instant_hot` and every other type affect
eligible targets regardless of health. The asymmetry is deliberate (backlog §33,
PO 2026-07-31): the gate exists because a heal aura authors a `costFractionOfMax`
per healing tick and typically `maxTargets: 1`, so a tick spent on a full-HP
target bills the caster real HP and burns its only slot. A heal-over-time
typically authors neither, so it is free to **pre-hot** — placing the buff
before the damage arrives, which is legitimate support play. (The cost used to
be a heal-only `selfDamageHP`; the numbers rewrite moved it onto the effect so
any effect type can be priced, but the reasoning is unchanged.)

Two consequences when authoring:

- **A `heal_aura` with `maxTargets: 0` still cannot top anybody off.** If you
  want "keeps the party topped up", that is a `hot_aura`.
- **A HoT on a full-health target is inert, not wasted.** `tickHotEvents` drops
  any tick healing ≤ 0 *before* participation XP, healer threat and combat
  entry, so a pre-hot generates no credit and pulls nothing until real damage
  lands.

⚑ **The ORDER of a multi-effect skill's `effects[]` array carries meaning near
the resource floor** (plan-resource-costs-feedback §3.7 — documented rather than
engineered away, PO 2026-08-01). Effects charge **sequentially within one tick**,
each pricing against the health the previous one left, and `auraEffectCost`
skips an effect the caster cannot afford (L4 — a cost may never kill its caster).
So on a nearly-dead caster **the effect authored first is the one that still
fires**, and the one authored last is the one that gets skipped. Nothing
validates or surfaces this: reordering the array is a silent balance change.

Two things keep the surface small, and neither removes it:

- **One shared beat.** Since R3/F5 every multi-effect aura authors the same
  `tickInterval` on all its effects, so they price against the same health in
  the same tick rather than drifting in and out of each other. Ordering now
  decides only *which* effect wins the last affordable charge, not which of them
  sees a stale pool.
- **The free floor.** The base damage aura is permanently free (D6) and is never
  the effect being skipped.

⇒ When authoring a multi-effect skill, put the effect the skill is *for* first.
A Warbanner that heals before it damages is a different skill at 5 % health than
one that damages before it heals.

### Backend / data

1. **`api/skills/newskill.json`** — copy `api/skills/damage.json`:
   - `id`, `name`, `category` (`active_aura` / `passive` / `cooldown`), `maxLevel`
   - ⚑ **`name` is a KEY, not a label — `displayName` is what players read.**
     `name` is what `api/recipes/` (`ingredients[].skill`, `result`),
     `api/milestones/milestone-unlocks.json` (`skillName`), a mob's `skills[]`
     and `unlocks[]` (`skillName`), NPC teach blocks, the `SKILL <name>` cheat
     and a couple dozen Go test files all join on. The player-facing string is the
     optional `displayName` override, else derived server-side by
     CamelCase→spaces (`skills.DeriveDisplayName`) and served over
     `GET /skills` — the client reads **only** that
     (`Skills.ts` → `displayName ?? "Skill #<id>"`). Four skills author an
     override today, for the cases where the split reads badly:
     `HoldTheLine` → "Hold the Line" · `LongRangeStrike` → "Long-Range Strike"
     · `CallForAid` → "Call for Aid" · `DamageBurst` → "Damage-Burst".
   - ⇒ **Re-flavouring an ability is a one-line `displayName` edit in one
     file.** Renaming `name` instead sweeps every join site listed above. That
     path is safe — the derivation follows, and a missed reference **hard-fails
     at registry load** rather than shipping something silently inert — but it
     buys nothing a `displayName` does not. Keep `name` boring and frozen; a
     structural key like `Damage` is *supposed* to survive the flavour pass
     that renames it to something evocative on screen.
   - **`maxLevel` is drawn from a closed vocabulary: `{1, 5, 10}`**
     (plan-numbers-rewrite D2/D11, authored 2026-07-31). **10** = a
     build-defining core aura, the kind a build is named after — today Damage,
     Heal, Immolate, LongRangeStrike, Reaper plus the four combo ceilings
     (Vanguard, Spearhead, Lifewarden, Warbanner). **5** = everything
     supporting. **1** = a binary ability with nothing to scale (Recall,
     Revive, Haste, Recover).
   - ⚑ **The cap is a PRICE, not just a ceiling.** Point cost is *cap-relative*
     (D10): the first half of a skill's levels cost 1 point, the third quarter
     2, the last quarter 3 — so maxing a cap-10 skill costs **16** points and a
     cap-5 skill **7**, against a ~29-point level-30 budget. Raising a cap
     without re-deriving the `*PerLevel` slopes therefore both inflates the
     ceiling *and* re-prices the skill.
   - ⚑ **Raising a cap silently re-times every recipe that names the skill.**
     `recipe.go` only checks `level ≤ maxLevel`, so `Damage 5` stays valid when
     Damage moves to cap 10 — it just stops meaning "maxed" and starts meaning
     "half-way". Re-read `api/recipes/` after any cap change.
   - `effects[]`: one payload per effect; params follow
     `base + (level−1) × perLevel` (e.g. `damageHP` + `damageHPPerLevel`)
   - targeting is faction-relative: `targetsEnemies` / `targetsAllies`
     (+ `selector`, `maxTargets`, `tickInterval`, optional `variance`,
     `damageTags`, `hitStyle`)
2. **Pick an unlock source:**
   - **Milestone** — add to `api/milestones/milestone-unlocks.json`.
     (Moved out of `backend/pkg/aura/skills/` on 2026-07-21 — it is now ordinary
     `api/` content, covered by `-content ../api` like everything else, so a
     restart suffices and no rebuild is needed.)
   - **Kill drop** — add `{skillName, chance}` to a mob's `unlocks[]`.
   - **Combination** — add `api/recipes/newcombo.json`
     (`result` + `ingredients[]` by name+level; curated/secret/backend-only).
3. **Build:** `make -C backend build`, or `-content ../api` + restart.

### Frontend — nothing to do

**Retired 2026-07-21 (UI-polish chunk 1, `ae51d8b5`).** This step used to be two
hand-synced edits; both are gone:

- ~~`Skills.ts` `SkillNames` / `SkillMaxLevels` / `SkillCategories`~~ — the client
  now fetches the server's **parsed** registry once at startup over
  `GET /skills`, so name, maxLevel, category *and* the full effect numbers for
  tooltips stay correct through every retune and every `-content` iteration.
  The name it renders is the catalog's `displayName` — the authored override if
  present, else CamelCase→spaces off `name` (see the `displayName` note under
  "Backend / data" above). There is no client-side name table to touch.
- ~~`*_SKILL_ID` ring-style constants + `Character.setActiveSkill`~~ — **retired
  2026-07-21 (`e8b67289`)**: the aura ring is category-driven off the wire
  (`aura_category`, derived server-side from `EffectDef.Type`) and drawn by the
  shared `AuraRingStack`. All eight constants are deleted.

If a skill renders as `Skill #<id>`, the catalog fetch failed — that is a
connectivity/CORS symptom, not a missing frontend entry.

> No `.fbs` / FlatBuffers regen is needed for new skills, and no frontend edit
> at all. A new ability is **pure JSON + restart**.

### Authored key → catalog path (two vocabularies for the same data)

What you author is **not** what `GET /skills` serves, and both halves are
deliberate: content JSON is **flat and prefixed** (`damageHP`, `resistTags`) so
an effect is one readable block; the catalog is **nested** (`damage.hp`,
`resist.tags`) so the payload matching `type` is the only non-nil one. The cost
is that a key you see in devtools cannot be grepped back to the file you author
— hence this table (backlog §27.3.4).

**The general rule:** the type prefix moves into the payload name and drops off
the key. `damageHP` → `damage.hp`. `PerLevel` suffixes always survive intact.

**Flat keys that stay flat** (they live on `EffectDef` itself, not in a
payload): `radius`, `radiusPerLevel`, `tickInterval`, `tickIntervalPerLevel`,
`selector`, `maxTargets`, `maxTargetsPerLevel`, `targetsEnemies`,
`targetsAllies`, `targetsStructures`.

| Authored (content JSON) | Served (`GET /skills`) | Effect types |
|---|---|---|
| `damageHP` / `damageHPPerLevel` | `damage.hp` / `damage.hpPerLevel` | damage_aura, instant_damage |
| `damageTags` | `damage.tags` | ⚑ also `dot.tags` on the dot types. **Closed vocabulary** (D4): `physical` `fire` `frost` `nature` `poison` `bleed` — anything else hard-fails |
| `gateKey` (string) | `damage.gateKey` | ⚑ the lock-and-key mechanism, **not** a damage type. Closed vocabulary: `harvest` `smash`. Mutually exclusive with `damageTags` — a gated hit declares no type |
| `variance` | `<payload>.variance` | damage / dot / heal / hot / selfHeal |
| `hitStyle`, `structureDamageFraction` | `damage.hitStyle`, `damage.structureDamageFraction` | damage_aura, instant_damage |
| `executeBelowFraction`, `executeBonusFactor`, `berserkerMaxBonusFactor`, `critChance`, `critChancePerLevel`, `critFactor`, `lifestealFraction` | `damage.<same name>` | damage_aura, instant_damage |
| `damageHP` / `damageHPPerLevel` | `dot.hp` / `dot.hpPerLevel` | ⚑ dot_aura, instant_dot — **same authored key, different path** |
| `dotTicks` / `dotTickInterval` | `dot.tickCount` / `dot.interval` | dot_aura, instant_dot |
| `healHP` / `healHPPerLevel` | `heal.hp` / `heal.hpPerLevel` | heal_aura |
| `healHP` / `healHPPerLevel` | `selfHeal.healHp` / `selfHeal.healHpPerLevel` | ⚑ self_heal — the payload keeps the `heal` prefix here |
| `healHP` / `healHPPerLevel` | `hot.hp` / `hot.hpPerLevel` | hot_aura, instant_hot |
| `healFractionOfMax` / `…PerLevel` | `heal.fractionOfMax` / `selfHeal.fractionOfMax` | heal_aura / self_heal |
| `costFractionOfMax` / `…PerLevel` | `costFractionOfMax` / `costFractionOfMaxPerLevel` | ⚑ the ONE key that is not inside a payload — it sits on the effect itself and is valid on **every** effect type, so it is checked outside `effectKeys` |
| `hotTicks` / `hotTickInterval` | `hot.tickCount` / `hot.interval` | hot_aura, instant_hot |
| `shieldHP` / `shieldHPPerLevel` | `shield.hp` / `shield.hpPerLevel` | shield_aura, instant_shield |
| `shieldDurationTicks` | `shield.durationTicks` | instant_shield only |
| `slowFraction` / `slowFractionPerLevel` | `slow.fraction` / `slow.fractionPerLevel` | slow_aura |
| `resistTags` / `resistFactor` / `resistFactorPerLevel` | `resist.tags` / `resist.factor` / `resist.factorPerLevel` | resist_aura, resist_passive |
| `stat` / `statBonus` / `statBonusPerLevel` | `stat.name` / `stat.bonus` / `stat.bonusPerLevel` | stat_multiplier |
| `targetsSelf` | `<payload>.targetsSelf` | ⚑ resist / shield / hot — inside the payload, unlike the other target flags |
| `spawnMob` / `ttlTicks` / `ttlTicksPerLevel` / `powerPerOwnerLevel` | `spawn.mobName` / `spawn.ttlTicks` / … | spawn |
| `threatMargin` | `threat.margin` | taunt (detaunt ignores it) |
| `reviveHealthFraction` | `revive.healthFraction` | revive |
| `dashDistance` / `dashDistancePerLevel` | `dash.distance` / `dash.distancePerLevel` | dash |
| `tickRateFactor` / `tickRateDurationTicks` | `tickRate.factor` / `tickRate.durationTicks` | tick_rate |
| `speedFactor` / `speedDurationTicks` (+`PerLevel`) | `speed.factor` / `speed.durationTicks` | ⚑ speed_burst — the payload is `speed`, not `speedBurst` |
| `lifestealFraction` / `lifestealDurationTicks` (+`PerLevel`) | `lifesteal.fraction` / `lifesteal.durationTicks` | ⚑ lifesteal_burst — `lifestealFraction` is **shared with the damage payload**; on `damage_aura` / `instant_damage` it is a permanent rider on that effect and lands at `damage.lifestealFraction` instead |
| `calmTicks` / `calmTicksPerLevel` | `calm.durationTicks` / `calm.durationTicksPerLevel` | calm |
| `charmTicks` / `charmTicksPerLevel` | `charm.durationTicks` / `charm.durationTicksPerLevel` | charm |

**Skill level, not effect level:** `targetFactions` keeps its key but **changes
its values** — you author faction *identifiers* (`["wildlife_prey"]`), the
catalog serves resolved *display names* (`["Prey"]`). The bitmask those names resolve to is
server-only and is **not** served at all (`json:"-"`, backlog §27.3.6).

The authoritative lists are `effectKeys` (what each type accepts) and the
payload structs' json tags, both in `backend/pkg/aura/skills/definition.go`. If
this table and that file ever disagree, the file wins.

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
  `wolf.svg`, `wildboar.svg`, `bear.svg`.

Inanimate props/hazards (pools, campfires, barricades) are exempt — no
portrait applies there.

Simplest case — **drop-in file replacement, frontend only.**

- **A mob's art:** replace the SVG at the path in `Graphics.ts` `mobs.<mob>.file`
  (e.g. `assets/mobs/wolf.svg`). Keep the filename to change nothing else, or
  repoint the `require`. If proportions differ, adjust `minSize` / `maxSize` /
  `anchor` in the same entry. ⚑ **Check the entry, never the filename** — the
  name and the mob don't always match (the live Boar draws `wildboar.svg`), and
  several files are shared by more than one entity, so one swap can change four
  NPCs at once. The full map of which file serves what is `art/README.md`; the
  pipeline mechanics (bake resolution, the square-sprite rule, PNG support, the
  four-layer medallion) are `art/pipeline.md`.
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
seams. **Reference implementation: `encounter/warlord.go`** (the Orc Warlord
in the live world) — copy it, don't start blank. Zero wire changes are needed unless your
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
| Summon-era seams | `model/mob/mob.go` | `SetFaction`, `SetTTLTicks`, `SetOwner`, `RestoreToFullHealth`, `SetSummonPower` — usable on encounter spawns too if a phase wants them. ⚑ `SetOwner` is also the **body scaling**: an owned mob stands at its owner's level, so its pool becomes `baseMaxHealth × f(ownerLevel)` — follow it with `RestoreToFullHealth()` unless the spawn is meant to start hurt (`RaiseMaxHealth` was retired with that rule, plan-entity-model.md chunk 1b) |
| `game.RegisterEncounter(e)` | `core/game.go` | Registration, called from `aurad.go` post-construction |

### Step by step

1. **Author the mobs** (`api/mobs/*.json`) — either full defs with their own
   `EntityType` (the warlord roster) or variant defs with the `entityType`
   override (§1) — own `id` (keep ids unique by hand, the registry silently
   overwrites duplicates), own stats/skills/faction. Two deliberate choices
   worth copying:
   - **No `faction` key** = built-in hostile default → the roaming wildlife
     factions ignore your arena and your arena mobs never fight each other.
   - **No `fleeBelowHealthRatio`** on the boss — flee should be *scripted*
     (the override), not autonomous, or the two will fight.
2. **Write the encounter struct** in `backend/pkg/aura/encounter/`
   (or a subpackage later, when there are many). Patterns from `warlord.go`:
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
4. **Test it** with the `encounter/warlord_test.go` pattern: the package
   `fakeGame` + `encounterMobDef` helpers (`system_test.go`) and a `step`
   helper that replicates the MobSystem death loop
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
  markers): pick a low-traffic pocket so wandering factions don't wander in.
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

## 6. New quest

Two files minimum: the quest (`api/quests/<id>.json` — the stage graph and the
diary prose) and at least one conversant's `interaction` block (the rows that
offer, advance and turn it in). A quest file deliberately does **not** know who
talks about it (`plan-quests.md` D11), so the wiring lives on the NPCs.

**Content-only.** No Go, no `.fbs`, no frontend — the vocabulary shipped with
chunks C1–C3. `make -C backend build` (or `-content ../api`) picks it up.

### The stage graph

A stage is one of exactly two shapes, and the loader enforces it:

- **objective stage** — `objectives[]` (`kill` / `harvest` / `talk_to`) plus a
  single `next`. It advances by itself the moment the character's **lifetime**
  counters satisfy it.
- **dialogue stage** — neither. It waits for an authored row somewhere in the
  world.

A stage nothing advances out of is **terminal**: entering it completes the quest.
That is *derived*, never authored — `quests.CrossValidate` learns it from the
rows at boot.

⚑ **Thresholds count since stage entry** (N4/D4, `plan-feel-pass-2.md`,
reversing D3's original lifetime reading — this paragraph described the old
behavior until 2026-08-07). `"count": 8` means *kill eight more after this
stage starts*: the counters underneath stay lifetime, but entering an objective
stage snapshots them as a baseline (`quests/ledger.go`), so a veteran gets no
retroactive credit and abandoning + re-accepting starts the objectives over.
A `talk_to` target already spoken to needs a fresh talk.

⚑ **Rewards can only ride a turn-in row**, so a quest that ends on an objective
stage pays nothing. The shape every authored quest uses is
`objective stage → dialogue stage → terminal stage entered by a rewarding row`.

**The journal's objective line** (conversation-journal Q2) is composed
server-side from the current stage. An optional `tracker` string on the stage
wins over the derived line, with `{n}/{m}` substituted live from the stage's
first countable objective — it is the plural fix (`"3/8 wolves slain"` instead
of the derived `"3/8 Wolf slain"`) and the ONLY way a dialogue stage gets a
line at all (`"Return to the farmer"`), so author one on every non-terminal
dialogue stage. The loader rejects `{n}/{m}` on a stage with nothing to count.

### The rows — and the show-rule that replaced the old gating

⚑ **A quest row is shown iff its ledger op would succeed** (Q1's show-rule):
an `offer_quest` row vanishes the moment the quest is accepted, and a turn-in
row appears exactly when its edge is walkable. So **quest rows need no
`quest_at_stage` gates at all**, and since Q4 the content pattern is:

- the NPC's **root** is an ordinary unconditional greeting with rows;
- each quest sits **behind its own row** on root (`"Any issues around here?"`),
  its brief as that quest node's text — written once, so it reads correctly
  before and after acceptance (§4.6 of the plan);
- the Accept row, the turn-in row and any follow-up question rows all live on
  that one node; the show-rule sorts out which are visible. Grant rows author
  no `next` — the player stays on the node and the grant's `line` is spoken;
- an NPC turning in a quest that is not otherwise his (the wolves branch legs)
  puts the turn-in row directly on root.

```json
{ "text": "I've spoken to them both.",
  "grants": [
    { "kind": "advance_quest", "quest": "village-welcome",
      "fromStage": "back", "toStage": "known", "line": "..." },
    { "kind": "grant_xp", "xp": 150, "line": "..." } ] }
```

- A quest grant makes the whole option **one atomic row**, applied together —
  which is why it must sit at index 0 (the ledger op runs first and a refusal
  abandons the row; that is what stops a re-clicked turn-in paying twice) and why
  an authored `text` is required (there is no skill name to fall back on).
- `grant_xp` is legal **only** on an edge that ENDS the quest (L10): abandon
  leaves the counters standing, so anything else is a loopable faucet.
- A quest grant takes no `requiredLevel` — the stage graph is its gate.

### Node conditions — greetings, and hiding a spent info row

Gate nodes with `quest_at_stage` (`{"quest", "stage"}`, where `stage` is a stage
id or `not_started` / `completed` / `running`). Options have no conditions of
their own; an option pointing at a hidden node is hidden with it. Two uses:
**state-dependent greetings** (the traveller greets differently once his quest is
done), and **hiding a row by gating its destination**.

⭐ **`running` is the whole in-progress band** — accepted, not yet finished,
across every stage. It exists because conditions are AND-ed with no negation, so
"while this quest is running" otherwise meant duplicating a node once per stage.
Its use is the rule *a row that answers a question only a RUNNING quest asks*:
the traveller's *"Where do they nest?"* leaves when the lamp quest ends
(intake round 8 item 2). ⚑ **Do NOT gate pure lore that merely sits near a
quest** — directions, road advice and backstory are content a player may want to
re-read forever, and every other info row in the cast is exactly that. ⚑ Note
`running` also hides the row *before* the quest is accepted; if you need it
readable then, the row is lore and should not be gated at all.

1. ⚑ **Conditional nodes must sit ABOVE the unconditional root** — the loader
   hard-fails otherwise (L3), because the greeting is the first node whose
   conditions pass. **Exception: a node an option navigates to**, which was never
   competing to be the greeting and is exempt. That exception is what makes the
   gated info row authorable at all: hoisting its node above the fallback would
   make it the *greeting* the moment its condition passed. *(The C4-era corollary
   — quest-state nodes hijacking the greeting, each needing a row back to `root`
   — is retired: quest nodes are unconditional now and reached by a row, so Back
   covers the way out.)*
2. ⚑ **If a row authors a `next`, it must name a node that is visible BEFORE
   the row is taken.** The destination is checked against the pre-op state, so
   pointing a row at a node gated on the state the row is about to create hides
   the row from itself. Grant rows authoring no `next` (the Q4 convention)
   sidestep this entirely.

`api/mobs/hermit.json` (offer + turn-in + follow-up question on one quest node)
and `api/mobs/lampless-traveller.json` (the same plus a conditional completed
greeting **and** the `running`-gated info row) are the worked examples; `api/quests/README.md` documents the file
format itself.

### Verify

`go test ./pkg/aura/quests/` (the content pins: census, cross-validation,
reachability, the XP budget), boot with the quest count in the log, and
`node .claude/skills/verify/chunkC4-quests.mjs` for the rows at the game surface.

## Known hand-sync points

These duplicate a single source of truth and must be updated together — easy to
forget:

- ~~**`EntityType` enum ↔ `gameObjectClasses` array** (positional index)~~
  **defused 2026-07-22 (`research-code-quality.md` §7.3/§7.4):** the map is now
  a `Record` keyed by the generated `entity-type.ts` enum members, so position
  no longer matters and a missing/extra entry is a **compile error** (`npm run
  typecheck`, also run in CI). What remains is the benign pair: enum member ↔
  mob JSON `name` (resolved at boot, a typo fails loudly), plus remembering to
  add the record entry — which the compiler now reminds you of.
- ~~**`Skills.ts`** `SkillNames` / `SkillMaxLevels` / `SkillCategories`~~
  **retired 2026-07-21 (UI-polish chunk 1, `ae51d8b5`):** the client fetches the
  server's parsed registry over `GET /skills`; the three maps are deleted. Mob
  nameplates got the same treatment via `GET /mobs` (`5308c312`). **Serving a
  catalog is the house answer for new frontend/backend content duplication —
  don't mirror a table.**
- ~~`Graphics.ts` `damageAuraRadiusMeters`~~ **retired 2026-07-10 (mob-depth
  chunk 3c):** mob ring size is wire-driven (`Mob.aura_radius`, 0 = aura
  gated/off) — no hand-sync remains.

## Quick reference: what touches the wire?

| Task | JSON | Go | `.fbs` + regen | Frontend |
|------|------|-----|----------------|----------|
| New mob (new art) | ✅ | — | ✅ | ✅ |
| Mob variant (reused art via `entityType`) | ✅ | — | — | — |
| New skill (existing effect types) | ✅ | — | — | — (served via `GET /skills`) |
| Re-flavour an ability's on-screen name | ✅ (one `displayName` line) | — | — | — |
| Rename a skill's registry `name` | ✅ (skill + every join site) | ⚠️ tests only | — | — |
| New effect *type* | ✅ | ✅ | — | ✅ |
| Scripted encounter (existing seams) | ✅ (mob defs) | ✅ (one struct + registration) | — | — |
| New quest (existing verbs) | ✅ (quest + the conversants' rows) | — | — | — (prose served via `GET /quests`) |
| Replace ability VFX | — | — | — | ✅ |
| Replace mob / player icon | — | — | — | ✅ |
