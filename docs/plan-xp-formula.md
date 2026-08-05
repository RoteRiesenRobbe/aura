# Plan: Kill XP becomes a formula — level-relative XP

> **Status: C1 BUILT 2026-08-05 (`37668bc3`, headless-verified, §10) — C2 open.**
> Replaces the flat authored per-mob `experience` value with a computed,
> level-relative award — WoW-Classic-shaped, anchored to the *recipient's*
> level. Every number is [PLACEHOLDER] unless marked.
>
> ⚑ **Schema impact: NONE. No migration, no wire change.** The award is
> computed server-side at kill time; the DB stores only the player's XP total
> and the client only ever sees totals. Verified in §5, not reasoned.

## 1. What this is

Today a mob kill fans out one flat authored number
(`factors.experience`) to every combat participant, regardless of anyone's
level (`model/mob/mob.go` `tryGrantKillRewards` → `rewardPlayer`). That
enables the two failure modes this plan closes (PO 2026-08-05):

1. **Pull-through:** endgame mobs must pay large XP to match the exponential
   level-up requirement (300 × 1.2^(L−1)), so a low-level player tagging along
   at an endgame kill — and the `NotePresence` bystander path grants **full**
   XP for standing near a fight with an active aura — levels absurdly fast.
2. **Gray farming:** an endgame player can farm the starting area forever,
   because a rabbit pays them exactly what it pays a level-1.

The fix is the WoW Classic core trick: **kill XP is a function of the
recipient's own level**, modulated by the level *difference* to the mob —
computed **per participant** inside the existing reward fan-out. There is no
mob in the world whose kill can be worth more than a bounded multiple of your
own at-level kill, and mobs far below you pay nothing.

**This is an economy retune, not just an exploit patch** — the PO chose the
full formula over a cap-on-authored-values variant, knowing it discards the
Session-⑥ kph calibration as the source of XP values. The authored absolute
`experience` numbers stop existing as a balance input (§3.4 keeps a relative
per-species factor).

## 2. Decision ledger — PO rulings 2026-08-05

Taken as choice prompts in the design conversation (after a WoW-Classic
mechanics walkthrough was requested and given):

- **D1 — full formula, anchored to the recipient.** Kill XP is computed:
  `base(participantLevel) × Δ-modifier × tier multiplier × species factor`.
  The alternatives — keeping authored XP with an own-level cap, or an
  effective-level clamp via the power curve — were declined. Each participant
  is evaluated against **their own** level, which is what closes the
  pull-through: the carried level-3 gets a bounded multiple of *their*
  at-level pay, whatever dies.
- **D2 — the low side tapers to exactly zero.** Linear taper to 0 as the mob
  falls below the recipient; at/below the gray threshold a kill pays nothing
  (not a token floor, not a hard cliff at full value).
- **D3 — mob kill XP only.** Quest `grant_xp` rewards (e.g. the 400 XP
  `wolves-on-the-road` legs) and the XP cheat stay flat authored/typed
  amounts. Quests are one-shot at roughly their zone's level — no farming
  loop to close. `AddExperience` remains the single front door for all of it.

### Taken during C1 (2026-08-05)

- **D4 — `xpFactor` is a free per-species knob, and the Turnip ships at 0.05.**
  Asked whether C1 should apply §3.4's migration rule mechanically (which would
  have made a harvest vegetable pay a **full at-level kill** — it authored
  `experience: 1`, and "any non-zero value drops the key" defaults to 1), the PO
  ruled the knob must be able to take *any* value on *any* species, zero
  included, and picked 0.05 for the Turnip. So C1 pulls forward the one
  curation §3.4 names by example; the rest of the exception list (the kite mobs)
  is still C2's. ⚑ It is per **species**, not per spawn — a single placement
  cannot be zeroed today, which is backlog §38's axis, still untaken.
- **D5 — the min-1 floor is gated on `xpFactor > 0`, not only on `mod > 0`.**
  §3's `min 1 while mod > 0` under-specifies against §3.4's `0 = pays nothing`:
  read literally, every NPC, structure, totem and summon in the game would pay
  1 XP per kill. The floor exists for L4 (a positive-but-tiny product must not
  round to zero and make "almost gray" read as gray), and an authored 0 is not
  that case. Both zeros are pinned.

- **D6 — the gray band STAYS at `5 + P/6` for now; the symptom is content, not
  formula.** Playing C1, the PO reported that "very little worthwhile enemies
  give relevant XP" and that "even mobs 10 levels below can still be
  challenging in mass", and proposed widening the band so a 10-level gap still
  progresses. The roster survey (§11) says the band is not what is broken:
  **at level 20, exactly two rungs of the 36-species roster pay anything** —
  cL18 and cL20 — because the species cluster at cL1–7 and **cL13–17 is
  completely empty**. Widening the band would paper over that hole and would
  then be too generous once the hole is filled. Ruling: leave the band, make
  sure the knob is cheap to turn later. It is — `game.player.killXP.grayBase`
  / `.grayStep` are conf fields; **edit `backend/conf.json` and restart, no
  rebuild** (verified end to end 2026-08-05: `grayBase: 11` reached the boot
  log, then reverted). The requirement itself — "10 levels of difference should
  still lead to some progress" — is **recorded, not discarded**: it is the
  acceptance test for whoever turns the knob, and the candidate shapes are
  costed in §11.

## 3. The formula

All shapes final in structure, all constants [PLACEHOLDER]:

```
award(P, mob) = round(base(P) × mod(Δ) × tier(mob) × xpFactor(mob))   min 1 while mod > 0
base(P)       = killXPBase × killXPGrowth^(P−1)          P = recipient's level
Δ             = mob.Level() − P

Δ ≥ 0 (mob at/above):  mod = 1 + 0.05 × min(Δ, 4)        bounded bonus, WoW's +5 %/level
Δ < 0 (mob below):     mod = max(0, 1 + Δ/ZD(P))         linear taper, 0 at Δ = −ZD (gray)
ZD(P)         = 5 + ⌊P/6⌋                                gray distance widens with level
tier          = normal 1 · elite 2 · boss 5
```

### 3.1 Why an exponential base, not WoW's linear `L×5+45`

The level-up requirement is exponential (`levelUpXPBase 300 ×
levelUpXPGrowthFactor 1.2^(L−1)`, maxLevel 30). A linear kill base would make
kills-per-level explode with level. **The sim harness already models the
right shape**: `sim.XPModel.KillXP = killBase × killGrowth^(T−1)` with
defaults `killBase 40, killGrowth 1.2` — and its own doc comment states the
governing property: *killGrowth = levelUpGrowth means flat kills-per-level
across the span* (~7.5 kills at the defaults). This plan promotes that model
from the tool into the game. Setting `killXPGrowth` slightly below
`levelUpXPGrowthFactor` is the one knob that makes later levels slower —
a C2 calibration/PO call, not a structural one.

### 3.2 What each end looks like (defaults above, for feel only)

- **At level, any level:** every mob is worth `base(P)` × tier — ~7.5 normal
  kills per level, flat across the whole span. Group play unchanged: all
  participants still receive their full (own-level) amount; there is no split.
- **Carried level-3 at a level-23 boss kill:** `base(3) × 1.20 × 5` ≈ 346 —
  about 0.8 of a level at L3, once. Today the same kill pays the authored 600,
  and repeating it is the fastest thing a level-3 could possibly do; under the
  formula repeating it is ~4 at-level kills' worth per boss.
- **Level-30 farming rabbits (Δ = −29, ZD = 10):** mod = 0. Nothing, forever.
  A level-12 clearing the level-6 forest (Δ = −6, ZD = 7): mod = 0.14 — fading,
  not yet gray.

### 3.3 `Mob.Level()` is already the right left operand

`model/mob/mob.go:878` — a world mob stands at its authored `curveLevel` (the
same shared f(L) curve position that scales its HP and skill output), an
**owned** summon stands at its owner's live level. No new authoring, and the
owned case does the right thing unprompted.

### 3.4 `experience` → `xpFactor` (the species knob survives, relative)

Pure WoW pays every same-level mob identically — WoW can, because its
per-level mob HP is roughly uniform. Aura's is not: species at the same
curveLevel differ wildly in authored TTK (turnip vs. saber-tooth cat, both
curve 1, authored 1 vs 35 XP). A pure formula would make the fastest-dying
species at your level the only rational farm and pay full kill XP for
harvest vegetables. So one relative knob survives:

- `factors.xpFactor` (float, absent → 1, `0` = pays nothing) **replaces**
  `factors.experience` outright.
- Migration rule for the ~36 existing defs: `experience: 0` → `xpFactor: 0`
  (NPCs, structures, totems, summons, camps, signs); everything else drops the
  field (default 1). Curated exceptions are C2 tuning: harvest species low
  (turnip ~0.05), and the **Session-⑥ kite rule survives here** — "kite mobs
  author xpFactor 0.5" replaces "kite mobs author half the kph value".
- `CombatTarget` (nameplate path) re-derives from `xpFactor > 0` — see L1.

## 4. Current state — the facts the plan stands on

- **Award site:** `tryGrantKillRewards` (`mob.go:1992`) reads
  `definition.Factors.Experience` once and hands the same number to every
  credited participant via `rewardPlayer`. The change point is exactly there:
  compute per participant inside `forEachCredited`.
- **`Factors.Experience` has two real consumers**, verified by grep:
  the award site, and `items/mobs/catalog.go:63` deriving
  `CombatTarget: Experience > 0 && !FriendlyToPlayers` for the `/mobs`
  nameplate catalog. Nothing on the wire, nothing in the DB, nothing in the
  frontend reads the raw value.
- **Two different growth constants exist — don't conflate them** (this plan
  nearly did): the *power* curve locked in CLAUDE.md is **1.12** (f(L), HP and
  skill output); the *XP requirement* curve is **1.2** (`levelUpXPGrowthFactor`).
  The new `killXPGrowth` calibrates against the latter.
- **Hot-path note:** `plan-server-performance.md` chunk 0 made the XP-to-next
  table an eagerly-built cache because *encoding* reads it per viewer per
  tick. The kill formula runs only at death-reward time — cold path, no
  interaction.
- **Backlog §38** (per-spawn level override) is untaken: mob level is per
  species. The formula makes `curveLevel` more load-bearing than before —
  a mis-authored curveLevel now mis-prices XP too, and §38 gets more
  attractive but is *not* pulled in here.

## 5. Schema impact (stated per the standing rule)

**NONE.**

- **DB:** untouched. `characters.experience` stores the accumulated total as
  before; the formula changes only the increments. No migration.
- **FlatBuffers:** untouched. Kill XP was never on the wire; clients receive
  the updated total in the existing player state.
- **Content JSON:** `factors.experience` → `factors.xpFactor` across
  `api/mobs/*.json` (mechanical, §3.4 rule) + loader validation. Requires
  `cp-defs`/rebuild as any content change does.
- **conf.json:** new keys next to `levelUpXPBase` — `killXPBase`,
  `killXPGrowth`, `killXPUpBonus`, `killXPUpCap`, `killXPGrayBase`,
  `killXPGrayStep`, tier multipliers. ⚑ Five conf files exist and the fifth
  is the live server's (§35 record) — deployment must carry the block or the
  server boots on Go zero values; the loader should default sanely (L5).

## 6. Chunk breakdown

Two chunks, buildable in one execution session each.

- **C1 — the formula, wired.** New shared package (proposal: extend
  `pkg/aura/curve` with a `KillXP` type, mirroring how `sim.Curve` aliases
  `curve.Curve` so the harness is structurally incapable of drifting — the
  sim's `XPModel` then consumes it). Pure function, TDD table tests first
  (§7). Wire into `rewardPlayer` per participant; config block; `xpFactor`
  replaces `experience` in the loader **with a hard-fail on the legacy key**
  (L2) + the ~36 JSON migrations; `CombatTarget` re-derivation (L1); the
  gray-kill pins (L3). Full Go suite + vitest + a headless verify pass.
- **C2 — calibration + PO feel pass.** Run the simharness kills-per-level
  battery against candidate `killXPBase`/`killXPGrowth`/tier values; decide
  the pacing question §8.1 with the PO; curate the `xpFactor` exceptions
  (harvest species, the kite list); in-game pass at both ends (fresh level-1
  at spawn; SKILL/WARP-cheated high level farming grays and tagging an
  endgame kill). Numbers may lose [PLACEHOLDER] here or stay tuning-open.

## 7. Test strategy

- **Formula table tests** (pure, no ECS): at-level identity across L1–30 ·
  the upward bonus and its cap · taper values including the exact gray zero ·
  ZD widening · tier multipliers · `xpFactor` 0 and fractional · rounding
  floor (min 1 while mod > 0, exact 0 at/past gray).
- **Award-site tests** (mob package, real fan-out): two participants of
  different levels credited on one kill receive *different* awards, each
  matching the formula for their level · a `NotePresence` bystander is priced
  by their own level like anyone else · an owned summon's kill prices by the
  owner's level.
- **Pins (L3):** a gray kill (award 0) still fires `QuestLedger().NoteKill`,
  still consumes and can win the kill-unlock roll, still triggers
  `ApplyRecipeCascade` — discovery and quest credit are participation-based,
  not XP-based, and must stay so.
- **Loader tests:** legacy `factors.experience` hard-fails with a migration
  hint (the C0 `maxHealth` precedent); absent `xpFactor` defaults 1;
  `CombatTarget` flips on `xpFactor > 0`.
- **Simharness:** guardrail suite re-run (its asserts are TTK/boss-lethality
  shaped, not XP-shaped — expected untouched); the kills-per-level battery is
  C2's calibration instrument.

## 8. Open questions & deferred

1. **Pacing at the top (C2, PO):** `killXPGrowth = levelUpXPGrowthFactor`
   means flat ~7.5 kills/level for all 30 levels. Is late-game levelling
   supposed to be slower? One knob (`killXPGrowth` a notch lower) answers it;
   needs a PO ruling with sim output in front of them. Note the change is
   *large* at the top relative to today's authored numbers (orc-grunt: 75
   authored vs ~1273 formula at level 20) — today's endgame pacing does not
   survive this plan either way.
2. **The kite list (C2):** which current species author `xpFactor 0.5` under
   the surviving Session-⑥ rule. Needs the same judgment that authored their
   kph values originally.
3. **Deferred, not blocked:** any group-size bonus (no formal groups in v1) ·
   rested/quest-context multipliers · per-spawn levels (§38, would slot in as
   the `mob.Level()` operand with zero formula change).

## 9. Landmines

- **L1 — `CombatTarget` silently derives from `Experience > 0`**
  (`catalog.go:63`, the nameplate path — "experience 0 keeps it off the
  nameplate path" per the NPC def comments). Deleting `experience` without
  re-deriving from `xpFactor > 0` un-nameplates every combat mob and no test
  screams. Re-derive and pin it.
- **L2 — the silent-wiring class, fourth appearance** (after R2/R3/voicelines
  L1): a renamed JSON key means every old def parses cleanly with the zero
  value — every mob pays nothing, suite green. The loader must **hard-fail on
  a present `factors.experience`** with a pointer to the migration rule,
  exactly like the C0 `factors.maxHealth` refusal.
- **L3 — the taper must gate XP only.** `rewardPlayer` also does quest kill
  credit (documented as participation-based, plan-quests.md L13), unlock rolls
  and the recipe cascade. A `if award == 0 { return }` early-out is the
  natural wrong fix. Also: the unlock roll is deliberately *always consumed*
  (per-mob RNG stream) — keep the call order so streams don't shift.
- **L4 — rounding at the taper edge.** Float mod × small base rounds to 0
  before the gray line; the min-1-while-`mod > 0` floor is load-bearing, or
  "almost gray" reads as gray and the taper's shape lies.
- **L5 — five conf files** (§35): the new block must land in all of them
  including the live server's, and the Go defaults must be sane so a conf
  missing the block doesn't zero the economy.

## 10. Chunk ledger

### C1 — the formula, wired ✅ `37668bc3` 2026-08-05, headless-verified

The economy is level-relative end to end. `curve.KillXP` is the shared type
(the sim harness consumes it), `factors.xpFactor` replaced `factors.experience`
across all 65 defs, and the award is computed **per participant** inside the
existing fan-out. **Schema impact: NONE** — verified, not reasoned: kill XP was
never on the wire and the DB stores only the accumulated total.

**What the plan did not predict:**

- ⚑ **L5 was already answered, and the answer is better than the plan's.**
  §5 warned the live server's conf must carry the new block or it boots on Go
  zero values. It carries **no `game.player` block at all** (`devops/conf.json`
  — checked, `game` holds only `zone`), so it has *always* run the player
  economy on Go defaults; `levelUpXPBase` works exactly this way today. With
  `curve.DefaultKillXP()` as the source of truth and `mob.SetKillXP`
  normalizing a non-positive block back to it, the three repo confs that got
  the block restate the defaults **verbatim** (verified by loading all three).
  So deployment carries no dependency — L5 is a recorded non-issue, not a
  release step.
- ⚑ **`DisallowUnknownFields` is NOT enough to catch the rename** (L2). The
  loader already rejects unknown keys, which looks like it makes the tombstone
  redundant — but 29 of the 65 defs authored `"experience": 0`, and against a
  plain `uint32` every one of them parses perfectly and silently *keeps
  meaning something*. The tombstone is a **pointer**, so any presence at all
  hard-fails; a non-pointer would have caught the 36 combat mobs and waved
  through every NPC. *General shape: a rename is only loud where the old value
  differed from the zero value.*
- ⚑ **The nameplate migration was PROVEN, not argued.** L1 says "re-derive and
  pin"; instead the `name → combatTarget` map of all 65 defs was captured
  **before** the JSON sweep and diffed after: **65/65 identical**, 36 prey and
  29 not. Order-sensitive — capture first or the cheap version is gone.
- ⚑ **A double that panics instead of answering, again** (the flight-C4
  lesson): `encounter.fakePlayer` embeds the interface, so the moment the award
  site read `Progression()` it nil-panicked *inside the reward fan-out* rather
  than saying "this test needs a level". It now answers.
- ⚑ **L2 STRUCK A THIRD TIME, at the conf seam, and the first fix blessed it.**
  `SetKillXP` originally guarded the block as a whole (`Base > 0 && Growth > 0`)
  and installed anything that passed verbatim — so a calibration pass writing
  the two knobs it is calibrating, `{"base": 60, "growth": 1.15}`, would have
  installed `grayStep 0` (⇒ **everything below your level pays nothing**),
  `upBonus 0`, and `tierElite/tierBoss 0` (⇒ **every elite and boss in the game
  pays nothing**, through `Award`'s own tier guard). Silently: the boot log
  printed `base` and `growth`, the two fields that *were* set, and both looked
  healthy. Worse, a test asserted that exact partial block installed correctly —
  **the hazard was scored as a pass.** The fix is `curve.KillXP.Normalized()`,
  falling back **per field**, plus the resolved gray + tier fields in the boot
  log. ⚑ *General shape: a whole-object "is it configured" guard cannot protect
  a struct whose fields are independently meaningful — and the fields most
  likely to be authored alone are the ones a log line is most likely to show.*
- ⚑ **`Turnip` was the whole harvest problem** — the only gate-keyed species
  with non-zero authored XP (Bramble and Rockfall were already 0), so D4's
  curation is one line, and a content pin now says exactly one structure in the
  game pays anything and it is the chore target.

⚑ **One knob C2 should know it cannot express:** `Normalized()` falls every
non-positive field back to the default for that field, so `upBonusPerLevel: 0`
and `upBonusCapLevels: 0` — a legitimate WoW-flat choice (no bonus at all for
killing above your level) — read as *unauthored* and are overwritten. The other
six have no meaningful zero. Making those two authorable means pointer conf
fields; deliberately not built, since nothing wants it yet.

**Not done, deliberately:** the kite list (§8.2) and the pacing call (§8.1) are
C2's, and the constants are untouched [PLACEHOLDER] defaults.

**Pre-existing, found while verifying:** `sys.TestDwell_TakeoffDropsAnInProgressCount`
fails under `-count=3` and passes under `-count=1` — reproduced at clean HEAD in
a scratch worktree, so it is not this chunk's. It is not repeat-safe.

Verified: full Go suite + `go build` · `go vet` · **~30 new Go tests** (the
formula table incl. §3.2's three worked examples transcribed, the award-site
per-participant split, the L3 pins, the loader tombstone, the tier census) ·
the 65-def nameplate golden · all three confs parsed and asserted equal to the
Go defaults · vitest 225/225 + `tsc` clean · boot 0 panics with
`player.killXP.base=40 growth=1.2` in the tuning-knobs line · **`chunkP-presence`
6/6, 0 console errors** — its measured award is `0 → 42`, which is the formula
(`base(1) 40 × 1.05` for a level-1 player killing a level-2 wolf), not the old
authored sentinel · **`npc-portraits` 4/4 NPCs plate-less with 8/7/7/2 mob
plates as the control**, both directions of the L1 derivation at the real
surface.

## 11. The roster is the problem the band was blamed for (evidence, 2026-08-05)

Measured over `api/mobs/*.json` at C1, prey species only (`xpFactor > 0`):

```
cL1  ×11  AngryMammoth, Dodo, Healer, Mammoth, ProvingAdd, ProvingBoss,
          ProvingGuard, Rabbit, SaberToothCat, Stag, Turnip
cL2  ×2   cL3 ×2   cL4 ×3   cL5 ×4   cL6 ×3   cL7 ×2      ← 27 of 36 species
cL8  —    (empty)
cL9  ×1   cL10 ×1  cL11 ×1  cL12 ×1
cL13–17 — (EMPTY — five consecutive levels with nothing in them)
cL18 ×1   cL20 ×3  cL23 ×1
```

Three distinct problems live in that table, and only one of them is the band:

1. **The cL13–17 hole.** A player at those levels has *nothing* at their level.
   `plan-mob-levels.md` is the structural fix — a per-spawn level places a
   level-15 Wolf without authoring a new species. This is what the PO's "should
   the mob changes impact that?" was reaching for: yes, and this is how.
2. **`curveLevel` does not track difficulty.** AngryMammoth, SaberToothCat and
   ProvingBoss are all authored **cL1**. Neither plan fixes this — it is a
   content re-authoring pass. ⚑ **C1 made it more load-bearing than §4 warned**:
   a mis-authored level now mis-prices XP *and* mis-scales HP, and the PO's
   "mobs 10 levels below are still challenging in mass" is that mismatch being
   felt rather than a taper being wrong.
3. **The band**, which is fine as designed (D6) and cheap to revisit.

⚑ **This is C2's sequencing problem, and `plan-mob-levels.md` is the gate.**
Calibrating an economy against a roster whose levels are untrustworthy and
which has a five-level hole calibrates against noise. Recommended order:
**C1 ✅ → `plan-mob-levels.md` (fills the hole) → C2 (calibrate)**. Recorded in
that plan's header and its §6.6 as well, from the other side. Costed candidates, if the knob is turned later — all satisfy
"Δ=−10 still progresses", they differ in reach (mod at Δ=−10, and what a
level-20 can earn from):

| band | ZD(20) | ZD(30) | Δ=−10 @L20 | opens, for a level-20 |
| --- | --- | --- | --- | --- |
| `5 + P/6` (shipped) | 8 | 10 | **0** | cL18, cL20 only |
| `10 + P/6` | 13 | 15 | 0.23 | +cL9–12 |
| `5 + P/2` | 15 | 20 | 0.33 | +cL7, cL9–12 |
| `12 + P/4` | 17 | 19 | 0.41 | +cL5(!), cL7, cL9–12 |
