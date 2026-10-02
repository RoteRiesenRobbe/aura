# Plan: XP progression — level bands, quest areas, the quest / kill split

> **Status: PLANNING, drafted 2026-10-02, nothing built.** ⭐ **Ruled the same
> day: D2 (keep the L9 price), D4 (harvesting stays near zero), D5 (a quest
> counts where its work happens or it is turned in, not where it starts), and
> the Alpha Boar stays in Zone 1** (§6). ⏸ **D3 (the kill base) is held for a
> review with a second PO**; §6 D3 is written to be read on its own for that.
> D1, D6, D7 and Zone 1's area split (`content-zone-1-farmland.md` §2.8) are
> still open. Spawn levels are deliberately NOT in this pass (§8).

Origin, PO 2026-10-02 (translated where paraphrased): *"Are we listing leveling
ranges, meaning total XP gain in zone from questing and progressing through
it? Everything contained in the zone should play into that XP gain for
leveling."* Then, after the first census: *"zone 1 and 2 should be separated
… zone 1 is primarily farmland and the strand … Add XP budget is good, it
should be mostly questing and maybe 20% mob killing. We then need an xp
progression plan within 1 zone from quest area to quest area and one global
one. Hence a zone can be segmented to quest areas and this decides what level
mobs are in the areas. We can talk about spawn levels after we have that."*

---

## 1. Why

Nothing in the repo says how much XP a zone pays or how a character should
level through it. Quests are priced one at a time by the L9 half-level rule
(PO 2026-07-30, pinned in `quests/content_test.go`
`TestContent_QuestXPBudget`), kills by the kill-XP formula
(`curve/killxp.go`, `archive/plan-xp-formula.md`), and mob levels per spawn by
eye. The 2026-10-02 census of Zone 1 shows what that gives:

- One critical-path pass through the Farmlands + Strand + barn pays **1664 XP
  and ends early in level 5**, against a 1 → 6 band (2232).
- The split is **63 % quests, 37 % kills, ~1 % harvesting**: kills pay almost
  double the PO's 20 %, and harvesting pays nothing worth counting.
- The quests bunch up early: levels 4–5 have two quests and no kill content.

## 2. The arithmetic everything below rests on

Today's numbers, all [PLACEHOLDER] (`backend/conf.json`, `curve.DefaultKillXP`):

- **Cost of level L**: `need(L) = 300 × 1.2^(L−1)` (300, 360, 432, 518, 622, 746 …).
- **An at-level kill** pays `base × 1.2^(L−1)` with base 20, so **one kill is
  base / 300 = 1/15 of a level**, at every level (the growths match, D19).
- **A quest** pays `½ × need(target level)`: **half a level**, at every level.

Because all three grow by the same 1.2, **every ratio below is level
independent**: "quests per level" and "kills per level" mean the same thing at
level 2 and level 25. Two consequences:

- **Total XP to 30 is 295,220, and 81 % of it is levels 21–29.** XP per level
  explodes, but content per level does not: the same number of quests and
  kills buys a level everywhere.
- **The split is set by two counts.** If a level holds *q* quests and the
  critical path asks *k* kills per level:

  | | Share of a level | Today | For 80 / 20 |
  |---|---|---|---|
  | Quests | q × ½ | — | q = **1.6** quests per level (at the L9 price) |
  | Kills | k × base / 300 | base 20 → k × 6.7 % | base = **60 / k** |

  Zone 1's kill quests ask 25 kills over 5 levels, **k ≈ 5**, so at base 20
  kills are ~33 % of the critical path. 20 % needs **base ≈ 12**, or about 3
  kills per level at base 20.

## 3. Definitions

- **Level band `a → b`**: a zone (or area) takes a character from the start of
  level *a* to the start of level *b*. Bands chain: the next one starts at *b*.
- **Budget** `B(a → b) = Σ need(L)` for L = a … b−1. Zone 1, 1 → 6: 2232.
- **Critical path**: every quest of the zone done once, plus the kills those
  quests ask for, plus an allowance for the kills met on the way
  ([PLACEHOLDER] none in the drafts). **The budget is measured on it.**
  Respawns are unbounded by definition, so grinding is an overflow valve that
  lets a player out-level a gap, never part of the budget.
- **Split**: of each budget, **~80 % from quests, ~20 % from kills** (PO
  2026-10-02).
- **Quest area**: a part of a zone with a hub (a campfire and its givers),
  the quests handed out there, and the ground those quests send the player to.
  It has its own band, inside the zone's, and **the area's band decides the
  level of the mobs in it** (PO 2026-10-02). A quest belongs to the area where
  its work happens, not where its giver stands.

## 4. The global plan: bands per zone

Order and connectivity are [`content-world.md`](content-world.md)'s. The
critical path chains contiguously to 30; side content (the swamp/desert arm
8/9, the pocket zone 21) **overlaps** a band rather than extending the chain.
The City is a hub with no band.

| Zone | Band | Budget | Quests (80 %) | At 1.6 quests / level | Source |
|---|---|---|---|---|---|
| 1 Farmland & Village | 1 → 6 | 2,232 | 1,786 | 8 quests | old combined guide §2, [PLACEHOLDER] |
| 2 Woodland | 6 → 12 | 7,413 | 5,930 | ~10 quests | old combined guide §3, [PLACEHOLDER] |
| 3 onward | OPEN | | | | needs the region ↔ zone mapping `content-world.md` says is unconfirmed |
| **Whole game** | **1 → 30** | **295,220** | | **~46 quests** on the critical path | |

⚑ **~46 critical-path quests for the whole game is the honest consequence of
the L9 price.** A denser game (WoW runs several quests per level) means
cheaper quests; that is D2.

## 5. The per-zone plan: areas chain inside the band

Every zone doc gets an **XP budget** section (band, budget, split, what the
map pays today) and a **progression by quest area** section: a table of areas,
each with hub, band, budget, quest and kill shares, the quests that live there
and the gap. Zone 1's draft is `content-zone-1-farmland.md` §2.7–§2.8 (three
areas: the homestead 1 → 2, Reinhard's farm + the village 2 → 4, the north
fields + the Strand 4 → 6). Zone 2's is owed after the PO rules on Zone 1's.

## 6. Decisions for the PO

- **D1 — the split is measured on the critical path.** Every quest once and
  the kills they ask for; grinding excluded. *Recommended:* yes. The only
  alternative, "everything placed, killed once", depends on mob density, which
  changes with every map edit.
- ✅ **D2 — RULED 2026-10-02: (a), keep the L9 half-level price** (PO: "sounds
  good"). 1.6 quests per level; a zone's quest count follows from its band.
  How many quests per level (q), which sets the quest price:
  (a) keep the L9 half-level price → 1.6 quests per level, ~8 per five-level
  zone, ~46 to level 30; (b) ~3 per level at ~¼ level each; (c) ~5 per level
  at ~⅙ level each. *Recommended: (a) for now.* It is the PO's own 2026-07-30
  ruling, it matches what Zone 1 already has (8 quests), and it keeps the
  authoring load sized to the team. Going denser later is a re-price (one test
  pin), not a redesign.
- ⏸ **D3 — how kills get down to 20 %. HELD: the PO reviews it with a second
  PO.** Written to be read on its own:

  **What the kill base is.** One number, `killXP.base` (today **20**), in
  `curve.DefaultKillXP` (`backend/pkg/aura/curve/killxp.go`, the source of
  truth) and restated in `backend/conf.default.json`. It is what a level-1
  player gets for killing a normal mob of their own level. Every kill award
  is built from it:

  `award = base × 1.2^(player level − 1) × level-difference modifier × tier × species xpFactor`

  - *1.2^(player level − 1)*: the same growth as the level-up cost, so an
    at-level kill is always **base / 300 of a level**: 20 → 1/15, at every
    level.
  - *level-difference modifier*: +5 % per level the mob is above you (capped
    at +20 %); below you it tapers, and 5+ levels below (more past level 10)
    it pays nothing (gray).
  - *tier*: normal ×1, elite ×2.5, boss ×5. *xpFactor*: per species, 1 unless
    authored (harvest-mobs 0.05, NPCs 0).

  It was set to 20 by `archive/plan-xp-formula.md` D19 after an in-game pass
  found "too much XP overall", when kills were the main XP source: ~15
  at-level kills per level.

  **What changing it does.** It scales every kill in the game by the same
  factor and touches nothing else (quests, level costs, tiers unchanged).

  | | base 20 (today) | base 12 (proposed) |
  |---|---|---|
  | At-level kill, player level 1 / 5 / 10 / 20 | 20 / 41 / 103 / 639 | 12 / 25 / 62 / 383 |
  | Kills for one level by grinding alone | 15 | 25 |
  | Zone 1 critical-path kill XP (25 kills; target 446 = 20 % of the 2232 band) | 608 | ~350 |
  | Zone 1's one critical pass (quests + their kills) | 1664 XP | ~1425 XP |

  ⚑ 12 is the formula's round figure (60 / k with k = 5). Simulated against
  today's Zone 1, **base 15 lands the 446 target exactly** (14 → 411, 16 →
  468), because the player levels up between kills and each level raises
  what a kill pays. So the real range is **12–15**; the exact value is X2's
  calibration and moves as more zones are measured.

  **The options.** (A) lower the base to ~60 / k, where k is critical-path
  kills per level (Zone 1: k ≈ 5 → ≈ 12); one global knob. (B) keep base 20
  and cut quests to ~3 kills per level in total (a "kill 8 wolves" quest
  becomes "kill 3"). (C) part of each. *Recommended: (A).* Quests keep their
  shape (a cull of 6–8 still feels like a cull) and grinding gets slower,
  which is what a quest-driven game wants. Cost: the sim harness's
  kills-per-level calibration is re-run, and the Go default and the conf
  restatement change together (X2). ⚑ Under (A) the lost kill XP must come
  back from quests: that is what the bands and areas budget for, so a zone
  only plays right once its quest gap is filled too.

  ⚑ `conf.default.json`'s `killXP` comment still says "~7.5" kills per
  level; at base 20 it is 15. A stale comment, not a different number.
- ✅ **D4 — RULED 2026-10-02: (a), harvesting stays near zero** (PO: "yes").
  Does harvesting pay XP: Turnip, Beet and Seaweed author
  `xpFactor 0.05` (20 XP in all of Zone 1). (a) keep near zero, the quest pays
  for the harvesting; (b) pay like a kill and count toward *k*. *Recommended:
  (a).* Harvest-mobs respawn three times faster (600 ticks vs 1800) and stand
  in dense patches; paying like kills would make a turnip field the cheapest
  grind in the game.
- ✅ **D5 — RULED 2026-10-02: a quest counts toward the zone where it mainly
  takes place or is turned in, not where it is started** (PO). ⚑ Two quests
  sit on the line and are read here as follows, for the PO to correct:
  `wolves-on-the-road` (the kills in the Farmlands, the report in Zone 2)
  counts toward **Zone 1**, where its work is; `village-welcome` (two talks
  in the Farmlands, offered and turned in by the Hermit in Zone 2) counts
  toward **Zone 1** for the same reason, which argues for moving the Hermit's
  offer into the village. The original options:
  A quest that crosses a zone line: `wolves-on-the-road` is offered
  in Zone 1 and turned in in Zone 2; `village-welcome` is offered in Zone 2
  for Zone 1 targets. *Recommended:* a quest counts toward the zone where it is
  **turned in**, and each zone may have one deliberate hand-off quest that
  pulls the player into the next zone (`wolves-on-the-road` is exactly that).
  `village-welcome` then belongs to Zone 2's budget, or its giver moves.
- **D6 — band boundaries.** "1 → 6" means leaving as level 6 is reached, and
  the next zone starts at 6. *Recommended:* yes; no overlap until a zone's
  content needs it.
- **D7 — where quest areas are recorded.** (a) the zone doc's table only;
  (b) also a titled sub-region per area in `world.json`, so the region banner
  names it on entry (WoW's subzones) and the census can total XP per area.
  *Recommended: (a) now, (b) when the census report (X3) is built*, since a
  sub-region also repaints the ground profile and that is a map call.

## 7. Chunks (proposed)

- **X0 — docs** (this session): this plan, the zone split, Zone 1's §2.7–§2.8.
- **X1 — PO rules D1–D7** and Zone 1's area split.
- **X2 — kill-XP retune** (if D3 = A): `killXP.base` in `conf.json` +
  `curve.DefaultKillXP` + the sim harness guardrails. Schema: conf only.
- **X3 — census budget report**: `scripts/zone-census.mjs` prints the critical
  path per zone (and per area under D7 b), so the budget tables are generated,
  not hand-written snapshots.
- **X4 — Zone 1 to plan**: new or re-priced quests per area, spawn levels per
  area (after §8), and the Brackenfold map fix (PO, in Tiled). Every re-price
  updates `TestContent_QuestXPBudget`.
- **X5 — Zone 2's budget and areas**, the same shape.

**Schema impact, as planned:** DB NONE · wire NONE · conf `killXP.base`
(X2, if D3 = A) · content: quest rewards and spawn levels.

### Rulings outside D1–D7 (2026-10-02)

- ✅ **The Alpha Boar stays in Zone 1** (PO), and with it
  `the-sounder-at-the-mill`. It stands in Brackenfold Meadows today, so the
  Brackenfold map fix must re-place it inside the Farmlands. PO: *"we may
  decide a new level or xp in the plan if needed"*: its spawn level (4) and
  the quest's price (370, the level-6 price) are reconciled in the spawn-level
  pass (§8), not now.

## 8. Not in this pass

- **Spawn levels.** The PO's order: areas and bands first, then how an area's
  band sets its mobs' levels. Known inputs for that talk: the 2026-10-02 rats
  (spawn level 1, quest priced at level 2) and the Alpha Boar (spawn level 4,
  quest priced at level 6) already disagree with their quests; the tunnel's
  level 14 Dire Wolves open off a 1 → 6 zone; 19 of the Farmlands' 24 stags are
  level 1.
- **Zone 3 onward** waits on the region ↔ zone mapping.
