# Plan: Prop placeholders — a named, correctly-shaped stand-in for an unarted prop

**Status: BUILT 2026-09-05 — C1 + C2 both shipped in one session (§10).** Three
PO calls answered 2026-08-30 (§9). **DB schema NONE, content NONE**; FlatBuffers
one appended field + one enum value.

⛔ **READ §4.2’s AMENDED BLOCK BEFORE ANYTHING ELSE IN §§4-9.** The design below
reached for an authored `id` on every prop JSON, and it shipped keyed on the
prop’s existing **name** instead (PO objection during the build, sustained). So
every `prop_id` in §4.2 item 2, §5, §8 and §9’s D2 reads `prop_name` in the
built code, and the `id` those sections ask authors to add **does not exist** —
`api/props/*.json` is untouched by this feature. Those sections are kept as the
record of what was designed; §4.2’s amendment and §10 are the record of what is.

⚑ **This doc stays live for the PO's in-game pass (§8)**, which settles §9's one
open question (does the label rotate with the prop — it currently does) and the
§10 tuning notes. Nothing placeholder-shaped ships as content yet; §10 ends with
the five-line JSON that authors the first one.

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

### 4.2 ⭐ AMENDED AT BUILD (2026-09-05) — the discriminator is the NAME, not an id

Items 2 and 3 below shipped differently, on the PO's objection during the build,
and the objection was right. The wire field is **`prop_name:string`**, and
**no `id` is authored anywhere** — `api/props/*.json` is untouched by this
feature.

The design below reached for a numeric id by analogy with `Mob.mob_id`. The
analogy does not hold:

- **A prop is ALREADY keyed by its name.** Every placement in `world.json` says
  `{"type": "House"}`, `PropRegistry.GetByName` resolves it, and duplicate
  names are already refused at boot. The name *is* the prop's identity, so an id
  would be a **second identity for the same thing** — arbitrary, hand-sequenced,
  and one more field for every author and editor to keep in step.
- **`mob_id` earns its compactness; this cannot.** It rides every mob every
  tick, where 2 bytes beat a string 30×/s per mob. A prop's identity rides a
  handful of development-time stand-ins, behind the same entityType guard — so
  the byte argument that justifies a numeric key simply is not there.
- **The name is strictly more useful at the far end.** The label needs no lookup
  at all, and a placeholder whose def this client build cannot resolve (a prop
  added since the last `npm run build`) still draws a **labelled** square
  instead of an anonymous one — which is exactly the failure that cost a
  debugging cycle during C2's verification.

⚑ What does NOT change: one reserved `PropPlaceholder` enum value is still
needed. "No matching class or sprite" cannot stand in for it, because the server
hard-fails on an unknown `entityType`; and giving each placeholder its own enum
value would make every unarted prop a `.fbs` edit plus a regen of both binding
sets — the exact friction this feature exists to remove.

### 4.2 Mechanism (as designed — read with the amendment above)

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
- **Content: NONE** (⭐ amended, §4.2) — the wire carries the prop's existing
  `name`, so no prop JSON changes at all. As designed this said "every
  `api/props/*.json` gains `id`"; it does not.

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

### C1 + C2 — SHIPPED 2026-09-05 (built together)

The split was along the Go/TS verify tail rather than a dependency (§5 said so),
and building both in one session kept the wire field from sitting unread.

**What landed.** `PropPlaceholder = 77` and `Resource.prop_name:string`
appended last; both binding sets regenerated from the checked-in flatc 24.3.25
(only the two expected files moved). The codec writes `prop_name` behind an
entityType guard. Client: `PropPlaceholderLayout.ts` (pure geometry), the
bespoke `PropPlaceholder` class in `Props.ts`, the `BESPOKE_ENTITY_TYPES` +
`gameObjectClasses` entries, `propName` on the unmarshal and a 6th argument on
`EntityManager`'s shared constructor line, `propPlaceholder.svg` for the Tiled
palette.

⭐ **The design's authored `id` was DROPPED mid-build on the PO's objection —
see the §4.2 amendment.** A prop is already keyed by its name, so an id was a
second identity for the same thing. **`api/props/*.json` is untouched by this
feature**, and `world/props.go`'s whole diff is one comment.

**Schema: DB NONE, content NONE.** FlatBuffers: one appended enum value, one
appended field.

⭐ **The zero-cost claim is pinned at the BYTE level and mutation-checked.**
`TestPropEntityFlatbufMarshal_RealPropCostsNothing` compares a real prop's
encoding against a hand-built table with no `prop_name` slot at all — i.e. what
the codec emitted before this chunk. Flipping the guard to always-true makes it
fail (verified, both before and after the id → name change); every other test in
the file stays green either way, which is exactly the point.

⚑ **A string forces the guard to be ONE decision spent twice**, and that is why
`isPlaceholder` is a variable: a flatbuffers string is a separate object that
must be created BEFORE the table starts, so the `CreateString` and the
`AddPropName` sit on opposite sides of `ResourceStart`. An earlier draft tested
`propName != 0` at the add site, which works but reads as two guards that could
drift.

⭐ **The label fits against the largest INSCRIBED RECTANGLE of the text's own
aspect, not the bounding square.** For a chord of aspect `a` in radius `r` that
is `2ra/√(a²+1)` by `2r/√(a²+1)`. Names are far wider than they are tall, so the
inscribed square would have thrown away ~40 % of the usable width and dropped
labels that fit comfortably. The containment guarantee is tested geometrically
(the fitted label's corners stay inside the radius) rather than by restating the
formula, so a wrong formula cannot pass by agreeing with itself.

⚑ **The shape is built in the CONSTRUCTOR BODY, not `initShape`, and that is
forced.** `initShape` runs inside the `GameObject` constructor's `super()`
chain, before any subclass field initializer — so the `propId` argument is not
reachable from `this` there. `SimpleProp` hits the same wall and solves it with
a `static bodyAspect`, which cannot work here: one class serves every
definition. `initShape` therefore returns an empty positioned+rotated
`Container` and the drawing is added to it a moment later. Everything lives in
that one rotated container, which is what makes §4.3's "the label cannot leave
the bounds" true by construction rather than by arithmetic.

⚑ **`FromZone` is the only place the name reaches the entity.** `New`/`NewRect`
take resolved geometry and know nothing about the definition, so a prop built
outside `FromZone` reports `""` — which is exactly the wire's "absent" value, so
the two agree instead of one inventing a plausible wrong label. Tested for both
body forms, because `FromZone` branches on circle-vs-rect and the assignment
sits after the branch precisely so neither can be forgotten.

⭐ **The unresolvable case degrades BETTER than the id design would have.** The
shape needs the compiled-in def; the label does not, because the wire carries
the name itself. So a placeholder whose def this build has never seen draws a
**labelled** square at the streamed size. With an id it drew an anonymous one —
and that is precisely what C2's first verification run hit (see the harness trap
below), where it read as a broken wire field.

**Verified.** `go build` · `go vet` · full `go test -count=1` **fully green**
(the three long-standing `items/mobs` census reds went with `martin.json`, PO
call the same session — see `docs/feedback.md` 2026-09-05) · `tsc` · vitest
**586/586** (571 + 15 new) · prod build · palette regen (no prop change; it did
pick up the Martin deletion). New legs: world 3 · codec 3 · model/prop 2 ·
vitest 15.

⭐ **In-game, headless, 16/16** — all five §8 cases, against THROWAWAY content
(three placeholder defs + five placements) reverted afterwards, so the shipped
diff is the mechanism only: a round Well at its authored radius, a Bench at
2:0.6, a rotated placement whose label turns with it, a 2.5× scaled placement
measured as exactly 2.5× its unscaled twin, and a 26-character name in a
0.35-unit circle whose label is DROPPED rather than spilled. Negative control:
real props in the same layer still render as unlabelled sprites.

⚑ **Two harness traps cost a debugging cycle each, both now in the `verify`
skill.** A stale `backend/aurad.exe` shadowed the freshly-built extensionless
`aurad` (Windows PATHEXT), so the server panicked on a field that had been in
the source for an hour. And `-content ../api` is SERVER-only: `Props.ts`
compiles the prop defs in at webpack build time, so a placeholder added after
the last `npm run build` renders as an unlabelled square — which looks exactly
like a broken wire field, and sent the first debugging pass at the codec.

**OWED: the PO's in-game pass** (§8), and with it §9's open question — the label
currently rotates with the prop, which read fine at 0.6 rad in the verification
shot; the alternative is one line. Three things to look at while there, all
[PLACEHOLDER]: `LABEL_MAX_FONT_SIZE` (26) leaves a 5-unit prop's name looking
small against its footprint; the 0.85 fill alpha lets the ground read through,
which may or may not be wanted; and a dropped label leaves a small placeholder
with no identity at all, where a truncated name might serve better.

⚑ **Nothing placeholder-shaped ships as content.** The mechanism is complete and
the Tiled palette will carry a tile for the first one authored — but there is no
placeholder prop type in `api/props/` today, so the PO's pass needs one. The
whole of it is five lines:

```json
{
  "name": "Bench",
  "entityType": "PropPlaceholder",
  "sprite": "propPlaceholder.svg",
  "body": { "width": 2, "height": 0.6 }
}
```

then `node tools/tiled/generate-palette.mjs` and `npm run build` (see the second
harness trap above), and it is clickable in Tiled.
