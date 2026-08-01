# Plan: feel pass 2 — the R1–R3 checklist, and what came back

The R-series is built: **R1** (what a cost *says*, `b2116ba3`), **R2** (what
"landed" *means*, `47074d63`), **R3** (one beat, one price, `f4ab5bc9`), plus
the follow-up that closed the R1/R2 wording discrepancy R3 surfaced
(`194036c8`). `plan-resource-costs-feedback.md` had no build work left and ended
where the C1+C2 rewrite did — owing a **play session**, because the numbers are
[PLACEHOLDER] until played.

That session ran **2026-08-01**. This doc is its intake and its plan.

> **Status: PLANNED 2026-08-01, docs only.** Seven checklist areas answered,
> four items of general feedback raised, all six actionable findings traced to
> the line that causes them, **five PO decisions taken** (§4), work chunked into
> **N1 → N5** (§5). Two items deliberately **parked**, one of them with its
> measurement attached (§6).
>
> **Progress: nothing built yet.**

---

## 1. The headline: the model still holds, and what is left is mostly surface

The premise was already off trial after the first feel pass. This one asked
whether the three R-chunks landed on the surfaces a player actually reads, and
they did:

> *"as long as a shield is not damaged, reapplying doesn't cost anything, that
> reads fine"* · *"feels much better and more legible"* (R3's one beat) ·
> *"once I know it, it's kinda cool to time a reapply to reduce overall cost"*

R2's entry pricing — the least play-tested part of the model going in — came
back working *and* generating tactics. R3's one-beat unification is the item the
PO singled out as an improvement in legibility.

What came back is **four presentation problems, one live bug, and two design
questions**. Nothing in it challenges the cost model itself.

⚑ The one thing the pass could not have judged is now visible: **the beat is the
billing moment**, so the tick indicator built as a deliberately subtle
step-8-deferred placeholder (§3.1) is carrying more weight than it was designed
for. That is the through-line connecting half the findings.

---

## 2. Checklist replies (2026-08-01)

Condensed to intent; the checklist itself is §7 of this doc.

**1. The cost line (R1 + `194036c8`).** Works. *"yes, works and feels decent
right now"* — the charge-trigger wording reads correctly against what the server
does, and the Discipline reduction is visible at CL30 as designed. **Two
presentation complaints**, both about repetition rather than correctness:
Warbanner prints **four** separate Focus-cost entries, and *"there is no need to
write 'every 1.32' five times in one tooltip"*. → **N2**.

**2. Entry prices (R2).** Works, and better than expected. Holding Slow on a
caught pack costs nearly nothing; re-entry is *"a very small cost"*; and the
model generates a real tactic — *"it's kinda cool to time a reapply to reduce
overall cost"*. Shield's deliberate exception reads as intentional. Flagged as
**needing a tutorial and frontend work**, not a re-price. → recorded, no chunk.

**3. The fire line (R3's ×3 dot re-price).** Accepted. Wildfire *"feels good"*,
Immolate *"feels fine for now"*. ⚑ But the comparison against free Damage came
back soft: *"it doesn't necessarily read as an upgrade — you have to jiggle in
and out of range less, so there is a benefit"*. That is a **content tuning**
observation (more range or more damage on the fire line), explicitly deferred to
more play. → §6.

**4. One beat, one price (R3 / F5).** The clearest win of the three chunks.
Warbanner's heal dropping 120 → 40 per tick did **not** read as weakness
(*"no, it feels good like this"*), and Paladin/Vanguard read *"much better and
more legible"*. Wildfire's light does not flicker with the beat, as designed.

**5. Bloodthirst.** The heal reads clearly on a direct-damage aura — **and does
not work at all with dot auras**, which it should. → **N3**, and it is a real
bug, not a tuning gap. Missing overhead pip **accepted for now** (backlog §39
owns it). Placement in the wolf line Reaper already drops from: **accepted**.

**6. First Aid free.** The free set charges nothing, confirmed. Free First Aid
*"does not remove downtime enough"* — which is exactly the input R4 exists to
consume, not a finding against R3. → §6.

**7. The premise re-checked.** Holds — *"yeah, kind of"* — with one qualifier
that is bigger than the question asked: *"we need more choice and identity on
the base damage aura though, it's very samey and bland"*, pointed at the
augmentation idea. → §6, and it is the same problem as §3.2 seen from the other
side. The free floor rescues you *technically* at 5 % Focus, but *"since you
can't enter mob range you are kind of stuck running away or regening"* — judged
**acceptable and arguably correct**: at that point you should have to disengage.

---

## 3. General feedback, traced

Four items, all raised outside the checklist. Each was traced to the code that
causes it before any chunk was sized.

### 3.1 Aura tick legibility is under-built for what the beat now means

> *"We need to increase legibility on when an aura ticks, it's a bit hard to
> tell and becomes more important now."*

`AuraTickIndicator.ts` draws one stroked ring at the aura edge and modulates its
alpha from `GLOW_BASE_ALPHA` **0.18** to `GLOW_MAX_ALPHA` **0.45** across the
interval, easing back at the tick. That is the entire mechanism. Its own header
comment calls it *"minimal by design — the polished indicator is a step-8
concern"*, and it deliberately refuses to touch the aura interior so a screenful
of auras *"reads as a calm rhythm, not alarms"*.

Two structural notes for whoever builds N5:

- **The client is never told a tick landed.** It receives `aura_tick_interval`
  and `aura_tick_phase` per snapshot and infers the beat from the phase wrap.
  Every option below is expressible on that data; none needs a wire change.
- ⚑ **Phase resets on an aura switch** (the server resets the tick accumulator),
  and the baseline alpha exists specifically because the ring *"blinked fully
  off at every tick AND right after each aura switch, which read as a broken
  on/off stutter"* (C2 PO finding 2026-07-17). Any beat-triggered effect can
  re-introduce that exact stutter and must be checked against a mid-fight
  aura switch, not only against a steady beat.

Options surveyed: snap flash on the beat · ring pulse · sweep hand (a clock
hand giving *when the next tick lands* rather than *one just landed*) · radial
interior fill (rejected at design time as interior flooding) · HUD metronome on
the active-aura slot · audio (blocked — no assets, step-8 audio deferred).

**Ruled: ring pulse + HUD metronome** (§4 D3).

### 3.2 Levels that buy nothing — and it is exactly one skill

> *"certain levels for damage aura do not change the base damage at all […] do
> we increase everything by a factor of 100? […] I would prefer low numbers."*

Confirmed, and it is **not** a display artifact. Damage is dealt as
`vitals.HP(...)` — integer, **rounded per hit** — so a per-level step below
~0.5 HP is literally zero in play. The tooltip is already honest about it:
`prog()` suppresses its `→` when the next level renders identically, which is
why level 3 previewed no increase.

The Damage aura authors `damageHP: 14` with `damageHPPerLevel: 0.2222` over ten
levels — **+0.222/level**, an order of magnitude flatter than anything else:

```
Damage      14 → 16.0   +0.222   ← the outlier
Vanguard    14 → 26.8   +1.42
LongRange    9 → 22.0   +1.44
Reaper      12 → 26.0   +1.56
Wildfire  10.5 → 38.0   +6.88
```

That flatness is **deliberate** — D16b made Damage the worst damage aura at cap,
reversing the inversion where the starter aura was the best. The side effect
nobody priced is that its ten levels are nine near-dead ones.

**The survey (run 2026-08-01; method + output recorded in backlog §37).** For every
levelable skill, every level-up was checked for whether *any* rendered number
changes at `powerScale` 1, using the tooltip's own renderers (`roundHP` for
absolute Focus, 2-decimal trim elsewhere) — i.e. exactly when `prog()` would
suppress every arrow:

```
skill                  cat            cap  dead level-ups
Damage                 active_aura     10  7/9: [1, 2, 4, 5, 6, 8, 9]
1 of 48 levelable skills has at least one dead level-up
```

**It is Damage alone.** So this is a content decision, not a catalog-wide
rounding problem, and a uniform ×100 would inflate every number in the game to
fix nine levels of one skill.

⚑ **It is also specifically an early-game problem**, because `powerScale`
multiplies the step:

| character level | scale | level-ups that do something |
|---|---|---|
| 1 | 1.00 | 2/9 |
| 5 | 1.57 | 3/9 |
| 10 | 2.77 | 5/9 |
| 15 | 4.89 | 9/9 |
| 30 | 26.75 | 9/9 |

The quantization bites hardest exactly where new players are. But note the
second half of the finding, which survives at every character level: even at
CL30 where all nine level-ups move a number, the full **16-point** investment
buys **374 → 428, +14 %**. The levels are invisible early *and* poor value
throughout — one defect, two symptoms.

Directions surveyed: cut `maxLevel` to 1 (the free floor stops pretending to be
levelable) · level a different axis, `radiusPerLevel` / `maxTargetsPerLevel` /
`costFractionOfMaxPerLevel` all being authorable today · steepen the slope and
raise the cap (re-opens D16b) · a catalog **guard test** making the class of
defect red rather than discovered by hand.

**Ruled: parked** (§4 D2, §6) — it is the same problem as the "samey and bland"
base aura, and the augmentation concept is where both get answered.

### 3.3 Quest progress must only count after acceptance (F4)

> *"progress should only be tracked after accepting a quest, not before. Do we
> have that on the list somewhere? Is it a complicated change?"*

**On the list:** yes — **F4** in `plan-resource-costs-feedback.md`, parked there
with the note that it *reverses* the retroactive-credit ruling (**D3**) in
`archive/plan-quests.md`.

**Complicated:** no. Contained, and here is exactly why. `Ledger.killCounts` are
**lifetime totals** and `satisfied()` compares them to the threshold directly
(`quests/ledger.go`). `Accept` even cascades on purpose, so a veteran whose
counters already satisfy the objectives auto-completes on the spot — the
accepted consequence of D3, and precisely the behaviour being reversed.

The change is a **baseline**: snapshot the relevant counters onto the `Progress`
entry when a quest enters an objective stage (`enter()`), then subtract it at
the three read sites — `satisfied()`, `objectiveLines()`, and the `{n}`
substitution in a `Tracker`. Abandon and re-accept re-baseline for free, because
both already clear `Path` and re-enter.

Three things it must decide, two ruled in §4:

- **Talk-to objectives** are a `talkedTo` bool set, not a counter, so "since the
  stage started" needs a per-stage record of which targets were already spoken
  to → ruled: **a fresh talk is required**.
- **Per accept, or per stage entry?** → ruled: **per stage entry**.
- ⚑ **Knock-on: the baselines are persisted state.** They belong in the
  character record that step 8a writes, which is an argument for landing N4
  **before** 8a's first migration rather than retrofitting a column after it.

### 3.4 A shield larger than the pool paints the whole Focus bar

> *"Using Warbanner on level 30 to shield someone on Level 1, that Level 1
> player's Focus bar becomes fully shield color […] if it is now 300 total
> effective HP with 200 shield, one third should be red and two thirds shield."*

Confirmed, and the diagnosis is exact. `HUD.updateShield()` computes

```ts
const width = Math.min(shieldHp / maxHealth, 1);
const left  = Math.min(healthFraction, 1 - width);
```

so a 200-point shield on a 100-point pool clamps to `width = 1`, `left = 0`, and
covers the bar. The segment was built to slide left over a full bar so an active
shield is *always visible* — correct for shields smaller than the pool, which is
every case that existed before a level-30 player shielded a level-1 one.

The fix is the reframe the PO described: the bar's denominator becomes **total
effective HP** (`health + shield`) and both segments scale against that sum. ⚑
It therefore also moves `Player.ts`, where `healthFraction` is computed as
`health / maxHealth` and fed to a fixed-scale bar — the one number most of the
HUD is derived from. The same defect exists on the **overhead** bar
(`character.setShield`) and is fixed in the same chunk.

---

## 4. Decisions taken (2026-08-01)

**D1 — Bloodthirst's leech on a dot is read LIVE at each burn tick**, not frozen
at ignition alongside the caster's power scale. Firing Bloodthirst on an
already-burning target starts leeching immediately and stops when the burst
expires even if the burn continues. ⚑ This *diverges* from how every other
number in a dot behaves (a burn is otherwise entirely decided at ignition) —
taken deliberately, because "Bloodthirst is up, so my damage leeches" is the
promise the tooltip makes, and the frozen reading would have read as *"still
broken"* to the same play session that reported it.

**D2 — the Damage aura's dead levels are PARKED**, to be revisited with the
augmentation idea (backlog §37) rather than fixed now. ⚑ **The catalog guard
parks with it**: a test asserting "every level moves at least one rendered
number at `powerScale` 1" goes red on Damage the moment it is written, so it can
only ship alongside the content answer — or with an explicit Damage exemption,
which would be a tombstone for a decision not yet taken. The survey's method and
output are recorded in **§37 itself**, so that session inherits the measurement
instead of re-deriving it.

**D3 — tick legibility gets a RING PULSE and a HUD METRONOME.** The snap flash
was offered and **not** taken; the sweep hand and the interior radial fill were
not taken either. So the ring gains motion rather than more brightness, and the
rhythm is additionally readable on the ability bar where the eyes already are
when switching auras mid-fight.

**D4 — quest baselines are PER STAGE ENTRY, and a talk-to objective requires a
fresh talk.** The strict reading: every objective means "since this stage
started", uniformly. Kills during stage 1 do not credit stage 2, and an NPC
already spoken to must be spoken to again. ⚑ The known awkward case is a quest
whose giver is also a talk-to target — the player must re-open that
conversation. Accepted for uniformity; if it reads badly in content, the fix is
content (do not author the giver as their own target), not a second rule.

**D5 — tooltip cost lines are grouped BY CHARGE TRIGGER**, not summed into one
per-tick figure. Warbanner goes from three cost lines to two. ⚑ The single
combined line was offered and rejected on correctness: Warbanner's damage and
heal really are charged every beat, but its shield is charged only when a shield
goes up or is refilled and its slow is free, so one combined per-tick number
would claim a price the server does not charge — reintroducing exactly the
discrepancy `194036c8` just closed.

---

## 5. The chunks

Order: **N1 → N2 → N3 → N4 → N5**. Presentation first, because N1 and N2 are the
surfaces the next feel pass reads *through*; then the live bug; then the quest
change, which wants to precede 8a; then the most by-eye chunk last, so it is
judged on its own rather than through a stale tooltip.

### N1 — the Focus bar tells the truth about shields

*Frontend, small.* Closes §3.4.

The HUD bar and the overhead bar both rescale to **health + shield** as the
denominator, so 100 Focus under a 200 shield reads ⅓ Focus / ⅔ shield instead of
a solid shield bar.

- `HUD.updateShield()` stops clamping `shieldHp / maxHealth` and stops
  computing a left offset against `healthFraction`.
- `Player.ts` — the `healthFraction` fed to the fixed-scale bar is derived
  against the same sum, or the two disagree and the segments overlap.
- `Character.setShield()` gets the same treatment for the overhead bar.

⚑ The sliding-left behaviour being removed is not dead code — it exists so a
shield on a **full** bar is still visible. Under the new denominator a shield
always has room by construction, which is what makes it safe to delete; say so
in the comment, or it comes back.

**Tests:** vitest on the split maths at three points — shield smaller than the
pool, equal to it, and several times it (the reported case). Verify in-game with
a level-30 Warbanner on a level-1 target, which is the only way the third case
occurs naturally.

### N2 — one cadence line, cost lines grouped by trigger

*Frontend, small–medium.* Closes §2 item 1. Implements **D5**.

- **Cadence** joins `radius` and `targets` in the existing shared-generic
  collapse (`GENERIC_KINDS`): when every effect renders the same cadence it
  prints once at the bottom instead of once per block. Warbanner's five
  "refreshed every 1.32s" become one.
- **Cost lines group by charge trigger** — the `COST_TRIGGER_TEXT` key *is* the
  grouping key, so the taxonomy stays authored once in
  `api/shared-constants.json` and nothing new restates it.

⚑ **Sum the rounded per-effect amounts, never the rounded sum.** The server
bills each effect separately through `vitals.HP`, which floors a positive cost
at 1: on a level-1 pool Warbanner's damage (0.0184 → 2) and heal (0.003533 → 1)
really cost **3**, while rounding the summed fraction prints **2**. Note the
inversion — the cooldown path immediately below this code documents the
*opposite* trap, because a cooldown really does deduct once, so the two must not
be "unified".

**Tests:** vitest at both ends of the curve and at a level-1 pool where the
floor is doing the work. ⚑ Then re-run the two harnesses that read cost lines
**by regex** — `r1-focus-cost` (5/5) and `round4-tooltip` — because a wording or
line-count change is exactly what silently stops a regex matching, which is the
lesson R3 paid for.

### N3 — dots leech

*Backend, small.* Closes §2 item 5. Implements **D1**.

`tickBuffEvents` builds its damage payload as
`model.Damage{HP:…, Tags:…, Source:…}` — with **no `Lifesteal` field at all**.
R3 folded `casterLifesteal(acting)` into both *direct* damage payload sites and
this third one was missed, so **no dot has ever leeched**: not Bloodthirst, and
not an authored `lifestealFraction` on a dot effect either. The fix is to read
the leech live at tick time and put it on the payload.

⚑ **Read it off the post-credit caster** — the entity that ends up in
`PlayerTouches`, after the `Credited.CreditTo()` replay that makes a summon's or
a charmed pet's burn credit its owner. That is the entity `ApplyLifesteal`
heals, so reading the fraction from anywhere else grants one actor's leech to
another actor's pool.

⚑ R3's silent-wiring landmine is **disarmed but adjacent**: `LifestealFraction`
exists on both real types and `sys/self_buff_capabilities_test.go` guards it, so
this cannot repeat the "green tests over an inert feature" failure. The test
still goes red first.

**Tests:** a behaviour test that a burn ticking while a lifesteal burst is up
heals the credited caster, red before the fix; one that a burst starting
*mid-burn* takes effect (the D1 divergence, and the exact thing the PO
reported); one that it stops when the burst expires with the burn still running;
and the summon/charm credit case.

### N4 — quest progress starts at acceptance (F4)

*Backend, medium.* Closes §3.3. Implements **D4**. Reverses `plan-quests.md` D3.

Baseline snapshot on stage entry, subtracted at the three read sites. Because
D4 requires a fresh talk, the snapshot covers both counter kinds: the kill/
harvest counts for the stage's targets, and which of its talk targets were
already spoken to.

- ⚑ `Accept` stops auto-completing for a veteran. That is the **point**, but it
  is a documented ruling being reversed — annotate D3 in
  `archive/plan-quests.md` in place rather than leaving two docs disagreeing,
  the way D11/D13/D14 were annotated when D18/D19 superseded them.
- ⚑ `canAccept` must stay a **pure read** — its existing comment warns it must
  not touch `progressOf()`, which creates the entry it looks up. The baseline is
  written by `enter()`, which already owns the write path.
- ⚑ The `{n}/{m}` tracker and the derived objective lines both currently `min()`
  against the threshold to stop a climbing lifetime counter over-reporting.
  Against a baseline the subtraction can go **negative** if content is reloaded
  under a live ledger — clamp at 0, or a journal line reads `-2/5`.
- ⚑ The baselines are **persisted state** for 8a. Record the shape in
  `plan-accounts-schema.md` as part of this chunk, not later.

**Tests:** kills before acceptance do not credit; kills after do; a multi-stage
quest does not credit stage-1 kills to stage 2; abandon + re-accept re-baselines
(previously-counted kills stop counting); an already-talked NPC still needs a
fresh talk. Then the conversation and journal harnesses, which own the surfaces
this shows up on.

### N5 — tick legibility: ring pulse + HUD metronome

*Frontend, medium.* Closes §3.1. Implements **D3**.

- **Ring pulse** — the aura ring scales ~1.0 → 1.06 and settles on each beat,
  detected from the `aura_tick_phase` wrap. Motion reads where brightness does
  not, particularly with several overlapping rings.
- **HUD metronome** — a pip beating on the active-aura slot in the ability bar,
  so the rhythm survives a crowded screen and is readable while switching
  loadout, which is when the eyes are on the bar anyway.

⚑ **The stutter trap.** The beat is *inferred* client-side, and the server
resets the tick accumulator on an aura switch. The existing baseline alpha was
introduced precisely because a naive implementation blinked at every switch and
read as broken. A pulse triggered on a phase wrap will fire spuriously at that
reset unless it is guarded. Test by switching auras mid-fight, not by watching a
steady beat.

⚑ No snap flash — offered and not taken (D3). Do not add one as "obviously part
of the pulse".

**Tests:** vitest on the phase-wrap detection including the reset case (pure
logic, no DOM). Then in-game by eye, which is the actual acceptance test for
this chunk, plus a `chunk2-calm`-style harness run for console/WebGL cleanliness.

---

## 6. Parked, deliberately

- **The Damage aura's dead levels and its blandness** — §3.2 and §2 item 7 are
  the same problem, and both belong to **backlog §37** (the skill-level system
  rework, already coupled to the per-skill caps ruling and the augmentation
  concept). The survey script, its output, and the character-level table above
  travel with it. **The catalog guard test is parked with it** (D2).
- **The fire line's upside over free Damage** — *"needs probably a bit more
  upsides, maybe a higher range or even more damage, but we'll have to play some
  more"*. Explicitly a next-play item, not a chunk.
- **Downtime** — free First Aid *"does not remove downtime enough"*. This is
  **R4's** input, and R4 is a design session, not code. It is now unblocked:
  every R-chunk it was waiting on has landed.
- **A tutorial for entry pricing** — the model reads correctly once known and
  the PO twice said it *"needs a tutorial and frontend work"*. There is no
  tutorial system; raising one is a bigger call than this pass should make.
- **Bloodthirst's missing overhead pip** — accepted for now (§2 item 5).
  Backlog §39 owns it and already has this as its concrete first customer.

---

## 7. The checklist that was run

Kept as the record of what was asked, in the shape it was asked. Replies are
§2; the general feedback that arrived alongside it is §3.

1. **The cost line** — absolute Focus, the charge-trigger wording, the cadence
   riding the effect's own line, Discipline visible at CL30.
2. **Entry prices** — holding Slow on a caught pack, repeated re-entry, whether
   "free to maintain, priced to start" is legible, shield's deliberate exception.
3. **The fire line** — Wildfire:5 and Immolate:10 in a chain pull, against free
   Damage.
4. **One beat, one price** — Warbanner / Paladin / Vanguard reading as one
   thing; Wildfire's light not flickering with the beat.
5. **Bloodthirst** — does the heal read, is the missing pip a blocker, where
   should it come from.
6. **First Aid free** — the free set charges nothing; does it dent downtime.
7. **The premise** — does spending survivability still read as a decision; is
   there a working action at 5 % Focus.

---

## 8. Chunk ledgers

Filled in as each chunk lands, newest first.

*(nothing built yet)*
