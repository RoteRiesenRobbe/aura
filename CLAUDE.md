# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Migration Status

- **Last completed:** **Effect foundations Step 2 — status-effect framework (2026-07-08, full suite green, tsc green, boot-verified embedded + `-content ../api` (17 skills/6 milestones), **verified in-game 2026-07-08**):** **`skills.Buffs`** (`skills/buffs.go`) — ONE generic per-entity buff/debuff store with typed payloads, carried by every player + mob (field `buffs`, replacing `resistBuffs`). Inherited ResistBuffs semantics verbatim (entries keyed by source skill; per-strength streams age independently; strongest active wins within a skill; distinct skills stack; `Tick()` aging on the `ResetTickNumbers` hook), ported tests included; **`ResistBuffs` deleted**, `skills.ResistMultiplier` stays. **Slow migrated:** mob `slowFraction`/`slowTicks` fields + Update-decrement deleted; `ApplySlow(source, fraction, ticks)` now keyed by skill with the aura lifetime convention (interval+1 = the old hardcoded 2 for SlowAura's interval 1); `moveTowards` queries `SlowFraction()` (strongest active wins, cross-skill — unchanged); deliberate micro-improvement: a weaker slow's refresh no longer extends a stronger one's lifetime (the resist stream rule). **First NEW payload: dot** — effect types **`dot_aura`** (re-applies per effect tick: refresh resets duration → continuous burn in range) and **`instant_dot`** (one-shot on cooldown activation, shares the instant_damage query; `fireCooldown` dispatches both), sharing `DotParams` (`damageHP`+PerLevel, `damageTags`→physical default, `variance`, **`dotTicks` × `dotTickInterval`** — duration = count×interval+1 so "3 events over 3 s" is exact; dotTicks/interval/damage all-zero hard-fail like the stat guard; `AuraMaskFor` gained the dot_aura case — the resist-gap lesson applied preemptively). **The defining upgrade: dots outlive re-application** — they keep ticking after the target leaves the aura or the caster dies. Acting site `SkillSystem.tickDots` at the top of `processEntity` (aging at tick start, acting in the combat slice before serialization; dot entries keep a separate acting accumulator that is NOT reset on refresh, so per-tick aura refreshes can't starve a slower dot cadence); damage replays the stored caster ref (`any` in skills; sys type-switches) through **`PlayerTouches`/`MobTouches` — XP participation, kill credit, tags, per-event roll-then-mitigate and floating numbers all ride the existing paths**; each event stamps the fire `aura_hit_style`. **Zero wire changes** (visibility v1 = VFX only). `Cleanse()` (F10) in place; **buffs die with the entity** — respawn starts clean (pinned in `TestDeathRespawn_RetainsSpellbookAndProgression`). Root/mark deliberately skipped (root = slow-1.0 when a consumer exists; mark needs the §6 visibility decision). Content [PLACEHOLDER], both **milestone-unlocked at level 5**: **ImmolationAura** (id 5, aura, nearest-1 enemy, dot 5+1/lvl × 3 events @ 1 s, fire) and **Ignite** (id 22, NovaBurst-shaped cooldown 300 ticks −20/lvl, radius 1.5, uncapped, dot 6+1.5/lvl × 3 events @ 1 s ≈ 3 s burn, fire) — registry now **17 skills** (`registry_test` updated), `Skills.ts` entries added (ImmolationAura shows the default damage ring; Ignite is ringless). New pins: `buffs_test.go` (streams/stacking/expiry per payload + dot interval/duration/refresh/strongest-acts/caster-handoff/cleanse), `TestMap_DotAura` + validators, `TestApplyDotEffect_*` (level scaling, caster ref, no-friendly-fire), `TestTickDots_*` (PlayerTouches/MobTouches dispatch, fire VFX, per-event variance), `TestCooldown_InstantDotAppliesDotOnce`, slow-aura tests assert source+ticks. Decision record: `plan-effect-foundations.md` §7 banner (six sub-decisions) + §4 Step 2; schema tables in `plan-skill-system.md` (incl. fixing three stale tables: instant_damage/slow_aura still showed pre-Step-1 `targetsMobs`/`targetsPlayers`, stat_multiplier the pre-unification `additivePerLevel`). **Prior — Effect foundations Step 1 — binary faction/allegiance (2026-07-07, full suite green, boot-verified, **verified in-game 2026-07-08**):** new `model.Faction` (`FactionAligned`/`FactionHostile`, `model/faction.go`) with a `Factioned` interface on `PlayerEntity` + `MobEntity` — players return Aligned (no stored field), mobs store `faction` (explicitly initialized: Hostile is **not** the zero value; pinned by `TestNewMob_SpawnsHostile`); a setter waits for charm (YAGNI). **Content-facing schema change: `targetsMobs`/`targetsPlayers` → `targetsEnemies`/`targetsAllies`, relative to the caster's faction** — a mechanical per-caster-kind rename preserved every value across all 11 flag-carrying skill JSONs (player skills: mobs→enemies, players→allies; mob skills mirrored; FireWard `targetsPlayers:true`→`targetsAllies:true`), embedded copies synced via cp-defs; stale keys hard-fail via the Step-0 allowlist with a **rename hint** (`renamedEffectKeys` in `skills/definition.go`, covers targetsMobs/targetsPlayers/additivePerLevel/damageFraction/healFraction; pinned by `TestMap_RetiredTargetFlagKeysFailWithHint`, boot-verified against a stale disk copy). Masks are caster-faction-relative: `AuraMaskFor(def, faction)`/`InstantDamageMask(e, faction)` map enemies→opposing layer, allies→own layer via `factionLayers` (byte-identical masks for all current content; a future faction flip retargets via the per-tick re-derivation — but once factions cross entity kinds, enemy masks must **widen to both layers** with eligibility doing the exact check, noted in `plan-effect-foundations.md` §4). Eligibility: `eligibleByTargetFlags` now requires a `Factioned` target and gates on faction equality (targetsAllies) vs difference (targetsEnemies); heal-aura "ally" = same faction (+ the `PlayerEntity` vitals capability until item 7); the mob damage path deliberately stays mask-only (structures are unfactioned but must stay reachable via `targetsStructures`/`MobTouches`). **Deliberate behavior delta (improvement):** placeables satisfy `Interacter` but have no faction, so a capped player damage aura can no longer waste its `maxTargets` slot on a no-op structure hit (pinned by `TestApplyDamageAura_UnfactionedTargetNeverEatsTargetSlot`); `TestApplyDamageAura_SameFactionTargetExcluded` pins the charm-shaped case (aligned mob-like target protected by no-friendly-fire). Mob-vs-mob exclusion and no-friendly-fire are now one faction rule instead of two flag accidents. Docs: `plan-skill-system.md` schema + `tdd.md` §4.1 updated. Deferred to consumers: faction setter, mask widening, faction-aware aggro (`mob.go` aggro mask still hardcodes the player layer — item 7). **Prior — Effect foundations Step 0 — pre-refactors (2026-07-07, full suite green, disk-load verified by booting):** (1) **`EffectDef` per-type split** (`skills/definition.go`): shared core (geometry/cadence/targeting) + exactly ONE per-type payload pointer (`DamageParams`/`HealParams`/`SelfHealParams`/`SlowParams`/`ResistParams`/`StatParams`; scaling helpers became payload methods `HPAt`/`FactorAt`/`FractionAt`/`BonusAt`). **JSON stays flat** — parsing now checks every effect key against a per-type allowlist (`effectKeys`): unknown keys (typos, stale renames) and known-keys-on-the-wrong-type hard-fail **by name**, replacing the four hand-maintained `isXEffect` validators; adding a type = payload struct + allowlist entry + validator + dispatch case, no other type's code changes. **The net caught a real bug on landing:** the `items/mobs/definitions_test.go` fixture still used pre-item-11 `damageFraction`, silently dropped (= 0 damage) since the Phase-1 rename. (2) **Shared `eligibleByTargetFlags[Capability]`** predicate builder (`sys/skills.go`) replaces the copy-pasted flag gates of damage/resist auras (heal + mob-mask eligibility deliberately stay bespoke — different rules, not duplication). (3) **`-content <dir>` flag** (`cmd/berryhunterd`): loaders take `fs.FS`; `./berryhunterd -dev -content ../api` reads the repo **source of truth** directly — content edits skip **both** cp-defs and the rebuild (restart still required; `skills/milestone-unlocks.json` is code-adjacent and stays embedded); missing subdirs hard-fail at boot; the boot log prints the content source (strengthens the stale-server gotcha check). New pins: `TestMap_UnknownEffectKeyFails`, `TestMap_StaleAdditivePerLevelKeyFails`, `TestParse_ExactlyOnePayload`, `TestDiskContent_RepoApiLoadsEndToEnd` (**first load-validation of repo `api/` itself** — embedded-copy tests can't catch un-cp-defs'd edits), `TestDiskContent_MissingSubdirFails`; the old `effectDamageHP`/`effectHealHP` helper tests re-pin the payload methods. Verified end-to-end: booted with and without `-content` (identical counts 15 skills/4 mobs/1 recipe/10 items); injected a stale `additivePerLevel` into `api/damage-aura.json` → disk boot hard-fails naming the key, embedded boot unaffected (edit restored). No wire/frontend/content changes; gameplay identical. **Prior — Effect-system scaling decision + foundations plan (2026-07-07, docs-only, no code):** investigated growing the effect vocabulary from 8 to ~25+ types against a concrete ~35-idea candidate list (life steal, execute, thorns, DoT/CC, summons, shields, …). Outcome — decisions **F1–F10** in **`docs/plan-effect-foundations.md`**: **effect semantics stay hand-written Go effect types; no scripting engine for effects (off the table, not parked)** — the candidate list proved primitive-clustered (~5–6 missing engine primitives gate two-thirds of it; scripting would only relocate the cheap parse/dispatch third into a runtime-error domain), and composition semantics (pen × resist × shield × thorns × lifesteal ordering) belong in one audited Go pipeline. Constrained expression layer parked behind an explicit trigger (F2); encounter-controller Go-structs lean upheld (F3). Growth plan (F4/F5, sequenced in the doc §4): pre-refactors first (`EffectDef` per-type split — the fat struct is at its flagged ~30-field limit; shared eligibility predicate; dev-mode disk-load flag), then infrastructure in dependency order: **binary faction** (today "friendly" is a `PlayerEntity` type assertion — the hidden foundation under summons/charm/decoys) → **status-effect framework** (generalize `ResistBuffs`, whose `Tick()` lifecycle is already wired on player + mob) → **spawned-entity lifecycle** (totem ≈ velocity-0 mob + aura + `Decayer`-TTL; ownership/XP attribution is the gap) → **shield-as-buff-payload**; on-death/on-kill event hook with its first consumer. Design answers recorded: control effects **mobs-only in v1** (F7), faction **binary player-aligned vs hostile** (F8), stealth v1 = **transparency + aggro drop, no per-viewer info hiding** (F9), **everything cleansable** until proven otherwise (F10); damage-pipeline composition order needs its own decision record before two of {pen, shield, thorns, lifesteal} coexist (F6). Scripting research docs archived (`archive-scripting-audit.md`/`-options.md`, banners added); `tdd.md` §4.1 open-decision line flipped to decided; taunt/threat stays parked at roadmap item 7. **Prior — HUD bar text — absolute health + XP numbers (2026-07-07, backend suite + tsc/webpack green; in-game check pending):** the bottom-right HUD bars now render centered text — health `currentHP/maxHP`, XP `xpInLevel/xpForNextLevel` (**within-level** XP, same span the bar fraction shows; resets to `0/needed` on level-up **and on death** — no UI code needed for the latter, since `sys/state.go` calls `LoseCurrentLevelExperience()` *before* stashing the carried progression, so the first post-respawn tick already sends 0). **Wire:** appended `xp_in_level:uint` + `xp_for_next_level:uint` to `Character` (table-end, wire-compatible; regenerated Go + TS FlatBuffers). Backend: new `player.LevelProgressXP() (gained, required uint64)`; `LevelProgressFraction()` now derives from it (single home of the level-span math — this also replaced the old dead unsigned `fraction < 0` guard with an explicit `Experience < levelStart` check, closing a latent underflow); emitted once in `codec.characterCommonMarshalFlatbuf` (both Character encode paths share it). Frontend: `.barText` span in `#healthBar`/`#satietyBar` (`HUD.html`; styled in `vitalSigns.less` — centered overlay, z above the delta indicators, `pointer-events: none`), fed per tick via `HUD.updateBarTexts(...)` from `Player.updateFromBackend`. Pinned by `TestPlayer_LevelProgressXP_TracksLevelUpAndDeathPenalty` (0/100 fresh → 50/100 → level-up rollover 50/200 → death 0/200) and an extended `TestDeathRespawn_RetainsSpellbookAndProgression` (asserts 0/200 end-to-end through the death→stash→restore path). **Prior — Level-scaling unification (2026-07-07, code-quality items `research-code-quality.md` §3.2+§3.3):** ONE scaling convention system-wide — every leveled value is `base + (level−1) × perLevel`, expressed via generic `skills.Scaled(base, perLevel, level)` (`skills/scaling.go`; per-field floors stay at call sites), replacing 13 hand-written copies. `stat_multiplier`'s divergent single-field `additivePerLevel` (× level) became the paired `statBonus`/`statBonusPerLevel` — value-preserving migration of swift/tough-passive.json (`0.05` → `0.05/0.05` etc.); a `stat_multiplier` with both fields 0 **hard-fails at load** (catches stale `additivePerLevel` keys, which `json.Unmarshal` drops silently), and stat fields on non-stat effects hard-fail (mirrors the variance/resist guards). Pinned by `TestScaled`, `TestDerivedStats/base_and_perLevel_scale_independently`, `TestMap_StatMultiplierNoScalingFails`, `TestMap_StatFieldsOnNonStatEffectFails`. **This one-sentence rule is the item-12 authoring reference for scaling.** No wire/frontend changes. **Prior — Item 11 (deferred) Phase 3 — stat variance & damage ranges — COMPLETE (verified in-game 2026-07-06).** Decisions C1–C6 recorded in `docs/plan-item11-hp-resist-variance.md`: variance is a **percentage band around the programmatic center** (uniform roll in `[center×(1−v), center×(1+v)]`, valid `[0,1)`, absent/0 = static — the only representation, no min/max fields); **mob maxHealth rolls once at spawn** from the mob's entity-ID-seeded `m.rand` (**mobs only** — player max HP stays deterministic; a zero variance consumes **no RNG draw**, keeping seeded drop sequences intact); **damage + heal amounts roll per hit** — every target in a tick rolls independently — from a time-seeded, test-injectable `sys.SkillSystem.rng`; **roll first, then mitigate**: resistance multiplies the ROLLED value, min-1 rounding last (pinned by `TestApplyDamageAura_VarianceComposesWithResistance`); flat variance for all mobs (no tier scaling in v1); overhead shows the exact post-mitigation roll, **no crit styling**. Mechanics: shared `vitals.RollVariance(center, variance, rnd)`; `mobs.Factors.MaxHealthVariance` (JSON `factors.maxHealthVariance`); `skills.EffectDef.Variance` (JSON `variance` — only on `damage_aura`/`instant_damage`/`heal_aura`/`self_heal`, hard-fails on effects with nothing to roll); `selfHealHP` now returns the float center so the roll wraps the fraction-of-max heal cooldown too; heal-aura **self-cost stays static** by design (predictable build cost). **No wire/frontend changes** (per-mob `max_health` + literal per-hit HP numbers already existed). Content [PLACEHOLDER]: DamageAura `variance: 0.15`; Dodo + Mammoth `maxHealthVariance: 0.1` (SaberToothCat/AngryMammoth deliberately exact as control). **Prior — Item 11 Phase 2 — resistances & damage tags — COMPLETE (committed c0426e35, verified in-game 2026-07-06 incl. two in-game-found fixes: the `AuraMaskFor` resist case and the per-strength buff-stream expiry).** Damage/resist types are **arbitrary string tags** (never an enum). Decisions B1–B7 recorded in `docs/plan-item11-hp-resist-variance.md`: stacking is **keyed by source skill** (same skill from two casters → strongest wins, mirroring `ApplySlow`; **distinct sources — different skills, passive+aura — always stack multiplicatively**, so immunity is unreachable by stacking, only a single source granting 0 → content-design responsibility); untagged damage effects normalize to the reserved **`physical`** tag at parse (`skills.DamageTagPhysical` — armor equivalent, no "matches nothing" damage); **`Vulnerability` deleted everywhere** (struct+JSON+takeDamage; a `"*"` resist key can resurrect it if ever needed); bounds: multiplier ≥ 0, **0 = immune** (a fully immune hit is a **non-event**: no HP loss/number/status effect/VFX), **>1 = vulnerability**, no cap; heavily-resisted hits show 1 via min-1; **"RESIST" styling deferred** (needs a transient wire flag à la `aura_hit_style` — add when content ships a real immunity); ordering race accepted: **buff lifetime = tick interval + 1** survives one tick boundary (pinned by `TestMob_ResistBuff_ComposesWithBaseAndExpires`). Mechanics: hit payload `model.Damage{HP, Tags}` through `Interacter.PlayerTouches` (mob path: payload-only `mobs.Factors.DamageTags`); `mobs.Factors.Resistances map[string]float32` (JSON `factors.resistances`, validated ≥ 0/non-empty tags); `skills.ResistMultiplier(tags, sources...)`; transient `skills.ResistBuffs` on mob + player (keyed by source skill, `Tick()` rides the `ResetTickNumbers` lifecycle); new effect types **`resist_aura`** (`resistTags`/`resistFactor`+`PerLevel`/`targetsSelf` — self-buff outside the target cap; reuses the whole targeting pipeline via `sys.applyResistAura`) and **`resist_passive`** (folds into `DerivedStats.Resistances`, per-tag product across equipped passives); player damage = resist passives × buffs (untyped `damageReduction` unchanged on top), mob = base resistances × buffs. **New `SKILL <name>` cheat** (spellbook discovery + recipe cascade, same seam as real unlocks). Content [PLACEHOLDER]: `AngryMammothAura` deals `["fire"]`; new **FireWard** aura (ID 40, `api/skills/fire-ward.json`, fire ×0.6/0.5/0.4 L1–3, allies+self, tick 1) — registry now **15 skills** (`registry_test` updated); frontend: `Skills.ts` ID-40 entry + FireWard shows the **heal-style ring** (`FIRE_WARD_SKILL_ID` in `Character.setActiveSkill`); **no wire/FlatBuffers changes**. In-game check: `SKILL FireWard` → equip → boss aura numbers drop 4→~2–3, step out → full damage after ~1 tick. **Prior — Item 11 Phase 1 — absolute HP system — COMPLETE (committed, verified in-game).** Health + a new `maxHealth` are now **absolute integer HP** (was a single normalized 0..1 fraction of `vitals.Max`, identical for every entity). New primitives: `vitals.HP()` (round + **min-1 rule** — a real hit/heal never rounds to 0) and `VitalSign.AddCapped(n, maxHP)`. `EffectDef` fraction fields → `DamageHP` / `HealHP` / `SelfDamageHP` (+`PerLevel`); `mobs.Factors` gained `MaxHealth` (default-100 guard for direct construction) + renamed `DamageFraction`→`Damage`; new `PlayerConfig.BaseHealth` ([PLACEHOLDER] 100, `conf.default.json`). Player `MaxHealth() = round(BaseHealth × MaxHealthFactor)`; `takeDamage` is now **flat HP** (no more `/MaxHealthFactor`); heals clamp at maxHealth; **aura heals are flat HP** (a set value + per-level, **NOT** % of max — this is the aura-heal design; the heal **cooldown** instead heals a **% of max HP**, see review follow-ups); heal self-cost is flat HP; out-of-combat regen is absolute (player keeps a **fractional accumulator** because `healthGainTick` × maxHealth is <1 HP/tick). `HealthRatio = health/maxHealth` (selector contract unchanged). Wire: appended `max_health:uint` to `Mob` + `Character` (health / damage_taken / heal_received are now absolute HP); codec `Mob/CharacterAddMaxHealth`; **regenerated Go + TS FlatBuffers** (flatc v24.3.25). Frontend: overhead + HUD bars draw `health/maxHealth`; deleted `HEALTH_DISPLAY_SCALE` + `Mob|Character.MAX_HEALTH`; `vitalUnitsToDisplay`→`hpToDisplay` (identity) so floating numbers show **literal HP**. Content [PLACEHOLDER]: mob maxHealth Dodo 40 / SaberToothCat 60 / Mammoth 120 / AngryMammoth 400 (all `vulnerability→1`); every aura/cooldown converted fraction→HP (DamageAura 7 +1.6/lvl, HealAura heal 6 +3/lvl / self-cost 9, NovaBurst 25, Heal cooldown 20 +5/lvl, etc.); WildAura + boss aura gained tick intervals so fast ticks don't min-1-spam. Fixed a **pre-existing** stale test (`registry_test` expected 13 skills; PaladinAura made it 14 back in Phase 9). **Phases 2 (resistances & damage tags) and 3 (stat variance & damage ranges) have since landed — see above.** **Prior — Phase 9 (aura combinations) COMPLETE — tested in-game + committed** (see docs/plan-skill-system.md → Phase 9). Curated, secret, backend-only recipe system: `api/recipes/*.json` loaded via `skills.RecipesFromFS` (result/ingredient names resolved against the skill registry; hard-fail validation — unknown names, level `<1`/`>maxLevel`, empty ingredients, duplicate recipe IDs). `skills.ApplyRecipes(sc, recipes)` is a monotonic-cascade evaluator: discovers every result whose ingredients are all simultaneously at **≥** their level (pure threshold, nothing consumed), cascading until fixpoint; idempotent + cycle-safe (skips already-discovered results); no-op for mobs (nil spellbook). Player carries the registry (`p.recipes`, from `GameConfig.Recipes`); single seam `player.ApplyRecipeCascade()` is called at the three trigger sites — milestone unlock, mob kill-drop, and EquipSystem point **raise** (not unspend). **No wire footprint** — clients see combo results through the normal spellbook stream + existing 3.7 unlock glow. **First content: PaladinAura** (skill ID 30, `api/skills/paladin-aura.json`) unlocked by `DamageAura L5 + HealAura L5` — a **two-effect** aura (damage nearest enemy @ interval 20, heal lowest-HP ally @ interval 60), values a constant **70% of the base auras at every level** (dmg 0.126/+0.028, heal 0.042/+0.021, no heal self-cost — all **[PLACEHOLDER]**). **Required a tick-cadence fix:** `sys/skills.go` now uses a monotonic accumulator + per-effect `acc % interval == 0` (equip/`SetActiveAura` reset to 0), so a multi-effect aura runs each effect on its own cadence — replacing the old shared-max-interval reset that (latent bug) re-fired a short-interval effect every tick. Frontend: `Skills.ts` ID-30 entry + `PALADIN_AURA_SKILL_ID`; PaladinAura shows **both** aura rings (`Character.setActiveSkill`). **Prior — roadmap item 11 (aura targeting) COMPLETE:** Steps 1–3 as before (selector/cap machinery in `sys/targeting.go`; base auras single-target; floating damage/heal/XP numbers). **Step 4 — per-tick hit VFX (slash vs fire):** SkillSystem stamps an aura-hit style on each struck damage-aura target via `model.AuraHitNotifier.NoteAuraHit(style)` (separate from the `takeDamage` number recording); transient `aura_hit_style:ubyte` wire field on `Mob`/`Character` (0 none / 1 slash / 2 fire), reset on the `TickAccumulators` lifecycle. Style from `sys.auraHitStyleFor`: **per-effect `hitStyle` JSON override** (`slash`/`fire`/`none`) wins, else `auto` derives from cadence (interval ≥ `auraSlashTickThreshold` **[PLACEHOLDER 15]** → slash). Frontend `GameObject.showAuraHit` — single-instance sprite refreshed per hit tick: fast → sustained fire cluster over the avatar, slow → discrete slash streak sweeping across the model. **Replaced/removed the old `DamagedAmbient` white-flash** on mobs + characters. **Step 5** tick-interval verified. **Content compensation:** base auras retuned so slower ticks keep DPS/HPS (DamageAura int 20, MammothAura 20, HealAura 60/2s, DodoAura 24/0.8s, SaberToothCatAura 10/0.33s — all **[PLACEHOLDER]**); overhead health bars moved **below** the avatar (mobs + player in-world bar; HUD bar unchanged). **Prior:** Phase 8 complete (13 skills, 4 milestones); Block 2 survival removal complete.
- **Next:** **Execution order DECIDED 2026-07-08 — systems-first, content-last** (canonical list: `roadmap.md` "Execution order"; tech mirror: `tdd.md` §6). Consciously trades a fast playable build for author-once content. **Remaining sequence:** **(1) World foundation** [NEXT — `plan-world-zones.md`, 6 chunks: in-game editor + `zone.json` loader + rectangular `InvAABB` boundary + a **scaffold** zone; real zones deferred to content; **start at chunk 1, `phy.InvAABB`**] → **(2) Mob depth + totems** [roadmap item 7 remainder: patrol archetypes, support mob-heal, **encounter-controller spine + threat table built early** shaped by the doc'd lava-bridge boss; **+ effect-foundations Step 3 spawned-entity/totem lifecycle** — briefing in `plan-effect-foundations.md` §8: totem = velocity-0 mob w/ mob-skill aura, `spawn` effect from `fireCooldown`, ownership via `model.Owned`→`PlayerTouches(owner)`, TTL + `respawnBehavior:"None"` guard in MobSystem; folds in here because it reuses the MobSystem respawn path World chunk 4 rewrites] → **(3) LoS + darkness/light** [roadmap items 6+5: LoS blob-perf spike→occlusion; `light_aura` effect type + campfires] → **(4) Skill-vocabulary fill** [effect-foundations Step 4 shield-as-buff-payload + cheap effect types: life steal, execute, crit, berserker] → **(5) Unlock-source systems** [roadmap item 9: world clue anchors + NPC teaching] → **(6) Initial content pass (item 12 — the prove-it gate)**: real zones, full mob roster (replace legacy Berryhunter mobs), boss scripts, skills/passives/cooldowns, combination recipes, first balance pass; assign real `damageTags`+`resistances` across the roster (every aura defaults to `physical`; only the boss aura is `fire`) **and real variance bands** (only DamageAura `0.15` + Dodo/Mammoth HP `0.1` carry placeholder bands today); more recipe content is a pure `api/recipes/`+`api/skills/` JSON edit (no code) → **(7) Accounts & persistence + UI polish/avatar** [roadmap items 3+8, deliberately AFTER content] → **(8) Ops & closed-alpha readiness** [`research-v1-readiness.md`]. Steps 0+1+2 of effect foundations ✓ done and verified in-game (2026-07-08). **Review follow-ups (DONE, committed):** (1) the **heal cooldown** now heals a **% of max HP** — new `self_heal` fields `healFractionOfMax` (0.20) + `healFractionOfMaxPerLevel` (0.05 absolute → 20% / 25% / 30% at L1/2/3), applied via the `selfHealHP` helper; when set it overrides flat `healHP`, so the heal **aura** stays flat by design. (2) the self-heal cooldown now **records the floating heal number** (`NoteHealReceived` in the `self_heal` path; frontend already rendered it). Verified: `HealFractionOfMax` scaling ×max-HP + heal number pinned by `TestCooldown_SelfHealFractionOfMaxAndNumber`. **Block 2 COMPLETE** (survival removal, roadmap items 1+2 ✓) — see docs/plan-block2-survival-removal.md.
- **Current state:** new players start with DamageAura in slot 0 on spawn, server-authoritative from spawn. **Base auras are single-target (item 11):** DamageAura/WildAura hit the nearest one mob per tick; HealAura heals the lowest-%-HP ally a **flat HP** amount; NovaBurst/boss stomp remain AoE-all. **Health is absolute integer HP (item 11 Phase 1):** per-mob `maxHealth`, player `MaxHealth = BaseHealth × MaxHealthFactor`; overhead + HUD bars draw `health/maxHealth`; floating damage/heal/XP numbers render over mobs + players as **literal HP** (no more display-scale placeholder). The bottom-right HUD bars also show the absolute numbers as centered text: health `currentHP/maxHP`, XP `xpInLevel/xpForNextLevel` (within-level; wire `Character.xp_in_level`/`xp_for_next_level`; reads `0/needed` after level-up and after the death XP penalty). Damage auras stamp a per-hit VFX (slash for slow ticks, fire for fast — per-effect `hitStyle` override or cadence default); the old white damage flash is gone. Overhead health bars sit **below** the avatar (mobs + player in-world bar; the bottom-right HUD bar is separate). Unlock sources live: milestones (HealAura+Heal L2, SwiftPassive L3, NovaBurst L4, ImmolationAura+Ignite L5), kill drops (WildAura: SaberToothCat 20%/boss 100%; SlowAura: Mammoth 20%; ToughPassive: Dodo 5%). Skill points: earned per player level, spent/refunded freely in the spellbook panel, equipped skills scale live. All combat participants (incl. healers, ~10s window) get full XP on mob death. `XP <amount>` cheat for manual leveling. **Combinations (Phase 9) live:** maxing `DamageAura + HealAura` (L5 each) secretly unlocks **PaladinAura** (damage+heal two-effect aura); recipes are curated/secret/backend-only, discovered by hitting ingredient-level thresholds. **Resistances & damage tags live (item 11 Phase 2):** every damage effect carries string tags (`physical` default), mobs can declare base `factors.resistances`, `resist_aura`/`resist_passive` grant tag resistance (FireWard: fire ×0.6 to allies+self), and the `SKILL <name>` cheat grants any spellbook entry by name. **Stat variance live (item 11 Phase 3):** mob HP pools roll once at spawn (`factors.maxHealthVariance` percentage band), damage + heal amounts roll independently per hit (`variance` on the effect, rolled before mitigation); anything without an authored band stays exact. **Status-effect framework live (effect foundations Step 2):** `skills.Buffs` is the one per-entity buff/debuff store (resist + slow migrated in; dots are the first acting payload); `dot_aura`/`instant_dot` apply fire dots that keep ticking after the target leaves range — ImmolationAura (aura, single-target burn) and Ignite (burst, everyone in range, ~3 s) at milestone L5, damage riding the normal attribution/mitigation/floating-number paths with the fire hit VFX.
- **Deferred tech debt / known bugs:**
  - **FIXED — respawn now retains level + spellbook:** on death `sys/state.go` stashes both the progression *and* the whole `SkillComponent` (spellbook + loadout + active aura) keyed by client UUID (`carriedState`); re-join restores both via `SetProgression` + `SetSkillComponent`. Semi-permadeath removed except the existing partial-XP-within-level loss (`LoseCurrentLevelExperience` kept, by design). Pinned by `TestDeathRespawn_RetainsSpellbookAndProgression`.
  - Mob aura ring size is a frontend constant (`GraphicsConfig.mobs.*.damageAuraRadiusMeters`) duplicating the skill's effective radius — sync manually until mob radii are wire-driven (pressing once boss scripts switch auras).
  - **FIXED — `net_test.go` no longer hangs the suite:** `backend/pkg/berryhunter/net/net_test.go` (a manual `ListenAndServe` WebSocket smoke script, not a real test) now starts with `t.Skip`, so the full `go test ./...` runs and passes. The script is kept for manual debugging — remove the skip to run it explicitly.
  - **FIXED — equip level=1 gap:** the spellbook stores per-skill levels (`map[SkillID]int`) and `EquipSystem` equips at the stored level (Phase 7).
  - Frontend `Skills.ts` hardcodes skill ID → name, maxLevel *and* category, duplicating the backend registry — sync manually when skills change; revisit (wire or generated file) when the skill list grows.
  - **FIXED — dead character-variant code removed (2026-07-06):** the old Berryhunter variant system (`Character.variants`/`pickVariant()`/`hashCode(name)` — a no-op since only `player.svg` shipped) is gone. `Character` now preloads a single `Character.avatar` from `GraphicsConfig.character.file` (was `files: [...]`); the unused `hashCode` util and `static svg` field were deleted, along with 15 unreferenced `assets/characters/*.svg` (only `player.svg` remains). The future avatar selector (roadmap item 8) starts clean from here.
  - **Terrain "blue bleed" — background shows through the tiles (pre-existing Berryhunter rendering bug, observed 2026-07-05):** after some play time, with no clear trigger, the **lower and right edges** of the viewport turn a flat blue — the color of the layer *under* the tile map (the PixiJS stage/canvas background or a clear color), i.e. the ground tiles stop covering those regions. Almost certainly an **older Berryhunter issue**, unrelated to the Phase 9 / skill-system work (nothing in the aura path touches tile rendering). Likely a tilemap culling / viewport-extent bug: as the camera pans, the tiled ground layer isn't extended/re-tiled to fill the new edges (off-by-one in the visible-tile range, or the tile container not resized on viewport/zoom change), exposing the background. Suspects (frontend): the map/ground rendering under `frontend/src/features/` (tile grid build + camera follow), and any `renderer.backgroundColor`/stage clear. Repro is time/movement-dependent; not yet pinned. Low priority (cosmetic), but track it. See the attached screenshot in the 2026-07-05 session.
  - **FIXED — movement micro-stutter every ~30 s (fixed 2026-07-05, verified in-game):** while walking, the character was set back one tick's distance against the walk direction, exactly periodic (~30 s), scaling with movement speed (more visible with SwiftPassive). Root cause (input-starvation beat): the client sends inputs on its own free-running 33 ms JS timer (`Tock`, `INPUT_TICKRATE`) while the server consumes one input per 33 ms Go tick; ~0.1% clock drift starves the server of an input once per ~30 s → one tick without movement. **Fix (candidate (a), server-side hold):** `core/input.go` `PlayerInputSystem.pickInput` bridges a single starved tick with the last applied movement, stored as a **movement-only** copy in `lastMove map[uint64]*PlayerInput` and **consumed on use** (`delete`) so a disconnected client halts after one tick instead of sliding forever. The copy sets `ActiveAuraSlot: ActiveAuraSlotNoChange` and drops `CooldownActivations`, so a bridged tick never replays a one-shot aura switch or cooldown. Also removed the dead `lastBuf`/3-buffer-history plumbing (`updateInput`'s `last` param was never read). Pinned by `TestPickInput_BridgesOneStarvedTick`. Not scheduled: candidate (b) (client sends input on GameState receipt, killing the beat structurally) / (c) (full prediction+reconciliation) remain available if the hold ever proves insufficient.
  - Frontend FlatBuffers toolchain migrated to flatc v24.3.25 in a dedicated commit.
  - `-2` `active_aura_slot` deactivate sentinel is a workaround for FlatBuffers omitting the `-1` default (an explicit `-1` is indistinguishable from an absent field). Decided in Phase 5: it stays. Paired constants: `model.ActiveAuraSlotDeactivate` (Go) / `DEACTIVATE_AURA_SLOT` (InputMessage.ts).
  - ⚠️ Testing gotcha: `go:embed` patterns don't include subdirectories (`*.json **/*.json`!), and disk-based registry tests can't catch embed gaps — pinned by `pkg/api/skills/skills_test.go`. Before manual tests: `pkill berryhunterd`, rebuild, and check the boot log (`Loaded skill definitions count=17` as of effect foundations Step 2) — a stale server process silently masks new behavior.
  - **FIXED — `KILL` cheat no longer killed (found + fixed 2026-07-04, Block 2 testing):** one-shot zeroing of `Health` was reverted before death was detected. `KILL` sets `Health = 0` in `CommandSystem` (prio −50); `UpdateSystem` (also −50, runs after) regenerated any `Health != Max` via `updateVitalSigns`, bumping it to a tiny positive value the same tick, before `ConnectionStateSystem` (prio 10, `sys/state.go`) checked `Health == 0` next tick. **Fix:** `updateVitalSigns` now regenerates only when `0 < Health < Max` (0 = dead, no revive). Pinned by `TestUpdateVitalSigns_DeadPlayerDoesNotRegenerate`.
- **Doc map (`docs/`, naming: core docs unprefixed; `plan-` = execution plan/record per work item; `research-` = point-in-time investigation/assessment; `archive-` = resolved, kept for rationale):**
  - docs/gdd.md — game design truth: vision, mechanics intent, open design questions
  - docs/tdd.md — technical big picture: architecture, decided/open tech questions, risks
  - docs/roadmap.md — v1.0 scope + per-item status outside the skill system; prototype path (items 1, 2, 10, 11 ✓ — item 12 content pass is the remaining prototype gate)
  - docs/backlog.md — unscoped feature ideas with open-question catalogs
  - docs/architecture.md — runtime cost model, scaling limits, zones-as-Spaces & fluid transitions, hazard/encounter runtime cost
  - docs/plan-skill-system.md — skill system design + migration record (Phases 1–9, complete); combination system; wire protocol
  - docs/plan-block2-survival-removal.md — Block 2 (items 1+2) execution record, complete
  - docs/plan-item11-hp-resist-variance.md — absolute HP (✓), resistances/damage tags (✓), stat variance (Phase 3, open); decisions A1–A3, B1–B7
  - docs/plan-effect-foundations.md — effect-vocabulary scaling: decisions F1–F10 (stay Go, no scripting for effects; primitive-first growth) + the tackle-now sequence and candidate-effect cost map
  - docs/plan-world-zones.md — world & zones first slice (roadmap item 4 + placement/respawn half of item 7): in-game editor, rectangular single-Space world, server-authoritative zone.json (bounds/props/spawn points), resources demoted, movement-blocking occluders only; decisions A–D + six-chunk plan + pitfalls
  - docs/archive-scripting-audit.md + docs/archive-scripting-options.md — data-vs-Go audit and scripting/expression-layer options (decided 2026-07-07 → plan-effect-foundations.md)
  - docs/research-content-pipeline.md — designer-authoring pipeline gaps + preventive steps
  - docs/research-v1-readiness.md — prototype→live readiness assessment (ops/CI/observability gaps)
  - docs/archive-combo-questions.md — resolved Phase-9 combo question catalog (rationale record)


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

**Berryhunter** (repo name: aurahunter) is a multiplayer browser survival game. Players gather resources, craft items, manage vitals (health, satiety, temperature), and fight mobs. The repo has three main parts:

- `backend/` — Go game server (`berryhunterd`)
- `frontend/` — TypeScript/webpack browser client using PixiJS
- `api/` — Shared FlatBuffers schemas and JSON item/mob definitions

## Build & Run

### Backend (Go ≥ 1.22)

```bash
# One-time: copy config
cp backend/conf.local-windows.json backend/conf.json   # Windows
# or use backend/conf.default.json as a template

# Build
make -C backend build          # produces backend/berryhunterd

# Run (dev mode serves static frontend too)
cd backend && ./berryhunterd -dev

# Run without build (go run)
make -C backend dev
```

> **Gotcha:** after backend logic changes, rebuild the binary with `make -C backend build`.
> `go build ./...` compiles/type-checks packages but does **not** refresh `./berryhunterd`,
> so a running `-dev` server keeps executing stale code.

> **Content iteration:** `./berryhunterd -dev -content ../api` loads items/mobs/skills/recipes
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

The full suite runs and passes. (`backend/pkg/berryhunter/net/net_test.go` is a manual `ListenAndServe` smoke script that used to hang the suite; it is now skipped via `t.Skip` — remove the skip to run it explicitly.)

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

- `backend/cmd/berryhunterd/` — entrypoint; wires config, game, HTTP server
- `backend/pkg/berryhunter/core/` — `game.go` constructs the ECS world and registers all systems; `Loop()` ticks at ~30 FPS (33 ms/tick)
- `backend/pkg/berryhunter/sys/` — ECS systems: physics, mob AI, day/night cycle, decay, respawn, scoreboard, status effects, heater
- `backend/pkg/berryhunter/model/` — interfaces and concrete types for entities (player, mob, resource, placeable, spectator)
- `backend/pkg/berryhunter/items/` — item and mob definitions loaded from `api/items/` and `api/mobs/` JSON files at startup
- `backend/pkg/berryhunter/codec/` — FlatBuffers encode/decode for the WebSocket protocol
- `backend/pkg/berryhunter/phy/` — 2D physics (circle/AABB collision, spatial hashing)
- `backend/pkg/chieftain/` — separate HTTP service for scoreboard persistence (SQLite + optional GCP Pub/Sub)

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

This fork is being transformed into **"Aura"** — a top-down MMO. The Berryhunter
survival systems (vitals, crafting, temperature, hunger) will be removed or
heavily reduced. The core loop revolves around the aura system described below.

The codebase still says "Berryhunter" in many places. That is expected. Do not
rename or refactor naming proactively — focus on building new systems on top of
the existing foundation.

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

- **Always ask before modifying files or running commands.** Show the plan first.
- Keep changes small and confirm individually.
- For architectural decisions, propose options first — don't implement directly.
- Treat existing Berryhunter physics, collision, WebSocket/FlatBuffers protocol,
  and the chieftain scoreboard service as stable foundations. Extend, don't rewrite.
- When in doubt about game design intent, ask — don't infer from the codebase.


## Implementation Workflow

The skill system migration follows `docs/plan-skill-system.md`. When working on
that migration, reference the phase and step you're implementing in commit
messages and explanations (e.g. "Phase 1.2: skill registry").

### Plan before code

For any non-trivial change (new file, new system, refactor, multi-file edit):

1. State the plan in plain text first — what files will change, what gets added,
   what the test strategy is.
2. Wait for confirmation before writing.
3. Then write the code.

This applies even when running with auto-edits enabled. Showing the plan is not
the same as asking permission for each file — it's about making the reasoning
visible so it can be corrected before code is written.

### Sanity checks after every step

After completing a step, before declaring it done:
- Run `go build ./...` from `backend/`
- Run relevant `go test` for affected packages
- Report the output

Don't claim "done" without these checks.
