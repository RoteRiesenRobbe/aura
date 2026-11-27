# Plan: Playtest versions: a harder version B, swapped in halfway through a playtest

**Status: APPROVED 2026-11-27 (planning session, PO in chat). R1-R5 RULED, D1-D7 approved,
nothing built. ⭐ NEXT IN LINE: PV1 runs next, ahead of PF6 (PO 2026-11-27).** Open PO calls in §7 (Q1, the playtest date, first). 3 chunks (§5); PV1 is the next chunk to
execute; PF6 follows the PV chunks.

**Owns:** the version switch (how live goes from A to B and back), the mob difficulty
multipliers, crowd scaling, its state glyph, the swap runbook.
**Builds on:** the mob threat table (`archive/plan-mob-depth.md`, chunk 3a), the
`damageDealt` / `damageReduction` stat fold (`archive/plan-effect-types-round-2.md` C1), the
medallion state glyphs (`plan-entity-presentation.md` EP1-EP3), the conf setter pattern
(`mob.SetHealthGainTick`), `devops/deploy.sh` and `plan-playtest-deploy.md`.
**Amends:** `plan-vertical-slice.md` D9 (the release checklist gains the swap, D6 here).
VS-R10 (present content, hardcode nothing for the playtest) binds it: B is generic tuning,
not a "playtest mode".
**Schema (as designed):** DB none · wire +1 `applied_effects` bit VALUE (bit 15, no new
field) · conf +5 optional keys under `game.mob` (absent = A) · content none · lang +2 keys
EN + DE (the glyph's tooltip) · icons +1.

⚑ Line references pinned 2026-11-27 at `f53d9394` (main); re-verify before relying on them.

---

## 1. What this is

The PO wants two versions of the game for one playtest (PO, 2026-11-27): **A** is the
current game; **B** is "much more difficult" and, if it can still be built, has mobs that
"scale up in their effectiveness with more combatants surrounding it or impacting it".
Halfway through the playtest, depending on the feedback, B can be deployed instead of A.

So the requirements are: B must be ready and rehearsed before the playtest; the swap must
be one quick, boring deploy; going back to A must be just as safe; and feedback must be
attributable to A or B.

⚑ **The tension, stated once:** crowd scaling pushes against GDD "players filling roles for
each other is essential". That is the experiment, not a defect: B tests whether groups
still feel good when a crowd makes a mob stronger. Read B's feedback with that in mind.

### 1.1 What already exists and is reused

- **Two deploy modes** (`devops/deploy.sh`): full (builds backend + frontend, ships
  `devops/conf.json`) and `--content-only` (rsyncs `api/`, no conf, no code). Both restart
  `aurad` for a few seconds; characters persist (PostgreSQL), the shutdown flushes them.
- **The live conf is five keys** (`devops/conf.json`); every key it leaves out falls back
  to a default. ⚑ The default is set in code, not by merging `conf.default.json`:
  `cfg.ParseConfig` (`cfg/conf.go:166`) unmarshals into a zeroed struct and then defaults
  each knob (`if x <= 0 { x = default }`, §35 D1). A new key without such a line reads as
  0, so D2's factors need one each (absent → 1); the crowd keys are off at 0 already.
- **A package-level conf setter for mobs:** `mob.SetHealthGainTick(config.Game.Mob.HealthGainTick)`
  (`backend/cmd/aurad/aurad.go:160`), logged at boot (`aurad.go:173`). The difficulty keys
  follow it.
- **A mob's pool:** `Mob.MaxHealth()` = `baseMaxHealth × PowerScale() × MaxHealthFactor()`
  (`model/mob/mob.go:2040`).
- **A mob's outgoing damage:** `casterDamageFactor` (`sys/skills.go:924`) multiplies every
  direct, instant and dot damage base by the acting entity's `EffectiveStats().DamageFactor()`,
  never heals or CC. Mobs implement `EffectiveStats()` (`mob.go:2235`).
- **A mob's incoming damage:** `takeDamage` already multiplies by
  `EffectiveStats().DamageReductionFactor()` (`mob.go:2126`).
- **The threat table:** every hit on a mob and every healer-threat write lands in
  `m.threat` through `noteThreat` / `NoteThreat` (`mob.go:1769`), one row per source.
  A row leaves when its entity dies (`pruneDeadThreat`, `mob.go:1813`), disconnects
  (`ForgetEntity`, `mob.go:1899`) or detaunts (`DropThreat`, `mob.go:1871`); the whole table
  clears on a combat reset (`resetAggro`, `mob.go:1676`). A living player who walks away
  stays on it. A summon's hit names the summon, so summons have their own rows.
- **The simharness runs the real mob and skill code** (`sim/world.go:116` `sys.NewSkillSystem`,
  `:176` `mob.NewMob`) but reads no conf: its knobs are flags mirroring conf
  (`cmd/simharness/main.go:95-101`).
- **State glyphs:** `applied_effects` (ushort on `Mob` and `Character`) has 15 bits in use
  (`skills/applied_effects.go:16-42`); **bit 15 is the last free one**. The bit table is
  shared Go ↔ TS through `api/shared-constants.json` (`appliedEffectBits`), pinned by
  `backend/cmd/aurad/shared_constants_test.go` and `frontend/src/client-data/SharedConstants.test.ts:160`;
  the client enum is `TokenState.ts` `AppliedEffectBit`.

Nothing in the codebase counts combatants today, and there is no global mob difficulty knob:
mob difficulty is authored per species (base HP, skill numbers, tier) plus the spawn levels
in `world.json`.

## 2. PO rulings (2026-11-27)

- **R1 - Two versions, B deployable halfway through a playtest on the feedback.** A = the
  game as it is; B = much more difficult, with crowd-scaling mobs if it can be built in time.
- **R2 - The crowd is the mob's attackers: players on its threat table.** Not bodies in a
  radius, and summons do not count. ⚑ Correction to the reason given when this was asked:
  the threat table does not fully keep passers-by out. Auras tick automatically on anything
  in range, so a player walking past with a damage aura on lands on the table without
  meaning to, and stays counted while alive (§1.1). R5 rules it.
- **R3 - "Harder" is a hidden multiplier on mob damage and mob HP.** Shown levels, kill XP
  and the map stay as in A, so `world.json` (the coworker's during CW, VS-R28) is untouched.
  The numbers are placeholders.
- **R4 - Players see the scaling as one state glyph** on the mob's medallion, using the last
  free bit of `applied_effects`. No stack count (that would be a wire change).
- **R5 - A passer-by drops out after a few seconds (Q8).** Only players whose last threat
  write on the mob is recent count (`5 s` `[PLACEHOLDER]`), so walking past a fight cannot
  keep it harder. Costs one timestamp per threat row.

## 3. Design

### D1 - One build, two confs

Both versions run the **same code from main**. Every line of new code ships early,
dormant in A. **B is a block of values in the live `devops/conf.json`; without the block the
server is A.** Swapping to B is one commit that adds the block, then a full deploy; swapping
back is one commit that removes it, then a full deploy. A and B are therefore two commits
that differ only in `devops/conf.json`, so the commit stamp also tells them apart.

What it deliberately leaves alone: `api/` (no forked content tree while CW edits
`world.json`), `conf.default.json` and every local conf (dev, harnesses and the simharness
guardrails keep seeing A and stay green), the commit-to-main rule (no `version-b` branch),
the database (nothing B-only is ever persisted, so B → A is safe at any time).

Rejected: B as different mob numbers in `api/` on a branch, deployed `--content-only`. It
forks `api/` against CW, turns `guardrail_test.go` red on that branch, and needs a branch.

### D2 - The difficulty multipliers

Two conf keys, both default `1`:

```json
"mob": { "damageFactor": 1.5, "healthFactor": 1.5 }
```
(`[PLACEHOLDER]` values for B; A omits them.)

- `healthFactor` multiplies `Mob.MaxHealth()`.
- `damageFactor` multiplies the mob's outgoing damage at `casterDamageFactor` (direct,
  instant and dot bases), never heals, shields or CC.
- **Who gets them:** mobs whose **definition** faction is hostile to players and that have
  no player owner. Player summons and companions are Mobs too and stay as they are; the
  friendly NPCs and guards stay as they are; a charmed mob keeps the factor it spawned with
  (read from the definition, not the live faction, so a pool never jumps mid-fight).
  ⚑ That set includes the gated harvestables (Bramble, Rockfall, Turnip, Beet, Seaweed,
  both mushrooms load as `FactionHostile`) and the hostile structures (totems, the war
  banner, barricades, the web), so `healthFactor` would also slow harvesting. Q9.
- Both factors reach the simharness as two flags (`-mob-damage-factor`,
  `-mob-health-factor`) calling the same setter, so D7 can measure B (the sim reads no
  conf, §1.1).
- **Not through `PowerScale()`.** That is the level curve; it also feeds summon output and
  the simharness, and folding a second factor into it is the double-application trap
  (L1).

Kill XP does not change (R3), but fights take longer, so XP per hour drops in B. That is part
of "harder"; the rehearsal (D7) measures it.

### D3 - Crowd scaling

One rule: **a mob deals more damage for each extra player on its threat table.**

```
attackers = distinct live PLAYERS on the threat table whose last threat write is
            within crowdWindow (R5; summon rows, NPC rows excluded)
bonus     = min((attackers - 1) × crowdPerAttacker, crowdCap)
```

- `crowdPerAttacker` `0.25`, `crowdCap` `1.0` (= +100 % at 5 attackers) `[PLACEHOLDER]`;
  both default `0`, which is A.
- The bonus feeds `damageDealt` in `Mob.EffectiveStats()`, so it composes with the existing
  fold and every damage site picks it up through `casterDamageFactor`. It multiplies with
  D2's `damageFactor`.
- **The count is recent, the table is not (R5):** the threat table keeps its meaning (rows
  stay until death, disconnect, detaunt or reset; threat and retention are untouched). Each
  row gains a `lastTick` written by `noteThreat`, and only the count reads it: a player whose
  last hit or heal is older than `crowdWindow` (`5 s` `[PLACEHOLDER]`, in ticks) stops
  counting, so a passer-by drops out soon after leaving.
- **A healer counts** (healer threat writes a row). That follows from R2's one rule; Q4
  asks whether the PO wants it.
- Same mob set as D2: hostile by definition, no player owner.
- The count is recomputed at most once per tick per mob (a small cached int), not per damage
  read.

### D4 - The crowd glyph

`AppliedEffectCrowd = 1 << 15` is set on a mob while its D3 bonus is above 0, and cleared
when it drops to 0. It is a mob STATE bit like stun, not a payload bit. The client draws
one glyph at a reserved angle outside the medallion ring (the EP rules), from the PONETI
pack (`feedback_always_use_icon_pack`), with a game tooltip (`hud.state.crowd.*`, EN + DE).

⚑ This fills the ushort: the state after it widens the field, which is a wire change
(`plan-entity-presentation.md` ⚑). The alternative that keeps bit 15 free is Q5.

### D5 - The boot log says which version is live

The boot log prints the four keys beside `mob.healthGainTick` (`aurad.go:173`). The deploy
check (`journalctl -u aurad -n 25`, already in `deploy.sh`) then shows A or B without a new
tool. No cheat, no endpoint (YAGNI).

### D6 - The swap runbook

A section in `plan-playtest-deploy.md` (and a line in VS D9's checklist):

1. Before the playtest: B's block is written into the runbook itself, ready to paste.
2. At the swap: add the block to `devops/conf.json`, commit only that file
   (`chore(playtest): version B live`), push. The tree must be clean apart from it:
   `deploy.sh` builds the working tree, which other sessions share, and the deploy skill
   stops on a dirty tree.
3. `ANNOUNCE` the restart, run the **full** deploy (never `--content-only`: it does not
   carry conf), check the boot log for the B values (D5).
4. Record the swap time (UTC) and the B commit in the playtest's feedback intake
   (`docs/feedback.md`) and the ledger; bug reports (`bug-reports.jsonl`) carry timestamps,
   so they split by it.
5. Back to A: the same, with a commit that removes the block.

### D7 - The rehearsal

Before the playtest: boot locally with B's conf, play one fight solo and one with three
harness players, swap back to A, and measure A vs B in the simharness with D2's two flags
(TTK, TTD, XP per hour at two levels). The sim fights one player against one mob, so crowd
scaling is measured by the harness leg only. The numbers go into the ledger so the PO picks B's values from data.

## 5. Chunks

Order: PV1 is next in line, ahead of PF6 (PO 2026-11-27, approving the plan); independent of
CW (no `world.json` edit). Each chunk is one session and ships on its own. **If the date
runs short, B ships with PV1 alone** (difficulty without crowd scaling); PV2 is the part R1
says "if we can still build it".

| # | Chunk | Contents | Size |
|---|---|---|---|
| **PV1** | Difficulty multipliers | D2 + D5: `game.mob.damageFactor` / `healthFactor` (defaulted to 1 in `ParseConfig`), the mob set, two simharness flags, the boot log | S |
| **PV2** | Crowd scaling + glyph | D3 + D4: the attacker count, the `damageDealt` bonus, bit 15, the client glyph + tooltip | M |
| **PV3** | Runbook + rehearsal | D6 + D7: the runbook in `plan-playtest-deploy.md`, the local rehearsal, the A/B numbers | S |

**PV1** needs nothing first. Ships dormant in A (a full deploy; it can ride PF6's).
Schema: DB none · wire none · conf +2 optional keys · content none.
In-game (PO): boot locally with `healthFactor 2`: a wolf has twice the pool, a guard and
your companion do not; with `damageFactor 2` the wolf hits twice as hard; without the keys
everything is as today.

**PV2** needs PV1 (it reuses the mob set). Ships dormant in A.
Schema: DB none · wire +1 bit value (bit 15) · conf +3 optional keys · content none · lang
+2 keys EN + DE · icons +1.
In-game (PO): with `crowdPerAttacker 0.25`, fight a mob alone (no glyph, normal damage), then
with two more players (glyph on, harder hits), a summon alone does not light it, the glyph
goes off after a reset.

**PV3** needs PV1 (PV2 if built). Docs + a measurement, no production code.
Schema: none.
In-game (PO): the rehearsal itself: A → B → A locally, one character throughout.

## 6. Test strategy

- **Go, red first.** PV1: `TestMobDifficulty_AbsentKeysAreNeutral`,
  `_HealthFactorScalesTheHostilePool`, `_DamageFactorScalesDamageNotHeals`,
  `_PlayerSummonIsUntouched`, `_FriendlyNpcIsUntouched`, `_CharmedMobKeepsItsSpawnFactor`;
  a conf parse test (absent → 1). PV2: `TestCrowd_OneAttackerNoBonus`,
  `_ThreeAttackersTwoSteps`, `_CapHolds` (the boundary at exactly cap/step attackers),
  `_SummonRowDoesNotCount`, `_DeadAttackerDropsOut`, `_StaleAttackerDropsOutAtTheWindowTick`, `_ResetClears`, `_HealerCounts`,
  `_BitFollowsTheBonus`, and an alloc pin (the idle-loop `*_alloc_test.go` discipline).
- **The shared bit table:** `shared_constants_test.go` + `SharedConstants.test.ts` fail
  until bit 15 is in `api/shared-constants.json` and `AppliedEffectBit`; a vitest for the
  glyph mapping beside `StateIndicators.test.ts`.
- **Guardrails:** `cmd/simharness/guardrail_test.go` stays green untouched (A is the default).
- **Harness:** a `verify` leg booted with B's conf: three players on one mob, read the glyph
  bit off the wire; with GOD off (L8).
- **Measurements for the ledger:** PV3's A/B table (TTK, TTD, XP/h at two levels).
- **Full tail:** `go -C backend test -timeout 60s ./...` (scan every FAIL), vitest,
  typecheck, `aurad -validate`, `lang-status` 0.

## 7. Open PO calls

- **Q1 - When is the playtest, and when would the swap happen?** Decides whether PV2 fits.
  Proposed: PV1 + PV2 deployed dormant at least one deploy before the playtest.
- **Q2 - Does the crowd raise damage only, or also damage reduction?** Proposed: damage only
  (one stat, one read).
- **Q3 - Do bosses and elites scale too?** Bosses are where groups are designed to gather.
  Proposed: every hostile mob, one value (B is meant to be harder); the alternative is
  normal tier only.
- **Q4 - Does a healer count as an attacker?** Proposed: yes, they are on the threat table
  (R2's rule, no exception).
- **Q5 - A new bit 15 or the existing StatUp glyph (bit 8)?** R4 picked the last free bit.
  StatUp already means "this mob is buffed", costs no bit and keeps bit 15 for the next
  state. Proposed: keep R4 unless the PO prefers to save the bit.
- **Q6 - B's starting values.** Proposed: `damageFactor 1.5`, `healthFactor 1.5`,
  `crowdPerAttacker 0.25`, `crowdCap 1.0`; PV3 measures them first.
- ~~**Q8 - A passer-by on the threat table (R2 ⚑): accept, or drop them?** (a) Accept: one
  rule, no new bookkeeping; a player walking past with an aura on can make a fight harder
  until they die or the mob resets. (b) Count only players whose last threat write is
  recent (`5 s` `[PLACEHOLDER]`): one timestamp per row, and a passer-by drops out
  soon after leaving.~~ RULED 2026-11-27: R5, (b).
- **Q9 - Do harvestables and hostile structures get D2's factors?** Proposed: exclude every
  mob a player can never damage with a combat aura (the immune-targets discriminator,
  `archive/plan-immune-targets.md`), so harvesting is as in A; totems, banner, barricades
  and the web stay in (they fight).
- **Q7 - Are testers told what B changes?** Proposed: announce a restart only, so the
  feedback on B is unprompted.

## 8. Landmines

- **L1 - `PowerScale()` is the level curve.** It feeds summon output through one call
  (the `mob.go:1117` comment: applying it twice is its landmine L3). The difficulty factor lives
  beside it, never inside it.
- **L2 - Player summons and companions are Mobs.** A filter on "is a Mob" scales the
  player's own companion; filter on the definition faction and the owner.
- **L3 - Bit 15 is the last.** The next state after it widens `applied_effects`, a wire
  change. The bit table has three homes (Go, `api/shared-constants.json`, `TokenState.ts`),
  pinned both ways.
- **L4 - `--content-only` does not carry conf.** The swap is always a full deploy. The
  live conf is `devops/conf.json` (the fifth conf file); B's values never go into
  `conf.default.json` or any local conf.
- **L5 - A full deploy builds the working tree.** Other sessions share it: a clean tree at
  the swap, or uncommitted work ships in B.
- **L6 - The live DB is not backed up.** B → A stays safe only while nothing B-only is
  persisted; keep it that way (no B-only skill, item or quest).
- **L7 - R5's window belongs to the count, not the table.** Never expire threat rows to
  get it: retention, leash and the dormancy wake (`dormancy.go:98`, `len(m.threat) > 0`) read
  the table. Healer threat writes the timestamp too (it is a threat write).
- **L8 - GOD skips `takeDamage`.** Test damage scaling with GOD off.
- **L9 - A content edit does not invalidate the Go test cache** (`-count=1`), and mob tests
  read the embedded copy without `-content ../api`.

## 9. Schema impact

- **DB:** NONE. Nothing new is persisted; B is a server conf.
- **Wire:** +1 `applied_effects` bit value (bit 15) in PV2; no new field, no hard refresh
  needed (shipped before the swap). PV1 and PV3: none.
- **Conf:** +5 optional keys under `game.mob` (`damageFactor`, `healthFactor`,
  `crowdPerAttacker`, `crowdCap`, `crowdWindow`); absent = A.
- **Content:** NONE. **Zone format:** NONE. **Lang:** +2 keys EN + DE (PV2). **Icons:** +1 (PV2).

## 10. Cross-references

`plan-vertical-slice.md` (D9 checklist, R10, R28 `world.json` ownership),
`plan-playtest-deploy.md` (ops quick-ref; receives D6), `plan-entity-presentation.md` (state
glyph rules, the free bit), `archive/plan-mob-depth.md` (threat table),
`archive/plan-effect-types-round-2.md` (stat fold), `gdd.md` multiplayer (roles).

## 11. Chunk ledgers

(none yet)
