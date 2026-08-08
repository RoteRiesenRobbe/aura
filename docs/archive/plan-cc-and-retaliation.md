# Plan: CC and retaliation — immunity, a retaliate passive, and the first hard stun

> **Status: DESIGNED 2026-08-07, no chunk built.**
> Three related pieces from one PO ask (2026-08-07): *"a passive that slows
> every mob that hits the player by 30 percent for 5 seconds"*, and *"can we
> make elites and bosses immune to such cc easily, including cc like hard
> stuns?"*
>
> The answer to both was yes, and the design session turned it into three
> chunks: ⭐ **an authored `factors.ccImmune` gate over the three CC doors that
> already exist** (slow / calm / charm) · **a `retaliate_slow` passive** — the
> first passive in the game with a *runtime trigger* rather than an equip-time
> scalar fold · and **the first hard stun**, which does not exist today in any
> form and is the only piece that needs a genuinely new mechanism.
>
> ⚑ **Schema impact: DB NONE · conf.json NONE · content JSON one new
> *required-for-elites* field on 9 mob defs + two new skill files** (the
> passive, and the stun's own skill in C3). **FlatBuffers NONE *on the
> recommended branch of open question 1*** — the stun's debuff pip has no free
> bit in the `applied_effects` ubyte, and the alternative branch is a wire
> widening. That question is open; the banner is only true if it resolves the
> recommended way.
>
> ⚑ **Vocabulary, used precisely throughout:** **CC** is the whole family —
> slow, calm, charm, and the stun this plan adds. A **slow** scales movement.
> A **stun** halts movement *and* suppresses casting; a 100 % slow is **not** a
> stun (see §4, fact 6). **Immunity** here means CC immunity only — it is
> unrelated to `SetInvulnerable` (damage immunity, encounter-controller 9b) and
> unrelated to a `resistances` entry of 0.

## 1. What this is

Three things the game cannot express today:

1. **Nothing is CC-immune.** A slow, calm or charm lands on a boss exactly as
   it lands on a boar. `tier` exists (normal / elite / boss) but
   `items/mobs/definitions.go:13-15` is explicit that it is a classification
   label and *"the tier does not multiply anything"*.
2. **No passive reacts to an event.** Every passive is folded into
   `DerivedStats` at equip time; `definition.go:1051` states the shape
   outright — *"Equip-time folds into DerivedStats — no geometry, cadence, or
   targeting."* The two effect types `recomputeDerived` handles
   (`component.go:517`) are `stat_multiplier` and `resist_passive`, both pure
   scalars.
3. **There is no stun.** A grep for `stun` across `backend/pkg` and `api/`
   returns only false positives (`TestUnknown…`, `CostUnlearnSkill`).

The good news, and the reason this is a small plan rather than a large one, is
that every *seam* the three pieces need already exists and is load-bearing for
something else. §4 records them.

## 2. Decision ledger — PO rulings 2026-08-07

Taken as choice prompts in this design session.

- **D1 — CC immunity is a per-mob authored flag, with no tier default.**
  A new `factors.ccImmune` on the mob definition; every immune mob names it
  explicitly. **Declined: the pure tier rule** (elite/boss immune, derived from
  `TierRank()` — zero authoring, but it would make `tier` mechanical for the
  first time and offers no per-mob escape hatch) and **the hybrid** (authored
  flag defaulting from tier). The ruling keeps `tier` cosmetic, which is what
  `definitions.go:13-15` promises, and it matches the charm/calm precedent from
  `plan-faction-flips` **D8**, where *"which mobs are eligible"* was solved with
  authored data rather than a derived rule.
  ⚑ **Consequence, stated and mitigated:** the recorded risk of this option is
  that a *future* elite silently ships CC-able. C1 closes it with a **boot
  error** rather than a code default — see §3.1 and §9/A1.
- **D2 — build the real hard stun in this plan, not just the seam.**
  The immunity gate alone would cover today's CC (slow, calm, charm) and let a
  future stun inherit it. The PO chose to build the stun too: movement halt
  **and** cast suppression, immune-gated from day one, with a skill authored to
  apply it. **Declined: seam-only** (defer the stun until one is designed) and
  **passive-first** (ship the retaliate slow alone, elites slowable in the
  meantime).
  ⚑ The selected option's own preview named the cost the PO accepted: *"NO pip
  bit left in the ubyte → silent debuff or a wire widening (backlog §39)"*.
  **Which of those two is not yet ruled** — it is open question 1.

## 3. The design

### 3.1 CC immunity — one flag, one helper, three asymmetric doors

`Mob` is the only entity that can be CC'd at all (§4, fact 4), and it exposes
exactly three doors today:

| Door | Site | Shape |
| --- | --- | --- |
| `ApplySlow(source, fraction, ticks) bool` | `model/mob/mob.go:1154` | returns whether the slow was *fresh* |
| `ApplyCalm(source, ticks)` | `model/mob/mob.go:1916` | returns nothing, **and calls `resetAggro()`** |
| `Charm(by, source, ticks)` | `model/mob/charm.go:32` | takes a player, flips faction |

One unexported helper — `func (m *Mob) ccImmune() bool` reading the authored
factor — gates all three. ⚑ **The three early returns are not the same shape**,
and that is the whole implementation risk of C1:

- `ApplySlow` returns `false` — "nothing was freshly slowed".
- `ApplyCalm` returns before `m.buffs.ApplyCalm` **and before `resetAggro()`**.
  This is the load-bearing one: an immune elite must keep its aggro when
  someone calms it. Returning after the buff write, or forgetting that
  `resetAggro` is inside this door at all, produces a boss that "resists" the
  calm and drops its target anyway — the exact failure the immunity is for.
- `Charm` returns before the faction flip and before the companion link.

**Why the door and not the eligibility layer.** `applySlowAura`
(`sys/skills.go:2192`) filters through `eligibleByTargetFlags[slowable]`, and
gating there would be equally easy. The door is better because of a consequence
worth keeping: with the gate inside `ApplySlow`, `slowedAny` in `applySlowAura`
still goes true (so `noteHarmDealt` still stamps combat entry — you *did* commit
an act of hostility against the elite), while `freshAny` goes false (so the
caster is **not** charged the R2/R3 entry price for a whiff). Gating at the
eligibility layer would silently kill combat entry too. The door layer also
means any future CC inherits the gate by construction, which is the point of
D2.

**Closing D1's gap — at the loader, not in a test.** `ccImmune` is a
**pointer** (`*bool`) in the raw JSON struct, for the reason
`definitions.go:320-331` already gives for `XPFactor` and `Experience`: absent
and authored-`false` must be distinguishable. The validation then sits with the
other `factors.*` checks (`definitions.go:427-460`), **while the pointer is
still in hand**:

> `mob %q: tier %q must author factors.ccImmune (true or false) — the tier does
> not decide it`

A definition of tier ≥ elite that omits the key is a **boot error**; a
deliberately CC-able elite authors `false` and boots fine, which is exactly the
escape hatch D1 bought. This is the `Experience` tombstone's pattern (*"Any
presence hard-fails with the migration rule attached"*) rather than the
`tier_rank_test.go:37` pattern, and it is strictly better here for one reason:
⚑ **the resolved `Factors.CCImmune` is a plain `bool`, so absence is
unrecoverable downstream** — a test walking *loaded* definitions could no longer
tell "decided CC-able" from "nobody thought about it", which is the whole
distinction the pointer exists to preserve. The check must run where the
pointer lives or it cannot run at all.

A normal-tier mob may author `ccImmune` too; it is simply never required.

### 3.2 `retaliate_slow` — the first passive with a runtime trigger

**Behavior.** While equipped: any mob that damages the player is slowed by the
authored fraction for the authored duration.

**The trigger site already exists and already has the attacker.**
`player.MobTouches` (`model/player/player.go:712`) receives the attacking
`model.MobEntity` and already stores it as a `Combatant` for the companion
"defend" signal. Both mob→player damage paths funnel through it:

- direct damage-aura hits — `sys/skills.go:735`
- **mob DoT ticks** — `sys/skills.go:441`, dispatched with the DoT's caster

So *"every mob that hits the player"* has no hole. This was checked
specifically, because a DoT that credited only a `SkillID` would have left one.

**The effect is modelled on `lifesteal_burst`, not on `slow_aura`.** The
`effectKeys` comment for lifesteal (`definition.go:1105-1108`) describes it as
*"a scalar leech fraction plus a lifetime. It projects nothing and targets
nobody; it changes what the caster's own hits do while it is up."* Swap "own
hits" for "hits taken" and that is this effect. It matters concretely:
`slow_aura` derives its buff lifetime from `tickInterval + 1`, and a passive
has no cadence — so `retaliate_slow` authors its duration outright.

**Authored fields:** `slowFraction` / `slowFractionPerLevel` (reusing the
`slow_aura` names and `FractionAt` scaling) and `slowDurationTicks` /
`slowDurationTicksPerLevel`. No geometry, no cadence, no target flags — a
passive has no circle.

**Where it lands.** Two new `DerivedStats` fields (`component.go:165`) filled by
a third case in `recomputeDerived` (`component.go:517`), read at the
`MobTouches` site. `DerivedStats` is already read from inside the model layer
(`player.takeDamage` reads `p.skills.Derived` twice), so this introduces no new
layering.

⚑ **It reuses `slowPayload`, so it needs no wire change and lights the existing
`AppliedEffectSlow` pip for free.** A new payload kind would need a new
`AppliedEffect` bit and there are none left (§4, fact 5).

**Two behavior calls, both decided here rather than left to the build:**

- **A fully mitigated hit still retaliates.** `MobTouches` already stamps the
  attacker *"resisted or not"* for the companion signal, and the same reading
  is used here: the mob attacked you, whether or not it got through.
- **A GOD player does not retaliate.** `IsGod()` short-circuits *inside*
  `takeDamage`, so without an explicit check a cheat-mode player would walk
  through the world slowing everything that touched them — a playtest artifact,
  not a feature. The retaliate call sits behind the same god check.

⚑ And one tolerance: a DoT tick can arrive from a mob that has since died or
left the viewport (a departed caster's ref stays valid by design — see
`DotBuff`'s comment at `buffs.go:150-154`). `ApplySlow` on such a mob must be a
harmless no-op, not a panic.

### 3.3 The stun — movement halt plus cast suppression

Three pieces, only one of which is new.

**(a) Movement — cheap, but not free, and it is the *same* decision as the
pip.** `Buffs.MovementFactor()` (`buffs.go:576`) is the single place the
movement axis composes and it already floors at 0; both movement sites read it
(the player's input step and the mob's `stepLength`, `mob.go:1220`). But the
factor is `SpeedFactor() × (1 − SlowFraction())`, and **a new stun payload
participates in neither term** — it would need a third clause in the one
function the file's own comment calls out as load-bearing (*"the ONE place the
two halves of the movement axis meet"*).

⚑ So there are not two independent questions here. There is one fork:

- **Stun rides `slowPayload` at fraction 1.0** (plus its own cast-suppression
  marker) — `MovementFactor` untouched, `AppliedEffectSlow` pip for free, wire
  untouched. Only cast suppression is new code.
- **Stun is its own payload** — owes a `MovementFactor` clause **and** the pip
  question, whose answer is either "reuse the slow bit anyway" or a wire
  widening.

This is open question 1, and it is a single ruling, not two.

**(b) Cast suppression — the new mechanism.**
`SkillSystem.processEntity` (`sys/skills.go:171`) is the *shared* cast path for
players and mobs: cooldowns fire at line 179, the active aura below it. The
stun gate is one early return inside it. Its position is a set of decisions, not
a detail:

- **After `tickBuffEvents` (line 176).** Dots and hots already applied to a
  stunned entity must keep ticking — otherwise a stun *protects* its target,
  which inverts the mechanic. Non-negotiable.
- **Before `processCooldowns` (line 179).** Cooldowns must not fire. ⚑ But
  their *timers* also stop advancing on this path, which means a stunned entity
  emerges with its cooldowns exactly where they were. That is the intended
  reading (a stun costs you time), stated so nobody "fixes" it later.
- **Before `notePresence` (line 196).** ⚑ Decided: a stunned entity is not
  offered as an aura participant while stunned. This is mobs-only content
  today, and mobs are not XP participants, so the visible consequence is nil —
  but the ordering is recorded because it is the one that would matter first if
  a player-facing stun ever ships.
- **Before `TickAccumulator++` (line 217).** The accumulator freezes, so the
  aura resumes *mid-cadence* on exactly the beat it was interrupted on, rather
  than having silently advanced through the stun and firing immediately on
  release. This matches how `SetActiveAura` already treats the accumulator as
  cadence state rather than a clock.

**(c) The pip.** Not a separate piece — it is the tail of the same fork as (a).
See open question 1.

**Threat.** ⚑ A stunned mob **keeps its threat table and its aggro target.**
This is the deliberate opposite of calm, whose door calls `resetAggro()`
(`mob.go:1918`): calm is a *disengage* tool, a stun is a *control* tool, and a
stun that also wiped aggro would be a strictly better calm.

**Scope: mobs only.** The gate lives on the shared `processEntity` path and is
written entity-agnostically (it asks the buff store, not the entity kind), but
nothing can stun a player: players carry no `ApplySlow`-style CC door at all
(the get-CC'd direction stays inert, `plan-skill-vocab` §3.1), there is no PvP,
and no mob skill will author a stun in this plan. The gate being
entity-agnostic is free and avoids an entity-kind branch; it is not a promise
that player stuns work.

**The stun is CC** — it goes through the D1 gate like the other three, via a
fourth door on `Mob`.

### 3.4 Authoring

```jsonc
// api/mobs/elite-wolf.json  (and the other 8 — see the table below)
"factors": {
  "baseMaxHealth": 264,
  ...
  "ccImmune": true
}
```

```jsonc
// api/skills/<name>.json — the retaliate passive
{
  "id": <next free>,
  "name": "…",
  "category": "passive",
  "maxLevel": 5,
  "effects": [
    {
      "type": "retaliate_slow",
      "slowFraction": 0.3,
      "slowFractionPerLevel": 0.0,
      "slowDurationTicks": 150,
      "slowDurationTicksPerLevel": 0
    }
  ]
}
```

**Proposed value per definition** — D1 bought per-mob control, so this is a
content call and the plan should not make it silently. All nine need the key
(the loader demands it at tier ≥ elite); the proposal is `true` for all nine,
with `orc` the one the PO is most likely to reverse:

| Definition | Tier | curveLevel | Proposed | Note |
| --- | --- | --- | --- | --- |
| `elite-wolf` | elite | 5 | `true` | |
| `elite-bandit` | elite | 7 | `true` | |
| `troll` | elite | 11 | `true` | |
| `orc` | elite | 20 | `true` | ⚑ the `thin-the-orc-line` quest target, ×5 — the first place a player meets the rule |
| `greater-fire-elemental` | elite | 20 | `true` | |
| `orc-warlord` | **boss** | 23 | `true` | |
| `mammoth` | elite | 1 | `true` | ⚑ `legacy: true` — proving-grounds content, not live world |
| `angry-mammoth` | elite | 1 | `true` | ⚑ `legacy: true` |
| `proving-boss` | **boss** | 1 | `true` | ⚑ `legacy: true` |

⚑ **Only six of the nine are live content** — the three `curveLevel: 1` entries
are `legacy: true` proving-grounds mobs. They still need the key because the
loader validates by tier, but nothing a player meets depends on their value.

⚑ **All numbers are [PLACEHOLDER].** 30 % and 5 s (= 150 ticks at 30 TPS) are
the PO's phrasing of the *idea*, quoted as a starting point, not adopted as
values. The per-level curve in particular is unset on purpose — see §8.

The stun skill's own authoring (category, duration, who gets it) is **content
design, not mechanism**, and is deliberately left to C3 — see §8.

## 4. Current state — facts this plan stands on (verified 2026-08-07)

1. **`tier` is a label.** `items/mobs/definitions.go:13-15`. `TierRank()` is on
   the `model.MobEntity` interface (`model/entity.go:110`), so a tier-derived
   rule *would* be reachable everywhere — D1 declined to build one anyway.
2. **Passives are equip-time scalars only.** `definition.go:1051`;
   `recomputeDerived` (`component.go:517`) handles `stat_multiplier` and
   `resist_passive`, nothing else.
3. **9 of 65 mob definitions are elite or boss:** `angry-mammoth`,
   `proving-boss`, `mammoth`, `elite-bandit`, `greater-fire-elemental`,
   `orc-warlord`, `orc`, `elite-wolf`, `troll`. (⚑ `orc` is authored elite —
   worth an eyebrow when authoring, since it is also the `thin-the-orc-line`
   quest target.)
4. **Three CC doors, mobs only** — table in §3.1. Nothing else calls
   `Mob.ApplySlow`; `applySlowAura` is its only in-tree caller.
5. **`AppliedEffect` bit 7 is the last bit of the ubyte**
   (`skills/applied_effects.go`), and the file already records that the first
   buff to want a pip with no bit left (`lifestealPayload`) was given **none**,
   deliberately, because *"widening the wire for one buff is §39's job"*.
6. **A 100 % slow is not a stun.** `MovementFactor` floors at 0 so movement
   stops, but aura cadence runs off `TickRateFactor` on an independent path —
   a fully-slowed mob keeps attacking. This is the fact that makes §3.3(b)
   necessary rather than optional.
7. **Slows never stack — strongest wins** across every stream and skill
   (`buffs.go:529`).
8. **Both mob→player damage paths reach `player.MobTouches`** with the
   attacking entity: `sys/skills.go:735` (direct) and `sys/skills.go:441`
   (DoT).

## 5. Schema impact (stated per the standing rule)

| Layer | Impact |
| --- | --- |
| **Database** | **NONE.** No persisted state is touched. A learned skill is already a spellbook entry; no new column, no migration. |
| **FlatBuffers** | **NONE on the recommended branch of open question 1** (stun reuses `AppliedEffectSlow`). The alternative branch widens the `applied_effects` ubyte on both `Mob` and `Character` — codec + client + hand-sync. |
| **conf.json** | **NONE.** No global knob; everything is authored per skill or per mob. |
| **Content JSON** | One new `factors.ccImmune` key on **9** mob defs — optional in general, **required at tier ≥ elite** (A1); one new skill file for the passive; one more for the stun (C3). |
| **Go production code** | New effect type (×2), two `DerivedStats` fields, one `Mob` helper + 4 gated doors, one buff payload, one early return in `processEntity`. |
| **Frontend** | `SkillTooltip.ts` — `EFFECT_COLOR_KEYS` entry + a line-builder case per new effect type, plus its vitest. Nothing else. |

## 6. Interplay

- **`plan-mob-tether.md`** — a tethered mob becomes *"immune and
  un-aggroable"* while walking home. That is a **transient state**, this
  plan's `ccImmune` is a **definition-level property**; they are different
  mechanisms with confusingly similar names. Whichever ships second should
  check that a tethered mob is CC-immune during its evade (it should be — a
  slow that landed mid-evade would stretch the protected return), and say so.
- **`plan-camps.md` / `plan-faction-flips`** — charm's D8 faction allowlist is
  a *skill-side* filter; `ccImmune` is a *mob-side* one. Both run: a mob must
  be in the allowlist **and** not CC-immune. No conflict, but two places now
  answer "can I charm this".
- **`backlog.md` §39** (entity-presentation rework) — open question 1 is a
  direct §39 dependency and should be recorded there if it resolves toward the
  wire widening.
- **`backlog.md` §37** (skill-level/augment rework) — the retaliate passive's
  per-level curve is deliberately flat pending that ruling (§8).
- **`content-passives.md` / `content-cooldowns.md`** — catalog entries for the
  passive and the stun. Owned by C2 and C3 respectively (§7), not deferred:
  ideas go directly into the matching catalog with a status.

## 7. Chunk breakdown

- **C1 — the immunity gate.** `factors.ccImmune` (`*bool` raw → `bool`
  resolved), loader + the tier ≥ elite validation (A1), the 9 mob files per the
  §3.4 table, `Mob.ccImmune()`, three gated doors. Self-contained, verifiable,
  revertible. Nothing depends on C2 or C3.
- **C2 — the `retaliate_slow` passive.** New effect type (enum,
  `effectTypeMap`, `effectKeys`, params struct, build-switch case), two
  `DerivedStats` fields + `recomputeDerived` case, the `MobTouches` call,
  tooltip + vitest, one skill JSON, **and its `content-passives.md` entry** —
  the repo's rule is that content goes straight into the catalog, so it is a
  deliverable, not a follow-up.
- **C3 — the hard stun.** The open-question-1 ruling implemented (payload shape
  + `MovementFactor` + pip), the `processEntity` early return, the fourth `Mob`
  door behind `ccImmune()`, one authored skill, **and its
  `content-cooldowns.md` entry**. ⚑ **C3 carries unresolved design** — open
  question 1 (mechanism) and questions 2–4 (content) — and should not start
  until those are answered.

Order is C1 → C2 → C3. C1 and C2 are each a session; C3 is larger.

## 8. Open questions

1. ⭐ **How the stun's movement half is represented — the one that changes the
   schema banner.** One ruling covering both the `MovementFactor` clause and
   the debuff pip (§3.3a); `AppliedEffect` has no free bit (§4, fact 5).
   **(a) Ride `slowPayload` at fraction 1.0**, with cast suppression carried
   separately: `MovementFactor` untouched, the existing slow pip lights,
   FlatBuffers stays NONE. A stun genuinely *is* movement impairment, and §39
   can split slow from stun when it replaces presence-only pips with durations
   anyway. **(b) A dedicated stun payload**: a third clause in
   `MovementFactor`, plus either the same pip reuse or a wire widening (ubyte →
   ushort on `Mob` *and* `Character`, dragging in codec, client and hand-sync
   for one buff). **Recommendation: (a)**, on the precedent the codebase already
   set when `lifestealPayload` was given no pip rather than widening the field.
   Needs a PO ruling because the PO accepted the cost without choosing the
   side, and because (b) can change §5.
   ⚑ The honest cost of (a): a stun and a slow become indistinguishable on the
   wire and in `SlowFraction()`, so a stun would suppress a weaker slow's pip
   and the two share the strongest-wins rule. Acceptable — both stop you moving
   — but it is a real conflation, not a free win.
2. **Who gets the stun, and on what category?** Presumably a cooldown (calm and
   charm are both cooldowns, and a stun on an always-on aura would be
   oppressive), but nothing is decided: which skill, what duration, what
   unlock source. Content design, blocks C3.
3. **Is the stun player-cast only, or can a mob stun a player?** §3.3 scopes it
   mobs-only for v1 and the mechanism does not care — but "a mob stuns you" is
   a legitimate elite/boss tool and would need the player CC direction built
   (§3.1 of `plan-skill-vocab` deliberately left it inert). Not blocking C1/C2.
4. **Does the stun break on damage?** WoW-style diminishing returns and
   break-on-damage are both unbuilt and unasked-for. YAGNI says no; recorded
   because "the stun did nothing, I hit it immediately" is a plausible first
   playtest note.
5. **The retaliate passive's per-level curve.** Flat at every level is the
   simplest thing that works and is what §3.4 sketches. A rising fraction
   collides with the "strongest slow wins" rule in an ugly way (see §10/L3).
   A rising *duration* is the better axis if one is wanted. Coupled to
   `backlog.md` §37.
6. **Does immunity need to read as anything in-game?** It will be silent — the
   pip simply will not light. The codebase has accepted silent immunity
   feedback once already (`mob.go:1741-1748`, *"no damage number reads as
   'immune' feedback"*). Flagged, not solved.

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **A1 — a tier ≥ elite definition that omits `ccImmune` is a boot error**
  (§3.1). D1's chosen option carries a recorded risk; this converts it into a
  loud failure at load without making `tier` mechanical. Validated at the
  loader, not in a test, because that is the only layer where the raw pointer
  still exists.
- **A2 — `ccImmune` is a `*bool` in the raw JSON struct** (§3.1), on the
  `XPFactor`/`Experience` precedent, so absent ≠ authored-false. A1 depends on
  this; the resolved `Factors.CCImmune` is a plain `bool`.
- **A3 — the gate lives at the `Mob` doors, not the eligibility layer** (§3.1),
  preserving combat entry while refunding the whiff.
- **A4 — a fully mitigated hit still retaliates; a GOD player does not** (§3.2).
- **A5 — a stunned mob keeps its threat table and aggro target** (§3.3).
- **A6 — a stun freezes cooldown timers and the aura tick accumulator** (§3.3).
- **A7 — all nine elite/boss definitions author `true`** (§3.4 table). Per-mob
  vetoes welcome, `orc` most likely.

## 10. Landmines

- **L1 — `ApplyCalm` calls `resetAggro()` inside the door.** Gating after the
  buff write, or forgetting the side effect exists, ships a boss that keeps the
  calm's *disengage* while resisting its buff — the failure the feature is meant
  to prevent. The three doors are asymmetric in return type and side effects;
  they will not accept a copy-pasted early return.
- **L2 — the `processEntity` gate must sit after `tickBuffEvents`.** Placed
  above it, a stun *protects* its target by freezing incoming dots.
- **L3 — slows do not stack; the strongest wins** (`buffs.go:529`). A flat 30 %
  retaliate is a **floor** that silently dominates the Slow aura at L1–L2
  (authored 0.1 → 0.5 across its five levels). Nothing is broken, but a player
  running both will see the aura appear to do nothing at low rank, and that will
  be reported as a bug.
- **L4 — mob DoT ticks retaliate too** (`sys/skills.go:441`), which is correct
  and also means the passive can slow a mob that has already died or left
  viewport. Must be a no-op, not a panic.
- **L5 — 9 files, but only 6 are live, and `orc` is one of them.** Three of the
  nine are `legacy: true` proving-grounds mobs (§3.4 table). `orc.json` is
  authored `elite`, so the `thin-the-orc-line` quest's five elite Orcs become
  CC-immune under A7. Correct per D1, but it is the first place a player meets
  the rule and worth knowing before the PO reports it.
- **L6 — a new effect type is Go work, not JSON.**
  `manual-content-authoring.md:300-302`: payload struct + `effectKeys` allowlist
  + validator. Each type has its own field allowlist enforced at load, so a key
  that is not in `effectKeys` is a boot error — which is the good failure, but
  it does mean the allowlist entry cannot be forgotten.
- **L7 — `costFractionOfMax` is valid on every effect type** and is checked
  *outside* `effectKeys` (`manual-content-authoring.md:456`). Neither new effect
  should carry a cost: a passive has no trigger to charge, and charging the
  *victim* of a hit for retaliating is not a mechanic anyone asked for.

## 11. Chunk ledgers

*(Empty — nothing built. Each chunk appends its ledger here when it lands:
what was decided, what changed, the commit hash, the verification output.)*
