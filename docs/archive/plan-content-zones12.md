# Plan — Content Pass: Zones 1 + 2 (execution step 6, roadmap item 12)

**Status: ✅ COMPLETE (2026-07-21) — chunks C0–C8 all executed + PO-verified
in-game; C8 explicitly CLOSED (§13), plus a post-C8 farm-band pre-chunk and
ad-hoc balance-tuning sessions.** The one deliberate remnant is combat-feel
SFX (roadmap step 6's audio slice), tracked in the PO priority queue rather
than here. Per-chunk ledgers and outcome banners live in §13.

*Planned 2026-07-16.* Basis: PO design session (external prompt + `zones12-mockup` map image) +
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
| Heal | ~~milestone~~ **turnip-field Hermit teach @L2 (C8 Session ④ FINAL)** | heal_aura (= shipped HealAura; never self, GDD §3) | in-game |
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
| Heal (instant) | milestone **@L3 (C8 Session ④ FINAL)** | self_heal, capped-partial (shipped; GDD §3 combat sustain) | in-game |
| Personal Recovery | ~~early milestone~~ **DireBear drop (C8 Session ④ FINAL; chance placeholder)** | instant_hot (shipped Recover; **self-only since C8 Session ④**) | in-game |
| Haste | milestone (first cooldown) **@L7 (C8 Session ④ FINAL)** | tick_rate (shipped) | in-game |
| Recall | Farmer @L2 | cast-time + interrupt (shipped) | today |
| ~~Flee~~ | ~~Stag drop~~ | speed+ self buff & radius− | **CUT from v1 (PO 2026-07-16)** — rode lift 1 (+ the radius− half rode lift 4); Stag replacement drop TBD §11 |
| Dash | Boar drop | dash (shipped) | today |
| Taunt | Bandit-Horde reward (kill-drop) | taunt (shipped) | today |
| ~~Rally~~ | ~~Bandit (ranged) drop~~ | timed ally move-speed buff | **CUT from v1 (PO 2026-07-16)** — rode lift 1, now backlogged; Bandit-ranged replacement drop TBD §11 |
| Damage-Burst | Elite Bandit drop | instant_damage (shipped NovaBurst pattern); candidate `bleed` tag → exercises multi-tag hits | today |
| ~~Berserker~~ → Berserker-aura | Bear drop | **rescoped**: berserker is a damage-payload modifier, not a state cooldown → Bear drops a berserker-modified damage AURA instead | content-only |
| ~~**Lantern Post**~~ (11th, PO 2026-07-16) | **CUT to post-v1 (C8 Session ④, PO 2026-07-19)** — Shaman-taught SummonTotem + 3 light sources cover the niche | SummonTotem spawn effect; totem def carries a **light-aura loadout** — deployable light support without giving up the active damage aura | content-only (totem + spawn shipped) |

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

- ~~**Milestone reordering** — full rewrite of `milestone-unlocks.json` against
  this plan's origins; all levels placeholder. (First cut in C1, final in C8.)~~
  **RESOLVED C8 Session ④ (2026-07-20, PO):** table FINAL at two rows — Heal
  @L3, Haste @L7; milestones are the rare guaranteed beats, everything else
  world-placed (HealAura → turnip-field Hermit @2, Recover → DireBear drop +
  self-only). Ledger: §13 C8 Session-④ banner.
- ~~**Recipe net** — Front-Aura + Boss-Aura combinations (≥6 total, incl.
  whether they combine with each other) — **chunk C7** (own session, before
  the balance pass).~~ **RESOLVED C7 (2026-07-18):** 10-recipe net authored
  (§13 C7 banner); capstone = yes (Warbanner).
- ~~**Stag + Bandit-ranged replacement drops** (or none) — open since the
  Rally/Flee cut (2026-07-16).~~ **RESOLVED:** Bandit-ranged → SlowAura drop
  (Session ② item 20); Stag → **none**, prey is prey (C8 Session ④, PO
  2026-07-19).
- **Front-NPC level anchor** — compute against the v1 level curve once
  `growth` + max level are locked (⚑ open sim-harness PO item).
- **Village healer purpose + village purpose** — Zone 2 session.
- ~~**Per-skill kill-drop mode** — only random-chance exists; pity /
  guaranteed-first would be code. Decide if needed after drop-rate feel.~~
  **RESOLVED C8 Session ⑤ (2026-07-20, PO): no pity — pure per-kill RNG is
  FINAL for v1** (farm-time table showed no grind wall; boss rares are the
  hunt beat). Ledger: §13 C8 Session-⑤ banner.
- Faction hostility matrix values, drop chances, all levels/radii/numbers.
- **Rockfall gate aura** (§4) — which skill/tag opens the tunnel side passage.
- ~~**Lantern Post origin** — Hermit second teaching vs. milestone.~~
  **RESOLVED C8 Session ④ (PO 2026-07-19): deferred post-v1** — Shaman-taught
  SummonTotem + three light sources already cover deployable light support.
- ~~Homes inside the milestone rewrite for: Barrier (instant_shield),
  ToughPassive, the bleed instant_dot candidate, Fade and Revive levels.~~
  **ALL RESOLVED:** Barrier → C7 recipe result; ToughPassive → Troll drop +
  Fade → Bandit drop + Revive → VillageHealer @6 (Session ② item 20); bleed
  instant_dot ("Lacerate") → **not adopted** (C8 Session ④, PO 2026-07-19 —
  DamageBurst has carried physical+bleed since C4; player instant_dot stays
  deliberately unexercised in v1).
- **Unplaced C7 recipe ingredients (PO-confirmed 2026-07-18):** Ignite +
  ImmolationAura have NO in-game source at all, and SlowAura/ToughPassive
  only drop from legacy mobs (Mammoth/Dodo) that never spawn in the
  authored zone — so the Wildfire, Suppression and Barrier recipes are
  cheat-only reachable today. Placement lands with the milestone rewrite /
  drop pass in C8 (or later content); the 6 mandated §A/§B recipes are all
  fully reachable.
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
> PO-verified in-game 2026-07-18 (full pass), committed `4d5406a4`.
> Chunk closed — next: C5.** Zero code lifts — content + pins only (plus
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

> **✅ DONE 2026-07-18 (execution session), full chunk in one session —
> PO-VERIFIED IN-GAME 2026-07-18, committed `96cea32f`. Chunk closed —
> next: C6.**
> Shipped per scope + four same-session PO rulings: **Front-Aura
> composition = Damage + Heal + Shield** (option B — full DamageAura at 2
> targets + full HealAura with selfDamage 0 + a RallyDrum-class shield on
> allies AND self); **name = Vanguard**; **level anchor = L20** ("the
> journey's final step in this version, very late" — this re-banded the
> front itself: soldier curveLevel 18 / orc 20 so the front is at-level
> endgame content at the anchor, closing the §11 anchor item; the 8–9
> draft band is superseded); **sim presets = derived player damage-aura
> presets** (option A). **§9 lift 6 landed (TDD):** faction JSON
> `friendlyToPlayers` → factions registry (contradiction with
> hostileTo-aligned hard-fails) → MobDefinition → `Mob` via new
> `model.PlayerFriendly`; `mayHarm` skips friendly targets for ALIGNED
> casters (players AND owned summons — checked before the gate; keyed on
> faction, not Go type). **Content:** factions `human_army` (hostileTo
> [orc], friendly) + `orc` (hostileTo [aligned, human_army]); mobs 32–34
> ArmySoldier (cL18, XP 0, fast respawn) / Orc (elite, cL20, base 280,
> **XP 15 very low**, OrcCleave 3-target) / SpikeBarricade (brazier
> pattern, physical+bleed, XP 0, **default-hostile on purpose** — hurts
> only players so it can't tilt the war); mob skills 125–127; player
> skill **Vanguard id 50**; registry pin 58→62. EntityTypes
> ArmySoldier…FrontCaptain appended + bindings regenerated + 4 placeholder
> SVGs; Skills.ts triple entry + Character.ts dual-ring (Paladin
> precedent). **Simharness:** player-aura preset derivation (registry walk,
> id<100 = player convention; L1 + Lmax entries; `/player-auras` dropdown +
> `-player-aura Name[:level]` CLI; damage effect only — documented; new
> maxTargets knobs both sides). **Zone (deterministic scratchpad generator,
> append-only + ONE sanctioned removal):** middle GateWall of the C4 S-road
> cap removed → checkpoint mouth (flanking pair stays); staging road W +
> S-exit road past the orc east flank to a GateWall teaser pair at the
> border; soldier line y≈28.8 (8 spawns, ~60 s) vs orc line y≈32.3 (5+2,
> ~2 min) with overlapping aggro = unattended war; 9 spike barricades
> incl. a funnel toward the **west arena x 23–33 — kept empty as the C6
> boss canvas**; churned-earth scatter; FrontCaptain NPC (~59,27,
> teaching Vanguard @20, real TooLowLine — first live gate) → totals
> 615 props / 185 spawns / 420 terrain / 10 npcs; flood-fill: village →
> checkpoint / staging / arena mouth / S exit all reachable. GDD §4
> sanctioned-exception clause + §5 power-ceiling bullet landed (§A).
> **Verified:** suite + `-race` green; boot 62 skills / 12 factions / 34
> mobs / 615 / 185 / 10; browser smoke — gate holds at L1 (no teach),
> Vanguard lands in the spellbook at cap, equips + activates (slot 2,
> self-shield segment visible on the HP bar), war fights unattended
> (orc cleave −135 on a soldier observed), barricades render + tick,
> 0 client errors on runs 2–3. **Watch item recurred:** the C4 1st-run
> triple `null.split` pageerror appeared once on the first run after the
> fresh build, gone with stacks armed on reruns — still unlocated
> (backlog candidate). **PO in-game pass 2026-07-18: passed** (war-front
> feel, checkpoint + S exit, soldier immunity, Vanguard power feel).

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

> **✅ DONE (2026-07-18), full chunk in one session — PO-VERIFIED
> IN-GAME 2026-07-18 ("works as intended"), committed `5961b29a`.** Shipped per this ticket + the session's PO
> rulings (fight sketch "Warbanner gate + waves"; enrage = rotating
> tick_rate Frenzy, NO §9 lift 5; Boss-Aura = **Call for Aid** (cooldown,
> THREE spawn effects → 3 SoldierCompanions — fireCooldown applies every
> effect, zero code); boss cL22–24 → authored cL23 boss tier; adds = new
> OrcGrunt normal cL20; totems = gate + shield_aura allies-only; wipe =
> base leash+regen observed by the script; respawn ~5 min [PLACEHOLDER]
> + return broadcast; kill broadcast WITH credit names).
> **Two lifts:** (1) **alert/broadcast** — chat.Broadcast (EntityMessage
> id 0 → all players) + ANNOUNCE cheat + client AlertBanner (upper third,
> queued, fade; unlock banners ride the existing spellbook diff,
> discoveries only); (2) **zone anchors** — `anchors` section in the zone
> schema (validated: unique names, in-bounds) + `Zone.AnchorPos` + full
> editor tool (place/select/rename/delete, crosshair markers) — the
> encounter takes its 4 positions (warlord-home / warbanner-1/-2 /
> wave-mouth) at registration and the boot hard-fails on a missing
> anchor. **Script:** `encounter/warlord.go` — first designed encounter:
> banner invuln gate re-derived per tick (AFTER replants — no 1-tick
> vulnerability window), waves at 66/33%, one-shot re-gate at 33%, wipe
> re-arm keyed on `engaged` (pre-pull banner kills stay down), kill →
> named broadcast + arena despawn + respawn timer; structure tunables =
> named constants; `System.Despawn` + `Mob.KillCreditNames` seams added.
> **Content:** mobs 35–38 (OrcWarlord boss cL23, XP 600, WarlordCleave
> multi-effect cleave+bleed + WarlordFrenzy; WarbannerTotem bramble-body
> killable XP 0; OrcGrunt; SoldierCompanion = Companion pattern +
> SoldierBlades reuse); mob skills 128–131; CallForAid id 51; registry
> pin 62→67; EntityTypes 54–57 + placeholder SVGs; arena light dressing
> (5-boulder rim, open E mouth + S border) + 4 anchors in world.json
> (append-only; flood-fill: all 4 anchors / 185 spawns / 10 npcs
> reachable). Roadmap 9f removed from v1 scope. **Verified:** suite +
> race green; boot 67 skills / 12 factions / 38 mobs / 620 props / 185
> spawns / 10 npcs / encounter registered; browser smoke 0 client
> errors — ANNOUNCE banner, gold unlock banner ("New passive: Torch"),
> warlord + both banners at anchors with `invulnerable=true` in the
> THREAT dump, Call for Aid drops into the spellbook, equips to Q and
> raises 3 SoldierCompanions server-side (at the safe farm spawn; in the
> arena at owner L1 they die instantly to the at-level war — correct).
> Wave/re-gate/wipe/kill beats pinned by the encounter unit tests. PO
> in-game pass 2026-07-18: works as intended.

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

> **✅ DONE 2026-07-18 (execution session) — PO in-game pass 2026-07-18,
> committed `53868697` ("all in all, it works") with two findings, both handled same session:
> (1) Vanguard + Warbanner overshields way too strong → shield_aura cut
> to roughly a third (Vanguard 15+5 → 5+2, Warbanner 17+6 → 6+2.5,
> [PLACEHOLDER] — C8 calibrates; docs/GDD wording follows); (2)
> Wildfire/Suppression/Barrier ingredients unplaced (Ignite/Immolation
> sourceless; SlowAura/ToughPassive only on never-spawned legacy mobs) →
> recorded in §11 + the content-recipes.md audit, placement = C8.**
> Shipped per this chunk + the session's PO rulings (capstone = YES,
> Vanguard(5)+CallForAid(3) → **Warbanner** aura, base ingredients only;
> Vanguard trio = **specialist** results; thresholds = **all ingredients
> maxed** net-wide; CallForAid partners = Taunt + **HealAura** (PO pick
> over the Heal cooldown); gap fills = fire + kiter; extra PO recipe:
> Hardy(3)+ToughPassive(3) → **Barrier**, the existing cheat-only
> instant-shield as result — cooldown because that's the rarer category
> after the net (20 auras / 18 cooldowns), closes the §11 "Barrier home"
> item WITHOUT the instant_resist lift first considered → **chunk stayed
> zero-lift**). **10 recipes total** (ids 1–10 incl. Paladin), 8 new
> result skills 52–59 (Spearhead / Lifewarden / Shockwave / Warbanner /
> HoldTheLine / FieldMedics / Wildfire / Suppression), 2 new summons
> (ShieldbearerCompanion reusing RallyDrum, MedicCompanion reusing
> HealerAura — zero new mob skills), EntityTypes 58–59 + SVGs, registry
> pin 67→**75**, recipe-count pin 10 + net cascade test
> (TestRecipes_C7Net), client ring styles (Lifewarden support /
> Warbanner dual). Sim player-aura presets auto-derive the new
> damage-carrying auras (Spearhead/Warbanner/Suppression L1+Lmax — the
> §A "never a surprise" ceiling refs); coverage audit in
> `content-recipes.md` (gaps = deliberate post-v1). Verified: suite +
> race green; boot + in-game smoke per §13 checklist.

- Design + author the Front-Aura / Boss-Aura combination net (≥6 recipes:
  Front-Aura × Damage / Heal / Burst per §A, Boss-Aura ≥3, incl. whether
  the two combine with each other) + a coverage check over base-skill
  combos. Sits before C8 so the balance pass calibrates against the true
  power ceiling.
- Verify: recipes discover + cascade in-game (Discover/ApplyRecipeCascade),
  sim presets updated with the combo results.

### C8 — Balance & guardrail pass

> **✅ Z2-hardening / cL8-17 farm-band PLAN chunk DISSOLVED (PO decision
> 2026-07-21) — no session needed.** The chunk's remaining scope after the
> farm-band pre-chunk (below) was Z2 difficulty/density design + farm-area
> structure + more band content. PO ruling: **difficulty + density are
> covered by the new farm-band mobs** (GiantSpider/AlphaWolf/Marauder ids
> 45-47), and **placements + farm-area structure are PO-manual in the zone
> editor** — no plan doc, no Claude session. The pieces that survive it:
> the gray-band XP decision was already CLOSED in the pre-chunk (flat XP
> kept), and any *future* new band mobs still inherit the Session-⑥ XP
> derivation rule + the tier+baseline authoring rule + the "farm"
> guardrail band-check. Earlier banners naming this chunk as NEXT are
> superseded by this note.

> **✅ Farm-band pre-chunk session (post-C8, 2026-07-21) DONE — PO-driven
> in-session (live playtest + two editor placement passes), committed
> `1b33be7a` (+ same-session follow-up commit: turnip XP 1 + wrap), main
> per standing PO directive. This session pulled the mob-authoring slice
> forward out of the planned Z2-hardening/farm-band PLAN chunk (PO: "author
> two…" → picked three via choice prompt); the full plan chunk (Z2
> difficulty/density design, remaining farm content) stays NEXT.**
>
> **Ledger: (1) Three cL8-17 farm-band normals** (the guardrail-flagged
> Z2→front normals gap): **GiantSpider** id 45 cL9 (spider faction,
> VenomSpit poison-dot lurker, deep pool — the band's attrition check,
> guardrail-soft), **AlphaWolf** id 46 cL10 (wildlife_predator, WolfBite,
> speed 0.74 under the PO normal ceiling — soft), **Marauder** id 47 cL12
> (bandit faction, **BanditBlades level 3** + 85 baseline = the band's
> HARD normal, kills the guardrail bot; first non-encounter use of a
> mob-skill level > 1, ProvingBoss precedent). All dropless for now (drop
> table FINAL — additions are a PO call), spawns PO-placed same session.
> **XP kph-derived per the Session-⑥ rule** — derivation re-run reproduced
> the pinned Wolf 70 exactly (4140 ÷ 59.2 facetank kph), confirming the
> stance rule (facetank kph while viable, else kite ×0.5): GiantSpider
> **205**, AlphaWolf **275**, Marauder **175** (hard-but-kiteable pays
> less — DireBear/Mammoth precedent). **(2) Guardrail band-check extended
> (TDD):** `guardrailZone` cL8-17 → "farm" + the band joins the
> soft+hard assert (`cmd/simharness/guardrail_test.go`) — failed all-soft
> first, passes after the Marauder buff (`farm: soft=[AlphaWolf
> GiantSpider] hard=[Marauder]`). **(3) Unique-art pass (PO ruling
> 2026-07-21: every mob gets its own sprite, higher tier looks meaner):**
> five new portrait SVGs in the house style — giantSpider / alphaWolf /
> marauder + **DireWolf and DireBear lose their Wolf/Bear `entityType`
> reskins** and get own sprites; EntityType enum appended 66-70
> (GiantSpider, AlphaWolf, Marauder, DireWolf, DireBear — full 5-file
> wire path, positional `gameObjectClasses` extended; dires verified
> rendering their new art in-game, which also proves the 66-68 slot
> alignment). Proving-grounds reskins (ProvingAdd/Boss/Guard) left alone
> on purpose (debug map). **(4) PO editor passes ×2 folded in:** all
> three farm mobs placed (AlphaWolf ×2, Marauder ×3, GiantSpider ×1),
> Troll 4→6, Bandit +3, Spider +4, wildlife thinned (DireWolf −4, Bear
> −3, Boar −3, Wolf −2, DireBear −1, Stag −1), campfires 3→**5**, props
> 798→**856**, spawns 347→**349**. **Watch item recurred ×2:** the
> editor dropped `entityType` on the moved Emberkeeper (pass 1) and
> LamplessTraveller (pass 2) — hand-restored both; this time the download
> was a plain `world.json` in the Windows Downloads folder (no
> space-name stray), installed + stray deleted. **(5) PO balance
> rulings in-session:** KoboldVolley radius **4.5 → 2.2** ("halve the
> ranged kobold range"); **turnip XP 0 → 1** (token pop reward
> post-Session-⑦; cheese stays dead — L1→2 costs 300). **(6) Gray-band
> XP rule DECIDED: keep flat XP for now** (PO choice-prompt 2026-07-21;
> live-mob camping explicitly accepted until it matters more — the
> farm-band plan chunk no longer owns an open XP-rule decision).
> **Verified:** full suite green ×3 (post-guardrail, post-content,
> post-turnip) + `-race` on sim/simharness/items, `tsc` clean, webpack
> prod + dev bundles serve the new classes, boot `78 skills/13
> factions/47 mobs/10 recipes/856 props/349 spawns/5 campfires/14 npcs,
> 0 panics`, headless in-game smoke (both dires render their new
> sprites; villages/NPCs intact).**

> **✅ Session ⑦ (C8 walkthrough close-out + village-arrival intro rework)
> DONE 2026-07-21, PO-driven in-session — PO-VERIFIED IN-GAME 2026-07-21
> ("the intro feels much better now"), committed `f9345739`, main per
> standing PO directive. **C8 is CLOSED** — the walkthrough was the last
> §13 item. Next: the Z2-hardening / cL8-17 farm-band **PLAN chunk** (own
> session, plan-first); PO manual placements/corrections continue in the
> editor on their side.**
>
> **Ledger: (1) The Session-⑥-deferred low-band cheese landed live during
> the walkthrough** — a group standing in the turnip field power-levels
> everyone (shared XP × zero-risk 10 s-respawn field). PO ruling: turnips
> are no longer an XP source at all; the deferred turnip-brake decision is
> resolved here (moot), while the **gray-band XP rule for the wolf band
> stays owned by the farm-band plan**. **(2) Village-arrival intro
> rework** (PO-designed, choice-prompt settlements): players are
> "adventurers" arriving in a wolf-beset village (dialogue-only rename);
> first task "get rid of those wolves" → Recall + go-east/militia hook.
> Village = 3 NPCs: **TownCrier** (new, EntityType **65**, full 5-file
> wire path per Wanderer precedent) at village center — DamageAura @L1 on
> arrival + Recall @L3; **Farmer** moved south (−57/28.6) beside a new
> Sand-patch field, teaches only Harvest (ungated @L1); **healer hermit**
> pulled into the village (−54.9/25.6), stays Hermit type (keeps the
> hermit-lore breadcrumb), HealAura @L2 unchanged. Turnip `experience`
> 30→**0** (pure Harvest demo target, 16 old-field spawns → 5 at the new
> field); L1→2 now happens on wolves — re-felt OK. **(3) PO editor pass
> folded into the commit:** wolf spawns 86→97 (+1 DireWolf), RoadWarner
> moved to the south road as Wanderer_1 (−15.5/30.7, reworded warning) +
> **3rd campfire** beside it (−16.5/31.5), KoboldSign + TunnelSign
> **deleted on purpose**, props 805→798. **Watch item (recurring):** the
> zone editor does not round-trip `entityType` — hand-restore it on every
> editor-added NPC (bit Wanderer_1 this session), and the editor Download
> lands outside the repo (`world .json` with a space — install + delete
> the stray). **(4) Stale pin fixed:**
> `TestLoadPlayerAuraPresets_DotSkillsDerive` still expected ImmolationAura
> 10 HP from before the crit-rework-v2 dot compensation (10.5) — the suite
> was red at HEAD since `635a44e3`. **(5) Walkthrough close-out:** PO
> blanket-verified the remainder in-game (Step-0 Warbanner sequence,
> teacher gates Immolation 6 / Totem 5 / Revive 6, Vanguard/regen,
> Troll/Pyromancer/Dire tier feel, wolf/DireWolf + XP-table re-feel, crit
> rework re-feel) — no new triage items beyond the intro rework.
> **Verified:** full suite + `-race` green, boot `78 skills/13
> factions/44 mobs/10 recipes/798 props/347 spawns/3 campfires/14 npcs,
> 0 panics`, headless browser smoke (TownCrier renders with its own
> sprite + teaches DamageAura at L1, Farmer pops the Harvest unlock
> banner).**

> **⏳ Session ⑥ (XP pass v1 + wanderer NPCs + playtest triage) DONE
> 2026-07-20, PO-driven in-session — PO-VERIFIED IN-GAME 2026-07-20
> ("feels much better"), committed `e72a15e0` (XP pass) + `86f4f5d2`
> (NPCs + wolf range), main per standing PO directive. Remaining C8
> (Session ⑦): walkthrough remainder (Step-0 Warbanner sequence, teacher
> gates Immolation 6 / Totem 5 / Revive 6, Vanguard/regen re-feel,
> Troll/Pyromancer/Dire tier feel, now + wolf/DireWolf re-feel post
> WolfBite cut + XP-table re-feel) + the Z2-hardening / cL8-17 farm-band
> PLAN chunk.**
>
> **Ledger: (1) XP pass v1 — the per-mob `experience` table re-derived**
> (21 mob JSONs; conf curve untouched, base 300 × growth 1.2 stays — base
> is numerals-only, every felt quantity is a ratio). **Rule:** band
> XP/hour target `X(cL) = 3600 × 1.15^(cL−1)` model-time; per-mob XP =
> X(cL) ÷ measured kph (chain battery at guardrail knobs, best viable
> stance, 0.5× kite discount) — hard/facetank-only mobs pay more per
> kill, trivially-kiteable support pays less; danger finally correlates
> with reward. **PO rulings 2026-07-20:** pace gently rising (mob-XP
> growth 1.15 vs cost growth 1.2 ≈ +4%/level, ~3.3× at 30), ~5 min/level
> early anchor (model-time), elite = 3× band-normal median, turnip 30 =
> base/10 → **L2 in ~10 turnips** (L1→2 is turnip-only by design —
> Farmer teaches Harvest first, DamageAura at L2). Headline moves: Wolf
> 25→70, DireWolf 60→150 (hardest normal), Spider 45→100, EliteBandit
> 170→330, Troll 220→435 (placeholder tier), Mammoth 90→45 (kiteable
> elite — kph-derived, NOT 3×, anti-superfarm); Healer/BanditHealer/
> RallyDrummer/SaberToothCat cut. Unchanged: prey 8/12/15, front
> anti-faucet 5/15 (deliberate — endless-front XP faucet), Warlord 600,
> proving legacy, 0-XP utility. Future cL8-17 farm-band mobs inherit the
> rule. **Deferred (PO: "leave the turnips for now"):** the low-band
> cheese/AFK brake — turnip field at 16 slots/10 s respawn sustains
> ~284 kph × 30 ≈ 8.5k XP/h model-time and stays competitive to ~cL6;
> options analyzed = gray-band XP rule (full ≤ cL+1, −25%/level, 0 at
> cL+5 — fixes Healer/Mammoth cheese too, keeps field newbie-safe) vs
> field exhaustion (griefs the mandatory first level); decision → the
> farm-band plan chunk. **(2) Wanderer + Traveller NPC types**
> (EntityType 63/64, full 5-file wire path + portrait SVGs, reusable via
> zone-JSON `entityType`); placed RoadWarner (kobold sign, −23.5/13.5,
> "Don't go east…") + LamplessTraveller (dark-tunnel mouth, −17/−28.5,
> "Kobolds took my lamp!") — PO adjusts placement/lore in the editor.
> Pickaxe teacher already existed (Miner, −27/−26.4). NPCs 13→**15**.
> **(3) WolfBite radius 1.2→1.0** — symmetric with the player base aura
> (PO: wolves already fast); shared Wolf + DireWolf. Sim note: the cut
> re-opens a sliver ideal-kite ring vs the pinned XP kph — model
> artifact, re-feel Session ⑦. **(4) Playtest triage findings:**
> wolves-"attacking"-bramble = NOT an attack — double faction gate
> (findAggroTarget mask + mayHarm) already excludes it; it is the pinned
> chase-camp behavior (e2643cdb) reading as attack via the rendered aura
> ring; PO re-ruled **keep camping as pinned** (wildlife-gives-up option
> declined). Spiders will not attack rockfall boulders (same gates). PO
> hand-authors (editor): campfires at kobold camp + top tunnel, fewer
> wolves at the turnip field, forest density up / road corridor thin.
> **Later:** reload-loses-character → reconnect-token plan chunk
> (localStorage token + server-side parking ~10-15 min [PLACEHOLDER];
> typed-code variant declined as friction, accounts supersede); L1-2
> misery re-judge after PO density edits. **Verified:** full suite green
> ×2 (post-XP, post-NPC), boot `77 skills/13 factions/44 mobs/10
> recipes/805 props/346 spawns/2 campfires/15 npcs, 0 panics`, webpack
> bundle serves the new classes, PO in-game session on the live server.**

> **⏳ Session ⑤ (drop-rate pass FINAL + NPC pass + walkthrough part 1) DONE
> 2026-07-20, PO-driven walkthrough in-session — committed `1ef67776` (drops)
> + `ac44bae5` (NPCs) + `d5263355` (fixes), main per PO directive. A parallel
> session landed `e2643cdb` (mob pathfinding detour-commit + camp watchdog,
> from the walkthrough's wolves-jiggling finding) — no file overlap.
> Remaining C8 (next session): walkthrough remainder (Step-0 Warbanner
> sequence, remaining teacher gates, Vanguard/regen re-feel post-nerf,
> Troll/Pyromancer/Dire tier feel) + the **Z2-hardening / cL8-17 farm-band
> plan chunk** (PO 2026-07-20: plan-first, own session — Z2 difficulty+density
> "up by a lot", dedicated high-tier farm content; the guardrail-flagged
> cL8-17 normals gap is the design target).**
>
> **Ledger: (1) Drop-rate feel pass — table FINAL (PO 2026-07-20).** Method:
> kills/hour chain battery vs final density (per-mob measured kph, best
> viable stance, respawn-capacity cross-checked — 30 s standard never
> binds); PO rulings: **no pity — pure per-kill RNG FINAL (closes GDD §11
> TBD)**, event pacing ("a WoW blue") at **Z1 ≈10 min / Z2 ≈20 min expected**
> model-time, gating utility quicker, elites high-chance (kill-gated).
> Chances: Light .05 ×2 / Hardy .03 / Dash .025 / ThickHide .04 /
> Berserker .03 / Swift .10 / Fade .015 / SlowAura .03 / NovaBurst .05 /
> Recover .02 / Antivenom .10+.25 kept / elites .25+.5 kept.
> **WildAura → DireWolf .06** (live home; legacy Dodo/SaberToothCat/Mammoth
> carriers exist only in proving-grounds — flagged for Step-7 cleanup) and
> **OrcWarlord + Rejuvenation .10** = first **boss rare re-farm drop**
> (pattern adopted: guaranteed identity drop + low-chance hunt slot;
> FireWard = the one remaining orphan, reserved for fire-themed content).
> **(2) NPC pass:** body radius 1.0→**0.35** (player 0.25), sensor radius
> 3→**1.5** all 13 NPCs incl. signposts, **Farmer sprite** = new EntityType
> 62 through the full 5-file wire path (was Flower fallback).
> **(3) Walkthrough part-1 findings fixed:** aura-swap-into-active-slot left
> NO aura active (ring/effect/light off → invisible under darkness) —
> equip flow now re-activates the slot, red-first pair in
> `sys/equip/equip_test.go`; **Vanguard shield 13→~2.7 HP/s** at L5
> (4 +1/lvl per 90 ticks; damage axis checked vs the §A league = maxed-base
> ×2 targets, in-line, UNTOUCHED); **regen taper** 1.0@L1→0.4@max linear
> (`regenTaper`, pinned) — amends the 1%/s lock at the top end only.
> **Settled FINAL this session:** campfire `healFractionOfMax` 0.12, heal
> cost curve `10 −2/level`, drop table, §11 no-pity. **PO walkthrough reads:**
> teachers OK; tier readability vague-but-consistent = acceptable, real fix
> stays deferred items 7+15. **Verified:** build clean, suite green (one
> transient red mid-session = the parallel session's in-flight TDD, green at
> its commit), boot `77 skills/13 factions/44 mobs/10 recipes/805 props/346
> spawns/2 campfires/13 npcs, 0 panics`, headless client smoke (Farmer
> sprite + teach range), PO in-game re-checks.**
>
> **⏳ Session ④ part 1 (milestone settlement + density pass) DONE 2026-07-20,
> PO-approved in-session (map artifact + choice prompts) + PO in-game density
> check — committed `03a377b1` (main, per PO directive).
> Remaining C8 (next session): drop-rate feel pass (§11 pity; now against
> final density — 16 drops incl. the new Recover 0.15), campfire
> `healFractionOfMax` + heal-cost-curve finals, PO full-journey walkthrough
> (Step-0 Warbanner sequence, ceiling-kit heal/shield feel, teacher gates
> Immolation 6/Totem 5/Revive 6 + new HealAura Hermit @2, Troll/Pyromancer/
> Dire tiers, new density feel).**
>
> **Ledger: (1) Milestone settlement (PO 2026-07-19).** Table FINAL at two
> rows — **Heal @L3, Haste @L7** (`skills/milestone-unlocks.json`, embedded →
> rebuild applies; pin test re-pinned). Everything else world-placed:
> **HealAura → 2nd Hermit instance** at the turnip field (−47.5, 28.2),
> teaching gated **@L2** (mirrors the Farmer); **Recover → DireBear drop
> 0.15** [chance = drop-rate-pass placeholder] — the Z2 dires' first loot
> identity — and made **self-only** (`targetsAllies:false`, §5 ruling
> applied). **Lantern Post → post-v1** (YAGNI: Shaman totems + 3 light
> sources cover it); **Stag → stays dropless** (prey is prey); **Lacerate →
> not adopted** (DamageBurst already ships physical+bleed since C4). Pins
> unchanged 77/44/10. **(2) Density pass, 2 rounds, PO-approved via
> before/after map artifact** (pure-stdlib rasterizer + seeded generator,
> session scratchpad; artifact kept as the visual record). Round 1: 8 fill
> regions (Z1 centre-east meadow, Z1 SE corner, kobold outskirts K, Z2
> shelves/fields) — **+185 props / +53 spawns**; **Z1 N–S road rerouted**
> to join the main road west of the kobold camp instead of dead-ending in
> it (−5/+9 sand, camp keeps a gap entrance). Round 2 (PO: *"a mob on
> screen at basically all times"*): coverage standard derived from
> `Zoom.ts` — screen = 17×9.5 units at max zoom-out; sliding-window fill
> until **no ⅔-screen window is empty** (half-screen in the middle woods =
> predator forest, wolf-heavy) — **+95 themed spawns**. Zone: 620→**805
> props**, 198→**346 spawns**, 13 npcs; no-go respected (front, arena,
> village, tunnel, camps, NPC/campfire clearings, seam tree-wall).
> Semantic diff vs HEAD verified append-only. **PO tooling note:** the map
> renderer → standalone browser map editor idea captured as **backlog §22**
> (post-C8). **Verified:** build clean, boot `77 skills/13 factions/44
> mobs/10 recipes/805 props/346 spawns/2 campfires/13 npcs, 0 panics`,
> full suite green (both rounds), PO in-game density check positive.**
>
> **⏳ Session ③ part 1 (sim-side items) DONE 2026-07-19, PO-read in-session —
> commits `4e412ebf` (Step 0) + `405b9e8c` + `6a2f69a4` + `ed9ffdff` +
> `c55838e0`. All sim/test/tooling — ZERO game-content changes beyond Step 0's
> Warbanner recipe; registry pins unchanged (77 skills / 10 recipes).
> Remaining C8 (next session): drop-rate feel pass (§11 pity), campfire
> `healFractionOfMax` + heal-cost-curve finals, milestone-table final, PO
> full-journey in-game walkthrough (incl. the Step-0 Warbanner sequence +
> ceiling-kit heal/shield feel — the sim under-reads the kit, damage axis
> only).**
>
> **Ledger by item:** **(1) Full-roster presets** — found+fixed the dot gap:
> sim `AuraSpec` gained `dotTicks`/`dotTickInterval` building a REAL
> `dot_aura` (PO picked full-fidelity over DPS-approximation; StatusEffects
> pipeline already ran in the sim world; exact-tick pin, death on tick 22).
> BanditPyromancer/VenomSpider/Totem/Brazier un-turreted, ImmolationAura +
> Wildfire join the player roster (24→28); explorer dot knobs both fieldsets;
> pyro idle-TTD ~15.0 s median where it timed out before (`405b9e8c`).
> **(2) Kills/hour chain, full armed roster** (34 mobs @ home bracket,
> baseline bot 100×f / DamageAura-L1×f): metric is near-binary per matchup —
> elites/bosses all comply (0% facetank survive / bot dies); normals split
> 12 soft (100%) vs 3 hard (Kobold/Bear/DireBear kill the bot); kite
> 140–285 kph vs facetank 39–129 everywhere it exists (efficiency .18–.51,
> positioning always pays); ranged mobs invert coherently (facetank-only);
> flat across brackets cL1–23 (Philosophy A holds on real content).
> **PO rulings:** normal tier = **per-mob texture** (soft/hard is mob
> identity), guardrail = zone **band-check** (Z1+Z2 each ≥1 soft + ≥1 hard);
> **assert scope** = real hostile roster only (exempt: hazards/props,
> summons, encounter internals, allies, flee-critters — curated list, new
> mobs assert by default); **front exempt** from band-check (elite/group
> territory); ProvingBoss solo-kite (LRS, ~34 kph) **acceptable**, boss
> assert stays "facetank bot dies". **(3) Regen/downtime settlement**
> (closes the chunk-4 PO item): **regen 0.00033/tick ≈ 1%/s FINAL** (at 1%/s
> self-heal L1 = +42% facetank pace — the accelerator niche is the point;
> 2%/s would hand it out free); **downtime 15 s → 10 s** (denser-spawn
> assumption; kobold-tier kite 181→241 kph) — CLI/UI/doc defaults updated
> (`6a2f69a4`). **(4) Guardrail asserts** — `guardrail_test.go`
> `TestGuardrails_TierThresholdsVsRealRoster`: seeded, deterministic, 3.8 s,
> all rulings encoded in the header ledger; current content passes (Z1 soft
> ×6 / hard Kobold+Bear; Z2 soft ×4 / hard DireBear; 6 elites + 2 bosses
> comply); `loadContent` refactor shares the registry path, bot weapon
> derives from authored DamageAura (`ed9ffdff`). **(5) §A Front-Aura ceiling
> calibration — ACCEPTED as authored, no tuning.** League (sustained
> EV/tick, max level): Spearhead 2.28 (3.4× best non-ceiling) > Warbanner
> 1.43 > Vanguard 1.34 > base family 0.67; even L1 ceiling refs beat maxed
> base. Packs: Spearhead clears 3 OrcGrunts in the 1-grunt 4 s (base
> overwhelmed at 2). Spearhead's r1.3 uniquely opens the Orc-elite kite ring
> (157 kph) — the ceiling materially unlocks solo elite farming.
> `TestGuardrails_CeilingOrdering` pins the ordering arithmetically (§A
> "never a surprise") (`c55838e0`). **Verified:** full backend suite green
> (29 pkgs) + `-race` (sim); Playwright driver over the explorer clean (dot
> knobs render, 4 batteries drive). Battery artifacts (session scratchpad,
> regenerate via the run-simharness skill): chain-roster-results-dt10.json,
> regen-sweep-results.json, ceiling-calibration-results.json.**

- **Step 0 — recipe-net topology fix (backlog §21): ✅ DONE 2026-07-19 (PO
  decided in-session).** Option **A (tier)**: Warbanner = `Vanguard 5 +
  Spearhead 5 + CallForAid 3` — Spearhead at max (cascade discovers at L1, so
  ≥2 is the mechanical floor; PO picked 5), Vanguard kept explicit (free-respec
  shortcut guard), trio hub (Spearhead/Lifewarden/Shockwave) accepted as-is
  (cross-category = complementary, not choice-erasing). `warbanner.json`
  reshaped; `TestRecipes_C7Net` re-pinned (journey pops trio, NOT Warbanner;
  maxed Spearhead then unlocks it). Full suite + `-race` green, boot 10
  recipes clean. Decision ledger: backlog §21 Status block. The §A ceiling
  presets C8 tunes against now sequence Spearhead → Warbanner.
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
