# Plan: Playtest-1 Feedback (external tester)

**Status:** **Pass A DONE 2026-07-22** (A1 + A2, `b0171ffb`) — awaiting PO
in-game feel pass. **NEXT: Pass B** in its own session, then Pass C. The
tutorial/quest/aura-differentiation themes go to their own planning rounds.
Full Pass-A ledger: §Pass A ledger at the end of this doc.

## Source

First playtest with an external tester (little video-game/MMO experience —
exactly the perspective the onboarding needs). Feedback collected live by the
PO 2026-07-22, triaged together in-session. Headline result: **"Die Mechanic
an sich ist fun"** — the core loop carries; the failures cluster in four
themes: missing onboarding, NPC/unlock communication getting lost, balance too
easy/uncontrolled, and known deferred items.

Positives to keep/extend: core aura mechanic, static traps in the Dark Tunnel
("sehr cool" — author more of these in future zones).

## Decisions (PO, 2026-07-22, via choice prompts)

1. **Density standard KEPT, difficulty via stats** — the ⅔-screen density
   standard (C8 Session ④) stays; "knackiger" comes from mob HP up (cL4–5 and
   above) + Z2 damage up, not fewer spawns.
2. **Gray-aggro removed** — mobs far below player level no longer aggro
   (still attackable; flat gray XP stays DECIDED). Threshold proposal:
   `mob cL ≤ player cL − 5` [PLACEHOLDER] (matches band width ≈ +5).
3. **Drop philosophy: hybrid** — most ability drops move to elite/boss mobs
   (chances there can rise); a few hand-picked skills stay on normal mobs at
   low chance. Drops become an event, not rain. (Drop table is TUNING-OPEN
   per the 2026-07-21 PO ruling, so this is a retune, not a reversal.)
4. **Campfire hard safe-zone** — mobs may not enter the campfire radius;
   chase breaks at the boundary. Campfires become guaranteed-safe anchors.
5. **cLv difficulty indicator: WoW-style nameplate colors** — mob name tint
   by level difference (gray/green/yellow/orange/red). No new UI element.
6. **Equip flow click-to-bind** — decided earlier in the session ("sollten
   wir machen"): click skill in spellbook → click slot (or press slot key) →
   bind if the slot type matches.

## Pass A — Balance & AI (backend-heavy) ← FIRST

1. **Aggro range globally down, significantly** — PO confirmed from own play:
   mobs currently aggro from off-screen and you pull most of a zone. Biggest
   single lever for "controlled" feel.
2. **Gray-aggro rule** (decision 2).
3. **Respawn timers ×0.5** (halved — tester + PO agree they're too fast).
4. **Mob HP pass**: most mobs from ~cL4–5 up get noticeably more HP; Z2 mob
   damage up (duo play currently shreds everything incl. forest bandits).
5. **A few Z2 mobs faster than the player** — enabled by the aggro reduction.
6. **Vanguard teacher gate L20 → L15** (leveling to 20 takes too long for the
   payoff).
7. **Heal (aura) tuning**: tick more often + larger radius, including at L1.
8. **Drop reshuffle** (decision 3) — concrete table proposal at execution
   time; wolf line (Swift .1 / KeenEye .06 line-wide + per-mob rares) is the
   template to rework first.
9. **Campfire no-entry rule** (decision 4) — builds on the Session-⑤ camp
   watchdog; chase breaks at the radius, pathing avoids it.

Authoring rules still apply: tier + baseline for any touched mob, band-check
guardrails, sim battery after the HP/damage pass.

## Pass B — Communication & small fixes (frontend/content-heavy)

1. **NPC/popup package** (fixes four feedback items at once):
   - NPC text duration ×2 (texts vanish too fast to read),
   - unlock popups move to the top of the screen (they currently cover NPC
     texts near the bottom),
   - sequencing: NPC text first, unlock popup after,
   - unlock popup names its source ("Taught by: Town Crier" / "Drop: …") —
     tester never noticed *where* abilities came from.
2. **NPC trigger radius smaller** — discoveries feel random; tester repeatedly
   didn't realize she was talking to an NPC.
3. **Second sources for key skills** (principle: never gate a critical skill
   behind exactly one missable point):
   - Recover additionally taught by the 2nd Hermit,
   - FirstAid additionally obtainable at the second campfire.
4. **Warlord hint** — front guard NPC text gains "destroy his banners".
5. **Text/naming fixes**: Pickaxe description active-voice ("smashes
   boulders", not "Vulnerable to smash"); "Light" renamed/described so it
   reads as a light source (name = PO pick at execution); XP bar gets a
   label/tooltip (not recognized as an XP bar).
6. **Minimap compass** N/E/S/W.
7. **"Can't change loadout in combat"** goes through the alert-banner system
   (current warning goes unnoticed).
8. **Spellbook section headers** ("Passives" / "Aura Slots" / "Cooldowns")
   stronger still — the 1.1em gold pass wasn't enough; tester couldn't find
   passives.

## Pass C — UI features

1. **Equip flow click-to-bind** (decision 6).
2. **cLv nameplate colors** (decision 5) — likely needs an append-only mob
   level field on the wire (client doesn't know mob cL today); verify at
   execution.
3. **Darkness on bright screens** — on some displays "dark" areas are merely
   grayer, fully playable without light. Known placeholder
   (`FLOOD_OPACITY 0.6`), but the real fix is a multiply-style blend instead
   of an alpha flood so darkness actually darkens regardless of display
   gamma. Tech chunk.

## Own planning rounds (not scheduled yet)

- **Tutorial/onboarding** — the biggest feedback cluster: died to first wolf
  with aura never activated, "one resource" concept not understood, death
  flow unexplained, searched for an inventory that doesn't exist, wants the
  benefits of group play taught, "Tutorials überhaupt". Direction proposal:
  extend the village-arrival intro as a guided in-world strip (Town Crier
  explicitly teaches aura activation, etc.) rather than UI tutorial overlays
  — fits the environmental-storytelling vision.
- **Quests / quest tracking / NPC dialogs** — v1 scope question; the vision
  deliberately has no quest log, but the wish came up three times from an
  MMO newcomer. Lightweight middle ground to evaluate: a hint journal
  (collected NPC hints re-readable — also solves "want to talk to the NPC
  again" / walk-in-walk-out confusion).
- **Aura differentiation** — LongRangeStrike / Wild / Damage feel too
  similar; matches the standing "Wild reads as a trap pick" note. Options:
  VFX differentiation (pulse/wave), mechanical differentiation, or fewer
  auras with bigger contrasts.
- **Pickaxe/Harvest as limited-use keys** — if they stay key-like, their
  limited/keyed nature must be communicated explicitly (ties into the
  tutorial round).
- **"Motivation to try auras out"** — hangs on differentiation + respec
  costs; same round as aura differentiation.

## Known/deferred (no new action)

- Avatar customization (asked twice) — deferred; naturally lands with step-8
  accounts/persistence.
- "Better UI for many abilities" — UI-polish later passes (already listed in
  `plan-ui-polish.md` §Deferred).
- Unlock flood late-game ("überschwemmt, inflationär") — largely addressed by
  the drop reshuffle (Pass A); re-evaluate after.
- Step-8 accounts & persistence planning stays queued; Passes A–C slot in
  front of it (live playtest feedback has priority — same pattern as the
  2026-07-21 ad-hoc passes).

## Open

- One feedback line was garbled ("möchte questhat dinge aufgelevelt") — PO to
  clarify if it contained anything beyond the quest wish.
- "Light" replacement name = PO pick at Pass-B execution.
- Gray threshold −5, campfire-radius no-entry geometry, **respawn ×2**
  (RESOLVED at Pass-A execution — the "×0.5" above was self-contradictory
  against "too fast"; PO picked timers ×2, see §Pass A ledger), all new
  HP/damage/drop numbers: [PLACEHOLDER] until felt in-game.

## Pass A ledger

**Pass A (Balance & AI) DONE 2026-07-22, split A1 (Go/AI, TDD) + A2 (content
tuning) in one session — NOT yet PO-verified in-game, committed
`b0171ffb`.**

### PO rulings (choice prompts, 2026-07-22)

- Session split: **A1 code / A2 tuning** (A2 followed in the same session).
- **Respawn direction resolved**: the plan's "×0.5 (halved — too fast)" was
  self-contradictory; PO picked **timers ×2** (respawn half as often).
- Aggro reduction: **scale all ×0.6**, preserving authored relative differences.
- Mob HP: **graduated by band** (×1.2 cL4–6, ×1.35 cL7–11, ×1.5 cL12+).
- XP: **scaled by the same factor** as HP — the Session-⑥ kph-derived XP/h per
  band holds, so mobs get tougher without leveling getting slower (which would
  have fought item 6, the Vanguard gate).
- Z2 damage: **×1.25** (cautious).
- Drops: **rare carriers, not just elites** — the elite roster is too thin
  (EliteWolf cL5, EliteBandit cL7, Troll cL11, GreaterFireElemental cL20, Orc
  cL20, boss; three of those have a single spawn), so strict elite-only would
  have left low-level players with no drops for hours.
- **Boss respawn stays 5 min** (PO 2026-07-22). Note for the record: the
  Warlord is *not* a zone spawn — it is encounter-controlled at
  `encounter/warlord.go:47 respawnDelayTicks = 9000`, so the ×2 pass never
  touched it. The 6 spawns restored to 9000 are Bramble ×4 / Rockfall ×2 (the
  smashable gate obstacles).

### A1 — Go/AI (TDD, red → green)

- **Gray-aggro gate** (decision 2): new optional `model.Leveled` interface
  (`model/combatant.go`), implemented by the **player only** — mob-vs-mob
  acquisition (front war, predators hunting prey, summons) carries no character
  level and is untouched. `Mob.isGrayTo()` + `Mob.combatLevel()` (curve level,
  absent-→-1 baseline repeated for synthetic defs) gate **`findAggroTarget`
  only**: threat retention is deliberately untouched, so gray mobs still
  retaliate and still pay flat gray XP. `grayAggroBandLevels = 5` [PLACEHOLDER].
- **Campfire hard safe-zone** (decision 4): new `model/mob/safezone.go`.
  Radius = the campfire's **visible heal ring** (1.5), so the promise is exactly
  what the player sees. Three effects: acquisition skips in-zone targets; an
  aggro target reaching the fire **breaks the chase outright** (checked BEFORE
  threat retention so the cleared table cannot re-latch on the same tick →
  threat cleared, aura off, walk home); movement is radially clamped in a single
  choke point `Mob.moveTo()` so no movement mode (chase / walk-home / flee /
  idle wander) can bypass it — the mob slides along the boundary instead of
  freezing. Aligned mobs + `friendlyToPlayers` are exempt (a pet is not locked
  out of the fire). Zones are boot-time world data from `zone.campfires`
  (`cmd/aurad`), one package-level slice rather than threading a param through
  all 5 `NewMob` call sites; nil in sim/tests → pre-chunk geometry exactly.
  `CampfireSafeRadiusFactor = 1.0` [PLACEHOLDER].
- **Aggro radius ×0.6** across 27 non-legacy mobs (6→3.6, 5→3, 9→5.4; the 13
  `0.1` dummy fixtures and the legacy/proving-grounds set untouched). Also
  tightens the leash (`targetWithinSensor`), so mobs disengage sooner.
  **One deviation:** RallyDrummer 6→**4.5**, not 3.6 — its RallyDrum is a
  r4.0 *ally shield* that only switches on when it aggros, so a 3.6 sensor would
  have made it buff a ring wider than it can perceive. Every other mob still
  senses further than its own aura reaches.

### A2 — content tuning

- **Respawn ×2**: 399 world spawn timers doubled (proving-grounds untouched);
  main trash bucket 900→**1800** ticks (30 s → 60 s), 306 of 399 spawns. The
  9000-tick (5 min) tier restored per the PO ruling above.
- **Mob HP + XP graduated**: 19 mobs. Bear 160→192, Bandit 90→108,
  DireBear 210→284, Marauder 130→195, Orc 280→420; `experience` scaled by the
  same factor. **Excluded by design:** the Warlord encounter set (OrcWarlord /
  OrcGrunt / WarbannerTotem — a scripted fight is its own tuning target),
  friendly ArmySoldier, and the hazard/fixture roster.
- **Z2 damage ×1.25**: BanditBlades 9→11.25, BanditVolley 8→10, EmberAura
  6→7.5, EliteBanditSlash 14→17.5 (per-level values scaled too). Kobolds
  (tunnel cL3) and the front/orc set are not Z2 and stayed put.
- **Faster than the player**: parity is speed **0.909** (player 0.05/tick vs
  mob 0.055 × speed). AlphaWolf 0.74→**0.95**, Marauder 0.65→**0.92** now
  outrun the player; DireWolf 0.72→0.88 sits deliberately just under.
- **Vanguard teacher gate** 20 → **15**. **Heal aura**: radius 1.0→**1.5**
  (+0.1/level) and tickInterval 120→**80**.
- **Drop reshuffle**: 30 → 29 entries, **zero orphans** (full reachability
  graph checked before *and* after — every strip is a move, never a delete).
  Stripped from the trash: Boar (74 spawns), Bear, Spider, Bandit; Wolf (87
  spawns) keeps only Swift **.04** as the "first drop" moment. Raised on the
  rare carriers: EliteWolf +Dash .2 +Hardy .2 (from Boar), Swift .25 /
  KeenEye .2; DireBear +ThickHide .2 +Berserker .15 (from Bear), Recover
  .02→.25; EliteBandit +Fade .35 (from Bandit); AlphaWolf Reaper .2→.35;
  Troll Tough .25→.4; GreaterFireElemental FireTotem .2→.5; Warlord
  Rejuvenation .1→.25; BanditRanged Slow .03→.2; BanditPyromancer NovaBurst
  .05→.3; FireElemental FireWard .2→.35. Kept as hand-picked commons: Light on
  both kobolds (tunnel key), Antivenom on VenomSpider, Taunt on RallyDrummer.
  **Orc** (cL20 elite, 10 spawns) was dropless and now carries **Tough .2** — a
  second source for a Barrier ingredient.

### Verified

- `go build ./...` clean; `go test ./...` **exit 0, 29 packages** (incl. the
  deterministic guardrail asserts).
- **Roster band-check holds** after the HP/damage pass: Z1 soft=[KoboldRanged,
  VenomSpider, SaberToothCat, Wolf, Boar, Spider, FireTotem] hard=[Kobold,
  Bear]; Z2 soft=[BanditRanged, DireWolf, BanditPyromancer] hard=[Bandit,
  DireBear]; farm soft=[GiantSpider] hard=[AlphaWolf, Marauder]. Elite ≤25%
  and boss-kills-the-bot ceilings all still pass.
- Boot: `10 items/82 skills/14 factions/50 mobs/10 recipes/1 milestone/5 props/
  815 props/399 spawns/5 campfires (safeRadius 1.5)/14 npcs, 0 panics`.
- Browser smoke 6/6, no JS errors. 9 new Go tests (gray gate at/inside the band
  edge, gray retaliation, unleveled-never-gray, cL fallback, chase-break,
  acquisition skip, body-never-enters, aligned exemption, empty-by-default).
- `world.json` diff is exactly 400 lines (399 timers + the Vanguard gate) — no
  reformatting of a file the PO edits by hand in the zone editor.

### Watch items / open calls for the feel pass

- **Heal self-cost per second rose 1.5×** with its throughput — cadence changed,
  the FINAL 10−2/level per-tick curve left intact. At L1 the caster bleeds
  ~3.75 HP/s while healing instead of 2.5. If too expensive, scale
  `selfDamageHP` down rather than reverting the cadence.
- **KeenEye came off Wolf**, deviating from the 2026-07-21 "KeenEye .06
  line-wide" ruling — deliberate under the new hybrid decision (Wolf is the
  87-spawn trash); a one-line revert if the line should stay intact.
- **Campfire splash gap**: a mob fighting player A *outside* the fire can still
  clip player B standing just inside (only that mob's own target check breaks).
  Dead centre is safe. Raising `CampfireSafeRadiusFactor` above 1.0 closes it,
  at the cost of mobs orbiting visibly further out.
- **Plinking from inside**: a player at the inner edge can hit mobs at the
  boundary that won't retaliate. Geometrically narrow (player auras r≈1.0–1.4),
  but it exists by construction of "guaranteed safe".
- **Content pin moved**: `cmd/simharness/serve_test.go` pinned EmberAura's
  authored damage at 6 → now 7.5 (the Z2 pass). Expected, noted in the test.
- All new numbers are [PLACEHOLDER]: gray band −5, safe-radius factor 1.0,
  respawn ×2, the three HP/XP band factors, Z2 ×1.25, the three speeds, Heal
  1.5/+0.1/80, and every drop chance above.

## Test strategy

- Pass A: sim-harness kph/TTK battery after the HP/damage pass (guardrail
  asserts must stay green); Go tests for gray-aggro + campfire no-entry
  (TDD: failing test first); in-game feel pass on the live server.
- Pass B: Playwright smoke for popup positioning/sequencing; in-game read
  pass by PO.
- Pass C: per-feature (equip-flow Playwright script, nameplate colors visual,
  darkness check on the problem display).
