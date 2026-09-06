# Feedback intake

The single landing surface for raw feedback: playtest reports, PO observations,
bug sightings, things said out loud during a session. Established 2026-08-24 as
the successor to `plan-playtest-feedback.md`'s intake role (that doc is
archived; its remaining open items were redistributed the same day).

## The pipeline

1. **Capture.** Every item lands here as a dated row (source, one line).
   Capture is cheap; nothing is lost because it seemed small.
2. **Triage.** Every item leaves this doc through exactly one of four doors,
   normally in the same session or the next one:
   - **→ plan** - it is scheduled work; it moves into an existing or new
     `docs/plan-*.md` (link it from the row before pruning).
   - **→ ruled** - the PO decides it on the spot; the ruling is recorded where
     it belongs (a CLAUDE.md standing lock, a plan doc, a backlog entry) and
     the row closes.
   - **→ watch** - not now, but with a NAMED re-open trigger; it becomes a
     `backlog.md` entry carrying that trigger.
   - **→ dropped** - closed with a one-line why.
3. **Prune.** A row that has exited stays only until the wrap of the session
   that moved it; the receiving doc is the record. This file stays short - if
   it grows past a screen or two, triage is overdue.

Standing rules:

- **Plan docs never double as intake.** Accumulating feedback rounds inside a
  plan doc is what grew `plan-playtest-feedback.md` to 3,400 lines and made
  its open items invisible.
- Content ideas (specific mobs, skills, lore) still go to the `content-*.md`
  catalogs; unscoped feature/system ideas to `backlog.md`. This doc is the
  funnel, not the archive.
- A watch item without a trigger is not a watch item - name the condition that
  re-opens it or pick another door.

## Open items

| Date | Source | Item | State |
|---|---|---|---|
| 2026-07-29 | playtest-feedback open question 8 | Does the pacifist healer's threat table have any consumer besides Taunt (`ForceThreatToTop`)? If not, the uniformity ruling still stands - but it should be said explicitly rather than by accident. | open question, awaiting ruling |
| 2026-08-24 | PO mockups (chat) | Animation wishes: ice-aura particle field, punch/sword strike at the hit target, fireball + slow-bolt projectiles with impact-timed damage numbers. PO rulings same day: dressing over normal aura ticks (no new targeting mechanic), own player first, one strike per victim (most auras are nearest-1 BY CONTENT), lane = prototype branch. | → plan: prototype BUILT on `prototype/skill-visuals` (`f2e4083c`, 2026-08-25), PO first pass "works"; extended testing + feedback round pending, its verdict routes the ship version into `plan-entity-presentation.md` §6 (row prunes on that verdict) |
| 2026-09-05 | PO, mid-session | **Content census tests must not go red just because content was added.** Three tests in `pkg/aura/items/mobs` hardcode a roster or a count and so fail on any new mob/NPC that is otherwise perfectly authored: `TestContent_ConversantCensus` (an explicit name list), `TestContent_AuthoredRoleCensus` (a creature COUNT), `TestContent_XPFactorZeroSpeciesAreNotPrey` (`assert.Len(free, 34)`). The collaborator's Martin NPC (`6c2e6d5c`) tripped all three and they stayed red at HEAD for weeks, which is the real damage - a permanently-red suite stops being read. PO call the same day: **martin.json deleted** (unplaced stub, TODO opening line, referenced by no zone or quest - suite green again), and the tests themselves are the thing to fix: they should assert the INVARIANT (a conversant resolves its grants; a creature is not a structure; an xpFactor-0 species is not prey) and not the population. | open - needs a door: the fix is a plan-sized pass over the three, or a ruling that a census is worth its churn |
| 2026-09-06 | M1 measurement session (`plan-world-scale.md` §11 M1-F1) | ⛔ **A corpse panics the snapshot encoder, so every player death aborts server ticks.** `codec.EntitiesMarshalFlatbuf` (`gamestate.go:551-576`) switches Player/Mob/Prop and `panic()`s in `default`; **`CorpseEntity` (EntityType 23) has no case** — there is no "Corpse" anywhere in `pkg/aura/codec`. The corpse body sits on `LayerViewportCollision` (`model/corpse/corpse.go:27`), the exact mask **both** player and spectator viewports select, so the corpse enters viewports and `runTick`'s `recover()` aborts the tick (*"world partially updated"*) for as long as it is visible. Trigger is the ordinary death path (`sys/state.go:1044`, and the reconnect-while-dead path at `:951`): a dead player becomes a spectator on the death overlay standing on their own corpse. Measured on the real `world` zone with the repo's own `api/`, 10 bots, 40 s: **1 024 panics / 1 523 ticks (67 %)**, snap/s/bot 5.4, max tick 17 499 µs — versus **0 panics**, 30.0 snap/s, 5 002 µs with `-god`. ⚑ Seen from `playerSendState` as well as `spectatorSendState`, so a *live* player near any corpse is enough. ⚑ Long-standing, not a regression: the corpse model is untouched since the step-7 rebrand (`aa509d95`), and `core/game.go:389` already carries the standing warning for exactly this class. ⚑ It also silently corrupts any capacity measurement taken without `-god` — M1's ladder had to be re-run because of it. | open — needs a door: looks like a small fix (a `CorpseEntity` case, or keep corpses off `LayerViewportCollision`) but it is a **wire/gameplay decision** — does the client render corpses at all today? Wants a chunk with a red-first test |
| 2026-09-06 | PO, off the back of the world-scale Leg C in-game pass | ⭐ **Do a dormant mob's sleep conditions match a CREDIBLE world-simulation state?** Two cases the PO named; both checked against the code the same day and **both are reachable today** (`docs/plan-world-scale.md` §11 M1-F5). **A — an unobserved mob-vs-mob fight never ends:** mob-on-mob hostility is authored content already (`api/factions/human_army.json` has `"hostileTo": ["orc"]`, another faction lists `["aligned", "human_army"]`), and `Pristine()` refuses `InCombat()` plus any non-empty threat table — so if the player walks away **mid-fight**, both combatants stay awake and fight to the death unobserved, burning tick budget in exactly the region S3 exists to stop paying for and churning authored spawns off-screen. ⭐ The PO's own parenthetical is the other half and is correct: a mob that DID sleep is out of the physics space, so an awake mob's sensor cannot reach it — it is **effectively invulnerable**. **B — a mob can freeze mid-walk-home, off its route:** ⚑ there is **no "returning home" mode** (`combatMode` is only `modeIdle｜modeEngage｜modeSupport｜modeFlee`, `model/mob/support.go:44-51`) and the walk-home lives *inside the idle path* (`patrol.go:108-113`, `if m.returnPosSet { m.idleWalk(m.returnPos) }`). After a leash the mob clears threat → mode falls to `modeIdle` → health regens (~5 s) → **`Pristine()` goes true while it is still walking home**, so it sleeps clumped from the chase, off its patrol route, away from its spawn, and stays there until someone comes close. ⭐ **This is precisely the case S3's L7 ruling does NOT cover** — L7 reasoned about a patroller frozen mid-leg *on its own route* (benign); a mob frozen mid-return is parked somewhere the world never authored. | open — needs a door: **B** looks like a narrow D3 amendment (refuse sleep while `returnPosSet`, i.e. sleep only once home/on-route) and is cheap; **A** is a genuine design ruling (should unobserved mob-vs-mob combat run at all, freeze, or auto-resolve?) — both are gameplay-visible, so PO's call, not a perf tidy-up |
| 2026-09-06 | M1 Leg C, testability gap | **L2 (totem beside a sleeper) cannot be verified in-game today** — mobs kill a planted totem too fast to observe, and it times out anyway. Needs an **invulnerable, long-TTL totem**, which no cheat provides. Covered meanwhile by unit legs (`sys` leg 6) and D4's construction, so this is a testability gap rather than a known defect. | open — cheap fix: one cheat that plants a pinned totem, worth adding whenever someone is next in `sys/cmd` |
