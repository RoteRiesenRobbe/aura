# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

<!-- Pointer only. REPLACE these two lines (don't append) when the last/next step changes.
     Full execution order + per-item status: docs/roadmap.md. Doc index: docs/README.md.
     Plans and records live in the plan docs. -->

- **Last completed:** **Unlock source attribution (playtest-1 Pass-B items 1c+1d) — the unlock banner now NAMES its source. DONE 2026-07-24, committed `2bfee286`, server handed to the PO for the in-game read pass (not yet PO-verified); full ledger: `docs/plan-unlock-attribution.md`.** The banner was client-derived and source-blind (`HUD.updateSpellbook` diffed the spellbook and fired `New <cat>: <name>` with no source). Now the **server** tags each unlock and the client composes `New <category>: <name>` + a source line. **Chunk 1 (wire + client):** `EntityMessage` gains `kind:{Chat,Unlock}` — on Unlock `entity_id` carries the skill id, `message` the source label (backward-compatible, old msgs default `Chat`; Go+TS FlatBuffers bindings regenerated); new `model.Client.SendUnlock(skillID, source)` (grant sites touch only the interface — no new codec import, no cycle); `Backend.ts` branches on `kind`, `HUD.ts` stops firing the client banner but keeps the panel unlock glow. **Chunk 2 (labels at the 4 grant sites + cheat), each guarded so only a genuinely-new discovery announces (RNG rolls unchanged):** milestone `Level N reward`, kill-drop `Dropped by: <Mob>` (`DeriveDisplayName`), NPC teach `Taught by: <Npc>` (emitted AFTER the speech bubble), recipe cascade `Combination discovered`, `SKILL` cheat `Cheat`; **reconnect-restore stays silent** (`SetSkillComponent` bypasses `Discover` — pinned). **NPC name field (follow-on):** NPCs gained an authored optional `name` threaded schema→model→`NpcEntity`→boot; `npcName` prefers it, else the sprite-derived `DeriveDisplayName` — fixes shared-sprite mislabels: authored **Dog / Shaman / Emberkeeper** (the last two ride the `Hermit` sprite), the other 11 fall back correctly. **Presentation:** unlock banner breaks onto a 2nd line (`white-space: pre-line`), ~20% smaller, hard black outline for contrast (size / outline all [PLACEHOLDER]). **TDD:** codec round-trip+default, per-site emit, idempotent-`Discover` single-announce, reconnect-silent, `npcName` authored-vs-fallback. **Verified:** `go build ./...` exit 0, `go test ./...` 29 packages with tests pass / 0 failures, boot `83 skills/14 factions/50 mobs/10 recipes/777 props/471 spawns/5 campfires (safeRadius 1.5)/14 npcs, 0 panics`. **Open:** PO in-game read pass (label wording `Level N reward` / `Combination discovered`, banner size/outline all [PLACEHOLDER]); the vision's other two sources — world-exploration clue anchors + character sacrifice — still have NO grant code, so they add their own `SendUnlock` site when they land ("all 5 sources" is really 4 today).
- **Prior:** **Idle-loop allocation fix — the EMPTY server was overloading. ✅ `fe0044d0` 2026-07-22, PO-verified in-game — pure allocation reuse (idle 11.2 → 0.16 MB/s), live idle CPU 25.8% → 17% of a core. Full ledger: `docs/plan-intermission-triage.md` §Idle-loop allocation fix; live overload watch (gctrace probe, follow-up 2026-07-24) in §Deferred.**
- **Prior:** **Day/night cycle DEACTIVATED** ✅ `e648ab88` 2026-07-22 — the avatar-invisibility bug recurred (avatar + aura ring not *drawn* with the aura ACTIVE at night, 100% PO repro live); deactivated, not fixed, via `DAY_CYCLE_PRESENTATION_ENABLED = false` in `DayCycle.ts`. Root cause unproven and never reproduced headlessly (looks GPU/driver dependent); prime suspect is the ~25 per-layer `ColorMatrixFilter` passes vs the `characters` layer's aura-sized bounds. Full ledger incl. the headless traps: `docs/plan-intermission-triage.md` §Day/night cycle DEACTIVATED; operational detail in §Deferred below.
- **Prior:** **Load-test skill mode — capacity re-measured WITH combat** ✅ `facadeee` (+ `1b0dbe73` sync) 2026-07-22 — walking bots had missed two structural costs (no mobs on the spawn campfire; a fresh bot's aura sensor is radius **0**, so it never paid the O(n²) broadphase), ⇒ **real clustered ceiling ~60–70, not ~80**, and **mobs cost more than auras**. `loadbot` gains `-token`/`-skills`/`-warp`/`-god`; **trust only `auras CONFIRMED LIVE n/n`** — a rejected cheat token is silent on the wire. Measured with Damage L1 only. **PvP-off rests entirely on `targetsAllies: false`.** **Rotate `/opt/aurad/tokens.list` at the next deploy** — the live cheat token was pasted into a session transcript 2026-07-22. Full ledger: `devops/loadtest.md` §Results 2026-07-22 with combat.
- **Prior:** Playtest-1 feedback **Pass C item 3 (darkness)** ✅ `a0a06e79` 2026-07-22, PO-approved in-session ("all good now"), in-game feel pass outstanding — **PASS C COMPLETE ⇒ the whole playtest-1 feedback plan is executed**; both halves of the plan's premise were wrong (day/night is a *different system* from authored dark areas and stays untouched by PO ruling; `flood()` was already a pure multiply) ⇒ fix was `MAX_ALPHA` 0.94→1 plus `DarknessOverlay.isHidden()` hiding mob plates in unlit darkness. Full ledger incl. all open/watch items: `docs/plan-playtest1-feedback.md` §Pass C item 3 ledger.
- **Prior:** Playtest-1 feedback **Pass C items 1+2 (UI features)** ✅ `5308c312` 2026-07-22, not yet PO-verified — C1 slot hotkeys now bind a pending spellbook skill via one shared `tryEquipPending` (+ Escape cancels), C2 mob nameplates "Name cL" WoW-tinted with **no wire change** (new `GET /mobs` catalog + the long-unread `mob_id`, `combatTarget` = grants-XP && !friendly); full ledger: `docs/plan-playtest1-feedback.md` §Pass C ledger. Open at the feel pass: Turnip gets a plate / Fire Totem + Poison Pool get none (one-line flips), nameplate font 16 + gap 16 [PLACEHOLDER], **gray-aggro now re-evaluable** (its missing level signal is on screen), slot hotkeys need a ~1.3 s hold under Playwright (rAF-throttled `Controls.update`).
- **Prior:** Playtest-1 feedback **Pass B (Communication & small fixes)** ✅ `75486ec9` 2026-07-22, not yet PO-verified — Light→**Lantern** rename, NPC sensor 1.5→1.0 (all 14), alert banner 22vh→**7vh** + `warning` kind (loadout-in-combat moves onto it), NPC bubbles **10 s**, active-voice gated tooltips, `XP 12/300` label, minimap compass, gold+ruled headers, Recover@Shaman + FirstAid@VillageHealer, Warlord banner hint; **items 1c+1d (unlock source attribution) DONE ✅ `2bfee286` 2026-07-24**; full ledger: `docs/plan-playtest1-feedback.md` §Pass B ledger.
- **Prior:** Playtest-1 feedback **Pass A (Balance & AI)** ✅ `b0171ffb` 2026-07-22, not yet PO-verified — ~~gray-aggro gate (band −5)~~ **REVERTED ✅ `6e7a301e` 2026-07-22, PO-verified in-game ("aggro works again, mobs come at me now"): without a level signal on the mob it just reads as bugged when some mobs stop reacting. Full removal (`model.Leveled`, `player.CombatLevel()`, `Mob.isGrayTo/combatLevel`, `grayAggroBandLevels`, `gray_aggro_test.go`); `sensedBy` test helper moved into `safezone_test.go`; `go build` clean + `go test ./...` exit 0 / 29 pkgs. Decision 2 is RE-OPENED — revisit alongside the Pass-C nameplate level colors, which supply the missing signal.** + campfire hard safe-zone + aggro ×0.6; respawn ×2, HP+XP graduated by band, Z2 damage ×1.25, AlphaWolf/Marauder outrun the player, Vanguard gate 20→15, Heal r1.5/tick 80, drops → rare carriers; full ledger: `docs/plan-playtest1-feedback.md` §Pass A ledger.
- **Prior:** Playtest-1 feedback triage (planning session) ✅ `ff1d5465` 2026-07-22 — first *external* playtest, headline **"Die Mechanic an sich ist fun"**; PO decisions (density KEPT/difficulty via stats, gray-aggro off, hybrid drops, campfire safe-zone, WoW nameplate colors, click-to-bind) + the Pass A→B→C execution order; full plan: `docs/plan-playtest1-feedback.md`.
- **Prior:** **F&F playtest deploy LIVE ✅ `a7a2267d`** 2026-07-21 PO-verified — **`https://aura-game.duckdns.org/`** (Hetzner CX23 `159.69.148.73`; single `aurad` serves frontend + wss + `/skills`, autocert + port-80 redirect, systemd restart, `-content ./api` so content deploys skip the rebuild); `devops/deploy.sh` (full / `--content-only`) + `devops/README.md` runbook; cheats token-gated server-only (`/opt/aurad/tokens.list`); **no persistence — restarts wipe characters, `ANNOUNCE` before deploys**; live-ops quick-ref + full ledger: `docs/plan-playtest-deploy.md`.
<!-- Prior chunks: one-line pointers only. FULL ledgers live in the plan-doc §13 banners
     (docs/plan-content-zones12.md) and the referenced commits — never re-expand these here.
     See the `chunk-wrap` skill for the collapse rule. -->
- **Prior (full ledgers → `plan-content-zones12.md` §13 / `plan-intermission-triage.md` / `plan-rebrand-cleanup.md` / `plan-ui-polish.md` / `plan-reconnect-token.md` + commits):**
  - **Triage pass** ✅ `37878018` 2026-07-21 PO-verified — cast-bar stack in `#bottomCenter`, spider radii matched 1.0, Strong passive id 136 on new `damageDealt` stat (pin **82**, CityGuard @L3), Wildfire light r4 +1/L. `plan-intermission-triage.md` §Triage pass.
  - **UI-polish chunk 1** ✅ `ae51d8b5` 2026-07-21 PO-verified ×2 — `GET /skills` serves the parsed registry; `Skills.ts` hand-sync maps DELETED (catalog module + `SkillTooltip.ts` hover tooltips). Watch: `#gameUI` is a zero-size shell — Playwright waits on `classList`, not visibility. `plan-ui-polish.md` §Chunk 1 ledger.
  - **② Reconnect-token persistence** ✅ `a8e82851` 2026-07-21 PO-verified — reload restores the character (`reconnect_token` wire, ConnState `stashByToken`, TTL ~10 min [PLACEHOLDER] — stash-reserved names block new joiners that long). `plan-reconnect-token.md`.
  - **Playtest feedback pass** ✅ `2c68be85` 2026-07-21 PO-verified — alert banner ×2, spellbook headers gold, resist ring teal, Wildfire rework (feel pass outstanding). Watch: on weird Edit failures `git status` first (parallel session may have renamed files). `plan-intermission-triage.md` §Playtest feedback pass.
  - **Applied-effects pips** ✅ `1358b9bc` 2026-07-21 PO-verified — append-only `applied_effects` ubyte (Mob+Character) + shared `EffectPips`. Watch: regenerated `api/schema/js/` bindings need a webpack dev-server restart (HMR blind outside `frontend/src`). `plan-intermission-triage.md` §Applied-effects pips.
  - **Combat readability items 7+15** ✅ `e8b67289` 2026-07-21 PO-verified — category aura rings + mob tier frames (`Mob.aura_category`/`Mob.tier`/`Character.aura_category` append-only). Watch: `initShape()` runs before subclass field initialisers. `plan-intermission-triage.md` §Combat readability.
  - **Milestone table → `api/milestones/`** ✅ `d7460462` 2026-07-21 — `-content ../api` now covers 100% of tunable content; `playtest` skill uses `pkill -x aurad` (`-f` kills its own shell). `plan-intermission-triage.md` §Milestone table moves into api/.
  - **Night-readability fix** ✅ `6afbee84` 2026-07-21 PO-verified (full night played) — characters no longer vanish at night: derived night-filter layer list (new layers night-correct by default) + `FLOOD_OPACITY` 0.9→**0.6 [PLACEHOLDER]** + unfiltered `namePlates` overlay + mob layers moved under `characters`; full ledger: `plan-intermission-triage.md` §Night-readability fix.
  - **Step-7 B+C structural rename + branding** — DONE + PO-verified in-game 2026-07-21, `aa509d95` (one atomic commit) — **STEP 7 COMPLETE, repo is "Aura" end-to-end** (module `github.com/RoteRiesenRobbe/aura`, `pkg/aura/`, binary `aurad`, FB namespace `AuraApi` Go+TS regenerated, branding/docs/CI/devops swept, dead scripts pruned, "don't rename proactively" rule retired; kept by design: berryhunter.io URLs, Kringel socials, mascot/splash/favicon art = **open PO art call**, wiki-generator keep-or-delete call). Watch: webpack **config** changes (title/favicon) need a dev-server restart — HMR doesn't cover them. `plan-rebrand-cleanup.md` §5 banner.
  - **Step-7 A.6 bare-name skill renames** — DONE + PO-verified in-game 2026-07-21, `24806352` — 11 registry renames (Aura/Passive suffixes dropped, DamageAura→Damage, HealAura→Heal, cooldown Heal→FirstAid resolves the collision; PO picks Damage + FirstAid), 12 JSON files git-mv'd, `Skills.ts` synced; no wire/id-map/sim-preset impact. §4 A.6 banner.
  - **Step-7 A.5 legacy tag** — DONE 2026-07-21, `d1acf28d` — `legacy:true` on 19 JSON files (10 mobs / 5 mob skills / 3 factions / proving-grounds zone; 0 player skills after the set correction — all world-reachable), zone+mob leak warnings (`Zone.LegacyRefs`/`MobDefinition.LegacyRefs`), disk pin `TestDiskContent_LegacyTagging`. §4 A.5 banner.
  - **Farm-band pre-chunk (post-C8)** — DONE 2026-07-21, PO-driven in-session, `1b33be7a`+`f23fec2c` — GiantSpider/AlphaWolf/Marauder ids 45-47 cL9/10/12, XP 205/275/175 kph-derived; "farm" guardrail band-check; unique-art pass EntityType 66-70 incl. DireWolf/DireBear de-reskin; PO editor passes ×2 (campfires 3→5, props 856, spawns 349); KoboldVolley 4.5→2.2, turnip XP 0→1, gray-band flat-XP DECIDED. Watch: zone editor drops NPC `entityType` on every moved/re-added NPC (bit ×2). §13 farm-band banner.
  - **Session ⑦ C8 close-out + village-arrival intro rework** — DONE + PO-verified in-game 2026-07-21 ("the intro feels much better now"), `f9345739` — **C8 CLOSED** (turnip XP 30→0 kills the field powerlevel — superseded →1 in the farm-band pre-chunk; TownCrier EntityType 65 teaches DamageAura@L1/Recall@L3; Farmer + Sand-patch field south; healer hermit into the village; wolves 86→97; stale Immolation sim pin fixed). §13 Session-⑦ banner.
  - **Crit rework v2 (backlog §23)** — DONE 2026-07-20, PO-driven in-session, `635a44e3` (crit = character-driven stat: base 5% conf + `critChance` passive stat + `critChancePerLevel`; KeenEye id 60 → DireWolf drop 0.06 post-FINAL, pin **78**; Reaper authored pair removed, dot comp +5%; re-felt OK Session ⑦). Full ledgers: backlog §23 + `plan-skill-vocab.md` §4.3 v2.
  - **Session ⑥ C8** — XP pass v1 + wanderer NPCs + playtest triage — DONE + PO-verified in-game 2026-07-20, `e72a15e0`+`86f4f5d2` (band-XP/h rule `3600×1.15^(cL−1)` ÷ measured kph, turnip 30 → L2 in ~10; Wanderer/Traveller EntityType 63/64 → 15 npcs; WolfBite 1.2→1.0; low-band cheese/AFK brake deferred → farm-band plan; reconnect-token = later plan chunk; PO hand-authors campfires + density in editor). §13 C8 Session-⑥ banner.
  - **Session ⑤ C8** — DONE + PO-walkthrough 2026-07-20, `1ef67776`+`ac44bae5`+`d5263355` (**drop table FINAL + §11 no-pity FINAL**, boss-rare pattern Warlord Rejuvenation .10, WildAura→DireWolf .06; NPC body 0.35 / sensor 1.5 + Farmer EntityType 62; aura-swap-active-slot fix, Vanguard shield ~2.7 HP/s, regen taper 1.0→0.4; campfire 0.12 + heal cost 10−2/level FINAL). Parallel session `e2643cdb` (mob pathfinding detour + camp watchdog). §13 C8 Session-⑤ banner.
  - **Session ④ C8 part 1** — DONE + PO-approved 2026-07-20, `03a377b1` (**milestone table FINAL Heal L3/Haste L7**; HealAura→2nd Hermit @L2, Recover→DireBear drop + self-only; density pass 2 rounds → 805 props/346 spawns + Z1 road reroute, mob-on-screen standard; Lantern Post post-v1, Stag dropless, Lacerate not adopted; map editor idea → backlog §22). §13 C8 Session-④ banner.
  - **Session ③ C8 part 1 (sim-side)** — DONE + PO-read 2026-07-19, commits `4e412ebf`…`c55838e0` (dot-aura sim support, kills/hour roster battery, **regen 1%/s FINAL + downtime 10 s**, guardrail asserts `cmd/simharness/guardrail_test.go`, §A ceiling ACCEPTED + `TestGuardrails_CeilingOrdering`, Step-0 Warbanner = Vanguard 5 + Spearhead 5 + CallForAid 3). §13 C8 Session-③ banner.
  - **Intermission Session ②** pre-C8 lifts + content — DONE + PO-verified in-game 2026-07-19, `dad7c42d` (heal cost-curve, campfire %-heal, companion jitter; item-20 placements incl. new Troll + BanditPyromancer + Dire variants ⇒ Wildfire/Suppression/Barrier craftable; skills 132–133, pin 75→**77**). `plan-intermission-triage.md` §Session ②.
  - **Intermission Session ①** fixes mini-chunk — DONE + PO-verified 2026-07-19, `2c155a68` (items 19/1/14/16/5/11/21-partial/3-9 + code niceties; empty-spawn + Farmer-taught Harvest, startingSpawn flag, heal self-kill clamp, respawn full-HP, portrait rotation freeze, NPC entityType validator; GDD §11 sacrifice→v1). `plan-intermission-triage.md` §Session ①.
  - **C7** Recipe net — DONE + PO-verified 2026-07-18, `53868697` (zero-lift; 10 recipes ids 1–10, result skills 52–59, capstone Warbanner, registry pin **75**/recipe pin **10**; overshields cut ~⅓; Wildfire/Suppression/Barrier ingredients unplaced → C8). §13 C7.
  - **C6** Ork World Boss (§B) — DONE + PO-verified 2026-07-18, `5961b29a` (encounter `warlord.go`; lifts: ANNOUNCE alert/broadcast + AlertBanner, zone `anchors` schema+editor; Call for Aid id 51; mobs 35–38, pin **67**). §13 C6.
  - **C5** The front + Front-Aura — DONE + PO-verified 2026-07-18, `96cea32f` (lift 6 `friendlyToPlayers`; Vanguard 50 @L20 FrontCaptain = §A power outlier; human_army/orc factions, mobs 32–34, pin **62**; west arena = C6 canvas). §13 C5.
  - **C4** Z2 village + bandit gate — DONE + PO-verified 2026-07-18, `4d5406a4` (zero-lift; bandit faction, mobs 27–31 incl. first crit pair + first shield_aura, DamageBurst 49, GateWall, seam ridge, pin **58**). §13 C4.
  - **Map condense ×0.6 + post-C3 polish** — DONE + PO-verified 2026-07-18, `d945d948` (bounds 240×120→144×72, all coords/darkness ×0.6, roads to Z2, kobold speed, Antivenom category fix ids 47/48). Client render-interp crawl on large jumps → **backlog §20**.
  - **C3** Kobold hideout + Dark Tunnel — DONE + PO-verified 2026-07-18, `afd57e68` (zero-lift; kobold/spider factions, mobs 21–26, Antivenom 47 + Pickaxe 48, first `poison` dot, pin **52**). §13 C3.
  - **C2** wildlife + dark forest (Parts 1+2) — DONE + PO-verified 2026-07-17, `7eb2d266`+`2eb44528` (lift 2 passive light `LightRadius()`; Torch 46, Bramble solid mob, SPEED cheat, TurnipPull→Harvest rename, empty-spawn aura, ×2 density pass, pin **45**). §13 C2.
  - **C1** Z1 farm start beat — DONE + PO-verified 2026-07-17, `a494bc26` (rect-prop lift, gated damage tags). §13 C1. Step 5 (unlock sources) + Step 4 (skill vocab) complete + committed.
- **Next:** **OPEN LIVE BUG — dropped movement inputs, PLANNED NOT STARTED (2026-07-22): `docs/plan-input-jitter.md`.** PO report from live: *"I wanted to walk but kept stopping — not delayed or sluggish, the movement keys just sometimes did not register."* **Not the sim** — only 10 overloaded ticks (103–133 %) across the 23-minute 19:31–19:54 session. It is the **upstream input path**, which tolerates exactly **3 ticks (~100 ms)** of gap and then *deletes* movement rather than delaying it: input channel 2 deep (`model/client/client.go:192`), `NextInput()` called **once per player per tick** with no drain (`core/input.go:60`), `pickInput` bridges a starved tick **only once** (`core/input.go:90`), and on the burst that follows a gap `pushInput` **evicts the oldest** back down to 2 (`client.go:113`) — so a 300 ms stall silently discards ~7 ticks of walking that never replay. Prime suspect **TCP head-of-line blocking** (one lost upstream packet = one ~200–300 ms retransmit stall; at 30 inputs/s even 0.1 % loss ⇒ a stop every ~30 s, and localhost has no loss, which is why dev never saw it); live competing hypothesis is **client-side main-thread stalls** (Tock replays only one missed tick, `tocktimer/tock.js:53`). **PO ruling: instrument FIRST, fix after reading real numbers.** Chunk 1 = per-player `starved`/`bridged`/**`stalled`**/**`evicted`** counters + a starve-run histogram that sizes the coast window, and whose burst-vs-no-burst signature **discriminates the two hypotheses**; landmine — the counters must keep the `fe0044d0` `AllocsPerRun == 0` pins green (fixed arrays, no `fmt` in the hot path) and the eviction counters cross goroutines (`atomic.Uint64` on the client struct). Chunk 2 = **coast + reconcile** (queue 2→16, coast up to `maxCoastTicks` [PLACEHOLDER, from the measured p99], discard exactly the coasted count from the arriving backlog ⇒ distance travelled == exactly what the client sent, no lost movement *and* no ghost-walking; no cheat surface — still ≤1 movement per tick). Chunk 3 = **rate alignment, PO said in scope** — client `INPUT_TICKRATE: 33` → `1000/30`, because the client runs 30.303 Hz against the server's 30.0 Hz (`core/game.go:218`), permanently saturating the queue for ~66 ms of standing input latency; **move the client, not the server** (a 33 ms server ticker would self-consistently match `stepMillis = 33.0` — the world does run ~1 % slow in real time today — but would shift every seconds→ticks conversion by 1 %; flagged, deliberately untouched). **Land chunk 3 AFTER the chunk-1 measurement run** or the baseline moves under it. Also fix the wrong-signed drift comment at `core/input.go:82`. **Next:** **Playtest-1 feedback passes — Pass A ✅ + Pass B ✅ + Pass C ✅ (items 1+2 `5308c312`, item 3 darkness; all awaiting the PO in-game feel/read pass). THE PLAYTEST-1 PLAN IS FULLY EXECUTED ← NEXT: the deferred Pass-B items 1c+1d (unlock popup sequencing + "Taught by: …" source attribution — the tester's "never noticed where abilities came from" is now ADDRESSED ✅ `2bfee286` 2026-07-24 — the shipped fix added `EntityMessage.kind=Unlock` and emits from all 4 live grant sites (`docs/plan-unlock-attribution.md`); NEXT is step 8.** (The nameplate work needed **no** wire field after all: `mob_id` was already on the wire and the rest came from the new `GET /mobs` catalog.) After those, step 8 resumes: **accounts & persistence (roadmap item 3, planning session)**, then the character-sacrifice loop (triage item 10) as persistence's first consumer — extra-motivated since the live F&F server wipes characters on every restart. **When planning step 8, fold in the server ops block from `plan-playtest-deploy.md` §Ops & security posture** — persistence is the posture tipping point (first data whose loss hurts): cloud firewall, DB bound to localhost, daily backup with a proven restore, DB-credential handling (SSH is already key-only as of 2026-07-22). Expect further ad-hoc triage from live playtests in parallel; live-ops quick-ref in `plan-playtest-deploy.md` §Status. The UI-polish rough pass is COMPLETE (its one chunk `ae51d8b5`); everything else on the item-8 checklist stays deferred to later passes (icons, popups — **ruling: popups ride the in-game announcement system** — bar styling, minimap, panel chrome, aura VFX, avatar; list in `plan-ui-polish.md` §Deferred). Flavor descriptions = later authoring pass (~47 drafted one-liners for PO review). **PO priority queue (set 2026-07-21) is CLOSED:** step-7 rebrand ✅ `aa509d95`, ① combat readability ✅ `e8b67289`, ad-hoc applied-effects pips ✅ `1358b9bc`, ad-hoc playtest feedback pass ✅ `2c68be85`, ② reconnect-token persistence ✅ `a8e82851`, **③ combat-feel SFX → DEFERRED (PO 2026-07-21):** no placeholder audio assets available — background music + the existing sounds suffice for now; revisit later (natural slot: the step-8 audio half; scope unchanged: hit/ability/mob-death/level-up sounds on the existing `frontend/src/features/audio/` scaffold — sound registry + assets + trigger hooks). **Open PO calls from the rebrand:** replacement art (mascot/splash/favicon — drop-in paths in Last completed), wiki-generator keep-or-delete, eventual domain decision (berryhunter.io URLs kept meanwhile). PO continues manual placements/corrections in the zone editor in parallel (campfires, density, road corridor, post-intro polish — farm-mob coords are first-pass). Standing authoring rules for any future mob work: **new mobs inherit the Session-⑥ XP rule** (facetank kph while viable, else kite ×0.5), **every C1+ mob MUST be authored tier + baseline** (raw `maxHealth` hard-fails; manual §1), combat mobs need NO harvest entries but **gate obstacles must opt in**, and cL8-17 mobs fall under the "farm" guardrail band-check.
- **Open code-health findings (documented 2026-07-24, NONE scheduled — `docs/backlog.md` §27 + `docs/research-code-quality.md` §10; companion to the same-day `sys/skills.go` pass in §25/§8):** a review of `sys/mob.go` / `model/mob/mob.go` / `skills/definition.go` found **two bugs, both outside the big files** — size predicted nothing. **① LIVE BUG, reproduced, not fixed:** `MobSystem.Update` (`sys/mob.go:99`) removes dead mobs *inside* `for _, mob := range n.mobs`, and `game.RemoveEntity` → `ecs.World.RemoveEntity` → `MobSystem.Remove` is **synchronous** (it `append`-shifts the backing array under the live range loop) ⇒ **every tick in which a mob dies, one surviving mob is skipped entirely and another is updated twice** (double movement step / regen tick / TTL decrement). Presents as a single-tick mob stutter indistinguishable from netcode jitter, which is why it was never reported. ~30 min, test-first; nine sibling systems share the loop shape and need one grep each (§27.1). **② DROP-RNG DETERMINISM — PO RULED A BUG 2026-07-24:** `NewMob` seeds each mob's RNG from its entity ID alone (`mob.go:150`) and `ecs.NewBasic()` counts from 1 each process, so **a fresh server rolls the same HP variance and the same first drop for the Nth spawn point on every restart** — visible on the live F&F server, which wipes on every restart. **PO ruling: this should NOT be like this — rolls must be random per run; the same mob must not drop the same skill after every restart.** Fix = seed from a per-process random source mixed with the entity ID (keep per-mob streams independent; the sim harness/guardrail batteries need their own explicit seed since they rely on determinism) — §27.2.2. **③ `skills/definition.go` guard coverage is uneven** — the file hard-fails a `dot` with no damage / `shield` with no pool / `stat_multiplier` with no scaling, but happily loads a `damage_aura` dealing **0**, a `heal_aura` healing **0**, and **any aura with `radius: 0`**; and `mapToEffectDef`'s switch has **no `default:`**, so an `EffectType` forgotten there parses into an `EffectDef` with every payload pointer nil — the exact invariant its own doc comment claims parsing enforces (one-line fix; third instance of the §7.3 silent-failure pattern). Rest of §27 is structural debt with no defect attached (`log.Fatalf` in a per-spawn constructor + the unvalidated EntityType name-fallback; mob out-of-combat regen hardcoded "full in ~2 s" with no `conf.json` entry; the ~45-field `Mob` god struct = **watch item, do NOT refactor pre-emptively**).
- **Deferred (per triage §Execution sequence):** **Live overload watch — CHECKED 2026-07-23, NOT closed; gctrace probe ARMED, FOLLOW UP 2026-07-24** (full ledger: `docs/plan-intermission-triage.md` §Live overload watch — day-of-logs check + gctrace probe): the idle-loop alloc fix `fe0044d0` **roughly halved** the idle rate (200 overloads/24 h ≈ 8/h, ~77 of them in the zero-player 00:00–08:59 window; pre-fix was ~10–30/h) **but left a WORSE tail** — two idle ticks hit **203 %/245 % at 00:17:44 with nobody online** (~81 ms), vs the pre-fix idle peak 154 %. Host ruled out for *sustained* pressure only (load 0.36/2 cores, steal 0, ~2 involuntary ctx-sw/s — averages can't catch a rare 8/h stall). **Respawn is NOT the idle cause** (idle ⇒ nothing dies ⇒ the respawn loop is 471 cheap int-compares, `sys/mob.go:107`); an 80 ms idle tick is most likely **GC** (fix made GC rare ⇒ each scans a bigger heap ⇒ triggering tick eats mark-assist; the double-spike-in-one-second fits) **or a rare host deschedule** — not `bruteIntersectShapes`. **Probe 1 armed 2026-07-23 20:57 UTC:** `Environment=GODEBUG=gctrace=1` in `/etc/systemd/system/aurad.service` (backup `aurad.service.bak-gctrace` on the box), clean boot verified, gctrace flowing; **that restart reset character state + the Overload history**. **2026-07-24: correlate** `journalctl -u aurad --since "-24h" --no-pager | grep -E "Overload! Systems at: (1[4-9][0-9]|[2-9][0-9]{2})%|gc [0-9]+ @" | grep -v "TLS handshake"` — GC-with-high-assist next to spikes ⇒ smooth the residual mob-respawn alloc / `SetGCPercent`/`SetMemoryLimit`; no nearby GC ⇒ ship **Probe 2** (per-overload-tick per-system timing + sum-vs-total + NumGC delta) to split host-deschedule vs `bruteIntersectShapes`. **REVERT after diagnosis:** drop the `GODEBUG` line (or restore the backup), `daemon-reload && restart`. **Higher-leverage than chasing the spike:** the 80 ms idle tail *is* the dropped-movement event, so `plan-input-jitter.md` Chunk 2 (coast+reconcile) makes the player immune regardless of cause. **Day/night cycle is OFF and its bug is UNFIXED** (2026-07-22): `DAY_CYCLE_PRESENTATION_ENABLED` in `DayCycle.ts` — flip to `true` to restore the tint, but only together with collapsing the ~25 per-layer filter passes into ONE on a single parent container; root cause never reproduced headlessly, so bisecting it needs a real GPU. Consequence: the **night flood 0.6 placeholder below is moot while the flag is off**, and "night" now has *no* visual expression at all (the authored dark areas are a separate system and still work). **Playtest-1 design rounds** (own planning sessions, not scheduled: tutorial/onboarding strip, quest/hint-journal question, aura differentiation, pickaxe/harvest-as-key communication, "motivation to try auras" — `plan-playtest1-feedback.md` §Own planning rounds; avatar customization → step-8 accounts). **From the playtest feedback pass** (✅ `2c68be85`): **Wildfire post-rework in-game feel pass** (committed straight after handover) + its values (radius 1.4 / dotTicks 4 / caster resist 0.6 −0.05/lvl) all [PLACEHOLDER]; banner `1.1 × @uiElementHeight` + spellbook headers `1.1em` gold [PLACEHOLDER]; player-dot `tickInterval 20` [PLACEHOLDER]; **mob dot auras still apply slow** (FireElemental 60 / Ember 50 — excluded by PO pick, revisit if mob burns feel undodgeable-unfair). **From applied-effects pips** (✅ `1358b9bc`): pip geometry placeholders (`EffectPips.ts` `PIP_RADIUS 4` / `PIP_SPACING 11`) + resist teal `0x5fbfb0` / tickrate orange `0xe0812e` (mob-side pip glance ✅ + resist ring colour ✅ closed 2026-07-21 in the playtest feedback pass). **From combat readability** (items 7+15 ✅ `e8b67289`): **Band width is a fixed 4 px** regardless of aura size, so a small-radius mob aura with several categories gets proportionally chunky bands (switch to fraction-of-radius + px floor if it reads badly). **Post-C8 tooling:** standalone browser map editor (**backlog §22**, seeded from the Session-④ density-pass renderer/generator in that session's scratchpad). **Persistence step** — item **10** sacrifice loop (first consumer; GDD §11 amendment landed Session ①). **Anytime/annoying:** item **21** full `null.split` repro session. **From Pass C items 1+2** (✅ 2026-07-22): **`combatTarget` consequences to judge** — Turnip gets a plate (1 XP), Fire Totem / Poison Pool get none (0 XP despite being hostile), both one-line flips; **nameplate font 16 + `NAMEPLATE_GAP` 16** read small at default zoom; **the 5 band colours + thresholds** (`≥+5` red `0xff5555` / `+3..+4` orange `0xff9a3c` / `−2..+2` yellow `0xf5d442` / `−5..−3` green `0x5fd35f` / `≤−6` gray `0x9d9d9d`); **gray-aggro (decision 2) is now re-evaluable** — the level signal it lacked is on screen; **harness gotcha: slot hotkeys need a ~1.3 s hold under Playwright** (rAF-throttled `Controls.update`; raw window listeners unaffected — recorded in the `verify` skill). **From Pass C item 3** (✅ 2026-07-22): **the Dark Tunnel is now a total blackout** and **there is no campfire in the corridor** (nearest `(-21.26,-23.51)`, ~9 units off the west end) — if crossing it unlit plays too harshly, a corridor campfire is the content-side lever, no code; **still leaking through darkness** — other players' plates (`Character.ts`, same overlay; arguably correct = light-support fantasy), **floating damage numbers** (most likely next complaint: numbers painted over an invisible mob) and NPC chat bubbles; **light does nothing at night** (holes only exist inside authored circles ⇒ Lantern + campfires are no-ops after dark — a design gap, not a bug); **day/night is a 70%-of-daylight tint by PO ruling** ("just a small visual", untouched 2026-07-22) and `flood()` is already a pure multiply, so any future "make night darker" work means changing the flood **colour**, not the blend. **From Pass B** (✅ 2026-07-22): **items 1c+1d DONE** ✅ `2bfee286` 2026-07-24 (unlock source attribution — `docs/plan-unlock-attribution.md`); **long NPC bubbles can still graze the alert banner** at 7vh when the NPC sits at screen centre (keep lore lines to ~2 short sentences, or narrow the bubble wrap width); **spellbook panel title went gold too** beyond the plan's three titles (one-line revert if unwanted). Placeholder values still open (none declared FINAL): **Pass B set** (NPC sensor radius **1.0** all 14 NPCs, alert banner **7vh**, `NPC_MESSAGE_DURATION` **10 s**, Recover **@L4** Shaman / FirstAid **@L2** VillageHealer, spellbook `.sectionHeader` band+rule at 1.3em / panel titles `@panel-title-size × 1.2` gold, compass insets N/S 0.2vw + E/W 1vw — all 2026-07-22), **reconnect stash TTL ~10 min** (`sys/state.go` `reconnectStashTTLTicks`, 2026-07-21 — also how long a stashed name blocks new joiners), **night flood 0.6** (`DayCycle.ts` `FLOOD_OPACITY`, night-readability fix 2026-07-21 — tune at a real full night; measured = 70% of daylight, i.e. a tint not a darkening, PO ruling 2026-07-22 leaves it that way), **darkness geometry** (`DarknessOverlay.ts` `EDGE_FADE 2` / `LIGHT_CORE_FRACTION 0.55` and `Player.ts` `MIN_SELF_LIGHT_PX 40` — the self-glow is **load-bearing** since `MAX_ALPHA` went to 1, it is the only vision an unlit player has; `MAX_ALPHA` itself is **no longer a placeholder**, Pass C item 3 2026-07-22), **aura ring + tier frame values** (`AuraRings.ts`: 6 category colours, `BAND_WIDTH 4` / `BAND_ALPHA 0.75` / `FILL_ALPHA 0.1`; `Mobs.ts`: elite silver `#c8ccd4` w2 / boss gold `#e8c04a` w3 — items 7+15, 2026-07-21), **skill-tooltip styling** (`HUD.less` `#skillTooltip`: font 1.5rem / title 1.6rem / subtitle 1.25rem / max-width 26rem / `fade(black, 85%)`; per-type line wording in `SkillTooltip.ts`; label colors ride `AURA_CATEGORY_COLORS` — UI-polish chunk 1, 2026-07-21), Troll cL11 / Pyromancer cL6 / Dire cL6-7 tiers, **farm-band trio tiers/baselines** (GiantSpider cL9-90 / AlphaWolf cL10-80-spd0.74 / Marauder cL12-85-BladesL3) + XP 205/275/175, **KoboldVolley radius 2.2** (halved from 4.5, PO 2026-07-21), **spider aura radius 1.0** (SpiderBite + VenomSpit matched, triage 2026-07-21 — tunnel feel pass open), **Strong 0.04 + 0.02/pt @ CityGuard L3** + **Wildfire light r4 +1/L** (tops out r8 at L5 vs Light's r6 — flag only if night balance cares; both triage 2026-07-21), teacher gates Immolation 6 / Totem 5 / Revive 6, regen-taper floor 0.4, Vanguard shield 4+1/90t, WolfBite radius 1.0, **XP table v1** (rule `3600 × 1.15^(cL−1)` ÷ kph, Session ⑥; turnip → **1 XP** token, farm-band pre-chunk 2026-07-21, L1→2 on wolves; **gray-band: flat XP kept, decision closed**), **crit rework v2** (base `0.05` conf / default critFactor ×2 / KeenEye 2%/level ×5 / **wolf-line drop 0.06 line-wide** 2026-07-21 / dot +5% comp — backlog §23), **wolf-line drop chances** (Wild .5 / LongRangeStrike .2 / Reaper .2 / Swift .1 / KeenEye .06) + two open tuning notes from that pass: **Wild reads as a trap pick** (~72% baseline DPS at r1.4, barely outranges DamageAura r1.0 → the DPS loss buys no safety) and **Reaper maxLevel 3** (13.5 max DPS ≈ LongRangeStrike 12.8 despite four more curve levels — raise to 5 if the apex drop should feel apex). Standing locks: growth 1.12 × maxLevel 30 (≈27×, band ≈ +5, lower-first); **regen 0.00033 ≈ 1%/s FINAL × level taper 1.0→0.4** (C8 settlements 2026-07-19 + 2026-07-20); §11 no-pity FINAL + campfire `0.12` FINAL + heal cost `10 −2/level` FINAL (C8 Session ⑤ 2026-07-20); **drop table + milestone table are TUNING-OPEN, not frozen** (PO ruling 2026-07-21 — "FINAL" on these meant *first-pass settled*, and like any MMO they retune on feedback; superseded the C8 Session ⑤/④ FINAL labels): **milestone table is now Haste @L7 only** (FirstAid removed 2026-07-21 — the village Hermit teaches it @L2, and since Pass B the VillageHealer does too), **wolf line = Swift .1 + KeenEye .06 line-wide + EliteWolf Wild .5 / DireWolf LongRangeStrike .2 / AlphaWolf Reaper .2** (2026-07-21); **density standard: mob visible on every ⅔-screen (17×9.5 u) window** (C8 Session ④); tier frame: elite ≤ 25% facetank / boss kills the bot / normal = per-mob texture + Z1/Z2/farm(cL8-17) band-check (front exempt); **downtime 10 s** + chain 20; guardrail asserts LANDED (`cmd/simharness/guardrail_test.go`, deterministic). Dev cheats: GOD, WARP <x·120> <y·120>, SPEED [factor|off], XP <amount>, SKILL <name>, ANNOUNCE <text>, THREAT [id]. **WARP has 1-unit granularity** (`sys/cmd/cmd.go:76` integer-divides before the float cast, so fractional coords truncate) — since Pass B dropped NPC sensors to 1.0 it can no longer reliably land you inside an NPC trigger; warp to the nearest whole unit ON the NPC, or walk the last step. `make build` runs `cp-defs` which reverts embedded `backend/pkg/api/` from source `api/`; boot `-content ../api` for content iteration (schema/Go changes still need the rebuild).

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

This applies to backend Go code (`go test ./...`) primarily. For exploratory
prototype work or UI tweaks, strict TDD may be relaxed — but any non-trivial
game logic (aura calculations, combination resolution, damage application)
should have tests before or alongside the implementation.

When fixing a bug: first write a test that reproduces it, then fix.

## Project Overview

**Aura** (formerly Berryhunter; module path `github.com/RoteRiesenRobbe/aura`, local workspace dir `aurahunter`) is a multiplayer top-down browser MMO built on the Berryhunter survival-game foundation. The repo has three main parts:

- `backend/` — Go game server (`aurad`)
- `frontend/` — TypeScript/webpack browser client using PixiJS
- `api/` — Shared FlatBuffers schemas and JSON item/mob definitions

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
- `backend/pkg/aura/sys/` — ECS systems: physics, mob AI, NPCs, skills, targeting, decay, state (death/respawn), pre/post-update, plus `chat/`, `cmd/`, `equip/`, `statuseffects/` (the scoreboard and heater systems were deleted — scoreboard in the 2026-07-08 dead-feature prune, heater with step 7)
- `backend/pkg/aura/model/` — interfaces and concrete types for entities (player, mob, resource, placeable, spectator)
- `backend/pkg/aura/items/` — item and mob definitions loaded from `api/items/` and `api/mobs/` JSON files at startup
- `backend/pkg/aura/codec/` — FlatBuffers encode/decode for the WebSocket protocol
- `backend/pkg/aura/phy/` — 2D physics (circle/AABB collision, spatial hashing)

**Adding a new system:** implement `ecs.System`, register it in `core/game.go:NewGameWith()`, and add entity registration cases in the relevant `addXxx()` methods.

**Adding a new entity type:** implement the appropriate `model.*Entity` interface, update `game.AddEntity()`, and register in all relevant systems.

### Communication Protocol (FlatBuffers over WebSocket)

Schemas live in `api/schema/`:
- `client.fbs` — client→server: `Input`, `Join`, `Cheat`, `ChatMessage`
- `server.fbs` — server→client: `GameState`, `Welcome`, `Scoreboard`, `Obituary`, etc.
- `common.fbs` — shared types (`Vec2f`, `ActionType`, `AuraType`)

After editing `.fbs` files, regenerate bindings for both backend and frontend.

### Game Configuration (conf.json)

All numerical tuning lives in `backend/conf.json` (or `conf.default.json` for reference). The `game.player` block controls movement speed, aura radii, vital-sign drain/gain rates, and level-up scaling. Changes take effect on restart.

### Item / Mob Data (JSON)

`api/items/` and `api/mobs/` contain JSON definitions. The `make -C backend cp-defs` target copies them into `backend/pkg/api/` so the Go build embeds them. Run this (or just `make -C backend build`) after editing any JSON definition.

### Frontend

The frontend is structured as feature modules under `frontend/src/features/`:
- `backend/` — WebSocket connection, FlatBuffers deserialization, entity snapshot management
- `core/` — game loop, entity manager
- `player/`, `vital-signs/` — local player state and HUD
- `game-objects/` — rendering entities (resources, mobs, placeables) via PixiJS
- `input-system/`, `controls/` — keyboard/mouse/touch input
- `internal-tools/` — dev panel, console, overlay tester (only active with `?develop`)

**HUD event handling:** Use `pointerdown` (not `click`) for all interactive HUD panels. `MouseManager` (`input-system/logic/mouse/MouseManager.ts`) registers a `mousedown` listener on `document.documentElement` with `event.preventDefault()`, which suppresses the synthetic `click` event. `pointerdown` fires before this and is unaffected. `click` listeners on HUD panels silently never fire — this is not obvious from the source.

Webpack configs: `webpack.common.js` (shared), `webpack.dev.js` (HMR, port 2001), `webpack.prod.js` (minified output).

## Aurahunter Project Context

This fork of Berryhunter has been transformed into **"Aura"** — a top-down MMO.
The Berryhunter survival systems (vitals, crafting, temperature, hunger) have
been removed. The core loop revolves around the aura system described below.

The structural rename (execution-order step 7, `docs/plan-rebrand-cleanup.md`)
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
XP bar, ability bar, aura panel, minimap, zone chat), line-of-sight for auras,
campfire system.

### Not in v1.0

PvP, formal group system, economy, mobile, endgame raid events, character sacrifice.

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
