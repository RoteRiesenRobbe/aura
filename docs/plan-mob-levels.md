# Plan: One species, many levels — the per-spawn level override

> **Status: ⭐ ALL THREE CHUNKS SHIPPED 2026-08-05 — C1 (`975e5c4c`) + C2
> (`f1d6eebc`) + C3 (`[uncommitted]`), each headless-verified. The BUILD work is
> done; what remains is **content**, and it is not this plan's: the PO's first
> real placements and the world re-placement pass (roadmap step 2, owned by no
> plan). Still the SEQUENCING GATE for the sibling plan's C2.**
> ✅ **L7 IS DISCHARGED with C3** — the zone editor has a *Level* field and
> `getZoneAsJSON` names it, so a per-spawn level survives the save that used to
> delete it. Hand-authoring is safe again, and the tool the re-placement pass
> needs exists. Measured at the panel: a Wolf placed at 15 exports
> `"level": 15`, a blank field exports **no key at all**, and none of the 485
> spawns already in `world.json` gained one.
> ✅ **L3 IS DISCHARGED.** The nameplate and its difficulty tint now read the
> wire's effective level, so an overridden mob's plate tells the truth and an
> overridden spawn may reach a live zone. Measured in-game: one Stag placed at
> `level: 25` plates **"Stag 25" in red** while an untouched Stag of the same
> species plates **"Stag 1" in yellow**, in the same world. Full ledgers: **§11**.
> Ratifies backlog §38 (PO ask 2026-07-29: *"I want to be able to author a
> single mob in all levels — so be able to spawn the same wolf on level 1 and
> level 30"*). A spawn point may author a `level`; the mob placed there stands
> at it — HP, damage and kill XP all follow automatically, because all three
> already derive live from `Mob.Level()`.
>
> ⭐ **UNBLOCKED 2026-08-05: `plan-xp-formula.md` C1 shipped**, which was this
> plan's one ordering constraint (§6.5 — no overridden spawn in a live zone
> before it). Kill XP is now `killXP.Award(participantLevel, m.Level(), tier,
> xpFactor)`, so an authored per-spawn level flows into the award through
> `Mob.Level()` with **zero seam code**, exactly as §6 predicted.
>
> ⭐ **And it now blocks in the other direction: this plan gates that plan's
> C2.** C1's play-test surfaced that the ROSTER, not the formula, is what makes
> XP feel wrong — measured, **at level 20 exactly two rungs of the 36-species
> roster pay anything** (cL18 and cL20), because 27 species sit at cL1–7 and
> **cL13–17 is completely empty** (`plan-xp-formula.md` §11 + D6). Its C2 is
> *calibration*, and calibrating an economy against a five-level hole
> calibrates against noise. **This plan is the structural fix for the hole** —
> a per-spawn level places a level-15 Wolf without authoring a new species —
> so the honest order is: this plan, then that C2. ⚑ It does NOT fix the
> second half, `curveLevel` not tracking difficulty (AngryMammoth,
> SaberToothCat and ProvingBoss are all authored **cL1**); that is a content
> re-authoring pass neither plan owns, and the XP formula made it *more*
> load-bearing because a mis-authored level now mis-prices XP as well as
> mis-scaling HP.
>
> ⭐ **THE CHAIN GOT LONGER, 2026-08-05 evening (`plan-xp-formula.md` D9).**
> C3 here is no longer the last thing before calibration. The PO's order is:
> **C3 (the tool) → a world RE-PLACEMENT pass (the content — sensible level
> bands, gaps filled; still owned by no plan, and it is where the `curveLevel`
> half above finally gets fixed) → sim-harness PLACEMENT support (new plumbing,
> reversing §8.3) → one final calibration pass.** So this plan gates that C2 by
> two more steps than it did this morning.
>
> ⚑ **Schema impact: DB NONE, FlatBuffers YES** — one field appended to the
> `Mob` table (`server.fbs`), both binding sets regenerated together. No
> migration: mob levels are world-authoring, nothing per-character persists.
>
> ⚑ **Sibling plan:** `plan-xp-formula.md` (designed the same day, separate
> session). The two touch **zero common code** and compose by construction —
> §6 is the joint-fit analysis, including the one genuine cross-plan seam
> (the nameplate gray tint vs. the XP gray threshold).

## 1. What this is

A mob's level is authored **once per species** as `MobDefinition.CurveLevel`;
`world.Spawn` carries position, respawn timing, idle-movement config — no
level — so every Wolf in the world stands at the same level no matter where
it is placed. The only "level 30 wolf" possible today is a second species that
happens to be called something else.

This plan adds an optional **absolute `level` on the spawn point** (D1),
inheriting the species value when absent. Entity-model chunk 1b already did
the hard half: `factors.baseMaxHealth` is authored at the baseline (f = 1) and
`MaxHealth()` / skill output both route through
`PowerScale() = Curve.F(Level())` **evaluated live**, so a per-instance level
scales HP and damage with no re-authoring and no number moving for existing
content.

What it buys (§38's "why it is worth doing", unchanged):

- **Zone difficulty becomes authorable without new content** — a second zone
  can reuse the whole zone-1 bestiary at a higher level, which is exactly the
  v1 scope pressure (2–3 zones).
- **Level-gated charm becomes a placement tool** — *"this one is out of your
  band"* can finally be a fact about where you met it, not about the species.
- **Roster diversity multiplies instead of growing linearly** (D4): the wolf
  family stays four distinct creatures, and each of the four can now be
  placed at any level.

## 2. Decision ledger — PO rulings 2026-08-05

Taken as choice prompts in this design session:

- **D1 — absolute level, per spawn.** `level: 30` in the zone JSON, explicit
  and readable; a species rebalance does not touch placements (a feature —
  placements are placements). The offset (`levelOffset: +5`) and per-zone-band
  shapes were declined; a zone-wide default can be added later if authoring
  volume ever demands it (YAGNI now).
- **D2 — XP is priced by the sibling plan, and by nothing here.** No
  per-spawn XP knob, no seam code, no stopgap: `plan-xp-formula.md` computes
  the award from `mob.Level()` at kill time, so an overridden spawn is priced
  correctly the moment both plans are live. §6 records the fit and the one
  ordering constraint that follows.
- **D3 — the CC axis stays flat for v1.** A mob's skill loadout keeps its
  authored `MobSkill.Level`s: HP-valued output scales with the mob's level
  via `casterPowerScale`, but slow fractions, durations, radii and tick rates
  ride the skill level only. A level-overridden mob is a
  strong-but-same-CC scaler — no derived-skill-level mapping, no per-spawn
  skill overrides. Revisit if it plays wrong.
- **D4 — the wolf family stays separate creatures.** `Wolf`/`AlphaWolf`/
  `EliteWolf`/`DireWolf` keep their own tiers, stats, loadouts and drop
  tables; this plan is **purely additive** (no content migrates). A level-1
  *or* level-30 AlphaWolf are both now authorable — the two axes multiply.

## 3. The design

### 3.1 Server: one optional field, one precedence rule

- **`world.Spawn.Level *int`** (`level` in the zone JSON, absent = inherit).
  The pointer tri-state is the established spawn-override encoding
  (`WanderRadius`, `IdleSpeedFactor`, `zone.go:72-73`). Loader validation:
  `level >= 1`, mirroring the species `curveLevel` check
  (`definitions.go:351`; neither has an upper cap today — §8.1).
- **`spawnPoint.level *int`** (`sys/mob.go:21`) — carried per authored point
  so a **respawn reproduces the override**, never falling back to the species
  value.
- **`Mob.spawnLevel int`** (0 = none) + `SetSpawnLevel`, a spawn-site-only
  setter like `SetOwner`/`SetTTLTicks`. `Level()` (`mob.go:878`) gains one
  branch, with the precedence

  ```
  owner ?? spawnLevel ?? definition.CurveLevel
  ```

  ⚑ The override sits **after** `owner` — entity-model chunk 1b makes a
  summon stand at its owner's level *live*, and `plan-faction-flips.md`
  L-B/L-M pin that a charmed mob keeps its own. In practice the two never
  coexist (summons are skill-spawned, not point-spawned), but the order is
  load-bearing the day something makes them meet (L2).
  ✅ **Verified in C1, and it was worth verifying** — charm targets *world*
  mobs, which are exactly the point-spawned ones, so "they never coexist"
  was a real claim and not a truism. Charm binds `charmer`, **deliberately
  never `owner`** (`mob.go:549-560`), and both `SetOwner` call sites are skill
  spawns (`sys/skills.go`). A charmed overridden mob keeps the *placement's*
  level; pinned by `TestMob_SpawnLevel_SurvivesCharm`.

Everything downstream is already live-derived and needs **zero changes**:
`MaxHealth()`, `PowerScale()`, `casterPowerScale` for skill output, the
support/threat scaling, and — once the sibling plan lands — the kill-XP award.

### 3.2 The construction-order landmine (L1)

`NewMob` fills the pool at construction (`m.health = m.MaxHealth()`,
`mob.go:302`) — *before* any spawn-site setter can run. The summon path has
exactly this problem and its solution is already named the spawn site's tool:
`RestoreToFullHealth()` (`mob.go:906`, *"a summon is constructed before its
owner is known, so its pool widens to f(ownerLevel) only once SetOwner
lands"*). `spawnAt` (`sys/mob.go:158`) therefore does:

```go
m.SetSpawnLevel(*p.level)   // if set
m.RestoreToFullHealth()     // pool re-derives at the override level
```

Skipping the second call ships a level-30 wolf with a level-1 pool that
silently caps at level-30 max — wrong in the way that looks almost right (L1).

### 3.3 Wire + client: the nameplate must stop reading the catalog ✅ C2

The single biggest cost, and the half that is easy to get wrong by omission:
the nameplate renders `"<displayName> <curveLevel>"` from the **static
species catalog** (`Mobs.ts:174`), and the difficulty **tint** compares the
same static number against the player's level (`Mobs.ts:213-218`). With
per-spawn levels, every overridden mob's plate and tint would lie.

- **`server.fbs`:** `level:ushort = 0` appended at the `Mob` table end (the
  `max_health` precedent — field IDs stay stable). The server encodes the
  **effective live `Level()`** (`codec/mob.go`, beside `MobAddMaxHealth`),
  not the raw override — so the client needs no precedence logic and an
  owned summon would be right too, unprompted.
- **Client:** `Mobs.ts` plate text and `difficultyColor` input switch to the
  wire value; `0` (absent/old server) falls back to the catalog
  `curveLevel`, so the change is safe against a stale peer during rollout.
- Both binding sets regenerate together (`api/schema/make.sh` + `make -C
  backend gen`); the `hygiene-wire-prune` gate covers the `.fbs` touch.

### 3.4 Zone editor + authoring

- ✅ **DONE in C3.** `ZoneSpawn` (`ZoneModel.ts`) has optional `level` and the
  spawn tool panel has a number field (blank = inherit). ~~Until that ships the
  PO can author `level` by hand in the zone JSON — the loader accepts it from
  C1 on.~~
  ⛔ **That sentence was FALSE from C1 until C3, and the hand-authoring window
  was closed for exactly that long.** The loader accepted it, but the
  serializer — **`getZoneAsJSON`, not `toJSON`; the plan named the method
  wrong** (`ZoneModel.ts:271-287`) — writes an explicit **field whitelist**, so
  opening such a zone in the editor and saving it **silently deleted** the
  override. `fromJSON` spreads and preserved it; only the serializer dropped it
  — the same whitelist that could drop a hand-authored campfire `id`, which the
  file already warns about. C3 added `level` to the interface **and** the
  serializer, and pinned both directions.
- ⚑ The editor's mob picker suffix `cL<n>` (`_ZoneEditorPanel.ts:201`) shows
  the **species** curve level and keeps doing so — it describes the species
  default, not the placement. The spawn's own field is where the override
  lives; don't merge the two numbers (L6).

## 4. Current state — the facts the plan stands on (verified 2026-08-05)

- `world.Spawn` (`zone.go:65`) has no level; `NewMobSystem` copies spawns
  into `spawnPoint`s (`sys/mob.go:55`) which have none either; `spawnAt`
  never sets one.
- `Mob.Level()` (`mob.go:878`) is `owner ?? definition.CurveLevel`, with a
  `< 1 → 1` guard on the species value.
- `NewMob` fills health at construction; `RestoreToFullHealth` is the
  documented spawn-site repair tool (§3.2).
- The `Mob` wire table (`server.fbs:155`) has six appended-at-end fields
  already (`max_health` … `dwell_radius`) — the append discipline is
  established.
- Nameplate text and tint both read catalog `curveLevel`
  (`Mobs.ts:174,213,218`); `difficultyColor` (`client-data/Mobs.ts:113`)
  works on the **difference** to the local player over fixed bands.
- ~~Kill XP today: `tryGrantKillRewards` reads the flat `Factors.Experience`~~
  — **DONE 2026-08-05, `plan-xp-formula.md` C1**: that line now computes
  `killXP.Award(participantLevel, m.Level(), tier, xpFactor)` per participant,
  so an overridden spawn level flows into the award through `Mob.Level()` with
  **no seam code**, exactly as D2 predicted. The ordering rule below is
  satisfied.
- The simharness builds inline definitions (`sim/world.go`) and its roster is
  species-keyed — per-spawn levels are invisible to it (§8.3).

## 5. Schema impact (stated per the standing rule)

- **DB: NONE.** Mob levels are world content; nothing per-character or
  per-account changes. No migration.
- **FlatBuffers: one appended field** — `Mob.level:ushort = 0`. Appended at
  table end, both binding sets regenerated and deployed together.
- **Content JSON:** zone files may carry `spawn.level` (optional, backwards
  compatible — absent means today's behavior byte-for-byte). No mob-def
  changes.
- **conf.json: NONE.**

## 6. Interplay with `plan-xp-formula.md` — the joint-fit analysis

Compared deliberately (PO ask, this session). The headline: **the two plans
compose by construction and share zero code.** The XP plan's award is
`base(P) × mod(Δ) × tier × xpFactor` with `Δ = mob.Level() − P` — it reads
the **live accessor** this plan extends. Its own §8.3 already lists §38 as
"would slot in as the `mob.Level()` operand with zero formula change."

What the combination makes *easier*, in both directions:

1. **This plan's worst open question dissolves.** Backlog §38 called XP "the
   one that decides whether the idea is a small change or a balance project"
   — a level-30 Wolf granting the flat level-1 award breaks the Session-⑥
   band rule. Under the formula the award is priced off `Level()` per
   participant, so an overridden spawn is priced correctly with no new
   authoring, no per-spawn XP knob, and no code in this plan. D2 simply
   deletes the problem.
2. **The XP plan's `curveLevel` risk gets its natural tool.** Its §4 notes
   the formula makes `curveLevel` more load-bearing (a mis-authored species
   level now mis-prices XP). Per-spawn levels give the *tuning response* a
   place to live: fixing one hot spot becomes a placement edit, not a species
   rebalance that moves every zone.
3. **Testing composes:** the XP plan's award-site tests parametrize over
   `mob.Level()`; once C1 here lands, "two same-species mobs at different
   spawn levels pay differently" is a one-line addition to that table and a
   real-world proof of both plans at once (§7).
4. **⚑ The one genuine cross-plan seam: the gray tint.** The XP formula
   defines "gray" server-side as `Δ ≤ −ZD(P)`, `ZD(P) = 5 + ⌊P/6⌋` — pays
   zero. The client tints nameplates from **fixed difference bands**
   (`DIFFICULTY_BANDS`, `client-data/Mobs.ts`) that know nothing of ZD. Once
   both plans are live, a mob can *look* gray but still pay, or vice versa —
   a §35 one-value-many-homes pattern in the making. **Neither plan fixes
   this**; it is recorded here as the shared open question (§8.2) so the
   cross-check step owns it explicitly. (Cheapest v1 answer: tune the
   client's gray band to approximate ZD at mid levels and accept the drift;
   the honest answer needs ZD client-side, e.g. shipped in `Welcome`.)
5. ~~**Ordering constraint (the only one):**~~ **SATISFIED 2026-08-05** — the
   constraint was "no overridden spawn placed in a live zone before the XP
   formula's C1 ships", and C1 shipped that day. Placement (C3 here) is
   clear to proceed: a spawn's authored level reaches the award through
   `Mob.Level()` with no seam code, so neither failure §38 predicted (a farmed
   high-level wolf paying gray-level XP; a low-level wolf paying its species'
   high authored value) is reachable any more — the second one is not even
   representable, since the authored absolute value no longer exists.
6. **The constraint REVERSED, and this plan is now the gate.** The sibling
   plan's **C2 is calibration**, and its C1 play-test showed the roster — not
   the formula — is what makes XP feel wrong (§11 there: two paying rungs at
   level 20, cL13–17 empty). Calibrating against that roster tunes to noise,
   and **this plan is what fills the hole**. So the recommended order is
   `xp C1` ✅ → **this plan** → `xp C2`. It is a recommendation, not a
   mechanism lock: nothing breaks if C2 runs first, the numbers it produces
   are just measured against a world that is about to change.

Non-interactions, checked so nobody re-checks them: the XP plan renamed
`factors.experience` → `xpFactor` and re-derived `CombatTarget` (**shipped
2026-08-05**) — species-def territory this plan never touches. This plan's wire field carries the level;
XP was never on the wire. Both plans leave the DB alone.

## 7. Chunk breakdown

Three chunks; C1 and C2 are each comfortably under a session and may share
one execution session if it runs clean (they verify at different surfaces).

- **C1 — the override, server-side.** `Spawn.Level` + loader validation +
  `DisallowUnknownFields` coverage · `spawnPoint.level` · `SetSpawnLevel` +
  the `RestoreToFullHealth` call in `spawnAt` (L1) · the `Level()` precedence
  branch (L2). TDD: tests first per §7-tests. No wire, no client — an
  overridden mob is fully real (pool, damage, respawn) but its nameplate
  still lies, so C1 alone must not reach a live zone (L3).
- **C2 — the wire + the client.** `server.fbs` append + both regens · encode
  in `codec/mob.go` · `Mobs.ts` plate + tint switch to the wire value with
  catalog fallback (§3.3) · headless verify leg: a test-world spawn with an
  override shows the overridden number on the plate.
- **C3 — the editor field + first placements.** ✅ **SHIPPED 2026-08-05** —
  `ZoneSpawn.level` + the spawn tool panel input + the L7 whitelist fix. ⚑ Its
  second half, *"PO places the first real overridden spawns"*, is **deliberately
  not in the chunk**: placement is content, the roadmap's step 2 (the world
  re-placement pass) owns it, and no `api/zones/*.json` was touched here. What
  shipped is the tool that pass needs. ~~**Gated on `plan-xp-formula.md` C1
  being live** (§6.5).~~ ✅ Both gates cleared 2026-08-05.

## 8. Open questions & deferred

1. **Upper bound on `level`.** Species `curveLevel` has no cap today and the
   player maxes at 30 (conf-owned, not loader-visible). Proposal: validate
   `>= 1` only, matching the species check — a >30 mob is a legitimate
   "unkillable for now" authoring tool. Flag, don't block.
2. **Gray tint vs. gray XP** — the shared seam, §6.4. ~~Owned by the
   cross-plan check, decided when both mechanisms exist.~~ ⭐ **BOTH MECHANISMS
   NOW EXIST, and C2 is what made the seam real.** Before this chunk the client
   tinted from `curveLevel` while the server priced from `Level()` — two
   different numbers, so the mismatch was noise. Now both read the **same**
   effective level, and what is left is purely the two BANDINGS: the client's
   fixed `DIFFICULTY_BANDS` gray at `Δ ≤ −5` against the server's
   `ZD(P) = 5 + ⌊P/6⌋`. They agree up to player level ~6 and diverge above it,
   so **mobs that plate GRAY still pay** — from player level 12 up, and by
   level 30 four rungs' worth (a level-21 mob plates gray and pays 791).
   ⚑ **The direction matters and I first recorded it backwards:** a *green*
   plate always pays, at every level, because the client's green band ends at
   Δ = −5 and ZD is never smaller than 5. The defect is only at the gray end.
   ⭐ **RULED 2026-08-05 evening (`plan-xp-formula.md` D7):** the client's copy
   is deleted, not tuned — `grayBase`/`grayStep` ship in `Welcome` (the two
   knobs, **not** the resolved ZD, which goes stale on every ding) and the
   boundary is derived, so *gray ⟺ pays nothing* becomes structural. Green
   becomes the variable-width band it is in WoW, which is the actual diagnosis:
   the client copied WoW's fixed offsets (red +5, orange +3, yellow ±2) but also
   froze the one boundary WoW **derives**. Owned by that plan; droppable any
   time before its final calibration pass.
3. ~~**Simharness stays species-keyed** — deliberate. The harness balances
   *species at their curve position*; placement is a zone-authoring concern.
   If a specific overridden encounter ever needs balancing there, that is
   new plumbing and a new ask.~~
   ⭐ **THE ASK CAME, 2026-08-05 evening — this is REVERSED.** The PO's plan for
   the XP economy is *"re-place mobs throughout the world with actual sensible
   level bands, fill the level gaps and adjust XP base and bands based on
   various factors. For this, we will need the sim harness as well"*
   (`plan-xp-formula.md` **D9**). Calibrating a **re-placed world** is exactly
   the case this paragraph declined: the harness must model *placements*, not
   only species at their curve position. It is new plumbing, it is now owned by
   that plan's final pass, and it is a **precondition of the calibration** — not
   of C3 here, which still only needs the editor field.
4. **Zone-band default** (`level` on the zone, spawn-overridable) — declined
   for now (D1), revisit if zone-2 authoring turns out to be "set 40 spawns
   to the same number by hand".
5. **Deferred with D3:** any scaling of CC parameters with mob level.

## 9. Test strategy

- **Loader tests:** `level` absent → nil (inherit) · `level: 0` /negative
  hard-fails · valid value survives the round-trip into `spawnPoint`.
- **`Level()` precedence table** (mob package): no owner + no override →
  `curveLevel` · override set → override · owner set + override set → owner
  (the L2 pin) · the existing `< 1` guard untouched.
- **Pool derivation:** a spawn-leveled mob's `MaxHealth()` equals the same
  species at that `curveLevel` (compute both ways) · health is FULL at spawn
  (the L1 pin — this test fails if `RestoreToFullHealth` is forgotten) ·
  HP-variance still rolls (factor axis independent of level).
- **Respawn:** kill an overridden mob, tick past `respawnAt`, assert the
  replacement stands at the override (the spawnPoint carry pin).
- **Charm/summon non-regression:** the existing L-B/L-M and summon-level
  suites must pass unchanged — they are the reason for the precedence order.
- **Wire (C2):** codec round-trip encodes effective `Level()` · client
  fallback path (wire 0 → catalog value).
- **Headless verify (C2):** test-world zone with one overridden spawn —
  plate shows the override, tint reflects it.
- **Cross-plan (once both live):** two same-species mobs at different spawn
  levels pay formula-correct, different XP to the same participant (§6.3).

## 10. Landmines

- **L1 — the pool is filled before the spawn site runs.** `NewMob` derives
  health at the species level (`mob.go:302`); without the
  `RestoreToFullHealth()` after `SetSpawnLevel`, an up-leveled mob spawns
  with its species' small pool inside a big max — and out-of-combat regen
  quietly heals the gap, so it only reproduces on a fresh pull. The summon
  path documents this exact trap and its fix (`mob.go:903-906`).
- **L2 — precedence order is pinned by other plans.** `owner` must win over
  `spawnLevel` (chunk 1b live summon levels; faction-flips L-B/L-M charm
  semantics). The test table in §9 exists to make the wrong order red.
- **L3 — C1 without C2 ships lying nameplates** — ✅ **DISCHARGED in C2.** The
  catalog-fed plate/tint showed the species number for an overridden mob — an
  "easy to miss" client half called out by §38 from the start. The bar on
  overridden spawns reaching a live zone is lifted; both the plate and the XP
  award now read the effective level.
- **L4 — the append discipline.** `level` goes at the `Mob` table **end**;
  both binding sets regenerate and deploy together (the `max_health`
  precedent; renumbering is the known foot-gun). `hygiene-wire-prune` gates
  the `.fbs` change.
- **L5 — the respawn fallback.** Deriving the respawned mob from `def` alone
  reproduces today's behavior and silently drops the override on first
  death — the `spawnPoint.level` carry plus the §9 respawn test are the
  guard.
- **L6 — two numbers that look like one.** The editor's `cL<n>` suffix is
  the species default; the spawn field is the placement override. Merging
  them in the UI (or "helpfully" pre-filling the field with the species
  value, which would freeze inheritance into a copy) breaks the
  absent-means-inherit tri-state.
- **L7 — the editor's serializer is a WHITELIST, and it eats what it does not
  know** (found in C1) — ✅ **DISCHARGED in C3, but the RULE survives it.**
  **`ZoneModel.getZoneAsJSON`** (the plan said `toJSON` throughout; that method
  does not exist, and the name is the dangerous kind — `JSON.stringify` would
  call a real `toJSON` implicitly) names every spawn field it writes, so a
  `level` that only existed in `fromJSON`'s spread survived a load and vanished
  on the next save — **silent data loss on a round-trip**, invisible from the
  editor: the override worked right up until someone opened the zone for an
  unrelated edit. C3 added the field to **both** halves and pinned both
  directions, and the spawn whitelist is now field-complete against the Go
  struct (§11 C3). ⚑ **The constraint is standing, not spent**: the next
  optional spawn or campfire field must be added to the interface *and* the
  serializer, or it inherits this exact failure.

## 11. Chunk ledger

### C3 — the editor field ✅ `[uncommitted]` 2026-08-05, headless-verified

**A per-spawn level can now be authored, and saving the zone no longer deletes
it** — which discharges **L7** and hands the world re-placement pass its tool.
Measured at the panel, on the real export path: a Wolf placed at level 15
exports `"level": 15`, the same Wolf placed with a blank field exports **no
`level` key at all**, and all 485 spawns already in `world.json` came through
with none. Frontend-only; **no `api/zones/*.json` was touched** — placement is
the next step's content work, not this chunk's (§7).

- `ZoneModel.ts` — `ZoneSpawn.level?: number`, and the field **named in
  `getZoneAsJSON`'s spawn literal**, positioned after `idleSpeedFactor` to hold
  the hand-written file's field order. `fromJSON` needed no edit: it spreads.
- `_ZoneEditorPanel.ts` + `groundTexturePanel.html` — the *Level* input
  (`step="1" min="1"`, blank = inherit), read in `readSpawnControls` and
  restored in `populateSpawnControls`.
- `ZoneEditor.ts` — `drawSpawnMarker` suffixes the label with `L<n>` **only when
  overridden**.
- `docs/manual-zone-editor.md` — §5 gained a *"Level: one species, many levels"*
  subsection and the quick-reference table a row.
- `.claude/skills/verify/c3-zone-editor-level.mjs` — **NEW**, registered in the
  coverage map.

**Schema impact: DB NONE · FlatBuffers NONE · content JSON NONE** — the format
was already accepted at C1; C3 only makes the editor *write* it. `world.json` is
byte-for-byte unchanged.

**What the plan did not predict:**

- ⚑ **The plan named the method wrong, and the wrong name is the safer one.**
  §3.4 and L7 both say `ZoneModel.toJSON`; the method is **`getZoneAsJSON`**.
  Harmless here because the line numbers were right — but `toJSON` is a name
  JSON.stringify would call *implicitly*, and a reader who trusted it would
  look for an override that does not exist. Corrected in §3.4.
- ⭐ **A stronger fact than the chunk aimed for: the spawn round-trip is now
  LOSSLESS.** `getZoneAsJSON` writes `mob, x, y, angle, respawnTicks,
  respawnVariancePct, wanderRadius, idleSpeedFactor, level, waypoints,
  patrolMode` — **field for field the Go `Spawn` struct minus `Def`**
  (`json:"-"`, `zone.go:71-85`), verified by re-read. `level` was the last gap.
  That matters more than "no spawn gained a level key": the re-placement pass is
  about to run load → edit → download → replace over 485 spawns, and there is
  now no spawn field the editor can silently drop. ⚑ It is **not** true of the
  file as a whole — the campfire `id` warning above still stands, and the
  property holds only until the next Go-side field is added without its
  serializer half.
- ⚑ **The blank-field leg is the one that protects the other 485 spawns, and it
  is a SEPARATE assertion from "the level round-trips".** Both go green with a
  serializer that writes `level: s.level ?? someDefault`; only the second one
  goes red. Absent must stay **absent** — `JSON.stringify` drops `undefined`
  keys, which is the whole mechanism — or one edited spawn turns `world.json`
  into a 485-line diff and freezes every inherited level into a copy. *Same
  shape as the campfire-id test above it: the interesting half of an optional
  field is what it does when it is not there.*
- ⚑ **`populateSpawnControls` is a SECOND instance of the same silent-loss
  class, not a nicety.** Selecting a levelled spawn to change its respawn ticks
  and pressing Update runs `readSpawnControls`, which reads the *input* — so a
  field left blank on selection writes the blank straight back over the level.
  The whitelist ate the field on save; this would eat it on edit. It has its own
  harness leg for that reason.
- ⚑ **The editor refuses FRACTIONS, which the loader's rule does not cover.**
  `world.Spawn.Level` is a `*int`, so a `2.5` that reached the file fails
  `json.Unmarshal` with a **type error at boot** rather than the loader's
  friendly `level %d must be >= 1`. Mirroring only the `>= 1` half would have
  let the editor author a file the server cannot describe. *General shape: an
  input mirroring a validator must also mirror the parser underneath it.*
- ⚑ **The map marker now says `Wolf L15` — beyond the plan's letter, and
  vetoable.** Without it an override is invisible on the map, which is the same
  silent state the whitelist produced wearing a different hat, on a tool about
  to be pointed at 485 spawns. The suffix appears **only** on overridden spawns
  (L6: a bare `Wolf` for inherited ones); the harness asserts the **pair**,
  measured 1 × `Wolf L15` against 122 × `Wolf`.
- ⚑ **The picker's `cL<n>` suffix was left alone (L6), and the field is never
  pre-filled from it.** Pre-filling is a one-liner — `ZoneEditor.mobOptions`
  carries `curveLevel` two lines from the select — and it would look identical
  while silently converting inheritance into a snapshot that stops tracking a
  species rebalance.
- ⚑ **Three harness attempts failed at SETUP before one measured anything**,
  and both causes are now in the script header because neither is guessable:
  **`&textures` mounts the editor, not `&develop`** (the panel partial renders
  only under `MODE_PARAMETERS.GROUND_TEXTURE_EDITOR`, so a `&develop`-only URL
  leaves every `#zoneEditor_*` id out of the DOM — which reads exactly like
  "the field was never added"), and **`window.game` is the six-member
  `BrowserConsole` façade**, not `IGame`: no `player`, so no camera to invert.
  Screen coordinates come from `character.shape.getGlobalPosition()`.
- ⚑ **`elementFromPoint` over open world returns the `#inputAreas` overlay, not
  the canvas** — the full-screen virtual-joystick layer sits above it. A
  canvas-only "is this point clickable" guard called **every** valid point
  covered and skipped the leg. The editor's own `isMapPointerEvent` accepts
  both; the script mirrors it rather than inventing a second rule.
- ⚑ **A `page.click` on a control inside a `hidden` group HANGS rather than
  fails** — `#zoneEditor_spawnDeselect` lives in `#zoneEditor_spawnSelection`,
  which is hidden while nothing is selected, so Playwright waits for visibility
  until the timeout. It presents as a dead run with no output, three legs after
  the actual problem. Every deselect goes through a visibility-guarded helper.
- ⚑ **The zone JSON the editor edits is webpack-BUNDLED, not fetched**
  (`require.context('../../../../../api/zones')`). So a hand-authored level in
  `api/zones/*.json` needs `npm run build` before the editor can see it — the
  **opposite** of C2's probe, which needed a server restart with
  `-content ../api`. Recorded in the script header; getting it backwards reads
  as the whitelist eating the field again.

**Verified:** `tsc --noEmit` clean · **vitest 227/227** (2 new; the round-trip
pin **proven RED first** — it read `undefined` off the export before the
serializer line existed) · `go build ./...` + `go vet ./...` clean and
`world`/`model/mob`/`sys` green, stated as **negatives on purpose: no Go file
changed** (`Spawn.Level` and its validation shipped in C1) · boot
`-content ../api`: 15 factions/87 skills/65 mobs/3 milestones/10 recipes/4
quests/5 props/777 props/485 spawns/5 campfires, **0 panics** ·
**`c3-zone-editor-level` 7/7, 0 console errors** (NEW). ⚑ **No other harness
was run, reasoned:** the diff is confined to `features/zone-editor/` and one
panel partial — no wire, no server, no gameplay surface, and **no `.fbs` touch,
so `hygiene-wire-prune` is not required**. No existing script drives the editor;
that gap is what the new one closes.

### C2 — the wire + the client ✅ `f1d6eebc` 2026-08-05, headless-verified

**The nameplate stopped reading the species catalog**, which is what turns C1's
server-side truth into something a player can see — and it discharges **L3**, so
an overridden spawn may now reach a live zone. Measured at the real surface: a
Stag placed at `level: 25` plates **"Stag 25" in red** (`0xff5555`) while an
untouched Stag of the *same species* plates **"Stag 1" in yellow** (`0xf5d442`),
in one world, in one run. Two levels, one species — exactly what a catalog-fed
plate cannot produce.

- `api/schema/server.fbs` — `level:ushort = 0` appended at the `Mob` table end
  (slot **24**; both binding sets regenerated together, nothing renumbered).
- `model/entity.go` — `Level() int` on `model.MobEntity`, the first edit C1
  predicted.
- `codec/mob.go` — `MobAddLevel(uint16(m.Level()))`, the **effective** level.
- `GameStateMessage.ts` / `EntityManager.ts` / `Mobs.ts` — the snapshot field,
  the feed, and the plate's text + tint switched to the wire with a catalog
  fallback.

**Schema impact: DB NONE · FlatBuffers YES** (one appended field, the banner's)
**· content JSON NONE** — the verify probe was reverted before any rebuild, so
no `api/zones/*.json` changed; C3 still owns the first real placements.

**What the plan did not predict:**

- ⚑ **The plate text is written ONCE, and the tint is not — so the obvious
  `setLevel` ships a half-fix that looks 50 % correct.** `setMobId` early-returns
  on an unchanged id and stamps `nameElement.text` at the end, while the level
  arrives on a *later field of the same snapshot*. A setter that merely stored
  the number would leave every plate catalog-fed **forever** — and the *tint*
  would still be right, because it is recomputed per frame off the cached
  `plateDifference`. Text and tint now both route through one `effectiveLevel()`,
  and the harness asserts them **separately** for exactly this reason. *General
  shape: when two derived views of one value have different refresh disciplines
  — one event-driven, one per-frame — the lazy one is where the staleness hides,
  and the eager one is what disguises it.*
- ⚑ **The snapshot field is `mobLevel`, deliberately not the existing `level`
  slot.** `result.level` is character-only; setting it in the Mob block would
  make `isDefined(entity.level)` newly true for **every mob** and silently widen
  what the character path sees — a §35 one-value-many-homes in the making. A
  distinct field costs nothing and deletes the audit. *C4's "two channels carry
  the same fact" lesson, applied to a channel that did not exist yet.*
- ⚑ **Encoding the EFFECTIVE level, not the raw override, buys the summon case
  for free** — and the codec test proves it: an owned mob with `SetSpawnLevel(25)`
  goes on the wire at its *owner's* 12. Encoding the raw override would have
  plated an unoverridden mob as **"Stag 0"**, which is the visible face of C1's
  sentinel pair. All three branches of `Level()` are one `t.Run` each.
- ⚑ **Widening `model.MobEntity` broke nothing, and that was checked rather than
  assumed:** only `*mob.Mob` implements it concretely, and every test double
  embeds the interface. `go build ./...` was clean on the first try.
- ⚑ **The verify probe needs a REVERT-BEFORE-REBUILD rule, not just a revert.**
  `make -C backend build` runs `cp-defs`, which would have baked the throwaway
  `level: 25` into the embedded content and shipped it in the binary — a content
  edit leaking through a build step that no one thinks of as content. The script
  documents the order (revert, *then* rebuild) and **SKIPs rather than fails**
  when the probe is absent, so a sweep that forgets the install says so instead
  of reporting a product defect. (Its `--install` rewrite happened to match the
  file's existing formatting exactly — a 1-line diff, confirmed before running.)
- ⚑ **`ushort` caps at 65535 while the loader validates `>= 1` with no upper
  bound** (§8.1, deliberate). Nothing near the cap is authorable by accident;
  recorded as a comment on the `.fbs` field so a future cap discussion has the
  fact rather than a surprise.
- ⚑ **§9's client-fallback leg (wire 0 → catalog) needed no test of its own —
  it is the FIRST-FRAME PATH EVERY MOB TRAVERSES.** `setMobId` renders the plate
  while `plateLevel` is still 0, and the level arrives on a later field of the
  same snapshot, so every green plate in every harness run entered through the
  fallback branch and then transitioned off it. That is the same branch a stale
  peer would sit in permanently during a rollout — so the leg is discharged by
  observation, not skipped.
- ⚑ **The revert-before-rebuild hazard is VERIFIED not to have fired, not just
  documented:** the final tree shows `backend/pkg/api/AuraApi/Mob.go` as the only
  change under `backend/pkg/api/` — no embedded `zones/world.json` — which is
  positive proof `cp-defs` never ran while the probe was installed.
- ⚑ **C2 turned §8.2's gray-tint seam from hypothetical into live**, because it
  is the chunk that made the client and the server read the *same* number. What
  remains is two bandings, diverging above player level ~6. Recorded there.
- ⚑ **The zone editor's `cL<n>` suffix was left alone on purpose (L6)** — it
  describes the *species* default, not the placement. Verified by sweep: every
  surviving `curveLevel` reader in the client is either the fallback itself, the
  type declaration, or the editor.

**Verified:** full Go suite **53 packages, 0 FAIL** (33 ok + 20 no-test-files),
including `store`/`accounts` run against `aura_test` via `make db-test` ·
`go build ./...` · `go vet ./...` clean · **3 new codec tests, all proven RED
first** (all three read 0 off the wire before the encode line existed) ·
`tsc --noEmit` clean · **vitest 225/225** · boot `-content ../api`: 15 factions/
87 skills/65 mobs/3 milestones/10 recipes/4 quests/5 props/777 props placed/
485 spawns/5 campfires, **0 panics**. Harnesses, one at a time on a freshly
restarted server: **`hygiene-wire-prune` clean** (645 sprites decoded, 0 console
errors — the mandatory gate for the `.fbs` touch; a renumber shows garbage) ·
**`c2-mob-level` 7/7, 0 console errors** (NEW — the pair above, text *and* tint,
both frames screenshotted) · **`npc-portraits` 4/4 plate-less**, 9/6/9/2 mob
plates as the control, 0 WebGL losses · **`chunk2-follower` 5/5 + 1 SKIP, 0
console errors** — the "owner/**level** plumbing" row, identical to C1's result;
the SKIP is the script's own documented tri-state.

### C1 — the override, server-side ✅ `975e5c4c` 2026-08-05, headless-verified

A spawn point may author `level`, and the mob standing there stands at it —
pool, damage and (through `plan-xp-formula.md` C1) kill XP all follow. Three
production files, and **§3's central claim held exactly**: everything
downstream is already live-derived, so `MaxHealth()`, `PowerScale()`,
`casterPowerScale` and the XP award needed **zero changes**.

- `world/zone.go` — `Spawn.Level *int` (`"level"`, nil = inherit) +
  validation `>= 1`, worded to mirror the species check.
- `model/mob/mob.go` — `spawnLevel` field, `SetSpawnLevel`, and the `Level()`
  branch: `owner ?? spawnLevel ?? definition.CurveLevel`.
- `sys/mob.go` — `spawnPoint.level` carried from the loader, and
  `SetSpawnLevel` + `RestoreToFullHealth` paired in `spawnAt` (L1).

**Schema impact: DB NONE · FlatBuffers NONE · content JSON:** zone files may
now carry optional `spawn.level`; absent is today's behaviour byte-for-byte.
⚑ The banner's "FlatBuffers YES" is **C2's** field, not this chunk's — nothing
here touches the wire.

**No `api/zones/*.json` was edited** (L3): every fixture is inline JSON, so no
overridden spawn exists in a live zone yet.

**What the plan did not predict:**

- ⚑ **L2's premise was VERIFIED rather than inherited, and it survived.** The
  plan argued owner and spawnLevel "never coexist (summons are skill-spawned,
  not point-spawned)" — but charm targets *world* mobs, which are exactly the
  point-spawned ones, so the claim was worth one grep. Charm binds `charmer`,
  **deliberately never `owner`** (`mob.go:549-560`), and the only two
  `SetOwner` call sites are both in `sys/skills.go` (the summon path and the
  camp utility mob). The precedence is safe, and a charmed overridden mob keeps
  the *placement's* level — now pinned by its own test. *This is C4's
  "two channels carry the same fact" lesson applied in the cheap direction:
  the claim was true, and confirming it cost one grep.*
- ⚑ **L1 is fully closed, and that was also checked rather than assumed.**
  `m.health` is the *only* level-derived value stamped at construction —
  `MaxHealth()`/`PowerScale()` are live reads. `SummonPower` was found
  half-frozen once before (entity-model R5), which is the same failure shape,
  so the grep was worth running: nothing else needs a spawn-site repair.
- ⚑ **The `0` sentinel is now a PINNED PAIR, not a coincidence.**
  `Mob.spawnLevel == 0` means "no override" *only because* the loader rejects
  `level: 0`. Both halves are tests, and `Level()` guards on `> 0` (not `!= 0`)
  so a directly-constructed mob that never met the loader falls through to the
  species value instead of returning nonsense. *This is the flight-C3 bug class
  — a sentinel compared against a value that can also be legitimate — headed
  off at authoring time rather than found later.*
- ⚑ **The wiring line needed its own end-to-end test, and the first two tests
  did not provide it.** Both sys tests construct `world.Spawn` directly and
  never reach `parseZone`, so the JSON→`Spawn.Level`→`spawnPoint`→mob chain was
  only covered as two disjoint halves that happened to meet at the same field.
  `TestSpawnPoint_AuthoredZoneLevelReachesTheLiveMob` drives it whole (§9's
  "survives the round-trip into `spawnPoint`") and was **proven red** by
  deleting `level: s.Level`. *This is the silent-wiring class CLAUDE.md records
  as having struck twice; the honest test is the one that starts at the
  authored text.*
- ⚑ **Every pin was proven RED before it was allowed to be green** — the fill
  dropped from `spawnAt` (L1), the precedence swapped (L2), the carry line
  deleted (the wiring seam). A pin that has never failed is a claim, not a test.
- ⚑ **A C2 blocker found early: `Level()` is not on `model.MobEntity`.** The
  sys tests type-assert to `*mob.Mob` to read it, which is fine here — but
  `codec/mob.go` encodes against the interface, so **exposing `Level()` there is
  C2's first edit**, not a mid-chunk discovery.
- ⚑ **§3.4 contains a promise the code cannot keep, and it is C3's to fix.**
  "Until that ships the PO can author `level` by hand in the zone JSON" is
  **false through the editor**: `ZoneModel.toJSON` (`ZoneModel.ts:271-287`) is
  an explicit field whitelist, so opening and saving such a zone silently
  **deletes** the override — data loss, not cosmetics. `fromJSON` spreads and
  would preserve it; only the serializer drops it. Harmless today because L3
  bars overridden spawns from live zones until C2, but C3 must add
  `ZoneSpawn.level` to **both** halves, and the hand-authoring window should be
  treated as closed until it does. (The same whitelist is why a hand-authored
  campfire `id` could be dropped — the file already carries that warning.)

**Verified:** full Go suite **53 packages, 0 FAIL** · `go build ./...` ·
`go vet ./...` clean · **~11 new Go tests** (the `Level()` precedence table
including the charm and owner pins, the pool computed both ways, the L1 fill,
variance-composes-with-override, the loader tri-state + the `level: 0`
rejection, the respawn carry, and the end-to-end authored-JSON seam) · boot
`-content ../api`: 15 factions/87 skills/65 mobs/3 milestones/10 recipes/4
quests/5 props/777 props placed/485 spawns/5 campfires, **0 panics** · **`chunk2-follower` 5/5 + 1 SKIP, 0 console errors, 0 WebGL losses** — the one row in the `verify` coverage map this chunk owns ("owner/**level** plumbing", since `Level()` changed); its SKIP is the script's own documented tri-state, the companion dying at a deliberately hot venue. ⚑ The first attempt timed out in `joinAsNewCharacter` and did **not** reproduce — the account panel was confirmed rendering (384×545, unhidden) on a fresh probe and the re-run was clean; recorded so the next person does not chase it. No other harness re-run, reasoned: no wire, no client, and no zone content changed.
