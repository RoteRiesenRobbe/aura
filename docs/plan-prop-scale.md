# Plan: Per-placement prop transform — scale, then rotation

> **Status: DESIGNED 2026-08-22, nothing built. Broadened the same day** from
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

So: 573 identical trees, 116 identical boulders. A forest cannot have one big
old tree among saplings. And `rotation` is worse than missing — it is
**authored everywhere and rendered nowhere** (`zone.go:29-34`), so every
authoring surface offers a control that silently does nothing.

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

## 5. Chunks

| Chunk | Contents | Wire | Size |
|---|---|---|---|
| **C1** | `Prop.Scale *float32` + validation + apply at `aurad.go:171-179`; the `getZoneAsJSON` whitelist line (L1); Tiled emit/read | **none** | small |
| **C2** | `Resource.rotation` on the wire + both binding regens; render it; option-(A) circle-only rule enforced at boot and in Tiled | **yes** | medium |

C1 stands alone and is worth shipping alone — the Python placement scripts and
Tiled can author `scale` immediately. C2 should not start until the option-(A)
ruling is taken.

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

## 9. Open PO calls

1. **`scale` multiplier vs absolute `size`** — §3.1 recommends the multiplier.
2. **The upper rail** — 10 is a placeholder.
3. **Rotation option (A) / (B) / (C)** — §4.2 recommends **(A)**, circle-bodied
   props only. This is the one call C2 cannot start without.
4. **Does scale apply to every prop type?** Recommendation: yes — a per-type
   allowlist is a rule with no mechanical need.
5. **Is the collision consequence (§3.5) wanted?** Recommendation: yes; a tree
   that looks big but walks small would be worse.

## 10. Chunk ledgers

*(filled per chunk at execution time)*
