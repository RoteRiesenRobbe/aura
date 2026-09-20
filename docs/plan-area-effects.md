# Plan: area effects — ground and air that act on what stands in them

**Designed 2026-09-16 (PO session). 3 chunks — ⭐ E1 + E2 SHIPPED 2026-09-16
(ledgers §9). E3 (content + the in-game pass) is what is left.**

⭐ **The whole feature is one optional key on a shape.** A polygon, path or
atmosphere that already exists for its LOOK gains `effect`, naming an authored
effect applied to whatever stands inside it. Lava burns, a bog rots, miasma
poisons — and a healing spring heals — with no damage pipeline, no cadence knob
and no dwell timer, because the buff machinery skills already use has all three.

---

## 1. What this is

The atmosphere primitive (`plan-region-atmosphere.md`) and the zone-polygon
primitive (`plan-zone-polygons.md`) both ship areas that are **purely
presentation** — the server validates their geometry at boot and then ignores
them (`world/zone.go:533`: *"Atmosphere is client-visual only and the server
never reads it past"*). `Miasma` is named for poison gas and is exactly as safe
to stand in as `Fog`.

This closes that gap for both families at once.

⭐ **The PO's framing is what makes it one feature instead of two** (2026-09-16):
*"What if we make hazard one concept that both terrain and atmosphere can
optionally define?"* — offered against a proposal for a separate `zone.hazards`
class, and it beats that proposal on the point that matters. A separate class
means **two shapes per place**, art here and damage there, which can drift apart
silently; one key on the shape you already drew cannot.

⛔ **The separate class was proposed for a real reason and the reason survives:
an area effect is not always air.** Lava and bog water are GROUND — polygons and
paths wearing a terrain profile. Any design that hangs the effect off
`atmospheres` alone forces a second mechanism for ground.

---

## 2. Decision ledger

| # | Ruling | Why |
|---|---|---|
| **D1** | **ONE concept, available on every closed shape** — `polygons`, `paths`, `atmospheres` | PO 2026-09-16. An area effect is a region of space that acts on what is in it; which visual layer it rides is irrelevant. Lava is ground, miasma is air, one key covers both. |
| **D2** | ⭐ **On the SHAPE, never on the PROFILE** | Three independent reasons — §2.1. |
| **D3** | **`effect` names an AUTHORED EFFECT, never a raw number** | A bare number invents a second damage pipeline with no damage type, no resistances, no immunity rails. Naming an effect reuses all of it and adds no concepts. |
| **D4** | **DWELL, not on-entry: the first interval is skipped** | PO 2026-09-16. ⭐ Already the behaviour — see D5. |
| **D5** | ⭐ **No dwell timer is built, because the buff IS the timer** | `DurationTicks() = TickCount*Interval + 1` puts the first event at `Interval`, not at application. D4 is free. ⚑ An EXPLICIT dwell was offered and DEFERRED with a trigger — §2.4. |
| **D6** | **Re-entry refreshes duration and MUST NOT reset the tick phase** | Otherwise D4 inverts into total immunity — §2.2. ⭐ Already guaranteed: `ApplyDot` *"keeps the acting accumulator running"* on refresh. |
| **D7** | **Cadence is 1–3 s, authored PER EFFECT** (30–90 game ticks) | PO 2026-09-16. `DotParams.Interval` is already in game ticks and already per-effect; nothing new. |
| **D8** | **An area effect needs a synthetic source id** | `ApplyDot` streams are keyed by `(caster, per-event damage)`. An area has no caster — see L2. |
| **D9** | ⭐ **The key is NEUTRAL: `effect`, not `hazard`** | PO 2026-09-16 — §2.3. The mechanism is symmetric, and naming it for harm would bias the build toward harm. |
| **D10** | **Absent = inert, and every shipped zone stays byte-identical** | The bar `blend`, `scroll` and `closed` were all held to: the feature costs exactly zero until authored. |
| **D11** | ⭐ **AREAS APPLY TO MOBS, and a mob's IMMUNITY is its authored resistances** | PO 2026-09-16, answering §6 Q1. Consistency said yes and the worry was authoring risk; resistances already answer it, with no new field and no new concept — §2.5. |
| **D12** | **A DORMANT mob is skipped, and the reason is CONSISTENCY, not cost** | PO 2026-09-16. A dormant mob is out of `phy.Space`, so it is already unhittable by everything else in the game — §2.6. |

### 2.1 Why D2 — on the shape, not the profile

The PO's phrasing ("terrain and atmosphere can optionally define") reads most
naturally as the two profile tables. That is the one variant that does not work:

1. ⛔ **Both profile tables are CLIENT-SIDE** (region-primitive D12,
   `frontend/src/client-data/`). The server validates shapes but never reads the
   tables. A profile key forces the server to load client data, and the look
   tables become gameplay-authoritative — the property A4 fought to keep.
2. ⛔ **A profile is a MATERIAL, not a place.** The table says so: many forests
   share `Forest`, *"which is why a quest-addressable area cannot be a profile
   name"*. Profile-level effects mean a starter swamp and an endgame swamp both
   named `Miasma` must hurt identically — or the look table is FORKED for a
   balance reason, producing two visually identical profiles differing in one
   number.
3. **Strength is balance, and balance is priced per placement.** Already the
   standing content rule for mobs (*"HP/damage re-price every placement"*).

⭐ On the shape all three dissolve: `Lava` the material is authored once, and a
zone-1 pool and a zone-5 pool wear the same profile at different strengths.

⚑ **This is the A4 objection arriving from a new direction.** The PO rejected
`darkness: 0` as a clearing flag because *"a flag on the PROFILE still makes the
look table carry an OPERATION"*. An effect on the profile makes it carry a RULE,
which is worse.

### 2.2 Why D6 is not optional

D4 says the first interval is free. Taken alone that is a **total immunity
exploit**: step out and back in faster than the interval and the timer restarts,
so at a 1–3 s cadence a player hops through lava forever and never burns.

The rule that closes it is that re-entry may refresh the DURATION but never the
tick PHASE. ⭐ **Verified present, not assumed** — `skills/buffs.go:410`:

> *"A refresh (same caster, same strength) resets the remaining duration and
> takes over tags/cadence but **keeps the acting accumulator running**."*

⚑ The companion property is already ruled too (`plan-skill-vocab` §3.7, via
`ApplyHot`'s twin comment): *"a hot_aura re-applying every tick tops the duration
up while in range, and the buff keeps ticking down once the target leaves"*. So
walking out leaves the last application to lapse on its own schedule rather than
being cancelled — which is both the right feel and the second half of the fix.

⛔ **An area effect is therefore an AURA whose range test is a polygon instead of
a circle, and nothing more.** That sentence is the design.

### 2.3 Why D9 — the name is `effect`, not `hazard`

⭐ **PO correction, 2026-09-16**: *"we should give it a more neutral name like
effect, spellEffect etc."* Correct, and not merely cosmetic.

⛔ **The mechanism is SYMMETRIC and `hazard` names half of it.** `ApplyHot` sits
directly beside `ApplyDot` in the same file with the same stream keying and the
same refresh rule, so a **healing spring**, a **blessed grove** or a restorative
shrine works with zero extra machinery. Naming the key for harm would have biased
the implementation toward damage-only — and the moment someone wanted a
beneficial area, they would have built a SECOND mechanism beside it. ⚑ That is
exactly the failure D1 already avoided once by refusing to hang this off
`atmospheres` alone; the neutral name avoids it a second time, one level up.

Why `effect` over the alternatives:

- ⛔ **`spellEffect` is wrong** because nothing casts it. There is no caster at
  all — that is landmine L2, not a naming detail.
- ⛔ **`aura` would be perfect by this design's own logic** ("an aura whose range
  test is a polygon") and must still be rejected: it collides with the player and
  mob aura system, the aura slots, and `AuraType` on the wire. In a project
  called Aura where every Tiled class is `Aura*`-prefixed, it is the one word
  that cannot mean something new.
- ⭐ **`effect` is the existing term of art.** The value literally IS a name from
  the vocabulary Go already calls effects (`effectKeys`, `EffectType*`), so the
  key names what it holds.
- `areaEffect` is unambiguous but redundant — the shape already IS an area, and
  this table's keys are short (`blend`, `scroll`, `sight`, `clears`).

⚑ **No `harmful` flag is needed and none should be added.** Whether an area helps
or harms is derivable from the effect it names (a DoT versus a HoT), so a UI tell
or a future mob-avoidance pass can ask the effect rather than a second authored
field that can contradict it. Same rule as P1's "the SHAPE is the flag".

### 2.4 The explicit dwell — offered, deferred, and the trigger

⭐ **Offered by the PO the same day** (*"you could also make dwell explicit if it
really helps"*). Deferred, but the reasoning is worth keeping.

⛔ **Derived dwell WELDS the grace window to the cadence** — they are the same
number, so an area ticking every second gives exactly one second of grace. Two
useful shapes are therefore unsayable:

- **Fast cadence, long grace** — *"dash through the lava and you are fine; linger
  and it melts you"*. Wants dwell 2 s with a 0.5 s tick. A genuine game-feel
  pattern: a grace window that rewards decisive movement, then punishing damage.
- **No grace, slow cadence** — *"touching it poisons you immediately, but it ticks
  slowly"*. Derived dwell can never be 0.

⚑ **Deferred anyway, on three grounds:**

1. **No authored area needs it yet.** Lava, bog and miasma all read correctly
   with grace ≈ cadence.
2. ⭐ **Adding it later is NON-BREAKING and costs no more than adding it now.**
   It belongs on the SHAPE for D2's third reason, so it is one more optional key
   on arrays already paying the four-writer tax. Absent would mean *"dwell equals
   the interval"* — exactly today's behaviour — so every area authored before it
   existed keeps behaving identically.
3. It is far easier to judge with an area actually on screen, and nothing is.

⭐ **NAMED TRIGGER** (so *"not yet"* cannot quietly become *"never"*): the first
area whose desired grace window differs from its cadence. In practice that is
most likely a **crossable** hazard — the lava river you are meant to run over —
which is also the first one where getting it wrong is felt rather than noticed.

⚑ **Dwell reads differently either side of D9.** On a hazard the skipped first
interval is MERCY; on a boon it is a COST — stand still a moment before the
spring helps you. Both are defensible and the shared default is fine, but it is
worth knowing they are not the same design statement.

⛔ **Do NOT reach for the explicit key to fix an area that merely feels too harsh
or too generous.** That is the cadence, or the effect's per-event magnitude, and
both already exist. Dwell is only the answer when the two need to diverge.

---

### 2.5 Why D11 costs nothing — the immunity rails already exist

⭐ **PO ruling 2026-09-16**, closing §6 Q1: *"it should apply to mobs, but mobs
should be able to be immune to some of the effects."* The second clause is what
makes the first safe, and it needs **no new mechanism** — verified in the code,
not assumed:

- `ResistMultiplier` is called inside `takeDamage` on **both** sides
  (`model/mob/mob.go:1923`, `model/player/player.go:381`), so ANY damage
  entering the ordinary pipeline is resisted — a DoT tick included. ⭐ **That is
  D3's payoff arriving**: naming an authored effect instead of a raw number buys
  the damage type, the resistances and the immunity rails at once. A bare
  magnitude would have needed all three rebuilt.
- Immunity is `factors.resistances` with a `0`, authored per species. Twelve
  mobs already author a resistance map, one of them `{"*": 0}`.
- ⛔ `resist.go` states the rule this leans on: *"immunity must be deliberate
  content, not an emergent stack"* — multiplicative stacking can never reach 0,
  so only an authored `0` grants it. A salamander shrugging off lava is one
  key, and nothing ELSE accidentally becomes immune.
- ⚑ The damage-tag vocabulary is CLOSED (`skills.DamageTypes`, D4), so a
  mistyped tag on an area fails loudly rather than shipping an inert hazard.

⚑ **The rider worth knowing before E3 authors a boss**: a `×0` cannot be
temporarily STRIPPED — multiplicative buffs cannot undo it — and `resist.go`
parks that seam as *"demand-driven, first boss content pulls it"*. A lava-immune
boss that should become vulnerable mid-fight is exactly what would pull it.

### 2.6 Why D12 is a consistency rule that happens to be free

⭐ **A dormant mob is ALREADY unhittable by everything.** `sys/mob.go:89`: *"A
dormant mob is out of the space and therefore in no viewport"* — no aura, no
projectile, nothing reaches it. An area effect that damaged sleeping mobs would
be the single thing in the game that did, which is why this is a rule about
consistency rather than a perf concession.

⚑ **The gate is free to implement**: `MobSystem.Update` already `continue`s on
`dormantThisTick(mob)`, so E2 rides the existing skip rather than adding a test.

⚑ **It also collapses the only real cost.** The geometry was never the concern —
point-in-polygon over a handful of authored shapes is noise. The concern was
handing `StatusEffectsSystem` (already recorded at **11.7×** walking dormant
mobs, M1-F2) a refreshing buff stream for each of **514 authored spawns**. With
D12 the term is "mobs near a player", not "mobs authored".

## 3. Design

### 3.1 E1 — the key, inert ✅ SHIPPED (ledger §9)

`effect` joins the three closed-shape arrays as an optional string naming an
authored effect. Absent means inert (D10).

⚑ **The four-writer whitelist tax applies** ([[project-zone-format-whitelists]],
region-primitive L1): a new zone-file field means editing `world/zone.go`,
`tools/tiled/extensions/aura-zone/aura-convert.js`, `ZoneModel.ts` **and**
`aura-world-format.js`. ⛔ The fourth is the one that was missed before and cost
a session (zone-polygons D5) — confirm it, never assume it.

Plus the Tiled palette: `effect` becomes a member on `AuraPolygon`, `AuraPath`
and `AuraAtmosphere`. ⛔ **It must be a STRING member typed to an effect enum,
and `verify.sh` cannot see which enum a class member declares** — measured, not
assumed (`plan-region-atmosphere.md`, the A2 rider). Headless `--export-map`
loads no project, so the round-trip proves NAMES survive and never that the GUI
wiring is right. The guard is a static pin over the generated palette, and the
dropdown is a human check.

Boot-time validation refuses an unknown effect name, the way a crossed profile
name already does — and with the same posture: the message must name what is
wrong, not merely say "unknown".

### 3.2 E2 — the consumer ✅ SHIPPED (ledger §9)

One system pass per tick: for each affected entity, for each shape carrying an
`effect` in the current zone, point-in-polygon; inside → apply that effect's
buff.

⚑ **"Affected entity" is players AND non-dormant mobs** (D11/D12). Mobs need no
avoidance logic and no opt-out list: a mob that should not care authors a `0` in
`factors.resistances` for that damage tag, which is the same key a fire-resistant
wolf already uses (§2.5). A dormant one is skipped because it is already out of
`phy.Space` and unhittable by everything else (§2.6).

⚑ **Decorative shapes never pay.** Gate on `effect == ""` before any geometry
test, so a zone with 35 fog banks and 2 lava pools does 2 polygon tests per
entity per tick, not 37. ⛔ That gate is load-bearing rather than tidy: without
it the cost tracks DECORATION, which grows without limit and for no reason.

⚑ **E2 would be the FIRST per-tick consumer of zone geometry on the server** —
confirmed, not assumed: nothing in `sys/` or `core/` reads `.Polygons`,
`.Atmospheres` or `.Paths` today, and `paths_collision.go` /
`polygons_collision.go` both build their bodies at BOOT. So there is no existing
cost to hide inside, and this is the first line item to look at if a tick number
moves. ⚑ The scan is a linear walk with no spatial index, which is right while
the count is single digits; a per-shape bounding-box prefilter is ~3 lines and is
the escape hatch when a zone passes ~20 hazards.

⚑ **Point-in-polygon already exists client-side** (`Regions.pointInPolygon`) and
the zone arrays are already parsed server-side. The Go side needs its own copy of
the predicate; it is ~15 lines and should be tested against the same fixtures.
⛔ **Use an AWKWARD fixture** — zone-polygons P3's durable lesson: a square, an
L, or even a 45° diamond on whole units all pass for the wrong reason. No edge
axis-aligned, at 45°, or on a grid line.

### 3.3 E3 — content

`Lava`, `Bog` and `Miasma` authored with real effects, plus the in-game pass.
⚑ The two terrain profiles and their tiles **shipped 2026-09-16** and are inert
until a zone draws one.

---

## 4. Schema impact

| Layer | Impact |
|---|---|
| **DB** | **NONE** |
| **WIRE** | **NONE** — damage and healing flow through health, already on the wire |
| **CONF** | **NONE** |
| **CONTENT** | **NONE** — areas name effects that already exist |
| **ZONE FORMAT** | **One optional key on three shape arrays**, absent-safe |

⭐ **Inert at HEAD**: no shipped zone authors one, so every zone file stays
byte-identical and the feature does nothing until someone draws one.

---

## 5. Test strategy

- Go: point-in-polygon against an awkward fixture (§3.2).
- Go: absent `effect` applies nothing and costs no geometry test.
- Go: unknown effect name refuses the boot, with a message naming the effect.
- Go: ⭐ **the dwell leg** — a player inside for `Interval - 1` ticks takes zero
  damage; at `Interval`, exactly one event.
- Go: ⭐ **the hop leg, which is the one that matters** — a player leaving and
  re-entering every `Interval - 1` ticks still takes damage on schedule. This is
  D6, and it is the leg that would catch a future refactor reopening the exploit.
- Go: ⚑ **a BENEFICIAL area**, not only a harmful one — D9's whole point is that
  the mechanism is symmetric, and a suite that only ever tests damage will not
  notice the day it stops being.
- Go: ⭐ **a MOB inside takes damage** (D11) — the half the strategy assumed away
  while Q1 was open.
- Go: ⭐ **a RESISTANT mob takes less and an IMMUNE one takes nothing**, through
  `factors.resistances` alone and with no area-effect-specific code in the path.
  ⚑ Both, not just immunity: a suite that only pins `0` would not notice the day
  the resist multiplier stopped being applied to the tick at all, since `0` and
  "never damaged" look identical.
- Go: ⚑ **a DORMANT mob takes nothing** (D12), and the leg must assert it is
  skipped rather than resisted — those are different mechanisms with the same
  observable, and only one of them survives the mob waking up.
- vitest + converter: the key round-trips through all four writers.
- `verify.sh`: a real Tiled save preserves it.
- **In-game**: stand in it, walk out, hop the edge.

---

## 6. Open questions for the PO

1. ✅ **ANSWERED 2026-09-16 (PO) — YES, and immunity is a resistance.** Ruled
   D11/D12; the reasoning is §2.5 and §2.6, and the open question is struck
   rather than deferred. The worry recorded here was authoring risk — a patrol
   route clipping a lava pool quietly depopulating the area, and a mob parked in
   a healing area being unkillable — and the answer is that **both are already
   authorable away** with the resistance map the content rules demand anyway.
   ⚑ It stayed open longer than it needed to because the question was filed as
   content risk; the existing rails were never checked against it.
2. **Is an area suspended during a zone transition, death or respawn?** The
   curtain hides a load seam; taking damage behind it reads as a bug.
3. **Does a death by area effect need its own obituary?** Unexplained deaths are
   a support cost, and the `Obituary` message already exists.
4. **Should an area have a tell beyond its art?** A screen-edge tint or a sound
   on the first tick — and under D9 the tell has two polarities to distinguish.

---

## 7. Landmines

- **L1 — ⛔ the visual edge is NOT the effect edge, and D9 FLIPS WHICH WAY THAT
  CUTS.** D22 puts the authored polygon at the MIDDLE of the blend band, so the
  art spills half a band **outside** the effect boundary — 1.5 units at
  `blend: 3`. ⭐ For a HAZARD that is the forgiving direction and free: you see it
  before it hurts you. ⛔ For a BOON it is the opposite — a player standing in the
  visible halo of a healing spring gets **nothing**, and has every reason to
  believe the spring is broken. A beneficial area wants a small `blend`, or its
  shape drawn deliberately larger than its art suggests.
- **L2 — ⛔ `ApplyDot` streams are keyed by `(caster, per-event damage)`** (round-7
  item 6). An area has no caster, so two different areas authored at the same
  magnitude would collapse into ONE stream and under-apply to anyone standing in
  both. D8 exists for this: each area effect needs a distinct synthetic source.
- **L3 — a zone edit is HALF-LIVE** ([[project-zone-edit-half-live]]). An area
  drawn in Tiled RENDERS instantly via HMR and does nothing until the server is
  restarted. Geometry that looks right and behaves wrong, which has already cost
  one debugging session.
- **L4 — GOD must ignore harmful areas**, or the first in-game pass is confusing.
  ⚑ It should probably NOT ignore beneficial ones, which is a small asymmetry
  worth deciding rather than discovering.
- **L7 — ⛔ `ApplyHot` KEYS ITS STREAM ON PER-EVENT HP ALONE**, with no caster
  — so two beneficial areas of equal strength COLLAPSE into one stream and
  under-heal anyone standing in both. `ApplyDot` was widened to include the
  caster at round-7 item 6; `ApplyHot` was not, and its comment still describes
  the pre-round-7 rule. ⚑ PO-ruled OUT OF SCOPE for E2 (2026-09-16) and recorded
  instead: the same gap already affects two PLAYERS healing one target with the
  same skill, so closing it is a balance change rather than a bug fix. ⭐ L2's
  twin, and worse — L2 is closed for damage by the placed shape being a distinct
  caster per area, and that fix simply does not reach the hot path.
- **L6 — ⛔ D12 MAKES M1-F5(B) VISIBLE, and this is its second consumer.**
  `plan-world-scale.md` M1-F5(B) already records that a mob can freeze
  **mid-walk-home off its route**: the walk-home sits INSIDE the idle path
  (`model/mob/patrol.go:108-113`), so `Pristine()` goes true mid-return and the
  mob sleeps where it stands. ⚑ Put a hazard under that and you get a mob asleep
  **inside a lava pool**, indefinitely, taking nothing — visible, wrong-looking,
  and unreachable until a player walks close enough to wake it. ⛔ Not a reason
  to revisit D12, which is right: it is a pre-existing defect that area effects
  turn from theoretical into something a player can stand and look at. The narrow
  fix is already proposed there (refuse sleep while `returnPosSet`), and this is
  a **dependency of E2's in-game pass**, not of its code.
- **L5 — the atmospheres layer shipped with NO `validateModel` leg at all**
  (`plan-region-atmosphere.md`), which is what let a vertex-less shape reach the
  server. ⛔ The missing leg, not the bad shape, was the cause. Add the leg for
  `effect` the day the key lands.

---

## 8. Cross-references

- `plan-region-atmosphere.md` — the atmosphere primitive; A4's class-vs-flag
  ruling is the direct precedent for D2.
- `plan-zone-polygons.md` — polygons and paths, the ground half of D1.
- `plan-skill-vocab.md` — `DotParams`/`ApplyDot` and its `ApplyHot` twin, the
  refresh rule D6 relies on and the symmetry D9 rests on.
- `plan-content-editor.md` Part B — the skills tab; an area's effect is authored
  there like any other.
- `plan-world-scale.md` — M1-F5(B), the mid-return sleep defect L6 makes
  visible; and M1-F2's `StatusEffectsSystem` residue, which D12 is what keeps
  out of this feature's way.
- `docs/manual-tiled-editor.md` — ✅ has its section since E1.

---

## 9. Chunk ledgers

### E2 — the consumer ✅ 2026-09-16

**Schema: DB NONE · WIRE NONE · CONF NONE · CONTENT NONE · ZONE FORMAT
unchanged** (E1's key is all it needs). ⚑ Still inert at HEAD: no zone authors an
`effect`, so `CollectAreaEffects` returns nothing and the system's `Update`
leaves on a length check.

⭐⭐ **D8 WAS UNIMPLEMENTABLE AS WRITTEN, AND THAT IS THE HEADLINE.** The plan
called for "a synthetic source id" because `ApplyDot` streams are keyed by
`(caster, per-event damage)` — true, and only half the story. `DotBuff.Caster`
is ALSO the **attribution dispatch**: `sys/skills.go` type-switches on it to pick
which entry point the damage takes, and `model.Interacter` has exactly TWO
methods, so anything else falls into a `default: continue`. ⛔ A synthetic token
would have applied the buff, ticked it, and **discarded every damage event in
silence** — the A4 `inDarkness()` seam wearing different clothes. One field was
doing two jobs and the design had only seen one.

⭐ **D13 (PO, 2026-09-16) is the answer: the world is a third kind of damage
source.** `model.AreaSource` (a name and nothing else — an area has no level, no
power scale, no resistances, no threat table and nothing to credit) plus
`model.AreaHittable`, and a `case model.AreaSource` in the dot dispatch. ⚑ An
OPTIONAL interface rather than a third method on `Interacter`, which is the house
idiom (`dotBuffable`, `buffEventCarrier`) and avoids forcing a method onto seven
test fakes that will never meet an area; the ruling is unchanged. ⛔ No threat, no
kill credit, no participation, no lifesteal — **a mob that dies in lava pays
nobody**, which is also the anti-exploit: an area that credited its kills to the
nearest player would be an XP farm nobody had to fight.

⭐ **D11 cost NOTHING, confirmed in code rather than argued.** `AreaTouches` goes
through `takeDamage`, where `ResistMultiplier` already lives, so a mob's authored
`factors.resistances` mitigates an area exactly as it mitigates a skill and a
`0` is immunity — with no area-effect-specific code in the path. ⚑ Pinned at
**0.5 AND 0**, never only the immunity: a suite that pinned `0` alone could not
tell "immune" from "the multiplier is no longer applied to this path", because
the two look identical.

⭐ **D12 rides the existing skip** — the system asks the entity `Dormant()`, not
MobSystem's bookkeeping, because it never sees MobSystem and asking the mob is
the only reading that cannot go stale. ⚑ Pinned as **skipped, not resisted**:
different mechanisms, same observable, and only one survives waking up.

⛔⛔ **`Place()` DID NOT OFFSET ATMOSPHERES, AND A SHIPPED TEST ASSERTED IT MUST
NOT.** Its stated reason — *"the client applies the origin, and doing it here too
would move them twice"* — is **wrong on the mechanism, measured not argued**:
zone geometry is not on the wire AT ALL (no such field in `api/schema/*.fbs`),
and the client bundles `api/zones/*.json` straight through webpack
(`GroundTextureManager.ts`'s `require.context`), so the server's in-memory copy
is private and cannot double-move anything. ⚑ What the old rule got RIGHT was the
policy of its day: no dead work for an array nobody server-side reads. E2 created
the reader, so the premise expired. ⛔ **The bug it prevents is INVISIBLE ON THE
OVERWORLD** — origin {0,0} means no offset, so an unplaced miasma bank works
perfectly in `world.json` and acts in the wrong place in every zone that IS
placed, which is precisely where the hazards are going. ⚑ Clearings stay local as
the control, so "place everything" cannot be read into the change.

⛔⛔ **I NEARLY SHIPPED A SYSTEM THAT COMPILED AND DID NOTHING.** The first cut
declared `Position()` against a hand-rolled `interface{ XY() (float32, float32) }`
— `phy.Vec2f` has no such method, so `areaAffectable` matched **NOTHING**,
`AddEntity` registered zero entities, and `Update` was a permanent no-op. It
compiled, `go vet` was clean, and tests against the double were green because the
double had the method the real types did not. ⭐ That is `lifesteal_burst`'s story
verbatim one feature later, which is why the leg now lives IN
`self_buff_capabilities_test.go` beside it rather than in a file of its own.

⛔ **Mutation-testing found a missing leg that mattered**: deleting the dispatch
case left every other area test GREEN — they assert the buff applies and that the
caster's type is right, and neither notices the damage being dropped downstream.
There is now an end-to-end leg driving `tickBuffEvents` on a REAL mob and
asserting **health went down**.

**Two rulings E2 had to make**, both left open by E1 on purpose:

- ⭐ **An area consumes `dot_aura` and `hot_aura`, and nothing else.** They are
  the only types whose whole shape is "a thing that keeps happening to whoever is
  in range", which is what an area IS. A new boot pass
  (`CrossValidateAreaEffectShapes`) refuses a skill that exists but carries
  neither — *"Immolate exists"* is not enough if Immolate is only a cooldown. ⚑ A
  mixed skill is fine; the area applies what it can.
- ⭐ **Level 1, always.** An area has nothing to scale off, and per-level growth
  describes a CASTER getting better at something — a lava pool does not get
  better at being lava. Strength is authored per placement, which is D2's third
  reason arriving in code.

⚑ **The geometry lesson is sharper than P3's and worth carrying forward: AWKWARD
IS NECESSARY AND NOT SUFFICIENT.** Mutating `PointInPolygon` found that the
likeliest rewrite error — `>` becoming `>=` — is **invisible** to an awkward
quadrilateral and to a concave L, and is caught **only** by the axis-aligned box,
because that comparison can only differ when a vertex's Y is EXACTLY the sample's
Y. ⛔ P3's lesson read alone ("a grid-aligned fixture proves nothing") would have
deleted the one fixture that catches it. The two are complementary.

⚑ **Go and the client's point-in-polygon DIVERGE at a vertex and cannot be made
to agree** — measured: `lShape`'s first vertex is `true` in TS and `false` in Go,
because JS numbers are float64 and `world.Point` is float32. Harmless (L1 already
puts the drawn edge ~1.5 u from the authored one by design) but do NOT write a
test claiming parity.

⚑ **A PATH IS A STROKE, NOT AN AREA** — recorded in code, not fixed. D1 puts
`effect` on all three shapes, but point-in-polygon over a road's centreline
answers about the sliver the polyline encloses, not the corridor the player sees.
The honest fix is a different predicate (distance-to-segment). Inert: no content
authors one.

⚑ **ApplyHot's stream keying stays as it is (PO, out of scope)**: it keys on
per-event HP ALONE — no caster — so two beneficial areas of equal strength
collapse into one stream. `ApplyDot` was widened at round-7 and `ApplyHot` was
not; its comment still describes the old rule. A pre-existing gap that also
affects two players healing one target with the same skill, so fixing it is a
balance change rather than a bug fix. **Landmine L7.**

**Files:** `world/point_in_polygon.go` (new) · `world/area_effects.go`
(`PlacedAreaEffect`, `CollectAreaEffects`, `CrossValidateAreaEffectShapes`) ·
`world/place.go` (atmospheres offset) · `model/interactable.go` (`AreaSource`,
`AreaHittable`) · `model/player` + `model/mob` (`AreaTouches`) ·
`sys/areaeffects.go` (new) · `sys/skills.go` (the dispatch case) ·
`cfg/gamecfg.go` + `core/gameconf.go` + `core/game.go` + `cmd/aurad` (wiring).

**Verified:** `go build` · `go vet` · **`go test -count=1 ./...` EXIT 0** (35
packages) · `tsc` · **vitest 803/803** · **`verify.sh` all green** ·
**mutation-verified ×9, two of which SURVIVED the first pass** and produced the
end-to-end dispatch leg and a corrected L2 mutation.

⛔ **NO IN-GAME PASS, and it is OWED** — E3's, because nothing authors an effect
yet, so there is nothing to stand in. ⚑ **L6 is E2's dependency, not its code**:
M1-F5(B)'s mid-return sleep means a mob can fall asleep INSIDE a lava pool and
sit there taking nothing, which the in-game pass will see.

### E1 — the key, inert ✅ 2026-09-16

**Schema: DB NONE · WIRE NONE · CONF NONE · CONTENT NONE · ZONE FORMAT one
optional key on three arrays, absent-safe.** No shipped zone authors an
`effect`, so every zone file is byte-identical at HEAD and the feature does
nothing until someone draws one (D10).

**What `effect` names, settled in the build:** an **authored SKILL** —
`api/skills/*.json`, 105 of them. D9's aside about `effectKeys` reads
ambiguously, but D3 (*"reuses the damage type, resistances and immunity rails"*),
§3.2 (*"apply that effect's buff"*), §4 (CONTENT **NONE** — *"effects that
already exist"*) and §8 (*"an area's effect is authored [in the Skills tab] like
any other"*) only hold if the value is a skill. An `EffectType` carries no
magnitude, so it cannot satisfy D3 at all.

**Where it went:** `paths`, `polygons`, `atmospheres` — exactly the three D1
names. ⛔ **Not `regions` and not `clearings`, and both omissions are rulings
the palette now enforces**: a region is the MATERIAL UNDERFOOT (the
footsteps/music/colour lookup), so an effect there would be a property of every
patch of that material rather than of a place; a clearing paints nothing and
names nothing (A4/L7), and an erase that also burned you is one shape doing two
jobs — the ambiguity A4 exists to have removed.

⭐ **THE FOURTH WRITER NEEDED NOTHING, AND THAT WAS CONFIRMED RATHER THAN
ASSUMED** (§3.1's warning, zone-polygons D5's session). `aura-world-format.js`
splits into two paths: MAP-level values are hand-copied onto the `TileMap`
(which is how `origin` went missing and refused a boot), while OBJECT properties
ride a generic loop — `for key in src.properties` → `typedValue` on the way in,
`properties: o.properties()` on the way out, with the enum type read from the
model's own `enums` map. `effect` is an object property, so it rides the
generic path. ⚑ **"Should need nothing" is a claim, and the vitest pin cannot
test it** — the pin exercises the PURE converter and never meets Tiled's
`MapObject`. A new `verify.sh` leg is what turns the claim into a measurement,
and it is green through the real binary.

⭐⭐ **A PRE-EXISTING DEFECT FELL OUT, and it is the durable part of the
chunk: `api/skills/` has a `mobs/` SUBDIRECTORY, and the Go registry
RECURSES.** `skills.RegistryFromFS` uses `fs.WalkDir`, so the server knows all
105 definitions; the first cut of the generator's `readEffects` did a flat
`readdirSync` and offered **72**. ⛔ **That is the palette drifting from the
content it is generated from — the exact failure `generate-palette.mjs`'s own
header forbids** — and the symptom would have been Tiled REFUSING a name the
server happily accepts, with the message insisting the skill does not exist. ⚑
Caught by reading the loader rather than by any leg, so a leg now exists: the
vitest guard walks `api/skills/` itself and compares, derived from the directory
and never from a count. ⚑ It also matters on the merits — an area effect has no
caster (L2), so a mob-flavoured aura is often the better fit for a lava pool than
a player skill.

**The boot check is a CROSS-VALIDATION PASS, not a `validate()` rule**, and the
reason is structural: `resolve()`'s own comment records that since the NPC merge
*"the zone no longer references skills at all"*, so the skills registry is built
long before any zone but is not an argument to the zone loader. Threading a fifth
registry through ~70 `LoadZoneFS` call sites for a key no zone authors is the
wrong trade; `world.CrossValidateAreaEffects` runs where both are already in
scope — `CrossValidateTravelAnchors`' precedent, one registry over. ⚑ `world`
already depends transitively on `skills` (via `items/mobs`), so no cycle.

⛔ **It is an ERROR where the anchor pass's definition half is a WARNING**, and
the split is that function's own rule: *placement*. An anchor on an unplaced mob
is content waiting for a zone; an area effect is placed **by construction** — it
IS a shape in a loaded zone — so an unresolvable name is a hazard that draws,
reads as dangerous and does nothing.

⚑ **The blank case is refused separately, in `validate()`, and deliberately so**:
`"effect": ""` left to the registry lookup reports `unknown effect ""`, which is
true and useless. Its message says *"leave the key out entirely"*.

⚑ **`checkEffect` was written the day the key landed — L5's rule applied rather
than re-learned.** The atmospheres layer shipped with NO `validateModel` leg at
all, and the missing leg (not the bad shape) is what let a vertex-less object
refuse the PO's boot.

⚑ **The sentinel is `(no effect)` and it takes `outlineProfile`'s reading, not
`profile`'s** — the same placeholder mechanism meaning the opposite thing.
`PROFILE_UNSET` on `profile` means *"you forgot"* and the save refuses it; this
means *"decorative"*, which is every shape in every shipped zone, so it maps back
to ABSENT. ⚑ It equals the palette member's own default (the C6 rule with no
spare value available): a Tiled that DROPS a default-valued property and one
that KEEPS it have to reach the same answer, or every path, polygon and fog bank
in the world grows an `"effect": "(no effect)"` nobody wrote on its first save.

⛔ **The enum wiring is pinned STATICALLY, because `verify.sh` is blind to it**
(measured in A2, not re-assumed): headless `--export-map` loads no project, so
`tiled.propertyValue` throws and the bridge falls back to a bare string that
round-trips whatever the member declares. **Mutation M4 proved it again** —
pointing `AuraAtmosphere.effect` at `AuraProfile` is caught only by the vitest
palette pin. The dropdown itself is human check #4 in `verify.sh`'s footer.

**Files:** `world/zone.go` (3 fields + `validateEffect`) · `world/area_effects.go`
(new) · `cmd/aurad/loaders.go` + `aurad.go` (the wiring) ·
`aura-zone/aura-convert.js` (sentinel, enum, `writeEffect`/`readEffect`,
`checkEffect`, 3 serializer keys) · `ZoneModel.ts` (3 interfaces, both
directions) · `generate-palette.mjs` (`AuraEffect`, `EFFECT_NAMES`, the shared
member) · `docs/manual-tiled-editor.md`. ⚑ `aura-world-format.js`: **no change,
confirmed**.

**Verified:** `go build ./...` · `go vet ./...` · **`go test -count=1 ./...`
EXIT 0** · `npm run typecheck` · **vitest 803/803** (+15) · prod build ·
**`verify.sh` all green through real Tiled, incl. 3 new legs** (all three shapes
round-trip; a decorative shape grows no key; an unknown effect is refused) ·
**mutation-verified ×10, all caught**: M1 serializer drops the polygon key · M2
`readEffect` returns the sentinel · M3 the atmosphere `validateModel` leg loses
`checkEffect` · M4 the atmosphere effect member points at `AuraProfile` · M5
`readEffects` goes flat again · M6 the member default becomes a real skill · G1
the atmosphere loop loses `validateEffect` · G2 the pass skips `paths` · G3 the
pass stops erroring · G4 `loadZones` stops calling it. ⚑ **G4 is why
`cmd/aurad/area_effects_boot_test.go` exists**: `world/`'s own tests prove the
pass ANSWERS correctly and nothing there proves anyone CALLS it — and a pass over
real content cannot tell *"checked and clean"* from *"never ran"*, because no
shipped zone authors an effect.

**No in-game pass, and it would prove nothing yet.** E1 ships the key inert: the
server parses, validates and ignores it. The first thing worth walking is E2.

⚑ **OWED, carried into E2:** the four §6 PO calls are untouched (mobs? suspension
across a curtain? an obituary? a tell?), and the §7 landmines L1/L2/L4 are all
E2's to answer. ⚑ **One ruling E1 deliberately did NOT make**: whether the named
skill must carry an effect type an area can actually apply — a `dot_aura` or its
`ApplyHot` twin, rather than, say, a dash. Both the palette and the boot check
take an existence-only posture, because E2 is what decides which effect types an
area consumes, and inventing that rule a chunk early would bake an unmade
decision into the dropdown.
