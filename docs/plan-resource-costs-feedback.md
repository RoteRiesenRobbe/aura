# Resource costs — feedback intake (Pass 1, C1 + C2)

The numbers rewrite is built and committed — `40d9b204`, 2026-08-01
(`plan-numbers-rewrite.md` §7).
This doc is the intake for what came back from it: the **PO feel pass**
(2026-08-01, the first real play of the priced catalog) and a **technical
review** of the cost system run against HEAD the same day.

Two separate lenses on one change.

⚑ Two technical findings were fixed in the review session itself (§3.1, §3.3)
and rode into `40d9b204` with the pass.

> **⭐ TRIAGED 2026-08-01 — this doc is now a PLAN.** Every finding was
> re-checked against HEAD line by line (that pass **corrected §3.2** and found
> the new §3.10), the eight open decisions were put to the PO and **all eight
> are ruled** (§5), and the work is chunked into **R1 → R2 → R3** plus one
> design session (§6). §6 is the schedule and the order in it is load-bearing.
>
> **Progress: R1 ✅ + R2 ✅ + R3 ✅ built 2026-08-01 (ledgers §8), plus the
> follow-up `194036c8` that closed the R1/R2 cost-wording discrepancy R3
> surfaced. All build work in this plan is DONE.**
>
> ⭐ **The PO feel pass it ended owing has RUN (2026-08-01) — its intake and
> plan are `plan-feel-pass-2.md`.** The R-series landed: entry pricing reads
> correctly *and* generates tactics, and R3's one beat reads *"much better and
> more legible"*. What came back is presentation, one live bug (**no dot has
> ever leeched** — R3 fixed two of the three damage payload sites) and two
> design questions, chunked there as **N1 → N5**. ⚑ **F4** (§6, quest progress
> only after acceptance) is picked up by that plan as **N4**, with the ruling
> that baselines are **per stage entry**. **R4 — the downtime design session —
> is now unblocked and is the last thing this plan is waiting on.**
>
> ⭐ **R4 WIDENED 2026-08-02** (`plan-playtest-feedback.md` §Intake round 8
> item 1): it also owns **a free, baseline Recall**. PO ruling — the way back to
> safety and the way back to fighting shape are **one loop, designed together**,
> both available to a level-1 character from the start. Constraints + the five
> open questions: §2.3's *"Recall belongs to this design"* sub-section.

---

## 1. The headline: the premise works

> *"Resource cost changes feel good actually. So far, only minimal issues."*

The pass exists to test one thing — GDD §3's claim that **spending
survivability for power is the combat game**. It lands. The PO reported
switching auras mid-fight in response to the drain, which is the exact
behaviour the design predicted and the batteries could not measure.

So the model is not on trial any more. What follows is tuning, presentation,
and a set of technical seams that will bite later if they are left alone.

---

## 2. PO feel-pass feedback (2026-08-01)

Verbatim intent, grouped. Checklist replies are in §7.

### 2.1 General feedback

**F1 — First Aid must be free.** It *generates* resource, so charging for it is
incoherent. It should become the **healing equivalent of the free floor** — the
baseline the rest of the heal line is balanced against, exactly as `Damage` is
for the damage line (D6/D16b).

⇒ Other resource generators may then cost *something* to differentiate: an
up-front cost that pays back over time, an initial immunity window, or another
powerful rider. Free-with-no-rider is First Aid's identity.

**F2 — Discipline's cost reduction is invisible in the frontend.** PO tested it:
*"the effect works, just not shown in the frontend on skills live."*
✅ **Confirmed technically** — see §3.3. The server applies it; the client has
no knowledge of it whatsoever.

**F3 — The spellbook scrollbar overlaps the level buttons.** Give the panel more
right-hand padding, or widen it when the scrollbar becomes active.

**F4 — Quest progress must only count after acceptance.** Reverses the
retroactive-credit decision (`archive/plan-quests.md` D-series: lifetime
counters credit work done *before* the quest was taken). It does not fit the MMO
feel. ⚑ Unrelated to resource costs — recorded here because it arrived in the
same pass; it belongs to the quest plan.

**F5 — Multi-effect auras should tick all effects at once.** Warbanner's four
effects on four cadences is *"impossible to follow and piece together, it feels
random."* Since the effects share a range, they should share a beat. Re-author
every current multi-effect aura to match. ⚑ This has a hard technical
constraint — see §4.1.

**F6 — Show resource cost in absolute HP, not percentages**, computed from
current max HP. ⚑ This **reverses the 2026-07-29 sweep ruling** ("the `% of max
HP` tooltip keeps the percentage alone") and it *supersedes* the fix made in
§3.1 — see §4.2.

**F7 — The resource needs a name and a colour code**, so UI can reference it
consistently. Today it is "HP" in some places and "resource" in others, and the
cost line has no visual identity tying it to the bar it drains.
✅ **RULED: it is called "Focus"** — see §5.7.

### 2.2 Skill-specific

**F8 — Reaper is far too strong.** *"It gives more resource back than it costs,
you can heal yourself on lower level or smaller mobs, the radius is still
strong."* The C2c nerf (radius 2.0 → 1.5, lifesteal 0.5 → 0.3) did not go far
enough. PO asks whether it can gain damage while active as a counterweight, and
suggests nerfing lifesteal further.

**F9 — Dot auras re-charge on re-application, and it reads wrong.** Immolate
pays every 20 ticks while its dot only fires every 60, so *"it feels weird to
pay again even if the dot is already applied, especially since the dot does not
tick on the first hit."* PO is explicitly unsure of the right model and asked
for options — see §5.1.

**F10 — Recover's tooltip says "Also heals you"** when it *only* heals you.
✅ **Confirmed** — `api/skills/recover.json` authors `targetsSelf: true` +
`targetsAllies: false`, and `SkillTooltip.ts:357` emits the line unconditionally
on `hot.targetsSelf`. The word "Also" is only correct alongside ally targeting.

**F11 — The combo upgrade system is losing the PO.** Suppression and Paladin
were raised above their own ingredients in C2c, but *"nah not really — I am
getting less convinced of the upgrade system."* Parked deliberately; couples to
`backlog.md` §37 and the aura-augmentation idea.

### 2.3 Downtime — the one design gap the pass opened

Costs are a new tax on top of the 10 s downtime lock, and downtime is now the
weakest part of the loop: *"downtime wasn't really fun and there was quite a lot
of it… this needs some form of player agency."*

PO explicitly **rejects simply raising out-of-combat regen**. The shape wanted
is a consumable-ish agency loop, WoW-Classic eating / Gothic food:

> *"Maybe going to a campfire gives 5 'food' charges that you can use underway
> to sit still but regen health, but once you are out you should head to a
> campfire."*

⇒ This is a **new design item**, not a tuning knob. It couples to `backlog.md`
§32 (consumable cooldowns / spellbook charges — *does a charge survive death?*)
and to the campfire system already in v1 scope.

#### ⭐ Widened 2026-08-02 — Recall belongs to this design, not beside it

PO, against the accounts build (`plan-playtest-feedback.md` §Intake round 8
item 1):

> *"recall should not have a cost and become a baseline ability. author that
> design together with the downtime recovery changes that still need a design.
> both should be designed together. both options should be available from the
> start. the out-of-combat regen might scale up in charges or otherwise with
> level."*

**Why they are one design.** Recall and downtime recovery are the same loop seen
from its two ends — *get back to safety* and *recover once you are there*. The
campfire-charges sketch above already makes the campfire the recovery anchor;
Recall is the transport to it. Price one without the other and half a loop is
priced: a free recovery charge is worth little if reaching the fire costs 5 % of
a pool you are trying to refill, and a free Recall is worth little if arriving
buys nothing but the same 10 s lock.

**What the widening adds as CONSTRAINTS on R4** (not as questions):

| constraint | consequence |
| --- | --- |
| **Recall costs nothing.** | Drop `costFractionOfMax: 0.05` from `api/skills/recall.json`. Same argument as F1/First Aid and GDD §3's free damage aura: a skill whose job is to *end* a bad state must not deepen it. ⚑ It joins the `freeFloorSkills` guard, exactly as First Aid did (§5.8) — otherwise the guard reads a free skill as an authoring mistake. |
| **Recall is baseline.** | It is not something you are taught. Today it is: `town-crier.json` and `wanderer.json` both carry a `teach_skill` row for it, and a fresh character has nothing. |
| **Both available from the start.** | Whatever the recovery mechanism turns out to be, a **level-1 character holds it and Recall on their first minute** — the design may not gate either behind a teacher, a level, or a quest. |
| **Out-of-combat regen may scale with level** — *"in charges or otherwise"*. | The first PO signal that the recovery mechanism is allowed to *grow*. ⚑ It is not a reversal of the standing **rejection of simply raising out-of-combat regen** (§2.3): what is sanctioned is scaling the agency loop, not deleting it by making passive regen fast enough that nobody uses it. |

**What R4 must still RULE** — the open questions, collected so the design
session does not have to rediscover them:

1. **What "baseline" means mechanically.** A level-1 entry in
   `api/milestones/milestone-unlocks.json` (the `Damage` precedent, plus the
   2026-08-02 follow-on that pre-equips a creation-seeded active aura in its
   slot) — or a new *"every character always has this"* concept? ⚑ The milestone
   route is the cheap one and it already has a pre-equip rule, but Recall is a
   **cooldown**, and that rule fills the first free *aura* slot only.
2. **What happens to the two teachers.** The Town Crier's `teachings` node holds
   *only* Recall (`town-crier.json`) and the Wanderer's holds only Recall
   (`wanderer.json`) — so removing the row empties both nodes, and the
   2026-08-02 empty-destination prune then removes the *"Teach me something."*
   rows that lead to them. Both NPCs lose their teaching function entirely
   unless they are given something else to teach.
3. **Whether the 10 s cast and 5 min cooldown survive.** Free changes what the
   cooldown is *for*: with a cost, the price was the brake; without one, the
   cast time and cooldown are the only brakes left. ⚑ `castInterruptedByDamage`
   is what keeps it from being an escape button, and it should be defended
   explicitly rather than inherited.
4. **What the level scaling actually scales** — charge *count*, charge
   *strength*, regen *rate* while resting, or the campfire's grant size. The PO
   left this open (*"in charges or otherwise"*).
5. **Whether recovery is a spellbook entry at all.** §32's charge concept would
   make it one; a campfire-granted consumable need not be. This is the question
   that decides whether R4 touches the skill schema.

⚑ **Persistence is now live, which changes one of R4's inputs.** When §2.3 was
written, `backlog.md` §32's *does a charge survive death?* was a schema question
for a step 8a that had not been built. 8a is code-complete: `persist` carries
level, XP, spellbook, loadout, active aura, the quest ledger and
`home_campfire_id`. A charge count is a new persisted field — small, but a
**migration**, so R4 should answer §32 rather than leave it, and say so in the
same breath as choosing the mechanism.

---

## 3. Technical findings

Reviewed against HEAD 2026-08-01. Every claim below was validated by probe or
by reading the live path — none are estimates.

### 3.1 ✅ FIXED — the drain guard was blind to haste

`TestAuraCostDrainIsSurvivableAtLevelOne` called
`EffectiveTickInterval(effect, level, 1)` — factor hardcoded. The live site
(`sys/skills.go:209-215`) passes the caster's `TickRateFactor()`, and Haste
authors `tickRateFactor: 0.5`, so a haste **halves the interval and doubles how
often every cost is charged**.

**Probe:** flipping the test's factor to 0.5 fails on **Heal (skill levels 1–3,
peak 7.5 %/s)** and **Spearhead (6–10, peak 7.8 %/s)** — both over the 6 %/s
bound the guard claims to enforce, with the guard green.

**Fix:** `worstSustainableHaste()` now derives the factor and its duty cycle
(`durationTicks / cooldownTicks`) from authored content, and the assertion
duty-cycle-weights the two cadences. Sustained rather than peak (a peak assert
scaled by the same factor is the factor-1 assert restated, and a haste window
cannot kill — the never-kill clamp holds); hastes only (a `tick_rate` above 1 is
a slow and would let the guard argue itself down).

**Proven to bite** on both axes: window 90 → 300 ticks goes red on Spearhead,
factor 0.5 → 0.25 goes red on Heal and Spearhead. Green on real content.

### 3.2 ✅ RULED (§5.2) → **R2** — "landed" is three different rules, and D8 describes one

D8 states *"an aura is a field: it pays only when its effect actually lands."*
Read across all seven appliers, that is implemented three different ways:

| applier | charges when |
| --- | --- |
| `applyHealAura` | someone was **actually healed** (`healed <= 0 → continue`) |
| `applyDamageAura`, `applyDotEffect` | something was hit |
| `applyShieldAura`, `applyResistAura` | a target was merely **in range** (`return hitAny \|\| len(targets) > 0`) |
| …either, with `TargetsSelf` | **unconditionally true** |

Only heal pays for work done. Shield and resist charge a **proximity tax**, and
a self-targeting one charges for existing.

**Live consequence, computed.** Warbanner's shield is `0.0049 + 0.000911/level`
every 30 ticks with `targetsAllies: true`. At skill level 10 that is
**1.31 %/s** for an ally standing in range — no enemy required. Neither
`applyShieldAura` nor `applyResistAura` stamps combat (verified), so
out-of-combat regen is running: `0.00033 × 30 × taper(0.4)` = **0.40 %/s** at a
high character level.

⇒ **Net −0.91 %/s standing still** next to a companion or another player. Full
pool to the 1-HP clamp in ~110 s of doing nothing. FireWard at cap is marginally
net-negative the same way.

⚑ **CORRECTION (triage code check, 2026-08-01).** The original write-up said the
`targetsSelf` half is *"latent, not live — no costed skill authors it today"*.
**That is wrong.** Three costed effects author it right now:

| skill | effect | tick | cost at cap | charge while **completely alone** |
| --- | --- | --- | --- | --- |
| Warbanner | `shield_aura` `targetsSelf: true` | 30 | 1.31 % | **1.31 %/s** |
| FireWard | `resist_aura` `targetsSelf: true` | 30 | 0.90 % | **0.90 %/s** |
| Vanguard | `shield_aura` `targetsSelf: true` | 90 | 0.65 % | **0.22 %/s** |

`applyShieldAura` / `applyResistAura` set `hitAny = true` on the self-apply and
return it, so the "did it land" question is answered **true before the target
set is even looked at**. No ally is required — no *entity* is required. Warbanner
alone in an empty field out-drains the 0.40 %/s tapered regen by 3×, and the
proximity tax described above is the *milder* case, not the failure mode.

⇒ ✅ **RULED (§5.2): pay for work done.** One rule across all seven appliers.
See §6 R2 for what that means per applier.

### 3.3 ✅ FIXED (superseded — see §4.2) — the tooltip understated costs

The justifying comment claimed *"the client has no baseHealth to turn the
fraction into a number."* **That is false** — the client already receives the
player's real `maxHealth` on the wire and drives the health bar from it
(`Player.ts:62-82`, `GameStateMessage.ts:303`).

`vitals.HP` floors any positive cost at 1 HP, so while the pool is smaller than
`1/fraction` the real charge is a flat 1 HP and the authored fraction
understates it. Measured across the catalog: **12 of the 20 costed aura effects
are floored somewhere in character levels 1–12** — Immolate through CL 12
(0.26 % shown, 1 % charged at CL 1 — 3.8×), Vanguard's shield through CL 10,
five more through CL 5–7.

**Fix:** the tooltip now renders the *effective* percentage — the authored
fraction raised to `1/maxHealth` where the floor binds. Max health is mirrored
into `Skills.ts` on the `setLocalPlayerLevel` precedent and passed into
`formatSkillTooltip` as a parameter so the formatter stays pure. The floor
applies to the **sum** for a cooldown (`cooldownCostHP` totals raw fractions and
converts once), which is pinned by a new vitest leg. 4 legs added, 93 pass.

⚑ **F6 supersedes the display half of this** — absolute HP is strictly better
and makes the correction implicit. The plumbing this added is what F6 needs.

⚑ **This is also the technical half of F2:** the client has **zero** references
to `costReduction` / `CostFactor` (verified by grep across `frontend/src`). The
server applies the passive in `effectCostHP`; the tooltip renders the authored
fraction and cannot know about it. The PO's report is exactly right, and the fix
is the same plumbing — the reduction has to reach the client.

### 3.4 ✅ RULED (§5.3) — ACCEPTED — the 1-HP floor quantizes the entire price list

Measured at a level-1 pool: **15 of the 20 costed aura effects collapse to
exactly 1 HP**. The authored **38.5× spread compresses to 10×** (3× excluding
Heal, which is an outlier at 10 %).

⇒ Every reach term (√radius), multi-target term and sustain surcharge C2b
priced is **invisible until the pool is large enough to resolve them**. The cost
model's resolution is 1 HP, and at a 100 HP pool that is 1 %.

⚑ The floor is already a known systemic quantizer elsewhere and was documented
for **regen** — `conf.default.json`'s mob block: *"vitals.HP floors a step at
1 HP, so pools under ~150 refill in maxHealth/30 s regardless."* It simply was
not carried across to costs.

Alternatives each trade one silent failure for another (drop the floor ⇒ cheap
costs read as priced but charge nothing, the L16 failure mode; accumulate
fractional debt ⇒ per-skill state, against KISS). **PO call.**

### 3.5 ⚠ OPEN — cost is per application, never per target

`auraEffectCost` prices without looking at `targets` at all: a `maxTargets: 5`
aura hitting five enemies pays exactly what it pays hitting one. C2b's
sub-linear multi-target term `1 + 0.5(n−1)` was baked into the authored constant
**at authoring time**.

Verified: no costed skill currently scales `maxTargets` with level, so nothing
drifts today. There is **no runtime seam**, so the first skill that does
silently invalidates its own price.

### 3.6 ⚠ OPEN — `costPayer` is welded to a concrete type

`costPayer` requires `VitalSigns() *model.PlayerVitalSigns` — deliberate (L5:
mobs must not suicide), but it makes the payer gate a **type test rather than a
grantable capability**. `backlog.md` §31's direction is one Actor core with
optional capabilities; the day a companion, structure or charmed pet should pay
for something, this seam has to move in `model`, not in `sys`.

### 3.7 → **R3** (documented, not engineered) — authored effect order is now load-bearing

Effects charge sequentially within one tick, each pricing against the health the
previous one left. For a multi-effect aura near the floor, **JSON ordering
decides which effect gets clamped and which is skipped entirely**. Nothing
documents that authored order carries meaning.

⇒ F5 (tick together) makes this sharper, not softer — see §4.1.

### 3.8 → **R2** — the free floor pays for its own pricing

`effectCostHP` evaluates `payer.MaxHealth()` — a `math.Pow` through `curve.F` —
**before** the zero test, so the permanently-free `Damage` aura, the
most-executed aura in the game, does a Pow per effect per tick that is then
multiplied by zero. It does not allocate, so the alloc guards structurally
cannot see it. Two-line reorder.

### 3.9 ✔ Acceptable as-is

`TestNoCostOnAnEffectThatCanNeverBeCharged` hardcodes the seven chargeable types
that `applyAuraEffect`'s switch dispatches — a second list, but it fails **loud**
(a new chargeable type trips the assert rather than escaping it). Worth knowing,
not worth fixing.

### 3.10 ⚑ NEW (triage code check) — re-pricing for F5 *raises* low-level costs

The interaction that fixes the chunk order. `vitals.HP` is
`round-half-up, floored at 1` (`vitals.go:96-105`), so **dividing an authored
cost does not divide what a low-level player pays — it multiplies it**, because
the smaller number floors to the same 1 HP while the cadence gets faster.

Worked on Warbanner's heal at a level-1 pool of 100 HP:

| | cadence | authored | HP charged | real price |
| --- | --- | --- | --- | --- |
| today | 120 | 0.0106 | `round(1.06)` = 1 | **0.25 HP/s** |
| unified at 40, cost ÷ 3 | 40 | 0.0035 | `round(0.35)` → floor **1** | **0.75 HP/s** |

Throughput-neutral re-pricing is exactly neutral at a large pool and **3×** at a
small one. Every effect F5 subdivides hits this, and it is silent: the authored
number goes down, the guard in §3.1 is a per-second bound that would catch a
gross case but not a 3×, and the batteries run at high level where the floor
does not bind.

⇒ **This is why R3 (content) must not run before R2 (engine) and R1 (display)**:
R2 changes what is charged at all, and R1 is what makes the floored number
*visible* so the re-price can be judged by eye rather than by arithmetic.

### 3.11 ⚑ NEW (triage code check) — F6 puts a Go rounding rule in TypeScript

Showing absolute HP means the client must reproduce `vitals.HP` exactly —
`round half up, then floor at 1` — or the tooltip and the health bar disagree by
a point and the player watches a "1 HP" cost take 2. That is a **cross-language
mirror** of live server arithmetic, the class §35 spent a whole chunk closing.

⇒ R1 pins it the way `SKILL_POINT_COST` is pinned: one shared statement of the
rule, asserted by **both** a Go test and a vitest test
(`api/shared-constants.json` + `SharedConstants.test.ts` +
`cmd/aurad/shared_constants_test.go` are the working precedent).

---

## 4. Where the PO asks and the technical findings collide

These are the interactions worth resolving **before** anything is scheduled.

### 4.1 F5 (tick together) re-prices the whole catalog

Cost is charged **once per application**, so changing an effect's cadence
changes its price by exactly the ratio. The five multi-effect auras today:

| aura | cadences |
| --- | --- |
| Paladin | damage@40 · heal@120 |
| Suppression | damage@40 · **slow@absent (= 1)** |
| Vanguard | damage@40 · heal@120 · shield@90 |
| Warbanner | damage@40 · heal@120 · shield@30 · **slow@absent (= 1)** |
| Wildfire | dot@20 · resist@1 · light@absent (= 1) |

⚑ **Unify to the SLOWEST cadence, never the fastest.** Two of the five carry an
effect at the default interval of **1**, which is L15's trap: unifying downward
would charge every effect 30×/s and, with the 1-HP floor, that is 30 %/s of a
level-1 pool. The guard in §3.1 would catch it — but only if the effect is
priced at all, and both of those slow effects are currently unpriced.

⇒ Warbanner's heal moving 120 → 40 makes it **3× more expensive**; its shield
30 → 40 makes it 0.75×. Every multi-effect aura needs its costs re-authored
after the cadence change, not just its intervals.

⇒ F5 also **partly resolves §3.7**: one shared beat means all effects of an aura
price against the same health in the same tick, so ordering only matters for
which one wins the clamp — a much smaller surface.

✅ **RULED (§5.5): unify at the aura's DAMAGE beat, rescale the rest.** Not the
slowest — the slowest turns Warbanner into a single 4-second pulse and makes its
slow sluggish. The beat is 40 for Paladin / Suppression / Vanguard / Warbanner
and 20 for Wildfire; every slower effect has its per-application magnitude **and**
its cost divided by the ratio, so HP/s and price/s are unchanged at a large pool
(⚑ **not** at a small one — that is §3.10, and it is the reason R3 runs last).

⚑ **The PO's condition on the ruling: a permanent debuff must stay permanent.**
Moving Warbanner's and Suppression's slow from the default interval of **1** to
the shared beat of 40 is safe *by construction* — `applySlowAura` and its
siblings author the buff lifetime as `effectiveTickInterval(effect) + 1`, so the
refresh always outruns the expiry and the debuff never drops. But it is safe by
an invariant nobody has written a test for, and it has two visible consequences
R3 must check rather than assume:

- a mob entering the ring is unslowed for up to **40 ticks (~1.3 s)** instead of
  one tick — the responsiveness price of the shared beat;
- a mob leaving the ring stays slowed for up to **41 ticks** instead of 2 — the
  debuff now lingers, which is a *buff* to the kiting build.

⇒ R3 pins `lifetime > interval` as a loader-level property, not a per-skill
hope: an authored `tickInterval` that ever exceeds the lifetime silently turns a
permanent debuff into a blinking one.

### 4.2 F6 (absolute HP) supersedes §3.3 and absorbs F2

Showing absolute HP computed from current max HP is **strictly better** than the
effective-percentage fix, because the floor and the cost-reduction passive both
become implicit: the number shown is the number charged.

⇒ It needs `CostFactor` on the wire or mirrored client-side (F2), and it needs
the `maxHealth` plumbing §3.3 already added.
⇒ It reverses the 2026-07-29 "percentage alone" ruling — that ruling should be
marked superseded rather than silently contradicted.
⇒ ⚑ It also drags in §3.11: the client has to reproduce `vitals.HP`'s rounding
or the shown number and the charged number disagree.

⚑ **Checklist §3's "the point cost should be absolute" is NOT about skill
points** — clarified by the PO 2026-08-01. The `+` button already shows the real
figure (`+2`, tooltip *"Costs 2 skill points"*), and the only spellbook complaint
was the scrollbar (F3). The ask was always the **resource** cost. So there is no
point-economy presentation work in this plan.

### 4.3 F1 (First Aid free) needs the free-floor guard extended

`freeFloorSkills` in `cmd/aurad/free_floor_test.go` is the L10 guard — it
asserts the five free skills cost nothing at every level. Adding First Aid to
the free floor means adding it **there** too, or the free-floor property is
enforced for five skills and merely hoped for on the sixth.

### 4.4 F8 (Reaper) and §3.2 point the same way

Reaper returning more resource than it costs is the damage-side instance of the
same gap: the cost is a fixed per-application charge with no relationship to
what the effect *returned*. Any Reaper fix should be checked against §3.2 rather
than tuned in isolation.

⚑ **The code check found the mechanical root, and it explains why C2c did not
land.** `reaper.json` carries **both** `lifestealFraction: 0.3` **and**
`berserkerMaxBonusFactor: 1`, and berserker is
`1 + factor × (1 − casterHealthRatio)` (`definition.go:448`) — damage scales to
**2× as the caster's health drops**, while lifesteal returns a fixed *share of
that damage*. So the lower you go the more you heal:

> low HP → more damage → more lifesteal → back up → repeat.

A cost that is a flat fraction of **max** health cannot counterweight a return
that scales with health **missing**. C2c cut the radius (2.0 → 1.5) and the
lifesteal (0.5 → 0.3) — both linear terms against a loop — which is why the PO's
verdict after the nerf was unchanged.

✅ **RULED (§5.6): Reaper drops one rider.** Content-only, and it gives the skill
one identity instead of two that multiply. **Which** rider is the R3 call, with
a recommendation on record: **drop `lifestealFraction`, keep execute +
berserker.** The complaint is literally *"it gives more resource back than it
costs"*, berserker is the more distinctive half, and dropping lifesteal leaves
the priced-aura economy intact rather than handing Reaper a free pass on it.
⚑ Knock-on to note in the commit: Reaper was authored as the smoke content for
*"one aura exercising execute + berserker + lifesteal together"*
(skill-vocab chunk 1) — dropping a rider means that combination is no longer
covered by any live skill, so the test that wants it needs a fixture.

---

## 5. PO decisions (all ruled 2026-08-01)

Eight decisions, taken after the triage code check re-read every finding against
HEAD. Two of the options originally offered here were **withdrawn before the
question was asked**, because the code says they do not work — recorded in 5.1,
since "we already tried that" is the kind of thing a later pass re-proposes.

### 5.1 F9 — how a dot aura pays ✅ **PAY TO IGNITE**

Charge only when the application creates a **genuinely new** dot on at least one
target, never on a refresh — and re-price it to the **whole burn** (~3× today's
per-application figure). You pay to set something alight, not to keep it
burning. `Buffs.ApplyDot` (`buffs.go:257-268`) already distinguishes the two
internally — the refresh path returns early — so the change is to *report* what
it already knows, up through `ApplyDot` on player and mob to `applyDotEffect`.

The PO's objection to this option was *"then holding it on one target is free
after the first tick"*. Re-pricing to the full burn is the answer: the first
application costs what three ticks of burning is worth, so a single target is
paid for in full, up front.

⚑ **Two of the four original options are dead, and the code is why:**

- **Option 4 (align the 20-tick re-application to the 60-tick dot) was already
  tried and measured.** It is written up in `immolate.json` / `wildfire.json`'s
  own `_comment` from C2c: the 2-second delay to the first tick *"cost real
  damage in short fights… and left the skill weaker still"*, so C2c **reverted
  it** and raised damage instead. Proposing it as the free option was this doc
  contradicting its own ledger.
- **Option 3 (charge on the dot's own tick) breaks L4.** The whole cost system
  is built on computing and clamping the charge **before** the effect, so a cost
  can never kill its caster and an unaffordable one skips cleanly. A dot ticking
  out of the buff store is damage *already committed* — there is nothing left to
  skip, and no pre-clamp is possible. It is not a harder version of option 2, it
  is a different invariant.

### 5.2 §3.2 — what "landed" means ✅ **PAY FOR WORK DONE**

One rule across all seven appliers, matching heal's, which is the only one that
implements D8 as written. Per applier, in R2:

- **shield** — charge when the absorb pool was actually consumed and restored, or
  newly granted. A full pool topped up to full is not work.
- **resist / slow** — charge on a genuinely new application only. A refresh at
  the same factor changes nothing but the expiry timer (`buffs.go:194-208`).
- **`targetsSelf`** — stops being a free `true`. It answers the same question as
  every other target: did this do anything.

This kills the idle drain outright, including the §3.2-correction case of an
aura charging full price with nobody in the world nearby.

### 5.3 §3.4 — the 1-HP floor ✅ **KEEP IT, MAKE IT VISIBLE**

No engine change. The floor stays; **R1 is the fix** — an absolute-HP tooltip
shows the number actually charged, so quantization stops being a lie the tooltip
tells. Accepted consequence, on record so no later pass re-opens it as a bug:
**the reach / multi-target / sustain terms C2b priced only resolve past roughly
character level 12**; below that the price list is coarse by construction, the
same way `conf.default.json` already documents the floor quantizing mob regen.

### 5.4 §2.3 — the downtime agency loop ✅ **ITS OWN DESIGN SESSION**

Campfire-granted charges is the PO's own sketch. Not part of R1–R3; couples to
`backlog.md` §32 (does a charge survive death) and §36. See §6 R4.

⭐ **Widened 2026-08-02:** that session also owns **a free, baseline Recall** —
the PO's ruling that the two are one design, with both available from the start.
The constraints and the five open questions are in §2.3.

### 5.5 F5 — the shared beat ✅ **UNIFY AT THE DAMAGE BEAT**

With the PO's condition that permanent debuffs stay permanent. Full ruling and
its two behavioural consequences in §4.1.

### 5.6 F8 — Reaper ✅ **DROP ONE RIDER**

Full ruling and the loop that made it necessary in §4.4.

### 5.7 F7 — the resource's name ✅ **"FOCUS"**

**Focus** is HP and resource in one — the single pool GDD §3 describes, under a
word that carries both meanings without being medical. **"Aura" stays the name
of the field around you**, which is what the game already calls it and what the
whole skill vocabulary is built on.

⇒ The two words name two different things and cannot be confused in a sentence:
*"you spend Focus to project an aura"*. This is the reason the pool is not
called Aura — that reading would have put one word on the pool and on the
active-aura skill category at once, in sentences where both appear
(*"switch aura when your aura is low"*).

This is a vocabulary migration, not a rename of one string: HUD bar text, every
tooltip cost and heal line, the `NotEnoughResource` rejection message, the GDD
and the manuals. ⚑ It is **presentation only** — no Go identifier, wire field or
content key is renamed in R1 (`vitals.HP`, `costFractionOfMax`, `health`,
`max_health` all stay), because a vocabulary pass that also renames the schema
is two changes wearing one commit message. Whether the code follows the word is
a later, separate call.

### 5.8 F1 — First Aid ✅ **FIRST AID ONLY**

Zero its cost, add it to the `freeFloorSkills` guard, touch no other heal. The
follow-on in F1 (*other generators may cost something to differentiate*) is
**not scheduled** — the locked 10 %→2 % heal cost curve stays where it is.

⚑ Worth feeling before anything else moves: a **free** 30-second self-heal for
20–30 % of max pool is already a partial answer to §2.3's downtime gap. R4 should
be designed against a world where First Aid is free, not before it.

---

## 6. The plan

Three build chunks and one design session. **The order is load-bearing**, and
§3.10 is why: R2 changes what gets charged at all, and R1 is what makes a charge
legible — re-authoring the catalog (R3) before either means authoring numbers
against rules that are about to change, and judging them through a tooltip that
misreports them.

> Each chunk is its own execution session, per the working-style rule. Nothing
> here is started.

### R1 — What a cost SAYS (frontend + one wire field) ✅ **BUILT 2026-08-01** (ledger §8)

**No balance movement.** Everything the PO could not read, made readable.

| item | change |
| --- | --- |
| **F6** | Every cost line renders **absolute HP**, computed from the live `maxHealth` (plumbing already landed with §3.3) — auras per beat, cooldowns per cast. |
| **F2** | `cost_factor` joins `GameState` beside `skill_points` (owner-only data, existing home) → mirrored in `Skills.ts` → folded into the number shown, so **Discipline becomes visible** for the first time. |
| **F7** | The resource is **Focus** — bar text, tooltips, rejection message, GDD, manuals — plus the colour tie from a cost line to the bar it drains. Presentation only: no Go identifier, wire field or content key is renamed (§5.7). |
| **F10** | `SkillTooltip.ts:357` — *"Also heals you"* only when `targetsAllies`; Recover says *"Heals you"*. |
| **F3** | `#spellbookList > li` gets right padding so SimpleBar's overlay scrollbar stops sitting on the `+`/`−` buttons. The precedent is 20 lines up in the same file (`HUD.less:609`, *"the right padding keeps text off the scrollbar the moment one appears"*). |

⚑ **Landmines.** ① §3.11 — the absolute number is `vitals.HP` arithmetic in
TypeScript; pin the rounding on both sides against one shared statement, the
`SKILL_POINT_COST` pattern. ② A wire field means **both binding sets regenerate
and deploy together** — the standing rule. ③ The §3.3 tooltip fix is
**superseded here, not extended**: effective-percentage logic comes out, it does
not gain a second mode. ④ The 2026-07-29 *"percentage alone"* ruling gets marked
**superseded** where it is written down, not silently contradicted.

**Verified by:** vitest legs per line (the 4 from §3.3 are rewritten, not
added to), the cross-language rounding pin, `tsc` + prod build, and a `verify`
harness run that reads a real tooltip in a real client — this is a
presentation chunk, so a screenshot is the acceptance test.

### R2 — What "landed" MEANS (engine) ✅ **BUILT 2026-08-01** (ledger §8)

**Moves real prices without moving one authored number**, which is exactly why
it runs before R3 and gets measured on its own.

- **§5.2** — shield / resist / slow / `targetsSelf` charge only for work done.
  The buff store already knows new-from-refresh in all three payloads
  (`ApplyShield`, `ApplyResist`, `ApplySlow`); it needs to **say so**, and the
  three appliers need to stop answering `hitAny || len(targets) > 0`.
- **§5.1** — `ApplyDot` reports new-vs-refresh the same way; `applyDotEffect`
  lands only when at least one target was newly ignited.
- **§3.8** — `effectCostHP` returns before evaluating `payer.MaxHealth()` when
  the authored fraction is zero, so the permanently-free `Damage` aura stops
  paying for a `math.Pow` per effect per tick. Two-line reorder, zero behaviour
  change, invisible to the alloc guards by construction.
- **D8's comment in `skill_cost.go`** is rewritten to state the one rule. It
  currently describes a rule the code does not implement.

⚑ **The measurement problem is the same one the rewrite hit** (`§7` of
`plan-numbers-rewrite.md`): TTK/TTD is the idle-player scenario and cannot see a
cost. Measure in **`-chain`, A/B against a pre-R2 worktree**, and add the
regression the finding actually describes: **stand a Warbanner caster next to an
ally with no enemy present — net HP must not fall.** That test fails today.

**Verified by:** per-applier "a refresh charges nothing" tests, the idle-drain
regression above, the §3.1 drain guard re-run, full suite + `vet` + `gofmt`,
`-chain` A/B recorded in the ledger.

**⚑ Readiness note (checked against HEAD 2026-08-01, after R1 shipped).** Three
facts to start from, so none of them is discovered mid-edit:

1. **Only TWO appliers actually answer `hitAny || len(targets) > 0`** —
   `applyResistAura` (`skills.go:1068`) and `applyShieldAura` (`:1109`).
   `applySlowAura` already returns `slowedAny`, i.e. it already pays for work
   done; `applyHealAura` always did. So §5.2's engine change is **narrower than
   the finding reads**: two aura appliers plus `applyDotEffect` for §5.1.
2. ⚠ **The instant twins must NOT be swept up with them.** `applyInstantShield`
   and `applyInstantHot` count the self-apply as a hit **on purpose** — their
   own comments say so (*"a Barrier cast with nobody around is not a whiff"*),
   and D9 is explicit that a **cooldown pays on cast, hit or whiff**. §5.2 is a
   ruling about **auras**. Changing the instant path would be a second,
   unruled design change wearing this chunk's commit message.
3. **The buff store already branches on new-vs-refresh internally** —
   `ApplyShield`/`ApplyResist`/`ApplySlow`/`ApplyDot` each walk their stream,
   refresh in place and `return`, or fall through to `b.apply` for a new entry.
   It genuinely only needs to *report* which happened; no lookup has to be
   added.

### R3 — One beat, one price (content) ✅ **BUILT 2026-08-01** (ledger §8)

The catalog re-authoring, last, once the rules underneath it are final.

- **F5 / §5.5** — the five multi-effect auras unify at their damage beat
  (40, 40, 40, 40, 20); every slower effect's magnitude **and** cost divided by
  the ratio. Plus the `lifetime > interval` property pinned at the loader so a
  permanent debuff cannot be authored into a blinking one.
- **§5.1's re-price** — Immolate and Wildfire pay the full burn on ignition.
- **F8 / §5.6** — Reaper drops a rider (recommendation: lifesteal), re-measured.
- **F1 / §5.8** — First Aid's cost → 0, and it **joins `freeFloorSkills`** in
  `cmd/aurad/free_floor_test.go`, or the free-floor property is enforced for
  five skills and merely hoped for on the sixth (§4.3).
- **§3.7** — authored effect order is load-bearing near the floor. F5 shrinks
  the surface; R3 **documents** it in `manual-content-authoring.md` rather than
  engineering it away.

⚑ **The trap is §3.10**: throughput-neutral re-pricing is 3× at a level-1 pool.
Every subdivided cost gets checked at **CL 1 as well as at cap** — R1 is what
makes that a reading rather than a calculation.

**Verified by:** the drain guard, `-chain` A/B for survival and kph, boot against
the pinned content counts, and a PO feel pass — this chunk is numbers, and
numbers are [PLACEHOLDER] until played.

### R4 — Downtime agency **+ a free, baseline Recall** (design session, no code)

> ✅ **RAN 2026-08-03 → `docs/plan-downtime.md`.** All five §2.3 open
> questions ruled. The headline rulings: a new **baseline-utility** class
> (Recall + a placeable **mini-campfire**, always-present HUD buttons outside
> the cooldown slots and the spellbook); Recall free with **no cooldown at
> all** — the 10 s interruptible cast is the only brake, and the slottable
> skill is retired; charges are **purely per-session** (§32 answered: store
> nothing); the teachers lose their teach rows to the empty-destination prune.
> ⚑ The constraint-table consequence below that Recall "joins the
> `freeFloorSkills` guard" is **superseded** — a retired skill joins nothing.

§2.3, **widened 2026-08-02** — see §2.3's *"Recall belongs to this design"*
sub-section for the full ruling, the four constraints and the five open
questions. In one line: **the way back to safety and the way back to fighting
shape are one loop and get designed as one**, both available to a level-1
character on their first minute.

- The PO's sketch for recovery is campfire-granted food charges; **simply
  raising out-of-combat regen stays rejected** — though the loop itself may
  now scale with level (*"in charges or otherwise"*).
- Recall loses its 5 % cost and stops being taught; what "baseline" means, and
  what the Town Crier and the Wanderer teach instead, are R4's to rule.
- Couples to `backlog.md` §32 (does a charge survive death) and §36. ⚑ §32 is
  no longer a *"wants schema room in step 8a"* note — 8a is code-complete, so a
  charge count is a **migration**, and R4 should answer §32 rather than defer
  it.
- Design after R3 has been felt, and against a **free First Aid** (§5.8).

### Not in this plan

| item | goes to |
| --- | --- |
| **F4** — quest progress must only count after acceptance | the quest plan; it reverses `archive/plan-quests.md`'s retroactive-credit ruling and has nothing to do with costs |
| **F11** — losing conviction in the combo upgrade system | `backlog.md` §37, coupled to aura augmentation |
| **§3.5** — cost is per application, never per target | watch item. No skill scales `maxTargets` with level today, so nothing drifts; the first one that does invalidates its own price silently |
| **§3.6** — `costPayer` is welded to a concrete type | watch item, and it belongs to `backlog.md` §31's capability direction, not here |
| **§3.9** — the seven-type list in the test | accepted; it fails loud |

---

## 7. PO checklist replies (2026-08-01)

Condensed; the checklist itself is `plan-numbers-feel-pass.md` §2, which stays
the record of what was asked and why.

**1. The premise.** Works — see §1. Drain reads as a decision. Visually it
reads *"as being hurt more than paying"* (presentation, R1). The low-HP switch
moment lands *"yes and no"*: fine when kiting is possible, forced retreat
otherwise, which the PO judged *"a very gothic and also wow moment"* but wants
more testing on. Downtime is the weak spot — §2.3.

**2. The free floor.** ✅ All four legs pass. Damage feels adequate early and
*"wasn't too weak"* late — D16b's stated risk (that it reads as "bad") did
**not** materialise. The free five never charged. The floor did rescue: *"I
never died through using an ability or aura."*

**3. Point economy.** *"Meeeh, it's alright"* — accepted but not loved; couples
to the parked aura-augmentation idea. The `+` button greys correctly. Caps of 5
read *"early if anything but not overly so."*
⚑ *"The point cost should be absolute"* was originally read as a skill-point ask
and filed as F6's sibling. **Clarified 2026-08-01: it meant the resource cost**
— the `+` button already shows the real point figure, and the only spellbook
complaint was F3's scrollbar. There is no point-economy work in §6.

**4. Retuned skills.** Immolate/Wildfire → F9. **Reaper still far too strong**
→ F8. LongRangeStrike reads fine and worth its reach price. Recover *"feels
okay"*, may want number tweaks. Suppression/Paladin → F11. Wild's empty drop
slots read as intended, not as a bug.

**5. Damage types.** They work and read as *"some form of resistance, though not
necessarily tied to damage type."* Needs frontend signalling for the
non-obvious cases; obvious ones (less fire damage on a fire elemental) read
instantly. Environmental/world consistency is judged sufficient for the rest.

**6. Tooltips.** Cost line is readable but not *understandable* → F6 + F7.
Multi-cadence display is the big miss → F5. Recover's HoT number renders
correctly; its "Also heals you" line is wrong → F10. Harvest's tooltip opens
clean. Unaffordable cooldowns are rejected with feedback — D9 works.

**7. Discipline.** Arrives at the right level, worth the slot, cannot cheapen
the free floor (confirmed). Its reduction is invisible in the UI → F2.

---

## 8. Chunk ledgers

### R1 — What a cost SAYS ✅ **DONE 2026-08-01, committed `b2116ba3`**

Presentation + one wire field. **No authored number moved**, and none of the
five items changes what the server charges — only what the player is told.

**What shipped**

| item | what landed |
|---|---|
| **F6** | Every cost line renders **absolute Focus**: `roundHP(fraction × maxHealth × costFactor)`, per beat for an aura, summed once per cast for a cooldown. `minChargeFraction` and its effective-percentage arithmetic are **deleted** — the number shown is the number charged, so the 1-HP floor and the reduction passive are both implicit (§4.2, landmine ③). |
| **F2** | New `GameState.cost_factor:float = 1.0`, appended at the table end and written from `Derived.CostFactor()`; mirrored client-side on the `skill_points` path (`GameStateMessage` → `SnapshotFactory` → `Backend` → `setLocalPlayerCostFactor`). |
| **F7** | **Focus**, everywhere "HP" appeared (PO pick 2026-08-01, the widest of the three options offered): bar text `Focus 87/120`, `Shield: 20 Focus`, `of max Focus`, `below 25% Focus`, `at low Focus`, `Max Focus`, and the rejection `Not enough Focus`. The cost line is tinted **crimson** — the health-bar fill colour — so it points at the bar it drains. ⚑ Presentation only: no Go identifier, wire field or content key renamed (§5.7). |
| **F10** | One `selfTargetLine()` helper: *"Also heals you"* only when `targetsAllies`, else *"Heals you"*. Applied to the shield and resist twins as well — no live content trips those today, which is exactly why they were worth closing. |
| **F3** | `#spellbookList > li` gets `padding-right: 0.8rem`, following `HUD.less:609`'s precedent. Measured **12.8 px** clearance in-game against a flush 0 before. |

**§3.11's pin, both directions.** `api/shared-constants.json` gains an
`hpRounding` case table — the one statement of *round half up, floored at 1* —
asserted by `vitals.HP` in Go (`cmd/aurad/shared_constants_test.go`) and by the
new exported `roundHP` in the client (`SharedConstants.test.ts`). **Both halves
were proven red** against a real drift (Go: `[1.5, 3]` in the fixture; client:
truncation instead of half-up). `hpFmt` now calls `roundHP` rather than
restating it, so the tooltip's HP formatting and its cost arithmetic round
through one function.

**Findings**

- ⚑ **The floor is now visible instead of explained, and it makes the level-1
  endpoint look inert.** Immolate at CL30 reads `7 → 9 Focus`; with Discipline
  equipped it reads `7 → 8` — the level-2 price drops while level 1 stays 7,
  because `6.96 × 0.94 = 6.54` still rounds up to 7. That is correct and is the
  accepted consequence of §5.3; it also means **a cost-reduction check that
  reads only the first number scores a working passive as broken**, which is
  exactly what the first harness run did.
- ⚑ **The tooltip had two "HP" vocabularies and only one was the pool.** The
  sweep found `Shield: 20 HP`, `Revives at 30% HP`, `below 25% HP`, `at low HP`
  and `Max health` alongside the cost lines. The PO took the widest option, so
  there is no "HP" left in the UI at all.
- A pool of 0 (no snapshot yet) falls the cost line back to the authored
  percentage **and changes its shape** (`0.26% of max Focus`), so a
  pre-snapshot number can never be misread as points.

**Verified**

- Go: full suite (28 pkgs) + `vet` + `gofmt` clean · guardrails + alloc
  `-count=2` · new `TestGameStateCostFactor_RoundTrip`, including the half that
  matters — **an absent field must read as neutral 1, not 0**.
- Frontend: `tsc` clean · **100 vitest** (was 89; the four §3.3 floor legs were
  **rewritten**, not added to) · prod build.
- Boot `-content ../api`, 0 errors 0 warnings 0 panics —
  **86 skills/15 factions/64 mobs/10 recipes/3 milestone unlocks/4 quests/5 prop
  definitions/777 props/485 spawns/5 campfires**.
- Harness gate, one at a time on freshly restarted servers: **new
  `r1-focus-cost.mjs` 5/5** (`1 Focus` at CL1 → `7 → 9` at CL30 → `7 → 8` with
  Discipline equipped · `Focus 100/100` · 12.8 px row clearance) ·
  `round4-tooltip` green · **`hygiene-wire-prune` clean** (640 sprites, 0 console
  errors, 0 WebGL losses) — the required check for any `.fbs` field add.
- ⚑ The first `r1-focus-cost` run reported two failures that were **the script's,
  not the product's**: the spellbook row's name span is `.skillName` (not
  `.slotLabel`, which is the *slot* markup), and a passive slot renders its name
  as bare `textContent`. Both fixed in the script before the recorded run.

**Docs touched:** `gdd.md` §3 is now *"The Resource — **Focus**"* and its open
question *"Name of the resource (Essence / Focus / Power?)"* is closed;
`plan-numbers-rewrite.md` §7's cost-tooltip entry is marked **reversed** (both
halves of it — the justifying claim was false *and* the ruling is superseded);
the CLAUDE.md sweep bullet carries the same reversal. The manuals needed
nothing — their only "resource" hits are the legacy `Resources.ts` render class.

---

### R2 — What "landed" MEANS ✅ **DONE 2026-08-01, committed `47074d63`**

Engine only. **Not one authored number moved**, and no wire field, content key
or presentation string changed — what moved is *when* the server charges.

**The one rule**

`Buffs.Apply{Resist,Slow,Dot,Hot,Shield}` now **return** the new-vs-refresh
answer they had always computed internally, through the thin `*Mob` / `*player`
wrappers into the five `sys` interfaces. The readiness note's third fact held
exactly: no lookup had to be added anywhere, only a `return`.

| applier | answered | now answers |
|---|---|---|
| `applyResistAura` | `hitAny \|\| len(targets) > 0` | a target got a genuinely new buff |
| `applyShieldAura` | `hitAny \|\| len(targets) > 0` | pool newly granted **or** a drained one restored |
| `applyHotAura` | `len(targets) > 0` | a target was newly buffed |
| `applyDotEffect` | `len(targets) > 0` | a target was newly **ignited** (§5.1) |
| `applySlowAura` | `slowedAny` | a target was newly slowed |

`applyDamageAura` and `applyHealAura` were already right and are untouched.
**Shield keeps a sustain cost** because its pool *is* a work signal — it charges
exactly while it is being consumed, and nothing while nothing is hitting the
people under it. `noteHarmDealt` deliberately stayed on *"reached anyone"*: a
refresh is still an act of hostility, just not a billable one.

⚠ **The instant twins were NOT swept up** (readiness note 2, honoured):
`applyInstantShield` / `applyInstantHot` / `instant_dot` discard the new bool.
D9 — a cooldown pays on cast, hit or whiff — and §5.2 is a ruling about auras.
Both carry a comment saying so, and `TestCooldownCost_InstantShieldPaysOnEvery
CastIncludingARefresh` pins it: three Barrier casts onto a full pool, three
charges. That test is green on **both** sides of the change, which is the point.

**§3.8** — `effectCostHP` early-returns on a zero fraction before evaluating
`payer.MaxHealth()`, so the permanently-free `Damage` aura stops doing a
`math.Pow` per effect per tick to multiply it by zero. `CostFractionAt` already
floors at 0, so `<= 0` and `== 0` are the same test. D8's comment in
`skill_cost.go` is rewritten to state the one rule — it had been describing a
rule the code did not implement.

**PO decisions (2026-08-01, both taken as recommended)**

- **Scope: all five buff appliers**, not the readiness note's narrower
  resist + shield + dot. §5.2 says *"one rule across all seven appliers"* and
  names slow; leaving two appliers on the old rule would have been an exception
  nobody could explain later.
- **Maintained buffs charge once per target-entry, and that is accepted.**
  Their lifetime is `interval + 1` (or longer), so they never expire while the
  target stays in range — holding FireWard is free after the first tick. The
  counterweight is already in the design: exactly one aura is active at a time,
  so the real price of holding a support aura is the damage aura you are not
  holding. ⚑ **R3 prices the entry**, the way §5.1 prices a dot to its whole burn.

**Findings**

- ⚑ **Two corrections to this doc, from the content survey.** §4.1's *"both of
  those slow effects are currently unpriced"* is true of Warbanner's and
  Suppression's **embedded** slows — but the standalone `Slow` skill **is**
  costed (`slow_aura`, 0.006 @ tick 30). And **`applyHotAura` is missing from
  §3.2's table entirely** while answering `len(targets) > 0`, the same proximity
  tax — with **Rejuvenation costed** (0.0051 @ tick 60) and its 360-tick HoT
  re-applied every 60, so it never expired in range. Both were live money, which
  is what made the scope question worth asking rather than assuming.
- ⚑ **The appliers reach targets through RUNTIME `UserData.(slowable)` asserts,
  so widening an interface breaks test doubles SILENTLY.** Eight recorders in
  `skills_behavior_test.go` stopped satisfying their interfaces the moment the
  methods gained a return value — no compile error, just appliers finding zero
  targets, which reads exactly like a regression in the feature under test. They
  are now **backed by a real `skills.Buffs`** rather than stubbed with a
  constant, so their new-vs-refresh answers are the shipped ones; an
  always-`true` stub would have let a refresh-charges-nothing regression through.

**Verified**

- **Every new leg proven RED** against a `git worktree` at `ceb09300` carrying
  only the new test file — including §3.8's guard, whose payer panics if
  anything prices a free effect's pool.
- **The regression §3.2 names, on real content:** real Warbanner (four effects,
  four cadences), caster beside a healthy ally, no enemy, 10 s —
  **100 → 89 before R2, ≥ 99 after**. `TestAuraCost_WarbannerNextToAnAllyWith
  NoEnemyDoesNotDrain`.
- New Go legs: 5 store-level (`buffs_test.go`) + 8 system-level
  (`sys/skill_cost_landed_test.go`) — per-applier refresh (5 sub-legs),
  leave-and-return pays again, self-target-alone charges once, shield recharges
  after absorbing, dot ignites once across 10 re-applications, the cooldown
  invariant, the free-floor pricing guard.
- Full Go suite (28 pkgs) + `vet` + `gofmt` clean · guardrails + alloc `-count=2`
  · the §3.1 drain guard, `TestNoCostOnAnEffectThatCanNeverBeCharged` and the
  free-floor guard all green.
- Boot `-content ../api`, 0 errors 0 warnings 0 panics —
  **86 skills/15 factions/64 mobs/10 recipes/3 milestone unlocks/4 quests/5 prop
  definitions/777 props/485 spawns/5 campfires**.
- Harness gate, one at a time on freshly restarted servers: **`r1-focus-cost`
  5/5** (owns `skill_cost.go`) · **`backlog33-prehot` 4/4** (owns
  `applyHotAura`) · **`chunk2-calm` 7/7** (owns the buff store) ·
  **`swift-cooldown` 7/7** (owns the movement axis / `ApplySlow`) — 0 console
  errors, 0 WebGL losses. ⚑ The first `r1-focus-cost` run lost a WebGL context
  mid-run (backlog §29) — an **invalid run, not a failure**; every functional
  leg had printed its correct value. It passed clean on the re-run.

**⚑ The sim battery is byte-identical, and that means LESS than it looks.**
Default · `-chain` · `-levels` · `-content ../api` roster · and a
`-player-aura Warbanner:10 -chain` all diff clean against a pre-R2 worktree
(TTK 6.67 s / TTD 8.70 s stand). But `-player-aura` is **damage-effect-only by
construction** (C5), so the harness **cannot exercise a single applier R2
changed**. Byte-identity here is evidence of *no collateral*, not a measurement
of the fix — the Go regressions are the only eyes on it, exactly as §6 predicted.

**Hands to R3:** every maintained buff now charges once per target-entry, so its
authored cost is an **entry price**, not a sustain rate — re-author accordingly,
and remember §3.10 (a subdivided cost is 3× at a level-1 pool, not neutral).

---

### R3 — One beat, one price ✅ **DONE 2026-08-01, committed `f4ab5bc9`**

The catalog re-authoring, last, against rules that were finally final. Mostly
content — plus one thing the PO added on the way past that turned out to be an
engine chunk of its own.

**4 PO rulings (2026-08-01)**

| question | ruling |
|---|---|
| the dot re-price (§5.1) | **×3 for both**, not ×dotTicks. Wildfire's own 4 ticks would drain **7.9 %/s** of a level-1 pool against the drain guard's 6 % bound, and raising a survivability bound to admit a number is the wrong way round |
| the drain guard | **drop the haste weighting for work-gated types** — rigorous, not a weakening; see below |
| the entry prices (§5.2) | **Rejuvenation ×6** (its own `hotTicks` — the dot rule exactly), **FireWard ×3 / Slow ×3** (no natural burn to price against, so the dot's heuristic stands in as an activation charge) |
| Reaper's rider (§5.6) | **drop `lifestealFraction`** — *and author a cooldown that grants lifesteal for six seconds instead* |

**F5 / §5.5 — one beat.** `applyAuraEffects` fires each effect on
`accumulator % interval`, so equal intervals put every effect of an aura on the
same tick. Magnitude **and** cost divided by the ratio; verified exactly
throughput-neutral at a CL30 pool (Warbanner heal `9.75 HP/s → 9.75`,
`21.34 Focus/s → 21.33`; Vanguard shield `2.67 HP/s` both sides, the figure the
C8 walkthrough cut it to).

| aura | effect | interval | magnitude | cost |
|---|---|---|---|---|
| Paladin | heal | 120 → **40** | 8 → 2.6667 | 0.006 → 0.002 |
| Vanguard | heal | 120 → **40** | 12 → 4 | 0.0098 → 0.003267 |
| Vanguard | shield | 90 → **40** | 4 → 1.7778 | 0.0033 → 0.001467 |
| Warbanner | heal | 120 → **40** | 13 → 4.3333 | 0.0106 → 0.003533 |
| Warbanner | shield | 30 → **40** | 6 → 8 | 0.0049 → 0.006533 |
| Warbanner / Suppression | slow | absent (= 1) → **40** | — (a state, not a per-application magnitude) | unpriced, unchanged |
| Wildfire | resist | 1 → **20** | — (a state) | unpriced, unchanged |

Wildfire's `light_aura` is untouched: the loader **rejects** `tickInterval` on
light (`TestMap_LightAuraRejectsNonGeometryKeys`), and light is not a cadence.

**The re-prices.** Immolate 0.0026 → **0.0078**, Wildfire dot 0.0046 →
**0.0138** (pay to ignite, not to keep burning). Rejuvenation 0.0051 →
**0.0306**, FireWard 0.006 → **0.018**, Slow 0.006 → **0.018** (entry prices).
First Aid → **0**, and it joins `freeFloorSkills` — §4.3's point exactly: a free
floor enforced for five skills and hoped for on the sixth is not a property.

**The `lifetime > interval` pin, and where it actually lives.** §4.1 asked for
it at the loader. Tracing it found the property is only **authorable** on one
pair: `resist` / `slow` / `shield` derive their lifetime as
`effectiveTickInterval + 1` at the apply site, so the refresh structurally
outruns the expiry however the cadence is authored — but `dot_aura` and
`hot_aura` author theirs as `dotTicks × dotTickInterval`, independently of
`tickInterval`. So `skills.checkOverTimeLifetime` guards **that** pair, at
`maxLevel` (`tickIntervalPerLevel` scales the cadence while the lifetime is
flat, so the realistic mistake is a per-level tweak correct at the level it was
eyeballed). The instant twins are exempt: a cooldown has no re-apply cadence.

The other half of §4.1 — *"a permanent debuff must stay permanent"* — became two
content guards in `cmd/aurad/maintained_buff_content_test.go`. One is a
**tombstone**: the lifetime is derived at factor 1.0 while the firing cadence
takes the caster's live `TickRateFactor`, so a tick-**slow** (> 1) would fire
*later* than the buff lives and the debuff would blink. No content authors one,
so it passes at factor 1 — which is the point; the first one authored trips it
at the moment the number is written. The other pins the PO's condition as a
bound rather than a value: a slow may re-apply at most every 40 ticks, so a mob
entering the ring is unslowed ≤ 1.33 s and one leaving stays slowed ≤ 41 ticks.
Both proven red against a real drift (65 failures at factor 2), green after.

**⚑ The drain guard now measures two cadences, not one.** The guard modelled
every effect as charged once per application and duty-weighted 30 % of the time
at Haste's 0.5 factor. R2 made five of the seven charge only for NEW work, and
the number of ignitions over a window is bounded by **target entries**, which
haste does not change — a hasted dot re-applies twice as often, but the extra
applications land on targets already burning and cost nothing. So `damage_aura`
and `heal_aura` keep the full model and the other five are measured at their
authored cadence. This is a narrowing of a claim that had become false, not a
loosening to fit a number: it is what makes ×3 Wildfire legal (5.94 %) while
×4 still fails (7.92 %) — checked.

**⚑ §3.10, measured rather than argued.** Every subdivided cost was read at CL 1
as well as at cap. At a level-1 pool the 1-HP floor swallows the arithmetic
whole: Paladin's heal goes from 1 HP per 120 ticks to 1 HP per 40 — a **3×**
real price rise off a cost that was divided by three. Accepted under §5.3 (the
price list is coarse below ~CL 12 by construction), and visible in the batteries
from the other direction: `Immolate:1` and `Wildfire:1 -chain` come out
**byte-identical** across the whole re-price, because 0.26 % and 0.78 % of 100
both floor to the same 1 HP.

**§3.7 documented, not engineered away** (`manual-content-authoring.md`, in the
ability section): effects charge sequentially within a tick, each pricing
against the health the previous one left, and an unaffordable one is skipped —
so on a nearly-dead caster **the effect authored first is the one that still
fires**. Reordering an `effects[]` array is a silent balance change. F5 shrinks
the surface (one beat means they all price against the same health in the same
tick) and the free floor means the base damage aura is never the one skipped,
but neither removes it.

**Reaper, and the cooldown that replaced its rider.** `lifestealFraction: 0.3`
is gone; execute + berserker stay. §4.4's loop is what made the two earlier
linear nerfs bounce — berserker scales damage with health **missing** while
lifesteal returns a share **of that damage**, so the lower the caster went the
faster it healed. ⚑ Reaper was the skill-vocab chunk-1 smoke content for *"one
aura exercising execute + berserker + lifesteal together"*; that combination
survives only in `TestApplyDamageAura_CompositionOrderF6`, whose effect already
authors all three — its comment now says so, so nobody simplifies it down to the
terms its arithmetic strictly needs.

The PO's replacement is **Bloodthirst** (id 8, cooldown, maxLevel 5, cost 0.02,
900 ticks): 30 % → 50 % of the damage you deal comes back, for a fixed 6 s, on
whatever aura you have on. That needed a **new effect type end to end** —
`lifesteal_burst`, modelled on `speed_burst`: `LifestealParams`, a
`lifestealPayload` in the buff store, `Buffs.LifestealFraction()`, an applier +
dispatch case, a `casterLifesteal(acting)` term folded into **both** damage
payload sites (player and mob), the catalog JSON, and the tooltip case. The
leech **adds** to an effect's own authored `lifestealFraction` rather than
replacing it (the `casterCritChance` rule — otherwise a leech aura would be
strictly worse to pair with the cooldown built for leeching), and it composes
**additively across skills, strongest within one** (shares of one damage event
add; strongest-within is what stops a level-up mid-buff double-counting).

⚑ **No pip, and it is the first buff for which that is a real cost.**
`applied_effects` is a full ubyte — bit 7 went to speed — so `lifestealPayload`
takes `AppliedEffectNone`. Shield does too, but shield has a wire justification
(`shield_hp` renders the absorb segment). This is the first buff with a real
duration and *no* overhead indicator; the tells are the floating heal numbers
and the cooldown timer. Pinned by `TestCooldown_LifestealBurstHasNoPipYet` so
**backlog §39 has a concrete first customer** for a widened field.

**⚑ The landmine, and it is the R2 landmine wearing a new hat.** The whole
feature was built, dispatched and tested green while `*player` and `*Mob` had
**neither** `ApplyLifesteal` nor `LifestealFraction`. The self-buff cooldowns
reach the caster through *structural* asserts (`e.(speedApplier)`), which is the
right pattern — but a real type missing a method fails **silently and
completely**: the applier's `ok` is false so nothing is granted, the reader falls
back to its neutral value so no arithmetic looks wrong, and the cooldown still
fires, still charges and still starts its timer, because D9 says a cooldown pays
on cast, hit or whiff. Six behaviour tests were green over an inert feature.
`sys/self_buff_capabilities_test.go` now asserts the real `*player` and
`*mob.Mob` against **every** self-buff capability (tick_rate, speed_burst,
lifesteal_burst, both directions) — proven red by removing one method, with the
six behaviour tests staying green throughout, which is the whole demonstration.

**⚑ The R1/R2 discrepancy R3 surfaced — and then closed** (follow-up commit
`194036c8`). Read off a real
tooltip in the harness, Warbanner said *"Costs you: 1 Focus **every 1.32 s**"*
for its heal and shield and Immolate *"1 Focus **every 0.66 s**"*. R2 had changed
*when* five of the seven chargeable types are charged; R1's cost wording predated
it and kept printing the effect's tick cadence for all seven. The number was
right and the sentence around it was a leftover from the previous pass.

Fixed in the same chunk rather than left for the feel pass, because it would have
arrived there looking like a balance opinion. The cost line now prints the
**charge trigger**, not the cadence:

| type | cost line reads |
|---|---|
| damage_aura, heal_aura | `every 1.32s` — unchanged; they really do pay per application |
| dot_aura | `when it sets something alight` |
| hot_aura, resist_aura | `when it reaches someone new` |
| slow_aura | `when it catches someone new` |
| shield_aura | `when a shield goes up or is refilled` |

⚑ Phrased as **when**, never as per-what: a cost is charged once per
*application* (§3.5), so an aura that ignites two enemies in one tick pays once
and *"per enemy set alight"* would be a different and wrong promise. And the
cadence is **not lost** — it still rides the effect's own line, which reads
*"refreshed every 1.32 s"* for all five; only the cost line stops claiming it.

⚑ **The taxonomy is authored once, because two restatements of it is what caused
the bug.** `api/shared-constants.json` gains `costChargeTrigger`, and both sides
read it: the client picks its wording from it (`COST_TRIGGER_TEXT`, asserted
exhaustively in **both directions** by `SharedConstants.test.ts` — a work-gated
type with no wording, or wording for an application-charged type, both fail) and
the Go drain guard **derives** `workGatedCharge` from it rather than keeping the
copy R3 originally gave it. That needed one small export,
`skills.ParseEffectType` (the `mobs.ParseRole` shape), so a caller outside the
loader can reach the enum from the authored vocabulary without a second table.
A new content guard then keeps the fixture honest against the seven types
`applyAuraEffect` actually dispatches, in both directions. ⚑ **The fixture is
not the authority either** — what each applier *returns* in `sys/skills.go` is,
and no file can derive that; this only stops the two restatements drifting from
each other, which is the failure that actually happened. Both guards proven red
against real drifts (flip `shield_aura` to `application` → 2 vitest failures;
drop `hot_aura` → the Go coverage guard names the missing type).

**Verified**

- Full Go suite (28 pkgs) + `vet` + `gofmt` clean; `tsc` + **103 vitest** +
  prod build; guardrails + alloc `-count=2`.
- The loader pin and both maintained-buff guards **proven RED** against real
  drifts before going green; the capability guard proven red the same way.
- Content guards green: the drain guard, the free floor (now six skills), the
  seven-type guard, the damage-types guard. The R2 idle-drain regression was
  **rewritten, not re-tuned** — it asserted a surviving health of ≥ 99, which
  pinned the shield's *price*, so F5 broke it legitimately. It now asserts the
  property (health after 10 s == health after 20 s: the grant is work and is
  paid for once, time is not), which no re-pricing can move.
- Boot `-content ../api`: 0 errors 0 warnings 0 panics — **87 skills** (+1,
  Bloodthirst; pin updated) **/15 factions/64 mobs/10 recipes/3 milestone
  unlocks/4 quests/5 prop definitions/777 props/485 spawns/5 campfires**.
- Harness gate, one at a time on freshly restarted servers: **`r1-focus-cost`
  5/5** (Immolate is its subject skill and now reads **21 → 26 Focus** at CL30
  where R1 recorded 7 → 9 — the ×3 is legible, and Discipline still moves it) ·
  **`round4-tooltip`** all legs (owns the `/skills` payload shape, which gained
  `lifesteal`) · **`backlog33-prehot` 4/4** (owns Rejuvenation content) ·
  **`swift-cooldown`** all legs (owns the movement axis; the buff store gained a
  payload kind) · **`chunk2-calm` 7/7** (owns the buff store). 0 console errors,
  0 WebGL losses.
- The wording fix re-read **off a real tooltip**: Warbanner now prints
  `every 1.32s` for damage and heal and `when a shield goes up or is refilled`
  for the shield, Immolate `when it sets something alight`, Rejuvenation
  `when it reaches someone new`. ⚑ The two harnesses that read cost lines were
  re-run **after** the wording moved — `r1-focus-cost` 5/5 and `round4-tooltip`
  all legs — because both match the cost line by regex and a wording change is
  exactly what silently stops a regex matching. (The first `r1-focus-cost`
  attempt lost a WebGL context: an **invalid run, not a failure** (§29) — every
  functional leg had printed its correct value. Clean on the re-run.)
- **New harness `r3-lifesteal-burst.mjs`, 7/7 on three consecutive fresh
  servers.** It exists for the two seams neither Go nor vitest can see: that
  `GET /skills` really serves the new `lifesteal` payload (a missing json tag
  renders `(lifesteal_burst)` and nothing else fails), and that the buff reaches
  the damage path on a real player in a real fight — control window flat at
  40/100 across 95 combat numbers, burst window **40 → 43** and **42 → 51** on
  the two runs. ⚑ Two harness-authoring lessons went into it: its first
  precondition walked a scene-graph layer whose name it guessed wrong, and
  reported a textbook run (control 0, burst +20) as INCONCLUSIVE — the tableau
  failing while the evidence sat right there (rule 4, in the mirror). And it
  equips **Long-Range Strike**, not the seeded Damage aura, because Damage's
  radius is 1.0 while mobs at the venue settle 2.5–3 units out: a run with
  Damage measures a player reaching nothing, with floating numbers everywhere
  from *other* mobs fighting, which reads exactly like a broken buff. ⚑ A third:
  **a level-up refills the pool**, so a ding inside the measurement window
  arrives as a +70 health delta that has nothing to do with the leech (it
  happened in two runs of three). Capping the level first removes the cause and
  replaces it with a worse one — at CL30 the player one-shots everything and
  nothing survives into the burst window — so the leg guards on `maxHealth`
  holding and **re-measures**, a ding being a one-off transition rather than a
  re-roll of the same dice.

**⚑ The sim battery is byte-identical, and again that means less than it looks.**
Default · `-chain` · `-levels` · the `-content ../api` roster all diff clean
against a pre-R3 worktree (**TTK 6.67 s / TTD 8.70 s stand**). Per-aura
`-player-aura … -chain`: Warbanner / Vanguard / Paladin / Reaper **identical**,
because `-player-aura` is damage-effect-only (C5) and their `effect[0]` is the
damage aura R3 did not touch — so the heal / shield / slow re-authoring has
**only the Go regressions watching it**. The two that did move are the two whose
`effect[0]` is a re-priced dot: **Wildfire:5** kph 53.87 → 51.53 facetank,
196.36 → 168.49 kite; **Immolate:10** 53.87 → 52.27 and 196.36 → 177.05.
Survival stays **100 %** in every row.

**Open after R3:** the numbers are [PLACEHOLDER] until played, so this ends in a
**PO feel pass** — with the cost lines now saying what the server actually does,
which was the one thing that would have polluted it — then **R4** (the downtime design session — designed against a
world where First Aid is now free). Bloodthirst has **no unlock source** and is
dev-obtainable via `SKILL Bloodthirst`, like FireWard; placement is a
content-pass call, and the obvious home is the wolf line Reaper already drops
from.
