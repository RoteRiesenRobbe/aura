# Plan: structure in the spawn editor, and retiring the legacy roster

> **Status: C1 SHIPPED 2026-08-15 · C2 SHIPPED 2026-08-16 (ledgers §11) - C3
> open.** Designed 2026-08-12; four PO rulings taken as choice prompts (D1-D4);
> everything in §9 is proposal, vetoable. Line references were pinned to
> `f820777e` and verified unchanged at C1. Every colour and label is
> [PLACEHOLDER].

## 1. What this is

The zone editor places **five unlike things through one undifferentiated
control set**. Spawns mode offers a flat alphabetical list of all 68 mob
definitions, draws every placement as the same green diamond, and shows the
same seven inputs whether the thing being placed is a wolf, a village farmer, an
ascension stone, a barricade or a proving-grounds Dodo. Nothing on screen says
which of those you picked, and one of them cannot be edited at all (§4.6).

This plan gives the mode a **derived category** and lets three surfaces read it:
the picker, the map markers, and which controls are shown. It then retires the
legacy roster, which is the fifth category and the one that should not exist.

Inputs, all read during the session:

- `frontend/src/features/zone-editor/logic/ZoneEditor.ts` (672 lines) - the
  bundled registries, the marker overlay, hit-testing.
- `frontend/src/features/zone-editor/logic/_ZoneEditorPanel.ts` (816 lines) -
  the panel, the picker, the control read/populate pair.
- `frontend/src/features/zone-editor/logic/ZoneModel.ts` (328 lines) - the model
  and the export whitelist.
- All 68 `api/mobs/*.json`, `api/zones/world.json`, `api/zones/proving-grounds.json`.
- `docs/manual-zone-editor.md` §2-§5, `docs/plan-test-world.md`,
  `docs/archive/plan-mob-levels.md` (the L7 whitelist landmine).

### The two finds that shape the plan

**Every field a category needs is already in the browser.** `mobDefJSONs` is a
webpack `require.context` over the raw `api/mobs/*.json`
(`ZoneEditor.ts:43`), so the editor already holds `role`, `interaction`,
`legacy` and `factors.speed` for every def. The `MobDefJSON` interface
(`ZoneEditor.ts:34`) simply declares three of them. **The category is derived,
never authored**: no content field, no loader change, no server involvement.

**The editor cannot round-trip a talker today, and the convention it is missing
is already in the data.** `ZoneSpawn.respawnTicks` is a non-optional `number`
(`ZoneModel.ts:43`); the 17 interaction-carrying spawns in `world.json` author
no respawn keys at all; so `populateSpawnControls` writes `String(undefined)`
into a number input (`_ZoneEditorPanel.ts:644`), the browser blanks it, and
`readSpawnControls` then refuses the edit with *"Invalid respawn ticks"*
(`:595`). Selecting the village ascension stone and pressing **Update** fails.
Typing a number to get past it writes two keys the hand-authored file
deliberately omits, and placing a *new* stone always writes them (the HTML
defaults 900 / 0.2, `groundTexturePanel.html:222`).

⭐ **The correlation is exact and it is the whole design of the fix**: the
spawns in `world.json` that omit `respawnTicks` are precisely the 17 that carry
an `interaction`. The authoring convention is already "a talker authors no
respawn". Only the editor does not know it.

### The census

| bucket | rule | defs | placed in `world.json` |
| --- | --- | --- | --- |
| **Talkers** | carries `interaction` | 17 | 17 |
| **Combat** | everything else | 27 | 435 |
| **Fixtures** | `role: structure` | 10 | 36 |
| **Companions** | `role: follower` | 4 | 0 |
| **Legacy** | `legacy: true` | 10 | 0 (395 in `proving-grounds.json`) |

Companions are skill-summoned, never placed. The bucket still exists because
placing one is legal; it is simply expected to stay empty.

## 2. Decision ledger

Rulings **D1-D4** are PO-taken (2026-08-12). §9 holds the proposals adopted
without a prompt.

- **D1 - the buckets are DERIVED, not authored.** Talker / Combat / Fixture /
  Companion, computed from `interaction` and `role`, both of which every def
  already carries. Rejected: grouping by `role` alone (36 defs author no role,
  so they would all land in one unlabelled default), and grouping by faction
  (14 groups, and it would surface the `predator` / `wildlife_predator` and
  `prey` / `wildlife_prey` duplicate pairs, which are a legacy artefact this
  plan deletes in C3 rather than displays).
- **D2 - all three surfaces.** The grouped picker, per-bucket marker colour,
  and controls that follow what the picked species can actually do. Rejected:
  picker-only, which leaves the map a single undifferentiated layer, and a
  **separate NPCs mode**, which would reverse the standing npc-teaching ruling
  that NPCs are placed through Spawns mode (`manual-zone-editor.md` §3: *"There
  is no NPCs mode"*).
- **D3 - one Talkers group.** The three ascension stones and `ForestSign` sit
  with the villagers rather than in a signposts group of their own, even though
  `entityType: Signpost` would split them exactly. One rule, one bucket, no
  exception to remember.
- **D4 - the legacy roster is RETIRED, in its own chunk, next.** Not fixed into
  live content (that needs the replacement-art call parked until v1, plus
  tier/baseline authoring, guardrail compliance and placement in a roster that
  already covers cL1-20), and not parked behind a toggle. C1 and C2 ship first
  with a bottom Legacy group; C3 deletes the group and its content together.

## 3. What this is not

- **Not a prop-mode change.** Props have their own two-colour scheme
  (blocking / decorative) and are not part of the complaint.
- **Not a re-authoring of any zone.** `world.json` is not touched by C1 or C2,
  and the round-trip test exists to prove it (§7).
- **Not new content.** C3 removes content; nothing here adds a mob, a faction
  or a sprite.
- **Not a mob-definition schema change.** The derivation reads fields that
  already exist, with defaults for absent ones.

## 4. The design

### 4.1 The rule

```
kindOf(def):
  legacy === true      -> 'legacy'      (precedence: Brazier is BOTH legacy and structure)
  interaction present  -> 'talker'
  role === 'structure' -> 'fixture'
  role === 'follower'  -> 'companion'
  otherwise            -> 'combat'
```

Legacy first is deliberate and temporary: it exists so the ten defs read as one
block until C3 removes them, at which point the branch is deleted with them.

### 4.2 Where the rule lives

⛑ **`kindOf` goes in `ZoneModel.ts`, not `ZoneEditor.ts`.** `ZoneEditor.ts`
opens with `require.context`, which exists only inside a webpack build, so
vitest cannot import that module at all. `ZoneModel.ts` is pure, already has a
test file, and is the only place a unit test can reach. The function takes a
minimal structural def (`{role?, legacy?, interaction?, factors?}`), so it never
depends on how the defs got into the browser.

`MobDefJSON` gains **optional** fields only. An absent `role` or `legacy` is the
common case (36 defs author no role) and must fall through to `combat`, never
throw.

### 4.3 The picker

`<optgroup>` per bucket, in placement-frequency order: **Combat, Talkers,
Fixtures, Companions, Legacy**. Alphabetical within a group, as today.

The suffix rule changes with the group. `cL<n>` and the tier label answer *how
strong is this species*, which is a real question for a wolf and noise for a
farmer who is cL1 with `xpFactor: 0` because that is what every talker and
fixture authors. So the suffix shows on **Combat and Legacy** entries and is
dropped elsewhere.

### 4.4 The map

`drawSpawnMarker` picks its colour from the bucket instead of the single
`COLOR_SPAWN`. Combat keeps the current green (435 of 488 placements, so the
map a designer already knows stays the map they know); the others take hues the
editor does not use yet:

| bucket | colour | not colliding with |
| --- | --- | --- |
| Combat | `0x4CAF50` green (unchanged) | - |
| Talkers | `0xE91E63` pink | props red `0xF44336`, campfire orange |
| Fixtures | `0x9E9E9E` grey | everything |
| Companions | `0x795548` brown | dark-area purple |
| Legacy | green at reduced alpha | reads as "faded", deleted in C3 |

Selection stays yellow, so the selected marker is still unambiguous. The
diamond shape is unchanged: shape says *spawn point*, colour says *what kind*.

### 4.5 The controls follow CAPABILITY, not the bucket

⛑ **Gating on the bucket is wrong and `Wanderer` is the proof**: it carries an
`interaction` (a talker) *and* `factors.speed: 0.5`, and it wanders. Hide the
wander controls for talkers and its radius becomes unauthorable. `Turnip` is
the mirror case: `role: structure`, killable, and it does respawn.

So each control reads a predicate off the picked def:

| control | shown when | mirrors |
| --- | --- | --- |
| Wander radius, patrol route, traversal, idle speed | `factors.speed > 0` | the server's own boot refusal for movement on a speed-0 mob |
| Respawn ticks, respawn variance | def carries **no** `interaction` | the authored convention in §1 |
| Level | always | a per-spawn override is legal on anything |
| Angle | always | facing applies to everything |

Hidden, not disabled: a greyed row still costs a line of panel height in a
panel that is already tall, and the fields are meaningless rather than
temporarily unavailable.

⚑ The gating must run in **both** directions: on picker change (placing) and
inside `populateSpawnControls` (selecting an existing marker).

### 4.6 Respawn goes tri-state

Exactly the shape `wanderRadius` already has: `undefined` = the file authors
nothing, and the serializer omits the key (`JSON.stringify` drops undefined
values, the mechanism `ZoneModel.ts:286` already documents).

- `ZoneSpawn.respawnTicks` / `respawnVariancePct` become optional.
- `readSpawnControls` returns `undefined` for a hidden or empty respawn input
  instead of failing validation.
- `populateSpawnControls` writes `''` for an absent value instead of
  `"undefined"`.
- The export whitelist keeps naming both keys (naming them is what stops the
  L7 silent-drop class, `plan-mob-levels.md`).

**Server tolerance, so C2's executor does not re-derive it:** `world.Spawn`
carries plain `int` / `float32` (`world/zone.go:76`), so an absent key means
`0`, `rollDelay` returns 0, and the spawn point would respawn on the next tick.
For the 17 talkers that is inert - they are `townsfolk`, player damage skips
them, they never die - and it is exactly what the live world does today. **A
combat spawn must therefore never lose its respawn keys**, which is why the
predicate is "carries an interaction" and not "the input is empty".

### 4.7 What C3 removes

Retiring the ten legacy defs is really **retiring `proving-grounds.json`**,
because that map's entire population is legacy content: 226 Dodo, 94
SaberToothCat, 62 Mammoth, 9 Rabbit, 2 Brazier, 1 AngryMammoth, 1 Healer, and
not one live species among the 395 spawns.

| what | where |
| --- | --- |
| 10 mob defs | `api/mobs/` |
| the zone | `api/zones/proving-grounds.json` |
| 3 factions authored only by them | `api/factions/predator.json`, `prey.json`, `tusker.json` |
| the smoke encounter + its registration | `encounter/smoke.go`, `smoke_test.go`, `cmd/aurad/aurad.go:234` |
| the `-zone proving-grounds` path | docs, and the `zoneStems` picker entry disappears with the file |
| wire enum values | `EntityType` for Dodo, SaberToothCat, Mammoth, AngryMammoth, Rabbit, Brazier, Healer |
| client sprites and their registry rows | `frontend/src/client-data/Graphics.ts`, `features/game-objects/logic/Mobs.ts` |
| the headless placeholder | `sim/world.go:168` uses `EntityType: "Dodo"` and needs a live species |
| **a simharness test that hard-requires a legacy species** | `cmd/simharness/serve_test.go:59` does `require.True(ok, "embedded roster must contain SaberToothCat")` and fails outright on deletion |
| **guardrail exemption keys** | `cmd/simharness/guardrail_test.go:56-70` exempts `Rabbit`, `Dodo`, `ProvingAdd`, `ProvingGuard` and names the `ProvingBoss` ruling; the entries go stale with the defs |
| doc mentions | `manual-zone-editor.md`, `content-mobs.md`, `content-npcs.md` and the live plan docs that name proving-grounds |

✅ **The encounter spine keeps its cover without the smoke encounter.**
`warlord_test.go` exercises a live registered encounter (7 tests) and
`system_test.go` exercises the controller itself (7 tests, including
`SpawnMob_PlacesAndRegisters` and the death dispatch). So the smoke encounter
can be deleted outright rather than relocated onto live actors, which is what
keeps C3 to one session.

## 5. Schema impact

- **C1, C2: NONE at every layer.** Frontend only, two files plus a test file.
  No Go, no FlatBuffers, no conf, no DB, no content. Ordinary frontend deploy.
- **C3: FlatBuffers `EntityType` values are REMOVED.** That is the one
  wire-touching change in the plan: regen bindings on both sides
  (`api/schema/make.sh`, `make -C backend gen`), both-parts deploy. DB none,
  conf none. ⚑ Removing enum *values* leaves the remaining numbers untouched
  (they are explicitly assigned), but every reverse map, the client sprite
  table and the `EntityType` validation tests move together or the boot
  validation fails.

## 6. Chunk breakdown

- **C1 - the structure.** `kindOf` in `ZoneModel.ts`, `<optgroup>` picker with
  the new suffix rule, marker colour per bucket, and the `manual-zone-editor.md`
  §2/§5 rewrite (the "green diamonds" sentence stops being true). No data
  behaviour changes: an export before and after must be byte-identical.
- **C2 - the controls, and the talker round-trip.** Capability gating in both
  directions, respawn tri-state, and the round-trip test that proves a talker
  survives select and Update unchanged. This is the chunk that fixes the
  ascension stones being uneditable.
- **C3 - retire the legacy roster** (§4.7). Content deletions, the smoke
  encounter, the wire enum, the sprites, the doc sweep. Ends with the `legacy`
  branch deleted from `kindOf` and the Legacy optgroup gone.

Each chunk its own execution session, per working style.

## 7. Test strategy

- **`kindOf` is a vitest unit** over fixture def shapes: one per bucket, the
  legacy-beats-structure precedence case (Brazier), and the all-absent case
  (a def with neither `role` nor `interaction` is combat).
- ⭐ **A `world.json` round-trip test guards the whitelist, and it is NOT the
  test that proves the stone fix.** Load the real bundled zone through
  `ZoneModel.fromJSON`, serialize it, assert deep equality, and assert the 17
  respawn-free spawns are still respawn-free. ⛑ **That test passes at HEAD,
  before any fix**: `fromJSON` spreads the absent key as `undefined`,
  `getZoneAsJSON` emits `respawnTicks: undefined`, and `JSON.stringify` drops
  it, so the serializer already round-trips a talker clean. The bug lives
  entirely in the **panel** path (`populateSpawnControls` blanks the input,
  `readSpawnControls` then refuses, and a typed 900 is what injects the key
  into the model). So the tri-state is proven at the panel seam - a jsdom unit
  over the read/populate pair, plus the in-game check below - and the
  round-trip test stays as the L7 whitelist guard, because C2 edits the
  whitelist.
- **C1 proves byte-identity**: export `world.json` before and after the chunk
  and diff. A display change that moves one number is not a display change.
- **In-game per chunk** (the editor is a browser tool, so this is the real
  surface): open with `&textures`, C1 = the picker groups and the map reads at a
  glance; C2 = select the village ascension stone, press Update, and see it
  accepted with no respawn keys added, then move it and re-export.
- **C3**: `go test -count=1 ./...` (a content deletion is a content edit, and
  the Go test cache does not see `api/`), boot 0 WARN / 0 ERROR on `world`,
  and boot must now **fail cleanly** on `-zone proving-grounds` rather than
  half-load. ⚑ **The "sim batteries byte-identical" claim is C1/C2 only**: C3
  deletes species the harness names, so `serve_test.go` must be re-aimed at a
  live one and the guardrail exemption map pruned (§4.7). What must stay
  identical there is the classification of the **surviving** roster.
- ⚑ **The content censuses in `items/mobs` count defs.** Deleting ten will trip
  them the same way adding one did in ascension-sites C1; the `add-content`
  skill lists which.

## 8. Open questions and deferred

- **Does `proving-grounds` leave a successor?** `docs/plan-test-world.md`
  (planned 2026-08-02, not started) designs `testworld.json` as the modern test
  map, and it is the natural replacement. C3 does not build it; it simply
  removes the map that testworld was already designed to supersede. If the PO
  wants a debug map in the interim, the cheapest shell is a bounds-only zone
  with no spawns, and that is a C3 execution call.
- **`loaders_test.go:41` asserts the roster ships a mob-hunting faction and a
  passive one**, and names the smoke content in its comment. The live
  `wildlife_predator` / `wildlife_prey` pair satisfies it, so the assertion
  should survive C3 with only its comment updated. **Verify, do not assume.**
- ⚑ **A second live plan owns the same two files.** `plan-content-tooling.md`
  C1 (the dev-only save endpoint plus a zone-editor retrofit) and C2 (in-game
  drag-to-move) both land in `ZoneEditor.ts` and `_ZoneEditorPanel.ts`, and
  both became unblocked when ascension C1 shipped. Nothing here conflicts by
  design, but **whichever plan executes second reconciles**, and drag-to-move
  in particular lands on the marker code C1 recolours.
- **The picker still has no search.** 68 entries in five groups is navigable;
  if the roster grows past a screen the answer is a filter box, not more
  groups. Deliberately not built (YAGNI).
- **Prop mode is untouched** and has the same shape of problem at a smaller
  scale (blocking vs decorative is its only axis). Out of scope by §3.
- **[PLACEHOLDER] values:** every colour in §4.4, the group order in §4.3.

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **P1 - legacy wins the bucket precedence** until C3 deletes the branch.
  `Brazier` is both `role: structure` and `legacy: true`; showing it under
  Fixtures would scatter the ten defs across four groups on the eve of deleting
  them.
- **P2 - the `cL` and tier suffix shows only on Combat and Legacy entries.**
  Every talker and fixture authors cL1 and `xpFactor: 0`, so the suffix carries
  no information there and costs a reading.
- **P3 - controls are hidden, not disabled** (§4.5).
- **P4 - the diamond shape is unchanged**; colour alone carries the bucket.
  Shape already means "spawn point" against circles (props) and the campfire
  and anchor markers.
- **P5 - no new editor mode** (D2's rejected option, restated as a standing
  rule): Spawns mode stays the one place a mob, an NPC or a stone is placed.
- **P6 - C1 and C2 change no authored file.** `world.json` exports identically
  before and after both chunks. ⚑ Precisely: the serializer never wrote respawn
  keys onto the 17 talkers (it emits `undefined` and `JSON.stringify` drops
  it); what wrote them was a forced panel Update, which is the very thing C2
  stops requiring. The export is the invariant, the panel is the fix.

## 10. Landmines found while designing

- **L1 - the export is a WHITELIST, and it has bitten twice.** A field that
  lives only in `fromJSON`'s spread survives a load and vanishes on the next
  save. `spawn.level` was silently lost this way until `plan-mob-levels.md` C3
  named it in `getZoneAsJSON`, and the campfire `id` comment records the same
  class. C2 edits that function, so §7's round-trip test is not optional.
- **L2 - `String(undefined)` in a number input fails silently and then loudly.**
  The input blanks itself (the browser rejects the invalid value), and the
  failure only surfaces at Update as a misleading *"Invalid respawn ticks"*.
  This is the live stone bug, and it is the reason the tri-state has to reach
  `populateSpawnControls` and not just the serializer.
- **L3 - `require.context` does not exist under vitest.** Any pure rule that
  needs a test must live outside `ZoneEditor.ts` (§4.2). Discovered by asking
  where `kindOf` could be tested, not by a failing run.
- **L4 - capability, not category** (§4.5): `Wanderer` is a talker that walks,
  `Turnip` is a fixture that dies. Two counterexamples in a 68-def roster is
  enough to say the bucket must never gate a control.
- **L5 - the editor's registries are the real `api/` files**, bundled at build
  time (`ZoneEditor.ts` header comment: so the editor "can never drift from
  what the server loads with `-content ../api`"). C3's deletions therefore
  change the editor's picker with no frontend edit at all, and a stale dev
  server will keep offering deleted species until it rebuilds.
- **L6 - `sim/world.go:168` hardcodes `EntityType: "Dodo"`** as a wire-type
  placeholder for headless runs, with a comment saying it satisfies the lookup
  and nothing else. C3 must swap it, or every headless sim run breaks on a
  species that no longer exists.
- **L7 - the smoke encounter is registered by zone id string**
  (`aurad.go:234`, `zone.ID == "proving-grounds"`). Deleting the zone file
  without deleting that block leaves dead code that would resurrect on any
  future zone named the same.
- **L8 - three factions are authored only by legacy mobs** (`predator`,
  `prey`, `tusker`), and they are `legacy: true` themselves. They are easy to
  miss because nothing in `api/mobs/` will fail without them.

## 11. Chunk ledgers

### C1 - the structure ✅ SHIPPED 2026-08-15, `327f3828`, PO-verified in-game same day (all 10 checklist points pass)

**What shipped, exactly as designed.** `kindOf` + `MobKind` live in
`ZoneModel.ts` per §4.2, taking a minimal structural `MobKindDef`
(`{role?, legacy?, interaction?}` - `factors` deliberately left off; that is
C2's capability predicate, YAGNI here). `MobDefJSON` gained the three optional
fields; `mobOptions` carries `kind`; the picker is five `<optgroup>`s in §4.3's
order with `mobOptionSuffix` showing `cL`/tier on Combat and Legacy only (P2);
`drawSpawnMarker` reads a `SPAWN_KIND_STYLE` map (§4.4's colours, all
[PLACEHOLDER]) with combat keeping the exact old green and legacy as green at a
0.45 alpha fade; selection stroke stays full-strength yellow (P4). Unknown mob
names fall back to combat green rather than crashing the overlay build.
`manual-zone-editor.md` §2/§5 rewritten (the "green diamonds" sentences are
gone). **Schema NONE at every layer** (plan §5).

**Findings:**

- **The census is exact.** Fresh-grepped before building: 68 defs =
  27 combat / 17 talkers / 10 fixtures / 4 companions / 10 legacy, with
  exactly one legacy+structure overlap (Brazier) and zero legacy+interaction
  overlaps. §1's table held to the def.
- **Red-first without an injection seam:** a `kindOf` stub returning
  `'combat'` unconditionally left 5 of the 7 new vitest units red on
  assertions (not compile errors), then the real rule went green. One extra
  pin beyond the plan's list: `role: 'creature'` (Wanderer's actual value)
  falls through to combat - `role` has values beyond structure/follower and
  the fall-through is now a test, not an assumption.
- **Byte-identity proven with a temp instrument, then deleted:** a throwaway
  vitest read `api/zones/world.json` from disk, serialized it through
  `fromJSON` → `getZoneAsJSON` before and after the chunk; the 266 KB outputs
  diffed empty (P6 holds). Gotcha for the next such test: jsdom rewrites
  `import.meta.url` to a non-file scheme, so the file read needs an absolute
  path, not a `new URL(relative, import.meta.url)`.
- **One small call the plan left open:** the wander-radius disc and patrol
  route previews took the owner bucket's colour too (one marker, one colour) -
  so the Wanderer's amble disc is pink. Reads better, PO did not object.

**Verified:** vitest **328/328** (was 321) · typecheck · prod build ·
`go build ./...` · export byte-identical · a scratchpad DOM harness all green
(5 groups in order, census 27/17/10/4/10, suffix on 37/37 Combat+Legacy and
0/31 elsewhere, the stone with the Talkers (D3), Brazier in Legacy (P1),
0 console errors; screenshots: village pink talkers vs prop red, farm venue,
proving-grounds faded legacy) · **`c3-zone-editor-level.mjs` 7/7** (it owns
the spawn panel and `drawSpawnMarker`, both touched) · boot 0 WARN / 0 ERROR ·
`harnessdb -cleanup` run (5 accounts over the session). **Next: C2** - the
controls, the respawn tri-state, and the talker round-trip that fixes the
uneditable ascension stones (the "Invalid respawn ticks" refusal was re-seen
during the PO checklist and stays the known C2 target).

### C2 - the controls, and the talker round-trip ✅ SHIPPED 2026-08-16, `[uncommitted]`

**What shipped, exactly as designed.** `capabilitiesOf` joins `kindOf` in
`ZoneModel.ts` (the vitest-reachable home, L3):
`{moves: factors.speed > 0, respawns: no interaction}` over a minimal
structural `MobCapabilityDef` that never throws on `{}` (absent speed = the Go
zero value = does not move). The panel's read/populate pair moved verbatim
into a new pure module, **`SpawnControls.ts`** (`readSpawnValues` /
`spawnControlValues`); `_ZoneEditorPanel.ts` is now a thin DOM adapter that
collects strings and voices the error. `ZoneSpawn.respawnTicks` /
`respawnVariancePct` went optional (§4.6); the serializer needed no code
change - it already names both keys and `JSON.stringify` drops `undefined`.
Six panel rows got ids and are gated **hidden, not disabled** (P3): the two
respawn rows by `respawns`, wander / idle speed / waypoints / traversal by
`moves` - in **both** directions (a picker `change` listener for placing, and
`populateSpawnControls` for selecting a marker). `manual-zone-editor.md` §5
documents the gating and the talker convention. **Schema NONE at every layer**
(plan §5) - frontend only, ordinary frontend deploy.

**Rulings and findings:**

- ⭐ **§4.6's "hidden or empty" phrasing lost to its own bolded warning,
  deliberately.** The omit predicate is interaction-presence ONLY. A combat
  mob with a blanked input keeps the hard "Invalid respawn ticks" refusal,
  because an absent key parses to 0 server-side and the spawn would respawn
  every tick - a combat spawn must never silently lose its keys. Do not
  re-litigate the "or empty" reading.
- **Known rough edge, accepted:** selecting a talker blanks the (hidden)
  respawn inputs; switching the picker straight to a combat species unhides
  blank inputs, and the next place errors until values are typed. No re-seed
  logic on purpose (YAGNI); the HTML defaults still serve a fresh panel.
- **§7's claim verified before any change:** the world.json round-trip test
  passes at HEAD - the serializer was already clean, the bug lived entirely
  in the panel. The test is now PERMANENT in `ZoneModel.test.ts` as the L7
  whitelist guard (deep-equal against the real 488-spawn zone, plus the 17
  respawn-free spawns staying respawn-free).
- **Red-first without an injection seam** (the C1 falsification style):
  `capabilitiesOf` stubbed to `{true, true}` and the module ported verbatim
  first - 10 of the 22 new units red on assertions, including the live stone
  refusal AND the `String(undefined)` population (L2) reproduced at the
  extracted seam; 26 verbatim pins (variance coerces to 0, level integer >= 1,
  wander clamp, idle speed (0, 1]) proved the port before the fix landed.
- **The census held again:** the 17 respawn-free spawns in `world.json` are
  exactly the 17 interaction carriers, and all 68 defs author `factors.speed`
  explicitly (movers > 0, everything stationary 0) - the predicate needed no
  absent-speed judgment call in practice.
- **Harness gotcha for the next zone-editor probe:** the post-WARP camera
  settle measured **~40 s** at 1280×900 (the verify skill's "~20 s" is
  optimistic for cross-map jumps) - wait for in-viewport plus two stable
  samples, and map an arbitrary world point to its screen point via
  `character.shape.parent.toGlobal({x: u*120, y: u*120})` instead of clicking
  the character's own position.

**Verified:** vitest **350/350** (was 328) · typecheck · prod build ·
`go build ./...` · **`c3-zone-editor-level.mjs` 7/7** (owns the spawn panel) ·
throwaway stone harness **9/9**, then deleted (picker gating at all four
capability corners Wolf/Stone/Turnip/Wanderer · selecting spawn #483 populates
`''` never `"undefined"` and hides the gated rows · **Update accepted with the
266,071-byte export byte-identical, P6** · the stone still authors no respawn
keys after Update · a fresh stone placed with stale 900/0.2 in the hidden
inputs exports no keys · 0 console errors) · boot 0 WARN / 0 ERROR ·
`harnessdb -cleanup` run (5 accounts). **PO in-game checklist open:** select
the village ascension stone, press Update, see it accepted with no respawn
keys added, then move it and re-export. **Next: C3** - retire the legacy
roster (§4.7), the plan's one wire-touching chunk.
