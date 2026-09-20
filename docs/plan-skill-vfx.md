# Plan: Skill VFX - what a hit, a cast and a running aura look like, for everyone

> **Status: C4 BUILT 2026-09-20 `d8e1628d` (world scale, a measurement
> chunk: 10× `full` = 0.7–1.0 ms p95 of `update()`, ambient unbudgeted by
> ruling, eviction at 96 from ≈ 145–190 events/s; ⚑ the cap 96 vs 192 and the
> mobile fill rate are OPEN on the PO's real-phone check). **C3 (art) is the
> last chunk.**
> C2b BUILT 2026-09-20 `5fae4fe2`, PO look PASSED ("works, I think
> with this the chunk is done"): the other three kinds `cast-pose` / `orbit` /
> `emitter`, the AMBIENT reconciler that dresses a running aura, the density
> slider Off / Low / Full with its mobile default, `visual` on 46 more files
> and two cheat-only skills (Whirling Axes 77, Firebolt 78), and the look
> rounds' rulings: the bow on `hit`, a HELD weapon whose length is the skill's
> reach.
> C2a BUILT 2026-09-19 `512d4afd`, PO look PASSED (the engine:
> the `SkillFx` manager on its own layer below darkness, budget + pools, the
> math module, placeholder bodies, `impact` / `projectile` / `beam` plus the
> amendment's caster-anchored `strike`, the `hitStyle` lever deleted end to end,
> `AuraTickIndicator` absorbed, `visual` on 59 skills incl. the new Lightning
> Strike). C1 BUILT 2026-09-19 `194a0cd5` (the wire: `SkillEvent` FIRED + HIT
> inside the four funnels, `Mob.owner_id`, five field names deprecated, numbers
> own-caused only, loadbot: D10 stands). C0 SHIPPED 2026-09-19 `e8f7b6b4` (the `visual` key, one per SKILL: seven
> closed kinds, three triggers, load-time validation, six generated fixture
> lists, six content files authored). C3 unbuilt.** Designed 2026-09-11
> (D1-D10 PO-ruled in one sitting; everything in §4-§7 that is not a D-number
> is still a proposal with options). Line refs pinned to `df746e53`;
> re-verify before executing. Ledger: §13.
>
> ⚑ **Both prototype branches are DELETED** (`prototype/skill-visuals` and `prototype/attack-lines`; verified 2026-09-20: neither exists locally nor on origin). Every mention of them in this repo is HISTORY, and a `git show prototype/...` line in an old spec no longer resolves. Everything
> worth keeping was quarried into `frontend/src/features/skill-fx/` by C2a.
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
> `Mob.owner_id`, five field names deprecated (C1) + `aura_hit_style` deprecated on Mob and Character (C2a), NONE in C2b, all as built · CATALOG one field, `auraSkillId` on the HTTP `/mobs` catalog (C2b) · CONTENT one new top-level skill key (C0), then the `strike` kind, the two `beam` keys and `visual` on 59 skills (C2a), then `cast-pose` on `hit`, `visual` on 46 more files and two new skills, 107 of 116 skills dressed / 129 layers (C2b) · CONF NONE.**
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
- ✅ `prototype/skill-visuals` and backlog §57's `prototype/attack-lines`:
  **both branches are GONE** (verified 2026-09-20, local + origin).

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
- **C2b · The other three kinds + the slider.** ✅ **BUILT 2026-09-20, PO look
  PASSED** (spec: §12d, the look amendments: §12d.7, ledger: §13). `cast-pose`,
  `orbit`, `emitter` real and the stubs deleted; the **ambient reconciler**
  (`SkillFx.setAmbient`, keyed by GameObject like the glows), so a running aura
  finally dresses itself; the density setting (§7.3) Off / Low / Full with its
  mobile default; every aura and cooldown that CAN author a look has one. Two
  cheat-only skills (Whirling Axes 77, Firebolt 78). **Schema: NOT NONE, as
  §12d.2 corrects: CATALOG one field (`auraSkillId` on HTTP `/mobs`), CONTENT
  `visual` on 46 more files + two new skills; DB, WIRE and CONF NONE.**

  ⚑ **The look rounds moved the vocabulary again** (§12d.7): `cast-pose` is now
  legal on `hit` as well as `fired` and the bow moved there (only when damage is
  done, aimed at the victim), and a weapon is **HELD**: hilt in the hand, length
  = the skill's reach, passing through closer mobs by PO ruling.
- **C3 · Art.** Atlas contract doc, first artist sheets in-repo, the body
  resolver's ERROR path armed in `-validate`; the spell builder's Visuals
  section renders `visual` (that chunk lives in `plan-content-editor.md`'s
  ledger, cited here). **Schema: NONE.**
- **C4 · World scale.** ✅ **BUILT 2026-09-20** (spec: §12e, departures + PO
  rulings: §12e.8, ledger: §13). A dev-only instrument + a client-side stress
  driver (a real 10× server is tick-starved, so it cannot be the load) + the
  seven-leg `skill-fx-scale.mjs`. 10× `full` costs 0.7–1.0 ms p95 of
  `update()`; ambient is the dominant share and stays UNBUDGETED by ruling; at
  96 eviction starts ≈ 145–190 events/s, about 10× above the 10× world.
  ⚑ **Two things stay OPEN on the PO's real phone: the cap (96 vs 192) and the
  mobile fill rate**, which a 3 fps headless page cannot judge. **Schema:
  NONE, and it held.**

C0 and C1 can be built in either order; C2a needs both.

## 10. Open questions (carried, not blocking)

1. ~~`visual` per skill or per effect?~~ ✅ **RESOLVED 2026-09-19 (PO): per
   SKILL**, one top-level key, never per effect. Built that way in C0.
2. ~~What does `low` cut?~~ ✅ **RESOLVED 2026-09-20 (PO): particle counts
   × 0.4 (`max(1, round(count * 0.4))`) and `ambient` EMITTER layers only for
   the OWN character**; every hit kind, orbit and cast-pose is untouched.
   `off` is literal: no authored layer draws at all, the glow and the numbers
   stay. §12d.1, built in C2b.
3. ~~Mobile default `low`?~~ ✅ **RESOLVED 2026-09-20 (PO): yes**, desktop
   `full`, a stored choice always wins. §12d.1, built in C2b.
4. ~~Default dressings for heal / shield / light auras that author no
   `visual`?~~ ✅ **RESOLVED 2026-09-20 (PO): none, ever.** No engine default;
   C2b authored every aura and cooldown that CAN carry a look instead
   (§12d.5's table), so the question is moot rather than answered "none by
   accident". Stat / resist passives stay bare by D2.
5. ~~Does the `AuraRings` tint follow the layer palette?~~ ✅ **RESOLVED
   2026-09-20 (PO): it stays the CATEGORY colour.** The ring is gameplay
   information (range + category), the layers are dressing; `AuraRings` was
   not touched in C2b.
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
  ✅ **ANSWERED 2026-09-20 in C2b (§12d.4): it draws NOTHING.** The ambient
  reconciler is fed `active_skill_id`, which is 0 while the aura is equipped
  but off, and 0 disposes.

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
- ⚑ **A mob's `ambient` draws only while `aura_tick_interval > 0`** (C2b,
  §12d.2), and that field is 0 for every effect type outside
  `skills.HasVisibleTickCadence` (light, resist, speed, slow). A future mob
  whose only aura is one of those loads clean, validates clean and draws NO
  ambient, silently. No such mob exists at C2b (every mob aura in the batch
  leads with a heal or a shield). The day one does, gate the mob feed on
  something else (`aura_radius > 0`, or an `active_skill_id` on `Mob`), do not
  widen `HasVisibleTickCadence`: that list drives the wind-up glow.
- ⚑ **`auraSkillId` assumes ONE active aura per species and that a running
  mob aura IS that one** (C2b, §12d.2). The catalog test makes a second
  authored aura loud. What it cannot catch is a mob that SWITCHES auras at
  runtime: it would wear the first aura's ambient look the whole time. That
  day the answer is a wire field (`Mob.active_skill_id`, the `Character`
  precedent), not a cleverer catalog.
- ⚑ **`Event.trigger` UNSUBSCRIBES any listener that returns `true`**
  (`core/logic/Events.ts:67`). `BrowserConsole` uses that on purpose as a
  one-shot; copied into a settings listener it makes the listener work exactly
  once and then go dead, which for the density slider read as "the first
  change works, every later one does nothing". A long-lived
  `GameSettingChangedEvent` listener returns nothing (`Audio.ts` / `Music.ts`
  are the idiom). Hit and fixed in C2b.

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

## 12d. C2b execution spec (2026-09-20, re-verified against HEAD `5a8fd2e6`)

Planned in the executing session; the PO answered the open questions up front
(below). Everything not marked PO is an implementation call.

### 12d.1 PO calls (2026-09-20)

- ⭐ **§10 Q2, `low`: particle counts × 0.4 (`max(1, round(count * 0.4))`)
  and `ambient` EMITTER layers draw only for the OWN character.** Every hit
  kind, every orbit and every cast-pose is unchanged for everyone.
- ⭐ **`off` is literal: no authored layer draws at all**, old kinds included
  (strike, projectile, beam, impact). The wind-up glow and the floating
  numbers stay; they are combat information, not dressing.
- ⭐ **§10 Q3: mobile defaults to `low`**, desktop to `full`; a stored choice
  always wins.
- ⭐ **Batch scope: every aura and cooldown that CAN author a look gets one**
  (the C2a precedent), by the written rule of §12d.5. Stat / resist passives
  stay bare: D2 gives a passive the `hit` moment alone and they never hit.
  That makes §10 Q4 (a category default) moot: **no engine default, ever.**
- ⭐ **§10 Q5: the ring stays the category colour.** `AuraRings` is untouched.
- ⭐ **The bow: Long-Range Strike and the two mob volleys** (`bandit-volley`,
  `kobold-volley`) gain a `cast-pose`. **Suppression stays a bolt** (PO: it
  is the "Frost Bolt" type spell, no bow).
- ⭐ **Two new cheat-only skills** (the Lightning Strike precedent, no unlock
  source, all numbers [PLACEHOLDER], registry pin 114 → 116):
  **Whirling Axes** (id 77, cooldown): ONE `instant_damage` around the caster
  at cast, numbers cloned from Shockwave, and the two axes orbit ~1.2 s as the
  flourish of that hit (`orbit` on `fired` + `impact` per victim). PO chose
  this over an active aura and over a new timed-damage effect type.
  **Firebolt** (id 78, active aura): `fire`, ranged ring, nearest 1, numbers
  cloned from Long-Range Strike; `projectile` + `impact`.
- ⭐ **Delete both prototype branches** (`prototype/skill-visuals`,
  `prototype/attack-lines`, local + origin): YES. ⚑ At the wrap both turned out
  to be ALREADY GONE (no local ref, not on origin), so nothing was deleted.

### 12d.2 Schema, corrected

§9 said "Schema: NONE". It is not. **CATALOG: one field on the HTTP `/mobs`
catalog (`auraSkillId`). CONTENT: `visual` on ~45 files, two new skills.
DB NONE · WIRE NONE · CONF NONE.** Client-side only: one new `vfx` block in
the browser-local `gameSettings` JSON.

Why: `ambient` is STATE, resolved per §4.2 "from `active_skill_id` / the mob
def". `Character` has `active_skill_id` (`server.fbs:355`); **`Mob` has no
such field and the client `MobDefinition` carries no skills.** Every species
authors at most ONE `active_aura` skill (checked over all of `api/mobs/`
2026-09-20), so the species' aura skill id rides the catalog: Go serializer in
`items/mobs/catalog.go` + its test, mirror in `client-data/Mobs.ts`. 0 = the
species has no active aura. A mob's ambient is on exactly while its glow would
be: `aura_tick_interval > 0` (so a pre-aggro gated mob draws none). ⚑ If a
species ever authors two active auras this breaks; the catalog test pins "at
most one" so that day is loud.

### 12d.3 Units and per-trigger semantics (settled BEFORE the halves split)

The C2a `width` lesson: two halves disagreed and a 0.35 px beam shipped.

| Kind | Key | Meaning |
| --- | --- | --- |
| `emitter` | `count` | `ambient`: particles ALIVE at once (a steady loop) · `fired` / `hit`: particles in the one burst. Default 8. |
| `emitter` | `ms` | one particle's lifetime, all triggers. Default 900. A `fired` / `hit` emitter lives exactly `ms`. |
| `emitter` | `motion` | `swirl` = circles the anchor at ~70 % of the anchor's radius, slowly drifting outward, fading · `rise` = starts inside the anchor's disc, drifts UP (−y) ~40 px over its life, fading · `burst` = flies radially outward from the centre ~1.5× the anchor radius, fading. Default `rise`. |
| `emitter` | anchor | `ambient` / `fired`: the caster · `hit`: the victim. |
| `orbit` | `count` | bodies, evenly spaced. Default 2. |
| `orbit` | `ms` | `fired`: the layer's whole DURATION (fade in/out inside it) · `ambient`: ignored for duration, the layer lives while the aura runs. Default 1200. |
| `orbit` | speed | not authored: one revolution per 800 ms [PLACEHOLDER], radius = anchor radius + 14 px. |
| `cast-pose` | `ms` | how long the body shows AFTER the FIRED moment. Default 250. |
| all | `scale` | multiplies the body size (particle radius, orbit body, pose body). |

All distances PIXELS, all durations ms, nothing random (index-seeded, the
§7.2 rule). An emitter's two-body example (§4.3 heal: cross + mist) is TWO
emitter layers, not a body list.

### 12d.4 Engine (half A)

All under `frontend/src/features/skill-fx/logic/` unless named.

- `SkillFxMath.ts` + test, RED-FIRST: `orbitPoint(index, count, elapsedMs,
  radiusPx)`, `orbitAlpha(elapsedMs, ms)`, `emitterParticle(motion, index,
  count, elapsedMs, ms, radiusPx)` → `{x, y, alpha, scale}` (looping for
  ambient: particle i is phase-offset by `i / count` of a lifetime),
  `castPoseAlpha(elapsedMs, ms)`, `densityCount(count, density)`.
- `SkillFxKinds.ts`: `CastPoseFx`, `OrbitFx`, `EmitterFx` replace the three
  stubs; `stubHandler` / `warnedStubs` / the `stub` flag are deleted. The
  seven-name pin stays green by construction.
- ⚑ **Pixi v8 `ParticleContainer` takes textured `Particle`s, not
  `Graphics`.** One small white circle texture (and one cross texture for the
  heal) generated ONCE at `setup()` via `renderer.generateTexture`, tinted per
  particle. If `ParticleContainer` fights the pools or the layer order, plain
  pooled `Sprite`s off the same textures are acceptable at these counts
  (≤ 12 per emitter); say which in the ledger.
- Placeholder bodies (`SkillFxBodies.ts`): cast-pose = a small bow arc held
  at the caster's edge, rotated toward the caster's facing if cheaply known,
  else +X · orbit = two axe-ish wedges (the §4.1 placeholder), tinted ·
  emitter = the circle; `body: "cross"` is NOT authored (C0: no `body` before
  the atlas), so the heal's crosses are a second emitter layer whose `tint`
  differs, circles both. Ugly on purpose.
- **`on: fired` layers** already flow through `planSpawns` (caster at both
  ends). Orbit / cast-pose / emitter on `fired` spawn from it; they follow the
  caster's anchor per frame and STOP with their owner (§7.1): when the anchor's
  shape leaves the stage they dispose, unlike a bolt.
- ⭐ **The ambient reconciler, a NEW mechanism** (events cannot carry state).
  Modelled on the `glows` Map: keyed by GameObject, fed by
  `SkillFx.setAmbient(owner, skillId, radiusPx)` from the same sites that feed
  the glow (`Character.ts:254/267` with `active_skill_id`; `Mobs.ts:367-408`
  with `mobDefinition(id).auraSkillId` when `interval > 0`, else 0; the own
  Character through the same `Character` path). A change of skill id disposes
  the old layers and spawns the new skill's `ambient` layers; 0 disposes.
  Positioned per frame on `PrerenderEvent`, dropped when the shape leaves the
  stage, cleared by `reset()`. **§10.1's carried question is answered here:
  equipped-but-off draws nothing** (`active_skill_id` 0).
- **Budget:** ambient layers are NOT under the 96 cap (they are state, like
  the glow; a campfire's mist must not be evicted by a combat burst). Counted
  separately in `counters()` as `ambient`. Fired/hit layers stay under it.
- **Density** (`SkillFxDensity.ts` or inside the manager): reads
  `GameSettings.get().vfx.density`, subscribes to `GameSettingChangedEvent`.
  `off`: `onSnapshot` spawns nothing, the reconciler holds nothing, a switch to
  `off` disposes everything live at once; glow untouched. `low`:
  `densityCount` on emitters, ambient EMITTER layers only when the owner is the
  own character. `planSpawns` gains the density decision only if it stays pure
  (pass the density in); test it there.
- ⚑ **`cast-pose` shows at RELEASE.** FIRED is emitted when a cast is consumed
  (`sys/skills.go:2104`) and on an aura beat (`:305`), so the bow appears as the
  arrow leaves. Nobody builds a pre-cast pose off `cast_skill_id`.
- `counters()` gains `ambient` and `density`.

### 12d.5 Slider + content (half B)

**Slider.** `GameSettings.ts`: `public readonly vfx = new VfxSettings()`,
`density: 'off' | 'low' | 'full'`, default `isMobile() ? 'low' : 'full'`
computed at construction (the `_merge` lets a stored value win). UI: a
three-way control in `settings.partial.html` + `GameSettingsUI.ts` beside the
audio block, labelled "Skill effects", `pointerdown`-safe per CLAUDE.md's HUD
rule (check how the existing toggles listen and match it). Vitest: the default
by platform, the stored-value-wins merge.

**Catalog.** `auraSkillId` per §12d.2, red-first in `catalog_test.go`.

**Content rule (all [PLACEHOLDER], no `body`; `tint` only where the palette
has no answer, i.e. non-damage skills, which have no damage type):**

| Family | Look | Files |
| --- | --- | --- |
| heal auras | `emitter` ambient `rise` ×2 (green mist + pale-green "crosses") | heal, lifewarden, rejuvenation · mobs: bandit-heal, healer-aura, camp-aura, campfire-aura (campfires: warm orange mist instead) |
| shield auras | `orbit` ambient, count 3, pale blue | mobs: rally-drum, warbanner-shield |
| resist auras | `orbit` ambient, count 2, tint by the resisted type | aegis, fire-ward, venomward, fire-vulnerability (red, it is a debuff) |
| light | `emitter` ambient `rise`, count 4, warm yellow, sparse | lantern (⚑ `torch` is a passive: undressable under D2, by rule) |
| speed / slow auras | `emitter` ambient `swirl`, white / frost | fly-you-fools, slow |
| self cooldowns (heal, shield, resist, hot, haste, speed) | `emitter` fired `rise` or `burst` in the family colour | first-aid, recover, barrier, sanctuary, haste, swift, onward, bloodthirst, retribution · mobs: warlord-frenzy |
| control cooldowns | `emitter` fired `burst` | taunt, fade, calm, charm-beast, charm-elemental, paralyze, revive, recall, dash |
| summons / portals / throws | `emitter` fired `burst`, small | call-for-aid, field-medics, hold-the-line, fire-totem, summon-companion, summon-totem, summonspider, open-portal, pull-through, throw-bomb, throw-mine |
| the bow (⚑ SUPERSEDED, see below) | + `cast-pose` fired ms 250 | long-range-strike · mobs: bandit-volley, kobold-volley (⚑ flips their `HasFired`: one FIRED per beat each, by PO call) |
| NEW Whirling Axes (77) | `orbit` fired count 2 ms 1200 + `impact` hit burst | whirling-axes.json |
| NEW Firebolt (78) | `projectile` + `impact` burst | firebolt.json |
| bare, by rule | stat / resist passives and torch: D2 gives a passive `hit` alone and they never hit | antivenom, discipline, hardy, keen-eye, strong, thick-hide, tough, torch |

⚑ **The bow row is SUPERSEDED by §12d.7:** the PO look moved all three files to
`cast-pose` on **`hit`**, ms **500**, and un-did their `HasFired` flips (no
FIRED per beat).

`frost-shield` (passive, `retaliate_slow`): author `impact` on `hit` only if a
HIT event actually exists for it (check `sys/` first); otherwise bare and say
so. The agent runs `aurad -validate -content ../api` after the batch, then
`make -C backend build` before any Go test. `TestVisual_TheNinePOExamples`
already covers the vocabulary; the content pin is the registry count 116 and
the new ids in the census tests.

Docs in the same half: `manual-content-authoring.md` §2 (the §12d.3 table,
the torch rule, the two-layer heal idiom), the `add-content` skill if it names
kinds as stubs, `tools/content-editor/README.md` only if it lists catalog
fields.

### 12d.6 Verify tail C2b owes

`go build` / `go vet` / `go test -count=1 ./...` · `make -C backend build` ·
`-validate` 0 both ways · `npm run smoke` · editor `node --test` · inventory
regenerated · frontend `npm test` / `typecheck` / `build` · real boot + join ·
`skill-fx.mjs` gains legs: a campfire's ambient mist in view with NO combat ·
Frostbite's swirl on the own player, gone when the aura is switched off ·
Long-Range Strike: cast-pose + projectile + impact · Whirling Axes: an orbit
on the cast · Heal: the rise emitter · density `off`: a fight spawns 0 Fx and
0 ambient while the glow lives · density `low`: another actor's ambient
emitter absent, own present · 0 console errors · `hygiene-wire-prune` clean ·
screenshots at `full` and `low` for the look. Mutation ×3 minimum. ⛔ Not
wrapped, not committed, branches not deleted before the PO look.

### 12d.7 Amendments from the PO look (2026-09-20)

Several rounds the same day, each one built and re-walked. ⭐ = a PO ruling.

1. ⭐ **The bow moved from `fired` to `hit`.** "Only when damage is done, aimed
   at the victim, and bigger." `cast-pose` is now legal on `hit` as well as
   `fired` (vocabulary widened, fixture regenerated), the three bow files moved
   there, and their `HasFired` flips were **un-done**: no FIRED event per aura
   beat any more. One pose per (source, skill) per snapshot, aimed at the FIRST
   victim, size 1.1 × the caster's radius. Then: "linger twice as long" → the
   three files and the `cast-pose` default both go **ms 500** (§12d.3's table
   said 250).
2. ⭐ **Whirling Axes must show the REAL range and start at the player.** A
   `cast`-side `orbit` on a skill with a reach now draws HELD axes: the haft
   comes out of the hand and the bit rides the inside of the range ring. New
   `reachPx` on the plan entries, resolved from the skill's widest effect radius
   **at LEVEL 1** (other actors' skill levels are not on the wire). Ambient
   orbits are unchanged: anchor radius + pad.
3. ⭐ **Heal and campfire motes were "too massive"**: a particle's radius is
   0.16 × the anchor radius with a 6 px cap, before `scale`.
4. ⭐ **The bite must read as jaws.** Two toothed jaws (8 teeth, the middle
   pair long fangs), each drawn ONCE and closed by TRANSLATION (`snapOpenOf`);
   the lead's own perf review flagged the first per-frame-redraw version.
5. ⭐ **A weapon is HELD.** First ruling: "size must not depend on distance."
   An hour later, having walked the fixed-size version: "the hilt must never
   float; start at the player and extend to max range, I would rather it go
   through mobs." So a strike's length = the skill's reach minus the hand
   offset, the stab grows out of the hand (x-stretch, the C2a look), and the
   blade **passes through closer victims BY RULING**.
6. ⭐ **The overhead swing, from a PO sketch.** The hammer is raised 90° off
   the aim on the screen-UP side (`overheadSide`, latched once per swing),
   holds there through the wind-up, then swings down accelerating; the contact
   moment is unchanged. Red-first rewrite, and the "never past the victim
   before contact" invariant is now measured along the aim.
7. ⭐ **The hammer head was enlarged**: a block ACROSS the shaft, sized off the
   weapon's length.

⚑ **Two spec paragraphs went stale.** §12d.4's `ParticleContainer` paragraph is
moot: **pixi.js 8.4.1 ships no `ParticleContainer` / `Particle`**, so particles
are pooled `Graphics` (≤ 12 per layer), which is the "acceptable at these
counts" fallback that paragraph already allowed. §12d.4's "`cast-pose` shows at
RELEASE" still holds for a `fired` pose; the bow simply is not one any more.

## 12e. C4 execution spec (2026-09-20, re-verified against HEAD `4949f596`)

World scale: what the SkillFx layer costs when the world is ten times as busy,
with the slider at each level, and what that says about the cap. A MEASUREMENT
chunk: its deliverable is a table and a recommendation, not a look.

### 12e.1 Calls made in planning (lead, 2026-09-20; none is a PO number)

- ⭐ **The 10× load is a CLIENT-SIDE stress driver, not a 10× server.** The
  server's density ceiling is ≈5.8× (`plan-world-scale.md` §11; PhysicsSystem
  74 % of the tick at 10×), so a real boot at 10× is tick-starved and would
  emit FEWER events per wall second than a healthy busy world. Measuring the
  client against it measures a broken server. It also keeps the schema line
  honest: no `aurad` flag, no scaled zone.
- ⭐ **"10×" is grounded in a measured 1×**, not guessed: leg 1 records the real
  rates at a busy real venue (events per second through `onSnapshot`, ambient
  owners in view), and the stress legs multiply THOSE.
- **Headless numbers are ratios and counts, never absolutes**
  (`project_mobile_layout`, `project_input_jitter`). The table reports
  `full / off` and `low / off`, the manager's own `update()` CPU milliseconds
  (comparable in headless), display-object counts, and eviction counts.
  `off` is the control: same entities, zero authored layers.
- **The cap is a PO number.** C4 measures 96 and two alternatives and PROPOSES;
  `FX_BUDGET` changes only on a PO answer.
- **The real phone is PO-owed.** A headless phone viewport at DPR 3 gives a
  fill-rate RATIO and nothing more; the ledger lists the real device under
  "Not run".

### 12e.2 Schema

**DB NONE · WIRE NONE · CONF NONE · CATALOG NONE · CONTENT NONE.** Client-only,
dev-only. ⚑ §9 said NONE for C2a and C2b and was wrong both times; if the
executing agent finds itself touching Go, `api/` or an `.fbs`, it stops and
reports instead.

### 12e.3 The ambient census (done in planning, from disk)

18 skills author an `ambient` layer, every one an active aura. The heaviest
owner holds **12 Graphics** (`frostbite`, `hoarfrost`: one emitter × 12); the
heal family holds 9 (5 + 4); an orbit holds 2–3. Six of the 18 are mob or
place auras (`bandit-heal`, `camp-aura`, `campfire-aura`, `healer-aura`,
`rally-drum`, `warbanner-shield`), so the unbudgeted population in view is
"players with an aura on + those species", and under `low` only the OWN
emitters survive. The question C4 answers is therefore narrow: **what do N
owners × ≤ 12 pooled Graphics cost per frame**, and is that ever comparable
to the budgeted 96. If it is not, the ruling "ambient stays unbudgeted" gets
its number and no cap is built (rule over machine).

### 12e.4 Half A: the instrument (frontend, dev-only)

All of it reachable ONLY through the `?develop` console surface
(`BrowserConsole.ts`, beside `skillFx`), none of it on a production path.

1. **Frame cost.** `SkillFx.update()` times itself ONLY while measuring is on
   (two `performance.now()` calls, a fixed ring of the last 600 samples, no
   per-frame allocation). `window.game.skillFxMeasure(on)` toggles and clears;
   `window.game.skillFxStats()` returns `{frames, updateMs: {p50, p95, max},
   liveMax, ambientMax, displayObjects}` where `displayObjects` is a recursive
   child count under the `skillFx` layer taken at call time. The percentile
   math is a pure function in `SkillFxMath.ts` with vitest pins (red-first).
2. **The rate probe.** While measuring, `onSnapshot` counts events in and Fx
   spawned, so leg 1 can read a REAL venue's events per second.
3. **The budget override.** `FX_BUDGET` stays the exported default; the live
   cap becomes a module `let`, set by `window.game.skillFxBudget(n)`, restored
   by `reset()`. No setting, no persistence.
4. **The stress driver**, its own file `SkillFxStress.ts`:
   `window.game.skillFxStress({eventsPerSec, ambientOwners, seconds})`. It
   feeds the REAL paths, `onSnapshot` and `setAmbient`, never a side door:
   - events: synthetic `SkillEventData` between stress actors, the skill ids
     drawn round-robin from every catalog skill whose `visual` authors a
     `fired` or `hit` layer, so the kind mix is the authored mix;
   - actors and ambient owners: minimal GameObject-shaped stubs laid on a
     deterministic grid across the current viewport, resolved through the
     `ResolveEntity` seam. ⚑ The reconciler and the glows are keyed by
     GameObject, and `anchorFor` reads `shape.position`, `shape.destroyed`,
     `shape.parent` and `size`: the stub must satisfy exactly those, and the
     agent reads `anchorFor` + `spawnAmbient` before shaping it. Ambient skill
     ids round-robin over the 18 of §12e.3, `own: false` for all but one, so
     `low` shows its real cut;
   - it stops itself after `seconds`, disposes its stubs' ambients, and leaves
     the counters readable. Deterministic (no `Math.random` in placement or
     selection), so two runs are comparable.
   The scheduling maths (how many events this frame for a rate and a delta,
   carry the remainder) is a pure function with vitest pins.

⚑ Landmines: `Event.trigger` UNSUBSCRIBES a listener that returns `true` ·
`visualOf` never caches an unknown skill, the catalog loads async, so the
driver refuses to start before `Skills` is loaded · the frontend pin is
812 / 44 and will move, record the new one.

### 12e.5 Half B: the harness, `.claude/skills/verify/skill-fx-scale.mjs`

Reuses `skill-fx.mjs`'s launch flags (load-bearing), join lib and tri-state.
Measure windows of 10 s after a 2 s warm-up. Legs:

1. **Real 1×.** GOD, warp to a busy camp with a campfire in view, own aura on,
   fight for the window: record events per second, ambient owners, `live`
   max. This defines 1×. Inconclusive (not red) when the venue is empty.
2. **Synthetic 1× vs real 1×**, density `full`: the driver at leg 1's rates
   must land within the same order on `updateMs` p50, or the driver is not
   honest and the run stops there.
3. **10× × three densities.** `off`, `low`, `full` at ten times leg 1:
   `updateMs` p50 / p95 / max, rAF-delta p50 / p95, `liveMax`, `ambientMax`,
   `displayObjects`, `evicted`. Screenshots at 10× `full` and 10× `low`.
4. **Ambient alone.** 10× ambient owners, zero events, `full`: the unbudgeted
   question of §12e.3 in isolation, against leg 3's event-only share.
5. **The cap.** 10× `full` at budget 48, 96, 192: `evicted` per second and
   `updateMs` p95 for each.
6. **Phone shape.** Viewport 390 × 844, DPR 3, touch: 10× at `low` (the mobile
   default) and `full`, reported ONLY as ratios against the same page's `off`.

Output: a JSON file plus a markdown table printed at the end; the table goes
into the §13 ledger verbatim. Assertions are few and structural (the driver
reached its rate, `off` spawned 0, the stats are non-empty); the numbers are
findings, not pass/fail, except one guard: **`full` 10× `updateMs` p95 under
the 16.7 ms frame** is reported as PASS / OVER, because over it the chunk owes
a fix or a lower cap rather than a table.

### 12e.6 What happens with the numbers

- `updateMs` p95 at 10× `full` comfortably inside a frame and eviction rare:
  96 is proposed to stand, ambient stays unbudgeted, both with their numbers.
- Eviction constant at 10×, or p95 over budget: the agent does NOT tune. It
  reports the profile's top cost, and the lead brings the PO a choice (cap
  value, a per-kind particle trim under load, an ambient cap) as a prompt.

### 12e.7 Verify tail C4 owes

`go build ./...` (nothing Go changed, stated) · frontend `npm test` +
`typecheck` + prod build · `make -C backend build` before any harness run ·
`skill-fx.mjs` still 13 legs PASS (the instrument must not disturb the engine)
· `skill-fx-scale.mjs` run twice, the two tables within noise of each other ·
⛔ NOT run, PO-owed: a real phone. ⚑ `hrnss_*` residue: cleanup only with
`aurad` stopped.

### 12e.8 Departures as built, and the PO's rulings (2026-09-20)

**Departures** (each the executing agent's call, reviewed by the lead):

- ⭐ **Leg 1's venue is the western bandit camp (26.0, 20.7), with NO campfire
  in view.** All five campfires sit in quiet corners; the camp was picked from
  `api/zones/world.json` for 13 spawns within 8 u around BOTH ambient-aura
  species (RallyDrummer, BanditHealer). The tables are built on ITS 1×
  (1.3–1.5 events/s); the busier east camp gave 4.2–4.3 in two pilots, and its
  10× (≈ 43/s) reached the same conclusions.
- ⭐ **Leg 1 runs LEVELLED and with GOD OFF.** GOD short-circuits the player's
  own `takeDamage`, and in a camp the mob→player stream is most of the
  traffic: GOD on / L1 = 1.0 events/s, GOD on / L30 = 0.1, GOD off / L30 = 4.3.
- ⭐ **The 10× ambient owner count is PINNED at 50, not measured × 10**, the one
  place §12e.1's "multiply THOSE" is not followed. The live count swings 0–6
  inside one window as mobs die and respawn, so two runs compared nothing on
  the column C4 exists to read. 50 = 10 × the five owners the census expects;
  the measured count rides in the table beside it. The EVENT rate is measured
  and multiplied, as specified.
- `stats()` carries six keys beyond §12e.4's five (`eventsIn`, `fxSpawned`,
  `ambientOwners`, `ambientOwnersMax`, `budget`, `measuring`).
- **One production-module touch:** `allSkillDefinitions()` in
  `client-data/Skills.ts`, read-only, no hot path; it doubles as the driver's
  "catalog loaded?" test. The alternative was probing ids blindly.
- `window.game.skillFxStress` is one function, three behaviours by argument:
  options = start, nothing = status, `null` = stop early.
- No 8× clock trick for the screenshots: the instrument, the driver and every
  Fx clock read `performance.now`, so slowing it would corrupt the window.
- ⚑ `reset()` restores the budget override, so a death mid-leg silently drops
  a 48 / 192 setting. The stress legs run on open ground for that reason.

**PO rulings on the first tables** (2026-09-20, asked as prompts):

1. **The cap:** leg 5 was a NULL result (live Fx peaked at 6–15 against 96,
   zero evictions everywhere, so 48 / 96 / 192 could not be ranked). PO: **add
   a ceiling-finding leg** (leg 7: ramp the rate until 96 evicts and until
   `update()` p95 nears a frame, then compare the three caps where they
   differ). `FX_BUDGET` moves only on the PO's answer to THAT table.
   ⭐ **Answered the same day on leg 7's table: "decide after the phone
   check."** 96 stays in code, the cap is OPEN (§13 C4).
2. **Ambient stays UNBUDGETED**, now with its number: 50 owners = 70 layers,
   ≈ 320 Graphics, `update()` p95 0.4–0.6 ms. It IS the dominant SkillFx cost
   (≈ 93 % of the layer's display objects, about half its frame time) and it
   is still under a millisecond. No ambient cap is built.
3. **The real phone is PO-owed**; C4 is recorded BUILT with it under "Not
   run". The headless page renders at ≈ 3 fps (software GL), which is exactly
   why fill rate cannot be judged there; the phone rAF ratios inverted between
   the two runs and are noise.
4. `harnessdb -cleanup` approved for this session's `hrnss_*` residue, run by
   the lead with `aurad` stopped.

## 13. Ledger

### C4 ledger (2026-09-20) - world scale

✅ **BUILT 2026-09-20** `d8e1628d`. Spec: §12e, the departures and the PO's
rulings: §12e.8. A MEASUREMENT chunk: no look, a table. Built by one Opus agent
in two rounds (the instrument + legs 1–6, then the ceiling leg the PO asked
for); the lead reran the build, test and typecheck steps at the final tree and
ran the DB cleanup.

**Schema: DB NONE · WIRE NONE · CONF NONE · CATALOG NONE · CONTENT NONE**, and
this time §9's "NONE" held: no Go, no `api/`, no `.fbs` touched. Client-only,
and everything new is reachable only through the `?develop` console, with one
production-module touch (`allSkillDefinitions()` in `client-data/Skills.ts`,
read-only, no hot path).

**What was built**

- **The instrument** in `SkillFx.ts`: `setMeasuring` + a 600-sample
  `Float64Array` ring around the whole `update()` body, a SECOND ring around
  `onSnapshot` (added in round two, see the ceiling), the rate probe
  (`eventsIn`, `fxSpawned`), window high-water marks (`liveMax`, `ambientMax`,
  `ambientOwnersMax`), a recursive `displayObjects` count, and the budget as a
  module `let` behind the unchanged `FX_BUDGET` default (`setBudget`, restored
  by `reset()`). Console: `skillFxMeasure` / `skillFxStats` / `skillFxBudget` /
  `skillFxStress`.
- **The stress driver**, `SkillFxStress.ts`: wire-shaped events between
  GameObject-shaped stubs on a deterministic viewport grid, fed through the
  REAL `onSnapshot` and `setAmbient`; the skill mix is every catalog skill
  authoring a `fired` or `hit` layer, round-robin; refuses to start before the
  catalog is loaded. Pure parts pinned: `stressSchedule`, `percentileOf`,
  `eventLifetimeMs` / `estimateLiveFx` (Little's law: the mix is **445.7 ms of
  Fx life and 1.13 layers per event**, deterministic).
- **The harness**, `.claude/skills/verify/skill-fx-scale.mjs`: seven legs, JSON
  + markdown tables, `AURA_FXSCALE_RAMP_ONLY=1` runs legs 1, 2 and 7.

**Legs 1–6, run A** (run B agreed within noise on every column that matters:
10× `full` p50 0.4 / 0.4 ms, p95 1.0 / 0.7 ms, ambient max 70 / 19 / 0 in both,
display objects 344 / 59 / 1 vs 327 / 55 / 2, evicted 0 everywhere). 1× =
**1.5 events/s** (run B 1.3), 5 ambient owners, the western bandit camp.
Times are ms.

| leg | what | density | budget | frames | events/s in | Fx/s | update p50 | update p95 | update max | rAF p50 | rAF p95 | live max | ambient max | ambient owners | display objs | evicted/s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | real 1x, busy camp, full | full | 96 | 33 | 1.5 | 3.4 | 0 | 0.1 | 0.2 | 308.7 | 321.4 | 7 | 0 | 5 | 10 | 0 |
| 2 | synthetic 1x, open ground, full | full | 96 | 35 | 2.9 | 2.9 | 0.1 | 0.2 | 0.3 | 289.9 | 319 | 4 | 7 | 10 | 31 | 0 |
| 3 | 10x off | off | 96 | 35 | 15.3 | 0 | 0 | 0.1 | 0.3 | 287.1 | 304.9 | 0 | 0 | 51 | 1 | 0 |
| 3 | 10x low | low | 96 | 35 | 15.2 | 17.4 | 0.2 | 0.4 | 0.4 | 290.6 | 299.7 | 7 | 19 | 51 | 59 | 0 |
| 3 | 10x full | full | 96 | 32 | 15.2 | 17.4 | 0.4 | 1 | 1 | 313.3 | 334.3 | 6 | 70 | 51 | 344 | 0 |
| 4 | ambient alone, 50 owners, full | full | 96 | 33 | 0 | 0 | 0.3 | 0.4 | 0.5 | 312.7 | 321.2 | 0 | 70 | 51 | 317 | 0 |
| 5 | 10x full, budget 48 | full | 48 | 32 | 16.4 | 18.6 | 0.3 | 0.5 | 0.6 | 316.9 | 333.7 | 6 | 70 | 54 | 349 | 0 |
| 5 | 10x full, budget 96 | full | 96 | 32 | 15.2 | 17.4 | 0.3 | 0.4 | 0.7 | 314.7 | 330.1 | 6 | 70 | 52 | 343 | 0 |
| 5 | 10x full, budget 192 | full | 192 | 32 | 15.1 | 17.3 | 0.3 | 0.6 | 4.5 | 315.1 | 327.4 | 6 | 70 | 51 | 351 | 0 |
| 6 | phone 10x off | off | 96 | 26 | 15.6 | 0 | 0 | 0.1 | 0.2 | 495.7 | 558.8 | 0 | 0 | 54 | 3 | 0 |
| 6 | phone 10x low | low | 96 | 27 | 15.2 | 17.3 | 0.2 | 0.7 | 1.4 | 473.7 | 519 | 7 | 19 | 51 | 56 | 0 |
| 6 | phone 10x full | full | 96 | 27 | 16.1 | 17.8 | 0.5 | 0.9 | 2.1 | 271 | 503.2 | 7 | 70 | 53 | 353 | 0 |

**Leg 7, the ceiling** (`full`, 50 ambient owners, budget 96, 2 s + 6 s per
step, ×2 per step). Run 1, 1× = 1.2 events/s:

| step | events/s asked | events/s in | Fx/s | live max | est. live | evicted/s | update p50 | update p95 | snapshot p50 | snapshot p95 | display objs | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10x | 12 | 12.5 | 14.17 | 4 | 5.3 | 0 | 0.4 | 0.9 | 0.3 | 0.5 | 351 | 13 |
| 20x | 24 | 25.67 | 29.17 | 5 | 10.7 | 0 | 0.5 | 0.9 | 0.8 | 3.2 | 379 | 11 |
| 40x | 48 | 51.83 | 58.33 | 18 | 21.4 | 0 | 0.5 | 0.9 | 0.7 | 2.1 | 479 | 13 |
| 80x | 96 | 101.5 | 114.5 | 36 | 42.8 | 0 | 0.7 | 1.2 | 0.8 | 1.2 | 583 | 16 |
| 160x | 192 | 202.17 | 228.5 | 50 | 85.6 | 85.67 | 0.9 | 1.7 | 2.2 | 3.1 | 599 | 16 |
| 320x | 384 | 400.17 | 453.33 | 50 | 171.1 | 317.67 | 0.6 | 0.9 | 4.5 | 8.3 | 608 | 16 |
| 640x | 768 | 779.33 | 881.5 | 49 | 342.3 | 787.33 | 0.6 | 0.9 | 7.9 | 16.2 | 581 | 16 |
| 1280x | 1536 | 1549.17 | 1753.5 | 48 | 684.5 | 1698.83 | 0.6 | 0.9 | 16 | 25.4 | 561 | 16 |

Run 2 (1× = 1.8 events/s) evicted first at 144 events/s (17/s), a third
supplementary ramp at 176. **The caps where they finally differ:**

| budget | evicted/s (run 1 @ 192 ev/s · run 2 @ 144 ev/s) | update p95 | display objects |
|---|---|---|---|
| 48 | 152.2 · 103.0 | 0.7 · 0.6 | 386 · 416 |
| 96 | 71.5 · 20.5 | 27.2* · 2.5 | 615 · 681 |
| 192 | **0 · 0** | 8.0* · 2.3 | 698 · 747 |

(* one stalled frame in a 16-frame window; p50 was 0.9 and 1.6 ms.) One step
higher (384 / 288 events/s) even 192 evicts.

**Findings**

- ⭐ **The frame guard PASSES with a wide margin**: 10× `full` `update()` p95 is
  0.7–1.0 ms, about 5 % of a 16.7 ms frame.
- ⭐ **C2b's "unbudgeted and unmeasured" has its number.** Ambient IS the
  dominant SkillFx cost (leg 4: ≈ 93 % of the layer's display objects, about
  half its frame time) and it is 0.4–0.6 ms p95 at 50 owners. **PO: ambient
  stays unbudgeted, no cap is built.**
- ⭐ **The slider is a real cost lever**: display objects 344 → 59 → 1, ambient
  layers 70 → 19 → 0 (`full` → `low` → `off`).
- ⭐ **Leg 5 was a NULL result, which is why leg 7 exists**: at 10× live Fx
  peak at 6–8 (15 at the east camp's 43/s), so no cap was ever reached.
- ⭐ **At 96, eviction starts at ≈ 145–190 events/s**, about 100× one player's
  measured fight and 10× above the 10× world. Live Fx grow roughly linearly
  with the rate (4–8 at 10×, 18–24 at 40×, 36–47 at 80×); Little's law on the
  authored mix puts 96 live Fx at a steady ≈ 215 events/s, bracketing the
  measurement from above (a 3 fps page delivers events in batches, so
  concurrency runs ahead of the mean).
- ⭐ **Once the cap binds, the FRAME cost plateaus** (p50 0.6–0.9 ms up to
  1536 events/s): the cap does its job. **The honest ceiling is the SPAWN
  path**: `onSnapshot` p95 reaches a frame at ≈ 1500 events/s. A cap bounds
  what is drawn, not the planning, spawning and disposing of what the wire
  hands over.
- ⚑ **A p95 over 14–35 frames is the second-highest sample.** The headless
  page renders at ≈ 3 fps (software GL, even with the load-bearing flags), so
  one stall crosses any threshold; read p50 beside it. It is also why FILL
  RATE cannot be judged headless: the phone rAF ratios inverted between runs
  (0.55 / 0.96, then 0.99 / 0.57) and are noise.
- ⚑ Leg 2 (the driver's honesty gate) passed by its floor clause in both runs:
  Chromium coarsens `performance.now` to ≈ 0.1 ms, so the driver is honest at
  the clock's resolution, no better. Real traffic bled into run A's leg 2
  (≈ 1.4 events/s) and run B's leg 4 (0.6).

**PO rulings** (§12e.8 holds the list): ambient unbudgeted · the phone is
PO-owed · ⭐ **the cap is OPEN: "decide after the phone check"**, `FX_BUDGET`
stays 96 [PLACEHOLDER] in code, and the PO's real-device walk at 10× and above
decides between 96 and 192 (192 is cheap in `update()` terms and doubles the
worst-case Graphics on screen, which is the cost only a phone can price).

**Red→green, stated honestly.** Red-first: `percentileOf` (4 pins) and
`stressSchedule` (6 pins). ⚑ **Implementation-first, pinned after and
mutation-checked**: `eventLifetimeMs` / `estimateLiveFx` (7 pins). ⚑ Exercised
ONLY by the harness, no unit test: the rings, `stats()`, the budget `let`, and
the whole Pixi half of the driver.

**Verify tail** (lead, final tree): `go build ./...` clean, nothing Go changed
· frontend `npm test` **829 / 45** (was 812 / 44), `typecheck` + prod build
clean. By the agent: `make -C backend build` before every run ·
`skill-fx-scale.mjs` **PASS** twice for legs 1–6 and twice with leg 7, every
run on a fresh restart, no inconclusive leg · `skill-fx.mjs` **PASS, 13 legs /
18 assertions**, rerun after each round's frontend edits. `harnessdb -cleanup`
by the lead with `aurad` stopped: 24 anonymous harness accounts removed.
⛔ **NOT run:** a real phone (PO-owed) · `hygiene-wire-prune` · two-window ·
loadbot · Go tests (nothing Go changed).

**How the PO drives it on a phone** (a `?develop` build, in the console):
`game.skillFxMeasure(true)`, then
`game.skillFxStress({eventsPerSec: 15, ambientOwners: 50, seconds: 30})` for
10×, `eventsPerSec: 150` for the eviction point, with the slider at each
level; `game.skillFxStats()` reads the window, `game.skillFxBudget(192)`
tries the other cap.

**Still open after the wrap**

- ⭐ **The cap (96 vs 192) and the mobile fill-rate verdict**, both on the PO's
  phone check.
- **C3 (art)** is the last chunk.
- ⚑ The 1× baseline is ONE player's fight. Many players in one viewport is a
  different multiplier than mob density, and nothing measured it; the driver
  can (raise `eventsPerSec`), a real crowd has not.

### C2b ledger (2026-09-20) - the other three kinds + the density slider

✅ **BUILT 2026-09-20** `5fae4fe2`, **PO look PASSED**. Spec: §12d, with
the PO's calls up front in §12d.1 and the seven amendments the look rounds
forced in §12d.7. Built by two Opus agents in parallel (engine half / slider +
catalog + content half) plus the lead's fixes; the lead reran every verify step
at the final tree.

**Schema: DB NONE · WIRE NONE · CONF NONE · CATALOG one field, `auraSkillId`,
on the HTTP `/mobs` catalog.** §9 said "Schema: NONE" and was wrong: `Mob`
carries no `active_skill_id` and the mob catalog served no skills at all, so a
mob's running aura had no id client-side. Every species authors at most ONE
active aura (pinned by the catalog test), so the id rides the catalog.
**CONTENT:** `visual` on 46 more files + the bow layer on 3, **two new
cheat-only skills** (Whirling Axes id 77 cooldown, Firebolt id 78 active aura),
registry pin **114 → 116** (78 player + 38 mob), 107 of 116 skills dressed, 129
layers; vocabulary: `cast-pose` is legal on `hit` as well as `fired` (fixture
regenerated). Client-only: a `vfx.density` block in the browser-local
`gameSettings` JSON.

**What was built**

- The three remaining kinds are real: `CastPoseFx`, `OrbitFx`, `EmitterFx`;
  `stubHandler` / `warnedStubs` / the `stub` flag are deleted.
- ⭐ **The ambient reconciler**, the chunk's one new mechanism (events cannot
  carry state): `SkillFx.setAmbient(owner, skillId, own)`, keyed by GameObject
  exactly like the glows, fed from `Character.setAuraTick` with
  `active_skill_id` ALONE and from `Mobs.setAuraTick` with
  `mobDefinition().auraSkillId` gated on `interval > 0`. A skill-id change
  disposes the old layers and spawns the new ones; 0 disposes.
  ⚑ **The character feed is deliberately NOT interval-gated**, or Lantern (a
  light aura, no visible tick cadence) would never draw.
- **Ambient layers are NOT under the 96 budget** (they are state, like the
  glow: a campfire's mist must not be evicted by a combat burst) and are
  counted separately. `counters()` gained `ambient`, `glows` and `density`;
  `window.game.settings()` exists for the harness.
- The **density slider** Off / Low / Full in the settings panel, labelled
  "Skill effects": `low` = particle counts × 0.4 (min 1) + ambient EMITTERS
  only for the own character, `off` = no authored layer at all (the wind-up
  glow and the floating numbers stay), mobile default `low`, a stored value
  always wins.
- A per-skill cache of look / colour / reach in `visualOf`, which **never
  caches an unknown skill**: the catalog loads async, so an early miss must
  not be remembered.

**Implementation calls (not PO calls)**

- ⚑ **pixi.js 8.4.1 has NO `ParticleContainer` / `Particle`.** Particles are
  pooled `Graphics`, ≤ 12 per layer (the fallback §12d.4 allowed).
- ⭐ **A placeholder judged by COUNTERS can be invisible in PIXELS.** The first
  emitters passed 13 harness legs while being 4 px dots hidden behind the
  sprite. The lead found it in a screenshot, not in an assertion; leg 12's shot
  now arms on the orbit spawn counter (the C2a trick).
- `cast-pose` on `fired` shows at RELEASE (FIRED is emitted on a consumed
  cast). `scale` multiplies the BODY, never the spread. `ms` is deliberately
  not authored on ambient orbits: the layer lives while the aura runs.
- **`frost-shield` stays BARE**: a `retaliate_slow` records no HIT event at
  all (`noteHit` is written only in `takeDamage` / `Heal`), so an authored
  `impact` would never draw. `torch` and the stat / resist passives are
  undressable under D2, by rule.
- Icons: Whirling Axes `lorc/scythe`, Firebolt `carl-olsen/flame`.

**Red→green, stated honestly.** The overhead rewrite (§12d.7 item 6) WAS
red-first. ⚑ **The lead's `cast-pose` plan tests were written AFTER the code**,
not red-first. **Mutation ×5, each reverted by hand:** two against the agents'
work (math, plan) and three content ones (`cast-pose` on `hit` before the
ruling made it legal, an `ambient` on a cooldown, `curve` on an emitter: all
three refused by Go AND by smoke). ⚑ Disclosed: one agent accidentally
imported the harness during a syntax check; it died on connection refused, no
side effect.

**Verify tail** (lead, final tree): `go build` / `go vet` clean ·
`go test -count=1 ./...` **35 packages ok, 0 failures** (DB tests skip, no
`-race`) · `make -C backend build` · `-validate` **0 findings both ways** ·
`npm run smoke` **0 findings / 116 files / 173 effects / 129 layers** · editor
`node --test` 2/2 · inventory regenerated · frontend `npm test` **812 / 44**
(was 772 / 43), `typecheck` + prod build clean · real boot `count=116` skills,
63 mobs, `/mobs` serves `auraSkillId` (Campfire 109).

**Harness gate.** `skill-fx.mjs` **PASS, 13 legs / 18 assertions**, run three
times (twice mid-session, once at the final tree; that last run's first attempt
hit the documented post-restart join race and the rerun passed). New legs: 7 a
campfire's ambient mist with NO combat · 8 Frostbite's swirl on and disposed
when the aura goes off · 9 density `low` · 10 density `off` (0 Fx across a real
fight, the glows alive) · 11 Heal's two emitters · 12 Whirling Axes' orbit; leg
2 also asserts the cast-pose. **Not run:** `hygiene-wire-prune.mjs` (no wire
change) · `content-editor-skills-tab.mjs` · a two-window leg · loadbot · a real
phone. ⚑ Harness residue: `hrnss_*` characters are still in the dev DB (the
cleanup wants `aurad` stopped; not done).

**⭐ The PO look, several rounds in one day.** Each verdict was built and
re-walked the same session: §12d.7 is the list. On the bow after the move to
`hit`: *"the bow works now"*. On the overhead swing: *"that works well"*.
Final: ⭐ **"works, I think with this the chunk is done."**

**Still open after the wrap** (none of it blocks C3):

- **C3 (art) and C4 (world scale)** are the remaining chunks.
- ⚑ **Ambient layers are UNBUDGETED and UNMEASURED.** They sit outside the 96
  cap by design and nobody has counted them at density 10× or on a phone; that
  is C4's first question, not a C2b defect.
- The reach used by a held weapon or the axes is the **LEVEL 1** radius, so a
  levelled skill's body ends slightly inside its real ring. Exact for the OWN
  player is possible later (the own skill levels are known client-side); for
  other actors it needs the wire.
- Three new traps are recorded in §12 Landmines, not repeated here: a mob's
  ambient is gated on `aura_tick_interval > 0` · `auraSkillId` assumes ONE
  active aura per species and cannot see a runtime switch · `Event.trigger`
  UNSUBSCRIBES a listener that returns `true` (it made the density slider work
  exactly once).
- Carried from C2a: Lightning Strike still wears `lorc/star-swirl` ·
  `hygiene-wire-prune` unrun · no everyday player skill authors `overhead`.

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
✅ **The manager's decisions ARE unit-tested since the follow-up below** (`SkillFxPlan`); at the C2a commit they were harness-only.

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

- ✅ ~~A PO yes/no on deleting `prototype/skill-visuals` and
  `prototype/attack-lines`~~ **ANSWERED 2026-09-20 (PO): YES, and MOOT**: at the
  C2b wrap neither branch existed any more, locally or on origin. Both were
  quarried out first (the math module came over, backlog §57's shipped version
  IS this chunk).
- Lightning Strike wears `lorc/star-swirl`: a real lightning glyph needs a
  fetch + a client icon write, a follow-up.
- **No everyday player skill authors `overhead`** - only Harvest and Pickaxe,
  which are gated. The style is verified by the Troll's smash, not by a
  player's own hand.
- ✅ ~~No manager-level unit test~~ **CLOSED 2026-09-19 (follow-up, PO-asked):** the
  manager's decisions were extracted into the pure `SkillFxPlan.planSpawns`
  (which layers an event draws, the silent skip of an unheld entity, chain
  grouping + hop anchors + stagger, the impact delay = the later of projectile
  flight and strike contact); `SkillFx.ts` keeps only the Pixi half. 30 vitest
  cases, red-first against a stub (24 red), mutation ×4 each reverted; frontend
  **772 / 43**; `skill-fx.mjs` still PASS 7/7 (behaviour unchanged). One
  bounded difference: anchors are per entity per snapshot, not per landing.
  ⚑ Noted, not changed: `ProjectileFx` reads its source position once at
  spawn, so on a chain it would launch from the hop's snapshot-time position.
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
