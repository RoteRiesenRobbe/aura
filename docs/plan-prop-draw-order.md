# Plan: prop draw order — stop the stacking being random, then let Tiled author it

**Status:** DESIGNED 2026-09-20, nothing built. Two chunks, P1 → P2.
**Origin:** PO, 2026-09-20 — *"when i place props above each other, the draw order
seems random (which one is on top)"*, and on the follow-up, *"(all browsers)"*.
**PO call taken 2026-09-20:** authored in Tiled, over a Y-sort and over an
id-sort. Scope: **props only**, not mobs or characters.

---

## 1. What this is

Two overlapping props have no defined stacking order today. Which one draws on
top is decided by which one the server happened to name first in a snapshot,
and that is a **Go map iteration** — randomised by the runtime, per tick.

The fix is in two halves, and the order matters:

- **P1 — the DEFAULT.** A prop's place in the stack becomes the order it sits in
  the zone file, which is the order its object sits in Tiled's `props` layer.
  Deterministic, zero authoring, **schema NONE**. This is what actually answers
  the report.
- **P2 — the OVERRIDE.** An authored `drawOrder` integer per placement, for the
  pairs where file order is not what you want. Zone format + Tiled + one wire
  field.

⭐ **P1 is not a stepping stone to P2, it is the larger half.** You are not going
to hand-number 800 props, so whatever "absent" means is what the world will
look like. P1 makes absent *mean* something.

---

## 2. What was checked, not assumed

Every claim below was read out of the tree on 2026-09-20, not recalled.

1. **The randomness is a Go map.** `playerSendState` builds the snapshot with
   `for c := range p.Viewport().Collisions()` (`core/net.go:259`, and the
   spectator twin at `:297`). `Collisions()` returns `ColliderSet`, which is
   `map[Collider]struct{}` (`phy/shape.go:5`). Go randomises map iteration
   order deliberately, so the entity list is reshuffled **every tick**.
2. **The client never reorders.** `this.layer.addChild(this.shape)`
   (`_GameObject.ts:283`) is the only attachment, and a grep for
   `sortableChildren` / `zIndex` across `frontend/src` returns **zero hits**.
   Insertion order *is* z-order.
3. **It re-shuffles as you walk.** `EntityManager.newSnapshot`
   (`EntityManager.ts:242-262`) hides and deletes any object missing from the
   current snapshot, and `addOrUpdate` rebuilds it on its next sighting. So a
   pair does not merely pick a random order once — it picks a new one every
   time you leave and return.
4. **Entity ids ascend in zone-file order.** `ecs.NewBasic()` is
   `atomic.AddUint64(&idInc, 1)` (ecs@v1.0.5 `entity.go:35`), and props are
   built by `for i := range z.Props { g.AddEntity(prop.FromZone(&z.Props[i])) }`
   (`cmd/aurad/aurad.go:215`). Other entity types are created around that loop,
   which does not matter: the *relative* order of two props in one zone is
   exactly their file order.
5. **Zone-file order IS Tiled object order.** The converter reads
   `layer('props').map(...)` (`aura-convert.js:1012`) — an order-preserving map
   over the object layer — and writes the array back in order.
6. **Props pass through `ZoneModel` by spread.** `zoneToModel` does
   `(data.props || []).map(p => ({...p}))` (`ZoneModel.ts:395`), unlike
   `paths`/`polygons`/`atmospheres`, which enumerate their keys. So P2's field
   needs the `ZoneProp` interface widened and nothing else there.
7. **A tail wire field can be free.** `Resource.rotation` and
   `Resource.prop_name` are both appended at the table end precisely because
   the Go builder omits a field equal to its default and trims trailing zero
   vtable slots (`server.fbs:210-238`). The same holds for one more.
8. **Pixi v8 still has the sort mixin.** `sortableChildren` and `sortChildren`
   exist (`container-mixins/sortMixin.d.ts`). §4.2 declines to use them anyway,
   for a reason that is about ties, not availability.

---

## 3. Design

### 3.1 D1 — absent means zone-file order, and that is authored in Tiled

`drawOrder` absent (or `0`) puts the prop at its **zone-file index**, which is
its position in Tiled's `props` object layer. The PO reorders with Tiled's own
Raise/Lower on the object, exactly the metaphor
[plan-zone-naming.md](plan-zone-naming.md) N1 established for the layer stack
itself — the panel order is the draw order.

⚑ **To verify in P1, not assume:** that Tiled's Raise/Lower actually rewrites
object order in the saved `.tmx`/session, and that the order survives a
save → convert → reopen round trip. Fact 5 proves the converter is
order-preserving; it does not prove the GUI can change that order. If it turns
out Raise/Lower does not round-trip, D1 still holds (the order is deterministic
and readable) but the PO's only lever becomes P2's number, which raises P2's
priority rather than changing its design.

### 3.2 D2 — the tiebreak is the entity id, and the client does the ordering

⛔ **`sortableChildren` alone does not work here, and the reason is ties.** Pixi
sorts on `zIndex` with a stable sort, so two props with the same `drawOrder`
keep their *insertion* order — which is the random thing being fixed. Encoding
the id into the key (`drawOrder * 1e9 + id`) is exact in a double for the ranges
involved, and is also a hack the next reader will trip over.

⭐ **Ordered insertion instead.** On add, binary-search the layer's children for
the `(drawOrder, entityId)` slot and `addChildAt`. The layer stays sorted by
construction, arrival order is irrelevant, and there is **no per-frame cost at
all** — which matters more than it sounds, because props are added and removed
continuously as the viewport sweeps.

Cost: O(log n) compares plus the array splice `addChildAt` already does, once
per prop entering view, n = props in view (hundreds). Against the existing
`addChild` this is noise.

### 3.3 D3 — `drawOrder` is a plain `int16`, not a tri-state

`scale` is `*float32` and `blocksMovement` is `*bool` because both **override a
value the prop TYPE owns**, so they need a third state meaning "inherit".
`drawOrder` has no type-level counterpart — there is nothing to inherit — so `0`
can simply be the neutral value:

| authored | meaning |
| --- | --- |
| absent / `0` | no override; sits at its zone-file index (D1) |
| `> 0` | in front of every unauthored prop, ascending |
| `< 0` | behind every unauthored prop, ascending |

⭐ This satisfies the Tiled class-member sentinel rule the hard way rather than
the lucky way: an int member's Tiled default is `0`, and `0` genuinely maps back
to "not authored". No enum needed, unlike `AuraPropBlocks`.

### 3.4 D4 — one appended wire field, zero bytes for every prop that ships today

`draw_order:short = 0`, appended to `table Resource` **after** `prop_name`. By
fact 7 an unauthored prop encodes exactly the bytes it encodes now, vtable
included. Every one of the current placements is unauthored, so P2 does not grow
the 30 Hz snapshot by a single byte until something is actually reordered.

⚑ Considered and rejected: deriving the order client-side from the bundled
`api/zones/*.json` (the client does bundle them — [[project-zone-edit-half-live]])
keyed by position. It would cost zero wire, but it keys an entity to a placement
by float equality across two conversion paths, and it breaks the moment a prop
is placed at runtime by the in-game zone editor. One free field beats a fragile
join.

### 3.5 D5 — props only, and per layer

Ordering applies inside a container, and props already split across
`layers.resources.trees`, `layers.resources.minerals` and — for `underfoot`
props — `layers.terrain.decks` (`Game.ts:276-294`). Each sorts independently,
which is correct: `underfoot` already decides the *layer* question (a bridge is
under every entity), and `drawOrder` only ever decides ties *within* one layer.
It can never lift a deck above a character.

⛔ **Mobs and characters are out of scope** (PO, 2026-09-20). They move, so they
would need a `zIndex` write and a re-sort every frame, and Y-sorting them would
change combat readability that is already PO-approved (the mobs-under-characters
ruling).

### 3.6 D6 — sort the snapshot server-side too, as a separate small win

Sorting `entities` in `playerSendState` before marshalling does **not** fix the
stacking on its own — props entering on different ticks still append in arrival
order, which is why D2 exists — but it removes a genuine source of
non-determinism from the 30 Hz message, which the harness and any future delta
encoding both want. Cheap, unrelated to authoring, and it rides P1.

---

## 4. Schema impact

| | P1 | P2 |
| --- | --- | --- |
| DB | NONE | NONE |
| Wire | NONE | **one appended field**, `Resource.draw_order:short = 0`, zero bytes when unauthored (D4) |
| conf.json | NONE | NONE |
| Catalog | NONE | NONE |
| Zone format | NONE | **one key**, `drawOrder` on a prop placement |
| Content | NONE | NONE — every existing placement stays byte-identical |

---

## 5. Chunks

### P1 — the default: deterministic order, no authoring, schema NONE

1. Ordered insertion in the client: a shared helper that inserts a prop's shape
   into its layer at the `(drawOrder, entityId)` slot instead of appending.
   `drawOrder` is uniformly `0` in this chunk, so the key is the id alone.
2. Wire the entity id into the prop render classes — check what `Resource` /
   `SimpleProp` already carry before adding anything; `GameObject` takes `id` in
   its constructor.
3. D6: sort the entity slice in `playerSendState` and `spectatorSendState`.
4. ⚑ Verify D1's Tiled half: Raise/Lower an object in the `props` layer, save,
   convert, reopen, and confirm the order moved and survived.

**Done when** two overlapping props stack the same way every time — across a
walk-away-and-return, across a reload, and across a server restart — and Tiled's
Raise/Lower is what changes it.

### P2 — the override: `drawOrder` end to end

1. `server.fbs`: `draw_order:short = 0` appended to `table Resource`; regenerate
   **both** binding sets (`api/schema/make.sh`).
2. `world/zone.go`: `DrawOrder int16` on `Prop`, plus a range check beside the
   existing `MaxPropScale` one.
3. `model/prop`: carry it through `FromZone` onto the entity, and out through
   the `codec` Resource marshal.
4. `aura-convert.js`: read and write it, both directions.
5. `palette/propertytypes.json` + `generate-palette.mjs`: a `drawOrder` int
   member on the `AuraProp` class (id 12).
6. `ZoneModel.ts`: widen the `ZoneProp` interface (fact 6 — the spread already
   carries the value).
7. Client: feed the streamed value into P1's insertion key.

**Done when** a prop the PO numbers in Tiled draws where they numbered it, and
an unnumbered world is byte-identical on disk and on the wire.

---

## 6. Test strategy

- **P1, vitest:** the insertion helper directly — insert ids in a shuffled
  order, assert the resulting child order; then the same with `drawOrder`
  present (P2's key, exercised early). This is the whole of D2 and it is pure.
- **P1, Go:** `playerSendState`'s sort — assert the marshalled entity order is
  ascending by id for a fixed viewport. ⚑ Derive the expectation from the
  entities put in, never a hardcoded id list ([[feedback-tests-derive-not-hardcode]]).
- **P2, Go:** a zone fixture authoring `drawOrder`, round-tripped; and the
  range check.
- **P2, vitest:** `AuraTiledConvert.test.ts` — byte-stability both ways, with
  and without the key. ⚑ Its two byte-stability legs are on the known-inconclusive
  list at HEAD; check whether they are red *before* starting, so P2 is not blamed.
- **P2, `verify.sh`:** the field survives a real Tiled save. ⭐ That leg proves
  the NAME round-trips, never the GUI — the padlock lesson
  ([[project-tiled-roundtrip-blind-spot]]). The Raise/Lower check in P1 step 4
  and the "does the number do what it says" check are **human, eye-only**, and
  belong in the footer as such.
- **In-game, both chunks:** the PO's own report is the acceptance test — place
  two props overlapping, walk away, walk back, reload, restart.

---

## 7. ⚑ Landmines

1. **The id is stable *relatively*, not absolutely.** `idInc` is a global
   counter, so inserting content earlier in boot shifts every later id. That is
   fine — only the *relative* order of two props in one zone is load-bearing,
   and that is their file order, which does not move. ⛔ But it means an id must
   never be persisted or compared across restarts for anything else.
2. **`0` is both "unauthored" and "the middle".** A PO who authors `0`
   explicitly gets file-order behaviour and no way to tell. Accepted (D3) — it
   is the same trade `rotation: 0` already makes — but it is the thing to
   re-read if `drawOrder` ever grows a second meaning.
3. **`DisallowUnknownFields`.** `world/zone.go` refuses a boot on an unknown
   zone key, so P2's three writers and the two embedded copies move in one
   commit — the L1 rule from [plan-zone-naming.md](plan-zone-naming.md).
4. **A zone edit is half-live.** The client bundles `api/zones` directly while
   the server reads `backend/pkg/api/zones`, so P2 needs `make -C backend build`
   (or `-content ../api`) and a **restart** before the number does anything
   ([[project-zone-edit-half-live]]).
5. **The PO has uncommitted zone authoring in the tree.** All three
   `api/zones/*.json` are modified at HEAD. P2 touches the zone format, so it
   lands *after* that content is committed — the same L2 constraint
   `plan-zone-naming.md` N2 is waiting on. **P1 has no such constraint**, which
   is another reason it goes first.
6. **`addChildAt` and the render group.** Pixi v8 tracks children for its render
   groups; inserting rather than appending is supported, but the layer is also
   read by index in places that assume a shape's child layout
   (`AuraRings`/`EffectPips` do this on *characters*, not props). Check nothing
   indexes the prop layers by position before shipping P1.

---

## 8. PO calls

### Answered 2026-09-20

- **How is the order decided?** → Authored in Tiled, over a Y-sort and over an
  id-sort.
- **Does it apply to mobs and characters?** → No. Props only.

### Still open

1. **Is P1 enough on its own?** If Tiled's Raise/Lower turns out to be a
   comfortable lever, P2 may never be worth its wire field and its three
   writers. Worth a look at the end of P1 before committing to P2.
2. **Should the in-game zone editor expose `drawOrder`?** P2 makes it
   round-trip; making it *editable* there is a separate, smaller question.

---

## 9. Chunk ledgers

*(empty — nothing built)*
