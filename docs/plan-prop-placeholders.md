# Plan: Prop placeholders — a named, correctly-shaped stand-in for an unarted prop

**Status: designed 2026-08-30, nothing built.** Three PO calls answered the same
day (§9). 2 chunks. **DB schema NONE**; FlatBuffers one appended field + one
enum value; content: every `api/props/*.json` gains an `id`.

## 1. The gap

A new prop cannot currently exist in-game without art. You *can* author
`api/props/bench.json` reusing an existing `entityType` and it will boot, stream
and collide — but it renders as whatever that entityType already draws, because
`Props.ts` groups definitions **by entityType** and takes `defs[0].sprite` for
the whole group (`Props.ts:113-120`). A bench and a crate both authored as
`Tombstone` are two tombstones. The prop exists; you cannot see that it does.

NPCs solved this a while ago: `NpcPlaceholder` (`server.fbs:74`) is a red "?" on
a purple disc, authored directly as an entityType, *"deliberately not a
real-looking character: a red '?' on a purple disc, so missing art reads as
missing art."* Props have no equivalent.

## 2. ⭐ What already works — checked, not assumed

- **The wire size is already the visual footprint.** `Resource.radius` carries
  `PropBody.VisualRadius()` — the radius for a circle, the max half-extent for a
  rect — of the placement's scaled `VisualBody()`. `plan-prop-scale.md` §9.2
  (D6) ruled the authored body **is** the visual footprint, so there is nothing
  to un-inflate.
- **Per-placement `scale` rides that same scalar** (`world/zone.go:60`,
  `VisualBody()`), so a placeholder honours a scaled placement for free.
- **Rotation already rides the wire** (`Resource.rotation`, appended last, zero
  bytes when unrotated) and reaches the prop **constructor** rather than
  `setRotation` — deliberately, so props do not enrol in the turn-rate set
  (`EntityManager.ts:70-80`).
- **The client already compiles in every prop definition at build time** —
  name, entityType, body — via `require.context` over `api/props`
  (`Props.ts:53`). Resolving a name needs **no `/props` HTTP catalog**, unlike
  mob nameplates.
- **Text over a world entity exists**: the level-tinted mob nameplate,
  `Mobs.ts:129-205`.

## 3. ⚑ The constraint everything follows from

The `Resource` wire table (`server.fbs:137-158`) carries `id, entity_type,
status_effects, pos, radius, aabb, rotation`. **No name, no definition id.** Two
defs sharing an entityType — `Rock` and `Boulder` are both `Stone` — are
indistinguishable to the client.

The streamed `aabb` is **not** a way out: it is the *collider* box
(`e.AABB()`, i.e. body × `collisionFactor`, axis-aligned so a rotated prop's is
inflated), and it cannot tell a circle from a square in any case — a circle's
AABB *is* a square.

## 4. Design

### 4.1 ⭐ D2 is what sets the shape of the solution

The PO chose the **authored visual footprint** over the collider box (§9, D2).
The authored shape lives only in the prop definition, and the definition is
precisely what the wire cannot identify. So **a definition id is load-bearing
for the SHAPE, not only for the label** — and once it exists, one
`PropPlaceholder` entityType covers round, square and rect at every aspect
ratio. The earlier sketch of two or three fixed-shape entityTypes is dead: it
could not have given a second rect placeholder its own aspect anyway, because
`bodyAspect` is a **static per-class** field taken from the first rect def in
the group (`Props.ts:126-131`).

### 4.2 Mechanism

1. **`PropPlaceholder = 77`** in the `EntityType` enum — the next free value
   (76 = `Tombstone` is the current tail). ⛔ Never reuse a gap.
2. **`prop_id:ushort` appended at the END of `Resource`**, mirroring
   `Mob.mob_id` (`server.fbs:174`). The codec writes it **only** when the prop's
   entityType is `PropPlaceholder`, so it costs **zero bytes for every real
   prop** — the Go builder omits a field equal to its default and trims trailing
   zero vtable slots, which is the argument `server.fbs:152-157` already makes
   for `rotation`.
3. **`"id"` authored in each prop JSON**, exactly as mobs do (`wolf.json:3`),
   and added to `propDefinitionDoc`. ⚑ `DisallowUnknownFields` means all six
   existing prop files must gain one **in the same change** or boot hard-fails —
   loud, which is the wanted failure mode.
4. **A bespoke client class for `PropPlaceholder`**, listed in
   `BESPOKE_ENTITY_TYPES` so the generic derived-class path skips it. It draws
   **procedurally** (PixiJS `Graphics`, no texture): circle or rect chosen from
   the def's body, aspect ratio from the def, absolute size from the wire
   `radius` (which already carries per-placement scale), rotation from the
   constructor arg. No art file, no `maxSize` rasterisation, no `Preloading`
   registration.
5. **`propPlaceholder.svg` ships anyway**, for exactly one reason: the Tiled
   palette generator builds `props.tsx` as an image-collection tileset, one tile
   per prop type, resolving `sprite` to a real file
   (`generate-palette.mjs:89-98`). It is what you click to place the prop. It is
   never drawn in-game.

⚑ **The one mechanical wrinkle:** `prop_id` has to reach the prop constructor,
which is the shared `default:` line in `EntityManager.ts` that also builds mobs,
corpses and `DebugCircle`. A 6th argument is safe by the same rule the comment
there already states (*"Mobs and corpses reaching this same line take 3
arguments and DebugCircle 4, so the extra one is ignored there"*) — but it is a
line every entity type passes through, so it gets its own test.

### 4.3 The label

The prop's **name**, auto-fit inside the footprint, placeholders only, never
authored (§9, D3). Fit rule: measure at a reference font size, scale by the
smaller of `w/textW` and `h/textH`, clamp to a max so a large prop does not get
a billboard and to a min so a small one stays legible; below the min the label
is dropped rather than allowed to overflow the bounds. The name is resolved
client-side from the compiled-in defs, so it costs nothing on the wire.

Drawn in the prop's **local (rotated) space**, so it stays inside the bounds on
a rotated placement — the alternative (axis-aligned label over a rotated shape,
more readable but able to spill) is a one-line change if the in-game pass says
otherwise.

## 5. Chunks

- **C1 — the wire and the content id.** Enum value, `prop_id` on `Resource`,
  regen both binding sets, `id` in all six prop JSONs + `propDefinitionDoc`,
  codec writes it only for placeholders. Ships a field nothing reads yet.
- **C2 — the client placeholder.** Bespoke class, procedural circle/rect,
  auto-fit label, `BESPOKE_ENTITY_TYPES` entry, `gameObjectClasses` line,
  `propPlaceholder.svg` for the palette, palette regen.

Collapsible into one chunk if preferred; the split is along the Go/TS verify
tail, not a dependency.

## 6. Schema impact

- **DB: NONE.** Nothing persisted changes — props are authored world content,
  not character state.
- **FlatBuffers:** one appended field, one appended enum value. Both binding
  sets regenerate and deploy together.
- **Content:** every `api/props/*.json` gains `id`. Hard-fails at boot if
  missed.

## 7. Deliberately NOT in scope

- Placeholder **mobs** — `NpcPlaceholder` already exists and is unaffected.
- A **props tab in the content editor** — there is none today
  (`tools/content-editor/server.mjs` knows nothing of props); placeholder props
  stay hand-authored JSON.
- **Names on real props.** The label is placeholder-only by D3; a general prop
  nameplate is a `plan-entity-presentation.md` (backlog §39) conversation.
- **Dimensions in the label** — the drawn shape already shows the footprint.

## 8. Test strategy

- **Go:** prop def parse rejects a missing or duplicate `id`; the codec writes
  `prop_id` only for the placeholder entityType; ⭐ a byte-level pin that a
  non-placeholder prop's encoded `Resource` is **unchanged** (the rotation
  zero-cost claim has a test to copy).
- **TS (vitest):** def lookup by id; the auto-fit sizing math, which is pure;
  circle-vs-rect selection from a body; the 6-argument constructor line still
  builds mobs/corpses/DebugCircle correctly.
- **In-game (the PO pass):** a round placeholder, a rect placeholder at a
  non-1:1 aspect, a scaled placement, a rotated one, and a name long enough to
  hit the min-size clamp.

## 9. PO calls — ALL THREE ANSWERED 2026-08-30

- **D1 — always visible.** Not `?develop`-gated. Follows `NpcPlaceholder`
  (*"so missing art reads as missing art"*) and the content editor's stance
  that it *"never pretends a species with no sprite is ready to ship"*
  (`app.js:188`), against the `DebugCircle` precedent of dev-gating.
- **D2 — the authored visual footprint**, not the collider box. ⭐ This is the
  ruling that makes `prop_id` load-bearing (§4.1) and collapses the design to
  one entityType. Consistent with `plan-prop-scale.md` D6.
- **D3 — the label is the prop's name, auto-fit within its bounds, placeholders
  only.** Never authored or positioned by hand; it may scale within the bounds
  but not escape them.

**Still open, non-blocking:** whether the label rotates with the prop (§4.3
picks "yes" as the default; the in-game pass decides).

## 10. Chunk ledgers

*(none yet — nothing built)*
