# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each ≤10 lines with a
     ledger pointer. When adding a new entry, move the oldest verbatim to
     docs/archive/status-history.md. FULL per-chunk ledgers live in the plan-*.md
     banners; the sequence lives in roadmap.md "Execution order". Never paste a full
     session banner here — see the `chunk-wrap` skill for the collapse rule. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: A4 — `AuraClearing`, the clearing becomes a CLASS** ✅ 2026-09-16 (ledger: `docs/plan-region-atmosphere.md` §10). `zone.clearings` — closed areas that ERASE atmosphere instead of painting it, riding the atmospheres layer under a new Tiled class and carrying **no profile at all**. ⭐ **D3 is CLOSED**: `darkness: 0` stops meaning *erase* and becomes a plain DECLARATION of zero — legal, useful, and unsayable before, since a pure fog profile can now state *"and it is not dark in here"* and stop a containing dark bank being reported there. ⭐ **The PO’s SECOND objection drove the design, not the first**: offered a `clearing` flag on the profile, the answer was *"0 darkness should be LEGAL… maybe more class separation is in order?"* — which rejects the flag too, and for the better reason that a flag on the PROFILE still makes the look table carry an OPERATION. Third application of P1’s "the SHAPE is the flag". ⛔ **The seam was the whole risk and behaved exactly as §11.3 predicted**: `inDarkness()` walks atmosphere PROFILES and a profile-less clearing is invisible to it, so the naive build leaves the picture PERFECT (hole painted, mob lit) while the sim hides every nameplate in the lit pocket, with nothing thrown — `Clearings.clearsAt` closes it deliberately, **mutation-verified ×3**. ⭐ **D17, the ruling this chunk had to make**: a clearing applies AFTER every atmosphere regardless of authoring order — two arrays cannot express interleaving without an ordering key, and *"cuts a hole in whatever is already there"* needs none; it is also what keeps the DRAWING and the LOOKUP agreeing. ⚑ `clears` is an ENUM (`darkness`/`haze`/`both`); absent reads as `both` (C6 with no sentinel available), present-and-wrong is REFUSED at save AND boot. ⭐⭐ **TWO PRE-EXISTING DEFECTS FELL OUT and they are the durable part**: ① the converter’s **class split on the atmospheres layer was unpinned** — a mutation pointing `modelToZone` at the whole layer left all 133 legs GREEN, because the completeness pin compares KEYS and both keys were still emitted; ② `AuraTiledConvert`’s **layer-count test asserted layer-count == same-named-array-count and had been wrong since zone-polygons D5**, passing only because no zone authors a polygon yet. ⛔ **Found by CONTENT, not by the suite** — a shared layer needs its count test taught about sharing the day the sharing lands. **Content**: the `Clearing` PROFILE is retired in the commit; ⚑ **`world.json`’s migration is PREPARED IN THE WORKING TREE AND NOT COMMITTED** — that file also carries the PO’s own uncommitted authoring (the atmosphere banks, new `CaveMouth` spawns) and `underworld.json`/`tunnel.json` are entirely theirs, so **A4 ships INERT at HEAD** and the migration goes in with the PO’s content. ⚑ **That shape never worked anyway** — it sat at index 0, BEFORE `Gloom`, so last-declaring-wins painted straight over it; D17 is what makes it work at all. **Schema: DB/WIRE/CONF/CONTENT NONE · ZONE FORMAT one new array, absent-safe.** Verified: build · vet · **`go test -count=1 ./...` EXIT 0** · tsc · **vitest 788/788** · prod build · **`verify.sh` all green** through real Tiled incl. 2 new legs · **mutation-verified ×5, one of which SURVIVED** and produced the missing class-split leg · **IN-GAME** (new `a4-clearing.mjs`, A/B): the sim reports LIT inside the clearing and DARK outside it, and the scene graph holds **2 erase Graphics with the clearing authored and 0 without**, 0 page errors. ⚑ **What the camera could NOT settle, recorded rather than smoothed over**: the pixel A/B reads ×0.99 and is **inconclusive by GEOMETRY, not by defect** — this clearing’s overlap with a dark bank is a ~4 u strip, narrower than the player’s OWN light, which erases the same darkness in both runs. ⛔ **The bar was NOT lowered to make it green**: a pixel leg that passed there would pass with `cutHole` deleted. ⚑ Two probe bugs of one family, worth knowing before writing the next harness: **the player’s own light lights the player** (so `isHidden` about the tile you warped onto always answers "lit"), and a sample patch offset away from the avatar **walks out of the hole** unless the point is picked for CLEARANCE — which inverted the A/B and reported a working clearing as broken. ⚑ **OWED**: every number is still [PLACEHOLDER], the look sitting has not happened, and `sight` is authored by nothing so D7’s `max()` stays unexercised.
- **Prior: THE ATMOSPHERE PRIMITIVE — darkness, haze, and TWO profile tables** ✅ 2026-09-16 (ledger: `docs/plan-region-atmosphere.md` §10; A0+A1+A2 `5b57d0c4`). `zone.atmospheres` — polygons naming a profile, drawn as the AIR over an area rather than the ground under it, on their own Tiled layer and their own client render layer. ⭐ **A1’s draw is byte-for-byte a region’s** (`paintSurface` takes its container as an argument), so `texture`/`scale`/`blend`/`scroll` came along free and the deferred feathering chunk **A1b does not need to exist**. A2 adds `sight`, per POINT, eased through the new `Ramp` — the "remembered value" wrapper `plan-region-primitive.md` §4.3 predicted, arriving with its first real consumer; **D7 makes it a `max()` and never an assignment**, so an authored region can only make a place KINDER and can never cancel a Lantern. ⭐ **THE AIR IS TWO THINGS and one dial could not say which** (PO 2026-09-14, replacing `gloom` outright): `darkness` is the ABSENCE OF LIGHT, so a lantern erases it by definition and it is **COLOUR ONLY**; `haze` is SUSPENDED MATTER, so it lives in a layer nothing erases and carries the texture and the drift. ⭐ **The behaviour follows from WHICH KEY you author**, never a flag beside a number, so the two cannot contradict — P1’s "the SHAPE is the flag" rule again. ⚑ Haze draws UNDER darkness; authoring BOTH is the smoky cave and their opacities **COMPOUND rather than max**. ⭐⭐ **The headline is the SECOND split, which came out of one PO question — *"can any profile have darkness and haze? Even the regions?"***: `profiles.json` held the ground and the air in ONE table feeding ONE Tiled dropdown, so a ground profile on an atmosphere drew **nothing** and an atmosphere profile on a region painted **grey mud** (L15, and it had already cost a session). ⛔ **A validator leg catches that AFTER the fact; two files make it unrepresentable** — which is why the split beat the leg I had offered. `terrain-profiles.json` → `AuraProfile` (19, worn by regions, paths, polygons and every outline), `atmosphere-profiles.json` → a new `AuraAtmosphereProfile` (4). ⚑ `AtmosphereProfile` **EXTENDS** `TerrainProfile` because fog legitimately wants a texture — the type split buys the OTHER direction, where `TERRAIN_PROFILES.Forest.darkness` is now a **compile error** rather than data nothing reads. ⛔ **The two name lists are DISJOINT and three things pin it** (the palette generator hard-fails, a vitest, a converter test): every accessor picks its table by CALL SITE, so a name in both would make *"which Fog?"* depend on which lookup ran, both answers plausible on screen. ⭐ **The converter’s payoff is the MESSAGE** — a crossed name names the table it belongs to instead of the true-but-useless *"unknown profile"*. ⚑ **Two traps recorded because neither is visible from the code**: the texture preload must stay **TWO calls** (concatenating all four shape arrays looks `Fog` up in the terrain table, misses, and leaves the bank on its fallback colour for the session with nothing said); and ⛔⛔ **`verify.sh` CANNOT see which enum a class member declares — MEASURED, not assumed.** Headless `--export-map` loads no project, so `tiled.propertyValue` throws and `aura-world-format.js` writes the bare STRING, which round-trips whatever the member says — **pointing `AuraAtmosphere` back at `AuraProfile` was mutation-tested against the full `verify.sh` and every leg stayed GREEN.** That guard is a static pin over the generated palette instead, and the DROPDOWN is now an explicit human check in the footer. ⭐ **The general lesson: a round-trip leg proves NAMES survive, never that the GUI wiring is right.** Riders: `Wall`’s `"texture": "null"` STRING is now real JSON `null` (closes a `plan-zone-polygons.md` §12 owed item) · **rectangles convert to polygons on every closed-area layer**, zero-size ones refused · ⛔ **the atmospheres layer had NO `validateModel` leg at all**, which is what let a vertex-less shape reach the server and refuse the PO’s boot — the missing leg, not the rectangle, was the cause. **Schema: DB/WIRE/CONF/CONTENT NONE** (both tables are client-side, D12) **· ZONE FORMAT one new array, absent-safe.** Verified: build · vet · **`go test -count=1 ./...` EXIT 0** · tsc · **vitest 770/770** · prod build · **`verify.sh` all green** through real Tiled incl. 2 new legs · **mutation-verified ×5, one of which FAILED** and was replaced · **IN-GAME**: fog paints textured and drifting, a `Clearing` cuts the fog and leaves the ground intact (which is what proves the haze erase is scoped to its own render target), darkness keeps its light holes, 0 page errors. ⚑ **OWED: D3 is REOPENED by the PO the same day** (§11) — *"0 darkness should be LEGAL... maybe more class separation is in order?"* — and **A4 is the designed, unbuilt answer**: a clearing becomes its own Tiled CLASS with its own `zone.clearings` array and no profile. ⛔ Its seam is `inDarkness()`, a profile walk a profile-less clearing is invisible to. Also owed: **every number is [PLACEHOLDER]** and the look sitting has not happened.

- **Prior: ZONE POLYGONS P1-P4 — closed paths, the filled AREA primitive, and outlines** ✅ 2026-09-10 (ledgers: `docs/plan-zone-polygons.md` §12; P1 `8d9dc4b9`, P2-P4 + the rider `05553e43`). **P2-P4:** `zone.polygons` — closed polygons naming the same profile a region does, FILLED, and BLOCKING when authored; `outlineProfile`/`outlineWidth` on both polygons and paths. ⭐ **The headline is a defect the mandatory in-game pass found and Go could not: the interior fill DID NOT EJECT.** Two ABUTTING `SolidAABB`s push in OPPOSITE directions at their shared seam — `resolveSolidAABB` ejects a centre INSIDE a box along its least-penetration axis and pushes a centre OUTSIDE one away from its nearest point — so a character warped into a mass parked on a seam and drifted 0.27 u in six seconds. ⛔ That is strictly WORSE than the hollow shell D2 rejected (sealed-but-mobile beats stuck-in-place). ⭐ **The cause was applying `maxCorridorSegment` to the interior, and lifting it is principled**: that cap exists because a ROTATED rect's bounding box is far larger than the rect and covers WALKABLE ground; an interior-fill box is AXIS-ALIGNED, so its bounding box IS the box, and that box is the inside of a solid mass where nothing walks. Big is free here and was not there — the rotated boundary stroke still pays the cap. ⚑ **It re-aims the D6 body cap**: a big SQUARE now merges to ONE box, so what blows the budget is a JAGGED outline, not a big one. ⭐ **A real FOURTH-WRITER defect came out of the shared Tiled layer, and only real Tiled could see it**: `aura-world-format.js` had WRITTEN `className` since the palette existed and never read it back — harmless while a class merely tinted an object, fatal the moment D5 made it the discriminator. ⚑ **A Go constant trap worth remembering**: `polygonBoundaryThickness` must be `1.0`, not `1` — as an untyped INTEGER constant `/ 2` is integer division and silently yields a boundary of ZERO thickness. ⭐ **A SECOND PO pass then found the collider poking out of the art on DIAGONAL walls, and the cause was one line**: the interior fill blocked a cell on a CENTRE test, so at a slanted edge a cell whose centre was barely inside stuck out by most of a half-diagonal — an axis-aligned STAIRCASE outside the outline, with the rotated boundary stroke buried behind it where nothing touched it. Fixed by blocking only cells lying WHOLLY inside (centre inside AND no edge crossing the cell), cell 2 u → **0.5 u**, and ⚑ **the two numbers are now TIED: `boundaryThickness >= cellSize * sqrt(2)`** (the stroke has to bridge the band the fill cannot reach), so coarsening thickens that polygon's stroke with its cell and a ceiling of `area/perimeter` stops a thick stroke crossing a thin shape. Joint circles were bulging too and are now inset to their TANGENT point; worst overshoot **1.4 u → 0.06 u**. ⭐⭐ **THE TEST DEFECT IS THE DURABLE LESSON, and it is not "add a diagonal fixture"**: the under-cover test had a square and an L whose every edge lies ON the sample grid, so it passed for the wrong reason — and the first in-game probe was a 45° diamond on whole units, whose edges pass through the grid CORNERS, on which a deliberately broken build scored CLEAN. A fixture has to be **AWKWARD**: no edge axis-aligned, at 45°, or on a grid line. ⚑ **OWED: the three [PLACEHOLDER] numbers are unjudged and are now COUPLED** (cell 0.5 u · boundary 1 u, the safety-critical one, NOT checked against flight or knockback · cap 256) — tuning one means re-checking the others. Also: the coarsening path has never been seen in-game, and `c3-zone-editor-level` is deferred and still owed. **P1:** a path drawn in Tiled with the **polygon** tool strokes a closed ring — a moat, a ring road, a circular town wall — and a blocking one now walls the **wraparound** from the last point back to the first. ⭐ **The SHAPE is the flag**: `closed` exists nowhere in the Properties panel, because an authored bool can contradict the shape it was drawn as and then two sources of truth disagree about where a road ends. ⭐ **The deleted validator leg is the notable change**: the paths layer used to refuse a polygon outright (*"a closed river is a lake"*) — the lake it guarded against is `AuraPolygon`'s job (D1), not a shape rule's, so the refusal became a POINT-COUNT rule (3 for a ring, 2 for a line). ⛔ **Closure is NOT fill, and that is proven on screen**: the pixel column through the ring's middle reads **0 % water** in both modes. ⚑ **The seam joint is the bend a reader forgets** — every vertex of a ring is a bend, so a closed path gets **n** joint circles to an open one's **n − 2**, and the loop must ask *"is there a next SEGMENT"*, never *"is there a next point"*. ⚑ `closed` is **tri-state in every writer** (absent = open), so every shipped zone stays byte-identical and the feature is **inert at HEAD**. ⚑ **`aura-world-format.js` needed nothing, CONFIRMED not assumed** (§6): the fourth writer maps both vertex shapes generically — a new object SHAPE is not a map-level value. **Schema: DB/WIRE/CONF/CONTENT NONE · ZONE FORMAT one key on `paths`, absent-safe.** Verified: build · vet · **`go test -count=1 ./...` EXIT 0** · tsc · **vitest 672/672** · prod build · **`verify.sh` all green** incl. a new closed-path leg · **mutation-verified ×5**. ⭐ **IN-GAME VERIFIED as an A/B** (new `p1-closed-path.mjs`): the same four probe points stop a west walk at **−25.75** when closed and let it through to **−29.72** when open, while the ordinary east segment walls at −20.25 in **both** — the control that makes the first number mean anything. ⚑ **A harness fix rode along**: `c4-region-texture` walked the WHOLE stage and compared against `zone.regions` alone, so authored PATHS made it report a stale `dist` that was current; it is now scoped to the regions layer.


### Next

- **⭐ THE UNDERWORLD owes U0 + an in-game pass** (`docs/plan-underworld.md`): the engine is done end to end. ⛔ **U5 (the content chunk) is DROPPED 2026-09-10 (PO): level authoring is manual** — filling a room is the PO’s own Tiled work and was never engineering. ⚑ **§7.3 is the record, because U5 had become the bag three shipped chunks dropped their leftovers into**: the **owed in-game pass** does NOT drop with it (U3/U4a/U4b each deferred their verification into U5), the **L8 campfire check** rides with authoring (a fire’s dwell circle over a cave mouth eats every `E` press), and the **walls-as-`paths` ruling** (§7.1 item 1 — path corridors are off `LayerViewportCollision` and stream nothing, unlike the 777 props) becomes **authoring guidance to the PO**, not a chunk. ⚑ **Q5 wants eyes before anything else**: the curtain is derived from the grant kind, so the **shipped** portal pair and campfire recall stop being hard cuts and get a lateral crossfade — free, probably an improvement, but a change to something already PO-verified. ⛔ **Nothing in U1→U4b has been walked in-game by me**, and U2 alone produced three browser-only defects. ⚑ **U6 = build-time zone placement is DESIGNED, NOT BUILT** (§7.2, PO-asked 2026-09-08): an authored `depth`, an auto-assigned origin, and a GENERATED placement file both sides read so the ⛔ **wire cost stays ZERO** — which is the constraint that picks the design, because a BOOT-time packer would force the origins onto the wire. ⚑ Deferred with two named triggers: a dungeon growing and forcing neighbours to be re-spaced, or the zone count passing ~10. ⭐ It REVERSES U4b's "no separate depth int" on purpose, and the reversal is sound: once the geometry is derived FROM the depth, the two cannot disagree. ⚑ Also owed: the **D6 amendment note** in `plan-release-map.md` §8 (✅ done 2026-09-08), and **U0** = `plan-world-scale.md` **S1** (lazy zone bundling — ⭐ its `ensureZoneLoaded` await seam is *exactly* what the curtain now hides, so the curtain is the load screen S1 always wanted).

- **⭐ LINE OF SIGHT is now its OWN plan, and it is what is next** (`docs/plan-line-of-sight.md`, split out of `plan-region-atmosphere.md` 2026-09-16 on PO ask; B1→B2→B3, nothing built). ⛔ **Today every light is an UNCONDITIONAL CIRCLE**, so a lantern erases darkness straight through a cave wall — that is what B fixes. **B1 next**: `Occluders.ts`, pure segment derivation from props (a new `occludesSight` DEFINITION flag per D8, not a placement one), blocking paths incl. P1’s `closed` wraparound, blocking polygons and the border; no rendering, 100 % vitest-reachable. ⭐ **§3 is MEASURED**: the sweep is **quadratic in segments per light and linear in lights**, so D9 as designed (local player, r 4, worst case 11 segments in the underworld) is **0.34 % of a frame and free**, while 20 campfire-radius lights in a dense cave are **17 % on a DESKTOP** and the mobile ceiling is 3-5× slower. ⭐ New **D19** is the answer and is designed in from B2 rather than retrofitted: **a static light over static occluders has a static visibility polygon and is CACHED**, so only MOVING lights pay per frame. ⚑ **§7 holds 4 open PO calls**, and Q3 is the one B3 needs: is an ally’s torch shining through a wall, beside your correctly shadowed one, worse than neither of you having shadows? ⛔ **B clips LIGHT, never AURAS** (aura LoS cut 2026-07-10). ⚑ **`plan-region-atmosphere.md` now owes A3 ONLY** — re-author `world.json`’s 35 `darkAreas` as 2-3 atmosphere shapes, a PO content judgement that also retires the `darkAreas` primitive (D4); when it is ruled, that plan is DONE and moves to `archive/`. ⚑ Still owed from A4: every number is [PLACEHOLDER], the look sitting has not happened, and `sight` is authored by NOTHING so D7’s `max()` has never been exercised by real content.

- **⭐ ZONE POLYGONS: all four chunks shipped, and what is left is JUDGEMENT** (`docs/plan-zone-polygons.md` §12 "What is OWED"): the engine is done end to end and **inert at HEAD** — no zone authors a polygon, so the PO has not seen one. ⭐ **The PO has now walked one** (2026-09-10) and it found a real collider defect on diagonal walls, fixed the same session — see the §12 P3 rider. ⚑ **The three [PLACEHOLDER] numbers want tuning in front of the game and are COUPLED**: interior cell **0.5 u** · boundary thickness **1 u**, ⛔ the safety-critical one (L11), **NOT checked against flight or knockback** · body cap **256**. The stroke must stay `>= cell * sqrt(2)` to bridge the band the fill cannot reach, so raising the cell means thickening the stroke. ⚑ The PO's `Wall` profile authors `"texture": "null"` as a STRING rather than JSON `null` — it works by accident (no such tile, so D14 falls back to the colour) and is worth correcting. ⚑ The D6 **coarsening path has never been seen in-game** — the WARN log and the non-blocking Tiled notice are both untested against a real oversized shape. ⭐ **The first content consumer is already named: cave walls as blocking polygons** (`plan-underworld.md` §7.1 item 1), which is what the primitive was built for. ⚑ Also owed: `c3-zone-editor-level`, deferred through P1-P4.

- **⭐ WORLD PATHS owes C4 only** (`docs/plan-world-paths.md` §12): **C4 = re-author the 372 `Sand` blobs as paths** (PO-ruled 2026-09-07). ⚑ It is a CONTENT judgement — where the roads actually run — not a transform derivable from scattered blob positions. ⭐ C4 is also what finally arms the region primitive's OPEN look sitting — the shipped world has exactly one region covering everything, so no interior feathered edge exists to judge. ⚑ **The whole path look sitting is now live**: the PO has water, road, forest and cliff paths authored in `world.json` and is judging widths, blends, textures and the `Water` drift ([PLACEHOLDER] `{0.4, 0.15}` u/s) in front of the game.

- **⭐ SPELL BUILDER designed 2026-09-08, C0 next when the PO opens it** (`docs/plan-content-editor.md` **Part B**, PO-asked same day; ⚑ folded into the content editor's own plan, whose Part A had shipped 2026-08-27/28 without a ledger or an index line - fixed today, and `plan-content-tooling.md` C3 struck as superseded): a **Skills tab in `tools/content-editor/`** over the loader's 34-type / 81-key vocabulary, writing `api/skills/<kebab>.json` directly. ⭐ The PO's example spell (fire vulnerability + fire damage, capped targets, authored cadence) is authorable TODAY as one file, and the per-type field table already exists in Go (`effectKeys`), so **C0 = `api/skill-vocabulary.json` pinned by a Go golden test** and the form renders from it (⛔ never a hand copy; per content kind, so a mob fixture can follow). ⚑ **Re-rules `plan-content-tooling.md` D7**: skills are human-authored in the tool. ⚑ **VFX = disabled "coming soon"** (no ruling exists); `hitStyle`, the parked `projectile` type and the dead `legacy` flag are out with it (§B4.8). Schema NONE. 8 rulings D1-D8 in §B4.1, 6 unprompted proposals in §B9 (PO may veto).

- **⭐ SERVER PERF + WORLD SCALE, what's next** (`docs/plan-server-performance.md`, `docs/plan-world-scale.md`): perf chunks **0+3 shipped**, **1/2/4/5 unstarted**; scale **S1 unstarted** (S2 deferred into `plan-world-map.md`'s mobile pass). ⚑ **Re-read the perf ordering BEFORE chunk 1** — it sequences off *encoding 57 % / physics 24 %*, but M1-F3 measured **PhysicsSystem at 74 %** at density 10×, so chunk 4 may now outrank chunk 1 for the clustered case (a design sitting, not a chunk). Cheap meanwhile: **S1** (webpack `'lazy'` + one await seam; retires the L4 probe-zone footgun). ⛔ **M1-F2's residues are recorded, NOT fixed**, their own chunk: `SkillSystem` 6.6× / `StatusEffectsSystem` 11.7× walk dormant mobs, `Space.grid` never pruned — all need L6 byte-identical-sim care.

- **⏸ Parked 2026-08-20 (PO choice): `plan-prototype-projectile.md`** - the SECOND in-game pass is OWED (§10 items 1, 2, 4, 5 + 13; setup `SKILL ThrowMine`/`ThrowBomb`, ⚑ test the cost with god OFF). Its verdict decides P2/P3 or delete. **In flight instead: `plan-play-bot.md`** (C0-C3). ⏸ `plan-npc-hails.md` + `plan-mob-voicelines.md` DEFERRED 2026-08-24 (PO): only if play-feel asks. ⚑ Unowned leftovers ride in the plan docs: zone-editor C3's dead Go plumbing + broken `wiki-generator/`.

- **⭐ DIRECTION SET 2026-08-22: the next map is the FIRST RELEASE MAP, and CAMPS ARE CONTENT** (`docs/plan-release-map.md` - the authoritative record; nothing built, the map owes its own planning session, §7 holds the PO calls). Membership = a completed quest, exclusivity = `quest_at_stage` gates - **no new vocab, no Go, schema NONE**. ⏸ `plan-camps.md` DEFERRED not cancelled (⛑ moving the quest ledger off `character_id` would kill the free post-ascension reroll). ⛔ `plan-test-world.md` DROPPED (its §1 bounds + densities survive).

- **⭐ REGION PRIMITIVE: C1-C5 ALL SHIPPED** (C5 `4937a977`, ledger §12; audio consumers unscheduled, `plan-region-audio.md`). ⏸ **`docs/plan-region-primitive.md` stays live for the OPEN look sitting** (texture picks, the 0.35 scale, the seam, blend width, mask density). ⚑ Standing C4/C5 landmines + the no-second-region seam caveat live in the plan doc + [[project-region-primitive]]. Schema NONE throughout.

- **CC watch items ride forward** (`docs/archive/plan-cc-and-retaliation.md`), none a chunk: can a mob stun a *player*? (`plan-skill-vocab` §3.1) · CC immunity is silent in-game (⭐ the "Immune"-label rails exist since `9fb3859d`) · a stun is wire-indistinguishable from a slow (§39 dependency) · ⚑ confirm D10's Paralyze-on-GiantSpider ("the elite spiders" - no elite-tier spider exists).

- **Mob/XP tuning threads, unowned** (archived: `plan-xp-formula.md`, `plan-world-replacement.md`): per-species feel tuning (speed/xpFactor cheap; **HP/damage re-price every placement**, cost table in the archived banner) · levels 21–30 standing gap (D5) · the §12.2 rising-absolute-award note.

- **⭐ backlog §52 - leaving the world without a reload, PO-asked 2026-08-11.** Owned by **`docs/plan-leaving-the-world.md`** (designed 2026-08-04, nothing built; ⚑ line refs pinned to `1ac8078e`, re-verify first; shape **(B)** reset-not-teardown is plausibly one chunk). **backlog §48** is blocked on this.

- ⚑ **Step 8a closed WITHOUT backups, deliberately** (PO 2026-08-04): the live DB is **losable**; **C3's memorial is the named revisit trigger**. The security items (firewall, DB to localhost, credentials, non-root deploy) were never part of the ruling and are still owed: `plan-playtest-deploy.md` §Ops & security posture.

### Open items

- **Feedback flow + the UI pass:** new feedback lands ONLY in **`docs/feedback.md`** (four exit doors; plan docs never double as intake). **All UI work is consolidated in `docs/plan-ui-pass.md`**: direction C "Inked Panel" RATIFIED (⚑ the §4 CORRECTION block IS the spec); §5 order C1-C11 RATIFIED; **C1-C8 SHIPPED** (2026-08-26 – 09-02), PO-approved; **next: C9 (mobile)**. The two C8-play intake rows (tooltip → A · unlock VFX → B + louder entry-point trail) and the same-day row-glow replay were ruled + fixed 2026-09-06, `b8bd3d0b`, ledger §6 C8 rider; PO play owed. ⏸ `plan-onboarding-cleanup.md` DEFERRED, trigger: a human coworker is actually about to join.
- **Omni trio PO in-game check still pending** (`9ee8cdb4`, 2026-08-18, cheat-only test rigs OmniAura/OmniPassive/OmniStrike; entry now in `docs/archive/status-history.md`) - low stakes, the one-off `omni-smoke` 17/17 already covered the surfaces headlessly.
- **Smaller open threads:** §47 stale "Connection lost" banner in a second window · §51 transient second queue entry · a character-name **content** filter (spam passes the charset guard) · mobile perf ceiling, PO: "works for now" (cheapest next: `MOBILE_MAX_RESOLUTION` 1.5) · avatar/faction defaults (blocked on `plan-avatar-system.md`) · the password-reset plan's own five questions · `r7-respec-cost` screenshots inside its own 4 s confirm window (one-line fix, PO call).
- **Ascension's leftovers** (`docs/archive/plan-ascension.md` §8): lore + art for both stones · channel/hunt-gate numbers [PLACEHOLDER] · ⚑ the ceremony's effect is visible **only to its own player** (D29) - a shared moment is a wire field, a **§39** conversation.
- **Known-inconclusive at HEAD**, all unowned: `chunk3-charm` 6–8/9 (D9 fragility) · `filler-batch` leg 1 (stale assert) · `chunk3b-ii-conversation` **28/34** (stale TownCrier assert + Leave-click race + Wanderer drift-pin — re-confirmed 2026-09-06) · `accounts.TestRepeatedFailuresAreThrottled` under `-race` ONLY · **`AuraTiledConvert.test.ts` byte-stability ×2** on a fresh checkout (they pin the PO's uncommitted world.json repair; the 30× `world.json` is GONE at HEAD — world is 263 KB / 144×72). ⚑ **The 3 `items/mobs` census tests are still the defect even though green**: they hardcode a roster/count, so ANY new mob or NPC reddens them (`docs/feedback.md` 2026-09-05, needs a door). Backend suite **fully green 2026-09-06**; the frontend legs above were not re-run. ⚑ **Measure the rate before diagnosing a flake** (a misread cost `chunk3b-interact` two chunks); ⚑ **this host's wall clock is non-monotonic** — suspect it before any elapsed-time red.
- **Backlog watch items** (`docs/backlog.md`): §25 D+E · §27.2.4–7 (⚑ §27.2.6 needs re-surveying) · §29 lost-WebGL-context trigger unknown · §37 skill-level/augment rework · §39 entity-presentation rework, owned by `docs/plan-entity-presentation.md` (medallions first) · §34 hard collision · §58 **ANSWERED by Tiled** (⚑ not closed until the PO has moved a real texture in Tiled) · round-6 item 4 target stickiness · ⚑ **§57 attack-lines PROTOTYPE deliberately NOT merged** (`prototype/attack-lines` `cf305284`; a shipped version is a §39 consumer).
- ⭐ **M1-F5 - dormancy vs. a CREDIBLE world sim** (`plan-world-scale.md` §11 M1-F5, PO-raised): **(A)** an unobserved mob-vs-mob fight never ends (mob-on-mob hostility is AUTHORED CONTENT; a slept mob is out of `phy.Space`, so also unhittable) - a **design ruling**, not a perf tidy-up. **(B)** a mob can freeze **mid-walk-home off its route**: no return mode exists, the walk-home sits INSIDE the idle path (`model/mob/patrol.go:108-113`), so `Pristine()` goes true mid-return - ⚑ **the case L7 does NOT cover**; a narrow D3 amendment (refuse sleep while `returnPosSet`).

- **Open PO calls:** four - ⭐ **should `EntitiesMarshalFlatbuf`'s `default:` stop panicking?** (from the corpse fix): `recover()` swallows it, so an unhandled entity type makes the server read **FASTER**, not broken - which is how that bug hid eight weeks · the portal pair's COST (`plan-portal-spells.md` §10 item 13; cheat-only until an unlock path is placed) · does a QUEST turn-in row advertise the ability it pays? · should FireShield's flat reflect scale? (3 HP at L1 = 3 HP at L30 by the C2 raw-damage ruling; `content-passives.md`). Replacement art + domain parked until v1; wiki generator kept.

- **Standing locks:** **NO CI BY CHOICE** (PO 2026-08-12; revisit at roadmap step 9) — the per-chunk local verify tail is the gate. Balance FINALs (growth **1.12 × maxLevel 30** · regen **0.00033 × taper 1.0→0.4** · campfire **0.12** + heal **2 % of max HP** · **base damage aura FREE at every resource level** · downtime 10 s + chain 20) are guardrail-asserted in `cmd/simharness/guardrail_test.go` — that file is the single source; drop + milestone tables TUNING-OPEN (Damage@L1 · Discipline@L5 · Haste@L7); density = mob visible per ⅔-screen window. Day/night cycle **OFF** (don't re-enable without collapsing the ~25 per-layer filter passes).
- **Content rules:** new mobs **must** author tier + baseline (raw `maxHealth` hard-fails) and price XP with `factors.xpFactor` (absent → 1, `0` = pays nothing AND no nameplate, **no species authors 0.5**); tier ≥ elite **must** author `factors.ccImmune`. Full rules: the `add-content` skill.
- **Gotchas & dev tools:** **A shape removed from `phy.Space` is purged from every other shape's collision set on the spot** (§54) — never "optimize" that sweep away ([[project-ghost-references]]). ⚑ **A content edit does NOT invalidate the Go test cache** — after any `api/` change use `go test -count=1`. ⚑ **A ZONE edit is HALF-LIVE, and the seam is BOOT TIME**: the client bundles `api/zones` straight through webpack (`GroundTextureManager.ts:77` `require.context`) and HMR re-reads it on every Tiled save, but **`aurad` reads the zone exactly once, at boot**. So a Tiled save RENDERS instantly while every server-side consequence (path corridors, prop colliders, spawns) is still the zone the running server started with — geometry that looks right and behaves wrong. **Fix: restart the server after any Tiled save** (`./scripts/dev-restart-windows.sh server`). Cost a debugging session 2026-09-07 (water drew, did not block). ⚑ **And since 2026-09-10 the DIRECTORY IS THE ZONE LIST**: a new `.json` in `api/zones/` loads on the next boot with no conf edit — and a half-authored one now REFUSES the boot instead of being ignored, so park WIP outside the directory. `game.startZone` names only which zone a fresh character spawns in. ⚑ **Second, independent trap for anyone NOT booting `-content ../api`**: without that flag `aurad` reads the EMBEDDED copy at `backend/pkg/api/zones/`, which only `cp-defs` refreshes. `dev-restart-windows.sh` passes the flag, so on this machine only the boot-time seam applies. ⚑ **The starting aura is pre-equipped but NOT active** — the first press of `1` switches it on. **Cheats:** GOD, WARP `<x·120> <y·120>`, SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST (dump / `ACCEPT` / `ABANDON` / `ADVANCE`). `make -C backend build` runs `cp-defs`; boot `-content ../api` for content iteration.

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
