# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each with a ledger
     pointer; the whole section under ~12 KB, measured in BYTES. Rotate the oldest
     verbatim into docs/archive/status-history.md. Full ledgers: the plan-*.md
     banners. Sequence: roadmap.md "Execution order". Collapse rule: `chunk-wrap`. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: SKILL VFX C3a, the art path + the §12g amendment** ✅ 2026-09-22 `e4bc8534` (ledger: `docs/plan-skill-vfx.md` §13 C3a, spec §12f + §12g): ⭐ **the "atlas" is a FOLDER**: a body is ONE PNG in `frontend/src/features/skill-fx/assets/bodies/` plus a GENERATED name list `api/skill-fx/bodies.json` (the TENTH content dir), so `-validate` AND the boot refuse an unknown `body`; three engineering pilots from a checked-in generator, and the artist briefing `docs/art/skill-vfx-asset-spec.md`. ⭐ **§12g (PO look): an ATTACK is drawn from the attacker, a HIT is the ENGINE'S mark**: every landed Damage/Crit hit plans a round mark on the victim, in the PLANNER, authored by no file; `impact` left the vocabulary (42 layers deleted), the bite is `strike` `bite` hinged at the biter, `wave` took the seventh seat. ⚑ **The first session left the CLIENT half unbuilt** with the Status saying "nothing built": read the tree before the Status block. **Schema DB/wire/conf NONE; content: 1 new dir, ~60 skill files, pin 116.** Verified: Go 35 pkgs ok (⚑ `world` red at HEAD too) · `-validate` 0 both ways + typo'd body exit 1 · smoke 0/116 · frontend 1036/0 · `skill-fx.mjs` **29 PASS / 0 red** (⚑ the wolf camp has BOARS: sprite counts are bounds) · `skill-fx-scale.mjs` PASS ×2 (default + sprite path) · `skill-fx-wave-probe.mjs` PASS (`wave` seen drawing). ⛔ **Owed: the PO look** at the bite, the pilots and the hit mark, then the phone check.

- **Prior: ZONE NAMING N1 — the Tiled layer stack is the CLIENT’s draw order, and two layers open LOCKED** ✅ 2026-09-20 (ledger: `docs/plan-zone-naming.md` §10). Tiled’s panel now reads `regions · paths · terrain · props · spawns · campfires · darkAreas · atmospheres · anchors` bottom-up — `Game.ts`’s `cameraGroup` order exactly. It was close to INVERTED (texture blobs at the bottom, regions ABOVE them), so a screen-sized region polygon won every click aimed at a prop underneath it. ⭐ **The whole chunk is FREE, and that is what made it worth doing**: a zone file stores ARRAYS, never layers — `zoneToModel` synthesizes the stack on every open and `modelToZone` reads it back **BY NAME** — so order and lock are pure presentation and **not one byte of any zone file changed**. `regions` + `atmospheres` ship `locked: true` (PO ask: *"so they do not block clicking"*). ⛔ **The lock CANNOT PERSIST, and that is MEASURED**: a zone has no layer records and Tiled’s session file carries no lock state, so the converter’s flag IS the state on every open and a hand-unlock dies at the next reopen — accepted, and footer item 9 of `verify.sh` tells the reader to expect the padlock back. ⭐ **The strongest evidence came from a leg that ALREADY EXISTED**: both locked layers still round-trip byte-identically through real Tiled, which is what proves a locked layer is read, written and saved. Rider: `AuraProfile` → **`AuraTerrainProfile`** (content-free — an enum NAME never reaches a zone file; id 7 kept, no churn). ⭐ **A PRE-EXISTING TEST DEFECT fell out and is the durable half**: `terrain paint order…` read its fixture from the live `world.json` and indexed `src.terrain[last]`, so the PO’s currently-empty `terrain` made `last` = −1 and it died on `.name` saying nothing about paint order — [[feedback-tests-derive-not-hardcode]] read one turn too literally, since deriving guards a CENSUS changing but never the content being EMPTY. Now a synthetic fixture, which also takes it off the fresh-checkout inconclusive list. ⚑ Nine positional `layers[0]/[1]/[2]` pins are gone (`layerNamed`); the ORDER now has exactly one test. **Schema: DB/WIRE/CONF/CONTENT/ZONE FORMAT — ALL NONE.** Verified: build · vet · tsc · **vitest 969/969** · prod build · **`verify.sh` all green, 24 legs** through real Tiled + 2 new footer human-checks · **mutation-verified ×5, all five caught by the intended leg**. ⚑ `go test ./...` is red in 3 packages and **the failing set is IDENTICAL with this chunk stashed** — it is the PO’s uncommitted content; N1 touches no Go at all. ⚑ **OWED: the two human checks have not been run** — padlocks and panel order are eye-only, so the `regions` lock is unjudged in real authoring.

- **Prior: SKILL VFX C4, world scale (a measurement chunk)** ✅ 2026-09-20 `d8e1628d` (ledger: `docs/plan-skill-vfx.md` §13 C4, spec §12e + rulings §12e.8): ⭐ **the 10× load is a CLIENT-SIDE stress driver** (`SkillFxStress.ts`, `?develop` console only, fed through the real `onSnapshot` + `setAmbient`), because a real 10× server is tick-starved (ceiling ≈ 5.8×) and would emit FEWER events. Plus a dev-only instrument in `SkillFx.ts` and the seven-leg `skill-fx-scale.mjs`. ⭐ **10× `full` costs 0.7–1.0 ms p95 of `update()`**, about 5 % of a frame; ⭐ **ambient is the dominant share (≈ 93 % of the layer's display objects) and stays UNBUDGETED by PO ruling**; the slider cuts display objects 344 → 59 → 1. ⭐ At 96, eviction starts ≈ 145–190 events/s (one player's fight is 1.0–1.8), and once the cap binds the frame cost plateaus: the real ceiling is the SPAWN path, ≈ 1500 events/s. ⚑ The headless page renders at ≈ 3 fps: fill rate CANNOT be judged there. **Schema: ALL NONE, and it held.** Verified: `go build` clean · frontend 829/45 · `skill-fx-scale.mjs` PASS ×4 · `skill-fx.mjs` 13 legs PASS. ⛔ NOT run: a real phone, loadbot, Go tests (nothing Go changed). ⭐ **PO: the cap (96 vs 192) is decided "after the phone check".**


### Next

- **⭐ SKILL VFX owes C3a-ii (§12h, PO look 2026-09-23), then C3b, then the phone check** (`docs/plan-skill-vfx.md`): **C3a-ii** = a DoT draws on APPLICATION and every refresh, never on a tick (`HitKind` `Applied`/`Tick`, trigger `applied`; ⚑ WIRE enum values), the RIM BITE (short jaws at the victim's rim; the lunge unscheduled), `wave` on Nova Burst + Shockwave, the Giant Spider's fang auto-attack, the Pyromancer's per-tick damage, a placeholder `visual` on EVERY skill. **C3b** = the editor's Visuals section (§12f.5). ⚑ **The phone check carries THREE decisions**: cap 96 vs 192, fill rate, the packer trigger (§12f.2).

- **⭐ THE UNDERWORLD owes U0 + an in-game pass** (`docs/plan-underworld.md`): the engine is done end to end. ⛔ **U5 (the content chunk) is DROPPED 2026-09-10 (PO): level authoring is manual** — filling a room is the PO’s own Tiled work and was never engineering. ⚑ **§7.3 is the record, because U5 had become the bag three shipped chunks dropped their leftovers into**: the **owed in-game pass** does NOT drop with it (U3/U4a/U4b each deferred their verification into U5), the **L8 campfire check** rides with authoring (a fire’s dwell circle over a cave mouth eats every `E` press), and the **walls-as-`paths` ruling** (§7.1 item 1 — path corridors are off `LayerViewportCollision` and stream nothing, unlike the 777 props) becomes **authoring guidance to the PO**, not a chunk. ⚑ **Q5 wants eyes before anything else**: the curtain is derived from the grant kind, so the **shipped** portal pair and campfire recall stop being hard cuts and get a lateral crossfade — free, probably an improvement, but a change to something already PO-verified. ⛔ **Nothing in U1→U4b has been walked in-game by me**, and U2 alone produced three browser-only defects. ⚑ **U6 = build-time zone placement is DESIGNED, NOT BUILT** (§7.2, PO-asked 2026-09-08): an authored `depth`, an auto-assigned origin, and a GENERATED placement file both sides read so the ⛔ **wire cost stays ZERO** — which is the constraint that picks the design, because a BOOT-time packer would force the origins onto the wire. ⚑ Deferred with two named triggers: a dungeon growing and forcing neighbours to be re-spaced, or the zone count passing ~10. ⭐ It REVERSES U4b's "no separate depth int" on purpose, and the reversal is sound: once the geometry is derived FROM the depth, the two cannot disagree. ⚑ Also owed: the **D6 amendment note** in `plan-release-map.md` §8 (✅ done 2026-09-08), and **U0** = `plan-world-scale.md` **S1** (lazy zone bundling — ⭐ its `ensureZoneLoaded` await seam is *exactly* what the curtain now hides, so the curtain is the load screen S1 always wanted).

- **⏸ LINE OF SIGHT (light) is DESIGNED, UNSCHEDULED, and its inclusion is NOT RULED** (`docs/plan-line-of-sight.md`, split out of `plan-region-atmosphere.md` 2026-09-16 on PO ask; B1→B2→B3, nothing built). ⛔ **It is NOT "what is next"** (corrected 2026-09-21, PO): the split session wrote that, the PO never ruled it, and the one line-of-sight idea that WAS prototyped (auras, branch `prototype/aura-los`, `c42e1100`) came back with the PO verdict "we don't need it yet, or it is just a different game entirely" (`roadmap.md` item 6). ⚑ Whether that verdict also covers the light-only variant is an OPEN PO call; do not start B1 without it. ⛔ **Today every light is an UNCONDITIONAL CIRCLE**, so a lantern erases darkness straight through a cave wall — that is what B fixes. **B1, if it is ever scheduled**: `Occluders.ts`, pure segment derivation from props (a new `occludesSight` DEFINITION flag per D8, not a placement one), blocking paths incl. P1’s `closed` wraparound, blocking polygons and the border; no rendering, 100 % vitest-reachable. ⭐ **§3 is MEASURED**: the sweep is **quadratic in segments per light and linear in lights**, so D9 as designed (local player, r 4, worst case 11 segments in the underworld) is **0.34 % of a frame and free**, while 20 campfire-radius lights in a dense cave are **17 % on a DESKTOP** and the mobile ceiling is 3-5× slower. ⭐ New **D19** is the answer and is designed in from B2 rather than retrofitted: **a static light over static occluders has a static visibility polygon and is CACHED**, so only MOVING lights pay per frame. ⚑ **§7 holds 4 open PO calls**, and Q3 is the one B3 needs: is an ally’s torch shining through a wall, beside your correctly shadowed one, worse than neither of you having shadows? ⛔ **B clips LIGHT, never AURAS** (aura LoS cut 2026-07-10). ⚑ **`plan-region-atmosphere.md` now has NO CHUNKS AT ALL** — A3 moved to `docs/cleanup.md` entry 1 on 2026-09-16 (PO ask), because re-authoring 35 circles was never engineering and a retirement belongs with the thing being retired. ⭐ **That entry also reopens the PRIOR question the old framing skipped: should `darkAreas` be retired at all?** It argues the case both ways — against it, a circle cannot carry fog art, drift or `sight` and two sources of dark geometry is the duplication D0 exists to avoid; for it, a circle is FAR cheaper to author (one drag vs three placed vertices) and its `EDGE_FADE` radial falloff is not what `blend` draws — plus a third option that may beat both: **teach the atmospheres layer the ELLIPSE tool**, keeping circle ergonomics with one primitive, at the cost of one branch in `closedAreaPoints` (Tiled’s ellipse already round-trips through both writers, since `darkAreas` itself is written as one). ⛔ **The plan stays OUT of `archive/` regardless, because what is left is JUDGEMENT rather than chunks**: every number in `atmosphere-profiles.json` is still [PLACEHOLDER], the look sitting has not happened, and `sight` is authored by NOTHING so D7’s `max()` has never been exercised by real content.

- **⭐ ZONE NAMING owes N2, and it waits on the PO’s CONTENT** (`docs/plan-zone-naming.md` §6; **N1 shipped 2026-09-20**, ledger §10): the three key renames — `terrain` → **`decals`**, `polygons` → **`structures`**, `campfires` → **`bindPoints`** — each through the four writers plus a Tiled class, and `AuraTerrainType` → `AuraDecalType` with the palette tileset. ⭐ **`decals` is what makes the already-shipped `AuraTerrainProfile` unambiguous**: "terrain" currently names BOTH the blob array and the ground-material vocabulary. ⛔ **L1 — no compatibility window, on purpose**: `DisallowUnknownFields` turns a missed key into a refused boot, so the three `api/zones/*.json`, the three embedded copies and the converter move in ONE commit. ⛔ **L2 — all three zone files carry uncommitted PO authoring**, so N2 lands right after that content is committed, or as an idempotent migration script over whatever is in the tree; never a hand edit of a file someone is mid-session in. ⚑ `darkAreas` is deliberately NOT in scope (parked on `cleanup.md` entry 1’s retire-or-keep ruling), and internal names (`GroundTextureManager`, the client feature dirs, the Go type names) stay by D3. ⚑ Also owed from N1: the **two human checks** in `verify.sh`’s footer (items 8 and 9) — the padlocks and the panel order are eye-only, so the `regions` lock is unjudged against real authoring.

- **⭐ ZONE POLYGONS: all four chunks shipped, and what is left is JUDGEMENT** (`docs/plan-zone-polygons.md` §12 "What is OWED"): the engine is done end to end and **inert at HEAD** — no zone authors a polygon, so the PO has not seen one. ⭐ **The PO has now walked one** (2026-09-10) and it found a real collider defect on diagonal walls, fixed the same session — see the §12 P3 rider. ⚑ **The three [PLACEHOLDER] numbers want tuning in front of the game and are COUPLED**: interior cell **0.5 u** · boundary thickness **1 u**, ⛔ the safety-critical one (L11), **NOT checked against flight or knockback** · body cap **256**. The stroke must stay `>= cell * sqrt(2)` to bridge the band the fill cannot reach, so raising the cell means thickening the stroke. ⚑ The PO's `Wall` profile authors `"texture": "null"` as a STRING rather than JSON `null` — it works by accident (no such tile, so D14 falls back to the colour) and is worth correcting. ⚑ The D6 **coarsening path has never been seen in-game** — the WARN log and the non-blocking Tiled notice are both untested against a real oversized shape. ⭐ **The first content consumer is already named: cave walls as blocking polygons** (`plan-underworld.md` §7.1 item 1), which is what the primitive was built for. ⚑ Also owed: `c3-zone-editor-level`, deferred through P1-P4.

- **⭐ WORLD LOOK, two live threads.** `docs/plan-world-paths.md` §12 owes **C4 only**: re-author the 372 `Sand` blobs as paths (PO-ruled 2026-09-07), a CONTENT judgement, not a transform of blob positions. ⏸ `docs/plan-region-primitive.md` (C1-C5 all shipped, C5 `4937a977`) stays live for the OPEN look sitting it arms: texture picks, the 0.35 scale, the seam, blend width, mask density, the `Water` drift, judged in-game. ⚑ Audio consumers unscheduled.

- **⭐ SERVER PERF + WORLD SCALE** (`docs/plan-server-performance.md`, `docs/plan-world-scale.md`): perf 0+3 shipped, 1/2/4/5 unstarted; scale S1 unstarted. ⚑ **Re-read the perf ordering BEFORE chunk 1**: M1-F3 measured PhysicsSystem at 74 % at density 10×, so chunk 4 may outrank it. ⛔ M1-F2's residues are recorded, NOT fixed, their own chunk.

- **⏸ Parked 2026-08-20 (PO): `plan-prototype-projectile.md`** - the SECOND in-game pass is OWED (§10; ⚑ test the cost with god OFF) and decides P2/P3 or delete. ⏸ `plan-play-bot.md` designed, nothing built. ⏸ `plan-npc-hails.md` + `plan-mob-voicelines.md` DEFERRED. ⚑ Unowned: zone-editor C3's dead Go plumbing + broken `wiki-generator/`.

- **⭐ DIRECTION SET 2026-08-22: the next map is the FIRST RELEASE MAP, and CAMPS ARE CONTENT** (`docs/plan-release-map.md`; nothing built, owes its own planning session, §7 holds the PO calls). Membership = a completed quest, exclusivity = `quest_at_stage` gates: **no new vocab, no Go, schema NONE**. ⏸ `plan-camps.md` DEFERRED. ⛔ `plan-test-world.md` DROPPED.

- **Watch items riding forward, none a chunk.** CC (`docs/archive/plan-cc-and-retaliation.md`): can a mob stun a *player*? · CC immunity is silent in-game · a stun is wire-indistinguishable from a slow (§39) · confirm D10's Paralyze-on-GiantSpider. Mob/XP tuning, unowned: per-species feel (**HP/damage re-price every placement**) · the levels 21-30 gap · ⚑ the single-target cap took the most group pressure off elites and bosses, **re-pricing NOT done and the effect UNMEASURED** (the sim batteries are 1 player vs N mobs).

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
- **Gotchas & dev tools:** **A shape removed from `phy.Space` is purged from every other shape's collision set on the spot** (§54); never "optimize" that sweep away. ⚑ A content edit does NOT invalidate the Go test cache (`-count=1`), and without `-content ../api` everything reads the EMBEDDED copy (`make -C backend build` after ANY `api/` edit). ⚑ **A ZONE edit is HALF-LIVE**: restart the server after a Tiled save. ⚑ **And since 2026-09-10 the DIRECTORY IS THE ZONE LIST**: a new `.json` in `api/zones/` loads on the next boot with no conf edit — and a half-authored one now REFUSES the boot instead of being ignored, so park WIP outside the directory. `game.startZone` names only which zone a fresh character spawns in. ⚑ **`-debug-zones` swaps in a SECOND zone list**, `api/zones/.debug/` (the old 144×72 world as `world_debug` + its own underworld/tunnel copies), with `world_debug` primary; every other content dir is unchanged, the client follows the server by itself, and switching is a restart (`dev-restart-windows.sh server debug`). Every `.json` in `.debug/` loads too, so never park a backup there; `-validate -debug-zones` is its only gate (no Go test loads it: it is a frozen snapshot). ⚑ `aurad -validate -content ../api` checks all content, no DB. ⚑ The starting aura is pre-equipped but NOT active: the first `1` switches it on. ⚑ **GOD short-circuits the player's `takeDamage`**: no mob VFX and no number draws on a god-mode player. **Cheats:** GOD, WARP `<x·120> <y·120>`, SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST.

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
