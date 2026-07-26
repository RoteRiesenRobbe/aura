# Plan: Playtest Feedback (rolling collection)

**Status:** **Collection doc — both designed chunks executed, plus a filler
batch.** Triaged, prioritized and sorted 2026-07-24; rounds 3 + 4 appended
2026-07-25, each with a designed chunk. **Three chunks are shipped and ⏳ PO-test
pending, all mutually independent** — each ledger opens with its own numbered
acceptance checklist: **Round 3** (healer combat state + role-as-loadout)
`03b152f4` 2026-07-25 · **Round 4** (tooltip power scale) `eaae2e69` 2026-07-26 ·
**Rolling-filler batch** (4 of the 6 filler items) `dab4dae0` 2026-07-26.
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

> **✅ DONE 2026-07-25 `03b152f4` — ⏳ PO TEST PENDING (scheduled 2026-07-26).**
> Headless-verified only; NOT yet PO-verified in-game. Both parts in one chunk
> per PO call. Ledger at the end of this section (§Round-3 chunk ledger).

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
⏳ PO TEST PENDING (2026-07-26), headless-verified only, committed `03b152f4`.** 11 files.
Both parts shipped together: the selector needs a combat-state notion that is
not "has an aggro target", and support mode makes that proxy strictly worse.

**PO in-game acceptance checklist (2026-07-26):**
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
test infra — ⏳ PO TEST PENDING** (headless-verified only), committed
`eaae2e69`. 14 files.

**PO in-game acceptance checklist:**
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

## Rolling-filler batch ledger

**Rolling filler — 4 of 6 items DONE (2026-07-26), committed `dab4dae0` —
⏳ PO TEST PENDING (headless-verified only).** 6 files + 2 new. Picked up as
independent work while rounds 3 and 4 both sat PO-test-pending; deliberately
touches **no file either of those chunks touched**.

### Acceptance checklist (PO, in-game)

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
   and a cast cost on cooldowns.

### 1b — retune on top

3. **Prune the vocabulary to Damage / LongRangeStrike / Reaper / Vanguard +
   combinations** — delete **Wild**. PO framing: *"we had these to proof
   concepts, not to be final, so it's fine."*
4. **Reaper** — lifesteal and radius are the two culprits.
5. **LongRangeStrike** — reach becomes affordable rather than free, now that
   it can pay in resource.
6. **Recover** — fractional scaling, or re-role as upkeep for expensive auras
   (decision 2 gives it a job it doesn't have today).
7. **Swift** — ruling open (decision 7); the empty-movement-slot finding above
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
> ⏳ **PO TEST PENDING**. Full ledger: §Rolling-filler batch ledger below.

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

1. **What the raised caps actually are.** The curve is agreed; whether skills
   go to 10, 15, or stay uneven per-skill determines how much of the catalog is
   rewritten — every `damageHPPerLevel` needs rederiving against the new
   ceiling. Blocks Pass 1a.
2. **What refills the freed drop slots.** Deleting Wild strips EliteWolf's 0.5
   kill-drop; a Swift ruling moves Wolf's 0.04 "first drop" moment. Two wolves
   would teach nothing. Blocks Pass 1b item 3.
3. **What "affected the fight" means for passive-ish effects** (decision 4) —
   does a resist aura that never resisted anything count? Does light that lit
   nobody? Blocks Pass 3 item 1.
4. **Swift's fate** (decision 7) — cooldown, deleted, or weakened passive.
5. All new numbers are **[PLACEHOLDER]** until felt in-game: the cost curve
   steps, every `selfDamageHP` value, every retuned radius/dps, pulse
   amplitude and period.

**Round 3 (2026-07-25):**

6. **A shield is preventive, but the mode rule fires reactively.** Round-3
   decision 5 triggers on *"an ally is below `supportThreshold`"* and picks the
   most-wounded ally (the existing `findWoundedAlly` pick), so a guardian shields
   the wolf that is nearly dead rather than the one about to get hit. Might be
   exactly right; might argue for shield-carrying mobs triggering on *"an ally is
   in combat"* instead. **Blocks nothing** — it is a trigger swap inside one
   rule, decidable after it is felt in-game.
7. **What the mode-thrash hysteresis window actually is** — a hold time, a
   tick-boundary-only switch, or both. Needs feeling, not deriving.
8. **Does the pacifist healer's threat table have any consumer?** Decision 4
   says it tracks threat but ignores the attacker. Taunt already reads it
   (`ForceThreatToTop`); nothing else does. If nothing consumes it, the ruling is
   still right for uniformity — but say so explicitly rather than by accident.

**Round 4 (2026-07-25):**

9. **Do the `of max HP` tooltip lines also want an absolute number?** The round-4
   ruling is "show what the player actually will see", and `FirstAid` reads
   `Heal self: 20 % → 25 % of max HP` — correct, curve-free, and *not* what the
   player watches land (≈535 HP at level 30). Adding the absolute alongside the
   percentage is cheap: `max_health` is already client-side for the health bar
   (`Player.ts:69`), needing only the same one-line mirror that
   `setLocalPlayerLevel` got. **Blocks nothing** — additive, decidable once the
   round-4 chunk is felt. It is the *only* line where authored and experienced
   numbers still diverge after that chunk lands.

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
