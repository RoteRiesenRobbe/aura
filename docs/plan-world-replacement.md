# Plan: The world re-placement pass — sensible level bands across `world.json`

> **Status: ✅ DESIGNED 2026-08-06 — D2–D5 ruled, THREE chunks decided. ⭐ C0 IS
> BUILT (2026-08-06, headless-verified, `7055aad4`) — the next session is
> C1, the decisions session, and it needs the PO in the loop for all four of its
> items.** Ledger: §12 C0. Open items O2–O5 are
> deferred *into* C1 rather than pre-ruled, because each needs the map in front
> of it (§6). ⭐ **Two same-day corrections after the first pass:** **D5
> supersedes D1** — the band is the roster's *current* ~1–20 and the top of
> difficulty is **not** retuned, because the world is too small to spread 30
> levels and still offer options per level range — and the **six-chunk split
> collapsed to three**, because four of the six shared all their context and
> were a review unit mistaken for a session unit (§7).
> This is roadmap **step 2 of the XP-economy chain**
> (`roadmap.md` → Execution order → "Post-8a insert"), the step that
> `plan-xp-formula.md` §12 D9 named and that **no plan owned** until this file.
> Its tool shipped the day before: `plan-mob-levels.md` C3 (`0c6eca22`) gave the
> zone editor a per-spawn *Level* field whose value survives a save.
>
> **It gates `xp C2`**, the single final calibration pass — D9's ruling is that
> calibrating an economy against a roster with untrustworthy levels and a
> multi-level hole calibrates against noise.

---

## 1. What this is

`world.json` holds **485 spawns**, of which **423 are combat mobs** (the other
62 are NPCs, structures and props authored `xpFactor: 0`). Every one of those
423 stands at its species' authored `curveLevel`, because **no spawn in the
world carries a `level` override yet** — C3 shipped the field, not a placement.

This pass re-places and re-levels that world so the difficulty a player meets
tracks the level they are, across **the band the roster already spans, ~1–20**
(D5 — `maxLevel` stays 30, but the world is not stretched to it). Three
separable problems live in it:

1. **The world's band geography** — which regions are which levels.
2. **The roster's holes** — level ranges with nothing at level.
3. **The catalog's coherence** — species whose `curveLevel` does not describe
   how hard they actually are.

⚑ **This is a content pass, not a code pass.** The expected deliverable is
edited `api/zones/world.json` (+ possibly `api/mobs/*.json`), not new systems.
The one exception is C0 below, which is a code pre-chunk borrowed from the
sibling plan for a reason stated there.

---

## 2. Decision ledger — PO rulings 2026-08-06

- **D1 — ⛔ SUPERSEDED the same day by D5.** Text preserved in §11.
- **D5 — the band is the roster's CURRENT band, ~1–20; the top is not
  retuned. SUPERSEDES D1.** No mob is placed above the highest level already
  in the world. **The current maximum difficulty stays exactly where it is** —
  the Orc front keeps its cL20, `OrcWarlord` keeps its level, and nothing at the
  top end is re-tuned. What the pass does is tune **within the band between the
  lowest and the highest existing mob**, filling its gaps (cL8, cL13–17, cL19).
  `maxLevel` stays **30**, deliberately: *"it takes a really long time to reach,
  and the world is too small to hold such a large level band and still give
  options per approximate level range."*
  ⚑ **The reasoning is a density argument, and it is the right one.** Spreading
  30 levels over ~10 regions is ~3 levels per region with *one* option each; a
  player at any given level wants **more than one place to go**. Compressing to
  1–20 buys overlapping bands — several regions viable at once — which is what
  makes a level range feel like a choice instead of a corridor.
  ⚑ **Three consequences:** it **dissolves O1** (the front's 18-spawns-for-ten-
  levels problem disappears with the requirement), it **removes the pass's only
  Go edit** (`encounter/warlord.go` is untouched), and it converts §3.3's
  21–30 hole from *a thing to fix* into **a known, accepted gap** — see §3.3.
- **D2 — bands are region-keyed, not axis-keyed.** The level a player reads is
  a property of **the place they are standing in** — village, farm, dark forest,
  kobold hideout, tunnel, bandit gate, the front — not of an x-coordinate. This
  is the WoW-Classic zone reading and it matches how the content pass actually
  authored the world (`archive/plan-content-zones12.md` §2). Rejected:
  decompressing the existing west→east ramp (an axis gradient reads as arbitrary
  where the terrain disagrees), and concentric rings from the start (contradicts
  the front's already-anchored siting). ⚑ **The region boundaries are not in
  `world.json`** — named sub-regions are an unbuilt primitive (`tdd.md` §4.6).
  They are reconstructed in **§3.6** from the content plan's geography plus
  measured spawn centroids, and that reconstruction needs PO sign-off before
  C2 places anything.
- **D3 — no hard stretch ceiling; judgement per case.** A species may be placed
  at any level above its `curveLevel`. This ratifies the original backlog §38
  ask verbatim (*"spawn the same wolf on level 1 and 30"*). Rejected: a ~+5 soft
  ceiling, and the pair-with-a-tier-bump variant (which would turn part of a
  content pass into new catalog authoring). ⚑ **The cost is real and is now
  landmine L2**: a stretched species is a *bullet sponge with its original
  moveset* (§3.5), so the judgement this ruling delegates is exactly "does this
  fight still read as a fight". It is reviewable only by walking it — which is
  why **C0 exists**.
- **D4 — the catalog half is in scope, all four.** Re-author `curveLevel` for
  **Bear**, **OrcGrunt** and **EliteBandit** so the label matches the effective
  difficulty, and rule on **ArmySoldier**'s `xpFactor: 0` across 18 spawns.
  Reasoning: under `xp C1` a wrong level now mis-prices XP as well as
  mis-scaling HP, so leaving it makes `xp C2` calibrate against known-bad data —
  which is the exact noise D9 sequenced this chain to remove. ⚑ **The roadmap's
  three named examples are NOT these three** and are unplaced; §3.4 and L4.

---

## 3. Current state — the world as measured (2026-08-06)

Everything in this section is measured from `api/zones/world.json` and
`api/mobs/*.json` at `0c6eca22`. It is the evidence the whole design stands on.

### 3.1 The difficulty map — the world already has a gradient

World bounds are **144 × 72** units (x −72…+72, y −36…+36). Each cell below is
3 × 4 units; the character is the **maximum `curveLevel`** of any combat spawn
in that cell (`.` = no combat spawn; `1`–`9` literal, `a` = 10, `b` = 11,
`c` = 12, `i` = 18, `k` = 20).

```
       x=-72                                          x=+72
 -34.0 ...........b...4...........4..4444499..c....i.ik
 -30.0 ........2...2.4.4.4444.4....4.4...9..5c.c.....i.
 -26.0 .2225..24..2......2...2...44.2.......cc6c.....i.
 -22.0 ...5......4.2...2...2.262....22.......5c555..a..
 -18.0 .4..2224.....4...2....62.26.a...........56......
 -14.0 ..........22....26262..2..6.2...a......55.666...
 -10.0 ....4.2..4..2..22.161.22.26.6.22667......6.56...
  -6.0 ..........2..222223..2.1.2.1.2..a6.6.....6.5....
  -2.0 .2...2..2.2.1..2.6....2.22......a6.66...2..6....
   2.0 .1.2221.21221.221.3.3...22..2...67.666..222.....
   6.0 ..2..21..61.22.2.3323.142.22....666....2....2...
  10.0 .2.2..22.222.2...33.3....2..2...7.7......2.2....
  14.0 221...2.1.1.22...3.33.222.16.4..66..2....2..2...
  18.0 .2.....2.2.22..2.333..2121.22....6c....6........
  22.0 21........2.122...33..2...42..5555.2.66.1...1...
  26.0 ........22.....3.........5.2..5.k...............
  30.0 22.111.2.2.222.12..2..222.21.1...kk.............
  34.0 .22.222222221.1....2.2.2.2.2..b....kkkkkkbkkk...
```

**The gradient is west → east**, and it is real but heavily compressed:

| x band | spawns | mean cL | max cL |
| --- | --- | --- | --- |
| −72…−54 | 48 | 2.0 | 5 |
| −54…−36 | 58 | 2.2 | 11 |
| −36…−18 | 54 | 2.3 | 6 |
| −18…0 | 64 | 2.7 | 6 |
| 0…+18 | 56 | 2.7 | 10 |
| +18…+36 | 63 | **7.4** | 20 |
| +36…+54 | 54 | **8.0** | 20 |
| +54…+72 | 26 | **9.7** | 20 |

⚑ **The whole western half is one flat cL≈2 plateau** — 224 spawns across
half the world, averaging level 2.2, i.e. the first ~2 levels of a 30-level
game occupy 50 % of the land. The `kkk` block at the bottom-right of the map is
the Orc front (anchors `warlord-home` 26/30.5, `wave-mouth` 33.5/31.5).

### 3.2 What is actually placed, by level

423 combat spawns, by the `curveLevel` they currently stand at:

| cL | spawns | share | species |
| --- | --- | --- | --- |
| 1 | 43 | 10.2 % | Stag, Turnip |
| 2 | **187** | **44.2 %** | Boar, Wolf |
| 3 | 26 | 6.1 % | Kobold, KoboldRanged |
| 4 | 30 | 7.1 % | Bear, Spider, VenomSpider |
| 5 | 35 | 8.3 % | Bandit, BanditHealer, BanditRanged, EliteWolf |
| 6 | 46 | 10.9 % | BanditPyromancer, DireWolf, RallyDrummer |
| 7 | 7 | 1.7 % | DireBear, EliteBandit |
| 8 | — | — | *(empty)* |
| 9 | 5 | 1.2 % | GiantSpider |
| 10 | 8 | 1.9 % | AlphaWolf |
| 11 | 6 | 1.4 % | Troll |
| 12 | 10 | 2.4 % | Marauder |
| 13–17 | — | — | *(empty — the hole the chain was scoped around)* |
| 18 | 4 | 0.9 % | FireElemental |
| 19 | — | — | *(empty)* |
| 20 | 16 | 3.8 % | GreaterFireElemental, Orc, OrcGrunt |
| **21–30** | **—** | **—** | ***(EMPTY — see §3.3)*** |

**87 % of the world's combat spawns sit at cL1–6.** Levels 7–30 — 24 of the
game's 30 levels, four fifths of the progression — are served by **49 spawns**,
11.6 % of the world.

### 3.3 ⚑ The bigger hole nobody had named: levels 21–30

`game.player.maxLevel` is **30** (`backend/conf.json`, the standing
growth-1.12 × 30 lock). The **placed** roster tops out at **cL20**; the
**authored** roster tops out at cL23 (`OrcWarlord`) and that species **is not in
`world.json` at all** — it is spawned by `backend/pkg/aura/encounter/warlord.go`.

So **levels 21–30 have nothing at level whatsoever** — a ten-level hole, twice
the width of the cL13–17 hole this entire chain was scoped around, and it had
not appeared in either plan doc.

⭐ **D5 rules that this pass does NOT fill it.** The band stays ~1–20, the top
of difficulty is not retuned, and the 144 × 72 world is explicitly judged too
small to carry 30 levels while still offering more than one option per level
range. So this section stops being a problem statement and becomes a **standing
recorded gap**:

> **Levels ~21–30 have no at-level content, by decision, until the world grows.**
> `maxLevel` remains 30 and reaching it is meant to be slow.

⚑ **`xp C2` inherits this and should be told so explicitly.** Its open §8.1
pacing call (*"flat ~7.5 kills/level for all 30 levels — should the late game be
slower?"*) is sharpened by it: the last third of the curve has nothing at level
by design, so what the curve does up there is a question about **grind against
under-level content**, not about pacing across a populated band. That is a
materially different question from the one §8.1 currently asks.

### 3.4 ⚑ `curveLevel` doesn't track difficulty — but the named examples are the wrong ones

`roadmap.md` and `plan-xp-formula.md` §11 both name **AngryMammoth,
SaberToothCat and ProvingBoss** as the cL-doesn't-track-difficulty cases. All
three are correct as catalog facts and **none of the three is placed in
`world.json`** — ProvingBoss is proving-grounds content, the other two are
unplaced entirely. Re-authoring their `curveLevel` changes nothing a player
touches.

The **live** instances need their own measurement, and the discriminator is
effective HP, because `MaxHealth = baseMaxHealth × F(level)` with
`F(L) = 1.12^(L−1)` — so `baseMaxHealth` is the pool **at level 1** and carries
the species' intrinsic beefiness *independently* of its curve position. Placed
combat species sorted by what a player actually meets:

| effHP | cL | base | tier | species |
| --- | --- | --- | --- | --- |
| 20 | 1 | 20 | normal | Turnip |
| 35 | 1 | 35 | normal | Stag |
| 50 | 3 | 40 | normal | KoboldRanged |
| 56 | 3 | 45 | normal | Kobold |
| 62 | 2 | 55 | normal | Wolf |
| 67 | 2 | 60 | normal | Boar |
| 94 | 5 | 60 | normal | BanditRanged |
| 101 | 4 | 72 | normal | VenomSpider |
| 104 | 5 | 66 | normal | BanditHealer |
| 118 | 4 | 84 | normal | Spider |
| 169 | 6 | 96 | normal | BanditPyromancer |
| 169 | 6 | 96 | normal | RallyDrummer |
| 170 | 5 | 108 | normal | Bandit |
| 222 | 6 | 126 | normal | DireWolf |
| **270** | **4** | 192 | normal | **Bear** ⚠ |
| 415 | 5 | 264 | elite | EliteWolf |
| 449 | 10 | 162 | normal | AlphaWolf |
| 451 | 9 | 182 | normal | GiantSpider |
| 561 | 7 | 284 | normal | DireBear |
| 565 | 11 | 182 | elite | Troll |
| **640** | **7** | 324 | elite | **EliteBandit** ⚠ |
| **646** | **20** | 75 | normal | **OrcGrunt** ⚠ |
| 678 | 12 | 195 | normal | Marauder |
| 1133 | 18 | 165 | normal | FireElemental |
| 3617 | 20 | 420 | elite | Orc |
| 3876 | 20 | 450 | elite | GreaterFireElemental |

The live offenders, in order of how much a player would notice:

- **Bear, cL4, 270 effHP** — tougher than DireWolf (cL6), Bandit (cL5) and
  every cL5 except EliteWolf. It is an effective cL7 wearing a cL4 label, which
  under `xp C1` means it now **mis-prices its own XP** as well as fighting
  above its weight. 9 spawns.
- **OrcGrunt, cL20, 646 effHP** — a trash add authored at the front's level, so
  it pays and plates like a cL20 while dying like a DireBear. 3 spawns.
- **EliteBandit, cL7, 640 effHP** — elite tier doing cL11 work at a cL7 label.
  1 spawn.
- **ArmySoldier, cL18, `xpFactor: 0`, 18 spawns** — the largest single block of
  high-level placements in the world **pays nothing and carries no nameplate**.
  Whether that is deliberate set-dressing (the front's ambient soldiers) or an
  authoring miss is **question Q4**.

⚑ **The catalog half of this pass is that list, not the roadmap's.** The
roadmap's three names should be corrected when this pass closes.

### 3.5 What the spawn override actually scales — and what it does not

`Mob.Level()` resolves `owner ?? spawnLevel ?? curveLevel` (`plan-mob-levels.md`
C1), and the level feeds `PowerScale() = F(level)`, which multiplies
`baseMaxHealth`, mob skill damage, and the kill-XP award. So a spawn override
scales **HP, damage and XP** — and nothing else.

It does **not** scale the species' kit: `skills`, `body.aggroRadius`,
`body.radius`, `factors.speed`, `deltaPhi`, `turnRate` and the drop table all
stay exactly as authored. **A Wolf placed at 15 is a level-15 healthbar with a
level-2 moveset** — same bite, same chase speed, same aggro radius, same drops.

What a stretch costs in HP (`base × 1.12^(L−1)`):

| species | base | L5 | L10 | L15 | L20 | L25 | L30 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Wolf | 55 | 86 | 152 | 268 | 473 | 834 | 1471 |
| Boar | 60 | 94 | 166 | 293 | 516 | 910 | 1604 |
| Kobold | 45 | 70 | 124 | 219 | 387 | 683 | 1203 |
| Bandit | 108 | 169 | 299 | 527 | 930 | 1639 | 2888 |
| DireWolf | 126 | 198 | 349 | 615 | 1085 | 1912 | 3370 |

⚑ **This is why "how far may a species be stretched?" is a real design question
(Q3) and not a shrug.** A stretched Wolf is a *bullet sponge with a low-level
moveset* — it takes longer to kill without ever becoming more interesting, and
past some distance the fight reads as padding rather than difficulty. The
answer decides whether the cL13–17 and 21–30 holes get filled by stretching
existing species (a content edit) or genuinely need new species (a much larger
pass, and a different plan).

### 3.6 The region map — reconstructed, and the proposed bands (D2)

⚑ **`world.json` has no regions.** Named sub-regions are an unbuilt primitive,
so the map below is *reconstructed* from `archive/plan-content-zones12.md` §2
plus measured spawn centroids and NPC positions. **It needs PO sign-off in C1
before any spawn is edited** — if the region shapes are wrong, every band is
wrong.

**Orientation, established from the data: `+y` is SOUTH.** The start farm
(campfire `spawnpoint-1`, Farmer at −57/+28.6) is the doc's "farm SW" at
y = +24; the Orc front ("front S") sits at y = +27…+35; the dark forest "NW"
is the `darkAreas` cluster at y = −25…−11. Nothing in the JSON says this — it
is worth writing down once.

| region | box (x, y) | spawns | cL today | **proposed band** |
| --- | --- | --- | --- | --- |
| Farm / start (SW) | −72…−44, +16…+36 | 25 | 1–2 | **1–3** |
| West wildlife | −72…−30, −8…+16 | 56 | 1–6 | **3–6** |
| Dark forest (NW) | −72…−38, −36…−8 | 21 | 2–5 | **5–8** |
| Kobold hideout | −30…−4, −8…+28 | 46 | 1–6 | **6–9** |
| Mid road / centre | −4…+24, −16…+28 | 54 | 1–6 | **8–12** |
| **Dark Tunnel belt (N)** | −38…+24, −36…−16 | 40 | 1–11 | **9–13** ⟵ solo gate |
| **Bandit horde / NE** | +24…+62, −28…−8 | 38 | 5–12 | **13–17** ⟵ group gate, **fills the hole** |
| East village + City Gates | +30…+72, −8…+24 | 31 | 1–12 | **15–18** |
| NE fire pocket | +60…+72, −36…−24 | 5 | 18–20 | **18–20** ⚑ see below |
| **The front (S)** | +24…+72, +24…+36 | 18 | 11–20 | **18–20** — unchanged (D5) |

*(334 of 423 combat spawns fall inside these boxes; the remaining 89 sit in the
gaps between them and are exactly why the boundaries need ratifying rather than
scripting.)*

⚑ **The top three regions deliberately overlap at 18–20** — that is D5's
density argument made concrete. A player at 18 has the City Gates approach, the
fire pocket and the front all viable at once, rather than one corridor. The same
overlap should be checked at every rung when the table is ratified: **if any
level has exactly one place to be, the table is wrong.**

**Three things this map makes visible that the flat histogram did not:**

1. ⚑ **The two Z1→Z2 gates are PARALLEL, not sequential.** The content pass
   built the Dark Tunnel (north, **solo**, spiders) and the Bandit Horde
   (middle, **group** gate, un-soloable at level) as two routes to the same
   place. So they must sit at **comparable** levels — a band table that ramps
   them 9–13 then 13–17 quietly converts a choice into a sequence. The proposal
   above deliberately overlaps them at 13; **whether the group gate should be
   flatly harder than the solo one is a design call, not a derivation.**
2. ⚑ **The cL13–17 hole is filled by the bandit territory**, without one new
   species — Bandit, BanditRanged, BanditHealer, BanditPyromancer, Marauder,
   AlphaWolf and DireWolf all already stand there at cL5–12. This is precisely
   the case `plan-mob-levels.md` was built for, and it is a pure `level`-key
   edit on 38 spawns.
3. ⚑ **There are TWO high-level pockets, not one.** Beside the front, four
   `FireElemental` (cL18) and one `GreaterFireElemental` (cL20) sit in the far
   **NE corner** at x ≈ +63…+70 — and `archive/plan-content-zones12.md` §2 is
   explicit that zones 1–2 carry **no fire content** (*"NO magic / supernatural
   / elemental… NO `fire`"*). They read as a Zone-3 teaser like the City Gates,
   or as leftovers. **Open: does the fire pocket stay, move, or go?** (O4) Ruled
   in **C1**.

---

## 4. Scope — what a `world.json`-only edit would miss

Naming these so the pass cannot ship looking complete:

1. **`OrcWarlord` is not in `world.json`.** The boss comes from
   `backend/pkg/aura/encounter/warlord.go`. If the top band moves, the
   encounter's level moves with it — and that is a **Go** edit, the only one
   this pass might carry besides C0.
2. **Six spawns carry `waypoints`, one carries `patrolMode: loop`** — DireWolf
   ×2, Wolf ×2, Marauder, GiantSpider. A patrol route can cross a band
   boundary, which makes a patroller's level ambiguous by construction. They
   need a per-route decision, not a per-spawn one.
3. **`respawnTicks` is authored on 471 of 485 spawns and `wanderRadius` on
   246.** Re-banding changes what those numbers mean for pacing (a higher-level
   region wants slower respawns), so they are in scope for review even if the
   pass leaves them alone.
4. **The 62 non-combat spawns** (`xpFactor: 0` — NPCs, signs, structures) are
   out of scope for levelling and should be asserted *unchanged* by the
   verification, exactly as C3 asserted "no spawn gained a `level` key".
5. **`api/zones/proving-grounds.json`** is legacy-tagged content and is **out of
   scope**; state it explicitly so its untouched state is a decision, not an
   oversight.

---

## 5. Constraints the bands must respect

- ⚑ **Every campfire's neighbourhood must be survivable by whoever can respawn
  there.** The five bound-respawn campfires sit at `spawnpoint-1` (−58.2/24),
  `-2` (**44/10.5**), `-3` (−16.47/31.53), `-4` (−21.26/−23.51) and `-5`
  (**34.19/−20.68**). **Two of the five are already in the high half** — x=44
  falls in the mean-cL-8.0 band and x=34.19 in the mean-cL-7.4 band, both with
  max cL 20 nearby. Raising those neighbourhoods without checking turns a bound
  fire into a **death loop**: you respawn, and the thing that killed you is in
  aggro range. This is a hard constraint, not a nicety.
- **The world is small.** 144 × 72 units, ~96 s wide on foot
  (`archive/plan-flight-paths.md` §9). The number of legible bands the geography
  can actually hold is bounded by that, and it is the practical ceiling on Q2.
- **The dark areas** (35 of them, clustered around x≈−62, y≈−25…−11) are the
  cave/tunnel content and read as a natural band boundary.
- **The four anchors** (`warlord-home`, `warbanner-1/2`, `wave-mouth`) pin the
  Orc front's geography; the top band is effectively already sited.

---

## 6. The design questions — ✅ all four ruled 2026-08-06

| | question | ruling |
| --- | --- | --- |
| **Q1** | Does this pass fill levels 21–30? (§3.3) | ~~**D1** — yes, front-loaded~~ → **D5: NO** — band stays ~1–20, top not retuned |
| **Q2** | How is the gradient laid out? (§3.1) | **D2** — region-keyed |
| **Q3** | How far may a species be stretched? (§3.5) | **D3** — no hard ceiling |
| **Q4** | Does the catalog get fixed here? (§3.4) | **D4** — yes, all four |

**Still open, deliberately deferred into C1 rather than pre-ruled** — each
needs the map in front of it, not a paper answer:

- **O1 — ⛔ DISSOLVED by D5.** It asked how the front carries ten levels on 18
  spawns; D5 removed the requirement, so the front is simply not re-tuned.
- **O2 — the region boundaries themselves**, reconstructed in §3.6 and never
  authored anywhere. → **C1**, before a single spawn moves
- **O3 — solo vs group gate parity**: should the Bandit Horde be flatly harder
  than the Dark Tunnel, or level-equal with a difficulty difference that comes
  from the pack composition alone? → **C1**
- **O4 — the NE fire pocket**: zone-3 teaser, relocation, or removal? → **C1**
- **O5 — what happens to ArmySoldier?** D4 puts it *in scope* but does not say
  what it becomes: 18 spawns at cL18 with `xpFactor: 0` pay nothing and carry no
  nameplate — the world's largest block of high-level placements, currently
  invisible content. Deliberate front set-dressing, or an authoring miss that
  should start paying? → **C1**

---

## 7. Chunk breakdown — THREE chunks (re-decided 2026-08-06)

⚑ **This replaced a six-chunk split the same day.** The original cut the content
into four region-sized chunks (Zone 1 / the gates / Zone 2 / the front) on the
instinct that *"a band is only reviewable at the size you can walk"*. That
confused a **review** unit with a **session** unit. All four would have re-loaded
the same region map, the same band table, the same editor workflow and the same
walking method — so by the standing rule (*a chunk is a session; work that
profits from shared context belongs in one*) they are **one** chunk that walks
four times. D5 shrank it further by removing the front's re-tune entirely.
The old split is in §11.

The boundaries that survive are the two places where the **context genuinely
changes**: code-and-wire vs. decisions vs. execution.

### C0 — the honest plate (code; borrowed from `plan-xp-formula.md` D7)

Delete the client's frozen `DIFFICULTY_BANDS` copy (`client-data/Mobs.ts`),
ship `grayBase`/`grayStep` in `Welcome`, and derive the boundary client-side —
so *gray ⟺ pays nothing* becomes structural rather than coincidental.

⚑ **Why it is first, and why it is separate.** A re-placement pass is **walked
and eyeballed**, and the author's primary instrument is the nameplate colour of
the mob in front of them. Today the client's copy (−5) and the server's rule
(`5 + P/6`) diverge above player level ~6 — *exactly* the range the pass lives
in. **If the plates lie, the author cannot review their own work**, and D3's
"judgement per case" is unexercisable. It stays its own session because it
shares nothing with the content work: it is a FlatBuffers change with its own
mandatory gate and its own failure modes, not a JSON edit.

**Schema: FlatBuffers YES** (two scalars appended to `Welcome`) · DB none ·
content none. ⚑ **`hygiene-wire-prune` is MANDATORY here** — the project's
`.fbs` gate, which `mob-levels` C2 ran for its single appended field. It is
*not* required for C1 or C2, which touch no schema.

### C1 — the decisions: the region map, the bands, the catalog

The session where every judgement is made and nothing is placed. Four open items
close here, and it needs the PO in the loop for all of them:

1. **Ratify the region map** (**O2**) — §3.6 is a reconstruction, and regions
   exist in no file. ⛔ **The output must be a TOTAL PARTITION: every one of the
   423 combat spawns belongs to exactly one region, no gaps.** §3.6's boxes are
   not one — they leave **89 spawns in the seams** (Wolf ×29, Stag ×11,
   DireWolf ×10, GiantSpider ×5, …). A gappy map lets C2 close green with a
   fifth of the world still at its original `curveLevel`, and **§9's
   absent-stays-absent assert would not catch it** (that assert protects what
   the pass *meant* to leave alone, not what no chunk ever claimed).
2. **Ratify the band table** under D5's ~1–20 ceiling, checking the density
   rule at every rung: **if any level has exactly one place to be, the table is
   wrong.**
3. **The catalog fix (D4)** — re-author `curveLevel` for **Bear** (cL4 →
   effective ~7), **OrcGrunt** (cL20 → effective ~7) and **EliteBandit**
   (cL7 → effective ~11); rule **ArmySoldier** (**O5**).
4. **O3** (solo vs group gate parity) and **O4** (the NE fire pocket).

⚑ **The catalog edit must land before any placement, not after** (L6): a spawn
override is authored *relative to* the species' level, so re-levelling Bear
after placing Bears silently re-prices every placement made against the old
value. Within this chunk that is just ordering; across the C1/C2 boundary it is
the reason the boundary is where it is.

**Schema: content JSON YES** (`api/mobs/*.json`, ~4 files) · no `world.json` edit.

#### ⭐ Starting C1 cold — what to load, and what NOT to do

Written 2026-08-06, at the close of C0, for whoever opens this next.

**Load, in this order:** §3.6 (the reconstructed region map + the proposed
bands) · §3.1's difficulty grid and §3.2's by-level census · §5 (the
constraints the bands must respect) · §6 (the four questions, all ruled — read
what was ruled *and why*, since C1 executes them rather than re-opens them) ·
§10's landmines, especially **L1** (two channels for one fact), **L2** (the
stretched-kit illusion, which D3 deliberately left to judgement) and **L7**
(the two gates are parallel routes, not a ramp).

**⛔ C1 places nothing.** Its whole output is *decisions* plus the ~4-file
catalog edit. If the session finds itself opening the zone editor, it has
crossed into C2 — and L6 says that boundary exists precisely so the catalog
moves before anything is authored against it.

**The one deliverable that must be mechanical, not prose:** the region map has
to come out of C1 as something a script can evaluate — a rule that assigns
**each of the 423 combat spawns to exactly one region**. §9's coverage assert
is written against that, and a map that only exists as a paragraph cannot be
checked. §3.6's boxes leave 89 spawns unassigned; the fix is C1's, not C2's.

**C0 gave C1 an instrument, and it is worth one minute at the start:** the
nameplate now tells the truth about what a kill pays, so walking a region at a
cheated level *reads* the band. `XP <n>` to the level under discussion, then
look. ⚑ Confirm the boot log says `grayBase=5 grayStep=6` before trusting a
plate — C0's own verification narrowed that knob in `backend/conf.json`, which
is **gitignored** and therefore not restorable with `git checkout`.

**Nothing is blocked.** C0 shipped `7055aad4` with DB/content untouched, and
no `api/zones/*.json` or `api/mobs/*.json` has moved.

### C2 — the re-placement

All ~423 combat spawns, one session, one loaded context: the ratified map and
band table applied in the zone editor, then **walked region by region**, low to
high, with C0's honest plates as the instrument. Four walks, one session — the
walk is the review unit, not the commit unit.

Closes with §9's asserts, the roadmap's §3.4 wrong-example correction, and
`plan-mob-levels.md` moved to `docs/archive/` (its content half is discharged
here). The ledger must record what was **not** tuned, so `xp C2` inherits an
honest starting point — including §3.3's standing 21–30 gap.

**Schema: content JSON YES** (`api/zones/world.json`) · DB none · FlatBuffers
none · **Go none** (D5 removed it).

## 8. Schema impact (stated per the standing rule)

- **DB: NONE.** No persisted state is touched by a spawn's level.
- **FlatBuffers: YES — in C0 only.** Two scalars (`grayBase`, `grayStep`)
  appended to `Welcome`. Every other chunk is **NONE**: `Mob.level` already
  shipped at slot 24 with `mob-levels` C2, so the content chunks produce values
  for a wire field that exists. C0 must regenerate **both** binding sets
  together, per C2's precedent.
- **Content JSON: YES, and it is the whole point** — `api/zones/world.json`
  gains `level` keys on spawns (**C2**), and `api/mobs/*.json` gains ~four
  `curveLevel`/`xpFactor` edits (**C1**, per D4).
- **Go: NONE.** D1 would have moved `OrcWarlord`'s level; **D5 removed that**,
  so this pass touches no production Go at all.

---

## 9. Test strategy

- ⛔ **The COVERAGE assert — the one this pass cannot ship without.** Two
  counts, both required to be **0**: *(a)* combat spawns whose region is
  unresolved under the ratified map, and *(b)* per chunk, spawns inside that
  chunk's regions that still carry no decided level. Without it, the 89
  seam-dwellers of §3.6 survive every chunk untouched and the pass closes green
  while a fifth of the world never moved. **The absent-stays-absent assert below
  does not cover this** — it protects what the pass meant to leave alone, and
  says nothing about what no chunk ever claimed.
- **The absent-stays-absent assertion, reused.** `mob-levels` C3's most
  load-bearing test was that a *blank* level field exports **no key**. The same
  discipline applies here in reverse: a scripted diff must confirm that the
  **62 non-combat spawns** and every field other than `level` are
  byte-identical, or one edited region silently becomes a 485-line diff.
- **Boot the real content** — `-content ../api`, and match the boot-log census
  (15 factions / 87 skills / 65 mobs / 485 spawns / 5 campfires, 0 panics). A
  fractional or `0` level hard-fails `json.Unmarshal` at boot rather than
  reaching the loader's friendly `>= 1` (`plan-mob-levels.md` C3).
- **The campfire constraint needs an actual assert**, not a review pass —
  the nearest-hostile level within some radius of each of the 5 campfires.
- **Sim-harness support does not exist yet** — it is roadmap step 3, *after*
  this pass. So this pass is verified by **walking it** plus scripted structural
  checks, and the numeric calibration is explicitly deferred to `xp C2`. Say so
  in the ledger rather than implying the bands are tuned.

---

## 10. Landmines

- **L1 — the two-channel ambiguity.** `curveLevel` and spawn `level` can both
  express "how hard is this thing", and `plan-mob-levels.md` C1's own lesson was
  that two channels carrying one fact is a hazard. Q3/Q4 must produce a *rule*
  for which channel owns what, or the world drifts into a state where neither
  answers the question alone.
- **L2 — the stretched-kit illusion.** §3.5: a stretched species is a bullet
  sponge, not a harder fight. Filling a hole by stretching is cheap and can look
  finished while playing badly. ⚑ **D3 removed the guard rail on purpose** and
  delegated it to per-case judgement — which makes this the pass's most likely
  failure mode, and makes C0 (honest plates) load-bearing rather than nice.
- **L6 — the catalog must move BEFORE the placements.** A spawn override is
  authored relative to the species' level, so doing D4's re-levelling *after*
  placing those species silently re-prices every placement made against the old
  value. This is why C1 precedes C2 and is stated in C1's body as well.
- **L7 — the parallel gates can be sequenced by accident.** §3.6.1: the Dark
  Tunnel and the Bandit Horde are two routes to the same place. A band table
  that ramps one above the other converts a player *choice* into a *sequence*,
  and nothing in the data would flag it.
- **L3 — the campfire death loop.** §5, first bullet. Two of five fires are
  already in the high half.
- **L4 — the roadmap's example species are unplaced.** §3.4. Fixing what the
  roadmap names would produce a green pass that changes nothing in-game.
- **L5 — patrol routes cross bands.** §4.2.

---

## 11. Superseded

### D1 — "the world reaches 30, front-loaded" (ruled and superseded 2026-08-06)

> Bands run **1→20 across the open world** as today; **21→30 lives entirely in
> the Orc front + the warlord encounter**, as an endgame pocket. Rejected:
> capping at ~20 until a third zone exists, and lowering `maxLevel` to match the
> content. ⚑ **This moves `OrcWarlord`'s level, which is a Go edit**
> (`encounter/warlord.go`) — the boss is not in `world.json`. ⚑ **Costed in
> §3.6: the front as authored is 18 combat spawns.** Ten levels of endgame in 18
> spawns is ~1.8 spawns per level, against ~21 per level across the open world's
> 1→20. Either the front gains density in C5 or 21→30 is deliberately a *boss
> pocket* whose levels are earned by repetition rather than variety — **open,
> flagged in §3.6, ruled in C5**.

**Why it fell:** the costing above was the tell and the ruling did not follow it.
D5 took the density argument one step further — it is not just that the *front*
is thin for ten levels, it is that a **144 × 72 world is thin for thirty**. The
replacement keeps the band at the roster's current ~1–20 so that several regions
can be viable at the same level, and leaves 21–30 as a recorded gap (§3.3).

### The six-chunk split (decided and collapsed 2026-08-06)

> C0 honest plate → C1 regions + catalog → **C2 Zone 1 (1–9) → C3 centre + the
> two gates (8–13) → C4 Zone 2 (13–20) → C5 the front (21–30)** → C6 sweep.

**Why it fell:** C2–C5 were cut by *region*, on the reasoning that "a band is
only reviewable at the size you can walk". That is true — and it is a statement
about the **review** unit, not the **session** unit. All four would have
re-loaded the same region map, band table, editor workflow and walking method,
which is exactly the case the standing rule says belongs in one session. C6 was
bookkeeping with no context of its own, and C5 stopped existing when D5 removed
the front re-tune. The walk survives as four walks inside one chunk.

---

## 12. Chunk ledger

### C0 — the honest plate ✅ 2026-08-06, headless-verified, `7055aad4`

**What shipped.** The client's frozen copy of the gray rule is gone. `Welcome`
carries `gray_base`/`gray_step` (slots 6 and 7, appended — nothing renumbered,
both binding sets regenerated together per `plan-mob-levels.md` C2's precedent),
and `client-data/Mobs.ts` derives the boundary instead of owning a second one.
*Gray ⟺ this kill pays nothing* is now structural.

Measured at the real surface, one world, one run, player level 18
(`ZD(18) = 5 + ⌊18/6⌋ = 8`, so the server pays for anything above level 10):
the isolated **Marauder (cL12) plates GREEN and pays 222 XP**, while the **cL2
Boar 3.8 units away plates gray and pays 0**. **The deleted −5 rule grayed
both.**

⛑ **The tempting wiring is the wrong one, and a codec round-trip cannot tell
them apart.** `core.Config(config)` is already threaded into `NewGameWith`, so
reading `conf.Game.Player.KillXP` is one field access away — but
`curve.Normalized` falls each non-positive field back **per field**, so a conf
that omits the block (the live server's does, §35/L5) pays 5/6 while the raw
block reads **0/0**. Shipping the raw pair hands the client `ZD = 0` and grays
every mob below its level against a server still paying them: the exact
divergence C0 exists to delete, re-created inside the fix. The wire reads
`mob.KillXPConfig()`, and the pin that discriminates had to go through
`g.welcomeMsg` rather than through `codec` — a codec test passes identically
either way. *General shape: when a value has a normalizing accessor and a raw
source, a test that starts downstream of the choice cannot see the choice.*

⛑ **That pin also holds the BOOT ORDERING, which nothing else would.**
`g.welcomeMsg` is marshalled **once**, during construction, so the wiring is
only correct because `mob.SetKillXP` runs at `aurad.go:119` before
`NewGameWith` at `:148`. A reorder would ship defaults to every client while the
server kept paying the configured economy — silently, and with the boot log
still printing the right numbers.

⛑ **The vitest table found a real off-by-one at `ZD = 0`.** The obvious
condition `Δ <= -grayDistance(P)` reads `Δ <= 0` there and grays the *at-level*
mob; the server only ever consults the gray distance on its **below-you**
branch. Written as `difference < 0 && …`. The test found it because its oracle
is an independent mirror of `curve.Modifier` (clamps and `gray < 1 → 0`
included) asserting the **biconditional**, not a restatement of the client's own
arithmetic — an implementation that drifts from the server goes red even when it
is self-consistent.

⛑ **Gray branches FIRST; it did not become green's lower edge.** Folding it into
the ordered band list breaks at small `ZD`: `grayBase` is a conf knob the PO can
turn without a rebuild, and a narrow band pushes the boundary up into what the
list calls "even" — where a green lower edge would leave **yellow** plates
paying nothing. Verified live: at `grayBase: 2` the boundary is 13 and the
Marauder correctly plates gray.

⛑ **No client-side fallback pair, deliberately.** Hardcoding "5 and 6" as a
degrade path re-creates the frozen copy being deleted. The pre-Welcome window is
structurally empty — `Backend.ts:222` calls `startRendering(welcome)` before any
mob plate can exist.

⛑ **The plate cache needed reasoning, not a change** (C2's "two derived views,
two refresh disciplines" class). `Mobs.ts` early-returns on an unchanged
`plateDifference`, and the colour now also depends on `ZD(P)` — but `ZD` moves
only when P moves, and a ding changes `difference` for *every* mob, so the
existing guard always fires. Benign here; recorded because the same shape
shipped a half-fix in C2.

⛑ **The harness derives its expectations from `backend/conf.json`** — a
hardcoded table in the script would be a **third** frozen copy, and it would go
green against a client that merely swapped one constant for another. An early
draft hardcoded "the Marauder pays" and went red the instant the band was
narrowed: *a frozen expectation about the gray rule, inside the script written
to prove the client no longer holds one.* Both colour **and** pay are derived
now, and scored as separate legs (a recolour-only fix passes a combined one).

⚑ **The strongest evidence is the second run, and it is conf-only.**
`grayBase: 2` + restart, **no rebuild**: the same Marauder at the same player
level plates **gray and pays 0**. A boundary that tracks the server's conf
cannot be a client-side constant. ⚑ `backend/conf.json` is **gitignored** —
`git checkout` will not restore it; the 5 goes back by hand.

⚑ **Nothing about the band was tuned.** D8's A-vs-B (taper shape vs boundary
definition) stays with `xp C2`, per §12 of `plan-xp-formula.md`; the client now
simply tells the truth about whatever the server is paying. The `gray` seam
`plan-mob-levels.md` §8.2 opened is **closed by deletion, not by tuning**.

**Files.** `api/schema/server.fbs` · both regenerated binding sets
(`backend/pkg/api/AuraApi/Welcome.go`, `api/schema/js/aura-api/welcome.ts`) ·
`codec/server.go` · `core/game.go` · `client-data/Mobs.ts` ·
`WelcomeMessage.ts` · `core/logic/Game.ts`. New: `core/welcome_test.go`,
`client-data/Mobs.test.ts`, `.claude/skills/verify/c0-honest-plate.mjs`.

**Verified.** `tsc` clean · **vitest 235/235** (8 new; the ZD-0 case proven RED
first) · `go build`/`go vet` clean · full Go suite **53 packages, 0 FAIL** ·
`make -C backend db-test` green **uncached** against `aura_test` · boot
`-content ../api`: 15 factions / 87 skills / 65 mobs / 3 milestones / 10 recipes
/ 4 quests / 5 props / 777 props / 485 spawns / 5 campfires, **0 panics**, boot
log `grayBase=5 grayStep=6` · **`hygiene-wire-prune` clean** (637 sprites
decoded — the mandatory `.fbs` gate) · **`c0-honest-plate` 6/8, 0 FAIL, 0
console errors** (NEW, registered in the coverage map; the 2 INCONCLUSIVE are
wandering mobs missing from one sample frame — the venue's own tri-state) ·
**`c0-honest-plate c0-narrow` 6/8, 0 FAIL** (the conf probe) ·
**`npc-portraits` 4/4 plate-less, 0 console errors**.

⚑ **Two pre-existing reds, both proven against HEAD and neither caused here.**
`sys.TestDwell_TakeoffDropsAnInProgressCount` is **nondeterministic** —
A/B'd five runs each way, clean HEAD failed 4/5 and this tree 1/5, so it is a
flake in that test, not a regression (unowned; new). And **`c2-mob-level` scores
4/7 whether or not C0 is applied**: its SUBJECT half is fully green (plate text
and red tint both off the wire), while its CONTROL Stag — spawn 172, still an
authored Stag at (−66.36, 22.55) — simply is not alive or in view at run time,
with two Wolves 5 units away. **Venue rot in that script, not a product
failure**; it belongs to whoever next touches that row.

**Schema impact: DB NONE · FlatBuffers YES** (two appended scalars on `Welcome`)
**· content JSON NONE.** No `world.json` and no `api/mobs/*.json` were touched —
C1 owns the catalog and L6 requires it to precede any placement.
