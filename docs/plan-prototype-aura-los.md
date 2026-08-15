# Plan: Line-of-sight prototype (`prototype/aura-los`)

**Status: designed 2026-08-15, nothing built.**
**Branch: `prototype/aura-los`, deliberately-not-merged posture** (same as §57
`prototype/attack-lines`): the branch exists to answer a question, not to ship.

## 1. What question this answers

Line-of-sight for auras was **CUT 2026-07-10** (gdd §142/§163, roadmap item 6;
the `blocksAura` flag was deleted 2026-07-11). This prototype does **not**
reverse that ruling. It exists so the PO can *feel* what the cut gave up:
auras that do not pass through props, with matching visuals, played in the
real world zone. The deliverable is a verdict on gameplay feel, recorded here,
after which the branch is parked or deleted.

Performance is explicitly **not** a goal. Quick and illustrative beats clean.

## 2. Scope (PO answers, 2026-08-15)

- **Blockers:** every movement-blocking prop (the ones on the static collision
  layers). No authoring, no new flag. Walkable props (campfires) never block.
- **Symmetric, all effects:** mob auras and player auras alike; damage, dot,
  heal, hot, shield, slow, light - everything that flows through the aura
  target funnel respects line of sight.
- **Visuals:** dim shadow overlay - dark translucent wedges behind occluding
  props inside a rendered aura ring. Not a true ring cutout.
- **Test ground:** the existing world as-is, judged by the PO in-game.

## 3. Why this is cheap (survey findings, verified at HEAD 2026-08-15)

- Every aura effect picks targets through one funnel:
  `effectCollisions` → `selectTargets` (`sys/skills.go` / `sys/targeting.go`).
  One set-narrowing call placed after `effectCollisions` covers damage, dot,
  heal, hot, and buff auras at once. The instant cooldown paths
  (`s.space.QueryCircle` in `fireCooldown`, `skills.go:1245` area) are the
  only other entry and sit in the same system.
- `SkillSystem` already holds `s.space` (used for instant bursts), so no new
  plumbing is needed.
- `phy` already has the geometry: `Circle.ImpaleQuery(Segment)` and
  `Box.ImpaleQuery(Segment)` return parametric t in [0,1] on hit, -1 on miss,
  0 when the segment origin is inside the shape. "Occluder beyond the target"
  and "occluder behind the caster" already read as no-hit.
- `Space.AppendCircleStatics` returns the static colliders (blocking props,
  border wall) intersecting a probe circle, layer-masked.
- Blocking props author `LayerPlayerStaticCollision | LayerMobStaticCollision
  | LayerViewportCollision`; walkable props only `LayerViewportCollision`
  (`model/prop/prop.go:56`). So a probe masked with
  `LayerPlayerStaticCollision` finds exactly the blockers and never a campfire.
- Client side, `EntityManager` constructs every game object with its wire
  position and radius, so prop occluders are already known to the renderer.
- `api/zones/world.json`: **777 of 777** prop placements are
  `blocksMovement: true`. The client shortcut "every prop entity occludes"
  is exactly correct in the test zone. (Legacy proving-grounds has 54
  walkable placements that would shadow visually but not mechanically -
  accepted, it is not the test ground.)

## 4. Decisions

- **D1 - Binary center-to-center ray.** Blocked means the segment from caster
  position to target position impales a blocking static. A large mob half
  behind a rock is fully blocked or fully hit by where its center is. No
  partial visibility, no edge sampling. Accepted prototype coarseness.
- **D2 - The predicate lives in `phy`.** `Segment`'s fields are unexported,
  so the ray test cannot be assembled from outside the package. New method:
  `Space.LineBlockedByStatics(from, to Vec2f, mask int) bool` in a new
  `phy/los.go`. Implementation: bounding circle of the segment →
  `AppendCircleStatics` → `ImpaleQuery` per candidate. Allocations are fine.
- **D3 - Occluder exclusion rule.** An occluder is skipped when (a) it is an
  inverse shape (the world border - a segment between two in-world points
  must never read as blocked by the wall), or (b) its `StabQuery` contains
  `from` or `to` (a caster or target standing overlapped into a prop is not
  sealed off by it; also the self-shape guard if a caster ever owns a static).
- **D4 - Filter before the target cap.** The line-of-sight narrowing runs on
  the collision set *before* `selectTargets`, so a blocked candidate never
  consumes a `maxTargets` slot and shadows a visible one. Concretely: one
  helper applied to the output of `effectCollisions` in `applyAuraEffect`,
  and to the query results in the instant cooldown paths. `notePresence`
  (combat-presence probe) stays unfiltered - presence is not an effect.
- **D5 - Dot/hot persistence unchanged.** A burn or heal-over-time applied
  while visible keeps ticking after the target ducks behind cover, exactly
  like leaving range today. Line of sight gates *application*, not running
  buffs.
- **D6 - Client mirrors, no wire change.** The shadow overlay recomputes
  client-side from prop game objects (wire position + radius). Rect-bodied
  props (house, gate-wall) are Boxes on the server but only a radius on the
  wire, so their shadow is cast from the bounding circle - visual-only
  divergence, accepted. Small server/client disagreement at shadow edges is
  accepted; the server is authoritative.
- **D7 - Overlay is a separate per-frame layer.** `AuraRings.redraw()` caches
  on radius+mask and must not be touched - shadows drawn there would freeze.
  New sibling overlay (working name `AuraShadows`): a `Graphics` per rendered
  ring, cleared and redrawn each snapshot. For each prop whose distance to
  the ring center is under ring radius + prop radius: compute the shadow
  wedge (tangent lines from ring center past the prop circle, region behind
  the prop clipped to the ring), fill dark translucent. Alpha ~0.35
  [PLACEHOLDER], every constant [PLACEHOLDER].
- **D8 - Shadows on all rendered rings**, not just the local player: the PO
  chose symmetric gameplay, so seeing where a mob's aura cannot reach *is*
  the feature. Known risk: visual noise with several rings on screen. The
  fallback, if unreadable, is local-player-ring-only; that is a follow-up
  tweak on the branch, not a redesign.
- **D9 - No toggle.** Comparing with/without is a branch switch plus rebuild.
  If the PO wants live A/B, a boot flag can be added later on the branch.
- **D10 - Mobs reposition to regain sight (cheap, added 2026-08-15).**
  `shouldApproach` (`model/mob/mob.go:1127`) is the single stop predicate for
  a chasing mob; it gains one condition: target in range but
  `LineBlockedByStatics` blocked → keep approaching (`m.space` is already on
  the mob; nil-space test constructions keep the old behavior). Everything
  downstream is existing machinery: tangent-detour steering slides the mob
  around the prop, and a genuinely trapped mob falls into the shipped chase
  stuck-watchdog camp (`stuck.go`, PO-approved 2026-07-20: glare, keep aggro,
  retry) - the worst case degrades into approved behavior, not a new state.
- **D11 - Mobs hold cooldowns without sight.** ✅ Turned out to need ZERO
  code: the mob cooldown path already consumes the cooldown only when
  `fireCooldown` reports a real hit ("keeps it ready until a target wanders
  into range", sys/skills.go), and with the LoS filter a blocked burst
  reports no hit. The intended behavior falls out of the existing gate.
- **D12 - Stop/go flicker is a watch item, not pre-built.** At the tangent
  edge a strafing target can re-block sight the tick after the mob stops.
  The steering side-latch and the watchdog were built against exactly this
  oscillation family, so judge in-game first; the prepared fallback is a
  small hysteresis (stop only after the line has been clear for ~N
  consecutive ticks [PLACEHOLDER]), added on the branch only if it is
  visibly twitchy.

## 5. Residual feel artifacts to read correctly

With D10/D11 the mob is no longer dumb behind cover, but two shipped
behaviors will show up more often and should be read as themselves:

- A mob trapped by concave geometry CAMPS (stuck-watchdog, §4 D10) - it
  glares from behind the wall instead of pathing around the world. That is
  the 2026-07-20 PO ruling working as designed, not an LoS bug.
- Kiting around a single rock becomes a cat-and-mouse orbit (you circle, the
  mob circles after). That is emergent and plausibly the fun part - but it
  is new, so give it its own verdict in §10.

## 6. Build steps (one execution session)

1. **`phy` predicate, red-first.** `Space.LineBlockedByStatics` +
   `phy/los_test.go` pinning: occluder between → blocked · occluder beyond
   the target → clear · occluder behind the caster → clear · occluder
   containing an endpoint → clear · border wall never blocks an in-world
   segment · Box occluder blocks too.
2. **`sys` wiring, red-first.** Narrowing helper + the two insertion points
   (D4). Behavior test in `sys`: caster and target in aura range with a
   blocking prop static between them → zero damage over N ticks; same setup
   without the prop (or target stepped aside) → damage lands. Mirror once for
   the heal aura to prove effect-agnosticism.
3. **Mob AI, red-first.** D10 in `shouldApproach` + D11 at the cooldown reach
   check. Behavior test in `model/mob` (direct construction with a real
   space, like the steering tests): target inside aura radius with a blocking
   static between → mob keeps moving; line clear → mob stops at the usual
   stop distance; nil space → old behavior untouched.
4. **Frontend overlay.** Prop-occluder registry (prop-type game objects) +
   `AuraShadows` per-frame wedge layer (D7, D8). No unit tests - visual,
   judged in-game (prototype carve-out per CLAUDE.md TDD section).
5. **Verify + PO session**, checklist below; verdict recorded in this doc.

## 7. Schema impact

**NONE.** No wire change, no DB change, no content change, no new authoring.

## 8. Test posture and expected fallout

- TDD applies to steps 1 and 2 (pure logic, vitest-free, plain `go test`).
- simharness guardrail asserts: if any sim scene places a blocking prop
  between combatants, TTK/TTD shift **on this branch is expected** - record
  it here, do not chase it. Check `cmd/simharness` scene setup once before
  reading any shift as a regression.
- The known-inconclusive list in CLAUDE.md applies unchanged; measure before
  diagnosing any flake as branch fallout.

## 9. Verify tail

`go build ./...` · `go test -count=1 ./...` (at minimum `phy`, `sys`,
`model/mob`) ·
`npm run typecheck` · `npm test` · `make -C backend build` before booting
(stale-binary gotcha) · boot 0 WARN / 0 ERROR · PO checklist.

## 10. PO in-game checklist (world zone)

1. Stand behind a tree from a mob whose damage aura you are inside: resource
   stops draining; the wedge on the mob's ring visibly covers you.
2. Your damage aura against a mob behind a rock: no ticks, no hit VFX while
   it is in your ring's shadow.
3. Step out of cover: ticks resume on the next aura tick, both directions.
4. Heal blocked: campfire (or ally heal aura) with a prop between - no heal.
5. Dot persistence: ignite a mob, let it break line of sight - the burn
   keeps ticking (D5).
6. Rect props: house / gate-wall block correctly in gameplay; shadow shape is
   the circle approximation (D6) - note whether the mismatch bothers.
7. Readability: wedges track movement smoothly; verdict on all-rings shadows
   (D8) vs too noisy.
8. Mob repositioning (D10): break sight behind a tree - the mob slides
   around it to regain sight instead of idling; a mob against concave
   geometry camps and glares (existing watchdog, §5), no jitter dance.
9. Cooldown discipline (D11): a mob does not visibly burn a cooldown while
   you are shadowed.
10. Flicker check (D12): strafe back and forth at a rock's tangent edge -
    does the mob stop/go twitch? If yes, note it; the hysteresis fallback
    goes in only on this evidence.
11. **The actual question:** after 15+ minutes of normal play - does
    positioning around props feel like added depth or added friction? Where
    does it shine, where does it annoy? Separate verdict on the rock orbit
    (§5): fun cat-and-mouse or annoying? (Keep §5 in mind for mob behavior.)

## 11. Ledger

**Built 2026-08-15 on `prototype/aura-los`, all steps, red-first throughout.**

- Step 1 ✅ `phy/los.go`: `Space.LineBlockedByStatics` (segment bounding-circle
  probe → `ImpaleQuery` per circle, slab test per SolidAABB, inverse shapes
  and endpoint-containing occluders skipped). 11 pins in `phy/los_test.go`,
  red-first proven on a stub (the two must-block cases red, controls green).
- Step 2 ✅ `sys/los.go` + `skills.go`: `losFilter` at the top of
  `applyAuraEffect` (covers every aura effect in one place), `losVisible` in
  `queryInstantTargets` and the four remaining instant delivery sites
  (threat, calm, stun, charm). The corpse finder stays unfiltered (an
  interaction, not an effect); `notePresence` stays unfiltered (D4). 4 pins
  in `sys/skills_los_test.go` incl. the heal-blocked effect-agnosticism pin;
  red-first: exactly the three block assertions red, both controls green.
- Step 3 ✅ D10 in `shouldApproach` (`model/mob/mob.go`); occluder definition
  unified as `model.LoSOccluderMask` (both static-collision bits; the
  steering test harness plants MobStatic-only blockers, real props author
  both). 3 pins in `model/mob/los_test.go`. ⚑ Red-first surfaced a wrong
  assumption: at bare construction `m.aura.Radius` is body-sized (0.3), not
  the skill radius; the sensor is only re-sized per tick by the running
  SkillSystem, so the test geometry uses reach 0.55. D11: no code (see §4).
- Step 4 ✅ `AuraShadows.ts` (world-space wedge layer: umbra polygon per
  ring×occluder, D3 edge rules mirrored) + `AuraRingStack.activeRadiusPx` +
  `auraShadowRadius` getters on Character/Mob + `GameObject.wireRadius`
  (captured in EntityManager; `size` is visually padded on Resources, the
  overlay needs the unpadded wire radius) + collection/redraw in `Game.loop`.
  Layer sits above entities, below darkness.

**Schema NONE** (as planned: no wire, DB, or content change).

Verified so far: `go build ./...` · full `go test -count=1 ./...` green
(zero failures, **no simharness guardrail fallout**, §8's worry did not
materialize) · `npm run typecheck` · `npm test` 328/328 · `npm run build` ·
boot 0 WARN / 0 ERROR, counts exact (68 mobs / 95 skills / 5 props) ·
**headless smoke green first run** (throwaway `los-smoke.mjs`): join, aura
on, warp beside the tree at (-64.8, 25.2) → shadow layer draws (74×163 px
bounds inside the 120 px ring), warp to open ground → layer clears, **0
console errors**. ⚑ Two smoke observations: the own player rides
`snapshot.player`, never `snapshot.entities`, so no double-drawn own ring;
and under a tree's oversized crown sprite the wedge is subtle (canopy art
covers the ring), so §10 leg 7's readability verdict is best formed at rocks
and walls. PO checklist (§10): **pending**, fills the verdict below.
