# Plan — Content Pass: Zones 1 + 2 (execution step 6, roadmap item 12)

**Status: PLANNED (2026-07-16) — chunked (§13), execution not started.**
Basis: PO design session (external prompt + `zones12-mockup` map image) +
a full code-verification pass (4 parallel audits, this doc's §1). Where the
design session's assumptions differed from code, this doc records the
**verified** state; deltas are marked. All numbers, levels, chances, radii and
names marked (TBD) are **[PLACEHOLDER]**.

PO rulings already taken (2026-07-16):

- **Human Army rescope (clarified):** two mob factions war with each other.
  The Human Army is **friendly to the player** — it must never proactively
  aggro the player; the orcs are hostile to BOTH the player and the Human
  Army. No player-heals-army, no XP-via-army (the alliance/heal machinery is
  NOT required). Player-attacks-friendlies is tolerable short-term, but the
  **ideal is adopted**: the player cannot damage the friendly faction at all,
  while orcs still fight both — that is §9 lift 6 (small), now planned work,
  not an alternative.
- **Dual self-heal:** v1 keeps BOTH the instant capped-partial `Heal` (GDD §3
  combat sustain) AND the HoT `Recover` (personal recovery). Balance the pair
  carefully — recorded as an open flag (§12).
- **Coverage maximalism:** everything built gets used in these zones (slow-
  on-players exempted — machinery gap accepted). Placement decisions taken
  2026-07-16 (interactive): **lifesteal** → spider bite + Elite Wolf;
  **hazards** → tunnel poison pools + orc-front spike barricades (no fire —
  tone rule holds); **destructible obstacles** → brambles gated on
  Harvest (né Turnip-Pull) + a tunnel rockfall (gate TBD), implemented as stationary
  solid mobs with wildcard resists (zero code, see §4); **totem** →
  "Lantern Post" (plantable light totem).

Structural rulings from the chunking session (2026-07-16, interactive):

- **Vertical journey slices** — execution chunks follow the player journey
  west→east; every chunk ends playable + in-game-verifiable (§13).
- **Map workflow: Claude blocks out, PO polishes** — each chunk lands rough
  functional geometry programmatically (bounds, walls, thickets, darkness,
  spawns); the PO does beauty passes in the zone editor anytime (the editor
  round-trips the zone JSON).
- **Lift 1 CUT from v1** — the timed stat-buff effect goes to the backlog;
  **Rally + Flee cooldowns are cut** (Stag / Bandit-ranged replacement drops
  TBD §11 or none). Rally-Drum drummer was already rescoped to `shield_aura`.
- **Recipe net = its own chunk (C7), before the balance pass** — the power
  ceiling is known before calibration.
- **Art: Claude-authored placeholder SVGs per chunk**, PO replaces later
  (swapping an SVG file touches nothing else).

Decided content flows into the `content-*.md` catalogs and
`content-zone1.md`/`content-zone2.md` as sessions land it; this doc is the
working plan + decision record.

---

## 1. Code-verified capability baseline (2026-07-16)

The four verification questions, answered from code:

- **(a) Effect types (22):** `damage_aura, heal_aura, hot_aura, dot_aura,
  slow_aura, resist_aura, shield_aura, light_aura, stat_multiplier,
  resist_passive, instant_damage, instant_dot, instant_hot, instant_shield,
  self_heal, spawn, taunt, detaunt, recall, revive, dash, tick_rate`.
  `shield_aura` + `resist_passive` are wired but have no authored content yet.
  Berserker / execute / crit / lifesteal / variance are **modifiers on damage
  payloads**, not effect types. Selectors: `nearest` (default),
  `lowest_health`, `all`; target caps are per-effect. Damage tags are
  free-form strings (`fire` + implicit `physical` authored today); the `"*"`
  wildcard resist on mob definitions makes "resists all except X" expressible.
- **(b) Unlock sources: all built** (step 5). Milestones =
  `skills/milestone-unlocks.json`. Kill-drops = per-kill random chance, rolled
  independently by every participant + their recent healers; **no pity / no
  guaranteed-first mode exists** (chance 1.0 = guaranteed each kill). NPC
  teaching = ordered level-gated teachings + required `TooLowLine` (the
  conditional two-line NPC works verbatim today). World clues = lore-only NPCs
  (lines, no teachings) — signpost-only **by construction**; clues cannot
  grant.
- **(c) Allied non-player faction:** mob-vs-mob warring factions work today
  (`hostileTo`; predator/prey ship already). A *player-allied* faction
  (healable, damage-immune, XP-linked) is NOT expressible — resolved by the
  PO rescope above.
- **(d) Boss scripting:** encounter-controller spine is real (OnTick /
  OnMobDeath; SpawnMob, timers, SetInvulnerable, SetFleeOverride, threat
  seams) and the throwaway smoke encounter proves multi-phase end-to-end
  (invuln gate → add wave at 50% → re-engage → respawn/reset timers). **No
  designed boss exists; no enrage primitive exists.** §B includes building
  the first real boss script.

Other verified facts this plan relies on: trees block movement via prop
`blocksMovement`; darkness = `zone.darkAreas` circles, purely client-visual;
corpse/campfire-dwell-respawn/revive-at-corpse all built; out-of-combat regen
gate (5 s) live; mob XP per-mob configurable down to 0; owned-summon damage
credits the owner; a mob's killing blow still pays player participants.

**Not built (relevant gaps):** named sub-regions; destructible props
(backlog §8); any timed stat-buff (speed/damage buff as cooldown or aura);
light from a passive slot; `"*"` wildcard in transient buff resists; aura
radius modifiers; enrage; pity drops; mob-owned spawns (mob-cast `spawn`
would be owner-less — irrelevant here, boss adds use encounter `SpawnMob`).

## 2. Geography

One contiguous playfield, **authored as a single zone JSON** (the engine
loads exactly one zone per boot; named sub-regions are unbuilt). "Zone 1"
(west) and "Zone 2" (east) are design labels in this doc, not engine objects.
The proving-grounds zone remains a separate `-zone` boot option.

Per the map mockup:

- **Zone 1 (west):** Rübenfeld farm + 2 houses SW (start, campfire); dark
  forest NW (darkness + navigation thicket; Hermit deep inside; Elite Wolf);
  spider staging area N at the tunnel mouth (lit); Dark Tunnel N (dark,
  spiders inside) → Zone 2; Kobold Hideout SE-center; dashed paths from the
  farm forking toward the tunnel (N) and the middle road (E).
- **Zone 2 (east):** 4-house village center (campfire; purpose open, §11);
  dark forest NE containing the Bandit Camp; City Gates E (Zone 3 teaser,
  blocked by guards); Human Army vs Orc Army front S; blocked roads N + S and
  the S exit past the orcs.
- **Transitions Z1 → Z2:**
  - **Dark Tunnel (north) — SOLO path.** Dark (visual only, GDD §7), spiders.
    Light = advantage, never a requirement.
  - **Bandit Horde (middle) — GROUP gate.** Bandit pack with large-radius
    auras + a healer that makes it un-soloable at level — punishes facetank,
    showcases tank/heal/dps. WoW-Classic resolution: no key-lock, stays open,
    trivializes when over-levelled.
- **Darkness** is authored as circles — the map's gray ellipses become 2–3
  overlapping `darkAreas` circles each.
- **Trees block movement** (`blocksMovement: true`) — the dark forests are
  thickets, not just dark. Blocked exits = prop walls/terrain within bounds.
- Tone: EXTREMELY grounded, Gothic 1/2 register. **No magic / supernatural /
  elemental content in these zones. Tags used: `physical`, `poison`, `bleed`
  — NO `fire`.** (Campfires as world objects are fine; no fire *damage*.)

## 3. Story spine (NPC interaction = lines on approach)

1. Peasant start at Rübenfeld. Farmer: "You're new here — pull some turnips
   for me first." Start loadout = **Turnip-Pull only**. *(Dev builds
   currently spawn with DamageAura — the content pass flips the default, as
   recorded in `archive-content-zone1-capture.md`.)*
2. Player harvests turnips (XP only). Field-edge pest mobs the player cannot
   fight yet.
3. Player reaches L2 [PLACEHOLDER].
4. Return to Farmer → teaches **Damage + Recall** (ordered teachings,
   requiredLevel 2 — mechanism exists) and sends the player toward the city.
   **⚑ GDD amendment on adoption:** this moves Damage from the recorded L1
   milestone (GDD §5 peasant-onboarding resolution) to farmer-taught@L2 —
   part of the full milestone-table rewrite (§11). GDD §5 must be updated
   when this lands, not silently.
5. Fight through to the Z2 City Gates. Guard (lore-only NPC, quest
   completion): can't let you in, will pass word inside, points south.
6. Front NPC (level-gated — the built `TooLowLine` mechanism, verbatim):
   too low → "Come back later"; high enough → teaches the **Front-Aura**
   (§A). Level anchor TBD (§11).
7. **Ork World Boss** at the front (§B). Kill → large XP + **Boss-Aura**
   (kill-drop, chance 1.0 — every participant + recent healers receive it,
   which is exactly right for a world boss). Boss dead = v1 "completed" —
   session-local messaging only (no persistence before step 8).

**Human Army beat (rescoped + clarified per PO):** the front is ambience —
humans and orcs war via factions. Required shape: Human Army **never
proactively aggros the player** (its `hostileTo` excludes `aligned` —
expressible today); orcs are hostile to the player AND the Human Army. The
player fights orcs alongside the army but cannot heal or be credited through
it. **Adopted ideal (§9 lift 6):** the player cannot damage the friendly
faction either, while orcs still aggro the player. Until that small seam
lands, current code lets player damage hit friendly soldiers (and hit
soldiers retaliate via threat) — tolerated interim, army XP = 0.

## 4. Mob roster

Factions to author (content-only): `wildlife_predator` / `wildlife_prey`
(exist as predator/prey), `kobold`, `spider`, `bandit`, `human_army`, `orc`.
Hostility matrix values TBD; key edges: predators hunt prey + players;
human_army ↔ orc mutually hostile; human_army NOT hostile to `aligned`;
orc hostile to `aligned` + `human_army`.

| Mob | Zone / location | Behavior (system) | Aura(s) | Tags | Drops | Feasibility |
|---|---|---|---|---|---|---|
| Turnip | Z1 Rübenfeld | stationary, passive, no retaliation | none (harvest) | resists `{"*":0,"turnip":1}` | XP only | ✓ today — first authored mob `resistances` + wildcard |
| Kobold (melee) | Z1 Hideout | aggressive, flees low HP (`fleeBelowHealthRatio`) | small radius, fast tick | physical | Light (low %) | ✓ today |
| Kobold (ranged) | Z1 Hideout | aggressive, flees low HP | large radius, slow tick, lower dmg, uncapped (`all`) | physical | Light (low %) | ✓ today — per-effect tick/radius contrast |
| Wolf | forests Z1+Z2 | aggressive, packs, hunts boar/stag (faction predation) | bite, mid radius | physical | Swift | ✓ today |
| Bear | forests Z1+Z2 | aggressive, tanky | slow heavy swipe; **berserker-modified damage aura** ("wounded animal rages") | physical | Thick Hide + Berserker-aura | ✓ today — berserker rescoped from cooldown to aura modifier (§5 note) |
| Boar | forests | passive until attacked (prey faction, threat retaliation) | charge (flavor: aggro chase; mob cooldown-AI unverified — §12) | physical + bleed | Hardy + Dash | ✓ today (charge = flavor) |
| Stag | forests | passive, flees | weak kick | physical | TBD §11 (was Flee — cut 2026-07-16) | ✓ today (flee-always = prey behavior) |
| Elite Wolf | Z1 dark forest | aggressive, stronger; carries **execute + lifesteal** modifiers (feeds on wounded prey — coverage homes) | large-radius aura | physical | Long-Range Strike | ✓ today ("telegraphs" = larger radius + slow tick, no telegraph system exists) |
| Spider (normal) | Z1 tunnel + mouth | aggressive; bite carries **lifesteal** (drains prey — feeding, PO 2026-07-16) | damage aura | physical | Antivenom (low %) | ✓ today. Note: lifesteal rides damage payloads only — dots can't carry it, hence the normal spider, not the venom dot |
| Spider (venom) | Z1 tunnel | aggressive | `dot_aura` leaving a DoT | poison | Antivenom | ✓ today — first `poison` tag |
| Bandit (melee) | Z2 horde + camp | aggressive | blades | physical + bleed | — | ✓ today |
| Bandit (ranged) | Z2 horde + camp | aggressive | volley, large radius | physical | TBD §11 (was Rally — cut 2026-07-16) | ✓ today |
| Bandit (healer) | Z2 horde + camp | heals allies (same-faction heal_aura, `lowest_health` selector — coverage home) | heal aura | — | — | ✓ today (support-mob precedent exists) |
| Bandit Horde | Z2 middle gate | encounter group; healer makes it a gate | "Rally-Drum" drummer: `shield_aura` on allies ("war drums embolden") — first authored shield_aura (rescope adopted with the lift-1 cut, 2026-07-16) | physical | Taunt | ✓ today |
| Elite Bandit | Z2 camp | aggressive, stronger; **crit** modifier candidate (coverage home) | large physical aura | physical | Damage-Burst | ✓ today |
| Human Army | Z2 front | allied-vs-orc mob faction; not player-hostile; XP 0 | physical | physical | — | ✓ today (rescope) |
| Orc | Z2 front | very strong, tanky, **XP very low** | high dmg, large radius | physical | — | ✓ today (XP per-mob configurable) |
| Ork World Boss | Z2 front | scripted multi-phase, always present, ~30 min respawn | see §B | physical | Boss-Aura (chance 1.0) | spine ✓, script = §B work |
| **Poison pool** (fixture) | Z1 tunnel | environmental hazard: unkillable, non-blocking, always-on aura (shipped brazier pattern: collisionLayer Viewport-only) | small dot/damage aura | poison | — (XP 0) | ✓ today — brazier machinery, reskinned |
| **Spike barricade** (fixture) | Z2 orc front | environmental hazard shaping the boss approach; brazier pattern | damage aura | physical + bleed | — (XP 0) | ✓ today |
| **Bramble wall** (obstacle) | Z1 shortcut(s) | destructible obstacle = stationary SOLID mob (collisionLayer incl. player-static — angry-mammoth precedent), passive, no retaliation, respawns via spawn point | none | resists `{"*":0,"harvest":1}` — **only Harvest clears vegetation** | — (XP 0) | ✓ today — zero code; starter aura keeps lifelong utility |
| **Rockfall** (obstacle) | Z1 tunnel side passage | same solid-mob pattern; hides an optional secret on the solo path | none | wildcard resist, gate aura **TBD (§11)** | — (XP 0) | ✓ today |

**Ecology:** wolves hunt boars/stags via faction hostility (predation ships
today). Participation XP for mob-vs-mob kills works exactly as intended in
current code: XP requires damage/heal contribution (participants ledger);
proximity grants nothing; a predator's killing blow still pays contributing
players. A post-predation wolf remains hostile — accepted, a real fight.

## 5. Player abilities & origins

Statuses verified against code. "today" = machinery + (where named) content
exists; "content-only" = new JSON, no code; "⚑ lift" = §9 code work.

### Auras (8)

| Name | Origin | Building block | Status |
|---|---|---|---|
| Harvest *(né Turnip-Pull, renamed C2 Part 2)* | start loadout (equipped, not active) | damage_aura, damageTags `["harvest"]`, gated | in-game |
| Damage | Farmer @L2 | damage_aura (= shipped DamageAura) | today |
| Heal | milestone | heal_aura (= shipped HealAura; never self, GDD §3) | today |
| Tank (Name TBD) | milestone | resist_aura over the zone tag set `[physical, poison, bleed]` — works today; wildcard-`*` buff variant is a ⚑ lift (§9) | content-only |
| Light | Kobold drop (low %) | light_aura (shipped) | today |
| Long-Range Strike | Elite Wolf drop | damage_aura, larger radius / lower dmg, **cap 1** (WildAura precedent + per-effect MaxTargets) | content-only |
| Front-Aura (Name TBD) | Front NPC, level-gated | multi-effect, deliberately overstrong — §A | machinery today |
| Boss-Aura (Name TBD) | Ork boss drop | combo ingredient (≥3 recipes, net TBD §11) | machinery today |

### Passives (5)

| Name | Origin | Building block | Status |
|---|---|---|---|
| Swift | Wolf drop | stat_multiplier movementSpeed (shipped) | today |
| Hardy | Boar drop | stat_multiplier maxHealth | content-only |
| Thick Hide | Bear drop | resist_passive `[physical]` (first authored resist_passive; note: physical = the default tag, so this resists most of the zone) | content-only |
| Antivenom | Spider drop | resist_passive `[poison]` | content-only |
| Torch | Hermit NPC (approach) | light from a **passive** slot | ⚑ lift (§9) — light only streams from the active-aura slot today |

### Cooldowns (PO rulings: both self-heals stay; Rally + Flee CUT 2026-07-16)

| Name | Origin | Building block | Status |
|---|---|---|---|
| Heal (instant) | milestone | self_heal, capped-partial (shipped; GDD §3 combat sustain) | today |
| Personal Recovery | early milestone | instant_hot (shipped Recover; make self-only per its own note) | today |
| Haste | milestone (first cooldown) | tick_rate (shipped) | today |
| Recall | Farmer @L2 | cast-time + interrupt (shipped) | today |
| ~~Flee~~ | ~~Stag drop~~ | speed+ self buff & radius− | **CUT from v1 (PO 2026-07-16)** — rode lift 1 (+ the radius− half rode lift 4); Stag replacement drop TBD §11 |
| Dash | Boar drop | dash (shipped) | today |
| Taunt | Bandit-Horde reward (kill-drop) | taunt (shipped) | today |
| ~~Rally~~ | ~~Bandit (ranged) drop~~ | timed ally move-speed buff | **CUT from v1 (PO 2026-07-16)** — rode lift 1, now backlogged; Bandit-ranged replacement drop TBD §11 |
| Damage-Burst | Elite Bandit drop | instant_damage (shipped NovaBurst pattern); candidate `bleed` tag → exercises multi-tag hits | today |
| ~~Berserker~~ → Berserker-aura | Bear drop | **rescoped**: berserker is a damage-payload modifier, not a state cooldown → Bear drops a berserker-modified damage AURA instead | content-only |
| **Lantern Post** (11th, PO 2026-07-16) | Hermit (2nd teaching) or milestone — origin TBD §11 | SummonTotem spawn effect; totem def carries a **light-aura loadout** — deployable light support without giving up the active damage aura | content-only (totem + spawn shipped) |

Balance note (PO): instant Heal vs. HoT Recovery is a deliberately
overlapping pair — balance carefully (§12 flag).

**Milestone-table rewrite (TBD §11):** the shipped table (L2
HealAura/Heal/Recall … L5 Immolation/Ignite … L8 Taunt/Fade) is wholesale
replaced by this plan's origins — it currently milestones fire skills and
several skills this plan reassigns to drops/teachings. Multi-source and
re-grant are safe/idempotent in code.

## 6. NPCs (all built mechanisms; lines TBD)

| NPC | Place | Function | Mechanism |
|---|---|---|---|
| Farmer | Rübenfeld | start line; @L2 teaches Damage + Recall, sends player east | ordered teachings, requiredLevel 2, TooLowLine |
| Hermit | Z1 dark forest, deep | teaches Torch: "Oh, all alone out here? Here, take this." | teaching (⚑ Torch lift §9) |
| City guard | Z2 gate | quest completion line; Zone 3 teaser | lore-only NPC |
| Front NPC | Z2 south, off-side | level-gated Front-Aura grant | teaching + TooLowLine (works verbatim today) |
| Village healer | Z2 village | **PURPOSE OPEN** — do not invent; Zone 2 session (§11) | — |
| **Dog (adopted)** | Z1 dark forest (exact spot TBD) | says "Woof", teaches SummonCompanion — the player-companion showcase; already in `content-npcs.md` | teaching |

## 7. Campfires

Two fixed world campfires: **Rübenfeld** (start) and the **Z2 village**.
Dwell-bind respawn (3 s) + campfire heal/light aura are built. Only fixed
world campfires are respawn points (GDD §3).
**FLAG:** north Z1 (tunnel/dark forest) is far from the Rübenfeld fire —
long walk-back on death. Accepted as death penalty; a third campfire at the
forest edge is the lever if playtests say too punishing.

## 8. World clues (signpost-only — lore-NPC form)

Clues are lore-only NPCs (lines, no teachings) — they cannot grant by
construction. Visuals: an NPC entity can wear any SVG, so literal signs are
possible (sign SVG as the NPC's entity type — minor content/asset work).

- Kobolds hoard "shiny stuff" (→ Light drop).
- The middle road is suicide — take the tunnel (→ group gate warning).
- Something big prowls the dark forest (→ Elite Wolf).

## 9. Required code lifts (each with a rescope alternative)

| # | Lift | Needed by | Scope sketch | Alternative |
|---|---|---|---|---|
| 1 | **Timed stat-buff effect** (speed first) — a buffs-plumbing extension (transient buff system exists for resists/shields) | Rally, Flee (speed+), Rally-Drum option A | new effect type + buff fold into movement speed + expiry | **ALTERNATIVE CHOSEN (PO 2026-07-16):** Rally + Flee cut from v1, lift backlogged; Rally-Drum → shield_aura drummer (works today, gives shield_aura its first content) |
| 2 | **Passive light** — fold LightRadius from passive slots, stream on wire | Torch | small | Hermit teaches the Light *aura* variant instead (worse: loses the trade-off resolution GDD §7 wants) |
| 3 | **Wildcard `*` in transient buff resists** | Tank aura as true wildcard | small (parser accepts, buffs don't consume) | Tank = resist_aura over `[physical, poison, bleed]` — equivalent within these zones, works today (chosen default) |
| 4 | Aura radius modifier | Flee (radius−) | new mechanism | **MOOT (2026-07-16):** Flee itself cut with lift 1 — no consumer remains |
| 5 | Enrage seam (timed damage multiplier for encounters) | §B boss, if enrage wanted | small seam on mob + encounter verb | design the boss without enrage (phases/adds/invuln suffice) |
| 6 | "Friendly-to-players" faction flag (player damage skips faction) — **ADOPTED (PO 2026-07-16, ideal)** | Human Army | small: flag + player-damage eligibility check | interim until it lands: collateral tolerated, army XP 0 |

Explicitly NOT needed for v1: alliance/heal machinery (PO rescope), named
sub-regions (one zone file), destructible props (deferred, see §10),
mob-owned spawns (boss adds via encounter SpawnMob), pity drops (§11).

## 10. Coverage table (every built system → a home or an argued absence)

| System / capability | Where exercised in Z1+2 | Absence justification / proposal |
|---|---|---|
| damage_aura | Damage, Harvest, Long-Range Strike, most mobs | — |
| heal_aura | player Heal aura, Bandit healer, campfires | — |
| hot_aura | Bandit healer's lingering mend (adopted under coverage maximalism, alongside/instead of plain heal_aura — pick during authoring) | — |
| dot_aura | Venom spider (poison) | — |
| slow_aura | — | **no home** (PO-accepted exemption): mob-cast slow on players doesn't work today (players have no ApplySlow; known eligibility gap). Defer + backlog the lift. A spider web-slow is the natural future home |
| resist_aura | Tank aura (tag-set form) | — |
| resist_passive | Thick Hide, Antivenom (first authored) | — |
| shield_aura | **Rally-Drum drummer** ("war drums embolden" — shields bandit allies) — adopted; first authored shield_aura | Rally/Flee cooldowns cut from v1 with lift 1 (backlogged, 2026-07-16) |
| light_aura | Light aura, campfires, Torch (post-lift) | — |
| stat_multiplier | Swift (speed), Hardy (maxHealth), ToughPassive (damageReduction) — third home TBD in the rewrite/drops (§11; coverage maximalism) | — |
| instant_damage | Damage-Burst | — |
| instant_dot | bleed-tagged player cooldown candidate ("Lacerate", name TBD) — slot in the milestone rewrite or as a bandit-camp drop (§11; coverage maximalism) | Ignite itself stays out (fire) |
| instant_hot | Personal Recovery | — |
| instant_shield | Barrier — slot in the milestone-table rewrite (level TBD §11; coverage maximalism) | — |
| self_heal | instant Heal (kept per PO) | — |
| spawn | SummonCompanion via Dog NPC (§6, adopted); SummonTotem via **Lantern Post** (PO 2026-07-16) | — |
| taunt / detaunt | Taunt (horde reward); Fade as milestone (group-gate utility — adopted under coverage maximalism, level TBD in the rewrite) | — |
| recall | Recall (Farmer) | — |
| revive | high-level milestone in v1 (adopted under coverage maximalism) — the bandit-horde group gate produces the deaths it answers (GDD §3); level TBD in the rewrite | — |
| dash | Dash (Boar drop) | — |
| tick_rate | Haste (milestone) | — |
| cast-time + interrupt | Recall, Revive | — |
| Selectors: nearest / lowest_health / all | default everywhere / Bandit healer (+Front-Aura candidate) / Kobold ranged volley (uncapped) | — |
| Per-effect target caps | Long-Range Strike (hard cap 1) | — |
| Multi-effect skills | Front-Aura; campfire (heal+light) | — |
| Two-zone (concentric) emulation | Rally-Drum inner/outer if adopted | single-effect two-zone doesn't exist; emulation via multi-effect radii |
| Per-effect tick rates | Kobold ranged (slow) vs melee (fast); PaladinAura precedent | — |
| Damage tags + resists | `harvest` gate tag (Turnip/Bramble), `poison` + Antivenom, `bleed` (boar/bandits), `physical` + Thick Hide | `fire` deliberately absent (tone rule §2) — reserved for later zones |
| Wildcard resist (`*`) | Turnip mob (`{"*":0,"harvest":1}`) | — |
| Faction target flags | allies (healer mob), enemies (everything), self (Recover) | `targetsStructures` flag itself stays unused: the destructible-obstacle need is served by the solid-mob pattern (below), and no placeable-damage beat exists in v1 |
| Milestone unlocks | rewritten table (§11) | — |
| Kill-drops (chance) | Light/Swift/Hardy/etc. (low %), Boss-Aura (1.0) | pity/guaranteed-first: not built — recorded TBD (§11) |
| NPC teaching plain / conditional | Hermit, Dog / Farmer @L2, Front NPC (TooLowLine) | — |
| Signpost clues | 3 clue NPCs (§8) | — |
| Patrol / wander | Boars, wolf packs | — |
| Aggro / threat | all combat mobs | — |
| Flee-at-low-HP | Kobolds | — |
| Flee-always (prey) | Stag | — |
| Support / healer mobs | Bandit healer | — |
| Mob factions + mob-vs-mob | wolves-hunt-prey; Human Army ↔ Orc war | — |
| Obstacle steering | forest thickets | — |
| Hazard fixtures (brazier pattern) | **Tunnel poison pools** (poison) + **orc-front spike barricades** (physical+bleed) — PO 2026-07-16 | no fire hazards — tone rule holds |
| Companions: player path | SummonCompanion (Dog NPC, adopted) | — |
| Companions: NPC/encounter path | Ork boss adds via encounter SpawnMob | mob-cast spawn skills: not needed (owner-less anyway) |
| Encounter controller + multi-phase boss | Ork World Boss (§B) | — |
| Destructible aura-gated obstacles | **Bramble wall** (Harvest-gated shortcut) + **tunnel rockfall** (gate TBD) — stationary solid mobs w/ wildcard resist, PO 2026-07-16 | backlog §8's placeable-based machinery stays unbuilt — the mob pattern covers the need with zero code |
| Death / corpse / campfire respawn / revive window | bandit-horde deaths + walk-back flag (§7); Revive milestone | — |
| Darkness / light | Z1+Z2 dark forests, tunnel; Light/Torch/campfires | — |
| Recovery (campfire, personal, regen gate) | both campfires; Heal+Recover pair; regen gate live | — |
| Modifiers: execute / berserker / crit / lifesteal / variance | Elite Wolf / Bear aura / Elite Bandit (crit = the sanctioned RNG exception) / spider bite + Elite Wolf feeding (PO 2026-07-16) / roster-wide variance bands | — |

## 11. Deliberately TBD (do not decide here)

- **Milestone reordering** — full rewrite of `milestone-unlocks.json` against
  this plan's origins; all levels placeholder. (First cut in C1, final in C8.)
- **Recipe net** — Front-Aura + Boss-Aura combinations (≥6 total, incl.
  whether they combine with each other) — **chunk C7** (own session, before
  the balance pass).
- **Stag + Bandit-ranged replacement drops** (or none) — open since the
  Rally/Flee cut (2026-07-16).
- **Front-NPC level anchor** — compute against the v1 level curve once
  `growth` + max level are locked (⚑ open sim-harness PO item).
- **Village healer purpose + village purpose** — Zone 2 session.
- **Per-skill kill-drop mode** — only random-chance exists; pity /
  guaranteed-first would be code. Decide if needed after drop-rate feel.
- Faction hostility matrix values, drop chances, all levels/radii/numbers.
- **Rockfall gate aura** (§4) — which skill/tag opens the tunnel side passage.
- **Lantern Post origin** — Hermit second teaching vs. milestone.
- Homes inside the milestone rewrite for: Barrier (instant_shield),
  ToughPassive (damageReduction), the bleed instant_dot candidate, Fade and
  Revive levels.
- Dog NPC exact placement in the Z1 dark forest.

## 12. Open flags (record, don't resolve)

- **XP faucets to watch:** ambient predation participation XP (gated by the
  contribution rule — verified). The army-front-healing faucet is dead by
  rescope.
- **Player damage hits Human Army** (interim only): tolerated + army XP 0
  until §9 lift 6 (adopted) lands; hit soldiers retaliate via threat until
  then — never proactive aggro either way.
- **Light single low-chance source** gates three content strands (Z1 dark
  forest, tunnel advantage, Z2 camp) — accepted; revisit if frustrating.
- **Dual self-heal balance** (PO ruling): instant Heal (combat sustain,
  capped-partial per GDD §3) vs. Recover (recovery) — keep distinct roles.
- **Walk-back from north Z1** (§7) — third-campfire lever.
- **Sim-harness collision:** chunk-4 findings say facetank efficiency ≈0.22
  at current regen (~1 %/s) vs. the ~90 %-facetankable starter-normal working
  target — the kobold/wolf tier of THIS plan is what that target applies to.
  The regen/downtime knobs (open PO item) must be settled during this
  content pass's balance work.
- Mob cooldown-firing by AI (boar "charge" as a real dash) — unverified;
  treat as flavor until checked.

---

## §A Ticket — Front-Aura power exception

**The Front-Aura is a DELIBERATE power outlier** — the game's
"endgame-gear equivalent", expressed as a spellbook entry (an aura), so it
does not violate the no-items pillar (GDD §1 pillar 5).

- Intentionally very strong and multi-purpose (multi-effect skill —
  machinery shipped, no effect-count limit).
- Curated combo ingredient: with the Damage aura OR the Heal aura OR a Burst
  cooldown it produces, respectively, the best damage aura / best heal aura /
  best cooldown in the game.
- **This deliberately INVERTS the Paladin calibration** (combo = ~70 % of its
  parts) and the §4 side-grade rule ("different, never better"). It is the
  **first sanctioned power reward** — a named exception, not a precedent
  erosion.
- **Balance consequence: the Front-Aura and its combos set the game's POWER
  CEILING.** Everything else balances below it. It is a fixed reference
  point for the balance pass and must be added to the sim-harness presets
  when authored — never a surprise.
- **On adoption this ticket amends:** GDD §4 (side-grade rule gains the
  sanctioned-exception clause) + GDD §5 (power ceiling reference); the
  sim-harness preset list.

## §B Ticket — Ork world boss

- **Always present, ~30 min [PLACEHOLDER] respawn — explicitly NOT the
  timed-world-state system (roadmap 9f).** No kill-counter, no spawn-timer
  trigger semantics. **On adoption: remove 9f from v1 scope in roadmap.md.**
  The respawn pattern (encounter-owned tick timer + `SpawnMob`) is already
  proven by the smoke encounter's guard-respawn timers.
- **A real multi-phase scripted fight** (phases / adds / no fat stat-block),
  built on the encounter spine. Verified state: spine + a throwaway smoke
  encounter demonstrating invuln gates, HP-threshold add waves, re-engage,
  and reset timers — **this ticket includes writing the first designed boss
  script** (a Go encounter struct, per the spine's model). No enrage
  primitive exists: either add the small seam (§9 lift 5) or design the
  fight without enrage.
- Drops the **Boss-Aura** (chance 1.0 → all participants + recent healers;
  curated combo ingredient, ≥3 recipes — net TBD §11).
- Killing it = the v1 completion beat. Session-local only — no persistence
  before accounts (step 8).

---

## 13. Execution chunks (decided 2026-07-16)

One chunk = one execution session (per working style). Slicing is
**vertical journey slices** west→east: every chunk ends playable and
in-game-verifiable. Ordering facts: the live `f(L)` multiplier must land at
the top of step 6 (tdd §4.1, plan-sim-harness §5 Decision 5), and every mob
must be authored **tier + baseline** (numbers derived, never raw) so the
growth working-lock (1.12 × 30) stays a one-knob change — hence C0 before
any content.

### Cross-cutting rules (apply to every chunk)

- **Mobs are authored tier + baseline** via the C0 mechanism — raw stat
  numbers in mob/mob-skill JSON are a review reject.
- **Geometry:** the chunk lands rough functional block-out programmatically
  (bounds, walls, thickets, darkness circles, spawn points); the PO
  polishes in the zone editor at leisure — the editor round-trips the zone
  JSON, so polish never blocks or conflicts with a chunk.
- **Art:** placeholder SVGs (recolors/variants of existing assets, distinct
  silhouettes, correct sizing) authored in-chunk; real art replaces files
  later without touching anything else.
- **Sim honesty:** each content chunk adds its mobs/skills to the
  sim-harness presets when it lands; the full calibration is C8.
- All numbers stay [PLACEHOLDER] until C8.
- `content-*.md` catalogs + `content-zone1.md`/`content-zone2.md` are
  updated as chunks land (placement truth = zone JSON).
- C2/C4 are the biggest chunks and **may split at execution time** if a
  session runs long; the split point is pre-marked in their scope.
- Per-chunk in-game verification checklists are written in each execution
  session's plan statement (the lists below are the acceptance beats).

### C0 — Scaling & authoring foundation (code only, TDD, no content)

> **✅ DONE + VERIFIED IN-GAME 2026-07-16** (execution session). Shipped:
> shared formula `pkg/berryhunter/curve` (sim aliases it — drift-free);
> conf `game.player.levelGrowth`/`maxLevel` (defaults = `curve.Default()`
> in `cfg.ReadConfig`, the SINGLE default point so player + mob derivation
> can never diverge); player `MaxHealth = base × f(L) × (1+bonus)`
> (multiplicative passive — PO pick), level cap 30, `PowerScale()`;
> SkillSystem seam `casterPowerScale` × damage/heal/dot/hot/shield/flat
> self-heal/selfDamageHP (fraction-of-max self-heal rides max HP, not f
> twice; owned summons compose `SummonPower × f(ownerLevel)` — PO pick);
> mob JSON `tier` (label) + `curveLevel` + `factors.baseMaxHealth`
> (per-mob baseline — PO pick), loader derives maxHealth + def PowerScale,
> **raw `factors.maxHealth` hard-fails**; all 13 existing mob JSONs
> migrated at `curveLevel: 1` (byte-identical numbers — PO pick;
> proving-boss=boss, mammoths=elite as pure labels); simharness presets
> apply def PowerScale. Verified: full suite + race green, chunk 1–4 sim
> pins byte-identical, harness spot-run matches (eff ≈0.22 flat), in-game:
> L1 100/100 → XP 50000 → L20 861/861 (=100×1.12¹⁹) → XP cap → L30
> 2675/2675, XP pinned. Deferred to C8: summon max-HP scaling
> (`maxHealthPerOwnerLevel` stays linear vs exponential f — falls behind
> at high level).

- Live `f(L)`: conf-driven `growth` (1.12) + `maxLevel` (30) [WORKING LOCK];
  global multiplier on HP-side **player** values only — skill damage / heal /
  self-HP + player maxHealth; never radius, tick rate, or target count
  (tdd §4.1).
- Tier+baseline mob authoring: mob definitions gain `tier` + baseline
  values; derived numbers cover `maxHealth` AND the mob's skill damage
  values (both must derive, or a growth change still re-authors damage —
  design point resolved in this chunk's plan).
- Check the sim-harness batteries/pins stay coherent after live wiring
  (the harness drives the real ECS — player-side scaling now flows in).
- Verify: `go test ./...`, harness spot-run, in-game level-up shows scaled
  values.

### C1 — Z1 farm start beat (story §3 beats 1–4)

> **✅ DONE + VERIFIED IN-GAME by PO 2026-07-17 (committed `a494bc26`).**
> Shipped beyond the scope below (PO-approved in-session): the **rect-prop
> lift** — `phy.SolidAABB` (static solid rectangle, mirror of the border
> InvAABB; TDD incl. through-Space pins), prop body = `radius` XOR
> `width`+`height`, `model/prop.NewRect` (wire radius = max half-extent),
> mob-steering `boxRepulsion`, zone-editor rect markers + hit-test — so the
> farm houses are true solid rectangles and C4 (village, gates) reuses it.
> PO decisions: milestone first cut also slots **Recover @3 + Haste @4**;
> zone file stem = **`world`**; bounds 144×72 [PLACEHOLDER] — condensed
> ×0.6 from the original 240×120 (PO 2026-07-18; all zone coordinates +
> darkness radii scaled, prop/NPC/gameplay radii kept). Sim pins stay
> byte-identical (sim's soloRegistry follows the start-loadout name →
> "TurnipPull"). **Gated damage tags (same-day follow-up, PO decision):**
> `gatedDamageTags` on the damage payload flips the resist default to
> opt-in — the hit only damages targets whose BASE resistances explicitly
> name a hit tag (wildcard ≠ opt-in; `skills.GateOpensFor`); Turnip-Pull
> carries it, so combat mobs need NO per-mob `"turnip": 0` entry, ever
> (the interim rule was recorded and then replaced the same day). Gate
> flows Damage.Gated / Factors.Gated on both caster paths; players never
> opt in (no PvP leak); gating the implicit [physical] default hard-fails
> at parse. **In-game fix (PO first join panicked):** the player VIEWPORT
> is a dynamic `phy.Box` querier, and a blocking rect prop carries the
> viewport layer for streaming — `SolidAABB.intersectWithBox` was a panic
> stub; now plain AABB overlap (boxes never resolve physically), pinned by
> viewport-streaming tests + a browser join smoke run (join → in-world at
> the farm, no server panic, no client errors). Beat-2 field-edge pests are
> the kobolds — C3, not authored here. GDD §5 amendment landed (onboarding
> text, dev note, draft milestone table). Zone authored via a deterministic
> generator script (scratchpad); the committed JSON is the artifact, the
> editor round-trips it for PO polish.

- New playfield zone JSON in `api/zones/` (full Z1+Z2 bounds; farm-area
  block-out: 2 houses, turnip field, Rübenfeld campfire, path stubs N + E).
- Turnip mob (first authored `resistances` + `{"*":0,"turnip":1}` wildcard);
  Turnip-Pull aura; **start-loadout flip** to Turnip-Pull only (dev
  DamageAura default retired, per `archive-content-zone1-capture.md`).
- Farmer NPC: start line + ordered teachings **Damage + Recall @L2** with
  `TooLowLine`. The **GDD §5 amendment** (Damage moves from L1 milestone to
  farmer-taught@L2) lands here, not silently.
- Milestone-table first cut: de-fire the shipped table, remove skills this
  plan reassigns to drops/teachings (full rewrite continues over chunks,
  final in C8).
- Verify: fresh spawn → only Turnip-Pull → pull turnips → XP → L2 → Farmer
  teaches → Recall works → sent east.

### C2 — Z1 wildlife + dark forest

> **PART 1 (wildlife + factions + forest block-out) DONE + VERIFIED IN-GAME
> by PO 2026-07-17** — the pre-marked split was taken at the checkpoint;
> Part 2 (forest interior: lift 2 + Torch + Hermit, Dog, brambles) is the
> next execution session. Shipped: `wildlife_predator`/`wildlife_prey`
> factions; Wolf/Bear/Boar/Stag/EliteWolf (tier+baseline, berserker /
> execute+lifesteal / bleed authored on the mob skills); drops Swift /
> ThickHide+BerserkerAura / Hardy+Dash / — / LongRangeStrike; NW dark-forest
> block-out (thicket walls + corridors + clearings, darkAreas, signpost NPC,
> path extension, open-country scatter) via a deterministic scratchpad
> generator (committed artifact = world.json); **NPC-sprite lift** (optional
> zone-JSON npc `entityType`, TDD) so the signpost is a literal sign.
> PO-feedback round (same day, all verified): land rect now fills the exact
> bounds (blue border fixed, beach ring moved outside the wall); density
> ×~2 (196 props / 48 spawns); wolf 0.85→0.7, elite 0.75 (PO rule: normal
> mobs clearly slower than the player); darkAreas pulled inside the treeline
> (the overhang made players "invisible outside the forest" without light);
> input-queue overflow now merges one-shot commands instead of dropping
> them + HUD grace window (aura-selector stutter, TDD in model/client);
> aura tick-glow baseline; tiny own-avatar darkness hole (40 px).
>
> **PART 2 (forest interior) DONE + VERIFIED IN-GAME by PO 2026-07-17.**
> Shipped: **§9 lift 2 (passive light)** — `SkillComponent.LightRadius()`
> folds the active aura's light with every equipped passive's light (max,
> not sum; player + mob delegate; TDD, no wire/frontend change); **Torch**
> (`api/skills/torch.json`, id 46, passive light_aura 2.5+0.5/level ≈ 60%
> of the Light aura — PO pick: Light keeps the group-support role);
> **Hermit** (deep NW pocket, plain teaching Torch — PO pick: no level
> gate, the walk-in is the gate; the zone schema's mandatory `tooLowLine`
> on teaching NPCs is flavor-only there) + **Dog** (mid-forest clearing,
> "Woof", teaches SummonCompanion); **bramble walls** (`api/mobs/
> bramble.json`, solid-mob pattern 99/16, opt-in gate resist, XP 0, 4
> spawns sealing the shortcut-corridor mouth, ~5 min respawn; pattern
> documented in manual §1). Found+fixed: Part 1 never bumped the pinned
> skill-registry count (35→45 with Torch). **Same-day PO directives (all
> verified in-game):** `SPEED [factor|off]` dev cheat (input-path
> multiplier, TDD); **TurnipPull renamed Harvest** incl. the damage tag
> (`turnip`→`harvest`; turnip + bramble opt-ins follow — future flora
> authors a sensible tag); **fresh spawns no longer auto-activate the
> start aura** (equipped only; the sim harness now activates slot 0
> explicitly — pins stay byte-identical); **density pass ×2 between POIs**
> via a deterministic seeded scatter (196→299 props, 52→94 spawns;
> wildlife 32→74; forest gap-filled to no >5u pocket outside the NPC
> clearings; predators keep ≥10u from the farm box, prey-only near the
> farm; append-only — PO editor polish untouched).

- Factions `wildlife_predator` / `wildlife_prey` (matrix values authored).
- Mobs: Wolf (packs, hunts prey; Swift), Bear (berserker-modified damage
  aura; Thick Hide + Berserker-aura), Boar (bleed; Hardy + Dash), Stag
  (prey flee-always; drop TBD §11), Elite Wolf (execute + lifesteal;
  Long-Range Strike).
- Dark forest NW: thicket block-out (`blocksMovement` trees) + `darkAreas`;
  **§9 lift 2 (passive light)** + Hermit teaching **Torch** deep inside;
  Dog NPC (SummonCompanion, exact spot TBD §11); bramble walls
  (Turnip-Pull-gated shortcut, solid-mob pattern); forest clue signpost
  ("something big prowls").
- Pre-marked split point if needed: wildlife+factions / forest interior
  (Hermit, Dog, brambles, lift 2).
- Verify: predation visible + participation XP rule, drops roll, Torch
  lights from a passive slot, dog summons, bramble falls only to
  Turnip-Pull.

### C3 — Kobold hideout + Dark Tunnel (the solo path)

> **✅ DONE 2026-07-17 (execution session) — pending PO in-game pass.**
> Shipped exactly per scope + two same-session PO rulings: **rockfall
> gate = its own `smash` tag on a Miner-taught skill** (closes that §11
> item) and **the side-passage secret = a venom-spider nest** (densest
> Antivenom odds). Content: factions `kobold`/`spider` (hostile to
> `aligned` only); mobs 21–26 Kobold (flees @0.25, Light @0.08) /
> KoboldRanged (KoboldVolley `selector:"all"` uncapped — the volley
> showcase) / Spider (lifesteal bite, Antivenom @0.1) / VenomSpider
> (first `poison` tag dot_aura, Antivenom @0.25) / PoisonPool (brazier
> pattern, XP 0) / Rockfall (bramble pattern, `{"*":0,"smash":1}`); mob
> skills 115–119; player skills **Antivenom** (47, resist_passive poison)
> + **Pickaxe** (48, smash-gated Harvest twin, Miner-taught); NPCs Miner
> (staging area, plain teaching) + TunnelSign ("middle road is suicide",
> road fork) + KoboldSign ("shiny stuff", SE path); EntityTypes appended
> (Kobold…Miner) + bindings regenerated + frontend classes/SVGs (7
> placeholders); new rect-capable `Boulder` prop (r1.5, Stone sprite);
> zone append-only +83 props/+27 spawns/+9 darkAreas/+3 npcs/+40 sand →
> 382/121/18/7 (hideout ring ~(-25,35) mouth NW; tunnel y≈-52 x-40→+32,
> walls + mouth flares; lit staging area west; nest pocket sealed by 2
> Rockfalls, 2 venom spiders + 2 pools inside; 8+1 darkness circles; 2
> path lines). Registry pin 45→52; simharness presets auto-derive (mob
> registry walk) — no manual preset work. Verified: full suite + `-race`
> green; boot 52 skills / 9 factions / 382 props / 121 spawns / 7 npcs;
> headless browser smoke, 0 client errors — kobold swarm + volley rings
> render, Miner teaching lands (Pickaxe 1/1 in spellbook on approach),
> tunnel darkness + lit staging area render, poison pool: 100→0 HP while
> XP stays 0. Left for the PO pass: flee/lifesteal/DoT-vs-Antivenom feel,
> rockfall-falls-only-to-Pickaxe, Light drop roll, solo tunnel run at
> level.

- `kobold` + `spider` factions; Kobold melee (small radius, fast tick,
  flees low HP) + ranged (large radius, slow tick, uncapped `all`); Light
  kill-drop (low %); hideout block-out SE-center; kobold clue signpost
  ("shiny stuff").
- Tunnel N: geometry + darkness; lit spider staging area at the mouth;
  Spider normal (lifesteal bite) + venom (`dot_aura`, first `poison` tag);
  Antivenom drops; poison pools (brazier pattern, XP 0); rockfall side
  passage (solid mob, gate aura TBD §11); tunnel-warning signpost ("the
  middle road is suicide").
- Verify: solo tunnel run at level, light = advantage never requirement,
  poison DoT vs Antivenom, pools hurt but grant nothing.

### C4 — Z2 village + bandit gate (the group path)

> **✅ DONE 2026-07-18 (execution session), full chunk — no split needed;
> in-game PO pass pending.** Zero code lifts — content + pins only (plus
> the routine 5-file EntityType path for new sprites). **PO rulings this
> session:** bandit healer = **heal_aura** (shipped Healer precedent);
> bandit-ranged drop stays **empty** (§11 open); Damage-Burst = **new
> skill 49** with physical+bleed (NovaBurst stays a proving relic); Taunt
> carrier = **drummer, horde-only** (camp kills can't leak the reward);
> village healer placed **lore-only** (purpose stays §11-OPEN); Z2 got the
> **full density pass** (not a sprinkle). **Content:** `bandit` faction
> (hostile to `aligned` only); mobs 27–31 (Bandit melee physical+bleed
> no-flee / BanditRanged `selector:"all"` volley / BanditHealer
> `lowest_health`, never attacks / EliteBandit **first authored crit pair**
> 0.25@×2, drops DamageBurst 0.5 / RallyDrummer **first authored
> shield_aura**, allies-only never self, drops Taunt 1.0); mob skills
> 120–124; curveLevels camp 5 / drummer-horde 6 / elite 7 (one band above
> Z1, lower-first); EntityTypes Bandit…GateWall appended + bindings
> regenerated; new square **GateWall** rect prop (2.4×2.4, tiles into
> walls); NPCs CityGuard + VillageHealer (lore-only, no tooLowLine —
> only teaching NPCs require it). **Zone (append-only, deterministic
> scratchpad generator):** 607 props / 161 spawns / 33 darkAreas / 9 npcs /
> 2 campfires (village campfire = second respawn anchor); road continued
> x≈20 → village (44,8) → gates wall x≈65; blocked N/S road stubs; **seam
> ridge** so Z1→Z2 = exactly tunnel + horde road (flood-fill-verified:
> plugging both cuts Z2 off); tunnel-mouth path down to the village
> junction; NE dark forest (15 darkness circles) with lane maze + camp
> clearing; horde on the road at the ridge gap (~3 min shared respawn);
> full density pass with prey-near-village/predators-in-forest; **south
> front strip left empty — C5 canvas**. Skill-registry pin 52→58; also
> fixed the pre-existing `SkillMaxLevels` gap (ids 47/48 missing since C3's
> category fix). **Verified:** suite + race green; boot 58 skills / 10
> factions / 31 mobs / 607 / 161 / 9; browser smoke 0 client errors —
> village+campfire+healer line, guard before the tiling gate wall, camp
> under darkness with aggro, horde engages (volley rings; at-level check:
> the healer out-heals a L1 DamageAura = gate holds; L30 shreds = 
> trivializes), **Taunt dropped by the drummer landed in the spellbook**,
> DamageBurst granted + named. Smoke-harness notes: support/ranged mobs
> park at their own aura radius (by design — walk into them); the WARP
> camera-crawl quirk (backlog) makes screenshots trail warps. One
> **unreproduced** 1st-run triple `null.split` pageerror — watch item,
> 4 later runs clean.

- Z2 east block-out: 4-house village + campfire, City Gates + blocked
  roads N/S, bandit camp in the NE dark forest.
- City-guard NPC (lore-only: quest completion + Zone 3 teaser).
  Village-healer NPC purpose stays OPEN (§11) — do not invent.
- `bandit` faction; Bandit melee (bleed) / ranged (volley; drop TBD §11) /
  healer (`lowest_health` heal_aura or hot_aura — pick while authoring) /
  Elite Bandit (crit; Damage-Burst) / **Rally-Drum drummer = first authored
  `shield_aura`**.
- Bandit Horde middle-gate group (healer makes it the group gate) + Taunt
  kill-drop reward.
- Pre-marked split point if needed: village+gates+camp / horde-gate
  encounter group.
- Verify: horde un-soloable at level (punishes facetank), trivializes
  over-levelled, healer + drummer visibly change the fight, Taunt drops.

### C5 — The front + Front-Aura

- `human_army` + `orc` factions (army NOT hostile to `aligned`; orc hostile
  to `aligned` + `human_army`); army soldier (XP 0) + Orc (very strong,
  XP very low).
- **§9 lift 6** (adopted): friendly-to-players faction flag — player damage
  skips the faction; orcs still aggro the player.
- Spike barricades (physical + bleed hazard fixtures) shaping the boss
  approach; S blocked road + S exit past the orcs.
- Front NPC (level-gated teaching + TooLowLine; level anchor computed from
  the locked curve — closes that §11 item); **Front-Aura (§A ticket)**:
  multi-effect, deliberately overstrong; added to sim-harness presets on
  landing; GDD §4 + §5 amendments per §A.
- Verify: war ambience runs unattended, player cannot damage the army,
  orcs fight both, Front NPC gates correctly, Front-Aura grants.

### C6 — Ork World Boss (§B ticket)

- First designed Go encounter script on the spine: phases / adds
  (`SpawnMob`) / invuln gates / reset; always present, ~30 min [PLACEHOLDER]
  respawn via encounter timers. Enrage = in-chunk design decision (§9
  lift 5 or design without).
- Boss-Aura kill-drop (chance 1.0 → all participants + recent healers).
- On adoption: remove roadmap 9f from v1 scope (per §B); session-local
  completion messaging only.
- Verify: full group fight end-to-end, wipe → reset, respawn timer,
  Boss-Aura reaches all participants + healers.

### C7 — Recipe net

- Design + author the Front-Aura / Boss-Aura combination net (≥6 recipes:
  Front-Aura × Damage / Heal / Burst per §A, Boss-Aura ≥3, incl. whether
  the two combine with each other) + a coverage check over base-skill
  combos. Sits before C8 so the balance pass calibrates against the true
  power ceiling.
- Verify: recipes discover + cascade in-game (Discover/ApplyRecipeCascade),
  sim presets updated with the combo results.

### C8 — Balance & guardrail pass

- Full-roster sim-harness presets; kills/hour chain per level bracket vs
  the tier placeholders (normal ≤ ~50 % facetankable, elite ≤ ~25 %, boss
  kills the facetank bot); **regen/downtime knob settlement** (the open PO
  item from the chunk-4 findings — the kobold/wolf tier is what the target
  applies to).
- Guardrail asserts vs real mobs (deferred here from the sim-harness plan);
  drop-rate feel pass (decides the §11 pity question); milestone-table
  final; Front-Aura ceiling calibration (§A).
- Verify: harness batteries + asserts green, suite green, PO in-game feel
  pass over the full journey.
