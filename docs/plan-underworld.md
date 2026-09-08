# Plan — The Underworld (the first *placed zone*)

**Status:** designed 2026-09-07 (PO session, 6 rulings taken). **U1 + U2 + U3 +
U3b + U4a + U4b SHIPPED 2026-09-08**, and the underworld is **LIVE** — two
passages, walkable both ways, behind a directional curtain. **U0 not started**;
U5 is now a fill-in-the-room pass rather than a build-it-from-nothing one. All
numbers **[PLACEHOLDER]**.

### Ledger — U4b, the directional curtain (2026-09-08)

The visible half. A crossing is no longer an instant cut: black travels in from
one edge, holds while the world swaps underneath it, and **keeps going the same
way** out the other edge.

⭐ **THE WHOLE THING RUNS ON ONE APPENDED BYTE PLUS A FACT THE CLIENT ALREADY
HAD.** `ConversationOption.travel:ubyte` (0 none · 1 descend · 2 ascend ·
3 lateral) is the entire wire surface; the *arrival* is the client's own
active-zone tracker noticing its answer changed. **No transition protocol, no
server state machine, no mid-crossing flag on the wire.**

⭐ **A BOOL WOULD NOT HAVE BEEN ENOUGH, and that is the point of the field.** At
press time the client does not know the DESTINATION — `grant_index` is an opaque
index into a definition it never sees — so it cannot derive up-vs-down for
itself. The server resolves the anchor, so the server knows which zone the row
lands in. One byte carries the answer instead of the client re-deriving it from
data it does not have.

⭐ **THE DIRECTION IS DERIVED FROM GEOMETRY, WHICH MAKES `Origin` AN AUTHORING
CONTRACT: +Y IS DEEPER.** `portalTravel.Direction` resolves the destination,
asks `cfg.ZoneIndexAt` which zone each end is in, and compares those zones'
`OriginY`. Nothing is authored and nothing can drift — both ends of a passage get
the right way round for free, and the same door definition placed at either end
reports the opposite direction. ⛔ **The cost is that packing zones down the Y
axis for tidiness alone would make every crossing a descent**; a neighbouring
region belongs in X. Pinned on `Zone.Origin` and in `interaction_direction_test.go`.
⚑ **Deliberately NOT a separate `depth` int** — a second field could disagree
with the geometry, and the disagreement would mean nothing.

⛔ **L15 held, and it is the one place the byte lies on purpose.** Only `anchor`
mode derives a direction. `home_campfire` and `caster` resolve their destination
at **step-through** time by design (`plan-portal-spells.md` D5), so an answer
computed when the tree was BUILT can be stale — they always report lateral. ⭐
**The repair is in the client and costs nothing**: a lateral crossing that turns
out to have changed zone **upgrades on arrival**, so campfire recall out of the
underworld covers flat and reveals *upward*. It never downgrades, and never
turns around mid-reveal.

⭐ **Step 4 of §5.1 is the ruling, not a detail**, and the CSS is written to it:
`.down` runs `translateY(-100%) → 0 → +100%`. A curtain that came in the top and
retreated back out of the top would be **two fades**; one continuous movement
*past* you is what makes it read as a descent with nothing to reason about.

⚑ **Three traps pinned in comments.** ① The **hold ceiling** (~3 s) is not
optional — holding is right while the server is merely slow, but a refused or
dropped travel leaving the screen black forever is indistinguishable from a hang,
and the panel is behind the curtain. ② It is measured **from the press**, so a
slow cover cannot push the total past it. ③ The **first-frame reflow** is
load-bearing: the element goes `display:none` → start transform in one task, and
a browser that has not laid it out has no "from" value — it would jump straight
to full cover with no movement at all.

⚑ **`cancelCrossing` on death.** A crossing has exactly two ends, and death is
the one that never produces an arrival — without it a player killed mid-warp
watches the death screen through the curtain until the ceiling lets go.

⛔ **Never on the day/night filter machinery** — a screen-covering transition is
exactly the shape that tempts someone back to it. One `position: fixed` div, one
`transform`, zero pixi filter passes.

⚑ **Q5 is now live, not hypothetical**: `travel` is derived from the grant kind,
so the **shipped** portal pair and campfire recall stop being hard cuts and get
the lateral crossfade. Free and probably an improvement — but it is a change to
something already PO-verified in-game, so it wants a look.

**Schema: DB NONE · WIRE one appended field · conf NONE · content NONE.**

Verified: `go build` · `go vet` · **`go test -count=1 ./...` EXIT 0** · tsc ·
**vitest 663/663** (+12) · prod webpack build · boot clean, both zones placed ·
**mutation-verified ×2** — flipping the origin-Y comparison reddens three
direction tests, and letting `arrived` overwrite the direction unconditionally
reddens the no-reverse one.

⛔ **Not in-game verified by me.** The curtain is DOM + CSS, untestable in vitest
by the same split that leaves `buildBlendMask` untested; `CurtainSequence` is the
half that could be tested and is.

**⛔ …and the PO found the proof of that in the first minute: the curtain
"plopped in and out" with no movement at all.** I wrote `transition-property` and
`transition-timing-function` and **no `transition-duration`** — whose CSS default
is `0s`. Every state change completed instantly. ⭐ **The whole test suite stayed
green through it**, because the state machine was correct and the machine is the
only half a test can reach: the sequence held, covered and revealed exactly on
schedule while the screen showed a hard cut. **A green `CurtainSequence` says
nothing about whether anything animates.**

⭐ **The fix moved the durations OUT of the stylesheet**: `ZoneCurtain` now sets
`--curtain-cover-ms` / `--curtain-reveal-ms` on the element from `COVER_MS` /
`REVEAL_MS`, so the CSS and the machine cannot disagree. ⚑ Two numbers in two
languages counting the same interval was going to drift, and **the drift is
invisible rather than loud** — a CSS half longer than the JS half leaves the
curtain mid-travel when the machine declares itself idle and yanks `display`
away, which reads as exactly the same "plop".

**⛔ …and the PO's second look found a worse one, also mine, also invisible to
every test: THE WORLD SWAPPED IN PLAIN SIGHT.** §5.1 step 2 says the client
swaps the rendered zone *at full black*, and I never implemented it —
`Game.updateActiveZone` called `renderZone` on the arrival, whatever the curtain
was doing. ⭐ **`renderZone` is a heavy synchronous teardown** (the ground layer
destroyed, every ground texture cleared and reloaded, darkness reloaded, regions,
paths and surfaces repainted) **and on a local server the warp round trip is
about ONE TICK** — so the rebuild landed ~35 ms into a 280 ms cover. The player
watched the old world come apart and the new one build, and only *then* got the
curtain. No amount of timing tuning would have fixed that.

⭐ **The fix is `runWhenCovered(swap)`**, and the swap moment is
`max(fullCover, arrival)` — so a fast server does not get its teardown shown and
a slow one does not get it early. ⚑ **It runs IMMEDIATELY when nothing is
covering** (a cheat WARP), and ⛑ **`cancelCrossing` flushes a pending swap**:
abandoning the curtain must not abandon the rebuild, or a player killed mid-warp
stands in the new zone with the old zone's terrain and darkness drawn around
them.

### Polish pass (PO, 2026-09-08, in front of the game)

- ⭐ **Cover and reveal are now the SAME duration (280 ms each).** They travel
  the same distance — the element's own height — so 250/350 meant the curtain
  visibly **decelerated** as it left: two movements, the exact thing §5.1 step 4
  forbids. ⚑ **The plan's "the reveal is deliberately the slower half — you are
  arriving, not leaving" is hereby overruled** (PO call); the intent is real but
  it was written before the speed clash was visible. `REVEAL_MS` stays its own
  constant so the other reading is one number away, and a test pins the equality
  so a tuning pass cannot bring the deceleration back by accident.
- ⭐ **`HOLD_MIN_MS = 120` — a settle beat that is ALWAYS there**, measured from
  the swap. It does two jobs: the rebuilt scene gets frames to finish before it
  is uncovered, and every crossing gets the same rhythm instead of feeling
  different depending on that second's latency. ⚑ It is a floor, not the hold —
  a slow arrival still waits, up to the ceiling.
- ⚑ **The feather was half a screen.** 30 % of a 160vh element is 48vh of
  gradient, which reads as the screen *dimming* rather than as an edge passing
  you. Now ~20vh of a 130vh element (opaque to 85 %). Still soft on purpose: a
  hard line reads as a rectangle sliding.
- ⚑ **Easing moved per-phase** — `ease-out` into the stop, `ease-in` away from
  it. With a guaranteed hold between them each half is its own beat, so a
  `linear` half ending at a dead stop read as the animation being cut.
- ⚑ **The pump dropped 50 ms → 16 ms**, because the zone rebuild is scheduled off
  that clock now: 50 ms of slack between full black and the swap is visible slack
  at the exact moment the screen is meant to be still.

### Second polish pass (PO, 2026-09-08)

⛑ **AN ASCENT NEVER FULLY COVERED, and the cause is an anchoring asymmetry the
gradient hid.** The element is pinned `top: 0` at 130vh, so its extra 30vh hangs
BELOW the viewport — exactly where the DOWNWARD curtain wants its feather. Going
up, only the gradient was mirrored, so the ~20vh feather landed over the **top of
the screen** and the hold sat at something permanently translucent. ⭐ **The
mirror has to include the ANCHOR**: `.up` is pinned `bottom: 0` instead, which
puts the overhang above the viewport and makes the two directions geometrically
symmetric. ⚑ Descending looked perfect throughout, which is why it survived the
first pass — a bug that is invisible in one of two directions.

⭐ **THE TWO DIRECTIONS ARE NOW CROSSED, and it is the whole reading of the
effect** (PO: "can we switch the 2 animations?"). A DESCENT sweeps the curtain
**upward**, because what sells "I am dropping" is the world rising PAST me — the
same reason a camera tilts scenery the opposite way to the move. Black sweeping
downward on a descent reads as a stage curtain being LOWERED IN FRONT OF YOU:
something happening to you, not something you are doing. ⚑ §5.1's own words were
already the tell — *"one continuous movement PAST you"* — and things that pass
you travel opposite to your own direction. ⛔ **The crossing lives in
`axisClass()` and nowhere else**: the CSS class names describe the CURTAIN'S
motion (`.down` travels downward), so that one function is where the two
vocabularies meet. Renaming the classes to "fix" the apparent inversion would
make the stylesheet lie about its own transforms.

⚑ **Halved the timing** (PO: "the whole transition needs to be faster"):
**160 + 70 + 160 = 390 ms**, down from 680. `HOLD_CEILING_MS` is left at 3 s — it
is the failure path, not the felt one.

Total unimpeded crossing: **390 ms**, all [PLACEHOLDER].
Verified again after the pass: tsc · **vitest 666/666** · prod build · the
compiled CSS checked for the timing and the gradient · **mutation-verified** —
moving the swap back to the arrival reddens three tests.

### Ledger — U4a, the map follows you across (2026-09-08)

U4 split: **U4a is a BUG FIX**, not a feature. U2 and U3b shipped a map that is
wrong in the underworld, and the curtain (U4b) would have landed on top of it.

⭐ **THE MAP IS BAKED ZONE-LOCAL; EVERY LIVE POSITION IT PLOTS IS A WORLD ONE.**
`MapTerrain.bakeTerrain` reads the zone file, whose coordinates are all
zone-local — while `getX()/getY()`, the roster and every entity icon carry world
coordinates. For `world` at `{0,0}` the two spaces coincide, which is why every
call site could inline `× scale` for a year and be right. At `{0, 300}` the
player dot, the fog reveal, and every mob and prop icon were **300 units off
their own map** — silently, and only in that zone. The fix is one term:
`worldToMap(world, scale, originPx)`.

⚑ **`campfireMarkers` is the ONE exemption, and getting it wrong is the mirror
bug.** Those coordinates come straight out of `api/zones/*.json` — the same
numbers the terrain is baked from — so they are zone-local already and
subtracting the origin would offset them twice. The asymmetry is now pinned by a
test that stands a roster dot and the campfire it is standing at on the same
spot **in a placed zone**: offsetting both, or neither, separates them.

⭐ **A CROSSING IS NOT A JOIN, and that is the second defect U2 shipped.** U2
drove zone changes through `MiniMap.setup()`, which is a *reset*: it re-appends
the canvas, rebuilds every layer, closes an open map, and destroys two pieces of
state that belong to the **character** rather than the zone — the fog they have
walked off, and the campfires they have discovered. Both are published **once**
and never again, so a crossing lost them for the session: walk down a cave and
back up and your explored surface was blank, with no markers on it. `switchZone`
now redoes exactly the zone-derived parts, and `setup()` keeps the reset (a
second join in one page life IS a different person).

⚑ **The fog is now per zone, not one instance.** One shared texture is the
opposite bug and just as wrong — walking the caves would reveal the surface.
⚑ **`MapCampfires.setZone` keeps the discovered set** on purpose: spawn-point ids
are unique across every loaded zone (**L5**), so one set legitimately spans them,
while the fire POSITIONS do not.

⚑ **The origin is threaded into `MapPlayers.draw`, not stored on it**: a roster
publication and a zone change are two different events, and a stale copy would
draw one second of dots against the zone you just left.

**Schema: DB / wire / conf / content ALL NONE.** Pure client.

Verified: tsc · **vitest 650/650** (+5) · prod webpack build · backend
`go test -count=1 ./...` EXIT 0 (untouched) · **mutation-verified** — dropping
the origin term reddens three tests, including the roster-and-its-campfire one.

⛔ **Not in-game verified.** ⚑ **U4b is still owed and is the visible half**: the
directional curtain (§5.1) and `ConversationOption.travel:ubyte` (D7/L15). Until
it lands the crossing is an instant cut.

### Ledger — U3b, the destination moves to the placement (2026-09-08)

PO-asked: *"author a tiny example underworld with 2 exits to the overworld."*
That question is what exposed U3's one real cost, and the answer changed the
data model rather than the content.

⭐ **TWO PASSAGES NEEDED FOUR MOB DEFINITIONS, AND THAT WAS THE BUG.** U3 put
the anchor name on the mob DEFINITION, so one def was one destination and a
world with N passages cost 2N near-identical JSON files. `world.Spawn.Anchor`
moves it to the PLACEMENT: the definition says "a dark opening", the placement
says where it goes. ⚑ This codebase had already ruled the same way once —
`plan-world-paths.md` **D4** put `blocksMovement` per placement and never per
profile — and `Spawn` already carries three overrides with exactly this
tri-state shape (`wanderRadius`, `idleSpeedFactor`, `level`), so it is the
existing idiom rather than a new concept. **The placement wins; the definition
is the default; the shipped doors author no default at all.**

⭐ **THE VALIDATION HAD TO MOVE WITH IT, AND THAT IS THE STRUCTURAL LESSON.**
"Does this door lead anywhere" stopped being a question the mob loader can
answer the moment the answer lived in a zone. So the loader now only refuses an
`anchor` on an owner-relative mode (it needs nothing else to know that), and
`world.CrossValidateTravelAnchors` — which sees both — became the sole authority.
It **walks placements, not definitions**: same def, two spots, two destinations.

⭐ **THE COUPLING IS REAL AND IS NOW PINNED AS INTENDED BEHAVIOUR.** The surface
places two `CaveMouth`s, so a boot that leaves `underworld` out **refuses** —
there is no half-on state. `TestZoneSet_TheShippedPairIsWhole` and
`TestZoneSet_TheSurfaceAloneRefusesBecauseItsDoorsLeadNowhere` assert both
halves so the refusal never reads as a bug somebody should "fix". ⚑ Consequence
for dev flows: **`-zone world` alone no longer boots.** Use the conf (both zones)
or `-zones world,underworld`.

⚑ **A zone-format field means three writers (L3), and all three went red on cue**
— `world/zone.go`, `ZoneModel.getZoneAsJSON`, `aura-convert.js`. The Tiled side
also needed the palette: `anchor` is the **first non-numeric spawn knob**, so
`NUMERIC_TYPE` became `MEMBER_TYPE` — typing it `'float'` would have given Tiled
a numeric field for an anchor name and silently discarded whatever was typed in.
Its inherit sentinel is `""`, safe by C6's rule (not a name, so a Tiled that
drops a default-valued property and one that keeps it agree). ⚑ **The pin fixture
had to author it**, `origin`'s and `paths.blocksMovement`'s trap verbatim: a
sentinel-valued fixture serializes to no key at all and the pin passes while both
writers quietly drop every door's destination.

**Content shipped — the underworld is live:**

- **`api/zones/underworld.json`** — 48 × 28 at origin `{0, 300}` (**+y is below**;
  separation needs 60 in y and has 300, far inside the 8192 float32 ceiling).
  One `Mountains` region as the cave floor, one dark circle r=10 in the middle
  (⚑ deliberately **not** wholesale dark — a pitch-black demo room is one nobody
  can find the exit in), one campfire `underworld-1` (bindable, **not**
  `startingSpawn` — L4 forbids that outside the primary zone), two `CaveExit`s.
  **No mobs**, deliberately: what lives down there is a balance call, not mine.
- **`api/zones/world.json`** — two `CaveMouth` spawns at `(-24, 12)` and `(44, -2)`,
  two return anchors beside them. ⚑ Both spots were picked by **searching the
  authored world** for ground that is ≥ 2.8 u clear of every prop and spawn and
  ≥ 12 u from every campfire, then taking the two furthest apart — the surface is
  dense enough that eyeballing it would have put a door in a tree.
- **Confs** — `game.zones: ["world", "underworld"]` in `conf.default.json`, the
  embedded `cmd/aurad/conf.default.json` (⚑ a test pins those two equal, and it
  caught the drift) and the local `conf.json`.

⛑ **L8 IS NOW A TEST, NOT A COMMENT.** A door inside a campfire's dwell circle
loses every E press to the client's synthesized flight offer — invisible
server-side, so no other test in the tree can see it.
`TestPassages_NoDoorStandsInsideACampfiresDwellCircle` asserts 8 u of clearance
from every fire in every zone. The nearest shipped door sits 12.5 u out.

⭐ **`passages_test.go` is the round trip a browser would do**, and it is pinned
against the **real content**: down each hole, out the matching shaft, and back
beside the mouth you entered — not the other one. Everything below it was
already unit-tested; what no unit test can see is whether the four doors the
world actually places point at the four anchors the world actually authors.

**Schema: DB NONE · wire NONE.** Conf: `game.zones` now authored. **Content: a
new zone-format field** (`spawns[].anchor`, three writers + the palette), one new
zone file, two zone edits.

Verified: `go build` · `go vet` · **`go test -count=1 ./...` EXIT 0** · tsc ·
**vitest 645/645** · **`tools/tiled/verify.sh` all green — `world.json` round-trips
byte-identical at 259 239 bytes WITH the anchored spawns**, which is the proof
real Tiled preserves the new key · **boot: 2 zones placed, 6 campfires across 2
zones, 0 errors, 0 warnings** · **mutation-verified ×2** (the seam ignoring the
override; the validator ignoring the placement — the second was caught by the
content pin, which is what that pin is for).

⛔ **Still not PO-verified in a browser.** Everything the server can answer is
answered; what is owed is the look — the instant cut with no fade (U4), whether
the room reads as underground, and the darkness circle's size.

### Ledger — U3, the destination that is not a player (2026-09-08)

`TravelAnchor` — a third `TravelMode` that delivers to a **named zone anchor**
— plus the two `CaveMouth` mob defs and a boot-time pass that proves an
authored anchor exists.

⭐ **THE WHOLE CHUNK TURNS ON ONE LINE'S POSITION.** `portalTravel.destination`
opens with an `owner == nil` guard that is *correct* for both shipped modes —
they resolve **through** the portal's owner — and that guard would have refused
every cave mouth in the world, because a zone-placed fixture has no owner by
construction. Anchor mode is therefore answered **above** it. Nothing about the
grant, the loader, the content or the wiring hints at this; the failure would be
a door that renders, takes the keypress and moves nobody. Mutation-verified.

⭐ **The anchor name rides on the DEFINITION, not the placement**, so one def is
one destination — which is why the way back is its own file (`cave-exit.json`)
rather than `cave-mouth.json` placed twice. The alternative is a per-placement
destination override: a new zone-spawn field, a second way to say where a door
goes, and a third writer to teach (**L3**). Two files is also the honest shape —
the two ends genuinely say different things ("Climb down." / "Climb up.").

⭐ **The error/warning split is PLACEMENT, and that is what keeps U3 inert at
HEAD.** `world.CrossValidateTravelAnchors` (the `quests.CrossValidate` /
`ascension.CrossValidate` precedent, and it exists for their exact reason: the
mob registry is built **before** any zone, because the zone loader takes it as
an argument) **refuses the boot** for a def some zone *places* whose anchor is
missing, and merely **warns** for one nobody places. So both cave mouths ship
today, no zone places either, and the shipped world boots with two warnings.
⚑ It also lets the two edits an entrance needs — the mob def and the zone that
places it — land in either order. Pinned over the **real** content by
`TestZoneSet_ShippedCaveMouthsOnlyWarnUntilAZonePlacesThem`; both mutations
(the guard order, the error/warning split) reddened.

⚑ **The travel seam grew a second argument, and that is the honest signature:**
a destination is `(mode, anchor)`, not a mode. `CanReach`/`Travel` take both;
the loader refuses an `anchor` on an owner-relative mode rather than letting it
ride along unread, which is the quieter of the two failures (the door works,
just not where it says).

⚑ **Zone anchors are a plain map, not the `AnchorSource` interface** the
campfire seam uses. The difference is the data, not the style: a campfire anchor
is live **connection** state that changes as players bind; a zone anchor is
authored geometry that cannot change without a restart. `allAnchors` flattens
the set into one table, which is only faithful because names are unique
set-wide (**L5b**, already enforced by U1's `checkSetWide`).

⚑ `cfg.ZoneAnchors` holds `world.Point`, not `phy.Vec2f`: `cfg` carries authored
content and stays out of the physics package. `core/game.go` converts once, at
the one boundary that already speaks both.

⛔ **NOT verified in-game, and this one is a choice rather than an absence.**
Entering needs three content edits U3 deliberately does not make — a
`CaveMouth` spawn + a `surface-return` anchor in `world.json`, an
`underworld.json` with the `underworld-entry` anchor and a `CaveExit`, and both
listed in `game.zones`. Where a cave mouth stands is a **content judgement**
(U5), and `world.json` is under active authoring. ⚑ **The three edits are
coupled**: the moment a zone places a cave mouth, the boot refuses until its
destination exists — which is the pass working, but it means there is no
half-on state to ship. ⚑ **Still owed with them: the L8 campfire check** — an
entrance inside a campfire's dwell circle loses every E press to the client's
synthesized flight offer, and an exit is exactly where a cave's fire wants to
stand.

⚑ **Art is a placeholder `Signpost`** on both defs (the memorial / ascension
stone call, L7): no new `EntityType`, because one costs a wire enum value that
can never be reclaimed plus an exhaustive client `Record` entry.

**Schema: DB NONE · wire NONE · conf NONE.** Content: two mob defs, one new
`TravelMode` string, one new grant key (`anchor`). ⚑ **No zone-format field**,
so the three-writer whitelist (**L3**) is not in play and `verify.sh` is not a
gate here.

⚑ **The three census tests reddened on cue** (`plan-underworld` did not cause
this — `docs/feedback.md` 2026-09-05 already files it): conversant roster,
`RoleCreature` count 46 → 48, `xpFactor`-0 count 34 → 36. Any new mob does this.

Verified: `go build` · `go vet` · **`go test -count=1 ./...` EXIT 0** · tsc ·
**vitest 645/645** (untouched — U3 has no client half) · **mutation-verified ×2**.

### Ledger — U2, the wire field and the client zone swap (2026-09-08)

`Welcome.zone_names` appended + the client deriving its active zone from
POSITION + the runtime zone swap finished + the roster's zone filter (**L14**).

⭐ **The transition needs no protocol, and that is the result worth keeping.**
The client answers "which zone am I in" with a point-in-rectangle test against
data it already bundles (`features/zones/logic/ActiveZone.ts`), so there is no
per-entity layer field, no per-player layer field and no zone-change message.
The server warps the player, the AOI moves with them, and
`EntityManager.newSnapshot` replaces the world's contents on its own. The only
thing the wire contributes is WHICH zone files are real this boot.

⭐ **The client applies each zone's origin, and the server deliberately does
not.** Terrain, regions, paths, dark areas and campfire glows are client-visual,
so `world.Place` leaves them zone-local — shifting them server-side would be
dead work that gives the two sides two chances to disagree. Every entity arrives
in world coordinates, so the floor under them is drawn in world coordinates too.

⭐ **U2 is mostly finishing a swap that half-existed.** `ZoneEditor.loadZone`
already swapped ground textures at runtime but left `Regions`, `Paths`,
`DarknessOverlay` and the map bake on the previous zone. `Game.renderZone` is
now the one re-runnable entry point for all of it; the ground fill needed
explicit teardown, since it is the only thing added straight to a container
rather than through a loader that clears its own state.

⚑ **Two ordering traps pinned in comments**: `updateActiveZone` runs BEFORE the
snapshot is applied (else the new zone's entities appear for one frame over the
old floor), and `loadZoneTextures`' promise re-checks `zoneName` on resolve (it
outlives the swap that started it).

⛔ **An existing test caught a real defect**: `sendRoster` read
`n.game.Config().Walls`, and the roster tests build a `NetSystem` by struct
literal with a bare `&game{}` — nil config, nil deref. Now nil-safe, which is
also the honest answer: a game with no config has no placed zones.

⭐ **Mutation-verified ×2** on the client: reporting the zone every tick instead
of on change, and dropping the sticky-across-unknown-position behaviour, both
reddened.

**Schema: DB NONE · wire ONE appended `Welcome.zone_names` · conf NONE ·
content NONE.**

Verified: `go build` · `go vet` · **`go test -count=1 ./...` EXIT 0** (35 pkgs) ·
tsc · **vitest 645/645** (+12) · **prod webpack build** · `tools/tiled/verify.sh`
all green.

⛔ **NOT in-game verified**: no second zone ships, so there is still nothing to
enter. U3 (the `CaveMouth` and the `anchor` travel mode) is what first makes
this visible.

### Ledger — U1, the placed zone set (2026-09-08)

`Zone.Origin` + `world.Place` + a zone LIST at boot + one border wall per zone.
⭐ **Inert at HEAD by construction**: `conf.default.json` still authors
`zone: "world"`, the singular falls back to a one-entry list, and a zone at
`{0,0}` skips the offset entirely — pinned by
`TestZoneSet_RepoWorldIsUnmovedByThePlacedPath`, which walks all 773 props and
488 spawns of the real `world.json` through the new path and asserts nothing
moved.

New: `world/place.go`, `world/place_test.go`, `cmd/aurad/zoneset.go`,
`cmd/aurad/zoneset_test.go`. Touched: `world/zone.go` (`Origin`,
`LoadZonesFS`), `cfg` (`PlacedBounds`, `game.zones`), `core` (`Walls`, the
wall loop), `aurad.go` (selection, props/campfires/encounters over the set),
plus the two client writers and the completeness fixture.

⭐ **The three-writer pin fired on all three legs the moment the field landed**,
exactly as L3 predicts — and the fixture needed `origin` authored **non-zero**,
because an omitted-when-absent field with a `{0,0}` fixture serializes to no key
and the pin would have passed while both writers dropped it.

⚑ **`startingSpawn` moved scope**, per-file → per-placed-set: a cave nobody
binds in is now legal, a set with no starting fire still is not. Only the
primary zone may flag one (L4).

⭐ **Mutation-verified ×3**, because every rule here fails silently: the
separation rule reverted to the plan's original "larger of the two" (dy=144 and
dy=154 wrongly accepted), the L4 primary-zone guard disabled, and the path-point
offset dropped. All three reddened, then restored.

⛔ **NOT in-game verified, deliberately — there is nothing to see.** No zone
authors an origin and no second zone ships, so U1 changes no observable
behaviour. A temporary `underworld.json` at `{0,-300}` was booted through
`LoadZonesFS` during the chunk to prove placement end to end (props, anchors and
both walls landed at the right world coordinates), then deleted.

**Schema: DB NONE · wire NONE · conf `game.zones` added, `game.zone` still
honoured · content one new absent-safe `Zone.Origin`.**

Verified: `go build` · `go vet` · **`go test -count=1 ./...` EXIT 0** · tsc ·
**vitest 633/633** · **`tools/tiled/verify.sh` all green** (byte-identical
258 862-byte round-trip).

> **Read `docs/architecture.md` §6 first.** It is the closest thing to a prior
> design for this feature and it already anticipated the screen fade:
> *"a brief visual reset is the only artifact — hide it behind the tunnel."*

---

## 1. Goal

A second world **below** the overworld, entered and left **instantly** behind a
screen fade. Explicitly meant to be the first instance of the general "several
worlds / sectors / levels" direction, **not a bespoke hack**.

The finding that shapes the whole plan: **almost all of it already exists.**
Multi-zone loading by file stem, a client that already bundles *every* zone, a
border wall that already takes a position, a sparse hash-grid broadphase where
empty space costs nothing, a shipped two-line teleport recipe, a shipped
darkness system, and a `travel_to` conversation grant that already moves
players. The underworld is **content plus a small placement seam**.

### 1.1 The PO rulings (2026-09-07)

- **D1 — the underworld is its own ZONE FILE, placed at an `origin`.** Not a
  region of one giant `world.json`, and not a second `phy.Space`. ⭐ **No new
  vocabulary**: the engine's word for a map/level is already `Zone`
  (`world.Zone`, `api/zones/*.json`, `LoadZoneFS`, `-zone`,
  `Welcome.zone_name`, `ZoneModel`/`ZoneEditor`), and all this feature does is
  let the server hold **more than one at a time**. §2.1.
- **D2 — entry is an interact prompt**, reusing the shipped `travel_to` grant.
  Not a walk-in trigger volume.
- **D3 — the map swaps with you.** Underground, the map panel shows the
  underworld; on the surface, the surface.
- **D4 — one layer now, pockets later.** Author one underworld rectangle;
  keep placement general enough that per-cave pockets are just more rectangles.
- **D5 — the transition is DIRECTIONAL: a curtain that travels the way you do.**
  Black sweeps **down** on a descent and **up** on an ascent, and — the part
  that makes it read as travel rather than as two fades — **it keeps moving the
  same way across both halves**: down over the surface, then down off the cave
  to reveal it. §5.1 has the spec.
- **D7 — the client is TOLD a row will move it AND WHICH WAY**, via one appended
  `ConversationOption.travel:ubyte` — `0` none · `1` descend · `2` ascend ·
  `3` lateral. Without it D5's outbound half is impossible: `grant_index` is an
  opaque index into the authored definition, so the client can see that a row
  grants *something* but never that it teleports.
  ⭐ **A bool would not have been enough, and the reason is the whole point of
  the field**: at press time the client does not know the DESTINATION either, so
  it cannot derive up-vs-down for itself. The server resolves the anchor, so the
  server knows which zone the row lands in and which way that is — one byte
  carries the answer instead of the client re-deriving it from data it does not
  have. `3 lateral` is what a same-zone hop (the shipped portal pair) gets.

⚑ **D6 is deliberately skipped in this doc's own numbering.**
`plan-release-map.md` **D6** is cited throughout (§2 is entirely about it) and
reusing the number here would collide in exactly the way `model/layers.go`'s
reserved gap bit exists to prevent. Every D6 in this file means the release-map
one, and is always cited with its file name.

---

## 2. The standing ruling this amends — `plan-release-map.md` D6

`plan-release-map.md` §8 (PO, 2026-08-23) ruled:

> "instead of multiple `world.json`s **with a server change between them**, ONE
> giant map where zones are coordinate squares"

and §8.3 puts **"separate physics Spaces, zone handoffs, sharding, instancing"**
explicitly out of scope.

⭐ **This plan keeps §8.3 fully intact and amends only the file-count clause.**
There is still one `phy.Space`, one process, **no handoff, no server hop** — the
transition is the same two-line `Ground()` + `SetPosition()` teleport that
`travel_to` already ships and the PO already verified in-game
(`archive/plan-portal-spells.md` §2). What changes is that a *zone* may be
its own authored file placed at an origin, rather than a region of one file.

⚑ **OWED: record this as an explicit D6 amendment in `plan-release-map.md` §8.**
The next reader of that section will otherwise take "multiple zone files" as
forbidden. (§9 Q2.)

### 2.1 Terminology — the engine already has the word, and it is `Zone`

⭐ **This plan mints no vocabulary.** A **zone** is one rectangle = one file in
`api/zones/` = one `world.Zone` = one `InvAABB` = one placed origin. That is
what the code has always called it — `LoadZoneFS`, `-zone`,
`Welcome.zone_name`, `ZoneModel`, `ZoneEditor` — and the underworld is simply
**a second zone**, loaded beside the first rather than instead of it.

The three near-misses, so nobody reaches for them:

- ⛔ **"map"** is actively dangerous. In the engine it means the world's
  *dimensions* (`Welcome.map_width`/`map_height`) or the *map panel*
  (`MiniMap`, `MapTerrain`, `MapFog`, `Game.map`). `plan-world-scale.md` §0
  opens by warning that "map" means the world **or** the panel, and records that
  conflating them made its first draft propose a whole wrong chunk.
- ⛔ **"level"** always means character level. **"sector"** appears nowhere.
- ⛔ **"layer"** is taken twice over — `model.CollisionLayer`
  (`LayerViewportCollision`, …) and Pixi render layers
  (`Game.layers.terrain.paths`). Used loosely in prose here for *the underworld
  as a place*; never as an engine noun.

⚑ **The one residual ambiguity is pre-existing and is NOT this plan's to fix.**
`content-zone2.md:1` uses "zone" the other way — *"Zone 2 is the eastern half of
the single `world` zone — a design label, not an engine object"* — and
`content-world.md` sketches 21+ such labels. The code's usage is the one with
every identifier behind it, so the design labels are the squatter. Cheapest fix,
whenever a doc next needs the precision: call those **areas**. No rename, no
churn, nothing blocked here.

---

## 3. Why placement, not a Space split

`architecture.md` §6 recommends *"Don't split until forced."* An underworld
entrance is the canonical hideable chokepoint (option B's seam), but the split
is **not forced**: `plan-world-scale.md` §11 M1 measured the single-Space area
ceiling at **~19×** today's world after mob dormancy shipped.

Offsetting buys the same isolation for free:

| Concern | Cost of a placed zone |
|---|---|
| Broadphase | **Zero until first visit**, then permanently proportional to *visited area* — see **L11**. The gap itself never allocates: the grids are `map[Vec2i][]Collider` (`phy/space.go:15`, 10-unit cells), a sparse hash. |
| AOI / encoding | **Zero.** The viewport is a 20 × 12 sensor box; another zone 100 000 u away is never in range. `NetSystem` measured **flat (1.2×)** over a 10× world (M1-F2). |
| Aura overlap / targeting | **Zero.** Distance separates them. No new mask bit, no new filter axis. |
| Border wall | One extra `phy.NewInvAABB` — it already takes a `pos` (`phy/inv_aabb.go:94`). |
| Per-tick system walks | Costs what the underworld's *content* costs, not what the layer costs. Dormancy (`plan-world-scale.md` S3/D5) removes unobserved mobs from the Space entirely, so **an unvisited underworld costs almost nothing**. |
| The transition itself | **Zero.** `SetPosition` moves body + viewport + aura together, the grid rebuilds per tick, no re-registration. ⭐ We never pay **M1-F4**'s O(total entities) add/remove fan-out across 14 systems, *because there is no handoff*. |

### L1 — the doubled-BB separation constraint (the one hard geometry rule)

`InvAABB.updateBB` (`phy/inv_aabb.go:112`) **deliberately** gives the wall a
bounding box **2× its half-extents on every side**, so a body that drifted just
past the boundary still shares a broadphase cell with the wall and gets
corrected. Two walls whose doubled BBs overlap would both correct the same
player.

⛔ **The rule is the SUM of the two zones' full sizes, not the larger one's.**
Wall A at origin 0 with half-height `hA` spans `[-2hA, +2hA]`; wall B at offset
`D` spans `[D-2hB, D+2hB]`. Non-overlap needs `D > 2(hA+hB)` = **fullHeight A +
fullHeight B**, plus a grid-cell margin (10 u). Two 72-tall zones need **> ~154**,
not > 72. **Assert it at load.**

⛔ **The failure is severe, not cosmetic.** A player at `y=70` sharing a cell
with wall B gets `resolveInvAABB` computing a force toward *B's* rectangle — a
yank of the whole offset distance, from a wall they cannot see.

⭐ **But the gap must ALSO be kept SMALL — see L12.** The two constraints pin it
from both sides: **big enough to clear the doubled BBs, small enough to stay in
float32's comfortable range.** For today's 144×72, **[PLACEHOLDER] ~500 units**
satisfies both with wide margin. ⛔ **An offset of 100 000 is not "safely far",
it is broken** (L12).

### L2 — the origin gap IS the whole isolation guarantee

Streaming is a pure mask test: `core/net.go:212` collects the player viewport's
collisions over `LayerViewportCollision`. **Nothing else stops an underworld
body streaming into an overworld viewport** — no layer bit, no filter. If two
zones ever overlap in space, entities leak across immediately and
silently. L1's assertion is what protects this.

### L11 — the dynamic grid is never pruned, so area cost is PERMANENT

`Space.Update` (`phy/space.go:62-96`) reuses the grid and its per-cell slices
rather than remaking them — a deliberate optimisation worth ~20 % of the idle
server's garbage — by truncating each cell to `[:0]`. **It never deletes keys.**
It then iterates the whole map **twice per tick**, including cells that have been
empty for an hour.

So a zone costs nothing until someone walks it, and then costs its **visited
area** forever, at 30 Hz, for the life of the process. This is M1-F2's recorded
residue (*"O(world area) no matter what is awake"*), and this plan is what makes
it bite twice.

⚑ **At the scale being discussed it is noise**: a 144×72 zone is ~120 cells, so
two zones iterate ~240 map entries. It becomes real only if the underworld is
authored *large*. ⭐ **Treat it as the number that bounds how big the underworld
should be**, not as a blocker — and see §7.1.

### L12 — float32: a huge offset degrades the SIMULATION, not just the view

⛔ `phy.Vec2f` is `float32` (`phy/math.go:63-65`), so the offset lands in
collision resolution and movement integration, not only on the wire.

| coordinate | ULP | in px (×120) |
|---|---|---|
| ~500 | 6 × 10⁻⁵ u | 0.007 px |
| ~5 000 | 6 × 10⁻⁴ u | 0.07 px |
| **100 000** | **0.0078 u** | **0.94 px** |

At 100 000 the player's `walkingSpeedPerTick: 0.05` step is **6 ULPs**, so every
movement integration loses ~16 % of its precision — and `resolveInvAABB`
computes penetration as the difference of two ~10⁵ numbers, which is
catastrophic cancellation producing a quantised correction. ⚑ This repo has
already fought this class of bug once: `archive/plan-render-jitter.md`.

⭐ **The fix is free — the gap has no reason to be large.** Its only job is to
clear L1's doubled bounding boxes. Keep every coordinate in the low thousands.

### L13 — `Bounds` is read by more than the wall

`core.Bounds` feeds three consumers, and §4.2 only re-homed the first:

1. `core/game.go:127` — the border wall. (Handled: `core.Walls`.)
2. ⛔ `core/game.go:97-98` — **`Welcome.map_width`/`map_height`**. A union
   rectangle here breaks the client's camera clamp, `EntityManager` bounds and
   minimap sizing, all at once.
3. ⛔ `sys/state.go:469` — `randomSpawnPosition(s.game.Bounds())`, the last-ditch
   spawn fallback. Against a union rectangle **it can drop a player in the void
   gap between zones**, outside every wall.

**Bounds must become per-zone everywhere it is read, never a union.**

### L14 — `PlayerRoster` leaks across zones, and its own comment says otherwise

`codec.RosterFor` (`codec/roster.go:50`, called once at `core/net.go:197`)
appends **every live player, unfiltered**, and ships it to everyone. The type's
comment reads *"every live player character in the zone"* — which becomes a lie
the moment a second zone loads.

Underworld players would land on surface minimaps at ±offset coordinates.
⭐ **Filtering it by the viewer's zone fixes the leak and cuts roster bytes in
the same edit** (§7.1).

### L15 — the direction byte resolves EARLIER than D5 says destinations may

`archive/plan-portal-spells.md` **D5**: *"destination resolves at step-through
time, never at cast time."* D7's byte is computed when the tree is **built**.

- `mode: anchor` — a fixed authored point, so build-time resolution is sound.
- ⛔ `home_campfire` / `caster` — the destination can move between build and
  step-through, so a derived direction can be **stale**.

**Fix: only `anchor` derives a direction; the other modes always emit
`3 lateral`.** ⚑ Consequence worth knowing: a campfire recall *out of* the
underworld is a genuine ascent reported as lateral. Cheapest answer — the byte
drives the **cover** half, and the client upgrades the **reveal** half from the
zone it actually arrived in, which it derives from position anyway (§5.1).

### 3.1 Rejected — a `worldLayer` tag with overlapping coordinates

It reads nicer ("the underworld is literally beneath you") and buys nothing the
offset does not. It costs a **new orthogonal filter axis** that every AOI query,
aura overlap, targeting scan and broadphase insert must honour — a wide
silent-break surface. `model/layers.go`'s `CollisionLayer` is a *semantic* axis
(and carries a **reserved gap bit** that `api/mobs/*.json` encodes as raw ints,
`layers.go:22-31`); folding a spatial axis into it explodes the mask
combinatorially. ⛔ Not built.

### 3.2 Rejected — one giant `world.json` with the underworld far away in Y

Legal under `plan-release-map.md` D6 today and needs **zero** engine change; the separator between
layers could even be a shipped blocking `path` (`plan-world-paths.md` C2, zero
wire cost). Rejected on **authoring and the map**: one Tiled file already at
263 KB carrying every zone, and a surface map that permanently shows a
rectangle of caves stacked below it at reduced bake resolution. D1 chose the
file split for editing and for the path toward `content-world.md`'s 21+ zones.

---

## 4. Data model

### 4.1 One new zone field

`backend/pkg/aura/world/zone.go:292` `Zone` gains:

```go
Origin Point `json:"origin"`   // absent = {0,0}; where this zone sits in the shared space
```

Authoring stays **zone-local**: `underworld.json` is authored around
`(0,0)` in Tiled exactly like `world.json`. ⭐ This is the DRY answer — the
client reads the same field from the same bundled file, so **no wire field is
needed to place a zone**. It is also what makes D4's "pockets later" free:
a pocket is another file with another origin, no placement strategy required.

⚑ **L3 — a new zone field means teaching THREE writers, not one**
([[project-zone-format-whitelists]], region-primitive L1): `world/zone.go`
(`DisallowUnknownFields`, hard-fails boot), `ZoneModel.getZoneAsJSON` (a strict
hand-written field whitelist that **silently deletes what it has never heard
of** — the failure that already ate `spawn.level` once), and
`tools/tiled/extensions/aura-zone/aura-convert.js`'s `serializeZone`. All three
are guarded by the tiled-C5 completeness pin, which scrapes `zone.go`'s json
tags. **Expect all three legs to go red the moment the field lands** — that is
the pin working, exactly as it did for `paths`.

### 4.2 The server loads a *set* of zones

Today `cmd/aurad/aurad.go:95` loads exactly one zone by stem, and
`core/game.go:127` installs exactly one origin-centred wall.

- conf `game.zone: "world"` → **`game.zones: ["world", "underworld"]`**; keep
  the singular as a fallback so an existing conf boots. Same for the `-zone`
  flag. Only listed stems are parsed, so `LoadZoneFS`'s "a half-authored WIP
  zone only breaks boot if it is the one selected" property survives.
- New **`world.Place(zones []*Zone)`** applies each `Origin` to its props /
  spawns / campfires / anchors / path corridors, after which
  `aurad.go:150–230` concatenates them **unchanged**. ⭐ That block is the
  single choke point for everything zone-derived, which is the whole reason
  this change is small.
- `core.Bounds(w, h)` → **`core.Walls([]PlacedBounds)`** — one `InvAABB` per
  zone at its own origin, and L1's assertion lives here.
  ⚑ `Space.AddStaticShape` is documented *"static shapes cannot be moved nor
  removed"* — fine, every wall is installed once at boot.
- ⚑ `aurad.go:237-256` gates the Orc Warlord encounter on a **literal**
  `zone.ID == "world"` (also filed as `archive/plan-test-world.md` §1 F4). With
  a set this must iterate the placed zones.

### 4.3 Two validation landmines — both MUST be fixed in the same chunk

**L4 ⛔ — a new character could spawn underground.** `zone.go:480-491` requires
≥1 `startingSpawn` campfire *per file*. Merge two files naively and
`sys/state.go:461-481` `defaultSpawnPosition()` picks a random `startingSpawn`
across **both**. Fix: scope `startingSpawn` to the primary zone, or move
the validation from per-file to per-placed-set.

**L5 ⛔ — the cross-zone `spawnpoint-N` collision, now live.**
`character_campfires.campfire_id` is a bare `TEXT` column while `Campfire.ID` is
validated **zone-wide, not globally** (`zone.go:181-205`). Two zones could
each mint `spawnpoint-1` and collide **silently in the DB**. Filed and unowned
in `plan-world-scale.md` §7 as *"belongs to whichever plan first runs two
zones."* ⭐ **This is that plan.** Validate uniqueness across the placed set.

**L5b ⛔ — anchor names are unique per-ZONE too, and `TravelAnchor` looks up by
bare name.** `Zone.AnchorPos` scans one zone's slice (`zone.go:525-532`); §5's
new `AnchorSource` scans the placed set. Two zones each authoring
`underworld-entry` resolves to whichever is enumerated first — silently, with a
valid-looking destination. Exactly L5's shape at a different table, and it must
be validated across the set in the same pass.

### 4.4 The wire

`Welcome.zone_name` (`api/schema/server.fbs:762`) is insufficient: the client
must render whichever zones the server loaded. Append
**`Welcome.zone_names: [string]`** (append-only, the standing rule), keeping
`zone_name` as the starting zone. `Welcome` is marshalled **once at boot**
(`core/game.go:95-118`), which is exactly right for a static list.

The **second and last** wire change is **D7**'s
`ConversationOption.travel:ubyte` (§5.1) — appended at that table's end, the
discipline its own comments already document twice, for `confirm_seconds` and
`skill_id`. ⭐ It is **derived, not authored**: the server sets it wherever
`grant.Kind == GrantTravelTo`, resolving the destination anchor to a zone
and comparing origins, so no content ever has to remember it and both CaveMouths
get the right direction automatically. The shipped portal-spell rows resolve to
`3 lateral` for free (⚑ a behaviour change to a shipped feature — §9 Q5).

⚑ A `ubyte` rather than a `bool` deliberately, and `0 = none` so the default
value is the inert one — the `grant_index = 255` convention two fields up.

⭐ **Those two are the whole wire surface.** No per-entity layer field, no
per-player layer field — so `plan-server-performance.md` chunk 3's *"a
change-only field needs an explicit presence bit"* trap is not in play here.

---

## 5. Entering and leaving (D2)

Reuse **`travel_to`**, the shipped grant that already teleports
(`items/mobs/interaction.go:295`, `sys/interaction.go:336` `portalTravel.Travel`).
It already calls `rider.Ground()` → `SetPosition(JitterAround(dest, …))` →
`SetConversingWith(0)` — the exact sequence a crossing needs, already
invariant-guarded, already PO-verified in-game.

**Add one destination mode** to the closed vocabulary at
`items/mobs/interaction.go:205`:

```go
TravelAnchor TravelMode = "anchor"   // deliver to a named zone Anchor
```

backed by a second `AnchorSource` reading the placed zones' `Anchors`
(`zone.go:282` — already `{name, x, y}`, already unique-validated, and
`AnchorPos` already hard-fails at boot on a missing name, so a typo'd entrance
**breaks loudly** rather than swallowing keypresses).

Content then reads: a **`CaveMouth`** interactable at the overworld entrance,
one row granting `travel_to {mode: "anchor", anchor: "underworld-entry"}`; its
twin at the bottom of the stairs points back.

⚑ **L6 — the entrance must be an authored MOB def, not a prop.**
`archive/plan-portal-spells.md` D2 records why: props are *"not interactable,
and `PhysicsSystem.Remove` panics on statics."* Use the memorial-stone
inert-interactable template.

⛔ **L7 — do not mint a new `EntityType`.** It is deliberately not free:
exhaustive client `Record`, next free wire value 76, **gaps are permanent**.
Reuse the portal's approach. (And note `…_EveryStreamedEntityTypeHasACase` now
exists precisely because M1-F1 found a corpse panicking the snapshot encoder for
eight weeks.)

⚑ **L8 — the campfire interact override, inherited verbatim from portal spells
D8.** The client **synthesizes** a campfire interact offer that *overrides* the
server's (`Backend.ts:527`, `flightOrigin || offered`). **An entrance placed
inside a campfire's dwell circle loses every E press to the flight map.** Author
entrances clear of fires, and deliberately test one near a fire.

### 5.1 The transition — a directional curtain (D5)

⭐ **The whole thing runs client-side off ONE fact the server already produces:
the player's new position.** The client derives its active zone from
position alone — whichever placed rectangle contains it, using `origin` +
`bounds` from data it already bundles. **No layer field, no server state
machine, no transition protocol.**

The sequence, with the curtain moving **one direction throughout**:

| # | | |
|---|---|---|
| 1 | **press** | The row carries `travel` (D7), so the client starts the curtain **before** anything arrives, and the byte already says which way: **down** on `1 descend`, **up** on `2 ascend`, a plain non-directional crossfade on `3 lateral`. |
| 2 | **cover** | The curtain reaches full black. The client swaps the rendered zone here, under cover (§5.2). |
| 3 | **warp** | The server applies `travel_to`; the AOI moves 100 000 u, so the snapshot replaces its whole contents on its own. |
| 4 | **reveal** | The curtain **keeps travelling the same way** and exits the far edge, revealing the new place. |

⭐ **Step 4 is the ruling, not a detail.** A curtain that comes in from the top
and then retreats back out of the top is two fades; one that comes in the top
and leaves out the bottom is *one continuous movement past you*, which is what
makes it read as a descent without the player having to reason about anything.

**Shape:** a single full-screen `position: fixed` element, taller than the
viewport, carrying a `linear-gradient` so its leading edge is soft rather than
a hard line, animated with `transform: translateY()`. GPU-composited, one
element, **zero pixi filter passes**. The established precedent is
`vital-signs/assets/vitalSigns.less:127-155` driven by `VitalSigns.ts:155`
`HtmlOverlayManager` / `TransitionedOverlay`.

**Timing** [PLACEHOLDER]: cover ~250 ms · hold until the new position arrives ·
reveal ~350 ms. The reveal is deliberately the slower half — you are arriving,
not leaving.

⚑ **If the server is slow the curtain simply holds at full black**, which is the
correct behaviour and needs no timeout. ⛔ But it must **not** hold forever: if
no position change arrives within a ceiling (**[PLACEHOLDER] ~3 s**), reveal
anyway. A refused or dropped travel that leaves the screen black is
indistinguishable from a hang.

⭐ **Descent gets a second, free half-second of atmosphere**: the underworld is
authored dark, so the reveal uncovers a mostly-black screen lit only by the
player's own light radius. The darkness system does that work already (§6) — the
curtain does not have to sell the cave, only the movement into it.

⭐ **Three things already work with zero changes**, which is why the curtain is
the only genuinely new client feature:

- `Camera.update` (`camera/logic/Camera.ts:76-102`) **hard-snaps** past one
  viewport of distance. A 100 000-unit warp is that.
- `_GameObject.setPosition` (`game-objects/logic/_GameObject.ts:187-198`) snaps
  past `TELEPORT_SNAP_DISTANCE_PX` and flushes its interpolation buffer.
- `EntityManager.newSnapshot` (`backend/logic/EntityManager.ts:239`) hides and
  drops every entity absent from the snapshot — exactly right here.

⛔ **L9 — never build the curtain (or an underworld tint) on the day/night filter
machinery.** It was disabled precisely because ~25 per-layer filter passes
reassigned at 30 Hz made avatars invisible at the transition. Standing lock,
repeated in three docs.

### 5.2 The real client work: finishing a runtime swap that half-exists

`ZoneEditor.loadZone(stem)` (`zone-editor/logic/ZoneEditor.ts:256`) already does
`GroundTextureManager.clear()` + `loadZone(stem)` at runtime — but it does
**not** reload the four newer client-visual consumers. That gap is the chunk:

| Module | Why it blocks a swap |
|---|---|
| `regions/logic/Regions.ts:247` | `let regions: Region[]` — a **module-global singleton**; two zones cannot both be loaded |
| `paths/logic/Paths.ts:47` | same shape, same singleton |
| `darkness/logic/DarknessOverlay.ts:94` | `loadZone` places circles into module-global state |
| `map/logic/MapTerrain.ts:61` | `bakeTerrain` is documented render-once; `MiniMap.rebakeTerrain():282` is the re-entry |

⭐ **L10 — do not fork the paint path.** `RegionPaint.paintTerrainSurfaces`
(`regions/logic/RegionPaint.ts:578`) is deliberately the single entry point for
**both** the world and the map draw sites; its header records that a draw site
left behind produces *"a map that is a wrong drawing of the world"*. Route
zones *through* it.

Also derived from `Welcome.map_width/height` today and needing to follow the
**active zone's** bounds rather than a union of all of them: the camera
clamp (`Camera.keepWithinMapBoundaries:132-142`), `EntityManager`'s bounds, and
`MiniMap.setup(w, h, stem)`.

### 5.3 The map swaps with you (D3)

Precedent: `archive/plan-flight-paths.md` **D16** — *"a flyer is invisible in the
world and visible on the map… consistency between two channels that answer
different questions is not a property worth having."*

Costs a second bake plus a **second `MapFog` reveal set** — fog is per-zone
state, and sharing one texture would reveal surface fog by walking caves.
⚑ Do **not** touch `MapTerrain.bakeWidth()` (`plan-world-scale.md` §10 A: it
does not degrade with world size; what degrades is legibility).

---

## 6. What the underworld gets for free

- **Darkness is built and ruled.** `Zone.DarkAreas` (`zone.go:212`) +
  `features/darkness/DarknessOverlay.ts` (`MAX_ALPHA: 1`; an `AlphaFilter` so
  chained circles show no darker intersections). `gdd.md` §7: darkness is
  **purely visual** — it restricts vision, never damage or hit chance; the Light
  aura and Torch passive are the counterplay. ⭐ This is the canonical home for
  the GDD's role-cooperation loop and its "open-world dungeons, no instances".
  ⚑ `darkAreas` are **circles only** — a wholesale-dark zone wants one
  enormous circle, a chain of them, or the first polygon dark area.
- **Region + path primitives carry the whole visual identity** (cave floor, lava
  rivers, chasm edges) with **no new code** — a profile is client-side data by
  region-primitive **D12** (`frontend/src/client-data/profiles.json`;
  ⛔ never `api/zones/profiles.json`, it hard-fails boot).
- **Campfires and respawn.** `Zone.Campfires` gives the underworld its own bind
  points; `home_campfire_id` already stores an authored id, so *dying
  underground respawns underground* is **content, not code** — subject to L5.
- **Logging out underground is already answered.** Nothing spatial persists
  (`persist/state.go` has no position and no zone id), so a cold return is
  always full-HP at your bound campfire; if that fire is on the surface, you
  surface. Self-consistent, needs no work — but it turns
  `plan-leaving-the-world.md` §8's unruled *"'log out in a dungeon, log in in a
  dungeon' is a design commitment"* from hypothetical into live (§9 Q4).

---

## 7. Chunks

| Chunk | Content | Verify |
|---|---|---|
| **U0** *(optional precursor)* | **S1 — lazy zone bundling** (`plan-world-scale.md`, not started; ⛑ its premise had expired at HEAD *because only one zone file existed* — this plan revives it). ⭐ Its `ensureZoneLoaded(stem)` await seam is **exactly what the curtain hides** (§5.1 step 2→3): the curtain is the load screen S1 always wanted. Not a blocker; strongly synergistic. | bundle size before/after · the `Game.ts:483-484` seam |
| **U1** | `Zone.Origin` (**three writers**, L3) + `world.Place` + zone **list** at boot + `core.Walls` + **L1**'s separation assert (⚑ the SUM rule, and a **small** offset — L12) + per-zone `Bounds` everywhere it is read (**L13**) + the **L4/L5/L5b** uniqueness fixes. Ship with `game.zones: ["world"]` — **inert at HEAD**. | `go test -count=1 ./...` (⚑ a content edit does not invalidate the Go test cache) · `tools/tiled/verify.sh` byte-identical round-trip · boot log lists placed zones + origins |
| **U2** | `Welcome.zone_names` appended + client active-zone derivation + finish the runtime swap (`Regions` · `Paths` · `DarknessOverlay` · ground textures, §5.2) + camera clamp / `EntityManager` bounds / minimap follow the active zone + **`RosterFor` filtered by zone** (**L14**, §7.1 item 2). | tsc · vitest · in-game: `WARP` into an empty second zone, see its terrain, walls hold, **nothing streams across** (L2) |
| **U3** ✅ | `TravelAnchor` mode + the zone-anchor table + **two** `CaveMouth` defs (L6, L7) + `world.CrossValidateTravelAnchors`. ⭐ Anchor mode is resolved **above** `destination`'s `owner == nil` guard — a zone-placed door has no owner. | ✅ Go tests incl. the refuse-at-boot path · ⛔ **in-game round trip + the L8 campfire check are OWED**: they need the three coupled content edits U3 leaves to U5 (see the ledger) |
| **U4a** ✅ | **The map follows you across** (§5.3): the zone-origin term on every world→map conversion, `switchZone` instead of `setup()`, per-zone fog, and the discovered set surviving a crossing. ⭐ A BUG FIX — U2/U3b shipped a map that is wrong in any zone away from `{0,0}`. | ✅ tsc · vitest 650/650 · mutation-verified · ⛔ in-game owed |
| **U4b** ✅ | **D7**'s appended `ConversationOption.travel:ubyte`, derived server-side by comparing the two zones' `OriginY` (⚑ **`anchor` mode only** — L15, with the client repairing a lateral on arrival) + the directional curtain (§5.1). ⚑ Per-zone map bake and `MapFog` were **U4a**, not this. | ✅ codec round-trip ×4 values · `go test -count=1 ./...` EXIT 0 · tsc · **vitest 663/663** · prod build · **mutation-verified ×2** · ⛔ in-game owed, and **Q5 is now live** — the shipped portal pair gets the lateral crossfade |
| **U5** ⚑ *(half done by U3b)* | **Content**: author `api/zones/underworld.json` — bounds, entry/exit anchors, the two `CaveMouth`s, darkness, campfires, a first pocket of mobs. ⭐ **Cave walls as blocking `paths`, not props** (§7.1 item 1) — the single biggest perf decision in the feature, and it is a content one. | in-game |
| **U6** *(deferred — §7.2)* | **Build-time zone placement**: an authored `depth`, an auto-assigned `origin`, and a GENERATED placement file both sides read so the wire cost stays zero. ⚑ PO-asked 2026-09-08; deferred with two named triggers, not dropped. | `go test` · `verify.sh` · a boot whose placement file is deliberately stale must still be REFUSED |

U1–U3 are each small and independently verifiable; **U1 ships inert**. U5 is a
content pass and wants its own session.

⚑ **U1 wants a mutation-verified test for the separation assert.** Every one of
L1/L4/L5/L5b/L13 is a *silent* failure — a wrong-but-plausible position, a
destination that resolves to the wrong place, a spawn in the void. None of them
reddens a test that does not deliberately look for them, and L4 in particular
(a new character spawning underground) would reach a player before it reached a
log line.

⚑ **Restart the server after every Tiled save.** A zone edit is **half-live and
the seam is BOOT TIME** ([[project-zone-edit-half-live]]) — the client bundles
`api/zones` through webpack and HMR re-reads it on every save, while `aurad`
read the zone once, at boot. Cost a debugging session on 2026-09-07 (water drew,
did not block). This will bite constantly while authoring a second zone.

---

## 7.2 U6 — build-time zone placement (PO-asked 2026-09-08, DEFERRED)

> **Status: designed, nothing built.** Raised while planning several dungeons:
> *"wouldn't it be safer and scale better if the game decides itself where to
> place them?"* The answer is yes, eventually — this section is the shape it
> should take, and the two symptoms that mean it is time.

### The ask, and the two constraints the PO set

1. ⛔ **The wire cost stays ZERO.** This is the constraint that picks the whole
   design. Today the client learns where every zone sits by reading `origin`
   out of the same bundled file the server read — which is why U1 needed no
   wire field to place a zone (§4.4). A server that assigns origins at BOOT
   destroys that: the client cannot know the answer, so it has to be sent.
   ⭐ **Placing at BUILD time instead keeps the property**, because the answer
   is back in a file both sides read before either of them runs.
2. ⭐ **A real `depth` field — stop overloading Y.** U4b made `origin.y`
   semantic (the direction byte compares it), which is exactly what blocks
   auto-placement: a packer that tiles rectangles cannot know a cave belongs
   below a surface. With `depth` authored, BOTH axes become free packing
   coordinates and the direction byte compares depths instead.
   ⚑ **This reverses U4b's "deliberately NOT a separate depth int"**, and the
   reversal is honest: that call was made when the origin was hand-authored, so
   a second field could disagree with the geometry. Once the geometry is
   GENERATED FROM the depth, disagreement is impossible — depth becomes the
   single source and the origin its derivative.
3. **The packer sizes the margins itself** from each zone's bounds, rather than
   a human keeping a grid in their head.

### Shape

- **`Zone.Depth int`** — authored, `0` = the surface. The only placement number
  a human writes. ⚑ A new zone-format field means the FOUR writers again (L3
  plus `aura-world-format.js`), and the completeness pin will redden on all of
  them, which is the pin working.
- **`Zone.Origin` becomes a PIN, not a placement** — the tri-state idiom this
  format already uses for `wanderRadius`, `level` and `anchor`: absent = the
  packer chooses, present = pinned and the packer works around it. ⭐ That is
  what keeps `world` at `{0,0}` (see the landmine below) without a special case
  in the packer, and it means the field is NOT removed — no writer loses a key.
- **A generated placement file**, written by a build step and committed:
  `{"world": {"x": 0, "y": 0}, "underworld": {"x": 0, "y": 300}, …}`. Both
  `world.Place` and the client's `ActiveZone.zoneRects` read it instead of the
  per-file origin, so there is exactly ONE runtime source and no wire field.
- **Run it from `make -C backend build`**, beside `cp-defs`. ⚑ It must also be
  runnable standalone: a Tiled save that changes a zone's BOUNDS invalidates
  the placement, and the author needs a one-liner to refresh it.

### ⛔ Where the generated file may NOT live

**Not in `api/zones/`.** The zone loader parses every file in that directory as
a zone, so a placement file there hard-fails the boot — the identical trap
`profiles.json` already carries (D12: *"never `api/zones/profiles.json`"*).
`api/zone-placement.json` or `api/placement/zones.json`.

### What "optimal" actually optimises — and it is NOT the broadphase

⚑ **Tighter packing buys nothing for performance.** `phy.Space` grids are
`map[Vec2i][]Collider` — a sparse hash. The gap between zones allocates no
cells, so empty space is already free and squeezing it out saves nothing per
tick (§3, the table).

⭐ **The real objective is float32 precision and the `MaxWorldCoordinate = 8192`
ceiling.** Larger coordinates resolve a movement step more coarsely, and this
repo has already fought that jitter class once (`archive/plan-render-jitter.md`,
cited in `place.go`). So the packer should minimise the MAX ABSOLUTE COORDINATE
it hands out, not the empty area — and it should refuse rather than exceed the
ceiling, which `placeOne` already does.

### The rule it packs against

`separationFor(a, b) = a + b + gridCellMargin` on ONE axis — full widths, not
halves, because `InvAABB.updateBB` gives a wall a bounding box 2× its
half-extents (`place.go:135`, *"the plan first got wrong by a factor of two"*).
A shelf packer — one row per depth, rows spaced by the tallest zone in each
adjacent pair — satisfies it with a trivial implementation and leaves the
coordinates readable, which matters for every WARP and every log line.

⛑ **`checkSeparation` STAYS, and its job changes.** Today it catches an authoring
mistake; after U6 it catches a STALE PLACEMENT FILE — a zone widened in Tiled
without regenerating. That makes it more load-bearing, not less. **A test that
boots a deliberately stale placement and expects a refusal is the chunk's
headline test.**

### Landmines

- ⛑ **`randomSpawnPosition` takes a SIZE, not a rectangle** (`sys/state.go:454`)
  — it centres on `{0,0}` unconditionally. It is the last-ditch fallback when a
  zone has no campfires at all. **If the packer ever moves the PRIMARY zone off
  `{0,0}`, it drops players into the void between zones.** The same "a size is
  not a rectangle" bug class U4a spent itself removing from the map. Pin `world`
  at `{0,0}` via the origin override AND fix the function.
- ⚑ **Placement stability.** Inserting a zone must not reshuffle every other
  zone's coordinates: it churns the generated file in git and invalidates every
  WARP coordinate in notes and bug reports. Sorting by `(depth, name)` is
  deterministic but still shifts a whole row on an insert. **Open question** —
  an append-only first-seen order recorded in the placement file is the
  alternative, at the cost of the file being state rather than a pure function
  of the inputs.
- ⛔ **Do not have the CLIENT re-run the packing** from the same inputs. The
  point-in-rectangle rule is restated on both sides deliberately (`ActiveZone`
  says so), because it is small enough to get identically right twice. A
  packing loop is not: one float32-vs-JS-number difference in the accumulation
  desyncs every zone after it, and the failure is "the client renders the wrong
  zone in the wrong place". Read the generated file; do not recompute it.
- ⚑ **The direction byte moves off `OriginY` onto `Depth`**
  (`portalTravel.Direction`, `cfg.PlacedBounds`). Its tests are geometric today
  (`interaction_direction_test.go` builds zones at `y: 0/300/400`) and become
  depth-based, which is a simplification.
- ⚑ **`Zone.Origin`'s "+Y IS DEEPER" contract is DELETED by this chunk**, along
  with the U4b ledger paragraph that records it. Leave a note rather than a
  silent removal: the contract was correct for its window.

### Schema impact

**DB NONE** (no position and no zone id are persisted — verified 2026-09-08,
`persist/` carries neither). **WIRE NONE — that is the point.** **CONF NONE.**
**CONTENT**: one new field (`depth`, four writers) plus one generated file.

### ⛔ Deferred, with named triggers

At two zones this is pure cost. The bookkeeping it removes is "pick a Y for the
tier and an X off a 300 grid", and the mistake it prevents is already refused at
boot with an error naming both zones and the exact distance needed.

**Build it when either happens:**

1. A dungeon **grows and forces its neighbours to be re-spaced** by hand. That
   is the bookkeeping becoming real rather than theoretical.
2. The loaded zone count passes **roughly ten**.

⚑ **U0 (`plan-world-scale.md` S1, lazy zone bundling) is the more urgent
neighbour** and should land first: every zone file is bundled into every client
today, so the browser downloads every dungeon before entering one. U6 makes
authoring dungeons pleasant; U0 makes having them affordable.

---
## 7.1 What would actually make this faster

Ranked by value, and two of them are free.

1. ⭐ **Build the cave walls as blocking `paths`, not props.** The 777 props are
   on `LayerViewportCollision` and are the known per-player streaming cost; path
   corridors are **deliberately off it** (`core/game.go:135`) because the client
   draws them from its own bundled zone copy, so they *"cost the wire exactly
   zero"*. Cave corridors are precisely the shape a stroked polyline handles.
   **An underworld built from paths streams nothing** — this is the biggest win
   available and it is a content decision, not code.
2. ⭐ **Filter `RosterFor` by the viewer's zone** — closes **L14** and cuts
   roster bytes in one edit.
3. ⭐ **Keep the offset small** (**L12**) — not throughput, but it buys back
   simulation precision for free, and a smaller number is never worse.
4. ⚑ **Author the underworld SPARSE, and understand why.** Entity count, not
   area, is the currency — and it **couples across zones**: `SkillSystem` (6.6×)
   and `StatusEffectsSystem` (11.7×) walk **dormant** mobs, and M1-F4's
   `removeEntityUs` is O(*total* entities) fanning out to 14 systems. So
   underworld mobs make **surface** deaths and disconnects slower, and dormancy
   does not save you. ⭐ **This makes M1-F2's residue chunk a better prerequisite
   than S1** — S1 is bundle size, this is tick time.
5. **Prune `Space.grid`** (**L11**). ⚑ Not a naive delete-when-empty: the
   truncate-don't-remake behaviour is load-bearing (~20 % of idle garbage). The
   shape is a periodic sweep dropping cells empty for a whole window. General
   win; this plan is what makes it bite twice.
6. **S1 / U0** — bundle size, and the curtain is its load screen. Real, but the
   smallest of these.

⭐ **What does NOT need optimising, measured:** `NetSystem` is flat (1.2×) over a
10× world and `avgVisiblePerPlayer` holds at ~32 — AOI plus dormancy already
solved the networking axis, which is why a second zone is cheap on the wire in
the first place.

---

## 8. Schema impact

- **DB: NONE.** No position and no zone id are persisted; the overworld stays at
  origin `{0,0}`, so every saved character keeps a valid position. (L5's fix is
  a **validation** change, not a migration.)
- **Wire: YES, TWO appended fields** — `Welcome.zone_names` (§4.4) and
  `ConversationOption.travel:ubyte` (D7). Both append-at-end; no field id moves.
- **Conf: YES** — `game.zone` → `game.zones` (singular kept as a fallback).
- **Content: YES** — **two** new zone-format fields, each needing all three
  serializers (L3): `Zone.Origin` (U1) and `Spawn.Anchor` (U3b, plus the Tiled
  palette member). One new `TravelMode` string, one new grant key (`anchor`),
  two mob defs, one new zone file, and `game.zones` in every conf.

---

## 9. Open questions for the PO

1. ~~**The word.**~~ ⭐ **ANSWERED 2026-09-08 (PO): there is no new word.** The
   engine's name for a map/level is `Zone` and always was; "playfield" was an
   invention this doc carried for one day and no longer does. The underworld is
   **a second zone**. §2.1 records why "map", "level" and "layer" were all
   refused, and parks the pre-existing `content-zone2.md` label collision as
   somebody else's cheap fix.
2. ~~**The D6 amendment.**~~ ⭐ **DONE 2026-09-08** — recorded as
   `plan-release-map.md` **§8.0**, an explicit amendment block: the forbidden
   thing was the HANDOFF, not the file split; §8.3 is untouched; and the choice
   between "regions of one file" and "several placed files" is now an AUTHORING
   question decided per case, with §3.2 recording why the underworld went the
   second way.
3. **M1-F5 gets SHARPER, not softer.** An underworld is *by construction*
   unwatched most of the time, and both open halves apply to it: an unobserved
   mob-vs-mob fight never ends (and a slept mob is out of `phy.Space`, so also
   unhittable), and a mob can freeze mid-walk-home off its route. Not this
   plan's work — but this plan is what makes them visible in play.
4. **Logging out underground** (§6, last bullet) — accept "you surface", or open
   `plan-leaving-the-world.md` §8's unruled HP/position persistence question?
5. ⚑ **D7 changes a SHIPPED feature's feel.** `travel` is derived from the grant
   kind, so a transition now fires on *every* `travel_to` row — which today
   means the portal pair (`archive/plan-portal-spells.md`) and campfire recall,
   both currently a hard cut with no transition at all. They resolve to
   `3 lateral` and get a plain crossfade, never the curtain. Probably an
   improvement, and free — but it is a change to something already PO-verified
   in-game, so it wants a look rather than an assumption.

---

## 10. Cross-references

- `docs/architecture.md` §6 — the transition analysis; the prior design.
- `docs/plan-release-map.md` §8 — **D6**, the ruling this amends.
- `docs/plan-world-scale.md` §2 (nothing caps world size), §7 (**L5**, filed
  there), §11 M1 (the ~19× ceiling, F2/F4/F5), **S1** (U0).
- `docs/archive/plan-portal-spells.md` — the shipped teleport recipe, `travel_to`,
  **L6/L7/L8**.
- `docs/archive/plan-flight-paths.md` — **D13** (remove-from-space as structural
  non-interaction), **D16** (the map answers a different question).
- `docs/plan-region-primitive.md` §5 + `docs/plan-world-paths.md` — the
  three-writer whitelist (**L3**) and the client-visual posture.
- `docs/plan-leaving-the-world.md` §8 — the unruled logout question (§9 Q4).
- `docs/gdd.md` §7 — open-world dungeons, darkness & light.
- `docs/content-world.md` — the 21+ zone sketch, the tunnels, the unplaced caves.
