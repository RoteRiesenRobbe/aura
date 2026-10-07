# Plan - effect types round 2: buffs on others, empower, stealth, fear, charge, thorns on others, death triggers

**Status:** DESIGNED + PO-RULED 2026-10-07 (planning session, docs only,
nothing built). D1-D10 PO-ruled, D11-D29 mine (flag if wrong). 8 chunks, C0
first, the rest mostly independent. **Sequenced AFTER buff tray C3** (D10).
**Schema: DB NONE · wire YES (C0 widens two fields; C1, C2, C4-C6 add bits) ·
conf NONE · content +6 effect types, +1 stat, +1 mob key, +1 example skill per
chunk · client YES (pips, tray kinds, the stealth look).** Ledger: §10.

Line refs are as of `d35ab702`, from four code surveys run 2026-10-07. Re-verify
them before executing a chunk.

**Origin.** The PO's 2026-10-07 session counted how many WoW Classic class spells
Aura can emulate (386 spells, from the 2026-09-29 survey: 167 clean, 114 rough,
67 not buildable, 38 not applicable; the list and the ranking are in
`research-wow-classic-coverage.md`), then ranked the missing effect types by
how many spells each one unlocks. The PO picked, verbatim: *"stat buff / debuff
on others including players and mobs; empower next cast; stealth (towards mobs
only, though it should include an effect to display on the token); threat
increase as an effect; fear as an ability that players can use on mobs and mobs
can use on players; death triggers on mobs i.e. spawning things on death,
exploding on death etc; charge to the closest enemy; Thorns on others"*.

The tank aura from the same session (tick damage + more threat + the group takes
less damage) becomes pure content after C1. It is the acceptance example.

All numbers are [PLACEHOLDER].

---

## 1. What this adds

| # | What | Form | Chunk | WoW spells it serves (examples) |
|---|---|---|---|---|
| 1 | Stat buff/debuff on others | `stat_aura` (aura) + `instant_stat` (cooldown), the resist pair's shape | C1 | Battle Shout, Blessing of Might, Leader of the Pack, Demoralizing Shout, Curse of Weakness, Recklessness |
| 2 | Threat increase | a new stat, `threat`, valid on #1 AND on `stat_multiplier` | C1 | Righteous Fury, Defensive Stance's threat, Blessing of Salvation (negative) |
| 3 | Thorns on others | `retaliate_burst` gains target flags; mobs can wear it | C2 | Thorns, Retribution Aura, Blessing of Sanctuary |
| 4 | Charge | `charge` (cooldown) | C3 | Charge, Intercept, Feral Charge |
| 5 | Empower next cast | `empower` (cooldown) | C4 | Nature's Swiftness, Presence of Mind, Inner Focus, Cold Blood, Divine Favor, Amplify Curse |
| 6 | Fear | `fear` (cooldown), players on mobs and mobs on players | C5 | Fear, Psychic Scream, Intimidating Shout, Howl of Terror, Turn Undead |
| 7 | Stealth | `stealth` (cooldown), towards mobs only, shown on the token | C6 | Stealth, Prowl, Vanish (and the openers become positional plays) |
| 8 | Death triggers | an `onDeath` key on a MOB file, naming skill files | C7 | (mob design: adds on death, death explosions, a totem that bursts at expiry) |

Six new effect types (`stat_aura`, `instant_stat`, `charge`, `empower`, `fear`,
`stealth`), one widened type (`retaliate_burst`), one new stat (`threat`), one
new mob key (`onDeath`). Death triggers are deliberately not an effect type
(D27).

## 2. The finding that makes C0: the wire is full

Two presence bitfields carry buff state to the client, and neither has room:

- **`applied_effects:ubyte`** on Mob and Character (`api/schema/server.fbs:483`,
  `:635`; Go `skills/applied_effects.go:12-24`). It feeds the pips over every
  other entity. **All 8 bits are used.** Lifesteal and shields already go without
  a pip for lack of a bit.
- **`EffectKind : ushort`** (`server.fbs:899`; Go `skills/own_effects.go:19-33`).
  It feeds the own player's buff tray. **12 of 16 bits are used**, 4 free.

This plan needs 5 new tray kinds (StatUp, StatDown, Empower, Fear, Stealth;
thorns reuses Reflect) and at least 5 new pips (StatUp, StatDown, Fear, Stealth,
Reflect). Stealth MUST be visible on the token (PO). So **C0 widens both fields
and changes nothing else**: `applied_effects` ubyte to ushort, `EffectKind`
ushort to uint.

This pulls item 7 of `plan-entity-presentation.md` §6 ("widen the full ubytes")
forward. That plan's other items stay there: the stun/slow conflation (item 2),
durations on the wire (item 1), and the `aura_category` ring byte (also full;
none of these types needs a ring colour). The 2026-08-15 effect-types
ruling blocked stealth "on §39", meaning on the wire. C0 removes that block.

## 3. PO rulings (2026-10-07)

- **D1 - Stealth breaks on damage dealt OR taken**, and has an authored duration
  cap. Because the active aura ticks on its own, a stealthed player running a
  damage aura reveals themself on the first tick that lands. Sneaking means
  switching to a non-damage aura first. This is intended.
- **D2 - Stealth drops existing aggro.** On entering stealth every mob clears
  the player's threat row and target (the F9 ruling, "mobs drop aggro"), and no
  mob acquires the player while stealth lasts. So stealth is also an escape
  (Vanish).
- **D3 - Stealth is towards mobs only.** Other players see the stealthed player
  (translucent token, D24). No per-viewer hiding (effect-foundations F9 stands).
- **D4 - Fear shares the stun ladder.** Fear and stun are one hard-CC family:
  100 %, 50 %, 25 %, then refused until 540 ticks after the last one ended
  (`skills/buffs.go:575-610`). Two mobs cannot chain fear into stun.
- **D5 - Fear runs both ways.** Players fear mobs, mobs fear players. On a
  player the SERVER moves them away from the fearer and ignores their movement
  input (the server owns player movement; the client does not predict).
- **D6 - Death triggers fire on every death except a despawn.** Health reaching
  0 from any source (player, mob, area) AND a summon's timer running out (a
  totem can burst when it expires). NOT when a summon is retired because its
  owner left, and NOT on a scripted encounter despawn.
- **D7 - Empower grants any mix of four things:** instant cast, free (no cost),
  guaranteed crit, and a damage/heal multiplier. Each empower skill authors
  which ones.
- **D8 - Threat is a stat, not an effect.** A new `threat` stat multiplies the
  threat the holder generates. It is valid on the new stat buff (self, allies,
  enemies) and on the existing `stat_multiplier` (passive, and while-active on
  an aura). No flat threat aura.
- **D9 - Stats on others: `damageDealt`, `damageReduction`, `critChance`,
  `threat`.** Not `maxHealth` (pool changes mid-fight need a clamp rule and
  re-price mob placements), not `costReduction` (only matters to whoever pays),
  not `movementSpeed` (speed on others already exists: `speed_aura`,
  `speed_burst`, slows).
- **D10 - After buff tray C3.** C0 touches the same tray bits C3 reads.

## 4. Design decisions (mine, flag if wrong)

### Stat buff on others (C1)

- **D11 - The resist pair is the template.** `stat_aura` mirrors `resist_aura`
  (an active aura, target flags + `targetsSelf`, selector, `maxTargets`,
  `buffLifetimeMatchesInterval`, charged only on a genuinely new application);
  `instant_stat` mirrors `instant_resist` (a cooldown, a query circle, an
  authored `statDurationTicks`). One payload, `statPayload{stat, bonus}`, in
  `skills.Buffs`.
- **D12 - Any sign on any target.** A positive `damageDealt` on allies is a
  shout, a negative one on enemies is a demoralize. The loader bounds each stat
  at every level as `stat_multiplier` already does. The sign decides the tray
  side: two kinds, StatUp and StatDown, because `BuffTray.ts` sorts by kind
  (`HARMFUL_KINDS`).
- **D13 - Stacking follows the speed rule.** The same skill refreshes its own
  stream; within one skill the strongest stream counts; different skills add
  per stat (bonuses are additive in `DerivedStats` too). A total `damageDealt`
  factor is floored at a [PLACEHOLDER] 0.1, never 0 or below.
- **D14 - Buffs are read beside `Derived`, never folded into it.**
  `recomputeDerived` is a pure fold of equipped slots
  (`skills/component.go:611-684`); a timed buff must not enter it. Each read
  site multiplies in a new `Buffs.StatBonus(stat)`:
  - `damageDealt`: `casterDamageFactor` (`sys/skills.go:876`), one shared site
    for players and mobs.
  - `critChance`: `casterCritChance` (`sys/skills.go:894`), shared.
  - `damageReduction`: `player.takeDamage` (`model/player/player.go:388`) and
    `Mob.takeDamage` (`model/mob/mob.go:1963`).
  - `threat`: see D15.
- **D15 - Threat is applied where threat is written.** `Mob.noteThreat`
  (`mob.go:1658`) and the exported `NoteThreat` (`:1706`) multiply the amount by
  the SOURCE's threat factor (`Derived` + buffs). That covers damage threat and
  healer threat. `ForceThreatToTop` (taunt) is untouched: a taunt sets a margin,
  not an amount. A summon's threat uses the summon's own factor (the existing
  "acting entity's own stats" rule).

### Thorns on others (C2)

- **D16 - Extend `retaliate_burst`, do not add a type.** It is already a timed
  reflect buff (`reflectPayload`, `skills/buffs.go:114`). It gains
  `targetsAllies` + `targetsSelf` and a radius/selector. This follows the
  speed pair's D8 precedent ("extend, don't add a type"). Absent target flags
  keep meaning false, as on every other effect (Sanctuary relies on it); C2
  adds `"targetsSelf": true` to the two shipped files (`omni-strike.json`,
  `retribution.json`) so nothing shipped changes, and the loader refuses a
  `retaliate_burst` with no target at all. The reflect is a fraction of the incoming hit. A flat thorns
  value would be one more payload field; not built until content asks for it.
- **D17 - Mobs can wear it.** Today `retaliate` exists only on `*player`
  (`player.go:935`) and `ApplyReflect` only on the player (`:778`). C2 adds
  `Mob.ApplyReflect` and a mob-side reflect in `Mob.PlayerTouches` and
  `Mob.MobTouches`, so a shaman can put thorns on a bear. The reflected hit goes
  through the attacker's normal touch door, so it builds threat and pays kill
  credit like any hit.

### Charge (C3)

- **D18 - Charge = pick the nearest enemy, then dash to it.** Params:
  `radius` (search), `selector: nearest` fixed, the stepped static probe
  `applyDash` already uses (`sys/skills.go:2240-2287`), stopping at contact
  distance. No enemy in range: the activation precondition refuses the cast (no
  cost, no cooldown, the rejection reason the HUD already shows), like other
  per-effect gates.
- **D19 - Player-only in C3.** `applyDash` refuses mob casters today, and mobs
  are dynamic bodies the static probe ignores. The mob door is recorded in §6,
  not built. Effects after `charge` in the same skill (a stun, a hit) fire in
  the same tick from the landing position (`fireCooldown` runs effects in
  authored order, `sys/skills.go:2035-2205`).

### Empower (C4)

- **D20 - Empower is player-only and touches only cooldowns.** Mobs have no
  cast time and pay no cost. Auras and utilities never consume it. The buff
  carries `{instant, free, crit, factor}` and an authored lifetime.
- **D21 - Read where each thing is decided, consume once on fire.** Instant:
  the cast-time branch (`sys/skills.go:1602`). Free: BOTH reads of
  `cooldownCostHP` (`activationPrecondition` at `:1699` and `fireAndCharge` at
  `:1696`). Crit: `casterCritChance` returns 1. Factor: multiplies damage and
  healing from that cast. The buff is consumed in `fireAndCharge` after
  `fireCooldown`. A cancelled cast does not consume it. The empower skill's own
  cast never consumes it (it is applied inside that fire).

### Fear (C5)

- **D22 - Fear is a moving stun.** The feared entity cannot cast, its aura
  cadence freezes (the `stunSuppressible` gate, `sys/skills.go:239`), and it
  moves away from the fearer at its normal speed. Damage does not break it (as
  with Paralyze). The duration is the only end. Mob: a new branch in the
  `Mob.Update` movement switch ahead of the `aggroTarget` branch, reusing
  `moveAwayFrom` (`mob.go:1348`), the same primitive prey flee uses. Player: in
  `updateInput` (`core/input.go:436-510`), the movement vector is replaced with
  "away from the fearer", like flight replaces it wholesale. The fearer's
  position is read live each tick; if the fearer is gone, the last position is
  kept.
- **D23 - The fear door copies the stun door.** Mob: `ccImmune` checked first
  (`mob.go:1312`), elites and bosses refuse. Player: GOD refuses. Both go through
  the shared hard-CC ladder (D4). A refused fear still counts as a hit for a
  mob's cooldown consumption, as a refused stun does.

### Stealth (C6)

- **D24 - Stealth shows as a translucent token** to every viewer, the stealthed
  player included [PLACEHOLDER alpha]. It rides the new `Stealth` pip bit; the
  client applies sprite alpha instead of drawing a pip.
- **D25 - Every mob door gets the filter, not only acquisition.** A mob's aura
  and cooldowns hit any eligible collider, not only its `aggroTarget`. So the
  stealthed player is excluded in `findAggroTarget` (`mob.go:1613`) AND in the
  shared target predicate for mob casters (`mayHarm` /
  `eligibleByTargetFlags`, `sys/skills.go:640`, `:673`). Entering stealth runs
  `ForgetEntity` (`mob.go:1780`) on every mob, which clears exactly the threat
  row, the aggro target and the support target (D2). It does NOT end charms or
  retire summons (that is `ForgetDeparted`), so the player's own pet stays. A heal or buff from a stealthed player writes no
  healer threat while stealthed.
- **D26 - Breaking is a door, not a poll.** `player.takeDamage` and the
  player's outgoing-damage sites call `BreakStealth()` when HP actually moves
  (a fully absorbed or immune hit does not count, matching how calm breaks on
  `tookDamage`). The hit that breaks stealth lands normally and writes its
  threat.

### Death triggers (C7)

- **D27 - `onDeath` is a mob key, not an effect type.** A mob file authors
  `"onDeath": [{"skillName": "...", "level": 1}]`, the same shape as `skills`.
  Each named file is an ordinary cooldown skill (`instant_damage` = explode,
  `spawn` = adds, `instant_slow`, anything). On death they fire through
  `fireCooldown` from the dead mob at its death position, in the `MobSystem`
  sweep (`sys/mob.go:209-214`), BEFORE `RemoveEntity`, while the mob is still
  registered in the SkillSystem and the space. No cost, no cooldown, no
  "in combat" gate.
- **D28 - A despawn is marked, a death is not.** The paths that zero health
  to remove a mob without a death (`ForgetDeparted` retiring an owner's
  summons, `sys/mob.go:514`; encounter `Despawn`, `encounter/system.go:135`) set
  a `despawned` flag first, and the sweep skips `onDeath` for it (D6).
- **D29 - Kill credit is unchanged.** Damage an `onDeath` explosion deals is
  the dead mob's hit (a mob-cast `instant_damage`). Adds it spawns are ordinary
  mobs with their own XP. A death trigger never pays XP itself.

## 5. Not in scope

- Speed, slow, stun, resist on others: they exist.
- `maxHealth` and `costReduction` on others (D9).
- A flat threat aura (D8), and flat thorns (D16).
- Mob charge (D19) and mob stealth (stealth is a player tool, D3).
- Fear breaking on damage; a damage threshold is a later tuning call.
- The stun/slow pip conflation, durations on the wire, the `aura_category` byte
  (`plan-entity-presentation.md`).
- Dispel, cooldown resets, procs, CC immunity buffs, damage redirect (the other
  rows of the 2026-10-07 ranking; not picked).
- Placing any new skill in the world (unlock sources). Each chunk ships one
  example skill reachable only with the `SKILL` cheat; the PO places them.

## 6. The change, per chunk

Every new effect type touches the same list (the `add-content` skill): the enum
and name map (`skills/definition.go:37-75`, `:105-140`), the per-type key table
(`:1300-1430`), the category table (`:1550-1595`), the build switch
(`:1920-1970`), `skills/aura_category.go`, `model/auramask.go:29` for aura
types, `api/shared-constants.json` `effectTypes` (pinned by
`skills/shared_constants_test.go` and `SharedConstants.test.ts`), the vocabulary
golden (`UPDATE_SKILL_VOCABULARY=1`), and the content editor smoke. A new buff
payload must implement `isBuffPayload`, `appliedBit` and `effectKind`, or it
does not compile.

### C0 - widen the wire (no behaviour change)

- `server.fbs`: `applied_effects:ubyte` to `ushort` on Mob (`:635`) and
  Character (`:483`); `enum EffectKind : ushort` to `uint` (`:899`). Regenerate
  Go + TS bindings (`api/schema/make.sh`).
- Go: `AppliedEffect uint8` to `uint16`, `EffectKind uint16` to `uint32`, the
  marshal sites in `codec/gamestate.go`.
- Client: `EffectPips.ts`, `BuffTray.ts`, `Mobs.ts:393`, `Character.ts:226`
  read the wider value.
- Pins: `codec/gamestate_test.go` (the pairing map), `api/shared-constants.json`
  (`effectKindBits`), `cmd/aurad/shared_constants_test.go`,
  `SharedConstants.test.ts`, `BuffTray.test.ts`.
- **Byte-identical gameplay**; the wire grows by a few bytes per entity snapshot (1 per
  `applied_effects`, 2 per `EffectKind` entry).
- ⚑ **As built:** `OwnEffect` is a STRUCT, and a `uint` `kinds` between two
  ushorts padded it from 24 to 32 bytes per tray entry. C0 moved `kinds` after
  `total_ticks` (`skill_id`, `total_ticks`, `kinds`, `caster`, `expires_tick`),
  so the struct stays 24 bytes and an `EffectKind` entry costs nothing extra.
  `CreateOwnEffect`'s argument order changed with it (one caller,
  `codec/gamestate.go`). The client needed no source change: it reads both
  fields as plain numbers. The shared-constants pin's casts widened too
  (`uint8` to `uint16`, `uint16` to `uint32`), or C1's bit 8 would have been
  cut off silently in the test.

### C1 - stat buff/debuff on others + the threat stat

- `stat_aura`, `instant_stat` (D11-D14); `statPayload`; `Buffs.StatBonus`.
- `threat` added to `validStats` (`skills/definition.go:261-281`) and
  `DerivedStats` (`ThreatBonus`), read in `noteThreat` / `NoteThreat` (D15).
- Read sites per D14. Capability interface `statBuffable` on player and mob.
- Wire: EffectKind StatUp, StatDown; pips StatUp, StatDown.
- Example: the tank aura from the 2026-10-07 session (a `damage_aura` nearest-N
  + `stat_aura` `damageReduction` on self and allies + a while-active
  `stat_multiplier` `threat`), and a demoralize cooldown (`instant_stat`
  `damageDealt` < 0 on enemies).

### C2 - thorns on others

- `retaliate_burst` gains `targetsAllies`, `targetsSelf`, `radius`,
  `selector`, `maxTargets` (D16); `omni-strike.json` + `retribution.json` gain
  `"targetsSelf": true`. `Mob.ApplyReflect` + the mob-side reflect in
  `PlayerTouches` / `MobTouches` (D17).
- Wire: Reflect already has a tray kind; add a Reflect pip.
- Example: a thorns cooldown on the nearest ally.

### C3 - charge

- `charge` (D18, D19). Shares the probe with `applyDash`: extract it, do not
  copy it.
- Wire: none.
- Example: a warrior-style charge + 1 s stun.

### C4 - empower next cast

- `empower` (D20, D21), `empowerPayload`.
- Wire: EffectKind Empower. No pip (self-only, the tray shows it).
- Example: a Nature's Swiftness (instant + free on the next cooldown).

### C5 - fear

- `fear` (D22, D23), `fearPayload{sourceID, lastPos}`. The ladder in
  `Buffs.ApplyStun` (`skills/buffs.go:588-610`) becomes the hard-CC ladder
  shared by both payloads.
- Mob movement branch; player input override; `stunSuppressible` covers fear.
- Wire: EffectKind Fear; pip Fear.
- Example: a player fear on the nearest enemy, and a mob fear (a howl) equipped
  on a debug-zone mob.

### C6 - stealth

- `stealth` (D1-D3, D24, D25, D26), `stealthPayload`. Self-only.
- Wire: EffectKind Stealth; pip Stealth, rendered as token alpha.
- Example: a stealth cooldown with a [PLACEHOLDER] 20 s cap.

### C7 - death triggers

- `onDeath` on the mob definition (`items/mobs/definitions.go`), parsed like
  `skills`, validated against the skill registry at load (an unknown name
  refuses the boot). The sweep hook and the `despawned` flag (D27, D28).
- A `MobSystem` to `SkillSystem` seam: the sweep calls
  `skills.FireOnDeath(mob)` before `RemoveEntity`.
- Wire: none. Content editor: the mob tab gains the list.
- Example: a debug-zone mob that splits into two adds, and a totem that bursts
  when its timer runs out.

## 7. Landmines

- **L1 - The empowering cast must not consume itself.** Read the buff before
  `fireCooldown`, consume after; the empower effect applies inside that fire.
  And `cooldownCostHP` is read TWICE; missing one makes "free" refuse at the
  precondition or charge at the fire.
- **L2 - Charge then stun depends on the collider position.** `applyDash` calls
  `SetPosition`; whether `AuraCollider().Position()` reads the new spot in the
  same tick is UNVERIFIED. The stun's query circle uses it. Test it first.
- **L3 - Fear toggles a mob's mode.** `applyMode` damps aura switches to tick
  boundaries because `SetActiveAura` zeroes the tick accumulator; a mode that
  flips every tick yields zero damage. Fear must not flip the aura slot. And
  every abandoned movement attempt needs `resetSteeringLatch`.
- **L4 - A stat buff on a MOB re-prices it.** A mob-cast `stat_aura` that buffs
  its pack's `damageDealt` sits outside tier + baseline pricing, like the
  while-active `stat_multiplier` (aura-drawbacks L4). The first placement of one
  re-prices every placement of that species.
- **L5 - Mob summons and death triggers.** `ForgetDeparted` retires an owner's
  summons by zeroing their health. A totem with `onDeath` must NOT burst when its
  owner logs out (D28). And adds spawned by `onDeath` must not be bound to the
  dead mob as their owner, or its removal retires them in the next sweep. Check
  `buildSummon`'s owner binding for a mob caster.
- **L6 - The dead caster.** `onDeath` fires from a mob whose health is 0. Any
  "caster alive" check on the fire path (cost floor, `mayHarm`, eligibility)
  would whiff it silently. A Go test must fire one from a 0-HP mob.
- **L7 - Stealth has more doors than acquisition.** Mob auras and cooldowns hit
  any eligible collider (D25). A test needs a mob with an AURA beside a
  stealthed player, not only an aggro check.
- **L8 - The silent assertion class.** Every new capability is an
  `x.(Iface)` assertion; a signature mismatch degrades to "not applicable"
  silently (effect-types round 1). Each chunk pins that player AND mob satisfy
  their interface.
- **L9 - Census tests.** A new debug-zone mob reddens the `items/mobs` census
  tests and the `cmd/simharness` placement pins (CLAUDE.md watch item). Budget
  the update, or reuse an existing mob with a new skill list.
- **L10 - GOD hides CC.** Test fear on players with GOD off.
- **L11 - Empower's two damage-only assumptions.** `casterDamageFactor` is
  applied at damage sites only, never to heals, so the "stronger" factor on a
  heal is a NEW read site. And DoTs never crit (`skills/component.go:183`), so
  "guaranteed crit" does nothing on a DoT-only cooldown; the loader should
  refuse nothing, but the tooltip must not promise it.
- **L12 - The own token.** The own player's effects route to the tray, not the
  pips (`Player.ts:105`, buff tray D10). The stealth alpha must read the
  Stealth bit on the own Character as well, or the stealthed player is the one
  person who does not see it.
- **L13 - A negative `damageReduction` is live.** `DamageReductionFactor`
  clamps only the top (`skills/component.go:276-278`); a negative bonus means
  more damage taken, bounded at -1 (2x) for aura drawbacks. `stat_aura` /
  `instant_stat` take the same bound, or two debuffs stack past 2x.

## 8. Open questions for the PO

None blocking. Raised at execution if they come up:

- The stealth alpha and whether the stealthed player sees a stronger cue
  (an outline) on their own token.
- Whether mobs should charge later (D19).

## 9. Test strategy and verification

- **Go, red first, per chunk.** One table test per effect on both a player and
  a mob target where both apply; the interface pins (L8); the specific
  landmine tests (L1 self-consume, L2 position, L5 owner logout, L6 dead caster,
  L7 aura door).
- **Vocabulary + shared constants** goldens regenerated, editor smoke green.
- **C0**: `go test ./...`, `npm test`, a `verify` smoke that pips and the tray
  still draw (the 8 old bits read the same).
- **In-game per chunk**, with the example skill via the `SKILL` cheat, GOD off,
  on the debug zones. C6 needs two browser clients (the translucent token as
  seen by another player).
- **Balance**: `cmd/simharness` guardrails stay green; no shipped content
  changes in this plan, so a red guardrail is a bug.
- Schema impact stated per chunk in the ledger: DB NONE for all (buffs are not
  persisted).

## 10. Chunk ledger

| Chunk | What | Wire | Status |
|---|---|---|---|
| C0 | Widen `applied_effects` + `EffectKind` | YES | ✅ 2026-10-07 `25668fd7` (see §6 C0 "As built") |
| C1 | Stat buff/debuff on others + `threat` stat | +2 kinds, +2 pips | not started |
| C2 | Thorns on others (`retaliate_burst` widened, mob wearers) | +1 pip | not started |
| C3 | Charge | none | not started |
| C4 | Empower next cast | +1 kind | not started |
| C5 | Fear (both ways, shared hard-CC ladder) | +1 kind, +1 pip | not started |
| C6 | Stealth (towards mobs, translucent token) | +1 kind, +1 pip | not started |
| C7 | Death triggers (`onDeath` on mobs) | none | not started |

Order: C0 first (C1, C2, C4-C6 need its room); C1 next (it builds the
buff-kind template the rest copy); C2-C7 in any order. C3 and C7 need no wire
and can run before C0 if a slot opens.
