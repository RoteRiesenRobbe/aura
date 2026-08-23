# Plan: Per-placement prop transform — scale, then rotation

> **Status: C1 SHIPPED 2026-08-23 (ledger: §10). C2 designed, not started —
> and now unblocked by the D3 ruling, with one sub-question left (§9.1).**
> Originally **DESIGNED 2026-08-22**, broadened the same day from
> scale-only to *"rotation and scale should work on all objects"* (PO). Opened
> by a PO observation during Tiled authoring (`plan-tiled-authoring.md` C1):
> *"I added a tree and made it much bigger in scale. The scale in game looks
> normal though."*
>
> ⭐ **"All objects" turns out to be mostly done already — the gap is props,
> and the two halves have very different prices** (§2). Scale is nearly free:
> props ride the Resource wire table, which **already carries a per-entity
> radius** the client **already** scales the sprite from. Rotation is not:
> `table Resource` has **no rotation field**, so it needs a FlatBuffers change
> and both binding regenerations — and rect-bodied props cannot honestly rotate
> at all (§4).
>
> ⚑ **Schema impact: DB NONE, both chunks. Wire: NONE for C1 (scale), YES for
> C2 (rotation).**
>
> ⚑ This is a **format change**, which `plan-tiled-authoring.md` §3 excludes.
> It is therefore its own plan; the Tiled tool follows the format, never drives
> it.

## 1. The gap

`world.Prop` carries `type`, `x`, `y`, `rotation`, `blocksMovement` — and no
size. Size belongs to the **type**:

```json
// api/props/tree.json
{ "name": "Tree", "entityType": "RoundTree", "body": { "radius": 1.0 } }
```

So: 575 identical trees, 116 identical boulders (counted 2026-08-23 against the
working `world.json`, 807 props in all — the plan's original 573/778 predate
the PO's own Tiled authoring). A forest cannot have one big old tree among
saplings. And `rotation` is worse than missing — it is **authored everywhere
and rendered nowhere**, so every authoring surface offers a control that
silently does nothing.

⭐ **C1 closed the scale half on 2026-08-23.** The rotation half is §4.

## 2. ⭐ What already works — measured, not assumed

| Array | Rotation | Scale |
|---|---|---|
| `terrain` | ✅ rendered | ✅ `size` (a half-extent) |
| `spawns` | ✅ rendered — `Mob.rotation` is on the wire, `SetAngle` applied at `sys/mob.go:189` | ✗ none, and **deliberately out of scope** (§7) |
| `props` | ✗ **stored, never rendered** | ✗ **no field at all** |
| `darkAreas` | n/a (circle) | ✅ `radius` *is* the scale |
| `campfires`, `anchors` | n/a (points) | n/a |

**So the whole of "rotation and scale on all objects" reduces to props.**

## 3. C1 — prop scale (cheap: no wire change)

### 3.1 A multiplier, not an absolute size

**`scale`, a multiplier on the type's body, default 1.0** — deliberately not
terrain's absolute `size`. A prop body is *either* a circle (`radius`) *or* a
rect (`width` + `height`, House is 4×3); one absolute scalar cannot express a
rect, while a multiplier scales both and keeps the authored aspect. It also
keeps a prop tied to its type: rescaling `house.json` still moves every house.

```json
{ "type": "Tree", "x": -50.62, "y": 47.97, "rotation": 5.947,
  "blocksMovement": true, "scale": 2.5 }
```

### 3.2 Why the wire needs nothing

`ResourceAddRadius(f32ToU16Px(e.Radius()))` (`codec/gamestate.go:610`) is
already per-entity, and `Resources.ts:63` already scales the sprite from it.
For a rect, `Prop.Radius()` returns the max half-extent and the client recovers
the aspect by `require`-ing the prop JSON directly (`Resources.ts:157-159`) —
so a scaled rect scales correctly with no client change either. The work is
multiplying the def's body at `cmd/aurad/aurad.go:171-179`.

### 3.3 Tri-state, like every other optional knob

Absent = inherit the type's body verbatim, so all 778 existing props keep
serializing byte-for-byte unchanged. Follows the `wanderRadius` /
`idleSpeedFactor` / `level` convention — and carries its landmine:

⚑ **L1 — the editor's serializer is a whitelist.** A field surviving only in
`fromJSON`'s spread is dropped on the next save; `spawn.level` was lost exactly
this way (`ZoneModel.ts:358-362`). `scale` must be named in `getZoneAsJSON`'s
props map **in the same chunk that adds it**, or scale authored in Tiled is
silently deleted by the next in-game-editor save.

### 3.4 Validation

`scale > 0`, checked with the other zone rules (`zone.go:277`). Upper rail
proposed at **`scale <= 10`** — **[PLACEHOLDER]**, a sanity guard, not a design
statement. (The hard ceiling is far off: the wire is `u16` px, so a radius past
~546 units would wrap.)

### 3.5 ⚑ Collision scales with it — a gameplay change, not a cosmetic one

The body *is* the collision shape, so a 2.5× tree blocks 2.5× the radius. That
is consistent and almost certainly wanted, but it means scaling props along a
path narrows the path. The resource-spot decal scales too (`size * 0.7`), and
the per-asset art-padding factors (`* 1.15` trees, `* 1.07` minerals) multiply
linearly and keep working.

## 4. C2 — prop rotation (the expensive half)

### 4.1 It needs a wire field

`table Resource` (`api/schema/server.fbs`) has `id`, `entity_type`,
`status_effects`, `pos`, `radius`, `aabb` — **no rotation**. Adding
`rotation:float` is an append, which is FlatBuffers-safe, but:

⚑ **BOTH binding sets must regenerate together.** `plan-immune-feedback.md`
records the exact failure mode: *a Go-only regen boots fine and the client
reads `undefined` forever*. Go: `make -C backend gen`. Frontend: `api/schema`'s
`make.sh`.

### 4.2 ⚑ The honest blocker: rect bodies cannot rotate

Physics rect props use `phy.NewSolidAABB` — an **axis-aligned** box
(`phy/solid_aabb.go:126`), with no rotation concept. A rotated House would
*render* rotated and *collide* unrotated: a visible lie, and exactly the kind
of thing that produces "I can't walk through the doorway" bug reports.

Three options, one recommended:

- **(A) Rotation only for circle-bodied props** — Tree, Boulder, Rock. A circle
  has no orientation, so collision is unaffected and honest. Rect props
  (House, GateWall) reject a non-zero rotation **at boot**, with a message
  saying why. **Recommended**: it ships the 741 props people actually want to
  rotate and refuses the 36 it would lie about.
- **(B) Render rotated, collide axis-aligned.** Cheapest, and dishonest.
- **(C) Rotated rect collision.** This is backlog §34 territory (hard
  collision) and far beyond this plan.

⚑ Under (A), Tiled must mirror the rule, or a rotation you can apply in the
editor fails only at boot — exactly the class of problem
`plan-tiled-authoring.md` C4 exists to catch. **That validator now exists**
(shipped 2026-08-23: `validateModel` in
`tools/tiled/extensions/aura-zone/aura-convert.js`), so C2 adds one rule to it
rather than building the mechanism: refuse a non-zero rotation on a prop whose
body is a rect. It needs the body SHAPE, which the generated `PROP_SIZE` does
not carry today — one more field out of `generate-palette.mjs`.

### 4.3 ⭐ SUPERSEDED by D3, 2026-08-23 — the answer is (B) plus a cleanup

**§4.2's three-way choice is closed and its recommendation was NOT taken.** The
PO ruled: *everything rotates, nothing is rejected* — option **(B)** — with the
lie defused by a content step rather than by a validation rule:
*"we can reset all newly affected rotations in the world json."*

So C2 is now:

1. `Resource.rotation` on the wire, **both** binding regens (§4.1 stands).
2. Render it on the prop sprite.
3. **No boot rule and no Tiled rule.** `PROP_SIZE` therefore does **not** need
   the extra body-shape field after all — that whole sub-task is dropped.
4. A one-off content pass zeroing the pre-existing junk rotations.

⚑ **Which rotations step 4 covers is the one open question — §9.1.** It is the
difference between "nothing changes on the commit" and "734 trees gain
orientation variety overnight".

⚑ **What (B) still costs, stated plainly so nobody rediscovers it as a bug:** a
rotated House renders at an angle and blocks an upright box. With step 4 taking
the existing 63 rect rotations to zero, that only bites when somebody
deliberately rotates a House afterwards — which the PO has accepted. Backlog
§34 (hard collision) is where it would be fixed honestly.

## 5. Chunks

| Chunk | Contents | Wire | Size |
|---|---|---|---|
| **C1** ✅ | `Prop.Scale *float32` + validation + apply at `aurad.go:171-179`; the `getZoneAsJSON` whitelist line (L1); Tiled emit/read | **none** | small |
| **C2** | `Resource.rotation` on the wire + both binding regens; render it; the §9.1 content cleanup. ⚑ NO validation rule — D3 dropped it | **yes** | medium |

C1 stood alone and shipped alone 2026-08-23 — the Python placement scripts and
Tiled can author `scale` now. C2 is unblocked (D3) but wants §9.1 answered
first, because that call decides what the world looks like after the commit.

## 6. Schema impact

**DB: NONE, both chunks.** No persisted table, column or write-shape moves.
**Wire: NONE for C1** (`Resource.radius` already exists and is already
per-entity); **YES for C2** (one appended `rotation:float`, both bindings).
Content JSON gains one optional key, which the `DisallowUnknownFields` loader
must be taught in the same chunk.

## 7. Deliberately NOT in scope

- **Mob/spawn scale.** Mobs already stream a radius, so it would be mechanically
  similar — but a mob's body radius is a *combat* quantity (aggro and bite
  radii key off it), so scaling a mob is a balance change wearing a cosmetic
  hat. If it is ever wanted it belongs in a mob plan, priced against the
  tuning tables, not here.
- **Non-uniform scale** (separate x/y) — YAGNI. One uniform multiplier.
- **Randomised scale as an editor brush.** The terrain palette already has a
  randomize-properties toggle and a forest is exactly where it pays. A good
  follow-on once C1 lands; not specified here.

## 8. Test strategy

- **Go:** table-driven zone fixtures — absent scale inherits the body verbatim
  (the case protecting all 778 existing props), scale on a circle body, on a
  rect body (both dimensions, aspect preserved), `scale <= 0` rejected, past
  the rail rejected. Plus an assertion that the **constructed physics body**
  carries the scaled radius, since collision is the half that is easy to forget.
  For C2: a rotated rect prop is rejected at boot (option A).
- **Frontend:** vitest on `ZoneModel` — a scaled prop round-trips through
  `getZoneAsJSON` (the L1 guard); one without it serializes unchanged.
- **Tiled:** extend `AuraTiledConvert.test.ts` — scale round-trips, absent
  stays absent, and (C2) a rotated rect prop is refused at save time.
- **In-game:** the `verify` skill — place a scaled prop, restart, confirm both
  the sprite **and** the collision radius changed (walk into it).

## 9. PO calls — ALL FIVE ANSWERED 2026-08-23

All taken in one session, before C1 was written.

| # | Call | Ruling |
|---|---|---|
| 1 | multiplier vs absolute `size` | **multiplier**, default 1.0 (§3.1 as written) → **D1** |
| 2 | the upper rail | **`scale <= 10`**, still [PLACEHOLDER] → **D2** |
| 3 | rotation option (A)/(B)/(C) | ⭐ **none of them as written — see D3** |
| 4 | which prop types | **all of them, and every future one** → **D4** |
| 5 | is the collision consequence wanted | **yes** → **D5** |

**D1 — `scale`, a multiplier on the type's body, tri-state.** §3.1 verbatim.

**D2 — the rail is `0 < scale <= 10`**, inclusive at the top, [PLACEHOLDER].

**D3 — ⭐ rotation: everything rotates, nothing is rejected.** The PO overrode
the plan's own recommendation: *"all should rotate and nothing reject of course.
But we can reset all newly affected rotations in the world json."* So option
**(B)**, plus a content step that removes the surprise — see §4.3, which
replaces §4.2's three-way choice.

**D4 — no per-type list exists, and that is the point.** The PO asked *"is there
no base type? it should not matter"* — correct: the boot seam reads
`p.Def.Body` generically, so the multiplier is applied in ONE function
(`Prop.EffectiveBody`) against whatever body the type declares. A new prop type
inherits scale with no code touched anywhere.

**D5 — collision scales with the sprite.** §3.5 as written. The body IS the
shape; a prop that looks big and walks small is the worse lie.

### 9.2 D6 — ⭐ the body is the VISUAL footprint (PO, 2026-08-23)

Taken **after** C1 shipped, off the PO's first in-game pass: *"all trees do look
smaller in Tiled than they do in the game though — houses seem not affected."*

Measured cause, two layers deep:

| | collider | sprite | ratio |
|---|---|---|---|
| Tree, unscaled | 120 px | 168 px | **1.40×** |
| Tree @ scale 2.045 | 245 px | 312 px | 1.27× |
| Tree @ scale 0.294 | 35 px | 71 px | **2.00×** |
| Rock / Boulder | — | — | 1.07× |
| House / GateWall | — | — | 1.00× |

1. **The offset.** Tiled drew the collider; the client inflated the sprite by a
   hardcoded per-class constant. Trees disagreed by 40%, houses by 0%.
2. ⚑ **The non-linearity, which is a C1 bug this plan got wrong.** §3.5 said the
   art-padding factors *"multiply linearly and keep working"*. The ×1.15 does;
   the **`+ character.size` addend does not**, so per-placement scale was
   non-linear on screen and worst on shrunk props — exactly what the PO hit.

⭐ **The PO's ruling inverted the model**, rejecting all three options offered:
*"can we not instead make the collider smaller and render trees at 1x? Tiled is
still WYSIWYG, game is fixed to not randomly upscale objects for a collider
purpose."*

So: **the authored body IS the visual footprint**, and collision is
`body.collisionFactor` of it. Chosen over growing the collider to the crown (a
40% navigation change on 575 trees) and over shrinking the tree to its collider
(a 25% world-appearance change), because it is the only one where **nothing
moves**: same look, same collision, WYSIWYG editor, linear scale.

⚑ The repo had already made this argument once and half-applied it — the
mineral art pass dropped its own addend for exactly this reason (*"a flat +30px
is half a Rock but a sixth of a Boulder"*) and the tree kept one until C1b.

### 9.1 ⚑ What D3 still leaves open for C2

*"Reset all newly affected rotations"* has two readings, and they produce
visibly different worlds. The count that makes it a real question was measured
during the C1 session, against the working `world.json`:

| | props | already carrying a non-zero `rotation` |
|---|---|---|
| circle-bodied (Tree, Boulder, Rock) | 743 | **734** |
| rect-bodied (House, GateWall) | 64 | **63** |

Those rotations are **script noise, not intent** — a straight wall of GateWalls
at x = 64.8 reads `3.71, 5.87, 4.37, 2.47, 3.83`. Nothing renders them today
(prop sprites draw at rotation 0), so nobody has ever seen them.

- **Reading (a): zero all 797.** Nothing changes visually on the commit;
  rotation becomes something you author deliberately in Tiled from then on.
- **Reading (b): zero only the 63 rect ones.** The rects stop lying about their
  collision box; the 734 circles gain instant orientation variety in the same
  commit — a world-wide look change, arguably a nice one.

⚑ **C2 must not start without picking one.** Both are one script run; the
difference is what the world looks like the morning after.

### 9.3 D7 — ⏸ C2 is DEFERRED, and §9.1 answers itself when it resumes (PO, 2026-08-23)

> *"For C2 we can do nothing and zero when it becomes a problem."*

C2 is **not cancelled and not scheduled**. Rotation stays authored-but-unrendered,
exactly as it has been since the format gained the field; the 797 noise values
are harmless precisely because nothing draws them.

⭐ **This retires §9.1 as a blocker.** The reading is (a) — zero them — and the
trigger is the first time a rotated prop is actually wanted, not a calendar. A
resuming session runs the one-line script then, against whatever `world.json`
looks like by then, which is strictly better than zeroing numbers now and
re-measuring later. Nothing else in this plan depends on it.

### 9.4 D8 — ⭐ every polyline vertex is a waypoint (PO, 2026-08-23)

Not a prop question at all — it surfaced in the same session, from the same
"Tiled disagrees with the game" family, and it changes the same converter, so it
is recorded here rather than reopening the archived Tiled plan.

**The old rule:** Tiled anchors node 0 of a polyline at the object origin, and
that origin is the spawn point — so `modelToZone` dropped it (`polygon.slice(1)`).
N clicks gave N−1 waypoints, and the node-0 handle was a silent no-op the manual
had to warn about.

**The ruling: keep it.** Every vertex is a waypoint. What you draw is the route.

⚑ **Neither reading was ever "the engine's".** `patrol.go` marches the waypoint
list and treats the spawn purely as where the mob starts — the spawn is not part
of the route in either rule. Nor was there a settled content convention to
preserve: of the 7 routes in `world.json`, **2 include their own spawn as
waypoint 0 and 5 do not**, because the in-game editor appends one waypoint per
click and never adds the spawn itself. Both shapes were hand-authored, and both
stay legal — dragging node 0 off the origin now expresses the second one.

⭐ **The risk that could have sunk this was measured, not argued**: whether real
Tiled normalises a polyline whose first vertex is off-origin. It does not —
`verify.sh` round-trips `world.json`, five off-origin routes included,
byte-identically.

**What it cost the PO to find:** a Wanderer drawn with three clicks that
ping-ponged between two points and ignored `patrolMode: loop`. ⚑ The
second half of that is independent of this ruling and now has its own warning in
the manual: **with two waypoints `loop` and `pingpong` are the same walk** —
loop wraps last→first, ping-pong reverses, and over two points both are
`A → B → A → B`.

## 10. Chunk ledgers

### C1 — prop scale ✅ SHIPPED 2026-08-23 (uncommitted)

Resizing a prop in Tiled now changes its size in the game — the thing the PO
tried on 2026-08-22 and found did nothing. One optional `scale` key, applied in
one function, reaching both body shapes and the collision behind them.

**Schema: DB NONE · wire NONE · content JSON one optional key.** No table, no
column, no `.fbs` change, no binding regen. `Resource.radius` was already
per-entity and the client already scaled the sprite from it, exactly as §3.2
predicted — measured, not assumed.

**The multiplier lands in ONE place.** `Prop.EffectiveBody()` sits beside
`Spawn.EffectiveWanderRadius()` and multiplies whatever body the type declares:

```go
func (p *Prop) EffectiveBody() PropBody {
    b := p.Def.Body
    if p.Scale == nil { return b }
    s := *p.Scale
    return PropBody{Radius: b.Radius * s, Width: b.Width * s, Height: b.Height * s}
}
```

Exactly one body form is ever set (`parsePropDefinition` enforces it), so
multiplying all three fields is safe — the zeroes stay zero, and a circle can
never turn into a rect. ⭐ **This is D4 made real: there is no per-type list
anywhere**, so a prop type added tomorrow inherits scale with no code touched.

**⭐ L1 had a SECOND face the plan did not name, and it is the worse one.**
Naming `scale` in `getZoneAsJSON` (§3.3) is necessary and not sufficient:
`readPropControls` in `_ZoneEditorPanel.ts` **rebuilds the prop from the panel
fields**, and the panel has no scale control — so nudging a Tiled-scaled prop in
the in-game editor would have reset it to its type's size with the whitelist
perfectly correct. Fixed by carrying it over in `applyControlsToSelection`,
the same move the spawn branch three lines down already makes for `waypoints`.
⚑ **The loss would have been somebody else's work**: this editor cannot author
scale at all, so the damage only ever flows one way.

**Tiled: the box IS the scale.** Before C1 the writer read a prop's box only to
recover its centre and threw the size away (that discard even had a test, now
inverted). Now:

- `zoneToModel` draws the box at `typeFootprint × scale`, so what you see is
  still what blocks movement — at the size it really blocks.
- `readPropScale` derives the multiplier back out of the box, in **one
  function** shared by `modelToZone` and `validateModel` — the C6 lesson.
- ⚑ **An untouched prop must derive EXACTLY 1**, or all 807 placements grow a
  `scale` key and byte-stability dies. It does: the two directions divide by the
  same `sz.w * PX`, and `x/x` is exactly 1 in IEEE-754. `1` then normalises
  back to absent, so an explicitly authored `"scale": 1` also disappears —
  deliberate, and the same call C6 made for its sentinels.

**Two save-time refusals, both Tiled-side only** (the server has no view of a
box): a prop resized past the rail, and — the dark-area circle check again — a
prop dragged **out of proportion**, since `world.json` carries one uniform
multiplier and would silently lose an axis. Both name the Tiled object id.

**⭐ The verify leg found a defect vitest structurally cannot see, and then a
worse one underneath it.** A new leg round-trips a zone of scaled props through
the real Tiled binary — vitest only ever drives the pure converter, which never
meets a `MapObject`, and the entire feature rests on Tiled handing back exactly
the box we set. It came back red: scale dropped, rail not enforced.

⚑ **The cause was not the code — `install.sh` COPIES the extension**, and
`--export-map` loads that copy. So `verify.sh` had been testing an installed
snapshot, not the working tree, and would report **green on code you have
already changed**. C5's *"ONCE per machine, and that is now literal"* is true
for content and false for a converter edit. Closed here: **verify.sh leg 0**
diffs the installed copy against the repo and refuses to run the other legs
when they differ — proven red on purpose, then green. `install.sh` and the
manual say it too.

With the copy refreshed, the scaled round-trip is **byte-identical**: Tiled
preserves a tile object's box exactly, which is the assumption the whole
mechanism rests on, now measured rather than hoped.

**Verified:**

- `go build ./...` clean · `go test -count=1 ./...`: **31 packages ok**, 4 red
  — ⚑ **identical at HEAD with this work stashed** (see below). `pkg/aura/world`,
  `model/prop` and `cmd/aurad` all green.
- vitest **459/459** (was 439; +20: 12 in `AuraTiledConvert.test.ts` 64 → 76,
  3 in `ZoneModel.test.ts`, plus the Go-side count is separate) ·
  `tsc --noEmit` clean.
- `bash tools/tiled/verify.sh` **all green**, 7 legs (leg 0 + two new scale
  legs). `api/zones/world.json` still round-trips **byte-identical** in both
  trailing-newline conventions with the scale code active — the D6 acceptance
  criterion, covering all 807 props at once.

**⚑ Pre-existing red, NOT caused by this chunk** — reproduced identically with
the work stashed, so nobody reads it as fallout: `cmd/simharness`,
`items/mobs`, `model/mob` and `quests` all fail on
`mob "AngryMammoth": tier "elite" must author factors.ccImmune`. The cause is
the **stale embedded content mirror** CLAUDE.md lists as unreproducible:
`api/mobs/angry-mammoth.json` was deleted at zone-editor C3 (`e9a0894c`) but
`backend/pkg/api/mobs/angry-mammoth.json` survives, because `cp-defs` copies
and never deletes. ⭐ **It IS reproducible now**, and the fix is one `rm` — but
it is not this chunk's, and deleting content is a PO call.

**⚑ Not verified: the in-game pass.** Placing a scaled prop, restarting and
walking into it (§8's last bullet) is a PO check. The headless legs cover the
data path end to end — including a physics-body assertion that a 2.5× tree
really carries a 2.5 collider — but not how it looks.

**Files:** `world/zone.go` (`Scale`, `MaxPropScale`, `EffectiveBody`,
validation) · `cmd/aurad/aurad.go` (the seam) · `world/zone_scale_test.go` +
`world/zone_body_test.go` (new; the second is `package world_test` because
`model` imports `world`, so an internal test could not reach `model/prop`) ·
`ZoneModel.ts` · `_ZoneEditorPanel.ts` · `aura-convert.js` ·
`AuraTiledConvert.test.ts` · `ZoneModel.test.ts` · `verify.sh` · `install.sh` ·
`manual-tiled-editor.md`.

### C1b — the body becomes the visual footprint ✅ SHIPPED 2026-08-23 (uncommitted)

Opened by the PO's first in-game pass on C1 (§9.2 / D6). A tree scaled in Tiled
now looks in game exactly as big as it looked in the editor, and shrinking one
actually shrinks it.

**Schema: DB NONE · wire NONE · content JSON one optional key** (`body.collisionFactor`)
plus retuned bodies for three prop types. No `.fbs` change, no binding regen —
`Resource.radius` still carries one scalar, it just now means the *visual*
radius rather than the collider.

**The inversion, in one line each:**

| | before | after |
|---|---|---|
| `api/props/*.json` body | the COLLIDER | the **VISUAL** footprint |
| sprite size | body × a hardcoded per-class constant in `Resources.ts` | exactly the streamed radius |
| collider | the body | body × `collisionFactor` (nil = 1.0) |
| Tiled box | the collider — 29% small on trees | the visual — **pixel-exact** |

**⭐ Nothing moved.** The migration is arithmetic, and a test pins it against
the very constants the client used to apply:

| prop | was body | → visual | collisionFactor | collider after |
|---|---|---|---|---|
| Tree | 1.0 | **1.4** | 0.714286 | 1.000000 |
| Rock | 0.5 | **0.535** | 0.934579 | 0.500000 |
| Boulder | 1.5 | **1.605** | 0.934579 | 1.500000 |
| House, GateWall | 4×3, 2.4×2.4 | unchanged | absent | unchanged |

`TestPropContent_C1bMigrationPreservesLookAndCollision` recomputes the OLD
client formulas (`r*120*1.15 + 30`, `r*120*1.07`) against the real `api/props`
and asserts the new visual radius lands on the same pixel and the collider on
the same unit. ⭐ **Proven red on purpose** by dropping Tree's factor: *"Tree
would change what it blocks"*. It is the only guard on numbers whose other half
lives in untestable client rendering code.

**⚑ The C1 bug this fixes, stated plainly.** §3.5 claimed the art-padding
factors *"multiply linearly and keep working"*. The ×1.15 does; the
`+ character.size` addend does not — it is a CONSTANT, so a tree shrunk to
0.294 drew at **2.00×** its collider while one grown to 2.045 drew at 1.27×.
Per-placement scale was non-linear on screen, worst exactly where authoring is
most fiddly. Folding the addend into the factor is what the mineral art pass
had already done for Rock and Boulder, for the same reason, in a comment that
reads like a prophecy of this chunk.

**⭐ Three copies of the placement loop became one.** C1 shipped its physics
test with an eight-line mirror of `aurad.go`'s loop and a comment admitting the
two could diverge; splitting the constructors turned up a **third** copy in
`cmd/aurad/scaling_profile_test.go`. All three now call **`prop.FromZone`**,
which is also the only place that knows a prop has two footprints. `model/prop`
may import `world` — the cycle only runs the other way (`model` → `world`), which
is why the zone package cannot build entities itself.

**⚑ Only `Prop.Radius()` may see the visual size, and that was worth checking
rather than assuming.** Mob steering takes the `phy.Circle` directly
(`circleRepulsion`), `mobRepulsion` is mob-to-mob, `summonPosition`'s radius is
the caster's — and the streamed AABB feeds nothing but the `?develop` debug
overlay, so it correctly keeps reporting the collider. The codec pin now builds
its prop with collider 0.75 and visual 1.05 **deliberately different**, so a
swapped pair cannot pass.

**⚑ Viewport streaming is untouched**, because the collider did not move: props
stream on `LayerViewportCollision` on the phy shape, which is the same shape at
the same size as before this chunk.

**Verified:**

- `go build ./...` clean · `go test -count=1 ./...`: **34 packages ok** (three
  more than at C1 — see the mirror note below), 1 red, all three of its cases
  pre-existing and isolated in a pristine HEAD worktree (below).
- vitest **459/459** · `tsc --noEmit` clean. Four Tiled tests needed their
  hardcoded pixel expectations updated — a tree box is 336 px now, not 240 —
  which is the change being visible in the right place.
- `bash tools/tiled/verify.sh` **7/7 green**. `api/zones/world.json` still
  round-trips **byte-identical** through the real binary although every prop box
  changed size, because both directions divide by the same new footprint.

**⚑ The stale embedded mirror is SOLVED, and CLAUDE.md's note about it can be
retired.** Running `cp-defs` for this chunk's content edit cleared it, and the
reason nobody could reproduce it is now clear: **`backend/pkg/api/mobs/.gitignore`
holds `*.json`**, so the embedded mob copies are a *local, gitignored artifact*
while the other 154 embedded JSONs are tracked. A fresh checkout therefore
cannot have the problem, and a machine that deletes a mob without re-running
`cp-defs` always will — the target does delete-then-copy precisely for this.
That took `cmd/simharness`, `items/mobs`, `model/mob` and `quests` from red to
green as a side effect (31 → 34 packages).

**⚑ Pre-existing red, isolated in a pristine HEAD worktree so it is not read as
fallout** — `cmd/simharness`:
- `TestLoadPlacements_EnumeratesTheAuthoredWorld` and
  `TestRunPlacementsBattery_ReconcilesAgainstTheAuthoredWorld` are a **hardcoded
  spawn census** (423 combat of 485). The PO's in-flight `world.json` has 489
  spawns, 424 combat. Proven by copying that `world.json` alone into a HEAD
  worktree: green before, red after. **The census needs bumping when the
  authoring pass lands** — it is not a code fault.
- `TestLoadPlacements_ZoneWithoutCombatSpawnsFailsLoudly` fails at HEAD on this
  machine with *"symlink … A required privilege is not held by the client"* —
  Windows developer mode, environmental.

**⚑ Not verified: the in-game pass.** That a tree still looks and blocks the
same, and that a scaled one now matches its Tiled box, is a PO check.

**Files:** `world/props.go` (`CollisionFactor`, `Collision()`, `VisualRadius()`,
validation) · `world/zone.go` (`EffectiveBody` → `VisualBody` + `CollisionBody`) ·
`model/prop/prop.go` (`visualRadius`, both constructors, **`FromZone`**) ·
`cmd/aurad/aurad.go` (the loop is two lines now) · `api/props/{tree,rock,boulder}.json` ·
`Resources.ts` (both padding constants deleted, and the dead `applyVisualPadding`
opt-out with them) · tests in `world`, `model/prop`, `codec`, `cmd/aurad`,
`AuraTiledConvert.test.ts` · regenerated `tools/tiled/palette/content.json`.

### C1c — the two incidents C1b caused, and D8 ✅ 2026-08-23 (uncommitted)

Both reported by the PO from the live game, hours after C1b. Neither was a code
defect; both were **content damaged by a correct change**, which is the failure
mode this plan will keep producing as long as the Tiled box derives from
authored content.

**⭐ Incident 1 — 742 props silently rescaled by one Ctrl+S.** Every tree in the
world rendered at 71.4%. The cause was not the code: the server was streaming
the right number all along (`Tree visual=1.4 u = 336 px sprite`, exactly what
`size × 1.15 + character.size` produced before C1b). `world.json` had grown
**574 `"scale": 0.714` and 168 `"scale": 0.935`** keys — the reciprocals of
`1.4` and `1.07`, the two C1b migration factors.

⚑ **The mechanism is C1's central design turned against itself.** *The box IS
the scale.* The PO's Tiled document had been open since before the palette
regenerated, so every tree in it still held its old 240 px box while the new
palette said 336 px — and the save dutifully derived `240/336 = 0.714` for all
574 of them. **Nothing can catch this**: the file is valid, the server accepts
it, and it round-trips byte-identically. It is only wrong against intent.

Repaired by multiplying each stored scale by its type's migration factor and
dropping the ones that returned to 1 — **742 dropped, 4 kept**. ⭐ The four
survivors self-verify: they came back as `2.045` and `0.294`, the exact numbers
measured on the PO's scaled trees *before* C1b, plus `0.258` and a `0.511`
boulder. The hazard is now documented in `manual-tiled-editor.md` §6 (close the
zone before regenerating the palette).

⚑ **Houses hid it for three hours.** Their body did not change, so they looked
right; rocks were wrong by 6.5%, under the noticing threshold. Only trees, at
29%, were visible — which reads exactly like "trees are broken" and sent the
first diagnosis after a stale binary. (`backend/aurad` *was* three weeks stale,
but `dev-restart-windows.sh` builds `aurad.exe` and boots it with
`-content ../api`, so it was never the one running. ⚑ Two binaries, one stale,
is its own small trap.)

**Incident 2 — a three-click patrol route with two waypoints.** Ruled and
implemented as **D8** above: `polygon.slice(1)` is gone, `waypointCount` loses
its `- 1`, the writer stops prepending an origin vertex, and the validator now
says "the polyline needs a second point". The pin that asserted the old rule is
rewritten, and a second one covers the draw-from-spawn shape (waypoint 0 *is*
the spawn — the Wolf `-42.37` route).

**Schema NONE** (authoring tooling and content only; no Go, no wire, no DB).
Verified: `verify.sh` **7/7** and `world.json` byte-identical through the real
Tiled binary — with five off-origin first vertices in it, which is the empirical
proof Tiled does not normalise them · `AuraTiledConvert.test.ts` 77/77 ·
`tsc --noEmit` clean.

### C1d — the census pins go away ✅ 2026-08-23 (uncommitted)

C1c left two legs red and proposed reconciling the numbers later. ⭐ **The PO
rejected the premise**: *"it just hardcodes a certain number of objects on the
map? that is a bad pattern, any map changes will break it. why does it need
it?"* It does not.

Each pin's own comment states an invariant about the **pipeline**, and each
asserted a **census** instead:

| leg | asserted | actually guards |
|---|---|---|
| `ZoneModel.test.ts` | `respawnFree.length === 17` | the whitelist serializer must not ADD a respawn to a spawn that had none |
| `placements_test.go` ×3 | `423` of `485` | every combat spawn reaches a placement row, and every row reaches the report |

Both now measure the input and reconcile the output against it, which holds at
any world size. ⭐ The ZoneModel one came out **strictly stronger**: it compares
the SET of respawn-free indices, so swapping *which* spawns are respawn-free no
longer passes, where the count did. ⚑ Each keeps a floor (`> 0`, `> 100`) —
a derived expectation of 0 would be satisfied by a loader returning nothing.

⚑ **The useful half of the old comment survives**: `IsCombatTarget`
(`XPFactor > 0 && !FriendlyToPlayers`) is a *different* derivation from
`scripts/world-regions.py`'s `xpFactor != 0`, and they diverge the day a species
is authored both XP-paying and friendly. That is caught by the per-placement
`IsCombatTarget` assert — **never by the count**, which is the point.

⚑ **The third `cmd/simharness` red was not a census.**
`TestLoadPlacements_ZoneWithoutCombatSpawnsFailsLoudly` used `os.Symlink`, which
needs a privilege Windows withholds unless Developer Mode is on — red on the
PO's machine and green everywhere else, which is **worse than red everywhere**:
it trains people to skim past a failing package. Replaced with a plain recursive
copy of a few hundred KB of JSON.

⭐ **`go test -count=1 ./...` is now 35 ok with ZERO red** — `cmd/simharness` was
red at HEAD before this work, and had been carried in the "known-inconclusive"
list. A pin that goes red on every content edit stops being a signal, which is
exactly what CLAUDE.md's own ⚑ *"measure the rate before diagnosing a flake"*
warns about.

Files: `cmd/simharness/placements_test.go` (derived census + the copy helper) ·
`ZoneModel.test.ts`. **Schema NONE.** Verified: Go **35 ok / 0 red** · vitest
**460/460** · `tsc --noEmit` clean.
