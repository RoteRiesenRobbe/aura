# Resource costs — feedback intake (Pass 1, C1 + C2)

The numbers rewrite is built but uncommitted (`plan-numbers-rewrite.md` §7).
This doc is the intake for what came back from it: the **PO feel pass**
(2026-08-01, the first real play of the priced catalog) and a **technical
review** of the cost system run against HEAD the same day.

Two separate lenses on one change. Neither is scheduled yet — this is the
findings record, and the chunking decision comes after the PO reads it.

⚑ Nothing here is committed. Two technical findings were fixed in the review
session itself (§3.1, §3.3); everything else is recorded, not acted on.

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

### 3.2 ⚠ OPEN — "landed" is three different rules, and D8 describes one

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

⇒ The `targetsSelf` half is **latent, not live** — no costed skill authors it
today. It is one JSON key away and nothing would fail.

**Not fixed deliberately:** changing three appliers' pay condition is a design
call, and *"should a ward cost you for standing near a friend"* is a PO
question. But the current answer reads like a bug a playtester would report, and
D8's own wording says it is not what was intended.

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

### 3.4 ⚠ OPEN — the 1-HP floor quantizes the entire price list

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

### 3.7 ⚠ OPEN (minor) — authored effect order is now load-bearing

Effects charge sequentially within one tick, each pricing against the health the
previous one left. For a multi-effect aura near the floor, **JSON ordering
decides which effect gets clamped and which is skipped entirely**. Nothing
documents that authored order carries meaning.

⇒ F5 (tick together) makes this sharper, not softer — see §4.1.

### 3.8 ⚠ OPEN (minor) — the free floor pays for its own pricing

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

### 4.2 F6 (absolute HP) supersedes §3.3 and absorbs F2

Showing absolute HP computed from current max HP is **strictly better** than the
effective-percentage fix, because the floor and the cost-reduction passive both
become implicit: the number shown is the number charged.

⇒ It needs `CostFactor` on the wire or mirrored client-side (F2), and it needs
the `maxHealth` plumbing §3.3 already added.
⇒ It reverses the 2026-07-29 "percentage alone" ruling — that ruling should be
marked superseded rather than silently contradicted.
⇒ Same treatment is wanted for the **spellbook point cost** (checklist §3).

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

---

## 5. Open questions for the PO

### 5.1 F9 — how should a dot aura pay?

PO asked for options. Four, with the trade named:

1. **Pay per re-application (today).** Simple, but charges 3× per damage tick on
   Immolate and reads as paying for nothing.
2. **Pay only when the dot is genuinely new** (not a refresh). Fixes the feel,
   but then holding the aura on a single target is free after the first tick —
   which the PO already flagged as *"also not ideal."*
3. **Pay on the dot's own cadence, not the aura's** — charge when the dot
   *ticks*, so cost tracks damage dealt exactly. Needs the cost to move to the
   dot payload; the dot currently fires from a buff store, not from the applier.
4. **Align the re-application interval to the dot interval** (20 → 60), so
   options 1 and 3 converge. Pure content change, no engine work. ⚑ Interacts
   with F5.

Recommendation: **4 first** (free, and it is the same cadence-hygiene move F5
asks for), then re-judge whether 3 is still wanted.

### 5.2 §3.2 — should shield/resist pay for presence?

Options: pay only when the buff *changed* something (matches heal, three
appliers change); keep proximity payment but gate it on the ally being in
combat (matches the 2026-07-29 shield ruling); or accept it and re-price the
affected auras so idle drain cannot exceed regen.

### 5.3 §3.4 — is 1-HP quantization acceptable?

Accepting it means the careful relative pricing only exists past roughly
character level 12. Rejecting it means either losing sub-1-HP costs entirely or
carrying fractional debt.

### 5.4 §2.3 — the downtime agency loop

Campfire-granted charges is the PO's own sketch. Needs a design session; couples
to `backlog.md` §32 and §36.

---

## 6. Suggested chunking (not scheduled)

Grouped by what shares a surface, cheapest and most-blocking first.

- **R1 — presentation.** F6 absolute HP + F2 cost reduction on the wire + F7
  resource name/colour + F3 scrollbar + F10 "Also heals you". One frontend pass,
  one small wire addition, no balance movement.
- **R2 — cadence hygiene.** F5 tick-together across the five multi-effect auras,
  §5.1 option 4 for the dots, and the cost re-authoring that §4.1 forces. Guard
  in §3.1 covers it.
- **R3 — the free heal baseline.** F1 First Aid, plus §4.3's guard extension and
  whatever the heal line needs re-balancing around it.
- **R4 — the pay-condition question.** §3.2 / §5.2, and F8 Reaper with it.
- **Unscheduled watch items:** §3.4, §3.5, §3.6, §3.7, §3.8.
- **Separate plans:** F4 → the quest plan. §2.3 downtime → its own design
  session. F11 → `backlog.md` §37.

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
to the parked aura-augmentation idea. The `+` button greys correctly, but the
point cost should be **absolute** (F6's sibling). Caps of 5 read *"early if
anything but not overly so."*

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
