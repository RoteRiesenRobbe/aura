# Plan: Kill XP becomes a formula — level-relative XP

> **Status: C1 BUILT 2026-08-05 (`a03b95ff`, headless-verified, §10) — C2 open,
> and RE-SCOPED the same evening by D7–D9 (§12, recorded `f1d6eebc`).**
> Replaces the flat authored per-mob `experience` value with a computed,
> level-relative award — WoW-Classic-shaped, anchored to the *recipient's*
> level. Every number is [PLACEHOLDER] unless marked.
>
> ⚑ **C2 IS NOT "CALIBRATE NEXT" ANY MORE.** Per **D9** it is the *single final
> pass*, and three things must land first: ✅ `plan-mob-levels.md` C3 (the tool,
> archived 2026-08-05), ✅ the **world re-placement pass** (the content, built
> 2026-08-06 — `plan-world-replacement.md`, live only for its in-game kite
> verdict), and **sim-harness placement support**, which is now **C1.5 of this
> plan — DESIGNED 2026-08-06, not yet built (§13)**. ⭐ **That design session
> found the step is bigger than its name**: the harness consumes `BaseAt` alone,
> so it **cannot see the taper** — the exact mechanism D8 exists to settle
> (§13.1). Three rulings **D10–D12**. ⚑ **D7** adds a droppable,
> mechanism-independent piece — the nameplate's difficulty colour must be
> *derived* from the server's gray knobs instead of the client's frozen copy.
> ⚑ **D8 ("green must pay meaningfully") is NOT answered by §11's candidate
> band table** — §12.1 measures why: the taper is linear to zero, so a *wider*
> band makes the deepest green pay a *smaller* fraction (10 % → 5 %). It is a
> question about the taper's shape or the boundary's definition. Full ledger: **§12**.
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
  costed in §11. ⭐ **REFINED THE SAME EVENING by D8 (§12): "some progress" is
  not enough — green must pay MEANINGFULLY.** §12.1 measures why that is a
  different question from the one §11's table answers: the taper is linear to
  zero, so widening the band makes the deepest green rung pay a *smaller*
  fraction, not a larger one.

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

Three chunks, buildable in one execution session each. **C1.5 was inserted
2026-08-06** by D9's chain — it is the "sim-harness placement support" step the
roadmap names, and it reverses `plan-mob-levels.md` §8.3's deliberate YAGNI
deferral. Full design + rulings: **§13**.

- **C1 — the formula, wired.** New shared package (proposal: extend
  `pkg/aura/curve` with a `KillXP` type, mirroring how `sim.Curve` aliases
  `curve.Curve` so the harness is structurally incapable of drifting — the
  sim's `XPModel` then consumes it). Pure function, TDD table tests first
  (§7). Wire into `rewardPlayer` per participant; config block; `xpFactor`
  replaces `experience` in the loader **with a hard-fail on the legacy key**
  (L2) + the ~36 JSON migrations; `CombatTarget` re-derivation (L1); the
  gray-kill pins (L3). Full Go suite + vitest + a headless verify pass.
- **C1.5 — the harness pays what the game pays, and it can see a placement**
  (designed 2026-08-06, **§13**). Two halves in one session, ruled together by
  **D10** because the second is near-useless without the first. **(a)** Wire the
  *whole* `curve.KillXP` into `sim.XPModel` — today it consumes `BaseAt` alone,
  so the harness cannot see the taper, the gray boundary, the up-bonus, the tier
  multipliers or `xpFactor` (§13.1 is the measurement). **(b)** Give
  `mobSpecOf` a level parameter, expose it as `-mob-level` + an explorer input,
  read `api/zones/world.json` through the **existing** `world` loader, and add a
  `-placements` battery that reports kills/hour, **XP/hour** and kills-per-level
  per placed rung, with **player level as its own axis** (default: the diagonal).
  Rows are grouped by **placed level, not region** (**D12**).
  Explicitly NOT this chunk: §8.1, §8.2 and D8 A-vs-B are C2's by D9.
- **C2 — the single final pass** (⚑ **entry refreshed 2026-08-06**; what stood
  here was written before D7–D9 re-scoped C2 and before C1.5 existed, and it
  named neither D8 nor the placement battery). **Realistically 2–3 sessions, not
  one** — D9 calls it one *pass*, but it bundles a code-bearing ruling with a
  numbers pass and a feel pass:
  - **(a) the D8 ruling**, taken with `-placements` output in front of the PO.
    ⚠️ **A and B are NOT the same size** — see §12.1's cost note.
  - **(b) the numbers:** §8.1 pacing (`killXPGrowth` a notch below
    `levelUpXPGrowth`?), the §8.2 kite list (`xpFactor 0.5`), `killXPBase` and
    the tier multipliers, and the band candidates in §11. ⛔ Read
    `plan-world-replacement.md` §12 C2 + §3.11 first: the high regions sit at
    **1.8–2.1 ×** a standard at-level fight against **0.7–1.0 ×** in the low
    half, and **no mob speed has ever been measured**.
  - **(c) the two-ended in-game pass:** a fresh level-1 at spawn; a SKILL/WARP-
    cheated high level farming grays and tagging an endgame kill.
  Numbers may lose [PLACEHOLDER] here or stay tuning-open.

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

### 7.1 C1.5's own legs (added 2026-08-06)

- **The refactor is byte-identical, proven.** `mobSpecOf(def, level)` with every
  existing caller passing `def.CurveLevel` must produce the *same* `MobSpec` as
  today for all 65 species — a table over the whole catalog, not a spot check.
  The guardrail suite is the second half of that proof: its classification must
  come out identical to baseline, exactly as it did across C1 and C2. ⚑ **It is
  identical *because* the callers still pass `def.CurveLevel`** — that identity
  is precisely what proves the refactor byte-identical, and it is **not** an
  endorsement of keying the band check off the species level (§13.4).
- **The taper is visible in the harness** — the leg that would have caught
  §13.1. Pin `XPModel`'s award against `curve.KillXP.Award` over a Δ sweep
  including the gray zero, both tier multipliers and a fractional `xpFactor`.
  It is the same biconditional discipline C0's vitest oracle used: an
  independent mirror, not a restatement.
- **One parser, pinned — and the combat filter is C1's, not a transcription.**
  A test that the enumeration returns **423 of `world.json`'s 485** spawns, each
  carrying a level. ⚑ **Checked 2026-08-06, because the number could have been a
  third copy of a Python fact:** it is not. `world-regions.py` filters on
  `xpFactor != 0`; Go already derives `CombatTarget = XPFactor > 0 &&
  !FriendlyToPlayers` (`items/mobs/catalog.go:66`, the L1 re-derivation C1
  shipped), and the two agree **exactly** — 423 both ways, because no species is
  currently both `xpFactor > 0` and `friendlyToPlayers`. So the harness rides the
  catalog's own flag and the assert is honest. **If a friendly species is ever
  given a positive `xpFactor`, the two definitions diverge** and this leg is
  where it surfaces — which is a feature, not a fragility.
- **`-placements` is deterministic**: same seed → same rows, so a diff between
  two calibration runs is a content or knob change, never luck (the guardrail
  battery's standing property).
- **No-content degrade:** the battery must fail loudly on a missing/unreadable
  `zones` dir rather than reporting an empty table, which reads as "nothing is
  placed" — the C2 walk's `^[A-Za-z]+ \d+$` lesson, one level up.

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
- **L6 — `XPModel`'s four JSON fields are a COMPAT SURFACE** (C1.5). They are
  not private to the type: the `-serve` explorer posts an `xp` object keyed on
  `levelUpBase`/`levelUpGrowth`/`killBase`/`killGrowth`. Embedding the full
  `curve.KillXP` must either preserve those names or migrate the caller in the
  same commit — a silently renamed field unmarshals to the zero value, and
  `Normalized()`'s own doc comment already records what a zeroed `GrayStep` does
  (gray distance 0 ⇒ every mob below you pays nothing). **This is L2's shape at
  a third seam**, after the JSON key and the conf block.
  ⚑ **Located precisely 2026-08-06, because the obvious guess is wrong and the
  surface is SMALLER than it looks:** it is **`cmd/simharness/index.html`** —
  `:395-398` build the explorer's input controls from a table keyed on those
  four literal names, `:444-445` assemble the posted object — plus the request
  pin at `serve_test.go:208`. **`serve.go` itself never names them** (it decodes
  into `Fixture`), and there are **no saved preset files**: `loadPresets` builds
  the dropdowns from content at startup and they carry `MobSpec`/`AuraSpec`, not
  `XPModel`. The report artifact carries only `generatedAt`/`ticksPerSecond`/
  `results`. ⚑ Do not grep-and-replace `killBase` blind — `quests/persist.go:60`
  has an unrelated one (the quest kill counters).
- **L7 — do not write a second `world.json` parser** (C1.5). `world.Spawn`
  already parses and validates `level` (`world/zone.go:80`, non-positive
  hard-fails). A convenience re-parse in the harness would drift from the loader
  the game actually boots — the silent-wiring class, and the one thing §7.1's
  423-spawn assert exists to catch.

## 10. Chunk ledger

### C1 — the formula, wired ✅ `a03b95ff` 2026-08-05, headless-verified

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
which has a five-level hole calibrates against noise. ~~Recommended order:
**C1 ✅ → `plan-mob-levels.md` (fills the hole) → C2 (calibrate)**.~~
⭐ **SUPERSEDED BY D9 (§12) the same day — the chain is longer**: mob-levels C3
→ a world **re-placement** pass (✅ `plan-world-replacement.md`, designed 2026-08-06) → **sim-harness placement
support** → C2 as the single final calibration pass. Recorded in that plan's
header and its §6.6 as well, from the other side.

⚑ **The candidates below answer "how many rungs pay at all", NOT D8's "does
green pay meaningfully"** — §12.1 measures the difference, and a *wider* band
makes the deepest green rung pay a *smaller* fraction. Costed candidates, if the knob is turned later — all satisfy
"Δ=−10 still progresses", they differ in reach (mod at Δ=−10, and what a
level-20 can earn from):

| band | ZD(20) | ZD(30) | Δ=−10 @L20 | opens, for a level-20 |
| --- | --- | --- | --- | --- |
| `5 + P/6` (shipped) | 8 | 10 | **0** | cL18, cL20 only |
| `10 + P/6` | 13 | 15 | 0.23 | +cL9–12 |
| `5 + P/2` | 15 | 20 | 0.33 | +cL7, cL9–12 |
| `12 + P/4` | 17 | 19 | 0.41 | +cL5(!), cL7, cL9–12 |

## 12. PO rulings 2026-08-05 (evening) — C2 is a FINAL pass, and it is bigger than this plan

Taken after `plan-mob-levels.md` C2 shipped, in response to the plate-vs-XP seam
that chunk made live (§6.4 there / §8.2 here).

- **D7 — the plate must be a FUNCTION of the pay, not a coincidence.** *"The
  colour code should always correlate to XP earned to some degree, a green mob
  plate must still give XP, always. Same rules as World of Warcraft."* The client
  currently owns a **second, frozen copy** of the gray rule
  (`DIFFICULTY_BANDS`, `client-data/Mobs.ts`) while the server computes
  `GrayDistance(P) = grayBase + P/grayStep` (`curve/killxp.go`). The fix is to
  delete the client's copy: ship the two knobs in **`Welcome`** (static conf,
  once per session — **not** the resolved ZD, which goes stale on every ding) and
  derive the boundary client-side. Green then becomes the variable-width band it
  is in WoW, and *gray ⟺ pays nothing* becomes structural.
- **D8 — green must pay MEANINGFULLY, not merely non-zero.**
- **D9 — calibration is the LAST step, and it is one pass.** *"We will need to do
  one final pass once all the content in `world.json` follows the new formula.
  Then we can re-place mobs throughout the world with actual sensible level
  bands, fill the level gaps and adjust XP base and bands based on various
  factors. For this we will need the sim harness as well."* So **C2 as written is
  superseded**: it is not "calibrate next", it is the last step of a longer
  chain, and it acquires a sim-harness dependency.

**The corrected order** (each step is a precondition of the next):

```
mob-levels C3 (the tool: editor field + first placements)
  → world re-placement (the CONTENT: sensible level bands, fill the gaps)  ← plan-world-replacement.md (designed 2026-08-06)
  → sim-harness placement support                                          ← NEW PLUMBING (D9)
  → C2, the single final calibration pass
```

The plate derivation (D7) is **mechanism-independent and droppable anywhere
before the last step** — and landing it early is worth something, because it
gives the calibration pass honest visual feedback instead of plates that lie
*further* the more the band is tuned.

### 12.1 ⚑ The measurement D8 has to survive: widening the band makes the deepest green pay LESS

Measured 2026-08-05 against `curve.KillXP` at player level 30. `mod(Δ) = 1 + Δ/ZD`
is a **linear taper to exactly zero at the boundary**, so the last green rung
always pays ≈ `1/ZD` of an at-level kill — and a wider band makes that fraction
*smaller*:

| band | ZD(30) | green rungs | top of green (Δ=−3) | **bottom of green** |
| --- | --- | --- | --- | --- |
| `5 + P/6` (shipped) | 10 | 7 | 70 % | **10 %** |
| `10 + P/6` | 15 | 12 | 80 % | **6.7 %** |
| `5 + P/2` | 20 | 17 | 85 % | **5 %** |

So **D8 is not a question about the band's WIDTH** — the §11 candidate table
answers a different question (how many rungs pay at all). It is a question about
the taper's **shape** or the boundary's **definition**, and there are two ways to
satisfy it:

- **A — change the taper.** Make `Modifier` concave, or floor it inside the band
  with a drop to 0 at gray, so everything above the boundary pays a real amount.
  Changes the economy, and reopens **D2**, which deliberately chose the pure
  linear taper ("not a token floor, not a cliff at full value").
- **B — move the boundary.** Leave the formula untouched and define gray as
  *"pays less than ~15 % of an at-level kill"* rather than *"pays exactly zero"*.
  Green pays meaningfully **by construction**, at zero balance cost. The price:
  a gray mob pays a trickle rather than literally nothing — a departure from WoW,
  where gray is exactly zero.

⚑ **Both need the same plumbing** (D7's wire + client derivation), so the choice
between A and B does **not** block it. Decide A-vs-B in the final pass, with the
sim harness in hand — it is a numbers question and this plan's numbers are all
[PLACEHOLDER] until that pass says otherwise.

⛔ **A and B are NOT the same size, and "at zero balance cost" hid it** (found
2026-08-06, reading the shipped C0 code — it was recorded nowhere):

| | what changes | cost |
| --- | --- | --- |
| **A — concave taper** | `curve.KillXP.Modifier` | **Go only.** The plate follows for free: gray still lands at the same `ZD`, which is all the client derives. |
| **B — gray = "pays < ~15 %"** | the *boundary's definition* | **Go + wire + client.** The client's `grayDistance()` (`client-data/Mobs.ts:118`) mirrors `GrayBase`/`GrayStep`; a threshold-based boundary is a **third knob it does not have**, so B needs either another appended `Welcome` field or a hardcoded `0.15` — and a hardcoded one **re-creates the frozen second copy C0 existed to delete**. |

So B's "zero balance cost" is real and its *implementation* cost is not. If the
pass runs short, A is the branch that fits in the numbers session; B wants its
own chunk.

⛔ **"With the sim harness in hand" was an assumption, and §13.1 disproves it.**
The harness models `base(P)` and nothing else, so as of today it cannot see the
taper A and B are both about. That is what C1.5 is for.

---

## 13. C1.5 — sim-harness placement support (designed 2026-08-06)

Roadmap step 3 of D9's chain. `plan-mob-levels.md` §8.3 declined this
deliberately (*"the harness balances species at their curve position; placement
is a zone-authoring concern… that is new plumbing and a new ask"*) and named its
own trigger; the trigger arrived with D9, and §8.3 records the reversal. The
step landed here rather than in a plan doc of its own because that same
paragraph says it is **owned by this plan's final pass**.

⚑ **The design session found the step is bigger than its name.** It is not "add
a level axis" — it is *make the harness pay what the game pays*, and only then
feed it placed levels.

### 13.1 ⛔ The measurement: the harness consumes ONE method of the live economy

`curve/killxp.go`'s own doc comment says *"the sim harness consumes this type
(sim.XPModel.KillXP), so the tool that calibrates the economy is structurally
incapable of modelling a different one than the game pays."* Measured against
the source 2026-08-06, that is **half true, and the wrong half**:

```go
// sim/curve.go:54 — the whole of the harness's kill-XP model
func (x XPModel) KillXP(tier int) float64 {
    return curve.KillXP{Base: x.KillBase, Growth: x.KillGrowth}.BaseAt(tier)
}
```

`XPModel` carries **four scalars** (`LevelUpBase`, `LevelUpGrowth`, `KillBase`,
`KillGrowth`) and reaches `BaseAt` alone. Everything else the live `Award` does
is absent from the tool:

| live `curve.KillXP` term | in the harness? |
| --- | --- |
| `base(P)` — `BaseAt` | ✅ yes |
| `mod(Δ)` — `Modifier`, the linear taper | ❌ **no** |
| `GrayBase` / `GrayStep` — the boundary | ❌ no |
| `UpBonus` / `UpCap` — killing above you | ❌ no |
| `TierElite` / `TierBoss` | ❌ no |
| per-species `xpFactor` | ❌ no |

`KillsPerLevel(level)` therefore means *"at-level normal kills per level"* — Δ=0,
tier 1, xpFactor 1 — which is exactly the reading that made "flat ~7.5
kills/level" (§8.1) look like the whole pacing picture. And the **chain battery
reports no XP at all**: `ChainCell` carries kills/hour, survival and fight
seconds, no award.

⛔ **The consequence for D8:** the taper's shape is the one thing the harness
cannot currently see, and the taper's shape *is* D8. A calibration pass run
against today's tool would be choosing between A and B blind.

⚑ **Why the comment was not a lie when it was written:** at C1 the sim's job was
kills-per-level analytics, and `BaseAt` is genuinely the shared source for that
number. The claim only became misleading when D8 turned the *taper* into the
open question. **A shared type is not a shared model** — delegating one method
proves no drift in that method and nothing about the rest.

### 13.2 Decision ledger — PO rulings 2026-08-06

- **D10 — both halves, one chunk.** The economy wiring and the level axis ship
  together. Rationale, from §13.1: a `-placements` battery over a harness that
  cannot price Δ would report the *at-level* award for every rung regardless of
  what the player's level is — the placement report would be silently
  meaningless in exactly the dimension it was built to show.
- **D11 — it is a chunk of this plan, not a plan of its own.** `plan-mob-levels.md`
  §8.3 already assigned ownership here. A fresh `plan-*.md` would cost a README
  index line, a status banner and an archive obligation for one chunk of
  plumbing, and re-open a question that is already answered.
- **D12 — group the report by placed level, NOT by region.** The sim does not
  need to know what a region is: `world.json` carries `(species, level)`
  directly. Region is a **reporting label**, not a sim input. ⛔ The rejected
  option is the load-bearing part — `scripts/world-regions.py` opens with *"this
  file and §3.7 are one fact in two places"*, so transcribing the rectangles
  into Go would make three. If region-labelled rows are ever wanted, the shape
  is `world-regions.py --emit-json` writing a sidecar both readers consume.

### 13.3 The touch points, enumerated

Sized honestly, so the chunk is not discovered mid-session:

- **`sim/curve.go`** — `XPModel` consumes the whole `curve.KillXP`; add an
  `Award(playerLevel, mobLevel, tier, xpFactor)` passthrough and a Δ-aware
  `KillsPerLevel` sibling. ⚑ **Keep the at-level `KillsPerLevel`** — it is what
  the `-levels` sweep column means (`sweep.go:65`), and silently changing its
  meaning would move a number the PO has been reading since chunk 2. **L6** is
  the field-naming trap.
- **`cmd/simharness/content.go:325`** — `mobSpecOf(def)` → `mobSpecOf(def, level)`,
  `powerScale := def.Curve.F(level)` instead of `F(def.CurveLevel)`. **That one
  line is the whole of what makes the harness species-keyed.** Every existing
  caller passes `def.CurveLevel`, so the refactor is byte-identical by
  construction (§7.1 proves it over all 65).
- **`cmd/simharness/content.go:53`** — `contentFS` resolves `skills`, `factions`
  and `mobs`; `zones` is a fourth entry. `pkg/api/zones` is already embedded and
  `cmd/aurad/loaders.go` has the pattern to copy.
- **The placement source** — `world.Spawn.Level *int` already parses and
  validates (`world/zone.go:80`). Reuse that loader; **L7**.
- **`cmd/simharness/main.go`** — `-mob-level`, and `-placements` alongside
  `-levels` / `-matrix` / `-chain`.
- ⭐ **`-placements` needs a PLAYER-LEVEL AXIS, not just the diagonal.** Rows are
  the placed rungs; the player level is its own flag, **defaulting to the
  diagonal** (player level = placed level, the at-level reading). That default
  answers "is each rung at level?", but the distortion C2 must actually read —
  `plan-world-replacement.md` §12 C2's high regions at **1.8–2.1 ×** against a
  low half at **0.7–1.0 ×** — is a statement about *one* player meeting content
  placed all over the range, i.e. **Δ ≠ 0**. Without the axis, C1.5 would ship an
  instrument that still cannot show the taper it just finished wiring in.
- **`cmd/simharness/serve.go` + `index.html`** — a level input beside the mob
  dropdown, so the explorer can ask the same question the CLI can.
- **`sim/chain.go`** — `ChainCell` grows an XP/hour figure; kills/hour × the
  real award is the number a calibration pass actually reads.

### 13.4 Out of scope, deliberately

- **§8.1 pacing, §8.2's kite list, and D8 A-vs-B are C2's**, per D9. The
  temptation to answer one while the harness is warm is precisely what that
  ruling forbids — C1.5 builds the instrument and reads nothing off it.
- **`guardrailZone(curveLevel)` keys the band check off the SPECIES curve
  level** (`guardrail_test.go`), which is arguably the wrong key once placements
  are modellable — a Wolf placed at 16 is farm-band content the check still
  files under Z1. Surfaced, not folded in: C2 shipped with the guardrails green
  and classification identical to baseline, so this is a future question and not
  a break. ⚑ It is also the natural home for the **kiteability leg** that
  `plan-world-replacement.md` §3.11 says no battery owns — the facetank leg
  starts at 0.5 units, so approach time never enters it. Only relevant if the
  PO ever wants that measured rather than eyeballed.
- **No conf, no wire, no content, no DB.** C1.5 is tooling.

### 13.5 Schema impact (stated per the standing rule)

- **DB: NONE** · **FlatBuffers: NONE** · **content JSON: NONE** ·
  **conf.json: NONE.**
- ⚑ The one compat surface is **`XPModel`'s JSON field names**, and it is one
  file: **`cmd/simharness/index.html`** (plus the `serve_test.go` request pin).
  **L6** has the line numbers and the two wrong guesses it rules out.
