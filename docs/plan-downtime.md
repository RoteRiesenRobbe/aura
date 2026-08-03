# Plan: Downtime agency + baseline Recall (R4)

> **Status: DESIGNED 2026-08-03 (design session, no code).** This is R4 from
> `plan-resource-costs-feedback.md` §6, widened 2026-08-02 by intake round 8
> item 1 (`plan-playtest-feedback.md`). All nine design questions ruled by the
> PO in one session, as choice prompts. Chunks C1–C2 below are ready to
> execute. Every number is [PLACEHOLDER].

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

**D5 — One camp per player; placing again replaces.** The summon machinery
already tracks owned spawns; replace is the existing pattern. Different
players' fires may overlap — only self-stacking is closed.

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

*(filled per chunk as they ship)*
