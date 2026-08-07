# Plan: Playtest Feedback (rolling collection)

**Status:** **Collection doc.** Latest: **chunk P — presence-counts XP
attribution (Pass 3 item 1) — ✅ DONE 2026-07-30** `d45ba07c` (§Chunk P
ledger at the end; plan at §Chunk P plan, 3 PO rulings P1–P3, 5 landmines).
It is quest prerequisite **chunk P** (`plan-quests.md` D15); quest C1 is
unblocked. Shipped earlier
from this doc, all ✅ PO-verified in-game: **Swift → movement cooldown**
`a29fe986` 2026-07-29 · **round-6 chunks A + B** (WebGL-loss banner
`6c8bde2e` · mob soft separation `8b045395`) 2026-07-26 · **rounds 3/4/5 +
the filler batch** (`03b152f4` · `eaae2e69` · `dab4dae0` · `f06b2161`)
2026-07-25/26 — ledgers in the § sections below. The 2026-07-29
open-questions sweep ruled questions 1–4, 6, 7 and 9 (inline at §Open
questions). This is the **standing home for issues arising from playtests**:
new rounds append to §Intake, items get sorted into the passes below, and we
pick targets from here. Successor to `archive/plan-playtest1-feedback.md`
(first external playtest, fully executed 2026-07-22 + `2bfee286`).

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

> **⭐ PLANNED IN FULL AND THEN BUILT 2026-07-31 → `docs/plan-numbers-rewrite.md`**
> (16 PO rulings D1–D16, **16** landmines, two chunks — **C1 + C2 both ✅,
> uncommitted, awaiting the PO feel pass**). **That doc is now the
> implementation record; this section stays the origin** — round-2 decisions 1
> and 2, the round-6 resource ruling at §Intake round 6 item 1, and the
> 2026-07-29 sweep are what it was planned from. ⚑ **The bundling described
> immediately below is SUPERSEDED by D1**: the split is engine-first
> (byte-identical) then one numbers chunk, which retunes once *and* keeps an
> acceptance test. ⚑ Two claims in this document were corrected against HEAD
> while planning: **8 player skills already author `damageTags`** (the sweep's
> "no skill authors a damageType at all" is wrong — the real gap is that
> resistances are only ever key-gates), and **Recover was never made
> fractional** (§Findings is accurate; `HotParams` has no fraction field at
> all, so it is engine work).

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
8. ~~**Swift** — ruling open (decision 7).~~ **✅ RULED AND SHIPPED 2026-07-29,
   `a29fe986`** — re-roled from a passive into a `speed_burst` movement
   cooldown, ahead of the rest of the pass because it adds something to *do*
   rather than retunes a number. Its values (1.5× for 150 t, CD 600) are
   [PLACEHOLDER] like the rest and are still this pass's to settle. Ledger at
   §Ledgers.

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
   **Sequenced 2026-07-30 (PO, during the quest-plan code review): this item
   ships BEFORE quest chunk C1** (`plan-quests.md` D15) — quest kill counters
   hook the same credit event (`rewardPlayer`) and must launch on the final
   attribution rule, not the interim damage-touch one.
   **⭐ PLANNED IN FULL 2026-07-30 → §Chunk P plan below** (P1–P3 PO-ruled:
   fixed conf radius · joins-never-starts gate · one participant class).
   **✅ EXECUTED 2026-07-30** `d45ba07c` — full ledger at §Chunk P ledger.
2. **CallForAid combo recipes** (decision 5) — heal minions / damage minions.
   Warbanner itself unchanged.

## Chunk P plan — presence-counts attribution (Pass 3 item 1)

> **✅ EXECUTED 2026-07-30** `d45ba07c` — full ledger at §Chunk P ledger
> below. The plan held with no deviations; the PO in-game checklist below is
> still open (per the standing per-bug model, not blocking).
>
> **PLANNED 2026-07-30** (design session, no code). This is quest prerequisite
> **chunk P** (`plan-quests.md` D15): it ships **before quest C1** so quest
> counters launch on the final attribution rule. Ruling basis: decision 4
> ("any aura that affected the fight"), open question 3 (**presence counts**,
> 2026-07-29), and the three P-rulings below (PO choice prompts, 2026-07-30).

### The rule, in one sentence

A player whose active aura is on (`ActiveAuraSlot >= 0`), standing within
`game.combat.presenceRadius` of a mob that is `InCombat()` **and already has
≥1 participant**, becomes a participant — same `participants` map, same
`tryGrantKillRewards` fan-out, same everything. Damage-touch entry
(`PlayerTouches` → `noteParticipant`), the `RecentHealers()` 10 s window, the
charm/summon `CreditTo()` routing, and clear-on-full-regen are all unchanged;
presence is a **third entry** into the existing set, not a new set.

### The three P-rulings (PO 2026-07-30)

| # | Ruling |
|---|--------|
| **P1** | **Range = one fixed conf radius**, `game.combat.presenceRadius`, flat for all mobs. **[PLACEHOLDER] 8 units** (viewport is 20×12, so ~8 reads as "clearly at the fight, on your screen"). Per the standing conf ruling, authoring `0` restores the default — it does not disable. |
| **P2** | **Presence joins a player fight, it never starts one.** The gate is ≥1 existing participant (player damage-touch, or player-credited via `CreditTo()`). Closes the AFK watch-farm at NPC-vs-NPC battles (ArmySoldiers grinding orc waves would otherwise be an infinite passive XP faucet); the gate resolves within a tick of the first player-credited hit, because the scan repeats every tick. |
| **P3** | **One participant class.** Presence-credited players go through the same `rewardPlayer` — XP **and** kill-unlock rolls (a bystander can win Wolf's Swift drop) — and quest counters (D4) will later count them identically. No second-class participant exists anywhere in the code. |

### Why the two "free" geometries were rejected (don't re-propose them)

- **The mob's own sensor** (`aggroAura.Collisions()`, zero new queries): a
  passive faction's sensor is **masked to see nothing** (`aggroSensorMask`),
  so a harvest-mob never senses the lantern-carrier standing beside the
  harvester in a dark tunnel — it fails the exact co-op scenario the presence
  ruling was made for. Sense radii are also per-species and small (~5.4).
- **The player's active-aura collider**: heal/light/resist aura masks pair
  with **allies**, not enemy mobs (`AuraMaskFor`), so "my aura's collision set
  contains the mob" is structurally false for exactly the support auras this
  rule exists to credit.

Hence: a dedicated probe query, player-side.

### Mechanism

1. **`Mob.NotePresence(p model.PlayerEntity)`** (new, `model/mob/mob.go`):
   gate `m.InCombat() && len(m.participants) > 0`, then `noteParticipant(p)`.
   Exposed through a small named interface in `model` (the `AttackNotifier` /
   `Credited` precedent — do **not** widen `model.MobEntity`; the four fakes
   stay untouched, that widening is quest C1's problem, L14).
2. **The scan** lives in `SkillSystem` (it owns "is an aura on"): once per
   tick per **player** entity that is alive with `ActiveAuraSlot >= 0`, probe
   `AppendCircleDynamics` at the player's position with `presenceRadius`,
   filter colliders whose `UserData` implements the interface, call
   `NotePresence`. Probe circle + dst slice are **system-owned and reused**
   (the chunk-B separation / `space_alloc_test.go` reusable-probe pattern —
   zero per-tick allocation). Distance math includes the mob's body radius
   (`presenceRadius + target.Radius()`, the `withinSensor` convention), so a
   large boss body doesn't shrink the effective ring.
3. **Conf**: `presenceRadius` joins `CombatConfig` (`cfg/gamecfg.go`) with a
   total Go default (**§35 C1 discipline** — the resolved-equality drift test
   makes "key in conf.default.json without a Go default" a red test) and a
   zero-normalizing accessor (the `CritFactor()` pattern). Both
   `conf.default.json` copies get the key (both stay FULL files); the three
   delta confs don't (absent = default is the live pattern).
4. **No wire change, no frontend change.** XP already flows; the client sees
   nothing new.

Scan cadence every tick is deliberate: participation latches (map persists
until full regen), so the P2 gate's one-tick lag after the first hit is the
only timing artifact, invisible at 30 tps.

### Landmines

- **L-P1 — stale-ref XP loss on death is an EXISTING defect this chunk must
  not accidentally half-fix.** `PlayerProgression` is a plain value struct;
  death/reconnect rebuilds the player struct and stashes a *copy*
  (`sys/state.go`), so `rewardPlayer` on a participant ref recorded before a
  death writes XP into the abandoned struct — silently lost. True for damage
  participants today; presence just widens how many refs sit in the map.
  **Out of scope here** — the fix vehicle is the quest-side stash join (L11)
  / step 8; record, don't touch.
- **L-P2 — sim battery: expect byte-identical, but verify the rosters.** The
  batteries are effectively single-player (H1a: no scenario even makes a mob
  approach), and a lone fighter is already a damage participant, so presence
  should change nothing. If any scenario diffs, first check whether it has a
  second non-fighting player — that would be a *legitimate semantic change*
  to document, not a regression.
- **L-P3 — more participants = more RNG draws.** `rewardPlayer` consumes one
  `m.rand` roll per declared unlock per participant, so a presence participant
  shifts the mob's drop-RNG stream. Harmless live (per-process salt), but a
  deterministic test asserting drop outcomes after adding a bystander will
  see different rolls.
- **L-P4 — the C6 kill broadcast names bystanders.** `KillCreditNames()`
  reads the same map, so presence participants appear in the server-wide kill
  line. Uniform per P3, deliberate; if a playtester reports "I got named for
  a kill I watched", this is why.
- **L-P5 — `experience: 0` mobs still latch participants** (28/64 defs).
  0 XP is granted but unlock rolls fire and (later) quest counters will
  increment — that is exactly L13's requirement, working as intended.

### Test strategy (TDD, per the quest plan's chunk-P row)

Model-level first (`model/mob/mob_test.go`, the `TestMob_Kill_*` family is
the precedent), failing tests before code:

1. Presence-noted player on an in-combat, already-touched mob earns **full XP**
   on the kill without ever touching it.
2. The P2 gate both ways: not-in-combat mob → no entry; in-combat mob with
   **zero** participants (the NPC-fight case) → no entry.
3. Dedupe: presence + damage + healer of a presence participant → one grant
   each (`rewarded` map), and a guaranteed unlock reaches the presence
   participant (P3, `GuaranteedUnlockGoesToAllRewardedPlayers` precedent).
4. Full regen clears presence participants like damage ones.

Sys-level (`sys/skills_behavior_test.go` style, real space + scan): fighter +
bystander at d < R with aura on → both earn; aura off → fighter only; d > R →
fighter only; and **the tunnel scenario pinned**: a passive-faction
harvest-mob (sensor sees nothing) still credits the bystander — the test that
outlives the P1 rationale.

Then: `go build ./...` + full suite, guardrails + alloc `-count=2` (the probe
must not show up), sim battery diffed against a pre-chunk worktree (L-P2),
boot `-content ../api` against the pinned counts (no content change — counts
identical), frontend untouched (vitest + typecheck run anyway, expect green).

**Two-client smoke** (the pass-level requirement): new verify-skill script
`chunkP-presence.mjs` — two Playwright pages on one server; A kills a Boar
while B stands adjacent, aura on, never touching → B's XP moves from 0; rerun
with B's aura off → B stays 0. Standing harness rules apply (lost WebGL
context = invalid run, not a failure; assert on the XP readout, not on
`Derived`).

### PO in-game checklist

- Fight something with a second character nearby holding a resist/light aura
  on: **both** level.
- Same, bystander's aura toggled off: only the fighter earns.
- Stand at the army-vs-orc skirmish doing nothing: **no** XP ticks.
- The kill broadcast names both characters (L-P4 — confirm it reads okay).

### Files touched (estimate: small, one session)

`cfg/gamecfg.go` · `cfg/conf.go` (if the JSON block needs the field) ·
`backend/conf.default.json` + embedded copy · `model/` (one small interface) ·
`model/mob/mob.go` (`NotePresence`) · `sys/skills.go` (the scan) · tests as
above · this doc's ledger on completion.

## Intake — round 7 (2026-07-30): the PO's walk of quest chunk C4

The first play of the shipped quest system. Verdict: *"this works very well and
can be read as quests and understood. No major bugs, but some issues and change
requests."* **13 items, all verified against the running game the same day and
planned in full → `plan-conversation-journal.md`** (chunks Q1–Q4, three PO
rulings R1–R3). Recorded here only as the intake; that doc is the plan.

The four that were worth the investigation, because the obvious reading was
wrong:

1. **"NPCs always say their too-low line"** — measured: clicking a locked row
   *replaces* the greeting with that option's `blockedLine`, and it is one line
   per **option**, so the Village Healer answers identically for FirstAid @2 and
   Revive @8. Ruled (R1, as amended): the mechanism is **deleted, not repaired** —
   a greyed row is inert, and the panel's text belongs to the node the player is
   standing on. The amendment brought a second requirement with it: an **Accept
   row must vanish once the quest is taken while its sibling questions stay**,
   which is the first thing the container genuinely could not express.
2. **"Can't talk in combat, reads like a bug"** — three gates, and the window is
   `combatRegenGraceTicks` = **3.33 s re-stamped by the player's own aura ticking
   on anything**, so a fighting player is un-talkable throughout. Being removed
   in Q1; it partly reverses `archive/plan-entity-model.md` R2 and D21.
3. **"The Shaman's teachings aren't gated behind a row — is that systemic?"** —
   **no, content**: one multi-grant option auto-expands per D17, the deliberate
   path for the six NPCs never re-authored into trees.
4. **"The lamp quest doesn't make sense"** — correct, and worse: there is no item
   system at all (§28), so "the lamp" is the **Lantern skill unlock**, still a
   5 % Kobold drop, and the traveller hands over a skill he does not have.
   Ruled (R3, as amended): **remove the Lantern drop from Kobold and
   KoboldRanged** and let the quest be its only source — *"the kobolds are
   unbearable, kill them and the lamp is yours"*. The aura the tunnel is designed
   around stops being a 5 % roll and becomes a guaranteed reward.

Also raised and answered: a `kill` objective counts exactly **one** MobID, so
`Wolf` does not include DireWolf/EliteWolf/AlphaWolf. Not changing it — but the
cheap version would be a species *list*, and the tempting shortcut is wrong
(`wildlife_predator` also contains Bear and DireBear).

## Intake — round 7 (2026-08-02): first round against the live N-session deploy

Twelve items in two same-day batches, raised right after the 2026-08-02 live
deploy (feel pass 2 + R-series + quests). Triaged same-day; investigation
findings recorded inline so nobody re-derives them. **Items 1/2/4/9/11 plus
the empty-destination prune shipped the same day — §Round-7 ledger below;
still open: 3 (totems, third raise), 5 (Strong visibility), 6 (dot-keying
design Q), 7 (blue cost numbers), 8 (respec), 10 (passive wording audit),
12 (turn-in duplication, decision pending).**

### 1. Quest text: say WHERE the City Guard and the Shaman stand — ✅ `3b415fa2` 2026-08-02

`wolves-on-the-road`'s carry stage says *"at the city gate"* / *"at his fire by
the road"* with no directions. PO wants compass directions. The map answers
(+x = east — the crier's own ambient line says "east, to the city"; north = −y,
anchored by the Wanderer's "tunnel up north" pointing at the kobold field):
from the west road both lie **east** — the Shaman (18, 6) east along the road,
the City Guard (62.4, 9.6) far east at the city gate.
⚑ `chunkC4-quests.mjs` asserts these journal strings **by name** (C3/C4/C7
legs) — the harness must be updated in the same edit or it goes red as a fake
regression (verify-skill rule 8).

### 2. Wanderer road advice: drop "stay put" — ✅ `3b415fa2` 2026-08-02

`wanderer.json` `roads` node line 2: *"The tunnel up north, if you've a light.
If you haven't, then nowhere — stay put a while."* PO wording: head up north;
east only with a strong group. Replaces the fatalistic line and folds the
east-warning (currently line 1's bandit note) into the strong-group framing.

### 3. Totem tooltips say nothing about what the totem does — WHERE IT LIVES

Already recorded: **§Rolling filler, "Totem/companion tooltips don't describe
the summon's effects"** (deferred 2026-07-26, re-raised by the PO 2026-07-30
with the Call-for-Aid triple-line, **re-raised again 2026-08-02 — third time**).
The data prerequisite recorded there still holds: the `/skills` catalog serves
only the caster's `spawn` effect, so describing the totem means following
`spawn.mobName` into a served loadout or serving a curated line. Third raise =
it should stop being filler and get scheduled.

### 4. OrcGrunt XP is still 5 — ✅ `3b415fa2` 2026-08-02 (experience 75)

`orc-grunt.json`: `curveLevel` 20, tier normal, `experience` **5** — the old
deliberately-starved wave-fodder value, from before the front paid like real
content (the elite Orc went 15 → 300 in the 2026-07-21 balancing pass; the
grunt was never revisited). PO 2026-08-02: the human NPCs are weak enough that
full XP is fair. Proposed value: **75** (elite ≈4× normal precedent → 300/4;
cross-check: Wolf CL2 pays 70). ⚑ One consideration for the PO before locking
it: grunts are **encounter wave-spawned** (`warlord.go`), so a generous value
turns the warlord's waves into a repeatable XP faucet — 75 keeps a wave worth
less than one elite Orc.

### 5. Does Strong work? (server: YES; UI: invisible) — ✅ BUILT 2026-08-02 (round-7 session 2)

`strong.json` → `stat_multiplier damageDealt` → `Derived.DamageDealtBonus` →
`outgoingDamageFactor` (`sys/skills.go:763-772`), applied at the damage
base-composition sites, direct hits and dots. **The passive works.** What the
PO saw is the UI gap: no tooltip or HUD surface folds the multiplier in, so
equipping it changes nothing on screen — the **same class as Discipline before
R1**, which needed `GameState.cost_factor` on the wire before the tooltip
could show it. Fix shape (small chunk, not a filler line): a `damage_factor`
sibling on `GameState`, tooltip damage lines multiply through it — the R1
pattern verbatim, including the harness leg (`r1-focus-cost.mjs` is the
worked example; the wiring is invisible to vitest by construction).

**Built exactly to that shape** (session 2, see §Round-7 session-2 ledger):
`GameState.damage_factor` (field default 1, appended), `DerivedStats.
DamageFactor()` as the ONE place the 1+bonus composition lives —
`casterDamageFactor` and the codec both read it, so the tooltip cannot drift
from what the server deals — and the tooltip multiplies its damage and dot
lines through it, never heals/shields/CC (pinned by vitest). Harness
`r7-strong.mjs`: baseline `Damage: 14` → `15` with Strong equipped.

### 6. Two players, same dot, same target — do both tick? — ✅ RULED + BUILT 2026-08-02 (round-7 session 2)

**No.** `Buffs.ApplyDot` (`skills/buffs.go:326`) keys streams by
(source `SkillID`, per-tick `HP`): two casters with the same skill at the same
level match one stream, and the second application is a REFRESH — duration
tops up and `p.dot = dot` hands the stream to the **latest caster** (credit,
cadence, and since N3 the live lifesteal read all follow). So one dot ticks,
last applier owns it, and under R2's work-done rule the second caster paid
nothing for the takeover. Different levels = different per-tick HP = separate
streams, both tick. **Design question for the PO:** is last-writer-wins
acceptable for group PvE, or should streams key per-caster (WoW-style — both
tick, credit stays split)? Per-caster keying is a one-line key change with a
real damage-throughput consequence (N dot players = N× dot damage on a boss).

**PO ruling (2026-08-02): per-caster streams.** `ApplyDot` now keys on
(caster, per-event HP) — two casters with the same skill at the same strength
each ignite their own stream, both tick, credit stays split, and under R2's
work-done rule the second caster pays their own entry rather than riding the
first ignition for free. ⚑ **The "one-line key change" claim was optimistic:**
the acting site (`DueBuffEvents`) had its own second collapse — per source
skill only the STRONGEST dot acted, across casters — so the suppression rule
had to become per-caster too (a high-level player's dot no longer silences a
low-level ally's; a caster's own weaker stream is still suppressed by their
stronger one). ⚑ No map in the acting path — the per-caster check is a nested
scan, because `DueBuffEvents` runs per entity per tick under the idle-loop
alloc pins. **HoTs deliberately stay last-writer-wins** (PO, same day): the
result matches **WoW Classic exactly** — dots per-caster on mobs, same-spell
HoTs exclusive on players (one Renew per target; per-caster HoTs are the
modern-retail design) — and Classic is the stated reference. The asymmetry is
a ruling, not an oversight.

### 7. Floating numbers: focus spent should be BLUE — ✅ BUILT 2026-08-02 (round-7 session 2)

Ask: focus spent blue, heal green, incoming damage red; later a damage-type
icon in front of incoming damage (fire → flame). Heal green and damage red
**already exist** (`_GameObject.ts` `FLOATING_NUMBER_COLORS`: damage `0xFF4D4D`,
crit, heal `0x4DFF88`, xp). The real gap: **paying a cost produces no floating
number at all** — `chargeCost` (`sys/skill_cost.go:127`) subtracts Health
directly and never touches the `damageTaken` accumulator, so costs are only
visible as the bar dropping. Fix shape: a `cost_paid` per-tick accumulator on
the player + a Character wire field (append-only, both binding sets), client
renders kind `'cost'` in blue. ⚑ Do NOT route costs through `damageTaken` —
that would make every aura pulse read as being attacked (and trip the crit
share and damage-interrupt logic at the same choke point). Damage-type icons:
**later** per the PO's own phrasing; parked with §39 (entity presentation
rework) where overlay/indicator art is pooled.

**Built exactly to that shape:** `NoteCostPaid` on the `costPayer` interface
(charged by `chargeCost` with the post-clamp amount — the number shown is what
actually left the pool), `Character.cost_paid` appended (per-tick accumulator,
reset with damage_taken), floating kind `'cost'` in `0x4D9EFF` with the `-`
sign, own player + other players. ⚑ The costPayer widening is the R3
silent-wiring landmine class, so `TestRealEntitiesAndTheCostPayerCapability`
now pins BOTH polarities on real types: `*player` must satisfy it (or every
cost is silently free) and `*Mob` must NOT (L5 — a paying caster mob
suicides). ⚑ Harness note (`r7-respec-cost.mjs` leg A): the health-bar text is
NOT a witness for a cost — paying does not enter combat, so ~1 %/s regen tops
the pool back up before an after-read; the blue number itself is the evidence.

### 8. Spellbook: a reset-all (respec) button — ✅ RULED + BUILT 2026-08-02 (round-7 session 2)

Refund every spent skill point in one click. Engine-real: a new
`ClientMessageBody` message (pinned union, append-only), a server-side refund
op (walk the spellbook, reset levels, recredit points — through the existing
point-accounting so the D10 curve refunds exactly what was paid), and the
button + confirm in the spellbook. Open PO calls before building: ① free or
priced? (GDD lists respec cost as a placeholder concept) ② allowed mid-combat?
(the equip lock precedent says no) ③ do milestone-seeded skills (Damage@L1)
reset to level 1 or keep their floor? Not a filler item — schedule as a small
chunk once ruled.

**The three rulings (PO 2026-08-02): ① FREE ② BLOCKED IN COMBAT ③ level 1 is
the floor** — every discovered skill returns to its discovery level, so the
milestone-seeded free baseline survives a respec by construction. **Built:**
`ClientMessageBody.Respec = 10` (pinned, empty table — the Respawn precedent),
`SkillComponent.ResetSkillLevels()` (walks the spellbook through the existing
`setSkillLevel`, so equipped instances and derived stats follow), the
`EquipSystem` handler gated on `InCombat()` like equip, and a quiet "Reset"
button in the spellbook title with a two-press arm ("Confirm?", 4 s window) —
a native `confirm()` would freeze the render loop. ⭐ **The refund needed ZERO
point arithmetic**: `SpentPoints` is derived from the spellbook ("deriving
makes free respec drift-proof" — the comment predates the feature), so
resetting levels IS the refund. Harness `r7-respec-cost.mjs` leg B: Swift
3 → 1, badge 27 → 29 points.

### 9. Pending spellbook selection: an illegal key should clear it — ✅ `fd6fe48e` 2026-08-02

Raised 2026-08-02, second batch. With a skill selected in the spellbook
(pending equip), pressing any key that is not a legal bind for that thing
should reset the selection — except WASD, which keeps moving. Today the
selection survives every keypress; only clicking elsewhere clears it
(`clearEquipSelection`, `HUD.ts`). Legal keys per pending category: aura →
slot keys 1–3, cooldown → Q/R/F, passive → none (click-only), so for a
pending passive any non-movement key clears. ⚑ Implementation trap: slot
hotkeys are rAF-sampled by `Controls`, while a raw `keydown` listener fires
immediately — so the handler must WHITELIST the legal keys rather than
clear-on-anything, or pressing "1" to bind a pending aura would clear the
selection before Controls ever samples the key.

### 10. Passive tooltip wording audit — ✅ DONE 2026-08-02 (round-7 session 2)

Raised 2026-08-02, second batch, "things like Tough". Passives author no prose;
every tooltip line is generated (`SkillTooltip.ts` `stat_multiplier` case:
`STAT_LABELS[stat] + ': +X%'` — Tough renders "Damage reduction: +10%"). The
audit is per-stat: verify each label + the flat `+pct` phrasing against the
server's actual composition (`component.go` recomputeDerived + the apply
sites), for all five `validStat`s and the passive-adjacent lines (Hardy's
"Max Focus", Discipline's cost line). Small sitting, not a one-liner — each
stat needs its formula read before its wording is judged. Fold in item 5's
finding (Strong works but is invisible) — same surface.

**Audit result: every VALUE was correct; one real bug and one ruling.**
⚑ The bug: `costReduction` had no `STAT_LABELS` entry, so Discipline's stat
line rendered its raw JSON key on screen (`costReduction: +6%`) — the
fallback `STAT_LABELS[name] ?? name` fails silently by design. A vitest now
walks every stat `recomputeDerived` dispatches, so the next passive cannot
ship with its internal name showing. **The ruling (PO 2026-08-02): one
reduction vocabulary** — the two subtractive stats phrase as what the player
pays/takes with the resist lines' −X% shape: Tough `Damage taken: −10%`,
Discipline `All costs: −6%`; the four bonus stats keep their `+`. Verified
per formula: maxHealth ×(1+b) on the pool ✓ · damageReduction incoming ×(1−b)
✓ · critChance additive percentage points ✓ · damageDealt ×(1+b) direct+dots
✓ · costReduction cost ×(1−b) ✓ · resist passives multiply per tag ✓.

### 11. Warlord cleave: one slow beat, duckable — ✅ `3b415fa2` 2026-08-02 (beat 90, PO duck-feel check owed)

Raised 2026-08-02, second batch. PO: the boss aura should tick MUCH slower
with all effects on the same beat, so ducking in and out of range is real
play. Today `WarlordCleave` is two cadences — `damage_aura` 20 HP every 35
ticks (3 targets) + a bleed `dot_aura` applied every 50 ticks — so there is
no gap to duck through. Fix shape = R3's one-beat rule applied to the boss:
both effects `tickInterval` 90 (3 s; Frenzy's tick_rate 0.5 halves it to
1.5 s during windows, preserving the burn-through design), magnitudes scaled
throughput-neutral — cleave 20 → 50 (0.571 → 0.556 HP/tick), bleed per-tick
6 → 11 (application-rate compensation). All values [PLACEHOLDER]; the duck
window is a feel call for the PO by eye.

### 12. Journal turn-in stages say the same thing twice — ✅ RULED + FIXED 2026-08-02 (round-7 session 2)

Raised 2026-08-02 (the Turnip Chore screenshot). Not a code bug: the panel
renders each stage's authored `journal` prose (italic, accumulating) plus the
current stage's tracker line (bold). The `ac0f8a11` plain-text pass rewrote
turn-in journal prose into exactly the instruction the tracker already
carried, so every turn-in stage now duplicates ("Return to the Farmer." /
"Return to the Farmer") — `village-welcome` and `turnip-chore` exact,
`the-lost-lamp` and `wolves-on-the-road` near. Two content-only ways out,
recommendation on record: **drop the `tracker` field on turn-in stages** (the
prose alone states the task) vs. re-differentiate the prose (fact + place vs.
terse instruction). Awaiting the PO's pick.

**PO pick (2026-08-02): re-differentiate the prose — AGAINST the
recommendation on record.** The tracker stays the terse instruction; the
journal prose now carries fact + place, still inside the "deliberately plain"
text rule: turnip-chore *"The turnips are gathered; the Farmer waits by his
field."* · village-welcome *"The Farmer and the Town Crier have been met; the
Hermit waits nearby."* · the-lost-lamp *"The kobolds are dealt with; the
Traveller waits at the tunnel mouth."* · wolves-on-the-road *"The wolves are
thinned; word should reach the City Guard at the city gate far to the east,
or the Shaman at his fire east along the road."* Content-only, 4 lines. ⚑ Safe
against the harnesses by construction: `chunkC4-quests`/`chunkC3-journal`
assert the TRACKER lines, which did not move (re-verified 37 + 1 SKIP).

### Round-7 ledger (what shipped 2026-08-02, same day as the intake)

- **The empty-destination prune ✅ `5f2925b9`** — the PO ruling that came out
  of item 12's conversation, wider than the question asked: *"you should not
  be able to see an option that leads to nothing but Back"* — teaching lists
  and quest entries alike; multi-quest NPCs will nest one deeper
  ("something to do" → selection → quest). Built as a derived rule in
  `present()` (`pruneEmptyDestinations`): a pure-navigation row is dropped
  when its target node authored options but currently presents none; runs to
  a fixed point so it cascades through pure selection nodes; lore leaves
  (nodes that never authored options) stay reachable; grant rows untouched
  (CanApply/spellbook own those). ⚑ Consequences accepted with the ruling:
  mid-quest the entry row disappears too (accept spent, turn-in not yet
  walkable — the journal carries the brief), and a locked teaching keeps its
  node reachable (D20's signpost). 3 red-first Go tests (quest lifecycle,
  all-teachings-known, the selection-node cascade). No content edits needed —
  no `quest_not_at_stage` condition vocabulary, deliberately.
- **Items 1/2/4 ✅ `3b415fa2`** (quest directions + crier brief · Wanderer
  advice · OrcGrunt 75) · **item 9 ✅ `fd6fe48e`** (selection-escape
  whitelist) · **item 11 ✅ `3b415fa2`** (Warlord one-beat 90).
- **Verified:** full Go suite + `vet` + `gofmt` · 130 vitest · `tsc` · prod
  build · `chunk3b-ii-conversation` **31/31** · `chunkC4-quests` **37 PASS +
  1 deliberate SKIP** (twice: after the prune, and again after the content
  edits — C7 read the new compass text back from the journal) · a 7-leg
  ad-hoc probe for item 9 (illegal key clears, WASD/Escape behave, long-hold
  "1" still binds — the whitelist race the item's ⚑ warns about, proven at
  the real surface). Boot `-content ../api` 0 errors 0 warnings.
- **Owed to the PO by eye:** the warlord duck-window feel (item 11), the
  grunt-XP faucet check at the warlord fight (item 4), and the prune walked
  through in-game (Farmer/Hermit/Crier/Traveller before and after their
  quests).

### Round-7 session-2 ledger (2026-08-02, the remaining six items in one session)

Every open round-7 item except totem tooltips (item 3 — the PO deliberately
left it queued; it needs catalog/data design). Rulings collected up front as
choice prompts, then built small → large. Details pinned inline in each item's
section above; this is the summary.

- **Item 12 ✅** — turn-in prose re-differentiated (PO pick: AGAINST the
  drop-the-tracker recommendation). 4 content lines, trackers untouched.
- **Item 6 ✅** — **per-caster dot streams** (PO ruling): `ApplyDot` keys on
  (caster, HP), and the `DueBuffEvents` strongest-dot suppression became
  per-caster too — the advertised "one-line key change" was really two sites.
  **HoTs stay last-writer-wins by ruling**: the result matches WoW Classic
  (per-caster dots on mobs, exclusive same-spell HoTs on players), which is
  the stated reference. No alloc added to the per-tick path (nested scan, not
  a map).
- **Item 5 ✅** — Strong visible: `GameState.damage_factor`, the R1
  `cost_factor` pattern verbatim; `DerivedStats.DamageFactor()` is the one
  composition site. New harness `r7-strong.mjs` (14 → 15).
- **Item 7 ✅** — blue cost numbers: `Character.cost_paid` +
  `costPayer.NoteCostPaid` + floating kind `'cost'` (0x4D9EFF, '-' sign).
  Capability guard pins *player pays / *Mob must not, both on real types.
- **Item 10 ✅** — wording audit: all values correct; Discipline's stat line
  was rendering its raw JSON key (`costReduction` missing from STAT_LABELS);
  PO ruled one −X% reduction vocabulary (Tough `Damage taken: −10%`,
  Discipline `All costs: −6%`), bonus stats keep `+`.
- **Item 8 ✅** — respec: FREE · blocked in combat · level-1 floor (3 PO
  rulings). `ClientMessageBody.Respec = 10`, `ResetSkillLevels()`, the
  EquipSystem handler, a two-press-arm Reset button in the spellbook title.
  The refund is zero arithmetic — `SpentPoints` is derived.
- **Verified:** full Go suite + vet + gofmt (both trees) · 133 vitest (+3) ·
  tsc · prod build · alloc pins `-count=2` + simharness guardrails ·
  boot `-content ../api` 0 errors 0 warnings (87 skills / 4 quests) ·
  harnesses one-at-a-time on fresh servers: `hygiene-wire-prune` (3 wire
  fields added) · `r7-strong` · `r1-focus-cost` 5/5 · `round4-tooltip` ·
  `chunkC4-quests` 37 + 1 SKIP · new `r7-respec-cost.mjs` (blue number seen
  in-scene; respec Swift 3 → 1, badge 27 → 29).
- ✅ **PO-VERIFIED IN-GAME 2026-08-02, all six items** — same day, committed
  `7c30b3e8`.
- **Follow-up from the verification pass (PO 2026-08-02): a new character
  spawns with Damage pre-equipped in aura slot 1 — equipped, deliberately NOT
  active** (the PO's pick: the first press of "1" turns it on). Built as a
  derived rule in `applyCreationMilestones`: a creation-seeded ACTIVE AURA
  fills the first free aura slot (passives stay spellbook-only); only
  genuinely new characters keep it, because respawn/reconnect overwrite the
  loadout right after `New` — the same property the silent-discovery rule
  already leans on. Pinned by `TestNew_CreationAuraIsPreEquippedButNotActive`;
  probed live (`slot0: "1Damage"`, no active slot). ✅ **PO-VERIFIED
  IN-GAME 2026-08-02**, committed `0e161de8`.

## Intake — round 8 (2026-08-02): against the accounts build

Three items, raised after the step-8a stack (accounts, persistence, the
campfire bind, the two-tab fix). Investigation findings recorded inline so
nobody re-derives them.

**Routing:** item 1 is *not* a fix, it is a **scope widening of the R4 design
session** — it is written up where R4 lives (`archive/plan-resource-costs-feedback.md`
§2.3 + §6 R4) and only summarised here. Items 2 and 3 are ordinary intake.

### 1. Recall must be free and baseline — and it is the same design as downtime → **R4**

> ✅ **DESIGNED 2026-08-03 → `docs/archive/plan-downtime.md`** (the R4 session ran;
> 9 PO rulings). Recall becomes a **baseline utility** — a dedicated HUD
> button outside the cooldown slots and the spellbook, free, **no cooldown**,
> the 10 s interruptible cast as the only brake; recovery is a charge-fed
> placeable **mini-campfire** refilled by dwelling at any real fire, charges
> purely per-session. Not built yet — chunks C1/C2 in the plan doc.

> *"recall should not have a cost and become a baseline ability. author that
> design together with the downtime recovery changes that still need a design.
> both should be designed together. both options should be available from the
> start. the out-of-combat regen might scale up in charges or otherwise with
> level."*

**Today** (`api/skills/recall.json`): `costFractionOfMax: 0.05`, `castTicks`
300 (10 s, interrupted by damage), `cooldownTicks` 9000 (5 min), `maxLevel` 1,
destination = the bound campfire anchor. It is **taught**, by the Town Crier
and the Wanderer — so it is not baseline, and a new character does not have it.

⭐ **Why this is one design item and not two.** Recall and the downtime loop are
the same mechanic seen from the two ends: *get back to safety* and *recover once
you are there*. §2.3's campfire-charges sketch already makes the campfire the
recovery anchor, and Recall is the transport to it; pricing one without the
other prices half a loop. The PO's *"both options should be available from the
start"* is the constraint that binds them — a level-1 character must hold both
the way out and the way back to fighting shape, which is the same argument
GDD §3 makes for the permanently free damage aura.

⇒ **R4 is widened, not joined by a second session.** Everything from this
paragraph — free Recall, baseline availability, both-from-the-start, and the
*"out-of-combat regen might scale up in charges or otherwise with level"* hint
— lands in `archive/plan-resource-costs-feedback.md` §6 R4, which now carries the open
questions R4 must rule on (what "baseline" means mechanically, what happens to
the two NPC teachers, whether the 10 s cast and 5 min cooldown survive a free
Recall, and whether the level scaling is charge count / charge strength /
regen rate).

### 2. Quest-related extra info stays readable after the quest is done

> *"extra info related to tasks can still be read even after the quest is done.
> that's probably something to fix in the dialogue tree. example: lampless
> traveller, you can still ask where the kobolds are after completing the
> quest"*

**The PO's instinct is right — it is content, not engine** — but the reachable
window is narrower and stranger than it looks, and there is a vocabulary gap
underneath it. Both halves, traced against HEAD:

**① The window is the turn-in itself.** `lampless-traveller.json` authors
`root_lit` first, gated `quest_at_stage / the-lost-lamp / completed`, and
`present()`'s entry node is *the first visible node* — so a **fresh** talk after
completion correctly opens on *"You have the lamp now."* with no rows. But the
turn-in row lives on node `lamp` and carries no `next`, so it **stays put**
(`ConversationModel.update()` only re-enters at `entryNode` when the actor
changes or the current node disappears — `ConversationModel.ts:115-134`). Node
`lamp` never disappears (it is unconditional), so the moment the player turns
the quest in they are still standing on it, both quest rows correctly gone
(`CanApply`), and **"Where do they nest?" still there**. That is the observed
report, verbatim.

**② The rows have no visibility rule, and the vocabulary cannot express one.**
Quest *grant* rows are hidden by `CanApply` (Q1 §4.1 ②) — pure-navigation info
rows have no equivalent. The natural gate is *"while this quest is running"*,
and `quest_at_stage` cannot say it: conditions are **AND**-ed
(`sys/interaction.go:729`), the only sentinels are `not_started` and `completed`
(`items/mobs/interaction.go:196`), and there is no negation — so covering a
two-running-stage quest today means duplicating the node once per stage
(`cull`, `bring_it_back`).

⇒ **Recommended shape: a third sentinel, `running`**, answered by
`Ledger.MatchesStage` (`quests/ledger.go:171`) as `ok && p.Running` — one arm on
an existing switch, one loader-side name, no new condition kind. Then gate
`lamp_where` on it and **the existing prune does the rest**: with its last row
gone, `lamp` presents nothing, and `pruneEmptyDestinations`
(`sys/interaction.go:447`) walks the *"Do you have a task for me?"* row off
`root` too — the PO's own 2026-08-02 *"no option that leads to nothing but
Back"* rule, cascading for free.

⚑ **Audit the whole cast, not just the traveller** — every quest NPC has the
same shape and none gates its info rows: Town Crier `news_who`, City Guard
`front`, Front Captain `commander`, Emberkeeper's three `dir_*` nodes, Wanderer
`roads`, Miner `tunnel`. ⚑ **Not all of them should be gated**: the PO's
complaint is scoped to *"extra info related to tasks"*. Pure lore that happens
to sit next to a quest (the Emberkeeper's directions, the Wanderer's road
advice) is content the player may want to re-read forever. The authoring rule
to write down is *a row that answers a question only a running quest asks*.

### 3. Auto-walk, and stop moving when the window loses focus

> *"auto walk feature but no longer walking in a direction continuously when
> tabbing out, just stop the movement when focus ends unless auto walk is
> enabled"*

> **✅ THE BUG HALF SHIPPED 2026-08-03** — the focus-loss key sweep, exactly
> the shape below (sweep the keys, never the vector; plus a queue drop and a
> latent `ResetKey` config-clobber found underneath). Full ledger: §Ledgers,
> "Round-8 item 3, the bugfix half". **The auto-walk feature half stays open**,
> with its design questions unchanged.

Two halves of one item: today the game has **the bug and not the feature** —
tabbing out mid-run *is* the auto-walk, and it is the only one there is.

**The bug.** `Key.isDown` (`input-system/logic/keyboard/keys/Key.ts:23`) is set
by `keydown` and cleared by `keyup`. A window that loses focus never receives
the `keyup`, so the key stays down; `Controls.ts`' Tock clock keeps reading
`this.upKeys.isDown` etc. (`controls/logic/Controls.ts:213-223`) and keeps
sending movement to a server that has no idea the player left. **There is no
`blur` or `visibilitychange` handler anywhere in `input-system/`** — the only
two in the client are `Audio.ts:28` and `Chat.ts:52`, neither of which touches
key state. ⚑ A `ResetKey` helper already exists
(`input-system/logic/keyboard/keys/ResetKey.ts`), so the fix is a listener that
sweeps held keys, not new state.

⚑ **Do not fix this by zeroing the movement vector.** `Controls` already has a
deliberate *stop tail* — an explicit `(0,0)` for a short window after release,
then silence (`Controls.ts:254-261`), added by the input-jitter work — and the
held-key state is what feeds it. Clearing the keys lets that existing tail send
the stop; clearing only the vector would leave the keys down and the tail
un-armed, so the *next* real keypress would behave oddly.

**The feature.** Auto-walk is a toggle that makes continued movement
*deliberate* — and it is what makes the blur fix safe to ship (a player who
tabs out on purpose while travelling keeps travelling only if they asked to).
Open design questions for whoever picks it up: the keybinding (no free letter
is obvious — see the §35 C4 hotkey audit), whether it holds the last movement
vector or a facing, what cancels it (any movement key? damage? a menu?), and
whether it survives the blur/focus round trip at all. ⚑ It also needs a mobile
answer or an explicit *desktop-only* ruling — the joystick has no held state to
inherit.

⇒ **The two halves can ship separately, and the bug should not wait for the
feature.** The blur fix is small and self-contained; the *"unless auto-walk is
enabled"* clause is one condition added to it later.

## Intake — round 9 (2026-08-07): the PO's walk of the nine generic kill quests

The PO played all nine kill quests the day they shipped (`f414b473`). Verdict:
*"overall everything works and it feels good"* — which also **clears the
standing watch item on `bandits-at-the-shrine`**: the game's first human-target
kill quest has now been PO-seen in play and read fine, so the GiantSpider L14 ×5
fallback (archived kill-quests plan §8) stays unused. Three items raised.

### 1. NPCs need in-world names, like mobs → ✅ **SHIPPED same day, `6de08b74`**

> *"We need to show the names of NPC, similar to mobs, so if you have a full
> quest log, you can actually identify who you need to return to. 'lamplighter'
> is not clear to the player if the name is only shown in the dialogue window."*

**The trace.** Mob nameplates are gated server-side by `IsCombatTarget()`
(`items/mobs/definitions.go` — pays XP *and* not friendly), which every
conversant fails by authored design (`xpFactor 0`); the client's `Mob.setMobId`
then renders nothing. The distinguishing signal already existed in the data:
**a conversant is exactly a mob with an authored `interaction` block.**

**The fix** (this file is the authoritative ledger; LIGHT tier, no plan doc):

- `items/mobs/catalog.go`: `CatalogEntry.Conversant`, derived
  `d.Interaction != nil`, served on `/mobs`. TDD'd
  (`TestMobCatalogJSON_ConversantMeansAuthoredInteraction`); the projection pin
  updated to admit exactly the one new key.
- `client-data/Mobs.ts` + `game-objects/logic/Mobs.ts`: a conversant-only
  species now plates its **displayName alone** — no level (a combat fact an
  unattackable NPC must not speak), no difficulty tint, fixed plain white
  `CONVERSANT_PLATE_COLOR = 0xffffff` [PLACEHOLDER] (outside both the
  difficulty palette and the player-character lavender). A future species that
  is both conversant *and* combat target plates the combat way.
- 14 species now plate as conversants, the 13 placed NPCs **plus the
  ForestSign** — an interaction-carrying prop-like actor whose named plate is
  accepted, arguably helpful (it is a sign).

**Schema impact: DB NONE · FlatBuffers NONE · conf NONE** — the catalog is
sidecar HTTP JSON, and an old client ignores the extra key.

**Verified:** mobs package green (new test red-first) · full Go suite 0 FAIL
except one non-reproducing `sys` flake (passed `-count=1` twice; the known
pre-existing flake) · `npm run typecheck` + vitest 235/235 ·
**`npc-portraits.mjs` REWRITTEN with this change** (it asserted "NO nameplate"
— the round-9 fix reverses that premise): all four subjects plate name-only,
"Town Crier" proving the spaced displayName path, combat plates as control,
0 console errors · **`c2-mob-level.mjs` 7/7** (combat text+tint intact) ·
`c0-honest-plate.mjs` tint legs PASS ×2 (its pay leg failed in the documented
patroller-sampling mode both runs — server pay untouched by this change and
pinned by the Go suite).

⚑ **Harness finding, worth the record:** `c2-mob-level`'s control leg faked a
regression twice (control Stag out of view; wanderers from the level-2 pair at
spawns 8/43 crossing the venue), and cost a stash-and-rebuild proof against
HEAD — **identical 4/7 at HEAD**. The script is now tri-state: a missing
control plate is INCONCLUSIVE (a `"Stag 0"` sighting — the raw-override defect
— still fails red), and the per-instance pair leg accepts *any* second level as
evidence.

### 1b. Two text touches, same session (follow-up asks) → ✅ shipped

- The bind confirmation floating text: **"Bound to campfire" → "Bound and
  restocked"** — the dwell both binds and refills the Camp charges
  (plan-downtime.md), so the confirmation names both. (`Player.ts`; the two
  comments that quoted the old string updated with it.)
- The flight map (`E` at a discovered fire) now titles itself **"Pick a
  destination to fly to..."**; the read-only `M` map stays titled "Map". One
  `setTitle` stamp on each open path in `MiniMap.ts` — stamped on every open,
  so close needs no restore. Verified at the surface: bind text, both titles,
  0 console errors.

### 2. Better font, cleaner UI, cleaner dialogue UI → parked

> *"we just need a better font and cleaner UI and dialogue UI."*

Ordinary intake, deliberately not taken now (PO: *"that entire topic is for
later anyways"*). It is a **presentation pass, not quest work** — it belongs
beside the step-8b UI-polish rest-of-checklist when that reopens.

### 3. Journal opened during dialogue overlaps it → parked with item 2

> *"currently, opening the journal while in dialogue just weirdly overlaps."*

Real but cosmetic: the journal and the conversation panel are independent DOM
overlays with no exclusivity rule between them. Cheapest standalone fix, if it
ever needs to ship before the UI pass: opening the journal closes the dialogue
(or vice versa) — one exclusivity rule, no visual redesign. Recorded here so
the UI pass finds it; nothing built.

## Intake — round 10 (2026-08-07): mob pathfinding wonky in prop clusters

> *"with more than two props close to each other, pathfinding gets very wonky.
> add a campfire to the mix and mobs might get stuck walking between two
> extremely close points. the two boars in this screenshot are just walking up
> and down the campfire for 1 or 2 meters and back."*

One item, ✅ **SHIPPED same day** (this file is the authoritative ledger; LIGHT
tier, no plan doc). This is the **third member of the steering-oscillation
family** — after the 2026-07-11 side-flip (fixed by the side latch) and the
2026-07-20 deflect/blend limit cycle at a notch (fixed by the detour-commit),
each documented in `steering.go`'s comments.

### The trace — three interacting holes

1. **The detour latch released on a single zero-repulsion tick** (`steer`,
   `steering.go`). Prop clusters leave zero-repulsion slivers between their
   0.6-u fields, so a mob sliding along prop A released mid-cluster, re-aimed,
   and hit prop B head-on.
2. **The fresh head-on side pick came from the momentary lean**, which right
   after a detour points back the way the mob came — release + reversed
   re-latch = the observed 1–2 u shuttle. (The red test caught exactly this:
   expected side +1, HEAD picked −1.)
3. **Walk-home and the evade return had no stuck protection at all** — the only
   movement paths without one (chase camps, wander legs expire). A blocked walk
   paced literally forever: the red pin measured a longest still-run of **0**
   over 900 ticks.

Also established in the diagnosis, no change made: **the campfire and
conversant NPCs are separation peers, not steering obstacles** — actor-model
mobs on the viewport-only layer, soft 0.45-weight push, invisible to the latch.
PO ruling 2026-08-07: **campfires stay walkable, leave as is.**

### The fix (`pkg/aura/model/mob`, Go only — TDD, all red-first)

- **A — latch-clear hysteresis** (`steering.go`): a committed detour survives
  short zero-repulsion pockets; only `steerClearHoldTicks = 10` [PLACEHOLDER]
  (~⅓ s) consecutive clear ticks release it — a cluster reads as one wall.
- **B — sticky side** (`steering.go`): a released side is remembered for
  `steerSideMemoryTicks = 30` [PLACEHOLDER] (~1 s of movement); a fresh head-on
  inside the window reuses it instead of the lean. Both A and B state are
  cleared by the chase camp (`stuck.go`) so a failed detour still re-picks.
- **C — idle-walk stuck budget** (`patrol.go` `idleWalk`): walk-home and the
  evade return get the wander-style budget (2× straight-line ticks + 30);
  expiry parks the mob for `idleWalkRetryDwellTicks = 90` [PLACEHOLDER] (~3 s),
  then re-arms from where it stands. Combat entry drops the state. A blocked
  walk is now pace-rest-retry, forever — mirroring the 2026-07-20 camp ruling
  (a mob that gives up hands players an off-switch).

**Schema impact: DB NONE · FlatBuffers NONE · content JSON NONE · conf NONE.**
One revertible commit.

### Recorded landmines (assessed on PO request, none acted on)

- `steerPrevSide` is **relative to the desired direction** — if desired flips
  inside the 30-tick window (re-roll behind the mob, opposite aggro), "same
  side" is the opposite world-space side. Blast radius today: a suboptimal
  detour. Breaks first if someone widens the window a lot.
- `idleWalk` re-arms on **exact target inequality** — correct for its two
  fixed-target callers; a future caller passing a per-tick-jittering target
  silently disables the protection.
- The three constants are **ticks at 30 TPS**, hardcoded Go like the rest of
  the steering family (`steeringLookahead`, both weights) — a tick-rate change
  or a tune-by-conf wish hits the whole family, not just these.
- Perf: integer arithmetic only, no new queries/allocations
  (`steering_alloc_test.go` green); the blocked case got *cheaper* (a stuck
  walk now idles 90 of every ~budget ticks instead of querying forever).

### Verified

4 new Go tests red-first then green (`TestMob_DetourSurvivesBriefClearPocket` ·
`TestMob_ClearPocketKeepsDetourSide` ·
`TestMob_WalkHomeBlockedPausesInsteadOfPacingForever` ·
`TestMob_EvadeReturnBlockedPausesBetweenAttempts`) · whole mob package green
including every prior steering pin (both historical oscillation cases, flee/
corner/notch, alloc pins) · full Go suite 0 FAIL except
`sys.TestDwell_TakeoffDropsAnInProgressCount`, **proven pre-existing by
stash-and-rerun against HEAD (fails identically)** — note it now fails
deterministically, not as a flake · rebuilt binary booted clean (13 quests /
777 props / 485 spawns / 5 campfires, 0 panics) and handed over. No browser
harness owns idle steering (the Go pins are the owner); in-game feel check is
the PO's, pending at commit time.

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
  *(Originally deferred 2026-07-26 because `SkillTooltip.ts` was round-4
  test-pending; that cleared long ago.)* **⚑ Re-raised AGAIN 2026-08-02 —
  third time (§Intake round 7 item 3); should stop being filler and get
  scheduled.** **Re-raised by the PO 2026-07-30**
  during the §35 C4 in-game check, with a second observation on the same
  surface: **Call for Aid renders "Summons Soldier Companion …" three times**
  — one line per `spawn` effect, technically true, not pretty; wants a dedupe
  ("3× Soldier Companion") or a grouped render, same shape as the existing
  radius/targets generic-line dedupe. ⚑ PO note on scope: hover info may get
  a broader rework later anyway — treat both as one item on that surface, and
  don't gold-plate the current renderer before that call is made. The summon
  side has a data prerequisite either way: the `/skills` catalog serves only
  the caster's effects, so describing the companion means either following
  `spawn.mobName` into a served mob loadout (the `/mobs` catalog deliberately
  omits skills — zero-hint policy would need a carve-out for player-owned
  summons) or serving a curated description line.
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
   COOLDOWN — and SHIPPED the same day, `a29fe986`.** Not deleted, not kept as a
   weakened passive — Swift became a burst movement cooldown, the direct answer
   to the §Findings "movement slot is empty" observation. Pass 1b item 3 and
   question 2 both hung off this. Ledger at §Ledgers; the engine half is a new
   `speed_burst` effect type, and it made players slowable for the first time.
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

*(one section per executed pass, newest last)*

### Swift → a movement cooldown ✅ DONE 2026-07-29, committed `a29fe986`

**The first item picked off the 2026-07-29 open-questions sweep** (§Open
questions 4, and Pass 1b item 8 with it). Backend + frontend + content + docs,
27 files. Not a numbers-pass item — it is the answer to the §Findings
observation that **the movement slot is empty**: Dash is a blink, Haste is aura
cadence despite its name, and there was no sustained-speed ability in the game
at all, so a flat `stat_multiplier` passive was the weakest thing that could
occupy the space.

**PO decisions taken in-session (choice prompts):** ① shape = a **steerable
sprint** (1.5× for ~5 s) over a short escape burst or a long travel buff —
distinct from Dash by construction; ② the wolf-line drops stay **unchanged** on
all four wolves, so only *what* Swift is changed, not who teaches it; ③ read
both movement factors while in the movement path, closing the slow gap below.

**⭐ The engine shape: `speed_burst` is the movement twin of `tick_rate`.** Both
are self-targeted cooldown-fired buffs with a factor and a duration, so the new
type is the existing one's mirror rather than a new pattern — payload in
`skills.Buffs`, same stream rules (per skill the strongest wins, across skills
they multiply), same `applier` seam so mob content can carry a sprint too.
`tickRateDistance` generalised to `unityDistance` and shared.

**⭐ `Buffs.MovementFactor()` is the one place the movement axis composes** —
speed buffs × (1 − strongest slow), floored at 0, read by *both* movement sites.
That was the design point: two independent readers would eventually disagree
about which wins.

**⚑ It closed a latent asymmetry nobody had noticed: `SlowFraction()` had
exactly ONE reader** (`mob.stepLength`), so a slow applied to a **player** sat
in the buff store and was never read. Players are now slowable. Nothing applies
one today — no mob authors a `slow_aura` — so no behaviour moved, but the
content surface did: **a mob slow aura is now a content decision rather than
silently inert.** ⚑ Enemy-targeted slows still cannot reach another player
(targeting is faction-relative and two players share `FactionAligned`), but an
**ally**-targeted slow now would — a working griefing lever against GDD §9 where
before it was inert. Review rule for future authoring, not a defect today.

**⚑ The pip took bit 7 — the LAST bit of the `applied_effects` ubyte.** The next
payload wanting a pip must widen the wire first; `backlog.md` §39 does that
anyway. Recorded in the code at the constant.

**Content:** `swift.json` → `category: cooldown`, 1.5× (+0.1/level) for 150 t
(+30/level), CD 600 (−60/level), all [PLACEHOLDER] — Pass 1b will re-touch them.
Keeps id 10 and its four wolf drops, so Wolf's first-drop moment is unchanged.

**Also retired:** `TestContent_TeachingOrderMatchesPreMigrationZone` (PO). It
proved the 3a and 3b-ii moves were payload-preserving and content has since
deliberately moved past it (`3b1b3ef6`); the half that was never about the
migration survives as `TestContent_EveryGrantIsAResolvedTeach`.

**Verified:** `go build`/`vet`/`test ./...` clean (**24 new Go tests**), frontend
typecheck + **57 vitest** + prod build; boot `-content ../api` **0 errors 0
warnings 0 panics — 15 factions/86 skills/64 mobs/10 recipes/1 milestone/777
props/485 spawns**; **sim battery BYTE-IDENTICAL against HEAD on all four legs**
(default · `-chain` · `-levels` · `-content` roster), diffed against a HEAD
worktree build — TTK 6.67 s / TTD 8.70 s stand. In-game harness
`swift-cooldown.mjs` **6/6**, 0 console errors, 0 WebGL losses: unbuffed
**1.32 u/s** → sprinting **2.01 u/s** = **1.52×** against the authored 1.5, clean
separation across all 8 legs.

**⚑⚑ The harness lesson, now pinned in the verify skill — it cost four runs and
faked two different product failures.** The first warp target sat in a ~2-unit
pocket between blocking props, so **every walk measured the pocket instead of
the pace**: identical 2.04 u legs whether sprinting or not (a flat 1.00× "the
buff does nothing"), plus 0.00 u legs whenever two consecutive walks pushed the
same way, which correlated so perfectly with key reuse that it sent the script
chasing an input-handling theory that did not exist. On open ground the player
walks a clean, time-proportional **1.5 u/s** — the throttled headless rAF does
*not* slow it, because the server coasts on held movement for up to
`maxHoldTicks` (15). The script now warps to the most open whole-unit tile in
the zone (computed from `world.json`: −23,14 at 7.23 units of clearance) and
reports **INCONCLUSIVE** if the unbuffed baseline is slow, rather than printing
a ratio that can only flatter or fake the result.

### Skill-inventory regeneration ✅ DONE 2026-07-29, committed `c723d82a`

Docs only, and strictly speaking not a pass — but it belongs on the record
because of **how far the generated doc had drifted**: three skills missing
(Calm/CharmBeast/**BindElemental** — note the authored name), `Light` still
named that a week after it became `Lantern`, KeenEye no longer line-wide across
the wolves, the proving-grounds Sages teaching nothing while the doc still
listed them, and ~10 drop sources moved mob or chance. Counts are now 20 auras /
7 passives / 23 cooldowns = **50** player skills (+36 mob-only = the 86 in the
boot log); table cross-checked against `api/` by script. ⚑ **The doc's own
regeneration recipe was the trap** — it said to read teachings from
`zones/*.json` `npcs[].teachings[]`, which entity-model chunk 3a deleted, so a
script following it finds zero teachers and reports every taught skill as
unreachable. Fixed to point at the mob `interaction` trees. Also filled the two
catalog gaps it exposed: `content-cooldowns.md` had no design-intent rows for
the three faction-flips cooldowns (written from
`archive/plan-faction-flips.md` D2/D3/D6–D13), and `content-auras.md` still
called skill 6 `Light`. The cooldown catalog now cross-checks 23-for-23 against
`api/`.

### Chunk P — presence-counts attribution ✅ DONE 2026-07-30, `d45ba07c`

**Pass 3 item 1, quest prerequisite chunk P (`plan-quests.md` D15) — quest C1
is unblocked.** Backend only (12 files + 1 new harness); no wire change, no
frontend change, no content change. **The plan (§Chunk P plan) held with no
deviations** — the rule shipped exactly as ruled: a live player with an active
aura ON (`ActiveAuraSlot >= 0`), within `presenceRadius` (+ mob body radius) of
a mob that is `InCombat()` **and already holds ≥1 participant**, joins the
existing `participants` map. Damage-touch entry, the 10 s healer window,
`CreditTo()` routing and clear-on-full-regen untouched — presence is a third
entry into the existing set, exactly one participant class (P3).

**The shape, as built:**

- **`model.PresenceNoter`** (`model/combatant.go`) — the small named interface
  (`NotePresence(p PlayerEntity)`), the AttackNotifier/Credited precedent;
  `model.MobEntity` NOT widened, the four fakes untouched (L14 stays quest
  C1's problem).
- **`Mob.NotePresence`** (`model/mob/mob.go`) — the P2 gate
  (`InCombat() && len(participants) > 0`) then `noteParticipant`. The gate and
  the map live together in model/mob; the scan does not know the rule.
- **The scan** (`sys/skills.go notePresence`) — called from `processEntity`
  right after the active-aura check (the SkillSystem owns "is an aura on");
  asserts PlayerEntity (mob casters never scan) + `HealthRatio() > 0` (a dead
  player's rebuilt-struct ref is L-P1's defect class — skipped, not half-fixed).
  Probe = reused system-owned circle + hit buffer via `AppendCircleDynamics`
  (the chunk-B pattern), mask `LayerViewportCollision` (the one layer every
  mob body shares), filter by interface assert. Circle-vs-body intersection
  gives `presenceRadius + target.Radius()` — the withinSensor convention —
  for free. **Zero per-tick allocation, pinned by test.**
- **Conf:** `game.combat.presenceRadius` — `cfg.DefaultPresenceRadius = 8`
  [PLACEHOLDER] (P1), `PresenceRange()` zero-normalizing accessor (the
  CritFactor pattern; 0 = default per the standing conf ruling), copied raw in
  `core/gameconf.go` + `aurad.go`, logged in the boot tuning-knob line, added
  to BOTH full `conf.default.json` copies (delta confs untouched), and joined
  `resolvedTuning` in `conf_resolved_test.go` — **red direction proven by
  perturbing the JSON to 9** (`PresenceRange: 9 vs 8`), restored green.

**Tests (TDD, red-first):** 6 model-level (`mob_test.go TestMob_Presence_*`):
bystander earns full XP · the P2 gate both halves — not-in-combat (isolated
via a 0-HP touch, which records a participant without opening the combat
window) and the NPC-fight zero-participant case (`MobTouches(nil, …)`) ·
dedupe + healer fan-out · guaranteed unlock reaches the bystander (P3) · full
regen clears presence like damage. 6 sys-level (`skills_behavior_test.go
TestPresenceScan_*`, real space + real `*Mob`): inside-radius earns · aura off
→ nothing · out of range → nothing · dead bystander → nothing · **the tunnel
scenario pinned** (a sensor-blind mob — non-default faction, `AggroMask: 0` ⇒
`aggroSensorMask` none — still credits the bystander, the test that outlives
the P1 rationale) · zero-alloc steady state.

**Verified:** `go build`/`vet`/full `go test ./...` clean · guardrails + sim +
phy + alloc suites `-count=2` clean · **sim battery BYTE-IDENTICAL on all four
legs** (default · `-chain` · `-levels` · `-content ../api` roster) against a
pre-chunk HEAD worktree build — TTK 6.67 s / TTD 8.70 s stand (L-P2 confirmed:
the batteries are single-fighter, so presence changes nothing) · boot
`-content ../api` **0 errors 0 warnings** — 15 factions/86 skills/64 mobs/1
milestone/10 recipes/5 prop defs/777 props/485 spawns/5 campfires, and the
tuning line prints `combat.presenceRadius: 8` · frontend untouched: 66/66
vitest + typecheck green · **new harness `chunkP-presence.mjs` 6/6, 0 console
errors, 0 ctx losses** — three clients on one server: fighter A (Damage aura)
kills wolves at (−40, 10); witness B stands 4 units away with a **Lantern** on
(a light aura pairs with nobody hostile, so B structurally cannot touch a mob)
and earned **the identical 52 XP** A did; control C at the same distance with
NO aura stayed at **0**. Both smoke legs on one kill.

**⚑ Two harness lessons, pinned in the verify skill:** ① the HUD is
GameState-driven on a throttled rAF loop, so **wait for the UI to show the
state, never sleep a fixed interval** — `toggleAuraSlot` refuses activation
until `currentAuraSlots` has synced from the server, and the spellbook row for
a just-cheated skill renders seconds late; both produced "slot never lit"
false FAILs on fixed 700 ms waits. ② **`Torch` is a PASSIVE** (the Hermit's
light passive) — the active light aura is **`Lantern`**; equipping Torch into
an aura slot silently no-ops and reads exactly like the feature under test
failing.

**Open:** the PO in-game checklist (§Chunk P plan) — two characters both
level · aura-off bystander earns nothing · army-vs-orc skirmish pays nothing ·
the kill broadcast names both (L-P4). Per the standing per-bug model, not
blocking. **L-P1 (participant-ref XP loss on death) stays on record,
untouched** — fix vehicle quest L11 / step 8.

### Cooldown re-slot exploit — a cooldown belongs to the SKILL ✅ DONE 2026-08-01, committed `abdb5673`

**PO bug report, per the standing per-bug model:** *"if I place a cooldown in a
cooldown slot, it can instantly be used, even if it was used before. A cooldown
is always placed in a slot with a zero second cooldown."* Backend only, 8 files.

**The defect in one line: remaining cooldown was stored on the SLOT, and
`EquipCooldown` builds a fresh `&EquippedSkill{}`.** So `CdTicks` was 0 by
construction on every equip, and re-slotting was a free reset of any cooldown in
the game — Recall (300 s), Revive, Bloodthirst, the lot.

**⚑ The in-combat equip lock was never a fix, only a lid.** `sys/equip` has
rejected mid-combat loadout edits since the first report of this, with a comment
claiming it *"closes the cooldown-refresh exploit"*. It does not: `InCombat()` is
a 100-tick recency window, so the exploit is fully open **3.3 s after your last
hit** — i.e. between every pull, which is exactly when a player edits their
loadout anyway. The shipped test even asserted the mid-combat half and left the
out-of-combat half unwritten, so the gap was *pinned open* by the suite. **The
lesson is the general one: a guard on the ACCESS PATH is not a fix for state that
is reconstructible.** As long as the counter died with the slot, every path that
could ever re-create a slot was a hole, and only some of them are equips.

**The fix: `SkillComponent.cooldowns map[SkillID]int`, and `EquippedSkill.CdTicks`
is DELETED, not mirrored.** Keyed by skill because that is what a cooldown
belongs to; an absent key means ready. Deleting the old field rather than syncing
the two is the point — a mirrored copy is the drift class this repo keeps getting
bitten by (§35's two conf restatements, R3's two taxonomy restatements), and a
mirror here would have re-opened the exploit the first time someone wrote to the
wrong one. Five accessors carry it: `CooldownRemaining` / `SlotCooldownRemaining`
/ `SetCooldownRemaining` / `StartCooldown` / `TickCooldowns`.

**PO decision (choice prompt): the in-combat equip lock STAYS.** With the timer
on the skill, re-slotting mid-fight gains nothing, so the lock became a design
choice rather than a security control — lifting it would have made the loadout a
free mid-fight lever and softened the 3/3/3 slot limit. Kept as authored:
loadout editing is an out-of-combat build activity, and switching the ACTIVE AURA
(a separate input path) remains the intended mid-fight lever.

**⚑ Unslotted cooldowns keep ticking, and that is load-bearing.** `processCooldowns`
now calls `sc.TickCooldowns()` once per entity per tick instead of walking the
three slots. Had the map ticked only while slotted, parking a skill outside the
loadout would FREEZE its recovery — a worse exploit than the one being closed
(you would hold the cooldown at 1 tick remaining indefinitely and re-slot it the
moment you wanted it). Absent-key-is-ready plus tick-everything is the shape with
no privileged state.

**Free knock-ons, none of them designed for:** the wire is unchanged
(`codec/gamestate.go` reads through `SlotCooldownRemaining(i)`), so **no frontend
change at all** — the HUD is server-driven and greys a re-slotted skill for its
true remaining time on the next tick. Death and reconnect were already safe:
`sys/state.go` carries the whole `SkillComponent` pointer through both stashes,
so the map rides along exactly like the slots do.

**Verified:** the three new tests **proven RED first** — the old behaviour was
re-introduced as a one-line probe in `EquipCooldown` and
`TestCooldownMemory/survives moving the skill to another slot`,
`TestEquipSystem_OutOfCombatReslotKeepsCooldown` and
`TestEquipSystem_ParkingOutsideTheLoadoutDoesNotResetCooldown` all failed, then
restored. Full Go suite (28 pkgs) + `vet` + `gofmt` clean; simharness guardrails
`-count=2`. **Sim battery unchanged — TTK 6.67 s / TTD 8.70 s stand** (mobs never
re-equip, so the mob fire path is behaviour-identical by construction).
`TickCooldowns` on an idle component allocates **zero** (pinned by test — it runs
for every entity every tick, and the idle-loop alloc pins are why). Boot
`-content ../api` 0 errors 0 warnings 0 panics — **87 skills/15 factions/64 mobs/
10 recipes/3 milestone unlocks/4 quests/5 prop definitions/777 props/485 spawns/
5 campfires**.

**Harness gate**, one at a time on freshly restarted servers: `swift-cooldown.mjs`
**7/7**, and `chunk2-follower.mjs` **5/5 + 1 SKIP** — the summon path end to end
(spellbook → cooldown slot → **fire** → follow), including its wait-out-a-running-
cooldown loop, with the engage leg going INCONCLUSIVE on the **accepted D9
fragility** (the pet is focused by its former packmates and died before it could
be watched — not a cooldown signal either way). Both runs 0 console errors /
0 WebGL losses.

**⚑ And the harness gate is why this ledger can say that honestly.** The first
clean `swift-cooldown` run scored **5/7** at a 1.20× sprint ratio — nothing in
the diff touches `Buffs.MovementFactor()`, so the tempting move was to call it a
flake. Settled instead per the verify skill's own rule: `git stash` + rebuild →
HEAD baseline **7/7 at 1.39×**, restore + rebuild → **7/7 at 1.43×**. The bad run
carried a **0.90 u/s unbuffed leg** against a nominal 1.5 — the documented
obstruction signature — so it was the venue, not the change. A fourth run before
that was void on a lost WebGL context (§29), which is an INVALID run, not a
failure. Three runs to settle one number, and the alternative was shipping a
guess in a ledger.

### The next-level preview is gated on affordability ✅ DONE 2026-08-01, `66646743`

**A PO ask, raised straight into a session and shipped in one sitting** —
*"we should only show the effects a level up of a skill will give once a skill
point is actually available; otherwise the tooltip should just show the current
effects."* Frontend only, 3 files + 1 harness. Not a numbers item and not part
of R1–R3, though it lands on the surface all three of them re-authored.

**What was wrong:** the round-4 tooltip fix gave every level-scaled value a
`current → next` preview whenever the skill was below its cap, which is a
different condition from *the player can act on this*. A level-1 character
holds **zero** points (`TotalSkillPoints` is `(level−1) × pointsPerLevel`), so
from creation until the first ding every hovered skill advertised an upgrade
with no way to buy it — and the same returns the moment the last point is
spent, which at the cap is the permanent state.

**The shape, as built:**

- **One preview cap.** Every `→` in the tooltip renders through `prog()`, which
  previews only while `level < maxLevel`, so the whole feature is
  `previewMax = showNextLevel ? def.maxLevel : level` threaded to the effect
  blocks and the four skill-level `prog` calls. Damage, cost, radius, targets,
  tick cadence, cooldown and cast time are gated by that one line, and **a new
  effect type inherits the gating without knowing it exists**.
- **A RENDERING cap only** — the subtitle still reads `def.maxLevel`, so the
  player keeps seeing how far the skill can go, and the cooldown branch's
  summed per-cast cost still measures its slope across the real level range:
  `previewMax` decides *whether* a next value is shown, never what it would be.
- **PO ruling (choice prompt): the trigger is AFFORDABILITY, not possession.**
  Levels cost 1–3 points on the D10 curve, so *"I hold a point"* and *"I can
  buy this level"* are different questions. `showTooltip` asks
  `skillPointCost(def.maxLevel, level + 1)` against the live count — the same
  rule `updateSpellbook` already greys the `+` button on — so the preview
  appears **exactly when the button is live**.
- **The count is pushed, not pulled.** `SkillTooltip` cannot import `HUD` back,
  so `updateSkillPointsDisplay` hands it over on every change. It starts at 0,
  the conservative direction: before the first snapshot there is no preview
  rather than a wrong one.

**⚑ The wiring is invisible to vitest, by construction.** `formatSkillTooltip`
stays pure and takes the flag as an argument, so **a HUD that never pushed the
count would leave all 111 unit tests green with the feature dead on screen** —
which is why `round4-tooltip.mjs` grew the leg that watches it (no preview at
character level 1, preview after the XP cheat hands out 29 points).

**⚑ And that harness needed a real repair — the same failure mode the R1/R2
cost-wording fix had just been through.** Its radius check proves radius does
*not* ride the character curve by comparing the whole rendered line, and the XP
cheat between its two hovers is precisely what turns the preview on: so an
unmoved radius (`Radius: 2.5` vs `Radius: 2.5 → 2.6`) reported as **moved**,
i.e. as an over-applied power scale. It now compares the current value alone.
**A harness that asserts on rendered text is broken by any change to what is
rendered**, not only by a change to what it measures.

**Verified:** **111 vitest** (4 new — previews present when affordable, absent
when not, the subtitle unaffected either way, and a cooldown's summed per-cast
cost gated too) · `tsc` · prod build · harnesses one at a time on fresh
servers: **`round4-tooltip` all legs** and **`r1-focus-cost` 5/5** (cost
reduction still visible, `21,26 → 20,25` Focus). Read off a real client:
Rejuvenation at character level 1 with no points renders `Heal over time: 4 × 6
over 11.88s | Costs you: 3 Focus | Radius: 2.5`, and after XP to the cap
`107 → 134 | 82 → 102 Focus | Radius: 2.5 → 2.6`.

**⚑ Harness gotcha worth keeping, cost two red runs:** a **second Claude
session on the same machine** was running `swift-cooldown.mjs` and restarting
`aurad` on port 2000 underneath this one — presenting as a dead XP cheat, a
missing Discipline and a stray `equip Swift` by a player this script never
created. `AURAD_CONF=<copy with server.port changed>` gives a private server
(`./aurad -dev -content ../api` reads the env var, `loaders.go:262`) and the
harnesses take the URL, so a parallel run needs no coordination.

### Help panel — a placeholder tutorial ✅ DONE 2026-08-02, `8cc3ef82` — PO-VERIFIED IN-GAME 2026-08-02

**A direct PO ask, not an intake item:** get the game's mechanics into the game
as readable text NOW, as a stand-in until a real tutorial exists. A circled `?`
at the top of the zoom column (placement PO-picked over the left column) opens
a "How Aura works" overlay — **12 short sections ordered by when a new player
meets each mechanic**, written as design statements, not FAQ. The draft was
PO-edited before implementation: auras pick their own targets and are mostly
target-capped (not "affects everything inside"), the beat folded into the aura
section, "no way to grief" cut (*an intent, not a fact*), and **dying loses the
XP gathered toward the next level**. Deliberately covers only what is live —
no combinations, no exploration unlocks.

**Shape: frontend-only, 5 files, zero logic beyond visibility.** Content is
static HTML in `HUD.html`; `features/help/logic/Help.ts` (~40 lines) wires the
button and ✕/Esc (`pointerdown`, per the documented click gotcha); the panel
reuses the journal overlay pattern (only the body scrolls) and the button the
zoomButton vocabulary. No hotkey by PO choice — button and Esc only. §39's
presentation rework restyles it with everything else; the parked feel-pass
"tutorial for entry pricing" item (`archive/plan-feel-pass-2.md` §6) remains
open — this is written info, not a taught flow.

**Verified:** `tsc` · 132 vitest · prod build · an 8/8 scratchpad smoke on a
fresh server (button present, panel opens by real click, all 12 sections in
order, Esc and ✕ close, 0 console errors) + screenshot. The smoke was NOT
promoted into the verify suite — a static panel with no server state isn't
worth a coverage-map row.

### A mobile layout — the HUD stops covering the world on a phone ✅ DONE 2026-08-02 — PO-VERIFIED ON A REAL PHONE 2026-08-02

*(Moved here from the CLAUDE.md status banner 2026-08-02 when the render-cost
entry below superseded it as "last completed" — it had no plan-doc ledger, and
the collapse rule needs one. Prose is the banner's, unedited except this note.)*

PO ask (*"the UI elements all block the movement and view"*), **frontend only,
no backend/wire change**, 4 PO rulings taken up front. **One class does
everything:** `Mobile.ts` decides once at boot (`matchMedia('(pointer: coarse)')`,
`?mobile`/`?desktop` overriding) and stamps **`html.mobile`**; every rule lives
under it in the new `HUD.mobile.less`, so **the desktop HUD is unaffected by
construction, not by inspection**. ⭐ **The sheet needed no DOM surgery** —
`#leftColumn` (journal button + spellbook + passives) *becomes* the full-screen
menu, and `#zoomControl`/`#minimap`/`#gameSettings`, which are SIBLINGS, are
pulled into it by position + z-index, so every existing handler keeps working
untouched. Always on screen: Focus/XP bars (moved off the thumb corner to the
top edge), six tap tiles in one row, combat indicator, alerts.

⚑ **Two defects found while building, both invisible to the layout work
itself:** ① **read-only overlays were eating movement input** — `#inputAreas`
(the joystick) sits BELOW `#gameUI`, so `#bottomCenter`'s full-width transparent
strip and the bars swallowed touches across two wide bands (15 of 81 hit-test
points); display-only elements are now `pointer-events: none` with the tappable
children opting back in, worth **+20 points of world visibility on its own**;
② **equipping was impossible for two of three categories** — the spellbook is
inside the sheet but aura/cooldown slots are the tiles BEHIND it, so selecting a
non-passive now closes the sheet (passives keep it open, their slots are in it).
Tapping a tile already activated auras and fired cooldowns, so the tile bar
itself needed **zero logic change**.

**Scaling is ONE knob** — `html.mobile { font-size: clamp(15px, 4.1vmin, 28px) }`
— keyed to **vmin so portrait and landscape agree**; a phone lands on 15.99px
(the browser default the layout was verified at, so nothing phone-side moves)
while a tablet/forced-desktop scales to 28px. ⚑ **Set on `<html>` directly
rather than via `html:has(body.mobile)`**: rem is root-relative, and a `:has()`
on the ROOT is evaluated against the whole document — the class goes on the root
so a desktop page carries no `:has()` bookkeeping it did not already have.
⚑ **The multi-viewport harness leg caught a real bug on its first run**: in
PORTRAIT six 90px tiles + gaps need 591px on a 390px screen and the last
cooldown fell off — hence `@mobile-tile: min(5.6rem, 15vh, 13vw)`, where **the
13vw term binds in portrait only**.

**Verified — desktop invariance MEASURED, not asserted:** a computed-state probe
(rect + 18 computed properties for 33 HUD elements, every slot row, every
hotkey) diffed against a HEAD rebuild is **identical except `domNodes` 417 →
418**, the one hidden `#mobileMenuButton`; a selector audit shows **46 mobile
rules, exactly 1 unscoped** (that button's `display: none`); 400 forced style
recalcs cost **0.4–0.6ms on BOTH builds** (529 → 575 CSS rules, unmeasurable),
desktop registers **zero** new listeners (`MobileMenu.setup` early-returns off
`isMobile()`) and adds no per-frame work; CSS +4,967 B, JS +1,983 B. Plus `tsc`
· 133 vitest · prod build · new `mobile-layout.mjs` all checks (world visibility
**28% → 85%** at 844×390) · desktop control `r1-focus-cost` 5/5 ·
`chunkC3-journal` journal geometry unchanged at both desktop viewports.

**Follow-up same day: the interact verb got a tappable twin.** A phone has no E,
so on mobile the badge over the actor's head is **REPLACED, not accompanied**
(PO wording) by a gold speech-bubble button at the bottom right. ⭐
**`Interact.trigger()` is the ONE definition of what an interact press does** —
the key and the button both call it, so the second-press-closes rule (D21)
cannot drift between them, the same shape as `toggleAuraSlot` serving both the
hotkey and the click. Both surfaces are driven from **`Backend.applyGameState`'s
single site** off the same `badged` id (`updateInteractBadge(isMobile() ? 0 :
badged)` + `Interact.updateButton(badged)`), so badge and button can never name
different actors; `InteractBadgeTargeting` and `Mobs.setInteractable` are
untouched. ⚑ **The button must restate `.hidden` itself** — the global
`.hidden {display:none}` is a bare class (0,1,0) and loses to
`html.mobile #interactButton` (1,2,1), so without it the button would never
hide. Position is `bottom: calc(tile + 2×edge)` rather than the true corner: in
portrait the six tiles span nearly the full width. New harness
`mobile-interact.mjs` **14/14** — badge absent + button shown on mobile, the
desktop CONTROL inverted (badge shown, button absent), tap opens the panel, the
button steps aside while it is open, comes back on leave, and hides out of
range. **Desktop re-verified against the commit before it: the computed-state
diff is again `domNodes` 418 → 421** — the button's div + svg + path,
`display:none` — with 0 console errors both sides; `chunk3b-interact` (the E
verb) and `r4-badge` (the badge anchor) both re-run green.

### Mobile render cost — the phone was asked for 3 Mpx a frame ✅ DONE 2026-08-02, `59dfe266` — PO-VERIFIED ON A REAL PHONE 2026-08-02, DEPLOYED LIVE same day

**A direct PO report against the live mobile deploy:** *"mobile performance and
especially movement is quite laggy"* — with the open question of whether it was
something obvious or a deep problem. It was obvious, it was **one** root cause,
and the fix is two expressions in one file.

`Game.ts` initialised the renderer with `resolution: window.devicePixelRatio`
and `antialias: true` **unconditionally**. A phone reports DPR 3, so the canvas
was a **1170×2532 backbuffer — 2.97 Mpx per frame with MSAA on top**, more
pixels than a 1440p desktop monitor, on a phone GPU.

⭐ **The measurement that named the cause: frame time is very nearly LINEAR in
pixel count** (0.34 Mpx → 85.7 ms, 1.33 → 270.5, 2.97 → 621.9; fitting gives
~16 ms fixed + ~204 ms/Mpx). The scene is **fill-bound, not JS-bound** — the
per-frame JS is already a small constant, and the `AuraRings` / `updatePlate`
dirty checks were all doing their job. That is what made this a one-knob fix
rather than an optimisation pass.

⚑ **The reported symptom was MOVEMENT, and movement is a CONSEQUENCE, not a
second bug.** `Controls`' Tock clock is `setTimeout`-based at 33 ms and so is
nominally independent of rendering — but it still needs the main thread, and a
saturated one starves it. Measured input sends **tracked the frame rate 1:1**:
**1.8/s at DPR 3, 10.4/s at DPR 1, against a 30/s target.** The server then
coasts between inputs and corrects, which reads as lurching and rubber-banding
*on top of* the low framerate. Anyone chasing this from the input side —
joystick, `INPUT_TICKRATE`, the stop-tail, packet loss — would have found
nothing wrong there, because nothing is.

**Two things were checked and CLEARED**, both plausible suspects: the drag
reaches the joystick correctly (`.nipple` spawns, `elementFromPoint` hits
`.left-input-area` — the mobile-layout `pointer-events` work is sound), and
there are **no passive-listener / `preventDefault` warnings**, because nipplejs
sets `touch-action: none` on its own zone. `html`/`body` are still `touch-action:
auto`, which is a minor iOS double-tap-zoom arbitration cost on HUD taps —
recorded, not fixed.

**PO ruling:** cap at **2** and turn antialias **off on mobile**.

**Shape: frontend-only, ONE file, both knobs gated on the existing
`isMobile()`.** Desktop is unchanged **by construction, not by inspection** —
off mobile `antialias: !isMobile()` is `true` and `renderResolution()`
early-returns the bare `window.devicePixelRatio`, which are literally the two
previous expressions. ⭐ **`renderResolution()` is ONE definition read by both
`init()` and the resize handler**: a second `window.devicePixelRatio` left at
the resize site would have silently dropped the cap on the first orientation
change — the exact drift class that handler's own comment exists to close.
`MOBILE_MAX_RESOLUTION = 2` is a named `[PLACEHOLDER]` constant, so 1.5 is a
one-line turn.

⚑ **MSAA was close to pure cost here:** it antialiases *geometry* edges only, so
in a sprite-based 2D game it touched nothing but the vector `Graphics` — aura
rings, bars, tier frames — while being paid for over the whole framebuffer.
Measured **−26 % frame time at DPR 3** on its own. It very slightly hardens
those ring edges on mobile; PO accepted by eye.

**Verified:** `tsc` · 133 vitest · prod build · `ctxloss-warning clean` at the
documented baseline (**5 GL contexts / 2 probe losses / 0 warnings** — this
changes the renderer boot path, so CLAUDE.md requires it) · `mobile-layout` all
checks · `mobile-interact` 14/14 incl. its desktop control · `r1-focus-cost`
5/5 as the desktop control. Live boot 0 errors 0 warnings, 87 skills/15
factions/64 mobs/10 recipes/5 props/4 quests/5 campfires.

**A/B, interleaved so machine load cannot favour either arm** (one phone
viewport 390×844 at device DPR 3, `?desktop` vs `?mobile` in the *same* build):

| | backing | Mpx | frame mean | input sends/s |
|---|---|---|---|---|
| before | 1170×2532 | 2.96 | 559.4 ms | 1.3 |
| after | 780×1688 | 1.32 | 230.9 ms | 2.5 |

**2.25× fewer pixels → 2.42× faster frames → 2× the input rate.** ⚑ **Read the
ratios, never the absolutes** — headless Chromium rasterizes in software, so the
fps figures are not device predictions; the pixel-count drop is the hard fact.
Confirmed on the **deployed** bundle: phone path `780×1688`, `SAMPLES=0`;
desktop control `1170×2532`, `SAMPLES=4`.

⚑ **Two near-misses worth keeping.** ① A single-context run of the fixed build
reported **16.7 ms / exactly 60 fps** — a 14× beat on the predicted 2.4×, which
is the *blank-world* signature (§29). It was real, proven by screenshot before
being believed, but the absolute was a quiet-machine artifact; the interleaved
A/B is the number that survived. **A suspiciously good result deserves the same
scepticism as a bad one.** ② A pixel-readback probe reported the canvas as 100 %
black — `preserveDrawingBuffer` is false, so reading the WebGL buffer outside a
frame is *always* black. **The probe was broken, not the render**; a Playwright
screenshot goes through the compositor and shows the truth.

**Open — PO: *"works fine for now, needs some love"*.** Not a regression, a
ceiling: this recovered ~2.4× and stopped the input starvation, but mobile is
not yet *good*. The cheapest next turns, in order — `MOBILE_MAX_RESOLUTION`
1.5 (one line, measurably faster, near-indistinguishable at phone viewing
distance) · the minimap is a **second WebGL context** rendering every frame,
which costs a driver-level context switch per frame for a 94×94 canvas · the
`touch-action: auto` on `html`/`body` above · and only then anything structural.
⚑ **Not to be confused with `plan-server-performance.md`**, which is the
*server's* concurrent-player ceiling; this is client render cost and the two
share no mechanism.

### Round-8 item 3, the BUGFIX half — held keys survive focus loss ✅ DONE 2026-08-03, committed `c8163ad1`

Frontend only, 3 files + 1 new harness; the auto-walk feature half stays open
(§Intake round 8 item 3), and the *"unless auto-walk is enabled"* clause is one
condition added to this fix later.

**The fix, exactly the intake's shape.** `KeyboardManager` registers two more
listeners in `startListeners()` (removed in `stopListeners()`): window `blur`
sweeps every key, `document visibilitychange` sweeps only when `document.hidden`
— blur catches window switches, the hidden-gated twin catches tab switches and
mobile app-switching without sweeping a legitimately re-pressed key when the tab
comes *back*. The sweep (`releaseAllKeys()`) resets every key via the existing
`ResetKey` **and drops the unprocessed event queue** — a keydown queued just
before the blur would otherwise resurrect its key on the next `update()`, with
no keyup ever coming. `Controls` untouched, per the intake's warning: with the
keys swept its next tick reads (0,0) through the normal released-keys path,
which is what arms the stop-tail.

**⚑ A second latent bug underneath, found because the sweep is `ResetKey`'s
FIRST caller ever:** the inherited Phaser helper forced `key.preventDefault =
false` — contradicting `Key`'s own constructor default of `true`, which
`ProcessKeyDown`/`ProcessKeyUp` read. Used as-is, the first alt-tab would have
let every swept movement key start scrolling the page on its next press.
`ResetKey` now resets *press state* only and leaves the configuration fields
(`preventDefault`, `enabled`) alone; a test pins both. (Its unused
`clearKeyCode` undefined-check also became a TS default — the parameter was
never marked optional because no typed code had ever called it.)

**Verified:** vitest **154/154** (+6: blur sweep · queued-keydown drop ·
hidden-gated visibilitychange · config preservation · refocus re-press · the
existing zoom rows), the three sweep tests **proven red** before the fix ·
typecheck + prod build clean · new **`focus-loss-sweep.mjs` 4/4** at the real
game surface (held W walks 1.63 u/s → synthetic blur with the key still
physically down stops the character at **0.00 u over 2 s** → a fresh press
moves again at 1.67 u/s, 0 console errors) · **the red control:** the same
harness against HEAD-without-the-fix fails exactly the blur leg — the character
keeps walking at full pace (3.07 u in 2 s), the reported bug verbatim.

**⚑ Two environment findings from the harness run (the WSL2 box, not the
Windows one the verify skill documents):** ① no local Postgres and no sudo —
the run used a throwaway `postgres:16` **Docker container** (`DOCKER_CONFIG`
pointed at a clean `{}` config first; the Docker Desktop credential helper
`docker-credential-desktop.exe` is missing from this shell's PATH and fails
every pull otherwise), migrations applied to the fresh DB at boot, container
removed afterwards; ② headless Chromium here lost the WebGL context on
**every** GPU-backed boot — two consecutive §29 signatures, not the documented
~1-in-6 — and `--disable-gpu` (software GL) sidesteps it, noted in the script
header. ⚑ With a dead render loop every movement leg reads **0.00 u/s**:
`getX()/getY()` ride the interpolated sprite, so a §29 loss zeroes position
reads even though the server keeps moving the entity. ⚑ Also: measure pace
from a sample taken **~700 ms after keydown**, not from the keydown — the
input-startup latency folded into a 1.5 s window reads a healthy 1.5 u/s walk
as 0.97 and lands it under the open-ground threshold.
