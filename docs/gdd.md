# Aura — Game Design Document

**Version:** 1.0
**Status:** Living document
**Last updated:** 2026-07-19 (intermission triage: §10 top-down-world / portrait-icon clarification (triage item 16); §11 character sacrifice moved into v1 scope per PO ruling, triage item 10). *Prior:* 2026-07-10 (combat pacing & recovery session: design-pillars list added to §1; aura line-of-sight **cut**; recovery rhythm + death state in §3; tick readability, two-zone auras + Combat Pacing subsection in §4 — decision prep/record: `archive-combat-pacing-recovery.md`)

> This document is the **game-design truth** (vision, mechanic intent, open
> design questions). Technology belongs in the [Technical Design Document](./tdd.md),
> implementation scope and status in `roadmap.md`, unscoped feature ideas in
> `backlog.md`. All concrete numbers are [PLACEHOLDER] until explicitly final.

---

## 1. Vision & Pitch

**Tagline:** MMO lite — resource vs. resource, as simplified as possible.

**Core principle:** Players and NPCs interact exclusively through **auras** — circular effect fields. **No manual aiming:** every aura picks its own targets by a fixed, per-aura rule (default: the nearest valid target in range). Positioning and cooldown/switch timing are the only skill expressions — *who* gets hit is controlled through your own position.

**Inspiration:**
- WoW Classic — progression, worldbuilding, environmental storytelling, slow escalation in tone
- Gothic 1 & 2 — low-poly look, dense organic world
- Hotline Miami / Monaco / Rimworld — top-down art direction (not isometric, not pixel art)

**Platform:** Browser-based.

### Design Pillars

*(Recorded as an explicit list 2026-07-10 — previously scattered; other docs
cite these by name. The referenced sections are the elaboration.)*

1. **No manual aiming.** Auras pick their own targets by fixed per-aura rules;
   positioning and cooldown/switch timing are the only skill expressions (§4).
2. **One resource.** HP, mana, everything as a single value; 0 = death (§3).
3. **Circle readability.** An aura is a legible circle with binary edges — a
   range indicator plus per-target hit feedback, never fuzzy gradients (§4).
4. **Readable, relaxed combat — except top-tier content.** Fights are legible
   and unhurried by default; only elite/boss content demands execution
   (first written record 2026-07-10; see §4 Combat Pacing).
5. **No items, no economy, no drops.** Rewards are XP and spellbook entries;
   item-like gear is expressed as passives (§8; roadmap item 2).
6. **Cooperation without formal groups.** Role-filling is essential, not
   optional; all combat participants get XP (§9).
7. **Persistent shared hand-built world.** No instances, no procedural
   generation; environmental storytelling is central (§7).
8. **No griefing possible by design** (§9).
9. **System first, not presentation first** (§10).
10. **Combat RNG rejected.** Deterministic tag-resists + variance bands; crit
    is the one explicitly open exception (§5, §12).
11. **Numbers are always placeholders** until explicitly marked final.

---

## 2. Core Loop

1. Player moves through a persistent shared open world
2. Encounters mobs / other players — their own aura automatically picks targets in range by its rule and ticks on them
3. Damage, healing, buffs emerge from aura overlap; cooldown abilities modify temporarily
4. Combat ends → XP for all participants → possibly an aura unlock
5. Level up → skill points → strengthen existing auras or unlock combinations
6. Explore the world → find clues → unlock new auras / passives / cooldowns
7. Rearrange slots, adjust the build, tackle harder content

Everything revolves around the Resource (section 3) and the auras (section 4).

---

## 3. The Resource

Every player and every NPC has exactly **one resource**. It represents HP, mana, and everything else at once. Drops to 0 → death.

### Consumption
- Damage from enemy auras reduces the resource
- Your own heal auras on other players cost resource continuously
- More powerful auras cost more resource per tick

**⭐ The double meaning is the design, not a side effect (PO ruling
2026-07-26).** One value is simultaneously *"possibility of actions"* and
*"time left to die"*, deliberately. A character is at their strongest at full
resource and the whole moment-to-moment decision is **how to spend it**: *do I
risk more and do more, or do I play it safe?* Spending power to gain power, out
of the same pool that keeps you alive, **is** the combat game.

Two constraints follow, and they bound every cost value in the catalog:

1. **There is always an option left.** Basic actions — the base damage aura
   above all — stay **free** at any resource level. A character at 1 HP must
   still be able to act. A cost that can lock a player out of *all* offence is
   a bug, not tuning: it converts "I'm low, play carefully" into "I'm low, I
   can do nothing", which is the death spiral, not the risk decision.
2. **The good stuff is gated behind spending.** Everything above the free
   baseline — stronger auras, cooldowns, the whole reason to build — costs, and
   costs in proportion to what it does. This is what makes the free baseline a
   *floor* rather than a *default*.

⚑ Consequence for balancing: cost is **not** an independent axis from impact,
because paying is itself a survivability loss. Costs are priced against
sustain, not in isolation — an aura that refunds via lifesteal is paying much
less than the same number on an aura that does not. See
`plan-playtest-feedback.md` §Pass 1 for the implementation and the vector list.

### Regeneration & Recovery

Sources: slow passive regeneration outside of combat, your own cooldown
abilities, other players' heal auras, campfires (environmental).

**Recovery rhythm (decided 2026-07-10).** The recovery currency is
**time-at-the-campfire, not cooldown availability**. Recovery over time
(~15–20 s standing at a fire [PLACEHOLDER]) *is* the intended rhythm beat —
tension → recovery → tension — replacing classic MMO sit-and-eat.

- **Nothing instant may fully or near-fully restore the resource.** A capped
  partial instant heal (the shipped L2 Heal cooldown, ~20–30% [PLACEHOLDER])
  is a *combat sustain* tool, not recovery; the out-of-combat resource reset
  is always time-based. An instant full restore would collapse the rhythm
  regardless of its cooldown length.
- **Group cooldown rotation is sanctioned** — even the intended reward for
  group play: rotating recovery cooldowns saves waiting on cooldowns, never
  the time-at-fire itself.
- **Personal recovery cooldown (decided, theme open):** every player gets a
  single-target recovery-over-time cooldown early — the solo substitute for
  sit-and-eat. Theme [PLACEHOLDER]; the mini-campfire is the cheapest
  candidate (a totem-shaped owned summon with a heal aura legally heals its
  owner — the *totem* is the caster; depends on the mob-heal lifts,
  mob-depth chunks 7–8). Larger group recovery (big campfires, feasts)
  comes later and stronger.
- **Passive out-of-combat regeneration** follows the classic model:
  relatively meaningful early, declining proportionally with level. Two
  cautions on record: the single resource is HP *and* mana in one, so this
  one knob steers everything; and passive regen is the only solo downtime
  mechanism besides the personal cooldown — slow enough to keep active
  recovery attractive, never so slow that solo players idle past the ~20 s
  sit-and-eat pain threshold [PLACEHOLDER]. *(Implementation note: player
  regen is currently not combat-gated — the gate is scheduled with the
  step-3 recovery bundle.)*
- ⚑ **Feast aftereffect buff — open** (§12), with one constraint already
  decided: no regeneration that persists into combat — that is pre-fight
  healing, stacks with heal auras, and eats the attrition model.

### Death
At resource = 0:
- **Death state (decided 2026-07-10):** the character does not vanish — the
  body stays in the world until the player actively presses **Respawn**.
  This window is what makes the Revive ability possible. Killed mobs
  likewise leave a brief corpse [PLACEHOLDER duration] for readability.
- **Respawn** at the last visited **fixed world campfire** (the graveyard
  equivalent, part of world design — sharpened 2026-07-10). Player-placed
  recovery points are **never** respawn points: the walk-back is a core
  death penalty (alongside the XP loss below), and player respawn points
  would make boss encounters corpse-zergable.
- **Revive** is a rare, high-level ability (§4 Base Auras, Appendix A):
  dying deep in the world means walking back from the last world campfire —
  or a player with Revive brings you back. That makes Revive one of the most
  valuable social abilities instead of devaluing it with player respawn
  points.
- **XP loss** within the current level (back to 0 XP inside the current level — no level-down)
- No hardcore death, no gear loss

Since death has the same effect on XP progress as a respec, you can respec for free right after dying (see section 5).

---

## 4. Auras

### Definition

An aura is a circular effect field around a player or NPC. The circle is the **range** from which the aura strikes its targets — not necessarily a hit zone for everything inside it. **Deliberately not line-of-sight blocked (decided 2026-07-10):** auras pass through walls and every environment object — walls and props block *movement*, never effects. Wall-exploits are handled on the mob-AI side (leash behavior + obstacle steering), not by occlusion. Decision record: `archive-combat-pacing-recovery.md` §2.C.

```
       . . . . .
     .           .
    .   M         .          P  = player (caster)
    .       ###   .          M  = nearest valid target → gets hit
    .   P   ###   .          M2 = mob behind wall → valid target (walls
    .       ###   .               block movement, not auras)
    .         M2  .          M3 = mob out of range → safe (too far)
     .           .           ### = wall (blocks movement only)
       . . . . .       M3
```

### Targeting

Every aura has a **selector** (the rule by which targets are picked) and a **target count** — both defined per aura, as data, not as code.

- **Default selector for everything (damage and heal): nearest** — the closest valid target. Positioning thereby directly controls who gets hit or healed: one step toward the boss = hit the boss.
- **lowest_health** (special auras): the proportionally most wounded target — lowest current resource *relative to max resource*, not absolute. It thus hits/heals whoever is relatively worst off, instead of always picking the small-max-resource add in mixed fights.
- **Target count:** base auras hit few targets (starting value 1 [PLACEHOLDER]). Target count is a **specialization axis** — it grows via level-ups (defined per aura), dedicated unlocks, or cap-raises, **never via character level** (see section 5, Power Source & Curve). Rough intended cadence [PLACEHOLDER]: 2 targets fairly early, 3 noticeably later, 4+ very late; auras that hit *all* targets in range stay reserved for cooldowns and specific purpose-built auras.
- **Selection pipeline:** filter by range → sort by selector → take the first N. *(There is deliberately no line-of-sight filter — cut 2026-07-10.)*

Heal auras heal other players, **never the caster**. Self-healing is conceptually a cooldown (see Appendix A, Heal Magic cooldown).

### Slot System

Players have three slot categories, all growing with level:

- **Active slots** — auras you can actively switch and use (~4 initially, keyboard 1–4)
- **Passive slots** — permanently active effects
- **Cooldown slots** — active abilities with cooldowns, separate buttons (Q, E, ...)

All slots together form the **build**. You can have more auras in the spellbook than slots — you actively choose.

```
  SPELLBOOK (everything found)           BUILD (actively selected)
  +-----------------------+              +-----------------------+
  | Damage Aura     Lv 4  |              | Active slots:         |
  | Heal Aura       Lv 2  |   ------>    |   [1] Damage Aura     |
  | Tank Aura       Lv 1  |              |   [2] Heal Aura       |
  | Speed Aura      Lv 3  |              |   [3] Light           |
  | Light           Lv 1  |              |   [4] —               |
  | Torch (pass.)   Lv 2  |              |                       |
  | Swift (pass.)   Lv 5  |              | Passive slots:        |
  | Attack (CD)     Lv 3  |              |   - Swift             |
  | Flee   (CD)     Lv 1  |              |                       |
  | ...                   |              | Cooldown slots:       |
  +-----------------------+              |   [Q] Attack          |
                                         |   [E] Flee            |
                                         +-----------------------+
```

### Aura Behavior

- Always exactly **one** active aura on at a time, switchable mid-fight
- **Damage and healing:** tick-based (interval varies per aura), target picking via selector + target count (see Targeting)
- **Buffs/debuffs** (Tank, Speed, ...): constant, not tick-based
- **Two-zone auras (decided 2026-07-10):** a sanctioned *special-occasion*
  pattern — strong inner ring, weaker outer ring, both visible as distinct
  edges. Creates positional depth (go deep for effect, stay shallow for
  safety) while keeping the binary readability of circles. Explicitly **not**
  a global distance-falloff system — falloff would sacrifice the circle
  system's core readability. Reserved for particular mobs and particular
  player auras. *(Mechanically: one skill, two effects at different radii —
  per-effect radius already exists; see `archive-combat-pacing-recovery.md`
  §2.B.)*

### Base Auras

Simple single-effect auras. Examples: Damage, Heal, Tank (damage reduction), Speed, Cooldown Reduction, XP Boost, Revive, Campfire-Build, Light.

Each base aura is leveled separately with skill points. **What a level-up improves is defined individually per aura** — more damage/healing, larger range, more targets, faster tick rate; multiple axes at once are also possible. *Balance note for the content pass: "more targets × more damage per target" on the same aura is the most dangerous multiplier — use deliberately.*

> The complete list of base auras is still TBD. See Appendix A for collected spell ideas.

### Combinations

Specific combinations of unlocked auras, passives, and cooldowns — each at specific levels — unlock new auras, passives, or cooldowns.

Three important properties:

- **Cross-category:** a combination can mix auras, passives, and cooldowns arbitrarily.
- **Arbitrary levels:** components can be required at different levels — an aura at level 7 combined with a passive at level 3.
- **Arbitrary unlock type:** the result can be a new aura, a new passive, or a new cooldown — independent of the components.

**Examples:**

- Damage(5) + Heal(5) → "Damage+Heal" aura
- Swift passive(3) + Heal aura(7) → new aura
- Fire Strike aura(8) + Ice aura(2) → new cooldown
- Fire Strike aura(5) + Fire Shield cooldown(5) + Swift passive(5) → Pyromancer aura

Combinations can also have other combination unlocks as ingredients (few, manually designed).

Combination recipes are **fixed and curated** — not algorithmic. They are documented nowhere in-game; players experiment and share their findings online. All unlocks from combinations are leveled separately.

**Calibration & the one sanctioned exception (step 6 C5):** combination results calibrate to roughly ~70% of their components' standalone values (the Paladin reference), and unlock-source variants are side-grades — *different, never better*. The **Vanguard** (the Front-Aura, `plan-content-zones12.md` §A) is the **single sanctioned power exception**: a deliberately overstrong multi-effect aura (full Damage damage at double targets + free Heal healing + a shield), taught level-gated at the Zone-2 front — the game's "endgame-gear equivalent" expressed as a spellbook entry. It and its C7 combinations set the game's power ceiling (see section 5). A named exception, not precedent erosion: everything else keeps the ~70% / side-grade rules.

### Cooldown Abilities

Temporarily modify the next tick or the active aura. Examples:
- **Attack:** next tick deals 2× damage. CD 10 s
- **Flee:** radius −80%, speed +80%. CD 60 s
- **Ultimate:** massive single burst, heavily reduced radius. CD 60 min

**Ultimate is a cooldown, not a separate category.** A signature "ultimate" is modeled as a cooldown carrying an `ultimate` tag plus a dedicated reserved slot on the ability bar — *not* a fourth skill category. The three categories (auras / passives / cooldowns) are fixed; a long-cooldown signature ability needs only the tag + a reserved slot the loadout enforces. Promote it to its own model only if a fundamentally different *activation* model (e.g. a charge meter instead of a cooldown clock) ever becomes the point.

### Damage Types

Damage types enable thematic combo auras and interesting mob resistances. Mobs have resistances against certain types and deal damage of a certain type themselves. Example: a Fire Strike aura deals fire damage, which fire-resistant mobs are less vulnerable to.

**Mechanic built** (item 11 Phase 2, see `plan-item11-hp-resist-variance.md`): types are **arbitrary string tags** (no fixed enum — bespoke tags like "this one specific lava" are possible too), default tag `physical`, resistances are multipliers (0 = immune, >1 = vulnerable). The concrete type list is content ([PLACEHOLDER]) — fire, ice, physical as the starting point; assignment happens in the content pass (roadmap item 12).

### Visual Representation

**Aura tick timing must be readable (re-affirmed 2026-07-10)** — for the
player's own aura **and** for mob auras. The exact visual mechanism is open
(a circle filling toward the tick is one option, but anything readable
qualifies); it belongs to the aura VFX/animation/polish pass, with a
**minimal functional indicator landing before content-pass balancing** —
tuning mob tick rates for dodge-ability while players can't see ticks tunes
blind. Visible tick timing turns pure geometry into a timing layer for free:
players will self-optimize (step out of a mob's aura just before its tick,
step back in; time their own aura's ticks). Recorded caution:
**tick-dodging must be rewarding, not mandatory** — constant hokey-pokey
every tick would be exhausting; it only works with slow, readable mob tick
rates (content-pass authoring rule).

The circle reads as a **range indicator**, not as a hit zone: each tick, a **hit effect on the actually struck target** shows who the aura is hitting — for slow-ticking auras e.g. a sword slash over the target, for fast-ticking ones (fire) a constant effect on the target. This keeps single-/few-target inside the big circle intuitively readable.

*(History note: a forward-looking tick indicator has never been implemented —
the ring has always been a static sprite; the pre-2026-07 continuous damage
flash was replaced by per-hit landing VFX (item 11 Step 4). Forensics:
`archive-combat-pacing-recovery.md` §2.A.)*

*Deferred:* sticky targeting against target flicker with nearest (keep the target until it dies or leaves range) — build only when the flicker actually bothers. Visualizing overlaps of multiple player auras is also still unsolved.

### Combat Pacing: The Ring

*(Recorded 2026-07-10 — the durable rationale behind the tick-readability
requirement, two-zone auras, and the mob-movement vocabulary. Full analysis:
`archive-combat-pacing-recovery.md`.)*

Not every fight must be exciting — **standing still is acceptable only as a
held decision** (the player found and keeps a good position), never as the
absence of one (every position works equally well). This game has no
targeting, no rotations, no direct abilities: a static fight in a classic
MMO is still an RPG without movement; a static fight here is an idle game.
This is the **#1 design risk ("Tempo/Fun")** — combat degenerating into a
parking lot.

**The solo geometry problem:** with two center-anchored circles, every solo
encounter reduces to one variable — center distance. If the player's radius
exceeds the mob's, a ring exists where the player hits and the mob doesn't;
**inside that ring, every point is equivalent**. Earned stillness requires
distinguishable positions, which raw geometry doesn't provide solo.

**Differentiation must come from things that move, narrow, or texture the
ring:**

1. **Mob movement patterns** — with the recorded caution that a slower,
   straight-chasing mob makes ring-riding = walking backwards, which is
   *correct and boring*. Countermeasures (content-era mob vocabulary, not
   yet scheduled): telegraphed lunges, arc pursuit, ground zones blocking
   the retreat corridor.
2. **Tick timing** (see Visual Representation above).
3. **Two-zone auras** (see Aura Behavior above).

The simulation harness measures the failure mode: stand-still bot efficiency
tiered per mob type on sustainable kill chains including downtime, per level
bracket (see §5, First building block).

---

## 5. Progression

### Level & XP

- Start at level 1 in the starting zone
- XP for everyone involved in a fight (damage, healing, buffing)
- Low-level mobs stop giving XP beyond a certain level gap
- Higher mob level → more XP
- Every level: more slots, more skill points

### Power Source & Curve

**Decided (Option A):** an effect's value is `base(skill level) × f(character level)` — two orthogonal axes.

- **Skill level = specialization.** The per-aura `base + (skill level − 1) × perLevel` rule (already shipped) is *relative* build depth: where you choose to spend points.
- **Character level = number inflation.** `f(character level)` is a global multiplier carrying the raw growth of the numbers.

**Role of `f` decided (Philosophy A, PO 2026-07-15 — `plan-sim-harness.md` §5):** a **same-tier fight is scale-invariant.** Player damage *and* player max-HP both scale by `f`, and same-tier mobs are hand-authored at their zone's `f`, so a same-tier fight feels **identical at every level** (TTK/TTD constant). Leveling does *not* make same-tier content easier. Therefore `f` is **not a same-tier balance knob** — it is (1) progression *feel* (numbers grow), (2) **baseline relevance** (a newly-found aura = `base(1) × f(currentLevel)` is *instantly usable* at any level, even an early aura found late; skill points then push it *above* baseline), and (3) **uniform outleveling**. Directed power growth is carried by skill points (specialization), slots + unlocks (new capability), and zone progression (the challenge ladder); felt power comes from climbing with better tools and *returning to trivialize old zones*, not from same-tier drift.

**Invariants** (all [PLACEHOLDER], working values for the first balance pass):

- `f(character level)` applies **only to HP values** — damage, heal, self-damage/self-heal HP, and player max HP. It does **not** touch radius, tick rate, or target count. Geometry and cadence stay pure specialization/content knobs, out of the inflation treadmill.
- **The curve is STEEP (WoW-Classic-punishing, PO 2026-07-15).** `f`'s rate is same-tier-neutral but **cross-tier-defining** — it sets how many levels of gap turn a fight from doable → wall → steamroll. Target a **narrow doable band ≈ 4 levels**, i.e. **~12%/level** [PLACEHOLDER] (this *supersedes* the earlier ~6.9%/level, 50×-over-60 placeholder). Feel: enter a zone ~2–3 levels under its floor → wall; grind a few levels → doable → comfortable; ~4 levels over → steamroll, move on.
- **Linked triple — band width ↔ max level ↔ total inflation** (pick two). **WORKING LOCK (PO, 2026-07-16, from the harness data): `growth` = 1.12 (~12%/level, doable band ≈ +5 at the target TTK:TTD ratio) × max level = 30 → total inflation ≈ 27×.** Deliberately lower-first (PO): scaling growth UP later is cheap as long as mobs are authored as *tier + baseline* (HP = base × f(tier), derived — a one-knob re-derivation), not raw numbers — **shipped in step-6 C0 (2026-07-16): the curve is live and conf-driven, and the mob loader hard-fails raw `maxHealth` (authoring rule: `manual-content-authoring.md` §1; tech record: tdd §4.1)**. Still [PLACEHOLDER]-class until content proves it; the harness visualizes all three axes for re-reads.
- **TTK** against a same-tier normal mob **~8 s**; an idle player's **time-to-die ~20–25 s** (ratio ~1:3) in a 1-vs-1.
- **Level gaps** are handled by the numbers alone (the steep `f` gap *is* the gating mechanism); an explicit level-gap damage multiplier stays an available, isolated retrofit — not built.
- **Intra-zone difficulty variation is a free authoring pattern** — author a zone across a small level span (entrance corner at a lower tier, deep corner at a higher tier); no new mechanic.

- **Power ceiling reference (step 6 C5, §A adoption):** the **Vanguard** (Front-Aura) and its C7 combinations are the game's deliberate power ceiling — the one sanctioned outlier above the side-grade rule (section 4). Every other skill balances *below* it; the C8 balance pass calibrates against it, and it lives in the sim-harness player-aura presets from the day it was authored — never a surprise.

**Mobs do not use `f(character level)`.** Mobs have no level. A "same-tier normal mob" is one whose baseline values were hand-authored and placed on the curve via its authored `curveLevel` (since C0: `maxHealth` and skill values derive from `baseline × f(curveLevel)` at load — a *fixed* curve position, never the fighting player's level). **Zone number = position on the progression curve** (see section 7). This asymmetry is deliberate: a max-level player *outlevels and trivializes* starter zones (WoW-Classic-intended), and nobody should later give mobs a *player-level-reactive* multiplier.

**Combat RNG is deliberately rejected** (random misses/resists) — see section 12. The deterministic tag-resist system + the ±variance band (item 11 Phase 3, already shipped) provide combat texture without the RNG that would clash with the positioning/timing skill expression and punish slow-ticking auras. *Crit is the one explicitly-open exception* (a possible sanctioned upside-only RNG — see roadmap step 4).

**First building block:** before any content numbers exist, a **simulation harness** — TTK, survival time, and kills-per-level across the level span, plus a **1-vs-N matrix** (player target count × pack size), since single-/few-target base auras make pack fights, not duels, the real balance question. Pack sizes per zone are then authored against the target count a player is *expected* to have reached at that tier.

**Harness metrics extended (2026-07-10):** the harness also runs the
**stand-still bot test** with thresholds **tiered by mob type** — a
starter-zone normal may be facetankable at up to ~50% efficiency, an elite
at no more than ~25%, a boss simply kills the stand-still bot [ALL
PLACEHOLDER — re-anchored 2026-07-16 from the chunk-4 chain measurements;
the original ~90%/~60% frame is superseded: **PO decision 2026-07-16 —
passive regen stays slow (~1%/s [PLACEHOLDER]) and positioning is rewarded
everywhere**; recovery-dominated attrition is the intended model (measured:
a starter normal facetanks at ~0.22–0.35 efficiency depending on the
TTK:TTD ratio), with self-heal cooldowns and campfires as the deliberate
recovery accelerators].
The correct metric is **sustainable kills per hour over a chain including
modeled regeneration and downtime**, *not* per-fight efficiency — a facetank
bot may nearly tie a single fight but loses far more resource per kill and
pays through downtime over the chain (that *is* the attrition model,
measured). Tests run **per level bracket** with level-typical builds against
level-typical mobs: because auras scale with skill points, facetanking can
become optimal again at higher levels even if it isn't at level 5 — that
regression must be caught automatically. Prerequisite: player passive regen
must be combat-gated first (§3).

### Onboarding: The Peasant Start

New characters begin as a "poor peasant" holding a **mundane utility aura** (e.g. *Harvest*, *Molehill-Close*) — not a combat aura.

- The utility aura is *mechanically* a damage aura with a **unique tag**; the passive chore-mobs it works on (turnips, molehills — stationary harvest-mobs, see section 8) **resist every tag except that one**. So the gate is fully **deterministic** (the tag-resist system, item 11 Phase 2): the peasant aura pops chores and does *nothing* to wolves, and — conversely — a combat Damage Aura does *nothing* to chores.
- "Defeating" chore-mobs yields **XP only** (no drops — this resolves the turnip / "no item drops" tension: chores are harvest-mobs). *(Amended twice: step 6 C1 moved the Damage aura from a level-1 milestone to a taught beat; **conversation-journal Q4 (2026-07-30) moved it back** — Damage is a level-1 milestone seeded silently at character creation, per the round-6 free-baseline ruling in §3: there must never be no combat option. The peasant flavour survives in the content — Harvest is still the Farmer's taught chore gate — but fighting is possible from the first tick.)*
- **Generalizes to per-race / per-start-area variation:** a different starting utility aura + chore-mob + start location per race (see `backlog.md`, Races). This onboarding is the mechanical seed for that, not a bolt-on.

> **Dev note (current since conversation-journal Q4, 2026-07-30):** a new
> player's spellbook holds exactly **Damage** — the level-1 milestone, seeded
> silently at character creation (nothing equipped; equipping and activating
> stay the player's first acts). Harvest is the Farmer's taught chore gate
> (@L1), and the TownCrier no longer teaches Damage. *(History: triage item 11
> made the spawn truly empty; step 6 C1 had Harvest as the spawn skill with
> Damage on the Farmer @L2; C8 moved Damage to the TownCrier @L1; Q4 made it
> the creation milestone.)* The chore gate is mechanically **opt-in damage**
> (`gatedDamageTags`): the utility aura only damages targets whose resistances
> explicitly name its tag — so turnips (and later bramble walls) opt in, and
> every combat mob is immune with zero per-mob authoring
> (`manual-content-authoring.md` §1).

### Milestone Unlocks

Guaranteed unlocks at certain levels. Draft:

| Level | Unlock |
|---|---|
| 2 | Heal Aura |
| 3 | Tank Aura |
| 4 | Cooldown ability (first) |
| 5 | First skill point |
| 5+ | Skill points on level-up |

*(The Damage Aura left this table in step 6 C1 — it is farmer-taught @L2, see
Onboarding above. The currently implemented [PLACEHOLDER] assignment lives in
the milestone data (`api/milestones/milestone-unlocks.json`);
the full rewrite lands over the content-pass chunks, final in C8.)*

### Skill System

- Skill points on every level-up (roughly 30 at max level — balancing TBD)
- Points can be invested in any unlocked aura, any passive, any cooldown
- Only what has already been found can be skilled — new unlocks start at level 1
- What a level-up concretely improves (damage/healing, range, target count, tick rate) is defined per aura (see section 4)
- Certain level combinations of unlocked auras/passives/cooldowns unlock new content (see section 4)
- No fixed class path

### Respec

Possible. **Cost:** the entire current level progress (XP within the current level back to 0).

Since death has the same effect, you can respec for free right after dying.

### Meta-Progression: Character Sacrifice

*(Explicitly post-v1 — see section 11. The design below is decided; nothing is scheduled.)*

"Sacrificing" a max-level character (lore framing — sacrifice vs. sending them away à la Arc Raiders — still open, see section 12) permanently retires that character and grants an **account-wide** reward. New characters benefit from all previous sacrifices.

**Design goal — the living starting zone.** Recreate the Hardcore-WoW population effect — early zones stay alive because veterans keep restarting there — but through *voluntary, rewarding* restarts instead of involuntary death. The restart itself must remain worthwhile: the reward is the occasion, the journey is the value. Two structures already in the design support this: per-race peasant starts (each run can *start* differently — see `backlog.md`, Races) and secret combination recipes (each run can be *built* differently).

**Repeatable, with a reward catalog.** Sacrificing is possible multiple times per account. Each sacrifice lets the player **choose one reward from a curated catalog** — not a fixed drop. Deliberate consequence: players who enjoy leveling and sacrifice alts repeatedly are a feature, not an exploit — they populate the early zones, and since rewards carry no power, it stays harmless.

**Rewards are breadth, never power.** Three sanctioned categories:

1. **Side-grade auras** with unique mechanics — something *different*, never something *better*. Calibration reference: Purple Rain (Appendix A) — unique, desirable, zero meta pressure.
2. **Cosmetic trophies** on avatar/portrait (e.g. animated portrait wings, an avatar visual-size increase).
3. **New start options** — races / starting utility auras / start locations (this is the mechanical seed noted in `backlog.md`, Races).

Explicitly forbidden: anything granting more damage/healing, more or better slots, faster leveling, or any endgame advantage. The design rule, verbatim: **"Does a player who never sacrifices feel *weaker* in the endgame? If yes, the reward is miscalibrated."**

*Rationale:* the SWG-Jedi "Hologrind" lesson — if sacrifice is a mandatory path to desired power, players optimize the fun out of the game (completing content instead of playing it). Sacrifice must therefore stay optional and power-neutral.

*Constraint on avatar-flavor rewards:* avatar/cosmetic effects never touch the physics body — sprite/rendering scale only, no collision or targeting-distance changes.

**Memorial in the starting zone.** Every sacrificed character's name is recorded on a monument in the starting zone. New players see the names of those who came before; veterans on their n-th run walk past their own former names. The memorial deliberately intertwines with the population goal at the same location (environmental storytelling).

**Loss scope — decided in direction, details open.** A sacrifice loses essentially *everything* character-bound: spellbook, levels, skill points, combo discoveries. The new character must genuinely feel like a fresh start. Only the account-wide sacrifice unlocks persist, and those are immediately (or near-immediately) accessible on new characters. ⚑ The exact specification — what "essentially everything" and "immediate access" mean (edge cases, how account unlocks are delivered to a fresh character) — is still open (see section 12).

---

## 6. Spellbook & Unlocks

The **spellbook** is the collection of all auras, passives, and cooldowns a player has found. The active build is chosen from it.

There are five ways to get new entries:

1. **Milestone unlocks** — guaranteed at certain levels (see section 5)
2. **Monster kill unlocks** — certain (not all) enemies drop auras or passives on death
3. **World exploration** — via clue anchor points in the world (see section 7)
4. **NPC teaching** — peaceful NPCs teach a specific aura on approach. Often thematically tied to nearby mobs that can only be damaged by exactly that aura (see section 8 → harvest mobs). ⚑ The interaction model — bare teach-on-approach vs. player-selectable branching dialogue, and what these NPCs must be able to do — is open; see `backlog.md` item 2 (Friendly NPCs & the dialogue system) and `roadmap.md` item 9 (reuse map).
5. **Meta-progression** — character sacrifice: choose one reward from a curated catalog (side-grade auras, cosmetics, new start options) — account-wide, repeatable, never power (see section 5)

---

## 7. Game World

### World Design

Persistent shared open world, multiple connected zones for different level ranges. Inspiration WoW Classic: slow escalation in tone, difficulty, and story weight — from a small nobody in the woods to dragons and undead only very late.

The world is sketched by the designer and built by hand — not algorithmically generated. Environmental storytelling is central.

### Zones

Each zone has:
- Its own area chat (only for players in this zone)
- Its own terrain: grass, desert, cobwebs, lava soil, etc.
- Its own decoration, mobs, geometry (caves, rivers, open spaces)
- Its own sounds / soundtrack (aspirational)

### Open-World Dungeons

No instances. WoW-Classic-style caves in the open world. Players know them and return together.

### Darkness & Light

Certain areas (caves, tunnels between zones) are dark — field of view heavily restricted, similar to caves in older top-down games. The tunnel between zone 1 and zone 2 is the first such area and serves as a natural tutorial for the role concept.

**Decided: darkness is purely visual.** It restricts vision but has no effect on damage, hit chance, or aura behavior — in the dark you *can* be hit, you just *see* poorly. The value of the light role is vision for the group (positioning, dodging, spotting targets).

Solutions for darkness:
- **Light aura** (active, obtainable early) — forces the trade-off: light or damage. Can be directed at others (support light).
- **Torch passive** (unlockable later) — permanent light without blocking an active slot.

See Appendix A.

### World-Exploration Clues

Every zone has 1–n **clue anchor points** pointing at hidden rewards — always obfuscated, no quest-marker feeling.

Clue types:
- Signs / inscriptions (*"Way of the Warrior"*)
- NPC dialogue (*"Back there are trolls who know a lot about heal magic"*)
- Environmental details (altar, symbol, sound)

**Rewards** are exclusively: actives, passives, cooldowns, XP. No loot, no items.

The clue's wording and the reward must fit together logically in hindsight — not obvious, but comprehensible. No markers. *(This rule originally read "no quest log, no markers" — the quest-log half was **amended 2026-07-29**: a journal now exists, see §8 → Quests & the Journal. Whether a found clue anchor also writes a journal entry, or clues stay entirely outside the journal to protect their obfuscation, is open — `backlog.md` §42.)*

```
   Sign in the woods              NPC in the village
   +-----------+                 "Back there are trolls
   | Way of    |                  who know a lot about
   | the       |                  heal magic..."
   | Warrior   |                        |
   +-----+-----+                        |
         |                              |
         v                              v
   short dungeon                  troll territory
         |                              |
         v                              v
   DPS aura unlock              Heal Magic cooldown unlock
```

### Special Events

An endgame boss kill triggers a one-time world event. Example: a puddle spawns, standing in it for 10 seconds = rare aura unlock, gone afterwards. Can be "stolen".

---

## 8. NPCs & Mobs

- Fixed spawn points, designed world (no procedural generation)
- Patrolling mobs with a max chase distance
- Mobs have their own auras — the same targeting rules apply to them (and
  their auras pass through walls too, per the §4 LoS cut)
- Mobs have resistances and their own damage type (see section 4)
- No item drops — only XP and occasionally aura unlocks
- **Stationary-mob placement rule (2026-07-10):** auras ignore walls and a
  stationary mob can neither chase nor leash — so never place stationary
  mobs/hazards where a wall pocket fully covers their aura radius (they
  would be killable at zero risk). Level-design responsibility, same
  posture as patrol-route validity.

### Mob Types

| Type | Description |
|---|---|
| Normal | Solo-doable for a level-appropriate player |
| Elite | For groups, more XP |
| Boss | Strong elite in special places |
| Endgame boss | Raid-level, triggers a special event |
| Harvest mob | Stationary, peaceful or passive. Only damageable by one specific aura (often learned via NPC teaching, see section 6). Gives lots of XP, slow respawn. Example: turnips on a farm field that only the "Harvest" aura can damage. |

### Quest-like Content Through Existing Systems

Aura + mob resistance + NPC teaching together yield an implicit quest system without needing a dedicated one. Schema:

```
  Peaceful NPC  ───── teaches ─────►  Specific aura
        │                                     │
        │ thematically stands                 │ is the only source
        │ near                                │ of damage against
        ▼                                     ▼
   Harvest-mob population  ◄── only harvestable with it ──┘
   (gives lots of XP)
```

Examples of possible variants:
- Farmer + Harvest aura + turnip field
- Fisherman + Fishing aura + fish in the lake
- Lumberjack + Wood-Chop aura + trees
- Miner + Prospecting aura + ore veins

Effect: a soft "profession" identity without a class system, plus an incentive to explore the world to find special NPCs.

⚑ Peaceful NPCs do not yet exist as an entity behavior. The behavior scope (interaction trigger, contextual/stateful dialogue, whether choices affect outcomes) is captured in `backlog.md` item 2; the implementation reuse map (faction = peaceful, mob aggro-sensor = on-approach, `Prop` = static placement, 3.7 event = teaching payoff) is in `roadmap.md` item 9.

### Quests & the Journal

**Decided 2026-07-29 (amends the former "no quest log" rule, §7):** Aura has the concept of **quests, carried by journal entries** — there is a reason essentially every RPG converges on them. The implicit schema above **stays**; the journal layers legibility on top of it rather than replacing it.

- **The journal is Gothic-diary style:** it records what NPCs told the player and what the player undertook — text the player has already seen, nothing more. Quest state lives on the player and is advanced by events, never stored on the NPC (`backlog.md` §42 has the machinery reading; the interaction container was designed so quest offer/accept/turn-in are additive grant kinds, not a schema migration).
- **Still no quest markers.** No map arrows, no minimap pins, no in-world highlighting of goals. Finding the place or mob remains the player's job, guided by the entry's wording and world knowledge.
- **Maybe: a sidebar tracker** — a small HUD list of active journal entries. Under consideration, not decided.
- **Rewards constraint unchanged:** actives, passives, cooldowns, XP — no items (§7). The native quest verbs are kill-N, talk-to, discover-location, harvest-N; fetch quests are impossible by construction.
- Quest state is per-character. The first pass runs **session-scoped, before step 8** (`plan-quests.md` D12, 2026-07-29 — like the spellbook today, wiped on restart); step 8 then persists the live ledger — raise the shape there alongside `backlog.md` §32/§36/§41.

---

## 9. Multiplayer & Cooperation

- Persistent shared world — everything visible, everything shared
- No formal groups in v1 — everyone involved in a fight gets XP
- No PvP initially (5 years out at the earliest)
- No griefing possible by design

### Role Design

**Players cover each other's gaps and fill roles — for all larger challenges this is essential, not optional.** The slot system forces specialization; cooperation fills the gaps.

Examples:
- Light support in the tunnel — one player carries the Light aura, others damage
- Heal support at the boss — the classic tank/DPS/heal dance
- Speed buff while fleeing — see "Fly, You Fools!" in Appendix A

---

## 10. Art Direction & UI

### Art Direction
- **No pixel art**
- **Fully top-down** — exactly from above, not 2.5D, not isometric
- Low-poly with icons for abilities, portraits for players/NPCs
- Reconciling the two: the *world* is top-down, but *entities* (players, NPCs,
  mobs) render as portrait icons — and portraits never rotate at runtime
  (authoring checklist: `manual-content-authoring.md` §4)
- References: Hotline Miami, Gods Trigger, Monaco, Rimworld, Gothic 1+2
- System first, not presentation first

### Tone & Writing (captured idea — proposed authoring guideline)

*(Captured 2026-07-09 — a style-direction **idea**, not a feature and not yet
binding. To be confirmed (and refined with examples) when the content pass,
roadmap item 12, starts authoring real text.)*

**Gritty, grounded, unglamorous — the Gothic 1+2 register.** The world is
dirty and matter-of-fact, not high-fantasy pathos. Gothic is already listed as
inspiration (§1); this sharpens it into an explicit authoring guideline. It
applies to every authored surface: NPC dialogue (including clue NPCs and
barks), sign texts and inscriptions, zone and place naming, and environmental
storytelling.

- NPCs talk like workers, guards, and scoundrels — terse, dry,
  self-interested; nobody proclaims destiny.
- Signs and inscriptions are practical or worn, not ornate ("Way of the
  Warrior" scrawled on a plank beats an engraved prophecy).
- Zone and place names are local and mundane before they are epic — named
  after what's there or who died there, not after abstract grandeur.
- Environmental storytelling favors the shabby and specific (a collapsed
  fence, a poacher's camp, a fresh grave) over the mythic.

This **sharpens the §7 escalation principle rather than competing with it**:
escalation governs *what* appears when — stakes and story weight (a small
nobody in the woods first, dragons and undead only very late); the register
governs *how everything speaks* at every stage. Even late, epic content keeps
the grounded voice — the dragon lands harder because the world around it
stayed mundane. (Reading note: §7's "escalation in tone" means stakes/story
weight escalating, not the writing voice — the voice stays constant.)

### UI Elements (v1.0)
- Resource bar
- XP bar
- Ability bar (active slots 1–4, cooldowns Q/E/...)
- Aura panel (currently selected build from the spellbook)
- Minimap
- Zone chat
- Zoom control (built 2026-07-11): 3 fixed zoom steps (1 = nearest, 3 =
  furthest), buttons on the right edge above the bars. The visible world area
  is a **game constant per step** — browser zoom/window size never grant
  extra sight range (fairness; tech record: TDD §4.7)

```
  +-------------------------------------------------------+
  | Zone: Whispering Wood                    +---------+  |
  |                                          | Minimap |  |
  |                                          |   . P   |  |
  |              .  M  o                     |    .    |  |
  |             [P]                          +---------+  |
  |              ~~                                       |
  |                                                       |
  |                                                       |
  |  Resource [============              ]                |
  |  XP       [===                       ]                |
  |                                          +----------+ |
  |  [1][2][3][4]    Q   E                   | Chat ... | |
  +-------------------------------------------------------+
       Active slots   Cooldowns
```

### Movement Controls
Mouse or WASD — still open.

---

## 11. Scope v1.0

**Must have:**
- [ ] Accounts (register/login)
- [ ] Aura system (base auras, cooldowns, first combos, targeting: selector + target count)
- [ ] Spellbook with milestone and monster unlocks
- [ ] Progression (level, skill system, slots)
- [ ] Persistent world
- [ ] 2–3 zones
- [ ] Mob types: normal, elite, boss
- [ ] UI: resource bar, XP bar, ability bar, aura panel, minimap, zone chat
- ~~Line-of-sight for auras~~ — **cut 2026-07-10** (§4)
- [ ] Campfire
- [ ] Character sacrifice (meta-progression, §5) — **pulled into v1 scope
  (PO, 2026-07-19)**; slots directly after the accounts/persistence step as
  its first consumer (the loop is cheap once persistent account identity
  exists — `plan-intermission-triage.md` item 10)

**Not in v1.0:**
PvP, formal group system, economy, mobile, endgame raid events

---

## 12. Open Design Questions

*(Technical questions: see the separate tech document.)*

### Mechanics
- [ ] Name of the resource (Essence / Focus / Power?)
- [ ] Exact slot count per category and growth per level
- [ ] Are passive and cooldown slots the same thing?
- [ ] Skill points per level final (currently ~30 at max level envisioned)
- [ ] Concrete max level (working [PLACEHOLDER]: 60 — see section 5, Power Source & Curve)
- [x] ~~Does every aura hit everything in range?~~ → **Decided:** selector + target count per aura; default nearest, base auras capped; AoE-all as a late unlock (see section 4, Targeting)
- [x] ~~lowest-HP absolute or percentage?~~ → **Decided:** percentage (relative to max resource)
- [x] ~~Power source: rank system vs. level scaling?~~ → **Decided:** Option A — `effectValue = base(skill level) × f(character level)`; character level carries number inflation (HP values only), skill points stay relative specialization (see section 5, Power Source & Curve)
- [x] ~~Combat RNG (random misses / resists)?~~ → **Deliberately rejected** (not deferred): clashes with the positioning+timing skill expression and punishes slow-ticking auras; the deterministic tag-resist system + ±variance band fill the role. **Crit left explicitly open** — a possible sanctioned upside-only RNG (roadmap step 4 / skill-vocabulary fill)
- [x] ~~Line-of-sight blocking for auras?~~ → **Cut (2026-07-10):** auras pass through everything; walls block movement only. Solo LoS is symmetric (no positional value — an obstacle between two centers blocks both auras); the pack/group value was judged not worth a medium system + perf spike + LoS-aware mob AI. Wall-cheese is handled by mob-AI leash/steering (navmesh stays the escalation if steering demonstrably fails); stationary mobs are protected by the §8 placement rule. Darkness/light unaffected (area-based, purely visual). Decision prep + record: `archive-combat-pacing-recovery.md` §2.C
- [ ] Feast aftereffect buff shape — constraint decided 2026-07-10 (no regeneration persisting into combat, see §3); open options: breaks on taking damage / works only out of combat / a non-healing buff entirely
- [ ] Personal recovery cooldown theme (mini-campfire vs other — mechanics decided in §3, theme is content)

### World & Content
- [ ] Which base auras exist concretely (complete list)
- [ ] Per aura: define selector, initial target count, and level-up axes (content pass)
- [ ] Work out the fixed combination recipes (mechanic built — Phase 9; first recipe: Paladin)
- [ ] Define the damage-type *list* (fire, ice, physical, ...) — the *mechanic* (string tags, resist multipliers) is decided + built (see section 4, Damage Types)

### Controls & UI
- [ ] Movement controls: mouse or WASD?
- [ ] Aura visualization on overlaps

### Meta
- [ ] Seasonal vs. permanent servers?
- [ ] Lore: sacrifice vs. sending away?
- [ ] Sacrifice loss scope in detail: what exactly counts as "essentially everything" lost, and how account-wide unlocks reach a fresh character (direction decided — see section 5)

---

## Appendix A — Spell / Aura / Cooldown Ideas (Collection)

**Moved (2026-07-16):** the collection now lives in the `content-*.md` doc
set (see `docs/README.md` → Content) — one catalog per category, each entry
with a status (idea / designed / in-game):

- Active auras → `content-auras.md`
- Passives → `content-passives.md`
- Cooldowns → `content-cooldowns.md`
- Combination recipes → `content-recipes.md`
- Mobs → `content-mobs.md`
- Zones / world locations → `content-world.md` + per-zone `content-zone<N>.md`
- NPCs → `content-npcs.md`; lore → `content-lore.md`; story → `content-story.md`

References elsewhere in this doc (Purple Rain, Fly You Fools!, Heal Magic
cooldown = `Heal`, Revive, …) resolve into those catalogs.
