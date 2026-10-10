# Plan: roof props, drawn over players, revealed when you stand under them

**Status:** C1 BUILT 2026-10-10 on main. PO in-game look owed (§5).

**Origin.** PO, 2026-10-10: *"I want props that are above player layer, like
roofs that can disappear once the place is below them."*

## 1. What this is

A prop type can be a **roof**. Its placements draw over the characters like
every other `buildings` prop. While the LOCAL player stands under a roof, that
roof eases to its reveal opacity, along with every roof piece touching it.

Most of this already existed:

- Draw order: `props.standing` draws over `characters` (`Game.ts`), and roofs
  go in `buildings` (`archive/plan-prop-draw-order.md` §1).
- Walking under a prop: `"blocksMovement": false` already turns off its
  collision (`bridge.json`).

The new parts are the type key and the client-side reveal.

## 2. Rulings (PO 2026-10-10)

- **D1. The mechanism ships alone.** No new art or content. Existing houses
  stay solid sprites.
- **D2. Reveal opacity is set per type and defaults to 0** (fully hidden):
  `"roof": {"revealAlpha": 0.25}`. `"roof": {}` is valid.
- **D3. Touching pieces reveal together, transitively,** so an L-shaped
  building opens whole. The client derives which pieces touch, so there is
  nothing to author.

## 3. Design

- **Type-level key, not per placement.** The client identifies a generated prop
  only by its streamed `entityType`. A per-placement key would need a wire
  field or a fifth prop layer.
- **Server (`world/props.go`, `world/zone.go`).** The server parses the key so
  that bad content fails at boot. It never reads `revealAlpha`. Boot refuses:
  - a `revealAlpha` outside [0, 1];
  - a roof type without `blocksMovement: false`;
  - two types of one `entityType` that disagree on `roof` (`PropPlaceholder`
    is exempt, because its name rides the wire);
  - a roof placement that overrides `blocksMovement` to true;
  - a roof placement in `underfoot`.
- **Client.**
  - `game-objects/logic/RoofReveal.ts` holds the pure geometry: `contains` in
    the roof's own turned frame, `touching` by world AABBs with
    `TOUCH_EPSILON_PX` 6 (0.05 u), `roofsToReveal` as a flood fill, and the
    linear `stepAlpha` with `FADE_MS` 200. It also holds the live set and a
    `PrerenderEvent` update.
  - `Props.ts` `Resource.makeRoof()` registers a roof from the subclass
    constructor body. `show()` and `hide()` keep the set current.
  - The footprint is the drawn one (`propFootprint`).
- **Visual and local only.** Other players still see the roof closed. When the
  local player is dead or not in the world, every roof is opaque.

**Schema impact:** DB NONE · wire NONE · conf NONE · content: one optional
prop-definition key.

## 4. Known looks (not blockers)

- Name plates and chat bubbles draw above the props layer, so a player inside a
  roofed building shows a name plate through the roof to people outside.
- The world map bakes roofs as ordinary props, so they never fade there.
- The Tiled save does not check roof placements. The server boot does.
- A rotated piece reaches a little further than it draws, because touching uses
  bounding boxes.

## 5. C1 ledger

- **Built 2026-10-10:**
  - Backend: `world/props.go` and `zone.go`, tested in `props_roof_test.go`.
  - Frontend: `RoofReveal.ts`, tested in `RoofReveal.test.ts`. Also
    `Props.ts` and `Game.ts`.
  - Docs: manual §1b, `manual-tiled-editor.md` §Props, the `add-content` skill.
- **Verified 2026-10-10:** `go test ./pkg/aura/world/` green bar the known
  `TestPropContent_C1bMigrationPreservesLookAndCollision`; vitest 66/66 files;
  typecheck clean. In-game, headless, a throwaway check (not committed) on the
  DEBUG zones with a temporary `TestRoof` placeholder: two touching pieces and
  one apart, 8/8: under A, A and B read alpha 0 and C 1; under C, only C hides;
  outside, all three read 1; no page errors.
- **Owed:**
  - The PO's look, with the first real roof content.
  - The numbers `FADE_MS`, `TOUCH_EPSILON_PX` and each type's `revealAlpha`
    are [PLACEHOLDER].
