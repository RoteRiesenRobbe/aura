# Plan: One species, many levels — the per-spawn level override

> **Status: DESIGNED 2026-08-05, no chunk built.**
> Ratifies backlog §38 (PO ask 2026-07-29: *"I want to be able to author a
> single mob in all levels — so be able to spawn the same wolf on level 1 and
> level 30"*). A spawn point may author a `level`; the mob placed there stands
> at it — HP, damage and (once `plan-xp-formula.md` lands) kill XP all follow
> automatically, because all three already derive live from `Mob.Level()`.
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

### 3.3 Wire + client: the nameplate must stop reading the catalog

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

- `ZoneSpawn` (`ZoneModel.ts`) gains optional `level`; the spawn tool panel
  gets a number field (blank = inherit). Until that ships the PO can author
  `level` by hand in the zone JSON — the loader accepts it from C1 on.
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
- Kill XP today: `tryGrantKillRewards` (`mob.go:1997`) reads the flat
  `Factors.Experience` — the exact line the sibling plan replaces.
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
5. **Ordering constraint (the only one):** the *mechanisms* are independent
   and can be built in either order or in parallel — but **no overridden
   spawn should be placed in a live zone before the XP formula's C1 ships**,
   or the band rule breaks for real players in exactly the way §38 predicted
   (a farmed high-level wolf paying gray-level XP, or worse, a low-level
   wolf paying its species' high authored value). Placement is C3 here;
   gate it on `plan-xp-formula.md` C1, not on its C2 calibration.

Non-interactions, checked so nobody re-checks them: the XP plan renames
`factors.experience` → `xpFactor` and re-derives `CombatTarget` — species-def
territory this plan never touches. This plan's wire field carries the level;
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
- **C3 — the editor field + first placements.** `ZoneSpawn.level` + spawn
  tool panel input · PO places the first real overridden spawns. **Gated on
  `plan-xp-formula.md` C1 being live** (§6.5).

## 8. Open questions & deferred

1. **Upper bound on `level`.** Species `curveLevel` has no cap today and the
   player maxes at 30 (conf-owned, not loader-visible). Proposal: validate
   `>= 1` only, matching the species check — a >30 mob is a legitimate
   "unkillable for now" authoring tool. Flag, don't block.
2. **Gray tint vs. gray XP** — the shared seam, §6.4. Owned by the
   cross-plan check, decided when both mechanisms exist.
3. **Simharness stays species-keyed** — deliberate. The harness balances
   *species at their curve position*; placement is a zone-authoring concern.
   If a specific overridden encounter ever needs balancing there, that is
   new plumbing and a new ask.
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
- **L3 — C1 without C2 ships lying nameplates.** The catalog-fed plate/tint
  shows the species number for an overridden mob — an "easy to miss" client
  half called out by §38 from the start. Chunks may land separately, but no
  overridden spawn reaches a live zone before C2 (and per §6.5, before the
  XP formula's C1).
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
