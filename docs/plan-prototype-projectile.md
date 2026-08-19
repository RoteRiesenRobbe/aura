# Plan: Projectile ability prototype (`prototype/projectile`)

**Status: P1 (skeleton + bomb) ✅ BUILT 2026-08-19 - ⚠ PO in-game check
PENDING (§10 items 1-7). P2 + P3 not started; both hang on the P1 verdict.**
Ledger: §11.
**Branch: ON `main`, by PO ruling 2026-08-19** - the original posture (its own
branch off `main`, deliberately NOT stacked on `prototype/aura-los`, which
carries the LoS build and its uncommitted frontend work) was overridden at
execution. Posture: prototype-to-answer-a-question, but unlike LoS it
contravenes no standing ruling, so the PO verdict decides merge, park, or
delete rather than defaulting to parked.

## 1. What question this answers

Can an ability *throw an aura*? A player (later a mob/boss) launches a
short-lived entity in their last walking direction; the entity carries an
ordinary aura with fast ticks and everything in range gets the effect. Three
shapes to feel, layered onto one skeleton:

- **(a) Flying bolt** - travels in a line, damage aura ticking, expires.
- **(b) Bomb** - placed a few units ahead, arms, then detonates a burst
  (proximity mine and timed variant both).
- **(c) Frost ball** - travels, slow+damage aura active, parks while it
  overlaps someone, rolls on when it no longer does.

The deliverable is a PO verdict on whether throwing aura entities opens a
real skill expression (placement, area denial, burst dodging) inside the
no-targeting design, recorded in §11.

## 2. Scope (PO answers, 2026-08-15)

- **Layered build, bomb first**: the bomb needs no movement code, so P1 lands
  the shared skeleton + bomb, P2 adds drift for ball and bolt, P3 adds the
  mob/boss thrower.
- **Both detonations**: proximity mine AND timed bang, both feelable (D5).
- **Attackability split by caster side**: player-thrown projectiles are not
  killable by mobs in practice; mob/boss-thrown bombs are killable so players
  can burst them down before they pop. A first-class "defuse" mechanic
  (the PO flagged it might be its own thing) is out of scope; authored
  health carries the split at prototype fidelity (D6).
- **Aim: last walking direction** (PO ruling 2026-08-15, chosen over the
  cursor-facing option; the caveat and the prepared fallback live in D3 and
  §10 item 7).

## 3. Why this is cheap (survey 2026-08-15, verified at `663ae686`; re-verify line refs at execution)

- **The projectile is a mob.** A `role: structure` mob has no AI, activates
  its slot-0 aura at construction (`model/mob/mob.go:242`), and mobs are the
  only entity kind registered with the SkillSystem, ticked via `Update`, and
  cleanly removable (`PhysicsSystem.Remove` panics on statics,
  `sys/physics.go:86`). No `game.AddEntity` or codec change needed.
- **Lifetime exists**: `Mob.SetTTLTicks` (`model/mob/mob.go:899`), countdown
  in `Update` (`:1023`) zeroes health and the MobSystem death sweep removes
  after the loop; a mob without a spawn point never respawns.
- **Fast ticks are authored, not coded**: `tickInterval` per *effect*
  (`skills/definition.go:995`, `skills/scaling.go:20`), per-entity
  accumulator - `"tickInterval": 2` on the projectile's aura is the knob.
- **The spawn template exists**: `spawnSummon` (`sys/skills.go:2324`,
  spot-verified this session) does def lookup → `EnlistUnder`/`Align` → TTL →
  owner binding → placement → `AddEntity`. Two landmines it encodes carry
  over verbatim: `SetOwner` must be followed by `RestoreToFullHealth()` (the
  pool only widens once the owner is bound), and `EnlistUnder` vs `Align` is
  faction AND reaction table together.
- **Aiming exists**: `player.LastMoveDir()` (`model/player/player.go:840`,
  set at `core/input.go:468`) is exactly "last walking direction";
  `applyDash` (`sys/skills.go:1946`) is the precedent for probing along it
  against statics+border.
- **The mine trigger exists**: the mob cooldown path (`sys/skills.go:1372`,
  spot-verified) fires every ready slot every tick and *consumes only on
  hit* - "armed, waits, detonates when someone wanders in" is the shipped
  semantics of a mob holding a burst cooldown.
- **The explosion exists**: `api/skills/nova-burst.json` is an
  `instant_damage` + `instant_dot` burst around self; `burst_radius` already
  rides the wire for mobs, so the client draws the burst ring for free.
- **The arming seam exists**: `sc.SetCooldownRemaining(id, ticks)`
  (`skills/component.go:490`).
- **Rendering is free at prototype fidelity**: author
  `entityType: "NpcPlaceholder"` (the designed red-? placeholder) or reuse
  `FireTotem`; aura ring, tick indicator, burst ring and pips all already
  render for mobs. A NEW `EntityType` is deliberately not free (exhaustive
  `Record` in `GameStateMessage.ts:486`, sprite + `GraphicsConfig` entry;
  next free enum value is 76, gaps permanent) - only if this merges.
- **Tick order works out**: a mover at priority ≥ 1 runs before Physics (0)
  rebuilds collision sets, SkillSystem (-65) ticks auras on fresh overlaps,
  NetSystem (-100) sends the moved position - all the same tick.
- **`phy` velocity is vestigial**: `Space.Update` never integrates it and
  `SetVelocity` has zero callers. Drift is a mob-side hook, not physics.
- **Collision is polled, and despawn is safe**: no callbacks anywhere; shapes
  read their rebuilt `Collisions()` set, sensors register without pushing,
  and the §54 removal purge scrubs a despawned projectile from every other
  shape's set on the spot.
- **Slow is mob-only today**: players carry no `ApplySlow` (the inert
  player-CC direction, standing §3.1 watch item). The slow pip reuses the
  `AppliedEffectSlow` wire bit; the `applied_effects` byte is FULL, a
  frost-specific pip is a §39 conversation.
- **Recorded for the D3 fallback**: the client already sends the mouse-facing
  angle in every input packet (`Controls.ts:264` →
  `codec/client_message.go:29`), and the server currently drops it - nothing
  applies `PlayerInput.Rotation` to the player. Cursor aim would be a small
  `input.go` change, not a protocol change.

## 4. Decisions

- **D1 - The projectile is an authored mob def.** `role: structure`,
  `tier: normal` (no `ccImmune` requirement), `factors.xpFactor: 0` (pays
  nothing AND no nameplate, both wanted), `curveLevel: 1` (scaling comes from
  owner binding, like summons), collision layer/mask copied from Totem
  (non-blocking: nothing pushes it, it pushes nothing, hostile masks can
  still hit it). `speed: 0` for the bomb; the travelling defs author a real
  speed (P2).
- **D2 - One new cooldown effect type, `projectile`**, a case in
  `fireCooldown` modelled on `spawnSummon` (same enlist/TTL/owner sequence,
  including the `RestoreToFullHealth` ordering). Params: `spawnMob`,
  `forwardUnits` [PLACEHOLDER], `ttlTicks`, `armTicks`; P2 adds the travel
  fields (D7). Placement: dash-style probe from the caster along the aim,
  masked against statics + border; blocked early → place at the blocked
  point (visible beats unplaceable, `summonPosition`'s philosophy).
- **D3 - Aim is `LastMoveDir`** (PO ruling). Recorded caveat: kiting means
  walking away from the enemy, so a retreating player throws *behind*
  themselves and cannot hit a chaser - which reads perfectly for laying
  mines and possibly badly for the frost ball. §10 item 7 judges exactly
  this. Prepared fallback, built only on that verdict: apply the
  already-transmitted cursor rotation server-side (see §3 last bullet);
  mobile falls back to movement direction either way. For a mob caster see
  D11.
- **D4 - Detonation is the projectile's own loadout.** The projectile def
  authors a burst cooldown (a nova-burst-shaped `instant_damage`, numbers
  [PLACEHOLDER]) in a cooldown slot; the spawner arms it with
  `SetCooldownRemaining(burstSkillID, armTicks)`. The existing mob auto-fire
  path is then the entire trigger: ready + someone in the burst radius →
  fires, consumes. No new detonation machinery.
- **D5 - Mine vs timed is authoring, not a flag.** Mine: `ttlTicks` ≫
  `armTicks` (armed, waits, detonates on entry, fizzles silently at TTL if
  nobody comes). Timed: `ttlTicks = armTicks + 1`, giving exactly one fire
  opportunity - the cooldown reaches ready at the SkillSystem (-65) pass of
  tick N = armTicks, and TTL removes the mob at MobSystem (20) of tick N+1,
  which runs *before* -65 of that tick. Both authored as separate skills so
  the PO feels both; no code switch. ⚑ This ordering is the first thing the
  red-first sys test pins. Accepted coarseness: an *empty* timed bang is
  invisible (a burst with no targets applies nothing and shows nothing);
  noted in §10 item 4.
- **D6 - Attackability is authored health, no new mechanism.** Player-thrown
  defs author `baseMaxHealth` big enough that nothing plausibly kills them
  inside their few-second TTL [PLACEHOLDER]; the boss bomb def (P3) authors
  a small pool so players can burst it down. Death before arming = defused,
  through the normal death sweep (health zeroed, threat-safe, no respawn).
  A real defuse mechanic (resistances, reward, VFX, maybe its own ability
  vocabulary) is deferred per the PO note that it may be its own mechanic.
- **D7 - Drift (P2) is a small `Mob` hook.** `SetDrift(dir)`; consumed in
  `Mob.Update` for structure-role mobs: `moveTo(pos + dir·stepLength())`,
  speed from authored `factors.speed`, routed through the existing
  steer/safezone funnel. Accepted prototype coarseness: the ball *slides
  around* props instead of stopping dead (might even read as rolling);
  §10 item 10 judges it, and bypassing `steer()` for drift is the on-branch
  tweak if it reads as guided. **Stop rule** (frost ball): while the body's
  polled collision set contains any hostile-eligible entity (UserData
  check), drift pauses; set empties → resumes. Authored flag
  `stopsOnContact`; the flying bolt authors false. Static/border contact:
  drift ends, the projectile parks until TTL. No bounce.
- **D8 - The inert player-CC direction is NOT this prototype's to fix.**
  A mob-thrown frost ball lands only its damage half on players (slow
  no-ops, silently). Player-thrown vs mobs demonstrates the full mechanic.
  Slow pip = the existing Slow bit; accepted.
- **D9 - Schema NONE at every layer.** No wire change, no DB change, no
  migration; content additions only. Placeholder `entityType`; real art and
  an owned `EntityType` value only if this merges.
- **D10 - The throw skills are ordinary player cooldowns** in `api/skills/`
  (`throw-bomb`, `frost-ball`, `flying-bolt`; costs/cooldowns/cast 0, all
  [PLACEHOLDER]), granted for testing via the SKILL cheat. All content edits
  follow the add-content skill (census pins, `go test -count=1` after any
  `api/` change).
- **D11 - Mob thrower (P3).** A test boss def equips the throw cooldown; the
  mob auto-fire path already fires equipped cooldowns (the spawn path is
  explicitly kept mob-capable and pinned by test, per the comment in
  `spawnSummon`). Aim for a mob caster: the vector to its current
  chase/threat target - needs a small accessor on `Mob` (re-verify at
  execution what it already exposes); fallback is its facing `Angle()`.
  Placed in a corner of the world or via an encounter for the PO session.

## 5. Feel artifacts to read correctly

- **Mobs will aggro the player-side projectile** exactly as they aggro
  totems (it is an enlisted structure with health). With D6 health that is
  damage-cosmetic, but it can *pull* a mob onto the bomb - which is a decoy
  mechanic arriving for free. Give it its own verdict, don't read it as a
  bug.
- **The kiting throw** (D3): throw-behind-while-fleeing is intended
  mine-laying, not a bug; whether it kills the frost ball's feel is §10
  item 7's question.
- **Timed fizzles are invisible** (D5): an empty timed bang shows nothing.
  Note whether it bothers; burst VFX for whiffed bursts would be new client
  work, deliberately not pre-built.

## 6. Build steps (layered; each layer its own execution session)

**P1 - skeleton + bomb**
1. **Params + parsing, red-first.** `projectile` effect type in
   `skills/definition.go` (type enum, allowed-keys table, validation:
   `armTicks ≥ 0`, `ttlTicks ≥ 1`, `forwardUnits > 0`, spawnMob resolution
   hard-fails at boot like `spawnMob` today).
2. **Spawn + placement, red-first in `sys`.** `fireCooldown` case: spawned
   at `forwardUnits` along `LastMoveDir`; clamps at a blocking static;
   enlisted under the caster; TTL armed; full health after owner bind.
3. **Detonation, red-first in `sys`.** Mine: pre-arm entry → nothing; armed
   entry → burst damage lands and the cooldown is consumed. Timed
   authoring: fires at exactly the one opportunity tick with a target
   present; despawns without firing when empty (pins the D5 ordering).
4. **Content.** `projectile-bomb` mob def + `bomb-burst` skill +
   `throw-bomb` and `throw-mine` player cooldowns (the two D5 authorings).
5. **Verify tail (§9) + PO session** (bomb half of §10), verdict in §11.

**P2 - drift: frost ball + flying bolt**
6. **`SetDrift` + stop-on-contact, red-first in `model/mob`** (direct
   construction with a real space, like the steering tests): straight-line
   travel · pauses while the body overlaps a hostile · resumes when clear ·
   parks on static contact · TTL cleanup · nil-space safe.
7. **Travel params + content**: `frost-ball` (slow_aura + fast damage tick,
   `damageTags: ["frost"]`, `stopsOnContact: true`) and `flying-bolt`
   (damage_aura, `stopsOnContact: false`).
8. **Verify + PO session** (ball half of §10).

**P3 - the mob thrower**
9. Mob aim accessor (D11) + boss def equipping the throw + a killable bomb
   def (D6 small pool); PO burst-it-down session.

## 7. Schema impact

**NONE.** No wire change, no DB change, no migration. New content JSON only;
runtime-spawned entities are never persisted.

## 8. Test posture and expected fallout

- TDD on every Go layer (parse, sys behavior, model/mob drift); frontend has
  no code change until/unless real art lands.
- ⚑ `go test -count=1` after every `api/` edit (content does not invalidate
  the test cache); new skills appear in the catalog censuses the add-content
  skill lists.
- simharness guardrails should NOT shift - no existing skill, mob, or
  formula is touched. A shift means the change bled; chase it, don't record
  it.
- The CLAUDE.md known-inconclusive list applies unchanged; measure before
  diagnosing any flake as branch fallout.

## 9. Verify tail

`go build ./...` · `go test -count=1 ./...` (at minimum `skills`, `sys`,
`model/mob`) · `npm run typecheck` · `npm test` · `make -C backend build`
before booting (stale-binary gotcha) · boot 0 WARN / 0 ERROR · PO checklist.

## 10. PO in-game checklist

**P1 (bomb):**
1. Throw while walking each of the eight directions: the bomb lands
   `forwardUnits` ahead, ring visible, placeholder sprite fine.
2. Mine: drop, back off, lure a mob over it - detonates on entry after the
   arm delay, never before.
3. Walk through it yourself pre-arm and post-arm: it never hurts its owner's
   side.
4. Timed variant: bang at the delay with a target present; silent fizzle
   when empty - does the invisibility bother? (D5 accepted coarseness.)
5. Throw against a wall/prop: clamps visibly short, never inside geometry.
6. Mob aggro onto the bomb (§5): does the free decoy read as a feature?
7. **The aim verdict (D3):** while fleeing a chaser, throw-behind - does it
   read as mine-laying (good) or as cannot-fight-back (bad)? The cursor
   fallback hangs on this answer.

**P2 (ball + bolt):**
8. Frost ball flies straight, aura ring visible while moving, fast ticks
   land on pass-through.
9. Hits a mob: parks on it, slow pip + damage visible; mob dies or steps
   away → the ball rolls on; TTL expiry mid-flight is clean.
10. Prop in the path: slides around it (D7) - guided-missile feel or fine?
11. Flying bolt: are strafing shots aimable, or is walk-to-aim fighting the
    controls in open combat?

**P3 (boss):**
12. The boss lobs bombs at you; burst one down before it arms - is defusing
    legible and fun, and does it want to become its own mechanic (PO note in
    §2)?

13. **The actual question**, after 15+ minutes of normal play: does throwing
    aura entities open a real skill expression (placement, denial, dodging
    the burst) - and which of the three shapes earns a shipped version
    first?

## 11. Ledger

### P1 - skeleton + bomb ✅ 2026-08-19, `cced090a` - ⚠ PO in-game check PENDING

**Shipped.** New cooldown effect type **`projectile`** (34th entry in `effectTypeMap`,
`AuraCategoryNone` - the exhaustive-table pin caught the missing row red-first) -
`spawnProjectile` reuses `buildSummon` (now the part all THREE spawn placements share) plus
`projectilePosition`, applyDash's stepped probe pointed at the spawn: forwardUnits along
`LastMoveDir`, masked against statics + border, keeping the last free point. The fuse holds
EVERY cooldown in the projectile's loadout down for armTicks (naming one skill would be a
second copy of D4's fact). Content: **ProjectileBomb mob id 71** (Totem body verbatim,
`NpcPlaceholder`, health 9999, speed 0) + **BombBurst id 149** (NovaBurst's damage verbatim)
+ **ThrowMine id 150** (ttl 900 ≫ arm 45: the mine) + **ThrowBomb id 151** (ttl 46 = arm+1:
the timed bang; ONE mob def serves both since TTL lives on the throw's params). Registry
102 → **105**, mobs 60 → **61**, cheat-only **FIFTEEN** - recorded as a THIRD convention in
the inventory: prototype skills that may be deleted (vs. worked examples and test rigs).
**Schema: NONE at every layer** (D9 held).

**Execution rulings (PO 2026-08-19).** Work directly on `main` (the branch posture above,
overridden) · numbers: forward 3 u, arm 45t, mine TTL 900t, burst = NovaBurst verbatim,
health 9999, throws cost 0 / cast 0 / **CD 300t**, all [PLACEHOLDER] · ⭐ **the mine
DESPAWNS ON FIRE** - the plan gap found at execution review: D4 consumed the burst cooldown
but nothing removed the mob, so a mine husk lingered its full TTL and could re-fire once the
burst's own CD refreshed. Ruled: consumed by its own bang.

**Decisions landed in-chunk.**
- **Despawn mechanism = a `Mob` flag + `SetTTLTicks(1)`**, not a new death call: MobSystem
  (20) has already run when SkillSystem (-65) fires, so TTL-1 removes on the same tick a
  direct health-zero would have. Set at the spawn site, never authored - it belongs to the
  throw, not the mob def. Timed variant: belt-and-suspenders with its own TTL.
- **Zero-vector aim lands at the caster's feet** (fresh spawn, never walked - and a mob
  caster, which has no `LastMoveDir` seam until P3/D11). The SPAWN rule, not the dash rule:
  a dash to nowhere is nothing, a throw to your own feet is still a bomb. Pinned by test.
- **`bomb-burst` authors no `targetFactions`** - the omni-trio worry did not apply: NovaBurst
  never had one, it gates by `targetsEnemies`/`targetsAllies`. Test proves a structure
  enlisted under a player hits hostiles and spares the aligned side.
- ⚑ **Any combatant-layer body trips an armed mine, including the owner's own side**
  (harmlessly, but it is consumed): `fireCooldown` counts a non-empty query set as a hit
  BEFORE eligibility. Pinned as accepted coarseness - a projectile-specific trigger is
  exactly the machinery D4 forbids.
- **`costFractionOfMax` dropped from the burst copy** (mob cooldowns never charge; a copied
  cost would read as a price the bomb pays to explode while costing nothing). Damage verbatim.
- **`ttlTicksPerLevel` excluded from `projectile`'s allowlist** though `spawn` has it: the
  throws are maxLevel 1, a slope could only be dead authoring. Pinned by test.
- **Three frontend files changed against §8's "no frontend code"**: §8 meant ART. The
  manual's two hand-syncs for a new effect type stand (`Skills.ts` typing + the
  `SkillTooltip.ts` case), and red-first showed the degrade path rendering a literal
  `(projectile)` on every hover. The tooltip reuses the shared summon-loadout lines
  (condition widened to `projectile`).

**Verified.** `go test -count=1 ./...` (after `cp-defs` - the embedded-census gotcha bit
once, pre-`cp-defs` reds were the two mob censuses reading `backend/pkg/api/`) + an
independent re-run · `-race` on skills/sys/model-mob/items-mobs · simharness guardrails
unshifted · vitest **375/375** (+3) · typecheck · both prod builds · boot 0 WARN / 0 ERROR
census **105/61** · **harness gate** (coverage-map matches: `SkillTooltip.ts`, the shared
spawn tooltip case, the mob cooldown-fire branch): `round4-tooltip` **green** ·
`c1-open-portal` **18/18** · `chunk2-follower` **5/5 deterministic legs ×3** with the engage
leg INCONCLUSIVE all three - **REPRODUCED AT HEAD** (stash-rerun: one pass, one
INCONCLUSIVE), so it is fight-outcome variance in a deliberately tri-state leg, not P1
fallout · `harnessdb -cleanup` (9) with aurad stopped.

**⚠ PO in-game check PENDING** - §10 items 1-7 plus two new items found at execution:
- ⚑ **The bang is roughly a single-frame flash**: the burst ring is a child of the bomb's
  display object, and despawn-on-fire destroys it with the entity (the timed variant always
  had this via TTL). Damage numbers detach to world space and the dot keeps ticking; what is
  lost is the area-read. If it bothers: detach the ring to world space (new client work) or
  soften the despawn with a short delay - both out of P1 scope, PO picks.
- ⚑ Walking over your own ARMED mine detonates it harmlessly and consumes it (the
  coarseness pinned above) - judge whether it needs better before P2.

Setup: `SKILL ThrowMine` / `SKILL ThrowBomb`, equip in cooldown slots. §10 item 7 (the aim
verdict) still decides whether the prepared cursor-aim fallback gets built.

### P1 PO session 1 - 2026-08-19: four rulings, four fixes, re-check pending

**The PO played P1 and ruled on §10 items 6 and 7 plus three things the checklist
did not ask about. Uncommitted at time of writing; the second in-game pass is the
gate.**

- ⭐ **§10 item 6 - the free decoy is a BUG, not a feature.** "A mine should not be
  something mobs go towards." §5 had offered the aggro-magnet as a possible feature; it
  is not one. **Config only, one value**: `projectile-bomb.json` `collisionLayer`
  160 → **32**, the totem recipe swapped for the **poison-pool** one. The Player bit is
  what puts a body in every mob's aggro sensor (`aggroSensorMask` adds
  `LayerPlayerCollision` for anything hunting Aligned), so dropping it makes the bomb
  unseeable AND unreachable in a single edit - poison-pool has always been exactly this:
  a placed hazard that damages and is never a target. What the burst can HIT is
  untouched (it builds its own query circle; reach never depended on the bomb's own
  layer). ⚠ **P3's killable boss bomb now differs in TWO authored values**, layer and
  health, and needs the Player bit back on its own def.
- ⭐ **§10 item 3 revisited - the owner must not consume their own mine.** P1 pinned
  "any body in radius trips it" as accepted coarseness; the PO rejected it. **Code, and
  narrow**: `fireCooldown`'s two instant-damage cases counted a non-empty query set as a
  hit BEFORE eligibility, and both appliers already return the honest post-eligibility
  answer, so the fix is using it - gated on the **despawn-on-fire flag**, because a
  projectile is consumed by the hit it reports while every other mob keeps
  "found bodies, not a whiff" (that pre-eligibility rule paces ordinary mob bursts and
  nothing asked for it to change; §8 says guardrails must not shift). The old pin
  `TestProjectile_AnyBodyInRangeTripsTheArmedMine` is REPLACED red-first by
  `_OwnSideDoesNotTripTheArmedMine` + `_EnemyStillTripsAMineTheOwnerIsStandingOn`.
  ⚑ The dot applier reports IGNITED rather than eligible, so a projectile authoring a
  dot ALONE would not trip on an already-burning target; the shipped burst pairs damage
  with its dot and the damage answer carries the trigger.
- **Cost: NovaBurst's, totalled** (PO call, answering the question throw-mine.json said
  the prototype existed to inform). **Config only**: `costFractionOfMax` **0.0365** on
  the one projectile effect of both throws = that burst's 0.0199 + 0.0166, since a
  cooldown charges the SUM of its effects. The bomb copies NovaBurst's damage verbatim,
  so it now costs what it copies. Priced on the THROW, never on `bomb-burst.json` - the
  mob fire path charges nothing, so a cost there would be silently free. ⚑ Cost is
  allowed on EVERY effect type by the numbers-rewrite D5 ruling, which is why this was
  never a code change.
- ⭐ **The mine is PLACED, not thrown: `forwardUnits` 3.0 → 1.0** ("it should read as
  placing it directly before you"). **Config only.** Caster collider 0.25 + bomb collider
  0.25 means 1 unit leaves a half-body gap in front of the feet, which is what makes
  drop-and-back-off read as a single motion. ⭐ **This makes reach the pair's SECOND
  authoring axis**: `throw-bomb.json` deliberately keeps 3.0, because a bomb is lobbed and
  P2's travel wants the distance to show. D5's rule survives intact - one mob def, no code
  branching on which is which, the engine still only ever sees numbers - it is just two
  numbers now instead of one. ⛑ The burst radius is 2.0, so a mine at 1 unit blankets the
  ground its own caster stands on; harmless only because of the eligibility fix above,
  which is why these two rulings had to land together.
- **Distance reads in metres** (PO: "3u is technically correct but not understandable").
  **Frontend only, and it was a three-place inconsistency rather than one bad string**:
  the throw said `3u`, the dash said `5 units`, the radius generic printed a bare number.
  All three now spell `" m"`, documented as the rule at the radius generic. A humanoid
  body is radius 0.3 (the player's own collider 0.25), so a unit is about a person wide and
  the metre is the right lie. ⚑ Corroborating find: the constant behind the player's body is
  ALREADY called `ColliderRadiusMeters` - the codebase has quietly thought in metres since
  the Berryhunter inheritance, and only the UI was speaking units.
  10 vitest expectations updated; the `round4-tooltip` gate is unaffected (its
  `Radius: ([\d.]+)` regex still matches).

**⭐ §10 item 7 ANSWERED - the aim stays `LastMoveDir`.** Throw-behind-while-fleeing
reads as mine-laying, which was D3's bet. **The prepared cursor-aim fallback is dropped**;
P2's flying bolt inherits walk-direction aim and item 11 becomes its real test.

**Item 3 of the PO's list is DEFERRED to P2, by PO choice**: both throws should TRAVEL to
their landing spot instead of appearing there. The destination is already probed as a free
path, so a straight position lerp over ~8 ticks would render as real motion on the client's
existing buffered interpolation - but it is a strict subset of P2's `SetDrift` (step 6) and
lands there rather than as a P1.5.

**Verified after the fixes (all five):** `go test -count=1 ./...` full suite green (after `cp-defs`) ·
vitest **375/375** · typecheck · `make -C backend build` · boot **0 WARN / 0 ERROR**,
census **105/61**. ⚠ **Second PO in-game pass pending**: the four fixes, then the §10
items the first session did not reach (1, 2, 4, 5) and item 13's actual question.
