# Skill VFX asset spec - what the artist delivers

> **Status: CONTRACT DRAFT 2026-09-21, amended the same day** (the PO look that
> made every attack stem from the attacker and the hit mark automatic:
> `../plan-skill-vfx.md` §12g). Companion to `pipeline.md` (how art
> gets on screen) and the design doc `../plan-skill-vfx.md` (why the kinds
> exist and what each one does; the rulings behind this file are §12f + §12g).
> This file is the **artist-facing contract**: if a committed PNG follows
> every rule here, it draws in-game with zero code negotiation.
>
> **What is settled:** the file-name link, the folder, the script, the colour
> rule, the orientation and anchor per kind, the reserved frame naming.
> **What is open:** every canvas size in §4 is **[PLACEHOLDER]** until the
> pilot (§8) is judged, exactly as the medallion spec left its circles open,
> and the wanted list in §7 is a **proposal** for the artist and the PO, not
> an order.
>
> The engineering side of this contract (the sprite path, the manifest script,
> the validator) lands with chunk C3a. Until it does, a committed PNG simply
> waits in the folder and nothing breaks.

---

## 1. The mental model (read this first)

A skill's look is authored in JSON as a short list of **layers**. Each layer
names a **kind** (what moves) and, optionally, a **body** (the picture that
moves). There are **seven places a PNG can go**, listed in §4.

One rule underneath all of them, and it is the reason the list is short
(`../plan-skill-vfx.md` §12g, PO 2026-09-21): **an attack is always drawn from
the ATTACKER, facing the enemy** - a held weapon, a flying missile, a stretched
beam, a pair of jaws, a spreading wave. The other half of a hit, the round mark
that lands ON the victim, is **drawn by the engine** on every landed damage
hit, coloured by the damage type. **Nobody draws that mark and no skill file
authors it** (§5).

Two sentences carry the whole contract:

> **The PNG is the PICTURE. The MOTION is code.**
> **The file name IS the link.**

A skill file that says `"body": "arrow"` draws `arrow.png`. Nothing else
connects the two: no registry to edit, no id to invent, no code review. Add
the picture, run one script, and the skill draws it.

Because the motion is coded, **a new picture is free and a new motion is
not**. Drawing a better sword is a file drop. Asking for a sword that spins
twice before it lands is engineering work (a new curve in the renderer). If
you want a motion the game does not have, say so as a motion request, not as
a drawing.

**What happens when a body is missing:** the kind falls back to a procedural
placeholder drawn in code (a crude shape, tinted by the skill's damage type).
That is what every skill in the game draws today. Placeholders are deliberately
plain so nobody mistakes them for art.

---

## 2. Getting a file into the game (three steps)

1. **Export the PNG** and commit it straight into
   `frontend/src/features/skill-fx/assets/bodies/`.
   Lowercase, hyphens instead of spaces, no underscores (§6), `.png`,
   **transparent background**.
2. **Run the manifest script once:**
   `node tools/make-skill-fx-manifest.mjs`
   It scans the folder and rewrites `api/skill-fx/bodies.json`, which is the
   server's copy of the file list. Anyone on the team can run it for you; it
   takes a second and needs only Node, which the frontend build needs anyway.
   ⚑ It picks up files ending in **lowercase `.png`** and nothing else: a
   `.PNG`, a `.svg` or a stray `.psd` in that folder is silently skipped, and
   SVG is not supported on this path at all.
3. **Someone points a skill at it** by adding `"body": "<your file name>"` to
   a layer in `api/skills/…json`. That is a content edit, not an art edit.
   If you are only replacing an existing body, this step is already done.

Two safety nets sit behind this, so a mistake is loud rather than silent:

- A test fails if the folder and `bodies.json` disagree in either direction,
  which is what catches a forgotten step 2.
- The server's content check (`aurad -validate`) **refuses a skill that names
  a body the folder does not have**. A typo is an error at boot, never an
  invisible sprite.

**You do not need** a backend rebuild, a schema change, or any other edit for
step 1. Replacing an existing body under the same name is step 1 alone.

---

## 3. Colour: draw it in colour

- **A body is drawn full colour and shown exactly as drawn.** The game does
  **not** tint your art by damage type. A fire sword is a sword you drew on
  fire.
- **The one option, never a requirement:** a skill file may carry a `tint`,
  which multiplies over the whole body. A multiply can only ever **darken**,
  so it works properly on one kind of art only: **draw it white or light grey
  if you want it tinted**. That is how one drawing becomes several elements
  (one `ward-shard.png` serving a gold ward, a red ward and a green ward).
- Coloured art plus a tint muddies the colour. Pick one per file: full colour,
  or near-white for tinting. Say which one a delivery is, because the content
  author has to know whether to write a `tint`.

⚑ **The consequence this rule used to have is gone.** The draft warned that a
shared white PNG on the round hit flash would switch off its damage-type
colour, and parked the question. ✅ **RESOLVED 2026-09-21 (PO):** the round
mark is no longer a drawing at all. The engine paints it on every landed
damage hit, in the damage type's colour, and no skill file and no artist is
involved (§5, §11 item 1). The white-for-tinting idiom stays for what it was
really for: wards and heal motes.

---

## 4. The seven body uses, and how each PNG is used

Canvas sizes are **[PLACEHOLDER]** until the pilot is judged. `px` here means
pixels in the source file; on-screen size is the code's business, not the
art's (see §5).

Every row here is drawn **from the attacker**. There is no victim-anchored row
any more: the mark on the victim is the engine's (§5).

| Kind | How the PNG is used | Rule for the drawing | Canvas [PLACEHOLDER] |
| --- | --- | --- | --- |
| `strike` | held in the hand, scaled so its LENGTH equals the skill's reach | points right, **grip at the left edge**, vertically centred | 128 × 32 |
| `strike` `bite` | ONE jaw, drawn twice (the second mirrored), **hinged on the victim's rim** (the point nearest the attacker) and closing toward the victim's centre, sized to the VICTIM, not the reach | the **upper** jaw, **hinge at the left edge**, snout pointing right, teeth pointing down, **bite line on the bottom edge** | 128 × 48 |
| `orbit` (held) | the same picture, circling the caster | same as `strike` | 128 × 32 |
| `projectile` | flies caster to victim, rotated to the travel direction | points right, centred | 96 × 24 |
| `beam` | STRETCHED between caster and victim, as thick as the layer's `width` | must survive being pulled long: no detail that reads as squashed | 64 × 16 |
| `cast-pose` | shown on the caster, rotated toward the victim | points right, centred | 96 × 32 |
| `emitter` | ONE particle, drawn many times, small | reads at 8 to 16 px | 16 × 16 |

### The diagrams

**`strike` and held `orbit`** - the weapon is HELD: the grip sits in the
caster's hand and the blade reaches out toward the victim. The engine scales
the whole picture uniformly until its length matches the skill's reach, so
the proportions you draw are the proportions on screen.

```
 grip                                            tip
  |                                               |
  v                                               v
 +-------------------------------------------------+
 |  [#]===========================================> |   <- vertically centred
 +-------------------------------------------------+
  ^                                               ^
  left edge = the hand                   points RIGHT (+X)
```

**`strike` with `curve: bite`** - the jaws of an animal, and the one row where
the engine uses your drawing twice. You draw **one jaw, the upper one**, snout
pointing right, teeth pointing DOWN, and the **bite line is the bottom edge**
of the canvas. The **hinge is the bottom-left corner**: that corner never
moves. Since the RIM BITE (PO 2026-09-23, `plan-skill-vfx.md` §12h) it sits on
the VICTIM's rim, at the point nearest the attacker, and the snout points
along the attack line toward the victim's centre, so four wolves bite at four
spots around one victim, each pair pointing back at its wolf. The engine takes
a second copy, mirrors it in Y below the bite line, and rotates the pair about
that corner from open to shut over the layer's `ms`. The jaw is scaled
uniformly to the VICTIM's size ([PLACEHOLDER] 1.4 × its radius, never under
40 px), not to the skill's reach, so it reads as a short bite rather than a
crocodile. Nothing may hang below the bite line, and nothing may sit left of
the hinge.

```
  HINGE (bottom-left corner)            snout points RIGHT (+X)
   |                                              |
   v                                              v
  +------------------------------------------------+
  |  \      /\      /\     /\    /\   /\  /\   /\  |   upper jaw,
  |   \    /  \    /  \   /  \  /  \ /  \/  \ /  \ |   teeth pointing DOWN
  +------------------------------------------------+  <- BITE LINE = bottom edge
   ^
   the engine mirrors the whole canvas below this line
   and swings both halves about the hinge until they meet

  open                               shut
   \                                  ___
    \___                             /###\      <- over the victim
    /###                             \___/
   /                                  ---
```

**`projectile`** - rotated to point along its flight path, so it must point
right when unrotated. The canvas centre is the point the engine moves.

```
 +---------------------------------+
 |                                 |
 |        <]======>>               |   travel direction --->
 |             ^                   |
 +-------------|-------------------+
               canvas centre = the flying point
```

**`beam`** - the picture is pulled from the caster to the victim, however far
that is. Only X stretches; the height becomes the layer's `width`. Anything
that must stay round will not.

```
 caster end                                 victim end
 +-------------------------------------------------+
 |=================================================|   height = `width`
 +-------------------------------------------------+
   <------------- stretched in X only ------------>
```

**`cast-pose`** - worn on the caster at the moment the cast goes off, rotated
toward the victim. The bow is the example.

```
 +---------------------------+
 |        (|                 |
 |       ( |----->           |   aims RIGHT; the engine rotates it at the victim
 |        (|                 |
 +---------------------------+
```

**`emitter`** - one particle, drawn many times over. It is tiny on screen, so
it is a silhouette, not a drawing: a cross, a mote, a snowflake, an ember.

```
   +--------+
   |  . -.  |
   | ( ++ ) |   16 x 16; judge it at 8 px, not at 100 %
   |  `- `  |
   +--------+
```

### Rules that hold for every kind

- **Transparent background**, PNG with alpha, sRGB. No baked backdrop and no
  baked drop shadow: these draw over arbitrary terrain, in daylight and under
  the darkness overlay.
- **Author upright / pointing right. Never pre-rotate** to fix an orientation.
  The engine rotates once, from the rule in the table; a pre-rotated file
  double-rotates. (This has bitten the project before, `pipeline.md` §4.)
- **Transparent margin is a cost, not free space.** It still rasterizes. Fill
  the canvas.
- **On-screen size is not yours to compensate for.** A `strike` or a held
  `orbit` is scaled *uniformly* to the skill's reach, a jaw pair reaches from
  the attacker to the victim by the same rule, a `beam` is stretched in X
  alone. Draw the thing at the canvas size in §4 and let the engine place it.
- The canvas sizes in §4 are the pilot's question. `pipeline.md` §3.1's rule
  of thumb is "export at least twice the drawn size", and a long weapon can
  draw at 168 px on screen, so 128 px may prove too small. That is exactly
  what the pilot settles; do not pre-empt it.

---

## 5. What is art, and what is code

Recorded so nobody draws something the engine already owns, or waits for
something that is free.

**Code owns the motion.** `thrust`, `swing`, `overhead`, `bite` and `pincer` for a
strike; `flash` and `extend` for a beam; `swirl`, `rise` and `burst` for
particles. These are curves in the renderer. Asking for a different one is an
engineering request, and a small one.

**Art owns the picture.** Everything in §4.

**Richer weapon animation, if it is ever wanted,** builds on the same PNG and
is additive, so nothing you deliver now is wasted:

- a **rigid** weapon (sword, mace, spear) is one PNG moved along a coded
  curve, which is what ships today;
- a **flexible** weapon (a whip, a flail chain) would be one PNG laid along a
  curve, which is a new curve and not a new delivery;
- a **frame-by-frame flourish** (a claw rake, an explosion) would use the
  reserved frame naming in §6. It is not built. Do not deliver frames yet.

### ⛔ Do not draw these: they are procedural FOR GOOD

Not "not yet": these three are code, by ruling, and no PNG can replace them.

- ⭐ **The hit mark.** The round mark that lands on a victim when damage
  lands. The engine draws one on **every** landed damage hit, in the damage
  type's colour, with no skill file involved (PO 2026-09-21, `../plan-skill-vfx.md`
  §12g). It is the game's one piece of universal combat feedback, so it has to
  be one look that recolours, which is exactly what a drawing cannot be. **No
  hit flash, no generic burst, no per-element set of them is wanted.**
- **The lightning `beam` (`curve: flash`).** It is a jagged line redrawn from
  a per-hit seed, so every bolt differs, it fits any distance, and it chains
  between victims. No single PNG can do that. The procedural look here is
  **tuned, not a placeholder**.
- ⭐ **The `wave`.** One to three rings spreading from the caster out to the
  skill's reach and fading: the mammoth stomp, and any AoE that wants the
  ground to carry the hit. The rings are sized from the skill's reach at
  runtime and tinted by damage type, so a fixed drawing would be the wrong
  size in every skill that used it.
- **Generic sparks and ribbons** for `emitter` layers that just need motion
  and colour. A specific silhouette (a heal cross, an ember, a snowflake)
  earns a PNG; an anonymous glowing dot does not.

---

## 6. Naming, and the reserved frame suffix

- **Lowercase, hyphens for spaces, `.png`.** `wolf-jaw.png`, `venom-glob.png`,
  `heal-cross.png`. No spaces, no capitals, no underscores.
- The body name is the file name **without** the extension, verbatim. There is
  no cleanup pass: `Wolf_Jaw.png` becomes the body `Wolf_Jaw`, not `wolf-jaw`.
- **The underscore is reserved** for a future frame sequence:
  `<body>_0.png`, `<body>_1.png`, … **Frame playback is NOT built.** Because
  the manifest lists file stems verbatim, delivering `sword_0.png` today
  creates a body literally called `sword_0` and does **not** stand in for
  `sword`. So: **one PNG per body, no frames, until the engine asks for them.**
- Replacing art keeps the name. A redrawn `arrow.png` needs no other change
  anywhere, which is the point of the contract.

---

## 7. The first wanted list [PROPOSAL, for the artist and the PO]

**Re-derived 2026-09-21 for the §12g amendment.** The first draft of this list
counted the content as it stood that morning (129 layers, 107 of 116 files, 42
of them round `impact` marks). The amendment deletes every `impact` layer and
gives each attack-less damaging mob skill an attack instead, so the shape of
the list changed, not just its arithmetic.

**Expected after the amendment: about 105 `visual` layers across about 95 of
the 116 skill files** - derived from the content at commit `cf6dd6ef` plus the
per-skill table in `../plan-skill-vfx.md` §12g.3, **not** from the tree as it
stands while the amendment is being built. Treat both numbers as the size of
the job, not as a pin: re-derive them off disk when the content has landed
(count `visual.layers[]` across `api/skills/**/*.json`; §12g.3 is the list of
what changed).

The list groups those layers into **distinct looks**, one body per look rather
than one per skill, so they ask for **17 drawings** (plus one optional later
split), and the top four still cover most of what a player ever sees.

This is a proposal. Priorities are mine, drawn from how often the look is on
screen; the PO's ordering wins over it. "Placed" counts below are placements in
`api/zones/`, which is why a skill with one layer can outrank one with three.

### The list

| Body | Kind | Who would use it | Layers | Priority |
| --- | --- | --- | --- | --- |
| `sword` | `strike` (`thrust` + `swing`) | Damage, Berserker, Paladin, Spearhead, Vanguard, Warbanner, Wild, Reaper, KoboldStab, CompanionAura, BanditBlades, EliteBanditSlash, GruntSlash, OrcCleave, SoldierBlades | 15 | **P0** |
| `wolf-jaw` | `strike` / `bite` | WolfBite (Wolf, DireWolf, AlphaWolf), EliteWolfBite - 187 placements, the most-drawn attack in the game after the sword | 2 | **P0** |
| `arrow` | `projectile` | LongRangeStrike, BanditVolley, KoboldVolley, Suppression | 4 | **P0** |
| `bow` | `cast-pose` | LongRangeStrike, BanditVolley, KoboldVolley | 3 | **P0** |
| `maul` | `strike` / `overhead` | TrollSmash, WarlordCleave | 2 | P1 |
| `ward-shard` | `orbit` (ambient, **white for tinting**) | Aegis, FireWard, FireVulnerability, Venomward, RallyDrum, WarbannerShield | 6 | P1 |
| `heal-cross` | `emitter` / `rise` (**white for tinting**) | Heal, Lifewarden, Rejuvenation, BanditHeal, HealerAura (the small-mote layer of each pair) | 5 | P1 |
| `venom-glob` | `projectile` | VenomSpit, GiantVenomSpit, **PoisonPoolAura** (new: the pool spits a glob instead of marking its victims) - 26 placements | 3 | P1 |
| `spider-fang` | `strike` / `bite` | GiantVenomSpit - GiantSpider, 5 placements (a generated WHITE placeholder ships since C3a-ii, authored with `tint: "#ffffff"`); SpiderBite (Spider, 17 placements) still draws the bodiless jaw placeholder and could share it | 1 | P1 |
| `tusk` (was `boar-tusk`) | `strike` / `thrust` | BoarGore - Boar, 58 placements. Also the two retired mammoth auras, should they ever be placed again | 1 | P1 ⬆ |
| `claw` (was `bear-claw`) | `strike` / `swing` | BearSwipe - Bear + DireBear, 24 placements | 1 | P1 ⬆ |
| `axe` | `orbit` (fired) | WhirlingAxes | 1 | P1 |
| `flame-pillar` | `beam` / `extend` (**stretches in X**) | **FireElementalAura, EmberAura, FireTotemAura** (new: a tongue of flame reaching each victim), OmniAura - 8 placements plus the summoned fire totem | 4 | P2 ⬆ |
| `ember` | `emitter` / `rise` | CampfireAura, CampAura, Lantern | 3 | P2 |
| `sickle` | `strike` / `overhead` | Harvest (the gathering aura) | 1 | P2 |
| `pickaxe` | `strike` / `overhead` | Pickaxe (the rock-breaking aura) | 1 | P2 |
| `firebolt` | `projectile` | Firebolt | 1 | P3 |
| `spear` | `strike` / `thrust` | an optional later split of `sword` for the stabbing skills | - | P3 |

**17 drawings cover 54 layers.** The other ~51 are code, below.

### Deliberately not on the list

| Look | Layers | Why not |
| --- | --- | --- |
| ⭐ **The hit mark** | **0 authored** | Was the biggest group on the first draft (35 round `impact` bursts) and is now **gone from the artist's side entirely**: the engine draws one on every landed damage hit, in the damage type's colour, authored by nobody (§5, PO 2026-09-21). It is the one thing on this page that was ruled OUT of art rather than deferred. |
| `emitter` bursts and swirls, generic | 34 | Anonymous sparks in a skill's own colour. Motion and tint already carry them; a silhouette would add nothing. |
| `emitter` / `rise` mist (the wide half of each heal and campfire pair) | 7 | A soft cloud, not a shape. |
| `beam` / `flash`, the lightning | 3 | Procedural on purpose and final (§5). LightningStrike, plus TotemAura's bolt and BombBurst's blast reach, both new under the amendment. |
| `wave`, the expanding rings | 1 | Code-drawn for good (§5). AngryMammothStomp today. |
| Attacks with no body wanted yet | 6 | StagKick and SpikeBarricadeAura thrust with the placeholder weapon (see the open call in §11 item 4); SaberToothCatAura's bite, DodoAura's peck and the two mammoth tusk auras belong to mobs retired in 2026-08 - the skill files survive by rule, but nothing in the world casts them. |

### Notes on the grouping

- **`sword` covers both `thrust` and `swing` on purpose.** The curve is the
  motion, the PNG is the picture, so one blade is genuinely one look, and the
  two curves already read differently on screen. `spear` is the first split to
  make if the stabbing skills want their own silhouette.
- ⭐ **Animals moved UP, because the amendment hands them a weapon.** Before
  the ruling a bear's swipe and a boar's gore were victim-side marks that
  needed no art to look acceptable. They are attacks now, and an attack with
  no body draws the *style's placeholder weapon*: a boar gores with a spear
  and a bear swipes with a blade until `tusk` and `claw` exist. That is why
  both rose a priority band. The jaws do **not** have the same problem: `bite`
  has its own placeholder (a tapered wedge pair with teeth), so `wolf-jaw` and
  `spider-fang` keep the priority their placement counts earn them.
- **Naming rule, so the ids stop churning:** a look used by ONE species keeps
  the species in its name (`wolf-jaw`, `spider-fang`); a look that merges
  several drops it (`sword`, `tusk`, `claw`). `bear-claw` → `claw` and
  `boar-tusk` → `tusk` follow that rule and nothing authors either name yet,
  so the rename is free today and will not be tomorrow.
- The **overhead** weapons split three ways because they are three different
  jobs: a war maul, a harvesting blade, a mining pick.
- **`ward-shard` and `heal-cross` are the white-for-tinting case** (§3). Every
  skill using them already authors its own colour, so one near-white drawing
  serves six wards and five heals.
- `Firebolt`, `WhirlingAxes` and `OmniAura` had **no unlock source** in the
  content at the time of writing, so they are reachable only through dev
  commands. That is why they sit at P3 despite being good-looking candidates.
  `flame-pillar` escaped that band because the amendment gave the same look to
  three mob skills that ARE placed.

---

## 8. The pilot (first delivery)

Engineering ships three deliberately plain PNGs under the names `sword`,
`arrow` and `wolf-jaw`, generated by a checked-in script, so the whole path is
seen working in-game before any real art exists. **The artist overwrites those
three under the same names**, and nothing else changes. A fourth,
`spider-fang` (96 × 40, one plain white hooked fang on the `wolf-jaw` hinge
contract), was added by the same script for the Giant Spider's bite (C3a-ii,
§12h): the PO asked for "two big white fangs", and `-validate` refuses a body
the folder does not hold, so the look needed a real file before its art.

They are picked to cover the three anchor rules in one go: grip-at-left with
uniform scaling (`sword`), centred-and-rotated (`arrow`), and the mirrored jaw
hinged at its bottom-left corner with its bite line on the bottom edge
(`wolf-jaw`). Getting those three right proves the contract for every row in
§4. They ship at the §4 sizes as drawn: `sword` 128 × 32, `arrow` 96 × 24,
`wolf-jaw` **128 × 48** (the amendment turned the jaw from a box into a
tapering snout that reaches over the victim, so it grew).

**The pilot's job is to lock the §4 canvas sizes.** After the PO looks at the
three in-game, the sizes that worked are recorded in §4, the [PLACEHOLDER]
marks come off, and later deliveries follow them. Expect one revision loop on
the sizes; that is what a pilot is for.

---

## 9. Self-check before committing

1. PNG with alpha, transparent background, no baked shadow.
2. The canvas matches its row in §4 (or the pilot's recorded size, once §4 is
   locked).
3. Orientation and anchor match the row's diagram: points right, grip at the
   left edge for a weapon, **hinge at the left edge** and bite line on the
   bottom edge for a jaw, centred for everything else. **Nothing pre-rotated.**
4. Full colour, or deliberately near-white because it is meant to be tinted.
   Say which in the commit message.
5. The file name is lowercase with hyphens, and contains **no underscore**.
6. `node tools/make-skill-fx-manifest.mjs` has been run, and the changed
   `api/skill-fx/bodies.json` is committed with the PNG.
7. It reads **small**, against the dark green land (`#006030`) and under the
   darkness overlay, not on white. Combat art is looked at for a fifth of a
   second.
8. For a `beam` body: pull it to three times its length and check it still
   reads.

---

## 10. What the artist does NOT need to wait for

- **A packer / spritesheet.** The folder is the delivery today, one PNG per
  body. If the body count ever grows past what the renderer can batch, a
  packer gets built behind the scenes and **the artist's side does not
  change**: single PNGs in both designs.
- **Frame playback** (§6). Reserved naming, unbuilt engine, no delivery.
- **The content editor's Visuals section** (chunk C3b): a read-only view that
  will show a thumbnail per layer. It reads the same folder.
- **The canvas sizes in §4** for the three pilot bodies: those are what the
  pilot measures. For anything else in §7, ask before drawing a full batch.

## 11. Open calls, recorded

1. ~~**The round `impact` burst and the damage-type palette**~~ ✅ **RESOLVED
   2026-09-21 (PO, `../plan-skill-vfx.md` §12g).** The draft asked whether the
   round hit flash wanted one drawing per element or an exception to the "a
   body turns off the palette tint" rule. **Neither: it is not a drawing.**
   The engine paints the mark on every landed damage hit, coloured by the
   damage type, authored by no skill file and delivered by no artist (§5). The
   35 layers it used to represent are deleted from the content. The rest of the
   old question - the untinted frost swirls on `Frostbite` and `Hoarfrost` -
   survives inside item 5.
2. **The canvas sizes** (§4, §8), open by design until the pilot.
3. **The §7 ordering**, which is the PO's call, not the list's.
4. ⭐ **The animal thrusts that now wield a spear** (§7). Under the amendment
   every attack draws from the attacker, and an attack with no body draws the
   style's placeholder *weapon*. StagKick and SpikeBarricadeAura are `thrust`
   attacks with nothing to hold, so a stag kicks with a spear and a barricade
   jabs one. Three ways out and none of them is obviously right: draw a `hoof`
   and a `spike` (two more P2/P3 rows), give `thrust` a neutral non-weapon
   placeholder, or leave it, on the grounds that a fast spear-shaped streak
   reads as "something hit you" and nobody looks for a hoof. Same question in a
   milder form for `tusk` and `claw` until those two land.
5. **The untinted frost swirls** (`Frostbite`, `Hoarfrost`, §3). They carry an
   authored `tint` rather than the palette's frost, so a coloured PNG on them
   would fight the authored colour. A content question more than an art one,
   but the artist hits it the moment a snowflake is drawn.
