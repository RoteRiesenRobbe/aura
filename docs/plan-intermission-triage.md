# Intermission Triage — 2026-07-18 (between C7 and C8)

**Status: DECIDED 2026-07-19, LARGELY EXECUTED — partially open.** Sessions ①
and ② landed 2026-07-19 (`2c155a68`, `dad7c42d`), followed by the crit rework
v2, the night-readability fix (`6afbee84`), and the wolf-line drop reshuffle
(`f9a64db5`) — see §Execution sequence for the per-item state. **Still open:**
combat readability (items 7 + 15), item 10 sacrifice loop (waits on
persistence), and item 21's `null.split` repro. Items 12 (legacy separation)
and 22 (skill naming) were executed as step-7 A.5/A.6 (`d1acf28d`,
`24806352`). Separately, `FireWard` still has no world unlock source — a
pre-existing gap inherited from roadmap item 12, not a triage item.

This doc records the PO's 22 intermission items (bugs, config fixes,
audits, design questions raised after playing the C1–C7 content), each
investigated against the current code, with effort estimates and a proposed
priority order. **No game code, config, or content was changed in the capture
session.** The PO resolved every open decision on 2026-07-19 (see §Decisions —
RESOLVED) and locked the execution sequence (see §Execution sequence). *(The
capture-session framing above is historical — execution began 2026-07-19 with
the Tier-1 mini-chunk; see the status banner for where things stand now.)*

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

**Findings:** `applyHealAura` (`backend/pkg/aura/sys/skills.go:617-701`)
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
`aurad.go:114-141` boot loop), have `defaultSpawnPosition` pick only
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

**2026-07-21 evidence (night-invisibility session):** fired 3× on the *first*
run in a fresh headless-chromium profile (empty cache — consistent with the
cold-cache theory) and left the entire canvas frozen black for that session;
all subsequent runs in the same profile were clean. Still needs the pinned
stack from the repro protocol above.

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
   (one session; **PO-verified in-game, committed `2c155a68`** to main per PO
   directive, no branch). All items below landed; `go build` + full suite + `-race`
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
2. **Session ② — pre-C8 lifts + content** — ✅ **DONE 2026-07-19** (one session,
   ran with ultracode; **PO-verified in-game, committed `dad7c42d`** to main,
   no branch per PO). **Code lifts (TDD):** item **2** heal self-cost per-level
   curve — `HealParams.SelfDamageHPPerLevel` + `SelfDamageAt()` (clamp ≥0), raw
   `effectDef` field + `effectKeys[HealAura]` allowlist + apply-site
   `sys/skills.go`; `heal-aura.json` `10 −2/level` ⇒ heal > cost from L1. Item
   **13** campfire percent-of-max heal — `HealParams.FractionOfMax(+PerLevel)` +
   `FractionAt()`, per-*target* `MaxHealth()` in `applyHealAura` (no powerScale,
   mirrors self_heal), flat-XOR-fraction validation; `campfire-aura.json`
   `healFractionOfMax:0.12` (value stays C8). Item **6** companion hold jitter —
   deterministic id-hashed **angular** offset (rotates the bearing, preserves the
   radius; sim-safe), 2 follow tests re-pinned + 1 new. **Content (item 20):**
   SlowAura→BanditRanged drop, ReaperAura→EliteWolf drop, Fade→Bandit drop;
   **ToughPassive→new Troll mob** (elite cL11, own art, `troll` faction,
   TrollSmash); **NovaBurst→new BanditPyromancer mob** (cL6, own art, medium-range
   fire DoT `EmberAura`); Ignite+ImmolationAura→new **Emberkeeper** NPC;
   Revive→VillageHealer teaching; SummonTotem→new **Shaman** NPC; item **18**
   DireWolf + DireBear Z2 variants (entityType art-reuse). **⇒ Wildfire /
   Suppression / Barrier now craftable.** Two new mobs = full 6-file art path
   (enum Troll=60/BanditPyromancer=61 + regen, Graphics.ts/Mobs.ts/
   gameObjectClasses + 2 SVGs); new mob skills TrollSmash 132 + EmberAura 133,
   registry pin 75→**77**. **Verified:** build + full suite + `-race` green; boot
   77 skills/13 factions/44 mobs/10 recipes/620 props/198 spawns/2 campfires/12
   npcs, 0 panics; browser (after camera-snap fix `b085452d`) — new mob sprites
   render, Emberkeeper teaches Ignite, 0 client errors. **PO note:** RNG drops
   liked as-is, "should be the default for most" (revisit in C8's drop-rate pass).
3. **Session ③ — C8** per `plan-content-zones12.md` §13, now pure
   tuning/guardrails on final schemas with all recipes reachable.
4. **Post-C8 — "combat readability" session:** items **7 + 15** (category
   ring colors + tier frame ring; two append-only Mob-table wire bytes).
5. **Step-7 rebrand:** items **22** (bare-name renames) + **12**
   (`legacy: true` tags). **Persistence step:** item **10** sacrifice loop
   (first consumer). **Anytime/annoying:** **21** full repro session.

## Night-readability fix (ad-hoc session, 2026-07-21)

**Night-invisibility bug — INVESTIGATED + FIXED 2026-07-21, PO-VERIFIED
IN-GAME 2026-07-21 (full night played), committed `6afbee84`.**

**Report:** PO screenshots — "damage aura active + night → my character is
invisible; ended when it turned day."

**Root cause (not an engine bug):** the DayCycle night tint is a
`ColorMatrixFilter` (flood 107/131/185 + luma greyscale) applied to a
**hand-listed** set of containers in `Game.ts` that predated the content
pass: `characters` was tinted, but every content-pass mob layer (wildlife,
healer, companion, campfireMob, turnip, brazier, totem, rabbit) silently
skipped the filter. At full night the 0.9 *multiplicative* flood crushed the
dark avatar + name + HP bar to near-black while the surrounding world stayed
bright → reads as "my character vanished". The aura correlation was a
day/night confound (the ring in the night screenshot was the player's own
tinted damage ring blending under the campfire's unfiltered glow).
Secondary finding: the mob layers rendered **above** `characters`, so
campfire art fully covered a player standing on it — even at day.

**Fix (frontend-only, no wire, commit `6afbee84`):**
- `Game.ts` — night-filter list is now **derived**: every layer minus an
  explicit exempt set (campfire placeable + campfireMob + brazier as light
  sources; darkness overlay per zones-plan §6.5; namePlates/chatMessages/
  floatingNumbers/vitalSignIndicators overlays). New layers are
  night-correct by default. Mob-layer block moved **under** `characters`.
- `DayCycle.ts` — `FLOOD_OPACITY` 0.9 → **0.6 [PLACEHOLDER** — PO tunes at
  a real full night].
- `Character.ts` — name + level + HP/shield bar moved onto a world-space
  plate in the new unfiltered `characterAdditions.namePlates` overlay
  (chat-bubble follow pattern; released in `hide()`), so characters stay
  findable at any tint strength.

**Investigation notes (headless Playwright, scratchpad drivers):** false
leads eliminated on the way: Pixi nested-filter mechanics (the disabled
Damaged ColorMatrixFilter on `actualShape` is skipped cleanly), Pixi
RenderableGC (player renderables stayed in the live instruction set), and
scene-graph state (always healthy — visible/alpha/bounds correct while
pixel-invisible, which pointed at tint, not rendering). Headless gotchas
worth keeping: **keyboard input (WASD/hotkeys) does not reach the game in
headless Playwright** — equip/activate via spellbook `.skillName` click +
aura-slot li clicks, move via `WARP`; and the player spawns pinned ON the
spawn campfire, whose art covered the avatar entirely (the z-order finding
above). `null.split` evidence recorded in §21.

**Verified:** `tsc` + webpack prod build clean; headless night battery
(avatar readable on open ground and above campfire art, plate follows WARP,
campfire glow intact, mobs/NPCs uniformly tinted); boot counts unchanged
(78 skills/13 factions/47 mobs/10 recipes/856 props/349 spawns/5 campfires/
14 npcs, 0 panics); PO played a full night in-game.

## Wolf-line drop reshuffle + milestone trim (ad-hoc session, 2026-07-21)

**Balance/content tuning session — DONE 2026-07-21, PO-driven in-session,
committed `f9a64db5`.** Not a planned chunk: PO was playtesting, found
the four-wolf drop set confusing, and retuned it live alongside a manual
zone-editor density pass.

**Framing (PO ruling 2026-07-21):** the C8 "drop table FINAL" and "milestone
table FINAL" locks are **first-pass settlements, not frozen values**. As with
any MMO, drop sources/rates and unlock placement get tuned continuously as
playtest feedback comes in. FINAL in this repo means "decided well enough to
build on", not "never revisit". Treat the drop/milestone tables as
tuning-open from here; the same applies to essentially every number carrying
[PLACEHOLDER].

**PO rulings:**
- **FirstAid leaves the milestone table.** The village Hermit teaches it at
  requiredLevel 2 — *earlier* than the L3 milestone granted it — so the
  milestone was dead weight. **Haste @L7 is now the only milestone unlock.**
- **Wolf line drop set**, line-wide + one signature aura each:
  | mob | cL | drops |
  |---|---|---|
  | Wolf | 2 | Swift .1, KeenEye .06 |
  | EliteWolf | 5 (elite) | Swift .1, KeenEye .06, **Wild .5** |
  | DireWolf | 6 | Swift .1, KeenEye .06, **LongRangeStrike .2** |
  | AlphaWolf | 10 | Swift .1, KeenEye .06, **Reaper .2** |
- **Swift + KeenEye go line-wide** — Swift at .1 on all four (PO call after
  the reachability flag below), KeenEye at .06 on all four (was DireWolf-only
  since the crit rework v2). The wolf line owns the precision identity.
- **AlphaWolf is no longer dropless** — it was the only wolf with no unlocks
  at all despite being the cL10 apex; it now carries Reaper as the line's
  apex payload, moved up from EliteWolf.
- **"Easiest drop = least interesting skill" is intended**, not a bug: Wild
  at .5 on the mid-tier elite is generous *variety*, not power. PO confirmed
  the reward curve reads correctly.

**Reachability flag raised + resolved in-session:** the literal spec ("Wolf
drops nothing else") would have made **Swift world-unreachable** — Wolf was
its only non-legacy source (no NPC teaches it, no recipe makes it; the other
sources are legacy proving-grounds mobs). This would have regressed the
step-7 A.5 guarantee that all player skills are world-reachable. PO resolved
it by putting Swift on all four wolves at .1. Post-change sweep across mobs +
NPC teachings + recipes + milestones: **nothing orphaned**. Two names the
sweep flagged are non-issues — `Haste` (milestone table, which the sweep
doesn't read) and `FireWard` (pre-existing known gap; its own `_comment`
records "no unlock source yet — real placement comes with the item 12 content
pass").

**Balance notes for the next tuning pass (recorded, not acted on):**
- All four drop auras are single-target (`maxTargets: 1`, `selector:
  nearest`) on the same 40-tick interval, so radius-vs-damage is the only
  axis. DPS vs the DamageAura baseline: **Wild ~72%** (r1.40→1.60),
  **LongRangeStrike ~64%** (r2.60→3.00), **Reaper ~87%** (r2.0 + execute
  <35% ×2 + lifesteal 50% + berserker).
- **Wild is close to a trap pick** — its 1.4 radius is barely outside
  DamageAura's 1.0, so the DPS loss buys no real safety; it reads as "worse
  Damage" rather than a genuine side-grade. LongRangeStrike at 2.6–3.0 by
  contrast outranges every wolf bite (1.0) and even EliteWolfBite (2.2), so
  it is a real playstyle.
- **Reaper caps at maxLevel 3** — 13.5 DPS at max vs LongRangeStrike's 12.8,
  despite being the cL10 payload against LRS's cL6. Execute + lifesteal carry
  it in practice, but the raw ceiling does not read as four curve levels
  better. Raising `maxLevel` to 5 is the one-line fix if the apex drop should
  feel apex.
- AlphaWolf is at 2 spawns and is Reaper's only source at .2 (≈5 kills
  expected) — PO is placing more by hand in the editor.

**Content touched:** `backend/pkg/aura/skills/milestone-unlocks.json` (FirstAid
row removed) + its pin test `pkg/aura/skills/milestones_test.go`
(`TestDefaultMilestoneUnlocks_PinnedTable`, rewritten red→green with the
rationale); `api/mobs/{wolf,elite-wolf,dire-wolf,alpha-wolf}.json` unlocks +
`_comment`s; `api/skills/{keen-eye,wild,long-range-strike,reaper}.json`
`_comment` source lines. Docs swept for stale drop sources:
`content-mobs.md`, `content-auras.md`, `content-passives.md`,
`content-skill-inventory.md` (incl. its milestone rows + reachability
summary — that file is generated and now lags in other ways too; **regenerate
it next content chunk**). PO's own `api/zones/world.json` editor pass rode
along in the same commit: props 856→850, spawns 349→380 (Boar +17, DireWolf
+8, Kobold +4, EliteWolf +3, PoisonPool +3, Spider +1, Bear −1, Stag −2,
Wolf −2).

**Watch item (recurred):** the milestone table is `//go:embed`-ed under
`backend/pkg/aura/skills/`, **not** `api/` — so `-content ../api` does not
cover it and a `make -C backend build` is required. Easy to miss in a session
that is otherwise pure JSON iteration.

**Verified:** `go build ./...` clean; **full suite green** (`go test ./...`,
exit 0) including the rewritten milestone pin; boot clean with **1 milestone
unlock** (was 2) and no panics — `78 skills/13 factions/47 mobs/10 recipes/
850 props/380 spawns/5 campfires/14 npcs, 0 panics`. Reachability sweep
green. **Not yet PO-verified in-game** — server was left running for the PO
to continue testing.

## Milestone table moves into `api/` + restart-robustness (ad-hoc session, 2026-07-21)

**Milestone table relocated to `api/milestones/` — DONE 2026-07-21, PO-driven
in-session, committed `d7460462`. Closes the `-content` coverage gap that
the wolf-line session logged as a recurring Watch item one chunk earlier.**

**Trigger:** PO asked why the milestone table sat outside `api/` at all, while
restarting the server for a `world.json` editor pass.

**Finding (it was historical, not principled):** `git log --follow` puts the
file's creation at `4afc7fb4` "Phase 3.2 — unlock HealAura at level 2 via
milestone table", back when it was a small Go-side table. The `-content` flag
and the whole `contentSources` abstraction only landed in `aa509d95` (step-7
B+C, 2026-07-21), and that commit did not revisit the file — it wrote a comment
rationalising the status quo instead ("code-adjacent config, not api/ content").
That distinction does not survive contact: the table is `[{level, skillName}]`
resolved against the skill registry at load, structurally the same as
`api/recipes/`, and it is tuned on PO feedback like any other content — it was
retuned the previous session (FirstAid off the table).

**Change (backend-only, no wire, no content values):**
- `api/milestones/milestone-unlocks.json` — `git mv`'d out of
  `backend/pkg/aura/skills/`; now the single source of truth.
- `backend/pkg/api/milestones/milestones.go` — new 4-line embed pkg mirroring
  `recipes.go`.
- `backend/Makefile` — `../api/milestones` added to the `cp-defs` copy list
  (a fixed list, not a glob, so this was required).
- `skills/milestones.go` — `DefaultMilestoneUnlocks(r)` →
  `MilestoneUnlocksFromFS(fsys, r)`; `//go:embed` dropped. The tested core
  `milestoneUnlocksFromJSON` is untouched.
- `cmd/aurad/loaders.go` + `aurad.go` — `milestones fs.FS` on `contentSources`,
  wired into `embeddedContent()` and as a hard-failing `sub("milestones")` in
  `diskContent()`. The false "code-adjacent config" comment is deleted and
  replaced with a keep-it-that-way note.

**Restart robustness (same session):** `pkill -f aurad` — the form the
`playtest` skill taught — **kills its own shell**, because `-f` matches the full
command line and the invoking shell has `aurad` in its own. It burned three
attempts before diagnosis (exit 144), leaving the stale server alive each time.
`'[a]urad'` does not help either: the `./aurad -dev` later in the same compound
command still matches. Fixed in `.claude/skills/playtest/SKILL.md` to
**`pkill -x aurad`** (name-exact, no `-f`) — a shell is named `bash`, so
self-match is structurally impossible. Used throughout the rest of the session
with no recurrence.

**Test strategy:** the pin test now resolves through the FS entrypoint against
`api/milestones/` (assertion unchanged — Haste @L7, renamed
`TestMilestoneUnlocksFromFS_PinnedTable`); added a missing-file case; extended
`TestDiskContent_RepoApiLoadsEndToEnd` with milestone coverage. New
`TestEmbeddedMilestones_MatchSource` guards the one nasty failure mode — a
forgotten `cp-defs` leaves `-content` serving the correct table while embedded
builds serve a stale one; it diffs the two copies and names the fix in its
failure message. **The guard was proved non-vacuous**: the embedded copy was
deliberately drifted (level 7→3), the test failed as intended, then restored.

**Verified:** `go build ./...` clean; **full suite green** (`go test ./...`,
exit 0). Booted **both** ways — `source=embedded` and `source=../api` — each
reporting `Loaded milestone unlocks count=1`, 0 panics:
`81 skills/14 factions/50 mobs/10 recipes/847 props/383 spawns/5 campfires/
14 npcs, 0 panics`. **End-to-end proof of the actual goal:** a second entry was
added to `api/milestones/` and picked up by a plain restart with **no rebuild**
(`count=2`), then reverted (`git diff` on that path empty). **Not PO-verified
in-game** — no runtime surface changed; server left running on the PO's
`world.json` (props 850→847, spawns 380→383 from their editor pass).

## Combat readability: category aura rings + tier frames (items 7 + 15, 2026-07-21)

**Items 7 + 15 DONE 2026-07-21 — PO-VERIFIED IN-GAME 2026-07-21 ("looks
better"), committed `e8b67289`.** The first chunk of the post-C8 PO priority
queue; closes both readability items in one pass since they share the same
append-only Mob-table wire extension.

**PO rulings (choice prompts, 2026-07-21):**
- Item 7 → **(a) category colour**: one colour per effect category, identical
  for players and mobs. Not damage-type colour, not per-skill patterns.
- Item 15 → **(a) frame ring**: programmatic ring on the portrait circle;
  normal unmarked, elite silver, boss gold.
- Multi-effect auras → **bitmask, keep dual rings** (not first-effect-wins).
- **Ring geometry correction (PO, mid-chunk, after playing Warbanner):** the
  first implementation drew one full ring per category at *decreasing radii*.
  That reads as several different areas of effect — false, since every effect
  on an aura applies over the same radius. Bands now stack **inward from the
  aura edge**, so a multi-category aura is simply a *thicker border* on one
  circle. Category order is unchanged; the outermost band's outer edge is the
  true aura radius (the gameplay-critical edge).

**Wire (append-only; no existing field IDs shift):** `Mob.aura_category`
(slot 21) + `Mob.tier` (slot 22), `Character.aura_category` (slot 29). All
`ubyte`. Verified against the generated `PrependByteSlot` indices.

**Backend:**
- `skills.AuraCategory` bitmask (damage/heal/shield/dot/slow/light) +
  `AuraCategoriesOf`, **derived from the existing `EffectDef.Type`** — no new
  authored field, no content migration. Classification is an **exhaustive
  table, not a switch with a default**: a new `EffectType` fails a test instead
  of silently rendering ringless.
- `mobs.TierRank` encodes the authored tier label as an ordered byte.
  `tierRanks` became the **single source for both** the loader's validity check
  and the wire encoding, replacing the hardcoded
  `tier != TierNormal && tier != TierElite && tier != TierBoss` chain — a tier
  can no longer be loadable without an encoding.
- `SkillComponent.AuraCategories()` with player + mob delegating one-liners
  (the existing `LightRadius` pattern), rather than a 3rd copy of the
  active-slot lookup in each entity.

**Frontend — net *removal* of hand-sync debt:**
- New `AuraRingStack` (`game-objects/logic/AuraRings.ts`): interior wash +
  one `Graphics` band per set category, redrawn only when `(radius, mask)`
  actually changes (the setters run every snapshot).
- Replaces **three** separate implementations (character damage/heal sprite
  pair, mob always-red sprite) with one shared class.
- Deleted `damageAura.svg` + `healAura.svg` (identical geometry, hardcoded red
  and green) — and after the geometry correction the SVG path went away
  entirely, so `auraRingFile`, both preload registrations and the whole
  `assets/effects/` dir are gone. A new category is now one palette row + one
  bit: no art, no render-path change.
- Deleted the hardcoded skill-ID ring switch in `Character.setActiveSkill` and
  **all 8 `*_SKILL_ID` constants** from `Skills.ts`.
- Mob tier frame ring on the portrait circle (`Mobs.initShape`), following the
  campfire bind-circle precedent already in that file.

**Finding — the old dual ring was already wrong:** Warbanner carries **four**
ring categories (damage+heal+shield+slow) and Vanguard **three**, but the
client only ever had two sprites. The bitmask fixes a pre-existing
misrepresentation, it does not merely preserve the old look.

**Watch item (cost a PO round-trip):** `_GameObject`'s constructor calls
`initShape()`, which runs **before subclass field initialisers**. New subclass
fields assigned inside `initShape` must be declared **without** an initialiser
(as `actualShape` already was) — `private tierFrame: PIXI.Graphics = null;`
silently overwrote the Graphics `initShape` had just created, and the crash
surfaced only at runtime (`Cannot set properties of null (setting 'visible')`).
Compounded by `isDefined` being `!== undefined`, so it returns **true for
null**. Both fixed; the constraint is now commented at the field declarations.

**Verified:** `go build ./...` clean; **full suite green** (`go test ./...`,
exit 0); `tsc --noEmit` clean; webpack prod build clean; boot `-content ../api`
— `81 skills/14 factions/50 mobs/10 recipes/847 props/383 spawns/5 campfires/
14 npcs, 0 panics`. Headless Playwright client smoke reports **no runtime
errors**, and was **proved non-vacuous** by reintroducing the field-initialiser
defect and confirming the harness reproduced the PO's exact error 8×.
New tests: `TestAuraCategory_*` (incl. the exhaustiveness guard, proved
non-vacuous by deleting a table entry), `TestRank_*`/`TestTierRank_*`,
`TestMobMarshalFlatbuf_AuraCategory{,_MultiEffect}`, `TestMobMarshalFlatbuf_Tier`,
`TestAuraCategories_ActiveAuraOnly`.

**Open (carried to Deferred):** `resist_aura` (FireWard) is classified
`AuraCategoryNone` and draws **no ring** — it is a persistent field but was not
one of the PO's six categories; needs a colour decision. Band width is a fixed
**4 px** regardless of aura size, so a small-radius mob aura with several
categories gets proportionally chunky bands (switch to a fraction-of-radius with
a px floor if that reads badly). Placeholders: all 6 category colours,
`BAND_WIDTH 4` / `BAND_ALPHA 0.75` / `FILL_ALPHA 0.1`, elite silver `#c8ccd4`
w2 / boss gold `#e8c04a` w3.

## Applied-effects pips: buff/debuff visibility on avatars (ad-hoc session, 2026-07-21)

**DONE 2026-07-21 — PO-VERIFIED IN-GAME 2026-07-21 ("works"), committed
`1358b9bc`.** PO-picked ad hoc (ahead of queue item ② reconnect-token): a dot,
buff or debuff on an avatar was invisible until its first damage tick popped a
floating number. Now the moment it lands, colour pips appear under the
overhead HP bar — players and mobs alike.

**PO rulings (choice prompts, 2026-07-21):**
- Visual form → **colour pips at the nameplate/overhead bar** (not body-ring,
  not tint pulse, not icon badges — no icon assets exist, and pips reuse the
  fresh item-7 category colour language).
- Scope → **all applied kinds except shield** (dot/slow/hot/resist/tickrate);
  shield stays bar-only — `shield_hp` + the absorb segment already show it, a
  pip would double-display.
- Duration → **presence only** (one ubyte; fade-out warning would need
  per-kind remaining-ticks on the wire — deferred until missed).

**Key architectural point — two directions, two fields:** `aura_category` is
what an entity *projects*; the new `applied_effects` is what is applied *to*
it (the `skills.Buffs` store). Before this chunk nothing of the Buffs store
reached the wire except the derived `shield_hp` scalar.

**Backend:**
- `skills.AppliedEffect` bitmask (dot/slow/hot/resist/tickrate), derived live
  by `Buffs.AppliedEffects()` (`skills/applied_effects.go`). Exhaustiveness is
  **compile-enforced, one step stronger than the aura_category table**: the
  `appliedBit()` classifier is part of the `buffPayload` interface, so a new
  payload kind fails to *build* without a pip decision (shield deliberately
  returns None).
- TDD: `TestAppliedEffects_*` — per-kind bits, shield exclusion, cross-skill
  union, expiry via `Tick()`.
- `AppliedEffects()` accessor on mob + player + both model interfaces (the
  `ShieldHP` placement pattern).

**Wire (append-only; no existing field IDs shift):** `Mob.applied_effects`
(after `tier`) + `Character.applied_effects` (after `aura_category`), both
`ubyte`; Go + TS bindings regenerated; encoded in the codec next to the other
live values.

**Frontend:**
- One shared `EffectPips` renderer (`game-objects/logic/EffectPips.ts`) for
  characters and mobs — no per-class copy. Redraws only on mask change.
- Dot/slow/hot pips reuse the aura-ring category colours, now **exported as
  `AURA_CATEGORY_COLORS` from `AuraRings.ts`** (single source): "purple ring
  around a mob" and "purple pip on me" are the same colour by construction.
- **Resist + tickrate get their first colours** — teal `0x5fbfb0` / orange
  `0xe0812e` [PLACEHOLDER] (half-resolves the deferred "resist has no colour"
  call: the pip has one, the resist aura *ring* still draws nothing).
- Player pips on the nameplate plate (unfiltered → night-readable); mob pips
  with the on-body bar (night-filtered like the bar, accepted).
- **Gotcha found by the smoke:** the own player bypasses `EntityManager` and
  updates via `Player.updateFromBackend` — it needed its own
  `setAppliedEffects` call; without it only *other* entities showed pips.

**Watch item (cost a PO round-trip):** regenerating the FlatBuffers **TS
bindings (`api/schema/js/`) requires a webpack dev-server restart** — the
files live outside `frontend/src` and HMR does not watch them, so the running
dev server kept serving the old generated classes
(`entity.appliedEffects is not a function`) while the prod build was fine.
Sibling of the known "webpack config changes need a restart" item. Also
re-confirmed: `pkill -f` self-kill applies to *any* pattern that appears in
the invoking compound command (`pkill -f "npm run start"` killed its own
shell, exit 144) — kill by PID from `ps` instead.

**Verified:** `go build ./...` clean; **full suite green** (`go test ./...`);
`tsc --noEmit` clean; webpack prod build clean; boot `-content ../api` —
`81 skills/14 factions/50 mobs/10 recipes/847 props/383 spawns/5 campfires/
14 npcs, 0 panics`. Headless Playwright smoke with a real before/after:
before-shot at the spawn campfire shows **no pip**, then `WARP` to the
FireElemental pair, burn `dot_aura` lands → **purple dot pip under the
player's bar** (screenshot-confirmed, both on the :2000 prod build and the
:2001 dev server after its restart), no runtime errors. Non-vacuous by
construction (pip absent before, present after).

**Open (carried to Deferred):** pip geometry placeholders (`EffectPips.ts`:
`PIP_RADIUS 4` / `PIP_SPACING 11`) + the two new colours above. **Mob-side pip
visually unverified** — identical wire/setter/renderer path and covered by
tsc + suite, but no headless scenario applied a dot/slow to a mob (needs a
HUD-equipped player aura); one in-game glance when convenient. Poison pools
do NOT pip by design — their aura is direct poison *damage*, not a dot (the
venom spider owns the lingering-poison niche).
*(Both carried items closed in the playtest-feedback pass below, 2026-07-21:
mob-side pip glanced in-game, resist ring coloured.)*

## Playtest feedback pass: banner ×2, dot responsiveness, resist ring, Wildfire rework (ad-hoc session, 2026-07-21)

**DONE 2026-07-21 — readability items PO-VERIFIED IN-GAME 2026-07-21 ("all
works"), committed `2c68be85`** (one combined commit by PO pick — it also
carries a parallel session's Immolation→Immolate rename, see Watch below).
PO-picked ad hoc from live play, ahead of queue item ② reconnect-token. Four
observations + one design question in, four changes + one rework out.

**PO rulings (choice prompts + follow-up, 2026-07-21):**
- Dot application speedup → **player dots only** (Immolate + Wildfire
  `tickInterval` 40→20, ~1.3 s → ~0.67 s to first burn). Mob dot auras keep
  their lag (FireElemental 60 / Ember 50) — symmetric speedup declined.
- Spellbook section headers → **bigger + gold** (1.1em, banner gold
  `#ffd75e`; they were 0.85em muted — *smaller* than the skill rows).
- Projected `resist_aura` ring → **teal `0x5fbfb0`**, same colour as the
  applied-resist pip (closes the item-7 "resist has no colour" deferral).
- Alert banner → ×2 across **all** kinds (unlock/levelup/announce share the
  one element; PO okayed not splitting): `0.55 → 1.1 × @uiElementHeight`.
- Commit scope → **one combined commit** including the parallel rename.

**Wildfire question → rework ("the ultimate fire fantasy this version has to
offer"):** PO asked what Wildfire offered over Immolate. Answer: the authored
C7 ~70% side-grade — two targets at 7.4+1.5/lvl each vs one at 10.5+2.1/lvl
(≈+41% vs packs, −30% single-target). PO response: retire the side-grade,
make it a strict upgrade. Now: **full Immolate damage (10.5+2.1/lvl) on both
targets, radius 1.2→1.4, dotTicks 3→4, plus caster-only fire resist**
(`resist_aura` with `targetsSelf: true, targetsAllies: false` — the self path
in `applyResistAura` is independent of the ally query, so caster-only is
authorable with no code change; factor 0.6 −0.05/lvl → ×0.4 at L5, mirroring
FireWard's range, Claude-proposed [PLACEHOLDER]). Side effect: Wildfire's
ring now shows purple+teal dual bands (dot|resist categories) for free. The
C7 calibration comment in the JSON rewritten to record the new intent.

**Backend/code changes:**
- `AuraCategoryResist = 1<<6` + `EffectTypeResistAura` reclassified from None
  (TDD: `TestAuraCategoryOf_RingCategories` extended first, red→green).
- Client mirror: `AuraRingsBit.Resist`, `resist` added to
  `AURA_CATEGORY_COLORS` (single source — `EffectPips` now references it
  instead of its own literal), ring style entry between Slow and Light.
- Stale sim pin: `cmd/simharness/serve_test.go` pinned Immolate's aura tick
  at 40 → updated to 20 (same class as the Session-⑦ stale-Immolation pin).

**Watch item — parallel-session entanglement:** a second session was active
in the same working tree mid-session: `immolation.json` was renamed to
`immolate.json` *between my Read and Edit* (Edit failed "file does not
exist"/"modified since read"). Diagnose via `git status` before assuming a
typo; re-read and re-apply on the current state. The rename was complete +
coherent (recipe ingredient, tests, `Skills.ts`, docs), went live in the
PO's "all works" playtest, and was committed here by explicit PO pick after
the entanglement was surfaced (3 files carried both sessions' edits —
`immolate.json`, `wildfire.json`, `serve_test.go`).

**Verified:** `go build ./...` clean; full suite green (after the sim-pin
update); `tsc --noEmit` clean; webpack prod build clean; boot `-content
../api` — `81 skills/14 factions/50 mobs/10 recipes/847 props/383 spawns/
5 campfires/14 npcs, 0 panics` (twice: post-readability with rebuilt binary
for the resist category, post-Wildfire JSON-only restart). PO in-game pass
("all works") covered banner ×2, dot speed, gold headers, resist ring, and
the deferred **mob-side pip glance — closed**. The Wildfire rework itself
was handed over for testing but the PO went straight to "commit it" — one
post-rework in-game feel pass still outstanding.

**Open (carried to Deferred):** Wildfire rework values all [PLACEHOLDER]
(radius 1.4 / dotTicks 4 / resist 0.6 −0.05/lvl) + one in-game feel pass;
banner `1.1 × @uiElementHeight` + header `1.1em`/gold [PLACEHOLDER]; dot
`tickInterval 20` [PLACEHOLDER]; mob dot auras still apply slow (excluded by
PO pick — revisit if mob burns feel unfair to dodge). The "Wild reads as a
trap pick" tuning note stands; its Wildfire sibling is resolved by rework.
