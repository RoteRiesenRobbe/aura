# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- Pointer only. Keep this section to: last completed, what's next, open PO calls, open
     code-health findings, and standing locks/gotchas. FULL per-chunk ledgers live in the
     plan-*.md banners; the authoritative sequence + per-step outcomes live in roadmap.md
     "Execution order". Don't re-expand chunk ledgers or per-chunk placeholder values here —
     point to the plan doc. See the `chunk-wrap` skill for the collapse rule. -->

- **⭐ Entity-model design session — backlog §31 resolved into a plan (2026-07-26, DOCS ONLY, no code)** ✅ `d3904307` — new **`docs/plan-entity-model.md`** ("the Actor model"), indexed in `docs/README.md`. **7 PO decisions · 5 chunks · all of it runs BEFORE step 8.** **⭐ CODE-AUDITED 2026-07-26** (4 parallel line-level sweeps, corrections folded into the plan doc, tagged "code audit" there): the reframe held line-for-line; **4 material drifts fixed** — `DerivedStats` has **6** fields not 5 and `Derived.Resistances` is a **4th player-only stat** (deferred out of 1a, composition-with-authored-resists question recorded) · summon **output already tracks the owner's level LIVE** via `casterPowerScale` (`skills.go:382`) while HP is spawn-frozen ⇒ 1b must decide spawn-vs-live `Level` (recommendation: live) · NPC inventory is **16 entries not 14** (2 legacy proving-grounds Sages, keep-or-drop = open question 6) · L5 resolved: nameplate + tier frame gated **free**, the **health bar is ungated** (`initHealthBar` unconditional, `Mobs.ts:113`) so 3a adds the gate or the PO accepts bars. Also: 1a needs curve-threading into the mob layer (no `curve.Curve` retained, only the float), and `client.fbs`'s union is **unpinned/positional** — append-only by discipline alone. ⭐ **The reframe that did the work:** §31 reads as *"three types should be one"*, but traced against the code it is the inverse — **`Mob` is ALREADY the universal entity, doing five jobs, and it signals which job by lying about its numbers.** 10 defs use `speed: 0` to mean "structure" (plus a dummy `aggroRadius: 0.1` on all 10, and `collisionLayer: 32` / a `resistances` wildcard where that wasn't enough); 4 use `velocity > 0` to mean "follower"; and the one role with **no number to hide behind** — teacher — had to become a separate statless type. **Role is inferred from incidental values instead of authored, and that single defect is behind all five gaps.** **2 findings that shrink the work:** ① **gap 3 is already ONE curve** — `definitions.go:294` and `player.go:253` both call the same injected `curve.Curve.F()`; the only difference is that a mob's is frozen at registry load and **`*Mob` has no `Level()` accessor**. ② **the WoW-NPC target is 3 pillars done, 1 missing** — `api/factions/human_army.json` already ships `hostileTo: ["orc"] + friendlyToPlayers: true`, so **`ArmySoldier` IS the NPC the PO described** (fights orcs on sight, ignores players, unattackable by them); it simply cannot talk, because the thing that talks is a different Go type with no HP. Faction *reaction* and *unattackability* are done; only the **interaction layer** and the **type split** are missing. **Target: one Actor core + optional capabilities** (`Controlled`/`Brained`/`Conversant`/`Owned`/`Rewarding`/`Perishable`, via the already-proven `acting any` structural assert), explicitly **NOT** a god struct — and **`role` and capabilities are ORTHOGONAL**: an NPC is not a role, it is a creature/structure carrying an `interaction` block, so a teaching guard that fights bandits needs no new type and no new branch. **⚑ Sequencing principle on record: Go types are free to change; content JSON and the persisted schema are not** ⇒ authoring vocabulary → persistence vocabulary → Go structure. **The 7 rulings:** ① mob passives scale **identically** to player ones — one formula `effective = base × (1 + derived)`, where `factors.*` **is** the base and passives **are** the multiplier, which dissolves gap 2 along with gap 1 · ② **levels dynamic for every actor** — collapses `SummonPower × owner.PowerScale()` **and** `RaiseMaxHealth` into `Level = owner.Level`, and unblocks the parked `Autoattack` · ③ **NPCs merge in this pass**, `model/npc` deleted (content is at its smallest it will ever be — 14 NPCs, one line each) · ④ **only live players persist** ⇒ step 8's schema is barely constrained; it just needs the character record written in **Actor vocabulary** (`level`/`faction`/`loadout`/`spellbook`/`xp`), not as a player-struct dump · ⑤ conversations start with an **interact key in range** — no world targeting, so the GDD "no targeting" pillar stands; proximity-opens-panel rejected because NPCs standing among mobs would pop panels mid-fight · ⑥ define the **full** interaction container (nodes/conditions/options/**typed grant list**) but author only the degenerate one-node `teach_skill` case ⇒ gossip trees, quest offer/accept, vendors and the journal become later *additive content*, not a schema migration · ⑦ **all three chunks, then step 8.** **Chunks:** **1a ✅** one derived-stat formula (three factor methods on `DerivedStats`, both model types call them — `acting any` is the wrong tool here, they know their own type) + `game.mob.walkingSpeedPerTick` + `Level()` on Mob — **no numbers move, and sim byte-identity IS the acceptance test** · **1b ✅** dynamic levels + summon-scaling collapse — **numbers DO move**, harness before/after + PO sign-off · **2 ✅** authored `role` (`creature`/`structure`/`follower`), retiring the two inferences and the 10 dummy aggro radii — **and the sim harness, which read `speed: 0` as *turret*: new landmine L9** · **3a ✅** NPC merge + interaction schema — `model/npc` deleted, `zone.npcs` folded into `spawns`, health bars on NPCs **accepted** (so L5 needed no gate) · **3b** interact verb + dialogue panel. **⚑ 3 landmines worth knowing before anyone touches it:** mob speed is `0.055 × factors.speed` vs the player's `0.05`, so a naive "convergence" makes **every mob in the game 9 % slower** — mirror the name and unit, keep the value (the `game.mob.healthGainTick` precedent); **`SetFaction` nukes the authored aggro mask** (`mob.go:559` → `^f.Bit()`, "aggro everything that is not me") — audit: **TWO callers, not one** (`spawnSummon` + campfire placement `aurad.go:157`; the `mob.go:554` "first caller" comment is stale), inert in effect today but **directly blocking** any charm / side-switch / quest-turns-hostile; and **NPCs change wire path in 3a** — they ride the *Resource* path today (`Resources.ts`), as Actors they ride the *Mob* path — audit resolved the exposure: nameplate (`combatTarget`) and tier frame (rank 0 invisible) are gated **for free**, only the **health bar is ungated** and needs a 3a gate (screenshot still required). 5 more landmines + the per-chunk test strategy in the plan doc §8/§9. **Knock-on: Pass 1a.2 (resource costs) is UNBLOCKED** — ruling ① removes the three numeric player-only stats (`Derived.Resistances` stays player-only by deliberate deferral, is not a `validStat`, and does not block it), so its cost-reduction passive becomes an ordinary sixth `validStat`; re-schedule it once Chunk 1 lands.
- **⭐ Round-6 PO design session — 3 topics, all resolved (2026-07-26, DOCS ONLY, no code)** ✅ `2e2e2809` — full write-up `docs/plan-playtest-feedback.md` §Intake round 6 (4 items), the resource ruling in **`docs/gdd.md` §3 Consumption**, the collision analysis in **`docs/backlog.md` §34**. ① **Resource costs — the design intent behind the numbers, which is what Pass 1a.2 was actually missing.** PO ruling: the resource's double meaning is *the design* — one value is both "possibility of actions" and "time left to die", and spending survivability to gain power **is** the combat game. **⚑ Two constraints now bound every cost value: a permanently FREE baseline** (the base damage aura, at any resource level — *"there is never no option left"*) **and everything above it gated behind spending.** ⚑ **The free baseline REPLACES the 1-HP clamp as the death-spiral protection** — `sys/skills.go:706` already stops a cost killing its caster, but relying on it is wrong under this ruling because it makes the ability *silently stop working*; the clamp stays a backstop. Not new scope (GDD §3 + round-2 decision 2 already said costs go on auras and cooldowns) — `selfDamageHP` is **live on `HealParams` today** and the tooltip already renders `Costs you: …`, so 1a.2 generalizes a live field. **4 heal rules must survive that generalization** (never-kill clamp · cost rides `casterPowerScale` or it goes free as the pool grows ~26× · mobs pay nothing · GOD skips) and a **cost-reduction passive is engine-new: the sixth `validStat` and the first that modifies an *input*.** ⚠ **Sequencing deviation on record** — PO wants costs first / retune later, but Pass 1b will re-touch every number authored in the cost pass. ② **Orc Warlord grunt waves never reach the fight** — diagnosed as **distance-vs-sensor, not behaviour**: wave-mouth→warlord-home is **7.57 units**, `OrcGrunt.aggroRadius` is **5.4**, and with no waypoints/wanderRadius the grunt walks back to its spawn point and stands there. **3 options sanctioned** (raise the radius ~9 · move the anchor in the editor · seed threat at spawn, ~6 lines in `warlord.go`); spawn-at-boss and a new scripted-move seam **explicitly NOT taken**. ⚑ **Threat-seeding is marginal ALONE** — grunt speed is ~1 unit/s, so it closes into its own sensor in ~64 ticks against a 90-tick leash, and that breaks if the anchor ever moves out. ③ **Collision ✅ DECIDED: mob-vs-mob SOFT SEPARATION** — extend `blockerRepulsion` to nearby mobs at **low weight**, no hard blocking, **no player↔player** (rejected against GDD §9 "no griefing by design"). The gap it closes: `steering.go:87` queries `AppendCircleStatics` — **statics only** — so mobs have zero awareness of each other, which *is* the clump. ⚑ Watch the `steerSide` detour latch: tuned against *stationary* blockers, so low weight is what keeps mob repulsion from tripping it. ④ **NEW BUG surfaced while chasing ③** — `selectTargets` (`sys/targeting.go:108`) has **no target persistence at all**: it rebuilds and re-sorts every tick, so a `maxTargets: 1` aura re-picks ~30×/s and **smears damage across a clump instead of killing anything**. Fix is **per-selector** stickiness (right for `nearest`, wrong for `lowest_health` heals). **⚑ Hard collision would NOT have fixed it** — ~19 wolves still fit inside a level-1 Damage aura with collision fully enforced, which is why ③ does not close ④. Not scheduled, blocks nothing.
- **Last completed: `plan-entity-model.md` Chunk 3a — the NPC merge** (2026-07-27, backend + frontend + content, 26 files + 15 new, 4 deleted, **−800 lines net**) ✅ `[uncommitted]` — **planned and executed in one session** (§6a is the plan, §11 the ledger). ⏳ **PO in-game check pending.** **`model/npc` is GONE:** a teaching NPC is an ordinary actor whose definition carries an `interaction` block and is placed as an ordinary spawn. Deleted: `model/npc` · `model.NpcEntity` · `model.Teaching` · `game.addNpcEntity` (§24's matrix loses a helper) · `world.Npc` + the whole `zone.npcs` section + its 5 validations · `aurad.go`'s NPC boot loop · `sys/npc.go` → `sys/interaction.go` · **the zone editor's entire NPC mode**. **⭐ The pilot (one NPC first) paid for itself immediately and found a LATENT WIRE GAP, not a chunk bug:** the migrated Farmer taught and spoke correctly but rendered as **nothing** — a valid 120×120 texture at `scale = [0,0]`, because **`Mob.radius` has been in `server.fbs` since the beginning and the server never wrote it** (`MobAddRadius` absent from `MobEntityFlatbufMarshal`). Every mob sprite class sizes from `GraphicsConfig` and ignores the wire value, so a permanent 0 was invisible for the life of the project — until NPCs, which size from the wire the way they always did on the Resource path. One line + a pin; **no existing mob affected**. ⚑ *A schema field nothing reads is not proof the server writes it.* **⚑ Forced sequencing change:** `zone.go`'s "an NPC may not wear a mob sprite" guard fires the instant the 14 defs exist — its premise is what this chunk repeals — so it went at step 2, not at the deletion pass. **⚑ L11 was real and is closed:** `aggroSensorMask(0)` = `LayerNoneCollision`, so a passive faction's sensor sees nothing — a merged NPC would have been **silently mute with every evaluator test green**; `refreshSensorMask` now widens for conversants (the support-carrier precedent), pinned directly. **7 rulings — 4 PO, taken before the first edit:** D1 placement folds into **`spawns`** (editor NPC mode deleted, not reworked ⇒ **teachings are JSON-only content now**, like every mob's skills/drops) · D2 the 2 legacy Sages **dropped** (14 defs, not 16) · D3 **health bars on NPCs ACCEPTED** (*"they can now also act in the world… most will not act but they can"*) ⇒ `initHealthBar` untouched, L5's open half closed with zero frontend work · D4 **role `creature`**, not `structure`; plus D5 **unattackability is now two AUTHORED knobs** (faction `friendlyToPlayers` + a body layer without the Action bit) rather than a property of a type ⇒ a killable NPC is a JSON edit · D6 `trigger: "interact"` **hard-fails** until 3b · D7 `interaction.range` optional, sensor = `max(aggroRadius, range)`. **Content:** 14 defs (ids 51–64) + new faction `townsfolk`; body `97` = PlayerStatic+Viewport+MobStatic (**deliberately not Action(2)**), `aggroRadius 1.0` = the pre-merge zone `radius` verbatim, `experience: 0` (nameplate gated free), `skills: []`. The **def name is now player-visible** via `"Taught by: X"` (the authored-name-vs-sprite-name fallback is deleted), so the anonymous second Hermit is **`Lamplighter`** (PO-named) and `Wanderer_1` lost its suffix. 11 frontend sprite classes moved `Resources` → `Mobs`, **keeping `resources.trees`** — the `mobs` layers are added to the stage first, so a new layer would have silently put every NPC under the trees. ⚑ **A pre-merge zone file now fails LOUDLY** (`unknown field "npcs"`), not silently. **Verified:** all **373 lines of `sys/npc_test.go` PORTED** onto the node evaluator rather than rewritten — that port IS the acceptance test; `go build`/`vet`/`test` green, guardrails + alloc `-count=2`, frontend typecheck + vitest + prod build; **boot BOTH ways (`-content ../api` and embedded) 0 errors 0 warnings 0 panics** — 83 skills/**15** factions/**64** mobs/10 recipes/5 prop defs/1 milestone/777 props/**485** spawns/5 campfires, the `placed npcs` line **gone**; **sim battery + level curve + pack matrix + chain BYTE-IDENTICAL** to a `git worktree` HEAD build, preset roster **+14 rows / 0 cells moved** (the predicted L14). **In-game smoke 6/6** (`.claude/skills/verify/chunk3a-npc-merge.mjs`, kept), 0 console errors, 0 ctx losses — **the Emberkeeper's 3-grant walk stops at the first gate** (Torch@1 granted, then the blocked line for Ignite@7, nothing further), which is the ordered walk surviving the move from zone entry to definition. ⚑ **New harness note: `window.game` is a small facade** (`run`/`character`/`pause`/`play`) with no `EntityManager` — scene-graph work goes via `character.plate.parent` and climbs to the root.
- **Prior:** `plan-entity-model.md` Chunk 2 — the authored `role` discriminator ✅ `0be771bd` 2026-07-27, **the chunk where a mob stopped implying what it is with a stat value**: `creature`/`structure`/`follower` authored and validated through one `mobs.ParseRole` table, retiring the `speed <= 0` = turret and `owner != nil && velocity > 0` = follower inferences plus the 10 dummy `aggroRadius: 0.1`. Sim battery byte-identical incl. the kite row (L9 held). ⏳ **its FOLLOWER half is still unverified in-game** (see Open PO checks). Full ledger `docs/plan-entity-model.md` §11.
- **Prior:** `plan-entity-model.md` Chunk 1b — dynamic levels + the summon-scaling collapse ✅ `ee01ccdb` 2026-07-26, **the chunk where numbers move**, priced and PO-signed before the first edit — `MaxHealth()` fully derived (`baseMaxHealth × f(Level) × MaxHealthFactor()`), `Level()` reads the OWNER's level **live**, `Factors.MaxHealth` → `BaseMaxHealth`, `MobDefinition.PowerScale` + `RaiseMaxHealth` + `maxHealthPerOwnerLevel` all deleted. **Summon OUTPUT does not move at all** (every summon is `curveLevel: 1`); the delta is **HP, large by design** — a Companion goes 118 → **1605** at L30, a constant ~60 % of a same-level player's pool. Sim battery + preset roster byte-identical. Full ledger `docs/plan-entity-model.md` §11.
- **Prior:** `plan-entity-model.md` Chunk 1a — one derived-stat formula ✅ `cf9a10c7` 2026-07-26, **sim battery byte-identical** (TTK 6.67s / TTD 8.70s) — three factor methods on `DerivedStats` that `*Mob` now reads too (the 3 latent player-only stats closed), plus `game.mob.walkingSpeedPerTick` (**0.055 preserved**, L1 held) and `Level()` on `*Mob`. Full ledger `docs/plan-entity-model.md` §11.
- **Prior:** chunk B — mobs now push each other apart while they move ✅ `8b045395` 2026-07-26, **PO-VERIFIED IN-GAME** (*"feels much better"*) — soft separation at `mobSeparationWeight` 0.45 [PLACEHOLDER] via new `phy.Space.AppendCircleDynamics`, kept out of the head-on latch, perpendicular fade so a chase does not weld the pack into single file. **⚠ Known limitation, by design: a STOPPED mob does not separate** — a settled ring keeps its arrival spacing; the tangential settle nudge is offered, not taken. Full ledger: `docs/plan-playtest-feedback.md` §Round-6 chunk B ledger.
- **Prior:** chunk A — a lost WebGL context now says so ✅ `6c8bde2e` 2026-07-26, **⏳ PO in-game check pending** — one `webglcontextlost` listener on the **world** canvas → `[webgl] world context lost` + the red banner; **detection only, §29 stays open**. ⚑ A clean boot measures 5 GL contexts / 2 deliberate probe losses / **0 warnings**, so it does not cry wolf — re-run `ctxloss-warning.mjs clean` after any boot-path change. Full ledger `docs/backlog.md` §29.2.2.
- **Prior:** round-5 batch ✅ `f06b2161` 2026-07-26, **PO-VERIFIED IN-GAME** (all 6 items; the drummer's 50 %-speed retreat "reads fine" ⇒ decision 4's authored speed stands) — shield-aura tick indicator (`EffectTypeShieldAura` joins `HasVisibleTickCadence`, no frontend change) + pacifists flee when attacked with nobody to support (`modeFlee` below support, existing `moveAwayFrom`). Full ledger: `docs/plan-playtest-feedback.md` §Round-5 chunk ledger. **2 gotchas worth keeping:** `highestThreatTarget()` **prunes dead rows as it reads** (resolve once per tick), and **campfires/totems are pacifists too** — they reach `modeFlee` but are inert both ways (`auraAlwaysOn` early-return + `moveAwayFrom` refuses a zero-velocity mob), pinned by test.
- **Prior:** ⭐ **all three then-pending chunks PO-VERIFIED IN-GAME** in one session (2026-07-26): **round 3** `03b152f4`, **round 4** `eaae2e69`, **rolling-filler batch** `dab4dae0` — every checklist item passed; `RallyDrummer` pacifism **accepted** and the whole-point tooltip HP rounding **signed off**. That session raised the 2 round-5 items, both now shipped and verified above. Full intake + the 4 design decisions: `docs/plan-playtest-feedback.md` §Intake round 5.
- **Prior:** rolling-filler batch — 4 independent bug fixes ✅ `dab4dae0` 2026-07-26, PO-verified in-game (`DAMAGE <pct>` fraction-of-`MaxHealth` · floating numbers suppressed in unlit darkness, tested at the **entity** position not the label's · `CLEAR_MINIMAP_ON_DEATH` off + the own-icon leak it exposed · Ctrl +/− suppressed, `Ctrl+0` kept). Second use of the vitest infra. Full ledger + the reusable harness notes: `docs/plan-playtest-feedback.md` §Rolling-filler batch ledger.
- **Prior:** playtest round-4 — ability tooltips now scale with character level ✅ `eaae2e69` 2026-07-26, PO-verified in-game (whole-point HP rounding signed off). Brought the **first JS test infra** into the repo (vitest + jsdom; landmines under Frontend tests below). Full ledger: `docs/plan-playtest-feedback.md` §Round-4 chunk ledger.
- **Prior:** **playtest round-3 chunk — healer combat state + role-as-loadout DONE** (2026-07-25) ✅ `03b152f4` — **✅ PO-VERIFIED IN-GAME 2026-07-26** (all 4 checklist items; both ⚠ judgement calls below resolved **as shipped**). 11 files. `Mob.InCombat()` returned exactly `aggroTarget != nil` — it *was* the bug; now + a damage-recency window reusing the player's `combatRegenGraceTicks` name AND value (§31 convergence). `healer.go` → `support.go`, the latched `seekHealer` type flag gone, roles derived from aura **categories**. **2 ⚠ PO-judged 2026-07-26, both KEPT:** ① `RallyDrummer` carries `shield_aura`, so under the loadout rule it is a **pacifist** and no longer chases players — PO: shielding its own squad "seems fine"; ② **every** mob now stops regenerating ~3.3 s after any hit, so hit-and-run whittling works on anything — accepted. Full ledger: `docs/plan-playtest-feedback.md` §Round-3 chunk ledger.
- **Prior:** **code-health triage session — 2 chunks DONE** (2026-07-24, ledgers in `docs/backlog.md` §30/§27.3.3 and §27.2.3/§25 B) ✅ `f095514a` + `2ec03ee7` — `layers.placeables` vestige prune + `tickInterval` hard-fail, and 3 hardcoded Go constants → conf knobs with no behaviour change (`game.mob.healthGainTick` + a new `game.combat` block; ⚠ **authoring 0 restores the default, it does not disable** — open PO question). Spun off **new backlog §31**.
- **Prior:** §28 item-system removal **COMPLETE** — Chunk 3 wire-enum prune ✅ `8ed4ff4c` (explicit permanently-pinned enum values ⇒ no future removal can renumber a survivor; new `NpcPlaceholder` art; a PO-requested plan audit caught a self-deleting dev-only class being shipped as the NPC fallback sprite), Chunk 2 frontend scaffolding ✅ `2f933634`, Chunk 1 backend registry ✅ `b9d01d33`, all 2026-07-24 and PO-verified. EntityType name-fallback validation §27.2.1 ✅ `c3938be7`. Full ledgers: `docs/archive/plan-item-system-removal.md §13`, `docs/archive/plan-entitytype-validation.md`.
- **Recent chunks (newest first; full ledgers in the plan docs):** dead resource+placeable+decay prune §26 FULLY DONE ✅ `ee9d42e9`+`a2ab90b5` (Chunks 1+2 — emptied the item registry to `None` ⇒ §28 removal now trivial; Chunk 2 also fixed a Chunk-1 frontend-build regression — **rebuild frontend AND backend after content deletions**; `plan-resource-decay-prune.md`); render-jitter buffered-interp fix ✅ `0e504c22`/`8a29a75c`/`c5064732` (`plan-render-jitter.md`); input-jitter held-state fix ✅ `cb7f011f` (`plan-input-jitter.md`); unlock source attribution ✅ `2bfee286` (`plan-unlock-attribution.md`); idle-loop alloc fix ✅ `fe0044d0` + day/night DEACTIVATED ✅ `e648ab88` (`plan-intermission-triage.md`); playtest-1 Passes A/B/C ✅ — **plan fully executed** (`plan-playtest1-feedback.md`); F&F deploy LIVE ✅ `a7a2267d` → `https://aura-game.duckdns.org/` (`plan-playtest-deploy.md`); content pass C1–C8 + rebrand step 7 complete. Earlier chunks: roadmap.md "Execution order" + the plan-*.md §13 banners.
- **⏳ Open PO in-game checks (all shipped, none PO-verified — carry them forward):** ① **chunk 3a, the NPC merge** (`[uncommitted]`, 2026-07-27) — walk up to a few NPCs (Farmer −57/28.6 · Hermit −54.9/25.6 · TownCrier −55.7/22 · Emberkeeper 34.5/−19.6) and confirm they read right: sprite, size, **the health bar you accepted (D3)**, no nameplate, the bubble, the unlock banner. Also worth a look in the **zone editor**: its NPC mode is gone and NPCs are placed with the spawn tool now (D1), and **teachings are JSON-only content** from here on. The headless smoke is 6/6 with screenshots, so this is a taste check, not a bug hunt. ② **chunk 2's FOLLOWER half** (`0be771bd`, 2026-07-27) — summon a companion and confirm it trails you and fights what you fight. The headless smoke covered structures only; equipping a cooldown needs the aura panel, which the harness handles badly, so the follower path rests on the Go pins alone (`companion_test.go`, `role_test.go`'s 4 follower/owner pins, `TestCooldown_SpawnMovingSummon…`). ⚑ Chunk 2 rewrote what makes a mob a follower (`role == follower && owner != nil`), so this is the one behaviour change with no eyes on it. ③ **chunk A's WebGL banner** (`6c8bde2e`, 2026-07-26) — the red banner + `[webgl] world context lost` line, still ⏳ from that round.
- **Next: `plan-entity-model.md` Chunk 3b — the interact verb.** **1a ✅, 1b ✅, 2 ✅ and 3a ✅ are all done** (see Last completed), so the plan is **1a ✅ → 1b ✅ → 2 ✅ → 3a ✅ → 3b** (PO ruling 7: *all three chunks, then step 8*). 3b is the smallest chunk in the plan and it is **frontend-led**: a new client keybind (recommend `E`), an in-range prompt, and a dialogue panel where option selection happens — which is what keeps the GDD "no targeting" pillar intact, since nothing is ever clicked in the world. Server side it needs a new client→server message plus flipping the authored `trigger` from `approach` to `interact`. **3a left exactly two seams for it, both deliberate:** `mobs.TriggerInteract` is already named in the vocabulary but **absent from the `triggers` table, so authoring it hard-fails today** (D6) — 3b's first edit is adding that one map entry; and `InteractionOption.Text` + `Next` are authored, validated (a dangling `next` is a boot failure) and **read by nothing**, waiting for the panel to render them. The evaluator's `selectNode`/`conditionsPass` already walk conditions, so a multi-node conversation needs no new engine work — only content. ⚑ **`client.fbs`'s message union is APPEND-ONLY and its values are positional/unpinned** (unlike `server.fbs`'s `EntityType`/`StatusEffect`, which §28 pinned explicitly): the generated `ClientMessageBody` numbers them 1–7 by order, so nothing but discipline stops a reorder silently remapping every client message type. ⚑ **L2 is still open right next door** — `SetFaction` overwrites the authored aggro mask with `^f.Bit()` (*"aggro everything that is not me"*), **two callers** (`spawnSummon` + campfire placement `aurad.go:157`; the `mob.go:554` "first caller" comment is stale). Inert today, directly blocking any charm / side-switch / quest-turns-hostile — and an interaction layer is exactly where that gets wanted. ⚑ **Never assert these chunks' tests on `Derived`** — `recomputeDerived()` runs regardless of owner type, so a mob equipping Hardy has `Derived.MaxHealthBonus` **correctly populated today** while the behaviour is absent; pin on HP pool / damage taken / distance moved. ⚑ **Verify in the SIM HARNESS, not only in-game** — the harness is where TTK, kills/hour and the XP bands come from; a live bug surfaces in play, a wrong harness number gets baked into authored content and stays there. ⚑ **And boot `-content ../api` with the pinned counts is the gate the sim cannot give you** — `sim/world.go` feeds `NewMob` synthetic inline definitions and never loads authored content, so anything loader-side is invisible to sim byte-identity (3a's own numbers: 83 skills / 15 factions / 64 mobs / 485 spawns). **Then step 8 (accounts & persistence)** — ruling 4 (*only live players persist*) has largely de-risked it: mobs and NPCs always respawn from definitions, so the schema is barely constrained by the entity model and mainly needs the character record written in **Actor vocabulary**. Still open it as a **design session, not a schema session**, and ride **backlog §32** into it: *does a charge survive death?* is a persistence question and the one most likely to want schema room (recommendation on record: charges never transferable, which sidesteps the economy-creep problem the GDD puts outside v1). Then the **character-sacrifice loop** (triage item 10) as persistence's first consumer, and `plan-playtest-deploy.md` §Ops & security posture folded in — persistence is the security tipping point. **⭐ BOTH chunks approved to run before that design session are now DONE** (PO 2026-07-26): ① §29 option A ✅ `6c8bde2e` and ② **mob soft separation ✅ chunk B** `8b045395` (**PO-verified in-game 2026-07-26**; ① still ⏳), neither blocks the design session. ① went first deliberately, and it paid off: a blank world now labels itself instead of reading as a regression in ②. **Open follow-up from ②, PO call:** a **stopped** mob does not separate (see Last completed), so a settled ring keeps its arrival spacing — a *tangential* settle nudge would close it without the arrival-clamp oscillation, and the `mobSeparationWeight` 0.45 [PLACEHOLDER] is one line if the in-game read wants tighter packing. **Two more round-6 rulings 2026-07-26:** the **orc-grunt fix is the PO's, taken in the zone editor** (option B, move `wave-mouth` inside the grunt's 5.4 `aggroRadius` — currently 7.57; **no code chunk**, A and C not implemented), and **Pass 1a.2 (resource costs) now runs AFTER the entity design session, not before** — its cost-reduction passive would be the **sixth `validStat`** while **three of the current five are player-only** (§31 gap 1), and it is the first that modifies an *input*, so gap 1's ruling is an input to it. Still unscheduled, blocking nothing: **target stickiness** (`targeting.go`, round-6 item 4). PO decisions on record: **2026-07-26 round 6 — the resource's action-economy/survivability duality is INTENTIONAL with a permanently free base damage aura; collision = SOFT SEPARATION, hard collision and player↔player both rejected; 3 grunt options sanctioned**; **2026-07-26 — `RallyDrummer` pacifism ACCEPTED, tooltip whole-point HP rounding SIGNED OFF**; round-3 2026-07-25 — no universal auto-attack (parked in §31), support set = Heal+Shield, pacifist healers ignore their attacker, survivors-like fork **CLOSED — stays MMO-lite**; round-4 2026-07-25 — tooltips show **absolute numbers**, and 2026-07-26 — add a real JS test runner rather than skip the frontend guard.
- **Then: step 8 — accounts & persistence** (roadmap item 3, planning session), then the character-sacrifice loop (triage item 10) as persistence's first consumer — extra-motivated since the live server wipes characters on every restart. **Backlog §31 is no longer a fold-in — it is `docs/plan-entity-model.md` and it runs BEFORE this** (PO 2026-07-26). What survives into step 8 from it: the character record must be written in **Actor vocabulary** (`level`/`faction`/`loadout`/`spellbook`/`xp`), and ruling 4 fixes the scope — **only live players persist**, mobs and NPCs always respawn from definitions. **Also fold in backlog §32 (consumable cooldowns / spellbook charges)** — "does a charge survive death" is a persistence question, and it's the idea most likely to want schema room. **Fold in `plan-playtest-deploy.md` §Ops & security posture** when planning it — persistence is the security tipping point (cloud firewall, DB bound to localhost, daily backup + proven restore, DB-credential handling). Expect ad-hoc live-playtest triage in parallel. **Deferred:** step-8 audio half (combat SFX, PO-deferred 2026-07-21 — no placeholder assets); UI-polish later passes (`plan-ui-polish.md` §Deferred — popups ride the in-game announcement system); playtest-1 design rounds (`plan-playtest1-feedback.md` §Own planning rounds); the full Deferred/placeholder catalog lives in the respective plan docs.
- **Open PO calls:** replacement art (mascot/splash/favicon), wiki-generator keep-or-delete, eventual domain (berryhunter.io URLs kept meanwhile). PO continues manual zone-editor placements in parallel.
- **Code-health findings** (`docs/backlog.md` §27 / `docs/research-code-quality.md` §10) — the three called out 2026-07-24 are all **✅ FIXED test-first**: ① `MobSystem.Update` mutation-during-iteration (skipped/double-updated a survivor per dead mob/tick — collect dead in the loop, remove after; `f6fcfbad`, §27.1); ② drop-RNG determinism (**PO-ruled bug** — `NewMob` seeded per-mob RNG from the entity ID alone so a fresh server re-rolled the same HP variance + first drop for the Nth spawn every restart; now a per-process salt mixed with the ID randomizes per run while sim/guardrails stay deterministic; `b4b0e66d`, §27.2.2); ③ `definition.go` guard coverage evened out — `mapToEffectDef` `default:` + inert-config/radius guards (`eee10331`, §27.3). ④ §27.2.1 EntityType name-fallback (**was a live-server crash at first spawn**) validated at load now — `mobs.ResolveEntityType` + loader guard + `NewMob` panic (`c3938be7`, see Last completed). **§26 dead resource/decay prune ✅ FULLY DONE `ee9d42e9`+`a2ab90b5`** (Chunks 1+2) — emptied the item registry to `None`. **§28 item-system removal ✅ FULLY DONE 2026-07-24** (`docs/archive/plan-item-system-removal.md`, 3 chunks): C1 backend registry `b9d01d33` · C2 frontend scaffolding `2f933634` · C3 wire-enum prune `8ed4ff4c` (see Last completed) — **the wire enums now carry explicit, permanently-pinned values; a future removal is a one-line delete that leaves a gap.** **2026-07-24 triage session ✅ `f095514a`+`2ec03ee7`** (see Last completed): §30 items 2/3/4, §27.3.3, §27.2.3, §25 B and §25 A#4 all closed. **⭐ §29 DIAGNOSED 2026-07-26 + option A (detect + warn) ✅ SHIPPED 2026-07-26 `6c8bde2e`** (ledger §29.2.2 — a `[webgl] world context lost` log + red banner; **detection only, the trigger is still unknown and rendering is still dead, so §29 stays open**; ⚑ if a smoke run goes blank, look for that log line first — its absence now means the cause is NOT a context loss). **The diagnosis: it is a LOST WEBGL CONTEXT, and the `null.split` is PixiJS's error *reporter* crashing on the way to reporting it** (`docs/backlog.md` §29.1): on a lost context every WebGL getter returns `null`, so `generateProgram` reads `LINK_STATUS` as null, concludes the program failed, and `logPrettyShaderError` dies on `gl.getShaderSource(shader).split("\n")` — destroying the real diagnostic, which is why 4 sightings gave no lead. The throw escapes the rAF callback ⇒ **the render loop stops** ⇒ blank world with a healthy HUD, websocket and server ticks. **Reproduced deterministically** via `.claude/skills/verify/ctxloss-repro.mjs`: a mid-boot loss gives **exactly the observed three errors** (count = how many shader programs the dying frame still had to build; 1 in steady state). ⚑ **Two old leads are now wrong:** the 40 000 ms frame time was a *consequence* (a dead ticker), not starvation — so CPU throttling is the wrong lever (24 throttled cold loads, incl. fresh-`aurad`-restart runs, all clean; worst real frame gap 902 ms); and **the scene-graph probe cannot see this** (3/24 children before and after the world vanishes), so "errors separable from the black world" is unsafe — only pixels detect it. Also normal-and-not-suspicious: the client makes 5 GL contexts at boot and **pixi deliberately loses 2** (capability probes). PixiJS only auto-restores losses *it* forced, so a real loss is never restored; a hand `restoreContext()` revived the minimap (its own Application) but not the world. **5th sighting landed organically in the same session** on the restored *minified* bundle, unthrottled: 3 errors, identical stack, all at t≈0.9 s, worst rAF gap 420 ms — and **the minimap rendered while the world did not** (own `Application`, own context), which is the fastest visual tell. Trigger (what drops the context) still unknown; all 5 sightings are headless runs, none player-facing ⇒ it is a **harness-reliability problem first** — ~1 in 6 smoke runs can lose to it and it looks like the change under test. **No fix applied — 5 options + a recommendation in §29.2 (A: detect + warn, ~20 lines) await a PO call.** **⭐ §31 — one entity, many roles: ✅ DESIGNED 2026-07-26 → `docs/plan-entity-model.md`** (5 chunks, scheduled ahead of step 8 — see the ⭐ banner at the top for the reframe, the 7 rulings and the landmines). §31 itself **stays the findings record** and is still the place to read *why*: 3 of 5 derived stats applied only in player code paths (latent — 0 mob defs equip any of the 5, re-verified by effect **type** not name), `model/npc` statless so every stat-bearing "NPC" is really a mob, and gap 5's role-as-a-type in AI (✅ mostly shipped in round 3, `03b152f4`). **Both former blockers are now ruled:** mob passives scale **identically**, and the NPC question is answered by the merge. **⚠ Its collision with step 8 is resolved, not deferred** — ruling 4 (*only live players persist*) means the schema is barely constrained; it just needs Actor vocabulary. **⭐ NEW §34 — entity-vs-entity collision: considered, NOT taken** (round 6, see the ⭐ bullet above). Records why hard collision is only a *mask* edit (the broadphase already pairs dynamic-vs-dynamic; **there is no client-side collision and no client-side prediction**, so server-side movement changes have no rubber-banding problem), the A/B/C decomposition, and **2 engine landmines if it is ever revisited** — co-located equal-radius circles **never separate** (`resolveCircleThomas` returns a zero vector ⇒ same-species mobs spawned on one point weld together) and push-out is **undamped instantaneous position correction**. Re-opens only if soft separation is overwhelmed at scale, and only for mob↔mob. **Still open, unscheduled:** §25 A#1–3 + C/D, §27.2.8 hygiene, **§30 item 1** only (`Resource.capacity`/`stock` — wire, ride it along with another schema regen), and **round-6 item 4** (`selectTargets` has no target persistence — real defect, `plan-playtest-feedback.md` §Intake round 6).
- **Standing locks & gotchas:** growth **1.12 × maxLevel 30**; regen **0.00033 ≈1%/s × taper 1.0→0.4** FINAL; §11 no-pity + campfire **0.12** + heal cost **10−2/level** FINAL; **the base damage aura stays FREE at every resource level** (round-6 ruling — no cost curve may ever leave a player with no action; GDD §3); drop + milestone tables are **TUNING-OPEN** (milestone = Haste@L7 only); density = mob visible per ⅔-screen window; downtime 10 s + chain 20; guardrail asserts in `cmd/simharness/guardrail_test.go`. New mobs: inherit the Session-⑥ XP rule (facetank kph, else kite ×0.5) and **must** author tier + baseline (raw `maxHealth` hard-fails). Day/night cycle is **OFF** (`DAY_CYCLE_PRESENTATION_ENABLED=false`, bug unfixed — don't re-enable without collapsing the ~25 per-layer filter passes). Per-chunk placeholder values live in their plan docs. **Dev cheats:** GOD, WARP `<x·120> <y·120>` (1-unit granularity — land on a whole unit), SPEED, XP, SKILL, ANNOUNCE, THREAT. `make -C backend build` runs `cp-defs` (reverts embedded `backend/pkg/api/` from `api/`); boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

## Development Principles

These principles apply to all code written or modified in this project.

### KISS — Keep It Simple, Stupid

Prefer the simplest solution that works. Avoid clever abstractions, unnecessary
indirection, or premature generalization. If a function does one clear thing in
20 lines, that's better than a "flexible" version in 80. When proposing
architecture, start with the simplest design that satisfies the actual
requirements — not the imagined future ones.

### DRY — Don't Repeat Yourself

Knowledge should have a single source of truth. If the same logic, constant, or
configuration appears in multiple places, extract it. Watch for subtler
duplication: parallel switch statements, repeated validation patterns, copy-paste
between similar systems. But: don't deduplicate things that just *look* similar
— two pieces of code that happen to be identical today but represent different
concepts should stay separate.

### YAGNI — You Aren't Gonna Need It

Don't build for hypothetical future requirements. No "we might need this later"
parameters, configuration options, or abstraction layers. Add complexity only
when there is a concrete, present need. This applies especially to the aura
system: build what the current design requires, not what every possible future
combination might require.

### TDD — Test-Driven Development

For new features and bug fixes:

1. Write a failing test that captures the desired behavior
2. Write the minimum code to make it pass
3. Refactor if needed, keeping tests green

This applies to backend Go code (`go test ./...`) primarily, and to the
frontend's pure logic modules where a runner now exists (`npm test`, see
Frontend tests). For exploratory prototype work or UI tweaks, strict TDD may be
relaxed — but any non-trivial game logic (aura calculations, combination
resolution, damage application) should have tests before or alongside the
implementation.

When fixing a bug: first write a test that reproduces it, then fix.

## Project Overview

**Aura** (formerly Berryhunter; module path `github.com/RoteRiesenRobbe/aura`, local workspace dir `aurahunter`) is a multiplayer top-down browser MMO built on the Berryhunter survival-game foundation. The repo has three main parts:

- `backend/` — Go game server (`aurad`)
- `frontend/` — TypeScript/webpack browser client using PixiJS
- `api/` — Shared FlatBuffers schemas and the authored content JSON (mobs, skills, recipes, zones, props, factions, milestones)

`docs/README.md` is the docs index — it holds the naming convention and the four-layer status model (this file = current state · `roadmap.md` "Execution order" = sequence · `plan-*.md` §13 banners = per-chunk ledgers · `MEMORY.md` = cross-session index).

**`docs/` = live work, `docs/archive/` = finished work.** Plan docs referenced by bare name below (e.g. `plan-mob-depth.md`) are in `docs/archive/` once their work has shipped; anything still in `docs/` proper has something open. When a plan's last chunk lands, `git mv` it into `archive/` and move its index line to the README's Archive section.

## Build & Run

### Backend (Go ≥ 1.22)

```bash
# One-time: copy config
cp backend/conf.local-windows.json backend/conf.json   # Windows
# or use backend/conf.default.json as a template

# Build
make -C backend build          # produces backend/aurad

# Run (dev mode serves static frontend too)
cd backend && ./aurad -dev

# Run without build (go run)
make -C backend dev
```

> **Gotcha:** after backend logic changes, rebuild the binary with `make -C backend build`.
> `go build ./...` compiles/type-checks packages but does **not** refresh `./aurad`,
> so a running `-dev` server keeps executing stale code.

> **Content iteration:** `./aurad -dev -content ../api` loads items/mobs/skills/recipes
> from the repo `api/` directory directly instead of the embedded copies — JSON edits then skip
> both `cp-defs` and the rebuild (a server restart still applies them). The boot log prints the
> content source (`Loading content source=…`). Production/default stays embedded.

`backend/conf.json` controls server port (default `2000`), day/night cycle durations, and all game-balance tuning values. `backend/tokens.list` must exist with at least one token (e.g. `plz`) for in-game commands to work.

### Frontend (Node 20 / npm 10)

```bash
# Dev server (webpack HMR on port 2001) — no Docker
cd frontend && npm install && npm run start

# Production build
npm run build                  # output goes to frontend/dist/

# Docker-based alternatives (if local Node unavailable)
make -C frontend dev           # dev server via Docker
make -C frontend build         # prod build via Docker
```

### Opening the game

```
http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game
```

Optional dev query params:
- `&develop` — opens the draggable dev panel
- `&start-cmds=GOD,GIVE BronzeTool,...` — runs server commands on spawn

### Backend tests

```bash
cd backend && go test -timeout 60s ./...
```

The full suite runs and passes. (`backend/pkg/aura/net/net_test.go` is a manual `ListenAndServe` smoke script that used to hang the suite; it is now skipped via `t.Skip` — remove the skip to run it explicitly.)

The test runner requires generated files (`go generate ./...`). The Makefile `gen` target runs this automatically before builds.

### Frontend tests

```bash
cd frontend && npm test          # vitest run
npm run typecheck                # tsc --noEmit
```

Vitest (added with the round-4 tooltip fix) covers the pure, DOM-free logic
modules — currently `SkillTooltip.ts`. Three things to know before adding a test:

- **The environment is `jsdom`, not `node`** (`vitest.config.ts`). The client's
  module graph reaches `window` at *import* time — `Urls.ts` derives the catalog
  host from `window.location`, PixiJS wants a document — so even a pure
  formatting unit needs a browser-shaped global.
- **`vitest.setup.ts` stubs `fetch`.** `Skills.ts` and `Mobs.ts` fetch their
  catalogs on import; without the stub a unit test does real DNS. The stub
  rejects, which is the degrade path those modules are designed to survive.
- **Import `{describe, it, expect}` explicitly** — globals are deliberately off
  so `tsconfig.json`'s `types` array stays untouched. (`skipLibCheck: true` is
  on there because vitest's own `.d.ts` files use private identifiers that tsc
  otherwise reports against the app's `es5` target.)

### Code generation

```bash
# Regenerate Go enumer files and FlatBuffers bindings
make -C backend gen            # runs go generate ./...

# Regenerate FlatBuffers bindings (if .fbs schemas change)
cd api/schema && ./make.sh     # or make.bat on Windows
```

## Architecture

### Backend (ECS-based game loop)

The game server uses an **Entity-Component-System** architecture via `github.com/EngoEngine/ecs`.

- `backend/cmd/aurad/` — entrypoint; wires config, game, HTTP server
- `backend/pkg/aura/core/` — `game.go` constructs the ECS world and registers all systems; `Loop()` ticks at ~30 FPS (33 ms/tick)
- `backend/pkg/aura/sys/` — ECS systems: physics, mob AI, NPCs, skills, targeting, state (death/respawn), pre/post-update, plus `chat/`, `cmd/`, `equip/`, `statuseffects/` (deleted systems: scoreboard in the 2026-07-08 dead-feature prune, heater with step 7, decay with the §26 resource prune)
- `backend/pkg/aura/model/` — interfaces and concrete types for entities (`player/`, `mob/`, `npc/`, `prop/`, `corpse/`, `spectator/`, plus `vitals/` and `client/`)
- `backend/pkg/aura/items/mobs/` — the mob registry: definitions, catalog, `EntityType` resolution (the enclosing `items` package was deleted with the §28 item-system removal; only `mobs/` remains)
- `backend/pkg/aura/codec/` — FlatBuffers encode/decode for the WebSocket protocol
- `backend/pkg/aura/phy/` — 2D physics (circle/AABB collision, spatial hashing)

**Adding a new system:** implement `ecs.System`, register it in `core/game.go:NewGameWith()`, and add entity registration cases in the relevant `addXxx()` methods.

**Adding a new entity type:** implement the appropriate `model.*Entity` interface, update `game.AddEntity()`, and register in all relevant systems.

### Communication Protocol (FlatBuffers over WebSocket)

Schemas live in `api/schema/`:
- `client.fbs` — client→server: `Input`, `Join`, `Cheat`, `ChatMessage`
- `server.fbs` — server→client: `GameState`, `Welcome`, `Accept`, `Obituary`, `EntityMessage`, `Pong`
- `common.fbs` — shared types (`Vec2f`, `ActionType`, `AuraType`)

After editing `.fbs` files, regenerate bindings for both backend and frontend.

### Game Configuration (conf.json)

All numerical tuning lives in `backend/conf.json` (or `conf.default.json` for reference). The `game.player` block controls movement speed, aura radii, vital-sign drain/gain rates, and level-up scaling. Changes take effect on restart.

### Content Data (JSON)

All authored content lives under `api/` in seven directories — `mobs/`, `skills/`, `recipes/`, `zones/`, `props/`, `factions/`, `milestones/`. Each is loaded by `cmd/aurad/loaders.go` (`contentSources`); a missing directory hard-fails at boot. The `make -C backend cp-defs` target copies all seven into `backend/pkg/api/` so the Go build embeds them, so run it (or just `make -C backend build`) after editing any JSON definition — or boot with `-content ../api` to skip both (see Content iteration above). Keep `contentSources` covering every `api/` subdirectory, or a content edit silently no-ops.

### Frontend

The frontend is structured as feature modules under `frontend/src/features/`:
- `backend/` — WebSocket connection, FlatBuffers deserialization, entity snapshot management
- `core/` — game loop, entity manager
- `player/`, `vital-signs/` — local player state and HUD
- `game-objects/` — rendering entities (props/resources, mobs, characters, corpses) via PixiJS; `AuraRings`/`EffectPips`/`AuraTickIndicator` are the shared combat-readability overlays
- `input-system/`, `controls/` — keyboard/mouse/touch input
- `internal-tools/` — dev panel, console, overlay tester (only active with `?develop`)

**HUD event handling:** Use `pointerdown` (not `click`) for all interactive HUD panels. `MouseManager` (`input-system/logic/mouse/MouseManager.ts`) registers a `mousedown` listener on `document.documentElement` with `event.preventDefault()`, which suppresses the synthetic `click` event. `pointerdown` fires before this and is unaffected. `click` listeners on HUD panels silently never fire — this is not obvious from the source.

Webpack configs: `webpack.common.js` (shared), `webpack.dev.js` (HMR, port 2001), `webpack.prod.js` (minified output).

## Aurahunter Project Context

This fork of Berryhunter has been transformed into **"Aura"** — a top-down MMO.
The Berryhunter survival systems (vitals, crafting, temperature, hunger) have
been removed. The core loop revolves around the aura system described below.

The structural rename (execution-order step 7, `docs/archive/plan-rebrand-cleanup.md`)
is **done**: module path `github.com/RoteRiesenRobbe/aura`, package dir
`pkg/aura/`, binary `aurad`, FlatBuffers namespace `AuraApi`, title "Aura".
Remaining "Berryhunter" references are intentional: historical plan/archive
docs, `legacy: true`-tagged proving-grounds content, Kringel Games social/
rating links, and berryhunter.io domain URLs (no replacement domain yet).

### Vision

**Tagline:** MMO lite — resource vs. resource, as simplified as possible.

**Core principle:** Players and NPCs interact exclusively through **auras** —
circular effect fields that automatically apply to anything in range. No
targeting, no direct attacks. Positioning and cooldown timing are the only
skill expressions.

**References:** WoW Classic (progression, environmental storytelling), Gothic
1+2 (organic worldbuilding), Hotline Miami / Monaco / Rimworld (top-down art
direction — not isometric, not pixel art).

**Platform:** Browser-based.

### Core Loop

1. Player moves through a persistent shared open world
2. Encounters mobs / other players — own aura ticks automatically on anything in range
3. Damage, healing, buffs emerge from aura overlap; cooldown abilities modify temporarily
4. Combat ends → XP for all participants → possibly aura unlock
5. Level up → skill points → strengthen existing auras or unlock combinations
6. Explore world → find hints → unlock new auras / passives / cooldowns
7. Rearrange slots, adjust build, tackle harder content

### The Three Skill Categories

Players collect, level, and combine three categories of skills:

- **Active auras** — toggleable, have visible ranges in-world. **Exactly one
  active aura is on at a time**; the aura slots are a loadout (several equipped,
  one active, switchable mid-fight), not multiple simultaneously-active auras.
  Build variety comes from slot loadout, combination unlocks, and switch timing.
- **Passives** — passive bonuses, always on (these DO run in parallel)
- **Cooldowns** — active abilities with cooldown timers (triggered individually)

Mobs use the same aura system as players.

### The Resource

Every player and every NPC has exactly **one resource**. It represents HP, mana,
and everything else at once. Drops to 0 → death.

### Aura Combinations

- Combination unlocks trigger when specific skills reach specific levels
- Recipes are **curated, not algorithmic** and **not documented anywhere in-game**
  — the community discovers and shares them
- Combinations can cross categories (aura + passive + cooldown is valid)
- The result of a combination can itself be an ingredient for higher combinations
- **Variant auras** exist as rare world drops and are also combinable
- **Damage types** exist for mob resistances and build identity (fire, ice, physical, etc. — specifics TBD)

The combination system must technically support arbitrary combinations from day
one. Content (specific recipes) is added manually over time.

### Spellbook & Unlocks

The **spellbook** is the collection of all auras, passives, and cooldowns a
player has discovered. Five ways to obtain new entries:

1. **Milestone unlocks** — guaranteed at certain levels
2. **Monster kill unlocks** — certain mobs drop auras/passives on death
3. **World exploration** — clue anchor points throughout zones
4. **NPC teaching** — peaceful NPCs teach a specific aura on approach, often
   tied to nearby harvest-mobs that only that aura can damage (soft "profession"
   identity without a class system)
5. **Meta-progression** — sacrificing a max-level character unlocks new base auras account-wide

### World Design

Persistent shared open world, multiple connected zones for different level
ranges. Designed and built by hand — no procedural generation. Environmental
storytelling is central.

**Open-world dungeons** — no instances. WoW-Classic-style caves in the open world.

**Darkness & light** — certain areas (caves, tunnels between zones) are dark.
The tunnel between zone 1 and zone 2 serves as a natural tutorial for the role
concept (light aura forces a trade-off between light and damage; players can
support each other).

### Multiplayer

- Persistent shared world — everything visible, everything shared
- No formal groups in v1 — all combat participants receive XP
- No PvP initially (earliest 5 years out)
- **Players filling roles for each other is essential, not optional**, for all
  larger challenges (light support in tunnels, heal support at bosses, etc.)
- No griefing possible by design

### Numbers Are ALWAYS Placeholders

Every concrete number — max level, skill points at max, slot count, aura max
level, respec cost, drop rates, combination requirements, damage values, aura
radii — is a **placeholder** until explicitly marked as final.

Treat such numbers as examples for thinking, never as decisions made. When
numbers are relevant for an answer, ask first or propose concrete values for
discussion — never silently adopt them as set.

### Scope v1.0 (Must Have)

Accounts, aura system (base auras, cooldowns, first combinations), spellbook
with milestone and monster unlocks, progression (level, skill system, slots),
persistent world, 2–3 zones, mob types (normal/elite/boss), UI (resource bar,
XP bar, ability bar, aura panel, minimap, zone chat), campfire system, and
the **character-sacrifice loop** (moved *into* v1 by PO ruling 2026-07-19,
`plan-intermission-triage.md` item 10 / GDD §11 — it lands right after step 8
as persistence's first consumer).

~~Line-of-sight for auras~~ — **CUT 2026-07-10.** Auras pass through walls and
every environment object; props block movement, never effects. The `blocksAura`
flag was deleted 2026-07-11. See `gdd.md` §142/§163 and `roadmap.md` item 6.

### Not in v1.0

PvP, formal group system, economy, mobile, endgame raid events.

---

## Working Style

Work happens in two kinds of sessions:

- **Planning sessions** — a work item (an execution-order step) is designed plan-first and
  written up as a `docs/plan-*.md` doc: what changes and why, chunk breakdown, decisions,
  open questions, test strategy. No production code is written in a planning session.
- **Execution sessions** — a single chunk from an approved plan doc is implemented in its
  own chat, following that plan. Reference the plan doc + the chunk being implemented in
  explanations and commit messages.

Across both:

- **Plan before code, and pause between steps.** State the plan in plain text first for any
  non-trivial change (new file, new system, refactor, multi-file edit); don't silently chain
  multiple chunks in one session.
- **Propose options for design decisions** — don't commit to a direction unilaterally.
- **Never commit (or branch/push) autonomously** — only when explicitly asked.
- Treat the inherited physics, collision, and the WebSocket/FlatBuffers protocol as
  stable foundations. Extend, don't rewrite.
- When in doubt about game design intent, ask — don't infer from the codebase.

## Sanity checks after every step

Before declaring a step done:
- Run `go build ./...` from `backend/`
- Run the relevant `go test` for affected packages
- For anything with a runtime surface, verify in-game (plan docs record per-chunk in-game checklists)
- Report the output — don't claim "done" without these checks.
