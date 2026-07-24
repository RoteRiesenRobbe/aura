# Plan: Playtest Feedback (rolling collection)

**Status:** **Collection doc — nothing executed yet.** Triaged, prioritized and
sorted 2026-07-24; no chunk started. This is the **standing home for issues
arising from playtests**: new rounds append to §Intake, items get sorted into
the passes below, and we pick targets from here. Successor to
`archive/plan-playtest1-feedback.md` (first external playtest, fully executed
2026-07-22 + `2bfee286`).

**How to use it:** pick a pass (or a slice of one), open an execution session
for it, record the result in a ledger section at the end. Items move down the
document as they land; nothing is deleted, so the reasoning stays readable.

---

## Intake — round 2 (2026-07-24)

Unstructured feedback collected by the PO from live play, mixing the PO's own
observations with other testers'. Triaged in-session 2026-07-24 against the
actual content JSON and config (numbers below were measured, not estimated).

### Headline themes

1. **Three damage auras are the same skill three times** (Damage / Wild /
   LongRangeStrike) — this repeats the standing "aura differentiation" theme
   from playtest 1, now with a decision attached.
2. **Two auras are strictly dominant** (Reaper, LongRangeStrike) rather than
   side-grades.
3. **Progression doesn't satisfy** — "I want to level my stuff higher."
4. **Nothing costs anything** — no resource economy behind aura uptime.
5. **The world doesn't tell you where to go next** — no thread, no hints.
6. A batch of small bugs and readability misses.

---

## Decisions (PO, 2026-07-24, via choice prompts)

1. **Skill-point economy = escalating cost curve**, *not* a skill tree.
   Higher `maxLevel`s, and higher levels cost more points
   (1/1/1/1/1, then 2, 2, 3, 3, 4…). **Free respec survives untouched** — the
   loadout-swapping identity depends on it. A tree was rejected as a whole
   feature that fights that identity.
2. **Resource costs go on auras *and* cooldowns** — per tick for auras, per
   cast for cooldowns. The single-resource identity ("HP is everything")
   should read everywhere, not just on heal auras. PO accepted the wider
   tuning surface; the named risk is **cooldowns becoming unusable at low
   health**, which is a simharness question, not an eyeball one.
3. **Pulsing auras are gameplay, not cosmetic** — the radius genuinely
   oscillates, so reading the beat and stepping in on the swell is a real
   skill expression. The ring must animate exactly or it lies to the player.
4. **XP credit generalizes to "any aura that affected the fight"** — damage,
   heal, light, slow, shield, resist, taunt. Not a light-specific special
   case; the next support role would only re-ask the question. Follows the
   GDD's "players filling roles for each other is essential, not optional".
5. **Warbanner stays as authored** — the minion fantasies become **separate
   combo recipes** (CallForAid + Vanguard → heal minions, CallForAid +
   Spearhead → damage minions) rather than folding a summon into the capstone.
6. **Campfire-only ability swapping: DROPPED.** The escalating point curve is
   expected to supply the build commitment this was reaching for, without a
   travel tax. (It also conflicted with the GDD's "switchable mid-fight".)
7. **Swift: open.** PO note — *"Haste is currently not affecting movement
   speed so it's only two cooldowns that affect movement. Also it's a proof of
   concept, we can balance later."* See §Findings for what that reframes.
8. **Sequencing: gameplay feel first, persistence after.** PO ruling —
   *"we will move persistence to a later point in time after we fix the issues
   affecting the general feel. Right now we make it fun first… we iterate
   multiple times through versions to make sure it's fun."* Step 8 (accounts &
   persistence) **stays next in roadmap order** and may start soon anyway, but
   does not block these passes.

---

## Findings from the triage (measured, don't re-derive)

**Reaper is a strict upgrade, not an outlier.** L3 = 18 dmg / 1.33 s at
**radius 2.0**, 50 % lifesteal (≈9 HP/hit), execute ×2 below 35 %, berserker up
to ×2. Damage L5 = 26.8 dmg at **radius 1.0**, no sustain, and costs 5 points
to Reaper's 3. There is no axis on which Damage wins. Loudest dial is
lifesteal; **radius 2.0 is what makes it un-kiteable.**

**The three damage auras are one line plotted three times:**

| skill | radius | dps @ max | maxLevel |
| --- | --- | --- | --- |
| Damage | 1.0 | 20.0 | 5 |
| Wild | 1.4 | 14.7 | 5 |
| LongRangeStrike | 2.6 → 3.0 | 12.75 | 5 |

Pure radius-vs-dps, three times. LRS was authored as a *"positioning
side-grade, never a straight upgrade"* — it isn't one: since radius **is** the
positioning game, 2.6–3.0× reach is effective immunity to every melee mob.

**Recover is dead content past ~L5.** Flat 36 HP total (4 × 9 ticks),
`maxLevel: 1`, cd 1200. FirstAid is 20 % + 5 %/lvl **of max HP**, cd 900.
With `levelGrowth 1.12` over 30 levels, max HP grows **~26×** — so Recover is
worth 36 HP at L1 and 36 HP at L30, while FirstAid is worth 30 % forever.

**Point budget today:** `skillPointsPerLevel 1` × `maxLevel 30` ≈ 29 points;
slots 3/3/3 = 9 skills; skill `maxLevel` 3–5 → maxing all nine costs ~45. So
scarcity already exists, but with free respec and low caps it reads as *"I've
maxed my three good ones, now what"* rather than as a choice. That is exactly
the complaint decision 1 answers.

**Haste does not affect movement** — it is `tick_rate` (aura cadence ×0.5 for
3 s), confirming the PO note. So the movement space today contains **only Dash,
a blink**; there is no sustained-speed cooldown at all. This *flips* the
earlier lean on Swift: converting it to a cooldown fills a genuinely empty slot
rather than duplicating Dash/Haste. Deleting it would leave movement as
blink-only.

**Haste's name lies.** It is also the *only* milestone unlock (Haste @ L7), so
the one moment progression is most legible is the moment the name promises
movement speed and delivers attack speed.

**`selfDamageHP` already exists** but only on heal auras
(`skills/definition.go`), so decision 2 is an extension of a live field, not a
new concept.

**XP attribution today** = damage contributors + their recent healers
(`model/mob/mob.go`, `participants` map, cleared on full regen). Decision 4
generalizes the *entry* condition; the open part is what "affected" means for
passive-ish effects.

---

## Pass 1 — the numbers rewrite

**Both systemic changes together, then a single retune on top.** They each
rewrite every number across the skill catalog; splitting them means retuning
the whole catalog twice and invalidating a playtest twice. Bigger chunk, less
total work, one settling point.

### 1a — systems

1. **Escalating point curve + raised `maxLevel`s** (decision 1). Point-cost
   math is no longer flat-1-per-level; `component.go` derives spent points from
   levels (deliberately, so free respec can't drift) — that derivation is the
   single place the curve lands.
2. **Resource costs** (decision 2): `selfDamageHP` on damage auras (per tick)
   and a cast cost on cooldowns.

### 1b — retune on top

3. **Prune the vocabulary to Damage / LongRangeStrike / Reaper / Vanguard +
   combinations** — delete **Wild**. PO framing: *"we had these to proof
   concepts, not to be final, so it's fine."*
4. **Reaper** — lifesteal and radius are the two culprits.
5. **LongRangeStrike** — reach becomes affordable rather than free, now that
   it can pay in resource.
6. **Recover** — fractional scaling, or re-role as upkeep for expensive auras
   (decision 2 gives it a job it doesn't have today).
7. **Swift** — ruling open (decision 7); the empty-movement-slot finding above
   is the input.

Authoring rules still apply: tier + baseline for any touched mob, band-check
guardrails, sim battery after the pass.

→ **playtest**

## Pass 2 — new skill expression

Moved *up* the list deliberately: under "make it fun first", these add new
things to **do**, where Pass 1 makes existing things fair.

1. **Pulsing auras** (decision 3) — authorable per-effect oscillation
   (`pulseAmplitude` / `pulsePeriodTicks` shape). Hit resolution becomes
   time-varying; the ring render must track it exactly.
2. **Forward/directional ability** — *"an ability that you can send just
   straight forward."* **The heaviest single item in this document**: the first
   non-radial geometry in the engine (new targeting shape, facing on the wire,
   new render). Worth knowing before committing to the pass.
3. **Patrolling wide-aura mobs** to discourage AFK. Check first whether the
   mob-depth patrol behaviour (`archive/plan-mob-depth.md`, chunk 5) already
   covers waypoints — this may be mostly content.

→ **playtest**

## Pass 3 — credit & combos

Both reward the co-op fantasy, and neither is *felt* solo — so this pass wants
a multiplayer playtest, not a solo one.

1. **XP credit for any aura that affected the fight** (decision 4).
2. **CallForAid combo recipes** (decision 5) — heal minions / damage minions.
   Warbanner itself unchanged.

## Rolling filler — blocks nothing, do any time

- **Minimap resets on death.** Bug.
- **Damage numbers render in darkness.** Should be suppressed like mob
  nameplates already are — `DarknessOverlay.isHidden()` precedent exists from
  playtest-1 Pass C item 3, which explicitly flagged floating damage numbers as
  *"the one most likely to be noticed next"*. It was.
- **Ctrl +/− still zooms the browser.** `KeyboardManager` calls
  `preventDefault` but evidently not for these.
- **Totem/companion tooltips don't describe the summon's effects** — the
  tooltip reads the caster's `spawn` effect, not the summoned mob's loadout.
  Needs the tooltip to follow the spawn into the mob's own skills.
- **Haste's name promises movement, delivers cadence** (see §Findings).

## Own planning session

- **Environmental hints + one overarching thread.** PO: *"more environmental
  hints and lore to explain where things are that players might want to chase
  — if they want the fire mage way, give them at all times sensible hints where
  to go next, WHILE also having one overarching story that leads players
  through all zones. As minimal as possible."* This is not one task, it is a
  content system: a per-zone authoring contract ("at all times a sensible next
  hint") plus a delivery mechanism. Existing delivery surfaces: the
  announcement system, NPC bubbles. **Quest log / journal only when needed** —
  but note playtest 1 raised the same wish three times, so "soon" is likely.
  Split as (1) decide hint delivery, (2) author the thread.

## Dropped

- **Campfire-only ability swapping** (decision 6).

---

## Open questions

1. **What the raised caps actually are.** The curve is agreed; whether skills
   go to 10, 15, or stay uneven per-skill determines how much of the catalog is
   rewritten — every `damageHPPerLevel` needs rederiving against the new
   ceiling. Blocks Pass 1a.
2. **What refills the freed drop slots.** Deleting Wild strips EliteWolf's 0.5
   kill-drop; a Swift ruling moves Wolf's 0.04 "first drop" moment. Two wolves
   would teach nothing. Blocks Pass 1b item 3.
3. **What "affected the fight" means for passive-ish effects** (decision 4) —
   does a resist aura that never resisted anything count? Does light that lit
   nobody? Blocks Pass 3 item 1.
4. **Swift's fate** (decision 7) — cooldown, deleted, or weakened passive.
5. All new numbers are **[PLACEHOLDER]** until felt in-game: the cost curve
   steps, every `selfDamageHP` value, every retuned radius/dps, pulse
   amplitude and period.

---

## Test strategy

- **Pass 1** — simharness first, not eyeballs. TTK/TTD/kills-per-hour
  batteries after the retune; guardrail asserts stay green; the level-curve
  battery re-run against the new point curve. The named risk (cooldowns
  unusable at low health) only shows up in the batteries. Then an in-game feel
  pass.
- **Pass 2** — pulsing auras need a render-vs-hit-radius verification, not a
  screenshot: the ring must match the actual radius at every phase, or the
  feature lies. The directional ability needs its own geometry tests.
- **Pass 3** — needs a two-client smoke; the XP rule is a Go test (TDD:
  failing test first, per the participant-map precedent).
- **Rolling filler** — Playwright smoke per item; the darkness one has a scene
  graph walk precedent from playtest-1 Pass C item 3 (verify the `visible` flag
  against circle geometry, do not eyeball screenshots).

---

## Ledgers

*(none yet — one section per executed pass, newest last)*
