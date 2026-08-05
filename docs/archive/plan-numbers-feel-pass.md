# Plan: The Numbers Rewrite — PO feel pass

> **Status: ✅ RUN 2026-08-01 — ARCHIVED 2026-08-05. The findings live in
> `plan-resource-costs-feedback.md`** (archived alongside this doc — its whole
> R-series is built). The premise landed (*"resource cost
> changes feel good actually"*); 11 feel items came back, alongside a technical
> review of the cost system run the same day. This doc stays the **checklist of
> record** — what was asked and why; the replies and their triage are in the
> feedback doc, so there is one place to read them.
>
> Original framing follows. This was the outstanding step of
> `plan-numbers-rewrite.md` (built
> 2026-07-31, committed 2026-08-01). The batteries proved every mechanism and
> fixed the ordering; **they cannot judge whether spending survivability for
> power is fun**, which is the entire premise being tested (GDD §3).
>
> ⚑ **Every number the rewrite authored is [PLACEHOLDER]** — the caps, the
> point-curve thresholds, the costs and the whole damage ladder. Nothing in this
> checklist asks "is this value correct"; it asks "does this read the way it was
> designed to read". A value that reads wrong is a finding, not a bug.
>
> Findings go in §3 as they arrive, then get triaged into a retune sitting.

---

## 1. How to run it

Server + client, from the repo root:

```bash
./scripts/dev-restart.sh all
```

```
http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game
```

Boot must read **86 skills / 15 factions / 64 mobs / 3 milestone unlocks /
10 recipes / 4 quests / 5 prop definitions / 777 props / 485 spawns /
5 campfires**, 0 errors 0 warnings 0 panics. A count off by one is a definition
that failed to register.

Useful cheats: `GOD`, `XP`, `SKILL <name>`, `SPEED`, `WARP <x·120> <y·120>`,
`ANNOUNCE`, `THREAT`. Add `&develop` to the URL for the dev panel.

⚑ Reaching level 30 and a full spellbook by cheat is the *point* here — §4 is
about the shape of a level-30 build, and grinding to it by hand tests a
different thing.

---

## 2. The checklist

### 2.1 The premise — does spending survivability for power feel good?

The single question the pass exists to answer (GDD §3, round-6 ruling: the
resource's double meaning *is* the design). Everything below this is detail.

- [ ] Fight a few wolves with a **priced** aura on (Reaper, LongRangeStrike,
      Berserker). Does the drain read as *a decision you made* or as *the game
      leaking your HP*?
- [ ] Does the drain arrive at a legible moment? Costs are charged **per effect
      on its own cadence**, so on a slow-cadence aura it is a periodic bite, not
      a bleed.
- [ ] Push a fight to low HP with a costed aura still running. Is the "I should
      switch to Damage" moment obvious, or does it arrive as a surprise death?
- [ ] Camp/regen after a costed fight — is downtime now dominant? Costs are the
      new tax on the 10 s downtime lock.

### 2.2 The free floor — `Damage` is deliberately the *worst* damage aura (D16b)

The headline inversion fix. It measured **first** on the chain ladder (63.32 kph)
and now measures **last** (47.32). Its level 1 is untouched at 14 HP; only the
slope moved (L10: 26.8 → 16).

- [ ] Early game (level 1–5) with only Damage: does it feel adequate, i.e. like
      a fine starting weapon?
- [ ] Late game with Damage: does it read as **"reliable floor"** or just
      **"bad"**? ⚑ This is the pass's named risk — if it reads as "bad", the
      design intent is not landing and D16b needs a different expression, not a
      bigger number (a bigger number re-inverts it).
- [ ] Confirm the free five never charge anything: **Damage, Torch, Lantern,
      Harvest, Pickaxe**. Run each and watch HP.
- [ ] Does the free floor actually rescue you? Deliberately go broke, switch to
      Damage, confirm there is still a working action at 5 % HP.

### 2.3 The point economy — a ~29-point budget at level 30

Costs are cap-relative: a cap-10 skill costs **16** points to max, a cap-5 costs
**7**, cap-1 is free. Level 1 is still granted free on unlock, so every
discovered skill is usable before any investment.

- [ ] `XP` to 30 and try to build. **Aggregate power at 30 is DOWN by design** —
      a budget now maxes roughly **2 of 9** equipped slots where it used to max
      ~6. Does that read as meaningful commitment or as starvation?
- [ ] Spellbook `+` button: does it show the point cost and grey out when
      unaffordable?
- [ ] Try the intended shape: one deep cap-10 + one maxed cap-5 + a part-way
      third. Is that a build worth wanting?
- [ ] Does hitting a cap of 5 on a supporting skill feel like a natural ceiling
      or premature? ⚑ `backlog.md` §37 (aura augmentation) is coupled to this —
      feedback here feeds that design, so "the cap is where the skill stops
      being interesting" is the useful shape of answer.

### 2.4 The retuned skills (D12's problem set)

- [ ] **Immolate / Wildfire** — were killing their caster in C2b; now 50.07 kph
      at 100 % survival, with damage raised (L10 18.9 → 34) and the 20-tick
      cadence **kept**. Do they feel like dots or like a slow damage aura?
- [ ] **Reaper** — radius **2.0 → 1.5** (kiteable again), lifesteal
      **0.5 → 0.3**, damage L10 18 → 26. Meant to be a *trade* now, not a strict
      upgrade. Does the smaller ring hurt too much?
- [ ] **LongRangeStrike** — L10 17 → 22, and its reach is now paid for rather
      than free (the √radius term prices a 3.0 ring at nearly double a 1.0 one).
      Is the reach still worth it?
- [ ] **Recover** — was dead content (flat 36 HP: 36 % of a level-1 pool, 1.4 %
      of a level-30 one). Now `healFractionOfMax 0.03 + 0.005/level` over 9
      ticks, cap 1 → 5. Test at **both** low and high level — the fix is that it
      should feel the same at each.
- [ ] **Suppression** (L5 12.1 → 20) and **Paladin** (L5 18.8 → 20) — both
      combos sat at or below their own ingredients. Does a combo now feel like
      an upgrade over what you fed it?
- [ ] **Wild is deleted.** Its three drop slots (EliteWolf 0.5, SaberToothCat
      0.2, AngryMammoth 1.0) are intentionally **empty** per the PO. Confirm
      those kills reading as "no drop" is acceptable and not a hole.

### 2.5 Damage types & resistances — mitigation exists for the first time

Before this pass every hit in the game landed for full; resistances existed only
as lock-and-key gates. 9 curated mobs, **all non-physical** by constraint
(a physical resistance would silently re-calibrate the tier guardrails).

- [ ] **Troll** (`fire 1.5 / bleed 0.5`) — the sharpest trade in the game. Kill
      one with **Reaper** (`bleed`, the wrong answer) and then with **Immolate**
      (`fire`, the right one). Is the difference legible *without* a combat log?
- [ ] **FireElemental / GreaterFireElemental** (`fire 0.25 / frost 1.5`) —
      Immolate vs **Suppression** (`frost`).
- [ ] **Spiders** (`poison 0.25`), **Bear / DireBear** (`frost 0.5`).
- [ ] Control check: a **Wolf** takes every type in full, and **Damage** is
      unresisted everywhere.
- [ ] Nothing in-game tells the player resistances exist. Does that read as
      discoverable, or just as inconsistent damage numbers? ⚑ This is a genuine
      open design question, not an oversight — the answer may be content
      (`content-mobs.md` lore) rather than UI.

### 2.6 Tooltips & feedback

Both of the gaps below were invisible-to-the-player defects caught during the
build; they are on the list because they are the surfaces a value judgement is
made through.

- [ ] Every priced skill shows a `Costs you: X% of max HP …` line. It is a
      **percentage, not absolute HP** (the client has no `baseHealth` to convert
      with, and the 2026-07-29 sweep ruled the percentage stands alone). Is it
      readable at a glance?
- [ ] Aura tooltip: cost is **per effect, on its own cadence**
      (`… every 1.98s`). Cooldown tooltip: **one line, per cast** — CallForAid's
      three summons at 2 % each cost **6 %** per cast and are shown once.
- [ ] **Recover's** tooltip shows a real heal-over-time number, not `0`.
- [ ] **Harvest's** tooltip opens without error (its `tags` is `null` on the
      wire — and Harvest is taught to every new player).
- [ ] **Cast a cooldown you cannot afford.** It must be **rejected with
      feedback** — nothing spent, cooldown does not start. GDD §3 calls the
      silent-skip behaviour explicitly wrong.

### 2.7 `Discipline` — the new skill (id 65, passive, cap 5)

D13's cost-reduction stat, the sixth `validStat` and the first that modifies an
*input*. `costReduction` 0.06 + 0.03/level; milestone unlock at **level 5**,
roughly where costs start to bite.

- [ ] Does it arrive at the right level, and is the reduction worth a slot plus
      points?
- [ ] Confirm it cannot cheapen the free floor (0 × anything = 0) — intended.

---

## 3. Findings

**➜ `plan-resource-costs-feedback.md`.** The pass ran 2026-08-01 and produced
more than a table's worth: 11 feel items (§2), 9 technical findings from a
review run the same day (§3), and — the part worth the separate doc — a section
on where the two **collide** (§4): the tick-together request re-prices the whole
catalog, absolute-HP tooltips supersede a fix already made, and First Aid going
free needs the free-floor guard extended.

Headlines, so this doc is not a dead end:

| # | Area | What was felt | Direction |
| --- | --- | --- | --- |
| 1 | **The premise** | ✅ Works — drain reads as a decision, PO switched auras mid-fight | None. Off trial |
| 2 | Free floor | ✅ `Damage` read as a reliable floor, not as "bad" — D16b's stated risk did not materialise | None |
| 3 | Downtime | Weakest part of the loop; wants **agency**, explicitly not faster regen | New design item (campfire "food" charges) |
| 4 | First Aid | Charging a resource *generator* is incoherent | Make it the free heal baseline |
| 5 | Tooltips | Percentages are readable but not understandable | Absolute HP + resource name/colour |
| 6 | Cadence | Four cadences on one aura reads as random | Multi-effect auras tick together |
| 7 | Reaper | Still far too strong — returns more than it costs | Re-nerf; couples to the pay-condition question |
| 8 | Discipline | Reduction invisible in the UI | Confirmed client-side gap |

---

## 4. Known-red going in

- **`chunk3-charm.mjs`** — 8/9, 7/9, 7/9, 6/9 across four runs with a different
  failing subset each time, all legs needing the charmed pet **alive**. That is
  the already-accepted D9 fragility (*"the pet is focused by its former
  packmates and can die in ~8 s"*, PO-accepted 2026-07-29), and nothing in the
  rewrite touches it in principle — D3 freezes mob damage, the 36 mob skills and
  the 64-mob roster. **But the HEAD worktree baseline hung and the comparison is
  INCONCLUSIVE, not favourable.** If charm feels newly broken in-game, that is a
  real signal worth recording in §3.

---

## 5. What happens after

Findings in §3 → a retune sitting against `plan-numbers-rewrite.md`'s ladders.
Then the doc is archived alongside it, and **step 8 (accounts & persistence)**
opens as a design session per the roadmap.

Open question 4 from the rewrite rides along and is **not** for this pass:
*does the free floor stay free under `backlog.md` §37?* If augmentation lands on
`Damage` at level 10, a free skill gains a costed effect — the first place D6
and §37 collide.
