# Intermission Triage — 2026-07-18 (between C7 and C8)

**Status: DECIDED 2026-07-19 — all PO decisions resolved, nothing implemented
yet.** This doc records the PO's 22 intermission items (bugs, config fixes,
audits, design questions raised after playing the C1–C7 content), each
investigated against the current code, with effort estimates and a proposed
priority order. **No game code, config, or content was changed in the capture
session.** The PO resolved every open decision on 2026-07-19 (see §Decisions —
RESOLVED) and locked the execution sequence (see §Execution sequence). The
Tier-1 mini-chunk is the next execution session.

Why this doc and not `backlog.md`: the backlog is the *idea* parking lot
("nothing here is scoped"); these are scoped, estimated work items. Ideas that
emerge from them graduate to `backlog.md`/`roadmap.md` as usual; a pointer to
this doc was added to `backlog.md`.

Conventions: **all numbers are [PLACEHOLDER]** per the project rule. Effort:
**S** = one sitting, single seam; **M** = one focused session/chunk; **L** =
multi-session / new subsystem. Type: `bug` / `config` / `code` / `docs` /
`design` (needs a PO decision before work starts).

Related sources: agent-verified findings with file:line refs as of commit
`7271e7dc`. The skill inventory (item 8) lives in
`content-skill-inventory.md`. (Note: the "skill-system design doc" is
`plan-skill-system.md` — a `skill-system-design.md` does not exist.)

---

## 1. Heal aura must never kill its caster

**Type:** bug (design gap) + code · **Effort: S** — one function + TDD test.

**Problem:** the heal aura's self-cost can drive the caster to 0 HP and kill
them.

**Findings:** `applyHealAura` (`backend/pkg/berryhunter/sys/skills.go:617-701`)
heals targets first, then pays the self-cost (`skills.go:693-700`) — only if
someone was actually healed, which is already correct. The cost path
`vs.Health.Sub(selfHP)` (`model/vitals/vitals.go:68-74`) clamps at 0 but has
**no floor above 0**. At 1 HP the heal still fires, the cost is still paid,
the caster lands on exactly 0 and is detected dead on the *next* tick
(`sys/state.go:161-165` — the death scan runs at higher system priority than
the SkillSystem). God-mode is exempt. Edge cases found: the cost bypasses the
damage-number channel entirely (see item 2), and multi-effect auras
(PaladinAura/Vanguard/Warbanner heal components) run the same code path but
currently author `selfDamageHP: 0`, so a generic fix covers them for free.

**Proposed approach (per PO spec):** in `applyHealAura`, compute the scaled
self-cost up front; if `caster.Health − cost < 1`, clamp the cost so the
caster is left at exactly 1 HP; if the caster is already at 1 HP (cost fully
clamped), skip the entire effect for this tick — **no heal emitted, no cost
paid**. TDD: tests for "clamped to 1", "at 1 HP → no heal, no cost", and the
existing "no wounded ally → no cost" behavior stays pinned.

## 2. Heal aura economics: heal > cost, level = cheaper, cost visible

**Type:** code + **design (PO decision on scaling shape)** · **Effort: M** —
schema+loader+apply-site+UI number+tests across 5 touch points.

**Problem:** healing should net-positive (heal more than it costs), leveling
should reduce the cost rather than raise the output, and the self-cost must be
visible on the healer.

**Findings — current cost model** (`api/skills/heal-aura.json`, all
[PLACEHOLDER]): heal `12 + 6/level` @ 120-tick cadence; self-cost `18`
**flat** — at L1 the aura literally costs more than it heals (18 > 12), which
confirms the felt problem. The cost is deliberately static today: `HealParams`
has no per-level cost field (`skills/definition.go:322-327`, doc comment "the
self-cost stays static by design"), and the loader **hard-fails unknown JSON
keys** (`definition.go:787-805`) — so **a per-level cost curve is a schema +
loader change, not pure config**. It's a small, well-precedented one (the
`base + (level−1)×perLevel` machinery in `skills/scaling.go:10-12` is the
established pattern): (1) `selfDamageHPPerLevel` on `effectDef`, (2)
`HealParams.SelfDamageAt(level)`, (3) the `effectKeys` allowlist entry, (4)
the apply site `sys/skills.go:695`.

**Findings — cost visibility:** the cost mutates `vs.Health` directly and
records into **neither** the `DamageTaken` nor `HealReceived` floating-number
channel — invisible by omission, not by design. Direct precedent for the fix:
the self_heal cooldown's `NoteHealReceived` (`sys/skills.go:1159-1161`).
`backlog.md` item 6 already captures this exact idea plus its open questions
(distinct color for self-cost? caster-only visibility isn't possible without
per-recipient filtering — numbers are broadcast). This item absorbs backlog
item 6 for execution.

**PO decision — scaling shape** (values placeholder; also decide the L1
heal:cost ratio, since "heal > cost" should presumably hold from L1):

- **(a) Linear cost reduction** — `selfDamageHP + selfDamageHPPerLevel`
  (negative), e.g. 18 − 3/level. Matches the existing scaling machinery
  exactly; simplest to author; must clamp ≥ 0 and the last levels can feel
  samey.
- **(b) Diminishing returns (multiplicative)** — cost × factor^(level−1),
  e.g. −15%/level. Never reaches 0, every level feels meaningful; needs a new
  scaling shape (all current scaling is linear) → slightly more loader code.
- **(c) Breakpoint-based** — authored per-level cost array, e.g. drops at L3
  and L5. Most legible "milestone" feel and full authoring control; new schema
  shape (arrays, not base+perLevel), most validation code.

## 3 + 9. Hand-authoring manual: verify, fix drift, extend (merged)

**Type:** docs (+ one S code nicety) · **Effort: S–M** — pure documentation;
the audit is done, writing is what remains.

**Problem:** PO needs a trustworthy step-by-step manual for hand-authoring
everything (mobs, props, NPCs — placement, visuals, size, text), and item 9
asked whether the existing manual still matches the code.

**Findings — what is hand-authorable today (verified against code):** the
in-game zone editor (`?textures` URL param, `frontend/src/features/zone-editor/`)
has **8 modes** — terrain, props, mob spawns, campfires, dark areas, NPCs,
anchors, off — and everything round-trips through the zone JSON. Per-NPC the
editor edits: type label, position, sensor radius, `tooLowLine`, lore
`lines[]`, and the ordered teachings list (skill/requiredLevel/line) — i.e.
**all NPC text and teaching content is already editor-authorable**. Only the
NPC **sprite binding** (`entityType`) is JSON-only (deliberate;
`_ZoneEditorPanel.ts:828-832` round-trips it untouched). NPC **sprite size**
is *not* in zone data at all — the authored radius is the sensor radius; the
visual size lives in `Graphics.ts` config (`npc.go:44-47` pins a fixed wire
radius of 1.0). New NPC/mob/prop **art** is the 5-file path (enum append →
regen → SVG → render class → `gameObjectClasses` slot). Recommendation:
**keep the two manuals separate** (zone editor = placement; content authoring
= definitions/art) — they cover different halves cleanly; fix drift + add
cross-links instead of merging.

**Manual drift found (fix list):**
- **DRIFT-A (high):** both manuals reference a non-existent
  `api/zones/zone.json`; real files are `world.json` (live) +
  `proving-grounds.json`. A vestigial `'zone'` default also sits in
  `ZoneEditor.ts:103`.
- **DRIFT-B (high):** `manual-zone-editor.md` §6 claims proving-grounds is
  the only shipped zone — stale since the world zone shipped.
- **DRIFT-C/D (low):** stale "as of 2026-07-08" header; stale 4-mode comment
  in `_ZoneEditorPanel.ts`.
- **Gap:** neither manual has the "author an NPC end-to-end" walkthrough
  (place → text → teachings → sprite via entityType → size via Graphics.ts).
- **Code nicety (S, backlog-grade):** NPC `entityType` boot validation
  accepts *any* enum member (`world/zone.go:346-350`) though only
  Resource-backed sprites render correctly — a Mob-backed name passes boot
  and mis-renders. Add the Resource-backed check to the validator.

## 4. Content coverage audit: system → content

**Type:** audit (done) → gaps become content work (items 20 / C8) ·
**Effort:** the fixes ride item 20 + C8.

Every built system was traced into the **live world zone**. Verdict table
(details per row verified in code/content):

| System | In world-zone content | Verdict |
|---|---|---|
| damage_aura | DamageAura teach + ~15 mob auras | ✅ covered |
| heal_aura | HealAura milestone, BanditHeal, MedicCompanion, campfires | ✅ |
| shield_aura / overshield | Vanguard/Warbanner, RallyDrum, WarbannerTotem | ✅ |
| dot/poison (dot_aura, instant_dot) | VenomSpit, PoisonPool | ✅ |
| slow_aura | only as Warbanner sub-effect; standalone SlowAura is PG-drop-only, Suppression unreachable | ⚠️ partial |
| resist_passive | Antivenom, ThickHide drops | ✅ |
| resist_aura | only FireWard — **no source anywhere** | ❌ not present |
| stat_multiplier | Hardy, SwiftPassive, ToughPassive*(PG)*, BerserkerAura | ✅ |
| light_aura | Light drop, Torch teach, campfires | ✅ |
| spawn / summons | SummonCompanion, CallForAid, squad recipes | ✅ |
| taunt / detaunt | Taunt drop ✅; standalone detaunt (Fade) unreachable — only inside HoldTheLine | ⚠️ partial |
| crit | EliteBanditSlash (ReaperAura is PG-only) | ✅ via mob |
| lifesteal | EliteWolfBite, SpiderBite | ✅ |
| execute/berserker (player-side) | ReaperAura/BerserkerAura — Reaper PG-only, Berserker Bear drop | ⚠️ partial (execute effectively PG-only) |
| factions + friendlyToPlayers | 7 world factions, human_army friendly | ✅ |
| darkness & light | 33 dark areas + tunnel | ✅ |
| damage tags/resists/wildcard | 15 tagged effects, resist passives, `*` opt-in gates | ✅ |
| gated damage tags | Harvest, Pickaxe | ✅ |
| flee / wander / idle pacing | prey factions, world spawn params | ✅ |
| waypoint patrol | authored only in proving-grounds | ⚠️ partial |
| encounters/anchors/alerts | Orc Warlord + 4 anchors + broadcasts | ✅ |
| campfires/respawn | 2 campfires, dwell-bind | ✅ |
| recipes | 7 of 10 reachable in world (Barrier, Wildfire, Suppression are not — see item 20) | ⚠️ partial |
| milestone / drop / NPC unlocks | 4 milestones, ~15 drops, 6 teaching NPCs | ✅ |
| tooLow gating | Farmer | ✅ |
| player totem (SummonTotem) | unreachable, Totem mob never spawns | ❌ not present |
| tick_rate cooldowns | WarlordFrenzy (mob), Haste (player milestone) | ✅ |
| XP participation incl. healers | live + warlord credit | ✅ |

**The gap list — resist_aura, standalone slow/detaunt, execute, player totem,
3 unreachable recipes — is exactly the input to item 20 (new teacher NPCs) and
the C8 §11 placements.** One decision folded there: does every system *have*
to be world-reachable for v1, or are some (Fade, SummonTotem, NovaBurst)
acceptable post-v1 content?

## 5. Deterministic new-character spawn (west village campfire)

**Type:** code (small), data-driven per PO design note · **Effort: S** —
schema flag + selection filter + test.

**Problem:** new characters spawn at a **uniformly random campfire**
(`defaultSpawnPosition`, `sys/state.go:139-145`); `world.json` has two
campfires — west village `(-58.2, 24.0)` and Z2 village `(44.0, 10.5)` — so
~50% of fresh characters start in zone 2.

**Findings:** death-respawn is already correct (bound anchor via 3-s dwell,
`state.go:379-406`; fallback = the same random pick). Campfires carry only
`{x, y}` (`world/zone.go:116-119`) — no flags today.

**Proposed approach:** per the PO's design note (future selectable starting
locations), go **data-driven, not hardcoded**: add `"startingSpawn": true` to
the campfire schema (`world.Campfire` → `sys.CampfireAnchor` →
`berryhunterd.go:114-141` boot loop), have `defaultSpawnPosition` pick only
from flagged fires (random among them — which is exactly the future
multi-start behavior), hard-fail boot if a zone has campfires but none
flagged. Flag the west village fire in `world.json`. Optional: an editor
checkbox in campfire mode (S). The one-line "pick index 0" variant exists but
is rejected as hardcoding the thing the PO explicitly wants data-driven.

## 6. Call-for-Aid companions stack unreadably

**Type:** code + **design (pick the option)** · **Effort: S–M** depending on
option.

**Findings — root cause:** `updateFollow`
(`model/mob/companion.go:52-79`) steers each companion to a ring point
`ownerPos + dir·1.5` derived **only from its own bearing** — no formation
slot, no sibling awareness. And companions physically overlap by design:
`soldier-companion.json` collides only with statics/border (mask 17 —
player-like), never with other mobs. Spawn spreads them at random angles
(`sys/skills.go:1443`) but convergence collapses shared bearings onto one
point.

**Options (PO picks):**
- **(a) Formation offsets (recommended) — M.** Give each summon a formation
  index at spawn (thread a slot through `spawnSummon`) and offset the follow
  ring target by a per-slot angle (3 companions at 120° [PLACEHOLDER]).
  Deterministic, countable, zero physics risk.
- **(b) Mob-mob collision for companions — M, risky.** Layer/mask surgery;
  companions sit on the Player layer, so naive masks push the real player;
  dynamic-vs-dynamic push isn't wired for followers. Not recommended.
- **(c) Follow-target jitter — S, cosmetic.** Small per-companion wobble on
  the ring point; un-stacks visually but never guarantees a countable spread.

## 7. Aura type readability (VFX language)

**Type:** code + **design (PO picks the visual language)** · **Effort:**
player-side S–M (client-only); mob-side +M (needs a wire field).

**Findings — what exists:** exactly **two ring sprites** (red damageAura.svg,
green healAura.svg) and **three outcomes** — red, green, or both overlaid
("dual") — selected by hardcoded skill-ID checks in
`Character.setActiveSkill` (`Character.ts:290-301`). No tint hook exists on
injected SVGs, so per-type color today means more SVG assets (or adding a
tint path). **Players:** the wire already carries `active_skill_id`, so a
data-driven `skillId → ring style` registry in `Skills.ts` is a clean
client-only change. **Mobs:** the mob wire carries `aura_radius` but **not
which skill drives it** — every mob ring renders the red damage sprite
(`Mobs.ts:69-99`). Distinguishing *enemy* aura types (the PO's main ask)
requires a new wire byte (aura style or skill id) on the Mob table +
backend serialization — M, append-only schema change.

**Options (PO picks; can be combined):**
- **(a) Color by effect category** — one color per category (damage red, heal
  green, shield gold, dot purple, slow blue, light warm [ALL PLACEHOLDER]),
  identical for players and mobs. Cheapest fully-legible taxonomy; does not
  distinguish individual skills within a category.
- **(b) Color by damage type/theme, pattern by category** — fire orange,
  poison green, physical grey…; ring pattern (solid/dashed/double) encodes
  damage/heal/utility. Richer identity, more assets, and color count grows
  with the tag list — readability risk.
- **(c) Category color + per-skill pattern ring** — keep (a)'s base colors,
  add a second decorative ring (notches/dashes/runes) per *notable* skill
  (bosses, signature auras). Most expressive, most art + code.

## 8. Generated skill inventory doc

**Type:** docs · **Effort: done** — see **`content-skill-inventory.md`**
(created this session).

Full table of all 44 player skills — id, name, category, values, cooldowns,
and acquisition source — generated from `api/skills/*.json` + drop/teaching/
recipe/milestone cross-references, all values marked placeholder. The doc
header contains the regeneration recipe (a ~15-line script over the JSON;
cheap to re-run any time). Regenerate after any content chunk.

## 10. Sacrifice loop in v1 — cost breakdown

**Type:** design (scope decision) + L code · **Effort: L overall** —
dominated by missing persistence.

**Findings — exists vs missing:**

| Piece | Status | Evidence |
|---|---|---|
| Persistent account identity | **missing entirely** | zero DB/store deps in `go.mod`; join is name-only (`codec/client_message.go:60-65`); the only "accounts" file is client-side localStorage (`Account.ts`) |
| Max-level detection | trivial gap | level + `Curve.MaxLevel` exist; the comparison/event doesn't (S) |
| Account-wide unlock storage | missing | unlocks are per-character in-memory (`skills/component.go:377`); depends on identity+store (L on top of persistence) |
| Sacrifice/retire flow | missing | no delete-character-and-bank-reward path (M) |
| UI surface | missing, path exists | C6 AlertBanner + spellbook-diff unlock banners are reusable (M) |
| Reward catalog + memorial | missing | pure content once the above exist (GDD §5) |

**The blocker is foundational:** accounts & persistence (execution-order step
"Accounts & persistence", TDD §4.3/4.4 — DB choice still open). The loop
itself is cheap once that lands. **Scope conflict to resolve explicitly:** GDD
§11 currently lists character sacrifice as *"not in v1.0 (nice to have)"* —
PO now wants it in the first version. If confirmed, GDD §11 + roadmap need
amending, and it slots **after** the accounts step as its first consumer.

## 11. Harvest taught by the first NPC, not a spawn freebie

**Type:** code (small) + content + micro-design · **Effort: S** — one
function, two tests, one zone edit.

**Findings:** fresh spawn = Harvest equipped-not-active, hard-required by
`initializePlayerSkills` (`model/player/player.go:733-743`; construction
*fails* if Harvest is missing, pinned by two tests). **The client and wire
already tolerate a zero-skill player** (empty spellbook `[]`, slots 0 = empty,
active aura −1 — all exercised states), so no frontend work. Teach-on-approach
with no level gate is live (Hermit/Dog/Miner pattern). **Chicken-and-egg
found:** the Farmer's gate line is "pull some turnips first" — but pulling
turnips *requires* Harvest. So Harvest must be the Farmer's **first, ungated
teaching** (teachings are ordered, so Harvest-then-DamageAura@L2 works in one
NPC), or a separate greeter NPC teaches it.

**Proposed approach:** strip the equip/discover from
`initializePlayerSkills` (spawn truly empty), rewrite the two pinned tests,
add Harvest as the Farmer's first ungated teaching in `world.json`.
**Micro-decision for PO:** Farmer teaches it vs. a new dedicated greeter NPC
at the spawn fire.

## 12. Legacy vs new content separation

**Type:** audit (done) + **design (PO picks the mechanism)** · **Effort:**
S–M to execute once picked; natural home = rebrand/cleanup step 7.

**Findings — current organization:** one flat registry per kind under `api/`
(75 skills incl. 31 mob skills, 41 mobs, 10 recipes, 10 factions, 5 props,
2 zones). Only **one zone loads at boot** (`game.zone`, default `world`);
proving-grounds needs `-zone proving-grounds`. Traced reachability:

- **World ("new"):** 29 mobs, 29 player skills, 25 mob skills, 7 recipes,
  7 factions, all 5 props.
- **Proving-grounds-only ("legacy"):** 10 mobs (Mammoth/AngryMammoth/
  SaberToothCat/Dodo/Rabbit/Healer/Brazier/Proving*), 5 player skills
  (SlowAura, ToughPassive, WildAura, Revive, ReaperAura), 6 mob skills,
  3 factions (predator/prey/tusker).
- **Dead (reachable from NEITHER zone):** mob `Totem`; player skills `Fade`,
  `FireWard`, `NovaBurst`, `Rejuvenation`, `SummonTotem`, `Ignite`,
  `ImmolationAura` (orphans) + recipe results `Barrier`, `Wildfire`,
  `Suppression` (ingredients not co-reachable in the world zone).
  **⚠️ Do NOT delete-list the orphans yet — most are item-20 placement
  candidates** (C8 §11 already earmarks Ignite/Immolation/SlowAura/Tough).
- **Berryhunter `api/items/`** (wood/stone/iron/…): loaded because the item
  registry is a hard core dependency, but **referenced by zero gameplay
  content** (mobs drop skills, not items; the `drops[].item` code path has no
  users). True legacy; deletable only together with the code dependency —
  that's the step-7 rebrand sweep.

**Options (PO picks):**
- **(a) Directory split** — `api/mobs/legacy/` etc. Physically explicit and
  self-documenting; needs loader recursion per registry (skills already
  recurse into `mobs/`, others unverified) and moves files (churny diffs).
- **(b) `"legacy": true` tag on defs** — in-file, loader-visible (could later
  warn on world-zone references to legacy content); needs the field added to
  each schema (loaders vary in strictness) and is invisible at directory
  level.
- **(c) Manifest doc + naming convention** — a `content-legacy.md` list plus
  `_comment` headers; zero code risk, weakest enforcement (drifts silently).

**Pins a reorg touches:** skills=75 (`skills/registry_test.go:141`),
recipes=10 (`recipe_test.go:163` + net cases), encounter tests pin mob names.

## 13. Campfire heal: percent of max HP

**Type:** code (small schema lift) · **Effort: S–M** — one field + apply-site
branch + test. Balance value lands in C8 (regen/downtime settlement).

**Findings:** the campfire is a mob casting `CampfireAura`
(`api/skills/mobs/campfire-aura.json`, id 109): flat `healHP: 12` per 60-tick
(~2 s) tick, uncapped targets — content JSON, not conf.json. But **percent-of-
max does not exist for `heal_aura`**: only the self_heal cooldown has
`FractionOfMax` (`definition.go:338-346`). So this is a small schema+code
lift, not config: add `healFractionOfMax` (+PerLevel) to `HealParams`,
validate "flat XOR fraction", read the target's MaxHealth in `applyHealAura`.
The percentage itself is **PO's placeholder to set** (reference: 12 HP on the
L1 100-HP pool = 12%/tick today [PLACEHOLDER]). Side benefit: the field is
then available to any future %-based heal aura.

## 14. Full health on respawn

**Type:** bug (subtle) · **Effort: S** — one line + test.

**Findings:** respawn health is *implicitly* full: `player.New` stamps
`Health = MaxHealth()` at construction (`model/player/player.go:68`). **But**
`tryRespawn` restores the carried skills *after* construction
(`sys/state.go:195-197`), so a player with +maxHealth passives (Hardy)
respawns at the *base* pool (100 × f), i.e. slightly below their skilled max.
The Revive path already does it right — sets health *after* restoring
progression (`state.go:358-360`). **Fix:** re-stamp
`Health = MaxHealth()` after `SetSkillComponent` in `tryRespawn` (or reorder),
+ a test with a Hardy-carrying respawner.

## 15. Mob tier visible on the icon

**Type:** code + **design (PO picks the marker)** · **Effort: M** — every
option needs the client to learn tier first.

**Findings:** the only tier differentiation today is **hand-drawn separate
SVGs** (eliteWolf, eliteBandit, orcWarlord). No tint/badge/border/label
machinery exists on the icon path (`createInjectedSVG` has no tint hook), and
**tier is not on the wire** — the client knows only `EntityType`. So every
option shares a prerequisite: either a new tier byte on the Mob wire table
(append-only fbs + codec, S–M, clean) or a hand-synced client
`EntityType → tier` map (S, but exactly the Skills.ts-style sync debt).
Recommend the wire byte. Bonus finding: `angryMammoth` renders `demon.svg` as
a placeholder (`Graphics.ts:95-96`).

**Options (PO picks):**
- **(a) Frame ring** — programmatic colored ring around the portrait circle
  (none/silver/gold for normal/elite/boss [PLACEHOLDER]). Fits the
  circle-icon style; no per-mob art; S once tier is client-side.
- **(b) Badge overlay** — small icon (chevron/skull) at the circle's edge.
  Reads at glance, one shared asset per tier; slightly busier composition.
- **(c) Health-bar treatment** — elite/boss border color/height on the
  existing health bar. Cheapest surface, but invisible until damaged/close;
  weakest as a *pre-engage* signal.

## 16. Icon style rule: circle portraits, never rotated

**Type:** audit (done) + code (S) + docs (S) · **Effort: S** for both fixes.

**Findings — the audit inverts the assumption:** all 41 creature/humanoid
SVGs (mobs + NPCs) are **already portrait-style** — front-facing busts or
face-in-circle, matching the sabertooth/dodo/mammoth references; zero
top-down creature models were found (the only "from above" art is inanimate
props/hazards — pools, braziers, barricades — where no portrait applies; full
per-file table in the audit agent report, reproducible on demand). **The real
violation is runtime rotation:** `Mob.setRotation` (`Mobs.ts:121-128`) spins
the portrait to the mob's wire heading — the code comment *says* "keep facing
down" but doesn't do it — so moving mobs visually rotate their faces.
Non-local player characters are already correctly pinned
(`Character.ts:169-175` forces fixed rotation); **the local player's own
avatar does rotate** — presumably the same violation, PO to confirm.

**The rule is documented nowhere:** GDD §10 has "portraits for players/NPCs"
and "fully top-down" side by side with the reconciliation (world top-down,
entities portrait icons) only implicit; `manual-content-authoring.md` §4 (the
place a mob author looks) has zero style guidance.

**Proposed approach:** (1) stop applying wire rotation to mob sprites (S —
mirror the Character fix); PO confirms whether the local player avatar is
included. (2) Document the rule in `manual-content-authoring.md` §4 (checklist:
circle silhouette, front-facing portrait, no directionality, reference files)
+ one clarifying sentence in GDD §10. (3) Retire the `angryMammoth →
demon.svg` placeholder while there (its real portrait SVG exists, unused).

## 17. WARP cheat sheet

**Type:** reference (done). All coordinates derived from the **current**
`api/zones/world.json` (spawn clusters, darkAreas, campfires, anchors) —
none guessed. `WARP` takes **world coordinate × 120** as integers
(`sys/cmd/cmd.go:56-81`; integer division truncates fractions).

| Location | World coord | Derived from | Command |
|---|---|---|---|
| Turnip field (W farm) | ≈ (−50, 27) | Turnip spawn cluster centroid; Farmer NPC; W campfire | `WARP -6000 3240` |
| Dark forest Z1 (SW) | ≈ (−56, −18) | SW darkAreas 3×3 cluster center; EliteWolf spawn | `WARP -6720 -2160` |
| Dark forest Z2 / bandit camp | ≈ (49, −22) | E darkAreas cluster; EliteBandit spawn (50, −24.2) | `WARP 5880 -2640` |
| Zone-2 village | ≈ (44, 11) | Village campfire (44, 10.5); VillageHealer NPC | `WARP 5280 1320` |
| Dark tunnel (center) | ≈ (0, −31) | darkAreas corridor row y=−31.2, x −18…+16 | `WARP 0 -3720` |
| Dark tunnel (W mouth) | ≈ (−18, −31) | lit staging area at the west end | `WARP -2160 -3720` |
| Boss (Orc Warlord) | (26, 30.5) | named anchor `warlord-home` | `WARP 3120 3660` |

## 18. Stronger Z2 wildlife — new mobs or editor tier?

**Type:** answered question → content work · **Effort: S per variant** (JSON
only, zero art/wire work).

**Findings:** tier/level is **baked into the mob definition** — `tier` +
`curveLevel` + `factors.baseMaxHealth` (`items/mobs/definitions.go:169-176`,
`261, 342-343`; `maxHealth = base × f(curveLevel)`, `f = 1.12^(L−1)`). The
zone spawn entry carries **movement params only** — no power/tier knob exists
per placement, so the editor cannot place "a stronger wolf". **The sanctioned
workflow** (shipped precedent: `wolf.json` cL2 vs `elite-wolf.json` cL5):
author a variant def with a higher `curveLevel` and **reuse the existing art
via the `entityType` key** — no schema, no wire, no frontend; then place it
in the editor like any mob. Balance note: bump `curveLevel` for "same mob,
higher tier" (scale-invariant per Philosophy A); touch `baseMaxHealth`/skills
only when the *feel* should change — and remember drop chances don't scale
with cL, so a high-cL copy of a dropping mob is an XP/drop-rate distortion to
check in C8. **Optional future lift (only if variant-def authoring annoys):**
a per-spawn `curveLevel` override (schema+editor+loader, M) — not needed now.

## 19. Bandit aura radii too large

**Type:** config (pure JSON) · **Effort: S** — two numbers + restart
(`-content ../api`; rebuild embeds later).

**Findings:** healer `api/skills/mobs/bandit-heal.json` `radius: 2.5`; ranged
`api/skills/mobs/bandit-volley.json` `radius: 5.0` (`selector: "all"`,
uncapped). Player-aura context: 1.0–2.0 (heal 1.0, damage 1.0, reaper 2.0,
LRS 2.6). **Proposed placeholders for PO confirmation:** healer 2.5 →
**~1.2** [PLACEHOLDER] ("significantly smaller" — just above player heal
range); ranged 5.0 → **~3.5** [PLACEHOLDER] ("somewhat smaller" — still
outranges LRS 2.6 to keep the stand-behind-the-line identity). Not changed
this session per scope.

## 20. New teacher NPCs for unplaced skills

**Type:** content prep + **design (which skill gets which source)** ·
**Effort: S per NPC** with reused sprites (pure content); 5-file path per NPC
needing new art.

**Findings — the input list (from `content-skill-inventory.md`):**

- **No source at all (cheat-only), 7:** ImmolationAura, Ignite, NovaBurst,
  SummonTotem, Fade, Rejuvenation, FireWard.
- **Source only in proving-grounds (unreachable in the live world), 5:**
  SlowAura, ToughPassive, WildAura (drops), Revive, ReaperAura (Sage
  teachings).
- **Knock-on recipe repairs:** placing Ignite+ImmolationAura fixes
  **Wildfire** (currently un-craftable — both ingredients cheat-only);
  SlowAura fixes **Suppression**; ToughPassive fixes **Barrier**. C8 §11
  already earmarks these four placements; this item is the vehicle.
- NPC-taught today: only 10 of 44 skills (6 in world). Teach-on-approach,
  level gates, and ordered teachings are all live (item 3); reusing existing
  sprites makes each NPC zero-code.

**Proposed approach:** PO assigns each listed skill a source (teacher NPC /
mob drop / milestone / deliberately post-v1 — item 4's gaps say Fade,
NovaBurst, SummonTotem *could* stay unplaced by choice). Then author
placeholder NPCs (name, spot, placeholder lines, reused sprite, [PLACEHOLDER]
gates) for the teacher-assigned ones — content-only, no code. Not created
yet per scope.

## 21. `null.split` first-run pageerror

**Type:** bug investigation (partially answered; needs one repro session) ·
**Effort: S–M** to pin + fix once reproduced.

**Findings:** grep of all `.split(` sites in `frontend/src` shows **none
consumes a localStorage value** — the classic empty-storage theory doesn't
hold in our own code. Two leads:
1. **Most likely: cold-HTTP-cache load-order race.** A fresh build emits new
   hashed asset URLs → first load runs with an empty browser cache and
   different fetch ordering; re-runs hit the disk cache and the race closes.
   The throwing frame is then in vendor/generated code (PixiJS, flatbuffers),
   not our sources. No service worker exists — it's the plain browser cache.
2. **Genuine latent bug found (fix regardless, S):** `Items.ts:31` —
   `item.placeable.layer.split('.')` guarded by `isDefined()`, but
   `isDefined(null)` returns **true** (`Utils.ts:226-232` only checks
   `undefined`), so a JSON `null` layer would `null.split`. Deterministic
   every run though, so it can't alone explain "gone on re-runs".

**Deterministic repro protocol:** fresh `make build` → open in a **fresh
incognito window** (empty cache + empty storage) with DevTools "pause on
exceptions" → capture the stack with source maps. Isolate: clear only
localStorage (storage theory) vs only HTTP cache (race theory). Fix follows
the pinned frame.

## 22. Skill ID naming consistency

**Type:** audit (done) + **design (pick the convention)** · **Effort: S–M**
— mechanical rename across content JSON + Go tests; **no wire/save/frontend
breakage possible.**

**Findings:** the PO's example "`Hardy` → `Hardy Passive`" (with space) does
**not** exist — the JSON name is `Hardy` and the frontend shows `Hardy`; all
44 JSON `name` strings are space-free PascalCase. The *real* inconsistencies:
- **`Passive` suffix arbitrary:** SwiftPassive/ToughPassive vs Hardy/
  ThickHide/Antivenom/Torch (same category, no suffix).
- **`Aura` suffix arbitrary:** 8 auras carry it, 12 don't (Vanguard,
  Spearhead, Harvest, …).
- **`Heal` vs `HealAura`:** two near-identical names for different skills —
  a lookup/cheat-argument hazard.
- **Display names diverge freely** from JSON names in `Skills.ts` (keyed by
  numeric id): "Slow", "Swift", "Tough", "Light Aura", "Damage-Burst", …

**Rename blast radius (verified):** JSON `name` is the registry key. A rename
touches: the skill file, mob `unlocks[]`/`skills[]` refs, zone `teachings[]`,
recipes, `milestone-unlocks.json`, the one hardcoded `"Harvest"` literal
(`player.go:734`), and **dozens of name-pinned Go tests**. It does **not**
touch: the FlatBuffers wire (numeric ids only), the frontend maps (numeric
ids), sim-harness presets (derived from the registry), or save data (**none
exists** — pre-persistence is the cheapest moment to ever do this).

**Convention options (PO picks):**
- **(a) Bare thematic names, no category suffix** (recommended): Swift,
  Tough, category lives in the `category` field; requires resolving the
  Heal/HealAura collision by renaming one (e.g. the cooldown). Cleanest
  long-term, ~6-8 renames.
- **(b) Mandatory category suffix everywhere:** self-describing ids
  (VanguardAura, SwiftPassive, HealCooldown) but verbose and touches ~20
  names.
- **(c) Freeze as-is, fix only the collision + display-name table:** minimum
  churn, accepts the historical mix.

---

## Priority proposal

**Tier 0 — done in this session (docs/reference):**
8 (skill inventory doc) · 17 (warp sheet) · the audits inside 4, 12, 16, 22.

**Tier 1 — quick wins, small enough to do right now** (each S, independent,
zero design risk; could ship as one "intermission fixes" mini-chunk with the
usual TDD + verify pass):
1. **19** bandit radii (pure JSON — needs only the placeholder values
   confirmed)
2. **1** heal self-kill clamp (TDD, one function)
3. **14** respawn full-health re-stamp (one line + test)
4. **16-code** freeze mob icon rotation (one seam; big readability payoff)
5. **5** starting-spawn flag (small schema + filter)
6. **3/9** manual drift fixes + NPC authoring walkthrough (pure docs)
7. **21-partial** the `Items.ts` `isDefined(null)` fix (S, regardless of the
   real repro)

**Tier 2 — needs a PO decision first, then one focused session each:**
- **2** heal economics (pick scaling shape → M) — pairs naturally with C8
  balance.
- **11** harvest via Farmer (pick teacher → S).
- **6** companion spread (pick option → S–M).
- **20** teacher NPCs for unplaced skills (assign sources → content S each)
  — **feeds C8 directly** (§11 placements + recipe repairs); decide before
  C8 starts.
- **13** campfire %-heal (S–M) — value belongs to C8's regen/downtime
  settlement, the lift can land any time.
- **18** Z2 wildlife variants (pure content, C8-adjacent balance).

**Tier 3 — scheduled elsewhere / can wait:**
- **7** aura VFX language + **15** tier markers: decide the languages now if
  desired; execution is a coherent "combat readability" session (client
  registry + one wire byte) — after C8 or as its own mini-chunk.
- **21** null.split repro session (annoying, not blocking).
- **22** ID renames + **12** legacy split: both are exactly the
  **step-7 rebrand/cleanup** shape — decide conventions now, execute there
  (and definitely before persistence ever exists).
- **10** sacrifice loop: blocked on accounts/persistence; needs the GDD §11
  scope amendment decision now, build later.

## Decisions — RESOLVED (PO, 2026-07-19)

| # | Ruling |
|---|---|
| 2 | **(a) Linear cost reduction** — `selfDamageHP + selfDamageHPPerLevel` (negative), clamp ≥ 0; heal > cost must hold from L1 (values [PLACEHOLDER]) |
| 5 | **Data-driven `startingSpawn` flag** confirmed (random among flagged fires; boot hard-fail if campfires exist but none flagged) |
| 6 | **(c) Follow-target jitter** — S, cosmetic un-stack; formation offsets NOT chosen |
| 7 | **(a) Color by effect category** (damage red, heal green, shield gold, dot purple, slow blue, light warm [ALL PLACEHOLDER]), identical players+mobs; **mob-side wire byte YES** |
| 11 | **Farmer's first ungated teaching** (ordered: Harvest ungated → DamageAura@L2); no greeter NPC |
| 12 | **(b) `legacy: true` tag** on defs; execute at step-7 rebrand |
| 13 | Lift lands pre-C8; the % value itself is C8's regen/downtime settlement (unchanged) |
| 15 | **(a) Frame ring** (none/silver/gold normal/elite/boss [PLACEHOLDER]); **tier wire byte** (not a client map) |
| 16 | **YES — local player avatar included**; portraits never rotate, anywhere |
| 19 | Healer 2.5 → **~1.0** (PO: smaller than the proposed 1.2 — exactly player heal range); ranged volley 5.0 → **~3.5** as proposed [both PLACEHOLDER] |
| 20 | See the source-assignment table below |
| 22 | **(a) Bare thematic names** (Swift, Tough, …; resolve Heal/HealAura by renaming one); execute at step-7 rebrand |
| 10 | **YES — sacrifice loop pulled into v1 scope.** GDD §11 + roadmap need amending; slots after the accounts/persistence step as its first consumer |
| — | **Tier-1 mini-chunk approved as the next execution session, item 11 included** |

### Item 20 — source assignments (PO, 2026-07-19)

| Skill | Ruling |
|---|---|
| Ignite + ImmolationAura | **New fire-teacher NPC** (Z2 dark-forest/brazier area), ordered teachings Ignite → ImmolationAura → fixes **Wildfire** |
| SlowAura | **Drop on an existing world mob** (kiter-ish candidate, picked in-session) → fixes **Suppression** |
| ToughPassive | **Drop on an existing world mob** (tanky candidate, picked in-session) → fixes **Barrier** |
| FireWard | **Post-v1** (resist_aura stays deliberately unexercised in the live world) |
| Revive | **Port to world** — teacher NPC, support theme (VillageHealer is the natural fit → closes its §11-OPEN purpose) |
| ReaperAura | **Port to world** — teacher or elite drop, picked in-session |
| WildAura | **Stays PG-only** for v1 |
| Fade | **Gets a v1 source** (stealth/kiter theme, picked in-session) |
| NovaBurst | **Gets a v1 source** (picked in-session) |
| SummonTotem | **Gets a v1 source** — note: also needs the Totem mob to actually spawn somewhere |
| Rejuvenation | **Post-v1** |

## Execution sequence (locked 2026-07-19)

1. **Session ① — "Intermission fixes" mini-chunk** — ✅ **DONE 2026-07-19**
   (one session; automated in-game verify PASS — pending the PO's own in-game
   pass + commit). All items below landed; `go build` + full suite + `-race`
   green, boot clean (startingSpawn validation passes), headless browser PASS
   (west-fire spawn, empty spellbook, Farmer teaches Harvest, avatar rotation
   pinned, 0 client errors on re-run). The item-3/9 *code* niceties (DRIFT-D
   comment, vestigial `'zone'` default → `'world'`, Resource-backed NPC
   entityType validator) were also done this session per PO. Items: **19**
   (healer ~1.0 / volley ~3.5) ·
   **1** heal self-kill
   clamp · **14** respawn re-stamp · **16-code** rotation freeze incl. local
   avatar (+ retire the angryMammoth→demon placeholder) · **5** startingSpawn
   flag · **11** Harvest via Farmer (strip spawn freebie) · **21-partial**
   `Items.ts` `isDefined(null)` fix · **3/9** manual drift fixes + NPC
   walkthrough · GDD §11 + roadmap amendment for item 10. TDD + verify pass.
2. **Session ② — pre-C8 lifts + content** (own chat, **PO directive: run with
   ultracode**): item **2** heal-cost linear scaling (schema+loader+apply+UI
   number) · **13** campfire `healFractionOfMax` lift (value stays C8) ·
   **6** companion jitter · **18** Z2 wildlife variant defs · **20**
   placements (fire-teacher NPC, SlowAura/ToughPassive/Fade/NovaBurst/
   SummonTotem sources, Revive/Reaper ports) — un-breaking Wildfire/
   Suppression/Barrier **before** C8 balances them.
3. **Session ③ — C8** per `plan-content-zones12.md` §13, now pure
   tuning/guardrails on final schemas with all recipes reachable.
4. **Post-C8 — "combat readability" session:** items **7 + 15** (category
   ring colors + tier frame ring; two append-only Mob-table wire bytes).
5. **Step-7 rebrand:** items **22** (bare-name renames) + **12**
   (`legacy: true` tags). **Persistence step:** item **10** sacrifice loop
   (first consumer). **Anytime/annoying:** **21** full repro session.
