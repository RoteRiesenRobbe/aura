# Plan: natural weapon attacks (the lunge and the maul)

> **Status: DESIGNED 2026-09-27 (PO session, nine rulings taken as choice
> prompts, §2), 2 chunks (§7). C1 (the `lunge`) BUILT 2026-09-27,
> `413a7fd4` (ledger §11 C1), PO look verdict not recorded. C2 (the
> `maul`) OPEN.** Line refs re-verified by C1 at `8e49a12b`; C2 re-verifies
> them before executing.
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
  token (`Game.ts:399-415`), so the lunging body never covers it. (Trees
  still draw above mobs, so a mob lunging under a crown stays under it.)
- **Size.** `victim radius × scale`, the first bite's rule.
- **Frame.** Drawn in the ATTACK frame: the x axis is the attacker-to-victim
  line, so a gash lies along the attack and four wolves leave four
  differently turned marks. ⚑ The first bite was screen-aligned, never
  rotated; this is a lead call for the C2 look (§8 Q2).
- **Curves** (each a pure phase function in `SkillFxMath.ts`, red-first, and
  a code-drawn placeholder tinted by the damage-type palette):

| Curve | Motion | Placeholder | Default ms [PLACEHOLDER] |
| --- | --- | --- | --- |
| `bite` (default) | two jaw rows above and below the centre close onto it, then fade (the C2a `snap`: close in the first half, scale 1.3 to 0.55) | two opposing arcs with teeth ticks | 180 |
| `pincer` | today's geometry, moved as is: one fang hinged on EACH side of the victim's rim, swinging in to meet at the centre | the tapered wedge pair | 260 |
| `gore` | two short stabs driven in along the attack line | two parallel tapered gashes | 200 |
| `claw` | three rakes drawn across the attack line, one after the other | three curved parallel slashes | 240 |
| `kick` | one mark punched in (a scale pop), then fade | a hoof print (an open U) | 180 |

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
- **Art.** `spider-fang.png` keeps working (the pincer's contract does not
  move). The `bite`'s art contract is OPEN (§8 Q1): the shipped `wolf-jaw.png`
  is a tapering snout hinged at its left edge, drawn for the rim bite, and
  reads wrong as a front-view row of teeth.

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
| `wolf-bite`, `elite-wolf-bite`, `rat-bite`, `spider-bite` | `lunge` + `maul` `bite` | swap |
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
  `obj.shape.position` and `obj.size` (`SkillFx.ts:421-437`), so every other
  Fx anchored at a lunging attacker stays on its logical position.
- **The vocabulary is closed in five places**: the Go tables
  (`skills/visual.go:123-227`), the generated fixture
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
  (`SkillFxPlan.ts:162-164`), deliberately before the seed counter moves.

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

1. **The `bite`'s art contract (blocks C2's content, ruled at its session
   start).** (a) Front-view teeth rows, the first bite: the artist draws the
   UPPER row, anchor bottom-centre on the bite line, the engine mirrors it
   below; `wolf-jaw.png` is regenerated by `tools/make-skill-fx-pilot.mjs` or
   the wolves drop `body` and draw the procedural teeth. (b) Keep the hinged
   jaw pair and its PNG contract, moved from the rim to the victim's centre:
   no art churn, but it reads as a snout in profile, not as "teeth appear".
   ⚑ `wolf-jaw` is P0 on the artist's wanted list: if drawing has started
   under the hinge contract, say so before ruling. Lead default: (a), the
   wolves drop `body` until new art exists.
2. **Attack frame or screen-aligned** for the maul (§3.3). Lead default: the
   attack frame. Judged at the C2 look.
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
  `cast-pose` on the bare `castKey` (`SkillFxPlan.ts:287-292`). A lunge
  pushed through the same set would be dropped, or would drop the pose, on
  any skill that authors both: same key, first kind wins, in silence. Use a
  second set or key on `castKey` plus the kind.

## 11. Chunk ledgers

### C1: the lunge (built 2026-09-27, `413a7fd4`, PO look verdict not recorded)

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

**PO verdict: NONE RECORDED.** The PO ordered the wrap, the commit and the
push on 2026-09-27 without stating a look verdict.
