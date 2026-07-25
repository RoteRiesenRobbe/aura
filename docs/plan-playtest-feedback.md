# Plan: Playtest Feedback (rolling collection)

**Status:** **Collection doc — nothing executed yet.** Triaged, prioritized and
sorted 2026-07-24; no chunk started. This is the **standing home for issues
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

### Adjacent finding — the squad medic (read from code, not yet observed)

`updateAggro` has **two** special-case early-returns, not one: `isFollower`
(`mob.go:826`) and `seekHealer` (`mob.go:834`) — **and they already collide.**
`MedicCompanion` (`api/mobs/medic-companion.json`) carries `HealerAura` but is a
follower, so `isFollower` wins and the healer path never runs for it. Its heal
aura therefore gates on acquiring a **hostile** within heal-aura reach via
`updateCompanionTargeting`, and its `aggroRadius` is a `0.1` dummy, so it cannot
sense a wounded ally at all. Reads as: *the medic heals only while an enemy
happens to be inside its heal radius.* **Needs an in-game check to confirm**
before it is called a live bug; either way it is the same missing abstraction.

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
5. **`MedicCompanion`** — verify in-game first, then fold into the selector.

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

- **Minimap resets on death.** Bug.
- **Damage numbers render in darkness.** Should be suppressed like mob
  nameplates already are — `DarknessOverlay.isHidden()` precedent exists from
  playtest-1 Pass C item 3, which explicitly flagged floating damage numbers as
  *"the one most likely to be noticed next"*. It was.
- **Ctrl +/− still zooms the browser.** `KeyboardManager` calls
  `preventDefault` but evidently not for these.
- **Totem/companion tooltips don't describe the summon's effects** — the
  tooltip reads the caster's `spawn` effect, not the summoned mob's loadout.
  Needs the tooltip to follow the spawn into the mob's own skills.
- **Haste's name promises movement, delivers cadence** (see §Findings).

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
