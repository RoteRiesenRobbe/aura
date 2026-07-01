# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Migration Status

- **Last completed:** Legacy-aura-UI replacement — activate + Nothing state. The Aura Slots panel (`#auraLoadout`) now **activates/switches/deactivates** the active aura, not just equips: clicking an occupied slot activates it (sends `active_aura_slot`); clicking the active slot again deactivates to a server-authoritative **Nothing** state; optimistic client-side `.activeSlot` highlight. Backend: `active_aura_slot >= 0` switches, the `-2` wire sentinel deactivates (→ `SkillComponent.ActiveAuraSlot = -1`), `SkillSystem` ticks no aura at `-1`. Legacy `#auras` buttons still coexist.
- **Remaining plan for the spellbook chapter (Phase 3):**
  - 3.7 — unlock event over wire + glow/pulse animation on spellbook icon
  - *(3.6 equip UI was folded into 3.5)*
- **Legacy aura UI replacement (separate from 3.7):**
  - activate + optimistic highlight ✓
  - server-authoritative Nothing / deactivate (`-2` sentinel) ✓
  - **next (1b):** incoming server→client `active_aura_slot` field driving both panel highlight and on-character ring from spawn; retires `#auras` buttons, the `AuraType`=slot hack, and the deprecated `aura`/`activeAura` fields.
- **Current state:** new players start with DamageAura in slot 0 on spawn. HealAura unlocks into the spellbook at level 2; the player can equip it into any slot via the Aura Slots panel, and **activate/switch/deactivate** the active aura from that same panel. Known cosmetic gap: on spawn the server has DamageAura active (slot 0) but the panel shows no highlight (no incoming active-slot field yet); it aligns after the first switch/toggle. Closed by 1b. Legacy `#auras` buttons + `setActiveAura()` still coexist.
- **Deferred tech debt:**
  - Old `aura` wire field + old `applyDamageAura`/`applyHealAura` still present as dead code — Phase 5 cleanup.
  - `[SkillSystem] tick` debug log still fires in -dev — remove in Phase 5.
  - `backend/pkg/berryhunter/net/net_test.go` — not a real test; a manual `ListenAndServe` script with no timeout/teardown that hangs `go test ./...`. Fix later via `t.Skip`.
  - `sys/equip/equip.go` `RemovePlayer(equipEntity)` — dead code superseded by ECS `Remove(ecs.BasicEntity)`. Remove in a later cleanup.
  - Equip level=1 gap: `SkillComponent.Spellbook` is `map[SkillID]bool` (discovery only, no per-skill level), so `EquipSystem` always equips at level 1. Revisit when skill-leveling is implemented.
  - Frontend FlatBuffers toolchain migrated to flatc v24.3.25 in a dedicated commit.
  - `-2` `active_aura_slot` deactivate sentinel is a workaround for FlatBuffers omitting the `-1` default (making an explicit `-1` indistinguishable from an absent field); collapse onto `-1` if/when the schema default is changed and regenerated. Paired constants: `model.ActiveAuraSlotDeactivate` (Go) / `DEACTIVATE_AURA_SLOT` (InputMessage.ts).
- Full plan: docs/skill-system-design.md (skill system, Phases 1–9)
- v1.0 scope outside the skill system: docs/v1-roadmap.md (skeleton)


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
