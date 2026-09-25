# Plan: aura drawbacks and the player CC doors

> **Status: DESIGNED 2026-09-25 (PO session, seven rulings taken as choice
> prompts, §2), nothing built, 2 chunks (§7; C3 merged into C2 the same day).** Line refs pinned to HEAD
> `38bd586f`; re-verify before executing. Ledgers: §11.
>
> Origin: the PO at the skill-VFX C3b/C3c wrap (`docs/feedback.md` row
> 2026-09-25), verbatim: *"I want to ensure we can author auras with drawbacks
> that can offset a higher power level, including self slow, more damage
> taken. I also want mobs to be able to slow players through cooldowns or
> through auras. To me it seems we will need the 'while active' self modifier
> for that."*
>
> **Schema, whole plan: DB NONE · wire +1 enum value (C2: the stunned press's
> rejection reason, `ActivationRejection`) · content +1 category on one effect
> type, +1 effect type, +1 mob, +2 or +3 skill files, pin 116 → 118 or 119.**
> All numbers [PLACEHOLDER].

---

## 1. What this is

Two things the game cannot express today, and one it expresses by accident:

1. **An aura cannot cost its caster anything but resource.** The only designed
   drawback is the per-application self-cost (`costFractionOfMax`, roadmap
   item 1 "costs are effect parameters"). A stronger aura that slows its
   caster, makes them fragile, or doubles their costs while it runs has no
   vocabulary: `speed_aura` refuses a factor of 1 or below and excludes the
   caster by construction (`skills/definition.go:2312-2316`), `slow_aura`
   never reaches the caster, `stat_multiplier` is passive-only and permanent
   (`definition.go:1552`), `tick_rate` below 1 is a cooldown-only self
   tick-slow.
2. **Nothing can slow or stun a player.** `*player` has no `ApplySlow` and no
   `ApplyStun` (`model/player/player.go:807-811`: *"players carry none, the
   get-CC'd direction stays inert, plan-skill-vocab §3.1"*). Every slow aimed
   at a player, from any mob, collides and then fails a type assertion
   (`sys/skills.go:2906`). No cooldown slow type exists at all: the cooldown
   dispatch has `stun`, `calm`, `charm`, but no `instant_slow`.
3. **A self-vulnerability loads by accident.** `resist_aura` with
   `targetsSelf: true` and a factor above 1 is legal (the loader refuses only
   negatives, `definition.go:2081-2109`) and would curse the caster. Nobody
   authors it, nothing tests it, and it is the wrong shape anyway: it is a
   per-tag curse, not "more damage taken".

⭐ **The PO already tried the natural authoring.** On 2026-09-12 a
`stat_multiplier` was authored on an active aura; it loaded clean and did
nothing, because `recomputeDerived` walks `PassiveSlots` only. The
`effectCategories` table was added that day to refuse it
(`definition.go:1491-1508`). This plan makes that authoring legal and live.

## 2. Decision ledger (PO 2026-09-25, taken as choice prompts)

- **D1 · The self modifier is `stat_multiplier` on an active aura, folded
  at switch.** No new effect type, no buff, no pip, no wire. The ACTIVE slot's
  `stat_multiplier` effects fold into `DerivedStats` beside the passives, the
  `light_aura` precedent of a type legal on two categories read as "the
  active aura plus every passive". On and off are instant at `SetActiveAura`.
  Against: a self buff re-applied on the aura's cadence (the `resist_aura`
  `targetsSelf` pattern), which would show a pip but lag one interval on
  switch-off, need a payload, a pip bit (the byte is at 7 of 8) and a Visuals
  row.
- **D2 · Both signs.** An active aura may carry a positive while-active bonus
  (a stance aura: more damage dealt while it runs) as well as a drawback. The
  loader cannot judge power; balance is content judgement.
- **D3 · `instant_slow` joins the cooldown vocabulary in this plan**, the
  `instant_resist` twin, so a mob (or a player) can slow through a cooldown
  as well as through `slow_aura`.
- **D4 · The player stun door is BUILT with the slow door**, not merely
  designed, and in the SAME chunk (C2, merged 2026-09-25). This closes `plan-cc-and-retaliation.md` §8 Q3 ("can a mob stun a
  player?"): yes.
- **D5 · A max-HP drawback clamps current HP to the shrunken pool and accepts
  the hysteresis.** The player gains the mob's per-tick shrink clamp
  (`model/mob/mob.go:1176-1183`: *"leaving health above the cap would render
  as an over-full bar and hand out free effective HP"*), so switching on
  clamps on the next tick with no new hook; switching off leaves the absolute
  HP where it is, so the pool has room to regenerate into. The cheaper cost that follows (every cost is a fraction of max) is a
  content fact, not a bug.
- **D6 · The sim gains one `selfModifier` block on `AuraSpec`** in the same
  chunk as the fold, so a TTK/TTD battery can price a drawback against a
  power step. The batteries drive the real `SkillSystem` against a real
  `*player` (`sim/world.go:115`), so the fold takes effect there the moment
  the spec can author it.
- **D7 · The first carriers are the GIANT SPIDER's.** Two mob cooldowns:
  (a) **a web**: the spider drops a web area, and players standing in it are
  slowed; (b) **Paralyze**: the spider casts the stun it already drops
  (`api/mobs/giant-spider.json:29`), the CC plan's D10 assumption made real.
  Numbers [PLACEHOLDER], the PO re-prices in the editor.

## 3. The design

### 3.1 The while-active self modifier (D1, D2, D5)

**What changes.** Four small edits in `skills/` and one in the loader:

1. `effectCategories[EffectTypeStatMultiplier]` gains `SkillCategoryActiveAura`
   (`definition.go:1552`). The generated `api/skill-vocabulary.json` follows,
   so the editor's Skills tab offers the type on an aura and `smoke.mjs:133`
   keeps agreeing with Go.
2. `recomputeDerived` (`skills/component.go:618`) walks the active aura slot
   AFTER the passives, folding its `stat_multiplier` effects through the same
   six-stat switch. Nothing else from an aura folds: an aura's other effects
   are output effects and keep ticking through `applyAuraEffect`.
3. `SetActiveAura` (`component.go:698`) calls `recomputeDerived()`. It is the
   single choke point: flight takeoff (`core/input.go:397`), the player
   command (`input.go:440-445`), equip (`sys/equip/equip.go:157`), persist
   load (`sys/persist.go:542`, after the slots are restored, so Derived is
   right on reconnect), the mob AI (`mob.go:243`, `support.go:215`) and the
   sim (`sim/world.go:138`) all pass through it. The revision bump it already
   does re-streams the owner block.
4. The two derived factors that floor a negative bonus at zero stop doing so:
   `DamageReductionFactor` (`component.go:273`, comment: *"a negative bonus
   cannot be authored, and would read as increased damage taken if it ever
   were"*) and `CostFactor` (`component.go:302`). ⛔ Both comments claim a
   rule the loader never enforced; a negative bonus loads today and is
   silently eaten. Lifting the floor is what makes "more damage taken" and "a
   cost multiplier" exist. The upper clamp at 1 (free, fully mitigated) stays.
5. **New loader bounds, on the active-aura form only** (`definition.go:2575`):
   `statBonus` at every level within `[−0.9, +1]` [PLACEHOLDER] for
   `movementSpeed` and `maxHealth` (a bonus of −1 is a stun or a dead pool
   through the back door), and within `[−1, +1]` for `damageReduction` and
   `costReduction` (damage taken caps at 2×, cost at 2×). The passive form
   keeps its current rules (any non-zero bonus loads).

**Where it lands, with no new consumer.** Every reader already composes the
derived factor at its consumption site, on both entity kinds:

| Stat | Player reader | Mob reader |
| --- | --- | --- |
| `movementSpeed` | `core/input.go:475` | `mob.go:1375` (`stepLength`) |
| `maxHealth` | `player.go:332` (`poolFactor`) | `mob.go:1890` |
| `damageReduction` | `player.go:384` (`takeDamage`) | `mob.go:1959` |
| `damageDealt` | the damage sites via `DamageFactor` | same |
| `costReduction` | `sys/skill_cost.go:52-66` | mobs never pay (L5) |
| `critChance` | `sys.rollHitDamage` | same |

A self-slow therefore composes MULTIPLICATIVELY with a mob's slow on the same
player (`Derived.MovementSpeedFactor() × buffs.MovementFactor()`), which is the
existing rule for a Swift passive against a Slow aura; nothing new to decide.

**The max-HP clamp (D5).** Players have no shrink clamp today: `MaxHealth()`
is derived, current HP is absolute, and the only cap sites are regen
(`player.go:486`, `AddCapped`) and reconnect (`sys/state.go:995`). Mobs clamp
the derived pool every tick (`mob.go:1176`). C1 gives the player the mob's
per-tick clamp, one site in the player's update path beside regen, so every
way the pool can shrink (this fold, an unequipped passive) is covered by one
rule rather than by a clamp at each of `SetActiveAura`'s six callers.
Switch-off leaves
HP absolute: a player at 80 % of the old pool regenerates the rest, exactly as
a summon whose owner levels grows room to regenerate into (`mob.go:1885-1887`).

**Cost interplay, both directions stated.** A cost multiplier above 1 meets
two existing rules: an aura's cost is clamped at the never-kill floor
(`skill_cost.go:79-95`, the caster is never killed by their own aura, only
starved), and a cooldown whose summed cost is unaffordable is REJECTED at the
press rather than discounted (`canAfford`, `skill_cost.go:116-122`, D9 "no
silent reduced-price cast"). So a doubled cost can make a cooldown
uncastable at low HP; that is a feature the content author must know. A
max-HP drawback lowers every cost proportionally, the other way round.

**Visibility.** The drawback is on the tooltip only (D1). `SkillTooltip.ts:532`
already renders `stat_multiplier`; C1 checks it renders on an aura and reads
a negative bonus as a drawback, not as "−20 % movement speed" in the bonus
colour. No pip, no ring change, no Visuals row. ⚑ If play shows the drawback
needs to be READ on the character rather than on the tooltip, that is a §39
entity-presentation question, not a reason to switch to the buff mechanism.

**Mobs share it.** `recomputeDerived` is the mob's too, so a mob aura carrying
a `stat_multiplier` moves that mob's pool, speed, or damage while the aura is
on. No content does this; it is a landmine for the tier + baseline pricing
rule (§10 L4), not a feature this plan uses.

### 3.2 The player slow door and `instant_slow` (D3)

**The door.** `*player` gains `ApplySlow(source, fraction, ticks) bool`
delegating to `p.buffs.ApplySlow`, the mob's shape minus the `ccImmune` gate
(players are never immune; a CC-immunity passive would be its own content
ask). That is the whole door: `applySlowAura` (`sys/skills.go:2890-2921`)
already asserts `slowable` on every collision target, `MovementFactor()`
(`player.go:694`) already composes the strongest slow with the speed buffs,
`core/input.go:475` already multiplies the step by it, `Character.applied_effects`
(`api/schema/server.fbs:556`) already carries the Slow bit, and `EffectPips.ts`
already draws it. Movement is server-authoritative (the client reads
`movementSpeed` only for the camera vehicle, `Camera.ts:37`), so the slowed
player simply arrives slower on the wire. **Wire NONE, client NONE.**

⚑ **Who relied on the inertness, checked at HEAD:** nobody. The only reader of
`Derived.RetaliateSlow` is the player's own `retaliate()` (`player.go:879`,
the player slowing an attacking mob); mobs have no retaliate consumer, and the
three mob files naming FrostShield (`troll.json:31`, the two ascension stones)
hand it out as a drop or a reward, never equip it. Opening the door changes
no shipped encounter until D7's content lands.

**Combat entry, target side.** `applySlowAura:2913-2916` notes that the player
TARGET of a slow should enter combat and is not stamped today because no door
existed. C2 stamps it: a slowed player is in combat (no regen) even before the
first bite, the same rule a damaged player follows. The caster side stays as
built (a mob caster is skipped by `noteHarmDealt`).

**`instant_slow`**, the `instant_resist` twin: a cooldown effect with
`radius`, `selector`, `maxTargets`, `targetsEnemies`/`targetsAllies`,
`slowFraction` (+ `PerLevel`), `slowDurationTicks` (+ `PerLevel`), `targetFaction`.
Go: payload struct, `effectKeys` allowlist, validator (fraction in `(0, 1]`,
duration ≥ 1), `effectCategories` cooldown-only, a `fireCooldown` case that
selects targets and calls `ApplySlow`, reporting "hit" only when something
was freshly slowed (the `applyStun` shape, `sys/skills.go:2512-2542`).
Frontend: the two hand-syncs the manual names (`Skills.ts` params interface,
`SkillTooltip.ts` case). Wire NONE: the buff is a `slowPayload`, whose pip bit
exists.

**Also in C2, because the door makes it reachable:** `slow_aura` is the one
payload builder with no load-time numeric bound (`definition.go:1871-1872`;
`applySlowAura` clamps at runtime). C2 gives it the same `(0, 1]` bound
`retaliate_slow` already has (`definition.go:2381`).

### 3.3 The player stun door (D4)

**The door.** `*player` gains `ApplyStun(source, ticks)` and `Stunned()`,
delegating to the buff store. What already follows from that, with no further
code: `MovementFactor()` short-circuits to 0 while stunned (`buffs.go:744`),
so the input step stops; `SkillSystem.processEntity` (`sys/skills.go:230-236`)
already returns early for any `stunSuppressible` entity, so the player's aura
stops ticking and their cooldown timers freeze, the mob rule A6.

**What does NOT follow, and C2 adds:** the input-side activations. A stunned
player must be refused at the press for a cooldown activation, flight takeoff
and interaction (`core/input.go`, the sites that read the wire command), with
`ActivationRejected` carrying a reason so the HUD can say why (the existing
rejection channel, `player.go:580`). ⚑ **That reason is a wire enum**
(`model/player.go:35-48` mirrors `AuraApi.ActivationRejection`,
`server.fbs:837`), and none of the shipped values fits a stun, so C2 adds
`ActivationRejectionStunned`: +1 enum value in `server.fbs`, regenerated
bindings, and the client's feedback string. The plan's only wire change. An aura SWITCH while stunned is allowed:
it is a state flip, not a cast, and the switched-to aura does not tick until
the stun ends anyway.

**The pip conflation is accepted, again.** A stun borrows the Slow bit
(`skills/applied_effects.go`, the CC plan's D6) and the byte is at 7 of 8. A
stunned player shows the slow pip and cannot move; the split is §39's
(`plan-entity-presentation.md`). ⚑ Unlike a mob, the own player FEELS the
difference (input goes dead), so the conflation costs less here than on mobs.

**A stun is not a very strong slow**, and the doc says so because a
drawback can now author `movementSpeed −0.9`: the two are separate axes
(`buffs.go:132-139`). A player at 10 % speed still casts; a stunned player
does not.

### 3.4 The giant spider's two cooldowns (D7)

Both ride machinery that is pinned but unused by mob content:

- **Mob cooldowns fire from `processCooldowns`** (`sys/skills.go:1461-1470`):
  a ready slot fires every tick and is consumed only when `fireCooldown`
  reports it hit something, *"so the mob keeps it ready until a target
  wanders into range"*. Three mob cooldowns ship (mammoth stomp, bomb burst,
  warlord frenzy).
- **A mob-cast `spawn` enlists the summon under the mob's allegiance**
  (`sys/skills.go:2749-2756`, *"No mob equips a spawn skill in shipped
  content today ... the path is real"*), and `ttlTicks` expires it.

**(a) The web.** Three content files and one guard:

| File | Shape |
| --- | --- |
| `api/skills/mobs/spider-web.json` | cooldown, `spawn` of `SpiderWeb`, `ttlTicks` [PLACEHOLDER ≈ 240], `cooldownTicks` [PLACEHOLDER ≈ 600] |
| `api/mobs/spider-web.json` | the FireTotem shape (`api/mobs/fire-totem.json`): role `structure`, tier normal, `speed 0`, `xpFactor 0`, a body the player can walk through (the poison pool's `collisionLayer 32`, Viewport only, no PlayerStatic bit, so nothing collides with it; mask Border only), `skills: [SpiderWebAura]` |
| `api/skills/mobs/spider-web-aura.json` | active aura, one `slow_aura`, `radius` [PLACEHOLDER ≈ 1.5], `slowFraction` [PLACEHOLDER 0.4], `targetsEnemies`, a `tickInterval` short enough that leaving the web frees you within a second |

The web's `slow_aura` reaches whatever is hostile to the spider's faction,
players through the C2 door (the spider and its kin are allies of the web by
enlistment; a townsfolk NPC wandering in would be slowed too, which is fine). A player who
leaves the web is free one buff lifetime later (interval + 1 ticks, the
standard aura rule), which is the "inside that area" the PO asked for with no
new mechanism: **the web IS a poison pool that slows.**

⛔ **The guard: a mob-cast spawn always "hits".** `spawnSummon` reports
success whenever placement succeeds, so under the rule above a spider would
drop a web every time the cooldown is ready, in or out of combat, forever,
while wandering. C2 adds one condition for the mob branch of
`processCooldowns`: a mob fires a `spawn` cooldown only while it has an aggro
target (the same "a target is in range" intent the comment states, applied
to the one effect type that cannot test it by hitting). ⚑ Whether a DORMANT spider's `processCooldowns` still runs is not verified
(a slept mob is out of `phy.Space`, but the SkillSystem's entity list is its
own); C2 checks it, and the guard covers the awake, idle one either way.

**(b) Paralyze.** `api/mobs/giant-spider.json` equips `Paralyze` (skill 140)
as a second cooldown beside GiantVenomSpit, at a loadout level [PLACEHOLDER 1].
The file needs no twin: its `stun` effect is `targetsEnemies`, mobs pay no
cost (L5, `self_buff_capabilities_test.go:101-110`), and `processCooldowns`
consumes it only on a hit. The counter the spider taught by dropping it now
comes from the spider first.

⚑ **Content census pins.** A new mob file reddens the three `items/mobs`
census tests and the three `cmd/simharness` placement pins (CLAUDE.md, Open
items); a new skill file moves the registry pin 116 → 119. Both are the
chunk's bookkeeping, not defects.

### 3.5 GOD and cheats

GOD short-circuits `takeDamage` (`player.go:386-388`). C2 extends the same
short-circuit to both CC doors: a GOD player refuses `ApplySlow` and
`ApplyStun`, returning "not fresh". Cheat testing of a spider fight under
GOD then still walks and casts; `DAMAGE <pct>` is unaffected. The drawback
fold is NOT gated by GOD (a self-slow under GOD still slows: it is the
player's own aura, and the cheat is about the incoming side).

### 3.6 The sim knob (D6)

`sim.AuraSpec` (`sim/scenario.go:9-66`) gains an optional `selfModifier`
block, the six stat names to a bonus, folded onto the synthetic
`SkillDefinition` as `stat_multiplier` effects. `Scenario.definition()`
already builds the same `skills.EffectDef` shape the loader would, and the
sim player's `SetActiveAura` goes through the fold, so a TTK battery with
`damageHP × 1.5` and `damageReduction −0.5` answers "does the drawback offset
the step" with no re-modelled math. No slow or stun field on `MobSpec`: the
batteries stay 1 player vs N mobs and cannot see a CC either way (the
standing caveat, CLAUDE.md watch items); pricing the spider's web is an
in-game judgement.

## 4. Current state, facts this plan stands on (verified 2026-09-25, HEAD `38bd586f`)

1. `recomputeDerived` (`component.go:618-690`) walks `PassiveSlots` only;
   called at `component.go:481, 488, 608, 816` (equip, unequip, level), NOT at
   `SetActiveAura` (`698-707`), which resets the accumulator and bumps
   `revision`.
2. `DamageReductionFactor` and `CostFactor` clamp the bonus to `[0, 1]`;
   `MaxHealthFactor`, `MovementSpeedFactor`, `DamageFactor` are `1 + bonus`,
   unclamped. The loader refuses an unknown stat and a both-zero bonus
   (`definition.go:2575-2580`); a negative bonus loads.
3. The buff store composes: slow = strongest fraction across every stream
   (`buffs.go:692`), speed = per skill furthest from unity, across skills
   multiply (`712`), `MovementFactor = Speed × (1 − Slow)`, 0 when stunned
   (`740-752`). Aura-applied buffs live `tickInterval + 1` (`buffs.go:20-28`).
4. `*player` implements neither `slowable` nor `stunnable`; the assertion
   sites are `sys/skills.go:1424` (slow), `2492-2504` (stun), `230-236` (stun
   suppression), all structural, all satisfied by `*mob.Mob` only.
   `TestRealEntitiesSatisfyTheSelfBuffCapabilities`
   (`sys/self_buff_capabilities_test.go:34-62`) is the pin shape to extend.
5. `Character.applied_effects` (`server.fbs:556`) mirrors `Mob.applied_effects`;
   `EffectPips.ts` draws Slow (bit 1) for both. Stun reuses the Slow bit; bits
   used 7 of 8.
6. Movement is server-side (`core/input.go:466-481`); the client sets position
   from the snapshot (`Player.ts:updateFromBackend`).
7. Slow carriers at HEAD: Slow (4), Hoarfrost (146), Suppression (59),
   Warbanner (55), the omni trio; FrostShield (139, `retaliate_slow`);
   Paralyze (140, `stun`). **Every one is a player skill**; no mob equips a
   slow or a stun. The shaman teaches Slow, the ranged bandit drops it.
8. `stat_multiplier` authored: Discipline (`costReduction`), Tough
   (`damageReduction`), Swift (`movementSpeed`), OmniPassive (all).
9. A respawn builds a fresh player struct, so buffs (a slow, a stun) die with
   the character (`player.go:193, 248, 1395-1400`); reconnect clamps HP to
   max (`sys/state.go:995`).
10. The sim drives the real `SkillSystem` (`sim/world.go:115`); `AuraSpec`
    carries damage, dot, crit and cost fields only.

## 5. Schema impact (stated per the standing rule)

- **DB: NONE, all chunks.** `DerivedStats` is recomputed from the persisted
  loadout on load (`persist.go:542` → `SetActiveAura` → fold); buffs are not
  persisted; the new content is files.
- **Wire: NONE in C1, +1 enum value in C2** (`ActivationRejectionStunned`,
  §3.3). The fold is invisible on the wire beyond the values it already
  changes (`max_health`, position deltas, the owner block's revision). A
  player slow and stun ride `Character.applied_effects`' existing Slow bit.
  `instant_slow` grants a `slowPayload`.
- **Conf: NONE.**
- **Content:** `stat_multiplier` legal on `active_aura` (+1 category, the
  vocabulary golden moves); `instant_slow` (+1 effect type, `effectTypeMap`
  34 → 35); `SpiderWeb` (+1 mob, census pins); `spider-web`,
  `spider-web-aura` (+2 mob skills) and the first drawback aura (+1 skill or
  an edit, §8 Q1); registry pin 116 (78 player + 38 mob,
  `skills/registry_test.go:241`) → 118 or 119; GiantSpider +2 cooldown slots.

## 6. Interplay

- **With the tier + baseline rule.** A mob aura carrying `maxHealth` moves the
  mob's pool while the aura is on; the placement re-price is by definition.
  No content does it; L4.
- **With `resist_aura` + `targetsSelf` above 1.** Still legal after this plan
  (a per-tag self-curse is a different, narrower shape). C1 pins it as
  UNAUTHORED rather than refusing it, so a future "you burn hotter but take
  fire worse" aura has a door. ⚑ If the PO would rather close the accident,
  it is a one-line loader rule (§8 Q4).
- **With the skill-VFX ambient reconciler.** A drawback draws nothing; an
  aura's `visual` is unaffected. The editor's Visuals builder needs no row.
- **With `plan-cc-and-retaliation.md`.** §8 Q3 is resolved by D4 (this plan,
  C2). Stun A5/A6 (threat kept, timers frozen) hold for players where they
  apply (a player has no threat table).
- **With CC immunity.** Players have none. A future "CC resistance" passive is
  a `Derived` field read by the two doors, one chunk, not designed here.
- **With `plan-area-effects.md` E3.** The web is NOT an area effect: it moves
  with nothing, spawns at a mob, expires by TTL, and the poison-pool shape
  already does all three. An authored web polygon in a zone (a cave lair)
  would be E3's `effect` key carrying a slow, which E3 can add once
  `instant_slow`'s payload exists; out of scope here.
- **With the summon cap.** `minions` counts a player's summons; a mob's web
  binds no owner, so no cap applies; the TTL and the cooldown are the cap.

## 7. Chunk breakdown

Each chunk is its own execution session, plan-first, TDD, with the verify
tail below. Two sessions: C1, then C2 (the CC doors, D4).

### C1: the while-active fold (§3.1, §3.6)

Go: `effectCategories` +1; `recomputeDerived` walks the active slot;
`SetActiveAura` recomputes and its model-side callers clamp HP (D5); the two
floors lifted; the active-aura loader bounds; the sim `selfModifier` block.
Frontend: the tooltip renders a drawback on an aura. Content: the first
drawback aura (§8 Q1). Docs: `manual-content-authoring.md` §2 category table
(+ "while active" paragraph), the `add-content` skill, the vocabulary golden.

Tests (red first): fold on switch-on, gone on switch-off and on `-1`; the
2026-09-12 file shape loads AND acts; a negative `damageReduction` raises
damage taken on both kinds; a negative `costReduction` raises the cost and
meets the never-kill floor and `canAfford`; HP clamps on switch-on and stays
absolute on switch-off; the loader refuses each out-of-bound; persist
round-trip lands the fold; the sim knob moves a TTK.

In-game: equip the drawback aura, switch on: the tooltip states the drawback,
the walk slows or the pool shrinks, the cost floats bigger; switch off:
instant restore, HP stays where it was.

### C2: the player CC doors, `instant_slow`, the spider's web and Paralyze (§3.2-§3.5)

Merged from two chunks on 2026-09-25 (PO: "rather too few than too many"):
the stun door is the slow door's shape on the same file, the same capability
pin and the same GOD refusal, and the spider file is edited once for both
cooldowns.

Go: `player.ApplySlow` and `player.ApplyStun` / `Stunned`, both refused under
GOD; the target-side combat stamp; `instant_slow` end to end; the `slow_aura`
bound; the mob-spawn combat guard; the press-side refusals for a stunned
player with `ActivationRejectionStunned` (+1 wire enum value, regenerated
bindings); the real-entity capability pin extended with both doors.
Frontend: the two `instant_slow` hand-syncs, the rejection string. Content:
`spider-web`, `spider-web-aura`, `SpiderWeb`, GiantSpider's two new cooldown
slots (the web, Paralyze); census and placement pins re-derived. Docs: the
manual's cooldown list and stun paragraph, `content-mobs.md`'s spider row.

Tests: a mob `slow_aura` slows a real `*player` (the fake-passes-real-fails
trap, `self_buff_capabilities_test.go:26-30`); GOD refuses both doors; a
slowed player is in combat; `instant_slow` hits, refreshes, is consumed only
on a hit; an idle spider drops no web, an aggroed one does, the web expires;
the web's aura slows a player inside and frees them within one lifetime
outside; a stunned player does not move, does not tick their aura, cannot
press a cooldown, cannot take off, CAN switch auras; the stun expires on its
own and dies with the character; the spider's Paralyze fires only on a hit.

In-game: fight a giant spider: a web appears near it, walking through it is
visibly slower with the pip lit, stepping out frees you; its Paralyze lands:
input dead for the duration, the HUD names the refusal on a press, the stun
ends, a respawn is clean; wander past a spider out of aggro: no webs.

### Verify tail, every chunk

`go build ./...` · `make -C backend build` first (the Go tests read the EMBEDDED content, so
`cp-defs` must run after every `api/` edit) · `go test -count=1 -timeout 60s ./...` ·
`aurad -validate` both ways · `npm test` + `npm run typecheck` · the editor
harness (C1: the category table) · the `verify` skill's headless smoke · the
in-game checklist above · the schema line restated in the ledger.

## 8. Open questions (carried, not blocking C1)

1. **Which PLAYER aura carries the first drawback?** C1's in-game check is a
   player switching a drawback on and off, so the carrier must be a player
   aura. Options: (a) a NEW cheat-only aura authored for the check (no unlock
   source, the omni trio's pattern; the omni-aura itself could gain one);
   (b) an existing player aura the PO names and re-prices upward to earn it.
   Recommendation: (a) for C1, (b) as PO content afterwards. ⚑ **Ember Aura is
   the bandit pyromancer's MOB aura** (`api/skills/mobs/ember-aura.json`,
   equipped by `bandit-pyromancer.json`), whose output roughly doubled at
   C3a-ii unmeasured; giving IT a `damageReduction` drawback is a mob
   re-price in L4 territory with no player-side check, a separate content
   call once the fold exists.
2. **The loader bounds' numbers** (§3.1 item 5) are placeholders; the floor of
   −0.9 on movement is the one that matters (−1 is a stun through the back
   door).
3. **Does a stunned player's HUD need more than the rejection reason?** The
   pip is a slow pip. A stun-specific read is §39's.
4. **Close the `resist_aura` + `targetsSelf` above-1 accident, or leave the
   door?** §6 recommends leaving it, pinned as unauthored.
5. **Web placement.** `summonPosition` rings the caster at a gap; a web
   "dropped" under the spider might read better at the spider's own position.
   A content look, decided in C2's in-game pass.

## 9. Proposals adopted without a choice prompt (PO may veto any)

- **A1 · The fold walks the active slot only**, never every equipped aura:
  an equipped-but-off aura has no drawback, or the loadout would pay for
  auras it is not running.
- **A2 · The HP clamp is the mob's per-tick rule given to the player**, one
  site in the player's update path, not a clamp at each of `SetActiveAura`'s
  six callers and not inside `SkillComponent`, which owns no vitals.
- **A3 · Both CC doors refuse under GOD** (§3.5), mirroring `takeDamage`.
- **A4 · A slowed player enters combat** (§3.2), the target-side stamp the
  code comment already asks for.
- **A5 · A mob's `spawn` cooldown fires only with an aggro target** (§3.4),
  the guard without which the web litters the world.
- **A6 · Paralyze is equipped by the spider as the SAME file**, no mob twin:
  its target flags and cost model already fit a mob caster.
- **A7 · An aura switch while stunned is allowed**; presses are refused.
- **A8 · The passive form of `stat_multiplier` keeps its current loader
  rules**; the new bounds apply to the active-aura form only, so no shipped
  passive can be refused by C1.

## 10. Landmines

- **L1 · The floors were never a loader rule.** Two comments say a negative
  bonus "cannot be authored"; `statParams` never checked the sign. C1 must
  add the bound BEFORE lifting the floor, or a negative passive bonus that
  loads today becomes live the same commit.
- **L2 · The fake-passes-real-fails trap** (`self_buff_capabilities_test.go`):
  every test in C2 that puts a slow or stun on a player must use the real
  `*player`, and the real-entity pin must gain both doors, or a green suite
  proves nothing (it happened for lifesteal, R3).
- **L3 · `persist.go:542` runs `SetActiveAura` after equip.** If the fold
  ever moves to equip time instead, a reconnect would fold the wrong slot;
  keep it at switch.
- **L4 · A mob aura with a `stat_multiplier` re-prices the mob** the moment it
  switches on (pool, speed, damage). Nothing authors it; the `add-content`
  skill must say so.
- **L5 · The mob spawn guard changes nothing shipped** (no mob equips
  `spawn`), but it is a behaviour change on a pinned path
  (`sys/skills.go:2749-2756` says the path is real and tested); the existing
  test must be read for what it asserts before the guard lands.
- **L6 · Census and placement pins** (three + three) redden on the `SpiderWeb`
  file; re-derive, do not increment.
- **L7 · `cp-defs` after every `api/` edit**, or the embedded copy the Go
  tests read is stale (`-count=1` does not help for content).
- **L8 · `slow_aura`'s new bound is measured against shipped content:** at
  max level Slow and Hoarfrost reach 0.5, omni-aura 0.38, Suppression 0.35,
  Warbanner 0.22 (fraction + (maxLevel − 1) × perLevel, 2026-09-25). Nothing
  is near 1, so the bound refuses no file; re-measure if a carrier gained
  levels since.
- **L9 · The camera vehicle's max speed** is `movementSpeed × 2` on the
  client (`Camera.ts:37`), a constant; a heavy self-slow does not change it
  and a strong sprint under a drawback might outrun it. Check in C1's in-game
  pass.

## 11. Chunk ledgers

(none yet)
