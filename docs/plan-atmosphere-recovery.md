# Plan — Atmosphere & recovery (execution step 3)

**Status:** PLANNED (2026-07-12). Execution plan + decision record for
execution-order step 3 (roadmap.md "Execution order"): **roadmap item 5**
(darkness & light) **+ the 2026-07-10 recovery/death bundle**
(`research-combat-pacing-recovery.md`: campfire death-respawn E5, death state
E7, regen combat gate E4). The aura-LoS half of the original step 3 was **cut
2026-07-10** (roadmap item 6) — no spike, no occlusion work. All numbers
[PLACEHOLDER], per the project-wide rule.

> Chunks execute **plan-first in their own sessions** (mob-depth precedent).
> This document records the planning-session decisions, per-chunk briefs,
> code reconnaissance anchors, and the open ⚑ sub-decisions to settle at
> each chunk's plan-first start.

---

## 1. Goal & scope

### 1.1 In scope

1. **Player in-combat flag + regen combat gate** — player passive regen
   currently runs mid-combat (`model/player/update.go`), against GDD §3.
   Introduce a recent-damage window and gate regen on it. Prerequisite for
   the pre-step-6 harness thresholds.
2. **Campfires** — fixed world campfires as real stateful entities: a
   stationary, unkillable aura carrier with a small `heal_aura` (recovery =
   time-at-fire, GDD §3) and — in chunk 3 — a large `light_aura`. First
   consumer of the **per-effect range check** in aura targeting.
3. **Darkness & light** (roadmap item 5) — dark areas as zone data (purely
   presentational, decided), a client darkness overlay, the **`light_aura`
   effect type** (first rendering-only effect), the early `Light` player
   skill, campfire light.
4. **Death state + campfire death-respawn** — players persist as a corpse
   until they press **Respawn** (explicit client message; the revive
   window), respawn at the **last visited fixed world campfire** (dwell-set,
   world fires only — E5), mobs get a client-only corpse fade.
5. **Minimal zone-editor support** (decided this session): campfire markers
   + basic dark-area authoring — proving-grounds test content needs both,
   and free-form areas are painful to hand-author.

### 1.2 Out of scope (recorded so nobody reaches for them here)

- **Personal recovery cooldown (E2), HoT/channel payloads, Recall, the
  revive effect type** — all step 4 (skill-vocabulary fill). Step 3 only
  builds what they consume (campfire tracker, death state).
- **The simulation harness** — pre-step-6 gate; chunk 1 here is its
  prerequisite, not its start.
- **Feast aftereffect (E3)** — open design question (GDD §12).
- **No-progress leash rule** — stays PARKED (`plan-mob-depth.md` §6.7).
- **Torch passive** — content-era (GDD App A, "zone 2+"); chunk 3's wire
  lean deliberately leaves room for it.
- **Real dark-zone content** (the zone-1↔2 tunnel) — content pass (item
  12); this step ships proving-grounds test pockets only.
- **Deleting the dead Berryhunter heat machinery** (see §2.4) — step-7
  rebrand/cleanup territory; noted there, not touched here.

### 1.3 Session decisions (user, 2026-07-12 planning session)

1. **Chunk order 1→2→3→4** — regen gate (smallest, independent) →
   campfires (the light carrier + testable heal alone) → darkness & light →
   death state + campfire respawn (biggest wire footprint; needs campfires).
2. **Docs-only planning session** — chunk 1 starts plan-first in a NEW
   session.
3. **Minimal editor support ships in-step** (not deferred to content pass).
4. **Mob corpses = client-only fade** (zero server state, zero wire; a
   server-side mob corpse only matters if future mechanics target it).
   Player corpses are server-side regardless — Revive needs a target.

---

## 2. Current-state anchors (code reconnaissance, 2026-07-12)

### 2.1 Death flow (`sys/state.go`, ConnectionStateSystem prio 10)

- Death detection: `Health == 0` at `state.go:116`. Then per tick:
  Obituary (`:119`) → `deathspot := p.Position()` (`:120` — **the corpse
  hook**) → `LoseCurrentLevelExperience()` (`:121`) → `carriedState`
  stash keyed by client UUID (`:122-125`, struct at `:34-41` — progression
  + full `*skills.SkillComponent`) → **entity removed** (`:128`) →
  spectator spawned at the deathspot (`:131-132`).
- `doFuneral` (`:138-143`, via the ECS Remove fan-out): removes the
  player's `OwnedEntities()` and **frees the name** (`s.names`).
- Re-join (`:84-112`): spectators are polled for `client.NextJoin()` — the
  client's only respawn path is a fresh `Join` message (name re-entry);
  `carriedState` restores progression + skills (`:102-105`); position =
  `randomSpawnPosition(bounds)` (`:108`; helper `:76-81`, central 80%).
- Client: Obituary → `Backend.ts:177-186` → SPECTATING + `EndScreen.show()`
  (Berryhunter "you survived N days" text); play-again reuses
  `PlayerName.prepareForm` → `JoinMessage`. Spectator = camera-only object.
- Wire: `Obituary {}` and `Accept {}` are empty; **no corpse EntityType, no
  dead status**; `GameState.player` is a `Character|Spectator` union.

### 2.2 Player regen & combat signals (`model/player/`)

- `updateVitalSigns` (`update.go:17-33`): regen whenever `0 < Health <
  max` and not god — **no combat gate**. Accumulator `healthRegen`
  (`player.go:138`) carries sub-1-HP fractions of
  `maxHP × config.HealthGainTick` (`cfg/conf.go:27`).
- `takeDamage` (`player.go:221-245`) is the **single damage choke point**
  (resists → HP → `damageTaken` accumulator → status effect). No
  recent-damage stamp exists there today.
- Existing window machinery to mirror: `attacker`/`attackerTicks`
  (`player.go:150-153`, the chunk-6 defend stamp from `MobTouches`), aged
  in `ResetTickNumbers` (`player.go:310-315`),
  `combatSignalWindowTicks = 90` (`player.go:159`). Note `PlayerTouches`
  (PvP path) does NOT stamp the attacker signal — only `MobTouches` does;
  the new window stamps in `takeDamage` to cover everything.
- Mob comparison: a mob's in-combat = `aggroTarget != nil`; mob OOC regen
  full-heals in ~2 s (`mob.go:490-494`).

### 2.3 Aura/effect machinery (chunk 2+3 seams)

- Effect-type Step-0 pattern: `skills/definition.go` — enum (`:33-48`),
  string map (`:50-64`), per-type payload pointer on `EffectDef`
  (`:167-177`), JSON-key allowlist `effectKeys` (`:467-494`), builder
  dispatch (`:622-643`). 13 types today.
- Aura sensor sizes to the **MAX** effect radius —
  `skills/component.go:41-55`, with the comment predicting the campfire:
  "effects with smaller radii would then need per-effect range checks; no
  such skill exists yet". PaladinAura (two effects, equal radii, own
  cadences) is the multi-effect precedent; the campfire is the first
  unequal-radii skill.
- Targeting seam: `selectTargets(collisions, casterPos, eligible, …)`
  (`sys/targeting.go:74-88`) — the per-effect distance filter inserts into
  the `eligible` predicate (caster position + per-effect scaled radius are
  both in hand). The instant/cooldown paths already build correctly-sized
  per-effect query circles — only the shared-sensor aura path over-reaches.
- Heal path (`sys/skills.go:401-470`): caster-type-agnostic since chunk 8
  (`model.Healable`), targets **same faction** only, skips self and
  full-health; self-cost is player-caster-only (a mob campfire pays none);
  `NoteHealedBy` fires only for player-caster+player-target (gotcha #12 —
  campfire heals create no XP entitlement).
- Stationary carriers: `speed <= 0` ⇒ aura always-on
  (`mob.go:90-97`); **Brazier layer trick** — `collisionLayer 32`
  (Viewport only) = structurally unkillable/interaction-free body, aura
  still applies (aura masks derive from faction, not body layer).
- **Faction gotcha:** the mob loader rewrites `FactionAligned →
  FactionHostile` at construction (`mob.go:121-130`) and the registry
  hard-fails an authored `"aligned"` faction (summon-only). An aligned
  campfire must get its faction **post-construction**
  (`SetFaction(FactionAligned)` — the `spawnSummon` pattern,
  `sys/skills.go:737-750`).
- Go-side placement precedents in `berryhunterd.go`: the prop loop
  (`:93-100`, per-zone list → construct → `g.AddEntity`) and the
  encounter registration type-assert (`:105-112`).
- `core/game.go` add-paths: only `addMobEntity`/`addPlayer` register with
  the SkillSystem — **an aura-emitting campfire must be a mob**, not a
  prop. The plain-`model.Entity` path (`:309-322`, static body + Net only)
  is the natural **corpse** add-path (no systems).

### 2.4 Berryhunter heat vestige (do not build on it)

The old campfire machinery is dead weight: `model.HeatRadiator`/`Heater`
(`model/heater.go`, `entity.go:48-62`), placeables still build radiators
(`placeable.go:95-105`), items still parse `heatPerSecond`
(`itemdefinition.go`), `api/items/placeables/campfire.json`/
`big-campfire.json` still exist — but **no system consumes heat** since
Block 2. The new world campfire is a **separate mob-like entity**; the
vestige (incl. the legacy placeable campfire items and the existing
`Game.ts` lower-placeable `campfire` layer) is step-7 cleanup material
(`plan-rebrand-cleanup.md`).

### 2.5 Darkness & rendering (chunk 3 seams)

- Night tint = a per-layer **`ColorMatrixFilter`**
  (`day-cycle/logic/DayCycle.ts` — flood + desaturation over an explicit
  `filteredContainers` list, `Game.ts:419-439`), driven client-side from
  `GameState.tick` + the one-time `Welcome.total_daycycle_ticks`/
  `day_time_ticks`. **A filter cannot hole-punch for lights** — darkness
  needs its own overlay layer, deliberately NOT in the filtered set.
- Layer tree: `Game.ts:152-259` — `stage → terrain.water → cameraGroup
  (terrain → placeables → characters → mobs → … → floating numbers)`;
  `vitalSignIndicators` sits on `stage` above everything (the
  "outside-the-night-filter" precedent). The darkness overlay goes inside
  `cameraGroup` above entities, below floating numbers.
- Zone schema precedent: **`TerrainTexture`** (`world/zone.go:94-107`) is
  the exact parse-and-ignore pattern for a client-visual field
  (`DisallowUnknownFields` requires the Go field; `resolve()` untouched).
  Client bundles zones by stem via `require.context` in BOTH
  `GroundTextureManager.ts:123-128` and `ZoneEditor.ts:42-49`; server
  units × `meter2px` (=120).
- Terrain "free-form" = positioned/scaled/rotated **SVG sprite stamps**,
  not polygons; the editor draws `Graphics` circles/polys for markers
  (bounds outline, wander discs) — both patterns available for dark areas.
- Aura-radius wire precedent: `Character.aura_radius` +
  `active_skill_id`; `Mob.aura_radius` (px, 0 = off) →
  `EntityManager.ts:124-130` → `setAuraRadius`. Only Mob + Character carry
  aura fields; the value is the MAX effect radius — a mixed campfire
  (large light + small heal) would stream its light radius there and
  collide with heal-ring semantics (→ the ⚑ wire lean in §6.3).
- Editor modes: `EditorMode = 'off'|'terrain'|'prop'|'spawn'`
  (`_ZoneEditorPanel.ts:24`), `SelectionKind = 'prop'|'spawn'`
  (`ZoneEditor.ts:93`); `ZoneModel.getZoneAsJSON()` serializes in the Go
  field order — new arrays must round-trip diff-clean (omit when empty,
  chunk-5 precedent).

---

## 3. Architecture leans (per chunk; ⚑ items in §6 are settled at chunk start)

### 3.1 Chunk 1 — in-combat flag + regen gate

**STATUS: DONE + VERIFIED IN-GAME 2026-07-12** (backend suite green, binary
rebuilt, boot clean, in-game checklist passed — "tested and works"). Window
length pinned:
`combatRegenGraceTicks = 5 × constant.TicksPerSecond` (= 150 ticks / 5 s)
[PLACEHOLDER], its own constant (not the 3 s `combatSignalWindowTicks`). Seams
landed exactly as below: `InCombat()` on `model.Combatant` (player = the new
window, mob = `aggroTarget != nil`); new player-only `model.CombatActor`
(`NoteCombatAction`); `takeDamage` stamps the take-harm direction; the
`sys/skills.go` `noteHarmDealt(caster)` helper (type-asserts `CombatActor`, so
mob casters skip free) stamps the caster from `applyPlayerDamageAura` (direct
casts only, `source==nil`), `applyDotEffect`, `applySlowAura` (now takes `e`),
and `applyHealAura` (only when a healed target was itself `InCombat()`);
`updateVitalSigns` returns early while `InCombat()`. Get-CC'd + summon-owner
directions confirmed inert-but-wired. Zero wire/frontend changes.

**Combat model (decided 2026-07-12, user): WoW-style *symmetric* combat
state.** Any combat interaction enters combat, from four directions:

1. **Taking harm (HP)** — hit by a mob aura / dot.
2. **Taking CC** — slowed/CC'd by a hostile (no HP loss; does **not**
   flow through `takeDamage`).
3. **Dealing harm** — the player's own harmful effect (damage / dot / CC,
   aura *or* cooldown) lands on ≥1 hostile.
4. **Supporting an engaged ally** — the player heals/buffs a friendly
   who is *itself currently in combat*.

**Time-gated exit (decided): combat drops purely on "no combat action in
N ticks."** No proximity/target scan on exit — regen may resume *while
still being chased*. This is a deliberate divergence from real WoW (which
also requires nothing hostile engaged with you) and is the *simpler*
implementation: a stamp-and-decay window, no exit-side scan.

**Seams** (the flag `effect.TargetsEnemies`/`TargetsAllies` already marks
hostile-vs-support actions, so 2–4 collapse into one helper, matching the
existing `mayHarm` one-seam ethos):

- **Taking harm (HP)** → `player.takeDamage` (`player.go:221`). The true
  HP convergence — every damage-aura tick and every dot tick already
  routes here. (Original lean; keep.)
- **Dealing harm / taking CC / supporting** → one
  `noteCombatEngagement(caster, effect, affectedTargets)` helper called at
  the end of each player-cast apply site in `sys/skills.go`
  (`applyPlayerDamageAura`, `applyDotEffect`, `applySlowAura`,
  `applyHealAura`). Stamps: the **caster** when a `TargetsEnemies` effect
  hits ≥1 target, or a support effect hits ≥1 **in-combat** ally; and a
  **player target** of a CC/harmful effect that skipped `takeDamage`.
  Cooldown instants reuse these same functions, so they ride along free.
- Window aged in `ResetTickNumbers` exactly like `attackerTicks`;
  exported `InCombat() bool`. Gate `updateVitalSigns`: passive regen only
  when `!InCombat()`. Dead-player (0-HP) and god-mode behavior unchanged;
  `StatusEffectRegenerating` only while actually regenerating.

**New seam this requires:** "ally in combat" needs a readable combat
state on *allies* — add `InCombat() bool` to the shared `model.Combatant`
interface, implemented by both player (the new flag) and mob
(`aggroTarget != nil`). Don't special-case players.

- Window length [PLACEHOLDER — `combatSignalWindowTicks = 90 ≈ 3 s` is
  likely too short for a WoW-feel drop; propose a dedicated ~150-tick /
  5 s constant at chunk start].
- **Known divergence (accepted):** caster-side combat decays on the
  caster's *own* last action, not the debuff's lifetime — land a dot and
  walk away and you drop combat while it still ticks on the enemy (the
  *victim* stays in combat, re-stamped each dot tick via `takeDamage`).
  This is exactly the pre-approved time-gating; recorded as a decision,
  not a bug.
- **Test matrix:** deal-damage→combat, take-damage→combat,
  CC-a-hostile→combat, get-CC'd→combat, heal-in-combat-ally→combat,
  heal-*safe*-ally→**not** combat, window-expiry→regen-resumes-with-
  enemy-present.
- Declining-with-level regen **tuning** is NOT this chunk — that's
  harness-era (pre-step-6). This chunk only makes the gate true to GDD §3.

### 3.2 Chunk 2 — campfires

- **Entity: brazier-pattern mob.** `api/mobs/campfire.json` — speed 0
  (aura always-on), body `collisionLayer 32` (Viewport only — unkillable,
  non-colliding, interaction-free), mask 16 (Border). New `Campfire`
  EntityType (server.fbs append + Go/TS regen + the 5-file frontend path
  incl. BOTH `Game.ts` layer steps + SVG).
- **Skill:** `api/skills/mobs/campfire-aura.json` — `heal_aura`, small
  radius [PLACEHOLDER ~1.5], flat HP per tick sized so a zero-to-full
  recovery ≈ 15–20 s [PLACEHOLDER] (GDD §3 rhythm). Selector: existing
  heal selector machinery (`lowest_health` with a generous/uncapped target
  count — ⚑ §6.2: a campfire should heal everyone standing at it).
- **Placement: Go-side from a dedicated `zone.campfires` field**
  (`[{x,y}]`) — the prop-loop precedent — via `mob.NewMob` +
  `SetPosition` + `SetFaction(FactionAligned)` post-construction (the
  loader's aligned→hostile rewrite makes def-level authoring impossible,
  deliberately). Campfires are not zone spawns: they never die, need no
  respawn machinery, and chunk 4 needs them as a first-class list of
  respawn anchors anyway.
- **Per-effect range check** lands here with a pinned test (equal-radii
  skills stay bit-identical; the campfire's chunk-3 light makes radii
  diverge for real).
- **Editor:** campfire markers (spawn-marker pattern; place/select/delete
  + serializer round-trip).
- **Content [PLACEHOLDER]:** a few proving-grounds campfires (hub +
  outlying regions) — also the chunk-4 test anchors.

### 3.3 Chunk 3 — darkness & light

- **Schema:** `zone.darkAreas` — parse-and-ignore server-side
  (TerrainTexture precedent), client-visual. Shape lean: circles
  (`{x,y,radius}`) first — simplest schema + editor authoring; polygons
  only if content proves the need (⚑ §6.4).
- **Client rendering:** one darkness overlay container in `cameraGroup`
  (above entities, below floating numbers), NOT in the DayCycle filtered
  set. Dark shapes drawn/stamped into it; **light sources punch holes**
  (ERASE blend or inverted mask; soft edges via a radial-gradient
  texture). Dark areas are dark **independent of the day cycle** in v1
  (⚑ §6.5).
- **`light_aura` effect type:** geometry-only payload (radius +
  radiusPerLevel), no targeting, no mask contribution, no sys apply — the
  first rendering-only effect type. Contributes to `EffectiveRadius` only
  where the wire needs it (see next).
- **Wire (⚑ §6.3, lean):** dedicated `light_radius` appended to
  `Character` + `Mob` (append-only, Go+TS regen) — keeps `aura_radius` =
  combat-ring semantics, works for the campfire (whose `aura_radius`
  would otherwise become the max = light radius and break the heal ring),
  and is future-proof for the Torch passive (light coexisting with a
  combat aura).
- **Content:** `Light` player skill (`api/skills/light.json`, active
  aura, early unlock [PLACEHOLDER — milestone level TBD]; the GDD §7
  trade-off: light OR damage in the active slot); campfire def gains the
  **large** `light_aura` [PLACEHOLDER ~6–8]; dark test pockets on
  proving-grounds.
- **Editor:** basic dark-area mode (place circle at click / at player,
  radius input, delete; marker rendering doubles as the preview).

### 3.4 Chunk 4 — death state + campfire respawn (one `sys/state.go` surgery)

- **Player corpse:** spawned at the `deathspot` hook — lean: a dedicated
  lean corpse entity (new `Corpse` EntityType) riding the **plain
  `model.Entity` add-path** (static Viewport-only body, Net streaming, no
  systems — the prop/codec precedent means possibly zero new wire
  *tables*). Persists until the player respawns (removed then); carries
  "revivable-by" semantics later (step 4/5).
- **Respawn message:** new `client.fbs` `Respawn {}` + union entry — the
  explicit replacement for the implicit re-Join. Server: a dead client's
  spectator waits for Respawn (Join stays the brand-new-client path).
  **Name handling gotcha:** `doFuneral` frees the name — a dead-but-
  present player's name must stay reserved until respawn/disconnect.
- **Client:** the end screen becomes a death overlay with a Respawn
  button (the "you survived N days" Berryhunter text retires); no name
  re-entry.
- **Campfire tracker:** per-client in-memory (`carriedState` pattern —
  possibly the same map), set by **dwelling N s [PLACEHOLDER] within the
  campfire's aura radius** (lean: a simple per-tick distance check
  against the small campfire list — O(players × campfires) is trivial;
  do NOT key on heal events, full-health players heal nothing). Respawn
  = stored campfire position, else `randomSpawnPosition` fallback
  (never-visited players; interim per the existing spawn rule).
- **Mob corpses:** client-only fade in `EntityManager` (decided —
  removed mobs render briefly and fade; zero server/wire).

---

## 4. Pitfalls & gotchas (found at planning; check at chunk start)

1. **Campfire healer threat / aggro magnet.** `creditHealerThreat`
   credits a healer with threat on mobs in combat with the heal target.
   A campfire healing a fighting player must NOT accrue threat: mobs
   could latch onto an **unreachable** Viewport-only body (the inverse
   of the chunk-6.5 brazier suicide) and stand at the fire forever.
   Chunk 8 recorded the crediting as Combatant-gated/inert for mob
   casters — **verify and pin** for the campfire (aligned mob caster,
   player target) at chunk-2 start.
2. **Proactive aggro on an aligned campfire:** hostile mobs' aggro sets
   include {aligned} — but sensors only see Player/Action layers and the
   campfire's body is Viewport-only, so sensor acquisition never fires.
   Keep the body layer trick; don't "fix" it to Player-layer like the
   totem (that's what makes totems killable/aggroable — wrong for a
   permanent world fixture).
3. **Heal aura self-skip:** `applyHealAura` skips the caster — fine for
   a campfire (it heals players, not itself), but any test using the
   campfire as its own target will silently no-op.
4. **`DisallowUnknownFields`:** the Go zone struct field must land
   BEFORE any zone JSON carries `campfires`/`darkAreas`, or boot fails
   by name (that failure mode is the schema gate working as designed —
   sequence code first, content second, cp-defs after).
5. **Editor round-trip:** new zone arrays serialize in Go field order
   and are omitted when empty, so pre-step-3 zones round-trip
   diff-clean (chunk-5/6 precedent).
6. **New-EntityType frontend path is 5 files + BOTH `Game.ts` layer
   steps** (`createNamedContainer` AND `cameraGroup.addChild`) — the
   chunk-1 invisible-totem trap. Applies to Campfire (chunk 2) and
   Corpse (chunk 4).
7. **Corpse must not be an `OwnedEntity`** — `doFuneral` removes
   owned entities on player removal; the corpse must survive exactly
   that moment. Add it as a plain world entity.
8. **Disconnect-while-dead:** the corpse + reserved name + spectator
   need a cleanup path (⚑ §6.7 — lean: remove corpse + free name on
   client disconnect; [PLACEHOLDER] optional corpse timeout).
9. **Wire discipline:** enum + table-field **appends only** (EntityType
   `Campfire`/`Corpse`, `light_radius`, `Respawn` message); regen Go+TS
   FlatBuffers together (flatc v24.3.25).
10. **Stale-server testing gotcha** (standing rule): `pkill
    berryhunterd`, rebuild, check the boot log before in-game checks.

---

## 5. Chunking (dependency order — decided this session)

| # | Chunk | Size | Wire | Depends on |
|---|---|---|---|---|
| 1 | In-combat flag + regen gate | S | none | — |
| 2 | Campfires (heal + zone field + range check + editor markers) | M | EntityType append | — |
| 3 | Darkness & light (schema + overlay + `light_aura` + Light skill + campfire light + editor mode) | M–L | `light_radius` append (lean) | 2 (carrier + range check) |
| 4 | Death state + campfire respawn | M–L | Corpse EntityType + `Respawn` message | 2 (anchors) |

Each chunk: plan-first in a NEW session, TDD red-first, full backend suite
+ tsc/webpack green, binary rebuilt, in-game checklist, no autonomous
commits.

---

## 6. Open ⚑ sub-decisions (pin at the relevant chunk's plan-first start)

- **§6.1 (chunk 1) — RESOLVED + BROADENED 2026-07-12 (user).** Not just
  "took OR dealt": full **WoW-style symmetric combat state** — enters on
  taking harm, taking CC, dealing any harmful effect (damage/dot/CC) to a
  hostile, *or* supporting an in-combat ally. Exit is purely time-gated
  (no exit-side proximity scan; regen may resume while still chased —
  deliberate WoW divergence). Design + seams folded into §3.1. Remaining
  open sub-item: window length [PLACEHOLDER ≈ 5 s / 150 ticks, pin at
  chunk start].
- **§6.2 (chunk 2)** — campfire heal semantics: uncapped targets vs
  capped? heals-in-combat allowed (lean: yes in v1 — attrition rides the
  regen gate; revisit if fires become combat pillars)? heal cadence/rate
  [PLACEHOLDER ≈ full in 15–20 s].
- **§6.3 (chunk 3)** — light-radius wire shape: dedicated `light_radius`
  on Character+Mob (lean) vs zero-wire client mapping
  (active_skill_id/EntityType → radius constants — rejected-lean: revives
  the hand-sync debt the `aura_radius` work just retired).
- **§6.4 (chunk 3)** — dark-area shape: circles only (lean) vs polygons
  vs terrain-style stamps; soft-edge rendering approach.
- **§6.5 (chunk 3)** — dark areas vs day/night: constant darkness
  independent of the cycle (lean) vs stacking rules.
- **§6.6 (chunk 4)** — corpse representation: dedicated lean entity via
  the plain-entity add-path riding an existing wire table (lean) vs a
  new wire table vs a dead-flag on Character. Corpse sprite/readability.
- **§6.7 (chunk 4)** — dwell duration [PLACEHOLDER]; dwell radius = heal
  radius or light radius or its own value; disconnect-while-dead cleanup
  (lean: remove corpse + free name on disconnect); does a corpse block
  the name for other joiners until then (lean: yes, trivially via
  existing mangling).

---

## 7. Cross-references

- `research-combat-pacing-recovery.md` — the E1–E8 decision prep + banner
  (E4 gate, E5 world-fires-only, E7 death state = this plan's chunks 1+4).
- `roadmap.md` — execution step 3 (this plan), item 5 (darkness & light),
  item 6 (LoS cut record), step 4 (the consumers: HoT, Recall, revive).
- `gdd.md` §3 (Recovery rhythm, Death), §7 Darkness & Light, App A (Light,
  Torch, Revive entries).
- `backlog.md` item 9 — Recall reuses chunk 4's tracker in step 4.
- `plan-mob-depth.md` §6.7 — parked no-progress leash rule (unchanged).
- `plan-rebrand-cleanup.md` — the heat vestige + legacy placeable
  campfire items (§2.4) are its cleanup material.
