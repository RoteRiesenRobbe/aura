# Plan: The Numbers Rewrite (Pass 1)

> **Status: BUILT 2026-07-31, committed 2026-08-01 `40d9b204` — C1 ✅ + C2 ✅.
> The PO feel pass has RUN (2026-08-01) and the premise landed** — *"resource
> cost changes feel good actually"*. Its checklist is `plan-numbers-feel-pass.md`
> and its findings — 11 PO items plus a 9-finding technical review of the cost
> system — are `plan-resource-costs-feedback.md`, which is where the retune is
> scoped from. 16 PO decisions
> (**D1–D16**) and **16 landmines** (L1–L13 validated against HEAD `dfaeb776` at
> planning time; **L14–L16 found while building** and worth reading before any
> future balance pass). Two chunks: **C1 engine** (numbers unchanged, sim battery
> byte-identical) → **C2 the numbers** (caps, points, costs, retune, tags),
> executed as C2a caps · C2b costs · C2c retune · C2d damage types. Ledgers in §7.
>
> ⚑ **Still open, and why this doc is not archived:** the retune that the feel
> pass asks for (`plan-resource-costs-feedback.md` §6 sketches R1–R4, nothing
> scheduled), and open question 4 (does the free floor stay free under
> `backlog.md` §37?).
>
> ⚑ **Every number this pass authored is [PLACEHOLDER]** — including the caps
> (D2 expects §37 to move them), the point-curve thresholds, and the whole
> damage ladder in the C2c ledger.
>
> Supersedes `plan-playtest-feedback.md` §Pass 1 as the implementation record;
> that section stays the *origin* (round-2 decisions 1+2, the round-6 resource
> ruling, the 2026-07-29 sweep) and now points here.

---

## 1. What this pass is

Round 2's complaints 3 and 4 — *"progression doesn't satisfy"* and *"nothing
costs anything"* — plus the measured findings that Reaper is a strict upgrade,
that the three damage auras are one line plotted three times, and that Recover
is dead content past ~L5. The answer is one settling point across the skill
catalog rather than a sequence of local fixes.

**Scope: the 50 player skills.** The 36 mob-only skills in `api/skills/mobs/`
and the 64-mob roster are **frozen** (D3) — they are the reference frame the
guardrails measure against.

### Two corrections to the inherited record, both found in-session

1. **"No skill authors a `damageType` at all"** (the 2026-07-29 sweep, repeated
   in `CLAUDE.md`) **is wrong.** 8 of 50 player skills already author
   `damageTags` — the fire line (`ignite`, `immolate`, `wildfire`,
   `nova-burst`, `damage-burst`) plus `harvest`, `pickaxe`, `shockwave` — and
   mob skills use `physical`/`bleed`/`poison`. The real gap is narrower and
   more interesting: **resistances exist only as key-gates**, never as
   mitigation (all 4 mobs that author them use the `{"*": 0, "harvest": 1}`
   lock-and-key form). See D4.
2. **Recover was never made fractional.** `api/skills/recover.json` is still
   `healHP: 4` × `hotTicks: 9` = 36 flat HP at `maxLevel: 1`, last touched in
   the C8 milestone settlement (`03a377b1`). `HotParams` has **no**
   fraction-of-max field — only `HealParams` (heal_aura) and `SelfHealParams`
   do. The `plan-playtest-feedback.md` §Findings entry is accurate as written;
   no doc needed correcting. See D14.

---

## 2. The rulings (PO, 2026-07-31, via choice prompts)

### Shape of the pass

**D1 — Engine first, numbers second.** `plan-playtest-feedback.md` §Pass 1
bundles 1a+1b to avoid retuning twice; the PO's round-6 preference was
costs-first. Both are superseded by a third split that retunes only once *and*
keeps a clean acceptance test: **C1 changes engine only with every authored
number untouched** (so the sim battery must come out byte-identical, proving
the engine is inert), **C2 moves every number once**. PO requirement attached
to this ruling: *"we need to ensure we can balance the resource cost per skill
and it's not hard coded per effect type"* — that constraint drives D5.

**D12 — Retune breadth: costs and caps everywhere, deep retune on the problem
set.** Every skill gets an authored cap and an authored cost (that is what the
pass *is*). The damage/radius/scaling rewrite focuses on the skills triage
actually named — **Damage, Wild, LongRangeStrike, Reaper, Recover** — plus the
capstones. The remaining ~40 keep their numbers unless the cost changes their
standing.

**D3 — Preserve the pacing band; compensate on the player side only.**
TTK ~6.67 s / TTD ~8.70 s stay the target. Because costs reduce effective
throughput, player damage numbers rise to absorb what costs take away.
**Mob HP, mob damage and the 36 mob skills do not move**, so any battery
movement is unambiguously player-side.

**D16 — Two chunks** (C1 engine / C2 everything else), with the PO feel pass
after C2.

### The point economy

**D10 — Escalating point cost, relative to each skill's own cap.** For a skill
with `maxLevel` M: the **first half** of its levels cost **1** point each, the
**third quarter** costs **2**, the **last quarter** costs **3**, rounding up
where the quarters don't divide evenly. `skillPointsPerLevel` stays **1**.

⭐ **Level 1 is granted free on unlock** (PO, 2026-07-31) — the current model
stands unchanged: a skill arrives in the spellbook at level 1 having cost
nothing, and the first *purchased* level is 2. `SpentPoints()` keeps binding
`level − 1` levels' worth of cost, only now the cost per level is
cap-relative rather than flat. ⚑ This is load-bearing for **D6**: the free
floor and the free first level are what jointly guarantee a player always has
an action, and it means every discovered skill is usable before any investment.

| `maxLevel` | 1 pt | 2 pt | 3 pt | total to max |
| --- | --- | --- | --- | --- |
| **10** | L2–5 | L6–8 | L9–10 | **16** |
| **5** | L2–3 | L4 | L5 | **7** |
| **1** | — | — | — | **0** |

A 29-point level-30 budget therefore buys roughly **one deep skill + one maxed
5-cap + one part-way** — a real commitment, and the curve is authored relative
to each skill's own cap, so it survives §37 later moving a cap.

⚑ **All of it is [PLACEHOLDER]**, explicitly including the quarter thresholds —
the PO's words: *"that is now a placeholder approximation, not necessarily the
final level."*

**D2 — Caps are authored now, as interim values.** Vocabulary is **{1, 5, 10}**
— *"10 in some cases, 5 in most, 1 in a few."* Per the 2026-07-29 sweep, these
are not final: `backlog.md` §37 (aura augmentation) may move where a cap sits
and what happens when a player reaches it. Re-derive `damageHPPerLevel` against
the authored ceiling per skill, and expect to do it again.

**D11 — A cap of 10 goes to the build-defining core auras** — the skills a
build is named after (Damage, Heal, LongRangeStrike, Reaper and the like).
Supporting skills cap at 5; binary abilities (Recall, Revive, Haste) stay at 1.
This is also where §37's *"augment at level 10"* choice would naturally sit.

### Resource costs

**D5 — The cost is a shared field on `EffectDef`, not on a payload type.**
`selfDamageHP` moves off `HealParams` onto the effect itself, so **any** effect
type can declare a cost — damage, slow, shield, summon, `speed_burst`, all of
it. A skill's total cost is the **sum of its effects' costs**, each charged on
**its own tick interval**. This is what makes Warbanner authorable (four
effects ticking at 40/120/30/1 game ticks) and it is the direct answer to
*"not hard coded per effect type"*.

**D7 — One cost model everywhere: fraction of max HP.** Scale-invariant by
construction, so a cost can never go free as the pool grows ~26× over 30 levels
— the exact mechanism that made Recover dead content. One tooltip shape, one
mental model. The 5 existing absolute `selfDamageHp` values (`heal`, `paladin`,
`vanguard`, `lifewarden`, `warbanner`) are converted in C2.

**D8 — Auras pay only when the effect lands; cooldowns pay on cast, always.**
Split by category, because that is how each is felt: a cooldown is a committed
act, an aura is a field. This also *keeps* the live heal precedent — today's
`applyHealAura` charges only `if healedSomeone` (`sys/skills.go:880`).

**D6 — The permanently free floor: `Damage` + the non-combat utility skills**
(`Torch`, `Lantern`, `Harvest`, `Pickaxe`). GDD §3 requires a guaranteed action
at any resource level; light and gathering should not tax survivability either,
and the zone-1→2 tunnel already charges the Lantern-carrier an *opportunity*
cost. Combat power is what costs.

**D16b — `Damage` stays free at all 10 of its levels and is deliberately the
weakest damage aura in the game.** The floor is a floor: its value is that it
always works, not that it competes. Every costed alternative must out-perform
it by enough to be worth paying for. Stated plainly so no future tuning pass
"fixes" Damage into competitiveness and quietly makes the free option the best
one.

**D9 — A cooldown that cannot be afforded is rejected, with feedback.** Nothing
is spent and the cooldown does not start. Reuses the `ActivationRejection` wire
enum and the rejection UI the skill-vocab pass already built. GDD §3 explicitly
calls the silent-skip behaviour the *wrong* protection.

**D13 — The cost-reduction passive ships in C1**, as the sixth `validStat` and
the first that modifies an **input** rather than an output. Built while the
cost path is open; it also proves the cost field is a real system rather than a
per-skill number, and gives builds a way to answer costs other than avoiding
them. Player-only by construction, which is fine — mobs pay nothing anyway, so
`backlog.md` §31 gap 1 does not bite.

**D14 — Recover: add `fractionOfMax` to the HoT payload.** Mirrors what
`HealParams` already has, so both `instant_hot` and `hot_aura` can heal a share
of the pool. Recover stops being dead content, and every future heal-over-time
gets the scale-invariant option. Rejected: re-authoring Recover onto
`self_heal` (it would stop being a heal-over-time, colliding with GDD §3's
*"nothing instant may fully or near-fully restore the resource"*).

### Damage types

**D4 — Fix the vocabulary first, then tag; and split it into two concepts.**
The 6 live tags are doing two unrelated jobs:

- **Damage types** — `physical`, `fire`, `poison`, `bleed`: an authored,
  validated, closed list. Extended to **`physical`, `fire`, `frost`, `nature`,
  `poison`, `bleed`** so the Slow/Calm line can read as frost and the wildlife
  line as nature. Two of the six ship with no skills carrying them until later
  content fills them in — accepted deliberately.
- **Gate keys** — `harvest`, `smash`: a **separate mechanism with its own
  name**. *"A turnip resists everything except harvest"* is a lock-and-key, not
  a resistance. Each concept gets the right validation, and neither can be
  typo'd into the other.

Then: every player damage skill declares a type, and **partial** resistances
(0.5, 1.5) are authored on a curated set of mobs so a type choice actually
matters. The existing key-gate mobs keep working unchanged.

### Verification

**D15 — Extend `sim.AuraSpec` with cost and drain the sim player.** Today the
spec carries damage/dot/crit/radius/targets and nothing else
(`pkg/aura/sim/scenario.go:13`), so **player costs would be invisible to the
battery** — TTK/TTD would read unchanged while the real game got slower. Since
D3 makes "hold the pacing band" the acceptance claim, the harness has to be
able to measure the pass's main change. Harness work lands in C1.

---

## 3. The chunks

### C1 — Engine (authored numbers unchanged)

**Acceptance test: the sim battery is BYTE-IDENTICAL across all five runs**
(default · `-chain` · `-levels` · `-matrix` · `-content ../api`) against a
clean-HEAD worktree, plus the full Go suite, `vet`, guardrails + alloc
`-count=2`, frontend `tsc` + vitest. If anything moves, the engine is not
inert and something in C1 is wrong.

1. **Lift the cost onto `EffectDef`** (D5). New shared cost fields on the
   effect (fraction-of-max, per level), leaving `HealParams.SelfDamageHp`
   readable during migration. `applyHealAura`'s inline charge is lifted out to
   the dispatch loop. **Authored values untouched**, so the five heal skills
   behave exactly as today.
2. **Landed-reporting across the aura appliers** (D8). The 7 appliers in the
   dispatch switch (`sys/skills.go:207–221`) report whether they affected
   anything; only `applyHealAura` tracks this today, internally. See **L3/L4**
   — the never-kill clamp must stay pre-computed.
3. **Cooldown cost on cast + rejection** (D8/D9). Affordability joins
   `activationPrecondition` (`sys/skills.go:1274`); new
   `ActivationRejection` value (**L5** — `None=0, NoAnchor=1, NoTarget=2` today,
   so `NotEnoughResource=3` is a clean append under the §28 pinned-enum rule).
4. **The cost-reduction stat** (D13) — sixth `validStat`, with its hand-placed
   application site at the cost computation.
5. **`fractionOfMax` on `HotParams`** (D14), inherited by `hot_aura`.
6. **The point curve** (D10) — a pure `PointCost(def, level)`, `SpentPoints()`
   gains def resolution (**L1**), the affordability check in `equip.go:176`
   becomes "can you afford the next level", thresholds into
   `api/shared-constants.json` asserted by both languages (**L2**), and the
   spellbook `+` button shows the cost and greys when unaffordable (**L9**).
7. **`sim.AuraSpec` cost + runner drain** (D15).

### C2 — The numbers

**Acceptance: battery re-run, guardrails re-checked against the preserved
band (D3), boot against pinned content counts, then the PO feel pass.**

1. **Caps** authored per skill in the {1, 5, 10} vocabulary (D2/D11).
2. **The point curve authored** — no content change, but the budget's meaning
   changes, so this is where the build shape gets checked against the table in
   D10.
3. **Costs across the catalog** (D5–D9): fraction-of-max values on every
   costed effect, `0` on the free-floor five, the 5 existing absolute heal
   costs converted.
4. **The deep retune** (D12): Damage (free + deliberately weakest), Wild
   (deleted per §Pass 1b item 4 — *"we had these to proof concepts, not to be
   final"*), LongRangeStrike (reach becomes affordable rather than free),
   Reaper (lifesteal + radius 2.0 are the culprits; ⚑ price against sustain —
   lifesteal partly refunds its cost while LRS's is unrefunded, so a flat cost
   pass *widens* that gap), Recover (fractional), plus the capstones.
5. **Damage types** (D4): the vocabulary split and validated, every player
   damage skill tagged, partial resistances on a curated mob set.

---

## 4. Landmines

All validated against HEAD, not estimated.

**L1 — `SpentPoints()` is registry-free today.** `Spellbook` is
`map[SkillID]int` (`skills/component.go:96`) with **no definition pointers**,
so the current cost derivation (`level - 1`) needs nothing but the map. A
cap-relative cost needs `MaxLevel`, i.e. def resolution inside the component.
One caller (`model/player/player.go:706`), so the blast radius is small — but
the signature moves and every test constructing a component is affected.

**L2 — The point-cost formula becomes a cross-language mirror** the moment the
client shows a cost. `api/shared-constants.json` + the two assert tests (§35
C4) is the established home; putting the thresholds anywhere else recreates
exactly the duplication §35 just closed.

**L3 — Seven appliers must learn to report "landed".** The dispatch switch
calls them for effect, not result. `applyHealAura` is the only one that tracks
it, and it tracks it *internally* (`healedSomeone`) — the other six have no
notion. This is the largest mechanical piece of C1.

**L4 — The never-kill clamp must stay computed BEFORE the effect.** Heal's live
shape is: compute the scaled cost up front → if the caster is at the floor,
**skip the whole effect** (no heal emitted, no cost paid) → apply → charge only
if it landed. Computing affordability *after* applying would let a cost kill
its caster. Carry the shape verbatim.

**L5 — Mobs pay nothing, and GOD skips.** Both are gated on a player-only
interface (`healCaster`) inside `applyHealAura`, and the mob JSON comments say
so explicitly. Lifting the cost out of `HealParams` moves it away from that
gate — re-establish both at the new site or **every caster mob suicides**.

**L6 — There are two JSON spellings of the same field today.**
`selfDamageHp` (inside `HealParams`, `definition.go:379`) and `selfDamageHP`
(the raw effect layer, `definition.go:753`). This is one of the asymmetries the
§27.3.4 authored-key table documents; the migration must handle both, and that
table needs updating when the field moves.

**L7 — The sim loads the real skill registry but synthetic mobs.**
`cmd/simharness/content.go:91` calls `skills.RegistryFromFS`, so the **player
retune IS visible** to the battery — while `sim/world.go` feeds `NewMob`
inline definitions and never loads authored mob content. This cuts both ways:
it is why D3's "mobs frozen" keeps the battery meaningful, and why nothing
loader-side on the mob path can be verified there.

**L8 — Without D15 the acceptance test is blind to the pass's main change.**
Recorded separately from D15 because the failure is silent: the battery would
report a preserved pacing band and be measuring a game that no longer exists.
⚑ **C2b found this is deeper than D15 could fix.** D15 landed correctly — both
`AuraSpec` and `auraSpecOf` carry the cost — but the *scenarios* defeat it:
**`TTD` is by construction the idle-player run (`PlayerAuraActive: false`)** and
`TTK` ends when the mob dies, so neither can observe an aura cost. Every preset
reported TTK/TTD unchanged **to the tick** after the entire catalog was priced.
The only battery that measures a cost is **`-chain`**, A/B'd against a
cost-stripped copy of `api/` — and it is what caught the two lethal dot auras.

**L9 — The spellbook `+` button never checks points today.** It greys only at
`level >= maxLevel` (`HUD.ts:550`); an unaffordable spend is rejected
server-side with a `slog.Warn` the player never sees. Variable cost makes a
silently-dead button more likely, so the cost display in C1 is a fix, not a
polish item.

**L10 — The free floor must be pinned by test.** Authoring `0` is the whole
mechanism (D6), which means one careless content edit can tax the guaranteed
action with nothing failing. A test asserting the five free skills cost nothing
at every level is the guard.

**L11 — `fractionOfMax` and flat `hp` must stay mutually exclusive** on the HoT
payload, the rule `HealParams` already carries for the campfire. Authoring both
is a content bug that should hard-fail at load, not silently pick one.

**L12 — Untagged damage already normalizes to `physical`** at parse time
(`DamageTagPhysical`, `definition.go:164`). So "tag all 50" is mostly making
the implicit explicit — **but** the moment resistances become mitigation (D4),
every one of the 42 untagged skills silently became physical-resistible. Tag
before authoring any mitigation.

**L15 — `vitals.HP` floors any positive cost at 1 HP, so a cost's real price is
set by its CADENCE, not by the authored fraction.** Found in C2b. The floor
exists so a small heal never rounds away to nothing; on a cost it means the
cheapest possible charge is 1 HP however small the fraction. Costs are charged
once per application and **`tickInterval` defaults to 1 when absent** — which is
how `slow_aura`, `resist_aura` and `light_aura` are authored today — so a cost
on one of those is **30 HP/s on a level-1 pool of 100**, a third of the pool per
second against ~1 %/s regen. Guarded by
`TestAuraCostDrainIsSurvivableAtLevelOne` (6 %/s bound at level 1, floor
included), which fails at 30 %/s on an authored `0.0001`. ⚑ The corollary bites
even at sane cadences: for a 20-tick effect the minimum non-zero price is
already **1.5 %/s at level 1** — there is no cheap option, which is why the two
dot auras ship unpriced.

**L16 — Only the SEVEN dispatched appliers can be charged.** `applyAuraEffect`
pays when its applier reports "landed"; an active aura's `light_aura` has no
case in that switch and a passive never reaches the dispatch at all. A cost on
either is inert while reading as priced in both the JSON and the tooltip.
Guarded by `TestNoCostOnAnEffectThatCanNeverBeCharged`. Cooldowns are exempt —
`cooldownCostHP` sums every effect whatever its type.

**L14 — Raising a cap silently re-times every recipe that names the skill, and
re-pointing the recipes instead makes them unreachable.** Found in C2a, not
planned. All 10 recipes name *absolute* ingredient levels (`Damage 5`,
`Vanguard 5`, `Ignite 3`…) and `recipe.go:122` only checks
`level ≤ maxLevel` — so nothing fails when a cap moves; the ingredient just
stops meaning *"maxed"* and starts meaning *"half-way"*. Every one of the ten
`_comment`s said "maxed" and all ten were false after the pass. ⚑ The obvious
repair is the trap: re-pointing ingredients at the new caps costs **16 + 16 =
32 points against a 29-point level-30 budget**, which makes Paladin, Lifewarden
and Spearhead *literally unreachable*. **PO ruling 2026-07-31: keep the
absolute levels** — combos unlock mid-progression and there is still somewhere
to go afterwards, which is complaint 3's answer.

**L13 — The `"*"` wildcard interacts with new types.** All 4 resistance-authoring
mobs use `{"*": 0, "<key>": 1}`. A mob with `{"*": 0}` is immune to every
*newly added* damage type too, automatically — correct for a turnip, wrong the
first time a wildcard is used as shorthand for "tough".

---

## 5. Test strategy

- **C1 is TDD-shaped and fully mechanical.** Failing tests first for:
  `PointCost` across the three cap sizes, cost-on-any-effect-type, each
  applier's landed-reporting, the affordability rejection (nothing spent, no
  cooldown started), `fractionOfMax` on HoT, the free-floor pin (L10), and the
  shared-constants assert on both sides (L2).
- **The byte-identical battery is C1's real acceptance test** — it is the only
  thing that can prove a refactor of the cost and tick paths changed no
  behaviour. Run against a clean-HEAD worktree (⚑ run `make -C backend cp-defs`
  in the worktree first, or it cannot build — the embedded content is
  gitignored).
- **C2 is measured, not eyeballed.** Battery + guardrails against the D3 band;
  the named round-2 risk (*cooldowns unusable at low health*) only shows up in
  the batteries, and now that D15 has landed it actually can.
- **Then the PO feel pass**, which is the only thing that can judge whether
  spending survivability for power is fun.

---

## 6. Open questions

1. ~~**Is level 1 still free on discovery?**~~ **✅ RULED 2026-07-31: yes —
   granted free on unlock**, first purchased level is 2. Folded into D10; the
   point table needed no change.
2. ~~**Which skills specifically get cap 10** under D11's principle.~~
   **✅ RULED 2026-07-31 — the five base identity auras plus the four combo
   ceilings:** Damage, Heal, Immolate, LongRangeStrike, Reaper · Vanguard,
   Spearhead, Lifewarden, Warbanner. Everything else 5; Recall, Revive, Haste
   and (for now) Recover stay at 1. Authored in C2a.
3. ~~**What the curated resistance mob set is** (D4).~~ **✅ ANSWERED in C2d —
   9 mobs, all non-physical:** FireElemental + GreaterFireElemental
   (`fire 0.25 / frost 1.5`), BanditPyromancer (`fire 0.5`), Troll
   (`fire 1.5 / bleed 0.5`), the three spiders (`poison 0.25`), Bear + DireBear
   (`frost 0.5`). Non-physical is a *constraint*, not a preference, and is now
   enforced by test — see the C2d ledger.
4. **Does the free floor stay free under §37?** If augmentation lands on
   `Damage` at level 10, a free skill gains a costed effect. Not this pass's
   problem, but the first place D6 and §37 collide.

---

## 7. Ledger

### C1 — Engine ✅ 2026-07-31 (uncommitted)

**Zero behaviour change, and the sim battery is the proof: BYTE-IDENTICAL
across all five runs** (default · `-chain` · `-levels` · `-matrix` ·
`-content ../api`) against a clean-HEAD worktree, plus four authored-preset
runs (`-player-aura Damage/Reaper/LongRangeStrike/Wild:5`) added because the
default battery's TTK/TTD scenario never touches authored player content — the
`-content` flag alone produces the *same output as the default run*, so on its
own it proves nothing about the content path (L7's other half). **TTK 6.67 s /
TTD 8.70 s stand.**

**What landed, per plan item:**

1. **Cost on `EffectDef`** — `costFractionOfMax` / `…PerLevel` as a shared,
   validated field. ⚑ It lives in a new **`keysCost` group checked OUTSIDE
   `effectKeys`**, not added to the ~25 per-type entries: D5's requirement is
   that pricing is not per-effect-type, and 25 copies of one rule is how a new
   effect type ships silently unpriceable. Rejected at load: negative, and
   `>= 1` (a cost nothing can pay reads as a *silently dead skill* — the aura
   path would clamp it away every tick and the cooldown path reject every
   activation, with nothing failing).
2. **Landed-reporting** on all seven aura appliers. Two shape decisions worth
   keeping: heal reports `healedSomeone` (actually healed, not merely
   targeted), and resist/shield count a **`targetsSelf` apply as landed** —
   `applyInstantShield`'s existing rule that a support cast on yourself with
   nobody around is not a whiff.
   ⚑ **New seam: `applyAuraEffect`** — price → apply → charge in one named
   function rather than spread through the dispatch loop, *because their order
   is the rule* (L4). It is also what the migrated heal tests now drive, so
   they keep testing the production path instead of a test-only mirror.
3. **Cooldown cost + rejection** — affordability joins `activationPrecondition`
   (so it is re-checked at cast completion for free, the §3.5 shape), and
   `fireAndCharge` prices before the fire and pays after it, hit or whiff.
   `NotEnoughResource = 3` appended to the `ActivationRejection` wire enum;
   **regenerating both binding sets gave exactly the one-value diff**, and the
   client's `Skills.test.ts` (exhaustive over the enum) went red until the
   message was added — the §35 C4b contract working as designed.
   ⚑ **Affordable means `cost < health`, not `<=`**: paying your whole pool is
   not affording it, and unlike the aura path there is no clamp to fall back
   on.
4. **The cost-reduction stat** (`costReduction`, sixth `validStat`), clamped to
   [0, 1] at `DerivedStats.CostFactor()` so a stacked build can reach free but
   never a refund.
5. **`fractionOfMax` on `HotParams`**, mutually exclusive with flat `healHP`
   (L11, hard-fail). ⚑ Resolved **per target at application**, which is why
   `hotBuffFor` had to be extracted: the buff used to be built once per
   application and shared, and a percent-of-max HoT is a different number for
   every target. No power scale on the fraction branch (max HP already carries
   f(level) — the `selfHealHP` precedent).
6. **The point curve** — `PointCost` / `BoundPoints`, cap-relative. `SpentPoints`
   now takes a `Registry` (L1) and the player carries `skillDefs`; an
   unresolvable spellbook entry prices against **its own level as the cap**,
   the harshest reading, so the failure mode is a point the player cannot spend
   rather than a free one. `equip.go` asks "can you afford the *next level*".
   Thresholds in `api/shared-constants.json`, and **both assert tests
   reconstruct the curve from the fixture and compare against the shipped
   implementation** rather than restating five numbers that would drift in
   lockstep.
   ⚑ **L9 had a second half the plan did not name:** `updateSpellbook` skips
   the rebuild unless ids or levels changed — but the `+` button now greys on
   *affordability*, and a level-up hands out a point without touching either,
   so the buttons it makes affordable would have stayed greyed until some
   unrelated change. `points` is now part of the rebuild key.
7. **`sim.AuraSpec` cost + drain** — and the authored-content mapper
   (`auraSpecOf`) carries it too, or every preset run would report a preserved
   pacing band while measuring a game where the aura is free (L8). The sim
   player is a real `*player`, so the real cost path (clamp included) runs
   unchanged; a test pins that a 5 %-per-hit aura leaves the player at 80 after
   the 4 hits that kill the mob on tick 12, and that a ruinous cost stops at the
   1-HP floor.

**L10's free-floor pin** lives in `cmd/aurad/free_floor_test.go`, over the real
`api/` content: Damage · Torch · Lantern · Harvest · Pickaxe cost nothing at
every level of every effect, legacy heal cost included.

**Verified:** full Go suite green (28 pkgs) + `vet` + `gofmt` clean · guardrails
+ alloc `-count=2` · frontend `tsc` clean + **86 vitest** (was 84 — the two new
shared-constants legs) · boot `-content ../api` 0 errors 0 warnings 0 panics,
86 skills / 15 factions / 64 mobs / 10 recipes / 2 milestone unlocks / 4 quests
/ 777 props / 485 spawns · **`round4-tooltip.mjs` green** (it owns the
`/skills` payload shape, which grew the two cost keys) · `hygiene-wire-prune.mjs`
clean join after the enum append (636 sprites, 0 console errors, 0 context
losses).
⚑ One §29 context-loss run discarded and re-run clean — the standing rule.

**Not in C1, by design:** no authored number moved, so every skill is still
free, every cap is unchanged, and the point curve buys exactly what the flat
one did on today's content (a 5-cap skill costs 1/1/2/3 — the same 2 points to
reach level 3 the old rule charged). All of that is C2.

### C2 — running. Sub-split (each verified and paused on):

**C2a caps ✅ · C2b costs · C2c the deep retune · C2d damage types.**

### C2a — the {1, 5, 10} cap vocabulary ✅ 2026-07-31 (uncommitted)

**Every skill's MAX-LEVEL output is preserved exactly; only the intermediate
levels move.** That is what makes the cap pass independently verifiable: the
C8 guardrails compare max-level preset EV/tick
(`TestGuardrails_CeilingOrdering`) and drive the tier-threshold bot with
authored `Damage` at **L1**, so both are insulated from a pure cap change and
stay a live check rather than being re-baselined. Confirmed: **guardrails green
at `-count=2`, and every cap-10 skill's new max reproduces its old max TTK to
the tick** — Damage L5 4.00 s → L10 4.00 s · Reaper L3 5.33 → L10 5.33 · LRS
L5 5.33 → L10 5.33 · Vanguard 4.00 · Spearhead 2.67 · Warbanner 4.00 ·
Immolate 8.63.

**The caps** (PO 2026-07-31, D2/D11): **10** — Damage, Heal, Immolate,
LongRangeStrike, Reaper (the base identity auras) + Vanguard, Spearhead,
Lifewarden, Warbanner (the combo ceilings). **1** — Recall, Revive, Haste,
Recover. **5** — the other 37. Player skills are now exactly `{1: 4, 5: 37,
10: 9}`.

**The derivation is one rule, applied mechanically:** preserving
`value(new_max) == value(old_max)` means every `*PerLevel` slope scales by
`(old_max − 1) / (new_max − 1)` — ×0.5 for 3→5, ×0.4444 for 5→10, ×0.2222 for
Reaper's 3→10. 36 files, 101 values, rounded to 4 decimals.

⚑ **A line-anchored regex silently skips inline effect objects.** The first
pass missed `dash.json`, whose whole effect is one line
(`{ "type": "dash", … "dashDistancePerLevel": 0.5 }`) — it reported "NO SLOPES"
and would have shipped a Dash whose four new levels did nothing. Matching the
key anywhere rather than per-line is the fix; the tell was a skill with a cap
increase and an empty change list.

⚑ **Recover deliberately stays at cap 1.** It has *no* per-level scaling
anywhere, so raising its cap now would sell four levels that do nothing. Its
cap moves with the fractional rework in C2c, where there is something to scale.

⚑ **The cap is a PRICE.** Because D10's curve is cap-relative, moving a skill
3→10 leaves its ceiling untouched while raising the cost of reaching it from
**2 points to 16**. Reaper is the sharpest case and the intended one: it was
*"a strict upgrade at 3 points to Damage's 5"*, and it now buys the same
18 HP/hit for 8× the investment before C2c touches a number.

⚑ **Aggregate L30 power drops even though no ceiling moved, and that is the
pass working.** The old flat curve let a 29-point budget max ~6 of the 9
equipped slots; the new one maxes ~2 (one cap-10 at 16 + one cap-5 at 7 = 23).
A specialised build's headline aura is exactly as strong as before — everything
around it is weaker. **The synthetic battery cannot see this** (it models one
aura at one level), so it is a PO feel question, and it is the main input to
C2c's D3 compensation.

**L14 landed here** — see §4. All ten recipe `_comment`s said "maxed" and all
ten were false after the pass; each now carries the ruling and the 32-vs-29
reason it was not "fixed" by re-pointing.

⚑ **One test was pinning the cap of the day.**
`TestLoadPlayerAuraPresets_EmbeddedContent` asserted `Vanguard L5` and
`14+4*3.2` literally, so it went red on a legitimate content move. Rewritten to
resolve `MaxLevel` and the slope **from the registry** — it now checks the
derivation rule it exists to check, and survives §37 moving a cap again.
⚑ It only went red *after* `make cp-defs`: an earlier full-suite run against
the stale embedded copies was green and would have read as "no impact".

**Verified:** full Go suite green (28 pkgs) + `vet` + `gofmt` clean ·
guardrails `-count=2` · alloc `-count=2` · synthetic battery (default ·
`-chain` · `-levels` · `-matrix`) byte-identical, as expected — it never reads
authored content · 9 authored-preset runs compared old-max vs new-max, all
exact · boot **both ways** (`-content ../api` and embedded) 0 errors 0 warnings
0 panics — 86 skills / 15 factions / 64 mobs / 10 recipes / 2 milestone unlocks
/ 4 quests / 5 prop definitions / 777 placed props / 485 spawns · frontend
`tsc` clean + **86 vitest**.

**Not in C2a:** no cost, no retune, no tags, and Wild is untouched (its
deletion is C2c, with its three drop slots — EliteWolf 0.5, SaberToothCat 0.2,
AngryMammoth 1.0 — going empty per the PO).

### C2b — the costs ✅ 2026-07-31 (uncommitted)

**Every skill outside the free five is now priced, the legacy heal-only cost is
gone at every layer, and the price is visible to the player.** 34 skills, 44
effects.

**The anchor was found rather than chosen, which is what makes the scale
defensible.** Heal's shipped `selfDamageHP: 10` rides `casterPowerScale` against
a `baseHealth` of 100, and `MaxHealth = baseHealth × PowerScale ×
MaxHealthFactor` — so the one playtested cost in the game **already was 10 % of
the pool per heal tick**, falling to 2 % at cap (the "10 − 2/level FINAL" lock).
D7's conversion is a restatement, not a retune. ⚑ It is not bit-identical in one
case: max health also carries the HP passives, so a caster running Tough or
Hardy now pays 10 % of their *larger* pool. That is the scale-invariance D7
asked for.

Everything else is priced off sustained throughput against the free floor
(Damage at its new max = 20.1 HP/s ⇒ the PO's 2 % per 40-tick application =
1.5 %/s), with reach (√radius, so LRS finally pays for its reach — D12) and a
**sub-linear** multi-target term (1 + 0.5(n−1), because one charge covers all
targets), plus a +30 % sustain surcharge on Reaper whose lifesteal partly
refunds its own cost. Cost slopes mirror each skill's damage slope, so HP-spent-
per-damage stays flat across levels — the point curve already charges for depth
and double-taxing it was the wrong default.

**⭐ The finding that shaped the whole chunk: `vitals.HP` floors any positive
cost at 1 HP.** That rule exists so small heals do not vanish; on a *cost* it
means the cheapest possible charge is 1 HP **whatever fraction is authored**. A
cost is charged once per application, so on a level-1 pool of 100 an effect at
the default cadence — `tickInterval` is absent ⇒ **1** — costs **30 HP/s, a
third of the pool per second**, against ~1 %/s regen. It kills its caster in
about three seconds and the authored number gives no hint of it. `slow_aura`,
`resist_aura` and `light_aura` are all authored with no `tickInterval` today, so
this was one forgotten key away, not a hypothetical.

⇒ **Slow and FireWard ship UNPRICED and that is a deliberate gap, not an
oversight** — at a 1-tick cadence there is no survivable non-zero price to
author. Giving them a real cadence is a behaviour change and belongs with C2c.

⇒ **`TestAuraCostDrainIsSurvivableAtLevelOne`** bounds the level-1 drain
*including the floor* at 6 %/s. **Proven to bite**: authoring `0.0001` — one
hundredth of a percent — on Slow fails it at **30 %/s**.

⇒ **`TestNoCostOnAnEffectThatCanNeverBeCharged`** is the other half. Only the
**seven** appliers in the dispatch switch can report "landed", so an active
aura's `light_aura` can never be charged, and a passive never reaches the
dispatch at all. A cost there is inert — the skill reads as priced in the JSON
*and in the tooltip* while costing nothing, which is the failure mode that
survives longest because it looks like a balance opinion. (Cooldowns are exempt:
`cooldownCostHP` sums every effect whatever its type.)

**⭐ The battery could not see any of this, and D15 is not why.** L8 was
implemented correctly — `AuraSpec` and `auraSpecOf` both carry the cost — but
**`TTD` is by construction the *idle player* scenario (`PlayerAuraActive:
false`)** and `TTK` ends when the mob dies. Neither can observe an aura cost, so
all nine presets reported TTK and TTD **unchanged to the tick** after every cost
in the game was authored. The measurement lives in the **chain battery**, A/B'd
against a cost-stripped copy of `api/`:

| preset (max) | kph free | kph costed | |
| --- | --- | --- | --- |
| **Damage** | 63.32 | **63.32** | the free floor, proven free end to end |
| Reaper | 47.87 | 43.22 | −9.7 % |
| LongRangeStrike | 47.87 | 43.22 | −9.7 % |
| Berserker | 61.43 | 55.60 | −9.5 % |
| Vanguard | 63.32 | 54.73 | −13.6 % |
| Warbanner | 67.47 | 55.86 | −17.2 % |
| **Spearhead** | 77.66 | 61.83 | −20.4 %, the ceiling pays most |

**⚑ And it caught a real defect before it shipped: the two `dot_aura` skills
KILLED their caster** — Immolate and Wildfire went facetank survival **100 % →
0 %**. Two causes compound: the dot line re-applies every **20** ticks while its
dot only fires every **60**, so it is charged 3× more often than it deals
damage; and the 1-HP floor makes the cheapest possible 20-tick cost 1.5 %/s, so
there is no cheap option to author. **Both ship unpriced, with the reason in the
content itself.** ⭐ The real defect is upstream and is C2c's first job: at
9.45 HP/s Immolate is **barely half the output of the permanently free Damage
aura** (20.1 HP/s) — a cap-10 core aura sitting *below* the free floor, which
inverts D16b.

**What else landed:**

- **`HealParams.SelfDamageHp` is GONE** — struct, accessor, both JSON spellings
  (L6), the `effectKeys` allowlist, the mapper, the client interface, the
  tooltip, and the 5 authored values. ⚑ The effect-key allowlist is a **real**
  guard and proved it: with the field deleted the stale embedded copy hard-
  failed with `field "selfDamageHP" is not valid on this effect type` (this is
  narrower than L-O, which is about *skill-level* keys). ⚑ It only went red
  after `cp-defs` — a full-suite run against stale embedded content was green.
- **Five tests migrated rather than deleted.** The guarantee they pinned — a
  cost that falls with level and clamps at 0, never a refund — still exists, on
  `EffectDef.CostFractionAt`. ⚑ `TestApplyHealAura_PowerScaleMultipliesHealAnd
  SelfCost` needed its fake's *pool* to move with the power scale, because that
  is now the only route by which a cost scales: the old absolute cost was
  multiplied by `casterPowerScale` at the apply site, and the fraction model
  drops that second mechanism — max health already carries f(L).
- **The client never declared the cost fields at all**, so as authored every
  cost in the game would have been **invisible** — strictly worse than L9.
  `SkillEffect` now carries them and the tooltip renders them **as a
  percentage**, not absolute HP: the client has no `baseHealth` to convert with,
  and the PO already ruled the "% of max HP" shape keeps the percentage alone
  (2026-07-29 sweep). ⚑ **Where the line goes follows how the cost is charged**
  — per effect on its own cadence for an aura, once beside `Cooldown:` for a
  cooldown, because CallForAid's three summons at 2 % each cost **6 %** per cast
  and printing "2 %" three times would understate it threefold. Pinned by a new
  vitest leg.
- **`Discipline`** (id 65, passive, cap 5, `costReduction` 0.06 + 0.03/level) —
  D13's stat finally has a skill. Milestone unlock at **level 5**, roughly where
  costs start to bite. ⚑ It cannot cheapen the free floor: 0 × anything is 0.

**Verified:** full Go suite green (28 pkgs) + `vet` + `gofmt` clean · guardrails
`-count=2` · alloc `-count=2` · synthetic battery byte-identical · chain battery
A/B'd against a cost-stripped content copy (table above) · boot **both ways**
0 errors 0 warnings 0 panics — **87** skills / **3** milestone unlocks / 15
factions / 64 mobs / 10 recipes / 4 quests · frontend `tsc` clean + **87**
vitest (was 86) · **`round4-tooltip.mjs` green** — and it proves the
generalisation at the real surface: the cost line renders on a **`hot_aura`**
(not a heal payload) and is **byte-identical at character level 1 and 30**
(`Costs you: 0.51% → 0.64% of max HP every 1.98s`) while the HP line moves
4 → 107 · **`swift-cooldown.mjs` 7/7** for the per-cast line
(`Costs you: 1.5% → 1.88% of max HP per cast`), 0 console errors, 0 context
losses.
⚑ One §29 context-loss run discarded and re-run clean — the standing rule.

**Not in C2b:** no damage number moved, Wild still exists, no damage types. The
free five are still free and now provably so through a whole 20-fight chain.

### C2c — the deep retune ✅ 2026-07-31 (uncommitted)

**D16b now holds, and it did not before.** The pass opened by measuring the
whole damage-aura ladder on chain kills/hour, and the free floor was **tied for
the best damage aura in the game** — above the sanctioned ceiling, above every
costed alternative. D16b was inverted across the board, not in one place.

| | before | after |
| --- | --- | --- |
| Spearhead | 61.83 | **61.83** (still top) |
| Paladin | 45.42 | 59.24 |
| Warbanner | 55.86 | 55.86 |
| Berserker | 55.60 | 55.60 |
| Vanguard | 54.73 | 54.73 |
| Reaper | 43.22 | 53.89 |
| LongRangeStrike | 43.22 | 53.89 |
| Suppression | 32.94 | 50.29 |
| Wildfire | 30.42 | 50.07 |
| Immolate | 30.42 | 50.07 |
| **Damage (free)** | **63.32 — first** | **47.32 — last** |
| Wild | 56.46 | *deleted* |

⚑ **Damage's level 1 is UNTOUCHED at 14 HP; only its slope moved** (1.4222 →
0.2222, so L10 is 16 rather than 26.8). That is deliberate on two counts: it
says the right thing — the free aura is fine when you start and falls behind as
everything else scales — and it keeps
`TestGuardrails_TierThresholdsVsRealRoster` calibrated, because that bot's
weapon is **authored Damage at L1**. Re-baselining the tier thresholds would
have been a separate project.

**⭐ The C2b diagnosis was half wrong, and measuring is what showed it.** C2b
blamed the dot auras' lethality on cadence — re-applying every 20 ticks against
a 60-tick dot charges the caster three times per hit landed. C2c implemented
that fix, and the skills got **worse** (Immolate 30.42 → 40.27, still far below
the free floor): a 60-tick cadence delays the first tick by 2 s against a ~5 s
kill, and the 2026-07-21 dot-responsiveness halving exists for exactly that
reason. **The real cause was weakness.** At 9.45 HP/s the skill could not afford
*any* price. Raising the damage (L10 18.9 → 34) and keeping the 20-tick cadence
with a third of the price gives **50.07 kph at 100 % survival**. The cadence
revert is recorded in the content and in the preset pin, so the next reader does
not re-derive the wrong fix.

**The rest of the retune:**

- **Reaper** — D12's two named culprits, both cut: radius **2.0 → 1.5** (it is
  kiteable again) and lifesteal **0.5 → 0.3**, paid for with real damage
  (L10 18 → 26) and a re-price. It stops being a strict upgrade and becomes a
  trade.
- **LongRangeStrike** — L10 17 → 22, and its reach is now paid for rather than
  free (D12): the √radius term prices a 3.0 ring at nearly double a 1.0 one.
- **Recover — D14, the pass's headline dead-content case.** Flat `4 × 9 = 36 HP`
  became `healFractionOfMax 0.03 + 0.005/level` over 9 ticks, so it is worth the
  same share of the pool forever instead of 36 % of a level-1 pool and 1.4 % of
  a level-30 one. Cap **1 → 5** now that there is something to scale — it was 1
  in C2a precisely because there was not. ⚑ Flat `healHP` is *deleted*, not
  zeroed: L11 hard-fails on both.
- **Slow and FireWard are priced after all.** C2b left them free because a
  1-tick cadence has no survivable price. The engine already solved it:
  `applySlowAura` and `applyResistAura` both derive the buff duration as
  `tickInterval + 1`, so **raising the cadence to 30 leaves no gap** — the
  behaviour is preserved by construction, and the effect becomes priceable.
- **Wild deleted** (D12 item 4), and its three drop slots — EliteWolf 0.5,
  SaberToothCat 0.2, AngryMammoth 1.0 — go **empty** per the PO, each annotated
  in the mob so the gap reads as a decision.
- **Suppression** (L5 12.1 → 20) and **Paladin** (L5 18.8 → 20) — both combos
  sat at or below their own ingredients.

⚑ **The chain metric is quantized and it matters when tuning.** Paladin at
L5 19 measures 45.42 and at L5 20 measures 59.24, with *nothing in between* —
fights resolve in whole aura ticks, so one fewer tick is a cliff. 20 was taken
because the alternative put a combo below the free floor.

⚑ **Multi-target ceiling auras under-read in 1v1**, which is a cost-pass
artefact worth knowing before anyone "fixes" it: Vanguard and Warbanner pay for
two-target damage, a heal leg and a shield leg that do nothing against a single
mob, so Paladin now beats them on chain kph while remaining far below them on
sustained EV/tick — where `TestGuardrails_CeilingOrdering` still asserts the §A
ordering, and still passes at `-count=2`.

⚑ **A sim-fidelity gap found while reading the ladder: `AuraSpec` has no notion
of `damage.Gated`,** so Harvest and Pickaxe derived into presets as full-power
combat auras and **topped the kills/hour table** — while in the real game a
gated hit only damages targets whose resistances name its tag, i.e. they cannot
scratch anything. Reporting the free gathering tool as the strongest damage aura
to a pass reading that table for exactly this ordering is worse than not
reporting it, so `hasDamageEffect` now excludes gated damage. The roster is 22
player presets, Wild and both gate skills gone.

⚑ **A second unrendered branch, the same shape as C2b's:** `HotParams` gained
`fractionOfMax` in C1 and **no content used it until Recover**, so the tooltip
had no case for it — Recover would have read *"Heal over time: 0 × 9 over
17.82s"*, taking the flat-`hp` path against `hp: 0`. The client interface did
not declare the field either. Both fixed, with a vitest leg.

**Verified:** full Go suite green (28 pkgs) + `vet` + `gofmt` clean · guardrails
`-count=2` (the §A ceiling ordering held through every damage change) · alloc
`-count=2` · synthetic battery byte-identical · full chain ladder re-measured,
**every skill at 100 % survival** · boot **both ways** 0 errors 0 warnings
0 panics — **86** skills (87 − Wild) / 3 milestone unlocks / 15 factions / 64
mobs / 10 recipes / 4 quests · frontend `tsc` clean + **88** vitest (was 87) +
prod build · **`round4-tooltip.mjs` green** · **`swift-cooldown.mjs` 7/7**,
0 console errors, 0 context losses · served payload spot-checked for the four
changed skills (Damage free, Immolate priced, Recover fractional, Discipline's
stat).
⚑ One §29 context-loss run discarded and re-run clean — the standing rule.

**Not in C2c:** damage types (C2d), and the ladder above is a *starting* ladder
— every number in it is [PLACEHOLDER] and the PO feel pass is what judges it.

### C2d — damage types ✅ 2026-07-31 (uncommitted) — C2 COMPLETE

**Resistances mitigate damage for the first time in the project's life.** Before
this they existed *only* as lock-and-key gates — all four authoring mobs used
the `{"*": 0, "<key>": 1}` form — so a damage type was decoration and every hit
in the game landed for full.

**The split (D4), which is the part worth keeping.** One map was answering two
unrelated questions: *"a turnip resists everything except harvest"* is a **lock
and key**, *"a troll takes half damage from bleed"* is a **resistance**. Written
in the same words, three defects followed, and all three are structural rather
than incidental:

1. a mistyped key (`damageTags: ["harvst"]`) shipped as a skill that **silently
   hit nothing** — arbitrary strings were explicitly "by design";
2. `GateOpensFor` needed a **special case for `"*"`** so a wildcard could not
   accidentally open every gate;
3. **L13** — adding a damage type silently changed what a wildcard mob was
   immune to.

Now: `damageTags` is a **closed vocabulary** (`physical` `fire` `frost` `nature`
`poison` `bleed`) and `gateKey` is its own field against its own closed list
(`harvest` `smash`); mobs carry `factors.resistances` **and** `factors.gateKeys`
separately. **Each side rejects the other's words by name** — authoring
`damageTags: ["harvest"]` says *"that is a GATE KEY"*. A gated hit declares no
damage type at all (its targets are an explicit list, so mitigation has nothing
to say), and authoring both hard-fails.

⚑ **Four tests died in `resist_test.go`, and their deaths are the argument.**
They pinned the wildcard-must-not-open-a-gate case, the explicit-`{"key": 0}`
opens-then-zeroes case, and the multi-tag-opens-on-any-one case. **None of those
questions can be asked any more** — a key list has no wildcard, no multiplier
and no second meaning. `GateOpensFor` is now a membership test.

⚑ **The split retires a documented capability, deliberately.** `ResistMultiplier`
advertised bespoke tags composing with general ones (*"a general `fire` resist
composes with a bespoke `boss_x_lava` one"*). Closing the vocabulary removes
that. **No content ever used it**, and the price of keeping it open was that
every typo shipped inert — but re-opening it for boss content is now a
deliberate decision rather than an accident away. Recorded in the code, not just
here.

**L12 discharged:** 9 payloads across 10 skills tagged explicitly — Reaper is
**`bleed`** (the scythe: execute + lifesteal) and Suppression **`frost`** (D4's
own suggestion for the Slow line); the rest physical. This mattered *because* it
was mostly making the implicit explicit: untagged damage already normalised to
`physical`, so the moment mitigation existed, all 42 untagged skills silently
became physical-resistible.

**The curated set** (9 mobs, D4's *"so a type choice actually matters"*):
FireElemental + GreaterFireElemental `fire 0.25 / frost 1.5` · BanditPyromancer
`fire 0.5` · **Troll `fire 1.5 / bleed 0.5`** — the classic, and the sharpest
trade in the game: the bleed line is the *wrong* answer to a troll and fire is
the right one · Spider/GiantSpider/VenomSpider `poison 0.25` · Bear/DireBear
`frost 0.5`. `nature` ships unused, as D4 accepts.

⚑ **Every entry is non-physical on purpose, and a test now enforces it.**
`TestGuardrails_TierThresholdsVsRealRoster` drives its bot with authored
`Damage` at L1 — which C2c left at 14 HP and C2d tagged `physical`. A physical
resistance anywhere in the roster would silently re-calibrate the tier
thresholds, and the guardrails would move somewhere unrelated and read as a
content regression. `TestNoCuratedResistanceTouchesPhysical` makes authoring one
a deliberate act.

⚑ **No battery can see any of this.** The sim builds mobs from synthetic inline
definitions and its CLI chain takes `-mob-hp`/`-mob-dmg`, not an authored mob —
L7's blind spot, total here. So mitigation is proven by
`TestCuratedResistancesMitigateRealSkills`, which pairs **real skills with real
mobs** over `api/` rather than asserting the JSON back at itself: retagging
Reaper off `bleed` breaks it exactly as surely as deleting the Troll's entry,
and it carries controls (Wolf takes every type in full; Damage is unresisted
everywhere).

⚑ **A crash caught by the wire shape, not by types.** `Tags` is nil on a gated
payload, and Go marshals a nil slice as JSON **`null`** — the tooltip's
`damage.tags.length` would have thrown, inside the tooltip for **Harvest**,
which every new player is taught. The gated branch now runs first and never
touches `tags`; the vitest leg feeds it `null` deliberately, and the served
payload confirms `tags=None gateKey=harvest`.

**Verified:** full Go suite green (28 pkgs) + `vet` + `gofmt` clean ·
guardrails `-count=2` (unmoved, by construction) · alloc `-count=2` · synthetic
battery byte-identical · boot **both ways** 0 errors 0 warnings 0 panics — 86
skills / 64 mobs · frontend `tsc` clean + **89** vitest (was 88) + prod build ·
**`round4-tooltip.mjs` green** · served payload spot-checked (Reaper `bleed`,
Suppression `frost`, Immolate `fire`, Harvest `gateKey`). Manual §1/§2, the
authored-key table, `content-auras.md` and `gdd.md` §415 all re-pointed off the
retired key.
⚑ One §29 context-loss run discarded and re-run clean — the standing rule.

### The harness gate (run 2026-07-31, after C2d, one at a time on a fresh server)

Per the `chunk-wrap` rule, every harness whose coverage row this pass touches was
re-run against the finished state:

| harness | why it is owned by this pass | result |
| --- | --- | --- |
| `round4-tooltip.mjs` | the `/skills` payload shape and `SkillTooltip.ts` — both rewritten | **green** |
| `swift-cooldown.mjs` | Swift's cap, cost and tooltip line | **7/7** |
| `backlog33-prehot.mjs` | `HotParams`, Heal and Rejuvenation content all moved | **4/4**, 0 ctx losses |
| `chunkC4-quests.mjs` | it owns the milestone table, which gained Discipline | **green** (its documented D5 SKIP) |
| `chunk2-follower.mjs` | the summon path + the spellbook `+` button C1 reworked | **6/6** |
| `chunk2-calm.mjs` | Calm's cap and its new cost | **7/7** |
| `chunk3-charm.mjs` | CharmBeast/BindElemental caps and costs | ⚠ **unresolved — see below** |

⚠ **`chunk3-charm.mjs` is RED and I could not prove it pre-existing.** Four runs
gave **8/9, 7/9, 7/9, 6/9** with a *different* failing subset each time, drawn
from three legs — "follows its charmer", "the charm expires and the pip goes
out", "it fights for its charmer". **All three require the pet to still be
alive**, which is exactly the fragility already accepted on the record: *"the pet
is focused by its former packmates and can die in ~8 s — D9 working as ruled,
PO-accepted 2026-07-29"*. Nothing in this pass touches it in principle — mob
damage, the 36 mob skills and the 64-mob roster are all frozen by D3, the pet is
a Wolf using WolfBite, and its attackers are wolves using WolfBite; charm gained
only a cap (duration at L1 unchanged at 1800 ticks) and a caster-side cast cost.
**But that is an argument, not a measurement.** A HEAD worktree was built to get
the baseline and the harness hung against it (client joined, then stalled, twice
at 300 s) — so the comparison is **inconclusive, not favourable**, and this is
recorded rather than waved through. It is the one thing in this pass that is not
green.

⚑ **A correction to the C2b ledger:** `TestMilestoneUnlocksFromFS_PinnedTable`
pins the milestone table against real `api/` content, and C2b's Discipline entry
made it red. It was reported green in C2b's verification and was not — the
failure surfaced during C2d and is fixed there. The rest of C2b's verification
stands.
