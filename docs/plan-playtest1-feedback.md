# Plan: Playtest-1 Feedback (external tester)

**Status:** PLANNED 2026-07-22 — triage session complete, all gating PO calls
made (choice prompts). Execution order: **Pass A → Pass B → Pass C**; the
tutorial/quest/aura-differentiation themes go to their own planning rounds.
No code written in this session.

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
- Gray threshold −5, campfire-radius no-entry geometry, respawn ×0.5, all new
  HP/damage/drop numbers: [PLACEHOLDER] until felt in-game.

## Test strategy

- Pass A: sim-harness kph/TTK battery after the HP/damage pass (guardrail
  asserts must stay green); Go tests for gray-aggro + campfire no-entry
  (TDD: failing test first); in-game feel pass on the live server.
- Pass B: Playwright smoke for popup positioning/sequencing; in-game read
  pass by PO.
- Pass C: per-feature (equip-flow Playwright script, nameplate colors visual,
  darkness check on the problem display).
