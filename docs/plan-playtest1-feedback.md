# Plan: Playtest-1 Feedback (external tester)

**Status:** **Pass A DONE 2026-07-22** (A1 + A2, `b0171ffb`), **Pass B DONE
2026-07-22** (`75486ec9`), **Pass C items 1 + 2 DONE 2026-07-22**
(`22028dc4`) — all awaiting the PO in-game feel/read pass.
**NEXT: Pass C item 3 (darkness multiply blend)** in its own session, then the
deferred Pass-B items 1c + 1d. The tutorial/quest/aura-differentiation themes
go to their own planning rounds. Full ledgers: §Pass A / §Pass B / §Pass C
ledger at the end of this doc.

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
   **↺ RE-OPENED 2026-07-22:** shipped in Pass A, then **reverted** (`6e7a301e`,
   PO-verified) after the PO played it — with no level signal on the mob it just feels bugged when
   some mobs stop reacting. Revisit once the decision-5 nameplate colors land
   (Pass C), which supply the missing explanation. Flat gray XP is unaffected.
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
- ~~"Light" replacement name = PO pick at Pass-B execution.~~ **RESOLVED
  2026-07-22: Lantern** (full registry rename, see §Pass B ledger).
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

- ~~**Gray-aggro gate** (decision 2)~~ — **REVERTED ✅ `6e7a301e` 2026-07-22 (PO call),
  PO-verified in-game the same day ("aggro works again, mobs come at me now");
  decision 2 is re-opened.** In play it read as a bug rather than a rule: some mobs simply
  stopped reacting with no visible reason, and nothing in the UI explains why.
  Reverted in full — `model.Leveled`, `player.CombatLevel()`, `Mob.isGrayTo()`,
  `Mob.combatLevel()`, `grayAggroBandLevels` and `gray_aggro_test.go` are all
  gone; `findAggroTarget` is back to faction + safe-zone gating only. The
  `sensedBy` test helper moved into `safezone_test.go` (its only remaining
  user). May return later — likely paired with the Pass-C nameplate level
  colors, which would give the player the missing "this mob is beneath you"
  signal. What it *was*: an optional `model.Leveled` implemented by the player
  only (mob-vs-mob acquisition untouched), gating acquisition only —
  retaliation and flat gray XP were always kept.
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
  acquisition skip, body-never-enters, aligned exemption, empty-by-default) —
  **the 4 gray-gate tests went with the 2026-07-22 revert; the 5 safe-zone
  tests remain, `go test ./...` exit 0 / 29 pkgs after it.**
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
- All new numbers are [PLACEHOLDER]: ~~gray band −5~~ (reverted), safe-radius factor 1.0,
  respawn ×2, the three HP/XP band factors, Z2 ×1.25, the three speeds, Heal
  1.5/+0.1/80, and every drop chance above.

## Pass B ledger

**Pass B (Communication & small fixes) DONE 2026-07-22, one session —
NOT yet PO-verified in-game, committed `75486ec9`.** All 8 plan items
landed; item 1 shipped partially by PO decision (see below).

### PO rulings (choice prompts, 2026-07-22)

- **"Light" → `Lantern`** — full registry rename (not a `displayName`
  override), so the JSON name, the two kobold drop refs and the file name all
  agree. Rationale: pairs with the dimmer `Torch` passive as an object-name
  family, and reads unambiguously as a light source.
- **Unlock source attribution (items 1c + 1d) SKIPPED** — "just reposition".
  The client derives unlocks from a spellbook diff and has no source data; the
  offered fix (server-authored per-unlock alert from all 5 grant sites, reusing
  the EntityMessage channel with a reserved sentinel id, no schema change) was
  deferred. The overlap complaint is addressed by 1b alone. **Still open.**
- **FirstAid second source = the existing VillageHealer** (it already stands
  1.5 u from the village campfire) rather than a new campfire-teaches
  mechanic — zero new machinery for the same in-world result.
- **Recover second source = the Shaman @ (18, 6)** (Hermit sprite, Zone 2,
  the NPC nearest map centre). Note for the record: no Hermit-sprite NPC
  actually stands at a campfire near map centre — the four candidates were put
  to the PO with their real coordinates and this one was picked.

### Frontend (no wire change, no schema change)

- **NPC bubble duration ×2** — new `BasicConfig.NPC_MESSAGE_DURATION` **10000**
  [PLACEHOLDER], selected in `_GameObject.say()` off the existing `latestWins`
  flag. Deliberately *not* shared with `CHAT_MESSAGE_DURATION` (5000): an NPC
  line is content to read, a chat line is conversation.
- **Alert banner 22vh → 7vh** [PLACEHOLDER] + new **`warning`** AlertKind
  (`#ff8a72` red). `rejectEquipInCombat` (item 7) moved off
  `showFloatingText` over the character — the playtester never noticed it
  there, because the eyes are on the panel being clicked.
- **Tooltip wording** (item 5a): gated damage tags now render as what the
  player *does* — `GATED_TAG_LINES` maps `smash` → "Smashes boulders and
  rockfalls — nothing else", `harvest` → the plants equivalent; an unmapped
  tag falls back to the old passive phrasing rather than inventing a verb.
  `light_aura` "Emits light" → "Lights up the darkness around you".
- **XP bar** (item 5c): `12/300` → **`XP 12/300`** + a `title` tooltip. The
  tester did not recognise the bare numbers as an experience bar.
- **Minimap compass** (item 6): four static CSS labels in `HUD.html` over the
  rim, *not* pixi — `MiniMap.ts` contains no rotation code at all, so the map
  is permanently north-up. E/W need a larger inset (1vw) than N/S (0.2vw):
  they sit at the circle's widest point and straddled the rim at 0.35vw.
- **Headers** (item 8): spellbook `.sectionHeader` gains a filled gold band +
  2px rule, 1.1em → **1.3em**; all four panel titles (`.spellbookTitle` +
  the three `.auraLoadoutTitle`s) go gold + ruled at `@panel-title-size × 1.2`.
  **Deviation from plan:** the plan named only three titles, but leaving
  "Spellbook" grey among four sibling panels reads as a bug — flagged to PO.

### Content

- **Light → Lantern**: `api/skills/light.json` git-mv'd to `lantern.json`,
  `"name"` changed, both kobold `skillName` drop refs and the `_comment`s
  updated, plus the `registry_test.go` roster comment. Id **6** and the
  registry pin **82** are untouched — a name-only change.
- **NPC sensor radius 1.5 → 1.0** [PLACEHOLDER] on all 14 NPCs (item 2). One
  `sed` on `"radius": 1.5` — verified safe first: the only other `radius` key
  in the file is `darkAreas`, whose values are 4.0–7.2, so exactly 14 lines
  moved. Geometry: NPC body 0.35 + player 0.25 = 0.60 contact distance vs
  1.0 + 0.25 = 1.25 detection, so the player gets ~0.43 s of walking inside
  the sensor and then physically bumps into the NPC — which is the point of
  the item ("didn't realize she was talking to an NPC").
- **Second sources** (item 3): Shaman gains **Recover @L4** [PLACEHOLDER]
  ordered *before* its SummonTotem @L5 (the ordered walk stops at the first
  too-low teaching, so the lower gate must come first); VillageHealer gains
  **FirstAid @L2** [PLACEHOLDER] before its Revive @L8.
- **Warlord hint** (item 4): FrontCaptain `lines` gains "…Destroy his banners
  first — then bring him down." **Scope extension:** the hint also went into
  `tooLowLine`. `onApproach` speaks the *teaching* line on a first meeting and
  only falls back to `lines` afterwards, so a player who has just earned
  Vanguard would never hear the hint; and under-15 explorers who find the
  front early are exactly the audience that needs it.

### Verified

- `go build ./...` clean; `go test ./...` **exit 0, 29 packages**.
- Boot: `10 items/82 skills/14 factions/50 mobs/10 recipes/1 milestone/5 props/
  815 props/399 spawns/5 campfires (safeRadius 1.5)/14 npcs, 0 panics`, no
  warnings.
- Frontend `npx tsc --noEmit` clean; webpack prod build green.
- **Playwright smoke 15/15, no JS errors** — banner at 7.0vh, `XP 0/300`,
  compass N/E/S/W with real layout boxes, 3 gold banded section headers, 4 gold
  ruled panel titles, `Lantern` in the spellbook and in `GET /skills` (and
  `Light` gone), Pickaxe tooltip active voice, warning banner red.
- **In-game NPC pass:** teaching confirmed at the new 1.0 radius for
  Farmer/Harvest (ungated), Shaman/Recover, VillageHealer/FirstAid and
  FrontCaptain/Vanguard; both FrontCaptain text paths screenshotted
  (under-level `tooLowLine` and veteran lore lines, hint legible in both).
- `world.json` diff is 43 lines — no reformatting of a file the PO edits by
  hand in the zone editor.

### Watch items / open calls for the read pass

- **Items 1c + 1d are still open** (sequencing + "Taught by: …" source). The
  tester's "never noticed *where* abilities came from" is unaddressed.
- **Long NPC bubbles can still graze the banner.** At 7vh the original
  complaint is fixed, but the FrontCaptain's 7-wrapped-line bubble still
  reaches up near it when the NPC sits at screen centre. Implication: keep
  lore lines to ~2 short sentences, or reduce the bubble wrap width.
- **`WARP` has 1-unit granularity** — `sys/cmd/cmd.go:76` does integer
  division (`x / codec.Points2px`) before the float cast, so fractional
  coordinates truncate. With the sensor now at 1.0 this can no longer reliably
  land you inside an NPC trigger (it produced one false test failure: (58,26)
  is 1.27 from the captain, just past the 1.25 threshold). Pre-existing, not
  introduced here — but it now matters for PO walkthroughs.
- **Spellbook title went gold too** (consistency call, see Frontend above) —
  one-line revert if the PO wants only the three planned titles.
- All new numbers are [PLACEHOLDER]: NPC radius 1.0, banner 7vh, NPC bubble
  10 s, Recover @L4, FirstAid @L2, header sizes/band colours, compass insets.

## Pass C ledger

**Pass C items 1 + 2 DONE (2026-07-22), frontend + one backend endpoint —
NOT yet PO-verified in-game, committed `22028dc4`. Item 3 (darkness
multiply blend) SPLIT OUT to its own session** — it is a rendering-tech chunk
with its own diagnosis phase and shares no code with 1 or 2.

### PO rulings (choice prompts, 2026-07-22)

- **Nameplate content = name + level** ("Alpha Wolf 10"), not name-only and
  not level-only. The number is the literal signal the reverted gray-aggro
  gate was missing, and pairing it with the tint teaches the colour code.
- **Colour bands = WoW-classic**: `≥ +5` red / `+3..+4` orange / `−2..+2`
  yellow / `−5..−3` green / `≤ −6` gray. Matches the ≈+5 band width the level
  curve already locks in, so "red" and "a band above you" mean the same thing.
- **Gray-aggro NOT re-landed** (decision 2 stays reverted) — ship the colours,
  play them, then decide. Re-landing blind risks a second "feels bugged"
  revert; reversing `6e7a301e` later is trivial.
- **No equip-flow hint text** — the keys are wired, teaching the flow belongs
  to the tutorial/onboarding planning round with the rest of the onboarding.
  Discoverability therefore remains unchanged by this pass.

### C1 — click-to-bind (frontend only)

- **Half of decision 6 already existed**: spellbook click → slot click has
  worked since the panel was built. Missing was the *"or press slot key"*
  half — `hotkeyAuraSlot`/`hotkeyCooldownSlot` ignored the pending selection.
- **`tryEquipPending(category, slot)`** is now the single implementation,
  shared by the three slot-click handlers and both hotkey entry points, so
  keyboard and mouse cannot drift apart on the combat lock or the category
  rule. Net effect: three inlined copies collapse into one helper.
- **A category mismatch consumes the key** rather than falling through —
  otherwise, with a passive pending, pressing `1` would silently fire your
  aura instead of doing nothing.
- **Escape cancels** a pending selection (`Controls.handleFunctionKeys`, no
  `preventDefault` so Escape keeps its browser meanings). Previously the only
  exit was re-clicking the same entry, and a forgotten pending selection
  silently swallowed every subsequent slot keypress.
- **Passives stay click-only** — no key is assigned to passive slots and none
  was invented.

### C2 — cLv nameplates (no wire change, no schema change)

- **Mobs had no name text at all**, so decision 5 meant *adding* the
  nameplate, not recolouring one. `MobDefinition` already carries `Name` +
  `CurveLevel` + `Tier`, and the snapshot has always sent `mob_id` (never
  read client-side) — so the whole feature needs **zero schema change**.
- **`GET /mobs`** (`mobs.CatalogHandler`, mirroring `skills.CatalogHandler`):
  per-species metadata as JSON, marshaled once at boot. The alternative —
  appending name+level to every Mob in the per-tick snapshot — would ship
  constant per-species data 30×/s per mob.
- **Minimal projection by design**: `{id, name, displayName, curveLevel,
  tier, combatTarget}`, with `TestMobCatalogJSON_ExposesNothingBeyondNameplateFields`
  pinning that exact key set. A public endpoint serving the full definition
  would leak drops/resistances/HP — an out-of-game answer key against the
  zero-hint policy.
- **`combatTarget` = grants XP && not friendly to players** — derived, not
  authored. Campfires, braziers, companions, totems, brambles, rockfalls,
  poison pools and spike barricades are all `MobDefinition`s; without this a
  "Campfire 1" plate lands on screen. The zero-XP set turned out to be
  *exactly* the props/summons/hazards/obstacles.
- **Plate lives on the unfiltered `namePlates` overlay** (the `Character.plate`
  pattern), not inside `shape`: the night filter recolours everything in the
  world layers, and a tint is the entire feature — a green mob would read
  yellow at dusk. The plate mirrors `shape.alpha` so it fades with the mob's
  corpse fade instead of hanging at full opacity over a vanishing mob.
- **Tint recomputed per frame, not pushed on level-up**: it depends on the
  *player's* level, so a push would need every live mob to subscribe to a
  level event. Two integer ops per mob per frame, and PixiJS is only touched
  when the band actually changes — so levelling up recolours the world.
- **Drive-by DRY**: `deriveDisplayName` → exported `skills.DeriveDisplayName`,
  now used by both catalogs (two copies of a naming convention drift apart);
  the ws→http catalog-URL derivation → shared `catalogUrl()` in `Urls.ts`.

### Verified

- `go build ./...` clean; `go test ./...` **exit 0**, including the 6 new
  `pkg/aura/items/mobs` catalog tests.
- `tsc --noEmit` clean; webpack prod build green.
- Boot: `82 skills/14 factions/50 mobs/10 recipes/815 props/399 spawns/5
  campfires (safeRadius 1.5)/14 npcs, 0 panics` — unchanged, as expected for
  a pass that adds no content.
- **C1 Playwright smoke 8/8**, no JS errors: hotkey binds aura + cooldown,
  binding clears the selection, mismatched category neither equips nor fires,
  Escape cancels, and with nothing pending the keys still activate.
- **C2 Playwright smoke 5/5**, no JS errors: catalog served, name/level/tier
  correct, fixtures excluded, real mobs included, no key leakage.
- **Visual**: the same wolf (cL2) reads **yellow at player L1 → green at L7 →
  gray at L21**; the village campfire and the NPCs carry no plate.

### Watch items / open calls for the feel pass

- **`combatTarget` has two visible consequences to judge**: the **Turnip gets
  a plate** ("Turnip 1", gray — it grants 1 XP), and **Fire Totem / Poison
  Pool get none** despite being genuinely hostile, because they grant 0 XP.
  Both are one-line flips if the PO wants them the other way.
- **Nameplate font size 16 + 16 px gap** below the HP bar are [PLACEHOLDER];
  at default zoom "Wolf 2" is legible but small.
- **Slot hotkeys look broken under Playwright unless the key is held ~1.3 s.**
  They are edge-triggered off `Controls.update`, whose Tock clock is
  rAF-driven, and a headless/backgrounded page throttles rAF far below the
  nominal 33 ms `INPUT_TICKRATE` — a 200 ms tap falls between two samples and
  nothing fires, even though `key.isDown` really does flip. Raw `window`
  keydown listeners (Escape, chat, console) are unaffected, which makes the
  failure look feature-specific. Harness artifact only; recorded as a gotcha
  in `.claude/skills/verify/SKILL.md`.
- **Gray-aggro (decision 2) can now be re-evaluated** — the level signal it
  was missing is on screen.
- All new numbers are [PLACEHOLDER]: the five band colours + their
  thresholds, nameplate font size 16, `NAMEPLATE_GAP` 16.

## Test strategy

- Pass A: sim-harness kph/TTK battery after the HP/damage pass (guardrail
  asserts must stay green); Go tests for gray-aggro + campfire no-entry
  (TDD: failing test first); in-game feel pass on the live server.
- Pass B: Playwright smoke for popup positioning/sequencing; in-game read
  pass by PO.
- Pass C: per-feature (equip-flow Playwright script, nameplate colors visual,
  darkness check on the problem display).
