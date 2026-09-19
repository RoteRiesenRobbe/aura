# Plan: Skill VFX - what a hit, a cast and a running aura look like, for everyone

> **Status: C2a BUILT 2026-09-19 `512d4afd`, PO look PASSED (the engine:
> the `SkillFx` manager on its own layer below darkness, budget + pools, the
> math module, placeholder bodies, `impact` / `projectile` / `beam` plus the
> amendment's caster-anchored `strike`, the `hitStyle` lever deleted end to end,
> `AuraTickIndicator` absorbed, `visual` on 59 skills incl. the new Lightning
> Strike). C1 BUILT 2026-09-19 `194a0cd5` (the wire: `SkillEvent` FIRED + HIT
> inside the four funnels, `Mob.owner_id`, five field names deprecated, numbers
> own-caused only, loadbot: D10 stands). C0 SHIPPED 2026-09-19 `e8f7b6b4` (the `visual` key, one per SKILL: seven
> closed kinds, three triggers, load-time validation, six generated fixture
> lists, six content files authored). C2b-C4 unbuilt.** Designed 2026-09-11
> (D1-D10 PO-ruled in one sitting; everything in §4-§7 that is not a D-number
> is still a proposal with options). Line refs pinned to `df746e53`;
> re-verify before executing. Ledger: §13.
>
> Origin: the PO picked the parked `prototype/skill-visuals` branch back up
> ("I like the general direction and want to really build something like
> this") and widened it: per ability AND per mob, visible to the own player
> and to other players, with a player option to tune it down.
>
> ⚑ **This plan pulls two slices out of `plan-entity-presentation.md` (§39)
> on purpose**: the per-hit source on the wire (its §6 items 3, 4, 10) and
> the per-effect presentation art its §3 moratorium forbade. Both are
> re-homed here, the moratorium text is rewritten by C0 (§11). Medallions
> stays parked (D8). The precedent is medallions D11 pulling the stance byte
> forward; the reverse dependency (this plan needing the medallion token)
> does not exist, because nothing here attaches to the sprite (§7.1).
>
> **Schema, whole plan: DB NONE · WIRE one enum + one table + one appended vector +
> `Mob.owner_id`, five field names deprecated (C1) + `aura_hit_style` deprecated on Mob and Character (C2a), all as built · CONTENT one new top-level skill key (C0), then the `strike` kind, the two `beam` keys and `visual` on 59 skills (C2a) · CONF NONE.**
> All numbers [PLACEHOLDER].

---

## 1. What this is

Three things the client cannot do today, and one it does badly:

1. **Show what a skill looks like.** A hit is a generic slash or a fire
   spark, chosen server-side from the aura's tick cadence, identical for a
   wolf bite, a sword and a frost bolt. The PO's 2026-08-24 mockups and the
   nine animations described 2026-09-11 (§4.3) want per-skill identity.
2. **Show it for anyone but the own player.** The prototype was own-player
   only and client-only. Other players' active skill id and every mob's def
   id already ride the wire, so *what* an actor is running is knowable;
   *who landed this hit* is not on the wire at all (§3.2).
3. **Attribute a number.** Every entity draws its per-tick damage aggregate,
   so a five-player fight is a wall of numbers nobody owns, and a dotted mob
   walking out of your range shows a number you cannot tell is yours.
4. **The existing lever is a dead end.** `hitStyle` (auto / slash / fire /
   none) is a per-effect JSON enum, a Go enum, a per-tick stamp on both
   models and a wire byte on both entity tables, and it carries exactly one
   bit of style. Two skills author it. It is deleted by this plan (D7).

## 2. The rulings (PO, 2026-09-11)

- **D1 · Everyone sees everything, full, by default.** One density slider
  in the client settings (off · low · full) tunes ALL skill VFX down, own
  and others alike. Not two settings, not per-kind toggles.
- **D2 · Every category gets visuals.** Damage auras, heal / shield / light
  auras, cooldowns. **Passives only on their hit moments** (the FireShield
  reflect); they carry no ambient dressing.
- **D3 · Mobs use the same vocabulary, authored on the skill file.** Mobs
  already cast through the skill system, so a visual authored on
  `wolf-bite.json` covers every wolf for free. No separate mob VFX system,
  no threat-readability rule imposed by the engine (content decides).
- **D4 · A closed preset vocabulary plus parameters.** Seven motion kinds
  (§4.1); a skill authors a list of layers; each layer names a kind, a body
  and a few tunables. **Bodies are artist sprites; every kind ships a
  procedural placeholder body**, so a skill is authorable before any art
  exists and the artist swaps bodies without touching timing.
- **D5 · Honest attribution now: a per-hit event on the wire**, pulled out
  of §39. Not the prototype's inference, for anyone.
- **D6 · Numbers are attributed and own-caused only.** A floating number
  appears for damage or heals the own player DEALT (including a DoT tick on
  a mob that has left range) and for damage or heals the own player TOOK.
  Other players' numbers, dealt or taken, are never drawn. The prototype's
  impact-deferred number is DROPPED: the number sits at the server tick, as
  on main today. (PO: with two players the numbers are already
  incomprehensible, with five they are meaningless.)
- **D7 · Delete the `hitStyle` lever end to end**, and absorb the
  `AuraTickIndicator` glow as the new system's wind-up phase, so one module
  owns a beat from wind-up to impact. Single source of truth over a
  fallback layer.
- **D8 · Own plan, runs next; medallions stays parked.** Spell builder C2/C3
  continue in parallel; the editor's Visuals section (its D3 placeholder)
  becomes this vocabulary's authoring UI in a later spell-builder chunk.
- **D9 · The event is recorded INSIDE the four funnels** (player and mob
  `takeDamage`, player and mob `Heal`), not at the eight acting sites. The
  damage and heal payloads gain the caster and the skill id; the two
  receive-a-hit interfaces change signature once; a future damage path
  cannot forget the event. (The silent-wiring class has struck this project
  twice; structure over discipline.)
- **D10 · Mob-versus-mob hits ride the wire, area-filtered.** Every hit
  inside the viewer's area of interest is an event, so authored mob-on-mob
  fights get their visuals. **C1's loadbot measurement may veto this**; the
  fallback is "events only when a player is source or victim".

## 3. What exists today (inventory, HEAD `df746e53`)

### 3.1 The prototype, a quarry not a base

`prototype/skill-visuals` at `f2e4083c`, forked from main 2026-08-24, PO
first pass "works". Four dressings by a client-side skill-id table: ice
particle field (Frostbite 141, Hoarfrost 146), sword thrust (Damage 1),
fireball / frost bolt with an impact-deferred number (LongRangeStrike 45,
Suppression 59). Attribution by inference (own beat this snapshot + victim in
reach + damage landed), which over-draws on same-tick multi-source hits.

Harvest: `SkillVisualsMath.ts` and its 16 vitest cases (deterministic flake,
strike and projectile math), the below-darkness layer rule (a fireball must
not be the first thing to light a tunnel), and the harness
`skill-visuals-proto.mjs` with its Chromium no-throttling flags (without
them a headless page stalls the websocket for seconds and every timing leg
starves). Do NOT rebase the branch; delete it after C2 lands. ⚑ `git
checkout main` keeps serving the prototype bundle until `npm run build`
reruns (`frontend/dist` is untracked).

### 3.2 The wire

| Field | Where | Role today | Fate |
| --- | --- | --- | --- |
| `Character.active_skill_id` | `server.fbs:337` | the own and other players' running aura | stays; drives AMBIENT layers for other players |
| `Mob.mob_id` | `server.fbs:206` | mob def → its authored skills | stays; drives ambient layers for mobs |
| `aura_tick_interval` / `aura_tick_phase` | both tables | the wind-up glow | stay; drive the wind-up phase (D7) |
| `aura_category` (ubyte, FULL) | both tables | ring colour | stays; untouched by this plan |
| `damage_taken`, `crit_taken`, `heal_received`, `immune_hit` | both tables | per-tick aggregates → floating numbers | **deprecated** by C1 (replaced by hit events) |
| `aura_hit_style` | both tables | the slash/fire byte | **deprecated** by C1 (D7) |
| `Character.is_hit` | `server.fbs:320` | legacy hit flag | **deprecated** by C1: decoded (`GameStateMessage.ts:471`) but no consumer reads `isHit` |
| `GameState.cast_skill_id` | own player only | the cast bar | stays; other players' casts arrive as FIRED events |

⚑ All six deprecated fields are read by the ENCODER ONLY (`codec/mob.go:43-51`,
`codec/gamestate.go:54-65`); no simulation reads them (verified 2026-09-11: the bare fields on both
models have only their declaration, their write and their per-tick reset;
the getters have only the codec), so removing them from the encode cannot
change the sim. FlatBuffers keeps the vtable slots
(`(deprecated)` attribute); the client decode stops reading them.

### 3.3 The server funnels

Every landed hit passes one of four methods, and the eight acting sites all
end there:

| Funnel | Callers today |
| --- | --- |
| `mob.takeDamage` (`mob.go:2144`, `:2162`) | `MobTouches` (mob aura, `Factors`), `PlayerTouches` (player aura / cooldown / DoT tick via `model.Damage`) |
| `player.takeDamage` (`player.go:777`, `:899`) | `MobTouches` (mob aura + DoT ticks), `PlayerTouches` (rare: summon / reflect paths) |
| `mob.Heal` (`mob.go:1995`) | heal auras (`skills.go:533`, `:972`), HoT ticks, lifesteal (`healable.go:37`) |
| `player.Heal` (`player.go:467`) | same three |

What the funnels do NOT know today, and D9 makes them carry: the
**caster** (`model.Damage.Source` is summon-only; `MobTouches` takes
`mobs.Factors` with no entity; `Heal(hp uint32)` takes a bare number) and
the **skill id** (nowhere in either payload). `DotBuff.Caster any`
(`buffs.go:190`) already survives the victim leaving range, which is the
D6 case; ⚑ whether the DoT stream also keeps its SKILL id is a C1 landmine
to verify (`ApplySlow(source skills.SkillID, ...)` shows the slow does).

### 3.4 The client

`EntityManager.ts:230-245` turns the four aggregates into floating numbers
and `:256` calls `showAuraHit`; `Player.ts:178` does the same for the own
character. `_GameObject.ts:446` draws a number, `:533` the slash/fire.
`AuraTickIndicator.ts` glows the ring toward each tick from the interval /
phase fields. `MobJuice.ts` plays the hit sounds. `AuraRings.ts` and
`EffectPips.ts` are category colour and applied-effect state; both stay.

## 4. The vocabulary (D4)

### 4.1 Seven kinds

| Kind | Trigger | What moves | Placeholder body |
| --- | --- | --- | --- |
| `impact` | hit | a small round burst ON the victim, never directional, tinted by damage type, OPT-IN (§12c.1); `curve` picks burst or snap | a small round burst |
| `strike` | hit | a weapon starts at the ATTACKER and travels into the victim; `curve` picks the style AND the weapon (§12c.1) | a spear (thrust), a blade (swing), a hammer (overhead) |
| `projectile` | hit | a sprite flies caster→victim, straight, constant speed, ends in an impact | a filled circle with a trail |
| `beam` | hit | a body stretched caster→victim with an intensity envelope and a width curve; `curve` picks the envelope (`flash` = attack/peak/fade, `extend` = extend/retract, C2a) | a jagged polyline (lightning) or a gaussian ribbon |
| `cast-pose` | fired | a sprite shown ON the caster for the duration of a cast or a tick (the bow) | a small rotated rectangle |
| `orbit` | fired / ambient | N sprites circle the caster for a duration | two rotating wedges |
| `emitter` | ambient / fired / hit | particles from a point or a disc, with a motion (`swirl`, `rise`, `burst`) and a lifetime | tinted circles |

Kinds are ENGINE code and closed. A new kind is a plan amendment, not
content. Everything else is a parameter.

### 4.2 Layers, triggers, bodies, palette

A skill carries one new top-level key, `visual`, holding a list of layers:

```jsonc
"visual": {
  "layers": [
    { "kind": "cast-pose",  "on": "fired", "body": "bow",       "ms": 250 },
    { "kind": "projectile", "on": "hit",   "body": "arrow",     "speed": 900 },
    { "kind": "impact",     "on": "hit",   "body": "arrow-hit", "curve": "snap" }
  ]
}
```

- **`on`** binds a layer to a moment: `ambient` (while the aura is the
  actor's active aura, from `active_skill_id` / the mob def), `fired` (a
  FIRED event: a cast went off, targets or not), `hit` (a HIT event: once
  per victim). A layer with `on: hit` on a three-target aura draws three
  times in one tick; that is the flame-pillar case, no special casing.
- **`body`** names an entry in the atlas (§6). Absent → the kind's
  placeholder. A `sheet` body plays frames (the wolf teeth).
- **Palette** derives from the skill's damage type by default (`fire`,
  `frost`, `nature`, `poison`, `bleed`, `physical`: six, from the
  vocabulary fixture) and from the category for heal / shield / light;
  `tint` on a layer overrides.
- **Tunables** are per kind and few: `ms`, `speed`, `curve`, `chain`, `count`,
  `motion`, `width`, `tint`, `scale`. The Go struct is the list (§5.1); the
  fixture exports it; the editor renders it; `smoke.mjs` pins it both ways
  (the spell builder's L1 rule, unchanged).

Open (§10 Q1): whether `visual` sits on the skill or on each effect. The
event carries the skill id, so the skill level is the cheap default; a
skill with two effects (damage + slow) has one look.

### 4.3 The nine PO examples, decomposed

| PO description (2026-09-11) | Layers |
| --- | --- |
| Sword stab directly on the mob | `strike` (thrust curve; §12c.1, was an `impact`) |
| Overhead mace, arc from above the player down onto the mob | `strike` (overhead curve) + `impact` (burst) |
| Wolf bite: teeth appear, snap shut in a quick motion | `impact` (sheet body: open→closed) |
| Firebolt, straight line, constant speed | `projectile` + `impact` |
| Lightning: weak, then bright and bold, then fade | `beam` (jagged body, envelope attack→peak→fade, width follows) |
| Arrow: a bow in the player's hand, an arrow flies and hits | `cast-pose` (bow) + `projectile` (arrow) + `impact` |
| Flame aura, up to three mobs at once: fire pillars extend and return | `beam` ×N (gaussian ribbon, envelope extend→retract) |
| Two axes spinning around the character, hits everyone around | `orbit` (2 bodies, the ability's duration) + `impact` (burst) per victim - the axes are the orbit's bodies, so there is no `strike` here |
| Heal: green crosses and mist rise from the player's centre | `emitter` (motion `rise`, two bodies: cross, mist) |

Every one of the nine is covered by the seven kinds with zero engine
special-casing, which is the test the vocabulary has to keep passing.

### 4.4 What the prototype's four map to

`field-ice` → `emitter` (`motion: swirl`, ambient) · `strike-sword` →
`strike` (thrust; §12c.1 corrected this row, which mapped the prototype's
caster-anchored sword onto the victim-anchored `impact`) ·
`projectile-fire` / `projectile-frost` → `projectile` + `impact` with the
palette doing the colour. The impact-deferred number does not survive (D6).

## 5. The wire (D5, D10)

### 5.1 Two event kinds, one table

```fbs
enum HitKind : ubyte { Damage = 0, Crit, Heal, Absorb, Immune }

table SkillEvent {
  source:ulong;        // the caster entity (the summon on owned casts, the reflector on a reflect)
  victim:ulong = 0;    // 0 on a FIRED event
  skill_id:ushort;
  amount:uint = 0;     // post-mitigation, display units; 0 on FIRED / Immune
  kind:HitKind = Damage;
  fired:bool = false;  // true = the cast went off (targets or not); false = a landed hit
}

// GameState gains, appended:
  skill_events:[SkillEvent];
```

- A **FIRED** event is emitted once per cast or per aura tick that ran its
  selector (targets or not): spinning axes with nobody in range, a self
  heal, ThrowMine, the portal pair. ⚑ Without it nothing but the own
  player's `cast_skill_id` could show a cast, and that field is own-only.
- A **HIT** event is emitted inside the four funnels (D9), once per victim
  per landing, INCLUDING DoT / HoT ticks (the caster travels in the buff
  payload), lifesteal heals (source = the leeching entity, skill = the
  hitting skill) and reflects (source = the reflecting player, skill = the
  passive). An `Immune` hit carries amount 0 (replaces `immune_hit`).
- **Per-viewer filter:** an event ships to a client when its source OR its
  victim is in that viewer's viewport set (`core/net.go:258`
  `p.Viewport().Collisions()`), the same test that decides which entities
  ship. Nothing new to maintain.
- **Coalescing:** none. One landing is one event; the aggregate was the
  thing being removed.

Alternative considered: two tables (`Fired`, `Hit`) in a union. Rejected as
YAGNI; the `fired` flag plus a 0 victim is unambiguous and one vector is one
encode loop.

### 5.2 What it replaces

The six per-entity fields in §3.2. The client's floating numbers,
"Immune" label, crit pop and hit VFX all become consumers of
`skill_events`. ⚑ The numbers' placement (lanes by kind + a free-slot
stack per lane, `FloatingNumberLayout.ts`, fixed 2026-09-13 off a PO
screenshot) is per spawn, so C1 keeps calling `showFloatingNumber` per
event and inherits it; the per-hit stream is exactly the load it was
sized for. Byte-identical simulation by construction (the fields were
encode-only), pinned by the existing sim-determinism tests plus a new
codec test that a snapshot with N landings carries N events.

### 5.3 Perf, measured not guessed

Encoding is 57 % of the tick (`plan-server-performance.md` §1) and the
event vector is PER VIEWER, so it cannot ride perf chunk 1's per-entity blob
cache. Its cost is proportional to landed hits inside a viewport, which is
the same order as the aggregates it replaces (FlatBuffers omits default
zeros, so an aggregate costs bytes only when a hit landed, exactly when an
event would). Each event is ~24 B; the six aggregates were up to 17 B per
struck entity per tick, so a single-source hit costs about the same and a
three-source hit costs ~3×.

**C1 is not done without the loadbot leg**: clustered 50 (the memory's
ceiling scenario), snap/s floor against a local control on the same
machine, tickstats before and after, `auras CONFIRMED LIVE n/n`. That
measurement is what rules D10's fallback in or out.

## 6. The art pipeline (D4)

- **Atlas contract**, in `docs/art/skill-vfx-asset-spec.md` (C3): one
  in-repo spritesheet per family (`fx-physical`, `fx-fire`, ...) or one
  shared sheet, PNG + JSON frames, every body named as the `body` string
  content uses, oriented "pointing +X" so the engine rotates once. The
  medallions precedent (D16-D18: artist-led proportions, in-repo delivery).
- **The body resolver**: `body` → atlas frame if present, else the kind's
  placeholder. A body named in content that no atlas carries is a
  `-validate` ERROR (C2 of the spell builder), never a silent placeholder
  in shipped content; in dev it draws the placeholder and logs once.
- **Placeholders are Graphics primitives** as the prototype's, deliberately
  ugly enough not to be mistaken for art, tinted by the palette so a
  placeholder firebolt still reads as fire.

## 7. The client engine

### 7.1 One manager, one layer, nothing on the sprite

`SkillFx.ts` owns ONE world-space container on `layers.skillFx`, below
`layers.darkness` (the prototype's rule). Layers are positioned per frame
from the source and victim game objects' current positions (they follow a
moving victim); they are NOT children of any entity sprite. That is how
§39's "seventh independently-anchored overlay" objection is met: nothing
new hangs off the sprite, the medallion refactor (C0 sub-containers) can
land later without touching this.

Death or despawn of the source or victim: a `projectile` and a `beam`
finish toward the last known position (a bolt in flight does not vanish
when its target dies); `orbit` / `cast-pose` / `emitter` stop with their
owner. The prototype's `reset()` lesson: the own player's death must
disarm every ambient layer.

### 7.2 Structure

- `SkillFxMath.ts` (vitest, no renderer): every curve, envelope, path and
  particle position as pure functions of (params, elapsedMs). Harvests the
  prototype's math; the "nothing here is random" rule stands so a test can
  assert a position.
- `SkillFxKinds.ts`: the seven kind classes, each `spawn(ctx) → Fx` and
  `update(dt)`; a registry keyed by kind name; the registry IS the closed
  vocabulary, pinned against the fixture's kind list both ways.
- `SkillFxBodies.ts`: the body resolver (§6).
- `SkillFx.ts`: the manager: consumes `skill_events` and the ambient state
  (`active_skill_id` / mob def), resolves skill → `visual`, spawns, ticks,
  pools, enforces the budget.
- `FloatingNumbers` (existing draw in `_GameObject.ts:446`) gets a new
  single caller: the event consumer applying D6's rule (source is own OR
  victim is own; never for other players in either role).
- `AuraTickIndicator` becomes the manager's wind-up phase: the same ring
  glow, driven by the same two wire fields, spawned as an ambient layer of
  every running aura. Its file goes away; its behaviour does not.

### 7.3 The density slider (D1)

`off · low · full`, persisted in `localStorage` beside the audio settings
(`features/audio/logic/Audio.ts` is the precedent), surfaced in the
existing settings surface of `plan-ui-pass.md`'s chrome. What `low` cuts is
§10 Q2; the proposal: particle counts × 0.4, no `emitter` ambient layers for
OTHER actors, everything else unchanged. `off` keeps the wind-up glow and
the floating numbers (they are readability, not dressing). **Mobile
defaults to `low`** (fill rate is the proven mobile failure mode,
`project_mobile_layout`), §10 Q3.

### 7.4 Budget

A per-frame cap on live Fx (e.g. 96 [PLACEHOLDER]) with oldest-first
eviction, a `ParticleContainer` for emitters, object pools per kind. The
prototype header's two known world-scale upgrades, done up front rather
than after the fact.

### 7.5 Sound

Out of scope, one seam: `MobJuice.ts` re-triggers its hit sound from the
HIT event's impact moment instead of `damage_taken`. A per-layer `sound`
key is NOT added (YAGNI; `plan-region-audio.md` owns the audio lane and can
add it when it has a consumer).

⚑ **As found in C1 (2026-09-19): that seam does not exist.** No caller passes
`soundData` to `StatusEffect.forDamaged`, so `mobHit` never plays today and
there was nothing to re-trigger. C1 left it alone; wiring a hit sound is new
work for the audio lane, fed by the HIT event when it has an owner.

## 8. Deletions

- The `hitStyle` lever end to end (D7): `skills/definition.go:193-215`
  (enum, map), `catalog.go:28,53`, `sys/targeting.go auraHitStyleFor`
  (⚑ §8 long said `sys/skills.go:731`; it moved) + `sys/skills.go:507`,
  `model/status_effects.go:76-97`, `NoteAuraHit` / `AuraHitStyle` on
  both models (`mob.go:634,2009-2017,2139`, `player.go:176,475,620,743`),
  the two codec lines, the `Skills.ts:30` client type, `showAuraHit` and
  its two call sites, the two authored `"hitStyle"` values in `api/skills/`.
  ⚑ The vocabulary fixture (`effectKeys`) drops the key, so `smoke.mjs`
  reddens on any stray `hitStyle` left in content: the deletion is pinned.
- The six aggregate fields: encode + decode + the `EntityManager.ts:230-245`
  reader; the Go accumulators (`damageTaken`, `critTaken`, `healReceived`,
  `immuneHit` on both models) go with them once no reader remains. ⚑ Keep
  `tookDamage` / `inCombatTicks`: those are SIM state that happens to sit
  beside the accumulators (`mob.go:1960-1966`).
- `AuraTickIndicator.ts` (absorbed, D7).
- `prototype/skill-visuals` (after C2) and, for its shipped purpose,
  backlog §57's `prototype/attack-lines` (§11).

## 9. Chunks

Each chunk: its own session, red-first where a seam exists, the verify
tail of CLAUDE.md, a schema line, a ledger entry in §13. **Every visual
chunk owes a PO look with screenshots before it is called done** (the spell
builder C1 lesson: a chunk whose purpose is a look is not done without one).

- **C0 · The vocabulary + the docs amendment.** ✅ **SHIPPED 2026-09-19.**
  Go: `skills/visual.go` holds `VisualDef` / `VisualLayer`, the six closed
  tables and the load-time validation, called from `mapToSkillDefinition`;
  `visual` is a top-level key on the SKILL (§10 Q1) and rides
  `SkillDefinition` to the HTTP catalog. Refusals: unknown kind, unknown
  trigger, a trigger the kind does not play at, a key the kind does not read,
  `curve` / `motion` outside their sets, a non-positive `ms` / `speed` /
  `width` / `scale`, `count` < 1, a `tint` that is not lowercase `#rrggbb`, a
  `visual` with no layers, and **D2 by category** (see §10). Fixture regen
  gains all six lists; `smoke.mjs` pins them and checks every authored layer.
  Content: `visual` on the prototype's five skills + `wolf-bite`, placeholders
  only. Docs: §11's amendments. **Schema: CONTENT one key.**

  ⚑ Two departures from the line above as it was designed, both PO calls of
  2026-09-19: **`hitStyle` stays put** (§10 Q6 resolved for C2, so main never
  carries a fixture that rejects shipped content), and **`body` is neither
  checked nor warned** rather than "warned until an atlas exists": C0 has no
  warning channel to degrade through (`mapToSkillDefinition` returns an error
  or nothing), and inventing one for a rule that becomes an ERROR at C3 is the
  machine this project keeps choosing not to build. The rule is written in
  `manual-content-authoring.md` §2 instead: author no `body` before the atlas.
- **C1 · The wire.** ✅ **BUILT 2026-09-19** (§12a is the spec as built, §13 the
  ledger; `MobJuice` and `aura_hit_style` left scope). `SkillEvent` + `skill_events` appended; the payload
  widening (`model.Damage` + a heal payload carry caster + skill id;
  `MobTouches` / `PlayerTouches` / `Heal` signatures change once, D9);
  FIRED emission at the cast and aura-tick sites; HIT emission inside the
  four funnels; per-viewer filter; both binding sets regenerated; client
  decode; **floating numbers switched to the events under D6's rule**;
  five field names deprecated; `MobJuice` left to the audio lane. Sim-determinism pins
  green; new codec test (N landings → N events, filter honoured); loadbot
  leg (§5.3) recorded in the ledger, D10 fallback ruled. **Schema: WIRE
  appended + deprecated.** ⚑ Verify the DoT stream's skill id (§3.3).
- **C2a · The engine + three kinds.** ✅ **BUILT 2026-09-19, PO look PASSED**
  (spec: §12b, the `strike` amendment: §12c, ledger: §13). `SkillFx` manager,
  layer, budget, pools, math module (prototype harvest), body resolver with
  placeholders, `impact`, `projectile`, `beam`; own player, other players,
  mobs; the `hitStyle` lever deleted; `AuraTickIndicator` absorbed. Browser
  harness (Chromium no-throttling flags). Screenshots. **Schema: NOT NONE, as
  §12b.2 corrects: WIRE one field name deprecated, two slots**
  (`aura_hit_style` on Mob + Character), both binding sets regenerated;
  CONTENT the `beam` keys, `visual` on 52 more files, one new skill; DB and
  CONF NONE.

  ⚑ **Four kinds shipped, not three**: the PO's first look rejected the
  victim-anchored wedge, so §12c added the caster-anchored `strike` (replacing
  `arc-swing`, still seven kinds) and made `impact` a small opt-in round burst.
  28 files were re-authored for it the same day.
- **C2b · The other three kinds + the slider** (`arc-swing` became C2a's
  `strike`, §12c). `cast-pose`,
  `orbit`, `emitter`; the density setting (§7.3) with mobile default; the
  nine PO examples authored with placeholders as the acceptance set.
  Screenshots + PO play. **Schema: NONE.**
- **C3 · Art.** Atlas contract doc, first artist sheets in-repo, the body
  resolver's ERROR path armed in `-validate`; the spell builder's Visuals
  section renders `visual` (that chunk lives in `plan-content-editor.md`'s
  ledger, cited here). **Schema: NONE.**
- **C4 · World scale.** Density 10× harness with the slider at each level,
  frame-time before/after, the cap tuned, mobile fill-rate check on a real
  phone. **Schema: NONE.**

C0 and C1 can be built in either order; C2a needs both.

## 10. Open questions (carried, not blocking)

1. ~~`visual` per skill or per effect?~~ ✅ **RESOLVED 2026-09-19 (PO): per
   SKILL**, one top-level key, never per effect. Built that way in C0.
2. What does `low` cut? Proposal in §7.3.
3. Mobile default `low`? Proposal yes.
4. Default dressings for heal / shield / light auras that author no
   `visual`: none (plain ring as today) vs a category default. Proposal:
   none; content authors what it wants, the ring stays the baseline.
5. Does the `AuraRings` tint follow the layer palette, or stay the category
   colour? Proposal: stays; the ring is gameplay information (range +
   category), the layers are dressing.
6. ~~Where does the `hitStyle` content deletion land, C0 or C2?~~
   ✅ **RESOLVED 2026-09-19 (PO): C2, with the code.** C0 touched `hitStyle`
   nowhere: not the Go enum, not `effectKeys`, not the two authored values,
   not the client. Main never carries a fixture that rejects shipped content,
   and the lever leaves in one piece when its replacement can draw.
7. ✅ **RESOLVED 2026-09-19 (PO): casts + flagged auras**, §12a.4. Was: FIRED cadence for an aura: every tick (30 Hz for a 1-tick aura) is
   wasteful on the wire for an ambient-only skill. Proposal: emit FIRED
   only for skills whose `visual` has an `on: fired` layer, resolved at
   load into a per-skill flag; the sim never reads it.
8. A cast BAR for other players is §39's (cast progress); the FIRED event
   deliberately carries no progress.
9. ✅ **RESOLVED 2026-09-19 (PO): `Mob.owner_id`**, §12a.5. Was: Own-summon numbers: a summon's hit has `source` = the summon, and D6 says
   "dealt by the own player". Proposal: yes, show them, resolved through the
   owned relation client-side (XP already credits the owner; the number
   should agree with the XP). Needs the owner id on the wire or a client
   lookup; C1 decides which.

10. **The flinch** (PO 2026-09-19, carried): a 2-3 px, ~80 ms nudge of the
    victim's sprite away from the attacker on every landed damage hit, the
    WoW hit-react. Not built: it transforms the entity sprite and fights the
    position interpolation; belongs to `plan-entity-presentation.md`.

### 10.1 Rulings made while executing, recorded here

- ⭐ **D2 is enforced at LOAD, by skill category** (PO 2026-09-19, built in
  C0). `visualTriggersByCategory` (`skills/visual.go`): an **active aura** may
  author all three moments, a **cooldown** `fired` and `hit`, a **passive**
  `hit` alone. Both halves are hard-fails naming the skill, the layer index
  and the rule. The reasoning is D2's own: a passive is neither switched on
  nor cast, so it has no "while active" moment and no cast moment, and a
  cooldown is never the running aura. Without the gate an authored `ambient`
  on a passive would load clean, draw nothing, and look like a renderer bug.
  ⚑ This is a LOAD rule, not a renderer rule; C2a still has to decide what an
  `ambient` layer does while an aura is equipped but not switched on.

## 11. Docs this plan amends (C0's first task)

All ✅ **DONE 2026-09-19** unless marked otherwise.

- ✅ `plan-entity-presentation.md`: §3's moratorium rewritten to "no new
  independently-anchored overlay on the sprite" and nothing else; §6 items 3,
  4 and 10 replaced by pointers here (C1, C1, C0+C2a); §7's "wire shape"
  question keeps only its per-entity half; the status block says rewritten.
- ✅ `CLAUDE.md`: the Status "Next" entry (done 2026-09-11, rewritten to C1 by
  the 2026-09-19 wrap). ⚑ The "gotcha line repeating the moratorium" this
  list owed does not exist: at the wrap only the Next entry mentioned the
  moratorium, and it now points at C1. Nothing left to edit.
- ✅ `docs/feedback.md` 2026-08-24 row: pruned to "→ plan-skill-vfx.md
  (DESIGNED 2026-09-11, C0 shipped 2026-09-19)".
- ✅ `plan-content-editor.md` D3 / §B4.8: the Visuals placeholder now points
  here and says the key is hidden and preserved until C3. ⚑ `hitStyle` STAYS
  in the shipped-vs-open audit: §10 Q6 put its deletion in C2.
- ✅ `backlog.md` §57: its head note now says the shipped version is C2a, not
  §39, and that `prototype/attack-lines` is deletable once C2a lands.
- ✅ `docs/README.md`: index line (done 2026-09-11).
- ✅ `plan-entity-presentation.md` status block: pointer added 2026-09-11, the
  §3 / §6 rewrite done 2026-09-19.
- ✅ **Not in the original list, owed all the same:**
  `manual-content-authoring.md` §2 gains a "Visuals: the `visual` key"
  subsection (the kinds table, the moments, D2, the body rule, an example) and
  §3's per-hit bullet now names `visual` as the lever and `hitStyle` as C2's
  deletion; `.claude/skills/add-content/SKILL.md` and
  `tools/content-editor/README.md` name the six new fixture lists and the
  hidden key.

## 12. Landmines

- **`Backend.receiveSnapshot` ordering** (`Backend.ts:400`): the player is
  updated before the entity loop; the prototype leaned on that for its
  same-snapshot inference. The event consumer must NOT: it runs after both,
  on the decoded vector, and looks entities up by id.
- **Headless pages stall the websocket** without the Chromium
  no-throttling flags (`project_skill_visuals`); every harness leg here
  needs them.
- **Equips are combat-locked client-side**; a harness equips on open
  ground after `#combatIndicator.hidden`.
- **A content edit does not invalidate the Go test cache** (`-count=1`);
  content pins read the EMBEDDED copy (`make -C backend cp-defs` first).
- **The `aura_category` ubyte is full**; this plan does not touch it and
  must not be tempted to encode a visual there.
- **`is_hit`** (`server.fbs:318`): audit its client reader before
  deprecating; it predates the aggregates.
- **An event can name an entity the client does not hold.** The filter
  ships an event when the SOURCE is in the viewport, so the own player's DoT
  tick on a mob that walked out of the viewer's area of interest arrives
  with a victim the entity manager has already dropped. The consumer skips
  it silently (the number has nowhere to sit); it must not throw. Different
  from the D6 aura-RANGE case, which is in the viewport and draws.
- **The stun/slow conflation** (§40 update box) is NOT this plan's; a HIT
  event carries no applied-effect kind. Stays with §39.

## 12a. C1 execution spec (2026-09-19, re-verified against HEAD `9ebb1dab`)

§3's line refs are stale; the refs below are current. This section is the
spec the C1 session builds from. PO calls of 2026-09-19 are marked ⭐.

### 12a.1 Recording: per-entity event lists, no game-wide sink

No per-tick game-wide buffer exists (chat and obituaries send immediately) and
models hold no game reference (`player.New` reads `g` at construction only,
`mob.NewMob` takes none). C1 does NOT build one. It reuses the accumulator
pattern already there:

- A `model.SkillEvent` value type (`Source uint64`, `Victim uint64`,
  `SkillID skills.SkillID`, `Amount vitals.VitalSign`, `Kind HitKind`,
  `Fired bool`) and a `[]model.SkillEvent` field on both `*mob.Mob` and
  `*player.player`, with a getter `SkillEvents()` on `model.MobEntity` and
  `model.PlayerEntity`.
- **HIT**: appended to the VICTIM's list inside `takeDamage` / `Heal` (D9).
- **FIRED**: appended to the CASTER's list by the SkillSystem through a narrow
  interface (the `AuraHitNotifier` precedent, `model/status_effects.go:90-97`).
- `ResetTickNumbers` (`mob.go:2175`, `player.go:736`) truncates with `[:0]`,
  never `nil`, so steady state allocates nothing
  (`model/status_effects_alloc_test.go` is the pin; add a twin for the list).
- The encoder concatenates the lists of every entity in `gs.Entities` (which
  IS the viewport set, `core/net.go:258-263`) PLUS `gs.Player`'s own list:
  the viewport sensor shares the body's collision `Group`
  (`player.go:50-60`), so the own player is not in its own set.
- ⚑ **Departure from §5.1, an implementation call:** this ships an event when
  its VICTIM (HIT) or CASTER (FIRED) is in the viewer's set, not "source OR
  victim". The one lost case is source-in-view / victim-out, which §12 already
  has the client skip silently. Same observable result, less wire, nothing new
  to maintain.

### 12a.2 Payload widening (D9): the five plumbing gaps

1. `model.Damage` (`model/interactable.go:11-40`) gains `SkillID`.
   `mobs.Factors` (`items/mobs/definitions.go:139`) gains a payload-only
   `SkillID` beside `Lifesteal` / `Crit` / `GateKey`. Do NOT unify
   `MobTouches` onto `Damage` (scope). Event source = `damage.Source` if set
   (owned summon), else the toucher.
2. `Healable.Heal(hp uint32)` (`model/healable.go:12`) becomes
   `Heal(h model.Healing)` with `Healing{HP uint32, Caster Combatant-ish,
   SkillID}`. Two production implementers (`mob.go:2036`, `player.go:467`), six
   test fakes (`mob_test.go:1992,2013`, `player_test.go:889`,
   `skills_behavior_test.go:175,818,2278`).
3. ⚑ **§3.3's landmine is CONFIRMED:** `Buffs.DueBuffEvents()`
   (`skills/buffs.go:875-914`) ranges `b.entries` with `_`, discarding the
   `SkillID` map key. `DotHit` and `HotEvent` gain `Source SkillID`. Red-first.
4. `applyAuraEffect` (`sys/skills.go:309-341`) forwards `source` to every
   effect EXCEPT `applyDamageAura` (:321) and `applyHealAura` (:323);
   `fireCooldown`'s `EffectTypeInstantDamage` (:2054-2063) has `es.Def.ID` in
   scope and does not forward it. Thread all three. `tickBuffEvents`
   (:464-515) and `tickHotEvents` (:526-557) pass the recovered id.
5. `model.ApplyLifesteal` (`healable.go:23-38`) gains the skill id (its four
   callers are the `*Touches` methods, which now hold it on the payload);
   source = the leeching entity. Reflect (`player.go:851-896`): the flat
   `retaliate_damage` carries the granting passive's id; `Buffs.ReflectBurst()`
   (`buffs.go:375`) must return the id of the winning source it currently
   discards.
6. The self-heal cooldown (`sys/skills.go:1944-1961`) writes `Health` directly
   and calls `NoteHealReceived` by hand. Route it through `Heal`: that bypass is
   exactly what D9 forbids.
7. **Stay bypassed by decision:** out-of-combat regen (`player/update.go:44-56`,
   `mob.go:1204-1218`) and `RestoreToFullHealth` (`mob.go:1105`). No skill, no
   event, no number today either.
8. `SkillID` 0 = "no skill" (cheat damage, `sys/cmd/cmd.go:206`). Verified: no
   file under `api/skills/` authors id 0.

### 12a.3 HitKind inside the funnel

- GOD (`player.go:388`) returns before anything: no event (today's behaviour).
- Invulnerable / fully resisted with INPUT `damage.HP > 0`
  (`mob.go:1949-1954,1976-1981`, `player.go:395-400`) → one `Immune`, amount 0.
- `loss > 0` → one `Crit` (if `damage.Crit`) or `Damage`, amount = `loss`.
- ⭐ **Absorb, one event per landing (PO):** `absorbed > 0 && loss == 0` → one
  `Absorb` with the absorbed amount; a PARTIAL absorb → one `Damage` / `Crit`
  with amount = real loss, the absorbed share not on the wire (today's "the
  shield bar drops, the number shows real loss").
- `Heal` with `healed > 0` → one `Heal`. A zero heal (full HP) emits nothing.
- ⚑ Behaviour change to record: today the client suppresses "Immune" when the
  same entity also took damage that tick; per event, an Immune from source A
  draws beside a Damage from source B. More honest, accepted.

### 12a.4 FIRED ⭐ (PO, §10 Q7 resolved)

Every cooldown cast that is CONSUMED emits FIRED, targets or not (§5.1): for a
player that is `fireAndCharge` (the cost is charged hit or whiff), for a mob the
`processCooldowns` branch where `fireCooldown` returned true and the cooldown
starts (a mob whiff consumes nothing, so nothing was cast). Exactly once per
cast. An AURA tick emits FIRED only when the
skill's `visual` has an `on: fired` layer: a per-skill bool resolved at load in
`skills/visual.go` (e.g. `VisualDef.HasFired`), read only by the emitter, never
by the sim.

### 12a.5 Summon ownership ⭐ (PO, §10 Q9 resolved)

`Mob.owner_id:ulong = 0` appended to the Mob table; set to the owning entity's
id for an owned summon, 0 otherwise. FlatBuffers omits defaults, so only
summons pay (~8 B per summon per viewer per tick; the loadbot leg watches it).
`SkillEvent.source` stays the summon (C2's VFX origin). The client treats a
HIT as own-dealt when `source === ownId` OR the source entity's `ownerId ===
ownId`.

### 12a.6 Wire

`enum HitKind`, `table SkillEvent` and `GameState.skill_events` exactly as
§5.1, appended last (after `owner_state`, `server.fbs:781`). `(deprecated)` on
`damage_taken`, `crit_taken`, `heal_received`, `immune_hit` (both tables) and
`Character.is_hit` (never written by the server, no client reader): FIVE
field names (nine slots across the two tables), the first use of the attribute in this schema. ⚑ `aura_hit_style` is
NOT deprecated in C1: §10 Q6 put the whole `hitStyle` lever in C2, and
deprecating the byte now would blind the still-live slash/fire VFX. (§3.2's
table and §5.2 said six incl. the style byte; this supersedes them.) flatc
drops deprecated accessors, so the codec `Add*` calls and the client reads go
in the same step. Regenerate TS with `api/schema/make.sh` and Go with
`go generate ./...` (checked-in `flatc_Linux_v24_3_25`); both binding sets are
committed, review the diff. Mirror the `.fbs` into `devops/bundle/api/schema/`
if that copy is tracked and in sync today.

Go accumulators deleted with their getters and interface methods once nothing
reads them: `damageTaken`, `critTaken`, `healReceived`, `immuneHit`,
`NoteHealReceived`. Tests that asserted on them re-point at `SkillEvents()`.
KEEP `tookDamage`, `inCombatTicks`, `costPaid`, `xpGained`, `auraHitStyle`.

### 12a.7 Client

- `GameStateMessage.ts`: decode `skillEvents` into plain objects; decode
  `ownerId` on mobs; drop the deprecated reads.
- A pure module (vitest) holding D6's rule:
  `(ownId, event, sourceOwnerId) → {target: 'victim', kind} | null`. Numbers
  draw when the own player is source (or owner of the source) or victim. Map
  `Damage`→`damage`, `Crit`→`crit`, `Heal`→`heal`, `Immune`→ the existing
  `showFloatingText('Immune', IMMUNE_COLOR, 1, IMMUNE_LANE)`. `Absorb` draws
  the grey word "Absorbed" in the Immune style and lane (⭐ PO 2026-09-19, after
  the walk: "similar to how wow does it"; the first cut drew nothing); FIRED draws nothing
  until C2a.
- One consumer called from `Backend.receiveSnapshot` AFTER the entity loop
  (`Backend.ts:521-523`). Id resolution: `game.player.character.id` first (the
  own `Character` is NOT in `EntityManager`), then `EntityManager.getObject`,
  skip silently on a miss (§12).
- Delete the duplicated aggregate blocks (`EntityManager.ts:226-247`,
  `Player.ts:149-168`); `costPaid`, `xpGained` and `showAuraHit` stay.
- Expose the last decoded events for harnesses on the existing `window.game`
  debug handle (`BrowserConsole.ts:46`), dev-gated like the rest of it.
- ⚑ **`MobJuice` leaves C1's scope.** §7.5's seam does not exist: no caller
  passes `soundData` to `StatusEffect.forDamaged`, so `mobHit` never plays
  today. Wiring a sound is not a re-seam; it stays with the audio lane.

### 12a.8 Verify tail C1 owes

Red-first: `DueBuffEvents` keeps the skill id · funnel tests per `HitKind` on
both models (incl. god = none, partial vs full absorb, zero heal = none) ·
codec test: N landings → N events, an out-of-set entity's events absent, the
own player's included · FIRED flag test · D6 vitest. Then:
`TestRunPlacements_IsDeterministic` + `cmd/simharness` guardrails green · the
three `*_alloc_test.go` pins + the new list pin · `go build ./...` ·
`go test -count=1 ./...` · `make -C backend build` · `aurad -validate` both
ways · `npm run smoke` · frontend `npm test` + `npm run typecheck` · headless
`immune-feedback.mjs` · **the loadbot leg (§5.3)**, which rules D10. Schema
line: DB NONE (confirm the character persistence marshaller is a whitelist
that cannot pick up the new slice) · WIRE appended + 5 field names deprecated + one Mob
field · CONF NONE · CONTENT NONE.

## 12b. C2a execution spec (2026-09-19, re-verified against HEAD `83aadd66`)

Planned in the executing session; the PO answered five questions up front
(below). Everything not marked PO is an implementation call.

### 12b.1 PO calls (2026-09-19)

- ⭐ **No engine default for a skill without a `visual`.** Deleting the
  `hitStyle` lever would leave 107 of 113 skills drawing nothing on a hit
  (today every damage aura gets a cadence-derived slash / fire). PO: **author
  every damaging skill now**, by reach and flavour (§12b.5), not an engine
  fallback. A skill with no `visual` draws nothing, by rule.
- ⭐ **`beam` gains `curve`, with its own value set: `flash` | `extend`.**
  `flash` = attack → peak → fade on the jagged placeholder (lightning);
  `extend` = extend → retract on the ribbon placeholder (flame pillars).
  Absent = `flash`. Curves become PER-KIND sets (`impact`: thrust / snap /
  burst, unchanged).
- ⭐ **`beam` gains `chain` (bool).** One tick's HIT events of one (source,
  skill) draw caster→v1→v2→v3 instead of a fan from the caster; order is
  greedy nearest-neighbour from the caster, each hop starts a fixed delay
  after the previous ([PLACEHOLDER] 60 ms). ⚑ VISUAL ONLY: every victim is
  inside the caster's ring, the server is untouched. A true chain selector
  (jump range from the previous victim) is future gameplay work, not built.
- ⭐ **A new skill, Lightning Strike** (id 76, `lightning-strike.json`):
  active aura, `nature` (the WoW Classic precedent; no seventh damage type),
  ranged ring, nearest 3, tick 40, numbers cloned down from Long-Range Strike,
  all [PLACEHOLDER]; `beam` / `flash` / `chain` with a pale blue `tint`.
  **No unlock source**: cheat-only (`SKILL`) until the PO places it. Registry
  pin 113 → 114 (76 player + 38 mob).
- ⭐ **Heal / shield / light auras and non-damage cooldowns wait for C2b**
  (their kinds, `emitter` / `orbit` / `cast-pose`, do not exist yet; they draw
  nothing today, so nothing regresses).

### 12b.2 Schema, corrected

§9 said "Schema: NONE" for C2a. It is not: **WIRE one field name deprecated,
two slots** (`aura_hit_style` on Mob + Character), both binding sets
regenerated. **CONTENT: two vocabulary keys on `beam` (`curve`, `chain`), one
new skill, `visual` on ~52 files, two `hitStyle` values deleted, the
`hitStyle` effect key gone from the fixture. DB NONE · CONF NONE.**

⚑ This arms the C1 landmine directly: the regen drops `auraHitStyle()` while
`GameStateMessage.ts:462` and `:519` still call it; `tsc` and vitest stay
GREEN and the first Mob decode throws. Those two reads leave in the same half
as the regen, and that half is gated on a REAL BOOT, not on tests.

### 12b.3 Engine (half A)

Files, all under `frontend/src/features/skill-fx/logic/`:

- `SkillFxMath.ts` + test: the prototype harvest (`git show
  prototype/skill-visuals:frontend/src/features/game-objects/logic/SkillVisualsMath.ts`
  and its 16 cases): `flightMs`, `projectilePoint`, `strikePhase`, `clamp01`.
  New: the three impact curves, the two beam envelopes (intensity + width /
  extent as functions of elapsed ms), the jagged polyline (deterministic,
  index-seeded, "nothing here is random"), `chainOrder(caster, victims)`,
  the wind-up glow alpha (moved verbatim from `AuraTickIndicator`). The
  skill-id table, `withinReach` and the snowflake do NOT come over (the
  inference is dead; the flake is C2b's emitter).
- `SkillFxPalette.ts`: damage type → colour (six + a neutral for untyped),
  from the skill's first damage-carrying effect's first `damageTags` entry;
  `tint` on the layer wins. Hex values [PLACEHOLDER].
- `SkillFxBodies.ts`: `body` → atlas frame, else the kind's placeholder
  Graphics; no atlas exists, so every lookup is the placeholder and a named
  body logs once in dev.
- `SkillFxKinds.ts`: the registry holds ALL SEVEN kind names so the
  both-ways pin against `visualKinds` holds today; `impact`, `projectile`,
  `beam` are real, the other four are no-op stubs that log once (C2b fills
  them). Pools per kind.
- `SkillFx.ts`: the manager. `setup(layer)`, `onSnapshot(events, resolve)`,
  a ticker update, `reset()`. Budget: live-Fx cap 96 [PLACEHOLDER],
  oldest-first eviction.
- `client-data/Skills.ts`: the `VisualDef` / `VisualLayer` mirror on
  `SkillDefinition`.
- `Game.ts` / `IGame.ts`: `layers.skillFx` above `flyers`, below `darkness`
  (the prototype's diff, verbatim in intent).

Rules:

- **One feed, one call site.** The manager is fed from
  `Backend.receiveSnapshot` beside `showSkillEventNumbers` (after the player
  and the entity loop, §12), resolving the own Character by id FIRST (it is
  not in `EntityManager`). An event naming an entity the client does not hold
  is skipped silently.
- **`on: hit` draws once per HIT event, whatever its `HitKind`** (an Immune
  or Absorb landing still landed). FIRED events are consumed for `on: fired`
  layers, which in C2a are all stubs.
- **D1: no attribution.** VFX draw for every source and victim in view. The
  manager does not need `ownerId`; C1's "move it onto the `Mob` game object"
  landmine is left alone (YAGNI).
- **Implicit sequencing.** In one `visual`, an `impact` on the same trigger as
  a `projectile` starts when the projectile ARRIVES (§4.1: "ends in an
  impact"). No `delay` key. A chained beam's impact on hop N waits for hop N.
- **Follow, then finish.** Layers re-read source / victim positions per
  frame; when either despawns, a `projectile` / `beam` finishes toward the
  last known position.
- **The wind-up glow** (D7) moves from each entity's `shape` to the `skillFx`
  layer, positioned per frame, driven by the same `aura_tick_interval` /
  `aura_tick_phase` and the same px radius `Character.ts:257/268` and
  `Mobs.ts:381/417` feed today. It is NOT authored content, NOT under the
  budget and NOT (C2b) under the density slider: it is readability.
  `AuraTickIndicator.ts` is deleted. ⚑ Render order changes: the glow now
  sits above every entity instead of under later ones. Check in the look.
- **§10.1's carried question** (an `ambient` layer while an aura is equipped
  but off): in C2a the only ambient consumer is the wire-driven glow, and
  interval 0 already hides it. The `visual`-level answer is C2b's.
- `window.game.skillFx()` → `{live, spawnedByKind, evicted}` for the harness.

### 12b.4 The lever (half B), a checklist

Go: `skills/definition.go` (enum, `hitStyleMap`, the `Damage.HitStyle` field
and its parse) · `skills/catalog.go` · `sys/targeting.go:46-64`
`auraHitStyleFor` (⚑ §8 said `sys/skills.go:731`, stale) ·
`sys/skills.go:521,746,806,927` · `model/status_effects.go:76-97` ·
`model/entity.go` / `model/player.go` interface lines · `NoteAuraHit` /
`AuraHitStyle` + the field + its reset on `mob/mob.go` and
`player/player.go` · `codec/mob.go` + `codec/gamestate.go` · tests:
`mob_test.go`, `retaliate_test.go`, `skills_behavior_test.go`,
`targeting_test.go`.
Wire: `aura_hit_style (deprecated)` ×2 in `server.fbs`, regen both sets
(`flatcgen.go` needs network; the checked-in flatc by hand is byte-identical).
Vocabulary: `visual.go` (per-kind curve sets, `chain`), `visual_test.go`
red-first, fixture regen with `UPDATE_SKILL_VOCABULARY=1` (drops `hitStyle`
from `effectKeys`, adds the beam keys), `smoke.mjs` leg (k) for per-kind
curves.
Editor: `skill-presentation.mjs`, `save-skill.mjs` + test, `public/app.js`,
`.claude/skills/verify/content-editor-skills-tab.mjs`.
Client: `Skills.ts:30`, `showAuraHit` + `buildAuraHitFx` + its fields in
`_GameObject.ts`, the call sites `EntityManager.ts:241` and `Player.ts:164`,
the two decode reads, `SharedConstants.test.ts`, `SkillTooltip.test.ts`.
Docs: `manual-content-authoring.md` §2 (beam `curve` / `chain`, per-kind
curves) and §3 (the `hitStyle` bullet goes), the `add-content` skill,
`plan-content-editor.md`'s "hitStyle stays" note, `tools/content-editor/README.md`.

### 12b.5 Content: the authoring rule and every pick (PO: reach and flavour)

Melee reach (radius < 2): `impact`; bites / gore = `snap`, weapons / stabs /
kicks = `thrust`, stomps / bursts / AoE cooldowns / DoT applications / ground
auras = `burst`. Ranged (radius ≥ 2, volleys, spits): `projectile` + `impact`.
Fire DoT auras of stationary casters stay `impact` / `burst` on the victim
(a totem throwing a bolt per tick is a content judgement for later).
Retaliate passives: `impact` / `burst` (lands on the attacker, `hit` only,
D2). All [PLACEHOLDER], no `body`, no `tint` except Lightning Strike.

| Pick | Files |
| --- | --- |
| `impact` thrust | berserker, harvest, paladin, pickaxe, reaper, spearhead, vanguard, warbanner, wild · mobs: bandit-blades, companion-aura, elite-bandit-slash, grunt-slash, kobold-stab, soldier-blades, stag-kick, orc-cleave, warlord-cleave |
| `impact` snap | mobs: bear-swipe, boar-gore, elite-wolf-bite, saber-tooth-cat-aura, spider-bite, dodo-aura |
| `impact` burst | blight, immolate, wildfire, damage-burst, envenom, ignite, nova-burst, rime-burst, shockwave, fire-shield, omni-passive, omni-strike (replaces `hitStyle: slash`) · mobs: angry-mammoth-aura, angry-mammoth-stomp, bomb-burst, mammoth-aura, troll-smash, poison-pool-aura, spike-barricade-aura, ember-aura, fire-elemental-aura, fire-totem-aura, totem-aura |
| `projectile` + `impact` snap | mobs: bandit-volley, kobold-volley, giant-venom-spit, venom-spit |
| `beam` extend + `impact` burst | omni-aura (replaces `hitStyle: fire`; the §4.3 flame pillars, 3 targets) |
| `beam` flash chain + `impact` burst | **lightning-strike (NEW, id 76)** |

⚑ Every `on: hit` layer must pass D2 by category; the agent runs
`aurad -validate -content ../api` after the batch, then `make -C backend
build` (cp-defs) before any Go test reads the embedded copy.

### 12b.6 Verify tail C2a owes

`go build` / `go vet` / `go test -count=1 ./...` (determinism, guardrails,
alloc pins) · `make -C backend build` · `-validate` 0 both ways · `npm run
smoke` · editor `node --test` · `npm run inventory` regenerated · frontend
`npm test` / `typecheck` / `build` · ⭐ **a real boot + join** (the dropped
accessor) · a new harness `skill-fx.mjs` (harvested from
`skill-visuals-proto.mjs`, Chromium no-throttling flags, equips on open
ground after `#combatIndicator.hidden`): own impact, a projectile in flight
then its impact, a chained beam with 3 victims, a mob's impact on the own
player, the glow alive, `hygiene-wire-prune` clean, 0 console errors ·
screenshots for the PO look. ⛔ Not done, not wrapped, not committed before
the PO look. ⚑ Branch deletion (`prototype/skill-visuals`,
`prototype/attack-lines`, local + origin) is a PO ask at the wrap, never
autonomous.

## 12c. C2a amendment: the `strike` kind (PO look 2026-09-19)

**The PO's look:** "the effects look good, some even very good", the chained
bolt and the projectile work. ⛔ **The wedge does not**: "it doesn't work
visually as an indicator", and "the damage aura itself does not seem to have
an element attached to it".

**Diagnosis: a VOCABULARY defect, not tech and not content.** The prototype's
sword was anchored at the PLAYER and thrust across the gap. §4.4 mapped it to
`impact`, which §4.1 anchors at the VICTIM, so the attacker's half of a melee
hit had no kind at all; `arc-swing` (the only caster-side weapon kind) sat in
C2b. §12b.5 then put `impact` on every damaging skill, which turned a
placeholder for a missing weapon sprite into an accidental general indicator.

### 12c.1 PO calls (2026-09-19)

- ⭐ **A caster-anchored melee kind, `strike`, REPLACES `arc-swing`** (still
  seven kinds). A weapon starts at the attacker and travels to the victim.
  `on: hit` only. Keys: the common ones + `ms` + `curve`.
- ⭐ **Three styles, `curve`: `thrust` | `swing` | `overhead`** (absent =
  `thrust`). `thrust` = a quick straight stab out and back; `swing` = the
  weapon pivots at the attacker and sweeps ~100° through the victim;
  `overhead` = a visible wind-up above the attacker, then down onto the
  victim, slow and heavy. (`flurry` was offered and not taken.)
- ⭐ **One placeholder weapon PER STYLE, chosen by the style**: a spear for
  `thrust`, a blade for `swing`, a hammer for `overhead`. Content still
  authors NO `body` (C0's rule stands); the artist's sprite replaces the
  placeholder under the same style later.
- ⭐ **`impact` is OPT-IN and small** (the WoW model: a plain melee hit is the
  swing + the victim's hit flash + the number; only spells, elemental hits,
  nukes, bites and missile arrivals get a burst on the target). `impact`
  becomes a small ROUND burst on the victim, tinted by damage type, never
  directional. Its curves are **`burst` | `snap`**; `thrust` moves to
  `strike`. The wedge placeholder is deleted.
- ⭐ **The flinch is NOT built** (a nudge of the victim's sprite on every hit):
  it transforms the entity sprite, which this plan does not touch. Carried as
  §10 Q10 for `plan-entity-presentation.md`.
- Implicit sequencing extends: an `impact` beside a `strike` starts at the
  strike's CONTACT moment (end of the thrust-out / the sweep crossing the
  victim / the hammer landing), as it already waits for a projectile.

### 12c.2 Content, every pick (all [PLACEHOLDER])

Rule: a weapon-wielder's plain hit is `strike` ALONE. An animal's bite, gore
or swipe is `impact`/`snap` alone (it wields nothing). Elemental, poison,
AoE and cooldown hits keep `impact`/`burst`. A missile's arrival is
`impact`/`burst` (was `snap`, which is the bite).

| Pick | Files |
| --- | --- |
| `strike` thrust | damage, berserker, paladin, spearhead, vanguard, warbanner · mobs: companion-aura, kobold-stab |
| `strike` swing | reaper, wild · mobs: bandit-blades, elite-bandit-slash, grunt-slash, soldier-blades, orc-cleave |
| `strike` overhead | harvest, pickaxe · mobs: troll-smash, warlord-cleave |
| `impact` snap (unchanged) | mobs: wolf-bite, elite-wolf-bite, spider-bite, boar-gore, saber-tooth-cat-aura, dodo-aura, bear-swipe |
| `impact` burst, was thrust | frostbite, hoarfrost (beside their emitter) · mobs: stag-kick |
| `impact` burst (unchanged) | every other file that authors it today |
| `projectile` + `impact` burst, was snap | long-range-strike, suppression · mobs: bandit-volley, kobold-volley, giant-venom-spit, venom-spit |
| unchanged | lightning-strike, omni-aura, omni-strike, omni-passive |

**Schema: DB / WIRE / CONF NONE. CONTENT:** vocabulary kind `arc-swing` →
`strike` (+ `curve`), `impact` loses curve `thrust`, ~35 files re-authored.
`TestVisual_TheNinePOExamples`: the sword stab becomes `strike`/thrust, the
overhead mace `strike`/overhead (+ `impact`), the wolf bite stays
`impact`/snap.

## 13. Ledger

### C2a ledger (2026-09-19) - the engine + three kinds

✅ **BUILT 2026-09-19** `512d4afd`, **PO look PASSED**. Spec: §12b, with
the PO's calls of the day in §12b.1; the `strike` amendment that came out of
the first look is §12c.

**Schema: DB NONE · CONF NONE · WIRE one field name deprecated, two slots**
(`aura_hit_style` on Mob + Character), both binding sets regenerated ·
**CONTENT:** `beam` gains `curve` (flash | extend) and `chain`; `visualCurves`
is now a per-KIND map in the fixture; `hitStyle` gone from `effectKeys`;
`visual` on 52 more files (59 total, 69 layers); two `hitStyle` values
deleted; one new skill, Lightning Strike (id 76); registry pin 113 → 114.

**What was built**

- `frontend/src/features/skill-fx/logic/`: `SkillFxMath` (prototype harvest +
  impact curves, beam envelopes, the deterministic jagged polyline,
  `chainOrder`, the glow alpha), `SkillFxPalette`, `SkillFxBodies`
  (placeholders only, no atlas yet), `SkillFxKinds` (all seven names
  registered, three real, four once-logging stubs for C2b, pinned both ways
  against `visualKinds`), `SkillFx` (the manager: one feed in
  `Backend.receiveSnapshot`, budget 96, pools, `reset()` on own death).
- `layers.skillFx` above `flyers`, below `darkness`.
- The wind-up glow lives in the manager; `AuraTickIndicator.ts` deleted.
- The `hitStyle` lever is gone end to end: Go enum + parse + stamp + both
  models + codec, the wire field, the editor, the client (`showAuraHit` and
  its 106-line block). `grep -i hitstyle` over code and content: 0 hits.
- `.claude/skills/verify/skill-fx.mjs` (NEW harness, five legs).

**Implementation calls (not PO calls)**

- ⚑ **The manager runs on `PrerenderEvent`, subscribed AFTER
  `GameObject.setup()`**, not on `Ticker.shared` as the prototype did: the
  glow is no longer a child of the entity's shape, so it must be positioned
  after `moveInterpolatedObjects` or it trails its entity by a frame. Side
  effect: VFX freeze with a paused game.
- ⚑ **`width` is PIXELS, as `speed` is px/s.** The two halves disagreed (the
  content half authored 0.35 as if world units, the engine read px) and the
  first chained bolt was a 0.35 px hairline. Settled in the manual; the two
  authored beams are 5 and 14.
- A chained hop's impact is oriented from the PREVIOUS victim. `tint` resolves
  per layer. A delayed Fx holds a budget slot from feed time.
- The catalog serves damage types as `tags`, not `damageTags`; the palette
  walks damage / dot / retaliate payloads in that order.
- Lightning Strike's icon is `lorc/star-swirl` (no lightning glyph is
  vendored; a fetch + a client icon write is a follow-up).
- The fixture's per-kind curve map is partial on purpose and pinned against
  the KEY table (every kind whose key row has `curve` has a curve row).

**Red→green, stated honestly.** Red-first: the vocabulary tests (per-kind
curves, `chain`), `SkillFxMath` (27), palette (8), the registry pin (4).
⚑ **No manager-level unit test**: `SkillFx.ts` is Pixi-bound, so chain
GROUPING and the projectile→impact delay are covered by the harness only.

**Mutation ×3, each reverted:** `curve: thrust` on a beam (Go + smoke both
red) · a stray `hitStyle` in content (smoke leg (a) + `-validate`) · `chain`
on an `impact` (Go + smoke).

**Verify tail** (rerun by the lead after both halves and after the width fix):
`go build` / `go vet` clean · `go test -count=1 ./...` **35 packages ok, 0
failures** (DB tests skip; no `-race`) · `make -C backend build` · `-validate`
**0 findings** both ways · `npm run smoke` **0 findings / 114 files / 69
layers** · editor `node --test` 2/2 · inventory regenerated · frontend `npm
test` **733 / 42** (was 694 / 39) · `typecheck` clean · `npm run build`.

**Harness gate** (fresh server, one at a time): ⭐ **real boot + join clean**
(`hygiene-wire-prune`: 0 console errors, 0 context losses; the dropped
`auraHitStyle()` accessor did not bite; first run hit the documented
post-restart join race) · `skill-fx.mjs` **PASS 5/5**: nothing spawns without
an event · Damage → 21-51 impacts (own + the wolves' `wolf-bite` on the
player) · Long-Range Strike → 12 projectiles + 12 impacts · Lightning Strike →
33 beams on a four-wolf pack · `skillFx` below `darkness` ·
`immune-feedback.mjs` PASS. ⚑ Harness lessons: a fixed-time screenshot misses
a 260 ms beam (the shot arms on the spawn counter and slows the page clock
8×); every equip happens BEFORE the first fight (no XP cheat, or a levelled
player one-shots the pack and the chain has nothing to jump to); a leg whose
skill never landed is INCONCLUSIVE, not red.

**Not run:** `content-editor-skills-tab.mjs` (its `hitStyle` assertion was
removed, the rest untouched) · the two-window leg (another player's VFX) ·
loadbot (no wire growth, a field left).

**⭐ Amendment after the first PO look (2026-09-19, §12c): the `strike` kind.**
PO: effects "look good, some even very good", the wedge does not work and the
Damage aura had nothing on the attacker. Built the same day: `strike` replaces
`arc-swing` (caster-anchored; `thrust` spear / `swing` blade / `overhead`
hammer, one placeholder weapon per style), `impact` is a small round opt-in
burst (`burst` | `snap`), the wedge is deleted, 28 files re-authored per
§12c.2 (8 thrust, 7 swing, 4 overhead; plain weapon hits author `strike`
alone), an `impact` beside a strike waits for the weapon's contact moment, the
flinch is carried as §10 Q10. Verify tail rerun by the lead: Go **35 packages
ok, 0 failures** · `-validate` 0 both ways · smoke 0 / 114 files / 69 layers ·
editor 2/2 · frontend **742 / 42** · typecheck + build clean · mutation ×3
(impact `thrust`, kind `arc-swing`, strike on `fired`: all refused by Go AND
smoke) · `skill-fx.mjs` **PASS 7/7** with two new legs (a Troll's overhead and
a Bandit's swing landing on the own player). ⚑ **GOD short-circuits the
player's `takeDamage`, so a god-mode player is never the VICTIM of a HIT event
and no mob strike draws on them**: the two mob legs drop GOD only for the
armed window. ⚑ The first spear was a 2 px brown shaft, invisible on fur and
ground; it is pale, outlined and blade-thick now. ⚑ Disclosed: the content
agent ran `git checkout` on two uncommitted files during a mutation revert and
rebuilt them by hand; both diffed and match §12c.2. ⚑ Thrust animates by
x-stretch (the prototype's way), so the spear head squashes early in the stab.
**The second PO look PASSED (below).**

**⭐ The PO look, two sittings, 2026-09-19.** First: *"the effects look good,
some even very good"* - the chained bolt and the projectile work, the wedge
does not ("it doesn't work visually as an indicator") and the Damage aura had
nothing on the attacker. That verdict is what §12c is, and it was built the
same day. Second, after the amendment: ⭐ **"works for now as placeholders,
ingame look passes"**. C2a is done.

**Still open after the wrap** (none of it blocks C2b):

- ⛔ **A PO yes/no on deleting `prototype/skill-visuals` and
  `prototype/attack-lines`** (local + origin). Both are quarried out now (the
  math module came over, backlog §57's shipped version IS this chunk), but a
  branch deletion is a PO ask, **never autonomous**.
- Lightning Strike wears `lorc/star-swirl`: a real lightning glyph needs a
  fetch + a client icon write, a follow-up.
- **No everyday player skill authors `overhead`** - only Harvest and Pickaxe,
  which are gated. The style is verified by the Troll's smash, not by a
  player's own hand.
- **No manager-level unit test** (`SkillFx.ts` is Pixi-bound): chain grouping
  and the projectile→impact delay are covered by the harness only.
- The **two-window leg** (another player's VFX) was the PO's own walk, not a
  harness. `content-editor-skills-tab.mjs` was edited (its `hitStyle`
  assertion removed) and not re-run.

### C1 ledger (2026-09-19) - the wire

✅ **BUILT 2026-09-19** `194a0cd5`. Spec: §12a (re-verified refs + the
PO's three calls of the day).

**Schema: DB NONE** (`sys/persist.go` `characterState` is a field-by-field
mapping into a hand-written struct and the store's SQL names every column, so
the new slice cannot be picked up). **WIRE: appended** `enum HitKind`,
`table SkillEvent`, `GameState.skill_events`, `Mob.owner_id`; **deprecated**
five field names across nine slots (`damage_taken`, `crit_taken`,
`heal_received`, `immune_hit` on Mob + Character, `Character.is_hit`), the
first `(deprecated)` in this schema. `aura_hit_style` NOT deprecated (§10 Q6:
the lever leaves whole in C2). Both binding sets regenerated. **CONF NONE ·
CONTENT NONE.**

**PO calls (2026-09-19)**

- ⭐ **§10 Q7, FIRED cadence:** every CONSUMED cooldown cast emits FIRED,
  targets or not; an aura tick emits only when the skill's `visual` has an
  `on: fired` layer (`VisualDef.HasFired`, derived at parse, `json:"-"`).
- ⭐ **§10 Q9, summons:** `Mob.owner_id` on the Mob table ("be mindful of
  performance": a default 0 is omitted, so only summons pay, and the loadbot
  leg saw nothing). `SkillEvent.source` stays the summon.
- ⭐ **Absorb:** one event per landing. Full absorb = one `Absorb`; partial =
  one `Damage` / `Crit` with the real loss.

**What was built**

- Recording reuses the accumulator pattern, no game-wide sink (§12a.1):
  `model.SkillEvent` + a per-entity list on both models, HIT appended to the
  VICTIM inside `takeDamage` / `Heal` (D9), FIRED to the CASTER through
  `model.SkillFiredNotifier`, truncated `[:0]` in `ResetTickNumbers`. The
  codec concatenates `gs.Player`'s list plus every entity in `gs.Entities`;
  a quiet tick omits the field entirely (offset 0), so an idle viewer pays
  nothing. Spectators get the vector too.
- Payload widening: `Damage.SkillID`, `Factors.SkillID`,
  `Heal(model.Healing{HP, Caster, SkillID})`, `ApplyLifesteal(+id)`,
  `ReflectBurst()` returns its winner's id, `takeDamage(+source uint64)`
  resolved by the `*Touches` wrappers (`model.ActingSourceID`).
- ⚑ **§3.3's landmine was real:** `DueBuffEvents` discarded the skill id (the
  map key). `DotHit` / `HotEvent` now carry `Source`. Also threaded:
  `applyAuraEffect` → `applyDamageAura` / `applyHealAura`, `fireCooldown`'s
  InstantDamage, and the self-heal cooldown now goes THROUGH `Heal`.
- The four Go accumulators, their getters and `NoteHealReceived` are deleted;
  ~16 test files re-pointed at `SkillEvents()`.
- Client: `SkillEventNumbers.ts` (D6 as a pure function, 15 vitest cases),
  decode in `GameStateMessage.ts` (ids narrowed with `Number()`, as every other
  id there), carried through `SnapshotFactory`'s delta branch, one consumer in
  `Backend.receiveSnapshot` after the entity loop, the two duplicated aggregate
  blocks deleted, `window.game.skillEvents()` → `{last, total}` for harnesses.

**Implementation calls (not PO calls)**

- **Ships on "victim (or caster) in view", not "source OR victim"** (§12a.1).
- **`owner_id` carries `CreditTo()`, not `Owner()`**: the question is
  attribution, and `Owner()` would miss a CHARMED mob.
- **FIRED once per skill per tick**, not per effect (`applyAuraEffect` now
  returns "ran").
- **`aura_hit_style` kept** (above); **`MobJuice` dropped from C1**: §7.5's
  seam does not exist, no caller passes `soundData`, `mobHit` never plays.
- Client: the source→owner lookup is built from `snapshot.entities` on ticks
  that carry events, not stored on the `Mob` game object. An own-summon hit
  whose summon is outside the viewer's set draws nothing (§12's skip case).
- A non-Immune, non-Absorb event with amount ≤ 0 draws nothing (`hpToDisplay`
  floors at 1); the two grey words return before that check, being words.

**Behaviour changes to know** (rulings, not bugs): other players' numbers and
mob-vs-mob numbers are gone (D6) · an Immune from source A now draws beside a
Damage from source B on the same tick · a fully absorbed hit now draws a grey
"Absorbed" (PO call after the walk; a PARTIAL absorb still shows only the real
loss, the shield's share is not on the wire).

**Red→green, stated honestly.** Genuinely red-first: the `DueBuffEvents` and
`ReflectBurst` skill-id tests (compile-red), the player-whiff FIRED test
(`expected [98]`, `actual nil`), the 15 D6 vitest cases. The funnel, codec and
`owner_id` tests were written AFTER the code and are proven by mutation.

**Mutation ×9, each reverted:** drop the append in `mob.takeDamage` (10 red) ·
drop `gs.Player`'s list in the codec (1) · discard the map key in
`DueBuffEvents` (3) · remove the `HasFired` gate (1) · drop `MobAddOwnerId`
(1) · drop `noteCooldownCast` from `fireAndCharge` (3) · stamp a mob whiff
(1) · disable D6 attribution (5) · draw Absorb (1).

**Verify tail** (rerun by the lead after both halves): `go build ./...` ·
`go vet ./...` · `go test -count=1 ./...` **35 packages ok, 0 failures** (DB
tests skip without `AURA_TEST_DB_URL`; no `-race` run) incl.
`TestRunPlacements_IsDeterministic`, the four simharness guardrails and the
three alloc pins + two new list pins · `make -C backend build` (regenerates;
bindings byte-identical to the hand run) · `aurad -validate` **0 findings**
both ways · `npm run smoke` **0 findings / 113 files** · frontend `npm test`
**694 / 39** (was 678 / 38; the last 15 are the D6 rule, the 694th the
"Absorbed" word) · `npm run typecheck` clean · `npm run build`.

**Harness gate** (fresh server, one at a time): `immune-feedback.mjs`
**PASS** (6 labels, all grey, all at the wall, 0 damage numbers there; first
run hit the documented post-restart join race) · `hygiene-wire-prune.mjs`
clean ×2, 0 console errors · `r3-lifesteal-burst.mjs` **7/7**, 44 combat
numbers in a live fight · `chunk2-follower.mjs` 5 PASS + the fight leg
INCONCLUSIVE (nothing came into range). No harness saw the own-SUMMON number
or D6's two-client headline; the PO walk below did.
`chunk3-charm.mjs` NOT run: C1 only READS `CreditTo`, and the script is
known-inconclusive 6-8/9 at HEAD.

**⭐ The loadbot leg (§5.3): D10 STANDS, no fallback.** Combat-clustered
(`-skills Damage -god -warp 38,31`, steps 25,50, hold 40 s, `-profile`), same
machine, same DB, A/B/A/B, `auras CONFIRMED LIVE 50/50` on every leg:

| 50 bots | p50 ms | p95 ms | util % | kB/s/bot | snap/s |
| --- | --- | --- | --- | --- | --- |
| baseline `9ebb1dab` | 5.62 | 7.27 | 21.8 | 201.6 | 30.0 |
| C1 | 5.94 | 7.56 | 22.7 | 209.2 | 30.0 |
| baseline (again) | 5.90 | 7.90 | 23.7 | 212.7 | 30.0 |
| C1 (again) | 6.07 | 7.80 | 23.4 | 214.9 | 30.0 |

C1 sits inside the baseline-vs-baseline spread on every column. ⚑ **The first
round was void and found loadbot rot:** the `CONFIRMED LIVE` gauge read the
loadout off EVERY snapshot, but since perf chunk 3 (`68946f78`) the owner
block ships on change only, so the gauge flapped to 0/n on a healthy run.
Fixed in `cmd/loadbot/main.go` (judge only on `gs.OwnerState()`).

**Landmines for C2a**

- ⚑ **A dropped FlatBuffers accessor is a RUNTIME break on the client, not a
  compile break.** `unmarshalEntity(entity, eType)` is implicit `any`, so with
  the new bindings and the old reads, `tsc` and vitest were both GREEN while
  the first Mob decode would have thrown. Only a real boot catches it.
- `flatcgen.go` downloads flatc unconditionally (`go generate` needs network);
  the checked-in binary invoked by hand gives byte-identical output.
- The own `Character` is not in `EntityManager`: resolve the own id first.
- `ownerId` lives on the snapshot entity, not the `Mob` game object; C2a's
  manager will want it there.

**⭐ PO walk 2026-09-19: "everything works as intended"** (the nine-step
checklist: own numbers, heals, Immune, cost / XP / hit flash unregressed, and
the two-window D6 legs incl. the own-summon number). One request out of it,
built the same day test-first: the "Absorbed" word (vitest 694 / 39).

### C0 ledger (2026-09-19) - the vocabulary + the docs amendment

✅ **SHIPPED 2026-09-19** `e8f7b6b4`.

**Schema: DB NONE** (the key is content, nothing persists a visual and no
spellbook row changes). **WIRE NONE** - the skill catalog is HTTP JSON marshalled
straight off `SkillDefinition`, so the new `visual,omitempty` field reaches the
client with no `.fbs` edit and no binding regeneration. **CONF NONE.**
**CONTENT: one new top-level key, `visual`**, plus the generated
`api/skill-vocabulary.json` and the six `backend/pkg/api/skills/` cp-defs
copies.

**What was built**

- `backend/pkg/aura/skills/visual.go` (NEW): `VisualDef` / `VisualLayer`, the
  six closed tables (`visualKinds` 7, `visualTriggers` 3, `visualKeysByKind`,
  `visualTriggersByKind`, `visualCurves`, `visualMotions`) plus
  `visualTriggersByCategory` (D2), and `parseVisual` / `parseVisualLayer`.
  Layers are decoded into a `map[string]json.RawMessage` first, the effects
  pattern, so a key the kind does not read hard-fails instead of vanishing.
- `definition.go`: `skillDefinition.Visual json.RawMessage` (so the raw object
  survives to the allowlist) and `SkillDefinition.Visual *VisualDef`; the parse
  is called from `mapToSkillDefinition` with the skill's category, and its
  error is wrapped `skill %q: ...` like every other content refusal.
- `vocabulary_test.go`: six new fixture fields, plus `require`s that the kind
  list and the two per-kind maps describe exactly the same seven kinds and that
  every trigger they name is a real trigger.
- `tools/content-editor/`: `visual` added to `SKILL_PRESENTATION` as
  `hidden: true` (the `legacy` precedent: never rendered, preserved on round
  trip) and to the inventory's `SKIPPED_TOP`; `smoke.mjs` gains finding class
  **(k)**, both halves, fixture and content.
- Content: `visual` on `damage`, `long-range-strike`, `suppression`,
  `frostbite`, `hoarfrost` and `mobs/wolf-bite`, 10 layers, all
  [PLACEHOLDER], **no `body` anywhere** (§9 C0's departure note).

**Three implementation calls (mine, not PO calls)**

- **CALL A - the D2 gate is a per-CATEGORY trigger table**, not a special case
  for `passive`. `visualTriggersByCategory` states all three categories
  positively, so the cooldown half ("a cooldown is never the running aura, so
  no `ambient`") falls out of the same table instead of being a second rule
  nobody wrote down. Pinned both ways by nine cases, plus a test that every
  category the loader knows has a row.
- **CALL B - range checks are PRESENCE-gated.** An absent `ms` and an authored
  `"ms": 0` are the same zero after decoding, so the checks test the raw key
  map: absent means "the kind's own default" and stays legal, an authored zero
  is refused. Testing the decoded value alone would have refused every layer
  that omits a tunable, which is most of them.
- **CALL C - the fixture carries exactly six lists**, not seven: the D2 table
  stays Go-only because the editor does not render `visual` until C3 and a
  fixture list with no reader is a list that goes stale unwatched.

**Red→green proofs**

- `visual_test.go` written first: red as a compile failure (no `Visual` field),
  then red BEHAVIOURALLY at 24 failing subtests once the types existed but the
  rules did not (every refusal case plus the three D2 negatives loaded clean),
  green after `parseVisualLayer`.
- `TestVocabulary_FixtureMatchesTheLiveTables` red on the six missing lists,
  regenerated with `UPDATE_SKILL_VOCABULARY=1`, green on the rerun without it.
- ⭐ `TestVisual_TheNinePOExamples`: §4.3's nine animations, authored as JSON
  with placeholder numbers. All nine load, with zero engine special-casing.
  This is the acceptance test of the chunk and the thing the vocabulary has to
  keep passing; a tenth animation that cannot be written here is a plan
  amendment, not a quiet new kind.

**Verify tail** (all from a clean tree, mutations reverted)

`go build ./...` clean · `go vet ./pkg/aura/skills/` clean ·
`go test -count=1 ./...` **35 packages ok, 0 failures** (DB tests skip without
`AURA_TEST_DB_URL`) · `make -C backend build` (runs cp-defs) ·
`./aurad -validate -content ../api` **0 findings** · `./aurad -validate`
(embedded) **0 findings** · `npm run smoke` **0 findings across 113 skill
files / 170 effects / 10 visual layers, 7 visual kinds** · editor `node --test`
**2/2** · `npm run inventory` regenerated (only its "Generated ... at <hash>"
line moved; the generator skips `visual` by design) · frontend `npm test`
**678/38** and `npm run typecheck` clean, both untouched by this chunk.

**Mutation ×3, each reverted**

1. A fake kind `sparkleburst` prepended to `visualKinds`: RED on
   `TestVisual_TablesCoverEveryKind` (*kind "sparkleburst" has no key row*) and
   on the golden fixture's own require (*visual kind "sparkleburst" has no
   visualKeysByKind entry*), before any diff.
2. `"kind": "bogus"` in `api/skills/damage.json`: RED both ways.
   `aurad -validate -content ../api` exits 1 with *skill "Damage": visual layer
   0: unknown kind "bogus" ...*, and `npm run smoke` reddens from the NEW leg
   (k), naming the file and `visual.layers[0]` (checked deliberately: leg (f)
   would otherwise have made this a false pass through the seam).
3. `{"kind":"emitter","on":"ambient"}` on the passive `fire-shield.json`:
   REFUSED, *skill "FireShield": visual layer 0: trigger "ambient" is not legal
   on a passive skill (D2: a passive skill may author hit) - ...*.

**⛔ Not verified in game.** C0 has no runtime surface: nothing draws a layer
until C2a, and the boot proof is `-validate` both ways. The PO look this plan
owes per §9 is C2a's.
