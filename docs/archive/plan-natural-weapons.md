# Plan: natural weapon attacks (the lunge and the maul)

> **Status: COMPLETE, archived 2026-09-28. Both chunks built and PO-passed.**
> Designed 2026-09-27 (PO session, nine rulings taken as choice prompts, §2),
> 2 chunks (§7). **C1 (the `lunge`)** built 2026-09-27, `413a7fd4` (ledger
> §11 C1), PO look 2026-09-28: "works". **C2 (the `maul`)** built 2026-09-28,
> `274a6d07` (ledger §11 C2), PO look 2026-09-28: "works", and after a
> follow-up: "all works, wrap it up". D10 and D11 ruled 2026-09-28; §8 Q6
> (the fixed orientations of pincer, gore, claw and kick, the lead's calls)
> and every number stay [PLACEHOLDER].
> Line refs verified by C1 at `8e49a12b` and corrected by C2 (§11 C2).
>
> Origin: the PO, 2026-09-27, verbatim: *"we need to rework natural weapon
> attacks. that includes the bite of the wolf but also the attack of the boar.
> natural weapons, as opposed to weapons or spells, need to move the token in
> an attack motion, moving it towards the target in a quick motion and
> snapping back. accompanied by a hit effect, like the first bite we had, on
> the target. this is supposed to signify who is attacking, when no weapon or
> spell or projectile is emiting from the attacker."*
>
> This schedules the attacker-token lunge that `plan-skill-vfx.md` §12h.1
> call 3 left open (*"NOT scheduled (the PO liked it; decide after seeing the
> rim bite)"*) and retires the rim bite.
>
> **Schema, whole plan: DB NONE · WIRE NONE · CONF NONE · VOCABULARY +2
> visual kinds (`lunge` C1, `maul` C2), +5 `maul` curves, `strike` loses
> `bite` and `pincer` (C2) · CONTENT 10 skill files (C1), 11 (C2) · no new
> skill, mob or effect type, registry pin stays 121.**
> All numbers [PLACEHOLDER].

---

## 1. What this is

A mob that attacks with its body has nothing leaving it. A sword, a bolt and a
beam all start at the attacker, so the eye finds who struck. A bite starts
nowhere: today's rim bite draws jaws at the VICTIM's rim, and the boar, the
bear and the stag borrow a spear and a sword they do not own (the `thrust` and
`swing` placeholders, `plan-skill-vfx.md` §12g.3). In a pack of four wolves
nothing says which wolf bit.

Two new visual kinds fix that, one per moment of the hit (the two-moment rule
of `plan-skill-vfx.md` §12g.1 call 1, unchanged):

1. **`lunge`, the attack.** The attacker's own token jabs toward the victim
   and snaps back. Nothing is drawn; an existing sprite moves.
2. **`maul`, the hit.** The natural weapon's mark ON the victim: teeth
   snapping shut (the first bite, C0/C2a's `impact` `snap`), fangs, a tusk
   gash, a claw rake, a hoof.

It is dressing over the unchanged combat model. The server is not touched
beyond the visual vocabulary tables: the mob never changes position (D7), no
damage timing moves, no wire field is added. `SkillEvent` already carries the
attacker, the victim and the skill for every landing (§4).

## 2. Decision ledger (PO 2026-09-27, taken as choice prompts)

| # | Question | Ruling |
| --- | --- | --- |
| D1 | What is the hit effect on the target? | **Teeth snap ON the victim**, the first bite: centred on the victim, no jaws reaching from anywhere. Boar, bear and stag get their own mark the same way, procedural placeholders until art exists. |
| D2 | Which unclear attacks lunge besides the sure list? | **The summoned companion and the giant spider's fangs.** The kobold does not (it keeps its `thrust`). |
| D3 | How does a skill get the lunge? | **A new visual kind `lunge`**, authored per skill in the editor. Not a flag on `strike`, not automatic by curve. |
| D4 | Does the lunge play at VFX density `off`? | **Yes, it is readability**, like the wind-up glow and the numbers. `off` hides the mark on the victim, the lunge stays. |
| D5 | How is the effect on the victim authored? | **Its own kind beside `lunge`** (working name `maul`). `bite` and `pincer` move out of `strike`, which goes back to meaning only a held weapon from the attacker. |
| D6 | Does the engine's round hit mark draw with the teeth? | PO: *"does the damage hit effect currently always show up? It should be consistent"*. It does: the ring draws on every landed Damage or Crit hit of every skill, the rim bite included (`SkillFxPlan.ts` rule 5). **So the ring keeps drawing and the maul draws with it, no special rule.** ⚑ This is the lead's reading of a conditional answer; the PO may correct it at the C2 look. |
| D7 | How far does the token lunge? | **A fixed jab**, relative to the attacker's own size, whatever the gap. PO: *"the mob also does not technically change position, it is purely visual"*. |
| D8 | One build session or two? | **Two chunks**: C1 the lunge, C2 the maul. Each ends in a look. |
| D9 | Which parts of the token jab? | **The whole token, as one medallion**: the portrait, the species border and the tier frame move together; the health bar, the aura ring and the nameplate stay. Taken as a choice prompt at the C1 session start, because `actualShape` is the portrait alone and the border and the tier frame are its siblings, so moving it would slide the face out of its own frame. |
| D10 | Is the mark on the victim turned along the attack? (§8 Q2) | **No, every mark is SCREEN-ALIGNED** (PO 2026-09-28 at the C1 look): *"direction is now given by the lunge ... the two jaws exactly on top of the token, biting down, not direction"*. Asked for the other curves as a choice prompt: all of them, one rule. Reverses the lead default of §3.3. |
| D11 | What draws the wolf's teeth? (§8 Q1) | **Front-view teeth rows, an upper and a lower, biting down** (the first bite; the PO's reference is the Pokemon "Bite" animation, two white rows closing on the target). **`wolf-jaw.png` is regenerated** as the upper row by `tools/make-skill-fx-pilot.mjs`, so the wolves keep an image body (choice prompt 2026-09-28; the lead default, code-drawn teeth, was not taken). |

**The sure list** (put to the PO inside D2's question, not contested): wolf,
alpha wolf, dire wolf (`WolfBite`), elite wolf (`EliteWolfBite`), giant rat
(`RatBite`), spider (`SpiderBite`), boar (`BoarGore`), alpha boar
(`AlphaBoarGore`), bear and dire bear (`BearSwipe`), stag (`StagKick`).

## 3. The design

### 3.1 The `lunge` kind (C1)

```jsonc
{ "kind": "lunge", "on": "hit", "ms": 220 }
```

- **What moves (D9).** The attacker's TOKEN: one container under the group
  holding the portrait (`actualShape`), the tier frame and the species border,
  moved by a local offset along the line from the attacker to the victim. The
  logical position (`shape.position`, written by the interpolation loop) is
  never touched, so the collider, the camera, the health bar, the aura rings
  and the nameplate all stay where the server says the mob is (§4).
- **Translation only.** The portrait rule stands: a mob's medallion never
  rotates (`Mobs.ts:478`), and a lunge does not change that.
- **Distance (D7).** `attacker radius × 0.8 × scale` [PLACEHOLDER], latched
  when the lunge starts. It does not read the gap. The radius is the anchor's
  `radiusPx`, which is `obj.size`: the DRAWN portrait size, rolled per
  instance (wolf 38 to 46 px, bear 70 to 82, boar 46 to 56, stag 42 to 50),
  NOT the collider radius × 120 (36 / 72 / 48 / 42). So a wolf jabs about 30
  to 37 px (measured peak 35.2 px), and two wolves differ slightly; by the
  same rule a bear would jab about 56 to 66 px. Confirmed by C1 (2026-09-27,
  ledger §11 C1) and left as built: the jab follows the size the player sees
  (D7).
- **Direction.** Re-read every frame from the two logical positions, like a
  `strike`'s aim, so the jab follows a victim that moves. When the victim
  despawns mid-lunge the last known position is kept (the manager's anchor
  already does this).
- **Timing.** Total `ms`, default 220 [PLACEHOLDER]. Out over the first 35 %
  with an ease-out (the quick motion), back over the remaining 65 % with an
  ease-in-out (the snap back) [PLACEHOLDER shares]. The CONTACT moment is the
  end of the out phase (77 ms at the default).
- **Implicit sequencing.** The contact moment joins the planner's existing
  arrival rule (`SkillFxPlan.ts` `emit`): `arrival = max(projectile flight,
  strike contact, lunge contact)`. The engine's ring and any `maul` layer of
  the same landing start at the arrival, so the mark appears when the body
  gets there. No `delay` key, as before.
- **Keys.** `kind`, `on`, `ms`, `scale` (multiplies the distance). NOT `body`
  and NOT `tint`: a lunge draws nothing, and a key a kind does not read is a
  hard-fail by the standing rule (`visual.go:171-173`). So the `lunge` row in
  `visualKeysByKind` is written out, not merged from `visualKeysCommon`.
- **Triggers.** `hit` and `applied` (every kind with a victim end takes both,
  `visual.go:200-201`). A `Tick` of an over-time effect plans no authored
  layer, so a poison tick never lunges. An `Immune` or `Absorb` landing still
  lunges (rule 1: `on: hit` draws whatever the HitKind; the attack happened).
- **One lunge per attacker.** One jab per beat, aimed at the first victim,
  should a natural weapon ever land on two: the `cast-pose` rule, with its
  OWN dedup set (§10 L11). A new lunge of an attacker whose previous one is
  still running REPLACES it and restarts from offset zero.
- **Density and budget (D4).** The lunge is exempt from the `off` cut and
  from budget eviction: it costs no fill rate and a lunge evicted mid-flight
  would leave a body parked off its collider. At `off` the planner returns
  the `lunge` layers alone. `low` changes nothing.
- **Legal on any category the trigger table allows.** No extra validator rule
  restricts it to mob skills (YAGNI); no player skill authors one in this
  plan. The seam works for a `Character` (it has `actualShape` too,
  `Character.ts:117`, and gets the same token container around it and its
  border) and the camera follows `shape.position`
  (`Camera.ts:73`, `_GameObject.ts:244`), so an own-character lunge would not
  shake the view. Unseen until somebody authors one.

### 3.2 The body-offset seam, and the amendment to "nothing on the sprite"

`plan-skill-vfx.md` §7.1 rules that the manager parents nothing to an entity
sprite. That holds: nothing new is parented. But a lunge WRITES to a sprite by
definition, so §7.1 gains one named exception:

- `GameObject.setBodyOffset(x, y)`: a no-op on the base class; `Mob` and
  `Character` write the position of the token container (D9: portrait, tier
  frame and species border, §3.1), not `actualShape`'s. `hide()` resets it to
  zero. The damage flash and `getRotationShape()` stay bound to
  `actualShape`.
- `FxAnchor` gains an optional `nudge(dx, dy)`. The manager's `anchorFor`
  implements it through `setBodyOffset`; the preview page's stub tokens
  implement it on their own stand-in. Kinds still know nothing about
  entities.
- **The manager is the only writer.** The execution session greps for any
  other write to `actualShape.position` before building (today there is
  none: it is always (0, 0)), and nothing but `setBodyOffset` writes the
  token container's.

**Reset paths, all four owed:** the lunge ends (exactly zero, not "close"),
the lunge is replaced, the attacker dies or leaves the viewport (`hide()`),
and the manager's `reset()` (the own player's death). A missed one is a mob
drawn permanently beside its collider.

### 3.3 The `maul` kind (C2)

```jsonc
{ "kind": "maul", "on": "hit", "curve": "bite" }
```

- **Where.** Centred on the VICTIM, re-read per frame (the mark stays on a
  victim that walks away), drawn on `layers.skillFx`, which sits above every
  token (`Game.ts:395-420`), so the lunging body never covers it. (Trees
  still draw above mobs, so a mob lunging under a crown stays under it.)
- **Size.** `victim radius × scale`, the first bite's rule.
- **Frame (D10, PO 2026-09-28).** SCREEN-ALIGNED, every curve: the mark
  reads the victim's position and nothing of the attacker's, so it looks the
  same whichever side the hit came from. The lunge alone says who struck.
  (The design as first written drew the mark in the attack frame; the PO
  reversed it at the C1 look.) The fixed orientations below are lead calls,
  [PLACEHOLDER], judged at the C2 look.
- **Curves** (each a pure phase function in `SkillFxMath.ts`, red-first, and
  a code-drawn placeholder tinted by the damage-type palette):

| Curve | Motion | Placeholder | Default ms [PLACEHOLDER] |
| --- | --- | --- | --- |
| `bite` (default) | a row of teeth ABOVE the centre and one BELOW it (screen up and down) close onto the centre, hold shut, then fade (the C2a `snap`: close in the first half, scale 1.3 to 0.55) | two opposing arcs with teeth ticks | 180 |
| `pincer` | today's motion on a fixed frame: one fang hinged on the victim's rim at the screen's LEFT and one at its RIGHT, both gaping toward the top and swinging down to meet at the centre | the tapered wedge pair | 260 |
| `gore` | two short stabs driven in, side by side, on a fixed diagonal | two parallel tapered gashes | 200 |
| `claw` | three rakes on a fixed diagonal, one after the other | three curved parallel slashes | 240 |
| `kick` | one mark punched in (a scale pop), then fade | a hoof print (an open U), upright | 180 |

- **Keys.** The common keys plus `ms` and `curve`.
- **Triggers.** `hit` and `applied`.
- **Density and budget.** Dressing, like every authored layer: hidden at
  `off`, inside the Fx cap.
- **The ring (D6).** Rule 5 is unchanged: the engine's round mark draws on
  every landed Damage or Crit hit, under the maul, at the same arrival.
- **`strike` loses `bite` and `pincer`** and is again only a held weapon from
  the attacker (`thrust`, `swing`, `overhead`). A file that still authors
  `strike` `bite` hard-fails at load, so content and code land together (the
  §12g.2 precedent). The rim-bite maths (`biteHingePoint`, `biteLengthPx`,
  `BITE_LENGTH_FACTOR`, `BITE_MIN_LENGTH_PX`) is deleted; the pincer maths
  moves with its curve.
- **Art (D11, PO 2026-09-28).** `spider-fang.png` keeps working (the
  pincer's contract does not move: one fang, hinge on the left edge, the
  engine mirrors it). The `bite` gets a NEW contract: the artist draws the
  UPPER row of teeth seen from the front, teeth pointing down, anchor
  bottom-centre on the bite line; the engine mirrors it for the lower row.
  The shipped `wolf-jaw.png` (a tapering snout hinged at its left edge, drawn
  for the rim bite) is REGENERATED to that contract by
  `tools/make-skill-fx-pilot.mjs`, and the wolves keep `body: wolf-jaw`. The
  art spec, `assets.md` and `assets.csv` move with it. ⚑ `wolf-jaw` is P0 on
  the artist's list: a drawing started under the hinge contract is void.

### 3.4 Content

**C1, ten files** (`api/skills/mobs/`), all values [PLACEHOLDER]:

| Skill file | Today | After C1 |
| --- | --- | --- |
| `wolf-bite`, `elite-wolf-bite` | `strike` `bite`, body `wolf-jaw` | + `lunge` (the rim bite stays until C2) |
| `rat-bite`, `spider-bite` | `strike` `bite` | + `lunge` |
| `boar-gore` | `strike` `thrust` (a spear) | `lunge` alone |
| `alpha-boar-gore` | `strike` `thrust`, `scale` 1.6 | `lunge` alone, `scale` 1.6 kept on the lunge |
| `bear-swipe` | `strike` `swing` (a blade) | `lunge` alone |
| `stag-kick` | `strike` `thrust` | `lunge` alone |
| `companion-aura` | `strike` `thrust` | `lunge` alone |
| `giant-venom-spit` | `projectile` on `applied` + `strike` `pincer` on `hit` | + `lunge` on `hit`; the spit is untouched |

**C2, eleven files** (six swap `strike` for `maul`, five gain a `maul`
beside their lunge):

| Skill file | After C2 | Change |
| --- | --- | --- |
| `wolf-bite`, `elite-wolf-bite` | `lunge` + `maul` `bite`, body `wolf-jaw` KEPT (D11, the regenerated front-view row) | swap |
| `rat-bite`, `spider-bite` | `lunge` + `maul` `bite` (no body, the code-drawn teeth) | swap |
| `giant-venom-spit` | `projectile` on `applied` + `lunge` + `maul` `pincer`, body `spider-fang`, white tint | swap |
| `saber-tooth-cat-aura` (retired, on disk) | `maul` `bite`, forced by the validator; no lunge | swap |
| `boar-gore`, `alpha-boar-gore` | `lunge` + `maul` `gore` | gain |
| `bear-swipe` | `lunge` + `maul` `claw` | gain |
| `stag-kick` | `lunge` + `maul` `kick` | gain |
| `companion-aura` | `lunge` + `maul` `bite` (its authoring note calls the attack a bite) | gain |

**Not touched:** the kobold (D2), `spike-barricade-aura` (a place, its spike
is a `thrust`), every weapon wielder (orc, bandit, soldier, troll, warlord),
the three other retired auras (`dodo-aura`, `mammoth-aura`,
`angry-mammoth-aura` keep their `thrust`; no mob carries them).

⚑ **An editor change outranks these tables** (PO 2026-09-25): if a roster
skill's `visual` was changed in the editor before the chunk runs, keep the
PO's layer and add the new one beside it; flag the conflict once.

## 4. Current state, facts this plan stands on (verified 2026-09-27)

- **The wire already carries the hit.** `SkillEvent { source, victim,
  skill_id, amount, kind, fired, phase }` on `GameState.skill_events`
  (`api/schema/server.fbs`), noted inside the four damage and heal funnels.
  The client decodes it in `GameStateMessage.ts` `unmarshalSkillEvents` and
  hands EVERY event (own and others) to `SkillFx.onSnapshot`
  (`Backend.ts` `feedSkillFx`).
- **A mob attack is an aura tick**, not a cast: `SkillSystem.processEntity`
  fires the effect when `TickAccumulator % EffectiveTickInterval == 0`
  (`sys/skills.go`), the hit target is the NEAREST in the aura, not the aggro
  pick (`sys/targeting.go` `selectTargets`), one target per attack by the
  2026-09-19 ruling. Nothing here changes.
- **Cadence leaves room.** The fastest natural weapon is the rat (22 ticks,
  733 ms); a 220 ms lunge fits three times.
- **The body is isolated.** `moveInterpolatedObjects` writes only
  `shape.position` (`_GameObject.ts:558-598`). `Mob.initShape`
  (`Mobs.ts:429-446`) builds `shape` (the group) with `actualShape` (the
  portrait), the tier frame (`Mobs.ts:440-443`), the aura rings and the
  overhead bar as siblings, and the species subclasses add their border
  (`withBorder`, `Mobs.ts:71-78`) to the same group, a sibling too. D9 groups
  the portrait, the tier frame and the border into one token container.
  The nameplate lives on another layer and copies `shape.position`
  (`Mobs.ts:282`). The damage flash is bound to `actualShape`
  (`Mobs.ts:498`), so an attacker hit mid-lunge flashes where its body is.
- **The manager reads logical positions.** `anchorFor` answers
  `obj.shape.position` and `obj.size` (`SkillFx.ts:458-480`), so every other
  Fx anchored at a lunging attacker stays on its logical position.
- **The vocabulary is closed in five places**: the Go tables
  (`skills/visual.go:126-266`), the generated fixture
  (`api/skill-vocabulary.json`, written by `vocabulary_test.go`), the client
  registry (`SkillFxKinds.ts` `KIND_REGISTRY`, pinned both ways by
  `SkillFxKinds.test.ts`), the editor (`tools/content-editor/`
  `skill-visual-hints.mjs`, `public/app.js`, `smoke.mjs`) and the preview
  gallery (`SkillFxPreview.ts` `GALLERY_LAYERS`, typed
  `Record<VisualKind, VisualLayer>`).
- **The first bite** was `impact` `snap`: *"two opposing jaw arcs above and
  below the victim's centre"*, closed by scaling the body down
  (`512d4afd:SkillFxBodies.ts` `drawImpactSnapPlaceholder`, `SkillFxMath.ts`
  `impactPhase`). Seven skills authored it: wolf, elite wolf, spider,
  saber-tooth cat, bear, boar, dodo. It is a quarry for C2's `bite`.
- **At `off` the planner returns before anything is planned**
  (`SkillFxPlan.ts:175-177`), deliberately before the seed counter moves.

## 5. Schema impact (stated per the standing rule)

| Surface | Impact |
| --- | --- |
| Database | NONE |
| Wire (FlatBuffers) | NONE |
| `conf.json` | NONE |
| Visual vocabulary | C1: +1 kind (`lunge`), its keys and triggers rows. C2: +1 kind (`maul`), +1 curve row (five curves), `strike`'s curve row loses `bite` and `pincer`. The fixture is regenerated each time. |
| HTTP skill catalog | no field change (`visual` is already served; its content differs) |
| Content | C1: 10 skill files. C2: 11 (6 swap `strike` for `maul`, 5 gain a `maul`). Embedded copies via `cp-defs`. |
| Pins | skill registry stays 121; no Tiled palette change (no new skill file); no census change (no new mob). |

## 6. Interplay

- **Aura drawbacks C2 (stun).** A stunned mob fires nothing, so it emits no
  hit event and cannot lunge. No rule needed.
- **Line of sight, darkness.** The lunge moves a sprite that darkness already
  covers or does not; nothing new.
- **Entity presentation (`plan-entity-presentation.md` §39).** Its objection
  was a seventh independently anchored overlay. The lunge adds no overlay and
  parents nothing; it moves the one node §39's medallion refactor already
  treats as the body.
- **Sound.** Out of scope. `MobJuice`'s hit sound is not wired today
  (`plan-skill-vfx.md` §7.5).
- **The simulation and the sim harness** never read `visual`. Guardrails and
  batteries are untouched.
- **The phone check** (`plan-skill-vfx.md` §9) is not blocked and not
  changed: C1 removes five `strike` spawns and adds no drawn Fx; C2 swaps a
  `strike` for a `maul` one for one. No `skill-fx-scale.mjs` rerun is owed.

## 7. Chunk breakdown

### C0, inside C1: the docs amendment (first task of the session)

`plan-skill-vfx.md` §4.1 (kinds seven to eight, then nine at C2), §7.1 (the
body-offset exception, §3.2 here), §12h.1 call 3 (a pointer: the lunge is
scheduled here, the rim bite retires at C2); `manual-content-authoring.md`
Visuals section (the natural-weapon idiom: `lunge` plus `maul`, never a
`strike`); the `add-content` skill; `docs/art/skill-vfx-asset-spec.md` (C2:
the `strike` `bite` rows and §7's wanted list move to `maul`; `tusk` and
`claw` become `maul` bodies).

### C1: the lunge (§3.1, §3.2)

1. Go, red-first: `lunge` loads on `hit` and `applied`; `body`, `tint`,
   `curve` on a lunge are refused; an authored `ms` of zero is refused (the
   standing rule); the fixture pin.
2. `SkillFxMath.ts`, red-first: the lunge phase (offset share over time,
   zero at both ends, the contact moment), the distance rule.
3. `SkillFxPlan.ts`, red-first: the lunge contact feeds `arrival`; one lunge
   per `castKey`; at `off` the plan holds the lunge layers and nothing else;
   a `Tick` plans no lunge.
4. The seam: `setBodyOffset` on `GameObject` / `Mob` / `Character`,
   `FxAnchor.nudge`, the four reset paths.
5. The manager: lunges kept per attacker outside the budgeted list; replace
   on re-entry; untouched by `applyDensity`'s `off` sweep.
6. Registry, editor hints, editor smoke, the preview gallery (eight kinds)
   and its stub tokens.
7. Content: the ten files of §3.4, `cp-defs`.

**In-game checklist (PO look, GOD on is fine, nothing here is CC):**
a wolf's token jabs at the player on every bite and returns; four wolves,
each jabs from its own side; the health bar, ring and nameplate of a lunging
mob do not move, while its tier frame and species border travel with the
portrait (D9); the boar, bear and stag show no spear and no
blade; the companion jabs at its target; the giant spider jabs AND still
spits; a mob killed mid-lunge leaves nothing behind; density `off`: the jab
still plays, no jaws, no ring.

### C2: the maul (§3.3)

**Carried from C1 (ledger §11 C1):** the token container exists (Mob and
Character; `setBodyOffset` writes it, `withBorder` finds it by label), so a
`maul` needs no seam work on the attacker. `skill-fx.mjs` needs the DEBUG
zone set (`./scripts/dev-restart.sh server debug`); on the main world leg 1
goes inconclusive and gates the rest.

1. Rule §8 Q1 and Q2 with the PO at the session start.
2. Go, red-first: `maul` loads with each of the five curves; `strike` `bite`
   and `strike` `pincer` are refused, naming the new home; the fixture pin.
3. `SkillFxMath.ts`, red-first: the five phase functions; the rim-bite maths
   deleted with its tests.
4. `MaulFx` in `SkillFxKinds.ts`, the placeholders in `SkillFxBodies.ts`;
   `StrikeFx` loses its jaw fork.
5. Planner: a `maul` starts at the landing's arrival (with the ring).
6. Registry, editor, smoke, the gallery (nine kinds).
7. Content: the eleven files of §3.4's C2 table; the art spec and the
   wanted list.

**In-game checklist (PO look):** teeth snap shut ON the player when a wolf
bites, as the jab arrives; the boar leaves a gash, the bear a rake, the stag
a hoof; the giant spider's white fangs still close from both sides; the round
mark still draws under each (D6, the PO's call to keep or drop on sight);
density `off`: jab only.

### Verify tail, every chunk

`go build ./...` · `go test -count=1 ./...` (the known-red placement pins
stay as found) · `-validate` 0 findings, embedded and with
`-content ../api` · frontend `npm test` + `npm run typecheck` · editor smoke
0 problems · `skill-fx.mjs` (new legs below) · `skill-fx-preview.mjs` · a
real boot and join with a clean log (the wire is untouched, so no wire prune
is owed) · screenshots looked at · the PO look.

New `skill-fx.mjs` legs. C1: within a bite's `ms` the wolf's body offset is
non-zero and its `shape.position` equals the snapshot's; after `ms` the
offset is exactly zero; at `off` the offset still moves and no Fx spawns.
C2: a wolf bite spawns one `maul` and one ring at the contact moment; the
old rim-bite leg (leg 14) is rewritten.

## 8. Open questions (carried, not blocking C1)

1. **The `bite`'s art contract. RULED 2026-09-28, D11: (a), and
   `wolf-jaw.png` is regenerated, the wolves keep their `body`.** The
   question as it stood: (a) Front-view teeth rows, the first bite: the artist draws the
   UPPER row, anchor bottom-centre on the bite line, the engine mirrors it
   below; `wolf-jaw.png` is regenerated by `tools/make-skill-fx-pilot.mjs` or
   the wolves drop `body` and draw the procedural teeth. (b) Keep the hinged
   jaw pair and its PNG contract, moved from the rim to the victim's centre:
   no art churn, but it reads as a snout in profile, not as "teeth appear".
   ⚑ `wolf-jaw` is P0 on the artist's wanted list: if drawing has started
   under the hinge contract, say so before ruling. Lead default: (a), the
   wolves drop `body` until new art exists.
2. **Attack frame or screen-aligned** for the maul (§3.3). **RULED
   2026-09-28, D10: screen-aligned, every curve.** (The lead default was the
   attack frame.)
3. **The kind's name.** `maul` is a working name the PO selected with the
   option; renaming is free until C2 ships and a vocabulary change after.
4. **Does the ring stay under the maul?** D6 says yes for consistency; the
   C2 look is where it is seen for the first time.
5. **The lunge numbers** (distance 0.8, 220 ms, the 35 / 65 split): tuned by
   the PO at the C1 look, in the editor where the key exists (`ms`, `scale`)
   and in code where it does not. ⚑ Since C1 (2026-09-27) that look also
   owes a judgement on the OVERLAP at melee range: the jab covers most of the
   gap and the attacker's medallion overlaps the victim's token (§3.1, the
   drawn size is larger than the plan assumed).

6. **The fixed orientations under D10** (§3.3's curve table). The PO ruled
   screen-aligned and described the bite (rows above and below, biting
   down). The rest is the lead's reading: the pincer's fangs at the screen's
   left and right, gaping toward the top (the shipped pincer gaped toward the
   attacker); the diagonal of the gore and of the claw; the upright hoof.
   Judged at the C2 look.

## 9. Proposals adopted without a choice prompt (PO may veto any)

- The plan is its own doc, not a §12i of `plan-skill-vfx.md` (that file is
  3700 lines and parked on the phone check).
- A lunge draws nothing, so `body` and `tint` are refused on it.
- `hit` and `applied` for both kinds, by the standing rule for kinds with a
  victim end.
- An `Immune` or `Absorb` landing still lunges and still mauls (rule 1 as it
  stands for every authored `hit` layer).
- One lunge per attacker at a time; a new one replaces the running one.
- The lunge is exempt from the Fx budget.
- Retired skills are touched only where the validator forces it
  (`saber-tooth-cat-aura`).
- `alpha-boar-gore` keeps its `scale` 1.6 on the lunge (a bigger jab for the
  bigger boar).
- No validator rule ties `lunge` to mobs.

## 10. Landmines

- **L1, the closed vocabulary has five homes** (§4). A kind added to four of
  them loads clean and draws nothing, or reddens a pin with a message that
  names the wrong file. Regenerate the fixture, do not hand-edit it.
- **L2, a stuck offset.** Any reset path missed (§3.2) parks a body beside
  its collider for the rest of its life. The harness leg asserts EXACT zero.
- **L3, the `off` early return.** The exception must keep the property the
  early return protects: a session at `off` must not advance `seedCounter`
  for swings it never drew. A lunge reads no seed (it has no sweep side), so
  at `off` the lunge layers are planned with a constant seed and the counter
  is left alone. Nothing more elaborate is needed.
- **L4, C2 removes two curves.** Every file authoring `strike` `bite` or
  `pincer` hard-fails at boot, the retired saber-tooth cat included. Grep
  `api/skills` AND the embedded copies before the first boot.
- **L5, content and the test cache.** A content edit does not invalidate the
  Go test cache (`-count=1`), and without `-content ../api` the embedded copy
  is read (`make -C backend build`).
- **L6, the headless clock.** A hidden Playwright page throttles rAF to about
  6 fps; shim rAF onto `setTimeout` or a 220 ms motion is never sampled.
- **L7, the fixed jab does not reach (D7, by ruling).** The giant spider
  bites at 1.6 u; its jab ends far short of the victim and the maul marks the
  hit. Not a defect.
- **L8, harness counters.** Legs that count `strike` spawns at the boar, the
  bear or the wolf change their expected numbers (C1 removes five strikes,
  C2 the rest).
- **L9, `InteractBadge`** is constructed with both `shape` and `actualShape`
  (`Mobs.ts:334`). Verify which one it parents to; NPCs do not attack, so a
  badge riding a lunge is unlikely but unverified.
- **L10, the preview page uses the real renderer** with stub tokens
  (`SkillFxPreview.ts`). A lunge previewed on a stub without `nudge` shows
  nothing and looks like a broken kind.
- **L11, the lunge does NOT share the `posed` set.** `emit` deduplicates a
  `cast-pose` on the bare `castKey` (`SkillFxPlan.ts:344-349`). A lunge
  pushed through the same set would be dropped, or would drop the pose, on
  any skill that authors both: same key, first kind wins, in silence. Use a
  second set or key on `castKey` plus the kind.

## 11. Chunk ledgers

### C1: the lunge (built 2026-09-27, `413a7fd4`, PO look 2026-09-28 "works")

Built from an execution brief the lead wrote: Opus agents executed five
packages (the Go vocabulary and fixture first; then the client, the docs, and
the editor plus content in parallel on disjoint file lists; then the harness
and the verify tail), and the lead reviewed every diff. D9 (§2) was taken as a
choice prompt at the session start.

**Built:**

- **The kind** `lunge`, the eighth visual kind: the attacker's token jabs a
  fixed distance toward the victim and snaps back, 220 ms default, 35 % out
  (ease-out) and 65 % back (ease-in-out), all [PLACEHOLDER]. It draws
  nothing. Keys `kind`, `on`, `ms`, `scale`; `body`, `tint` and `curve` are
  refused at load. Moments `hit` and `applied`. Vocabulary: +1 kind, its keys
  row and its triggers row, fixture regenerated.
- **Density and budget (D4):** it plays at VFX density `off`, sits outside the
  Fx budget, one per attacker at a time; a new one replaces the running one
  from offset zero. At `off` the planner runs a separate small function,
  `planLungesOnly`, which plans the lunge layers alone at seed 0 and never
  moves `seedCounter` (L3).
- **Sequencing:** the engine's hit mark waits for the lunge's contact moment,
  `arrival = max(projectile flight, strike contact, lunge contact)`.
- **The token (D9):** the WHOLE token moves (portrait, species border and
  tier frame), as one intermediate `token` container under the group.
  `withBorder` finds it by label, so none of the roughly 25 species call sites
  changed. The damage flash and `getRotationShape()` stay on `actualShape`.
- **The seam** (§3.2): `GameObject.setBodyOffset(x, y)` (a no-op on the base
  class; `Mob` and `Character` write the token container),
  `GameObject.bodyOffset()`, and `FxAnchor.nudge?`. The manager (`SkillFx`)
  is the only writer. All four reset paths (the lunge ends, the lunge is
  replaced, the attacker is hidden, the manager's `reset()`) end in
  `LungeFx.dispose()`, which writes exact zero; `Mob.hide()` and
  `Character.hide()` also zero it.
- **Content**, ten files in `api/skills/mobs/` (+ embedded copies via
  `cp-defs`), every lunge authoring `"ms": 220`: `wolf-bite`,
  `elite-wolf-bite`, `rat-bite` and `spider-bite` gain the lunge FIRST and
  keep their `strike` `bite` until C2; `boar-gore`, `bear-swipe`,
  `stag-kick` and `companion-aura` replace their borrowed `strike` with the
  lunge alone; `alpha-boar-gore` the same with `scale` 1.6 kept;
  `giant-venom-spit` gains the lunge between the spit and the fangs.
- **Editor:** the smoke's kind pin 7 → 8; a layer row of a kind that does not
  read `tint` shows no colour swatch, and one that does not read `body` shows
  no body picker, both decided from the vocabulary's key row
  (`kindReadsTint`), never from a kind name; hints (1) and (2) skip such a
  kind.
- **Dev surfaces for the harness:** `skillFx()` gains `lunges` (the live
  count) and `lungeNudges` (non-zero offsets written since page load,
  monotonic); a new console command `bodyOffsets()` lists every held game
  object whose token is not at exactly (0, 0).
- **Docs amended in the build (C0):** `plan-skill-vfx.md` §4.1 (eight kinds)
  and §7.1 (the one named exception); `manual-content-authoring.md` Visuals
  (the `lunge` kind, and the natural-weapon rule replacing "an animal's attack
  is a strike too"); the `add-content` skill; this plan's D9 row and §3.1,
  §3.2, §4 and the §7 C1 checklist.

**Deviations from the plan text:**

1. D9: the whole token moves, not `actualShape` alone (§3.1 as first written).
2. One lunge per ATTACKER (a set keyed by the source id), not per `castKey`
   as §7 step 3 words it. No content can show the difference today.
3. A lunge entry's `from` is always the source, a chain hop included.
4. The harness surface: `lunges`, `lungeNudges`, `bodyOffsets()`, none of
   them named by the plan.
5. §7's C1 leg asked that a lunging mob's `shape.position` equal the
   snapshot's. The harness cannot assert that (`window.game` exposes no
   entity map); it asserts the group position bit-identical across standing
   jabs instead, and says so.

**Findings:**

- ⚑ **A plan that names a sprite node must list that node's SIBLINGS.**
  `actualShape` is the portrait alone; the plan's own sibling list (§4) missed
  the species border. Caught by the review of the execution brief before any
  client code was written, and ruled as D9.
- ⚑ **`FxAnchor.radiusPx` is `obj.size`, the DRAWN portrait size rolled per
  instance** (wolf 38 to 46 px, bear 70 to 82, boar 46 to 56, stag 42 to 50),
  NOT the collider radius × 120 (36 / 72 / 48 / 42). So a wolf jabs 30 to
  37 px, not the plan's 29, and two wolves differ slightly. Left as built: the
  rule follows the size the player sees (D7); §3.1 is corrected. At melee
  range the jab covers most of the gap and the medallion overlaps the
  victim's token: §8 Q5's tuning, owed to the PO's look (`ms` and `scale` in
  the editor, the 0.8 factor in code).
- ⚑ **`skill-fx.mjs` NEEDS THE DEBUG ZONE SET**
  (`./scripts/dev-restart.sh server debug`). The rebuilt 500×500 main world
  has no camp at any of the harness venues; on it leg 1 stands on empty
  grass, sees 0 skill events and goes INCONCLUSIVE, which gates every later
  leg. C1 exposed this, it did not cause it. Other verify harnesses may be
  stale the same way: UNCHECKED.
- ⚑ **The game-object seam has no unit test of its own:** importing
  `_GameObject.ts` under vitest pulls in the ground-texture loader
  (`require.context is not a function`). The manager-level tests cover it on
  stubs, the harness proves the real node. A follow-up could move the three
  token helpers into a pure module.
- One preview page error, once: `Cannot read properties of null (reading
  'split')` in the gallery while a second Chromium was starting; four reruns
  clean, no stack captured. It matches the lost-WebGL-context signature of
  backlog §29. Cause unproven, not a C1 finding.
- `SkillFxStress.eventLifetimeMs` counts a lunge's duration although a lunge
  is unbudgeted, so the C4 live estimate overstates slightly. Commented and
  left.

**Verify (2026-09-27):** `go build ./...` OK · `go test -count=1 ./...` 34
packages ok with the DB tests against `aura_test`, red only the two known at
HEAD (the three `cmd/simharness` placement pins, `pkg/aura/world`
`TestPropContent_C1bMigrationPreservesLookAndCollision`) · `aurad -validate`
0 findings embedded and with `-content ../api` · frontend `vitest`
**1220 passed / 0 failed** (baseline 1179, +41), `typecheck` clean · editor
`smoke.mjs` 0 findings (121 skill files, 131 visual layers, 8 kinds) ·
`skill-fx.mjs` **PASS, 0 fail, 0 inconclusive, 21 legs, ON THE DEBUG ZONE
SET** · `skill-fx-preview.mjs` **PASS 16/16** (eight gallery slots; the lunge
slot moved its caster's stand-in) · a real boot and join: clean log, content
source `../api`, 121 skills, 77 mobs, 12 factions · screenshots looked at by
the lead: mid-jab, three wolves have the whole medallion (face and species
border) displaced toward the player, each from its own side, while every
health bar, plate and aura ring stays; at rest every token is home · a
mutation check: emptying `LungeFx.dispose()` reddened 5 tests.

**The new and changed harness legs:** leg 20 (new, at the wolf camp): 20a a
wolf fight at `full`, 54 lunges for 44 wolf bites, 91 nudges, a token off
zero in 25 of 35 in-page samples, peak 35.2 px, 8 standing jabs with the
group position bit-identical; 20b every body at exactly (0, 0) 548 ms after
the fight; 20c density `off`, 42 lunges, 45 nudges, no other kind spawned,
`live` 0 in all 28 samples. Leg 17 also asserts the giant spider's lunge (16
lunges, 41 nudges for 13 bites). Leg 10's `off` sum now exempts `lunge` (16
lunges at the kobold camp at `off`).

**Schema:** DB NONE · wire NONE · conf NONE · vocabulary +1 kind (`lunge`),
its keys row and triggers row, fixture regenerated · content 10 skill files
(+ embedded copies) · no new skill, mob or effect type: registry pin stays
121, no Tiled palette change, no census change.

**Owed:** the PO's look. Five lines of the §7 C1 checklist were not proven by
the harness and stay owed to the PO's eyes:

1. Four wolves from four sides (a screenshot shows three).
2. The tier frame travelling with the portrait (needs an elite or a boss; the
   camp wolves are normal tier).
3. The boar, bear and stag showing no spear and no blade.
4. The companion jabbing at its target.
5. A mob killed mid-lunge leaving nothing behind.

Also owed to that look: §8 Q5, the lunge numbers and the overlap at melee
range (Findings).

**PO verdict 2026-09-28: "works."** Looked on the debug zone set (wolves,
elite wolves, boar, bear, stag, the companion). No change to the lunge
numbers or the melee overlap was asked for (§8 Q5 stays [PLACEHOLDER]). The
same look ruled D10 and D11 for C2. (The wrap, the commit and the push of
2026-09-27 went out before any look.)

### C2: the maul (built 2026-09-28, `274a6d07`, PO look 2026-09-28 "works")

Built by one Opus agent from the lead's execution brief; D10, D11 and §8 Q6
were ruled before the session (§2, §8).

**Built:**

- **The kind** `maul`, the ninth visual kind: the natural weapon's mark drawn
  ON the victim, centred on it, re-read per frame, SCREEN-ALIGNED (D10: no
  phase function takes an attacker). Keys: the common ones plus `ms` and
  `curve`; moments `hit` and `applied`. Five curves, each a pure phase
  function in `SkillFxMath.ts` (`bitePhase`, `pincerPhase`, `gorePhase`,
  `clawPhase`, `kickPhase`, dispatched by `maulPhase`), all numbers
  [PLACEHOLDER]:
  - `bite` 180 ms: an upper row of teeth above the centre and the same row
    mirrored below, closing onto the centre in the first half (ease-out, the
    C2a snap), a 1.3 to 1 pop while closing, then a fade. Row width 1.6 x the
    mark size.
  - `pincer` 260 ms: a fang hinged on the victim's rim at screen left and its
    mirror at screen right, gaping 35 degrees toward the top, swinging down
    (ease-in, the shipped pincer's timing) until the points meet on the centre
    (fang length = the mark size).
  - `gore` 200 ms: two gashes side by side (0.36 apart) on a fixed diagonal
    rising to the upper right (-45 degrees), driven in over the first 35 %.
  - `claw` 240 ms: three rakes (0.34 apart) on the other diagonal (+45
    degrees), each starting 12 % after the last and drawn over 30 %.
  - `kick` 180 ms: one upright hoof print (an open U) popping 1.5 to 1.
  The mark size is `maulSizePx` = max(12 px, the victim's radius) x `scale`.
- **`MaulFx`** (`SkillFxKinds.ts`): one body per part, a PNG or its
  placeholder, one code path for both (the phase moves, turns, stretches and
  mirrors each part). Sprite anchors per curve: `bite` (0.5, 1), `pincer`
  (0, 1), `gore` and `claw` (0, 0.5), `kick` (0.5, 0.5). Five code-drawn
  placeholders in `SkillFxBodies.ts` (a front-view teeth row, the old jaw
  wedge now as the pincer's fang, a gash, a rake, a hoof), tinted by the
  damage-type palette.
- **`strike` is a held weapon again**: `StrikeFx` lost its jaw fork; the rim
  bite maths (`biteHingePoint`, `biteLengthPx`, `BITE_LENGTH_FACTOR`,
  `BITE_MIN_LENGTH_PX`, `BITE_OPEN_RAD`, `pincerHingePoints`, `biteJawScale`)
  is deleted with its tests. The loader refuses `strike` `bite` and `strike`
  `pincer` with a message naming the `maul`.
- **Planner:** a `maul` starts at the landing's arrival, beside the engine's
  mark (on a skill that lunges, the lunge's contact moment; on the saber-tooth
  cat, at once). Not deduplicated (every victim bears its own), never through
  the `posed` set (L11). Hidden at `off` and budgeted like every authored
  layer. `SkillFxStress.eventLifetimeMs` counts its duration plus the arrival
  it waits for.
- **Art (D11):** `wolf-jaw.png` regenerated by `tools/make-skill-fx-pilot.mjs`
  as the front-view UPPER ROW, 128 x 44 [PLACEHOLDER] (was 128 x 48, the hinged
  snout), bottom edge = bite line, mirror-symmetric; the script gained a `row`
  anchor check. `sword`, `arrow` and `spider-fang` came out byte-identical
  (md5 checked). `docs/art/skill-vfx-asset-spec.md` (§1, §4 table and
  diagrams, §5, §7 rows and notes, §8, §9, §11 item 4), `assets.csv` (the
  `wolf-jaw`, `spider-fang`, `tusk`, `claw` rows) and the regenerated
  `assets.md` moved with it. Gore and claw bodies are specified as ONE stroke
  drawn two or three times (starts at the left edge, points right); the kick
  as a centred upright print.
- **Content**, eleven files (+ embedded copies): `wolf-bite` and
  `elite-wolf-bite` `maul` `bite` body `wolf-jaw`; `rat-bite`, `spider-bite`,
  `saber-tooth-cat-aura` `maul` `bite`; `giant-venom-spit` `maul` `pincer`
  body `spider-fang`, tint white; `companion-aura` `maul` `bite`;
  `boar-gore` and `alpha-boar-gore` `maul` `gore`; `bear-swipe` `maul`
  `claw`; `stag-kick` `maul` `kick`. The swapped layers dropped their old
  `ms` (200, and 260 on the pincer) for the curve defaults. No editor
  conflict: every roster file matched §3.4's "After C1" column.
- **Vocabulary homes (L1):** `visual.go`, the regenerated fixture, the client
  registry and its both-ways pin, the editor (smoke kind pin 9, comments,
  hints), the preview gallery (nine slots, the maul on the slot's victim
  stand-in). Docs: `manual-content-authoring.md` Visuals, the `add-content`
  skill, the verify skill's rows.
- **Harness `skill-fx.mjs`:** the rim-bite jaw probe is replaced by a maul
  probe (rows and fangs at the own player, in player-size units). Leg 14
  rewritten: one maul and one mark per landing (exact on a gap-free census),
  the wolves' mauls on the sprite path, the rows centred, unturned, upper
  above and mirrored lower below, 1.6 sizes wide. Leg 17: the fangs hinged at
  screen left and right, gaping toward the top, one size long. Legs 13a, 13b
  and 17 bound sprites by strikes plus mauls (L8, re-derived from
  `api/skills`); leg 0 counts mauls; leg 20c names the maul.

**Findings:**

- ⚑ **A body named `maul` is on the artist's wanted list** (art spec §7: the
  TrollSmash / WarlordCleave overhead weapon). Same word as the new kind; §8
  Q3 says the kind's name is free until C2 ships. Not renamed; the PO's call.
- ⚑ **C0 promised the art spec's move to `maul` in C1; it had not happened.**
  C2 carried it whole.
- `plan-skill-vfx.md` §4.1 said eight kinds when the build ended (the brief
  allowed the agent no edit to another plan doc). The lead amended it the
  same day: nine, with the `maul` row.
- ⚑ **`content-editor-skills-tab.mjs` has been stale since C1**: it expects
  the WolfBite look block to have ONE row and saves `ms` onto layer 0, which
  has been the lunge since C1. Not run, not changed here.
- The quoted snap numbers (scale 1.3 to 0.55) do not transfer: in the first
  bite the SCALE was what closed the arcs, while two rows held by their bite
  lines close by their GAP. Kept: close in the first half, ease-out; the scale
  is only a 1.3 to 1 pop.
- The pincer's fang length went from max(20 px, 0.8 r) to r x `scale`: on a
  rim hinge only a fang as long as the radius meets its twin at the centre.
- Bears live in the dark caves of the debug world, and skill FX draw below
  darkness, so a bear's claw on the player is invisible there (the player's
  own light is 40 px). Photographed on a dire bear in daylight instead.
- Line references corrected in this doc: `Game.ts:395-420`,
  `SkillFx.ts:458-480`, `skills/visual.go:126-266`, `SkillFxPlan.ts:175-177`
  and `:344-349`.

**Verify (2026-09-28):** red first: `visual_test.go` (StrikeCurves, Maul,
seven refusal cases, the nine PO examples, Applied) and the whole
`SkillFxMath.test.ts` suite (it failed to load on the missing maul exports),
then the planner's two arrival tests; the client registry pin and the
editor smoke went red on the regenerated fixture before the registry moved ·
`go build ./...` OK · `go test -count=1 ./...` 35 packages ok with the DB
tests against `aura_test`, red only the ones red at HEAD (proved on a clean
HEAD worktree): the three `cmd/simharness` placement pins and `pkg/aura/world`
`TestPropContent_C1bMigrationPreservesLookAndCollision` · `aurad -validate`
0 findings embedded, with `-content ../api`, and both with `-debug-zones` ·
frontend `vitest` **1407 passed / 0 failed** (baseline 1384), `typecheck`
clean · editor `smoke.mjs` 0 findings (121 skill files, 136 visual layers, 9
kinds), `save-skill.test.mjs` and `aurad-validate.test.mjs` 0 findings ·
`skill-fx.mjs` on the debug zone set: run 1 INCONCLUSIVE at leg 2 (the
kobold camp saw 1 skill event, a starved venue, which gated the rest); run 2
**PASS, 63 PASS lines, 0 fail, 0 inconclusive** (leg 14: 58 mauls, 58 marks,
58 lunges, 47 sprites; rows dx 0, rotation 0, upper dy -0.29..0, lower
0..0.29, width 1.6..1.83; leg 17: fangs at dx -1 and +1, dy 0, left
-0.61..0 rad, right 3.14..3.75 rad, length 1; the one-per-landing equalities
were NOT scored, 13 and 9 census gaps) · `skill-fx-preview.mjs` PASS 16/16
three runs out of four; the other run hit the known `Cannot read properties
of null (reading 'split')` page error while a production build ran beside it
(C1's finding, cause unproven) · a real boot and join (the harness): content
source `../api`, 121 skills, 77 mobs, no error or warning in the server log ·
screenshots looked at by the agent: the wolf's teeth rows closing on the
player, a boar biting and being gored in a mob fight, the dire bear's three
rakes on the player, the giant spider's white fangs, and every curve large in
the preview page.

**Re-run by the lead (2026-09-28, the same tree):** `go build ./...` OK ·
`go test -count=1 ./...` 35 packages ok, red only the same four tests in
`pkg/aura/world` and `cmd/simharness` · `-validate` 0 findings, all four ways
· `vitest` 1407 / 0, `typecheck` clean · editor `smoke.mjs` and
`save-skill.test.mjs` 0 findings · `skill-fx-preview.mjs` PASS 16/16 ·
`skill-fx.mjs` twice: run 1 53 PASS / 0 fail, INCONCLUSIVE at leg 17 alone
(no giant spider bite landed in the window), run 2 **PASS, 63 / 0 / 0**
(leg 14: rows dx 0, rotation 0, upper dy -0.35..0, lower 0..0.35; leg 17:
fangs at dx -1 and +1). ⚑ Across the four runs of the day the harness passed
twice and went inconclusive twice, each time on a starved venue, never on a
failed assertion. `harnessdb -cleanup` removed 13, with `aurad` stopped.

**Schema:** DB NONE · wire NONE · conf NONE · vocabulary +1 kind (`maul`), +5
curves, `strike` loses `bite` and `pincer`, fixture regenerated · content 11
skill files (+ embedded copies) · no new skill, mob or effect type: registry
pin stays 121, no census change · art: `wolf-jaw.png` regenerated.

**Owed:** the PO's look (the §7 C2 checklist, §8 Q4 the ring under the maul,
§8 Q6 the fixed orientations, the numbers above). Not proven by the harness:
the "at the contact moment" timing (the planner test proves it; a headless
frame is too coarse), the stag's kick in-game (a stag flees and was never
provoked into kicking; seen only in the preview page), density `off` with a
maul skill other than the wolf's, the rat, the companion and the saber-tooth
cat in-game.

**PO verdict 2026-09-28: "works."** Given after the look on the debug zone
set. The two questions put to that look got no separate answer, so both
stand as built: the round mark keeps drawing under the maul (D6, §8 Q4) and
the kind keeps the name `maul` (§8 Q3). The fixed orientations (§8 Q6) and
the numbers stay [PLACEHOLDER].
