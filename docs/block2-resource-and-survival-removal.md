# Block 2 — Resource Unification & Survival-System Removal

Execution plan and running status for **v1-roadmap items 1 + 2** (single unified
resource; removal of the Berryhunter survival systems, crafting, and items).
Graduated to its own doc per the roadmap convention once the work started
(2026-07-04).

Parent scope: `v1-roadmap.md` §1 (The Resource) and §2 (Survival-system removal).

## Locked decisions

- **Full teardown** of the item/inventory/crafting system (not a reduction).
- **Wire fields renamed properly** (no overloaded-name hack left behind).
- **Campfires kept as inert stubs** — heater/temperature deleted, but the
  `campfire`/`big-campfire` placeable entity + rendering survive as a
  server-spawnable stub for the future v1 campfire system (recipes stripped).
- **Resources kept as decorative obstacles** — harvesting removed, but resource
  entities keep rendering + collision. World stays populated.
- Costs stay effect parameters (`selfDamageFraction`), no separate cost system
  (already true for HealAura). Day/night stays a frontend visual.

## Wire-coupling principle

Anything that changes the FlatBuffers schema is deferred to the **final wire
pass (Stage 3d)** and done in one regen, rather than sprinkled across stages.
Intermediate stages leave wire fields *dormant* (server stops populating,
client stops consuming) but present, so each stage compiles and runs.

## Stages

### Stage 1 — Single resource + stop ticking survival ✓ Done
- `updateVitalSigns` regenerates only `Health` (the single resource); dropped
  the satiety/temperature force-max hack.
- Removed `DayCycleSystem` (temperature cooling) and the `heater` system + all
  wiring/`case` blocks. Day/night remains a frontend visual (Welcome still
  sends `TotalDayCycleTicks`/`DayTimeTicks`).
- Guard test `TestUpdateVitalSigns_RegeneratesHealthOnly`.
- *Left behind (cleanup pass):* now-unused config `ColdFraction*`,
  `Freezing*DamageTickFraction`, `Satiety*` in `conf.json`/`gamecfg.go`.

### Stage 2 — Wire/naming honesty ✓ Done
- Renamed `Character.satiety` → `level_progress`, `Character.body_temperature`
  → `level` (positional field IDs → codegen-only, wire-compatible rename).
- Regenerated both bindings; updated `codec/gamestate.go` (4 call sites) and the
  frontend `GameStateMessage.ts` wire read.

### Stage 3a — Remove item player-actions + harvest input ✓ Done
- Deleted the `model/actions/` package (primary/craft/consume/drop/place/
  equip/unequip + base/minions) — the legacy weapon-hit + harvest actions.
- Gutted `core/input.go` (`applyAction` dispatch, `resolveHandCollisions`
  harvest path).
- *Deferred to 3d:* `PlayerAction`/`ongoingAction`/`CurrentAction` scaffolding
  and its wire `OngoingAction`/`current_action`; `Input.action` + `Action`
  table + `ActionType` enum. All now have zero producers.

### Stage 3b — Remove inventory harvest/loot/crafting + item defs ✓ Done
- Dropped `PlayerHitsWith` from the `Interacter` interface + all 5 impls (fully
  superseded by the aura `PlayerTouches`/`MobTouches` path).
- `resource.go`: removed the harvest `yield()` mechanic (resources decorative).
- `mob.go`: removed the `Drops`→inventory loot loop (XP rewards untouched).
- `cmd.go`: removed `GIVE`/`STARVE`/`FREEZE` cheats.
- `generator.go`: removed `Flower`/`Berry` world-spawn entries.
- Deleted `items/craft.go`; removed food/tool/weapon/wall/door item JSON +
  non-campfire placeables; stripped mob `drops` and campfire `recipe` blocks.
- **Frontend compile fix (regression):** trimmed `client-data/Items.ts` to the
  surviving items (None, campfires, resources) and neutralized the one direct
  `Items.MysticWand` access in the defunct `_GroundTexturesPanel` dev tool.
  This exposed that the frontend still carries a whole item system → Stage 3c.
- *Deferred to 3d:* dormant `Inventory`/`Equipment` Go types + their wire
  fields; orphan `EntityTypeFlower`/`EntityTypeBerryBush` enum entries.

### Stage 3c — Frontend item-system teardown ⏳ Next (frontend only)

The backend teardown surfaced a substantial, cross-cutting frontend item
system. Remove it; keep the wire dormant until 3d.

**Remove (item logic):** `features/items/logic/` — `Inventory`, `Crafting`,
`Recipes`, `AutoFeed`, `InventoryShortcuts`, `InventorySlot` (and `Item`/
`ItemType`/`Equipment`/`Items` once their last consumer is gone).

**Remove (item UI):** HUD `#crafting` + `#inventory` blocks (`HUD.html`) and
their logic (`setupCrafting`/`setupInventory`, craftable-item + inventory-slot
rendering).

**Remove (integrations):**
- `Character.ts` — equipment-slot / held-item / equip-animation rendering (the
  avatar stays; the "item in hand" rendering goes). **Riskiest edit — own
  sub-commit + visual check in the running game.**
- `Controls.ts` (equip/hotbar input), `Game.ts` (Recipes/crafting-range cache),
  `EntityManager.ts` (Equipment), `Player.ts` (Inventory).
- `Events.ts` — `CharacterEquippedItemEvent` + inventory-slot events, and their
  subscribers (`PlayerJuice`, `tutorial`, `_GroundTexturesPanel`, `_Develop`).
- `client-data/Items.ts` (registry) + the item icon SVG assets.
- `BackendConstants.ts` + `GameStateMessage.ts` — stop decoding the item wire
  fields (`equipment`, `inventory`, `currentAction`); leave them present-but-
  ignored until 3d.

**Keep untouched:** resource/campfire world rendering (already item-system-free),
the entire skill/spellbook/action-bar UI (Phase 8), vitals/level HUD.

**Resolve during execution (flagged):**
1. `ClickableIcon`/`ClickableCountableIcon` may be shared by the Phase-8 skill
   icons — keep the component, remove only item usage, if so.
2. `ItemType`/`Item` are likely fully removable (kept rendering is
   `EntityType`-based, not `ItemType`) — confirm before deleting.
3. Character equipment rendering touches the live avatar — isolate + verify.

### Stage 3d — Wire cleanup ⏳ (final: backend schema + both regen)

Nothing produces or consumes them by now. In one pass remove:
`GameState.inventory`, `Character.equipment`, `Input.action` + `Action` table +
`ActionType` enum, `OngoingAction`/`current_action`. Regen both bindings; delete
backend dormant Go types (`Inventory`, `Equipment`, `PlayerAction`/
`ongoingAction`/`CurrentAction`) + codec marshalers; delete dead frontend
wire-read stubs. Optionally drop orphan `EntityTypeFlower`/`EntityTypeBerryBush`.

### Docs — final
Update `CLAUDE.md` (status + tech-debt), mark roadmap §1 + §2 ✓ Done, and strip
the leftover dead `conf.json` survival config.

## Verification standard (tightened after the 3b miss)

Every stage boundary runs **both**:
- `make -C backend build` **and** a server boot check (load counts, zero panics).
- A frontend `webpack --config webpack.dev.js` single build (0 errors).

The 3b regression happened because only the backend boot was checked; the
frontend has build-time `require()` dependencies on item JSON.

## Known bug (found during 3b testing) — KILL revive

The `KILL` cheat (and any one-shot zeroing of `Health`) no longer kills; the
player is revived to the smallest value above 0 and keeps regenerating.

**Root cause:** `KILL` sets `Health = 0` in `CommandSystem` (priority −50).
`UpdateSystem` (also −50, registered after Command) runs `updateVitalSigns`,
which regenerates any `Health != Max` back up by `HealthGainTick` — turning the
0 into a tiny positive value **within the same tick**, before the next tick's
`ConnectionStateSystem` (priority 10) death check at `sys/state.go` ever
observes `Health == 0`. Continuous-damage deaths still work because
`SkillSystem` (−65) re-applies damage after regen each tick, pinning `Health` at
0 when the check runs.

Essentially pre-existing (the regen predates Block 2), surfaced now. **Fix
candidate:** don't regenerate a player at `Health == 0` (0 = dead; passive
regen only heals the living) — one-line guard in `updateVitalSigns`. Add a test
that `KILL` → dead. To fix in a dedicated commit, not folded into a stage.
