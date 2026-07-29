# Plan: Playtest Feedback (rolling collection)

**Status:** **Collection doc.** Latest: **round-6 chunk B (mob-vs-mob soft
separation) DONE 2026-07-26, ⏳ PO in-game check pending** — ledger
§Round-6 chunk B ledger. Before it: both designed chunks executed, plus a filler
batch — **all three ✅ PO-VERIFIED IN-GAME 2026-07-26** (one session, every
checklist item passed): **Round 3** (healer combat state + role-as-loadout)
`03b152f4` 2026-07-25 · **Round 4** (tooltip power scale) `eaae2e69` 2026-07-26 ·
**Rolling-filler batch** (4 of the 6 filler items) `dab4dae0` 2026-07-26.
That verification session raised **2 new items (§Intake round 5), and both are
✅ DONE and PO-verified in-game the same day** (`f06b2161`), ledger at
§Round-5 chunk ledger: the missing shield-aura tick indicator, and pacifist mobs fleeing when
attacked with nothing to support (design decided by choice prompts, all four
answers minimal).
This is the **standing home for issues
arising from playtests**: new rounds append to §Intake, items get sorted into
the passes below, and we pick targets from here. Successor to
`archive/plan-playtest1-feedback.md` (first external playtest, fully executed
2026-07-22 + `2bfee286`).

**How to use it:** pick a pass (or a slice of one), open an execution session
for it, record the result in a ledger section at the end. Items move down the
document as they land; nothing is deleted, so the reasoning stays readable.

---

## Intake — round 2 (2026-07-24)

Unstructured feedback collected by the PO from live play, mixing the PO's own
observations with other testers'. Triaged in-session 2026-07-24 against the
actual content JSON and config (numbers below were measured, not estimated).

### Headline themes

1. **Three damage auras are the same skill three times** (Damage / Wild /
   LongRangeStrike) — this repeats the standing "aura differentiation" theme
   from playtest 1, now with a decision attached.
2. **Two auras are strictly dominant** (Reaper, LongRangeStrike) rather than
   side-grades.
3. **Progression doesn't satisfy** — "I want to level my stuff higher."
4. **Nothing costs anything** — no resource economy behind aura uptime.
5. **The world doesn't tell you where to go next** — no thread, no hints.
6. A batch of small bugs and readability misses.

---

## Decisions (PO, 2026-07-24, via choice prompts)

1. **Skill-point economy = escalating cost curve**, *not* a skill tree.
   Higher `maxLevel`s, and higher levels cost more points
   (1/1/1/1/1, then 2, 2, 3, 3, 4…). **Free respec survives untouched** — the
   loadout-swapping identity depends on it. A tree was rejected as a whole
   feature that fights that identity.
2. **Resource costs go on auras *and* cooldowns** — per tick for auras, per
   cast for cooldowns. The single-resource identity ("HP is everything")
   should read everywhere, not just on heal auras. PO accepted the wider
   tuning surface; the named risk is **cooldowns becoming unusable at low
   health**, which is a simharness question, not an eyeball one.
3. **Pulsing auras are gameplay, not cosmetic** — the radius genuinely
   oscillates, so reading the beat and stepping in on the swell is a real
   skill expression. The ring must animate exactly or it lies to the player.
4. **XP credit generalizes to "any aura that affected the fight"** — damage,
   heal, light, slow, shield, resist, taunt. Not a light-specific special
   case; the next support role would only re-ask the question. Follows the
   GDD's "players filling roles for each other is essential, not optional".
5. **Warbanner stays as authored** — the minion fantasies become **separate
   combo recipes** (CallForAid + Vanguard → heal minions, CallForAid +
   Spearhead → damage minions) rather than folding a summon into the capstone.
6. **Campfire-only ability swapping: DROPPED.** The escalating point curve is
   expected to supply the build commitment this was reaching for, without a
   travel tax. (It also conflicted with the GDD's "switchable mid-fight".)
7. **Swift: open.** PO note — *"Haste is currently not affecting movement
   speed so it's only two cooldowns that affect movement. Also it's a proof of
   concept, we can balance later."* See §Findings for what that reframes.
8. **Sequencing: gameplay feel first, persistence after.** PO ruling —
   *"we will move persistence to a later point in time after we fix the issues
   affecting the general feel. Right now we make it fun first… we iterate
   multiple times through versions to make sure it's fun."* Step 8 (accounts &
   persistence) **stays next in roadmap order** and may start soon anyway, but
   does not block these passes.

---

## Findings from the triage (measured, don't re-derive)

**Reaper is a strict upgrade, not an outlier.** L3 = 18 dmg / 1.33 s at
**radius 2.0**, 50 % lifesteal (≈9 HP/hit), execute ×2 below 35 %, berserker up
to ×2. Damage L5 = 26.8 dmg at **radius 1.0**, no sustain, and costs 5 points
to Reaper's 3. There is no axis on which Damage wins. Loudest dial is
lifesteal; **radius 2.0 is what makes it un-kiteable.**

**The three damage auras are one line plotted three times:**

| skill | radius | dps @ max | maxLevel |
| --- | --- | --- | --- |
| Damage | 1.0 | 20.0 | 5 |
| Wild | 1.4 | 14.7 | 5 |
| LongRangeStrike | 2.6 → 3.0 | 12.75 | 5 |

Pure radius-vs-dps, three times. LRS was authored as a *"positioning
side-grade, never a straight upgrade"* — it isn't one: since radius **is** the
positioning game, 2.6–3.0× reach is effective immunity to every melee mob.

**Recover is dead content past ~L5.** Flat 36 HP total (4 × 9 ticks),
`maxLevel: 1`, cd 1200. FirstAid is 20 % + 5 %/lvl **of max HP**, cd 900.
With `levelGrowth 1.12` over 30 levels, max HP grows **~26×** — so Recover is
worth 36 HP at L1 and 36 HP at L30, while FirstAid is worth 30 % forever.

**Point budget today:** `skillPointsPerLevel 1` × `maxLevel 30` ≈ 29 points;
slots 3/3/3 = 9 skills; skill `maxLevel` 3–5 → maxing all nine costs ~45. So
scarcity already exists, but with free respec and low caps it reads as *"I've
maxed my three good ones, now what"* rather than as a choice. That is exactly
the complaint decision 1 answers.

**Haste does not affect movement** — it is `tick_rate` (aura cadence ×0.5 for
3 s), confirming the PO note. So the movement space today contains **only Dash,
a blink**; there is no sustained-speed cooldown at all. This *flips* the
earlier lean on Swift: converting it to a cooldown fills a genuinely empty slot
rather than duplicating Dash/Haste. Deleting it would leave movement as
blink-only.

**Haste's name lies.** It is also the *only* milestone unlock (Haste @ L7), so
the one moment progression is most legible is the moment the name promises
movement speed and delivers attack speed.

**`selfDamageHP` already exists** but only on heal auras
(`skills/definition.go`), so decision 2 is an extension of a live field, not a
new concept.

**XP attribution today** = damage contributors + their recent healers
(`model/mob/mob.go`, `participants` map, cleared on full regen). Decision 4
generalizes the *entry* condition; the open part is what "affected" means for
passive-ish effects.

---

## Intake — round 3 (2026-07-25)

PO report from live play, plus two recorded ideas and a direction question.
Traced against the code in-session; everything below was read, not estimated.

### The bug: healers regenerate through incoming damage

**PO report:** *"Healers keep permanently regenerating health when they are
alone, even if they are attacked, since they don't fight back."*

**Mechanism (confirmed):**

1. `Mob.Update` treats **"no aggro target" as "out of combat"** and regenerates
   there (`model/mob/mob.go:647-655`), currently at `game.mob.healthGainTick`
   ≈ the full pool in ~2 s.
2. A seek-healer is routed through `updateHealerTargeting`
   (`mob.go:834` → `model/mob/healer.go:37`), which **returns before the
   threat/retaliation block entirely** — healers have no threat table at all.
   `findWoundedAlly` also excludes self (`healer.go:65`), so a *lone* healer can
   never acquire anything.

⇒ A lone healer is permanently `aggroTarget == nil`, therefore permanently
regenerating, and damage taken cannot change that. Unkillable unless burst beats
~50 % of its pool per second.

**This is not a healer bug.** "In combat" is derived from *having a target*
rather than from *taking damage*, so any mob that cannot or will not retaliate
hits it. Same hole, milder instance: a mob whose leash expires while still being
shot from out of reach resets aggro and starts regenerating.

### Adjacent finding — the squad medic — ✅ **CONFIRMED IN-GAME 2026-07-25**

`updateAggro` has **two** special-case early-returns, not one: `isFollower`
(`mob.go:826`) and `seekHealer` (`mob.go:834`) — **and they already collide.**
`MedicCompanion` (`api/mobs/medic-companion.json`) carries `HealerAura` but is a
follower (`isFollower` = `owner != nil && velocity > 0`, and its speed is 1.2),
so `isFollower` wins and the healer path never runs for it. Its heal aura
therefore gates on acquiring a **hostile** within heal-aura reach via
`updateCompanionTargeting`, and its `aggroRadius` is a `0.1` dummy, so it cannot
sense a wounded ally at all.

**Verified in-game** with a headless Playwright run against `aurad -dev -content
../api`: join → `SKILL FieldMedics` + `SKILL Damage` → equip both → warp next to
a Z1 wolf → summon the squad → damage aura on → `THREAT` sampled through the
fight. The `THREAT` dump prints each mob's aggro target, and
`MedicCompanion` is not `auraAlwaysOn` (that is `Factors.Speed <= 0`), so
**`target=0` ⇒ its aura is gated OFF**. Observed:

| observation | reading |
|---|---|
| `def=MedicCompanion … target=2203` where **2203 is a `Wolf`** | **Decisive.** A seek-healer's `findWoundedAlly` only ever returns *same-faction* allies, so a medic that acquires a hostile is provably running the companion path, not the healer path. |
| `def=MedicCompanion … target=0 rows=1 \| 2203=47.0` | The medic had taken **47 damage from the wolf** and still held **no target** — aura off *while being killed*. (Followers deliberately do not retain threat, §3.6, so the row never re-targets it.) |
| `target=0` in **11 of 15** samples across an active fight in which both `SoldierCompanion`s were wounded | The squad healer spends most of a fight with its heal aura **off** while its allies are wounded. |

So the medic heals only during the moments an enemy happens to sit inside its
2.0-unit heal radius — **a live bug**, and the same missing abstraction as the
rest of this section. Fold it into the mode-selector chunk.

**Two incidental findings from the same run:**

- **⚑ The `DAMAGE <pct>` dev cheat is broken and always kills.** It calls
  `VitalSign.SubFraction`, which computes against `vitals.Max` (`^VitalSign(0)`,
  the *type* maximum) — but player health has been **absolute HP** since item 11
  (`player.go:68`). Any argument therefore subtracts vastly more than the pool.
  Filed under Rolling filler.
- **Decision 1 has a player-side precedent, which strengthens it:** the player
  already gates passive regen on `InCombat()` / `combatRegenGraceTicks`
  (`player.go:230-240`) — a recent-combat window, exactly the rule mobs lack.
  The chunk is *porting an existing rule across the entity split*, not inventing
  one, which is the §31 argument in miniature.

### Decisions (PO, 2026-07-25, via choice prompts)

1. **The regen fix is a damage-recency combat timer**, not retaliation. Regen
   gates on "took damage within the last N ticks" [PLACEHOLDER] instead of on
   `aggroTarget`. `m.tookDamage` already exists as a per-tick flag and becomes a
   countdown. Fixes healers, any future non-retaliating mob, and the leash hole
   in one rule — and preserves the healer's authored teach (`healer.json`:
   *"it never attacks — kill it to stop the healing"*), which retaliation would
   have deleted.
2. **No universal auto-attack.** *"Retaliate if it has the means"* — i.e. if the
   loadout contains a damaging aura. The shared `Autoattack` skill idea is
   **parked in backlog §31**: a `curveLevel`-derived baseline is §31 gap 3 (two
   level curves, neither can read the other's), and a flat-authored version
   would need per-tier variants and become migration debt.
3. **Role is a loadout configuration, not an entity type** — scoped as **§31's
   behaviour-side instalment**, its own chunk, before step-8 planning. Delete
   the `seekHealer` flag *and* the follower early-return in favour of one
   loadout-driven mode selector; fix the `MedicCompanion` collision in the same
   pass.
4. **A pacifist healer keeps healing and ignores its attacker.** It is in
   combat, regen off, threat tracked, but movement stays ally-driven. Flee and
   retreat-toward-allies were both considered and rejected for now — flee would
   also make healers meaningfully harder to kill, which is a tuning change
   smuggled into a bug fix.
5. **Mode rule keys on aura *category*, not on "heal".** *If an ally is below
   `supportThreshold` and I carry a support-category aura → activate that slot
   and move to the ally. Otherwise → activate my primary slot and behave as a
   normal combat mob.* `skills/aura_category.go` already classifies every aura
   effect exhaustively (Damage/Heal/Shield/Dot/Slow/Light/Resist) with a test
   that fails the build on an unclassified effect type — the AI and the client's
   ring colours then read **one** classification, so they cannot diverge.
6. **Support set = Heal + Shield** [PLACEHOLDER]. Resist and Light can join
   later without code changes — it is one constant. Light was rejected because
   it has no ally-health relationship: a torchbearer would run at whoever is
   most hurt for no reason.
7. **Per-slot authored conditions are NOT built now** (own-health triggers,
   enemy-count triggers, a 3-slot priority table). Recorded in §31 as the
   additive generalization for when a second condition *kind* actually appears;
   today's fixed rule becomes the default row in that table.
8. **The survivors-like fork is CLOSED — the game stays MMO-lite.** PO question:
   *"are we moving more into a survivor-like game where waves of enemies
   approach you, making distinct NPCs too complicated or unnecessary?"* Answer:
   the content and systems are already committed to role interdependence (50
   authored mobs, factions, threat, taunt, healers as a kill-priority teach,
   group gates) and the GDD pillar *"players filling roles for each other is
   essential, not optional"*. Survivors-likes have undifferentiated enemies
   *because* they have no role interdependence — taking that fork means deleting
   the pillar, not just simplifying mobs. But "NPCs as distinct as players" was
   never required, and **WoW does not do that either**: mobs are template-driven
   with authored ability lists and no progression system. The middle path —
   **share the stat vocabulary, not the progression machinery** — is both
   cheaper and what §31 already targets. *"High-level play feels survivors-ish"*
   is an observation about density, which is a tuning knob.

### WoW Classic, checked (the PO asked whether it works this way)

**Shared:** mobs and players are both `Unit`s — same health/power model, melee
auto-attack on a swing timer, the same attack table (miss/dodge/parry/block/
crit), the same buff/debuff system, the same threat rules. **Not shared:**
creature stats come from level-based template tables, not gear + talents; no
talent trees; no gear-derived crit rating (creature crit is a flat baseline);
damage is a baked min/max range, not weapon × attack power; abilities are
hand-authored spell lists. Auto-attack *is* near-universal for hostile NPCs —
caster and healer NPCs melee you in melee range.

**But WoW's healer NPCs are not killable because they auto-attack.** They are
killable because of mana pools, cast times, pushback and interrupts — and
because *any* damage puts a mob in combat, ending regen until it evades (at
which point it heals to full instantly, the anti-kite rule). Aura's healers have
none of those brakes: no cost, no cast time, no interrupt, instant, whole-ring.
**The transferable lesson is the combat-state rule, not auto-attack** — which is
why decision 1 and decision 2 point in different directions.

### The chunk

> **✅ DONE 2026-07-25 `03b152f4` — ✅ PO-VERIFIED IN-GAME 2026-07-26.**
> All 4 checklist items passed. Both parts in one chunk per PO call. Ledger at
> the end of this section (§Round-3 chunk ledger).

One execution chunk. Not started.

1. **Damage-recency combat timer** — `tookDamage` flag → countdown; regen gates
   on it. TDD in `mob_test.go`. Independently valuable; ship-ready on its own.
2. **One mode selector** replacing both early-returns. `aggroTarget` currently
   means three things at once — *who I chase*, *whether my aura is on*, and *am
   I in combat*. Split: combat state ← threat + damage recency; movement target
   ← ally **or** enemy per mode; active slot ← follows the mode. Add a
   `supportTarget` next to `aggroTarget`.
3. **`supportThreshold` on the mob definition** [PLACEHOLDER default 1.0 = any
   wounded ally], plus loader validation.
4. **Widen the sensor mask** to `LayerCombatants` for any mob carrying a support
   aura (it must see allies *and* enemies). Small broadphase cost, only those
   mobs.
5. **`MedicCompanion`** — ✅ verified in-game 2026-07-25 (see above); fold into
   the selector. Also give it a real `aggroRadius` — the `0.1` dummy was chosen
   because followers ride owner signals and never sense for themselves, which
   stops being true the moment the medic can look for a wounded ally.

**Why it is smaller than it sounds — four pieces already exist:**

- **Mob aura switching is already fully supported and nothing uses it.** The
  SkillSystem re-derives the aura collider's radius **and** mask every tick from
  the *active* slot (`sys/skills.go:151-157`), so a mob flipping heal→damage
  retargets and resizes its sensor for free — and `shouldApproachAggroTarget`
  reads `m.aura.Radius`, so its stop distance auto-corrects. `setAuraActive`
  (`mob.go:898`) simply never picks anything but slot 0.
- Threat, retaliation, leash, safe-zone and flee all work; healers just `return`
  before reaching them.
- Mob cooldowns already auto-fire when ready and only consume on a hit
  (`sys/skills.go:1093`).
- Decision 1's timer supplies "in combat while doing nothing" on its own.

**⚑ The landmine: mode thrash.** `SetActiveAura` zeroes the tick accumulator
(`skills/component.go:366`). A mob that flips mode every tick **never completes
an aura tick — it deals and heals exactly zero, silently.** Needs hysteresis
(hold a mode ≥ N ticks [PLACEHOLDER], or switch only on tick boundaries). This
is the same failure shape §31 warns about for gap 1: a silent behaviour change,
no error. Pin it with a test.

**What falls out for free:** §31 notes the village healer is already a mob — a
loadout-driven healer generalizes to friendly-faction healers healing *players*.
And the whole spectrum becomes content with no branching:

| Loadout | Behaviour |
|---|---|
| support auras only | today's pacifist healer — kill it to stop the healing |
| damage auras only | rule never fires; ordinary combat mob |
| heal + damage | attacks in the gaps, heals when needed |
| damage + shield, `supportThreshold: 0.5` | guardian: cleaves, switches to shielding an ally below 50 % |
| `supportThreshold: 0.2` | mostly fights, emergency-support only |

### Round-3 chunk ledger

**Healer combat state + role-as-loadout DONE (2026-07-25), backend + content —
✅ PO-VERIFIED IN-GAME 2026-07-26, committed `03b152f4`.** 11 files.
Both parts shipped together: the selector needs a combat-state notion that is
not "has an aggro target", and support mode makes that proxy strictly worse.

**PO in-game acceptance checklist (2026-07-26) — ✅ ALL PASSED.** Both ⚠ items
resolved in the PO's favour: the `RallyDrummer` **reads correctly** as authored
("chasing other bandit mobs to shield them seems fine" — pacifism accepted), and
the universal post-hit regen gate is accepted as shipped. One follow-up raised,
NOT a defect in this chunk: a pacifist under attack with nothing in range to
support should **flee** rather than idle-wander — see §Intake round 5 item 2.

1. Beat on a lone `Healer` / `BanditHealer` — it must now die instead of
   out-regenerating you. **This is the reported bug.**
2. Disengage from a wounded mob and wait — it must still heal back to full
   (the fix is a combat gate, not a removal of regen).
3. `RallyDrummer` must no longer chase you; it should tend its own squad. Judge
   whether that reads correctly (see the ⚠ below — it is a real behaviour change).
4. Summon `FieldMedics` / `HoldTheLine` while a squadmate is hurt — the medic
   and the shieldbearer must actually heal/shield now, and must NOT run off to
   chase whatever hit you.

**PO decisions (2026-07-25, via choice prompts).**
- Scope: **both parts, timer first**.
- Hysteresis: **switch only on tick boundaries**, with the explicit constraint
  *"just ensure this is not a hard requirement for players as well"*. Honoured
  structurally — the damping lives in `mob.applyMode`, and players switch
  through `SkillComponent.SetActiveAura` directly (`core/input.go:314`,
  `sys/equip/equip.go:137`), untouched. That seam is also why it is the right
  one: the accumulator reset is a deliberate anti-exploit guard against
  rapid-switch DPS stacking, so damping it there would have weakened it.
- Grace: **100 ticks**, deliberately the player's `combatRegenGraceTicks` value
  AND name (§31 vocabulary convergence — same tactic as `game.mob.healthGainTick`).
- Idle mode: **only on acquisition** — idle deactivates the aura outright,
  preserving auras-off-until-aggroed (chunk 3c) and "a lit ring means something
  is happening".

**Part 1 — combat state.** `Mob.InCombat()` already existed and returned exactly
`m.aggroTarget != nil`; it *was* the bug, already public and already read by heal
eligibility. Now `aggroTarget != nil || inCombatTicks > 0`, stamped in
`takeDamage` beside the existing `tookDamage` (which is consumed once per tick by
the leash and could not serve). Regen moved out of the `else` of "has a target"
into its own `!InCombat()` gate. Mobs still do **not** implement
`model.CombatActor`: the dealt half is already covered by holding a target.

**Part 2 — role as loadout.** `healer.go` → **`support.go`** (git mv). The
latched `seekHealer` type flag is gone; `roleSlots` derives `supportSlot` /
`combatSlot` from aura **categories** via the existing `skills.AuraCategoriesOf`
table (support = Heal|Shield per the PO's set; combat = Damage|Dot|Slow). Both
`updateAggro` early-returns are replaced by a three-step pipeline — enemy
acquisition (follower / pacifist / ordinary) → support acquisition → `selectMode`.
`setAggroTarget`/`resetAggro` no longer touch the aura: `applyMode` is the single
writer. `supportTarget` is its own field, so `aggroTarget` means only "the enemy
I fight" again.

**Dwell rule (the landmine).** "Tick boundary" is ambiguous for a multi-effect
aura — `sys/skills.go` runs each effect on its own cadence off one accumulator.
Resolved as: a swap of one **live** aura for another waits until the outgoing
slot's accumulator reaches its **fastest** effective interval. Expressed in the
aura's own authored units, so it self-tunes per skill and cannot drift out of
sync with a retune. Activation and deactivation are never held back (neither can
discard progress) — pinned by
`TestMob_DeactivationIsNotHeldBackByTheBoundary`. Factor 1.0 is correct today
because mobs do not satisfy `sys.tickRateBuffed`; `fastestTickInterval`'s doc
comment says what must change if they ever do.

**⚑ Second bug found in-chunk, not in the plan.** `SetFaction` re-derives the
sensor mask from the aggro set, and `spawnSummon` calls it **after** `NewMob` —
so a support widening applied only at construction was narrowed straight back.
Every summoned medic was blind to allies regardless of the rest of the fix. The
widening is now part of the derivation (`refreshSensorMask`), pinned both ways
(`TestMob_SetFaction_KeepsTheSupportSensorWidening` +
`..._LeavesDamageMobSensorNarrow`). This shape predates the chunk — it applied to
`seekHealer` too.

**⚑ Third finding: `ShieldbearerCompanion` had the same bug as `MedicCompanion`.**
The plan named only the medic. Both are followers carrying a support aura and
both hit the `isFollower` early return.

**⚑ Fourth: selector branch ORDER is load-bearing.** A medic companion is both a
follower and a pacifist. With `isFollower` checked first it still acquired the
owner's attacker from the owner's combat signals and chased it — with no combat
aura to hurt it with, and away from the ally it exists to heal. `isPacifist` is
therefore checked **before** `isFollower`; a support-only follower acquires
nothing and falls through to `updateFollow` via `updateIdleMovement`. Found by a
post-implementation smell review, fixed test-first
(`TestMob_MedicCompanion_IgnoresTheOwnersAttacker`). The pacifist rule now holds
for followers too, which is what the PO ruling actually says.

**Content.** `supportThreshold` added to `factors` (validated `[0, 1]` at load,
absent → 1.0 at construction). `medic-companion.json` aggroRadius `0.1 → 3.5`,
`shieldbearer-companion.json` `0.1 → 5.5` (support radius + ~1.5 follow ring);
both `_comment`s rewritten — the "dummy, followers ride owner signals" rationale
stopped being true the moment they sense for themselves.

**⚠ Live behaviour change the PO should rule on: `RallyDrummer`.** It carries
`RallyDrum`, which is `shield_aura` — **not** `heal_aura` — so the old
`firstAuraHeals` check never classified it as a seek-healer. It was treated as an
ordinary combat mob: it acquired players and chased them while shielding its own
squad, dealing nothing. Under the loadout rule it is a **pacifist** and now seeks
wounded allies instead of chasing players. This looks like the correct behaviour
and follows directly from the PO's Heal+Shield support set, but it is a live
content change beyond the healers and was not called out in the plan.

**Also PO-visible: every mob now stops regenerating for ~3.3 s after any hit.**
Hit-and-run whittling works on *anything*, not just healers. Intended, and the
direct consequence of the grace decision.

**Verified.** `go build` / `go vet` clean; `go test ./...` green (27 pkgs);
**guardrails replay identically `-count=2`** (matters — this is mob AI, and every
damage mob must be byte-identical: none carries a support aura, so the new rule
never fires for them). Boot `-content ../api`: **83 skills/14 factions/50
mobs/10 recipes/5 prop defs/1 milestone/777 props/471 spawns/5 campfires/14
npcs, 0 errors, 0 panics**. `make -C backend build` re-run **after** the JSON
edits so the embedded `backend/pkg/api/` copies carry the new radii (they are
gitignored; cp-defs ran before the edits on the first pass — the §26 Chunk-2
lesson, caught here). Headless join smoke: joined, character live, 5–9 nameplates
rendering. No frontend or wire changes, so no `tsc`/webpack run.

**⚠ §29 recurred (4th sighting), and the "first cold load after a restart" lead
did NOT hold.** Run 1 threw 3 × `Cannot read properties of null (reading
'split')`; runs 2, 3 and 4 — including a deliberate fresh cold load after a
server restart — were completely clean. Not attributable to this chunk (backend
only, no wire change, same binary across all four runs). The cold-load hypothesis
recorded in CLAUDE.md should be treated as weakened, not confirmed.

**Not done:** no in-game click-through. The acceptance check is the reported bug
— beat on a lone healer and confirm it dies — plus a look at whether
`RallyDrummer` no longer chasing reads correctly.

---

## Intake — round 4 (2026-07-25): ability tooltips under-report every HP value

Found by the PO from live play: Rejuvenation's tooltip reads **identically** on a
level-1 and a level-30 character (`4 → 6 × 6 over 11.88s`), which prompted "if it
scales then something in the description is wrong". It is the description. The
scaling itself is correct.

### The bug

The tooltip's entire scaling model is `SkillTooltip.ts:52`:

```ts
function scaled(base: number, perLevel: number, level: number): number {
    return base + perLevel * (level - 1);   // level = SKILL level
}
```

The server does one more multiplication that the tooltip omits —
`sys/skills.go:824` (and its siblings for every other HP-valued effect):

```go
hp := effect.Hot.HPAt(level) * casterPowerScale(e)   // × f(charLevel) = 1.12^(L−1)
```

So both screenshots showing `4` is *consistent* with the tooltip's own logic —
the skill was `Lv 1/3` in both, and character level was never an input. At
character level 30 Rejuvenation actually ticks **≈107 HP** (`4 × 1.12²⁹ ≈ 4 ×
26.75`). The tooltip is off by the full total inflation of the curve, up to
**26.75×** at the cap.

### Scope — seven lines, not one

`casterPowerScale`'s own doc comment (`sys/skills.go:376`) is the authoritative
list of what it multiplies: *damage / heal / dot / hot / shield / self-heal /
self-cost*. All seven have an under-reporting tooltip line:

| line | `SkillTooltip.ts` |
|---|---|
| `Damage:` | `:212` |
| `Heal:` (flat-HP branch) | `:220` |
| `Costs you: … HP per tick` | `:225` |
| `Heal self:` (flat-HP branch) | `:234` |
| `Damage over time:` | `:262` |
| `Shield:` | `:293` |
| `Heal over time:` | `:308` |

**Must NOT be scaled** (they are already curve-free and scaling them would be a
new bug): the two `of max HP` fraction branches (`:218`, `:232` — max HP already
carries f(L), which is exactly why the server skips `powerScale` on those
branches too), plus radius, crit %, variance, slow, resist, stat passives, dash
distance, tick rate/cadence, target counts. `casterPowerScale` deliberately
touches HP values only — mirror that boundary exactly.

### PO decision (2026-07-25): absolute numbers

> *"The tooltip should show what the player actually will see. Since the player
> character is at level 30 and the aura will heal for 107, it should say that. If
> that is relative to his own health pool is not relevant."*

So: render the true absolute value. The considered-and-rejected alternative was
rendering heals/shields as *% of your max HP* (curve-free by construction, but it
answers a question the PO did not ask, and damage has no natural denominator).

### Why it is not a one-line fix

The client has no access to the curve. `levelGrowth: 1.12` lives in
`conf.default.json:16`; grepping `frontend/src` and all three `.fbs` schemas for
`levelGrowth` / `powerScale` returns **nothing**. Hardcoding `1.12` client-side
would re-create precisely the hand-sync duplication that the `GET /skills`
catalog endpoint was built to delete (plan-ui-polish chunk 1) — and the curve is
a [WORKING LOCK], not a constant.

**Two pieces already exist, which is what keeps this small:**

- **The client already knows its character level.** `Character.level` is on the
  wire (`server.fbs:230`), `Player.updateFromBackend` already mirrors it into
  `getLocalPlayerLevel()` (`client-data/Mobs.ts:62-69`, added for the
  nameplate difficulty tint) and it is live-updated every snapshot.
- **`curve.Curve` already marshals to JSON** (`growth` / `maxLevel` tags,
  `curve/curve.go:12-15`), and `cfg.ReadConfig` is the single defaulting point
  (`cfg/conf.go:95-101`), so anything read out of `config.Game.Player` post-parse
  is already defaulted. No new defaulting logic.

### The chunk

One execution chunk, backend + frontend. Not started.

1. **Serve the curve on `/skills`.** `CatalogJSON`/`CatalogHandler` currently
   marshal a bare **array** (`skills/catalog.go:77-81`), so this is a payload
   *shape* change to `{"curve": {...}, "skills": [...]}`. Breaking, but the only
   consumer is our own client and both halves ship in one commit. Take the curve
   as a `curve.Curve` parameter (no import cycle — `curve` imports only `math`)
   and construct it in `aurad.go:264` from `config.Game.Player.LevelGrowth` /
   `MaxLevel`.
   - ⚑ **DRY watch:** that construction already exists verbatim at
     `core/gameconf.go:22`. Two copies of "how you build the curve from conf" is
     the drift shape the C0 one-knob rule exists to prevent — extract a shared
     constructor rather than copy the literal.
   - *Alternative considered:* a separate additive `/conf` sidecar. Non-breaking
     and an honest home for future client-visible conf, but it duplicates the
     fetch + fallback plumbing for one number pair — YAGNI. *Also rejected:*
     streaming `power_scale` as a wire field (authoritative, zero client-side
     formula, but a schema regen + codec change + per-tick bandwidth for a value
     that changes ~30 times per character lifetime, and it drags in the
     "regenerated bindings need a webpack dev-server restart" gotcha).
2. **Consume it in `client-data/Skills.ts`.** Parse the curve alongside the
   definitions; expose `powerScaleAt(level)` = `Math.pow(growth, level - 1)`,
   clamped to `level >= 1` to mirror `curve.F`. Degrade to **1** when the fetch
   fails — the module's existing contract is "the game never blocks on the
   catalog", and a neutral scale reproduces exactly today's behaviour rather
   than crashing a tooltip.
3. **Apply it in `SkillTooltip.ts`** to the seven lines above and nothing else.
   Cleanest seam: a second optional multiplier argument threaded into `prog()` at
   the HP-valued call sites, so the "which lines scale" decision stays visible at
   each call rather than hidden in a helper. Character level comes from
   `getLocalPlayerLevel()`.
   - ⚑ **Rounding:** `fmt()` trims to 2 decimals, so scaled values will read
     `106.99` where the server deals `vitals.HP(...)`. Match the server's own
     rounding, or the tooltip is precise and still wrong. Check what
     `vitals.HP` does before picking.
   - ⚑ `getLocalPlayerLevel` lives in `client-data/Mobs.ts` because the tint
     "already owned the mob side". Tooltips are its second consumer, so the
     mob-module home is now wrong. Judgement call in-chunk: import it as-is
     (KISS) or lift it to its own tiny module. Prefer lifting only if a third
     consumer is already visible.
4. **Update the header comment** (`SkillTooltip.ts:1-9`). It claims the tooltip
   "stays correct through every balance retune" — true for authored values, and
   it tracked those correctly all along; it simply never modelled the curve axis.
   Say both axes now.

**Test strategy.** `prog`/`scaled` are already pure and DOM-free by design
("unit-testable" per the header) — TDD a failing test first: the same effect at
character level 1 vs 30 must differ by `1.12²⁹`, and a radius/crit/variance line
must be **byte-identical** across both (that assertion is the real regression
guard — it pins the boundary, which is the part most likely to be got wrong).
Backend: a catalog test that the new payload shape round-trips and carries the
conf curve, not `curve.Default()`. Then in-game: hover Rejuvenation at level 1,
`XP` up to 30, hover again — the number must move, and it must match the actual
heal landing on an ally.

**Blocks nothing, blocked by nothing.** Independent of the round-3 healer chunk.

### Round-4 chunk ledger

**Tooltip character-power-scale DONE (2026-07-26), backend + frontend + first JS
test infra — ✅ PO-VERIFIED IN-GAME 2026-07-26**, committed `eaae2e69`. 14 files.

**PO in-game acceptance checklist — ✅ ALL PASSED.** Item 4 signed off: the
whole-point HP rounding reads acceptably, so the unplanned display change stands
as shipped.
1. Hover any HP-valued ability at character level 1, `XP 99999999` to 30, hover
   again — the number must move. Rejuvenation is the reported case: `4 → 6`
   becomes `107 → 160`.
2. Confirm the tooltip number matches the heal/hit **actually landing** (the
   headless run pins the render, not the collision between render and reality).
3. Check the non-HP lines did **not** move: radius, crit %, variance, slow,
   resist, stat passives, cadence, cooldown, target counts.
4. ⚠ **Sanity-check the new whole-point rounding reads acceptably** — see the
   behaviour change below.

**Backend.** `skills.Catalog` envelope: `/skills` now serves
`{"curve": {...}, "skills": [...]}` instead of a bare array.
`CatalogJSON`/`CatalogHandler` take a `curve.Curve`. Breaking, but our client is
the only consumer and both halves ship in one commit.
- The planned ⚑ **DRY watch resolved by extraction, not by a third copy:** the
  literal `curve.Curve{Growth: …, MaxLevel: …}` already existed twice
  (`aurad.go:65`, `gameconf.go:22`). Added **`cfg.Config.LevelCurve()`** as THE
  construction point and repointed both — so the chunk *removed* a duplication
  instead of adding one. `ReadConfig` already defaults both fields, so it needs
  no defaulting of its own (the GDD §5 one-knob rule).

**Frontend.** `Skills.ts` parses the curve and exposes **`powerScaleAt(level)`**,
mirroring `curve.F` exactly — *including both degenerate cases*: growth ≤ 0 is
neutral, level < 1 clamps to the baseline. Fetch failure → scale 1, which
reproduces exactly the pre-fix rendering rather than inventing a factor.
`SkillTooltip.ts`: `prog()` gained a trailing `scale` argument defaulting to
neutral, so "does this line ride f(L)?" stays visible **at each call site** —
the client-side mirror of `casterPowerScale`'s HP-values-only boundary. Applied
to the seven lines named above and nothing else; the two `of max HP` fraction
branches carry inline comments saying why they are curve-free.
`getLocalPlayerLevel` imported from `client-data/Mobs` as-is (no third consumer
yet ⇒ no lift, per the plan's own rule).

**⚑ Rounding, resolved.** `vitals.HP` rounds half up and floors a positive
amount at 1. New `hpFmt` mirrors it. Without this a scaled heal renders
`106.99` for a 107 HP tick — precise, and still not what lands.

**⚠ PO-visible behaviour change (not in the plan):** because `hpFmt` replaces
`fmt` on those seven lines, **HP values now read as whole points even at
character level 1**. An authored `6.3` shield reads `Shield: 6 HP`. This is what
the server grants (`vitals.HP(6.3)` = 6) and follows from the PO's
"show what the player will actually see" ruling, but it is a visible low-level
change. Checked before shipping: every authored base HP is ≥ 4 and every
per-level step ≥ 1.2, so the `→ next` arrow still moves on every skill.

**First JS test infra in the repo (PO decision 2026-07-26, via choice prompt).**
`vitest` + `jsdom` devDeps, `vitest.config.ts`, `vitest.setup.ts`, `npm test`.
Three landmines worth recording:
- **jsdom, not node** — the client's module graph reaches `window` at import
  time (`Urls.ts` derives the catalog host from `window.location`, PixiJS wants
  a document), so even a pure-formatting unit needs a browser-shaped global.
- **`vitest.setup.ts` stubs `fetch`** — `Skills.ts`/`Mobs.ts` fetch on *import*,
  so an un-stubbed unit test does real DNS against the derived catalog host.
- **`skipLibCheck: true`** added to `tsconfig.json`: vitest's own `.d.ts` files
  use private identifiers and a bundler-style export map, which tsc reports
  against the app's `es5` target. The shipped bundle target is unchanged.

**Verified.** `go build`/`vet` clean, `go test ./...` **exit 0, 27 packages**,
simharness guardrails replay clean `-count=2`. `npm test` 6/6, `npm run
typecheck` clean, `npm run build` clean. `make -C backend build` re-run **after**
the JSON edit (the §26 Chunk-2 lesson). Boot `-content ../api` **0 errors 0
panics** — 83 skills/14 factions/50 mobs/10 recipes/5 prop defs/1 milestone/777
props/471 spawns/5 campfires/14 npcs. Headless in-game
(`.claude/skills/verify/round4-tooltip.mjs`, kept as a repeatable check per PO):
joined, catalog parsed (real names, not `Skill #29`), Rejuvenation renders
`4 → 6` at level 1 and `107 → 160` at 30 with `Radius: 2.5 → 2.7` byte-identical
across both.

**TDD.** Backend test red → green first. Six frontend tests written red first,
three genuinely red on behaviour. The load-bearing one is *"leaves every non-HP
line byte-identical across the scale"* — over-applying the scale is the failure
mode that would look like a fix.

**Harness notes for the next headless run** (both cost a cycle here):
`#gameUI`'s class is **not** `active` in this build — wait on
`window.game?.character` instead; and `Character` has no `level` field, the
level is only on `character.levelElement.text`.

**Drive-by, as the plan asked:** the stale Rejuvenation drop chance (`.1` → the
authored `0.25`) fixed in `orc-warlord.json`'s `_comment` and
`content-skill-inventory.md:59`. `content-auras.md` turned out not to carry the
number at all — the plan named it, but there is nothing there to fix.

### Adjacent finding — Hardy does not buff heal output (verified, no action)

The PO asked whether `Hardy` (`stat_multiplier` / `maxHealth`, +8 %/level) raises
heal output, since heals could plausibly be max-HP-derived. **It does not, and
there is no double-dip anywhere.** Pinning it here because it is the kind of
thing that gets re-derived every time someone reads the heal path:

- **Flat-HP output** (Damage, Heal, Rejuvenation's HoT, shields, dots,
  self-cost): **no.** `casterPowerScale` reads `PowerScale()`, which is pure
  `curve.F(level)` (`player.go:252-254`). Hardy's bonus lives in
  `Derived.MaxHealthBonus`, consumed *only* by `maxHealthFactor()`
  (`player.go:242-247`) for the HP pool. Nothing in the skill-output path calls
  it. The separation is deliberate and clean.
- **`heal_aura` + `healFractionOfMax`** → fraction of the **target's** max HP
  (`skills.go:759-766`); campfire only (0.12). So *your* Hardy makes the campfire
  restore more absolute HP *to you*; it does not strengthen heals *you* cast.
- **`self_heal` + `healFractionOfMax`** → fraction of the **caster's own** max HP
  (`skills.go:1597-1599`); `FirstAid` (0.20 +0.05/L). **Hardy does raise
  FirstAid's absolute heal** — 20 % of a bigger pool.
- Both fraction branches deliberately skip `powerScale` (their comments state
  why: max HP already carries f(L), so scaling again would double-inflate).

Net: Hardy is relatively neutral everywhere — the same *fraction* of a larger
pool — and never inflates an outgoing heal number. **Consequence for the chunk:
the tooltip fix needs the curve only, never `MaxHealthBonus`**, since no
HP-valued output line depends on it.

⚠ Caveat, not a bug today: per backlog §31, `maxHealth` is one of the three
derived stats applied **only in player code paths** — a mob equipping Hardy
silently gets nothing. Latent (0 mob defs equip it), tracked in §31.

### Drive-by while in here: stale Rejuvenation drop chance

`Rejuvenation`'s drop was raised **0.1 → 0.25** in playtest-1 Pass A
(`archive/plan-playtest1-feedback.md:251`), and `orc-warlord.json:33` carries the
new value — but three docs still say `.1`: the mob's own `_comment`,
`content-skill-inventory.md:59`, and `content-auras.md`. Doc-only, one-line
fixes; fold into this chunk's commit or any nearby one.

---

## Round-5 chunk ledger

**Both round-5 items DONE 2026-07-26, backend only — ✅ PO-VERIFIED IN-GAME
2026-07-26, committed `f06b2161`.** All 6 acceptance items passed, and the one
⚠ judgement call (item 5) resolved **as shipped**: the `RallyDrummer`'s
50 %-speed retreat "reads fine" — no flee-speed multiplier, decision 4 stands.
4 files. Design context and the diagnosis for both is §Intake round 5
immediately below; this section is what shipped.

### Acceptance checklist (PO, in-game) — ✅ all 6 passed 2026-07-26

1. Find the `RallyDrummer` at (27.3, 19.7) and let it shield its squad — its
   aura ring must now carry a **tick indicator** showing when the next shield
   lands (1 s cadence). Same for any `Warbanner` totem.
2. Beat on a lone `BanditHealer` (50, −21.5) with no other bandits around — it
   must **run away from you** instead of standing still, and must still die
   when you keep up (it flees at 66 % of your speed).
3. Beat on it **next to a wounded bandit** — it must keep healing instead of
   fleeing. Support outranks flight.
4. Stop hitting a fleeing healer — after ~3.3 s it must stop running and go
   back to wandering.
5. `RallyDrummer` flees at 50 % of your speed. **Judge whether that reads as
   fleeing or as comedy** — decision 4 deliberately shipped it unmodified.
6. Ordinary damage mobs must be **completely unchanged**.

### ① Shield auras now draw a tick indicator

`skills/definition.go`. One line: `EffectTypeShieldAura` joins the
`HasVisibleTickCadence` whitelist. Everything downstream was already live and
category-agnostic — `Mob.AuraTickInterval` → wire `aura_tick_interval` →
`Mobs.setAuraTick` → `AuraTickIndicator`. **No frontend change.**

The predicate is shared by `player.go:644` and `mob.go:475`, so player and mob
indicators moved together, as intended.

Affects `RallyDrum` and `WarbannerShield` (shield-only auras, both authored
`tickInterval: 30`). `Vanguard` is untouched: `AuraTickInterval` reads
`Effects[0]`, which is its damage aura, so it already indicated at the damage
cadence and still does.

TDD: `TestHasVisibleTickCadence` extended + a new
`TestHasVisibleTickCadence_ShieldAura` pinning the reasoning (and that
`instant_shield` stays out — instants have no cadence). Verified red first.

> **Why it was missing** — `shield_aura` had simply never been in either list of
> the existing test, which is how it slipped. It was grouped with the state
> effects, whose exclusion is justified as *"they re-apply, often at interval 1,
> and an indicator would just strobe"*. Neither half is true of shields.

### ② Pacifists flee when attacked with nothing to support

`model/mob/support.go` + `model/mob/mob.go`. Exactly the four pieces the design
called for, no additions:

1. `modeFlee` joins `combatMode`.
2. `selectMode` gains `case m.isPacifist() && m.InCombat()`, ranked **below
   support** — reaching it means the support case already failed, i.e. there is
   nobody to heal. Ranked above engage for readability only: a pacifist has no
   combat slot, so the two can never compete.
3. One movement case in `Update` calling the existing `moveAwayFrom()`.
4. Direction from `highestThreatTarget()`.

`applyMode` untouched: `modeFlee` is not named in its slot switch, so it falls
through to slot −1 — which is already what an unemployed pacifist does. No
content edits, no conf knobs, no wire change, no frontend rebuild.

**The one implementation deviation from the sketch:** `highestThreatTarget()`
**prunes dead rows as it reads**, so calling it twice in one tick (once in the
`case`, once in the body) is not a free repeat. It is resolved once into a local
before the switch.

**Tests** (5 new in `support_test.go`, all verified red first — the first three
failed to compile on `modeFlee`, which is red for the right reason):

- `TestMob_PacifistUnderFireFleesFromAttacker` — asserts the **exact** away
  vector, not just "moved", plus that it still never fights back and still shows
  no ring.
- `TestMob_PacifistFleeEndsWithTheCombatWindow` — the flee ends itself; no new
  timer was added.
- `TestMob_PacifistPrefersSupportOverFlee` — the ordering guard.
- `TestMob_FighterUnderFireDoesNotFlee` — the scope guard for every existing
  damage mob.
- `TestMob_StationaryPacifistCannotFleeAndKeepsItsAura` — **the edge worth
  knowing about.** Campfires, totems and braziers are pacifists too (support
  aura, no combat aura), so they now reach `modeFlee` when damaged. It is inert
  in both directions: they are `auraAlwaysOn`, which early-returns out of
  `applyMode` before any aura gating, and `moveAwayFrom` refuses to move a
  zero-velocity mob. This is the one place the new mode meets an existing early
  return, so it is pinned rather than reasoned about.

**Verified:** `go build` + `go vet` clean; `go test ./...` **exit 0**;
simharness guardrails `-count=2` clean (6.6 s); boot clean, counts unchanged
(83 skills / 14 factions / 50 mobs / 10 recipes / 5 prop defs / 1 milestone /
777 props / 471 spawns / 5 campfires / 14 npcs). **Not done:** no in-game
click-through — items 1, 5 and 6 of the checklist above are feel judgements that
only the PO can make, and decision 4 explicitly deferred the drummer's flee
speed to in-game.

---

## Intake — round 5 (2026-07-26): from the three-chunk verification session

Both items came out of the session that PO-verified rounds 3 + 4 + the filler
batch. **Neither is a defect in any of those three chunks** — both are gaps the
round-3 support work made visible for the first time, because before it no
pacifist mob ever ran its aura in front of the PO for long enough to notice.
Triaged against the code in-session; findings below are read from source, not
estimated.

### 1. A shield aura draws no tick indicator (bug, one-line fix)

The `RallyDrummer`'s aura ring has no tick indicator, so there is no read on
when the next shield application lands. Every other output aura has one.

**Cause — a stale exclusion list, not missing plumbing.**
`skills.HasVisibleTickCadence` (`skills/definition.go:66`) whitelists exactly
four effect types — `damage_aura`, `heal_aura`, `dot_aura`, `hot_aura`.
`shield_aura` falls to `default: false`, so `Mob.AuraTickInterval()`
(`mob/mob.go:469`) returns 0, the wire `Mob.aura_tick_interval` is 0, and the
frontend correctly draws nothing. The whole path below that is already live and
category-agnostic (`Mobs.setAuraTick` → `AuraTickIndicator`).

**Why it looks like an oversight rather than a decision.** The function's own
comment justifies the exclusions as "state + visual effects (slow, resist,
light) re-apply too — often at interval 1 — but show no per-tick hit, so an
indicator would just strobe". Neither half of that reasoning holds for shields:
they are authored with a real, deliberate cadence (`RallyDrum` and
`WarbannerShield` both `tickInterval: 30` = 1 s; `Vanguard`'s shield 90), and a
shield application **is** a visible event — the absorb pool refills and the pip
is already on the bar. The strobe argument does not apply.

> **✅ FIXED 2026-07-26**, PO-verified in-game 2026-07-26 (`f06b2161`).
> Ledger: §Round-5 chunk ledger.

**Shape of the fix:** add `EffectTypeShieldAura` to the whitelist. Watch the
`Effects[0]` assumption in `AuraTickInterval` — it reads the *first* effect
only, so on a multi-effect aura like `Vanguard` (damage 40 / heal 120 / shield
90) the indicator already tracks the damage cadence and would keep doing so;
adding shield changes nothing there. The behaviour change is confined to
shield-only auras: `RallyDrum`, `WarbannerShield`. Same question probably wants
asking for the **player** path (`Character.ts` drives the same indicator from
`Character.aura_tick_interval`) — one shared predicate, both sides move
together.

### 2. Pacifist mobs should flee when attacked with nothing to support

> PO, 2026-07-26: "both the healer and rally drummer should, if attacked and no
> target is in range to heal or shield, flee instead of standing still."

**This is a logic change, not per-mob config.** The distinction matters because
`factors.fleeBelowHealthRatio` exists and looks like it should cover it — it
does not, and authoring it on `BanditHealer` / `RallyDrummer` today would do
**literally nothing**:

- The flee branch (`mob/mob.go:687`) is nested inside `case m.aggroTarget !=
  nil:` and flees *from the aggro target*.
- A pacifist never acquires an aggro target — that is the round-3 PO ruling,
  implemented as `case m.isPacifist(): m.tookDamage = false` in `updateAggro`
  (`mob.go:904`), which returns before any acquisition.
- So `shouldFlee()` is never even consulted for the exact mobs this is about.

And the requested trigger is not the health threshold anyway. "Attacked and
nothing to support" is a **mode**, not a cowardice ratio — it fires at full
health.

**Shape of the fix — it lands cleanly in the round-3 architecture, no new
plumbing.** Four small pieces:

1. `modeFlee` joins `combatMode` (`support.go:36`).
2. `selectMode` gains one case, ranked **below** support and above idle, so a
   fleeing healer that sees a wounded ally goes straight back to work:
   `case m.isPacifist() && m.InCombat() && m.supportTarget == nil`.
   `InCombat()` is already exactly "took damage within
   `combatRegenGraceTicks`" (~3.3 s) — the round-3 fix built it. That also
   gives the exit for free: the window lapses, the mob falls back to idle
   wander and walks home. No new timer.
3. Movement: one case in `Update`'s switch calling the existing
   `moveAwayFrom()`, which already deflects around props and the border wall.
4. Flee-from position: `m.highestThreatTarget()`. **The threat table is already
   populated for a pacifist** — `noteThreat` (`mob.go:1063`) is gated on
   faction and liveness, never on pacifism, and the credit at `mob.go:1450`
   runs on any hit. The attacker identity is free.

`applyMode` needs **no** change: its slot switch names only `modeSupport` and
`modeEngage`, so `modeFlee` falls through to slot −1 (aura off), which is
already what an unemployed pacifist does today.

**Does it undo round 3's "kill the healer" fix? No — checked.** Mob step is
`0.055 × factors.speed` against a player's `walkingSpeedPerTick` 0.05:
`BanditHealer` 0.6 → 0.033 (**66 %** of player speed), `RallyDrummer` 0.45 →
0.025 (**50 %**). Both are comfortably outrun, so a fleeing healer is still a
dead healer — it just costs a few steps. Worth re-confirming in-game, since
that is precisely the failure mode round 3 existed to remove.

**✅ Design decided by the PO 2026-07-26 (choice prompts) — all four minimal:**

1. **Scope: pacifists only.** Mobs carrying support with no combat aura —
   `BanditHealer`, `RallyDrummer`, `MedicCompanion`, `ShieldbearerCompanion`.
   Every other mob stays byte-identical. (Rejected: widening to any mob with
   nothing to act on, which would start overriding leash/idle behaviour that
   already works, and turn a "retreat" into a chase for damage mobs.)
2. **Universal within that scope — no authoring flag.** Only ~4 mobs are in
   scope, so there is no migration and no knob to forget. YAGNI: add
   `fleeWhenHelpless` if and when content wants a healer that stands its ground.
3. **Flee away from the top-threat attacker** — `highestThreatTarget()` +
   the existing `moveAwayFrom()`. No new pathing. (Rejected: toward the nearest
   ally, the better *story* — "runs to fetch the guards" — but it needs an ally
   search outside the aggro sensor and can walk the healer straight *into* the
   player when the ally is behind them.)
4. **Ship at the authored speed; judge the waddle in-game.** No flee-speed
   multiplier. Keeping the drummer at 50 % of player speed is what guarantees it
   stays killable, which is the property round 3 exists to protect; a panic
   sprint would partly walk that back and adds a [PLACEHOLDER] to tune. Revisit
   only if it reads as comedy.

**⇒ The chunk is unblocked and needs no further design.** It is exactly the four
pieces above: `modeFlee`, one `selectMode` case, one `Update` movement case,
`highestThreatTarget()` for direction. `applyMode` untouched. No content edits,
no conf knobs, no wire change.

> **✅ EXECUTED 2026-07-26 exactly as designed**, PO-verified in-game
> 2026-07-26 (`f06b2161`) — the 50 %-speed drummer retreat was judged to read
> fine, so decision 4's "authored speed, no flee multiplier" stands. Ledger:
> §Round-5 chunk ledger above.

---

## Round-6 chunk B ledger — mob-vs-mob soft separation

**DONE 2026-07-26, backend only, 5 files + 2 new — ✅ PO-VERIFIED IN-GAME
2026-07-26, committed `8b045395`.** PO verdict: *"feels much better"*. The
stopped-mob limitation below was **not** raised as a blocker, so
`mobSeparationWeight` 0.45 stands and the tangential settle nudge stays offered
and unscheduled. Executes §Intake round 6 item 3's chunk
plan (below) exactly: soft separation only, no hard collision, no player↔player
and no player↔mob. Design context and the PO decision are in that section; this
is what shipped.

### What it does, in one line

`blockerRepulsion` used to query statics only (`steering.go`), so mobs had zero
awareness of each other — a pack converging on a player collapsed onto one
point. Mobs now also repel each other, softly, while they move.

### The three pieces (the plan's ① ② ③, all as specified)

1. **`phy.Space.AppendCircleDynamics`** (`phy/space.go`, +49) — `QueryCircle`
   without the per-call garbage, mirroring `AppendCircleStatics`: caller-owned
   `dst[:0]` buffer, cell-straddle de-dup by linear scan instead of a `seen`
   map. `QueryCircle` allocates a map **and** a slice per call and this path
   runs per mob per tick, so using it would have re-opened the idle-overload
   regression `fe0044d0` pinned shut.
2. **Query on `LayerViewportCollision`, filter hits to `*Mob` via
   `Shape().UserData`** (`steering.go:mobSeparation`) — there is no mob-body
   layer bit to filter on (`Viewport` is the only bit every body shares, and an
   authored `collisionLayer` replaces the default wholesale). The type check is
   what makes the PO's two rejections structural rather than mask arithmetic a
   content edit could undo.
3. **The steering blend** — `mobSeparationWeight` **0.45 [PLACEHOLDER]**, summed
   separation clamped to unit length, folded in by `blendSeparation`.

Plus the plumbing: a second reusable hit buffer `steerMobHits` on `Mob`, and
`steeringProbe(mask)` factored out so both queries share the one probe circle
instead of depending on call order.

### Three decisions taken inside the chunk

**① Separation is kept out of the head-on detour latch entirely.** The plan
said low weight is what keeps mob repulsion from tripping `steerSide`; the
implementation makes it structural instead — `blockerRepulsion` stays
statics-only and keeps owning the latch, and separation is blended into the
*result*. ⚑ The half that would have bitten is not setting the latch but
**holding** it: it clears on `rep == 0`, so a mob trailing another would have
kept `rep` non-zero forever and walked sideways until the pack broke up. A
latched mob ignores separation completely, so a committed detour is bit-for-bit
what it was before this chunk. Pinned by `TestMobSeparation_DoesNotLatchTheDetour`.

**② The sum is clamped to unit length and the weight is < 1.** Together those
mean no number of mobs can out-pull the direction home — separation bends a
path, it never reverses one. Pinned by `TestMobSeparation_NeverReversesThePull`
(a mob ringed by four others still steps toward its target).

**③ ⚑ The welding landmine was NOT where the plan expected, and the plan's
tie-break would not have fixed it.** §34 and the chunk plan both flag
*co-located* mobs (`d < 1e-4`, same heading ⇒ identical push ⇒ welded). True,
but nearly unreachable: mobs update sequentially within a tick, so an exact
same-point spawn breaks apart by one step immediately — and lands in the case
that actually matters. **A mob directly behind another is pushed straight
backwards, and steering sets direction, not speed, so normalizing the blend
hands back the very same direction.** Zero separation, and single file is what
a chase converges every pack into. The first fix attempt (push along ±heading,
split by entity ID) failed its own test for exactly this reason: two opposite
pushes along the line of travel both collapse back onto it.

⇒ `blendSeparation` fades in a **perpendicular** component as the push lines up
with the path — none when the pair is already side by side, full when nose to
tail. The pair's pushes are opposites, so the same rotation sends one left and
the other right. The co-located tie-break survives as a two-line ID split
feeding the same machinery. Pinned by `TestMobSeparation_SingleFilePackSplits`
and `TestMobSeparation_CoLocatedMobsSeparate`.

### ⚠ Known limitation, by design — a STOPPED mob does not separate

`shouldApproach` (`mob.go:749`) halts a mob once its target is inside its aura,
and `steer` only runs from `moveTowards`/`moveAwayFrom`. So separation acts
**during the approach** — packs arrive spread — and a pack that has already
settled on the aura ring keeps whatever spacing it arrived with. Making stopped
mobs separate radially would fight the arrival clamp (drift out → re-approach)
and produce exactly the jiggle-in-place limit cycle the steering comments warn
about twice; a *tangential* settle nudge would sidestep that, but it is scope
beyond the approved decision and is offered, not taken.

> **✅ CLOSED 2026-07-29 (PO): both halves accepted as shipped.** Settled packs
> keeping their arrival spacing is fine, and `mobSeparationWeight` **0.45 stands
> as the value** — not merely as an unchallenged placeholder. The tangential
> settle nudge is **withdrawn**, not deferred; re-propose it only if a later
> playtest actually complains about ring spacing.

**Measured** (throwaway probe, 4 wolf-like mobs, real `phy.Space`, 900 ticks;
bodies touch at 0.6, every configuration static across ticks 300/600/900 ⇒ no
weight in the sweep jittered):

| weight | at rest: min / mean gap | chasing: min / mean gap |
|---|---|---|
| 0 = today | 0.01 / 0.01 | 0.00 / 0.10 |
| 0.30 | 0.22 / 0.49 | 0.16 / 0.46 |
| **0.45 shipped** | **0.29 / 0.68** | **0.30 / 0.75** |
| 0.80 | 0.10 / 0.86 | 0.79 / 1.06 |
| 1.20 | 0.85 / 1.09 | 0.92 / 1.16 |

Today's total weld (0.01) is the thing to compare against. 0.45 is a large
improvement everywhere and holds the invariant; **1.20 separates best but is
> 1**, i.e. a crowded mob can be held out of its own attack range by its
packmates — a balance change, and against the PO's "low weight" wording. The
number is one line if the in-game read wants more.

### Verified

- `go build ./...`, `go vet ./...` clean; **`go test ./...` exit 0, 27 pkgs**;
  guardrails `-count=2` clean.
- **`steering_alloc_test.go` is the point of ①** — extended with
  `TestSteer_AllocatesNothing` (the whole per-tick path, two neighbours inside
  the probe): **0 allocations**, as is the new
  `TestAppendCircleDynamics_ReusableProbeAllocatesNothing`.
- **Sim battery byte-identical before/after** — 1v1 TTK/TTD (`-runs 200`),
  level curve (`-levels`), and the 1-vs-N pack matrix (`-matrix -max-pack 6`)
  all `diff`-clean against the stashed baseline. The sim spawns its pack on a
  spread ring, so separation has nothing to do there.
- TDD: 6 new pins in `model/mob/separation_test.go`, **red first on 3
  behavioural assertions** (pack spread 0.045, welded pair 0, and the
  discriminating control in the player-body test). 2 of the 6 are negative pins
  (no latch, no reversal) and 1 is the structural no-player↔mob guard.
- In-game headless: boot `-content ../api` clean —
  **83 skills/14 factions/50 mobs/10 recipes/5 prop defs/1 milestone/777
  props/471 spawns/5 campfires/14 npcs, 0 errors 0 panics**. New
  `.claude/skills/verify/mob-separation.mjs` warps a GOD player into the
  densest wolf cluster (7 spawns around (−63.7, 7.5)), gathers a pack, then
  walks so the pack is *chasing* for the second shot: **0 console errors, 0
  WebGL context losses**, screenshots `/tmp/mobsep-after{,-gathered}.png`.
  ⚑ It deliberately does **not** measure spacing — `window.game` is the
  four-key console facade with no entity manager, so mob positions would have
  to be reverse-engineered out of the PIXI layer tree. The numbers are the Go
  pins above; whether it *reads* as spread is the PO's call.

### Acceptance checklist (PO, in-game)

1. Pull a wolf pack (densest cluster ≈ (−64, 8)) and **keep walking**. The pack
   must spread while it follows instead of travelling as one blob.
2. Stand still and let them arrive. Expect them **less** piled than before but
   **not** fully separated — the stopped-mob limitation above is visible, and
   the question is whether it is good enough.
3. No mob may **jiggle in place** at a prop notch or a wall corner — the
   head-on latch is the thing decisions ① exists to protect.
4. Mobs must still reach you and still round props normally. Nothing blocks
   anything; you can still walk straight through a mob.
5. Campfires, totems and companions are mobs too — they repel and are repelled
   (stationary ones only repel). Check nothing drifts oddly around a campfire.

### Does NOT close round-6 item 4

~19 wolves fit inside a level-1 Damage aura even with *hard* collision
enforced, so no separation scheme creates focus fire. `selectTargets` still has
no target memory; unchanged by this chunk, still unscheduled.

---

## Intake — round 6 (2026-07-26): PO design session, three topics

Not a playtest round — a **design discussion**, triaged against source
in-session (every number below is read, not estimated). All three topics were
resolved to a decision or a shortlist in the same session.

### 1. Resource costs on abilities — ruling that unblocks Pass 1a.2

**Not new scope.** GDD §3 already said *"More powerful auras cost more resource
per tick"*, and round-2 **decision 2** already put costs on auras (per tick) and
cooldowns (per cast). This session supplied the **design intent behind the
numbers**, which is what was actually missing.

**⭐ PO ruling 2026-07-26 — the double meaning is the point.** One resource is
both *"possibility of actions"* and *"time left to die"*, deliberately: *"a
character is at their strongest with full resource and decides how to spend it —
do I risk more but also do more, or do I play it safe."* Full statement now in
**GDD §3 Consumption**, which is the source of truth. Two constraints bound
every cost value:

1. **A free floor.** Basic actions — the base damage aura above all — stay free
   at any resource level; *"even a low-resource character needs access to basic
   things, so there is never no option left."* This is the explicit answer to
   the death-spiral risk round-2 decision 2 recorded: it is **not** solved by
   tuning, it is solved by a permanently free baseline.
2. **The good stuff is gated behind spending.** Everything above the floor costs
   in proportion to impact. That is what makes the floor a floor and not a
   default.

**⇒ The 1-HP clamp is not the safety net.** `sys/skills.go:706` already stops a
cost killing its caster (a caster at the floor skips the effect entirely), but
under this ruling that behaviour is the *wrong* protection to rely on: it makes
the ability silently stop working. The free baseline is the protection; the
clamp stays as a backstop.

**What already exists (the field is live, on one skill).**
`selfDamageHP` / `selfDamageHPPerLevel` sit on `HealParams`
(`skills/definition.go:350`), applied in `applyHealAura`
(`sys/skills.go:711`); the tooltip already renders
`Costs you: 10 → 8 HP per tick` (`SkillTooltip.ts:255`). Pass 1a.2 is
**generalizing a live field**, not a new concept — the UI half is a copy of a
line that already ships.

**Four rules the heal implementation settled that must carry over** — each is a
bug if dropped:

1. **Never-kill clamp** (`sys/skills.go:706`) — cost may leave the caster at
   exactly 1 HP, never below; at the floor the whole effect is skipped.
2. **Cost rides `casterPowerScale`.** An absolute HP cost that does not scale
   becomes free as the pool grows ~26× over 30 levels — the exact mechanism that
   makes Recover dead content (§Findings). Every cost needs a per-skill answer:
   power-scaled absolute (heal's model) or fraction-of-max.
3. **Mobs pay nothing.** The cost path is gated on a player-only interface and
   the mob JSON comments say so explicitly (*"the self-cost is a player
   build-cost lever; a mob caster pays none"*). Keep it, or every caster mob
   suicides.
4. **GOD skips the cost.**

**⚑ New sub-item — the cost-reduction passive (PO idea: a "Healer" passive
reducing all heal costs by X %).** This is **engine-new**: today's five
`validStats` (`definition.go:154` — `movementSpeed`, `maxHealth`,
`damageReduction`, `critChance`, `damageDealt`) are all output multipliers with
a **hand-placed application site**, and an unlisted stat name hard-fails at load
so it can never silently no-op. A cost stat is the **sixth**, and the first that
modifies an *input* rather than an output. Small, but it must be authored as a
real stat, not faked per-skill. It is player-only by construction, which is fine
here — mobs pay no cost anyway (backlog §31 gap 1 does not bite).

**Balancing vectors — the list to price against.** The PO's working set was
impact / cost / cooldown / range. The engine already carries more, and the
first one is doing most of the work today:

| Vector | Where it lives | Note |
| --- | --- | --- |
| **Opportunity cost** | one active aura at a time (GDD §4) | **The largest vector in the game.** An aura's real price is the aura you are not running — the zone-1→2 tunnel tutorial is built entirely on it. |
| Cadence | `tickInterval` | DPS is impact ÷ cadence. Damage 14/40 ticks, Heal 12/80. Also the readability beat. |
| Target count + selector | `maxTargets`, `nearest` / `lowest_health` | Single-target vs area outweighs radius. |
| Uptime / duration | `tickCount`, `durationTicks`, summon TTL | The whole budget for dots/hots/shields/summons. |
| Cast time | `castTicks`, `castInterruptedByDamage` | Exists, essentially unused. §Intake round 3 already cited WoW's cast times/pushback/interrupts as what makes casters killable. |
| Point cost | round-2 decision 1's escalating curve | Power-per-point ≠ power-per-level. |
| Acquisition cost | drop chance + level reachable | Part of why LongRangeStrike dominates is that it is cheap to *get*. |
| Damage type vs resist | `damageTags` + resist maps | Build identity, mob counters. |
| Conditionality | execute-below-X %, berserker, lifesteal, `targetsSelf` | Conditional power should price below flat power. Reaper stacks three. |

**⚑ Sequencing deviation to confirm.** The PO proposal is *costs first, feel it,
retune later*. §Pass 1 deliberately bundles 1a with 1b because *"they each
rewrite every number across the skill catalog; splitting them means retuning the
whole catalog twice"*. Costs-first is defensible under *"make it fun first"*,
but the Pass-1b retune **will re-touch every number authored in the cost pass**.
Recorded as a deviation, not a silent change.

### 2. The Orc Warlord's grunt waves never reach the fight

**PO report:** the grunts spawned by the boss do not move close enough to
aggro onto the player.

**Diagnosed — a distance-vs-sensor mismatch, not a behaviour bug.**

- `wave-mouth` = (33.5, 31.5); `warlord-home` = (26, 30.5) → **7.57 units apart**
  (`api/zones/world.json` anchors).
- `OrcGrunt.body.aggroRadius` = **5.4** (`api/mobs/orc-grunt.json`).
- The grunt authors no `waypoints` and no `wanderRadius`, so
  `updateIdleMovement` falls to `m.moveTowards(m.spawnPosition)`
  (`model/mob/patrol.go:89`) — it walks back to the wave mouth and stands there.

7.57 > 5.4, so a player fighting at the boss sits **~2 units outside the
sensor** and nothing ever fires. The def's own comment shows the intent was
already right — *"Large aggro sensor so a spawned wave finds the fight on its
own while charging in"* — 5.4 was simply authored too small for where the anchor
ended up.

> **✅ RESOLVED 2026-07-26 — PO takes it themselves, in the zone editor: option
> B, move the `wave-mouth` anchor closer to `warlord-home`.** No code chunk, no
> `api/mobs/orc-grunt.json` edit from this side; it lands with the PO's ongoing
> manual placement passes. ⚑ **The distance to beat is the grunt's own
> `aggroRadius` 5.4** — the gap is 7.57 today, so the anchor has to come inside
> that, and trimming to ~6 (as suggested under B below) leaves only 0.6 units of
> margin while keeping some of the charge-in beat. **A and C are not being
> implemented**; if B alone proves not to fire in play, A is still the cheapest
> follow-up.

**⇒ PO decision 2026-07-26: all three of the following are sanctioned options;
pick at execution time.** (Options 4 and 5 from the triage — spawn-at-the-boss,
and a new scripted-move seam — are **not** taken: the first deletes the
charge-in beat and orphans the anchor, the second is strictly more code than
option C for no gain.)

- **A — raise `OrcGrunt.aggroRadius` 5.4 → ~9.** *Config only*: one number in
  `api/mobs/orc-grunt.json`, `-content ../api` + restart, no rebuild. OrcGrunt is
  **encounter-spawned only, never a zone spawn**, so collateral is zero. Cheapest
  real fix.
- **B — move the `wave-mouth` anchor closer.** *Config only*, and PO-doable in the
  zone editor. Best used to trim 7.5 → ~6 alongside A rather than alone;
  shortening the charge is the part of the beat worth keeping.
- **C — seed threat at spawn.** ~6 lines in `encounter/warlord.go`: read
  `e.boss.ThreatSnapshot()`, take the top living row, `grunt.NoteThreat(that, 1)`.
  Threat-based acquisition has **no distance filter** (`highestThreatTarget`,
  `mob.go:1219`), so they commit from any range. Both seams are already exported
  and were built for exactly this.

**⚑ Leash interaction — C is marginal on its own.** The leash is 90 ticks (~3 s)
of *unreachable + outside sensor + not taking damage* (`mob.go:875`). Grunt step
is `0.055 × speed 0.6` ≈ **1 unit/s**, so from 7.5 units it must close ~2.1
units (~64 ticks) to get inside its own 5.4 sensor — under the leash, but only
just, and it breaks if the anchor ever moves further out. **A + C is the robust
pair**; C alone is not.

### 3. Should players and mobs block movement? — ✅ DECIDED: soft separation

**PO question:** mobs (and players?) piling into one unreadable clump — should
bodies block each other?

**✅ PO DECISION 2026-07-26 — implement mob-vs-mob *soft separation*, not hard
collision.** Extend `blockerRepulsion` (`model/mob/steering.go`) to include
nearby mobs at a **low weight**, so packs spread and flow around each other with
**no hard blocking**. Hard collision is **not** taken; player↔player collision is
**not** taken. Full analysis, the rejected alternatives and the two engine
landmines: **backlog §34**.

**Why this is cheap and why the obvious worry does not apply.** The broadphase
already pairs dynamic-vs-dynamic every tick (`phy/space.go:100`) and
circle-push-out already exists — nothing dynamic collides today only because of
**masks** (player body `Mask = PlayerStatic|Border`, `player.go:44`; mob body
`Mask = MobStatic|Border`, `mob.go:106`). And there is **no client-side
collision and no client-side prediction** — the frontend has zero collision code
and the local player renders from server snapshots — so a server-side movement
change has no rubber-banding problem. Soft separation sidesteps the masks
entirely: it is a steering change, not a physics change.

**⚑ The gap it closes.** `blockerRepulsion` currently queries
`space.AppendCircleStatics` (`steering.go:87`) — **statics only**. Mobs deflect
around props and the border wall but have *no* awareness of each other, which is
the direct cause of the clump. The head-on detour latch (`steerSide`) was tuned
against *stationary* blockers; against moving ones the jiggle-in-place limit
cycles recorded in the 2026-07-11 and 2026-07-20 in-game findings are the thing
to watch — low weight is what keeps mob repulsion from triggering the latch.

**⚑ PO argument on record, and it is the strongest pro for the hard version:**
*"clumps of mobs mean it's hard to focus individual ones with a nearest-targeting
aura. Right now you can try to kite them apart if they have different auras or
you have multiple people, but aura ranges and speeds are similar or the same, so
mobs quickly end up as a big unreadable clump."* Two halves, and they need
different fixes — see item 4. Soft separation is a direction blend, not a
constraint, so it can be **overwhelmed when many mobs converge on one point**;
hard collision guarantees a minimum spacing at any count. If the clump proves
worst exactly when the pack is biggest, that is the case that would re-open
backlog §34.

#### Chunk plan (traced against the code 2026-07-26)

**⚠ Correction to the sizing above.** "It is a steering change, not a physics
change" is true of the *semantics* — masks stay untouched, nothing new collides.
It is **not** true of the file list: two prerequisites fall out in `phy/`, and
they are most of the chunk. Neither was visible from the decision-level analysis.

**① There is no allocation-free dynamic-side query, and the naive one is
pinned against.** `blockerRepulsion` (`model/mob/steering.go:90`) uses
`space.AppendCircleStatics`, which exists *specifically* to allocate nothing —
the comment at `:76` records that building the probe and hit buffer per call was
"the single largest allocation site in the idle game loop". Its dynamic
counterpart `QueryCircle` (`phy/space.go:160`) allocates **a `seen` map *and* a
fresh `hits` slice on every call**, and this path runs per mob per tick (~50
mobs × 30 Hz with nobody online). Using it would re-open the idle-overload
regression and fail `steering_alloc_test.go`, the pin the idle-alloc fix
(`fe0044d0`) left behind for exactly this.

⇒ **New `Space.AppendCircleDynamics(dst []DynamicCollider, c *Circle)`**,
mirroring `AppendCircleStatics` (`space.go:208`) — same `dst[:0]` buffer-reuse
contract, same **linear-scan cell-straddle de-dup** via `containsCollider`
rather than a map (`space.go:227` explains why: "a probe spans a handful of
cells and hits a handful of statics, and the map was pure garbage on the hot
path"). The mob then carries a second reusable hit buffer alongside
`m.steerHits`.

**② No collision layer identifies "a mob body", so the mask cannot do the
filtering.** Checked every source of the bit:

| body | layer | source |
|---|---|---|
| mob (default) | `Viewport\|Action` | `model/mob/mob.go:101` |
| mob (authored) | whatever the def says | `mob.go:103`, `d.Body.CollisionLayer` |
| campfire | `32` = Viewport only | `api/mobs/campfire.json` |
| totem, companion | `160` = Viewport\|Player | the authored "player-layer trick" |
| player | `Viewport\|Player` | `model/player/player.go:44` |

`Viewport` is the **only** bit every body shares, and it does not discriminate
player from mob. An authored `collisionLayer` replaces the default wholesale, so
adding a new `LayerMobBodyCollision` bit would be silently dropped by exactly
the defs that already override — and the campfire/totem comments show authors
treat that field as an exact number, not a set to extend.

⇒ **Query on `LayerViewportCollision`, then filter hits to `*Mob` through
`Shape().UserData`, dropping self by pointer identity.** This is not a
workaround — it is what makes the PO's two rejections (**no player↔player, no
player↔mob**) structural: a type check content cannot undo, instead of mask
arithmetic a future `collisionLayer` edit could accidentally re-enable.

**③ The steering change itself is small.** Reuse the existing `m.steerProbe`
(same radius, `m.Radius()+steeringLookahead`) with the mask swapped for the
second query, sum `circleRepulsion` over the surviving mobs, and scale by a new
`mobRepulsionWeight` **[PLACEHOLDER]** constant kept well below
`steeringRepulsionWeight = 1.5` (`steering.go:24`). Low weight is precisely what
keeps the head-on `steerSide` latch (`steering.go:46`) from firing against
*moving* blockers — it was tuned against stationary ones, and both the
2026-07-11 and 2026-07-20 in-game findings recorded there are jiggle-in-place
limit cycles.

**⚑ Landmine to pin with a test — the soft analogue of §34's welding.** §34
records that co-located equal-radius circles never separate under
`resolveCircleThomas`. The steering side is better but not immune:
`circleRepulsion` handles `d < 1e-4` by pushing along `m.heading`
(`steering.go:112`), so it is at least never a zero vector — but two
same-species mobs spawned on one point **with the same heading push identically
and stay welded**. Worth a direct test either way, since same-point spawns are
exactly what the wave/summon paths produce.

**Verification.** `go build`/`vet`, `go test ./...`, guardrails `-count=2`, and
specifically `steering_alloc_test.go` (the whole point of ①) plus the sim
battery — steering changes alter time-to-contact and therefore TTK. Then
in-game: pull a wolf pack and watch whether it spreads without any mob
jiggling in place at a prop notch.

**Does NOT close item 4 below.** Read that item's arithmetic first: ~19 wolves
fit inside a level-1 Damage aura even with *hard* collision fully enforced, so
no separation scheme creates focus fire. Different fix, different chunk.

> **✅ EXECUTED 2026-07-26 as chunk B**, PO-verified in-game the same day
> (`8b045395`, *"feels much better"*). Ledger:
> §Round-6 chunk B ledger above. Both prerequisites landed as specified; the
> one thing this plan got wrong is *which* welding case matters — it is the
> mob directly BEHIND another, not the co-located one, and the fix is a
> perpendicular fade in `blendSeparation`. Also newly on record: a **stopped**
> mob does not steer at all, so a settled pack keeps its arrival spacing.

### 4. Nearest-targeting auras have no target persistence (bug, surfaced by item 3)

Chasing item 3's focus-fire half turned up an independent defect.

**`selectTargets` (`sys/targeting.go:108`) has no target memory at all.** Every
tick it rebuilds the candidate list from the collider set and re-sorts from
scratch; `nearest` is a plain distance sort (`:151`). Nothing in the package
holds a previous target. So a `maxTargets: 1` aura re-picks its victim ~30×/s
and, in a jostling clump, **smears damage across the pack instead of killing
anything** — which is the felt complaint. Nuance: ties break on entity ID via
`sort.SliceStable`, so mobs at *exactly* equal distance do pick stably; it is
the *near*-equal case that flickers, which is the realistic one.

**⚑ Hard collision would not have fixed this.** Wolf body radius 0.3, Damage
aura radius 1.0, hit when the circles intersect ⇒ center within 1.3. Hard
collision only guarantees centers ≥ 0.6 apart, and points at 0.6 minimum spacing
pack into a 1.3 disk as 1 + 6 + 12 ≈ **19**. Nineteen wolves still fit inside a
level-1 Damage aura with collision fully enforced; LongRangeStrike at radius
2.6–3.0 is far worse. Collision stops mobs sharing a *point*; it does not thin
the clump inside an aura, so it cannot create focus fire. **This is a targeting
change either way** — which is why item 3's decision does not close it.

**Shape of the fix:** keep last tick's pick while it stays eligible and in
range. Small rule, but **new plumbing** — targeting is currently stateless per
tick, so it needs per-caster-per-effect memory. And it must be **per-selector**:
stickiness is right for `nearest` damage and *wrong* for `lowest_health` heals,
which must always chase the most wounded. **Not scheduled** — it is a Pass-1b
neighbour (it changes how every damage aura feels) but blocks nothing.

> **✅ RULED 2026-07-29: LEAVE IT AS IT IS.** PO: *"we will only tackle this if
> the unnecessary 30× checks per second becomes a performance issue. For now, it
> stays."* So the trigger to re-open is **cost**, not feel. ⚑ Recorded for
> whoever picks it up: the *behavioural* half above (a `maxTargets: 1` aura
> smearing damage across a clump instead of killing anything) is unchanged by
> this ruling and is the thing a playtester would actually report — if that
> complaint arrives, this entry is its cause, and the fix is per-selector
> stickiness rather than anything in the perf budget.

---

## Rolling-filler batch ledger

**Rolling filler — 4 of 6 items DONE (2026-07-26), committed `dab4dae0` —
✅ PO-VERIFIED IN-GAME 2026-07-26 (all 4 checklist items passed).** 6 files + 2 new. Picked up as
independent work while rounds 3 and 4 both sat PO-test-pending; deliberately
touches **no file either of those chunks touched**.

### Acceptance checklist (PO, in-game) — ✅ ALL PASSED 2026-07-26

1. `DAMAGE 25` takes a quarter of the health bar and leaves you alive
   (it used to kill outright at any argument).
2. Die, respawn — the minimap still shows what you explored, with **exactly
   one** player dot and none left at the death site.
3. `Ctrl+−` / `Ctrl++` no longer zoom the browser; **`Ctrl+0` still resets** it.
4. In an unlit dark area: damage numbers over mobs are gone, **your own numbers
   still show**.

### The four fixes

**① `DAMAGE <pct>` always killed** — `sys/cmd/cmd.go`. `SubFraction()` is a
fraction of `vitals.Max` (`^VitalSign(0)` = 2^32−1); player health has been
absolute HP since item 11, so `DAMAGE 1` subtracted ~43 million HP. Now
`h.Sub(uint32(float32(p.MaxHealth()) * dmgf))`, with `dmgf` **clamped at 1** —
without the clamp a large argument makes the float→`uint32` conversion
out-of-range, which Go leaves implementation-defined. TDD: 6 tests, **3 red on
behaviour**, 3 pinning behaviour that had to survive (100 % still empties the
pool, still stamps `Damaged`, still rejects bad arguments).

**② Floating numbers rendered in unlit darkness** — `_GameObject.ts`. One guard
at `showFloatingText`, the sole creator of every floating number (numbers, XP,
level-up, campfire-bound, activation rejections all route through it).

> **⚑ The load-bearing detail: it tests the ENTITY's position, not the label's.**
> The label spawns `this.size` px above the entity, and the local player always
> carries a light (`Player.MIN_SELF_LIGHT_PX = 40`) — so testing the label
> position would put the test right at the edge of that small self-light and
> make the player's **own** feedback flicker on geometry. Testing the entity
> position matches the `Mobs.updatePlate` precedent exactly and gives the
> defensible rule: **own numbers always render, numbers over unlit mobs don't.**
> This overturned the first cut of the fix, which suppressed the player's own
> numbers too.

**③ Minimap reset on death** — `BasicConfig.ts` + `Player.ts`. Not a logic bug:
`CLEAR_MINIMAP_ON_DEATH` is **Berryhunter inheritance**, where death ended the
character so forgetting the explored map was the point. In Aura you respawn as
the same character, so the map is knowledge the character keeps. Flipped to
`false`.

> **⚠ The flag flip alone would have shipped a new bug.** `miniMap.clear()` was
> the only thing that ever removed the **local player's own** icon — it is added
> in the `Player` constructor (not through the entity snapshot, so
> `EntityManager.newSnapshot`'s reconciliation never sees it) and nothing else
> takes it off. Without a fix, every death would leave a frozen dot at the death
> site and the respawn would add a second one. `Player.remove()` now removes its
> own icon. **Proven by negative control** (see Verified).
>
> Checked and fine: the flag also guards `EntityManager.clear()`. Not clearing
> it is safe — `newSnapshot` fully reconciles, dropping anything absent from the
> incoming snapshot. Skipping *only* the minimap clear would have been the
> wrong half: it would desync `registeredGameObjectIds` from the entity manager
> and freeze dynamic icons.

**④ Ctrl +/− zoomed the browser** — `KeyboardManager.ts`. The handler only
`preventDefault`s keycodes in the `captures` map, and +/− are never registered
(game zoom is HUD-button-only, `camera/Zoom.ts`). Matched on **`event.key`**,
not `keyCode`, so the main row and the numpad are both covered on any layout —
the US-layout zoom-in key reports `=` unshifted and `+` shifted.
**`Ctrl+0` is deliberately NOT matched:** it resets the zoom, and swallowing it
too would strand anyone who had already zoomed by wheel or browser menu, neither
of which a page can intercept. Browser zoom is only cancelable from `keydown`,
so this is a mitigation, not a lock.

### ⭐ Second use of the vitest infra (added by the round-4 chunk)

`KeyboardManager.test.ts`, 9 tests — the first test file outside
`SkillTooltip.ts`, and it confirms the jsdom choice generalizes: dispatching a
real `KeyboardEvent` on `window` and asserting `defaultPrevented` is the honest
assertion available (jsdom has no zoom to observe, and preventing the default
*is* the fix). Verified genuinely red — stubbing `isBrowserZoomShortcut` to
`false` fails exactly the 6 suppression cases and leaves the 3 must-not-suppress
cases green.

### Verified

- `go build` / `go vet` clean; `go test ./...` **exit 0, 27 pkgs**; guardrail
  replay clean at `-count=2`.
- `npm test` **15/15** (9 new), `npm run typecheck` clean, `npm run build` clean.
- Boot `-content ../api`: **0 errors, 0 panics** — 83 skills/14 factions/50
  mobs/10 recipes/5 prop defs/1 milestone/777 props/471 spawns/5 campfires/14
  npcs.
- Headless in-game via the new **`.claude/skills/verify/filler-batch.mjs`**
  (kept as a repeatable check): 3 consecutive clean runs of join → `DAMAGE
  10/50/100` → death → respawn.
- **⭐ Negative control on the minimap fix** — the assertion that matters is
  "exactly 1 player dot after respawn", so it was proven to actually fire:
  commenting out `miniMap.remove(this.character)` and rebuilding reports
  **2 dots** (`[15,16]`); restoring it reports 1. Note `dead: []` passes either
  way and is *not* discriminating — the stale icon only reappears on respawn.

### Harness notes (both pre-existing, cost two failed runs each)

- **The first console command after joining is dropped.** Observed as
  `DAMAGE 10` taking 0 HP while the identical later commands landed. The script
  now burns a `PING` warming the channel before anything is asserted on.
- **`WARP` is unusable for "move the player then screenshot".** It triggers the
  render-interpolation crawl (backlog §20), so the client's *rendered* position
  — which the minimap icon follows — lags many seconds; the probe read the old
  position and found no dot at all. The script **walks** (held `KeyD` for 9 s,
  ~1600 px) instead.
- **The `&develop` panel is drawn over the minimap corner** — an element
  screenshot of `#minimap > .wrapper` is a screenshot of the dev panel until it
  is hidden with an injected style.
- **Counting minimap icons needs pixels, not the scene graph.** The minimap is
  its own PixiJS `Application` with no global handle and no back-reference from
  its canvas, and `window.game` is a 4-key console facade. The script decodes
  the element screenshot **in-page** (Image → 2D canvas → `getImageData`) and
  flood-fills blobs of the `0x00008B` character icon colour; reading the WebGL
  canvas directly is unreliable without `preserveDrawingBuffer`.

### Noted, not fixed

The `DAMAGE` cheat stamps `StatusEffectDamaged` but never touches the
`damageTaken` tick accumulator, so it produces **no floating damage number** —
unlike real damage. Dev tooling only; out of scope for a batch that was meant to
stay small.

---

## Pass 1 — the numbers rewrite

**Both systemic changes together, then a single retune on top.** They each
rewrite every number across the skill catalog; splitting them means retuning
the whole catalog twice and invalidating a playtest twice. Bigger chunk, less
total work, one settling point.

### 1a — systems

1. **Escalating point curve + raised `maxLevel`s** (decision 1). Point-cost
   math is no longer flat-1-per-level; `component.go` derives spent points from
   levels (deliberately, so free respec can't drift) — that derivation is the
   single place the curve lands.
2. **Resource costs** (decision 2): `selfDamageHP` on damage auras (per tick)
   and a cast cost on cooldowns. **Design intent settled 2026-07-26** — GDD §3
   Consumption (the *"possibility of actions" + "time left to die"* ruling) and
   §Intake round 6 item 1, which also carries the four heal-implementation rules
   that must survive generalization and the balancing-vector table to price
   against. ⚑ **The free baseline is load-bearing**: the base damage aura stays
   free at any resource level, so no cost curve can ever leave a player with no
   action. ⚑ **Sequencing deviation on record** — the PO proposal is costs
   first, feel it, retune later; 1b will then re-touch every number authored
   here.
3. **Cost-reduction passive** (round 6, 2026-07-26) — e.g. a "Healer" passive
   reducing heal costs by X %. **Engine-new**: the sixth `validStat` and the
   first that modifies an *input* rather than an output. Rides item 2, so it
   lands with it or not at all.

> **⚑ Ordering ruling 2026-07-26 (PO): the whole of Pass 1a.2 runs AFTER the
> step-8 entity design session, not before it.** Item 3 would add the **sixth**
> `validStat` (`skills/definition.go:170` holds exactly five today), and per
> backlog §31 gap 1 **three of those five — `maxHealth`, `damageReduction`,
> `movementSpeed` — are applied only in player code paths**, so a mob equipping
> them silently gets nothing. Authoring a sixth while *"do mob passives scale
> like player ones?"* is unresolved bakes the same trap into one more stat, and
> this is the first one that modifies an **input**, where the mob-side answer
> matters more rather than less. Gap 1's ruling is therefore an input to this
> pass. This supersedes nothing about the costs-first-then-retune preference
> recorded above — that ordering is 1a.2-vs-1b and still stands.

### 1b — retune on top

4. **Prune the vocabulary to Damage / LongRangeStrike / Reaper / Vanguard +
   combinations** — delete **Wild**. PO framing: *"we had these to proof
   concepts, not to be final, so it's fine."*
5. **Reaper** — lifesteal and radius are the two culprits. ⚑ Round 6: price
   costs **against sustain** — lifesteal partly refunds Reaper's cost while
   LongRangeStrike's is unrefunded, so a flat cost pass *widens* that gap.
6. **LongRangeStrike** — reach becomes affordable rather than free, now that
   it can pay in resource.
7. **Recover** — fractional scaling, or re-role as upkeep for expensive auras
   (decision 2 gives it a job it doesn't have today).
8. **Swift** — ruling open (decision 7); the empty-movement-slot finding above
   is the input.

Authoring rules still apply: tier + baseline for any touched mob, band-check
guardrails, sim battery after the pass.

→ **playtest**

## Pass 2 — new skill expression

Moved *up* the list deliberately: under "make it fun first", these add new
things to **do**, where Pass 1 makes existing things fair.

1. **Pulsing auras** (decision 3) — authorable per-effect oscillation
   (`pulseAmplitude` / `pulsePeriodTicks` shape). Hit resolution becomes
   time-varying; the ring render must track it exactly.
2. **Forward/directional ability** — *"an ability that you can send just
   straight forward."* **The heaviest single item in this document**: the first
   non-radial geometry in the engine (new targeting shape, facing on the wire,
   new render). Worth knowing before committing to the pass.
3. **Patrolling wide-aura mobs** to discourage AFK. Check first whether the
   mob-depth patrol behaviour (`archive/plan-mob-depth.md`, chunk 5) already
   covers waypoints — this may be mostly content.
4. **Pulse-damage passive** (round-3 idea, PO 2026-07-25) — *"a passive that
   ticks damage periodically while an aura is active, i.e. a damage pulse every
   5 s while any aura is active, even if that aura is not damaging."* Should be
   authored as **one shape with item 1** — same oscillation vocabulary, same
   "read the beat" skill expression, and the ring render has to track both.
   - **Why it earns its slot:** it is a **damage floor for support builds**, so
     a player who takes the Lantern is not contributing zero — a softer answer
     to the same problem a universal auto-attack would solve, *without* costing
     the "choosing the Lantern costs you all your damage" trade-off that the
     zone-1→2 tunnel tutorial is built on (decision 2 above rejected the
     auto-attack route for mobs; this is the player-side counterpart).
   - **⚑ Engine-new:** it is the **first passive that emits an effect** rather
     than modifying a stat — all five `validStats` today are multipliers.
     Nearest existing machinery is `EffectDef.TickInterval` plus the aura apply
     loop; it needs a passive that emits into the active aura's collider. Scope
     this before committing to the pass.

→ **playtest**

## Pass 3 — credit & combos

Both reward the co-op fantasy, and neither is *felt* solo — so this pass wants
a multiplayer playtest, not a solo one.

1. **XP credit for any aura that affected the fight** (decision 4).
2. **CallForAid combo recipes** (decision 5) — heal minions / damage minions.
   Warbanner itself unchanged.

## Rolling filler — blocks nothing, do any time

> **4 of 6 ✅ DONE 2026-07-26** in one batch, committed `dab4dae0` —
> ✅ **PO-VERIFIED IN-GAME 2026-07-26**. Full ledger: §Rolling-filler batch
> ledger below.

- ~~**Minimap resets on death.** Bug.~~ ✅ 2026-07-26
- ~~**Damage numbers render in darkness.**~~ ✅ 2026-07-26 — suppressed like mob
  nameplates already are; the `DarknessOverlay.isHidden()` precedent from
  playtest-1 Pass C item 3 explicitly flagged floating damage numbers as
  *"the one most likely to be noticed next"*. It was.
- ~~**Ctrl +/− still zooms the browser.**~~ ✅ 2026-07-26
- **Totem/companion tooltips don't describe the summon's effects** — the
  tooltip reads the caster's `spawn` effect, not the summoned mob's loadout.
  Needs the tooltip to follow the spawn into the mob's own skills.
  **Deliberately left out of the 2026-07-26 batch:** it lives in
  `SkillTooltip.ts`, which the round-4 chunk had already changed and which was
  ⏳ PO-test-pending at the time — stacking a second unverified change into that
  file would have muddied the round-4 test pass. Pick it up after round 4 clears.
- **Haste's name promises movement, delivers cadence** (see §Findings).
- ~~**A shield aura draws no tick indicator** (round 5, 2026-07-26).~~
  ✅ 2026-07-26 — `shield_aura` was missing from the `HasVisibleTickCadence`
  whitelist; everything below it already worked. §Round-5 chunk ledger.
- ~~**The `DAMAGE <pct>` dev cheat always kills** (round 3, 2026-07-25).~~
  ✅ 2026-07-26 — `cmd.go`'s `DAMAGE` called `VitalSign.SubFraction`, a fraction
  of `vitals.Max` (`^VitalSign(0)`, the *type* max), but player health has been
  **absolute HP** since item 11 (`player.go:68`), so every argument removed far
  more than the whole pool.

## Own planning session

- **Environmental hints + one overarching thread.** PO: *"more environmental
  hints and lore to explain where things are that players might want to chase
  — if they want the fire mage way, give them at all times sensible hints where
  to go next, WHILE also having one overarching story that leads players
  through all zones. As minimal as possible."* This is not one task, it is a
  content system: a per-zone authoring contract ("at all times a sensible next
  hint") plus a delivery mechanism. Existing delivery surfaces: the
  announcement system, NPC bubbles. **Quest log / journal only when needed** —
  but note playtest 1 raised the same wish three times, so "soon" is likely.
  Split as (1) decide hint delivery, (2) author the thread.

## Dropped

- **Campfire-only ability swapping** (decision 6).

---

## Open questions

> **⭐ Sweep 2026-07-29 — questions 1, 2, 3, 4, 6, 7 and 9 are all RULED**
> (PO, via choice prompts, in a session that went through every open question in
> the live docs at once). The rulings are inline below. **Passes 1a, 1b item 3
> and Pass 3 item 1 are unblocked.**

1. ~~**What the raised caps actually are.**~~ **✅ RULED 2026-07-29: UNEVEN,
   PER-SKILL** — and with a caveat that is bigger than the answer. PO: *"we will
   have to rework the skill level system to a degree. It will be uneven and
   per-skill, but might also get the 'augmentation' concept where auras can be
   augmented with extra effects — i.e. a damage aura gains either the slow or the
   heal effect at level 10, per player choice. For now, we assume that skill
   levels will be uneven."* ⚑ **So Pass 1a authors per-skill ceilings, but should
   not treat them as final**: the skill-progression rework (`backlog.md` §37,
   now cross-linked to this ruling) may move where a cap sits and what happens
   when you reach it. Rederive `damageHPPerLevel` against the authored ceiling
   per skill; expect to do it again if §37 is picked up.
2. ~~**What refills the freed drop slots.**~~ **✅ RULED 2026-07-29: leave them
   empty — but Wolf still drops Swift.** No new content is authored to backfill
   EliteWolf's stripped kill-drop; not every mob needs to teach something,
   especially now that the NPC teachers cover early unlock density
   (`3b1b3ef6`). ⚑ **The one thing that must survive the prune: Wolf keeps its
   "first drop" moment, now dropping Swift *as a cooldown*** (question 4) rather
   than as the passive it teaches today.
3. ~~**What "affected the fight" means for passive-ish effects.**~~ **✅ RULED
   2026-07-29: PRESENCE COUNTS.** Having the relevant aura active during the
   fight is enough — no measurable proc required. A resist aura that never
   resisted anything and a light that lit nobody both earn credit. Rationale: it
   is the only rule that cannot deny a support player XP by luck, it is
   impossible to grief, and it is the simplest thing to implement. Pass 3 item 1
   is unblocked.
4. ~~**Swift's fate** (decision 7).~~ **✅ RULED 2026-07-29: RE-ROLE AS A
   COOLDOWN.** Not deleted, not kept as a weakened passive — Swift becomes a
   burst movement cooldown, which is the direct answer to the §Findings
   "movement slot is empty" observation and gives the slot a real occupant.
   Pass 1b item 3 and question 2 both hang off this.
5. All new numbers are **[PLACEHOLDER]** until felt in-game: the cost curve
   steps, every `selfDamageHP` value, every retuned radius/dps, pulse
   amplitude and period.
   - **Damage types & resistances ✅ RULED 2026-07-29: author them WITH the Pass
     1 retune** (inherited from `content-zone1.md`'s content-pass list, now
     closed). The tag-resist mechanic is built but unused — **no skill authors a
     `damageType` at all**, and only 4 mobs author `resistances` (mostly
     structure wildcards), so every hit in the game is physical. PO reasoning:
     they are a build-identity lever, so they belong in the pass that rewrites
     every damage number anyway, not in a separate content chunk.

**Round 3 (2026-07-25):**

6. ~~**A shield is preventive, but the mode rule fires reactively.**~~ **✅ RULED
   2026-07-29: TRIGGER ON ALLY-IN-COMBAT.** Round-3 decision 5 triggers on *"an
   ally is below `supportThreshold`"* and picks the most-wounded ally (the
   existing `findWoundedAlly` pick), so a guardian shields the wolf that is
   nearly dead rather than the one about to get hit. The PO took the preventive
   reading: shield-carrying mobs enter support mode when an ally **enters
   combat**, not when one is wounded — a shield exists to be up *before* the
   hit. ⚑ Scope note: this is a trigger swap inside one rule, but it **splits
   the support mode's entry condition by carried aura category** (heal keeps the
   wounded trigger, shield gets the combat trigger), so the role-as-loadout
   derivation now feeds two different entry rules rather than one. Unscheduled;
   fold into whichever pass next touches `support.go`.
7. ~~**What the mode-thrash hysteresis window actually is.**~~ **✅ RULED
   2026-07-29: DO NOTHING UNTIL IT IS SEEN.** No hold time, no tick-boundary
   switching — nothing has reported mode flicker in any playtest or harness run,
   and a window tuned against a hypothetical is a number nobody chose. Re-opens
   the first time a mob is observed thrashing. ⚑ Note that ruling 6 above adds a
   second entry condition to the support mode, which is exactly the kind of
   change that could produce the flicker this question was reserved for — watch
   for it when 6 lands.
8. **Does the pacifist healer's threat table have any consumer?** Decision 4
   says it tracks threat but ignores the attacker. Taunt already reads it
   (`ForceThreatToTop`); nothing else does. If nothing consumes it, the ruling is
   still right for uniformity — but say so explicitly rather than by accident.

**Round 4 (2026-07-25):**

9. ~~**Do the `of max HP` tooltip lines also want an absolute number?**~~ **✅
   RULED 2026-07-29: NO — the percentage stays, alone.** It is the honest
   description of the mechanic (the heal genuinely *is* a fraction of the pool),
   and the divergence between authored and experienced numbers is accepted on
   this one line. Nothing to build. Original write-up kept below for the
   reasoning. The round-4
   ruling is "show what the player actually will see", and `FirstAid` reads
   `Heal self: 20 % → 25 % of max HP` — correct, curve-free, and *not* what the
   player watches land (≈535 HP at level 30). Adding the absolute alongside the
   percentage is cheap: `max_health` is already client-side for the health bar
   (`Player.ts:69`), needing only the same one-line mirror that
   `setLocalPlayerLevel` got. **Blocks nothing** — additive, decidable once the
   round-4 chunk is felt. It is the *only* line where authored and experienced
   numbers still diverge after that chunk lands.

**Round 5 (2026-07-26) — pacifist flee: ✅ ALL FOUR DECIDED, chunk unblocked.**
Recorded in full at §Intake round 5 item 2. Every one landed on the minimal option,
so the chunk is the four-piece shape already described in §Intake round 5 item 2
with **no additions**: no new knob, no new pathing, no new tuning value.

Question 8 above is now answered as a side effect: the chosen flee direction
(`highestThreatTarget`) gives the pacifist threat table its **second** consumer
after Taunt, so the round-3 "track threat but ignore the attacker" ruling is no
longer tracking-for-nothing.

---

## Test strategy

- **Pass 1** — simharness first, not eyeballs. TTK/TTD/kills-per-hour
  batteries after the retune; guardrail asserts stay green; the level-curve
  battery re-run against the new point curve. The named risk (cooldowns
  unusable at low health) only shows up in the batteries. Then an in-game feel
  pass.
- **Pass 2** — pulsing auras need a render-vs-hit-radius verification, not a
  screenshot: the ring must match the actual radius at every phase, or the
  feature lies. The directional ability needs its own geometry tests.
- **Pass 3** — needs a two-client smoke; the XP rule is a Go test (TDD:
  failing test first, per the participant-map precedent).
- **Rolling filler** — Playwright smoke per item; the darkness one has a scene
  graph walk precedent from playtest-1 Pass C item 3 (verify the `visible` flag
  against circle geometry, do not eyeball screenshots).

---

## Ledgers

*(none yet — one section per executed pass, newest last)*
