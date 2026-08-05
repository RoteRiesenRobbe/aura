# Plan: Kill XP becomes a formula — level-relative XP

> **Status: DESIGNED 2026-08-05, no chunk built.**
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
