# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- Pointer only. Keep this section to: last completed, what's next, open PO calls, open
     code-health findings, and standing locks/gotchas. FULL per-chunk ledgers live in the
     plan-*.md banners; the authoritative sequence + per-step outcomes live in roadmap.md
     "Execution order". Don't re-expand chunk ledgers or per-chunk placeholder values here —
     point to the plan doc. See the `chunk-wrap` skill for the collapse rule. -->

- **Last completed:** **playtest round-3 chunk — healer combat state + role-as-loadout DONE** (2026-07-25, full ledger in `docs/plan-playtest-feedback.md` §Round-3 chunk ledger) ✅ `03b152f4` — **⏳ PO TEST PENDING 2026-07-26** (headless-verified only; a 4-point in-game acceptance checklist is at the top of the ledger). 11 files. Both parts in one chunk (PO call): the selector needs a combat-state notion that is *not* "has an aggro target", and support mode makes that proxy strictly worse. **Part 1:** `Mob.InCombat()` already existed returning exactly `m.aggroTarget != nil` — it *was* the bug, already public and already read by heal eligibility; now `aggroTarget != nil || inCombatTicks > 0`, stamped in `takeDamage`, with regen moved into its own `!InCombat()` gate. `combatRegenGraceTicks = 100` is deliberately the player's constant's **name and value** (§31 convergence, same tactic as `game.mob.healthGainTick`). **Part 2:** `healer.go` → **`support.go`**; the latched `seekHealer` type flag is gone, `roleSlots` derives support/combat slots from aura **categories** via the existing `skills.AuraCategoriesOf` table (support = Heal|Shield per PO, combat = Damage|Dot|Slow); both `updateAggro` early-returns replaced by enemy-acquisition → support-acquisition → `selectMode`; `applyMode` is now the **single writer** of aura gating (`setAggroTarget`/`resetAggro` no longer touch it); `supportTarget` is its own field so `aggroTarget` means only "the enemy I fight". **Dwell (PO: tick boundaries, with the explicit constraint that it must NOT bind players):** honoured structurally — damping lives in `mob.applyMode`, players switch through `SkillComponent.SetActiveAura` directly and are untouched (that seam also matters because the accumulator reset is a deliberate anti-rapid-switch-DPS guard). "Boundary" resolved as *the outgoing slot's fastest effective interval* — ambiguous otherwise, since each effect ticks on its own cadence. **⚑ 2 bugs found in-chunk, not in the plan:** ① `SetFaction` re-derives the sensor mask and `spawnSummon` calls it **after** `NewMob`, so a construction-time support widening was narrowed straight back — **every summoned medic was blind regardless of the rest of the fix** (predates this chunk; applied to `seekHealer` too); now derived in `refreshSensorMask`, pinned both ways. ② **`ShieldbearerCompanion` had the same bug as `MedicCompanion`** — the plan named only the medic. ③ (post-implementation smell review, fixed test-first) **selector branch ORDER is load-bearing** — a medic is both a follower and a pacifist, and with `isFollower` first it still chased the owner's attacker with no combat aura to hurt it with; `isPacifist` now wins, so the PO's pacifist rule holds for followers too. **⚠ 2 PO-visible behaviour changes:** ① **`RallyDrummer`** carries `shield_aura`, not `heal_aura`, so `firstAuraHeals` never classified it — it used to acquire and chase players while shielding its squad, dealing nothing; under the loadout rule it is a **pacifist** and now seeks wounded allies. Follows from the PO's Heal+Shield set and looks correct, but was not called out. ② **every mob now stops regenerating ~3.3 s after any hit** — hit-and-run whittling works on anything, not just healers. Content: `supportThreshold` in `factors` (validated `[0,1]`, absent → 1.0), companion aggroRadius `0.1 → 3.5`/`5.5`. Verified: `go build`/`vet` clean, `go test ./...` green (27 pkgs), **guardrails replay identically `-count=2`** (mob AI — no damage mob carries support, so the rule never fires for them), boot `-content ../api` **0 errors 0 panics** (83 skills/14 factions/50 mobs/10 recipes/5 prop defs/1 milestone/777 props/471 spawns/5 campfires/14 npcs), `make -C backend build` re-run **after** the JSON edits (cp-defs had run before them — the §26 Chunk-2 lesson, caught here), headless join smoke OK. No frontend/wire change ⇒ no tsc/webpack. **⚠ §29 recurred (4th sighting) and the "first cold load after restart" lead did NOT hold** — see Code-health findings.
- **Prior:** **code-health triage session — 2 chunks DONE** (2026-07-24, ledgers in `docs/backlog.md` §30/§27.3.3 and §27.2.3/§25 B) ✅ `f095514a` + `2ec03ee7` — `layers.placeables` vestige prune + `tickInterval` hard-fail, and 3 hardcoded Go constants → conf knobs with no behaviour change (`game.mob.healthGainTick` + a new `game.combat` block; ⚠ **authoring 0 restores the default, it does not disable** — open PO question). Spun off **new backlog §31**.
- **Prior:** §28 item-system removal **COMPLETE** — Chunk 3 wire-enum prune ✅ `8ed4ff4c` (explicit permanently-pinned enum values ⇒ no future removal can renumber a survivor; new `NpcPlaceholder` art; a PO-requested plan audit caught a self-deleting dev-only class being shipped as the NPC fallback sprite), Chunk 2 frontend scaffolding ✅ `2f933634`, Chunk 1 backend registry ✅ `b9d01d33`, all 2026-07-24 and PO-verified. EntityType name-fallback validation §27.2.1 ✅ `c3938be7`. Full ledgers: `docs/archive/plan-item-system-removal.md §13`, `docs/archive/plan-entitytype-validation.md`.
- **Recent chunks (newest first; full ledgers in the plan docs):** dead resource+placeable+decay prune §26 FULLY DONE ✅ `ee9d42e9`+`a2ab90b5` (Chunks 1+2 — emptied the item registry to `None` ⇒ §28 removal now trivial; Chunk 2 also fixed a Chunk-1 frontend-build regression — **rebuild frontend AND backend after content deletions**; `plan-resource-decay-prune.md`); render-jitter buffered-interp fix ✅ `0e504c22`/`8a29a75c`/`c5064732` (`plan-render-jitter.md`); input-jitter held-state fix ✅ `cb7f011f` (`plan-input-jitter.md`); unlock source attribution ✅ `2bfee286` (`plan-unlock-attribution.md`); idle-loop alloc fix ✅ `fe0044d0` + day/night DEACTIVATED ✅ `e648ab88` (`plan-intermission-triage.md`); playtest-1 Passes A/B/C ✅ — **plan fully executed** (`plan-playtest1-feedback.md`); F&F deploy LIVE ✅ `a7a2267d` → `https://aura-game.duckdns.org/` (`plan-playtest-deploy.md`); content pass C1–C8 + rebrand step 7 complete. Earlier chunks: roadmap.md "Execution order" + the plan-*.md §13 banners.
- **Next: PO in-game verification of the round-3 chunk**, then the **playtest round-4 chunk — ability tooltips under-report every HP value** (`plan-playtest-feedback.md` §Intake round 4, designed 2026-07-25, **not started**). Round-3 acceptance: beat on a lone healer and confirm it dies, and check whether `RallyDrummer` no longer chasing players reads correctly (see the ⚠ in Last completed). Round 4: `SkillTooltip.ts` models the skill-level axis but never the character power curve, so Rejuvenation reads identically at level 1 and 30 across **seven** HP-valued lines; `/skills` payload becomes `{curve, skills}` (breaking, but our client is the only consumer — ⚑ DRY watch: the curve construction already exists verbatim at `core/gameconf.go:22`), frontend gets `powerScaleAt(level)`. PO decision: absolute numbers. TDD seam is clean — `prog`/`scaled` are already pure and DOM-free. **Blocks nothing, blocked by nothing.** Round-3 PO decisions on record 2026-07-25: no universal auto-attack (parked in §31), support set = Heal+Shield, pacifist healers ignore their attacker, survivors-like fork **CLOSED — stays MMO-lite**.
- **Then: step 8 — accounts & persistence** (roadmap item 3, planning session), then the character-sacrifice loop (triage item 10) as persistence's first consumer — extra-motivated since the live server wipes characters on every restart. **Fold in backlog §31 (entity-model convergence) — persistence must serialize "what is a character vs a mob vs an NPC", so decide that before writing a schema** (the round-3 chunk above proves the loadout half out first). **Also fold in backlog §32 (consumable cooldowns / spellbook charges)** — "does a charge survive death" is a persistence question, and it's the idea most likely to want schema room. **Fold in `plan-playtest-deploy.md` §Ops & security posture** when planning it — persistence is the security tipping point (cloud firewall, DB bound to localhost, daily backup + proven restore, DB-credential handling). Expect ad-hoc live-playtest triage in parallel. **Deferred:** step-8 audio half (combat SFX, PO-deferred 2026-07-21 — no placeholder assets); UI-polish later passes (`plan-ui-polish.md` §Deferred — popups ride the in-game announcement system); playtest-1 design rounds (`plan-playtest1-feedback.md` §Own planning rounds); the full Deferred/placeholder catalog lives in the respective plan docs.
- **Open PO calls:** replacement art (mascot/splash/favicon), wiki-generator keep-or-delete, eventual domain (berryhunter.io URLs kept meanwhile). PO continues manual zone-editor placements in parallel.
- **Code-health findings** (`docs/backlog.md` §27 / `docs/research-code-quality.md` §10) — the three called out 2026-07-24 are all **✅ FIXED test-first**: ① `MobSystem.Update` mutation-during-iteration (skipped/double-updated a survivor per dead mob/tick — collect dead in the loop, remove after; `f6fcfbad`, §27.1); ② drop-RNG determinism (**PO-ruled bug** — `NewMob` seeded per-mob RNG from the entity ID alone so a fresh server re-rolled the same HP variance + first drop for the Nth spawn every restart; now a per-process salt mixed with the ID randomizes per run while sim/guardrails stay deterministic; `b4b0e66d`, §27.2.2); ③ `definition.go` guard coverage evened out — `mapToEffectDef` `default:` + inert-config/radius guards (`eee10331`, §27.3). ④ §27.2.1 EntityType name-fallback (**was a live-server crash at first spawn**) validated at load now — `mobs.ResolveEntityType` + loader guard + `NewMob` panic (`c3938be7`, see Last completed). **§26 dead resource/decay prune ✅ FULLY DONE `ee9d42e9`+`a2ab90b5`** (Chunks 1+2) — emptied the item registry to `None`. **§28 item-system removal ✅ FULLY DONE 2026-07-24** (`docs/archive/plan-item-system-removal.md`, 3 chunks): C1 backend registry `b9d01d33` · C2 frontend scaffolding `2f933634` · C3 wire-enum prune `8ed4ff4c` (see Last completed) — **the wire enums now carry explicit, permanently-pinned values; a future removal is a one-line delete that leaves a gap.** **2026-07-24 triage session ✅ `f095514a`+`2ec03ee7`** (see Last completed): §30 items 2/3/4, §27.3.3, §27.2.3, §25 B and §25 A#4 all closed. **⭐ NEW §31 — one entity, many roles:** the player/mob/NPC stat model never converged. Both players and mobs carry the same `SkillComponent`, but **3 of 5 derived stats (`maxHealth`, `damageReduction`, `movementSpeed`) are applied only in player code paths**, so a mob equipping Hardy/Tough/Swift silently gets nothing — *latent*, verified 0 mob defs equip any of the 5 today. And **`model/npc` has no health/level/faction/skills at all**, which is why every stat-bearing "NPC" (healer, campfires, turnip fields, guards) is actually a **mob** — mob defs carry no `teachings`/`lines`, so **a teacher who fights or an NPC with a level is currently unauthorable**. Chunk B was its deliberate first instalment (matching vocabularies). **Do NOT action gap 1 in isolation** — it needs a PO ruling on whether mob passives scale like player ones, and gap 4 is a content-design question first. **⚠ Collides with step 8:** persistence must serialize *something*, so decide the entity model before writing a schema. **Still open, unscheduled:** §25 A#1–3 + C/D, §27.2.8 hygiene, **§29** (**4th sighting 2026-07-25** during round-3 verification: 3 × `Cannot read properties of null (reading 'split')` on one run, then **clean on 3 further runs including a deliberate fresh cold load after a server restart** ⇒ the *"first cold load after a restart"* lead **did NOT hold** and should be treated as weakened, not confirmed. Still standing from 2026-07-24: NOT develop-mux-only, and the errors are separable from the black world, which killed the `_ZoneEditorPanel` lead. Non-deterministic; reproduce against a **dev** build for an unminified stack), **§30 item 1** only (`Resource.capacity`/`stock` — wire, ride it along with another schema regen).
- **Standing locks & gotchas:** growth **1.12 × maxLevel 30**; regen **0.00033 ≈1%/s × taper 1.0→0.4** FINAL; §11 no-pity + campfire **0.12** + heal cost **10−2/level** FINAL; drop + milestone tables are **TUNING-OPEN** (milestone = Haste@L7 only); density = mob visible per ⅔-screen window; downtime 10 s + chain 20; guardrail asserts in `cmd/simharness/guardrail_test.go`. New mobs: inherit the Session-⑥ XP rule (facetank kph, else kite ×0.5) and **must** author tier + baseline (raw `maxHealth` hard-fails). Day/night cycle is **OFF** (`DAY_CYCLE_PRESENTATION_ENABLED=false`, bug unfixed — don't re-enable without collapsing the ~25 per-layer filter passes). Per-chunk placeholder values live in their plan docs. **Dev cheats:** GOD, WARP `<x·120> <y·120>` (1-unit granularity — land on a whole unit), SPEED, XP, SKILL, ANNOUNCE, THREAT. `make -C backend build` runs `cp-defs` (reverts embedded `backend/pkg/api/` from `api/`); boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

## Development Principles

These principles apply to all code written or modified in this project.

### KISS — Keep It Simple, Stupid

Prefer the simplest solution that works. Avoid clever abstractions, unnecessary
indirection, or premature generalization. If a function does one clear thing in
20 lines, that's better than a "flexible" version in 80. When proposing
architecture, start with the simplest design that satisfies the actual
requirements — not the imagined future ones.

### DRY — Don't Repeat Yourself

Knowledge should have a single source of truth. If the same logic, constant, or
configuration appears in multiple places, extract it. Watch for subtler
duplication: parallel switch statements, repeated validation patterns, copy-paste
between similar systems. But: don't deduplicate things that just *look* similar
— two pieces of code that happen to be identical today but represent different
concepts should stay separate.

### YAGNI — You Aren't Gonna Need It

Don't build for hypothetical future requirements. No "we might need this later"
parameters, configuration options, or abstraction layers. Add complexity only
when there is a concrete, present need. This applies especially to the aura
system: build what the current design requires, not what every possible future
combination might require.

### TDD — Test-Driven Development

For new features and bug fixes:

1. Write a failing test that captures the desired behavior
2. Write the minimum code to make it pass
3. Refactor if needed, keeping tests green

This applies to backend Go code (`go test ./...`) primarily. For exploratory
prototype work or UI tweaks, strict TDD may be relaxed — but any non-trivial
game logic (aura calculations, combination resolution, damage application)
should have tests before or alongside the implementation.

When fixing a bug: first write a test that reproduces it, then fix.

## Project Overview

**Aura** (formerly Berryhunter; module path `github.com/RoteRiesenRobbe/aura`, local workspace dir `aurahunter`) is a multiplayer top-down browser MMO built on the Berryhunter survival-game foundation. The repo has three main parts:

- `backend/` — Go game server (`aurad`)
- `frontend/` — TypeScript/webpack browser client using PixiJS
- `api/` — Shared FlatBuffers schemas and the authored content JSON (mobs, skills, recipes, zones, props, factions, milestones)

`docs/README.md` is the docs index — it holds the naming convention and the four-layer status model (this file = current state · `roadmap.md` "Execution order" = sequence · `plan-*.md` §13 banners = per-chunk ledgers · `MEMORY.md` = cross-session index).

**`docs/` = live work, `docs/archive/` = finished work.** Plan docs referenced by bare name below (e.g. `plan-mob-depth.md`) are in `docs/archive/` once their work has shipped; anything still in `docs/` proper has something open. When a plan's last chunk lands, `git mv` it into `archive/` and move its index line to the README's Archive section.

## Build & Run

### Backend (Go ≥ 1.22)

```bash
# One-time: copy config
cp backend/conf.local-windows.json backend/conf.json   # Windows
# or use backend/conf.default.json as a template

# Build
make -C backend build          # produces backend/aurad

# Run (dev mode serves static frontend too)
cd backend && ./aurad -dev

# Run without build (go run)
make -C backend dev
```

> **Gotcha:** after backend logic changes, rebuild the binary with `make -C backend build`.
> `go build ./...` compiles/type-checks packages but does **not** refresh `./aurad`,
> so a running `-dev` server keeps executing stale code.

> **Content iteration:** `./aurad -dev -content ../api` loads items/mobs/skills/recipes
> from the repo `api/` directory directly instead of the embedded copies — JSON edits then skip
> both `cp-defs` and the rebuild (a server restart still applies them). The boot log prints the
> content source (`Loading content source=…`). Production/default stays embedded.

`backend/conf.json` controls server port (default `2000`), day/night cycle durations, and all game-balance tuning values. `backend/tokens.list` must exist with at least one token (e.g. `plz`) for in-game commands to work.

### Frontend (Node 20 / npm 10)

```bash
# Dev server (webpack HMR on port 2001) — no Docker
cd frontend && npm install && npm run start

# Production build
npm run build                  # output goes to frontend/dist/

# Docker-based alternatives (if local Node unavailable)
make -C frontend dev           # dev server via Docker
make -C frontend build         # prod build via Docker
```

### Opening the game

```
http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game
```

Optional dev query params:
- `&develop` — opens the draggable dev panel
- `&start-cmds=GOD,GIVE BronzeTool,...` — runs server commands on spawn

### Backend tests

```bash
cd backend && go test -timeout 60s ./...
```

The full suite runs and passes. (`backend/pkg/aura/net/net_test.go` is a manual `ListenAndServe` smoke script that used to hang the suite; it is now skipped via `t.Skip` — remove the skip to run it explicitly.)

The test runner requires generated files (`go generate ./...`). The Makefile `gen` target runs this automatically before builds.

### Code generation

```bash
# Regenerate Go enumer files and FlatBuffers bindings
make -C backend gen            # runs go generate ./...

# Regenerate FlatBuffers bindings (if .fbs schemas change)
cd api/schema && ./make.sh     # or make.bat on Windows
```

## Architecture

### Backend (ECS-based game loop)

The game server uses an **Entity-Component-System** architecture via `github.com/EngoEngine/ecs`.

- `backend/cmd/aurad/` — entrypoint; wires config, game, HTTP server
- `backend/pkg/aura/core/` — `game.go` constructs the ECS world and registers all systems; `Loop()` ticks at ~30 FPS (33 ms/tick)
- `backend/pkg/aura/sys/` — ECS systems: physics, mob AI, NPCs, skills, targeting, state (death/respawn), pre/post-update, plus `chat/`, `cmd/`, `equip/`, `statuseffects/` (deleted systems: scoreboard in the 2026-07-08 dead-feature prune, heater with step 7, decay with the §26 resource prune)
- `backend/pkg/aura/model/` — interfaces and concrete types for entities (`player/`, `mob/`, `npc/`, `prop/`, `corpse/`, `spectator/`, plus `vitals/` and `client/`)
- `backend/pkg/aura/items/mobs/` — the mob registry: definitions, catalog, `EntityType` resolution (the enclosing `items` package was deleted with the §28 item-system removal; only `mobs/` remains)
- `backend/pkg/aura/codec/` — FlatBuffers encode/decode for the WebSocket protocol
- `backend/pkg/aura/phy/` — 2D physics (circle/AABB collision, spatial hashing)

**Adding a new system:** implement `ecs.System`, register it in `core/game.go:NewGameWith()`, and add entity registration cases in the relevant `addXxx()` methods.

**Adding a new entity type:** implement the appropriate `model.*Entity` interface, update `game.AddEntity()`, and register in all relevant systems.

### Communication Protocol (FlatBuffers over WebSocket)

Schemas live in `api/schema/`:
- `client.fbs` — client→server: `Input`, `Join`, `Cheat`, `ChatMessage`
- `server.fbs` — server→client: `GameState`, `Welcome`, `Accept`, `Obituary`, `EntityMessage`, `Pong`
- `common.fbs` — shared types (`Vec2f`, `ActionType`, `AuraType`)

After editing `.fbs` files, regenerate bindings for both backend and frontend.

### Game Configuration (conf.json)

All numerical tuning lives in `backend/conf.json` (or `conf.default.json` for reference). The `game.player` block controls movement speed, aura radii, vital-sign drain/gain rates, and level-up scaling. Changes take effect on restart.

### Content Data (JSON)

All authored content lives under `api/` in seven directories — `mobs/`, `skills/`, `recipes/`, `zones/`, `props/`, `factions/`, `milestones/`. Each is loaded by `cmd/aurad/loaders.go` (`contentSources`); a missing directory hard-fails at boot. The `make -C backend cp-defs` target copies all seven into `backend/pkg/api/` so the Go build embeds them, so run it (or just `make -C backend build`) after editing any JSON definition — or boot with `-content ../api` to skip both (see Content iteration above). Keep `contentSources` covering every `api/` subdirectory, or a content edit silently no-ops.

### Frontend

The frontend is structured as feature modules under `frontend/src/features/`:
- `backend/` — WebSocket connection, FlatBuffers deserialization, entity snapshot management
- `core/` — game loop, entity manager
- `player/`, `vital-signs/` — local player state and HUD
- `game-objects/` — rendering entities (props/resources, mobs, characters, corpses) via PixiJS; `AuraRings`/`EffectPips`/`AuraTickIndicator` are the shared combat-readability overlays
- `input-system/`, `controls/` — keyboard/mouse/touch input
- `internal-tools/` — dev panel, console, overlay tester (only active with `?develop`)

**HUD event handling:** Use `pointerdown` (not `click`) for all interactive HUD panels. `MouseManager` (`input-system/logic/mouse/MouseManager.ts`) registers a `mousedown` listener on `document.documentElement` with `event.preventDefault()`, which suppresses the synthetic `click` event. `pointerdown` fires before this and is unaffected. `click` listeners on HUD panels silently never fire — this is not obvious from the source.

Webpack configs: `webpack.common.js` (shared), `webpack.dev.js` (HMR, port 2001), `webpack.prod.js` (minified output).

## Aurahunter Project Context

This fork of Berryhunter has been transformed into **"Aura"** — a top-down MMO.
The Berryhunter survival systems (vitals, crafting, temperature, hunger) have
been removed. The core loop revolves around the aura system described below.

The structural rename (execution-order step 7, `docs/archive/plan-rebrand-cleanup.md`)
is **done**: module path `github.com/RoteRiesenRobbe/aura`, package dir
`pkg/aura/`, binary `aurad`, FlatBuffers namespace `AuraApi`, title "Aura".
Remaining "Berryhunter" references are intentional: historical plan/archive
docs, `legacy: true`-tagged proving-grounds content, Kringel Games social/
rating links, and berryhunter.io domain URLs (no replacement domain yet).

### Vision

**Tagline:** MMO lite — resource vs. resource, as simplified as possible.

**Core principle:** Players and NPCs interact exclusively through **auras** —
circular effect fields that automatically apply to anything in range. No
targeting, no direct attacks. Positioning and cooldown timing are the only
skill expressions.

**References:** WoW Classic (progression, environmental storytelling), Gothic
1+2 (organic worldbuilding), Hotline Miami / Monaco / Rimworld (top-down art
direction — not isometric, not pixel art).

**Platform:** Browser-based.

### Core Loop

1. Player moves through a persistent shared open world
2. Encounters mobs / other players — own aura ticks automatically on anything in range
3. Damage, healing, buffs emerge from aura overlap; cooldown abilities modify temporarily
4. Combat ends → XP for all participants → possibly aura unlock
5. Level up → skill points → strengthen existing auras or unlock combinations
6. Explore world → find hints → unlock new auras / passives / cooldowns
7. Rearrange slots, adjust build, tackle harder content

### The Three Skill Categories

Players collect, level, and combine three categories of skills:

- **Active auras** — toggleable, have visible ranges in-world. **Exactly one
  active aura is on at a time**; the aura slots are a loadout (several equipped,
  one active, switchable mid-fight), not multiple simultaneously-active auras.
  Build variety comes from slot loadout, combination unlocks, and switch timing.
- **Passives** — passive bonuses, always on (these DO run in parallel)
- **Cooldowns** — active abilities with cooldown timers (triggered individually)

Mobs use the same aura system as players.

### The Resource

Every player and every NPC has exactly **one resource**. It represents HP, mana,
and everything else at once. Drops to 0 → death.

### Aura Combinations

- Combination unlocks trigger when specific skills reach specific levels
- Recipes are **curated, not algorithmic** and **not documented anywhere in-game**
  — the community discovers and shares them
- Combinations can cross categories (aura + passive + cooldown is valid)
- The result of a combination can itself be an ingredient for higher combinations
- **Variant auras** exist as rare world drops and are also combinable
- **Damage types** exist for mob resistances and build identity (fire, ice, physical, etc. — specifics TBD)

The combination system must technically support arbitrary combinations from day
one. Content (specific recipes) is added manually over time.

### Spellbook & Unlocks

The **spellbook** is the collection of all auras, passives, and cooldowns a
player has discovered. Five ways to obtain new entries:

1. **Milestone unlocks** — guaranteed at certain levels
2. **Monster kill unlocks** — certain mobs drop auras/passives on death
3. **World exploration** — clue anchor points throughout zones
4. **NPC teaching** — peaceful NPCs teach a specific aura on approach, often
   tied to nearby harvest-mobs that only that aura can damage (soft "profession"
   identity without a class system)
5. **Meta-progression** — sacrificing a max-level character unlocks new base auras account-wide

### World Design

Persistent shared open world, multiple connected zones for different level
ranges. Designed and built by hand — no procedural generation. Environmental
storytelling is central.

**Open-world dungeons** — no instances. WoW-Classic-style caves in the open world.

**Darkness & light** — certain areas (caves, tunnels between zones) are dark.
The tunnel between zone 1 and zone 2 serves as a natural tutorial for the role
concept (light aura forces a trade-off between light and damage; players can
support each other).

### Multiplayer

- Persistent shared world — everything visible, everything shared
- No formal groups in v1 — all combat participants receive XP
- No PvP initially (earliest 5 years out)
- **Players filling roles for each other is essential, not optional**, for all
  larger challenges (light support in tunnels, heal support at bosses, etc.)
- No griefing possible by design

### Numbers Are ALWAYS Placeholders

Every concrete number — max level, skill points at max, slot count, aura max
level, respec cost, drop rates, combination requirements, damage values, aura
radii — is a **placeholder** until explicitly marked as final.

Treat such numbers as examples for thinking, never as decisions made. When
numbers are relevant for an answer, ask first or propose concrete values for
discussion — never silently adopt them as set.

### Scope v1.0 (Must Have)

Accounts, aura system (base auras, cooldowns, first combinations), spellbook
with milestone and monster unlocks, progression (level, skill system, slots),
persistent world, 2–3 zones, mob types (normal/elite/boss), UI (resource bar,
XP bar, ability bar, aura panel, minimap, zone chat), campfire system, and
the **character-sacrifice loop** (moved *into* v1 by PO ruling 2026-07-19,
`plan-intermission-triage.md` item 10 / GDD §11 — it lands right after step 8
as persistence's first consumer).

~~Line-of-sight for auras~~ — **CUT 2026-07-10.** Auras pass through walls and
every environment object; props block movement, never effects. The `blocksAura`
flag was deleted 2026-07-11. See `gdd.md` §142/§163 and `roadmap.md` item 6.

### Not in v1.0

PvP, formal group system, economy, mobile, endgame raid events.

---

## Working Style

Work happens in two kinds of sessions:

- **Planning sessions** — a work item (an execution-order step) is designed plan-first and
  written up as a `docs/plan-*.md` doc: what changes and why, chunk breakdown, decisions,
  open questions, test strategy. No production code is written in a planning session.
- **Execution sessions** — a single chunk from an approved plan doc is implemented in its
  own chat, following that plan. Reference the plan doc + the chunk being implemented in
  explanations and commit messages.

Across both:

- **Plan before code, and pause between steps.** State the plan in plain text first for any
  non-trivial change (new file, new system, refactor, multi-file edit); don't silently chain
  multiple chunks in one session.
- **Propose options for design decisions** — don't commit to a direction unilaterally.
- **Never commit (or branch/push) autonomously** — only when explicitly asked.
- Treat the inherited physics, collision, and the WebSocket/FlatBuffers protocol as
  stable foundations. Extend, don't rewrite.
- When in doubt about game design intent, ask — don't infer from the codebase.

## Sanity checks after every step

Before declaring a step done:
- Run `go build ./...` from `backend/`
- Run the relevant `go test` for affected packages
- For anything with a runtime surface, verify in-game (plan docs record per-chunk in-game checklists)
- Report the output — don't claim "done" without these checks.
