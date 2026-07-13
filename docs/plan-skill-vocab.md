# Skill-Vocabulary Fill — Execution Step 4

> **Status: PLAN REVIEWED 2026-07-13 — §4 decisions resolved same day**
> (crit = sanctioned upside-only RNG; activation preconditions with
> rejection feedback replace whiff-on-no-anchor/no-corpse; tick wire =
> per-entity effective fields + interval must be manipulable → haste seam;
> chunk order 1 → 2 → 4 → 3 → 5 → 6).
>
> **CHUNK 4 (cast-time + interrupt + Recall) DONE + VERIFIED IN-GAME
> 2026-07-14** ("successfully tested, works as intended" — full checklist
> passed incl. no-smear teleport). Chunk-start decisions (supersede §3.4/§3.5 where they
> differ): same-slot re-request while casting is **ignored**; any OTHER
> deliberate input cancels — a different cooldown activation (which then
> **fires normally**), aura switch incl. deactivate, movement ≠ 0 (zero
> vector/bridged packets don't flicker the cast); **damage-interrupt is
> OPT-IN per skill** via new skill-def bool `castInterruptedByDamage`
> (default: casts survive damage — cast-time is combat vocabulary; only
> Recall opts in; flag without castTicks hard-fails). Shipped: skill-def
> `castTicks`/`castTicksPerLevel`/`castInterruptedByDamage` +
> `EffectiveCastTicks` (floor 0 = instant); `SkillComponent`
> CastingSlot/CastTicksLeft + StartCast/CancelCast/**CancelCastOnDamage**
> (flag check lives on the component)/CastingSkill; `advanceCast` in
> processCooldowns — fire AND cooldown-consume move to completion (interrupt
> = no cost), precondition RE-CHECKED at completion (refund automatic);
> **activation-precondition + rejection-feedback primitive**
> (`model.ActivationRejection`: 1 = no anchor, 2 reserved for revive) with
> player one-shots (campfire_bound lifecycle); interrupt hooks:
> `takeDamage` dealt > 0 → CancelCastOnDamage (dots + fully-absorbed hits
> interrupt flagged casts, chunk-2 interplay pinned), input path,
> `SetSkillComponent` clears cast on respawn (covers self-cost deaths);
> `recall` effect type (16 → 17, empty allowlist) + **ConnState seam**
> (`AnchorOf(uuid)`, `SetConnState` wired post-construction in game.go —
> revive extends it in chunk 3; the fake IS the anchor-lost-mid-cast test
> seam) + `jitterAround` extracted from respawnPosition; mob fire path
> ignores castTicks (NOTE + test). Wire: GameState appends
> `cast_skill_id/cast_ticks_left/cast_ticks_total` (live) +
> `activation_rejected_skill_id/activation_rejected_reason` (one-shot), own
> player only; codec + round-trip pins; Go + TS regen. Frontend: `#castBar`
> bottom-center above the action bars (name + remaining s, bare); rejection
> floating text via Skills.ts reason table; **teleport snap threshold 600 px
> [PLACEHOLDER] in _GameObject.setPosition** (no threshold existed — Recall
> WOULD have smeared; answers §3.8 for dash); Skills.ts Recall × 3 maps.
> Content: **Recall id 28** (castTicks 300 ≈ 10 s, cooldownTicks 9000 ≈
> 5 min, both [PLACEHOLDER]), L2 milestone → **12 entries + NEW pinned-table
> test** (no count pin existed); registry pin 28 → 29. ~30 new tests
> red-first; suite + build + tsc/webpack + boot smoke both content sources
> green.
>
> **CHUNK 2 (shield layer) DONE 2026-07-13 + VERIFIED IN-GAME 2026-07-14.**
> Shipped: `shieldPayload{authored, remaining}` in `skills.Buffs` —
> `ApplyShield` (same-strength refresh renews lifetime AND tops the pool
> back up to authored, never past it), `AbsorbShield` (expiring-soonest
> drains first across sources, SkillID tie-break for determinism, depleted
> pools removed), `ShieldTotal`; absorb step in BOTH `takeDamage` sites
> after resist (× DR on players), before HP — **the return widens to
> dealt = absorbed + HP lost (§3.1/8-9 executable)**, so lifesteal and mob
> threat count absorbs through the untouched chunk-1 callers (§4.2(a)
> pinned); floating-number accumulators (damage_taken/crit_taken) show
> real HP loss ONLY — absorption reads as the shield bar dropping, no new
> wire beyond shield_hp; mob leash `tookDamage` widened to dealt > 0 and
> player NoteCombatAction covers fully-absorbed hits ("beaten on your
> shield is combat"); god/invulnerable short-circuit BEFORE the absorb,
> fully-resisted hits never drain a pool. Effect types 14 → 16:
> `shield_aura` (lifetime interval + 1) + `instant_shield` (authored
> **`shieldDurationTicks`** — payload-prefix convention over §3.2's
> `durationTicks` shorthand — applied + 1, the dot convention; rejected on
> the aura form by the allowlist); `ShieldParams.HPAt` floored at 0;
> both-zero pool hard-fails. Dispatch: `applyShieldAura` mirrors resist
> (targetsSelf outside the cap, ally-side eligibility, no mayHarm);
> `applyInstantShield` in fireCooldown — **the self-apply counts as a hit**
> (a Barrier with nobody around is not a whiff); `AuraMaskFor` covers
> shield_aura. Wire: `shield_hp:uint` Character slot 25 / Mob slot 18,
> both codec sites, both client GameState branches — a LIVE value, not a
> per-tick accumulator. Frontend bare rendering: HUD `.shieldIndicator`
> (translucent light-blue, anchored at the HP fill's end, slides left over
> the fill when the bar is too full so an active shield is always
> visible) + the same segment on BOTH overhead-bar implementations
> (Character.ts + Mobs.ts, no shared base); Skills.ts × 3 maps. Content:
> **Barrier id 27** (next free; the "~29" placeholder), cheat-grant
> `SKILL Barrier`, no milestone; count pin 27 → 28. 26 new tests
> red-first incl. the takeDamage-side composition pins (resist × DR →
> absorb, hand-computed), threat-on-absorbed, lifesteal-on-absorbed and
> the top-up/drain-order/expiry store pins.
>
> **CHUNK 1 (damage-vocabulary batch) DONE + VERIFIED IN-GAME 2026-07-13**
> ("all in-game checks verified and working"). Chunk-start confirmations: §4.1 wildcard per-tag
> semantics CONFIRMED **with rider: immunity must stay temporarily
> strippable by content** (multiplicative buffs cannot undo a ×0 — needs a
> dedicated seam when content demands it: per-mob resistance override for
> encounter scripts, a sunder-style override buff for skills/cooldowns;
> demand-driven, recorded in skills/resist.go); §4.2 (a)+(b) CONFIRMED
> (threat = damage dealt incl. future shield absorbs; summon lifesteal
> heals the summon); NEW: **berserker reads the ACTING entity's HP**
> (a wounded summon rages, owner HP irrelevant — the §4.2(b) parallel).
> **The F6 §3.1 composition order is now the shipped decision record**,
> pinned executable by TestApplyDamageAura_CompositionOrderF6 (chunk-2
> extends it with the shield step). Shipped: `"*"` wildcard resist
> (skills.ResistWildcard, explicit-beats-wildcard, multi-tag pin; buff-list
> resists deliberately not wildcarded), DamageParams
> execute/berserker/crit/lifesteal pairs + validators (damage_aura +
> instant_damage only, dots excluded §3.3), caster-side composition in
> both apply sites via berserkerMultiplier/rollHitDamage (zero
> chance/variance consume no RNG draw — seeded sequences of vocab-free
> effects unchanged), `Damage.Lifesteal/Crit` + `Factors.Lifesteal/Crit`,
> `player.takeDamage` now returns dealt loss, `model.ApplyLifesteal`
> (living-Source-else-toucher, dead-recipient guard) in all four *Touches,
> `crit_taken:uint` on Character + Mob (codec + both client branches,
> crit share pops 1.8× in warm orange, remainder normal), smoke skill
> ReaperAura id 7 (cheat-grant `SKILL ReaperAura`), count pin 26→27.
> execution-order step 4 (`roadmap.md`): effect-foundations Step 4 (shield)
> + the cheap effect-type batch (lifesteal, execute, crit, berserker) + dash
> + the cast-time/interrupt primitive with **Recall** as first consumer +
> heal-over-time payloads + the **revive** effect type + the `"*"` wildcard
> resist key + the minimal aura tick-indicator wire. Goal: the content pass
> (step 6) authors builds against the **full effect palette** — this is the
> last systems step touching the damage pipeline before content.
>
> Everything below was verified against the code 2026-07-13 (post
> atmosphere & recovery chunk 4). All numbers are [PLACEHOLDER], per the
> project-wide rule. ⚑ marks decisions to settle at plan review or at the
> named chunk's plan-first start.

---

## 1. Scope — what this step ships and deliberately does not

**In scope** (the roadmap step-4 list, verbatim):

| Feature | Kind | Gate |
|---|---|---|
| `"*"` wildcard resist key | `skills.ResistMultiplier` extension | decided 2026-07-09 (backlog item 8); multi-tag semantics to confirm (§4.1) |
| Lifesteal | damage-payload field + heal-back seam | F6 record (§4.2) |
| Execute, berserker | damage-payload fields (F2: plain optional fields) | none |
| Crit | damage-payload fields | RNG gate resolved at review (§4.3): sanctioned upside-only RNG |
| Shield layer | buff payload + absorb step in both `takeDamage` sites + wire + HUD | F6 record (§4.2) — effect-foundations Step 4 |
| Heal-over-time | buff payload (inverse of the shipped dot) + cooldown consumer | none — E1-compliant recovery building block (GDD §3) |
| Revive effect type | new effect targeting a DEAD player | consumes step 3's death state |
| Cast-time + interrupt | new activation primitive on cooldown skills | none — **Recall** is the first consumer |
| Recall | cooldown skill: teleport to campfire anchor | reuses step 3's anchor tracker (backlog item 9) |
| Dash/blink | position-set effect + collision sanity | none |
| Minimal tick-indicator wire | per-entity tick phase/interval + bare client readout | wire design decided here (§4.6); polish in step 8 |

**Deliberately out of scope** (recorded so the ellipsis in the roadmap line
doesn't creep):

- **Resource theft, regen stat variants, bonus-damage-vs-creature-type** —
  in the effect-foundations "cheap batch" list but not on the roadmap step-4
  line. Each ≈ ⅓ session when content demands it (bonus-vs-type additionally
  needs creature-type tags on `mobs.Factors`). Demand-driven, content pass
  may pull them.
- **Overheal-as-shield** — a shield-payload client, but no consumer is
  named anywhere; YAGNI until content wants it.
- **Thorns, armor penetration, chain damage, knockback/pull, on-death
  event hook** — each needs its own primitive; unscheduled (effect
  foundations §5).
- **Buff/debuff icon+timer HUD** — stays the open ⚑ visibility question;
  §4.6 records why the tick indicator does not force it. Step 8 (UI pass).
- **Real content** — every skill this step ships is smoke/verification
  content except Recall (a real, keepable skill). The build-defining skills
  (Reaper-style execute auras, the personal recovery cooldown's final theme,
  the real Revive) are authored in step 6.
- **Player-affecting control effects** — F7 stands; the cast-time interrupt
  is NOT input suppression (the player can always act; acting is what
  cancels the cast).

## 2. Current state — the seams this step builds on (verified 2026-07-13)

- **Effect-type pipeline** (`skills/definition.go`): 14 types, per-type
  payload structs + `effectKeys` JSON-key allowlist (unknown/inapplicable
  keys hard-fail) — the Step-0 pattern; a new type = payload struct +
  allowlist entry + validator + dispatch case.
- **Dispatch** (`sys/skills.go`): aura effects fire from
  `processEntity` on the shared `TickAccumulator` cadence; cooldown effects
  from `fireCooldown` (player: explicit `PendingCooldowns` from the input
  path; mob: fire-when-ready). Eligibility rides
  `eligibleByTargetFlags` + the `mayHarm` hostility seam — **every new
  harmful effect type must route through it** (chunk 6.6 rule).
- **Buff store** (`skills/buffs.go`): source-keyed streams with typed
  payloads (resist, slow, dot). Dot is the acting-payload template: aging on
  `ResetTickNumbers`, acting drained by `SkillSystem.tickDots` via
  `DueDotHits`, attribution replayed through `PlayerTouches`/`MobTouches`.
  HoT and shield are payloads #4 and #5.
- **The two damage sites**: `player.takeDamage` (player.go:255) and
  `mob.takeDamage` (mob.go:1031). Order today: resist multipliers (base ×
  buffs) → player-only DamageReductionBonus → subtract HP (clamped) →
  combat/threat bookkeeping. The mob site returns the post-mitigation loss
  (threat credit). The heal-aura self-cost deliberately **bypasses**
  `takeDamage`.
- **Attribution double dispatch**: `Interacter.PlayerTouches(caster,
  Damage{HP, Tags, Source})` / `MobTouches(mob, Factors)` — both entry
  points see the caster entity, which is what the lifesteal heal-back needs
  (§4.2); `model.Healable` (Combatant + Heal) is the heal seam on both
  entity kinds.
- **Death state** (`sys/state.go`, chunk 4): `deadByClient` markers
  {name, corpse, progression, skills} keyed by client UUID; `anchors` maps
  client → bound campfire position; `Corpse` is a Viewport-only dynamic
  entity. Revive and Recall both read this system — it needs its first
  externally-visible seam (§4.4, §4.5).
- **Wire**: appended fields on `Character`/`Mob` are the established
  compatible-evolution path (7 appends shipped so far). `GameState` carries
  owning-player-private data (spellbook, cooldown_remaining_ticks) — the
  cast bar and shield HUD ride the same patterns.
- **Frontend debt that taxes every chunk**: hand-synced
  `client-data/Skills.ts` (id/name/maxLevel/category per player-facing
  skill) — each new skill needs an entry (chunk-3 verify finding).

## 3. Decisions proposed at plan review

### 3.1 F6 — damage-pipeline composition order (REQUIRED before chunks 1+2)

Effect-foundations F6: before any *two* of {pen, shield, thorns, lifesteal}
coexist, the composition order gets a decision record. This step ships
shield AND lifesteal, so the record is due **now**. Proposal:

**Outgoing (caster side, computed per application):**

1. Base damage at level (`Damage.HPAt(level)` × summon power, as today)
2. × berserker multiplier (caster missing-HP scaling, frozen at cast)
3. × execute multiplier (per target, from the target's health ratio at hit
   time)
4. × crit multiplier (per hit, if crit ships — §4.3)
5. → per-hit variance roll (unchanged, C4)

Order among 2–4 is mathematically irrelevant (all multiplicative); fixing
it anyway keeps future additive modifiers from being ambiguous.

**Incoming (target side, inside `takeDamage`):**

6. × resist multipliers — base resistances (mob) / passive resistances
   (player) × transient resist buffs (unchanged; wildcard extends the map
   lookup, §4.1)
7. × player-only DamageReductionBonus (unchanged)
8. − **shield absorb** (new): the mitigated amount drains absorb pools
   before HP; leftover hits HP (clamped at 0 as today)
9. **"Damage dealt"** := shield absorbed + actual HP lost (overkill never
   counts). This one number feeds BOTH mob threat (today: HP loss only —
   widened so hitting a shielded mob still generates threat) and lifesteal.

**Lifesteal:** heals `damage dealt × lifestealFraction`; recipient is the
hit's **Source** entity when set (an owned summon leeches for itself),
else the touching caster. Overkill excluded (9). Heals ride
`model.Healable.Heal` → floating numbers free; a lifesteal heal does NOT
credit healer threat (it is damage-side sustain, not support — and the
threat for the damage itself already landed).

**Self-costs pierce shields**: the heal-aura self-cost keeps bypassing
`takeDamage` (build cost, not combat damage). Shields absorb combat damage
only.

**Combat gate**: fully-absorbed hits still count as taking harm (the
victim's `NoteCombatAction` stamps whenever damage dealt > 0) — being
beaten on your shield is combat.

### 3.2 Shield semantics (chunk 2 detail, decided here)

- Payload: `shieldPayload{remaining float32}` in `skills.Buffs` — a
  mutable absorb pool with the store's normal lifetime ticks. Streams per
  the store convention; **query rule: pools drain in expiring-soonest
  order** (use it before you lose it); total = sum of active pools
  (distinct skills stack, same-skill streams follow store semantics).
- Refresh rule (same-skill re-application, e.g. a shield aura): identical
  strength refreshes lifetime and **tops the pool back up to the authored
  amount** (never past it, never lowered mid-stream).
- Wire: `shield_hp:uint = 0` appended to **both** `Character` and `Mob`
  (mobs can be shielded by content — the machinery is entity-agnostic
  already). HUD: shield segment on the resource bar (own player); overhead
  bars read the same field. Bare rendering here, polish in step 8.
- Effect types: `shield_aura` (cadenced re-apply, targetsAllies/self like
  resist_aura) + `instant_shield` (cooldown burst, same params). Params:
  `shieldHP`, `shieldHPPerLevel`, `durationTicks` (instant only — aura
  uses interval+1 like resist), `targetsSelf` (aura, mirroring resist).

### 3.3 Execute / berserker / crit shapes (chunk 1 detail)

All three are optional `DamageParams` fields (F2), valid on
damage_aura/instant_damage; dots excluded in v1 (add to `DotParams` when
content wants a burning execute — cheap, but YAGNI now):

- **Execute**: `executeBelowFraction` (target health-ratio threshold) +
  `executeBonusFactor` (multiplier applied below it). Deterministic,
  per-target, evaluated against the target's `HealthRatio()` at hit time.
- **Berserker**: `berserkerMaxBonusFactor` — outgoing damage ×
  `1 + maxBonus × (1 − casterHealthRatio)`. Caster-side, per application.
  Decided at chunk-1 start (2026-07-13): the **acting** entity's ratio — an
  owned summon rages on ITS wounds, the owner's HP is irrelevant (§4.2(b)
  parallel).
- **Crit** (§4.3 decided): `critChance` + `critFactor`, rolled per hit
  after execute/berserker, before variance.

### 3.4 Recall mechanics (chunk 4 detail; backlog item 9 ⚑s resolved here)

Proposal, resolving the backlog's open questions:

- **Interrupt, not invulnerability** (the roadmap wording: "interrupted by
  damage/movement"). Damage taken (any post-mitigation loss > 0) or any
  deliberate act — movement input, aura switch, another cooldown
  activation — cancels the cast. Fully-absorbed hits also interrupt
  (consistent with §3.1's "shield hits are combat").
- **Interrupted cast does not consume the cooldown** — the risk window IS
  the cost; a consumed cooldown on interrupt would double-punish.
- **Recall has its own long cooldown** [PLACEHOLDER ~5 min] — hearthstone
  convention; prevents free teleport spam while the cast risk stays the
  primary limiter.
- **Destination = the campfire anchor** (same tracked state as
  death-respawn, same jitter). **No-anchor behavior — DECIDED at review
  2026-07-13: refuse the activation up front** (no cast starts, no
  cooldown consumed) with client-visible feedback for why — see the
  **activation-precondition + rejection-feedback primitive** in §3.5,
  added at review because the same need recurs (revive with no corpse in
  range, and future stateful skills).
- **A Cooldown-category spellbook entry** (already recorded in backlog),
  granted by an early milestone [PLACEHOLDER L2] — every character gets it
  early per GDD §3, and it exercises the milestone path.

### 3.5 Cast-time primitive shape (chunk 4)

- `castTicks` (+ `castTicksPerLevel`, probably unused) is a **skill-def
  field** sibling to `cooldownTicks` — casting is a property of the skill,
  not of an effect. `castTicks: 0` (default) = today's instant behavior,
  all existing content untouched.
- State: `SkillComponent` gains a casting slot (`CastingSlot int`,
  `CastTicksLeft int`; -1/0 idle). Player-only in v1 — mobs never author
  `castTicks` (validator allows it only on player-castable defs? simpler:
  mob fire path ignores cast time; hard-fail is cheap to add when a boss
  wants telegraphed casts — leave a NOTE).
- Flow: `processCooldowns` sees an activation request for a `castTicks>0`
  skill → starts the cast instead of firing (one cast at a time; a second
  request cancels-and-replaces? No — proposal: **request while casting is
  simply ignored**, KISS). Each tick decrements; at 0 → `fireCooldown` +
  cooldown consumed.
- Interrupt hooks: `player.takeDamage` (loss > 0) and the input path
  (movement ≠ 0, aura switch, cooldown activation) call
  `sc.CancelCast()`. No input suppression anywhere (F7 posture).
- **Activation preconditions + rejection feedback (added at review
  2026-07-13):** a cooldown skill may declare a precondition the server
  checks at activation — recall: "an anchor is bound"; revive: "a corpse
  is in range". A failing precondition **rejects the activation**: no cast
  starts, no cooldown is consumed, and the client is told why. Skills
  WITHOUT preconditions keep today's whiff-consume semantics verbatim
  (firing a NovaBurst into thin air stays the player's aim problem).
  Preconditions are per-effect-type Go checks (the recall/revive dispatch
  knows its own requirement), not a JSON DSL — KISS. For cast-time skills
  the precondition is re-checked at cast completion (the world moved for
  10 s): failure there also refunds the cooldown and emits the same
  feedback.
- **Rejection-feedback wire**: one-tick GameState appends (own player
  only, the `campfire_bound` one-shot pattern):
  `activation_rejected_skill_id:ushort = 0` +
  `activation_rejected_reason:ubyte = 0` (enum: 0 none, 1 no anchor
  bound, 2 no valid target; grows per precondition). Client renders
  floating feedback text over the own character (the "Bound to campfire"
  rendering path, message table keyed by reason).
- Wire (own player only, `GameState` appends): `cast_skill_id:ushort = 0`,
  `cast_ticks_left:ushort = 0`, `cast_ticks_total:ushort = 0` → the client
  renders a cast bar with the skill name; 0 = no cast. Other players do
  NOT see casts in v1 (no Character field — YAGNI until a PvP/telegraph
  need exists).

### 3.6 Revive shape (chunk 3 detail)

- New effect type `revive` (cooldown-fired): query circle at the caster
  (radius params as usual, mask must include the **Viewport layer** — the
  corpse's only layer), collect `model.CorpseEntity` hits, revive the
  **nearest** [PLACEHOLDER: nearest-1; maxTargets later if content wants
  mass-rez]. **No corpse in range = a rejected activation** (review
  2026-07-13): rides the §3.5 precondition primitive — no cooldown
  consumed, `activation_rejected_reason` = no-valid-target feedback,
  instead of the whiff-consume rule aim-based bursts keep.
- The revive itself is a `sys/state.go` operation — the SkillSystem cannot
  reach `deadByClient`. **Seam**: `ConnectionStateSystem` implements
  `ReviveAtCorpse(corpseID uint64, healthFraction float32) bool`
  (reverse-lookup the dead marker by corpse ID, consume it exactly like
  `tryRespawn` — remove corpse + the dead client's spectator, rebuild the
  player at the **corpse position** with `healthFraction` × max HP,
  restore progression/skills, reuse the reserved name verbatim, send
  Accept). Wired in `core/game.go` via a `SkillSystem.SetReviver(...)`
  setter — both systems are constructed there; no `model` interface
  bloat (the CampfireAnchorSink precedent).
- Revived at [PLACEHOLDER 30%] health, at the corpse (NOT the anchor —
  that's the whole point of revive, GDD §3).
- **No revive of disconnected corpses**: marker consumed on disconnect
  already (chunk 4) — the query finds a corpse only while its client
  waits; a race with same-tick respawn is settled by whoever consumes the
  marker first (the other path no-ops). Corpse fade races don't exist —
  player corpses don't fade.
- Frontend: the dead client's death overlay must dismiss on
  server-initiated revive — verify what the overlay keys on (if it clears
  on the Accept/GameState player-restore, this is free; else one handler).
- Combat gate: a landed revive is support — stamp `noteHarmDealt(caster)`
  only if the revived player is immediately InCombat (they are not — fresh
  spawn), so proposal: revive does NOT enter combat. Trivial either way.
- The real Revive **ability** (rarity, cast time, cost) is step-6 content;
  this step ships the effect type + a throwaway smoke skill — WITH
  `castTicks`, as the second cast-time consumer (chunk 4 lands first per
  the §4.6 order decision).

### 3.7 HoT payload shape (chunk 3 detail)

- `hotPayload` in `skills.Buffs`, mirroring dot 1:1: HP per event ×
  interval × duration, caster ref for attribution, acting accumulator
  advanced by the same drain site (rename `tickDots` →
  `tickBuffEvents`; one drain returning dot hits + hot hits keeps the
  tick-order story single). Per-source strongest-wins like dot.
- Heals apply via `model.Healable.Heal` → floating numbers + clamping
  free. Attribution mirrors the heal aura: player-healer × player-target →
  `NoteHealedBy` (participation); healer threat via `creditHealerThreat`
  per landed event (the campfire-threat gate already guards fixtures).
  Combat gate: a hot EVENT on an in-combat target stamps the caster only
  if the caster is a `CombatActor` — same divergence-accepting rule as
  dot.
- Effect types: `hot_aura` (cadenced applier, heal-aura-style implicit
  ally targeting + wounded-only) and `self_hot` (cooldown, self-target —
  **the personal recovery cooldown's mechanical form**, GDD §3: recovery
  over ~15–20 s, nothing instant). Both are thin over the payload.
  ⚑ Confirm both ship, or `self_hot` only (the named consumer) — lean:
  both; `hot_aura` is ~30 lines given the applier templates and campfires
  may want it in the content pass.

### 3.8 Dash shape (chunk 5 detail)

- Effect type `dash` (cooldown-fired, player-only v1 — mob dashes are
  boss-content vocabulary): displace the caster up to
  `dashDistance` (+PerLevel) in the **facing direction** (input rotation —
  players aim with the cursor; movement direction would make dash
  unusable while standing).
- Collision sanity: no swept-circle support in `phy` — **stepped probe**:
  walk the ray in ~player-radius increments with `QueryCircleStatics`
  (mask PlayerStatic|Border, the summonPosition precedent), stop at the
  last free point. Cheap (≤ ~10 one-shot queries on a cooldown), cannot
  tunnel through `blocksMovement` props or the border, naturally supports
  "dash up to the wall". Landing inside a mob body is fine (mobs are not
  statics; physics resolves next tick, as with any overlap).
- Frontend interpolation check (the known unknown): verify the client
  doesn't smear the teleport — find the position-interpolation path and
  its large-delta behavior; add a snap threshold only if the in-game check
  shows smearing. Recall (chunk 4) hits the same question with a much
  larger delta — whichever chunk runs first answers it (§5 order note).

## 4. Plan-review decisions — RESOLVED 2026-07-13 (4.3–4.6), 4.1/4.2 to confirm at chunk-1 start

### 4.1 Wildcard resist multi-tag semantics — ✔ CONFIRMED at chunk-1 start (2026-07-13), with the immunity-strip rider (see banner)

`{"*": 0, "key_x": 1}` with per-tag multiplication: a hit tagged
`[key_x, fire]` multiplies 1 × 0 = 0 — **only the pure key works**.
Recorded 2026-07-09 as "proposed as correct"; confirm now. Semantics:
`"*"` is the multiplier for every hit tag **not explicitly present** in
that source's map (per tag, per source — not a fallback for the whole
hit). Implementation is a 3-line change in `skills.ResistMultiplier`
(map-shaped sources: mob base resistances + passive `Derived.Resistances`
get it for free). The tag-list-shaped transient resist BUFFS deliberately
do NOT learn `"*"` (no consumer; one line when content wants a
resist-everything bubble — recorded, not built).

### 4.2 Lifesteal recipient + threat widening — ✔ CONFIRMED (a)+(b) at chunk-1 start (2026-07-13)

Two player-observable calls buried in the F6 proposal worth flagging:
(a) "damage dealt" includes shield-absorbed damage for **threat** — a mob
whose shield eats your hits still hates you (widens today's HP-loss-only
threat); (b) an owned summon's lifesteal heals the **summon**, not the
owner. Both feel right; both are cheap to flip now and expensive later.

### 4.3 Crit RNG gate — ✔ DECIDED 2026-07-13: (a) sanctioned upside-only RNG

The GDD §12 rejected per-tick combat RNG for misses/resists; crit is
accepted as the **ONE sanctioned, upside-only RNG**, with a special crit
number/VFX (wire: per-tick `crit_taken:uint` accumulator on Character +
Mob, parallel to `damage_taken` — the client renders it big). The
recorded slow-tick-swinginess cost is accepted; revisit at content-pass
balancing if slow auras feel casino-shaped. Alternatives on record
(deterministic every-Nth; reject-keep-variance-only) were declined.
Ships in chunk 1.

### 4.4 Recall no-anchor behavior — ✔ DECIDED 2026-07-13: refuse to cast

Rejected activation, no cooldown consumed, client feedback why —
generalized into the §3.5 **activation-precondition + rejection-feedback
primitive** because the need recurs immediately (revive with no corpse in
range) and will keep recurring for stateful skills. Whiff-and-consume
stays the rule for aim-based bursts only.

### 4.5 Tick-indicator wire — ✔ DECIDED 2026-07-13: per-entity effective fields + interval manipulability

Two requirements fixed at review:

1. **The tick interval is a property of the aura** — the same entity
   running the same aura always shows the same base cadence (already true
   server-side: the interval lives on the effect def, level-scaled).
2. **The effective interval must be manipulable** — a cooldown or another
   aura must be able to speed up / slow down an aura's tick rate (haste /
   tick-slow as future content vocabulary).

Requirement 2 settles the wire shape by itself: a static skill-metadata
catalog (the drafted option b) cannot represent a buffed interval — the
wire must carry the **current effective** value per entity. Decided:

- Append `aura_tick_interval:ushort` + `aura_tick_phase:ushort` to
  `Character` AND `Mob` — the active aura's **first effect's** effective
  interval (first-effect = the authoring convention for "the defining
  cadence"; multi-cadence display is step-8 polish) and the accumulator
  position within it. Covers the defining use case: reading the MOB's
  tick to dodge it, and your own to time repositioning. Cost: 4
  bytes/entity/tick of redundant-ish data — irrelevant at this scale.
- **Interval computation becomes centralized caster-aware**:
  `effectiveTickInterval` gains the caster and composes a **tick-rate
  factor** on top of level scaling (clamped ≥ 1 tick). Chunk 6 ships the
  seam AND its first proof: a `tick_rate` buff payload in `skills.Buffs`
  (factor < 1 = haste, > 1 = tick-slow; store conventions apply) + one
  smoke consumer [PLACEHOLDER shape — haste aura vs. haste cooldown,
  decided at chunk start]. The wire needs no change when real haste
  content lands — the effective value is what's sent.
- The skill-metadata catalog message stays the recorded step-8 direction
  for the Skills.ts hand-sync debt (names/maxLevels — static data only,
  never intervals). **Buff visibility** (icons/timers) stays deferred to
  step 8: per-entity scalars here don't foreclose the per-entity list
  there.

### 4.6 Chunk order — ✔ DECIDED 2026-07-13: 1 → 2 → 4 → 3 → 5 → 6

Cast-time + Recall run directly after the damage work: revive's smoke
skill doubles as the second cast-time consumer, and Recall answers the
teleport-interpolation question before dash needs it. Numbering below
stays by theme, not order.

## 5. Chunk breakdown (one execution session each, plan-first)

Proposed execution order: **1 → 2 → 4 → 3 → 5 → 6** (§4.6).

### Chunk 1 — damage-vocabulary batch: wildcard + execute + berserker + lifesteal + crit

The F6 decision record (§3.1) is this chunk's contract; it lands in this
doc's banner on completion.

- `skills.ResistMultiplier`: `"*"` wildcard (§4.1) — red-first tests incl.
  the multi-tag pin (`[key_x, fire]` vs `{"*":0,"key_x":1}` → 0) and
  "explicit tag beats wildcard".
- `DamageParams` fields + validators: `executeBelowFraction` /
  `executeBonusFactor`, `berserkerMaxBonusFactor`, `critChance` /
  `critFactor` (§4.3 decided). `effectKeys` additions ride the allowlist.
- Crit wire: `crit_taken:uint` appended to Character + Mob (per-tick
  accumulator parallel to `damage_taken`); codec both branches + Go/TS
  regen; client renders crit numbers big [bare styling].
- Apply sites: berserker at the caster-side damage computation
  (`applyPlayerDamageAura` / `applyMobDamageAura` / dot application is
  EXCLUDED §3.3); execute per target inside the hit loop (targets are
  `model.Healable`-adjacent — both kinds expose `HealthRatio()`).
- Lifesteal: `model.Damage` gains `Lifesteal float32`; `mobs.Factors`
  likewise (mob-cast lifesteal comes almost free). The two `takeDamage`
  callers (`player.PlayerTouches`/`MobTouches`, `mob.PlayerTouches`/
  `MobTouches`) heal the recipient (§3.1/9) from the returned
  damage-dealt. **`player.takeDamage` must start returning the dealt
  amount** (today: void) — mirrors the mob site.
- Threat: mob threat credit switches from HP-loss to damage-dealt
  (identical until shields exist; pinned by a chunk-2 test).
- Content (smoke): one throwaway player aura exercising
  execute+berserker+lifesteal+crit together [PLACEHOLDER id ~7,
  cheat-granted, no milestone].
- Tests: parse/validate per field; execute threshold boundary; berserker
  at full/half/zero HP; lifesteal heals caster with floating number,
  summon-source lifesteal heals summon, overkill excluded; crit rolls
  with seeded rng + accumulator lands on the wire field; wildcard pins.
- In-game: burn a mob below threshold → visibly bigger numbers; drop own
  HP → bigger numbers; lifesteal visibly sustains; crit numbers pop.

### Chunk 2 — shield layer (effect-foundations Step 4)

- `shieldPayload` + `ApplyShield` + `AbsorbDamage(hp) (absorbed, rest)`
  query in `skills.Buffs` (§3.2 semantics: expiring-soonest drains first,
  top-up refresh; red-first).
- Absorb step in both `takeDamage` sites per §3.1 (after DR, before HP);
  damage-dealt return = absorbed + loss; combat stamp on dealt > 0.
- Effect types `shield_aura` + `instant_shield` (+`ShieldParams`,
  allowlist, validators, dispatch in `processEntity` + `fireCooldown`).
  Eligibility: ally-targeted (targetsAllies/targetsSelf) — no mayHarm
  needed (support effect), mirrors resist_aura exactly.
- Wire: `shield_hp` appended to Character + Mob; codec + both GameState
  read branches; Go+TS regen.
- Frontend: shield segment on the resource bar + overhead bar tint
  [bare]; Skills.ts entry.
- Content (smoke): `Barrier` cooldown (instant_shield self+allies)
  [PLACEHOLDER id ~29].
- Tests: absorb ordering across streams, partial absorb spill, top-up
  refresh, expiry mid-pool, threat-on-absorbed pin, lifesteal-on-absorbed
  pin (chunk-1 interplay), shield+resist composition order pin.
- In-game: shield bar visible, absorbs a mob burst, breaks through
  correctly, refresh tops up.

### Chunk 4 — cast-time + interrupt primitive + Recall (runs before chunk 3, §4.6)

- Skill-def `castTicks` (+PerLevel) + parse/validate (player-castable
  only NOTE, §3.5); `SkillComponent` casting state + `CancelCast`;
  `processCooldowns` start/advance/complete flow (request-while-casting
  ignored).
- Interrupt hooks: `player.takeDamage` (dealt > 0), input path movement ≠
  0 / aura switch / second activation (`core/input.go`), death (implicit —
  component carried but cast state zeroed on respawn; pin it).
- **Activation preconditions + rejection feedback** (§3.5, added at
  review): per-effect-type precondition checks at activation AND at
  cast completion; rejection = no cast, no cooldown, one-tick
  `activation_rejected_skill_id` + `activation_rejected_reason`
  GameState appends + client floating feedback text (the
  `campfire_bound` rendering path). Recall's "anchor bound" check is the
  first consumer; revive extends the reason enum in chunk 3.
- Wire: `cast_skill_id` / `cast_ticks_left` / `cast_ticks_total` +
  the two rejection fields, GameState appends (own player only); codec;
  client cast bar (bare).
- `recall` effect type: teleport to anchor via the new
  `ConnectionStateSystem` seam (`AnchorOf(clientUUID)`; §3.6's seam
  carries both accessors — build the seam here, revive extends it in
  chunk 3); respawn-style jitter.
- Content: **Recall** (real skill, kept): cooldown category, castTicks
  ~10 s, cooldown [PLACEHOLDER ~5 min], milestone [PLACEHOLDER L2] →
  milestone pin 11→12.
- Frontend: cast bar; rejection feedback text; teleport interpolation
  check (§3.8 — answers it for dash); Skills.ts.
- Tests: cast starts not fires; completes → fires + consumes cd;
  interrupt by damage/movement/switch → no fire, no cd consumed;
  absorbed-hit interrupts (chunk-2 interplay); recall teleports to
  anchor; no-anchor → rejected activation (no cd, reason on the wire);
  anchor lost mid-cast (unbindable today — pin the completion re-check
  path with a test seam); death cancels cast.
- In-game: cast bar fills 10 s standing still → teleport to bound fire;
  moving/getting hit cancels; cooldown only on success; recall without
  ever binding → feedback text, cooldown stays ready.

### Chunk 3 — HoT payloads + revive

- `hotPayload` + `ApplyHot` + drain-site generalization (`tickDots` →
  `tickBuffEvents`) per §3.7; effect types `hot_aura` + `self_hot` (⚑
  §3.7 scope confirm).
- `revive` effect type per §3.6: Viewport-mask corpse query, nearest-1;
  `ReviveAtCorpse` on the chunk-4 seam; player rebuilt at corpse with
  [PLACEHOLDER 30%] HP.
- Content (smoke): `Recover` self_hot cooldown (the personal recovery
  cooldown's mechanical placeholder — theme lands in step 6) +
  throwaway `Revive` cooldown (optionally with castTicks — second
  cast-time consumer).
- Frontend: death-overlay dismissal on server-initiated revive (§3.6 —
  verify-first, may be free); Skills.ts entries.
- Tests: hot event cadence/duration/strongest-wins; Heal-clamping +
  floating numbers; healer-threat + NoteHealedBy on hot events; revive
  consumes the dead marker (name kept, progression restored, corpse +
  spectator removed, position = corpse, HP fraction); no corpse in range
  → rejected activation (no cd consumed, reason on the wire — §3.6);
  disconnect race no-ops.
- In-game: Recover visibly ticks health over ~15–20 s and stops when
  re-entering combat is irrelevant (hot persists — verify GDD E1 posture
  reads OK); second client dies → revive → overlay dismisses, corpse
  gone, name kept.

### Chunk 5 — dash

- `dash` effect type + `DashParams` (distance +PerLevel); stepped-probe
  clamp per §3.8; fires from `fireCooldown` (a dash always "hits" — like
  spawn, no whiff).
- Interrupt interplay: dash is a cooldown activation → cancels a running
  cast (free via chunk 4's hook).
- Content (smoke): `Dash` cooldown [PLACEHOLDER id ~28]; Skills.ts.
- Frontend: interpolation behavior verified in chunk 4; snap fix here if
  Recall revealed smearing at short deltas too.
- Tests: full-distance dash in open space; clamped at prop/border
  (cannot tunnel — probe-step ≤ blocker width pin); zero-distance when
  against a wall; direction = facing.
- In-game: dash feels instant, never crosses walls/border, ring/aura
  follows.

### Chunk 6 — minimal tick-indicator wire + tick-rate seam

- Per §4.5: `aura_tick_interval` + `aura_tick_phase` ushort appends on
  Character + Mob (first-effect **effective** interval; phase =
  accumulator mod interval), zero when no active aura; codec both
  branches; Go+TS regen.
- **Tick-rate manipulability** (§4.5 req. 2): `effectiveTickInterval`
  becomes caster-aware and composes a tick-rate factor (clamped ≥ 1
  tick); `tick_rate` buff payload in `skills.Buffs` (factor < 1 haste,
  > 1 tick-slow, store stream/strongest conventions — combination rule
  across skills decided at chunk start) + one smoke consumer
  [PLACEHOLDER: haste aura vs. haste cooldown, chunk-start decision].
  NOTE: a tick-rate factor changes the modulo cadence mid-stream —
  decide accumulator semantics (rescale vs. restart) at chunk start.
- Frontend: bare ring pulse/arc reading the two fields (own player + mobs
  + other players — the mob reading is the design-critical one);
  explicitly NOT the step-8 polish pass.
- Record the buff-visibility deferral + the step-8 catalog direction in
  this doc's banner.
- Tests: codec round-trip; interval reflects level scaling AND an active
  tick_rate buff; phase resets on aura switch (accumulator reset already
  pinned — extend); hasted aura actually fires faster end-to-end.
- In-game: watching a mob's ring, its damage ticks land exactly on the
  indicated beat; dodging out between beats avoids damage; with the smoke
  haste active, own ring and actual ticks visibly speed up together.

## 6. Test strategy

Per project style: red-first TDD per chunk, full suite
(`go test -timeout 60s ./...`) + `go build ./...` + tsc/webpack green +
boot smoke embedded AND `-content ../api` before each chunk's in-game
checklist. Count pins move per chunk (skills 26 → ~32, milestones 11 → 12
at chunk 4; exact values pinned per chunk). The damage-pipeline chunks
(1+2) add composition-order pins (§3.1 as executable spec: one test
walking a hit through resist × DR × shield × lifesteal with hand-computed
values). New wire fields verify via codec unit tests + the in-game
checklists; no new messages anywhere in this step (client→server stays
untouched — cast activation rides the existing cooldown activation).

## 7. Consolidated wire footprint (all appends, zero breaking changes)

| Table | Field | Chunk |
|---|---|---|
| Character + Mob | `crit_taken:uint` | 1 |
| Character + Mob | `shield_hp:uint` | 2 |
| GameState | `cast_skill_id:ushort`, `cast_ticks_left:ushort`, `cast_ticks_total:ushort` | 4 |
| GameState | `activation_rejected_skill_id:ushort`, `activation_rejected_reason:ubyte` | 4 |
| Character + Mob | `aura_tick_interval:ushort`, `aura_tick_phase:ushort` | 6 |

New effect types: `shield_aura`, `instant_shield`, `hot_aura`, `self_hot`,
`revive`, `recall`, `dash` (14 → 21; +1 if chunk 6's smoke haste needs its
own type). New skill-def field: `castTicks`. New buff payloads: shield,
hot, tick_rate (3 → 6). New model fields: `Damage.Lifesteal`,
`Factors.Lifesteal`.

## 8. Definition of done (per chunk, mirrors prior steps)

Plan-first sub-discussion at chunk start (re-check this doc's ⚑s) → TDD →
full suite + build + frontend green → boot smoke both content sources →
in-game checklist passed → CLAUDE.md status + this doc's banner updated →
commit only on explicit request.
