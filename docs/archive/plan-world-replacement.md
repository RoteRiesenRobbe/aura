# Plan: The world re-placement pass — sensible level bands across `world.json`

> **Status: ✅ COMPLETE + ARCHIVED — C0 `7055aad4` + C1 `3df461a8` + C2, all
> three 2026-08-06, and the PO in-game walk the SAME DAY closed the one open
> item.** All 423 combat spawns carry a decided `level`, 27 stand under a
> different species, every scripted check is green (§12 C2), and the kiteability
> verdict C2 owed is now MADE.
>
> ⭐ **The PO walk, 2026-08-06 — verdict: "feels very good, I like it."** The
> seven reshaped speeds (§3.8) are **accepted provisionally**: they stand as
> shipped, remain `[PLACEHOLDER]`, and the PO expects deeper testing to surface
> individual-species tuning of **damage, HP, XP paid and speed** on feel. The
> cost asymmetry of those four knobs is recorded for whoever tunes next:
>
> - **`factors.speed`** and **`factors.xpFactor`** are cheap, feel-driven JSON
>   edits — speed is not in `PowerScale()` (§3.5) so it re-prices nothing, and
>   `xpFactor` moves only what a kill pays (though after `xp C2` calibrates, a
>   large xpFactor edit wants a calibration re-check).
> - **HP or damage** edits re-price every placement this pass made — that is
>   what **L6** protects — and can trip `TestGuardrails_ArchetypeTrade` (D6).
>   Mechanically still just JSON + restart, but each one deserves a look at
>   where the species stands, and ideally lands *before* `xp C2`'s calibration
>   or triggers a re-run of it.
>
> The second finding the same walk could have contradicted — the high half at
> **1.8–2.1 × a standard at-level fight** (low half 0.7–1.0 ×, §12 C2, part of
> it bought by **D12**) — drew no complaint on first impressions; it stays
> recorded as `xp C2`'s to read, not a defect.
>
> ⚑ **`plan-mob-levels.md` was archived first** (`docs/archive/`) — its only
> open item was the content half, and C2 placed it. With this walk, this plan
> archives too. **`xp C2` is the chain's only remaining step**, and it should
> read §12 C2 (the two recorded distortions) before calibrating anything.
>
> Design history, for context: designed 2026-08-06 (**D2–D5**, three chunks),
> **D5 superseded D1** the same day — the band stays the roster's current ~1–20
> and the top of difficulty is not retuned, because a 144 × 72 world is too
> small to spread 30 levels and still offer options per level range — and the
> **six-chunk split collapsed to three**, a *review* unit having been mistaken
> for a *session* unit (§7). Roadmap **step 2 of the XP-economy chain**, which
> `plan-xp-formula.md` §12 D9 named and no plan owned until this file.

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
  ⭐ **SUBSUMED BY D6 (2026-08-06).** D4 framed the fix as "re-author
  `curveLevel`", which measurement showed is not a relabel at all — see §3.8.
  The three species are now fixed *as derivations from D6's rule*, which is what
  the PO asked for when D4 came up in C1: *"different species should have
  different strengths and weaknesses without needing an individual override."*
- ⭐ **D6 — the archetype rule: the Wolf is the unit, and strengths must be
  paid for.** Ruled in C1, 2026-08-06. Every species' authored numbers are read
  as **ratios to a single reference mob** (Wolf: `baseMaxHealth` 55, 7.5 dps,
  `speed` 0.7, `aggroRadius` 3.0), and the guardrail is:

  > **A species above 1.5 × the unit's HP must pay with `speed` ≤ 0.8 × or
  > damage ≤ 0.8 ×.**

  Ratified **with a guardrail test** (`cmd/simharness/guardrail_test.go`), the
  8 current failures carried as a named exception list so it lands green. ⚑
  **Zero engine change, and that is a measured finding, not a scoping dodge** —
  `MaxHealth = baseMaxHealth × F(level)` and mob skill damage = `damageHP ×
  F(level)`, the same `F` on both sides, so a "level budget × species
  multiplier" model is *arithmetically identical* to what is authored today:
  `archetypeHP = baseMaxHealth / 55` exactly, at every level. Full derivation
  and the measured shape table: **§3.8**.
- **D7 — the two gates are level-equal-ish, group one band higher (O3).** Dark
  Tunnel and Bandit Horde **overlap**; the horde sits one band above the tunnel
  rather than after it. Rejected: §3.6's 9–13 / 13–17 ramp, which is L7 exactly
  — it converts a player *choice* into a *sequence* and leaves level 14 with one
  home. Rejected also: flat parity, which loses the nudge toward doing the solo
  route first.
- **D8 — the NE fire pocket STAYS, as the Zone-3 teaser (O4).** It keeps its
  18–20 siting beside the City Gates, giving the top rungs three places to go
  instead of one corridor. The tone exception (zones 1–2 carry no fire content)
  is **accepted deliberately** and recorded here so its survival is a decision,
  not an oversight. Rejected: deleting the 5 spawns, and re-skinning the pocket
  (new placement authoring, not a level edit).
- **D9 — the southern strip is NOT a region.** The 29 unassigned spawns at
  y ≥ +24 between the farm and the front dissolve into their northern
  neighbours; West wildlife, Kobold hideout and Mid road each run to y = +36.
  Rejected: naming it "South road" with its own band — an eleventh region the
  content pass never authored. ⚑ Consequence: `spawnpoint-3` lands in the
  Kobold hideout, see §3.7's L3 note.
- ⭐ **D10 — the ratified band table.** Ten regions, **≥ 2 homes at every rung
  from 2 to 20**:

  | region | band | | region | band |
  | --- | --- | --- | --- | --- |
  | Farm / start (SW) | **1–3** | | Dark Tunnel belt (N) | **10–14** ⟵ solo gate |
  | West wildlife | **2–6** | | Bandit horde / NE | **12–16** ⟵ group gate |
  | Dark forest (NW) | **4–8** | | East village + City Gates | **14–18** |
  | Kobold hideout | **6–10** | | NE fire pocket | **17–20** |
  | Mid road / centre | **8–12** | | The front (S) | **unchanged** (D5) |

  ⚑ **The table is exactly at budget** — 10 regions × ~4 rungs = 40 = 2 × 20 —
  so in C2 **every widening must be paid for by a narrowing.** Level 1 has one
  home (the farm) deliberately: it is the start, not a choice. §3.6's original
  proposal is superseded; it left levels 14, 16 and 17 (and 2 and 4) with a
  single home even after D7.
- ⭐ **D12 — East village + Gates goes PREDATOR-heavy, not bandit (§3.9's
  blocker).** Ruled in C2, 2026-08-06. The 26 Boar/DireWolf spawns that could
  not carry 14–18 are re-placed as **DireWolf → AlphaWolf → Bear → EliteWolf →
  DireBear**, one species per rung: the woods around the village have gone bad,
  and the village keeps its guarded-settlement reading. ⚑ **Rejected: the
  bandit-camp roster §3.9 nominated as the donor.** It is the obvious move —
  the horde is 10 species directly north, and the faction check clears it
  (`bandit` is `hostileTo: ["aligned"]` only, so bandits beside the CityGuard
  would *not* have produced NPC-vs-NPC combat, which was the thing worth
  checking). It was rejected on content grounds: it would have pitched a second
  bandit camp next to the city guard and given V a roster the player already
  met twice. ⚑ **One bandit spawn survives in V by design** — the Marauder at
  (32.68, 16.64) is the V→M **patroller**, and §4.2's per-route decision is
  that a patroller keeps its route and takes its spawn point's region. A scout
  on the road west is not a camp at the gate.
- ⭐ **D13 — the village livestock ring: prey within 10 units of the village
  fire keeps its native level.** Ruled in C2, 2026-08-06. `spawnpoint-2` (44,
  10.5) is the only bound respawn in the east and it sits *inside* a 14–18
  region; the **5 Boars** inside that radius stay at **cL2**, authored
  explicitly so they count as decided. ⚑ **This is a stated exception to D10,
  not a tolerance** — a region's band describes its content, and a hub's tame
  ring is content too. C0's honest plate is what makes it legible rather than
  confusing: those Boars plate **gray and pay 0** to anyone who can be standing
  there. ⚑ It is also why §9's campfire assert is **geometric**, not a level
  rule: the ring is the answer to "what stands next to a respawning player",
  and the assert measures reach, not rungs.
- ⭐ **D14 — the front's ADDS are made honest; its ceiling is not touched.
  AMENDS D5.** Ruled in C2, 2026-08-06. D5 said the front is not retuned, which
  left its 3 **Trolls standing at cL11 beside cL20 Orcs** — a plate that lies
  about the fight, which is exactly what C0 was built to end. They move to
  **17–18**. **Orc and OrcGrunt keep 20**, so the ceiling is where D5 left it.
  ⚑ **OrcGrunt is deliberately NOT lowered**, and §3.8 is the reason: it
  *passes* D6's archetype rule — 1.36 × HP, 1.33 × dps, 0.86 × speed, the
  world's widest aggro radius. A light, fast-aggroing add at the front's level
  is a correct **shape**, not a mis-priced one, and lowering it would have made
  the front easier, which D5 does forbid. §3.8's "that is a C2 question"
  resolves as *no change, with cause*.
- **D11 — ArmySoldier stays at `xpFactor: 0` (O5).** The 18 cL18 spawns are the
  friendly Human Army the content pass built to war with the orcs — deliberate
  set-dressing, not an authoring miss. They remain in the **62 non-combat** set,
  so §9's coverage assert keeps counting **423 / 62** and the
  absent-stays-absent assert stands as written. Rejected: making them pay (it
  would make farming your own allies profitable, and would have moved both
  asserts), and a plate-without-XP split (a code change — `xpFactor: 0` is what
  suppresses the nameplate today).

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

⭐ **RATIFIED IN C1, 2026-08-06 — see §3.7 for the authoritative map.** The
table below is the *original reconstruction* and is kept only because §3.7 is
expressed as a diff against it. It assigned **334 of 423** combat spawns; the
other 89 fell in the seams between the boxes.

| region | box (x, y) | spawns | cL today | proposed band |
| --- | --- | --- | --- | --- |
| Farm / start (SW) | −72…−44, +16…+36 | 25 | 1–2 | 1–3 |
| West wildlife | −72…−30, −8…+16 | 56 | 1–6 | 3–6 |
| Dark forest (NW) | −72…−38, −36…−8 | 21 | 2–5 | 5–8 |
| Kobold hideout | −30…−4, −8…+28 | 46 | 1–6 | 6–9 |
| Mid road / centre | −4…+24, −16…+28 | 54 | 1–6 | 8–12 |
| **Dark Tunnel belt (N)** | −38…+24, −36…−16 | 40 | 1–11 | 9–13 ⟵ solo gate |
| **Bandit horde / NE** | +24…+62, −28…−8 | 38 | 5–12 | 13–17 ⟵ group gate |
| East village + City Gates | +30…+72, −8…+24 | 31 | 1–12 | 15–18 |
| NE fire pocket | +60…+72, −36…−24 | 5 | 18–20 | 18–20 |
| **The front (S)** | +24…+72, +24…+36 | 18 | 11–20 | 18–20 — unchanged (D5) |

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
   in **C1** — ✅ **D8: it stays as the Zone-3 teaser.**

### 3.7 ⭐ The ratified region map — a TOTAL PARTITION (C1, 2026-08-06)

**This is the authoritative map. §9's coverage assert is written against it.**

O2 asked for a rule a script can evaluate that assigns **each of the 423 combat
spawns to exactly one region**. §3.6's boxes were not one. The fix keeps every
shape the reconstruction got right and makes the boxes **tile**: a
priority-ordered rectangle list over the full 144 × 72 bounds, **first match
wins**. Measured: **423 / 423 assigned, 0 unresolved, 0 ambiguous.**

```
#   region                  x0    x1     y0    y1
1   The front (S)           +24   +72    +24   +36
2   NE fire pocket          +60   +72    −36   −24
3   Dark forest (NW)        −72   −38    −36    −8
4   Dark Tunnel belt (N)    −38   +40    −36   −16
5   Bandit horde / NE       +40   +72    −36    −8
6   Bandit horde / NE       +24   +40    −28    −8
7   Farm / start (SW)       −72   −44    +16   +36
8   West wildlife           −72   −30    −16   +36
9   Kobold hideout          −30    −4    −16   +36
10  Mid road / centre        −4   +30    −16   +36
11  East village + Gates    +30   +72     −8   +24
```

Rendered at §3.1's cell size (3 × 4 units), one character per region:

```
       x=-72                                          x=+72
 -34.0 DDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTBBBBBBBPPPP
 -30.0 DDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTBBBBBBBPPPP
 -26.0 DDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTBBBBBBBPPPP
 -22.0 DDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTBBBBBBBBBBB
 -18.0 DDDDDDDDDDDTTTTTTTTTTTTTTTTTTTTTTTTTTBBBBBBBBBBB
 -14.0 DDDDDDDDDDDWWWKKKKKKKKKMMMMMMMMMBBBBBBBBBBBBBBBB
 -10.0 DDDDDDDDDDDWWWKKKKKKKKKMMMMMMMMMBBBBBBBBBBBBBBBB
  -6.0 WWWWWWWWWWWWWWKKKKKKKKKMMMMMMMMMMMVVVVVVVVVVVVVV
  -2.0 WWWWWWWWWWWWWWKKKKKKKKKMMMMMMMMMMMVVVVVVVVVVVVVV
   2.0 WWWWWWWWWWWWWWKKKKKKKKKMMMMMMMMMMMVVVVVVVVVVVVVV
   6.0 WWWWWWWWWWWWWWKKKKKKKKKMMMMMMMMMMMVVVVVVVVVVVVVV
  10.0 WWWWWWWWWWWWWWKKKKKKKKKMMMMMMMMMMMVVVVVVVVVVVVVV
  14.0 WWWWWWWWWWWWWWKKKKKKKKKMMMMMMMMMMMVVVVVVVVVVVVVV
  18.0 FFFFFFFFFWWWWWKKKKKKKKKMMMMMMMMMMMVVVVVVVVVVVVVV
  22.0 FFFFFFFFFWWWWWKKKKKKKKKMMMMMMMMMMMVVVVVVVVVVVVVV
  26.0 FFFFFFFFFWWWWWKKKKKKKKKMMMMMMMMMRRRRRRRRRRRRRRRR
  30.0 FFFFFFFFFWWWWWKKKKKKKKKMMMMMMMMMRRRRRRRRRRRRRRRR
  34.0 FFFFFFFFFWWWWWKKKKKKKKKMMMMMMMMMRRRRRRRRRRRRRRRR
```

| | region | spawns (Δ vs §3.6) | cL today |
| --- | --- | --- | --- |
| F | Farm / start (SW) | 25 (+0) | 1–2 |
| W | West wildlife | 74 (+18) | 1–6 |
| D | Dark forest (NW) | 21 (+0) | 2–5 |
| K | Kobold hideout | 65 (+19) | 1–6 |
| M | Mid road / centre | 90 (+36) | 1–11 |
| T | Dark Tunnel belt (N) | 50 (+10) | 1–12 |
| B | Bandit horde / NE | 44 (+6) | 5–12 |
| V | East village + City Gates | 31 (+0) | 1–12 |
| P | NE fire pocket | 5 (+0) | 18–20 |
| R | The front (S) | 18 (+0) | 11–20 |

**The 89 seam-dwellers decomposed into four pieces of edge arithmetic and one
real design question** — which is why O2 was one decision, not eighty-nine:

- **29 spawns** in y ≥ +24, x −44…+24 — a *genuinely unnamed* region between
  the farm and the front, holding `spawnpoint-3` and the Wanderer NPC. ⭐ **D9:
  it is NOT a region.** The strip dissolves into whatever borders it to the
  north — West wildlife, Kobold hideout and Mid road each extend their south
  edge to y = +36. Rejected: naming it "South road" with its own band, which
  would have been an eleventh region the content pass never authored.
- **21** in the x +24…+30 seam (Mid road's east edge 24 → 30).
- **19** in the north strip y < −28, x ≥ +24 — split at x = +40: the 8 spiders
  east of the Tunnel's mouth join the **Tunnel belt** (its east edge 24 → 40),
  the 5 Marauders beyond join the **Bandit horde**.
- **17** in the y −16…−8 seam (West wildlife and Kobold north edge −8 → −16).
- **6** in the west y +16…+24 seam, and **1** stray AlphaWolf at (63.0, −20.1)
  in the NE corner (Bandit horde's east edge 62 → 72).

⚑ **L3 moved as a result.** §5 assessed the campfire constraint against
*current* cL and treated `spawnpoint-3` (−16.47, +31.53) as safe. It was never
in a region at all. Under the ratified map it lands in the **Kobold hideout**,
and `spawnpoint-4` and `-5` both land in the **Dark Tunnel belt** — so **four of
five bound fires are in mid or high bands**, not two. The death-loop check is a
C2 walk item for all four, not a review-pass afterthought.

### 3.8 ⭐ The archetype rule — measured (C1, 2026-08-06; the evidence for D6)

D4 came into C1 as "re-author `curveLevel` on three species". It leaves as a
different thing entirely, because the first measurement contradicted the
premise.

**The Bear is already exactly what the design wants.** The PO's spec, stated in
C1 verbatim, was *"bears should be more tanky than a wolf, hit about as strong
as a wolf, but should be slower"*:

| | Wolf | Bear | ratio |
| --- | --- | --- | --- |
| `baseMaxHealth` | 55 | 192 | **3.49 ×** |
| dps | 7.5 (6 dmg / 24 ticks) | 8.0 (16 dmg / 60 ticks) | **1.07 ×** |
| `speed` | 0.7 | 0.4 | **0.57 ×** |
| `aggroRadius` | 3.0 | 2.4 | 0.80 × |

So the authoring model **already** expresses per-species strengths and
weaknesses with no per-instance override. Nothing needed building.

⚑ **And an explicit "budget × archetype" engine model would change nothing.**
`MaxHealth = baseMaxHealth × PowerScale()` and the SkillSystem multiplies
HP-valued skill output by the same `PowerScale() = F(level)`. The level factor
therefore **cancels in the ratio**: `archetypeHP = base × F(L) / (55 × F(L)) =
base / 55`, identically at every level. Storing budgets and multipliers would
rename fields and produce the same numbers a player meets. *Verified in code,
not assumed* — this is why D6 carries no engine change.

**What was actually missing: a written reference unit.** Without one, nobody
knew what 1.0 was, and species drifted into strengths with nothing paying for
them. Measured across all 26 placed species, as ratios to the Wolf:

```
  HPx  DPSx  spdx aggro |  cL tier      n  species
 8.18  0.47  0.64   3.6 |  20 elite     1  GreaterFireElemental
 7.64  5.49  0.71   3.6 |  20 elite    12  Orc
 5.89  1.75  0.93   3.6 |   7 elite     1  EliteBandit    FAIL
 5.16  1.07  0.57   3.6 |   7 normal    6  DireBear
 4.80  1.12  1.07   3.6 |   5 elite     7  EliteWolf      FAIL
 3.55  1.80  1.31   3.0 |  12 normal   10  Marauder       FAIL
 3.49  1.07  0.57   2.4 |   4 normal    9  Bear
 3.31  1.90  1.36   3.0 |   9 normal    5  GiantSpider    FAIL
 3.31  1.76  0.64   3.6 |  11 elite     6  Troll
 3.00  0.47  0.79   3.6 |  18 normal    4  FireElemental
 2.95  1.00  1.36   3.6 |  10 normal    8  AlphaWolf      FAIL
 2.29  1.00  1.26   3.6 |   6 normal   42  DireWolf       FAIL
 1.96  1.80  0.93   3.0 |   5 normal   21  Bandit         FAIL
 1.75  0.60  0.79   3.6 |   6 normal    3  BanditPyromancer
 1.75  0.00  0.64   4.5 |   6 normal    1  RallyDrummer
 1.53  0.93  1.00   2.4 |   4 normal   15  Spider         FAIL
 1.36  1.33  0.86   5.4 |  20 normal    3  OrcGrunt
 1.31  0.40  0.86   2.4 |   4 normal    6  VenomSpider
 1.20  0.00  0.86   3.6 |   5 normal    3  BanditHealer
 1.09  0.80  0.79   1.5 |   2 normal   66  Boar
 1.09  0.67  0.86   3.6 |   5 normal    4  BanditRanged
 1.00  1.00  1.00   3.0 |   2 normal  121  Wolf   <- the unit
 0.82  1.07  0.86   3.0 |   3 normal   20  Kobold
 0.73  0.47  0.79   3.6 |   3 normal    6  KoboldRanged
 0.64  0.30  1.21   1.5 |   1 normal   37  Stag
 0.36  0.00  0.00   0.0 |   1 normal    6  Turnip
```

*(DPSx sums `damage_aura` + `dot_aura` `damageHP` per second and multiplies
`maxTargets` in — which is why Orc's 3-target cleave reads 5.49 ×. Support mobs
legitimately read 0.00. It is a dial, not a TTK.)*

**DireWolf is the clearest failure: 2.29 × a Wolf's HP, the same damage, and
*faster*.** That is not a different shape, it is a bigger Wolf — and there are
42 of them.

⛔ **Two rule formulations were tried and rejected; both are recorded because
each looks right until it is measured.**

1. **`HPx × DPSx ≤ a per-tier cap`, with `curveLevel` derived as the smallest
   level at which a species fits its budget.** Attractive because it makes the
   level a *formula* rather than a judgement — exactly what the PO asked for.
   It **over-determines the system**: the product measures *how big is this
   fight relative to a standard mob of the same level*, which is a statement
   about the ladder, not about shape. Capping it forces the level up to shrink
   it, and the derivation pushed **Orc → cL32 and GreaterFireElemental → cL33**,
   straight through D5's ~1–20 band. *One rule was answering two questions —
   which is **L1** in this plan's own landmine list.*
2. **`min(HPx, DPSx, speedx) ≤ 0.8` over every axis.** Flags **the Wolf itself**
   (all axes exactly 1.00) and **Kobold** (0.82 / 1.07 / 0.86 — a species
   *weaker* than the unit overall, whose mild glass-cannon trade is real). A
   rule that fails its own reference point is the wrong rule.

⭐ **What survives is scoped to the strong axis**, which is the PO's Bear spec
generalised: *above 1.5 × HP → pay with speed ≤ 0.8 × or damage ≤ 0.8 ×.* It
flags the **8** species marked FAIL above and passes Bear, DireBear, Troll, Orc,
GreaterFireElemental, FireElemental, BanditPyromancer and RallyDrummer — every
one of which already pays. It is a pure function of the authored JSON and it
**never touches `curveLevel`**, so D5's band is untouched by construction.

⚑ **The 8 are a BALANCE change, not a relabel** — reshaping DireWolf (× 42) or
Bandit (× 21) moves fights that the standing **TTK 6.67 s / TTD 8.70 s** locks
and `cmd/simharness/guardrail_test.go` are measured against.

#### ✅ The sweep, executed in C1 (PO: "do it now") — 7 reshaped, 1 exempted

All seven pay with **speed**, which is the axis the PO named for the Bear and
the only one that moves neither HP nor damage:

| species | `speed` | spdx | n |
| --- | --- | --- | --- |
| DireWolf | 0.88 → **0.55** | 1.26 → 0.79 | 42 |
| Bandit | 0.65 → **0.55** | 0.93 → 0.79 | 21 |
| Spider | 0.70 → **0.55** | 1.00 → 0.79 | 15 |
| Marauder | 0.92 → **0.50** | 1.31 → 0.71 | 10 |
| AlphaWolf | 0.95 → **0.50** | 1.36 → 0.71 | 8 |
| EliteWolf | 0.75 → **0.52** | 1.07 → 0.74 | 7 |
| EliteBandit | 0.65 → **0.52** | 0.93 → 0.74 | 1 |

⛑ **`WolfBite` is shared by Wolf, DireWolf and AlphaWolf, so damage was never
available to two of them** — a damage payment would have moved **the unit
itself**, and the unit has 121 spawns. (`BanditBlades` is likewise shared by
Bandit and Marauder; both fail, so it would have been survivable there, but the
wolves settled the choice for the whole set.)

⛔ **GiantSpider could not pay on ANY axis and is exempted, with cause.** It is
the one real conflict between D6 and a prior PO-directed pass:

- **speed** is pinned **above 0.9** by `TestMobSpecOf_GiantSpiderCarriesBiteAndVenom`
  — *"it must out-walk the player to land any of it"*. Its whole payload is a
  chase.
- **HP** was tried: `baseMaxHealth` 182 → 80 (HPx 1.45, under the threshold).
  **Measured: facetank survival 0 % → 100 %**, and it dropped out of the farm
  band's hard normals — undoing the Z2/farm-hardening pass that this very
  guardrail's band comment credits it with. Reverted.
- **damage** lands in the same place, harder.

So it is a deliberate outlier — fast, tanky *and* hard-hitting, by ruling —
recorded in `archetypeExempt` rather than reshaped.

⛑ **The facetank battery is STRUCTURALLY BLIND to this change, and that is a
finding, not a pass.** Baseline and post-change survival are **identical on all
seven** (DireWolf 62 % → 62 %, Spider 100 % → 100 %, the other five 0 % → 0 %),
because at the guardrail's 0.5-unit start distance the mob is already inside
aura range — approach time never enters the model. So the locks are unmoved
*structurally*, which proves the change is safe and proves nothing about whether
it is good. **Speed's real effect is escapability**, and the only instrument for
that is an in-game pass. ⚑ The `-levels` battery is likewise independent: it
runs a synthetic reference mob, so TTK 6.67 s / TTD 8.70 s cannot move on a
catalog edit at all.

⚑ **OrcGrunt resolves differently under D6 and must not be a C2 surprise.**
1.36 × HP, 1.33 × dps, 0.86 × speed, and the **widest `aggroRadius` in the world
at 5.4** — a light, fast-aggroing add. It **passes** the rule: it is correctly
*shaped*. What is wrong is its **placement** — a cL20 label on a light add
standing in the front. That is a C2 question (per-spawn `level`), not a catalog
one, and §3.4's framing of it as a catalog offender is superseded.

### 3.9 ⚑ D10 is dense but not everywhere FEASIBLE — three thin regions (C1)

Density (≥ 2 homes per rung) is a property of the *table*. Feasibility is a
property of the **roster inside each region**, and D10 was checked for the first
and not the second. Measured, band by band:

| region | band | rungs | distinct species | spawns | worst stretch |
| --- | --- | --- | --- | --- | --- |
| Farm / start | 1–3 | 3 | 4 | 25 | +2 |
| **West wildlife** | 2–6 | 5 | **4** | 74 | +5 |
| **Dark forest** | 4–8 | 5 | **4** | 21 | +6 |
| Kobold hideout | 6–10 | 5 | 6 | 65 | +9 |
| Mid road / centre | 8–12 | 5 | 13 | 90 | +11 |
| Dark Tunnel belt | 10–14 | 5 | 11 | 50 | +13 |
| Bandit horde | 12–16 | 5 | 10 | 44 | +11 |
| **East village + Gates** | 14–18 | 5 | **6** | 31 | **+17** |
| NE fire pocket | 17–20 | 4 | 2 | 5 | +2 |
| The front | unchanged | — | 3 | 18 | — |

⛔ **East village + City Gates is the blocker: 26 of its 31 spawns are Boar
(cL2) and DireWolf (cL6), asked to carry 14–18.** A Boar placed at 18 is a
**516 HP** healthbar with a level-2 moveset, a level-2 aggro radius and a
level-2 bite — **L2 firing at full strength**, on the region a player reaches
last. West wildlife (73 of its 74 spawns are Wolf / Stag / Boar across 5 rungs)
and the Dark forest (Wolf ×12 stretched to 8) are the same defect, milder.

⭐ **This is a C2 instruction, not a D10 defect.** C2 is a re-**placement** pass,
not only a re-levelling one (§1) — so the fix is to *move* species into the thin
regions, not to stretch the ones already there. The bandit-camp roster is the
obvious donor: the Bandit horde carries 10 distinct species across 44 spawns and
sits directly north of the village. **Record the outcome either way** — if C2
closes with a Boar standing at 18, this section is the evidence that it was
known and chosen.

### 3.10 ⭐ The placement, as executed (C2, 2026-08-06)

**This is the authoritative table.** It ships as `scripts/world-place.py`, which
also produces the listing below — the two cannot drift, the same discipline
§3.7 and `world-regions.py` established.

⚑ **Three rules, and only three.** The judgement is in the table; nothing else
invents a number.

- **R1 — within a region, rungs ascend by HPx** (D6's archetype ratio,
  `baseMaxHealth` / 55). The plate then tracks the fight.
- **R2 — a species given a multi-rung range spreads its spawns evenly across
  those rungs, ordered by distance from the START FIRE** (`spawnpoint-1`,
  −58.2/+24). One world-wide geometric axis, so no region has to defend a
  difficulty direction of its own, and it is the same axis §3.1 measured as the
  world's existing west→east gradient.
- **R3 — when a region sheds a species it sheds the instances FARTHEST from the
  start fire**, and the freed points go to the incoming species deepest-first.
  A species retreats toward home; what replaces it arrives from away.

⛑ **The rung is nearly cosmetic next to the species choice, and that is why
this is a re-PLACEMENT pass.** A 5-rung band is `1.12⁴` = **1.57 ×** wide. The
roster's HPx spans **0.64 → 8.18**, a 9 × range. So which species stands in a
region decides its difficulty by roughly an order of magnitude more than which
rung that species takes — the levels mostly make the plate and the XP honest.
This is the measured form of §3.9's instruction and it is why stretching would
not have worked even if L2 were free.

```
  F  band 1-3         L1  Turnip x6  Stag x2
                      L2  Boar x10
                      L3  Wolf x7
  W  band 2-6         L2  Stag x16
                      L3  Wolf x38
                      L4  Boar x14
                      L5  DireWolf x4
                      L6  Bear x2
  D  band 4-8         L4  Wolf x7
                      L5  Spider x3
                      L6  DireWolf x3
                      L7  Bear x5
                      L8  EliteWolf x3
  K  band 6-10        L6  KoboldRanged x6  Stag x5
                      L7  Kobold x20
                      L8  Wolf x19  Boar x9
                      L9  DireWolf x4
                      L10 AlphaWolf x2
  M  band 8-12        L8  Wolf x26  Stag x11
                      L9  Boar x15  BanditRanged x2  BanditHealer x1
                      L10 Bandit x10  BanditPyromancer x1  RallyDrummer x1
                      L11 DireWolf x11  AlphaWolf x3
                      L12 DireBear x4  Bear x3  Troll x2
  T  band 10-14       L10 Wolf x12  Stag x1
                      L11 Spider x7  VenomSpider x6  Boar x5
                      L12 Spider x7  DireWolf x3
                      L13 AlphaWolf x1  Troll x1  Bear x1
                      L14 GiantSpider x5  Marauder x1
  B  band 12-16       L12 Bandit x6  BanditRanged x2  BanditHealer x2
                      L13 Bandit x5  DireWolf x5  BanditPyromancer x2
                      L14 DireWolf x5  AlphaWolf x4
                      L15 Marauder x8  EliteWolf x3
                      L16 DireBear x1  EliteBandit x1
  V  band 14-18       L2  Boar x5           <- the D13 livestock ring
                      L14 DireWolf x8
                      L15 AlphaWolf x6
                      L16 Bear x5  Marauder x1
                      L17 EliteWolf x3
                      L18 DireBear x3
  P  band 17-20       L17 FireElemental x2
                      L18 FireElemental x1
                      L19 FireElemental x1
                      L20 GreaterFireElemental x1
  R  band unchanged   L17 Troll x2
                      L18 Troll x1          <- D14, the adds made honest
                      L20 Orc x12  OrcGrunt x3
```

**27 spawns changed species** — W 5, D 5, K 2, V 15. Every band rung from 1 to
20 has a tenant, and **every region fills every rung of its own band**.

⚑ **But "has a tenant" is not "is populated", and the top of the band is thin.**
Spawns per rung, measured:

```
  L1   8   L5   7   L9  22   L13 15   L17  7
  L2  31   L6  16   L10 27   L14 23   L18  5
  L3  45   L7  25   L11 32   L15 17   L19  1
  L4  21   L8  68   L12 29   L16  8   L20 16
```

⛔ **Rung 19 holds exactly ONE spawn in the entire world** — a single
FireElemental — because P is the only region whose band reaches it (D8 sites it
at 17–20) and P has five spawns in total. **L20's 16 are 12 Orcs, 3 OrcGrunts
and the Greater Fire Elemental**, i.e. the front and the teaser, not a farmable
rung. This follows from D10 + D8 + D5 rather than from anything C2 chose, but
the shape is what matters: **the dense world is 1–16**, and above that it is a
boss camp and a Zone-3 teaser. `xp C2` must not read the rung table as uniform.

⛑ **The re-skins introduce NO new species to the world** — every arrival
(DireWolf, Bear, Spider, AlphaWolf, EliteWolf, DireBear) was already placed
somewhere. §3.9 asked for a re-placement, and a re-placement is what this is;
authoring new mobs would have been a different plan.

⛔ **The three regions §3.9 flagged, resolved:**

- **East village + Gates** — D12, above. 15 spawns re-skinned, 26 → 5 wildlife.
- **West wildlife** — 5 of its 43 Wolves become 3 DireWolf + 2 Bear, which
  gives rungs 5 and 6 a tenant. 38 Wolves is still far above the 8 that
  `wolves-on-the-road` needs.
- **Dark forest** — 5 of its 12 Wolves become 3 DireWolf + 2 Spider, filling
  rungs 5 and 6. **Kobold hideout** needed the same treatment for rung 9–10 (2
  Wolves → AlphaWolf), which §3.9's table did not flag.

### 3.11 ⚑ What C2 did NOT tune — read this before `xp C2`

- **Nothing about mob SPEED was measured.** §3.8's seven reshaped species went
  into this walk untested and come out of it untested by any battery; the walk
  is qualitative. **DireWolf 0.88 → 0.55 across 42 spawns** is still the open
  one. C2 did **not** re-tune any `factors.speed` — the sequencing note is that
  it safely could have (speed is not in `PowerScale()`, §3.5), where an HP or
  damage edit would have re-priced every placement this pass just made. That is
  what **L6** actually protects.
- **`respawnTicks` and `wanderRadius` are UNCHANGED** (§4.3). A higher-level
  region arguably wants slower respawns; nothing in this pass tested that, and
  the diff guard asserts they did not move.
- **The 27 re-skinned points keep their authored `wanderRadius` /
  `idleSpeedFactor`.** They are properties of the *spot* (how much room is
  there), not of the species, so they carry — but 18 of the 27 have one, and if
  a re-skinned Bear feels oddly leashed, that is where to look.
- **`api/zones/proving-grounds.json` is untouched**, per §4.5, as a decision.
- **Levels 21–30 are still empty**, per D5/§3.3, and the world's ceiling is
  exactly where C1 left it.

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
  authored anywhere. → ✅ **RULED in C1, 2026-08-06: §3.7**, a total partition,
  423 / 423 assigned. Plus **D9** on the southern strip.
- **O3 — solo vs group gate parity**: should the Bandit Horde be flatly harder
  than the Dark Tunnel, or level-equal with a difficulty difference that comes
  from the pack composition alone? → ✅ **RULED: D7** — overlapping, group one
  band higher.
- **O4 — the NE fire pocket**: zone-3 teaser, relocation, or removal? → ✅
  **RULED: D8** — it stays.
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

⚑ **C1 ran 2026-08-06 and is PARTLY DONE — see the running note at the end of
this entry before starting anything.** Items 1 and 4 are closed (§3.7, D7–D9),
item 3 was replaced by **D6 + §3.8**, and item 2 (the band table) plus **O5**
are still open.

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

#### ⭐ C1 running note — 2026-08-06, session 1 (decisions taken, no files but
this one changed yet)

**Closed:** O2 → **§3.7** (the ratified total partition, 423 / 423) ·
**D9** (no South road) · **O3 → D7** · **O4 → D8** · and D4 was **subsumed by
D6** after measurement, with the whole derivation in **§3.8**.

Also closed: **item 2 → D10** (the band table, ratified — §3.6's version
superseded because it left levels 14, 16 and 17 with one home even under D7) and
**O5 → D11** (ArmySoldier stays at `xpFactor: 0`, so the 423 / 62 split and both
§9 asserts stand unchanged).

**Verified, not assumed:** the rectangle list **as transcribed into §3.7** was
read back out of this file and re-run against `world.json` — **423 / 423, 0
unassigned, 0 ambiguous**, and the per-region counts match §3.7's table exactly.
A transcription slip there would be invisible and it is the input to §9's
coverage assert.

⚑ **One thing D10 does not cover, found after ratification: §3.9.** Three
regions are **dense but not feasible** — East village + Gates is banded 14–18
with 26 of its 31 spawns being Boar (cL2) and DireWolf (cL6). C2 must **move**
species there, not stretch the ones present.

⛔ **Every DECISION C1 owed is taken, and the execution half is DONE too** —
the PO ruled *"do it now"* on the reshaping rather than deferring it:

1. ✅ **The rule is written down and enforced.** The unit + trade rule are in
   `manual-content-authoring.md` §1 (the mob-authoring checklist), and
   **`TestGuardrails_ArchetypeTrade`** in `cmd/simharness/guardrail_test.go`
   asserts the **whole 65-entry catalog** — proven RED first, naming exactly
   §3.8's eight.
2. ✅ **§3.7's partition is a runnable script**, `scripts/world-regions.py` —
   §9's coverage assert half (a), exit 1 on any unresolved spawn. It also
   renders §3.7's grid (so the doc and the rule cannot drift silently) and
   carries half (b), `--levels`, which C2 has to drive to 0. Today: **423/423
   resolved · 0/423 levelled**, which is exactly right — *C1 places nothing.*
3. ✅ **The sweep: 7 reshaped, 1 exempted with cause.** Full table, the shared-
   skill constraint that forced the choice of axis, and the GiantSpider
   conflict: **§3.8**.

⚑ **L6 is satisfied**: the catalog moved *before* any placement, so C2's band
judgements will be made against numbers that no longer shift under them.

⛑ **What C1 could NOT verify, stated so C2 does not inherit it as an
assumption:** the reshape is invisible to every battery the project has — the
facetank leg starts at 0.5 units (approach time never enters it) and the
`-levels` battery runs a synthetic mob. **Seven species just became markedly
more kiteable and nothing measured it.** That is an in-game pass, and it is the
first thing C2's walk should be looking at.

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

#### ⭐ Starting C2 cold — what to load, what to run, what NOT to do

Written 2026-08-06 at the close of C1 (`3df461a8`), for whoever opens this next.
**C2 is the last chunk of this plan.**

**Run this FIRST — it is one command and it orients the whole session:**

```
python3 scripts/world-regions.py --grid --levels
```

It prints the ratified region map (§3.7), the D10 band per region, and — the
number that IS C2's progress bar — **how many spawns in each region still carry
no `level`**. At C1's close: **423/423 resolved, 0/423 levelled.** C2 is done
when that second number is 423 and the coverage assert still exits 0.

**Load, in this order:** **§3.7** (the ratified partition — the rectangle list
is the same fact as the script, edit both or neither) · **D10 in §2** (the band
table) · **§3.9** ⛔ *read this before placing anything* · **§3.8's tail** (what
the catalog sweep did and, more importantly, what could not be measured) ·
**§5** (the campfire constraint) · **§4** (what a `world.json`-only edit would
miss — patrol routes, `respawnTicks`, the 62 non-combat spawns) · **§10's
landmines**, especially **L2** and **L3**.

**⛔ The three things most likely to go wrong, in order:**

1. **East village + Gates is banded 14–18 and 26 of its 31 spawns are Boar
   (cL2) and DireWolf (cL6)** — §3.9. A Boar at 18 is a 516 HP healthbar with a
   level-2 moveset on the region a player reaches *last*. **Move species in;
   do not stretch what is there.** C2 is a re-*placement* pass, and the Bandit
   horde (10 distinct species, 44 spawns, directly north) is the donor. West
   wildlife and the Dark forest are the same defect, milder.
2. **Seven species are markedly more kiteable than the last time anyone played
   this world**, and no battery in the project can see it (§3.8). DireWolf
   0.88→0.55 is the big one — 42 spawns, the world's most common mid mob.
   **The walk is the only instrument.** If they now feel like non-threats,
   that is C2's finding to make and the speeds are `[PLACEHOLDER]`.
3. **Four of the five bound campfires sit in mid or high bands** (§3.7's L3
   note) — `spawnpoint-3` in the Kobold hideout, `-4` and `-5` in the Dark
   Tunnel belt, `-2` in the village. §5 calls the death loop a hard constraint,
   and §9 wants an actual assert, not a review pass.

**The instrument, and check it before trusting it:** C0's nameplates are honest
now, so walking a region at a cheated level *reads* the band (`XP <n>`, then
look). ⚑ Confirm the boot log says **`grayBase=5 grayStep=6`** — verified in the
right state at C1's close, but `backend/conf.json` is **gitignored**, so
`git checkout` will not restore it if a probe moves it.

**Two workflow facts inherited from `plan-mob-levels.md` C3, both of which cost
that session time:** the zone editor is mounted by **`&textures`**, not
`&develop` (a `&develop`-only URL leaves every `#zoneEditor_*` id out of the
DOM, which reads exactly like "the field was never added"), and the editor's
zone JSON is **webpack-bundled, not fetched** — a hand-authored change needs
`npm run build`, the opposite of a server-restart probe.

**⛔ Do not re-open C1's rulings.** D6–D11 are taken and the catalog has already
moved (L6). If C2 finds a band genuinely unworkable, **amend D10 explicitly in
§2** and say why — but note the table is **exactly at budget** (10 regions ×
~4 rungs = 40 = 2 × 20), so every widening has to be paid for by a narrowing or
some rung drops to a single home.

**What C2 closes with:** §9's asserts (coverage + absent-stays-absent over the
**62** non-combat spawns, which D11 kept at 62) · the roadmap's §3.4
wrong-example correction (AngryMammoth / SaberToothCat / ProvingBoss are
unplaced; the live offenders were D6's eight) · `plan-mob-levels.md` moved to
`docs/archive/` · **this plan archived too** · and a ledger that states plainly
what was **not** tuned, so `xp C2` inherits an honest starting point —
including §3.3's standing 21–30 gap.

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

### C1 — the decisions, and the archetype rule ✅ 2026-08-06, verified, `3df461a8`

**Every decision C1 owed is taken, and the catalog half is executed** (the PO
ruled *"do it now"* rather than deferring the sweep). **C2 is the only chunk
left.**

**PO rulings — D6–D11** (full text in §2, evidence in §3.7–§3.9):

- **D6 — the archetype rule.** The Wolf is the unit (55 HP / 7.5 dps / speed 0.7
  / aggro 3.0) and **a species above 1.5 × the unit's HP must pay with speed
  ≤ 0.8 × or damage ≤ 0.8 ×.** ⭐ **This SUBSUMED D4**, which had framed the fix
  as "re-author `curveLevel`" — measurement showed that is not a relabel at all.
- **D7** the two gates overlap, group one band higher (Tunnel 10–14 / Horde
  12–16) · **D8** the NE fire pocket stays as the Zone-3 teaser · **D9** the
  southern strip is not a region · **D10** the ratified band table · **D11**
  ArmySoldier stays `xpFactor: 0`, so the 423 / 62 split and both §9 asserts
  stand unchanged.

**Content + code:**

- `api/mobs/` × 7 — **`factors.speed` only**: DireWolf 0.88→0.55 · Bandit
  0.65→0.55 · Spider 0.70→0.55 · Marauder 0.92→0.50 · AlphaWolf 0.95→0.50 ·
  EliteWolf 0.75→0.52 · EliteBandit 0.65→0.52.
- `cmd/simharness/guardrail_test.go` — **`TestGuardrails_ArchetypeTrade`** over
  the whole 65-entry catalog, **proven RED first** naming exactly the eight,
  plus `archetypeExempt` with its single entry.
- `scripts/world-regions.py` — **NEW**, §9's coverage assert half (a). Exit 1 on
  any unresolved spawn; also renders §3.7's grid, so the doc and the rule cannot
  drift silently. `--levels` is half (b), C2's to drive to 0.
- `docs/manual-content-authoring.md` §1 — the unit + rule in the mob-authoring
  checklist, where the next author will actually meet it.

⛑ **Three findings that outlive this chunk:**

1. **A budget × archetype engine model would change NOTHING** —
   `MaxHealth = baseMaxHealth × F(level)` and skill damage = `damageHP ×
   F(level)`, the same `F` on both sides, so it cancels and `base / 55` is the
   shape at every level. *Verified in code.* That is why D6 carries no engine
   change, and it is a much stronger reason than "it would be a big diff".
2. **`WolfBite` is shared by Wolf, DireWolf and AlphaWolf**, so damage was never
   an available axis for two of the eight: paying with damage would have moved
   **the unit itself**, which has 121 spawns. The shared skill chose the axis
   for the whole set.
3. ⛔ **GiantSpider could pay on NO axis and is exempted with cause.** Speed is
   pinned **above 0.9** by `TestMobSpecOf_GiantSpiderCarriesBiteAndVenom` (*"it
   must out-walk the player to land any of it"*); the HP route was **tried and
   measured** — `baseMaxHealth` 182 → 80 sent facetank survival **0 % → 100 %**
   and dropped it out of the farm band's hard normals, undoing the hardening
   pass this guardrail's own comment credits it with. Reverted.

⛑ **THE CAVEAT, and it is the top-line one: nothing in the project can measure
what changed.** Baseline and post-change facetank survival are **identical on
all seven** (DireWolf 62 %→62 %, Spider 100 %→100 %, the other five 0 %→0 %),
because the guardrail's facetank leg starts at **0.5 units** — the mob is
already inside aura range, so approach time never enters the model. The
`-levels` battery is independent too: it runs a synthetic reference mob, so
TTK 6.67 s / TTD 8.70 s cannot move on a catalog edit at all. **Seven species
just became markedly more kiteable and no battery saw it.** So "verified" here
means *verified safe against the asserts*, never *verified good* — escapability
is an in-game judgement and it is the first thing C2's walk should look at.

⚑ **Also NOT covered by any browser harness, and reasoned rather than run:** no
row in the `verify` coverage map owns mob **chase speed**. `swift-cooldown`
owns the *player* movement axis and the slow/burst buffs; `c0-honest-plate` and
`c2-mob-level` own what a plate says and what its tint means, and neither reads
`factors.speed`. A slower Marauder wanders *less* from its spawn, so if anything
`c0-honest-plate`'s venue got more reliable. ⚑ `backend/conf.json` was checked
and is in the right state — `grayBase: 5, grayStep: 6` — so C0's narrowed value
was restored by hand as its ledger required.

**Verified:** `go build` / `go vet` clean · full Go suite **53 packages (33 ok +
20 no-test-files), 0 FAIL** · `db-test` green against real Postgres
(`store` 29.1 s, `accounts` 16.6 s) · guardrail band classification **identical
to baseline in every zone** (`farm band: soft=[] hard=[GiantSpider AlphaWolf
Marauder]`) · `scripts/world-regions.py` **423/423 resolved, 0/423 levelled** ·
boot `-content ../api` 15 factions / 87 skills / 65 mobs / 3 milestones / 10
recipes / 4 quests / 5 props / 777 props / **485 spawns**, **0 panics, 0
errors** · no frontend file changed and no `.fbs` touched, so `tsc`, vitest and
**`hygiene-wire-prune` are not implicated**.

**Schema impact: DB NONE · FlatBuffers NONE · content JSON YES** (7 `api/mobs/`
files, `factors.speed` only — **no `world.json` change**: C1 places nothing, and
L6 is satisfied because the catalog moved *before* any placement).

### C2 — the re-placement ✅ 2026-08-06, headless-verified

**All 423 combat spawns carry a decided level, 27 of them under a different
species than yesterday, and the plate a player reads was checked against the
file in all ten regions.** This is the plan's last chunk.

**PO rulings — D12–D14** (full text in §2):

- **D12 — East village + Gates goes PREDATOR-heavy, not bandit.** §3.9's donor
  was the bandit camp; it was rejected on content grounds after the faction
  check **cleared** it (`bandit` is `hostileTo: ["aligned"]` only, so bandits
  beside the CityGuard would *not* have fought the NPCs — worth knowing, and
  not what decided it).
- **D13 — the village livestock ring**: prey within 10 units of `spawnpoint-2`
  keeps its native cL2 inside a 14–18 region. 5 Boars. A stated exception to
  D10, not a tolerance.
- **D14 — the front's ADDS are made honest, its ceiling is not. AMENDS D5.**
  The 3 Trolls move cL11 → 17–18; Orc and OrcGrunt keep 20.

**Content + tooling:**

- `api/zones/world.json` — **423 `level` keys, 27 `mob` changes.** The 62
  non-combat spawns are byte-identical and **no other field moved on any
  spawn**, asserted rather than reviewed.
- `scripts/world-place.py` — **NEW.** The authored table (§3.10) plus §9's test
  strategy as `--check`. It writes the file, so the table and the world cannot
  drift; a `json.dumps(indent=2)` round-trip of `world.json` is **byte-identical
  at HEAD**, which is what makes a generated file safe here.
- `.claude/skills/verify/c2-world-walk.mjs` — **NEW**, registered in the
  coverage map. The walk, as an assertion instead of a memory.

⛑ **Six findings, in the order they cost time:**

1. ⭐ **THE RUNG IS NEARLY COSMETIC NEXT TO THE SPECIES.** A 5-rung band is
   `1.12⁴` = **1.57 ×** wide; the roster's HPx spans **0.64 → 8.18**, a 9 ×
   range. So *which species stands in a region* sets its difficulty by an order
   of magnitude more than which rung that species takes. This is why §3.9's
   "move species in, do not stretch" is not a style preference — **stretching
   cannot reach the target at all**, because a region's difficulty is
   essentially its roster. It also reframes what the `level` keys are for: they
   make the plate and the XP honest, and the re-**placement** does the work.
2. ⛔ **Boar and Stag are `wildlife_prey`, `hostileTo: []` — RETALIATION-ONLY.**
   So §3.9 understated its own case: a Boar at 18 is not "a 516 HP healthbar
   with a level-2 moveset", it is a **passive** 516 HP pinata that never fights
   you until you open it. 26 of V's 31 spawns were that. Measured before
   anything was placed, and it is what made D12 easy.
3. ⛑ **The campfire assert is GEOMETRIC, and its first version was wrong in a
   way that produced two false failures.** Treating a patroller's farthest
   waypoint as a wander *radius* reads the two routes that pass near a fire as
   if they surrounded it — both actually run **away**. `spawnpoint-2` scored
   −3.35u and `spawnpoint-5` −0.81u against a correct world. A patroller is a
   **polyline**: the clearance is the closest approach along its route.
   *An assert that cries wolf on correct content gets deleted, not fixed.*
4. ⛑ **The walk's obvious formulation is also wrong, for the same class of
   reason.** "Every plate belongs to the region I warped to" scored **4 FAILs**
   on a correct world — the viewport spans ~20 world units and every venue sees
   across a seam (a West-wildlife Boar 4 visible from the Kobold hideout, the
   horde's Bandits visible from the tunnel). What is actually assertable at the
   game surface is **local**: every plate matches a placement authored within
   15 units of where that plate stands. The D10 **band** claim is a property of
   the FILE and is asserted there instead — checking it off a wandering mob adds
   flakiness to a fact already pinned exactly.
5. ⛑ **Plate text is the DISPLAY name, with spaces** — `Fire Elemental 17`, not
   `FireElemental 17`. A `^[A-Za-z]+ \d+$` regex silently drops every
   multi-word species (Dire Wolf, Alpha Wolf, Elite Bandit, Greater Fire
   Elemental…), and it reads as **"no plates in view"**, not as a bug: the NE
   fire pocket scored INCONCLUSIVE with three perfectly good elemental plates
   on the screenshot. A plate's world position is `text.parent.{x,y}`, in wire
   units.
6. ⛑ **THREE harnesses had their premise moved by this chunk and are repaired
   here, per the suite's own rule 8** — and the third is the one that shows the
   class is worth hunting rather than waiting for. `c3-zone-editor-level`'s
   protective leg asserted **`untouched === 0`**: *no pre-existing spawn carries
   a level at all*. That was true only while no zone shipped a placement, so C2
   turned it red (**423 with a level**) on entirely correct content, where it
   reads as a C3 regression. ⚑ **It was invisible until the frontend was
   rebuilt** — the editor's zone JSON is webpack-BUNDLED, so a stale `dist`
   served the pre-C2 world and the leg passed against a file that no longer
   existed. ⭐ **The repair is stronger than the original**: what the leg
   protects is not ABSENCE but **non-interference** — an edit to one spawn must
   not rewrite the levels of the ones it never touched — so it now compares the
   pre-existing slice's levels before and after, which also catches a level
   being *changed*, not merely added. 7/7. `c2-mob-level`'s CONTROL used to prove
   the *catalog fallback* ("Stag 1 because nothing overrides it"); every combat
   spawn now carries a level, so it proves only what it is named for — the
   plate is per-instance — and that fallback now lives only in the Go tests.
   `c0-honest-plate`'s subject **is** the V patroller: cL12 → **16**, which
   stops dividing the two rules at player level 18, so its player level moved to
   **22**. ⚑ It would have *said* so (leg 3 reported INCONCLUSIVE, exactly as
   designed) — but a harness left self-labelling proves nothing.
   ⭐ **And repairing it exposed a flakiness that was never C2's**: the venue
   its header calls "the ISOLATED Marauder" is spawn **#402, a PATROLLER** with
   three waypoints running ~13 units west, so most of the time it is nowhere
   near its spawn point and the midpoint venue cannot see it. Two consecutive
   single-sample runs scored the colour leg INCONCLUSIVE while the pay leg
   found and killed it for **Δ460 both times** — the mob was fine, the sampling
   was not. A bounded re-sample (8 × 4 s, until both plates share one frame)
   takes it to **8/8**, above the **6/8** its own C0 ledger recorded. *"Isolated"
   was true of its NEIGHBOURS — nine other Marauders sit 45 units away — and
   said nothing about it standing still.*

⚑ **The measurement `xp C2` should actually read.** "Fight size" = a spawn's HP
as a multiple of a level-1 Wolf, and the useful column is the **ratio to a Wolf
at that region's band top** — i.e. how big the typical fight is against a
*standard mob of the level the plate claims*:

```
 region  band       median fight size          x a Wolf at band top
   F     1-3     1.1x -> 1.2x                  0.89 -> 0.97
   W     2-6     1.1x -> 1.3x                  0.64 -> 0.71
   D     4-8     1.1x -> 4.0x                  0.51 -> 1.83
   K     6-10    1.1x -> 2.2x                  0.40 -> 0.80
   M     8-12    1.2x -> 2.7x                  0.35 -> 0.78
   T    10-14    2.1x -> 4.7x                  0.49 -> 1.09
   B    12-16    4.0x -> 10.0x                 0.74 -> 1.83
   V    14-18    4.0x -> 14.4x                 0.59 -> 2.10
   P    17-20   20.6x -> 20.6x                 2.39 -> 2.39   (untouched, D8)
   R      —     65.8x -> 65.8x                 7.64 -> 7.64   (untouched, D5)
```

⭐ **Before this pass every region except P and R sat at 0.35–0.89 ×** — the
whole world was *below* the level it presented, which is the defect the chain
was called for. After, the low half lands at **0.71–1.0 ×** (at level) and the
high half at **1.8–2.1 ×**.

⛔ **That 1.8–2.1 × is C2's most significant untested consequence, and D12
caused part of it.** The heavy end has two sources: elite-tier species in D and
B (EliteWolf, EliteBandit — legitimately big fights), and in **V, the archetype
family the ruling picked.** The `wildlife_predator` roster *is* the HP-heavy
family (DireBear 5.16 ×, EliteWolf 4.80 ×, Bear 3.49 ×, AlphaWolf 2.95 ×) while
the rejected bandit roster holds the light species (BanditRanged 1.09 ×,
BanditHealer 1.20 ×). **D12 bought V's identity with fight length**, and there
was no light predator to spend instead — the only one is the Wolf, which at 14
is L2's stretched kit in its purest form. Recorded, not fixed: it is a
calibration question and `xp C2` owns it.

⛑ **What was NOT tuned — §3.11, and read it before calibrating.** No mob speed
was measured (C1's seven reshaped species come out of this pass exactly as
untested as they went in; **DireWolf 0.88 → 0.55 across 42 spawns** is still
open) · `respawnTicks` and `wanderRadius` are unchanged and the diff guard
proves it · the 27 re-skinned points keep their authored `wanderRadius` /
`idleSpeedFactor`, which are properties of the spot, not the species (18 of
the 27 carry one) · `proving-grounds.json` untouched per §4.5 · **levels 21–30
are still empty by D5**. ⚑ The sequencing note for whoever tunes next: a
post-placement `factors.speed` edit is **safe** (speed is not in
`PowerScale()`, §3.5); an HP or damage edit **re-prices every placement this
pass just made**. That is what **L6** actually protects.

⚑ **§4.2's patrol decision, taken:** a patroller keeps its route and takes the
region of its **spawn point**. Two of the six routes descend one band (#239
DireWolf B→M at 14, #402 Marauder V→M at 16) — a scout from the harder region
walking the road, which is content rather than a defect. None of the six was
re-skinned.

**Verified:** `scripts/world-place.py --check` **all legs green**, and **every
leg proven RED first** against a mutated copy (a mob parked on the village
fire · an over-band Orc inside the clearance ring · one spawn losing its level ·
a stray `respawnTicks` edit · the quest floor breached · a level pushed out of
band) · `scripts/world-regions.py --levels` **423/423 resolved, 423/423
levelled** · **`c2-world-walk` 10 PASS / 0 FAIL / 0 INCONCLUSIVE, 0 console
errors** (NEW) · **`c0-honest-plate` 8/8, 0 FAIL, 0 INCONCLUSIVE** · **`c3-zone-editor-level` 7/7, 0 console errors** after its repair, run against a **freshly rebuilt** `frontend/dist` after its
repair — the Marauder now plates **green** (`5fd35f`) at level 16 and pays
**460**, the ring Boar plates gray and pays **0** · `go
build` / `go vet` clean with **no Go file changed** · full Go suite **53 packages** — 0 FAIL on a clean run, with **one documented pre-existing nondeterministic red**, `sys.TestDwell_TakeoffDropsAnInProgressCount` (C0's ledger already carries it as unowned). ⚑ **Measured, not assumed**: it fails **13/20 and 13/20 with C2's `world.json` STASHED**, versus 4–11/20 with it — so C2 neither causes nor worsens it, and there is no mechanism (it is a flight-dwell fixture and F, the region holding `spawnpoint-1`, had no re-skin) · `db-test` green **uncached** against real Postgres · boot
`-content ../api` 15 factions / 87 skills / 65 mobs / 3 milestones / 10 recipes
/ 4 quests / 5 props / 777 props / **485 spawns** / 5 campfires, **0 panics, 0
errors, 0 warnings**, and `grayBase=5 grayStep=6` confirmed as the cold-start
section required · **no frontend source and no `.fbs` changed**, so `tsc`,
vitest and **`hygiene-wire-prune` are not implicated** (reasoned against the
coverage map, not skipped).

**Schema impact: DB NONE · FlatBuffers NONE · content JSON YES**
(`api/zones/world.json` + its embedded copy under `backend/pkg/api/`, which
`cp-defs` syncs — **no `api/mobs/` change**: C1 owns the catalog and L6 requires
it to have moved first, which it did).
