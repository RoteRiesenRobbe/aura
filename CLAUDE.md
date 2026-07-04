# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Migration Status

- **Last completed:** **Phase 9 (aura combinations) COMPLETE — tested in-game + committed** (see docs/skill-system-design.md → Phase 9). Curated, secret, backend-only recipe system: `api/recipes/*.json` loaded via `skills.RecipesFromFS` (result/ingredient names resolved against the skill registry; hard-fail validation — unknown names, level `<1`/`>maxLevel`, empty ingredients, duplicate recipe IDs). `skills.ApplyRecipes(sc, recipes)` is a monotonic-cascade evaluator: discovers every result whose ingredients are all simultaneously at **≥** their level (pure threshold, nothing consumed), cascading until fixpoint; idempotent + cycle-safe (skips already-discovered results); no-op for mobs (nil spellbook). Player carries the registry (`p.recipes`, from `GameConfig.Recipes`); single seam `player.ApplyRecipeCascade()` is called at the three trigger sites — milestone unlock, mob kill-drop, and EquipSystem point **raise** (not unspend). **No wire footprint** — clients see combo results through the normal spellbook stream + existing 3.7 unlock glow. **First content: PaladinAura** (skill ID 30, `api/skills/paladin-aura.json`) unlocked by `DamageAura L5 + HealAura L5` — a **two-effect** aura (damage nearest enemy @ interval 20, heal lowest-HP ally @ interval 60), values a constant **70% of the base auras at every level** (dmg 0.126/+0.028, heal 0.042/+0.021, no heal self-cost — all **[PLACEHOLDER]**). **Required a tick-cadence fix:** `sys/skills.go` now uses a monotonic accumulator + per-effect `acc % interval == 0` (equip/`SetActiveAura` reset to 0), so a multi-effect aura runs each effect on its own cadence — replacing the old shared-max-interval reset that (latent bug) re-fired a short-interval effect every tick. Frontend: `Skills.ts` ID-30 entry + `PALADIN_AURA_SKILL_ID`; PaladinAura shows **both** aura rings (`Character.setActiveSkill`). **Prior — v1-roadmap item 11 (aura targeting) COMPLETE:** Steps 1–3 as before (selector/cap machinery in `sys/targeting.go`; base auras single-target; floating damage/heal/XP numbers). **Step 4 — per-tick hit VFX (slash vs fire):** SkillSystem stamps an aura-hit style on each struck damage-aura target via `model.AuraHitNotifier.NoteAuraHit(style)` (separate from the `takeDamage` number recording); transient `aura_hit_style:ubyte` wire field on `Mob`/`Character` (0 none / 1 slash / 2 fire), reset on the `TickAccumulators` lifecycle. Style from `sys.auraHitStyleFor`: **per-effect `hitStyle` JSON override** (`slash`/`fire`/`none`) wins, else `auto` derives from cadence (interval ≥ `auraSlashTickThreshold` **[PLACEHOLDER 15]** → slash). Frontend `GameObject.showAuraHit` — single-instance sprite refreshed per hit tick: fast → sustained fire cluster over the avatar, slow → discrete slash streak sweeping across the model. **Replaced/removed the old `DamagedAmbient` white-flash** on mobs + characters. **Step 5** tick-interval verified. **Content compensation:** base auras retuned so slower ticks keep DPS/HPS (DamageAura int 20, MammothAura 20, HealAura 60/2s, DodoAura 24/0.8s, SaberToothCatAura 10/0.33s — all **[PLACEHOLDER]**); overhead health bars moved **below** the avatar (mobs + player in-world bar; HUD bar unchanged). **Prior:** Phase 8 complete (13 skills, 4 milestones); Block 2 survival removal complete.
- **Next:** **Phase 9 done → the skill system (Phases 1–9) is now complete.** Next is **item 12 (initial content pass — prototype gate)** and/or the deferred HP/resistance/variance work. More recipe content is now a pure `api/recipes/` + `api/skills/` JSON edit (no code). **Deferred from item 11 (documented, NOT scheduled):** a real absolute-HP system (per-mob settable max HP so overhead numbers are exact/consistent instead of the `HEALTH_DISPLAY_SCALE≈1000` placeholder), damage types + resistances, and stat variance / damage ranges (mobs of a type spawn within an HP range; abilities roll damage X–Z) — full requirements, open questions, and rough cost in **docs/v1-roadmap.md item 11 → "Deferred from item 11 — HP system, resistances, stat variance/ranges"**. Sequence when picked up: HP units → resistances/types → variance. **Block 2 COMPLETE** (survival removal, roadmap items 1+2 ✓) — see docs/block2-resource-and-survival-removal.md.
- **Current state:** new players start with DamageAura in slot 0 on spawn, server-authoritative from spawn. **Base auras are single-target (item 11):** DamageAura/WildAura hit the nearest one mob per tick; HealAura heals the lowest-%-HP ally; NovaBurst/boss stomp remain AoE-all. Floating damage/heal/XP numbers render over mobs + players. Damage auras stamp a per-hit VFX (slash for slow ticks, fire for fast — per-effect `hitStyle` override or cadence default); the old white damage flash is gone. Overhead health bars sit **below** the avatar (mobs + player in-world bar; the bottom-right HUD bar is separate). Unlock sources live: milestones (HealAura+Heal L2, SwiftPassive L3, NovaBurst L4), kill drops (WildAura: SaberToothCat 20%/boss 100%; SlowAura: Mammoth 20%; ToughPassive: Dodo 5%). Skill points: earned per player level, spent/refunded freely in the spellbook panel, equipped skills scale live. All combat participants (incl. healers, ~10s window) get full XP on mob death. `XP <amount>` cheat for manual leveling. **Combinations (Phase 9) live:** maxing `DamageAura + HealAura` (L5 each) secretly unlocks **PaladinAura** (damage+heal two-effect aura); recipes are curated/secret/backend-only, discovered by hitting ingredient-level thresholds.
- **Deferred tech debt / known bugs:**
  - **FIXED — respawn now retains level + spellbook:** on death `sys/state.go` stashes both the progression *and* the whole `SkillComponent` (spellbook + loadout + active aura) keyed by client UUID (`carriedState`); re-join restores both via `SetProgression` + `SetSkillComponent`. Semi-permadeath removed except the existing partial-XP-within-level loss (`LoseCurrentLevelExperience` kept, by design). Pinned by `TestDeathRespawn_RetainsSpellbookAndProgression`.
  - Mob aura ring size is a frontend constant (`GraphicsConfig.mobs.*.damageAuraRadiusMeters`) duplicating the skill's effective radius — sync manually until mob radii are wire-driven (pressing once boss scripts switch auras).
  - `backend/pkg/berryhunter/net/net_test.go` — not a real test; a manual `ListenAndServe` script with no timeout/teardown that hangs `go test ./...`. Fix later via `t.Skip`.
  - **FIXED — equip level=1 gap:** the spellbook stores per-skill levels (`map[SkillID]int`) and `EquipSystem` equips at the stored level (Phase 7).
  - Frontend `Skills.ts` hardcodes skill ID → name, maxLevel *and* category, duplicating the backend registry — sync manually when skills change; revisit (wire or generated file) when the skill list grows.
  - **Dead character-variant code — remove.** `Graphics.ts` lists a single `player.svg`, so `Character.variants`/`pickVariant()`/the `hashCode(name)` selection are a no-op (`% 1`), and the ~13 `assets/characters/*.svg` are unreferenced. Old Berryhunter system, no longer used — all players render one knight portrait. Remove when building the new avatar selector (v1-roadmap item 8).
  - **Terrain "blue bleed" — background shows through the tiles (pre-existing Berryhunter rendering bug, observed 2026-07-05):** after some play time, with no clear trigger, the **lower and right edges** of the viewport turn a flat blue — the color of the layer *under* the tile map (the PixiJS stage/canvas background or a clear color), i.e. the ground tiles stop covering those regions. Almost certainly an **older Berryhunter issue**, unrelated to the Phase 9 / skill-system work (nothing in the aura path touches tile rendering). Likely a tilemap culling / viewport-extent bug: as the camera pans, the tiled ground layer isn't extended/re-tiled to fill the new edges (off-by-one in the visible-tile range, or the tile container not resized on viewport/zoom change), exposing the background. Suspects (frontend): the map/ground rendering under `frontend/src/features/` (tile grid build + camera follow), and any `renderer.backgroundColor`/stage clear. Repro is time/movement-dependent; not yet pinned. Low priority (cosmetic), but track it. See the attached screenshot in the 2026-07-05 session.
  - **Movement micro-stutter every ~30 s (pre-existing, noticed 2026-07-04):** while walking, the character is set back one tick's distance against the walk direction, exactly periodic (~30 s), scaling with movement speed (more visible with SwiftPassive). Diagnosis: input-starvation beat — the client sends inputs on its own 33 ms JS timer (`Tock`, `INPUT_TICKRATE`) while the server consumes one input per 33 ms Go tick; ~0.1% clock drift starves the server of an input once per ~30 s → one tick without movement. Verify by counting server ticks with an empty input queue while a key is held. Fix candidates: (a) server holds the last movement input for 1–2 ticks when the queue is empty (simplest, KISS), (b) client sends input on GameState receipt instead of a free-running timer (kills the beat structurally), (c) full client prediction + reconciliation (overkill for now). Own session; not related to the skill system.
  - Frontend FlatBuffers toolchain migrated to flatc v24.3.25 in a dedicated commit.
  - `-2` `active_aura_slot` deactivate sentinel is a workaround for FlatBuffers omitting the `-1` default (an explicit `-1` is indistinguishable from an absent field). Decided in Phase 5: it stays. Paired constants: `model.ActiveAuraSlotDeactivate` (Go) / `DEACTIVATE_AURA_SLOT` (InputMessage.ts).
  - ⚠️ Testing gotcha: `go:embed` patterns don't include subdirectories (`*.json **/*.json`!), and disk-based registry tests can't catch embed gaps — pinned by `pkg/api/skills/skills_test.go`. Before manual tests: `pkill berryhunterd`, rebuild, and check the boot log (`Loaded skill definitions count=13` as of the Phase 8.2 content batch) — a stale server process silently masks new behavior.
  - **FIXED — `KILL` cheat no longer killed (found + fixed 2026-07-04, Block 2 testing):** one-shot zeroing of `Health` was reverted before death was detected. `KILL` sets `Health = 0` in `CommandSystem` (prio −50); `UpdateSystem` (also −50, runs after) regenerated any `Health != Max` via `updateVitalSigns`, bumping it to a tiny positive value the same tick, before `ConnectionStateSystem` (prio 10, `sys/state.go`) checked `Health == 0` next tick. **Fix:** `updateVitalSigns` now regenerates only when `0 < Health < Max` (0 = dead, no revive). Pinned by `TestUpdateVitalSigns_DeadPlayerDoesNotRegenerate`.
- Full plan: docs/skill-system-design.md (skill system, Phases 1–9)
- v1.0 scope outside the skill system: docs/v1-roadmap.md (skeleton) — incl. item 7 boss-encounter feasibility audit, item 11 deferred HP/resist/damage-tag work
- Block 2 (items 1+2) execution plan + status: docs/block2-resource-and-survival-removal.md
- Runtime cost model, scaling limits, zones-as-Spaces & fluid transitions, hazard/encounter runtime cost: docs/architecture-and-scaling.md


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

**Berryhunter** (repo name: aurahunter) is a multiplayer browser survival game. Players gather resources, craft items, manage vitals (health, satiety, temperature), and fight mobs. The repo has three main parts:

- `backend/` — Go game server (`berryhunterd`)
- `frontend/` — TypeScript/webpack browser client using PixiJS
- `api/` — Shared FlatBuffers schemas and JSON item/mob definitions

## Build & Run

### Backend (Go ≥ 1.22)

```bash
# One-time: copy config
cp backend/conf.local-windows.json backend/conf.json   # Windows
# or use backend/conf.default.json as a template

# Build
make -C backend build          # produces backend/berryhunterd

# Run (dev mode serves static frontend too)
cd backend && ./berryhunterd -dev

# Run without build (go run)
make -C backend dev
```

> **Gotcha:** after backend logic changes, rebuild the binary with `make -C backend build`.
> `go build ./...` compiles/type-checks packages but does **not** refresh `./berryhunterd`,
> so a running `-dev` server keeps executing stale code.

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

> **Warning:** `go test ./...` hangs — `backend/pkg/berryhunter/net/net_test.go` is a manual `ListenAndServe` script, not a real test (no timeout or teardown). Use the safe scope:

```bash
cd backend && go test -timeout 30s ./pkg/berryhunter/skills/... ./pkg/berryhunter/codec/... ./pkg/berryhunter/sys/...
```

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

- `backend/cmd/berryhunterd/` — entrypoint; wires config, game, HTTP server
- `backend/pkg/berryhunter/core/` — `game.go` constructs the ECS world and registers all systems; `Loop()` ticks at ~30 FPS (33 ms/tick)
- `backend/pkg/berryhunter/sys/` — ECS systems: physics, mob AI, day/night cycle, decay, respawn, scoreboard, status effects, heater
- `backend/pkg/berryhunter/model/` — interfaces and concrete types for entities (player, mob, resource, placeable, spectator)
- `backend/pkg/berryhunter/items/` — item and mob definitions loaded from `api/items/` and `api/mobs/` JSON files at startup
- `backend/pkg/berryhunter/codec/` — FlatBuffers encode/decode for the WebSocket protocol
- `backend/pkg/berryhunter/phy/` — 2D physics (circle/AABB collision, spatial hashing)
- `backend/pkg/chieftain/` — separate HTTP service for scoreboard persistence (SQLite + optional GCP Pub/Sub)

**Adding a new system:** implement `ecs.System`, register it in `core/game.go:NewGameWith()`, and add entity registration cases in the relevant `addXxx()` methods.

**Adding a new entity type:** implement the appropriate `model.*Entity` interface, update `game.AddEntity()`, and register in all relevant systems.

### Communication Protocol (FlatBuffers over WebSocket)

Schemas live in `api/schema/`:
- `client.fbs` — client→server: `Input`, `Join`, `Cheat`, `ChatMessage`
- `server.fbs` — server→client: `GameState`, `Welcome`, `Scoreboard`, `Obituary`, etc.
- `common.fbs` — shared types (`Vec2f`, `ActionType`, `AuraType`)

After editing `.fbs` files, regenerate bindings for both backend and frontend.

### Game Configuration (conf.json)

All numerical tuning lives in `backend/conf.json` (or `conf.default.json` for reference). The `game.player` block controls movement speed, aura radii, vital-sign drain/gain rates, and level-up scaling. Changes take effect on restart.

### Item / Mob Data (JSON)

`api/items/` and `api/mobs/` contain JSON definitions. The `make -C backend cp-defs` target copies them into `backend/pkg/api/` so the Go build embeds them. Run this (or just `make -C backend build`) after editing any JSON definition.

### Frontend

The frontend is structured as feature modules under `frontend/src/features/`:
- `backend/` — WebSocket connection, FlatBuffers deserialization, entity snapshot management
- `core/` — game loop, entity manager
- `player/`, `vital-signs/` — local player state and HUD
- `game-objects/` — rendering entities (resources, mobs, placeables) via PixiJS
- `input-system/`, `controls/` — keyboard/mouse/touch input
- `internal-tools/` — dev panel, console, overlay tester (only active with `?develop`)

**HUD event handling:** Use `pointerdown` (not `click`) for all interactive HUD panels. `MouseManager` (`input-system/logic/mouse/MouseManager.ts`) registers a `mousedown` listener on `document.documentElement` with `event.preventDefault()`, which suppresses the synthetic `click` event. `pointerdown` fires before this and is unaffected. `click` listeners on HUD panels silently never fire — this is not obvious from the source.

Webpack configs: `webpack.common.js` (shared), `webpack.dev.js` (HMR, port 2001), `webpack.prod.js` (minified output).

## Aurahunter Project Context

This fork is being transformed into **"Aura"** — a top-down MMO. The Berryhunter
survival systems (vitals, crafting, temperature, hunger) will be removed or
heavily reduced. The core loop revolves around the aura system described below.

The codebase still says "Berryhunter" in many places. That is expected. Do not
rename or refactor naming proactively — focus on building new systems on top of
the existing foundation.

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
XP bar, ability bar, aura panel, minimap, zone chat), line-of-sight for auras,
campfire system.

### Not in v1.0

PvP, formal group system, economy, mobile, endgame raid events, character sacrifice.

---

## Working Style

- **Always ask before modifying files or running commands.** Show the plan first.
- Keep changes small and confirm individually.
- For architectural decisions, propose options first — don't implement directly.
- Treat existing Berryhunter physics, collision, WebSocket/FlatBuffers protocol,
  and the chieftain scoreboard service as stable foundations. Extend, don't rewrite.
- When in doubt about game design intent, ask — don't infer from the codebase.


## Implementation Workflow

The skill system migration follows `docs/skill-system-design.md`. When working on
that migration, reference the phase and step you're implementing in commit
messages and explanations (e.g. "Phase 1.2: skill registry").

### Plan before code

For any non-trivial change (new file, new system, refactor, multi-file edit):

1. State the plan in plain text first — what files will change, what gets added,
   what the test strategy is.
2. Wait for confirmation before writing.
3. Then write the code.

This applies even when running with auto-edits enabled. Showing the plan is not
the same as asking permission for each file — it's about making the reasoning
visible so it can be corrected before code is written.

### Sanity checks after every step

After completing a step, before declaring it done:
- Run `go build ./...` from `backend/`
- Run relevant `go test` for affected packages
- Report the output

Don't claim "done" without these checks.
