# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- Pointer only. Keep this section to: last completed, what's next, open PO calls, open
     code-health findings, and standing locks/gotchas. FULL per-chunk ledgers live in the
     plan-*.md banners; the authoritative sequence + per-step outcomes live in roadmap.md
     "Execution order". Don't re-expand chunk ledgers or per-chunk placeholder values here —
     point to the plan doc. See the `chunk-wrap` skill for the collapse rule. -->

- **Last completed:** **rolling-filler batch — 4 independent bug fixes DONE** (2026-07-26, full ledger in `docs/plan-playtest-feedback.md` §Rolling-filler batch ledger) ✅ `dab4dae0` — **⏳ PO TEST PENDING** (headless-verified only; 4-point acceptance checklist at the top of the ledger). 6 files + 2 new. Picked up as independent work while rounds 3 and 4 both sat PO-test-pending; deliberately touches **no file either of those chunks touched**. ① **`DAMAGE <pct>` always killed** — `SubFraction()` is a fraction of `vitals.Max` (2^32−1), but player health has been absolute HP since item 11, so `DAMAGE 1` subtracted ~43 M HP; now a fraction of `p.MaxHealth()`, `dmgf` **clamped at 1** (an out-of-range float→`uint32` conversion is implementation-defined in Go). TDD 6 tests, 3 red on behaviour. ② **Floating numbers rendered in unlit darkness** — one guard at `showFloatingText`, the sole creator of every floating number. **⚑ It tests the ENTITY's position, not the label's**: the label spawns `size` px above the entity and the local player always carries a light (`MIN_SELF_LIGHT_PX = 40`), so testing the label position would sit right at that light's edge and make the player's own feedback flicker on geometry. Entity-position matches the `Mobs.updatePlate` precedent and gives the defensible rule — **own numbers always render, numbers over unlit mobs don't**. This overturned the first cut, which suppressed the player's own numbers too. ③ **Minimap reset on death** — not a logic bug, `CLEAR_MINIMAP_ON_DEATH` is Berryhunter inheritance (death ended the character there); flipped to `false`. **⚠ The flip alone would have shipped a new bug**: `miniMap.clear()` was the only thing that ever removed the **local player's own** icon (added in the `Player` ctor, not via the entity snapshot, so `newSnapshot`'s reconciliation never sees it) ⇒ a frozen dot at every death site plus a duplicate on respawn. `Player.remove()` now removes it. ④ **Ctrl +/− zoomed the browser** — matched on **`event.key`** not `keyCode` so main row + numpad work on any layout; **`Ctrl+0` deliberately still works** as an escape hatch, and browser zoom is only cancelable from `keydown` (wheel/menu can't be intercepted) ⇒ mitigation, not a lock. **⭐ Second use of the vitest infra**: `KeyboardManager.test.ts` 9 tests, confirming the jsdom choice generalizes past `SkillTooltip.ts`; verified genuinely red. Verified: `go build`/`vet` clean, `go test ./...` **exit 0, 27 pkgs**, guardrails `-count=2` clean, `npm test` 15/15, typecheck + build clean, boot `-content ../api` **0 errors 0 panics** (83 skills/14 factions/50 mobs/10 recipes/5 prop defs/1 milestone/777 props/471 spawns/5 campfires/14 npcs), headless via the new **`.claude/skills/verify/filler-batch.mjs`** — 3 consecutive clean runs, **plus a negative control** on the minimap fix (commenting the icon removal out reports **2 dots** after respawn, restoring it reports 1; `dead: []` passes either way and is *not* discriminating). **Harness notes, all pre-existing:** the **first console command after joining is dropped** (burn a `PING` first); **`WARP` is unusable before a screenshot** — it triggers the §20 render-interpolation crawl so the *rendered* position, which the minimap icon follows, lags many seconds (walk instead); the **`&develop` panel covers the minimap corner**; and **counting minimap icons needs pixels** — it is its own PixiJS `Application` with no global handle, so decode the element screenshot in-page and flood-fill the `0x00008B` blobs. Left out on purpose: the totem/companion tooltip filler item (it is in `SkillTooltip.ts`, the round-4 file). Noted not fixed: the `DAMAGE` cheat sets no `damageTaken`, so it shows no floating number.
- **Prior:** **playtest round-4 chunk — ability tooltips now scale with character level** ✅ `eaae2e69` 2026-07-26 — **⏳ PO TEST PENDING**; `/skills` serves `{curve, skills}`, `powerScaleAt` mirrors `curve.F`, `hpFmt` mirrors `vitals.HP`. **⚠ 1 unplanned PO-visible change:** HP lines read as whole points even at level 1 (an authored `6.3` shield reads `Shield: 6 HP`). **⭐ Brought the first JS test infra into the repo** (vitest + jsdom; landmines documented under Frontend tests below). Full ledger + acceptance checklist: `docs/plan-playtest-feedback.md` §Round-4 chunk ledger.
- **Prior:** **playtest round-3 chunk — healer combat state + role-as-loadout DONE** (2026-07-25) ✅ `03b152f4` — **⏳ PO TEST PENDING** (headless-verified only; 4-point acceptance checklist at the top of the ledger). 11 files. `Mob.InCombat()` returned exactly `aggroTarget != nil` — it *was* the bug; now + a damage-recency window reusing the player's `combatRegenGraceTicks` name AND value (§31 convergence). `healer.go` → `support.go`, the latched `seekHealer` type flag gone, roles derived from aura **categories**. **2 ⚠ still awaiting the PO's judgement tomorrow:** ① `RallyDrummer` carries `shield_aura`, so under the loadout rule it is a **pacifist** and no longer chases players; ② **every** mob now stops regenerating ~3.3 s after any hit, so hit-and-run whittling works on anything. Full ledger: `docs/plan-playtest-feedback.md` §Round-3 chunk ledger.
- **Prior:** **code-health triage session — 2 chunks DONE** (2026-07-24, ledgers in `docs/backlog.md` §30/§27.3.3 and §27.2.3/§25 B) ✅ `f095514a` + `2ec03ee7` — `layers.placeables` vestige prune + `tickInterval` hard-fail, and 3 hardcoded Go constants → conf knobs with no behaviour change (`game.mob.healthGainTick` + a new `game.combat` block; ⚠ **authoring 0 restores the default, it does not disable** — open PO question). Spun off **new backlog §31**.
- **Prior:** §28 item-system removal **COMPLETE** — Chunk 3 wire-enum prune ✅ `8ed4ff4c` (explicit permanently-pinned enum values ⇒ no future removal can renumber a survivor; new `NpcPlaceholder` art; a PO-requested plan audit caught a self-deleting dev-only class being shipped as the NPC fallback sprite), Chunk 2 frontend scaffolding ✅ `2f933634`, Chunk 1 backend registry ✅ `b9d01d33`, all 2026-07-24 and PO-verified. EntityType name-fallback validation §27.2.1 ✅ `c3938be7`. Full ledgers: `docs/archive/plan-item-system-removal.md §13`, `docs/archive/plan-entitytype-validation.md`.
- **Recent chunks (newest first; full ledgers in the plan docs):** dead resource+placeable+decay prune §26 FULLY DONE ✅ `ee9d42e9`+`a2ab90b5` (Chunks 1+2 — emptied the item registry to `None` ⇒ §28 removal now trivial; Chunk 2 also fixed a Chunk-1 frontend-build regression — **rebuild frontend AND backend after content deletions**; `plan-resource-decay-prune.md`); render-jitter buffered-interp fix ✅ `0e504c22`/`8a29a75c`/`c5064732` (`plan-render-jitter.md`); input-jitter held-state fix ✅ `cb7f011f` (`plan-input-jitter.md`); unlock source attribution ✅ `2bfee286` (`plan-unlock-attribution.md`); idle-loop alloc fix ✅ `fe0044d0` + day/night DEACTIVATED ✅ `e648ab88` (`plan-intermission-triage.md`); playtest-1 Passes A/B/C ✅ — **plan fully executed** (`plan-playtest1-feedback.md`); F&F deploy LIVE ✅ `a7a2267d` → `https://aura-game.duckdns.org/` (`plan-playtest-deploy.md`); content pass C1–C8 + rebrand step 7 complete. Earlier chunks: roadmap.md "Execution order" + the plan-*.md §13 banners.
- **Next: PO in-game verification of ALL THREE pending chunks in one session** — rounds 3 and 4 and the rolling-filler batch are all ⏳ PO-test-pending and mutually independent; each has a numbered acceptance checklist at the top of its ledger in `docs/plan-playtest-feedback.md`. **Round 3:** beat on a lone healer and confirm it now dies; disengage and confirm it still heals back to full; judge whether `RallyDrummer` no longer chasing players reads correctly; summon `FieldMedics`/`HoldTheLine` and confirm they support instead of chasing. **Round 4:** hover an ability at character level 1, `XP 99999999` to 30, hover again — Rejuvenation must go `4 → 6` ⇒ `107 → 160`; confirm the number matches the heal actually landing; confirm radius/crit/variance did NOT move; and sanity-check that the new whole-point rounding reads acceptably. **Rolling filler:** `DAMAGE 25` takes a quarter of the bar and leaves you alive; die and respawn with the explored minimap intact and **exactly one** player dot; `Ctrl+−` no longer zooms while **`Ctrl+0` still resets**; in unlit darkness, damage numbers over mobs are gone but **your own still show**. **After that: step 8 (see below).** PO decisions on record: round-3 2026-07-25 — no universal auto-attack (parked in §31), support set = Heal+Shield, pacifist healers ignore their attacker, survivors-like fork **CLOSED — stays MMO-lite**; round-4 2026-07-25 — tooltips show **absolute numbers**, and 2026-07-26 — add a real JS test runner rather than skip the frontend guard.
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

This applies to backend Go code (`go test ./...`) primarily, and to the
frontend's pure logic modules where a runner now exists (`npm test`, see
Frontend tests). For exploratory prototype work or UI tweaks, strict TDD may be
relaxed — but any non-trivial game logic (aura calculations, combination
resolution, damage application) should have tests before or alongside the
implementation.

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

### Frontend tests

```bash
cd frontend && npm test          # vitest run
npm run typecheck                # tsc --noEmit
```

Vitest (added with the round-4 tooltip fix) covers the pure, DOM-free logic
modules — currently `SkillTooltip.ts`. Three things to know before adding a test:

- **The environment is `jsdom`, not `node`** (`vitest.config.ts`). The client's
  module graph reaches `window` at *import* time — `Urls.ts` derives the catalog
  host from `window.location`, PixiJS wants a document — so even a pure
  formatting unit needs a browser-shaped global.
- **`vitest.setup.ts` stubs `fetch`.** `Skills.ts` and `Mobs.ts` fetch their
  catalogs on import; without the stub a unit test does real DNS. The stub
  rejects, which is the degrade path those modules are designed to survive.
- **Import `{describe, it, expect}` explicitly** — globals are deliberately off
  so `tsconfig.json`'s `types` array stays untouched. (`skipLibCheck: true` is
  on there because vitest's own `.d.ts` files use private identifiers that tsc
  otherwise reports against the app's `es5` target.)

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
