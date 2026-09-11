# Plan: Skill VFX - what a hit, a cast and a running aura look like, for everyone

> **Status: DESIGNED 2026-09-11 (D1-D10 PO-ruled in one sitting; everything
> in §4-§7 that is not a D-number is a proposal with options). Nothing built.
> Runs NEXT after the spell builder's PO look (D8).** Line refs pinned to
> `df746e53`; re-verify before executing.
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
> **Schema, whole plan: DB NONE · WIRE one appended vector + six deprecated
> fields (C1) · CONTENT one new top-level skill key (C0) · CONF NONE.**
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
| `impact` | hit | a sprite appears at the VICTIM, oriented along caster→victim, plays a short curve (thrust, snap, burst) | a stroked wedge |
| `arc-swing` | hit | a sprite travels an arc from above the CASTER down onto the victim, ends in an impact | a thick arc stroke |
| `projectile` | hit | a sprite flies caster→victim, straight, constant speed, ends in an impact | a filled circle with a trail |
| `beam` | hit | a body stretched caster→victim with an intensity envelope (attack, hold, fade) and a width curve | a jagged polyline (lightning) or a gaussian ribbon |
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
- **Tunables** are per kind and few: `ms`, `speed`, `curve`, `count`,
  `motion`, `width`, `tint`, `scale`. The Go struct is the list (§5.1); the
  fixture exports it; the editor renders it; `smoke.mjs` pins it both ways
  (the spell builder's L1 rule, unchanged).

Open (§10 Q1): whether `visual` sits on the skill or on each effect. The
event carries the skill id, so the skill level is the cheap default; a
skill with two effects (damage + slow) has one look.

### 4.3 The nine PO examples, decomposed

| PO description (2026-09-11) | Layers |
| --- | --- |
| Sword stab directly on the mob | `impact` (sword body, thrust curve) |
| Overhead mace, arc from above the player down onto the mob | `arc-swing` + `impact` |
| Wolf bite: teeth appear, snap shut in a quick motion | `impact` (sheet body: open→closed) |
| Firebolt, straight line, constant speed | `projectile` + `impact` |
| Lightning: weak, then bright and bold, then fade | `beam` (jagged body, envelope attack→peak→fade, width follows) |
| Arrow: a bow in the player's hand, an arrow flies and hits | `cast-pose` (bow) + `projectile` (arrow) + `impact` |
| Flame aura, up to three mobs at once: fire pillars extend and return | `beam` ×N (gaussian ribbon, envelope extend→retract) |
| Two axes spinning around the character, hits everyone around | `orbit` (2 bodies, the ability's duration) + `impact` per victim |
| Heal: green crosses and mist rise from the player's centre | `emitter` (motion `rise`, two bodies: cross, mist) |

Every one of the nine is covered by the seven kinds with zero engine
special-casing, which is the test the vocabulary has to keep passing.

### 4.4 What the prototype's four map to

`field-ice` → `emitter` (`motion: swirl`, ambient) · `strike-sword` →
`impact` (thrust) · `projectile-fire` / `projectile-frost` → `projectile`
+ `impact` with the palette doing the colour. The impact-deferred number
does not survive (D6).

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
`skill_events`. Byte-identical simulation by construction (the fields were
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

## 8. Deletions

- The `hitStyle` lever end to end (D7): `skills/definition.go:193-215`
  (enum, map), `catalog.go:28,53`, `sys/skills.go:731 auraHitStyleFor` +
  `:507`, `model/status_effects.go:76-97`, `NoteAuraHit` / `AuraHitStyle` on
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

- **C0 · The vocabulary + the docs amendment.** Go: `VisualDef` struct with
  json tags on `SkillDef` (`visual`, top-level), per-kind allowed keys,
  load-time validation (known kind, known trigger, ranges; bodies are only
  warned until an atlas exists), fixture regen (`UPDATE_SKILL_VOCABULARY=1`)
  gaining `visualKinds`, `visualTriggers`, `visualKeys[kind]`; `smoke.mjs`
  pins; `effectKeys` drops `hitStyle` (the deletion's content half moves
  here or to C2, §10 Q6). Content: `visual` authored on the prototype's
  five skills + one wolf bite, placeholders only. Docs: §11's amendments.
  **Schema: CONTENT one key.** Verify: `go test -count=1 ./...`, smoke,
  mutation ×3.
- **C1 · The wire.** `SkillEvent` + `skill_events` appended; the payload
  widening (`model.Damage` + a heal payload carry caster + skill id;
  `MobTouches` / `PlayerTouches` / `Heal` signatures change once, D9);
  FIRED emission at the cast and aura-tick sites; HIT emission inside the
  four funnels; per-viewer filter; both binding sets regenerated; client
  decode; **floating numbers switched to the events under D6's rule**;
  the six fields deprecated; `MobJuice` re-seamed. Sim-determinism pins
  green; new codec test (N landings → N events, filter honoured); loadbot
  leg (§5.3) recorded in the ledger, D10 fallback ruled. **Schema: WIRE
  appended + deprecated.** ⚑ Verify the DoT stream's skill id (§3.3).
- **C2a · The engine + three kinds.** `SkillFx` manager, layer, budget,
  pools, math module (prototype harvest), body resolver with placeholders,
  `impact`, `projectile`, `beam`; own player, other players, mobs; the
  `hitStyle` lever deleted; `AuraTickIndicator` absorbed. Browser harness
  (Chromium no-throttling flags). Screenshots. **Schema: NONE** (C1 did the
  wire).
- **C2b · The other four kinds + the slider.** `arc-swing`, `cast-pose`,
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

1. `visual` per skill or per effect? Proposal: per skill (§4.2).
2. What does `low` cut? Proposal in §7.3.
3. Mobile default `low`? Proposal yes.
4. Default dressings for heal / shield / light auras that author no
   `visual`: none (plain ring as today) vs a category default. Proposal:
   none; content authors what it wants, the ring stays the baseline.
5. Does the `AuraRings` tint follow the layer palette, or stay the category
   colour? Proposal: stays; the ring is gameplay information (range +
   category), the layers are dressing.
6. Where does the `hitStyle` content deletion land, C0 (fixture drops the
   key, content must follow) or C2 (with the code)? Proposal: C2, so main
   never carries a fixture that rejects shipped content.
7. FIRED cadence for an aura: every tick (30 Hz for a 1-tick aura) is
   wasteful on the wire for an ambient-only skill. Proposal: emit FIRED
   only for skills whose `visual` has an `on: fired` layer, resolved at
   load into a per-skill flag; the sim never reads it.
8. A cast BAR for other players is §39's (cast progress); the FIRED event
   deliberately carries no progress.
9. Own-summon numbers: a summon's hit has `source` = the summon, and D6 says
   "dealt by the own player". Proposal: yes, show them, resolved through the
   owned relation client-side (XP already credits the owner; the number
   should agree with the XP). Needs the owner id on the wire or a client
   lookup; C1 decides which.

## 11. Docs this plan amends (C0's first task)

- `plan-entity-presentation.md`: §3's moratorium rewritten (per-effect
  presentation ART now lives here; the moratorium keeps only "no new
  independently-anchored overlay on the sprite"); §6 items 3, 4, 10 move
  here; §7's "wire shape" question loses the per-hit half.
- `CLAUDE.md`: the Status "Next" entry (done 2026-09-11); the gotcha line
  repeating the moratorium (still owed).
- `docs/feedback.md` 2026-08-24 row: prunes to "→ plan-skill-vfx.md".
- `plan-content-editor.md` D3 / §B4.8: the Visuals placeholder now points
  here; `hitStyle` leaves the shipped-vs-open audit.
- `backlog.md` §57: attack lines become a free consumer of the HIT event's
  source (a line from `source` to `victim` is one more `beam` body); its
  shipped version is C2a, not §39. `prototype/attack-lines` deletable after
  C2a.
- `docs/README.md`: index line (done 2026-09-11).
- `plan-entity-presentation.md` status block: pointer added 2026-09-11; the
  §3 / §6 rewrite is still C0's.

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

## 13. Ledger

(empty; the first entry is C0's)
