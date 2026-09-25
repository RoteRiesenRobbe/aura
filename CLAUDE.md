# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each with a ledger
     pointer; the whole section under ~12 KB, measured in BYTES. Rotate the oldest
     verbatim into docs/archive/status-history.md. Full ledgers: the plan-*.md
     banners. Sequence: roadmap.md "Execution order". Collapse rule: `chunk-wrap`. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: AURA DRAWBACKS + the PLAYER CC DOORS, the PLANNING session** ✅ 2026-09-25 [uncommitted] (the record: `docs/plan-aura-drawbacks.md`, D1-D7 taken as choice prompts, 3 chunks, nothing built): ⭐ the while-active self modifier is `stat_multiplier` on the ACTIVE aura folded at `SetActiveAura` (D1; the PO's refused 2026-09-12 authoring was the wanted feature), both signs (D2); ⭐ `instant_slow` joins the cooldowns (D3); ⭐ the player STUN door is built with the slow door (D4, closes the CC plan's §8 Q3); ⭐ D7 the giant spider drops a slowing WEB (a spawn cooldown, a poison-pool-shaped structure, TTL) and casts the Paralyze it drops. ⚑ Two derived floors silently eat a negative bonus behind comments claiming a loader rule that was never written (L1). ⚑ A mob cooldown is consumed only on a hit and a spawn always hits: a mob-cast spawn needs an aggro guard (A5). **Schema DB NONE, wire +1 enum value (C3), content +1 category/+1 type/+1 mob/+2-3 skills.** No code, no harness. ⛔ Owed: C1 (the fold) as the next execution session; the PO names the first player drawback aura (§8 Q1).

- **Prior: SKILL VFX C3b + C3c, the editor's Visuals BUILDER and a LIVE kind preview** ✅ 2026-09-25 `8bb084ca` (ledgers: `docs/plan-skill-vfx.md` §13 C3b + C3c, specs §12f.5 + §12f.7, both written the same day): ⭐ **the 2026-09-21 "read-only" ruling was REVERSED by the PO** (a skill made in the editor would ship with NO look): the Skills tab writes `visual`, pickers legal BY CONSTRUCTION from three new fixture exports, a manifest-guarded body PNG route, a palette swatch over the RAW file, five GREY hints. ⭐ **Mob looks are edited from the MOBS tab** through `POST /api/save/skill-visual` (only that file's `visual`). ⭐ **C3c (PO-asked at the QA): a dev-only second webpack entry `fx-preview.html` draws the layer being edited through the game's own feed, iframed per row behind a Preview toggle, plus a seven-kind gallery**; never in the prod bundle. ⚑ Prune a frame registry on the EVENT, never at registration (a render's subtree is detached until attached); say "ready" before the renderer boots. ⚑ `skill-fx.mjs` leg 14 was red at HEAD since `814f8055` (the jaw rule 1.4 → 0.8 never reached the harness), fixed. **Schema DB/wire/conf NONE; fixture +3 keys; content none at rest.** Verified: Go 35 ok (`world` red at HEAD) · `-validate` 0 both ways · smoke 0/116 · frontend **1097/0** + typecheck · editor harness 0 problems (both handshakes PASS) · `skill-fx-preview.mjs` PASS · `skill-fx.mjs` **RESULT PASS** · prod build carries no preview. ⭐ **PO look DONE 2026-09-25** (`e58f7537` gallery fit; Immolate reauthored through the builder, `38bd586f` after the simharness ceiling guardrail, which no save path runs; now a `wave` by ruling: ⭐ **an editor change by the PO is intentional and overrides an earlier ruling**, `feedback.md` 2026-09-25). ⛔ Owed: the phone check.

- **Prior: ICON PACK, the PONETI icons on every player skill + 21 portraits, seat holder only** ✅ 2026-09-24 `072110f0` (record: README "Icons (PONETI pack)", `THIRD_PARTY.md`, `manual-content-authoring.md` §4; no plan doc): ⭐ **`packIcon` sits BESIDE `icon` / `file`, never instead**: 78 skills and 21 portraits name a manifest entry, the glyph / SVG stays the fallback, so a clone without the atlases looks exactly as before (proved headless: 9 glyph tokens, 0 letters). ⭐ **The atlases stay OUT of the public repo** (PO: seat holder only for now; `frontend/icons-prebuilt/` is gitignored and the hook refuses it): the packer builds there and copies to `dist/icons/`, so the deploy bundle built here carries them. ⭐ Pack portraits lost their medallion (ring + disc were baked into the old SVGs): the shipped `withBorder` pattern + `WithBackground` busts, disc at 86 % of the canvas (rings span 73–98 % of the radius). ⭐ PO looks 1-4: slots 52→64 px, spellbook FIXED page (26rem, 8 × 4rem rows, two-line names, no scrolling), row token 3.5rem in a bevelled stone frame; the WoW grid DECLINED. **Schema DB/wire NONE; content field +1, vocabulary golden +1, pin 116.** Verified: Go 35 ok (`world` red at HEAD) · `-validate` 0 · frontend 1073/0 + typecheck · packer 12/12 · leak 7/7 + tree · editor 2/2 · `verify/pack-icons.mjs` PASS. ⛔ Owed: the phone (14 MB of PNG atlases), `harnessdb -cleanup` (stop aurad first). PO look at the 21 framed portraits: fine (2026-09-24).

### Next

- **⭐ NEXT: AURA DRAWBACKS C1, the while-active fold, an EXECUTION session** (`docs/plan-aura-drawbacks.md` §7 C1; then C2 the slow door + `instant_slow` + the spider web, C3 the stun door + the spider's Paralyze): `stat_multiplier` legal on `active_aura`, the ACTIVE slot folded into `DerivedStats` at `SetActiveAura`, the two derived floors lifted behind new loader bounds (L1: bound first), the player gains the mob's per-tick HP clamp (D5), a `selfModifier` block on the sim's `AuraSpec` (D6). ⚑ The PO still owes the first PLAYER drawback carrier (§8 Q1; Ember Aura is a mob aura).

- **⭐ ICON PACK: distribution is the open call** (`THIRD_PARTY.md`): atlases only on the seat holder's machine and the deployed server; every other clone draws the glyphs. If that changes: a private sidecar repo, or an encrypted archive with a private key (a licence judgement). ⚑ 14 MB of PNG atlases per client load, unmeasured on the phone. ⚑ A coworker's new skill ships with its glyph until the seat holder adds the manifest line and repacks.

- **⭐ SKILL VFX: every chunk built and looked (C3b + C3c 2026-09-25); the plan stays live for the PHONE CHECK** (`docs/plan-skill-vfx.md` §9, outside every chunk): THREE decisions ride it: cap 96 vs 192, fill rate, the packer trigger (§12f.2). ⚑ The gallery shows a 200 ms strike a fifth of its cycle, unruled. ⚑ The pyromancer's new `damage_aura` roughly doubled its output, unmeasured. ⚑ The harness census misses snapshots headless (C3a-ii ledger Findings).

- **⭐ THE UNDERWORLD owes U0 + an in-game pass** (`docs/plan-underworld.md` §7): engine done end to end. ⛔ U5 (content) DROPPED 2026-09-10 (PO): authoring is the PO's Tiled work. §7.3 holds the leftovers: the **owed in-game pass** (⛔ nothing in U1→U4b walked yet; U2 alone had three browser-only defects), the L8 campfire check, the walls-as-`paths` guidance. ⚑ Q5 wants eyes first (the curtain now crossfades the shipped portal pair and recall). ⚑ **U6 build-time zone placement DESIGNED, NOT BUILT** (§7.2). U0 = `plan-world-scale.md` S1, whose await the curtain hides.

- **⏸ LINE OF SIGHT (light) is DESIGNED, UNSCHEDULED, inclusion NOT RULED** (`docs/plan-line-of-sight.md`, B1→B3, nothing built). ⛔ **NOT "what is next"** (PO 2026-09-21): the aura-LoS prototype (`c42e1100`) got "we don't need it yet, or a different game"; whether that covers light-only is an OPEN PO call, do not start B1 without it. Today every light shines through cave walls. §3 MEASURED; §7 holds 4 PO calls. ⚑ `plan-region-atmosphere.md` has NO chunks; `docs/cleanup.md` entry 1 asks whether `darkAreas` should be retired at all.

- **⭐ ZONE NAMING owes N2, and it waits on the PO’s CONTENT** (`docs/plan-zone-naming.md` §6; **N1 shipped 2026-09-20**, ledger §10): the three key renames — `terrain` → **`decals`**, `polygons` → **`structures`**, `campfires` → **`bindPoints`** — each through the four writers plus a Tiled class, and `AuraTerrainType` → `AuraDecalType` with the palette tileset. ⭐ **`decals` is what makes the already-shipped `AuraTerrainProfile` unambiguous**: "terrain" currently names BOTH the blob array and the ground-material vocabulary. ⛔ **L1 — no compatibility window, on purpose**: `DisallowUnknownFields` turns a missed key into a refused boot, so the three `api/zones/*.json`, the three embedded copies and the converter move in ONE commit. ⛔ **L2 — all three zone files carry uncommitted PO authoring**, so N2 lands right after that content is committed, or as an idempotent migration script over whatever is in the tree; never a hand edit of a file someone is mid-session in. ⚑ `darkAreas` is deliberately NOT in scope (parked on `cleanup.md` entry 1’s retire-or-keep ruling), and internal names (`GroundTextureManager`, the client feature dirs, the Go type names) stay by D3. ⚑ Also owed from N1: the **two human checks** in `verify.sh`’s footer (items 8 and 9) — the padlocks and the panel order are eye-only, so the `regions` lock is unjudged against real authoring.

- **⭐ ZONE POLYGONS: shipped, what is left is JUDGEMENT** (`docs/plan-zone-polygons.md` §12): inert at HEAD; the PO walked one 2026-09-10, a diagonal-wall collider defect fixed the same session (§12 P3 rider). ⚑ Three COUPLED [PLACEHOLDER] numbers: cell 0.5 u · boundary 1 u (⛔ L11, NOT checked against flight/knockback) · body cap 256; stroke ≥ cell × √2. ⚑ `Wall` authors `"texture": "null"` as a STRING, works by accident. ⚑ D6 coarsening never seen in-game. First consumer: cave walls (`plan-underworld.md` §7.1). Owed: `c3-zone-editor-level`.

- **⭐ WORLD LOOK, two live threads.** `docs/plan-world-paths.md` §12 owes **C4 only**: re-author the 372 `Sand` blobs as paths (PO-ruled 2026-09-07), a CONTENT judgement, not a transform of blob positions. ⏸ `docs/plan-region-primitive.md` (C1-C5 all shipped, C5 `4937a977`) stays live for the OPEN look sitting it arms: texture picks, the 0.35 scale, the seam, blend width, mask density, the `Water` drift, judged in-game. ⚑ Audio consumers unscheduled.

- **⭐ SERVER PERF + WORLD SCALE** (`docs/plan-server-performance.md`, `docs/plan-world-scale.md`): perf 0+3 shipped, 1/2/4/5 unstarted; scale S1 unstarted. ⚑ **Re-read the perf ordering BEFORE chunk 1**: M1-F3 measured PhysicsSystem at 74 % at density 10×, so chunk 4 may outrank it. ⛔ M1-F2's residues are recorded, NOT fixed, their own chunk.

- **⏸ Parked 2026-08-20 (PO): `plan-prototype-projectile.md`** - the SECOND in-game pass is OWED (§10; ⚑ test the cost with god OFF) and decides P2/P3 or delete. ⏸ `plan-play-bot.md` designed, nothing built. ⏸ `plan-npc-hails.md` + `plan-mob-voicelines.md` DEFERRED. ⚑ Unowned: zone-editor C3's dead Go plumbing + broken `wiki-generator/`.

- **⭐ DIRECTION SET 2026-08-22: the next map is the FIRST RELEASE MAP, and CAMPS ARE CONTENT** (`docs/plan-release-map.md`; nothing built, owes its own planning session, §7 holds the PO calls). Membership = a completed quest, exclusivity = `quest_at_stage` gates: **no new vocab, no Go, schema NONE**. ⏸ `plan-camps.md` DEFERRED. ⛔ `plan-test-world.md` DROPPED.

- **Watch items riding forward, none a chunk.** CC (`docs/archive/plan-cc-and-retaliation.md`): can a mob stun a *player*? (⭐ PO 2026-09-25: mobs MUST be able to SLOW players; the stun half rides the drawbacks planning session above) · CC immunity is silent in-game · a stun is wire-indistinguishable from a slow (§39) · confirm D10's Paralyze-on-GiantSpider. Mob/XP tuning, unowned: per-species feel (**HP/damage re-price every placement**, now incl. the pyromancer) · the levels 21-30 gap · ⚑ the single-target cap took the most group pressure off elites and bosses, re-pricing NOT done and UNMEASURED (the sim batteries are 1 player vs N mobs).

- **⭐ backlog §52 - leaving the world without a reload**, PO-asked 2026-08-11, owned by `docs/plan-leaving-the-world.md` (designed 2026-08-04, nothing built; ⚑ line refs pinned to `1ac8078e`, re-verify first; shape **(B)** reset-not-teardown is plausibly one chunk). **backlog §48** is blocked on this.

- ⚑ **Step 8a closed WITHOUT backups, deliberately** (PO 2026-08-04): the live DB is **losable**; C3's memorial is the named revisit trigger. The security items (firewall, DB to localhost, credentials, non-root deploy) were never in that ruling and are still owed (`plan-playtest-deploy.md` §Ops).

### Open items

- **Feedback flow + the UI pass:** new feedback lands ONLY in `docs/feedback.md` (four exit doors; plan docs never double as intake). All UI work is in `docs/plan-ui-pass.md`: direction C RATIFIED (its §4 CORRECTION block IS the spec), C1-C8 SHIPPED and PO-approved, **next: C9 (mobile)**; PO play owed. ⏸ `plan-onboarding-cleanup.md` DEFERRED until a coworker joins.
- **Smaller open threads:** the Omni trio's PO in-game check (`9ee8cdb4`, cheat-only rigs, `omni-smoke` 17/17 headless) · §47 stale "Connection lost" banner · §51 transient second queue entry · a character-name **content** filter (spam passes the charset guard) · mobile perf ceiling, PO "works for now" · avatar/faction defaults (blocked on `plan-avatar-system.md`) · the password-reset plan's five questions · ascension's §8 leftovers (stone lore + art, [PLACEHOLDER] gate numbers, D29's ceremony visible only to its own player).
- **Known-inconclusive at HEAD**, all unowned: `chunk3-charm` 6-8/9 · `filler-batch` leg 1 · `chunk3b-ii-conversation` 28/34 · `accounts.TestRepeatedFailuresAreThrottled` under `-race` only · `AuraTiledConvert.test.ts` byte-stability ×2. ⚑ The 3 `items/mobs` census tests + the 3 `cmd/simharness` placement pins hardcode the roster, so ANY new mob/NPC reddens them. ⚑ Measure a flake's rate before diagnosing it.
- **Backlog watch items** (`docs/backlog.md`): §25 D+E · §27.2.4-7 (⚑ §27.2.6 needs re-surveying) · §29 lost-WebGL-context trigger unknown · §37 skill-level/augment rework · §39 entity-presentation rework, owned by `docs/plan-entity-presentation.md` · §34 hard collision · §58 **ANSWERED by Tiled** (not closed until the PO has moved a real texture there).
- ⭐ **M1-F5 - dormancy vs. a CREDIBLE world sim** (`plan-world-scale.md` §11): **(A)** an unobserved mob-vs-mob fight never ends (a slept mob is out of `phy.Space`, so also unhittable), a **design ruling**, not a perf tidy-up. **(B)** a mob can freeze **mid-walk-home off its route** (`model/mob/patrol.go:108-113`), the case L7 does NOT cover; a narrow D3 amendment (refuse sleep while `returnPosSet`).
- **Open PO calls:** five. ⭐ Spell builder §B11 Q7: Go validation on save for EVERY editor tab, retiring `validate.mjs`'s 637-line JS port (`docs/archive/plan-content-editor.md`) · ⭐ Should `EntitiesMarshalFlatbuf`'s `default:` stop panicking? (`recover()` swallows it, which is how the corpse bug hid eight weeks) · the portal pair's COST · does a QUEST turn-in row advertise the ability it pays? · should FireShield's flat reflect scale?
- **Standing locks:** **NO CI BY CHOICE** (PO 2026-08-12; revisit at roadmap step 9), the per-chunk local verify tail is the gate. The balance FINALs (growth 1.12 × maxLevel 30, regen + taper, campfire, the free base damage aura, downtime 10 s + chain 20) are guardrail-asserted in `cmd/simharness/guardrail_test.go`; drop + milestone tables TUNING-OPEN. Day/night cycle OFF (re-enabling means collapsing the ~25 per-layer filter passes).
- **Content rules:** new mobs **must** author tier + baseline (raw `maxHealth` hard-fails) and price XP with `factors.xpFactor` (absent → 1, `0` = pays nothing AND no nameplate, **no species authors 0.5**); tier ≥ elite **must** author `factors.ccImmune`. A skill `_comment` is an authoring note, never a session ledger. **A skill file is never deleted, an `id` never changes, `maxLevel` never decreases** (retire by removing unlock sources; `manual-content-authoring.md` §2 "Retiring a skill"). Full rules: the `add-content` skill.
- **Gotchas & dev tools:** a shape removed from `phy.Space` is purged from every other shape's collision set on the spot (§54), never "optimize" that away. ⚑ A content edit does NOT invalidate the Go test cache (`-count=1`); without `-content ../api` the EMBEDDED copy is read (`make -C backend build` after ANY `api/` edit). ⚑ A ZONE edit is HALF-LIVE (restart after a Tiled save); the directory IS the zone list. ⚑ `-debug-zones` swaps in `api/zones/.debug/` (the old 144×72 world as `world_debug`, primary, + its own underworld/tunnel copies); switching is a restart (`dev-restart-windows.sh server debug`), every `.json` there loads so never park a backup in it, and `-validate -debug-zones` is its only gate. ⚑ The starting aura is NOT active until `1`. ⚑ GOD short-circuits the player's `takeDamage`; `DAMAGE <pct>` works under GOD. Cheats: GOD, WARP `<x·120> <y·120>`, SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST, DAMAGE.

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
chunk 1c). That includes headless harness runs.

> ⭐ **DOCKER IS OPTIONAL. What aurad needs is a reachable PostgreSQL, not a container**
> (recorded 2026-09-12, PO correction). The `make db-up` target below is *one* way to get one
> and the only one this file used to mention, which is how "no Docker on this host" became a
> recorded reason for not booting the game — **three times, and wrongly each time.** A native
> Postgres serving `AURA_DB_URL` is fully equivalent; nothing in the server, the harness or
> the test suite can tell the difference.
>
> ⚑ **The Windows dev box runs exactly that** and needs no Docker at all:
> `scripts/dev-restart-windows.sh` builds, boots and health-checks `aurad` against a native
> service (`ensure_db()` starts it if it is not already listening, and no-ops when something
> already answers on the port). ⛔ **`docker` is not even on PATH there** — so if you are on
> that machine and a doc, a status entry or your own earlier note says the game cannot be
> booted for want of Docker, **that note is wrong: run the script.**
>
> ⚑ **And the environment may already be set.** `AURA_DB_URL` / `AURA_TEST_DB_URL` /
> `AURA_JWT_KEY` can come from `backend/.env.local` **or** from exported machine-scope
> variables — the Windows box uses the latter, so `backend/.env.local` is legitimately
> ABSENT there. ⛔ A missing `.env.local` is therefore NOT evidence that the game cannot
> boot. Check `env | grep AURA_` before concluding anything.

One-time setup, either way:

```bash
# (a) Docker — one command, nothing to install, used by the Linux/WSL setup
make -C backend db-up                                   # container, named volume, both DBs

# (b) Native Postgres — install once, then create the role and the two databases
#     (any Postgres ≥ 14; the Windows box runs 18 as a Windows service)
createuser -s aura && createdb -O aura aura && createdb -O aura aura_test

# …then EITHER export the three variables at machine scope, OR:
cp backend/.env.local.example backend/.env.local        # then put a real random key in it
```

`scripts/dev-restart.sh` and `scripts/dev-restart-windows.sh` both source `backend/.env.local`
automatically **and** let an already-exported value win, so a plain restart works in any shell
under either setup. `backend/.env.local` is **gitignored** — credentials never live in the repo.

**Two databases on one server, and the split is load-bearing:**

| Database | Role |
| --- | --- |
| `aura` | durable dev data — characters survive restarts, and container removal where there is a container |
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
(`💾 flushed N live character(s) for shutdown`). Docker:
`docker exec aura-dev-db pg_dump -U aura -d aura --clean --if-exists > /tmp/aura-dev-backup.sql`.
Native: `pg_dump "$AURA_DB_URL" --clean --if-exists > /tmp/aura-dev-backup.sql` — same file, and
it restores into either. Full runbook: `docs/manual-db-migrations.md` §4.

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
⚑ **Prototyped anyway on 2026-08-15** (branch `prototype/aura-los`, `c42e1100`,
deliberately never merged) so the PO could feel what the cut gave up. **PO verdict,
recorded 2026-09-21: "we don't need it yet, or it is just a different game
entirely."** The cut stands and the branch is parked.

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
