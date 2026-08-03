# Plan: Downtime agency + baseline Recall (R4)

> **Status: C1 ✅ BUILT 2026-08-03 · C2 ✅ BUILT 2026-08-03 — both ledgers in §9. Every chunk in this plan is built; what is left is tuning and the [PLACEHOLDER] numbers (§8).** Designed
> 2026-08-03 (design session): this is R4 from
> `plan-resource-costs-feedback.md` §6, widened 2026-08-02 by intake round 8
> item 1 (`plan-playtest-feedback.md`). All nine design questions ruled by the
> PO in one session, as choice prompts. ⚑ Two claims in the prose below were
> corrected by C1's survey — D8's prune cascade and §2's "existing fallback
> ladder" — see §9. Every number is [PLACEHOLDER].

## 1. What this is, and its inputs

The feel pass's one open design gap: *"downtime wasn't really fun and there was
quite a lot of it… this needs some form of player agency."* Raising passive
out-of-combat regen is explicitly rejected (§2.3); the sanctioned shape is a
consumable agency loop anchored on campfires. The 2026-08-02 widening made
Recall part of the same design: *the way back to safety and the way back to
fighting shape are one loop*, both free, both held by a level-1 character in
their first minute.

Inputs, all read during the session:

- `plan-resource-costs-feedback.md` §2.3 — the constraints table + the five
  open questions (all five are ruled below).
- `backlog.md` §32 (consumable charges — *does a charge survive death?*) —
  **answered by D3**: nothing is stored, purely per-session, so no migration.
- The PO sketch (§2.3): *"a campfire gives 5 food charges, use underway to sit
  still and regen, once out head back to a campfire"* — the loop's shape, which
  D2 turns into a placeable object rather than a self-buff.
- Today's machinery: 10 s combat lock + ~1 %/s tapered regen; First Aid free on
  a 30 s cooldown; the campfire dwell detector (bind at half heal radius);
  `home_campfire_id` persisted; the cast path (`castTicks` +
  `castInterruptedByDamage`); the spawn/summon path for owned temporary
  structures (fire totem precedent); `light_aura` as a rendering-only
  darkness-hole; 3 cooldown slots (PO-locked 2026-07-20).

## 2. The loop, end to end

A character always has two buttons, from creation, outside the skill system:

1. **Recall** — free, no cooldown, 10 s interruptible cast [PLACEHOLDER] →
   teleport to the bound campfire (existing `applyRecall`, existing fallback
   ladder). The cast window is the entire brake.
2. **The mini-campfire** (working name **Camp**, [PLACEHOLDER]) — charge-fed.
   Press → channel [PLACEHOLDER ~4–6 s]; at completion a temporary campfire is
   placed: lasts 10–20 s [PLACEHOLDER, balancing question], heals with regular
   campfire ticks, emits a **dim** light smaller than Lantern's, offers no
   protection (mobs walk in freely), cannot be bound to, and cannot refill
   charges.

Charges refill to cap by **dwelling at any real campfire** — the same act that
rebinds the spawn point, read by the same detector. The cap **grows with
level** [PLACEHOLDER curve, ~3–5 at level 1]. Nothing about charges is
persisted: death and logout both zero them (you respawn at the bound fire —
the refill point — so the loss is painless by construction).

So the loop reads: fight → run low → place a camp (or First Aid) → out of
charges → walk or Recall to a fire → heal fast + refill + rebind → back out.
Recovery in the field is finite and positional; the fire is the anchor.

## 3. Decisions (PO, 2026-08-03)

**D1 — A new ability class: baseline utilities.** Recall and Camp are
dedicated, always-present HUD buttons **outside** the 3 cooldown slots and
**outside the spellbook** — nothing to discover, level, slot, or spend points
on. Tooltips live on the buttons. Rationale: the spellbook is *"what you have
discovered"*; these are had by everyone, always, and pre-equipping them would
eat 2 of 3 cooldown slots at creation.

**D2 — Recovery is a placeable mini-campfire, not a self-buff.** The channel
is the sit-still moment; the payoff is a shared object — it heals *everyone*
in range with regular campfire ticks, so it is also the first supportive thing
a player can put down for others (GDD: roles are essential, not optional).
Mobs can enter it; it protects nothing.

**D3 — Charges are purely per-session.** Refill at any real campfire; cap
scales with level; **nothing persisted** — wiped on death AND logout. This
answers backlog §32 for this feature: no migration, no stockpile, no economy
seed. Revisit only if it stings in play.

**D4 — Charge consumed at channel completion; an interrupt costs nothing.**
Same shape as R2's *pay for work done*: nothing happened, nothing is paid. The
lost time and the incoming mob are the interrupt's price.

**D5 — One camp per player; placing again replaces.** ~~The summon machinery
already tracks owned spawns; replace is the existing pattern.~~ ⚑ **Corrected
by the C2 survey (§6a): both halves of that sentence are wrong** — no
owner→summon index exists anywhere (one-totem-at-a-time is a *content
convention*, cooldown ≥ TTL, per the `summon-totem.json` comment), and the
`OwnedEntities`/`doFuneral` cleanup is a vestige with zero writers. The RULING
stands; C2 builds the small replace index (§6a step 4). Different players'
fires may overlap — only self-stacking is closed.

**D6 — Dim light.** Camp carries a `light_aura` with a radius meaningfully
smaller than Lantern's [PLACEHOLDER] — enough to see your feet, not enough to
travel or fight by. **Constraint: it must not substitute for the light aura in
dark zones** — the tunnel's light-vs-damage trade-off is a GDD pillar.

**D7 — Recall goes free, baseline, and loses its cooldown entirely.** The
slottable Recall cooldown skill is **retired** (`recall.json` deleted, id 28
never reused); its `recall` effect machinery is reused by the utility path.
The 10 s `castInterruptedByDamage` cast survives as the only brake, defended
explicitly: it is what keeps a free, cooldown-less Recall from being an escape
button. ⚑ This **supersedes** §2.3's constraint-table consequence that Recall
"joins the `freeFloorSkills` guard" — a retired skill joins nothing; the guard
list must simply not miss it.

**D8 — The two teachers lose their teaching role to the prune.** The Town
Crier's and the Wanderer's `teach_skill` rows (each holds *only* Recall) are
removed; the 2026-08-02 empty-destination prune then removes both *"Teach me
something."* rows with zero extra content work. Both keep their lore /
directions / quest rows. New teachings are ordinary later content.

**D9 — Level scaling scales the charge CAP.** The camp's heal is %-of-max per
tick, so its strength already scales with the pool for free; count is the axis
that is flat by default and visibly grows. Rate-of-regen and passive regen are
untouched (the standing rejection stands).

## 4. What gets retired

- `api/skills/recall.json` — deleted. Id 28 stays burned (pinned-id
  discipline).
- The `teach_skill` rows in `api/mobs/town-crier.json` and
  `api/mobs/wanderer.json` (their conversation blocks) — removed; the
  empty-destination prune cascades the *"Teach me something."* rows off both
  roots for free.
- Recall's 5 % cost, 5 min cooldown, and taught status — all gone with the
  skill.
- Persisted characters holding Recall: the chunk-4 load rule (*a loadout slot
  naming a retired skill is skipped, not fatal*) already covers the loadout;
  C1 must verify the spellbook-row path tolerates a retired id the same way.

## 5. Landmines

- **L1 — the wire kind must be pinned at birth.** The utility cast needs a new
  `ClientMessageBody` entry (the unions are append-only with explicit pinned
  values — §28 discipline). One message with a utility discriminator
  (recall/camp) beats two kinds; either way, pin it.
- **L2 — the cast path is welded to cooldown slots.** `CastingSlot` indexes
  `CooldownSlots[3]`; every reader (interrupt path, cast-bar wire, the
  cancel-on-death path) assumes a slotted skill. Utilities need their own
  casting state, and the survey must find *every* `CastingSlot` reader — a
  missed one is a silent no-op of exactly the R2/R3 silent-wiring class.
- **L3 — the refill source must exclude the mini-campfire, pinned by test.**
  If dwelling at a placed camp refilled charges (or bound the spawn), the
  loop is a perpetual motion machine. Safe *by construction* today — the dwell
  detector reads registered `CampfireAnchor`s, and a spawned camp never
  registers one — but that is exactly the kind of invariant that erodes;
  pin both directions (no bind, no refill) in Go.
- **L4 — "sit still" needs a definition.** Does moving cancel a channel, or
  only damage? Recall's live behaviour is the reference — whatever it does
  today is what players know; C1's survey must state it and C2 must match it.
  If movement does NOT cancel today, the camp channel probably wants it to
  (the PO sketch says *sit still*), which is then a deliberate difference to
  record, not an accident.
- **L5 — allegiance of the placed fire.** Real campfires get `FactionAligned`
  post-construction (`aurad.go` placement); a camp rides the spawnSummon path
  and is enlisted under its owner. Its heal must reach *all players* (no PvP,
  one side) — verify the heal aura's targeting against an owned structure, not
  an aligned one, and pin that a second player IS healed.
- **L6 — lifetime machinery.** Summons/totems: confirm what expires them today
  (charm has expiry; totems may be permanent-until-killed). The camp needs a
  tick-counted lifetime on an unkillable body — survey before assuming.
- **L7 — mobile.** Two new HUD buttons need a home in `html.mobile` and a
  touch answer (the `Interact.trigger()` tappable-twin precedent). Not
  optional — mobile is live.
- **L8 — the HUD charge counter rides the wire.** Charge count (and cap, or
  derive cap from level client-side — prefer deriving to avoid a second
  field) must reach `GameState`. New wire fields join the hygiene-wire-prune
  harness's expectations.
- **L9 — content references to Recall.** The help panel, any conversation
  lore lines, and harnesses that teach/equip Recall must be swept
  (`grep -ri recall` across `api/`, `frontend/`, `.claude/skills/verify/`).
  The two teach rows are the known ones; the sweep is for the unknown ones.
- **L10 — the free-floor guard.** First Aid's precedent: a `0` cost is an
  enforced property. Utilities sit outside the skill catalog, so the guard
  never sees them — but the guard (and any test enumerating `cooldown`
  skills) may currently *name* Recall and go red on its deletion. Run the
  full suite immediately after the retirement, before anything new is built.

## 6. Chunks

**C1 — Recall becomes a baseline utility (the new class, end to end).**
The smallest slice that proves the class: the pinned wire kind, the utility
casting state (cast bar included), the Recall button on desktop + mobile with
tooltip, free + no cooldown + 10 s interruptible cast, `recall.json` retired,
teach rows removed with the prune cascade verified, persisted-character
tolerance verified, content sweep (L9). Harness: a fresh level-1 character
recalls to the bound fire in their first minute, with no teacher visited; an
interrupted cast goes nowhere; the Town Crier no longer offers to teach.

**C2 — The mini-campfire (end to end).**
The camp mob definition (structure role, unkillable body, heal +dim light
aura skills, tick-counted lifetime) spawned at channel completion; one-per-
player replace; the charge store (cap-by-level, dwell refill at real fires
only, zeroed on death and session end); the Camp button + charge counter on
desktop + mobile. Harness: place → ally heals → fire expires; charge count
decrements at completion not at start; interrupt refunds; dwell at a real
fire refills; dwell at a placed camp does NOT; second placement replaces the
first.

C1 first — it builds the class C2 rides, and it is independently shippable
(free baseline Recall is round-8 item 1 on its own).

## 6a. C2 implementation plan (surveyed + PO-ruled 2026-08-03)

Four parallel code surveys against HEAD (post-C1). **Verdict: ready to
implement.** One §3 claim corrected in place (D5 — no replace pattern exists,
no owned-spawn tracking; the ruling stands, the mechanism is new work), the
rest of the landmines resolved as follows.

### Landmines answered by the survey

- **L2 — closed by C1.** The utility casting state, cast bar, press message
  and precondition seam all shipped; Camp plugs into `fireUtility`'s switch
  (`sys/skills.go:1486`) and `utilityPrecondition` (`skills.go:1469`).
- **L3 — structural today, still pinned.** `SetCampfireAnchors` has exactly
  one caller, boot-time `aurad.go:205` from authored `zone.Campfires`; the
  dwell detector iterates only that boot-frozen slice, and safe zones
  (`mob.SetSafeZones`) are boot-only too. A spawned camp can never bind,
  refill, or repel mobs unless someone adds a second caller — pin both
  directions in Go anyway (the invariant-erosion argument in L3 holds).
- **L4 — movement cancels casts today, unconditionally.** `core/input.go:346`
  `CancelCast()`s on any non-zero movement vector while alive; there is no
  per-utility movement opt-out (only damage has `CastInterruptedByDamage`).
  The camp channel inherits *sit still* for free; the "deliberate difference"
  branch of L4 is moot. Recall behaves identically, as players already know.
- **L5 — dissolves, differently than written.** A player caster can never
  `EnlistUnder`: `spawnSummon`'s `e.(model.Allegiance)` assert requires
  `AggroMask()`, which `*player` does not implement — every player summon
  takes `Align()` (skills.go:1999-2003). And `applyHealAura`'s eligibility is
  bespoke (skills.go:866-885): same **faction**, wounded, never-self — no
  target flags, no aggro-mask read. So an `Align()`ed camp heals every player
  and every aligned summon in range, owner included, itself never. Pin the
  second-player heal per §7; there is no owned-structure targeting gap.
- **L6 — the machinery exists and fits exactly.** `Mob.SetTTLTicks`
  (`mob.go:828`, spawn-site-only) counts down in `Mob.Update` and expires
  through the normal removal path granting no XP (`mob.go:925-932`). Totems
  already use it (300 + 30/level ticks); nothing about "permanent until
  killed" needs handling.
- **L7 — ruled, see below.**
- **L8 — one new wire field.** `GameState` tail is field id 22
  (`cast_utility`); `camp_charges:ubyte` appends as **id 23**, own-player
  block. Cap is **derived client-side from level** (no second field):
  `getLocalPlayerLevel()` (`client-data/Mobs.ts:89`) is the established
  mirror, and the cap curve joins `api/shared-constants.json` (the
  `skillPointCost` curve is the closest analogue), asserted by both
  languages' fixture tests.

### New PO rulings (2026-08-03, choice prompts)

- **Mobile stack order: Camp closest to the thumb.** Camp takes the spot
  directly above the tile row (the frequent mid-loop press), Recall moves one
  step up, Talk on top. Talk's hardcoded `bottom` offset moves again;
  `mobile-interact.mjs` updated with it. The six-tile row stays untouched
  (`mobile-layout.mjs` leg 5 pins it at six).
- **Charges survive an F5/reconnect — stash only, NO schema changes.** The
  count joins `reconnectStash` (`sys/state.go:75`) but **not** `deadState`
  and **not** `persist.CharacterState`: survives the ~10-min window, zeroed
  by death, logout and stash TTL — all in memory, the database untouched.
  This is the natural shape anyway (the stash carries "same session", the
  death carry deliberately doesn't).

### Decisions taken in planning (flagged here, not asked)

- **The camp def rides `entityType: "Campfire"`** — sprite reuse, since the
  wire EntityType enum is pinned and "Camp" resolves to nothing; button art
  and a distinct sprite stay [PLACEHOLDER] per §8.
- **Replace = `SetTTLTicks(1)` on the old camp, not `RemoveEntity`.** Calling
  `game.RemoveEntity` from inside `fireUtility` splices `SkillSystem.entities`
  while `Update` ranges it — the exact §27.1 skip/double-visit class
  `MobSystem` defers removals to avoid. Setting the old camp's TTL to 1
  expires it through the normal path next tick (≤1 tick of overlap,
  harmless). The index is `map[client-UUID]entityID` in `SkillSystem`, keyed
  by client UUID so it survives death/respawn (the `anchors` precedent);
  stale ids resolve to nil via `game.GetEntity` and need no fan-out cleanup.
- **Owner death lets the camp burn out on its TTL** (totem precedent; D2
  calls it a shared object). `doFuneral` would be the instant-removal hook
  but is dead code today — not revived for this.
- **Refill is to-cap, in the exactly-once dwell branch** (`state.go:1007`,
  next to the bind). Consequence: standing at a fire refills once per entry —
  spending charges while never leaving the dwell radius does not re-refill
  until you step out and back in. Accepted; the loop never does that.
- **A fresh character starts at 0 charges** — they spawn at a fire and the
  1.7 s dwell fills them, which is §2's "painless by construction" argument
  working as designed. No creation seeding.
- **Refusal is a new pinned `ActivationRejection` value `NoCharges`**
  (append-only wire enum, the §28 discipline), client text on the existing
  one-shot ("No camp charges — rest at a campfire").
- **The camp's aura is ONE skill with two effects** (`heal_aura` +
  `light_aura`) — the `campfire-aura.json` unequal-radii precedent verbatim;
  structures pin aura slot 0 always-on, so no multi-aura question exists.
- **`applyCamp` is a small hand-rolled spawn**, not a `spawnSummon` reuse:
  the verb set is `NewMob` → `Align()` → `SetOwner` → `RestoreToFullHealth` →
  `SetTTLTicks` → one `SetPosition` (`summonPosition` ring, blocker-aware) →
  `AddEntity` — `spawnSummon` itself wants an `EquippedSkill` that does not
  exist here, and the camp needs no `RaiseLoadoutLevels` (level-1 aura; the
  %-of-max heal scales with the target's pool for free, which is D9's own
  rationale). ⚑ A def referenced only from Go is invisible to the registry's
  `spawnMob` boot validation — pin `GetByName("Camp")` resolving in a test.

### Build order

1. **Content**: `api/mobs/camp.json` (role structure, `collisionLayer: 32` /
   `collisionMask: 16` — the campfire's structurally-unkillable body,
   `speed: 0`, `experience: 0`, `entityType: "Campfire"`) +
   `api/skills/mobs/camp-aura.json` (heal_aura + dim light_aura). Boot
   counts move: **86→87 skills, 64→65 mobs** — every harness/status pin
   that names them follows.
2. **Wire**: `client.fbs` `UtilityKind.Camp = 2` (the pinned comment already
   reserves it) · `server.fbs` `camp_charges:ubyte` (id 23) ·
   `ActivationRejection.NoCharges` · regenerate both binding sets (devops
   bundle copies move too) · extend `TestUtilityKind_GoConstantsMatchTheWireEnum`
   and the GameState codec round-trips.
3. **Charge store (Go, test-first)**: fields + accessors on the player
   struct (`CampCharges`/`SpendCampCharge`/`RefillCampCharges`), cap curve
   as one Go function + `shared-constants.json` entry + both fixture tests,
   the refill hook in `trackCampfireDwell`, the stash carry (stash struct +
   its writers/readers only — deadState untouched). Tests: cap-by-level,
   refill at dwell threshold, zero on death, carry through stash, L3 both
   directions (a camp mob near the player binds nothing and refills nothing).
4. **Camp utility (Go, test-first)**: `UtilityCamp` literal in
   `skills/utility.go` (Camp needs `CastInterruptedByDamage: true`),
   `utilityPrecondition` arm (charges > 0 at press AND completion — the C1
   two-site pattern, mutation-check the completion re-check),
   `fireUtility` → `applyCamp` (spend at completion — D4's interrupt-refunds
   falls out; replace via the UUID index + `SetTTLTicks(1)`). Tests: D4
   (interrupted cast spends nothing), replace (old camp gone within a tick,
   only one camp per owner), second-player heal (L5), TTL expiry removes it
   with zero XP, zero-charge press rejected with `NoCharges`.
5. **Codec**: `camp_charges` in the own-player block next to `cost_factor`,
   absent-reads-0 + round-trip tests.
6. **Frontend**: `UTILITY_NAMES[Camp]` (label + cast-bar name + press guard
   in one table) · second `<li data-utility="2">` in `#utilityBar` (the
   delegated pointerdown needs zero new wiring) · charge counter span on the
   button (`.cdRemaining` styling precedent, `tabular-nums`; count from the
   new snapshot field, cap derived from level) · disabled/greyed state at 0
   charges (unlike Recall, the client CAN see this state) · mobile: the
   ruled stack order in `HUD.mobile.less` (Camp at Recall's current offset,
   Recall +1 step, Talk +2; the `ul` needs a flex column since a second `li`
   currently stacks raw) · help-panel sentence.
7. **Harness** `r4-camp.mjs`: dwell at a fire → counter shows cap → warp
   out → place → cast bar "Camp" → camp entity appears + ally-heal evidence →
   counter decremented at completion (not at press) → move-interrupt leaves
   the counter alone → second placement replaces the first → dwell at the
   placed camp refills nothing → return to the real fire refills → camp
   expires on its TTL. Plus reruns: `hygiene-wire-prune` (field append),
   `r4-recall-utility.mjs`, `mobile-layout.mjs` (leg 5 six-tile pin;
   leg 7 stays red on the known nag bug), `mobile-interact.mjs` (Talk's new
   height), `campfire-bind-persistence.mjs` (the dwell branch gained code).
8. **Tail**: full Go suite vs Postgres · vitest · tsc · prod build · `-dev`
   boot 87/15/**65**/10/4/777/485/5, 0 errors 0 warnings · sim battery
   (byte-identity expected — no combat numbers move).

### Numbers (all [PLACEHOLDER], proposed for the first build)

- Channel: **150 ticks (5 s)**, damage- and movement-interruptible.
- Camp TTL: **450 ticks (15 s)** — mid of the ruled 10–20 s band.
- Heal: the regular campfire's strength and cadence (`healFractionOfMax 0.12`,
  `tickInterval 60`, `maxTargets 0`) at **half its radius — 0.75, not 1.5**
  (PO 2026-08-03, with the sprite). ⚑ Its floor is the PLACEMENT OFFSET:
  `applyCamp` puts the camp on the summon ring 0.8 units from the placer, and
  the query is collider-vs-collider, so 0.75 reaches a 0.25-radius body at 0.8
  with 0.2 to spare. Below ~0.6 the placer stops being healed by their own camp
  unless they walk onto it.
- Light: **radius 2.0** — Torch-band (2.5), well under Lantern's 4.0 (D6).
- Charge cap: ~~3 + ⌊level/10⌋~~ → **1 + ⌊level/7⌋** → 1 at L1, 2 from L7,
  3 from L14, 5 at L30. ⚑ **Retuned by the PO after the first hand pass**
  (2026-08-03), against §2's own "~3–5 at level 1" band: three charges was
  enough that a level-1 character never ran out, which makes the walk back to
  a fire optional and the whole loop invisible. The band in §2 is superseded
  by play.

## 7. Test strategy

- Go, test-first: the charge store rules (D3/D4/D5), the L3 invariant both
  directions, the L5 second-player heal, utility cast interrupt.
- Both chunks get a browser harness (`.claude/skills/verify/`), because the
  buttons, cast bar, and counter are exactly the wiring vitest cannot see
  (the round-4 lesson: a HUD that never pushes state leaves unit tests green
  with the feature dead on screen).
- Full Go suite + vitest + typecheck + prod build + `-dev` boot 0/0 per
  standing practice; sim battery untouched by construction (no combat numbers
  move — but run it anyway, it is cheap).

## 8. Open / deferred

- **All numbers [PLACEHOLDER]:** channel length, camp lifetime (10–20 s),
  camp heal tick (start = regular campfire), charge cap curve, dim-light
  radius, Recall cast length (10 s inherited).
- **World-drop charge sources** (§32's farming idea) — additive later, not
  now.
- **New teachings for the Town Crier / Wanderer** — ordinary content,
  whenever something fits.
- **Charge persistence** — deliberately none (D3); revisit on playtest
  feedback only.
- **Camp naming + button art** — with the chunk.
- **In-combat placement** stays possible by design (interrupt-by-damage is
  the gate, same as Recall) — watch item: a kiting player placing group
  sustain mid-fight. If it turns out degenerate, the fix is a combat gate on
  the *button*, not on the cast path.

## 9. Chunk ledgers

### C2 — The mini-campfire ✅ BUILT 2026-08-03

**Shipped.** `api/mobs/camp.json` (id 65, `entityType: "Campfire"` — the wire
enum is pinned and "Camp" resolves to nothing, so the sprite is reused) +
`api/skills/mobs/camp-aura.json` (id 138, heal + dim `light_aura` r2.0, the
`campfire-aura.json` unequal-radii precedent) · `UtilityKind.Camp = 2` and
`ActivationRejection.NoCharges = 4` pinned on the wire, `camp_charges:ubyte`
appended to `GameState` as id 23 · `skills.UtilityCamp` (150-tick channel,
damage-interruptible; movement already cancels every cast) + `CampChargeCap`
pinned to `api/shared-constants.json`'s new `campChargeCap` block by BOTH
languages' fixture tests · the charge store on `*player`
(`CampCharges`/`SpendCampCharge`/`RefillCampCharges`/`SetCampCharges`), refilled
in `trackCampfireDwell`'s exactly-at-threshold branch beside the bind, carried by
`reconnectStash` and by nothing else · `applyCamp` + the
`map[uuid.UUID]uint64` replace index on `SkillSystem` · the Camp button, its
charge counter and its greyed-at-zero state on desktop + mobile · new harness
`r4-camp.mjs`.

**Decisions taken in-chunk:**
- **The charge store is not a per-tick accumulator and has no death reset** —
  "zeroed on death" falls out of the respawn rebuilding the player struct, and
  the death scene (`deadState`) deliberately carries no count. It is pinned by
  test precisely *because* nothing in the code says so.
- **`SetCampCharges` clamps to the level cap**, so the stash restore cannot
  reintroduce a count the current level could not hold; it runs after
  `SetProgression`, since the cap is level-derived.
- **The refusal reaches the client through the existing one-shot** — C1 already
  established that a utility rejection sends skill id 0 and the client renders
  the reason alone, so `NoCharges` needed one enum value and one message string.
- **The button greys but stays pressable.** Unlike Recall, whose bind state the
  client genuinely cannot see, an empty store IS visible — so the refusal is
  shown before the press. Pressing it anyway is how a player learns why.

**⚑ Findings:**
- ⭐ **D5's premise was wrong in BOTH halves and the survey caught it** (already
  recorded in §3): there is no owner→summon index anywhere, and
  `OwnedEntities`/`doFuneral` is a vestige with no writers. The ruling stood;
  the index is new work. It is keyed by **client UUID**, not entity id, so it
  survives death and respawn (the `anchors` precedent), and replacement is
  `SetTTLTicks(1)` rather than `RemoveEntity` — removing an entity from inside
  `fireUtility` would splice `SkillSystem.entities` while `Update` ranges it,
  the §27.1 skip-a-survivor class.
- **`replaceStandingCamp` reaches its target through a structural assert**
  (`campExpirable`), which is the R2/R3 silent-wiring class — a `*mob.Mob` that
  stopped satisfying it would make replacement a silent no-op with every other
  test green. Guarded by a capability test on the real type.
- **A def referenced only from Go is invisible to boot validation.** Nothing in
  the boot path resolves `camp.json`: no zone spawn names it and no `spawnMob`
  effect does, so deleting or renaming it would turn the Camp button into a log
  line nobody reads. Pinned by `TestDiskContent_CampDefinitionResolves`.
- **⚑ `DAMAGE` takes a whole PERCENT and writes the pool directly** — it bites
  through godmode, while godmode skips `updateVitalSigns` entirely. That turned
  the harness's heal check from a noisy A/B into a clean **isolation**: the
  control window recovers `+0 %` because there is no regen to confound it, and
  the camp window recovers `+48 %`.
- **⚑ Open ground is prop-free, not MOB-free.** `(-23, 14)` is the documented
  clean tile for *pacing* measurements; a level-1 character standing there
  through the 20 s warp settle **died before the first press** on the harness's
  first run. There is no whole-unit tile that is both far from every campfire
  and clear of every mob spawn (the best is 5.1 units from one), so GOD is not
  optional in a script that stands still out there.

**Verified:** Go full suite `-count=1` against real Postgres green (incl.
`store` 26.9 s and `accounts` 16.7 s with `AURA_TEST_DB_URL` set — ⚑ without
that variable those packages SKIP silently and finish in milliseconds, which
reads exactly like a fast green run) · vet/gofmt clean · **two mutation runs,
each reddening exactly its own test**: deleting the completion re-check reddens
only the two `…RejectsAtCompletion` tests (Camp's and Recall's), and neutering
`SetTTLTicks(1)` reddens only `TestUtilityCamp_SecondPlacementReplacesTheFirst`
· vitest **155/155** · tsc · prod build · sim battery **byte-identical**
(TTK 6.67 s / TTD 8.70 s) · `-dev` boot **87 skills/15 factions/65 mobs/10
recipes/4 quests/5 props/5 campfires, 0 errors 0 warnings** · new
**`r4-camp.mjs` 24/24** (rerun after the retune, with the two new cap legs) · reruns all green: `hygiene-wire-prune` (0 webgl
losses, 0 console errors — the new field decodes), `r4-recall-utility` 12/12,
`campfire-bind-persistence` 6/6 (the dwell branch gained code), `chunk4-
persistence` 16/16, `mobile-interact` ALL (Talk at its new height),
`mobile-layout` green EXCEPT the **pre-existing leg-7 `#registrationNag` bug**
from C1 — leg 5 still pins the tile row untouched at six. The mobile stack was
probed directly, since the ruled order is hand-written CSS no harness asserts:
in a 390×844 portrait the tiles end at y=782, Camp occupies 701–771 and Recall
619–689, both on the right edge, no overlap, and the round Camp button reads
"Camp 3/3" over two lines.

**PO hand pass, same day — two changes, both taken:**
- **The charge cap dropped from `3 + ⌊level/10⌋` to `1 + ⌊level/7⌋`** (1 at
  level 1, 2 from 7, 3 from 14). One constant per language plus the fixture;
  the formula's shape did not move. ⚑ Two Go tests went red on it and both were
  right to: the role census (a new authored structure) and
  `TestReconnect_CarriesCampCharges`, which spent the character's ONLY charge
  and would then have asserted a carried 0 — the same value a broken carry
  produces. It now levels the character first, so the carried count is nonzero.
- ⭐ **The camp got its own wire `EntityType` (`Camp = 75`) so it could be drawn
  half-size.** The PO asked for "roughly 50 % smaller"; the camp was borrowing
  `Campfire`'s type, so the client could not tell the two apart. The cheap
  alternative — sizing the sprite from the wire `radius`, which already differs
  (0.25 vs 0.3) — was rejected twice over: it is only a 17 % difference, and it
  would make ART depend on a PHYSICS value, which is the "role inferred from an
  incidental number" defect the actor model's chunk 2 spent itself removing. So
  `camp.json` drops its `entityType` override (the name resolves now), a
  `Mobs.Camp` class renders the same artwork at 30 px against the campfire's 60,
  and it deliberately does NOT subclass `Campfire` — a camp can never be bound
  to, so it must never grow the dwell bind ring. The pinned enum is append-only,
  so this also leaves room for real Camp art with no second wire change.
- ⚑ The harness's charge assertions were **rewritten to be relative** (parse
  `n/m`, level to the ceiling, loop until empty) rather than matching `"3/3"`.
  A cap that has already been retuned once will be retuned again, and a harness
  that needs editing for a tuning change has stopped being evidence. It gained
  two legs in the process — the level-1 cap is ONE, and levelling raises the cap
  **without quietly topping the store up** — and is now **24/24**.
- ⚑ **The step-out-and-back that reproves the refill has to warp onto the FIRE,
  not onto the recorded home position.** Home is where the character *spawned*,
  a jittered point up to the respawn jitter radius away, and rounding that to a
  whole-unit WARP target lands outside the 0.75-unit bind radius — the refill
  then silently never fires and reads exactly like a broken refill. It cost one
  red run. The authored fires sit within ~0.2 units of a whole tile, so the fire
  itself rounds safely; the harness reads its position off the campfire layer.
- ⭐ **The sprite alone was the wrong half of the ask.** Shrinking the art left
  the camp healing over a full campfire's footprint — it *looked* half-size and
  was not, which is a worse state than either extreme. The heal radius went
  1.5 → **0.75** with it (the light stays 2.0, deliberately wider than the heal,
  exactly as the permanent fire's 7.0 is wider than its 1.5). Content-only;
  `r4-camp.mjs` stayed 24/24 with the heal still landing at +48 %, which is the
  check that mattered — the placer sits at the 0.8-unit placement offset, so a
  smaller radius could have silently stopped healing the person who placed it.
- ⚑ **`.width` on a PIXI mob container measures the AURA RING, not the sprite.**
  The first size check reported camp and campfire both at 423 px and looked like
  a change that had not taken; a screenshot with the two side by side showed the
  camp at visibly half size. Measure sprites by picture, or by the texture-
  bearing child — never by the container.

**Open, deliberately:** every number [PLACEHOLDER] (channel 150 ticks, TTL 450,
light radius 2.0, cap `1 + ⌊level/7⌋`, camp sprite 30 px) · Camp reuses the campfire sprite and
has no art of its own (§8) · no hotkey (D1's ruling: buttons; a key is one
`Controls` entry later) · in-combat placement stays possible by design (§8's
watch item).

### C1 — Recall becomes a baseline utility ✅ BUILT 2026-08-03, committed `ec389164`, deployed live same day — **PO-VERIFIED IN-GAME 2026-08-03**

**Follow-up, same day (PO after the in-game pass):** the mobile Recall button
moved from the LEFT edge to the RIGHT — the left half of a phone screen is the
joystick, so nothing tappable may live there. Recall now holds the spot
directly above the tile row on the right (always present, the thumb side) and
the **Talk button stacks one step above it** when an actor is offered — Talk is
transient, Recall is permanent, so Recall gets the closer reach. CSS-only, two
rules in `HUD.mobile.less`; verified with `mobile-interact.mjs` (Talk at its
new height) and a two-button stack probe. Committed with this note.

**Shipped.** `recall.json` deleted (id 28 burned), both teach rows removed,
`skills.UtilityKind`/`UtilityDef` (Go literals — the class is deliberately not
catalog content), `UseUtility` pinned at `ClientMessageBody = 11` with a
`UtilityKind` wire **enum** (None=0, Recall=1 — the ActivationRejection
precedent, pinned cross-language by `TestUtilityKind_GoConstantsMatchTheWireEnum`),
utility casting state on `SkillComponent` (`CastingUtility` + `PendingUtilities`,
mirroring the slot vocabulary), `cast_utility:ubyte` appended to `GameState`
(shares the two tick fields — one cast at a time), `#utilityBar` +
`features/utilities/Utilities.ts` (desktop panel between the loadouts; mobile a
fixed round button above the tile row on the LEFT, the interactButton mirror —
the six-tile row is width-saturated and must not grow), help-panel sentence,
new harness `r4-recall-utility.mjs`.

**Decisions taken in-chunk:**
- **The rejection wire needed nothing new**: the client renders the REASON
  alone (`activationRejectionMessage(reason)` — the skill id was never read),
  so a utility refusal sends id 0 + `NoAnchor` through the existing one-shot.
- **The cast bar needed one field, not a rework**: the client bar was already
  slot-agnostic; only the server's `CastingSkill()` was welded to
  `CooldownSlots` (L2 confirmed). The utility branch runs FIRST in
  `advanceCast`, because during a utility cast `CastingSkill()` is nil by
  construction and the slot branch reads nil as "unequipped mid-cast".
- **Every cancel site covered by construction**: `CancelCast()` clears both
  casting states, so movement / aura switch / other-press / respawn needed no
  new calls; only `CancelCastOnDamage` learned the utility flag. Mutual
  exclusion pinned both directions in component tests.
- **Utility presses ride their own message** (not `Input.cooldown_activations`,
  which is slot-indexed `ubyte`), drained in `PlayerInputSystem.Update` next to
  `NextInput`, health-gated — the dead do not recall.

**⚑ Two plan-doc corrections (recorded in place here):**
- **D8's prune-cascade claim was WRONG**: `pruneEmptyDestinations` fires only
  for a destination that *authored* options but *presents* none (the lore-leaf
  carve-out) — deleting just the Recall option leaves `teachings`
  authored-empty and the *"Teach me something."* row ALIVE, leading to a dead
  screen. The row and the node were deleted **together, in content**, on both
  NPCs; the prune contributed nothing.
- **§2/§6's "existing fallback ladder" is the RESPAWN path's.** Recall is
  deliberately fail-closed (`AnchorOf` or refuse with `NoAnchor` — never
  default spawn) and stays so as a utility, checked at press AND completion.

**⚑ Findings:**
- **The chunk-4 "retired skill skipped, not fatal" rule covered the LOADOUT
  only** — the spellbook restore loop validated nothing, so a persisted
  character taught Recall would carry ghost id 28 into live state, onto the
  wire (`Discovered()` ships raw ids) and into `SpentPoints` (which prices an
  unresolvable entry pessimistically, points the player can never refund).
  Closed with a registry check + warn-skip in `sys/persist.go`, pinned by
  extending `TestRestoreDropsASlotForARetiredSkill` (proven red first).
- **Deleting `recall.json` alone is a hard BOOT failure, not a red test** —
  teach grants resolve skills by name at load; the file, both teach rows and
  the 87→86 registry pin had to land as one edit (L10 held: full suite run
  immediately after, green).
- **⚑ NEW BUG, pre-existing, found by the mobile-layout re-run:
  `#registrationNag` covers the open mobile sheet** — the accounts-chunk nag
  has no mobile home, sits over the journal button (probed:
  `elementFromPoint` at the button's centre returns the nag), so
  journal-from-sheet is dead on phones. Confirmed on a HEAD frontend build
  (stash + rebuild) — NOT this chunk's regression, the same accounts↔mobile
  merge class as backlog §49. Where the nag belongs on a phone is a PO call;
  `mobile-layout.mjs` leg 7 stays legitimately red until it is fixed.
- `mobile-layout.mjs` still joined through the deleted `#startForm` (written
  on the pre-accounts-merge line) — repaired to `joinAsNewCharacter` with this
  chunk per the rot rule.
- `SkillTooltip.ts`'s `case 'recall'` line is now unreachable (no catalog
  skill carries the effect) — left in place: the effect type is engine
  vocabulary and C2-era content may reuse it.

**Verified:** Go full suite `-count=1` against real Postgres green · five new
sys behavior tests + seven component tests + codec pin/round-trips (component
API proven red first; the completion re-check mutation-tested — deleting it
reddens exactly `TestUtilityRecall_AnchorLostMidCastRejectsAtCompletion`) ·
vet/gofmt clean · vitest 154/154 · tsc · prod build · boot **86 skills**
(87−1)/15 factions/64 mobs/10 recipes/4 quests/777 props/485 spawns/5
campfires, 0 errors 0 warnings · **`r4-recall-utility.mjs` 12/12** (bind →
warp 37 units out → cast bar "Recall" → move-interrupt goes nowhere →
completion lands 1.04 units from home → crier offers no teaching) ·
`hygiene-wire-prune` clean (643 sprites, 0 errors — the .fbs adds decode) ·
`chunk4-persistence.mjs` 16/16 · `chunkC4-quests.mjs` 37+1 SKIP ·
`mobile-layout.mjs` green EXCEPT the pre-existing leg-7 nag bug above (leg 5
pins the tile row untouched at six). ⚑ This box: harness against the
`aura-pg` Docker Postgres; `AURA_JWT_KEY` must be ≥32 CSPRNG bytes or the
accounts endpoints refuse to start (boots, then exits).

**Open, deliberately:** the Recall button has no hotkey (buttons are D1's
ruling; a key is one `Controls` entry later) · no disabled/greyed state while
unbound (the client cannot see bind state; the NoAnchor floating text is the
feedback) · every number [PLACEHOLDER] (cast 300 ticks inherited).
