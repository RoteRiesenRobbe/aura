# Plan: CC and retaliation — immunity, a retaliate passive, and the first hard stun

> **Status: COMPLETE — C1 + C2 + C3 all built (§11), 2026-08-07/08.**
> The immunity gate is live (C1): `factors.ccImmune` on all nine elite/boss
> definitions, required at tier ≥ elite by a boot error, gating every CC door.
> **FrostShield** is live (C2, D3–D5): a Troll drop that slows anything damaging
> you by 10 % → 30 % for 5 s — the first passive with a runtime trigger.
> **Paralyze** is live (C3, D6–D11): the game's first hard stun, a GiantSpider
> drop that holds the nearest mob for 3 s — movement AND casting.
>
> ⚑ What is left is watch items, not chunks: open question 3 (can a mob stun a
> player — scoped out for v1, would need the player CC direction built), open
> question 6 (immunity is silent in-game), and every number, all [PLACEHOLDER].
>
> *(Designed 2026-08-07.)*
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
> ⚑ **Schema impact, FINAL now that every chunk has landed: DB NONE ·
> FlatBuffers NONE · conf.json NONE.** Content JSON: one new
> *required-for-elites* `factors.ccImmune` field on 9 mob defs, plus two new
> skill files (`frost-shield.json`, `paralyze.json`) and two mob unlock rows.
> The wire question that made the old banner conditional was settled by **D6**:
> the stun reuses `AppliedEffectSlow` rather than widening the `applied_effects`
> ubyte, so nothing on the wire moved in any chunk.
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

### C2's rulings (PO 2026-08-08, taken as choice prompts)

- **D3 — the passive is named `FrostShield`.** Declined: `Mire` (recommended),
  `Tanglefoot`, `Backlash`, `Snare`. ⚑ `Bramble` was ruled out before the prompt
  — it is already a mob. The name is frost-flavoured while the effect carries no
  damage type at all; that is flavour, not a `damageTags` entry, and nothing in
  the effect reads it.
- **D4 — it is a Troll kill-drop at chance 0.2.** Declined: a milestone (would
  make it baseline kit rather than a find), an NPC teaching, and "nothing yet"
  (cheat-only). The dominant pattern for passives, and the Troll had room —
  one unlock, `Tough` at 0.4. ⚑ Content resonance worth keeping: since C1 the
  Troll is CC-immune, so the one thing you cannot slow is what teaches you to
  slow everything else.
- **D5 — the curve rises on the FRACTION: 10 % at L1 → 30 % at L5, duration
  flat at 5 s.** ⚑ **Taken against §8/Q5's recorded lean**, which said a rising
  *duration* is the better axis because a rising fraction widens the window
  where the passive outclasses the Slow aura (L3). Measured after the ruling and
  it mostly dissolves the objection: Slow is authored `0.1 → 0.5` over the same
  five ranks, so FrostShield sits **at or under Slow's fraction rank for rank**
  (0.10 = 0.10 · 0.15 < 0.20 · 0.30 < 0.50). L3's warning survives only for a
  *mismatched* pair — a rank-5 FrostShield beside a rank-1 Slow — which is a
  build interaction rather than a rank-1 surprise. **Q5 is resolved by this.**

### C3's rulings (PO 2026-08-08, taken as choice prompts)

- **D6 — the stun is ONE `stunPayload`, and it reuses the slow pip.**
  `Buffs.Stunned()` answers both halves: `MovementFactor` short-circuits to 0
  for movement, `SkillSystem.processEntity` early-returns for casting.
  `appliedBit()` returns `AppliedEffectSlow`. **FlatBuffers NONE — now
  unconditionally.**
  ⚑ **This OVERTURNS §8/Q1's own recommendation of (a)** (ride `slowPayload` at
  fraction 1.0 with cast suppression carried separately), and the reason is a
  mispricing found while reading the code for the ruling: **every option needs a
  new payload**, because `buffPayload.appliedBit()` is compile-enforced and cast
  suppression has to live somewhere with a duration. So (a) does not avoid the
  payload — it adds a *second* one, and `Buffs.apply` appends **a separate entry
  with its own tick counter**, giving one stun two independently-aged timers
  whose halves can expire apart. The `MovementFactor` "cost" that made (a) look
  cheaper is literally `if b.Stunned() { return 0 }`, and `Stunned()` is needed
  by the cast half regardless. (a) is strictly more code and more state.
  ⚑ The lifesteal precedent was cited in §8 as an argument for (a); what it
  actually says is *"do not widen the wire for one buff"* — which (b1) satisfies
  equally. **Declined: (b2)**, a dedicated pip bit, which would have widened the
  `applied_effects` ubyte on `Mob` *and* `Character` and flipped the schema
  banner. Its recorded cost stands: a stunned mob and a slowed one are
  indistinguishable to the client until backlog §39.
- **D7 — a new cooldown skill carries it.** Declined: a rider on Shockwave
  (would re-price a shipped ability, and its 8 s cooldown is far too short for a
  hard stun) and an elite-only mob tool (would need the player CC direction
  built, which §3.1 of `plan-skill-vocab` deliberately left inert).
- **D8 — damage does NOT break the stun.** ⚑ The reason is specific to this
  game rather than genre habit: in an aura game the caster's own damage is
  always on, so break-on-damage would end the stun on the tick it landed. It is
  the deliberate opposite of **Calm**, which any damage breaks — and it holds
  *structurally* today, because `DropCalm` is typed to `*calmPayload` and cannot
  see a stun. Pinned anyway, so a future "drop all CC" generalisation cannot
  make every stun useless in silence.
- **D9 — the skill is named `Paralyze`.** *"for now, we can add other spells
  later"* — so the effect type is deliberately generic (`stun`) and the skill is
  one authored instance of it.
- **D10 — GiantSpider drops it at 0.2.** ⚑ **Taken on an assumption worth
  flagging:** the ruling said *"the elite spiders"*, and **no elite-tier spider
  exists** — all three (GiantSpider cL9, Spider cL4, VenomSpider cL4) are tier
  `normal`. GiantSpider is the only reading that fits (the big one, and the only
  one with an empty unlock list). If a genuinely elite spider was meant, that is
  a new mob, not a re-hang.
- **D11 — single target, 3 s hold, 30 s cooldown, radius 2.5.** `maxTargets: 1`
  + `nearest`, the CharmBeast delivery, because the GDD forbids target-clicking.
  Declined: a small AoE (an uncapped hard stun neutralises a pack off one
  button) and a 5 s / 60 s version (5 s is a long time in ~7 s fights).

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

1. ✅ **RESOLVED by D6 (PO 2026-08-08) — one `stunPayload` reusing the slow
   pip; FlatBuffers NONE, unconditionally.** ⚑ Resolved *against* this
   question's own recommendation of (a), because pricing it against the code
   showed (a) was never the cheap branch: every option needs a payload
   (`appliedBit()` is compile-enforced and cast suppression needs a duration),
   so (a) adds a *second* entry with its own tick counter rather than avoiding
   one. Full reasoning in D6. The recorded conflation cost stands and is now
   real: a stun and a slow are indistinguishable on the wire until §39.
2. ✅ **RESOLVED by D7/D9/D10/D11 — `Paralyze`, a new cooldown skill:
   single target (nearest, `maxTargets: 1`), 3 s hold → 3.8 s at rank 5, 30 s
   cooldown, radius 2.5, GiantSpider drop at 0.2.** ⚑ D10 carries an assumption:
   the ruling said "the elite spiders" and no elite-tier spider exists — see D10.
3. ⚑ **STILL OPEN, deliberately — the plan's only surviving design question.
   Is the stun player-cast only, or can a mob stun a player?** §3.3 scopes it
   mobs-only for v1 and the mechanism does not care — but "a mob stuns you" is
   a legitimate elite/boss tool and would need the player CC direction built
   (§3.1 of `plan-skill-vocab` deliberately left it inert). Not blocking C1/C2.
4. ✅ **RESOLVED by D8 — no, it runs its full duration.** The reason is
   specific to this game: the caster's own damage aura is always on, so
   break-on-damage would end the stun on the tick it landed. It holds
   structurally (`DropCalm` is payload-typed) and is pinned so a future
   "drop all CC" cannot undo it silently.
5. ✅ **RESOLVED by D5 (PO 2026-08-08) — a rising fraction, 10 % → 30 %, flat
   5 s duration.** Taken against this question's own recommendation (a rising
   duration); the measurement that makes it safe is in D5 — the chosen curve
   sits at or under the Slow aura's fraction rank for rank, so L3's collision
   only bites a mismatched pair. Still coupled to `backlog.md` §37, and every
   number stays [PLACEHOLDER].
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

### C1 — the immunity gate ✅ 2026-08-07

**Built TDD red-first, one session, no design drift.** Every C1 decision was
already ruled (D1 + A1/A2/A3); nothing needed a new prompt.

**What changed**

| Layer | Change |
| --- | --- |
| `items/mobs/definitions.go` | raw `CCImmune *bool` (A2) · resolved `Factors.CCImmune bool` · the A1 boot error at tier ≥ elite, placed **after** tier resolution so it can read the rank · one assembly line |
| `model/mob/mob.go` | `ccImmune()` helper reading `m.definition.Factors` · `ApplySlow` returns `false` · `ApplyCalm` returns **before both** the buff write and `resetAggro()` |
| `model/mob/charm.go` | `Charm` returns before the link, the timer and `Align()` |
| `api/mobs/*.json` | `"ccImmune": true` on all **9** elite/boss definitions (A7, unchanged — no per-mob veto taken) |

**Verification**

- New pins red → green: `items/mobs/ccimmune_test.go` (5) — required at elite
  *and* boss · `false` authorable · `true` resolves · normal tier optional both
  ways · the content census; `model/mob/ccimmune_test.go` (3) — one per door,
  each with a working control; `sys` +1 for A3.
- `go build ./...` clean · `items/mobs` + `model/mob` + `sys` green · full Go
  suite **0 FAIL except `sys.TestDwell_TakeoffDropsAnInProgressCount`**,
  re-proven pre-existing by a stash-rerun at HEAD.
- Boot `-content ../api`: **65 mob definitions, 13 quests, 0 WARN/ERROR.**
- **Harness gate.** The two scripts that own CC are `chunk2-calm.mjs` and
  `chunk3-charm.mjs`, and **neither is implicated**: their venues are
  normal-tier (the wolf/stag pack at −40,10 and the lone Bear at 59,11 —
  nearest elite 40.1 u and 5.2 u away respectively, both outside every CC
  radius), so nothing they assert changed. `chunk2-calm` was run anyway:
  **7/7 PASS**. `chunk3-charm` is the documented D9-fragile one (red 6–8/9
  across four runs, HEAD baseline hung) and was left alone rather than adding
  another inconclusive data point. ⚑ The first `chunk2-calm` attempt died in
  `joinAsNewCharacter` after 120 s on a freshly started server; a probe showed
  `#characterCreation` visible and the re-run passed clean — a join-race in the
  harness environment, not a product failure. Restart, re-run.

**Schema impact: DB NONE · FlatBuffers NONE · conf.json NONE · frontend NONE.**
Content JSON: the 9 files above. One revertible commit.

**Three things worth carrying**

- ⚑ **A1 proved itself on real content before the JSON existed.** With the
  validation in and the 9 files not yet authored, *five* content-walking tests
  in `items/mobs` went red naming `angry-mammoth.json` — which is the boot
  error doing exactly its job, on the exact class of mistake D1's recorded risk
  described. It also reached two places the plan did not survey: the
  **synthetic elite/boss fixtures in `catalog_test.go`**, which now author the
  key like real content. Any future test fixture at tier ≥ elite owes it too.
- ⚑ **The §4 survey of "9 of 65 are elite or boss" is right, and a naive grep
  is not.** `alpha-wolf.json` reads elite in a `catalog_test.go` fixture while
  the shipped definition is tier `normal` — grepping `"elite"` across
  `api/mobs/` also hits `_comment` prose. Enumerate by parsed `tier`, which is
  what `TestCCImmune_ContentCensus` now does permanently. ⚑ That pin reads the
  **embedded** `pkg/api/mobs`, like every content pin in the package — so an
  `api/mobs/` edit without `cp-defs` leaves it stale-green. Pre-existing
  pattern, worth knowing before trusting it as a guard on the repo files.
- ⚑ **The census pin cannot demand `true`.** D1 makes `false` legal at every
  tier, so the loader enforces *presence* and the pin records the *census* —
  the `role_content_test.go` idiom. Adding an elite is fine; adding it **and**
  the census line is the whole ceremony.

**Note for whoever runs the sys suite next** (not this chunk's, not fixed
here). `TestDwell_TakeoffDropsAnInProgressCount` is a **high-rate flake, not a
deterministic failure**: counted here, **8/12 isolated runs red at HEAD and
7/12 with C1 in the tree**, flipping inside a single run mode. Round 10's
"now DETERMINISTIC, no longer the documented flake" came from three
consecutive reds — ⚑ **an intermediate rate is indistinguishable from
determinism at n=3**, and the conclusion drawn from it ("a test that failed
sometimes and now fails always has *changed state*") pointed the next
investigation at the wrong thing. The mechanism remains **unknown**; nothing
here diagnoses it. CLAUDE.md's Open items is corrected.

### C2 — the `retaliate_slow` passive ✅ 2026-08-08

**Built TDD red-first, same session as C1** (the PO asked to continue; the plan
had them as separate sessions, and they are still separate commits' worth of
work). Three PO rulings taken as choice prompts — **D3/D4/D5**, §2.

**What changed**

| Layer | Change |
| --- | --- |
| `skills/definition.go` | `EffectTypeRetaliateSlow` + `effectTypeMap` · two new raw keys (`slowDurationTicks`, `slowDurationTicksPerLevel`; the fraction keys are slow_aura's, reused) · `effectKeys` allowlist entry · `RetaliateParams` with `FractionAt`/`TicksAt` · `retaliateParams()` + the build-switch case |
| `skills/aura_category.go` | classified `AuraCategoryNone` — a passive draws no ring, and the tell is on the ATTACKER |
| `skills/component.go` | `DerivedStats.RetaliateSlow` (a struct, not two scalars — see below) + the third `recomputeDerived` case |
| `model/player/player.go` | `retaliate()` + the `MobTouches` call and a local `slowable` assertion |
| `frontend` | `RetaliateParams` + `SkillEffect.retaliate` in `Skills.ts` · `EFFECT_COLOR_KEYS` entry + a line-builder case in `SkillTooltip.ts` |
| content | `api/skills/frost-shield.json` (id **139**) · `troll.json` unlock at 0.2 · `content-passives.md` entry · `content-skill-inventory.md` row |

**Verification**

- New pins red → green: `skills/retaliate_test.go` (6 — parse, allowlist
  refusals, no cost, the fold, strongest-wins, unequip clears) ·
  `model/player/retaliate_test.go` (5 — trigger, no-passive, mitigated hit,
  GOD, non-slowable) · 3 vitest cases.
- `go build ./...` clean · full Go suite **0 FAIL** except the known
  `sys.TestDwell_TakeoffDropsAnInProgressCount` flake · `tsc --noEmit` clean ·
  **vitest 238/238**.
- Boot `-content ../api`: **88 skills**, 65 mobs, 13 quests, 0 WARN/ERROR.
- **`round4-tooltip.mjs` all PASS** (and it reports the live `/skills` catalog
  at `skillCount: 88`).
- ⭐ **New `c2-frost-shield.mjs`: 7/7 PASS, 0 FAIL, 0 INCONCLUSIVE** — learn →
  read → equip → **a wolf closed to 1.03 u, hit the player, and carried the slow
  pip**, with A4's GOD half scored in the same run (pip false under GOD, gated
  on the engagement actually having happened, or it proves nothing).

**Schema impact: DB NONE** (a learned skill is an existing spellbook row; id 139
is minted forever) **· FlatBuffers NONE** — §3.2's claim proven at the surface:
the pip lit with no wire change because the effect reuses `slowPayload` and
therefore the existing `AppliedEffectSlow` bit **· conf.json NONE**. Content
JSON 2 files; Go + frontend production code yes.

**Four things worth carrying**

- ⛑ **The plan said "two new `DerivedStats` fields"; the correct number is
  one struct of three.** `Buffs.ApplySlow` keys the buff stream by its SOURCE
  skill — a fraction and a duration alone would have made every retaliate ride
  `SkillID(0)`, sharing a stream with anything else that forgets. The survey
  missed it because the *trigger site* is the place that cannot know which
  passive granted the effect. Bundling the three also makes the
  strongest-wins fold **wholesale**, so fraction, duration and source can never
  come from different skills.
- ⛑ **`TestAuraCategory_ClassifiesEveryAuthorableEffectType` caught the new type
  immediately** — the census pin exists precisely so a new effect cannot fall
  through to "no ring" silently, and it did its job on the first run. Answering
  it is a decision, not a formality: `AuraCategorySlow` would have been reading
  the *effect applied* rather than the *geometry drawn*.
- ⛑ **The id scan missed a whole directory and 137 was taken.** `api/skills/`
  has a `mobs/` subdirectory, so a non-recursive glob reported max 136 and
  `GiantVenomSpit` collided at load. This is C1's lesson in a second costume:
  **enumerate content by parsing every file the loader reads, recursively —
  never by a glob you assumed was flat.** Settled at 139.
- ⛑ **The harness caught a stale bundle, and only the harness could.** Leg 2
  came back `"Frost Shield … (retaliate_slow)"` — the raw effect type — while
  vitest was green on the very line that should have rendered. `conf.json`
  serves `frontend/dist`, so **a frontend change is invisible until
  `npm run build`**; the unit test proves the function, the bundle decides what
  a player sees. Rebuild, restart, 7/7.

⛑ **One thing a committer must know, found while reviewing the tree.**
`backend/pkg/api/` is **not uniformly gitignored** — `mobs/` carries a
`.gitignore` for `*.json`, and the other eight directories (skills, quests,
zones, recipes, props, factions, milestones, AuraApi) are **tracked**. So C1's
nine mob edits need no embedded copy committed, while C2's
`api/skills/frost-shield.json` **also owes its `cp-defs` twin**
`backend/pkg/api/skills/frost-shield.json`. Commit the skill edit without it
and the embedded build ships without the skill while `-content ../api` looks
fine — the exact split that makes this invisible in dev.

⚑ **Two smaller notes, neither this chunk's to fix.** `registry_test.go`'s
skill census moved 87 → 88 (expected, it is a pin). And
`content-skill-inventory.md` is visibly stale beyond the row added here — it
still shows `MaxLv 3` for passives that are authored 5 — which its own header
predicts ("regenerate rather than trust it"); a real regeneration is its own
small job.

### C3 — the hard stun ✅ 2026-08-08

**Built TDD red-first, with every `sys` pin mutation-verified.** Six PO rulings
— **D6–D11**, §2. This chunk completes the plan.

**What changed**

| Layer | Change |
| --- | --- |
| `skills/buffs.go` | `stunPayload` (empty, like calm/charm) · `ApplyStun` + `Stunned()` · the `MovementFactor` short-circuit |
| `skills/applied_effects.go` | `stunPayload.appliedBit()` → `AppliedEffectSlow` (D6) |
| `skills/definition.go` | `EffectTypeStun` + `effectTypeMap` · `stunTicks`/`stunTicksPerLevel` · the `effectKeys` allowlist (charm's shape: geometry + cap + target flags, **no slow keys**) · `StunParams` + `TicksAt` · `stunParams()` + the build-switch case |
| `skills/aura_category.go` | `AuraCategoryNone` — cooldown-fired, no ring |
| `model/mob/mob.go` | `ApplyStun` — the **fourth CC door**, behind `ccImmune()` — and `Stunned()` |
| `sys/skills.go` | the `processEntity` gate + `stunSuppressible` · `applyStun` + `stunnable` · the cooldown-dispatch case |
| `frontend` | `StunParams` + `SkillEffect.stun` · tooltip colour key and line builder |
| content | `api/skills/paralyze.json` (id **140**) · GiantSpider unlock 0.2 · `content-cooldowns.md` + `content-skill-inventory.md` rows |

**Verification**

- New pins red → green: `skills/stun_test.go` (8) · `model/mob/stun_door_test.go`
  (5) · `sys/stun_test.go` (4) · 2 vitest cases.
- ⭐ **Every `sys` pin proven by MUTATION, not by writing-order**: disabling the
  gate reddens three of the four, and *moving it above `tickBuffEvents`*
  reddens the fourth. See the L2 finding below — the fourth one did not work
  the first time.
- `go build ./...` clean · full Go suite **0 FAIL** except the known
  `sys.TestDwell` flake · `tsc` clean · vitest green.
- Boot `-content ../api`: **89 skills**, 65 mobs, 13 quests, 0 WARN/ERROR.
- **`c3-paralyze.mjs`** (new, registered in the coverage map): **6/6, 0 FAIL** —
  learn → the tooltip says the target cannot *act* → equip into a cooldown slot →
  the cast fires. ⛔ **Its movement leg was built, measured across five runs, and
  CUT** — see the fourth finding below. What the script owns is the integration
  surface; the mechanism is owned by the mutation-verified Go pins.

**Schema impact: DB NONE · FlatBuffers NONE · conf.json NONE.** Content JSON 2
files; Go + frontend production code yes.

**Four things worth carrying**

- ⛑ **A fixture that cannot answer a suppression gate makes an
  absence-of-suppression pin pass wherever the gate sits.** The L2 pin ("dots
  keep ticking on a stunned target") was green — and stayed green under the
  mutation that moves the gate above `tickBuffEvents`, i.e. the exact bug it
  exists to catch. The reason: `dotVictim` carries no `Stunned()`, so
  `e.(stunSuppressible)` never matched and the mutated gate could not fire on
  it. The pin was asserting nothing. Wrapping the fixture so it can answer made
  it red immediately. **Any pin that asserts something is NOT suppressed must
  first prove its subject is suppressible.**
- ⛑ **The plan's own recommendation was wrong, and reading the code for the
  ruling is what found it** — see D6. "Ride the existing payload" sounded
  cheaper than "add a payload", but cast suppression needs a payload either way,
  so the cheap-looking branch was the one that added a *second* entry with its
  own timer. ⚑ Worth generalising: *"reuse the existing thing"* is not
  automatically the smaller change when the new thing is needed anyway.
- ⛑ **D8 holds structurally, and that is exactly why it needed a pin.**
  `DropCalm` is typed to `*calmPayload`, so the break-on-damage path cannot see
  a stun — no code was needed to make damage not break it. A future
  generalisation to "drop all CC" would silently make every stun useless in a
  game where the caster's own damage is always on, and nothing but the pin would
  say so.
- ⛔ **The in-game movement leg was built, measured, and CUT — and the
  measurements are the finding.** Five runs, each fixing a real defect in the
  *previous* observable, and it still flipped sign on a stun the Go pins prove
  works:
  | attempt | result |
  | --- | --- |
  | "the stunned mob stops moving" | INCONCLUSIVE — still-run **9 of 10 samples BEFORE any cast**: a wolf that reaches melee parks and stops moving by itself |
  | walk away, track "nearest mob" | player walked 1.00 u and the gap **SHRANK** 1.03 → 0.39 — a second wolf arrived; the tracker cannot follow the held one |
  | tag the sprite, 1.4 s cast hold | player walked 1.29 u, gap **1.02 → 1.01** — the hold ate half the 3 s stun, so the walk ran past it |
  | tag the sprite, 0.5 s cast hold | player walked 1.19 u, gap 1.01 → **1.49** (+0.48) |
  | same again | player walked 1.10 u, gap 1.03 → **0.82** (−0.21) |
  The cause has no headroom to fix: the stun is 3 s, the key-hold and round
  trips eat ~1 s of it, a wolf's chase speed is close to the player's, and pack
  members drift through the tracked distance — one precondition trace read
  `[1.01,1.01,1.01,0.73,0.53,0.7,1.01,1.01]` with **nothing cast at all**. The
  signal and the noise are the same size. ⚑ **Deleted rather than softened**,
  on `plan-world-replacement` C2's rule that an assert which cries wolf on
  correct content gets deleted, not fixed; the full measurement table lives in
  the script's header so nobody rediscovers it. ⚑ What would make it
  measurable: a longer authored stun (a test-only skill) or a stationary target
  species, so the chase-speed term drops out. Not worth a content change today.

**Follow-up, same day — the PO's first hand playtest (2026-08-08)**

*"paralyze disables damage but the aura is still visible … indicating getting
hit still."* ✅ **Fixed.** FrostShield was reported working as expected.

⛑ **The suppression was real; three wire projections did not go through it.**
`processEntity` returns before the aura fires, but `AuraRadius()`,
`AuraCategories()` and `AuraTickInterval()` read `ActiveAuraSlot` **directly** —
so a held mob dealt no damage while still drawing its ring at full size. The
client draws rings off the `aura_category` mask (0 = none) and sizes them by
`aura_radius`; both stayed populated. Read in-game that is worse than a cosmetic
slip: **the ring is a promise that the aura is running**, so the mob looked like
it was still hitting you and the *damage* looked broken.

The fix is one `auraSuppressed()` helper on `Mob`, read by all three (and
`AuraTickPhase` for free, since it derives from the interval). ⚑ **The slot is
deliberately NOT cleared** — clearing it means `SetActiveAura`, which zeroes
`TickAccumulator` and would break **A6**'s cadence freeze; it is the same
landmine `plan-mob-tether` D5 records for the evade. Pinned by
`TestStun_HidesTheAuraOnTheWire`, which asserts the slot survives alongside the
three zeroes. **No `.fbs` and no client change** — the client already handles a
0 mask.

⚑ **The general shape, worth carrying:** *suppressing an action does not
suppress the ADVERTISEMENT of that action.* The wire projections are a second
readout of the same state, and a gate placed in the acting path leaves them
untouched — the mob-tether plan will meet this exact seam when its evade
suppresses an aura, and light is the one projection left deliberately alone (a
torch does not go out because you are paralysed).

⚑ **Two notes for the committer.** `backend/pkg/api/skills/paralyze.json` is the
tracked `cp-defs` twin and must ride the commit (see C2's ledger for why the
mob copies do not). And `registry_test.go`'s skill census moved 88 → **89**.

⚑ **Not built, deliberately:** the stun authors **no `targetFactions`
allowlist**, unlike calm and charm. Those need one because "which mobs are
eligible" is a content question for them; here `factors.ccImmune` (C1) is the
mob-side gate, so every elite and boss is immune and everything else is fair
game. If a stun-proof *normal* species is ever wanted, it authors `ccImmune`.
