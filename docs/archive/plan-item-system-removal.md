# Plan: Remove the dead Berryhunter item system (backlog §28)

**Type:** cleanup / dead-code removal. No gameplay behavior change.
**Origin:** backlog §28 (tracked 2026-07-24 during the §26 resource/decay-prune
planning) — CLAUDE.md's long-referenced "planned item-system removal", plus the
FlatBuffers schema tail (Tier 3) the §26 prune deliberately left behind.
**Precedent:** `plan-resource-decay-prune.md` (§26). Same shape, same
verification tail, same "prove nothing live broke" discipline. Read its §13
chunk ledger for the two process lessons that apply directly here.
**Status:** ✅ **COMPLETE** — all 3 chunks landed 2026-07-24
(`b9d01d33` backend registry · `2f933634` frontend scaffolding · Chunk 3 wire-enum
prune `8ed4ff4c`), each PO-verified in-game. Full ledger in §13.

---

## 0. Why this is now cheap

The §26 prune (`ee9d42e9`) deleted the 9 resource/placeable item JSONs, leaving
`api/items/` with a **single `none.json`**. The boot log reads `Loaded item
definitions count:1`. So this is no longer a ~10-definition unwind — the registry
is the `None` sentinel alone, and `game.Items()` has **zero live gameplay
callers** (verified below). What remains is deleting the *scaffolding* that loads,
stores, and type-defines an item system nothing consumes.

---

## 1. What is dead — verified line-level (2026-07-24)

### Backend Go — the `items` package (`backend/pkg/aura/items/`)

| File | Contents | Fate |
|---|---|---|
| `itemtype.go` | `ItemType` enum + `ItemTypeMap` | delete |
| `itemdefinition.go` | `EquipSlot`, `Tool`, `Recipe`, `Factors`, `Body`, `ItemDefinition`, `Item`, JSON DTO + parse/map | delete |
| `registry.go` | `Registry` iface, `RegistryFromFS/Paths`, `NewRegistry` | delete |
| `inventory.go` | `ItemID`, `ItemStack`, `NewItemStack`, `NewSingleItemStack` | delete |
| `itemdefinition_test.go`, `test-item.json` | tests (reference dead `StoneTool`/`FirePlace`) | delete |
| `itemvalidator/main.go` | standalone CLI printing parsed items | delete |

> **⚠ Do NOT touch `backend/pkg/aura/items/mobs/`** — it is `package mobs` (the
> mob catalog/registry), does not import the parent `items` package, and is fully
> live. The shared path is a naming coincidence.

**Blast radius — production imports of `aura/items` to unwire (8):**
`cmd/aurad/loaders.go`, `cfg/gamecfg.go`, `core/game.go`, `core/gameconf.go`,
`model/game.go`, `model/player.go`, `sim/world.go`, `items/itemvalidator/main.go`.
Plus 4 test files: `encounter/system_test.go`, `sys/mob_test.go`,
`sys/skills_behavior_test.go`, `sys/state_test.go`.

**The registry plumbing to remove:**
- `model/game.go:31` — `Items() items.Registry` interface method + import.
- `core/game.go:194-195` impl + `itemRegistry` field (`:39`, set `:79`).
- `cfg/gamecfg.go:28` — `ItemRegistry items.Registry` field + import.
- `core/gameconf.go:52-54` — `Registries(r items.Registry, m mobs.Registry)`
  drops its `items` param (becomes `Registries(m mobs.Registry)` or similar).
- `cmd/aurad/loaders.go:151-163` — `loadItems` + `contentSources.items`
  (`:42/54/79`); `aurad.go:64` (`loadItems` call) + `:98` (`Registries` call).
- `sim/world.go:201` — `Items()` stub returns `nil` (drops with the iface method).
- Test mocks returning `nil`/panic: `encounter/system_test.go:59`,
  `sys/state_test.go:175`, `sys/mob_test.go:60`.
- `cmd/aurad/loaders_test.go:28-30` — item-load assertion.

**Dead item-typed fields (orphans, safe to cut):**
- `model/player.go:18` — `Hand.Item items.Item`. The `Hand` struct is live (it is
  the physics sensor), but the `.Item` field is **never assigned or read** in
  production. Cut the field + the `items` import; keep `Hand`/`Hand()`.
- `PlayerHitsWith(p, item items.Item)` — exists **only** in test recorder mocks
  (`sys/skills_behavior_test.go:46,233,645,847,2682`). No production interface
  declares it, nothing calls it. Orphan test scaffolding — remove.

**The embed + sentinel JSON:**
- `api/items/none.json` (source) + `backend/pkg/api/items/items.go` (the
  `//go:embed *.json` copy). **`none.json` is also read by the frontend** (see
  below) — its deletion is coupled across the backend and frontend chunks.

### Frontend TypeScript — `frontend/src/features/items/`

| File | Contents | Fate |
|---|---|---|
| `logic/Item.ts` | `ItemConfig` (equipment.slot, `'stab'|'swing'`, placeable), `ItemDefinition`, `Recipe`, `enum ItemType` | delete |
| `logic/Items.ts` | icon preloader + `validatePlaceable()` | delete |
| `logic/ItemType.ts` | `RESOURCE/PLACEABLE/EQUIPMENT/CONSUMABLE` | delete |
| `logic/Equipment.ts` | `enum EquipmentSlot {HAND, PLACEABLE}` + helper | delete |
| `assets/icons/` | **54 dead item SVGs** (clubWood, swordIron, spikyWall, chest, furnace…) | delete |
| `client-data/Items.ts` | `ItemsConfig` (only `None`, loads `api/items/none.json`); comment already flags it for §28 | delete |

**The sole live importer to unwire:**
`features/backend/logic/BackendConstants.ts:1,6-16,28` — imports `Items`, builds
`itemLookupTable` / `NONE_ITEM_ID` in `initializeItemLookupTable()`, called from
`setup()`. Remove the import, the lookup-table build, and the `setup()` call.

> **✅ Already stripped in the earlier prune (confirmed absent):** no
> `equipItem`/`unequipItem`/`craftingIndicator`/hand-swing-animation code survives
> anywhere under `frontend/src`. The `'stab'|'swing'` strings live only in the
> dead `Item.ts` type defs. This chunk is deleting type/loader scaffolding, not
> live behavior.

### FlatBuffers schema (`api/schema/server.fbs`) — the Tier-3 tail (scope expanded 2026-07-24, PO)

**The `Placeable` table + union member:**
- `server.fbs:116-126` — `table Placeable { …; item:ubyte; … }`. Remove the table.
- `server.fbs:99` — `union AnyEntity { Character, Mob, Resource, Placeable }`.
  `Placeable` is the **LAST** union member ⇒ removing it does **not** renumber the
  survivors. Renumber-safe.

**The dead `EntityType` members (PO 2026-07-24 — prune all Berryhunter remnants,
not just `Placeable`).** `EntityType` (`server.fbs:5-79`) is a `ushort` with
**implicit sequential values** (position = wire value). Audit result — members
referenced by **no content JSON and no backend spawn**, only by the enum binding
+ the frontend `gameObjectClasses` render table:

| Remove cleanly (8) | Keep — backend-live, no JSON (3) | Remove but GATED (1) |
|---|---|---|
| `Border`, `MarioTree`, `Bronze`, `Iron`, `BerryBush`, `Placeable`, `Titanium`, `TitaniumShard` | `Character` (player, `player.go:25`), `Corpse` (`corpse.go:30`), `DebugCircle` (the `0` sentinel + zero-value trap) | `Flower` |

> **⚠ `Flower` is NOT free.** `model/npc/npc.go:28` —
> `const PlaceholderSprite = model.EntityType(AuraApi.EntityTypeFlower)` — the
> fallback sprite for NPCs without authored art. Repoint `PlaceholderSprite`
> first (→ `DebugCircle`, or a dedicated `NpcPlaceholder` type), *then* remove
> `Flower`. Skipping this repoint is a compile break, not a silent one.

> **⚠ The §27.2.1 fail-fast loader is the backstop.** Content references
> EntityTypes by name via `ResolveEntityType`; if the audit missed a live
> reference, boot **fails at load** with a clear message (not a silent wire
> mismatch). Boot over real content is therefore the decisive proof for this chunk.

**The dead `StatusEffect` members (PO fold-in 2026-07-24).** `server.fbs:81-89`
— `Freezing`, `Starving` (ordinals 2-3, mid-enum). Decoded on neither side
(`model/status_effects.go:5` documents them as wire vestiges). Remove both;
renumbers `Regenerating`/`DamagedAmbient`/`BurstFired` after them.

**⭐ Make future removals non-renumbering — assign EXPLICIT enum values.**
FlatBuffers permits explicit, gapped enum values. After pruning the dead sets,
pin explicit values on both `EntityType` and `StatusEffect` survivors so **every
future removal is a one-line delete that leaves a gap — no survivor ever
renumbers again**. This is the durable answer to "an ordered list that must stay
fixed forever and only grows." One-time value change now (free pre-persistence);
permanent stability after. (Recommended — see §3.)

**Regen + bindings:**
- Regen from `.fbs` via `api/schema/make.sh` (flatc): Go `backend/pkg/api/AuraApi/`
  (`Placeable.go`, `EntityType.go`, `StatusEffect.go`, `AnyEntity.go`), JS
  `api/schema/js/aura-api/` (`placeable.ts`, `entity-type.ts`, `status-effect.ts`,
  `any-entity.ts`).
- Frontend decode: `GameStateMessage.ts:302-380` `gameObjectClasses` Record —
  delete the rows for every removed `EntityType` (incl. the `Placeable: undefined`
  and `Border: undefined` rows). It is an **exhaustive `Record<EntityType, …>`**,
  so `tsc` will flag any member still present in the enum but missing a row (and
  vice-versa) — the compiler is the completeness check here.

> **Leave `client.fbs` `table Equip { skill_id; slot; }`** — that is the
> **aura/skill** equip message, not item equipment. Unrelated.

---

## 2. ⚑ Load-bearing / must-verify-first — do NOT cut blind

These are the §26-style gates. Confirm each **before** deleting, in-chunk:

1. **The boot-loaded "recipes" are AURA-combination recipes, not item crafting
   recipes.** The boot log shows `10 recipes`; the `items` package also defines a
   `Recipe` type + "recipe decoration" in `RegistryFromFS`. **Verify the 10
   recipes load through the skills/combination system (`skills.ApplyRecipes` /
   `api/recipes/` or `api/skills/`), NOT through `items.Registry`.** If any recipe
   loads via the item registry, that path must be re-homed before the registry is
   cut. (Near-certain the combination system is separate — it is central and
   predates items being dead — but this is the one gate that could hide a live
   consumer.)
2. **`game.Items()` truly has no live gameplay caller** — reconnaissance confirms
   only the load-time log + `nil`/panic test mocks + the sim stub. Re-grep at
   execution to be safe (`Items()`, `itemRegistry`, `ItemRegistry`).
3. **`layers.placeables` (frontend PIXI render layer) is NOT the item
   `Placeable`** — it is display-layer naming reused by mob-driven structures
   (`Game.ts:161,229-266,478`, `IGame.ts:20`). Leave it entirely; it is a
   different concept that merely shares the word.
4. **`GameStateMessage.ts:166` `item: undefined`** is unrelated snapshot
   scaffolding, not the `Placeable.item` wire field. Do not conflate.
5. Re-run the §26 process lesson: **rebuild frontend AND backend after any
   content/JSON deletion** — deleting `api/items/none.json` breaks the static
   frontend `require` in `client-data/Items.ts` with *no backend symptom* (this is
   exactly the Chunk-1→Chunk-2 regression §26 hit).

---

## 3. Schema-chunk decisions — RESOLVED (PO, 2026-07-24)

The original A/B fork ("leave the dead enum member vs. remove it") was resolved
in favour of a **full dead-wire-enum prune**, after the PO's architecture
question exposed the underlying smell (an append-only, position-numbered enum
that must stay ordered forever). Decisions:

1. **Remove the whole dead Berryhunter `EntityType` set, not just `Placeable`**
   (the 8 clean + `Flower` gated on the `PlaceholderSprite` repoint — §1).
   Safe *now* because nothing persists wire ordinals (no DB; restart wipes;
   client+server regen from one schema and deploy together). Gets expensive after
   step-8 persistence → do it now.
2. **Fold in `StatusEffect.Freezing/Starving`** — same prune, same regen.
3. **⭐ Pin EXPLICIT enum values on the survivors** (both enums) so future
   removals leave gaps and never renumber a survivor. This is the durable fix for
   the "ordered-forever list" concern, done once while the wire is already being
   regenerated. **Recommended; confirm in §5.**

**Why renumbering is safe today (the load-bearing assumption):** (a) no
persistence — nothing stores a wire ordinal across a schema change; (b) content
references EntityTypes **by name** via `ResolveEntityType`, so JSON is stable
across a renumber; (c) no rolling deploy — client+server ship from the same
schema commit. The only residual risk is a deploy-skew window (old client ↔ new
server), which already applies to *any* wire change. Post-persistence, assumption
(a) dies — hence "now, before step 8."

---

## 4. Proposed chunking (mirrors §26's rhythm, +1 for the schema)

The natural fault line is the shared `api/items/none.json`, read by **both** the
backend embed and the frontend `client-data/Items.ts`. Whichever chunk is last
deletes it.

### Chunk 1 — backend registry removal (pure Go, no wire, no frontend)
Delete the `items` package + `itemvalidator` CLI, unwire the 8 production imports,
remove `game.Items()`/`ItemRegistry`/`loadItems`/the `Registries` items param, the
dead `Hand.Item` field, the orphan `PlayerHitsWith` test scaffolding, and the
`backend/pkg/api/items/` embed. **Leave `api/items/none.json` (source) in place**
— the frontend still reads it until Chunk 2. Gated on §2.1 (recipes) + §2.2.
- Verify: `go build ./...`, `go test ./...` (29 pkgs), `go vet ./...`,
  `make -C backend build`, boot embedded + `-content ../api` → 0 panics, prop/
  spawn/campfire counts unchanged, boot log no longer prints the item count line.

### Chunk 2 — frontend scaffolding removal (+ delete `none.json`)
Delete `features/items/` (Item/Items/ItemType/Equipment + 54 SVGs),
`client-data/Items.ts`, unwire `BackendConstants.ts` itemLookupTable, then delete
`api/items/none.json` (last reader gone) + the `devops/bundle/api/items/` deploy
snapshot copy.
- Verify: `tsc --noEmit` clean, `webpack` prod build clean (this is where a
  missed `require` surfaces), `verify` skill join smoke both muxes (character
  joins, props/campfires render).

### Chunk 3 — FlatBuffers dead-wire-enum prune (wire regen, both muxes)
Per §1 + §3. In order:
1. Repoint `model/npc/npc.go:28` `PlaceholderSprite` off `Flower` (→ `DebugCircle`
   or a new `NpcPlaceholder` type) — **do this first**, it is the one live coupling.
2. `server.fbs`: remove the `Placeable` table + its `AnyEntity` union member +
   the `Placeable.item` field; remove the 9 dead `EntityType` members; remove
   `StatusEffect.Freezing/Starving`; **assign explicit values** to both enums'
   survivors (if §5 confirms).
3. Regen both sides (`api/schema/make.sh`); delete now-orphan generated files
   (`Placeable.go`/`placeable.ts`).
4. Frontend: delete every removed row from the exhaustive `gameObjectClasses`
   `Record` in `GameStateMessage.ts` (incl. the two `undefined` rows) — `tsc`
   enforces Record⇄enum completeness, so a missed row won't compile.
- Verify: `go build`/`go vet`/`go test ./...`, `tsc --noEmit`, full
  `make -C backend build` + frontend prod build, **boot over real content
  (`-content ../api`) = the decisive check** (the §27.2.1 loader fails loudly if a
  removed EntityType is still referenced), join smoke both muxes. **The regen
  touches everything — rebuild backend AND frontend.**

> **Chunk 3 is committed (PO 2026-07-24), scope expanded** from "just Placeable"
> to the full dead Berryhunter wire-enum prune + explicit-value pinning. It is the
> highest-wire-churn chunk; keep it strictly last and its own session.

---

## 5. Decisions — RESOLVED (PO, 2026-07-24)

1. **Chunk 3 (schema prune): IN**, scope expanded to the full dead-wire-enum
   prune (§3).
2. **Dead `EntityType` set removed**, not just `Placeable` (§1 table).
3. **`StatusEffect.Freezing/Starving` folded in** (§3).
4. **Explicit enum values on the survivors — YES** (PO 2026-07-24). Pin explicit
   values on both `EntityType` and `StatusEffect` in Chunk 3 so future removals
   leave gaps and never renumber a survivor (§3.3).
5. **Cadence:** one chunk per session, pausing between (house style).

**All decisions resolved — the plan is ready to execute, Chunk 1 first.**

---

## 6. Test / verification strategy

No dedicated tests exist for any deleted code, so nothing is rewritten (same as
§26). This is deletion — the discipline is *proving nothing live broke*, not
TDD-red-first. Per-chunk gates are listed inline in §4. The **boot count** (props/
spawns/campfires unchanged) and the **join smoke** are the real proofs, since
props stream over paths adjacent to what these chunks touch.

---

## 7. Sequencing

- §28 is unblocked now (§26 fully done). No roadmap step depends on it.
- **§28 shrinks §24** (`core/game.go` registration matrix) further only if a
  `Placeable`-related helper survives — after §26 it does not, so no interaction.
- Do this **before** step-8 accounts/persistence: once a DB stores wire values,
  the §3 "nothing persists ordinals" argument that makes Option B safe evaporates.
  Removing dead wire types is strictly cheaper pre-persistence.

---

## 13. Chunk banner ledger

_(to be filled per chunk at execution, in the §26 house format)_

### Chunk 1 — backend registry removal — DONE (2026-07-24), pure Go / no wire / no frontend, committed `b9d01d33`

Deleted the dead `items` package + its scaffolding; nothing gameplay consumed it
(the §26 prune had already emptied the registry to the `None` sentinel).

**Deleted:** `pkg/aura/items/{itemtype,itemdefinition,registry,inventory}.go` +
`itemdefinition_test.go` + `test-item.json` + `itemvalidator/` CLI; the
`pkg/api/items/` embed dir. **Kept `pkg/aura/items/mobs/`** (the live mob
catalog — shared path is a naming coincidence).

**Unwired (production, 8 + the entrypoint):** `loaders.go` (`aitems`/`items`
imports, `contentSources.items` field + its `embeddedContent`/`diskContent`
wiring, `loadItems`), `aurad.go` (`loadItems` call + `Registries` arg),
`core/gameconf.go` (`Registries` items param + `g.ItemRegistry` set),
`cfg/gamecfg.go` (`ItemRegistry` field), `core/game.go` (`itemRegistry` field +
init + `Items()` method), `model/game.go` (`Items()` interface method),
`model/player.go` (`Hand.Item` field — `Hand`/`Hand()` kept), `sim/world.go`
(`Items()` stub). **Tests:** removed `Items()` mocks in `encounter/system_test.go`,
`sys/state_test.go`, `sys/mob_test.go`; the 5 orphan `PlayerHitsWith` recorders in
`sys/skills_behavior_test.go`; the item assertion in `loaders_test.go`.

**Gates verified before cutting (§2):** ① the 10 boot "recipes" load through
`skills.RecipeRegistry`/`ApplyRecipes` (`skills/recipe.go`, `recipe_apply.go`),
NOT `items.Registry` — the dead `items.Recipe` type went with the package;
② `game.Items()` had no live gameplay caller (only load-log + config plumbing +
`nil`/panic test mocks + the sim stub); ③ `Hand.Item` was never assigned
(`player.go:74` sets only `Collider`).

**Two deviations from the plan's blast-radius list (both in-scope, flagged to PO):**
① **`cmd/simharness/content.go`** — the plan's audit missed it. `contentFS`
loaded an items FS but **both callers discarded it** (`_`). Collapsed `contentFS`
from 4→3 filesystems. Removing it now is also forward-compatible with Chunk 2
deleting `api/items/`.
② **`backend/Makefile` cp-defs** — dropped `../api/items` from the copy line
(and the `$(info)` text) so `make build` no longer resurrects a stray
`pkg/api/items/none.json` with no `.go` embed.

**Left in place (per plan):** `api/items/none.json` (source) — the frontend still
`require`s it until Chunk 2 deletes it.

**Verified:** `go build ./...` OK, `go vet ./...` OK, `go test -timeout 120s ./...`
green (29 pkgs), `make build` produces `aurad`. Boot **embedded** and
**`-content ../api`** identical + 0 panics, and the `Loaded item definitions` log
line is **gone**: 83 skills / 14 factions / 50 mobs / 10 recipes / 5 prop defs /
zone props 777 / spawns 471 / 5 campfires / 14 npcs. No wire/schema/JSON change,
so no frontend rebuild needed this chunk.

### Chunk 2 — frontend scaffolding removal — DONE (2026-07-24), + delete `none.json`, PO-verified in-game, committed `2f933634`

Deleted the frontend half of the dead item system, mirroring Chunk 1. Nothing
gameplay consumed it (the §26 prune had already emptied the registry to `None`).
63 files, **1253 deletions, zero production-logic additions.**

**Deleted (per plan):** `frontend/src/features/items/` —
`logic/{Item,Items,ItemType,Equipment}.ts` + **54 item SVGs**;
`frontend/src/client-data/Items.ts`; `api/items/none.json` (last reader gone) +
the now-empty `api/items/` dir; the stale gitignored `devops/bundle/api/items/`
snapshot (regenerated wholesale from `api/` on next deploy anyway).

**Unwired:** `index.ts` side-effect import `./features/items/logic/Items` (a
**5th coupling the plan's `.ts` blast-radius list missed** — it named 4);
`BackendConstants.ts` — dropped `Items` import, `NONE_ITEM_ID`,
`itemLookupTable`, `initializeItemLookupTable()` + its `setup()` call. **Kept**
`statusEffectLookupTable`/`setup()` — live, used by `GameStateMessage.ts:402`.

**Three deviations from the plan, all surfaced by the verification gates
(in-scope):**
① **`credits.html`** (webpack-surfaced — exactly the §26 hidden-`require`
lesson): the "Credits for used graphics" section embedded ~24 deleted item icons
via html-loader ⇒ **removed the whole graphics-credits section** (PO-approved
2026-07-24), kept the Authors section. game-icons.net icons no longer ship
anywhere, so the CC BY attribution obligation lapses.
② **`graphics.html`** (grep-surfaced): a dev-only art gallery (internal-tools,
**not bundled**, no in-game route) with 54 dead icon links ⇒ **deleted**
(PO-approved). `artwork.html` (references a live `flower.svg`) kept.
③ **dead item-give block in `developPanel.html`** (in-game-surfaced — the "Add
Item" button): `develop_itemSelect`/`itemCount`/`itemAdd`, **zero TS handlers**
(already inert, pre-dates this chunk) ⇒ removed as in-scope dead item UI; no PO
call (an unwired block can't break anything, and the join smoke proved no
handler exists).

**Gates verified (plan §4 Chunk 2):** `tsc --noEmit` clean; webpack prod build
green (surfaced credits.html → fixed → green; rebuilt again after the dev-panel
edit); **no backend rebuild needed** — Chunk 1 already decoupled the backend from
`api/items` entirely (embed removed + `cp-defs` dropped `../api/items`), so
deleting `none.json` had **zero** backend impact; backend boot from
`-content ../api` clean, counts identical to Chunk 1's baseline: **83 skills / 14
factions / 50 mobs / 10 recipes / 5 prop defs / 777 props / 471 spawns / 5
campfires / 14 npcs, 0 panics** (the `Loaded item definitions` line stays gone);
join smoke both `&develop` and plain — character spawns, **zero console/page
errors** (decisive signal for a missing require/asset), world renders (campfire
safe-zone, props, flowers, 2 NPCs, aura ring, full HUD, Websocket PLAYING).

No wire/schema change — that is **Chunk 3**.

### Chunk 3 — FlatBuffers dead-wire-enum prune — DONE (2026-07-24), wire regen both muxes, PO-verified in-game 2026-07-24, committed `8ed4ff4c`

The last chunk: deleted the dead Berryhunter wire types and **pinned explicit
values on both enums**, so no future removal can ever renumber a survivor.
32 files, **131 insertions / 1033 deletions.**

**Plan audit first (PO ask: "verify the plan for any bad code smell").** The
plan's dead-set audit was re-derived independently across all 74 `EntityType`
members (content JSON × non-generated Go × frontend) and **held exactly**:
only the 8 clean + `Flower` have zero live references, `Placeable` is the last
union member (renumber-safe), the frontend `entityCtors` map already omitted it,
and `Freezing`/`Starving` have no emitter. **Four problems were found:**

① **🔴 The plan's repoint target was broken.** §4 step 1 said point
`PlaceholderSprite` at `DebugCircle` — which is a **dev-tool class with a
60-tick TTL that deletes itself** and calls `Develop.get()`, initialised only
under `?develop`. Following the plan literally would have given NPCs that vanish
after ~2 s and threw on a normal client. (Mitigating: all 14 `world.json` NPCs
author an `entityType`; only the 2 legacy proving-grounds NPCs hit the
placeholder.)
② **`StatusEffect.Yielded` was equally dead and not in the plan** — zero
emitters (only the const in `model/status_effects.go`), yet the frontend carried
a full `forYielded` VFX + a `Resources.ts` wiring that could never fire.
③ **Plan step 4 would have *created* dead code** — deleting the enum rows
orphans 7 `Resources.*` classes, their `ResourceJuice.ts` cases, SVGs and
`Graphics.ts` entries, and `tsc` says nothing.
④ **The explicit-value decision had an unstated sub-decision** — preserve
today's ordinals vs. renumber compactly. The plan's prose implied renumbering.

**PO rulings (2026-07-24, 4 choice prompts):** ① **new authored art** — not
`DebugCircle`, not a borrowed live sprite: a dedicated **red `?` on a purple
disc** so missing art reads as missing art; ② fold `Yielded` in — **yes**;
③ **preserve today's ordinals, leave gaps** (survivors' wire values unchanged);
④ delete the orphaned classes + art — **yes**.

**Schema (`api/schema/server.fbs`):** removed `table Placeable` (incl.
`item:ubyte`) + its `AnyEntity` member (last position ⇒ `Character`/`Mob`/
`Resource` keep 1/2/3); removed the 9 dead `EntityType` members and
`StatusEffect.Yielded/Freezing/Starving`; **pinned explicit values at today's
positions** on both enums — gaps `EntityType` 1, 3, 6-8, 12-14, 16 and
`StatusEffect` 1-3, with a header comment stating the permanent contract (add at
the next free value, never reuse a gap). Added `EntityType.NpcPlaceholder = 74`.

**New placeholder art:** `assets/resources/npcPlaceholder.svg` (512×512, matching
the NPC sprite convention) + an `NpcPlaceholder` Resource class + a
`GraphicsConfig.npcs.placeholder` entry; `npc.PlaceholderSprite` repointed to it.

**Backend:** `npc.go` repoint + comment; `StatusEffectYielded` const dropped.
The generator's own `cleanOutputFolders()` removed the orphan
`AuraApi/Placeable.go`; `make.sh`'s `rm -rf ./js` removed `placeable.ts`.

**Frontend:** 9 rows out of the exhaustive `gameObjectClasses` Record + 1 in;
the 7 orphaned `Resources.*` classes (`MarioTree`, `Bronze`, `Iron`, `Titanium`,
`TitaniumShard`, `BerryBush`, `Flower`) + their cfg consts and preloads; the
`ResourceJuice.ts` cases; **11 SVGs + the now-unplayable `bush-hit` mp3**; the
unreachable `forYielded` VFX; the `berryBush` render layer in `Game.ts` (its
only two users were BerryBush + Flower); 4 imports the deletions stranded.

**One deviation (in-scope, verification-surfaced — the Chunk 2 ② pattern):**
`internal-tools/art-references/` **deleted**. `artwork.html` was an unbundled
dev art-reference page whose entire subject was `flower.svg` — every `<img>`
pointed at the sprite this chunk removed; nothing links to it, webpack never
touched it, and its sibling `transfer.svg` already had zero readers.

**Verified:** `go build`/`go vet`/`go test -timeout 120s ./...` all green;
`tsc --noEmit` clean; `make -C backend build` + webpack prod build green; boot
**embedded** *and* **`-content ../api`** identical with **0 errors / 0 panics** —
**83 skills/14 factions/50 mobs/10 recipes/5 prop defs/777 props/471 spawns/5
campfires/14 npcs** (unchanged from the Chunk 1/2 baseline, the decisive check
since §27.2.1's loader hard-fails on a still-referenced removed EntityType);
join smoke both muxes — character spawns, world renders (campfire safe-zone,
houses, trees, 2 NPCs, aura ring, full HUD, `Websocket PLAYING`), **zero
console/page errors**. **PO-verified in-game 2026-07-24** ("tested and works").

**⚠ Watch — one unexplained observation, tracked as backlog §29.** The *first*
cold develop-mux load threw `Cannot read properties of null (reading 'split')`
×3 and rendered a **black world** with a healthy HUD/websocket. It did **not**
reproduce in 5 subsequent cold runs, and the failing run showed client frame
times up to **40 000 ms** (rAF starvation on the cold 2.8 MiB bundle). Not
attributed to the prune: a wrong wire enum value is deterministic per entity
stream and would break *every* join, not 1 in 6. `logCallers` (the only `.split`
on a nullable `Error().stack`) has **zero callers**. Reproduce against a **dev**
build for an unminified stack — see §29.

**Also spun off:** backlog **§30** — 4 pre-existing Berryhunter render/asset
vestiges surfaced by this audit and deliberately *not* folded in (`Resource.
capacity`/`stock` hardcoded to 1/1 + their client rescale path; the dead
`item: undefined` snapshot field; **all seven `layers.placeables.*` containers
are permanently empty**; `mineral-hit-sharp` + 2 orphan minimap icons).

**§28 is complete** — all 3 chunks landed 2026-07-24.
