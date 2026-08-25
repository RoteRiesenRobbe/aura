# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each ≤10 lines with a
     ledger pointer. When adding a new entry, move the oldest verbatim to
     docs/archive/status-history.md. FULL per-chunk ledgers live in the plan-*.md
     banners; the sequence lives in roadmap.md "Execution order". Never paste a full
     session banner here — see the `chunk-wrap` skill for the collapse rule. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: REGION PRIMITIVE C5 - SOFT BORDERS, THE BLEND BAND** ✅ 2026-08-25, `4937a977` (ledger: `docs/plan-region-primitive.md` §12 C5; rulings in §4.10 + decision log): a region's paint now ramps to zero across a band at its own edge - a blurred-silhouette alpha mask in a low-res RenderTexture, built per region in the ONE shared draw path, so world and full-map bake feather identically (§4.7). Ruled and executed same day: **D20** build now (D15 reopened by PO direction) · **D21** colour regions feather too, **D5 REVERSED** (`blend: 0` keeps a hard edge authorable per profile) · **D22** the authored line is the band's MIDDLE (symmetric, no inset - abutting borders crossfade instead of opening a base-fill gutter; the clean region-to-region border is authored by OVERLAP, D0's native idiom). `blend` is a per-profile key, all 16 at placeholder 1.5. ⭐ Finding: a masked polygon cannot feather OUTWARD (masked alpha = content x mask), so a feathered region paints a rect over the mask footprint. ⚑ Mask RTs are per-pass and OWNED - both callers free them; the tiles-landed repaint would otherwise leak VRAM. ⭐ §4.10's cost measurement ran (`c5-mask-cost.mjs`, kept): full-screen WORST case **1.07-1.09x** on a phone shape - live masks stand, the flatten is a named follow-up. ⚑ `c4-region-texture` leg 5 (world-vs-map edge parity) is **INCONCLUSIVE at HEAD by construction** (no interior edge exists in shipped content) - not a flake, it arms when a second region lands. ⚑ At blend 1.5 the PO sees almost nothing at HEAD: draw a second region in Tiled or bump a `blend` to judge; width + density await the look sitting. **Schema NONE.** Verified: vitest 515/515 (+10; the recorded 494 was stale, pre-chunk baseline 505) · tsc · prod build · `c1-world-map` 12/12. Built by an Opus 5 agent, reviewed line-by-line.
- **Prior: UI-PASS PHASE 0 - DESIGN LANGUAGE RATIFIED (docs-only)** ✅ 2026-08-25 (record: `docs/plan-ui-pass.md` §4 - the canvas link + the full ruling): the R2 mockup session ran. Fresh HEAD screenshots of every §2 surface + a clean-world backdrop went onto a four-board design canvas (baseline + three directions varying ONE axis: how much of the medallion's token materiality enters the HUD chrome). ⭐ **PO ratified direction C "Inked Panel"** (choice prompt): dark panels with thick irregular ink edges + thin wood inlay, wood header strips with gold small-caps, mini-token slots where the wooden rim marks the ACTIVE slot (the medallions' D12 rule applied to the HUD), ink-outlined bars, solid parchment glyphs in ink-ringed tokens; layout untouched, every shipped semantic hue kept. ⚑ C's prerequisite rides into Phase 1: ONE reusable ink-border treatment (border-image/9-slice) built before the panel chunks consume it. ⭐ Font RULED in follow-up the same day (`plan-ui-font.md` §6 banner): stone-age is OUT of the HUD, ONE readable neutral sans everywhere (boards render Inter as the Segoe-class stand-in); still open: the family pick (umlaut/ß screening), in-world Pixi text, the Capture Smallz logo. ⭐ Same-day §2 additions via `feedback.md`: the spellbook rework (openable/pagination/categories, tags separable), the layering & exclusivity policy (opaque on stacking), and the ability-bar consolidation - the ONE-bar icon shape PO-SETTLED on the added "C - Icon Bar" board ("yeah that works"). **Next concrete session: the Phase 1 chunking session.** Schema NONE, zero production code.
- **Prior: THE REGION PRIMITIVE - C1 + C2 + C3 + C4** ✅ 2026-08-25, C1 `c74292c3`, **C2 + C3 `97b27099`**, **C4 `4fd694fa`** (⚑ C4 has NO ledger entry yet — its commit message is its record, and a wrap is owed) (ledger: `docs/plan-region-primitive.md` §12, C2 + C3 in full there; ⚑ **C1 has no ledger entry**, its commit message is its record). A zone gains `regions: [...]`: polygons naming a client-side **profile**, drawn in Tiled off a generated `AuraProfile` dropdown. Ground colour is the first consumer; footsteps/music/atmosphere are later ones through ⭐ **ONE `resolve(property, point)`** - TOTAL by construction (D11): unknown profile, undeclared property, outside-everything all end at the shipped default, never `undefined` or silence. **D0**: the LAST containing region whose profile *declares* the property wins, so an inner blob is transparent to what it omits. ⭐ **D12 keeps paying**: the profile table is `frontend/src/client-data/profiles.json`, NOT `Theme.ts` - `generate-palette.mjs` is a Node script and cannot read `.ts`; ONE file the client imports and Tiled's enum is generated from, so adding a profile is a data edit. ⛔ NOT `api/zones/`: a second `.json` stem there hard-fails boot. ⭐ **All THREE zone-format whitelists are now pinned** (C2): the completeness pin derives its key set from BOTH writers over one fixture and asserts they emit the SAME set - the `spawn.level`/`prop.scale` silent deletion cannot recur. C3 ruled the look: **16 profiles, 8 families x 2** (D17) · **every profile ends up TEXTURED** (D18, so the colours are only D14's fallback + D11's default) · `Land` blobs **left alone** (D19, closes L11). ⭐ **A profile is a MATERIAL, not a PLACE** - many forests share `Forest` - so a profile name can never be a quest identity; §11's live fork is whether a quest area is ONE polygon or a NAMED AREA of several. ⚑ **Names are the only sticky part of `profiles.json`** - a rename means fixing every region naming it. ✅ Both human checks PASSED (PO): regions render in game, the dropdown renders in Tiled. ⏸ Colour tuning deferred ("much later"), blocks nothing. **Schema NONE at every layer.** Verified: vitest 494/494 · tsc · prod build · `go test -count=1 ./...` · `verify.sh` **9/9**.

### Next

- **⏸ Parked 2026-08-20 (PO choice, resume later): `plan-prototype-projectile.md`** - P1 + five PO-session-1 fixes shipped 2026-08-19; the SECOND in-game pass is OWED (§10 items 1, 2, 4, 5 + 13; setup `SKILL ThrowMine`/`ThrowBomb`, ⚑ test the cost with god OFF). Its verdict decides P2 (drift + travel-to-position) and P3 (mob thrower) or delete; item 7 ANSWERED (aim stays walk-direction). **In flight instead: `plan-play-bot.md`** (C0-C3; immune feedback shipped 2026-08-24, `9fb3859d` - entry now in `docs/archive/status-history.md`). ⏸ `plan-npc-hails.md` + `plan-mob-voicelines.md` DEFERRED 2026-08-24 (PO): only if play-feel asks. ⚑ Unowned leftovers ride in the plan docs: `TICKING_TYPES` silent-failure set (SkillTooltip.ts) · zone-editor C3's dead Go legacy plumbing + broken `wiki-generator/` · the stale `backend/pkg/api/mobs/` report (re-verify on the finder's checkout).

- **⭐ DIRECTION SET 2026-08-22: the next map is the FIRST RELEASE MAP, and CAMPS ARE CONTENT** (`docs/plan-release-map.md` - the authoritative record, incl. the two engine rules constraining every camp file; nothing built, the map owes its own planning session - §7: execution-order slot + does-it-replace-world.json PO calls). Membership = a completed quest, exclusivity = `quest_at_stage` gates; the whole Gothic arc is authorable in shipped vocabulary - **no new vocab, no Go, schema NONE**. ⏸ `plan-camps.md` DEFERRED not cancelled (⛑ moving the quest ledger off `character_id` would kill the free post-ascension reroll). ⛔ `plan-test-world.md` DROPPED (its §1 bounds + densities survive). §8/D6's mechanism lives in `docs/plan-region-primitive.md`.

- **⭐ REGION PRIMITIVE: C1-C5 ALL SHIPPED** (C5 `4937a977`, ledger §12; audio consumers unscheduled, `plan-region-audio.md`; `docs/plan-region-primitive.md` stays live for the look sitting). ⚑ Standing landmines from C4/C5: `regionPaint` owns D14's fallback **within one profile** (never a chain of `resolve()` calls) · both draw sites go through ONE `paintRegions` (§4.7 is not optional, and since C5 it takes the renderer) · ⛔ never SVG tiles (webpack inlines them INTO the bundle) · ⛔ never `GroundTextureTypes` (preloads at import, blocks boot) · ⛔ never `registerGameObjectSVG` (crops rasters) · ⚑ C5 mask RenderTextures are per-pass and OWNED - a repaint that drops them leaks VRAM · ⚑ `blend: 0` is a VALID authored value (do not "fix" `parseBlend` to match `parseScale`). ⚑ **D18's `tint` fork stays available** for a darker-variation without a second file (Ashen Fields and Volcano share a tile today). ⏸ **The look sitting is OPEN and now owns MORE knobs**: texture picks, the 0.35 scale, the seam, the blend width (placeholder 1.5 everywhere) + mask density - and `Forest`/`Ice` author no tile. ⚑ At HEAD no interior seam exists, so the band is nearly invisible until a second region is drawn; `c4-region-texture` leg 5 is INCONCLUSIVE by construction until then. The flatten-once variant is a named follow-up (`c5-mask-cost.mjs` is its re-measure; worst case measured 1.07-1.09x). Schema NONE throughout; no zone-file field changed since C1.

- **CC watch items ride forward** (`docs/archive/plan-cc-and-retaliation.md`), none a chunk: can a mob stun a *player*? (`plan-skill-vocab` §3.1) · CC immunity is silent in-game (⭐ since `9fb3859d` the "Immune"-label rails exist - the follow-up needs only its own signal, no damage path runs on a refused stun) · a stun is wire-indistinguishable from a slow (§39 dependency) · ⚑ confirm D10's Paralyze-on-GiantSpider ("the elite spiders" - no elite-tier spider exists).

- **Mob/XP tuning threads, unowned** (archived: `plan-xp-formula.md`, `plan-world-replacement.md`): per-species feel tuning (speed/xpFactor cheap; **HP/damage re-price every placement**, cost table in the archived banner) · levels 21–30 standing gap (D5) · the §12.2 rising-absolute-award note.

- **⭐ backlog §52 - leaving the world without a reload, PO-asked 2026-08-11.** Owned by **`docs/plan-leaving-the-world.md`** (designed 2026-08-04, nothing built; ⚑ line refs pinned to `1ac8078e`, re-verify first). Every exit is a page reload: the client boots once, no teardown path; shape **(B)** reset-not-teardown needs no server change, plausibly one chunk; shape (A)'s offender ranking: `plan-code-health.md` §Ownership. **backlog §48** is blocked on this.

- ⚑ **Step 8a closed WITHOUT backups, deliberately** (PO 2026-08-04): the live DB is **losable**; **C3's memorial is the named revisit trigger**. The security items (firewall, DB to localhost, credentials, non-root deploy) were never part of the ruling and are still owed: `plan-playtest-deploy.md` §Ops & security posture.

### Open items

- **Feedback flow + the UI pass:** new feedback lands ONLY in **`docs/feedback.md`** (dated rows, four exit doors; plan docs never double as intake - contract in its header, pipeline note in `docs/README.md`). **All UI work is consolidated in `docs/plan-ui-pass.md`** - roadmap set 2026-08-25 (§4, rulings R1-R3); ⭐ Phase 0 ran same day, **direction C "Inked Panel" RATIFIED** (canvas link in §4); **next session: the Phase 1 chunking session** (first build item: the reusable ink-border treatment). The 2026-08-24 restructuring archived `plan-playtest-feedback` · `plan-intermission-triage` · `plan-numbers-rewrite` · `plan-ui-polish` (open items redistributed; the July feel-checks DISCHARGED by PO ruling). ⏸ `plan-onboarding-cleanup.md` DEFERRED, trigger: a human coworker is actually about to join.
- **Omni trio PO in-game check still pending** (`9ee8cdb4`, 2026-08-18, cheat-only test rigs OmniAura/OmniPassive/OmniStrike; entry now in `docs/archive/status-history.md`) - low stakes, the one-off `omni-smoke` 17/17 already covered the surfaces headlessly.
- **Smaller open threads:** §47 stale "Connection lost" banner in a second window · §51 transient second queue entry · a character-name **content** filter (spam passes the charset guard) · mobile perf ceiling, PO: "works for now" (cheapest next: `MOBILE_MAX_RESOLUTION` 1.5; the minimap is a second per-frame GL context).
- **Still outside any shipped chunk:** avatar/faction defaults (blocked on `plan-avatar-system.md`) · the password-reset plan's own five questions.
- **Ascension's leftovers** (`docs/archive/plan-ascension.md` §8): lore + environment art for both stones · channel/hunt-gate numbers [PLACEHOLDER] · the deferred cluster revivable whole · ⚑ the ceremony's effect is visible **only to its own player** (D29) - a shared moment is a wire field, a **§39** conversation.
- **Known-inconclusive** - three harnesses and one Go test red or flaky **at HEAD**, none from recent work: `chunk3-charm.mjs` 6–8/9 (accepted D9 fragility) · `filler-batch.mjs` leg 1 (stale assertion) · `chunk3b-ii-conversation.mjs` 28/34 (leg 67 stale TownCrier assert, fixable; rest = Leave-click race + Wanderer drift-pin) · `accounts.TestRepeatedFailuresAreThrottled` red under `-race` ONLY (timing asserts; green without at HEAD) · **`AuraTiledConvert.test.ts` byte-stability ×2 red on a fresh checkout since the merge of `c1c2a398`** - they pin the PO's world.json repair/zeroing, which stays UNCOMMITTED by PO choice (the prop-transform entry); green on the checkout holding that working tree. All unowned. ⚑ **Measure the rate before diagnosing a flake** - misreading one cost `chunk3b-interact` two chunks of false diagnosis.
- **Backlog watch items** (`docs/backlog.md`): §25 D+E · §27.2.4–7 (⚑ §27.2.6 needs re-surveying) · §29 lost-WebGL-context trigger unknown · §37 skill-level/augment rework · §39 entity-presentation rework, since 2026-08-24 owned by `docs/plan-entity-presentation.md` (PO-ruled order: medallions first; no per-effect overlay art before it) · §34 hard collision · ~~§58 terrain select/move/rotate~~ **ANSWERED 2026-08-23 by Tiled** (`docs/archive/plan-tiled-authoring.md`; the in-game editor deliberately unchanged; ⚑ not closed until the PO has moved a real texture in Tiled) · round-6 item 4 target stickiness (re-opens on measured cost) · ⚑ **§57 attack-attribution lines: PROTOTYPE PO-played, deliberately NOT merged** (`prototype/attack-lines` `cf305284`; weakest exactly where it fires - a shipped version is a §39 consumer).
- **Open PO calls:** three - the portal pair's COST (`plan-portal-spells.md` §10 item 13; cheat-only until an unlock path is placed) · does a QUEST turn-in row advertise the ability it pays? · should FireShield's flat reflect scale? (3 HP at L1 = 3 HP at L30 by the C2 raw-damage ruling; `content-passives.md`). Replacement art + domain parked until v1; wiki generator kept.

- **Standing locks & gotchas:** **NO CI BY CHOICE** (PO 2026-08-12; revisit at roadmap step 9) - the per-chunk local verify tail is the gate. Growth **1.12 × maxLevel 30**; regen **0.00033 ≈1%/s × taper 1.0→0.4** FINAL; §11 no-pity + campfire **0.12** + heal cost **2 % of max HP** FINAL; **the base damage aura stays FREE at every resource level** (round-6 ruling, GDD §3); drop + milestone tables TUNING-OPEN (Damage@L1 · Discipline@L5 · Haste@L7); density = mob visible per ⅔-screen window; downtime 10 s + chain 20; guardrail asserts in `cmd/simharness/guardrail_test.go`. New mobs **must** author tier + baseline (raw `maxHealth` hard-fails) and price XP with `factors.xpFactor` (absent → 1, `0` = pays nothing AND no nameplate, fractions only for harvest outliers, **no species authors 0.5**); tier ≥ elite **must** author `factors.ccImmune`. Day/night cycle **OFF** (`DAY_CYCLE_PRESENTATION_ENABLED=false`; don't re-enable without collapsing the ~25 per-layer filter passes). **A shape removed from `phy.Space` is purged from every other shape's collision set on the spot** (§54) - never "optimize" that sweep away; one stale read re-latches a removed entity forever ([[project-ghost-references]]). ⚑ **A content edit does NOT invalidate the Go test cache** - after any `api/` change use `go test -count=1`. ⚑ **The starting aura is pre-equipped but NOT active** - the first press of `1` switches it on. **Dev cheats:** GOD, WARP `<x·120> <y·120>`, SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST (dump / `ACCEPT` / `ABANDON` / `ADVANCE`). `make -C backend build` runs `cp-defs`; boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

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

`docs/README.md` is the docs index — it holds the naming convention, the feedback pipeline (raw feedback → `docs/feedback.md` → plan doc / ruling / backlog watch / dropped; plan docs never double as intake) and the four-layer status model (this file = current state · `roadmap.md` "Execution order" = sequence · `plan-*.md` §13 banners = per-chunk ledgers · `MEMORY.md` = cross-session index).

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

### Local database — required for EVERY boot

`aurad` **refuses to boot** without `AURA_DB_URL`, and panics without `AURA_JWT_KEY` (step 8a
chunk 1c). That includes headless harness runs. One-time setup:

```bash
make -C backend db-up                                   # Docker Postgres, named volume, both DBs
cp backend/.env.local.example backend/.env.local        # then put a real random key in it
```

`scripts/dev-restart.sh` sources `backend/.env.local` automatically (an already-exported value
still wins), so a plain restart works in any shell. `backend/.env.local` is **gitignored** —
credentials never live in the repo.

**Two databases on one server, and the split is load-bearing:**

| Database | Role |
| --- | --- |
| `aura` | durable dev data — characters survive restarts and container removal |
| `aura_test` | **disposable** — `AURA_TEST_DB_URL` points here |

> ⛔ **Never point `AURA_TEST_DB_URL` at `aura`.** Every DB-touching test calls `store.Rollback`,
> which drops the whole `game` schema, before *and* after itself. Aimed at the dev database it
> deletes every account and character silently — the run still goes green. Use
> `make -C backend db-test`, which aims correctly.

Targets: `db-up` · `db-down` · `db-shell` · `db-test` (store + accounts vs `aura_test`) ·
`db-reset` (recreates `aura_test` empty; never touches `aura`).

⚑ **The dev database now accumulates residue.** Playwright verify runs leave `hrnss_*` characters
behind, which used to die with the throwaway container. `backend/cmd/harnessdb -cleanup` clears
them — but **stop `aurad` first**: it holds live sessions the DELETE never reaches, and cleaning up
under a running server has already corrupted save games once.

⚑ **Dump before any migration test against real data**, and stop `aurad` first so it flushes
(`💾 flushed N live character(s) for shutdown`):
`docker exec aura-dev-db pg_dump -U aura -d aura --clean --if-exists > /tmp/aura-dev-backup.sql`.
Full runbook: `docs/manual-db-migrations.md` §4.

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

> ⚑ **`-race` needs `export PATH="/c/msys64/mingw64/bin:$PATH"` first** (Windows +
> MSYS2). `gcc` is found through the MSYS alias `/mingw64/bin`, but the Windows
> loader starting the spawned `cc1.exe` is not, so cc1 exits **127 with empty
> stderr** and you get a bare `cgo.exe: exit status 2` → `[build failed]` naming
> nothing. `ldd` reports every dependency resolved, because it resolves through
> the same alias — so it actively misleads here. Without the prefix it looks
> like a broken toolchain; it is a PATH translation.

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

All authored content lives under `api/` in eight directories — `mobs/`, `skills/`, `recipes/`, `zones/`, `props/`, `factions/`, `milestones/`, `quests/`. Each is loaded by `cmd/aurad/loaders.go` (`contentSources`); a missing directory hard-fails at boot. The `make -C backend cp-defs` target copies all eight into `backend/pkg/api/` so the Go build embeds them, so run it (or just `make -C backend build`) after editing any JSON definition — or boot with `-content ../api` to skip both (see Content iteration above). Keep `contentSources` covering every `api/` subdirectory, or a content edit silently no-ops.

### Persistence (PostgreSQL)

Since step 8a, `aurad` persists accounts and characters (with their game state) to PostgreSQL. **Every change must state its schema impact** — does it touch persisted state (accounts, characters, session/reconnect data, quest ledger, loadouts)? Even "no DB change" is a finding worth recording in the chunk ledger.

- Schema lives in `backend/pkg/aura/store/migrations/` as sequential `.up.sql`/`.down.sql` pairs, embedded via `go:embed` and auto-applied at boot (`store.Migrate`). **Shipped migration files are frozen** — schema changes are always a *new* pair, never an edit.
- Standing schema rules (`game.` namespace, no `ON DELETE CASCADE`, hash discipline, JSONB canonicalization) and the dirty-state recovery runbook: `docs/manual-db-migrations.md`. Table/column rationale: `docs/archive/plan-accounts-schema.md`.
- DB-touching tests (`store`, `accounts`) need `AURA_TEST_DB_URL` set and skip cleanly without it — "green without Postgres" is not a full pass.

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
docs, Kringel Games social/rating links, and berryhunter.io domain URLs (no
replacement domain yet). (The `legacy: true` proving-grounds content was
deleted at zone-editor C3, 2026-08-16.)

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
- State the change's **database-schema impact** (even if "none"). If it touches persisted state: follow `docs/manual-db-migrations.md` (new migration pair, never edit shipped SQL) and run the `store`/`accounts` tests with `AURA_TEST_DB_URL` set
- For anything with a runtime surface, verify in-game (plan docs record per-chunk in-game checklists)
- Report the output — don't claim "done" without these checks.
