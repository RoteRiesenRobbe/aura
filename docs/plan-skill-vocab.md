# Skill-Vocabulary Fill — Execution Step 4

> **Status: ✅ STEP 4 COMPLETE** — all 6 chunks done + verified in-game, the
> last (chunk 6) on 2026-07-14 (`3e9ab8e4`). Crit was later reworked into a
> character-driven stat (v2, 2026-07-20 — §4.3 + `backlog.md` §23).
>
> *Plan reviewed 2026-07-13 — §4 decisions resolved same day*
> (crit = sanctioned upside-only RNG; activation preconditions with
> rejection feedback replace whiff-on-no-anchor/no-corpse; tick wire =
> per-entity effective fields + interval must be manipulable → haste seam;
> chunk order 1 → 2 → 4 → 3 → 5 → 6).
>
> **CHUNK 6 (tick-indicator wire + tick-rate seam) DONE + VERIFIED IN-GAME
> 2026-07-14, committed 3e9ab8e4. LAST chunk of Step 4 → STEP 4 COMPLETE.**
> Post-verify fixes folded into the same commit: the ring-glow indicator (below,
> over two rejected cuts), the tick-cadence gate + global cadence-doubling pass
> (below), and Skills.ts Haste registration — id 34 had no entry so it defaulted
> to `Skill #34` + the `'aura'` fallback category, listing under Auras and
> highlighting aura slots while the backend correctly equipped it as a cooldown;
> adding id 34 (name Haste, maxLevel 1, cooldown) to the three Skills.ts maps
> resolved the mismatch.
> **Two chunk-start decisions locked (options laid out, user chose):**
> **(1) Accumulator semantics = RAW MODULO (option A).** The single monotonic
> `equip.TickAccumulator` stays; each effect fires when `acc % effectiveInterval
> == 0` evaluated with the CURRENT interval, and the wire phase is the same
> `acc % interval` — so the indicator beat and the actual ticks stay in lockstep
> by construction (the in-game "ticks land on the beat" check passes for free).
> Zero new state, keeps the shared counter serving all effects. Known edge: a
> large abrupt tick-SLOW can re-anchor the grid and cancel an almost-due tick —
> no content triggers it yet, and A→B (rescale, preserve fractional progress) is
> a NON-BREAKING future upgrade because §4.5 already fixes that the wire carries
> the effective value. Foreclosed by A until then: precise timing-based haste
> play + smoothly-ramping tempo (both fine to defer). **(2) tick_rate combination
> = MULTIPLICATIVE (the resist model).** Strongest-per-skill (furthest from
> unity — a skill never self-stacks) × across skills, so a haste (0.5) and a
> tick-slow (2.0) net out and two hastes stack; the ≥ 1-tick floor at
> `EffectiveTickInterval` is the ceiling. Chosen over strongest-wins because it
> is the only rule where haste can COUNTER an enemy tempo debuff (the co-op role
> play), and it reuses `ResistMultiplier`'s shape.
> Shipped: `skills.EffectiveTickInterval(e, level, factor)` in `scaling.go` =
> THE cadence source of truth (`round(Scaled(interval)×factor)`, floor 1),
> called by BOTH the firing loop (caster factor) and the model wire accessors
> (own factor, effect[0]); the old `sys.effectiveTickInterval(e, level)` is now a
> factor-1.0 wrapper kept for the VFX-style + instant-buff-lifetime callers
> (haste must not flip an aura's hit style or an instant effect's duration).
> `tickRatePayload` + `ApplyTickRate` + `TickRateFactor()` in `skills.Buffs`
> (mirrors slow; buff payloads 5 → 6). Firing loop reads the caster factor via a
> `tickRateBuffed` capability assert (default 1.0 for a caster with no store).
> `tick_rate` effect type (21 → 22) + `TickRateParams{Factor, DurationTicks}`
> (factor > 0 and ≠ 1, duration > 0) + effectKeys allowlist + `tickRateParams()`
> validator + parse-switch case; **self-targeted** — `applyTickRate` applies the
> buff straight to the caster (no query circle, `tickRateApplier` capability, mob
> content can self-haste too). Model: `AuraTickInterval()`/`AuraTickPhase()` on
> player + mob (mirror `AuraRadius`, 0 while no active aura; phase = `equip.
> TickAccumulator % interval` for effect[0]) + `TickRateFactor()`/`ApplyTickRate`
> delegates; both accessors added to the `MobEntity` + `PlayerEntity` interfaces.
> Wire: `aura_tick_interval:ushort` + `aura_tick_phase:ushort` appended at the
> end of Character AND Mob; codec both branches; Go + TS flatbuffers regen.
> Frontend: bare `AuraTickIndicator` — a thin **ring-glow ramp** (a stroked ring
> at the aura edge, alpha = `phase/interval × 0.45`, brightening toward each tick
> then discharging at the beat; the full ring stays drawn via the aura sprite,
> the hit keeps its existing slash/fire aura-hit VFX). **Iterated in-game over
> two rejected cuts:** a single orbiting dot ("didn't look good") → a translucent
> disc filling centre-to-edge ("just looks like constant alarms going off all
> over the screen") → the edge-only glow, which lights just the ring line so a
> screenful of auras reads as a calm rhythm. Wired on the own player
> (`Player.ts`), other players + mobs (`EntityManager.ts`), fed after
> `setAuraRadius`; created LAZILY on `this.shape` — NOT in `initShape`, which
> runs during `super()` before the subclass `= null` field initializer that
> would otherwise clobber it (the "Cannot read setRadius of null" crash the disc
> cut hit in-game). Explicitly NOT the step-8 polish pass.
> **Two calming changes shipped alongside the glow (post-first-verify):**
> **(a) tick-cadence GATE** — new `skills.HasVisibleTickCadence(EffectType)`
> gates `AuraTickInterval`/`AuraTickPhase` to the four HIT auras (damage / heal /
> dot / hot). State + visual auras (slow, resist, light — often `tickInterval 1`,
> i.e. re-applied every tick) produced no visible per-tick hit yet strobed the
> indicator every frame; they now report wire 0 = no indicator. Pinned by a
> predicate unit test + a Mob codec case (light-first-effect → interval 0).
> **(b) global cadence pass (user call — "everything is just too fast"):** every
> hit-aura's `tickInterval` (and the dot/hot event interval) AND its per-tick
> output (`damageHP` / `healHP` / `selfDamageHP`, incl. their PerLevel) were
> DOUBLED — DPS-neutral (same output/second, half as many, twice as chunky
> ticks), which also halves the indicator's pulse rate. 16 skill JSONs touched
> (10 damage: DamageAura/Reaper/Wild/Paladin-dmg + mob Dodo/Saber/Mammoth/
> AngryMammoth/Companion; 4 heal: HealAura/Paladin-heal + mob Healer/Campfire;
> 2 dot/hot: Immolation + mob Totem, Rejuvenation), all [PLACEHOLDER]. Instant
> cooldowns (Nova/Ignite/Recover/Stomp) untouched — not auras, no constant
> pulse. Suite + build + tsc/webpack + boot both sources (34 skills) re-green. **Deferred to step 8
> (recorded per §4.5):** buff visibility (icons/timers) — the per-entity scalars
> here don't foreclose a per-entity buff list there; the skill-metadata catalog
> message stays the direction for the Skills.ts names/maxLevels hand-sync debt
> (static data only, never intervals). Content: **Haste id 34** (cooldown,
> cooldownTicks 300, tickRateFactor 0.5 for tickRateDurationTicks 90, all
> [PLACEHOLDER]), cheat-granted `SKILL Haste`, no milestone; registry pin
> 33 → 34. 14 new tests (7 tick_rate buff semantics + 4 EffectiveTickInterval +
> caster-aware haste-fires-faster integration + 5 parse/validate + Mob codec
> round-trip). Suite + `go build` + tsc/webpack + boot smoke both content
> sources (34 skills) green. In-game checklist (before commit): mob ring damage
> ticks land on the orbiting-dot beat; dodging between beats avoids damage; with
> `SKILL Haste` on a damage aura, own ring dot + actual ticks visibly double
> together for 90 ticks.
>
> **CHUNK 5 (dash) DONE + VERIFIED IN-GAME 2026-07-14.**
> **Chunk-start decision SUPERSEDES §3.8's "facing direction":** Aura
> characters are non-turning 2D icons — no facing, no camera rotation — so a
> dash aims along the caster's **last non-zero movement direction** (current if
> a key is pressed this tick, else the last recorded one). The server never
> tracked player facing (`Angle()` is always 0, input `Rotation` dropped), so
> nothing was wired for rotation; instead the player gained `LastMoveDir()`/
> `SetLastMoveDir()` (concrete `player.lastMoveDir`, default unit `{1,0}` so a
> never-moved player still has an aim), recorded in `core/input.go` from the
> normalized non-zero movement vector — the same branch that cancels a running
> cast. Shipped: `dash` effect type (20 → 21) + `DashParams{Distance,
> DistancePerLevel}` (dashDistance > 0, +PerLevel optional), effectKeys
> allowlist (bare distance — no geometry/targeting/cadence), `dashParams()`
> validator, parse-switch case; `applyDash` (player-only; mob = no-op) walks a
> **stepped `QueryCircleStatics` probe** from the caster along the movement
> vector in radius-sized steps (mask PlayerStatic|Border, the summonPosition
> precedent), landing at the last free point — cannot tunnel a `blocksMovement`
> prop or poke past the border, naturally clamps "up to the wall"; a wall-flush
> zero-distance dash still fires (no whiff — the player cooldown path consumes
> unconditionally); landing inside a mob body is fine (dynamic, resolves next
> tick). Interrupt interplay inherited FREE from chunk 4: Dash has `castTicks`
> 0, so a mid-cast activation hits the different-slot cancel-then-fire hook and
> displaces the same tick. NO new wire (position rides the existing snapshot).
> Frontend: **teleport snap threshold lowered 600 → 180 px** (1.5 world units ×
> 120) in `_GameObject` — above per-tick walk (~6 px) but below the shortest
> dash (2.5 units / 300 px) so a dash snaps instead of smearing; Skills.ts id
> 33 (name/maxLevel/category). Content: **Dash id 33** (cooldown category,
> cooldownTicks 300 ≈ 10 s, dashDistance 2.5 + 0.5/level, all [PLACEHOLDER]),
> cheat-granted via `SKILL Dash` + spellbook-equip, no milestone; registry pin
> 32 → 33. 13 new tests (parse/scale/zero-distance-fail/key-on-other-effect;
> applyDash full-distance/level-scale/direction/prop-clamp/wall-flush/border-
> stop/non-player-noop; dash-cancels-cast integration; input records-dir/zero-
> keeps-dir). Suite + `go build` + tsc/webpack + boot smoke both content
> sources (33 skills) + gofmt all green; in-game pass confirmed ("verified
> in-game").
>
> **CHUNK 3 (HoT payloads + revive) DONE + VERIFIED IN-GAME 2026-07-14.**
> HoT scope resolved to three
> triggers via TWO effect types (⚑ §3.7): `hot_aura` (case 1, lingering heal
> after leaving range — reuses the dot-linger machinery: buff duration
> outlasts the aura re-apply cadence) + `instant_hot` (cases 2+3, self via
> `targetsSelf` / gift-to-allies via `targetsAllies`, mirrors instant_shield).
> Shipped: buff store `hotPayload`/`HotBuff`/`HotEvent` + `ApplyHot` (dot twin,
> keyed by HP, refresh keeps the acting accumulator); drain generalized
> `DueDotHits` → `DueBuffEvents() ([]DotHit, []HotEvent)` and
> `SkillSystem.tickDots` → `tickBuffEvents` (one pass, dots then hots — the
> single tick-order story); `tickHotEvents` heals `e` via `model.Healable.Heal`
> with heal-aura-style attribution from the buff POV (NoteHealedBy,
> creditHealerThreat, combat-gate on in-combat target); effect types
> `hot_aura`+`instant_hot`+`revive` (17 → 20) with `HotParams`/`ReviveParams`,
> effectKeys (`keysHotPayload` reuses healHP/variance + hotTicks/hotTickInterval;
> revive = geometry + reviveHealthFraction), validators; `applyHotAura`
> (wounded-ally implicit predicate, no self-cost, buff lingers) + `applyInstantHot`
> (instant_shield twin) + `hotBuffable` seam; `revive` effect: Viewport-mask
> `nearestCorpseID` query → precondition (no corpse = `ActivationRejectedNoTarget`,
> reason 2, no cd) at activation AND cast completion → `applyRevive` →
> **ConnState extended with `ReviveAtCorpse(corpseID, healthFraction)`**
> (state.go: reverse-lookup dead marker by corpse ID, consume like tryRespawn but
> destination = corpse + partial HP; disconnect/respawn race no-ops). AuraMaskFor
> covers hot_aura. NO new wire (heals ride floating numbers; rejection reason 2
> already reserved chunk 4; death overlay dismiss is FREE — revive sends the same
> Accept as respawn → `EndScreen.hide()`). Content: **Rejuvenation** (hot_aura, id
> 29, active_aura), **Recover** (instant_hot self+allies, id 31, cooldown ~18 s),
> **Revive** (revive, id 32, cooldown, castTicks 150 = second cast-time consumer +
> castInterruptedByDamage) — all cheat-granted, no milestone; registry pin 29 → 32.
> Frontend: Skills.ts × 3 (+ `REJUVENATION_AURA_SKILL_ID` heal-ring in Character.ts).
> ~20 new tests (buff store hot cadence/linger/refresh/drain-together; parse+validate;
> applyHotAura wounded/self/linger-duration; instant_hot self+ally; tickHotEvents
> heal+participation+combat; revive state consume/partial-HP/unknown/disconnect-race;
> revive dispatch no-corpse-rejects/fires-at-nearest). Suite + `go build` +
> tsc/webpack + boot smoke both content sources (32 skills) all green;
> in-game pass confirmed ("verified ingame and working").
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
| Heal-over-time | buff payload (inverse of the shipped dot) + aura & cooldown consumers (leaving-aura linger / self / gift — §3.7) | none — E1-compliant recovery building block (GDD §3) |
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

### 3.7 HoT payload shape (chunk 3 detail) — ⚑ SCOPE RESOLVED 2026-07-14

HoT covers **three trigger cases** (2026-07-14 decision), all delivering the
**same** heal-over-time buff — they differ only in how it is applied:

1. **HoT when leaving an aura** — a `hot_aura` re-applies the buff each aura
   tick to allies in range; the buff's duration outlasts the aura's tick
   interval, so it keeps ticking after the target walks out. This is the
   shipped dot-linger machinery inverted (`dot_aura` already "keeps ticking
   after the target leaves the aura or the caster is gone") — no exit
   detection needed; leaving simply stops the refresh and the remaining
   duration counts down.
2. **HoT on yourself** — `instant_hot` with `targetsSelf` (the GDD §3 personal
   recovery cooldown: recovery over ~15–20 s, nothing instant).
3. **HoT on others via a one-time cooldown** — the **same** `instant_hot` with
   `targetsAllies` (allies in range get the buff once).

Cases 2 + 3 collapse into ONE `instant_hot` effect type via the
`targetsSelf` / `targetsAllies` flags — the exact parallel to the shipped
`instant_shield` (decided 2026-07-14, ⚑ resolved). Two new HoT effect types
total: `hot_aura` + `instant_hot` (was `hot_aura` + `self_hot`).

**Buff store (`skills/buffs.go`), mirroring dot 1:1:**

- `hotPayload{hot HotBuff, age int}` — `HotBuff{HP, Variance, Interval,
  Caster}` (**no Tags** — heals are not mitigated by resistances). Streams
  keyed by per-event HP; same per-source strongest-wins + refresh rules as
  `ApplyDot` — a refresh resets remaining duration but does **not** reset the
  acting `age` accumulator, so an aura refreshing every tick can't starve a
  slower heal cadence (case 1 relies on exactly this).
- Drain generalization: `DueDotHits` → `DueBuffEvents() ([]DotHit, []HotEvent)`
  — one pass advances BOTH dot and hot accumulators, keeping the tick-order
  story single. `SkillSystem.tickDots` → `tickBuffEvents` accordingly.
- `HotEvent{HP, Variance, Caster}` returned to the acting site.

**Acting (`tickBuffEvents`):** dot events keep the `PlayerTouches` /
`MobTouches` damage path; hot events heal `e` via `model.Healable.Heal`
(clamp + floating heal number free) with the buff's `Caster` as healer.
Attribution mirrors the heal aura from the buff's POV (target = `e`, healer =
`Caster`): player-healer × player-target → `NoteHealedBy`;
`creditHealerThreat(e.ID, healer, healed)` per landed event (the
campfire-threat gate already guards fixtures); combat gate stamps the caster
only if `e.InCombat()` AND the caster is a `CombatActor` — the same
divergence-accepting rule as dot.

**Effect types + params:**

- `HotParams{HP, HPPerLevel, Variance, TickCount, Interval, TargetsSelf}` +
  `DurationTicks() = TickCount*Interval + 1` (the dot lifetime convention).
- `hot_aura` (`applyHotAura`): cadenced applier reusing heal_aura's implicit
  same-faction, wounded-only, never-self predicate (allies only — self-HoT is
  case 2's cooldown). No self-cost on the smoke skill (self-cost is a build
  lever, authored in step 6). NOTE: while a target sits at full HP in range
  the wounded-only gate skips re-application, so its buff can begin counting
  down before it leaves — accepted v1 behavior (mirrors heal_aura's
  wounded-only cadence).
- `instant_hot` (`applyInstantHot`): cooldown burst mirroring
  `applyInstantShield` — `targetsSelf` self-apply (counts as a hit, like
  Barrier) plus an ally query circle gated by `targetsAllies` /
  `eligibleByTargetFlags`. Self-only recovery = `targetsSelf` alone;
  gift-to-others = `targetsAllies`.

**No new wire** — heals ride `Heal` → floating numbers; buff visibility
(icons/timers) stays deferred to step 8. `hotBuffable` (`ApplyHot`) on both
players and mobs, like `dotBuffable`.

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

**v2 amendment (PO 2026-07-20, backlog §23 mini-chunk, committed
`635a44e3`): crit is a character-driven stackable stat.** Total per-hit
chance = character base (conf `game.player.critChance`, 0.05
[PLACEHOLDER]) + the `critChance` passive stat (KeenEye, 2%/level ×5) +
the effect's authored level-scaled chance (`critChance` +
`critChancePerLevel`). Chance-only authoring is valid — a crit on an
effect with no authored factor uses the global `sys.defaultCritFactor`
(×2 [PLACEHOLDER]); factor-only stays invalid. Acting-entity doctrine
holds: mobs and summons have no character base (mob skills keep authored
pairs — EliteBanditSlash 25%/×2 is untouched). DoTs still never crit;
the player dot skills (Immolation/Wildfire/Ignite) got +~5% damageHP as
compensation for the direct-hit EV lift they cannot receive. ReaperAura's
authored 25%/×2 pair was REMOVED (crits via character chance only,
~−12% sustained EV, PO accepted); DamageAura briefly carried 1%/level
authored chance and the PO removed it the same day (it made the starter
aura the strongest non-ceiling damage skill).

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

- `hotPayload` + `HotBuff` / `HotEvent` + `ApplyHot` in `skills.Buffs`
  mirroring dot; drain-site generalization `DueDotHits` → `DueBuffEvents()
  ([]DotHit, []HotEvent)` and `tickDots` → `tickBuffEvents` (§3.7);
  `hotBuffable` seam.
- Effect types `hot_aura` (`applyHotAura`, reuses heal_aura's wounded-ally
  predicate) + `instant_hot` (`applyInstantHot`, mirrors `applyInstantShield`
  — `targetsSelf` + `targetsAllies`) + `HotParams` + effectKeys / validators /
  parse. Covers all three HoT cases (§3.7): leaving-aura linger,
  self-recovery, gift-to-others (⚑ RESOLVED 2026-07-14).
- `revive` effect type per §3.6: Viewport-mask corpse query, nearest-1;
  `ReviveAtCorpse` on the chunk-4 `ConnState` seam; player rebuilt at corpse
  with [PLACEHOLDER 30%] HP; no-corpse-in-range → rejected activation
  (reason enum 2 = no valid target, already reserved in chunk 4).
- Content (smoke): `Rejuvenation` hot_aura (case 1 — lingering heal) +
  `Recover` instant_hot `targetsSelf`+`targetsAllies` (cases 2+3 in one
  cheat-granted skill — the personal recovery cooldown's mechanical
  placeholder; the REAL one in step 6 is self-only) + throwaway `Revive`
  cooldown (optionally with castTicks — second cast-time consumer).
  [PLACEHOLDER ids; count pin 29 → 32.]
- Frontend: death-overlay dismissal on server-initiated revive (§3.6 —
  verify-first, may be free); Skills.ts entries per new skill.
- Tests: hot event cadence/duration/strongest-wins + refresh-keeps-accumulator;
  Heal-clamping + floating numbers; healer-threat + NoteHealedBy on hot events;
  **hot_aura lingers after leaving range** (buff outlives the aura tick);
  instant_hot self + ally application; revive consumes the dead marker (name
  kept, progression restored, corpse + spectator removed, position = corpse, HP
  fraction); no corpse in range → rejected activation (no cd consumed, reason on
  the wire — §3.6); disconnect race no-ops.
- In-game: stand in Rejuvenation while wounded → heal ticks; walk out → the HoT
  keeps ticking a few seconds, then fades (case 1); Recover ticks own health
  over ~15–20 s and also heals a nearby wounded ally (cases 2+3); second client
  dies → Revive → overlay dismisses, corpse gone, name kept.

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

New effect types: `shield_aura`, `instant_shield`, `hot_aura`, `instant_hot`,
`revive`, `recall`, `dash` (14 → 21; +1 if chunk 6's smoke haste needs its
own type). New skill-def field: `castTicks`. New buff payloads: shield,
hot, tick_rate (3 → 6). New model fields: `Damage.Lifesteal`,
`Factors.Lifesteal`.

## 8. Definition of done (per chunk, mirrors prior steps)

Plan-first sub-discussion at chunk start (re-check this doc's ⚑s) → TDD →
full suite + build + frontend green → boot smoke both content sources →
in-game checklist passed → CLAUDE.md status + this doc's banner updated →
commit only on explicit request.
