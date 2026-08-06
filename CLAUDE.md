# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- HARD CAP: "Last completed" + at most TWO "Prior" entries, each ≤10 lines with a
     ledger pointer. When adding a new entry, move the oldest verbatim to
     docs/archive/status-history.md. FULL per-chunk ledgers live in the plan-*.md
     banners; the sequence lives in roadmap.md "Execution order". Never paste a full
     session banner here — see the `chunk-wrap` skill for the collapse rule. -->

### Recent (cap 3 — older entries: `docs/archive/status-history.md`)

- **⭐ Last completed: WORLD RE-PLACEMENT C0 — THE HONEST PLATE** ✅ `[uncommitted]` 2026-08-06, headless-verified — **the client's frozen copy of the gray rule is deleted, so a nameplate's colour is now a FUNCTION of what the kill pays.** `Welcome` carries `gray_base`/`gray_step` (appended at slots 6–7, both binding sets regenerated together) and the boundary is derived. Measured in one world, one run, at player level 18 (`ZD(18)=8`): the isolated **Marauder (cL12) plates GREEN and pays 222 XP** while the **cL2 Boar beside it plates gray and pays 0** — the deleted −5 rule grayed **both**. ⛑ **The tempting wiring is the wrong one and a codec round-trip cannot tell them apart**: `core.Config(config)` is already threaded in, but `curve.Normalized` falls back **per field**, so a conf omitting the block (the live server's) pays 5/6 while the raw block reads **0/0** — shipping raw hands the client `ZD=0` and grays every mob below it. The wire reads `mob.KillXPConfig()`, and the discriminating pin had to start at `g.welcomeMsg`. *When a value has a normalizing accessor and a raw source, a test downstream of the choice cannot see the choice.* ⛑ **That pin also holds the BOOT ORDERING** — the Welcome is marshalled **once**, at construction, so this is only correct because `SetKillXP` runs before `NewGameWith`; a reorder would ship defaults to every client with the boot log still printing the right numbers. ⛑ **The vitest table found a real off-by-one at `ZD=0`**: `Δ <= -ZD` reads `Δ <= 0` there and grays the *at-level* mob, because the server only consults the gray distance on its below-you branch. Found because the oracle is an independent mirror of `curve.Modifier` asserting the **biconditional**, not a restatement of the client's arithmetic. ⛑ **Gray branches FIRST, not as green's lower edge** — `grayBase` is a conf-only knob, and a narrow band pushes the boundary up into "even", where a green lower edge leaves **yellow** plates paying nothing. ⛑ **No client-side fallback pair**: it would re-create the copy being deleted, and the pre-Welcome window is structurally empty. ⛑ **The harness derives its expectations from `backend/conf.json`** — a hardcoded table would be a **third** frozen copy; an early draft hardcoded "the Marauder pays" and went red the moment the band narrowed, *a frozen expectation about the gray rule inside the script written to prove the client no longer holds one*. ⚑ **The strongest evidence is the conf-only second run**: `grayBase: 2` + restart, **no rebuild** → the same Marauder plates gray and pays 0. A boundary that tracks conf cannot be a constant. ⚑ `backend/conf.json` is **gitignored** — `git checkout` will not restore it. ⚑ **Nothing was tuned**: D8's A-vs-B stays with `xp C2`. Verified: `tsc` clean · **vitest 235/235** (8 new, the ZD-0 case **proven RED first**) · `go build`/`go vet` clean · full Go suite **53 packages, 0 FAIL** · `db-test` green uncached vs `aura_test` · boot `-content ../api` 15 factions/87 skills/65 mobs/3 milestones/10 recipes/4 quests/5 props/777 props/485 spawns/5 campfires, **0 panics** · **`hygiene-wire-prune` clean** (637 sprites — the mandatory `.fbs` gate) · **`c0-honest-plate` 6/8 + `c0-narrow` 6/8, 0 FAIL, 0 console errors** (NEW, registered in the coverage map) · **`npc-portraits` 4/4 plate-less**. ⚑ **Two pre-existing reds, both proven against HEAD**: `sys.TestDwell_TakeoffDropsAnInProgressCount` is **nondeterministic** (clean HEAD 4/5 fail, this tree 1/5 — unowned, new), and **`c2-mob-level` scores 4/7 with or without C0** — its CONTROL Stag (spawn 172, still authored) is not alive at run time; **venue rot in that script**. **Schema impact: DB NONE · FlatBuffers YES** (two appended scalars) **· content JSON NONE.** Full ledger: `docs/plan-world-replacement.md` §12 C0.
- **Prior: MOB LEVELS C3 — THE EDITOR CAN AUTHOR A LEVEL, AND SAVING NO LONGER DELETES IT** ✅ `0c6eca22` 2026-08-05, headless-verified — **L7 is discharged, which ends the plan's build work: all three chunks are in.** The spawn tool has a *Level* field (blank = inherit) and `getZoneAsJSON` **names** it, so an override survives the save that used to eat it. Measured on the real export path: a Wolf placed at 15 exports `"level": 15`, the same Wolf with a blank field exports **no `level` key at all**, and none of `world.json`'s 485 spawns gained one. ⛑ **The blank-field leg is a SEPARATE assertion from "the level round-trips", and it is the one protecting the other 485 spawns** — both go green with a serializer that writes a default; only absent-stays-absent goes red, and without it one edited spawn becomes a 485-line diff that freezes every inherited level into a copy. ⛑ **`populateSpawnControls` is a SECOND instance of the same silent-loss class**: Update reads the *input*, so a field left blank on selection writes the blank back over the level — the whitelist ate it on save, this would eat it on edit. Own harness leg. ⛑ **The editor refuses FRACTIONS, which the loader's rule does not cover** — `Spawn.Level` is a `*int`, so a `2.5` fails `json.Unmarshal` at boot instead of the friendly `>= 1`. *An input mirroring a validator must also mirror the parser underneath it.* ⛑ **Beyond the plan's letter, vetoable: the map marker says `Wolf L15`** — only when overridden (a bare `Wolf` otherwise, L6); asserted as the pair, 1 × vs 122 ×. ⛑ **Three harness attempts died at SETUP, both causes now in the script header**: **`&textures` mounts the editor, not `&develop`** (a `&develop`-only URL leaves every `#zoneEditor_*` id out of the DOM — reads exactly like "the field was never added"), and `window.game` is the six-member console façade with no `player`/camera. ⛑ **`elementFromPoint` over open world returns the `#inputAreas` overlay, not the canvas**, and **a `page.click` on a control inside a `hidden` group HANGS rather than fails**. ⛑ **The editor's zone JSON is webpack-BUNDLED, not fetched** — a hand-authored level needs `npm run build`, the *opposite* of C2's server-restart probe. **Placement is deliberately NOT in this chunk**: no `api/zones/*.json` changed; roadmap step 2 (the world re-placement pass) owns the content. Verified: `tsc` clean · **vitest 227/227** (2 new, the round-trip pin **proven RED first**) · `go build`/`go vet` clean with **no Go file changed** · boot `-content ../api` 15 factions/87 skills/65 mobs/3 milestones/10 recipes/4 quests/5 props/777 props/485 spawns/5 campfires, **0 panics** · **`c3-zone-editor-level` 7/7, 0 console errors** (NEW, registered in the coverage map) · no other harness, reasoned: no wire, no server, no `.fbs` — **`hygiene-wire-prune` not required**. **Schema impact: DB NONE · FlatBuffers NONE · content JSON NONE.** Full ledger: `docs/plan-mob-levels.md` §11 C3.
- **Prior: MOB LEVELS C2 — THE NAMEPLATE STOPS READING THE CATALOG** ✅ `f1d6eebc` 2026-08-05, headless-verified — **an overridden mob's plate now tells the truth, which discharges L3: a per-spawn level may reach a live zone.** Measured at the real surface: a Stag placed at `level: 25` plates **"Stag 25" in red** beside an untouched Stag of the *same species* at **"Stag 1" in yellow** — one world, one run, two levels. `Mob.level:ushort` appended at slot **24** (nothing renumbered, both binding sets regenerated together), `Level()` added to `model.MobEntity` exactly as C1 predicted, and `codec/mob.go` encodes the **effective** level. ⛑ **The plate text is written ONCE and the tint is not, so the obvious `setLevel` ships a half-fix that looks 50 % correct**: `setMobId` early-returns on an unchanged id and stamps the text, while the level arrives on a *later field of the same snapshot* — a setter that merely stored the number would leave every plate catalog-fed **forever** and the tint still *right*, because the tint recomputes per frame off a cached difference. *General shape: when two derived views of one value refresh on different disciplines, the lazy one hides the staleness and the eager one disguises it.* Both now route through one `effectiveLevel()`, and the harness asserts them **separately**. ⛑ **The snapshot field is `mobLevel`, deliberately not the existing character-only `level` slot** — reusing it would make `isDefined(entity.level)` newly true for every mob and silently widen what the character path sees (§35 in the making). ⛑ **Encoding the EFFECTIVE level buys the summon case free**: an owned mob with `SetSpawnLevel(25)` goes on the wire at its *owner's* 12; the raw override would have plated an unoverridden mob **"Stag 0"**. ⛑ **§9's wire-0 → catalog fallback needed no test — it is the first-frame path every mob traverses**, so every green plate entered through it. ⛑ **The verify probe needs REVERT-BEFORE-REBUILD, not just revert**: `cp-defs` would bake a throwaway zone `level` into the binary; verified it never fired. ⛑ **§8.2's gray-tint seam went hypothetical → live** — client and server finally read the *same* number, so all that is left is `DIFFICULTY_BANDS` (−5) vs `ZD(P)=5+⌊P/6⌋`, diverging above player level ~6. Owned by nobody. Verified: full Go suite **53 packages, 0 FAIL** (incl. `db-test` vs real Postgres) · `go build`/`go vet` clean · **3 new codec tests, all proven RED first** · `tsc` clean · vitest **225/225** · boot `-content ../api` 15 factions/87 skills/65 mobs/3 milestones/10 recipes/4 quests/5 props/485 spawns/5 campfires, **0 panics** · **`hygiene-wire-prune` clean** (645 sprites decoded — the mandatory `.fbs` gate) · **`c2-mob-level` 7/7** (NEW, registered in the coverage map) · **`npc-portraits` 4/4 plate-less** · **`chunk2-follower` 5/5 + 1 SKIP**, identical to C1's. **Schema impact: DB NONE · FlatBuffers YES** (one appended field) **· content JSON NONE** — the probe was reverted, C3 still owns the first real placements. Full ledger: `docs/plan-mob-levels.md` §11 C2.

### Next

- **World map part 1 is DONE, live, mobile-verified and ARCHIVED** (`docs/archive/plan-world-map.md`) — C1+C2+C3 all shipped 2026-08-04, the phone pass closed on a real device against the live build, and the deferred `features/map/` rename taken the same day (directory only: `MiniMap`, `IMiniMapRendered` and the `game.miniMap` harness handle keep their names). ⚑ Two tuning questions ride forward, owned by nobody yet: the marker sizes + dot colour are [PLACEHOLDER], and **your own dot is invisible while you stand at your bound fire** — which is exactly where you respawn. ⚑ **Flight C4 gave the second one a bigger blast radius and a measurement**: `dot r=3.5 px` under a `9.0 px` marker, and D16 means **every flight arrival ends with the flyer's dot occluded on every observer's map** — so the payoff of watching someone cross the map stops the instant they land. It is a marker-sizing call, still owned by nobody.
- **FAST TRAVEL IS DONE, LIVE, PO-VERIFIED AND ARCHIVED** (`docs/archive/plan-flight-paths.md`) — part 1 (the map) 2026-08-04, part 2 (flight) 2026-08-05: C1 inside world-map C2 · C2 `bc01a45c` · C3 `bcfb4faf` · C4 `fc000765`, and ⛔ **C5 was CUT** (**D17**). It had shrunk twice before it was ever started — each time because a **precondition disappeared rather than scope being deferred** — and C4's in-game pass came back *"everything works and looks good, no changes needed"* without the route overlay that was all it had left. **YAGNI, applied to a plan document.** ⚑ The overlay stays a legitimate idea for the day the world is big enough to want a drawn line; it is ~96 s wide on foot today, and §9 always said this was infrastructure built ahead of the size that justifies it. **Backlog §41 is closed by this.** ⚑ **C5 SHRANK during C3's feel pass**: its confirm dialog existed mainly to give the silent refusal a voice, and the PO's `E`-at-the-fire ruling **removes that case** (an `M`-opened map is read-only, so the flight map is unreachable unless you are already standing at a discovered fire). What is left is the **route overlay**, plus one open question — whether a real dialog replaces the two-press arm or the arm simply stays. ⚑ Speed **2.8×** and viewport **1.2×** are PO-tuned but still [PLACEHOLDER]; the viewport cut also spent §4.3's mobile-perf premise (streamed area ~1.4×, down from ~6.25×).
- **⭐ MOB LEVELS IS BUILT OUT — C1 + C2 + C3 all shipped 2026-08-05** (`docs/plan-mob-levels.md`) — a zone spawn point may author `level`, the mob stands at it, its nameplate says so, **and the editor can now author and save it**. ✅ **L3 and L7 both discharged**: an overridden spawn may reach a live zone (proven as "Stag 25" in red beside "Stag 1" in yellow, same species, same world), and the whitelist no longer eats the field on save — hand-authoring is safe again. ⚑ **The plan stays in `docs/`, NOT archived**: C3's second half — *"the PO places the first real overridden spawns"* — is content, and **no `api/zones/*.json` has one yet**. What shipped is the tool. ⚑ **The next step is content, not code**: the world re-placement pass — ✅ **DESIGNED 2026-08-06, `docs/plan-world-replacement.md`** (D2–D5, **three** chunks), and its ⭐ **C0 SHIPPED 2026-08-06** — so the next session is **C1, the decisions session**, which needs the PO in the loop for all four of its items (ratify the region map as a **total partition** — §3.6 leaves 89 spawns in the seams · ratify the band table · re-author `curveLevel` for Bear/OrcGrunt/EliteBandit and rule ArmySoldier · O3+O4). ⭐ **D5: the band stays the roster's current ~1–20 and the top of difficulty is NOT retuned** — a 144 × 72 world is too small to spread 30 levels and still give options per level range, so **levels ~21–30 are a recorded standing gap** and the pass touches no Go. Still the long pole. ⚑ **The chain past C3 got LONGER the same evening (`plan-xp-formula.md` D9)**: **C3 (the tool) → a world RE-PLACEMENT pass (the content — sensible level bands, gaps filled; **now `plan-world-replacement.md`**, and where `curveLevel`-doesn't-track-difficulty finally gets fixed) → sim-harness PLACEMENT support (new plumbing, reversing this plan's §8.3) → `xp C2` as one final calibration pass**. ✅ **The §8.2 gray seam is CLOSED** — ruled by D7 and shipped as world-replacement **C0** (2026-08-06): the frozen `DIFFICULTY_BANDS` gray row is deleted, `grayBase`/`grayStep` ride `Welcome` (the two knobs, **not** the resolved ZD, which goes stale on every ding), and the boundary is derived. Measured direction, recorded backwards at first: a **green** plate always pays; it was **gray** plates that still paid, from player level 12 up.
- **XP FORMULA: C1 shipped, C2 is the open half** (`docs/plan-xp-formula.md`) — the mechanism is live and headless-verified. ⭐ **RE-SCOPED 2026-08-05 evening by D7–D9 (§12) — C2 IS NO LONGER "CALIBRATE NEXT".** It is the *single final pass*, behind mob-levels C3 + a world re-placement pass + sim-harness placement support. ⚑ **D8: green must pay MEANINGFULLY, not merely non-zero — and §11's candidate band table does NOT answer that.** Measured: `mod` tapers linearly to zero, so a **wider** band makes the deepest green rung pay a **smaller** fraction (10 % → 6.7 % → 5 % at L30). It is a question about the taper's SHAPE (reopens D2) or the boundary's DEFINITION (gray = "pays < ~15 %" rather than "pays 0"); §12.1 costs both, and **neither blocks D7's plumbing — which has now SHIPPED** as world-replacement C0 (2026-08-06), so whichever way A-vs-B goes, the plate will follow it for free. ⭐ **The PO played C1 and the verdict was "works as designed" — but it surfaced that the ROSTER, not the formula, is what's broken (D6 + §11).** Measured: **at level 20, exactly two rungs of the 36-species roster pay anything** (cL18, cL20), because 27 species sit at cL1–7 and **cL13–17 is completely empty**. Three problems live in that: the **hole** (→ `plan-mob-levels.md`, now unblocked, places a level-15 Wolf without new species) · **`curveLevel` not tracking difficulty** (AngryMammoth, SaberToothCat, ProvingBoss are all authored **cL1**) — a content re-authoring pass neither plan owns, and C1 made it *more* load-bearing since a bad level now mis-prices XP as well as mis-scaling HP · and the **band**, left as-is deliberately. ⚑ **The band knob is conf-only**: `game.player.killXP.grayBase`/`.grayStep` — edit `backend/conf.json` + restart, no rebuild (verified). The PO's requirement ("10 levels of difference should still lead to some progress") is recorded as the acceptance test with four costed candidates in §11. ⚑ **C2's sequencing problem is now a RULING, not a recommendation** (D9): calibrating against a roster with untrustworthy levels and a five-level hole calibrates against noise, so the content comes first — and "first" is three steps, not one (see the mob-levels bullet). The **world re-placement pass now has a plan (`plan-world-replacement.md`, designed 2026-08-06) and still has the longest lead time**; it is the real next thing after mob-levels C3. ⚑ Its design session corrected this bullet twice: the hole is **21–30**, not just cL13–17 (the *placed* roster tops out at cL20), and **AngryMammoth / SaberToothCat / ProvingBoss are all UNPLACED** — the live offenders are Bear, OrcGrunt, EliteBandit and 18 non-paying ArmySoldiers. C2 itself = the §8.1 pacing call (flat ~7.5 kills/level for all 30 levels — should the late game be slower?), the §8.2 kite list, and the two-ended in-game pass. It is the plan's LAST chunk.
- **backlog §48 — "there is one join path"** (the reconnect token is deletable) — traced `cd8fd4ba`, but **BLOCKED on §52** (leaving-the-world-takes-time, filed `94fec351`).
- ⭐ **STEP 8a IS DONE AND CLOSED** (PO 2026-08-04). ⚑ **It closes WITHOUT backups, deliberately**: the live server is still a testing ground even though it is externally reachable, and *infinite persistence is not the ultimate goal yet* — so losing the live database costs a playtest, not a player's history. Treat it as **losable**; nothing off-box holds a copy. **We will come back to it** — the natural trigger is the sacrifice loop, where a bloodline is by definition supposed to outlive the character. The rest of §8's ops work shipped by being used (provisioning + migrations, exercised live by `000002`). ⚑ The ruling covers **durability only** — the *security* items (cloud firewall, DB bound to localhost, credential handling, non-root deploy user) are untouched and still owed: `plan-playtest-deploy.md` §Ops & security posture. Ruling box: `docs/archive/plan-accounts-implementation.md` §8. ⚑ **Step 8b is NOT closed** by this (UI polish rest-of-checklist, avatar system, location music) — the 8a/8b split exists precisely so they close independently.
- **Next up: ASCENSION, the character-sacrifice loop** (persistence's first consumer, and the visibly-next item) — ✅ **DESIGNED 2026-08-04 (`e80c8a93`), SCOPE CUT 2026-08-05 (`73120512` + `90d0ceb4`)**, `docs/plan-ascension.md` (14 PO rulings D1–D14; ratifies backlog §36). The next session is **C1, not a design pass**. ⭐ **D13 cut the point economy**: v1 ascension is **picking one skill from a curated list, and nothing else** — no random roll, no points/prices/banked balance, no feat gates. All deferred-not-blocked behind one nullable gate field on the catalog entry (which is also where `plan-camps.md`'s faction condition lands). ⚑ **Schema impact is NONE — the migration disappeared with the economy**, verified against the shipped `000001` DDL: `bloodline_unlocks` takes a bare `unlock_key` insert, **and its PK enforces the no-duplicate-picks rule for free**; `game.bloodlines` and the spellbook seed-provenance column existed only to serve scoring. So **C1 halved** to catalog loader + the two-write transaction + successor seeding — but it still owns the sacrifice transaction 8a deliberately deferred, and it is where the backup question comes back: a bloodline is supposed to outlive the character. ⚑ Two things C1 must not get wrong: the successor **cannot** share the transaction (creation is interactive — "a sacrificed character with no heir" is reachable and benign), and `plan-camps.md` L0 puts the **camp-standing wipe** in this plan's C1 — whichever of the two ships second owns that assert. Superseded rulings live in the plan's §10, never in its body. ⚑ **D12 came true without us**: it pre-ruled discovery-wipe for a fast travel that then shipped 2026-08-05 already per-character, so the wipe is structural and **backlog §41 needs nothing**.

### Open items

- **Needs a PO call:** `#registrationNag` covers the open mobile ☰ sheet (journal unreachable on phones; `mobile-layout.mjs` leg 7 legitimately red).
- **Intake round 8** (`plan-playtest-feedback.md` §Intake round 8): item 2 — stale quest info after turn-in (recommended: a third condition sentinel `running`); item 3's **feature** half — auto-walk (bug half shipped `c8163ad1`). Round 7: only **totem tooltips** (item 3, third raise) remains — needs catalog/data design.
- **Fast-travel tuning, orphaned by the archive** (both PO-seen, neither owned): **marker sizing** — your own dot is invisible at your bound fire, *and* since D16 **every flight arrival ends with the flyer's dot occluded on every observer's map** (measured `r=3.5 px` under a `9.0 px` marker), which is the same call with a much bigger blast radius · **flight speed 2.8× and viewport 1.2×** are PO-tuned but still [PLACEHOLDER].
- **Smaller open threads:** §47 the stale "Connection lost" banner in a second window · §51 transient second queue entry (readability) · a character-name **content** filter (spam registrations pass the charset guard) · mobile perf ceiling — PO: "works for now, needs some love" (cheapest next: `MOBILE_MAX_RESOLUTION` 1.5; the minimap is a second per-frame GL context).
- **Outside 8a, deliberately:** sacrifice transaction · `bloodline_unlocks` writes · avatar/faction defaults (blocked on `plan-avatar-system.md`) · the password-reset plan's own five questions.
- **Backlog watch items** (`docs/backlog.md`): §25 D+E · §27.2.4–7 (⚑ §27.2.6 needs re-surveying first — 1b/R5 moved its sites) · §29 lost-WebGL-context trigger unknown (detection shipped `6c8bde2e`; a blank world without the `[webgl]` log line is something else) · §37 skill-level/augment rework (coupled to the caps ruling) · ~~§38 per-spawn level override~~ **CLOSED 2026-08-05** by `plan-mob-levels.md` C1–C3 (server, wire+plate, editor) · §39 entity-presentation rework (don't invest in per-effect overlay art before it) · §34 hard collision (not taken) · round-6 item 4 target stickiness (ruled unfixed; re-opens on measured cost, and its damage-smear half is what a playtester would report).
- **Known-inconclusive:** `chunk3-charm.mjs` red 6–8/9 across four runs (the accepted D9 fragility), HEAD baseline hung — not cleared.
- **Open PO calls: none outstanding** (2026-07-29 sweep). Replacement art + domain parked until v1; wiki generator kept.

- **Standing locks & gotchas:** growth **1.12 × maxLevel 30**; regen **0.00033 ≈1%/s × taper 1.0→0.4** FINAL; §11 no-pity + campfire **0.12** + heal cost **10 % → 2 % of max HP across its 10 levels** FINAL (the numbers rewrite converted the old absolute 10−2/level to a fraction; it was already exactly 10 % of the pool); **the base damage aura stays FREE at every resource level** (round-6 ruling — no cost curve may ever leave a player with no action; GDD §3); drop + milestone tables are **TUNING-OPEN** (milestones: Damage@L1 seeded at creation · **Discipline@L5** · Haste@L7); density = mob visible per ⅔-screen window; downtime 10 s + chain 20; guardrail asserts in `cmd/simharness/guardrail_test.go`. New mobs: **must** author tier + baseline (raw `maxHealth` hard-fails) and price XP with **`factors.xpFactor`** — absent → 1 (a full at-level kill), `0` = pays nothing *and* no nameplate, kite mobs 0.5 (all that survives of the Session-⑥ rule; raw `factors.experience` now hard-fails too, since kill XP is computed from the *killer's* level). Day/night cycle is **OFF** (`DAY_CYCLE_PRESENTATION_ENABLED=false`, bug unfixed — don't re-enable without collapsing the ~25 per-layer filter passes). Per-chunk placeholder values live in their plan docs. **A shape removed from `phy.Space` is purged from every other shape's collision set on the spot** (backlog §54) — do not "optimize" that sweep away: systems read those sets in priority order (`MobSystem` 20 → `PhysicsSystem` 0 → `NetSystem` −100), so an entity removed at the bottom of a tick is otherwise still visible to sensors at the top of the next one, and one stale read is enough to re-latch it forever. **Dev cheats:** GOD, WARP `<x·120> <y·120>` (1-unit granularity — land on a whole unit), SPEED, XP, SKILL, ANNOUNCE, THREAT, QUEST (dump / `ACCEPT <id>` / `ABANDON <id>` / `ADVANCE <id> <from> <to>`). `make -C backend build` runs `cp-defs` (reverts embedded `backend/pkg/api/` from `api/`); boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

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
- State the change's **database-schema impact** (even if "none"). If it touches persisted state: follow `docs/manual-db-migrations.md` (new migration pair, never edit shipped SQL) and run the `store`/`accounts` tests with `AURA_TEST_DB_URL` set
- For anything with a runtime surface, verify in-game (plan docs record per-chunk in-game checklists)
- Report the output — don't claim "done" without these checks.
