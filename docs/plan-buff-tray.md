# Plan: the buff tray

> **Status: DESIGNED + APPROVED 2026-10-01 (one PO session, D1-D15 taken as
> choice prompts after a mockup round), nothing built, 3 chunks + an optional
> content C0. ⭐ §7 approved the same day, PO: *"All approved though things
> might change in implementation obviously."*** Line refs come from a survey of
> HEAD `7455f46e` on 2026-10-01; re-verify before executing.

Origin: `plan-world-effects.md` D22 + D30 (PO 2026-09-28, verbatim: *"all
effects need to be visible inside a hud element. potentiall a buff / debuff HUD
element that we still need to build. In this element, short and long term buffs
and debuffs are listed in circles, with the time inside the circle going down by
emptying the circle."* and, an hour later: *"Lets move the UI elements out, we
need a fully new plan that displays currently active buffs and debuffs."*)

The PO's brief for this plan (2026-09-28): similar to WoW, a section of the HUD
that displays the current beneficial and harmful effects, split across these two
categories; time remaining is indicated by colour leaving the circle in a
circular motion; hover shows the exact remaining time.

Mockups the rulings were taken against: `docs/mockups/buff-tray-placements.pdf`
(8 pages, kept as a reference: PO 2026-10-01 *"it's a good reference for
later"*). Method: a Playwright run against the live game at HEAD, a fresh
level 8 character with all nine slots filled in the wolf camp, the tray
injected as DOM into one frozen mid-fight frame, three placements by two
splits, then `page.pdf`. The script was a throwaway and was not kept.

---

## 1. What this is

A HUD element, the **buff tray**, above the action bars, that shows every
timed effect currently on the own player as a circle: the skill's icon, with
the time already gone darkening the circle clockwise from twelve so that what is
left stays lit. Two groups, beneficial on the left and harmful on the right,
anchored at the centre line of the ability bar. Hover (desktop) or a held tap
(phone) opens the skill's own ability tooltip with a time line added.

It is the first time the client is told WHICH skill is on the player and FOR
HOW LONG. Today the wire carries an 8 bit presence mask
(`applied_effects`, `api/schema/server.fbs:565`) with no skill id and no
duration, and the only duration the client ever receives for anything is the
cooldown slots' remaining ticks.

### What it is not

- Not a change to any effect's behaviour. Nothing in the buff store
  (`backend/pkg/aura/skills/buffs.go`) changes meaning; it only learns to
  report itself.
- Not a tray for mobs or other players. Their effect dots under the overhead
  bar stay (`EffectPips.ts`); only the OWN player's dots retire (D10).
- Not the world-effects plan. Long wall-clock effects and heir buffs become
  tenants here (D9), but their state, message and controller belong to
  `plan-world-effects.md`; this plan fixes the contract a tenant has to meet
  (§3.8).
- Not the stun diminishing-returns window (D9, declined).

---

## 2. Decision ledger (PO 2026-10-01, taken as choice prompts)

| # | Ruling |
|---|---|
| **D1** | A circle shows the **skill's icon**, the remaining time as the **lit part**; the exact seconds only in the tooltip. |
| **D2** | An effect that is refreshed (an aura you stand in refreshes every aura beat) **fills the circle up again on each refresh**. PO: *"Fill it up again on each refresh"*. So a circle pulses at the aura's beat while you stand in range and drains out for good when you leave. |
| **D3** | **Placement: above the action bars, bottom centre** (mockup placement 3). Chosen over "above the Focus/XP bars" and "under the minimap" after the PDF. |
| **D4** | **Two boxes side by side** in one row: beneficial left, harmful right, a wider gap between (mockup split B). PO: *"two 'boxes' next to each other (not visible as boxes, just how buffs are placed in them)"*. No frame is drawn. |
| **D5** | The boxes are **anchored at the centre line**: beneficial grows leftward, harmful grows rightward, the gap stays over the middle of the ability bar and no circle moves when the other box changes. |
| **D6** | Within a box, **newest nearest the centre, never reordered** while an effect lives. |
| **D7** | **No cap. Overflow wraps to a second row** (against the recommended cap of six with a "+N" circle). |
| **D8** | **Phone: under the Focus/XP bars along the top edge**, right-aligned, two boxes at a smaller circle size. |
| **D9** | **Tenants**: timed skill effects (everything the buff store holds with a timer) · world effects and heir buffs · **always-on passives and the active aura's drawbacks** as permanent circles with no wedge. ⛔ NOT the stun resistance window. |
| **D10** | The own player's **effect dots retire**. Mobs and other players keep theirs. |
| **D11** | **One circle per skill** (the buff store's key). The wedge shows the longest remaining application; the tooltip may list the streams. |
| **D12** | The tooltip shows the **effect description**, not only the time. On the phone a **held tap of about half a second** opens it; a plain tap does not. PO: *"a tap on the phone does not open it instantly, it needs to be held for a short time, half a second maybe"*. |
| **D13** | **The effect kind decides the side.** Slow, dot, stun and an aura's drawbacks are harmful; everything else is beneficial. World effects carry their own debuff flag. Nothing is authored. |
| **D14** | The tooltip is **the skill's ability tooltip plus a time line**: the same surface the spellbook and the slots use. |
| **D15** | ⭐ **Wire: change-only, inside the owner block.** Per effect: skill id, expiry tick, total ticks, kind. The buff store gets a revision counter like the spellbook's, and the existing gate resends the block on apply, refresh or expiry. Zero bytes and zero encode on quiet ticks; the client derives the time left from the snapshot tick it already reads. Taken after the PO asked for a performance-minded comparison (*"can we learn from another mmo like wow?"*, §4). |

---

## 3. The design

### 3.1 The model: what a tenant is

A **tenant** is anything the tray draws. Three sources, one shape:

| source | time base | where the client learns it | side |
|---|---|---|---|
| timed skill effects (D9) | server ticks, 30/s | `GameState.own_effects` (§3.2) | by kind (D13) |
| world effects and heir buffs (D9) | wall clock seconds | the world-effects message (`plan-world-effects.md` §3.9) | its debuff flag |
| always-on passives and aura drawbacks (D9) | none (no wedge) | derived from the loadout already on the wire (`passive_slots`, `active_aura_slot`) and the skill catalog | passives beneficial, drawbacks harmful |

The tray does not care which: a tenant is `{key, skillId or icon, side,
fraction(now) or null, tooltip()}`. Two time bases meet only inside each
tenant's own `fraction()`.

**Timed skill effects.** The buff store (`skills.Buffs`, `buffs.go:31`) keys
entries by granting skill and holds, per skill, one or more streams of
different strengths, each with `ticks` left (`buffEntry`, `buffs.go:42`).
Twelve payload kinds exist: resist, slow, speed, lifesteal, reflect, tick rate,
dot, hot, shield, calm, stun, charm (`buffs.go:252-629`). One circle per skill
(D11): the projection reports, per skill, the stream with the most ticks left.

**Side by kind (D13).** Harmful: `slowPayload`, `dotPayload`, `stunPayload`.
Beneficial: the rest. Calm and charm never land on a player today; they are
classified beneficial-by-default and listed in §10 so nobody is surprised if
that changes. An active aura's drawbacks (`plan-aura-drawbacks.md` C1, the
while-active self modifiers) are harmful and permanent.

### 3.2 The wire (D15)

Three additions, all appended, none changing an existing field:

```
// common.fbs
enum EffectKind : ubyte { None = 0, Resist, Slow, Speed, Lifesteal, Reflect,
                          TickRate, Dot, Hot, Shield, Calm, Stun, Charm }

// server.fbs
struct OwnEffect {
  skill_id:ushort;
  kind:EffectKind;
  total_ticks:ushort;   // the lifetime this application started with
  expires_tick:ulong;   // the server tick it ends on; GameState.tick is the clock
}

table GameState { ... own_effects:[OwnEffect]; }   // appended at table end
```

- **It rides the owner block.** `codec.CharacterGameState.MarshalFlatbuf`
  builds the block only when `!gs.SkipOwnerState` (`codec/gamestate.go:457`),
  and `owner_state:bool` is the explicit presence bit (perf chunk 3, F1). The
  vector is built inside that branch. An empty vector with `owner_state` true
  means "nothing on you" and the client clears the tray; the client never
  infers presence from emptiness (§10).
- **The gate learns one more counter.** `NetSystem.ownerStateGate`
  (`core/net.go:56`) compares `ownerStateWatch{level, skillRev, questRev,
  conversingWith, nextForce}`. It gains `buffRev`, read from a new
  `Buffs.Revision()` that every mutation bumps: each `Apply*` (insert, a new
  stream, or a refresh that bumps a stream's ticks) and every DELETION site,
  wherever it lives: expiry in `Tick()` (`buffs.go:522`), `dropPayload`
  (`:674`, a calm broken by damage or a charm reverted) and
  `dropDepletedShields` (`:911`, a shield burned down to zero). Same pattern as
  `SkillComponent.revision`
  (`component.go:163-167`, bumped at `:442-480`).
- **Expiry, not ticks left.** `expires_tick = game.Tick + ticks` at encode
  time. A per-tick countdown would change every tick and defeat the gate; an
  expiry tick changes only when the store does. The client computes
  `left = expires_tick - snapshot.tick` every frame and
  `fraction = left / total_ticks`. `GameState.tick` is already decoded and
  read (`SnapshotFactory.ts:66`, `Backend.ts:406`).
- **A refresh is visible as a change.** A refresh with identical strength bumps
  the stream's ticks back to the lifetime (`buffs.go` header), so `expires_tick`
  moves, the revision bumps, the block resends, and the client sees
  `left == total`: a full circle (D2). `total_ticks` is stored on the entry at
  apply and refresh time (a new `total int` beside `ticks`).
- **The heartbeat stands.** The block also resends every
  `ownerStateHeartbeatTicks` (5 s, `core/net.go:33`), so a lost change heals
  itself within five seconds.
- `cooldown_remaining_ticks` stays OUTSIDE the gate as today (chunk 3 L3); it is
  not a tray tenant.

### 3.3 The element (D3-D7)

- `#buffTray` in `#bottomCenter` above `#actionBars` (`HUD.html:339-395`),
  below where `#castBar` appears. Centred on the ability bar.
- Two flex groups: `.beneficial` right-aligned to the centre line and growing
  left, `.harmful` left-aligned to it and growing right (D5), a gap of about
  22 px between the two inner edges. [PLACEHOLDER] every size: circle 46 px,
  3 px ink rim, 6 px between circles, as in the mockup.
- A circle: the icon token the slots use (`IconToken.createIconToken`,
  `IconToken.ts`), clipped round and filling the circle; over it a
  `conic-gradient` from twelve o'clock darkening the elapsed share
  (`--gone: (1 - fraction) * 360deg`). This is the cooldown slot's technique
  (`.cdSweep`, `HUD.less:1523`) with inverted meaning: on a cooldown the dark
  part is what is still locked, here it is what has passed. Harmful circles
  carry a dark red rim; the pack icons' own art does the rest.
- Order (D6): a new tenant is inserted at the inner end of its box and the
  existing ones shift outward once; positions are stable until a tenant leaves.
- Overflow (D7): `flex-wrap`, the second row grows upward (`flex-direction:
  column-reverse` on the box or `wrap-reverse`), so the first row stays glued
  to the bar.
- Always-on circles (D9, no wedge): sit at the OUTER end of their box so the
  timed ones, which come and go, own the inner positions (§8 Q4 if the PO
  disagrees).
- Frame budget: the wedge angle is one style property per circle per frame;
  the DOM changes only when the tenant set changes. No rAF of its own: the
  update rides the existing HUD update path the cooldown sweep uses
  (`HUD.updateCooldownLoadout`, `HUD.ts:1042`).

### 3.4 The tooltip (D12, D14)

- Desktop: `attachTooltips` (`SkillTooltip.ts:1220`) on the tray, rendering
  `formatSkillTooltip(def, level, powerScale)` (`:892`) with one appended line
  `N s left` (and `permanent` for an always-on circle). Same `#skillTooltip`
  element, same hover-only wiring, so the MouseManager `pointerdown` gotcha does
  not apply.
- Phone: a **hold of 500 ms** [PLACEHOLDER] on a circle opens the same tooltip;
  pointer up, a move past a few px, or a tap elsewhere closes it. Built on
  `pointerdown` + a timer (never `click`, CLAUDE.md). The first touch path a
  tooltip has in this HUD; `attachTooltips` grows the hold variant rather than
  the tray growing its own.
- The level the tooltip scales to: the own spellbook level for the player's own
  skills (`levelOf`, as `attachSkillTooltips` does, `:1247`); for a skill cast
  by someone else the catalog level 1 with the scaled lines as they are (§8
  Q1).

### 3.5 Phone layout (D8)

Under `#vitalSigns` on the top edge (`HUD.mobile.less:141`: the bars sit at
`top: @mobile-edge`, from the menu button to the right edge), right-aligned,
circles about 36 px [PLACEHOLDER], the same two boxes. `html.mobile` is the
switch the rest of the phone HUD uses (`Mobile.ts`). The bottom right stays the
action tiles' and the thumb's.

### 3.6 Retiring the own player's dots (D10)

`Player.ts:106` feeds `character.setAppliedEffects(entity.appliedEffects)` for
the own character; that call goes, so the own overhead bar draws no pips.
`EntityManager.ts:184` keeps feeding every other entity. `applied_effects`
stays on the wire for them. ⚑ `EffectPips.ts`'s header and the `applied_effects`
comments in `server.fbs:561-565` say "the client draws the pips from it";
amend both to say "for others".

### 3.7 Always-on tenants (D9)

Derived on the client, no wire: one beneficial circle per equipped passive
(`passive_slots`), one harmful circle per active aura whose definition carries
while-active drawbacks (`stat_multiplier` self modifiers with a drawback sign,
the tooltip already reads them, `SkillTooltip.ts`). Permanent circles have no
wedge. One circle per skill (D11), so an aura with four drawbacks is one circle
whose tooltip names all four.

### 3.8 The contract for world effects and heir buffs (D9)

What `plan-world-effects.md` §3.9 offered is what a tenant needs, so the
contract is: `{key, icon, name, started_at, expires_at (wall-clock seconds),
debuff flag, tooltip lines}`. The tenant's `fraction()` is
`(expires_at - now) / (expires_at - started_at)` on `Date.now()`, so an
extension (world effects D4) refills it in part, exactly as that plan described.
The adapter from that message to a tenant is world effects C2's; this plan
exposes `BuffTray.register(tenant)` / `unregister(key)` for it.

---

## 4. Performance (the question behind D15)

WoW sends an aura update only when something starts, refreshes or ends (spell,
duration, expiry), and the client counts down by itself; nothing about auras
streams per tick. The three candidate shapes here, measured against the numbers
the perf plan recorded:

| shape | quiet tick | per change | notes |
|---|---|---|---|
| **change-only inside the owner block (D15)** | **0 B, 0 encode** | the owner block resends once (~150-250 B) | the gate exists (`68946f78`); one counter added |
| per tick like `cooldown_remaining_ticks` | 60-80 B at ten effects, encode every tick | n/a | a quarter to a third on top of the 233 B/tick/player steady state after chunk 3 |
| a separate change-only message | 0 B | ~10 B per entry | a second delivery path with its own join resend and ordering; WoW's literal shape |

Refresh cadence under D2 and D15: an aura you stand in refreshes its effect
every aura beat, so the block resends about once per second per such effect,
not thirty times. A player who stands in their own Heal aura costs about
150-250 B/s of owner-block resends against the 7 kB/s a snapshot stream already
is. If that ever matters, the tray vector can move behind a gate of its own
with a second presence bit; not now (§10).

Encode: the projection (§3.1) runs only on ticks that send the block. It is a
walk over a map of at most a few dozen entries. The idle-alloc pins
(`*_alloc_test.go`) stay the guard against a new per-tick allocation; the
projection must write into the builder directly, as `CooldownRemainingMarshalFlatbuf`
does (`codec/gamestate.go:224-231`).

Client: one `--gone` style write per circle per frame; DOM churn only on
membership change.

---

## 5. Fun and fairness

- Readability in a fight: the harmful box sits right over the ability bar, the
  one place the eyes already return to for cooldowns. A slow or a stun becomes
  a circle with a name the moment it lands, where today it is a coloured dot
  under the avatar.
- D2's pulse is honest: a circle that fills on every beat says "this is being
  kept up on you", and the first drain that is not refilled says "you are out
  of its range".
- No information advantage: the tray shows what is on YOU. Other players' and
  mobs' effects stay the dots they are.

---

## 6. Schema and wire impact (stated per the standing rule)

- **DB: NONE, verified 2026-10-01.** `sys/persist.go` never reads the buff
  store (no `Buffs` reference in the file), so nothing here touches accounts,
  characters, the ledger or loadouts.
- **Wire: +1 enum (`EffectKind`, `common.fbs`), +1 struct (`OwnEffect`), +1
  `GameState` field (`own_effects`, appended at table end, inside the owner
  block).** Regenerate both bindings (`api/schema/make.sh`). Pin the enum's
  members in `api/shared-constants.json` with Go and vitest twins, as
  `applied_effects` is pinned (§35 C4c). Re-run `hygiene-wire-prune.mjs`.
- **Conf: NONE.**
- **Content: NONE required.** Optional C0: `icon` on the eleven mob skills that
  put a timed effect on a player (§7), otherwise their circles show the letter
  fallback (`IconToken.ts`, `letterFallback`).

---

## 7. Chunk breakdown (APPROVED 2026-10-01)

| chunk | what | depends on |
|---|---|---|
| **C0 (optional, content)** | `icon` (and `packIcon` where the pack has one) on the mob skills that land a timed effect on a player. Census at HEAD, 11 of 42: `bomb-burst`, `ember-aura`, `fire-elemental-aura`, `fire-totem-aura`, `giant-venom-spit`, `rally-drum`, `spider-web-aura`, `totem-aura`, `venom-spit`, `warbanner-shield`, `warlord-cleave`. No mob skill carries an icon today. | nothing; the `add-content` skill |
| **C1 (server)** | `Buffs.Revision()` bumped on every mutation and expiry; `total` on `buffEntry`; `Buffs.OwnEffects()` projection (one per skill, longest stream, kind); `EffectKind` + `OwnEffect` + `own_effects` on the wire inside the owner block; `ownerStateWatch.buffRev`; the shared-constants pin. | nothing |
| **C2 (client, desktop)** | Decode; `BuffTray.ts` (pure tenant set, ordering, wrap, fraction) + the element above the action bars; circles with icon and wedge; countdown off `snapshot.tick`; hover tooltip with the time line; retire the own player's dots (D10). | C1 |
| **C3 (client, phone + always-on)** | The phone placement under the bars; the 500 ms hold tooltip in `attachTooltips`; passives and aura drawbacks as permanent circles. | C2 |
| *(world effects C2)* | World effects and heir buffs as tenants through §3.8. Owned by `plan-world-effects.md`. | C2 here, and that plan's approval |

### Test strategy

- **Go (C1).** `skills/buffs_test.go`: the projection picks the longest stream
  per skill and reports its kind and total; the revision bumps on insert, on a
  new stream, on a refresh, on expiry, and on an early removal (a shield
  burned down, a calm broken), and does NOT bump on a quiet `Tick()`. `core/net_ownerstate_*_test.go`: a buff change resends the block on
  the same tick; a quiet buff store adds zero bytes (extend
  `net_ownerstate_bytes_test.go`'s steady-state run with an effect that does
  not refresh). `codec/gamestate_test.go`: round trip of `own_effects`,
  `expires_tick` relative to `tick`. The alloc pins stay green.
- **vitest (C2, C3).** `BuffTray.test.ts` on the pure module: fraction from
  expiry and tick, clamp at 0 and 1, insert-at-inner-end ordering, stable
  positions, wrap at the width, side by kind, an empty vector clearing the set.
  The shared-constants twin for `EffectKind`.
- **Harness (C2, C3).** A new `buff-tray.mjs`: fire Swift (a beneficial circle
  appears and drains, the tooltip reads the Swift tooltip plus a time line);
  switch Heal on while hurt (`DAMAGE 50`, a hot circle that refills every beat,
  D2); stand in the giant spider's web with GOD OFF (a harmful slow circle;
  ⛔ needs the DEBUG zone set, `c2-player-cc.mjs`'s venue); leave the web (the
  circle drains out and disappears); no pips under the own overhead bar
  (D10) while a wolf beside you still carries its dot. Phone legs under
  `?mobile`: placement under the bars, a 200 ms tap opens nothing, a 600 ms
  hold opens the tooltip. Re-run `hygiene-wire-prune.mjs` (any `.fbs` change),
  `mobile-layout.mjs` (the phone HUD), `c2-player-cc.mjs` (it asserts the Slow
  pip on the own player today: that leg flips to the tray, rule 8 of the
  harness rules).
- **In-game (every chunk).** Desktop and a real phone; the PO's look at the
  wedge direction, the pulse (D2), the gap and the sizes.

---

## 8. Open questions

- **Q1. The tooltip's level for an effect cast by someone else.** A wolf's slow
  carries the wolf's skill at the wolf's level; the catalog scales by level and
  the client does not know the caster's. Proposal: level 1 and say so in the
  time line (`from a Wolf` would need the caster on the wire, YAGNI).
- **Q2. Icons for mob skills.** C0 authors them, or the circle draws the effect
  kind's glyph in the kind colour (the pips' colour language) when the skill
  has no icon. Proposal: C0, since a kind glyph is a second icon table to keep.
- **Q3. The Focus bar's shield segment** stays beside a shield's circle (two
  axes, time and absorb HP). Proposal: yes, both; the circle is the time, the
  bar is the amount.
- **Q4. Where always-on circles sit** (§3.3 puts them at the outer end).
- **Q5. Dead, flying, spectating:** the tray hides with the rest of the HUD
  (`HUD.hide()`); a flight shows no circles. Proposal: yes.
- **Q6. An upper bound on `own_effects`.** Bounded today by distinct skills
  (121 at HEAD, a dozen in practice). Proposal: no cap on the wire, D7 has none
  on screen; record the practical maximum at the in-game pass.

---

## 9. Proposals adopted without a choice prompt (PO may veto any)

- P1. `expires_tick` as a `ulong` to match `GameState.tick`; no packing.
- P2. `EffectKind` as a new enum rather than reusing the `applied_effects`
  bits: that mask is full (bit 7 is the last, `applied_effects.go`) and
  conflates stun with slow; the tray needs twelve distinct kinds.
- P3. Calm and charm classified beneficial-by-default (they never land on a
  player today).
- P4. The hold time 500 ms, the circle 46 px desktop / 36 px phone, the gap
  22 px: all [PLACEHOLDER], tuned at the look.
- P5. Always-on circles at the outer end (§3.3).
- P6. The tooltip's time line format `12 s left`, `permanent` for always-on;
  the hot's refill shows as the number jumping back up, no extra marker.

---

## 10. Landmines

- **Never infer presence from emptiness** (perf chunk 3 F1). The tray vector
  rides `owner_state`; on a tick with `owner_state` true and an empty vector
  the tray CLEARS. On a tick without the block the tray keeps counting down
  from the last expiries it was told. Test both.
- **The revision must bump on every REMOVAL, not only on apply.** Three
  deletion sites, only one of them an expiry: `Tick()` (`buffs.go:522`),
  `dropPayload` (`:674`, calm broken by damage, charm reverted) and
  `dropDepletedShields` (`:911`, a shield absorbed to zero). Miss one and the
  circle lingers until the 5 s heartbeat. The C1 test lets an effect expire AND
  burns a shield down early, asserting the resend on that same tick both times.
- **A refresh with a WEAKER strength opens a second stream** rather than
  bumping the first (`buffs.go` header). The projection's "longest stream" rule
  keeps the circle honest; a test with two strengths pins it.
- **`cooldown_remaining_ticks` stays outside the gate.** Do not "tidy" it into
  the block; it changes every tick (chunk 3 L3, F2).
- **GOD refuses slow and stun** (CLAUDE.md gotchas), so every harmful-circle
  harness leg runs with GOD OFF and the level raised first.
- **No mob skill has an icon** (42 of 42 at HEAD); without C0 the harmful box
  shows letters. The content editor's icon picker works on mob skills too
  (`content-editor-skills-tab.mjs`).
- **Harnesses that read the OWN player's pips go red at C2 (D10).** Eight
  scripts touch pips at HEAD (`grep -ln "EffectPips\|pip" .claude/skills/verify/*.mjs`):
  `c2-player-cc` (the own Slow bit) and `swift-cooldown` (the own Speed pip)
  certainly, `c5-bars` (own overhead-bar geometry) probably; `c2-frost-shield`,
  `chunk2-calm`, `chunk3-charm`, `backlog33-prehot` and `c5-ability-bar` read a
  mob's or another player's pips and stay. Check each at C2 and rewrite the own
  legs to read the tray (harness rule 8), never leave one red.
- **The mockup frames showed the column empty.** Neither the cast bar nor the
  conversation panel was up when placement 3 was ruled, and both live in
  `#bottomCenter` with the tray. §3.3 puts the tray between the cast bar and
  the action bars; the in-game pass must look at it with a cast running and
  with a dialogue open.
- **The owner block's resend is the WHOLE block.** A tenant that refreshes
  every beat resends the spellbook vector with it. Fine at the numbers in §4;
  if a future tenant refreshes every tick, give the tray its own gate rather
  than moving it outside.
- **`window.game.pause()` throws in the browser** (`Cannot read properties of
  undefined (reading 'stop')`, seen while taking the mockups). Not this plan's
  defect; noted for whoever next reaches for it.

---

## 11. Chunk ledgers

*(filled in per chunk at execution time)*
