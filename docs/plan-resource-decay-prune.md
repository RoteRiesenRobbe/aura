# Plan: Prune the dead resource + decay layer (backlog §26)

**Type:** cleanup / dead-code removal. No behavior change.
**Origin:** backlog §26 (PO observation 2026-07-24 — *"'resources' in their former
Berryhunter sense no longer exist and are not intended to come back; same for
decaying"*). Same shape as the 2026-07-08 scoreboard prune and the step-7 heater
removal.
**Status:** PLANNING (written 2026-07-24). No production code yet.

---

## 1. What is dead, verified line-level (2026-07-24)

The Berryhunter resource/placeable/decay cluster is a **closed loop with zero live
entry points**. Re-verified against the current tree, not just inherited from §26:

- `NewPlaceableResource` (`model/placeable/placeableResource.go:91`) — **no callers**
  anywhere incl. tests. It is the only caller of `NewPlaceable` (`placeable.go:47`),
  which + `gen.NewStaticEntityWithBody` (`gen/resource_entity.go:25`) + `NewResource`
  (`resource/resource.go:55`) form the rest of the closed loop.
- `DecaySystem.AddDecayable` has exactly one call site — `game.go:334`, inside
  `addPlaceableEntity` (`game.go:318`), unreachable because nothing constructs a
  `PlaceableEntity`. `model.Decayer` has zero refs outside the cluster.
- The `codec/gamestate.go` marshal switch (lines 330-339) has three cases —
  `PlaceableResourceEntity`, `PlaceableEntity`, `ResourceEntity` — that no live
  entity satisfies. Every real `AddEntity` passes a player, mob, NPC, spectator,
  corpse, minion or **prop**.
- **Campfires are mobs, confirmed:** `aurad.go:131` does
  `mobsRegistry.GetByName("Campfire")` → `api/mobs/campfire.json`, then
  `mob.NewMob(...)`. Not a placeable. The one plausible live consumer, cleared.

### Corrections to the §26 removal inventory (found during this planning pass)

1. **`ResourceJuice.ts` is NOT dead — KEEP it.** It is `import './ResourceJuice'`'d
   by `Resources.ts:13`, the live 624-line prop renderer. The §26 inventory's
   "verify first" resolves to *keep*. Remove it from the removal list.
2. **The 9 item JSONs are safe to delete** — `api/items/resources/*.json` (×7) +
   `api/items/placeables/*.json` (×2). No Go code looks up any of their item names
   (`Wood/Stone/Bronze/Iron/Titanium/TitaniumShard/Feather/Campfire/BigCampfire`)
   against the *item* registry; the only `GetByName("Campfire")` hits the *mobs*
   registry. They load only into the item registry, which `game.Items()` never
   reads (§26 "Adjacent" note). **Caveat carried to execution:** grep the JSON
   *content* for cross-references (a mob drop / recipe ingredient naming one of
   these) before deleting, and re-check any item-count assertion in
   `cmd/aurad/loaders_test.go`.

---

## 2. ⚑ Load-bearing — do NOT cut (verified)

- **Props ride the `AnyEntityResource` wire path** (`gamestate.go:340`,
  decision B, `plan-world-zones.md` §3.2). So the `AnyEntityResource` wire enum,
  `PropEntityFlatbufMarshal`, and the frontend `Resources.ts` (+ its
  `ResourceJuice.ts` side-import) are **all live and stay**.
- **`model.PropEntity` interface stays** — it is `Entity` only; props do not
  satisfy `PlaceableEntity`/`ResourceEntity` (which additionally demand
  `Decayed`/`Item`/`Interacter`/`Stock`/`Resource`). Empirically safe: those
  cases sit *before* `case model.PropEntity` in the switch today and props stream
  correctly, so props already never match them. Removing the earlier cases
  changes no behavior.
- **`StatusEntity`, `UpdateSystem` stay** — shared by live entities. (Execution
  must confirm `UpdateSystem.AddUpdateable` has callers *other than* the deleted
  `addPlaceableEntity`; if it was the only one, `UpdateSystem` becomes a bonus
  removal — decide then, don't assume.)

---

## 3. Scope fork (the real design decision)

There are three concentric tiers. The safe, high-value core is Tier 1. Tiers 2/3
add frontend and wire-schema churn for diminishing returns.

### Tier 1 — backend entity/system prune (RECOMMENDED, the clean 90%)

Pure Go. No wire change, no frontend change, no schema regen. ~650 lines.

| Delete | Where |
|---|---|
| `model/resource/resource.go`, `model/placeable/{placeable,placeableResource}.go`, `gen/` (whole package — only `resource_entity.go`), `sys/decay.go`, `model/decay.go` | 544 lines |
| `codec/gamestate.go` — 3 marshal cases (330-339) + `ResourceEntityFlatbufMarshal` + `PlaceableEntityFlatbufMarshal` | ~45 |
| `core/game.go` — `addPlaceableEntity`, its `AddEntity` dispatch case (265-266), `DecaySystem` construction (162) + registration | ~30 |
| `model/entity.go` — `PlaceableEntity`, `ResourceEntity`, `PlaceableResourceEntity` interfaces, `ResourceStock` struct, `Decayed()`; check `Interacter` for other users before cutting | ~25 |
| `api/items/resources/*.json` ×7, `api/items/placeables/*.json` ×2 (gated on the §1.2 cross-ref grep) | 9 files |

After Tier 1 the server **never emits `AnyEntityPlaceable`**. The FlatBuffers
`Placeable` table + union member and the frontend `Placeable.ts` decode branch
remain — inert, never triggered. Harmless, but still dead.

### Tier 2 — frontend `Placeable.ts` decode-path prune (OPTIONAL)

Delete `frontend/.../game-objects/logic/Placeable.ts` (51 lines) + edit its 5
referencing sites: `EntityManager.ts` (import + `case Placeable` dispatch),
`GameStateMessage.ts` (import, `AnyEntity.Placeable` ctor map, `eType===Placeable`
branch, `EntityType.Placeable` map), `Events.ts` (`PlaceablePlacedEvent`),
`PlayerJuice.ts` (its subscription — a place-object juice hook that can never
fire). Keeps the schema. `tsc --noEmit` + a join smoke verifies. More entangled
than Tier 1 for a branch that already can't execute.

### Tier 3 — FlatBuffers schema prune (RECOMMEND DEFER)

Remove `Placeable` from `union AnyEntity` + the `Placeable` table + (maybe)
`EntityType.Placeable` from `server.fbs`, regenerate bindings both sides.
*Mitigating fact:* `Placeable` is the **last** `AnyEntity` union member
(value 4), so removing it does **not** renumber Character/Mob/Resource — the usual
union-prune landmine is absent here. But `EntityType.Placeable` is mid-enum and
*would* renumber. This tier belongs with the **item-system removal** (§26
"Adjacent" — the planned, separate item-registry cut), not here. YAGNI + wire
regen risk → defer.

---

## 4. Scope — DECIDED (PO, 2026-07-24)

- **Chunk 1 = Tier 1 + the 9 item JSONs** (gated on the §1.2 cross-ref grep). The
  whole backend/system prune, self-contained, lowest risk.
- **Chunk 2 = Tier 2** — frontend `Placeable.ts` sweep is **IN**. Separate chunk,
  own `tsc`/join-smoke verification.
- **Tier 3 (schema) DEFERRED** — folded into the future item-system removal, now
  tracked as an explicit to-do (§8, and backlog §28).

---

## 5. Test / verification strategy

No dedicated tests exist for any deleted code, so nothing is rewritten. This is a
deletion, so the discipline is *proving nothing live broke*, not TDD-red-first.

Per chunk:
- `go build ./...` from `backend/` — compiles clean (catches dangling refs).
- `go test ./...` — full suite green (esp. `codec`, `cmd/aurad/loaders_test.go`,
  any item-count assertion).
- `go vet ./...` clean.
- **Boot count check is the real proof** — props stream over the very path this
  touches. Boot the server, confirm the live prop/spawn counts are unchanged from
  baseline (the CLAUDE.md / editor-pass numbers, ~850 props / 380 spawns as of the
  last PO editor pass — read the actual boot log, don't trust this figure).
- Tier 2 only: `tsc --noEmit` + `verify` skill join smoke (character joins, props
  render, a campfire renders as a mob).

---

## 6. Sequencing note

§26 says **land this before any §24 work** (`core/game.go` registration matrix):
this deletes `addPlaceableEntity` + `DecaySystem`, taking §24's helper count 7→6
and one registered system out of the matrix, shrinking it without touching its
open design question.

---

## 7. Open questions — RESOLVED (PO, 2026-07-24)

1. **Frontend sweep (Tier 2)** → **YES**, Chunk 2 is in.
2. **Item JSONs** → **delete here**, in Chunk 1 (gated on the cross-ref grep).
3. **Schema (Tier 3)** → **defer**, into the item-system removal — tracked in §8.

---

## 8. Deferred to the item-system removal (tracked to-do)

The following is **out of this prune** but must not be lost — the PO asked it be
documented as an explicit to-do. Filed as **backlog §28**. It is the "planned
item-system removal" CLAUDE.md already references, plus this prune's Tier 3.

- **FlatBuffers `Placeable` schema prune (Tier 3):** remove `Placeable` from
  `union AnyEntity` + the `Placeable` table (renumber-safe — it is the last union
  member) and, carefully, `EntityType.Placeable` (mid-enum → renumbers); regen
  bindings both sides. Only worth doing bundled with the item-system cut.
- **Item registry:** `game.Items()` has zero live callers; the boot-loaded item
  definitions (Wood/Stone/Bronze/Iron/Titanium/TitaniumShard/Feather/Campfire/
  BigCampfire/None) + `items.Registry` + loaders + the frontend item/equipment/
  crafting scaffolding are the Berryhunter item cluster. Removing it touches
  `items.Registry`, the loaders, `model.Game`, and frontend item code — a
  separate chunk from this one. (After Chunk 1 deletes the resource/placeable
  JSONs, what remains in the item registry is the short list above.)

---

## 13. Chunk banner ledger

### Chunk 1 — backend + JSON prune ✅ 2026-07-24, committed `ee9d42e9`

Deleted the whole resource/placeable/decay cluster: `model/resource/`,
`model/placeable/` (both dirs), the `gen/` package, `sys/decay.go`, `model/decay.go`
(6 Go files, 3 dirs removed), the 3 dead codec marshal cases +
`ResourceEntityFlatbufMarshal`/`PlaceableEntityFlatbufMarshal` in `gamestate.go`,
`addPlaceableEntity` + its dispatch case + `DecaySystem` construction/registration
in `game.go`, the `PlaceableEntity`/`ResourceEntity`/`PlaceableResourceEntity`
interfaces + `ResourceStock` struct + now-dead `items` import in `entity.go`, and
the 9 resource/placeable item JSONs (`api/items/{resources,placeables}/`).

**Flags resolved before cutting:** `UpdateSystem` **kept** (live callers in
`sim/world.go` + the plain-entity path in `game.go`); `Interacter` **kept**
(load-bearing across `sys/skills.go`'s aura-touch path); JSON cross-ref grep came
back clean — the only prop→item-name hit (`"entityType":"Stone"` in
boulder/rock props) is the FlatBuffers **EntityType visual enum**, not the deleted
Stone *item*; the only `"Campfire"` content hit is the live **mob** def
(`api/mobs/campfire.json`), not the deleted placeable item.

**One deviation from plan:** the 9 JSONs turned out to be **100 %** of the nested
item content, so after `cp-defs` the `//go:embed *.json **/*.json` in
`backend/pkg/api/items/items.go` hit a zero-match on the `**/*.json` half (a hard
Go build error). Narrowed the directive to `//go:embed *.json` — `api/items/`
now holds only `none.json` (a top-level file), which `*.json` covers. Net effect:
the item registry is down to the single `None` entry, which pulls the **§28
item-registry removal** one step closer (it is now a 1-item registry).

**Verification (all green):** `go build ./...`, `go vet ./...`, `go test ./...`
(29 pkgs), `make -C backend build`. Boot embedded **and** `-content ../api`:
**0 errors/panics**, `props:777 spawns:471` (baseline match), `placed campfires
count:5`, `Loaded item definitions count:1`. No dangling refs to any deleted
symbol. §24 side-effect banked: `addPlaceableEntity` gone (helpers 7→6),
`DecaySystem` gone (registered systems 16→15).

Chunk 2 (frontend `Placeable.ts` sweep) is separate and not yet started.
