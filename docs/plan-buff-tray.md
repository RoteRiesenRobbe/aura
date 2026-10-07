# Plan: the buff tray

> **Status: C1 (server) BUILT 2026-10-02, C2 (client desktop) + C0 BUILT
> 2026-10-03/04 `116a9519` with the D19 + D20 look round, PO second look passed
> 2026-10-06; C3 (client phone + always-on) BUILT 2026-10-07 [uncommitted]
> with D21 (the phone shape), see §11. Owed: the real-phone check (deferred to
> the next live deploy, PO 2026-10-07); world effects' tenants belong to
> `plan-world-effects.md` C2.
> DESIGNED + APPROVED 2026-10-01 (one PO session, D1-D15 taken as choice
> prompts after a mockup round), 3 chunks + an optional content C0. ⭐ §7
> approved the same day, PO: *"All approved though things might change in
> implementation obviously."*** C1's session added D16-D18 (the circle key is
> (skill, caster); the entry carries a kinds bitmask). Line refs come from a
> survey of HEAD `7455f46e` on 2026-10-01; re-verify before executing.

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
| **D16** | ⭐ **The circle key is (skill, caster)**, amending D11 (PO 2026-10-02, C1's session, "WoW literal shape"): a dot stream is applied and ticks PER CASTER on the server (round-7 item 6, pinned in `buffs_test.go`), so two wolves' dots are two circles, each with its own time. PO: *"if it is the truth meaning two dots two identical enemies would tick independently on the player already"*; confirmed in the code first. Everything with no caster on the server (slow, resist, stun, shield, speed, tick rate, lifesteal, reflect, calm, charm, and hots: only the strongest heals) stays ONE circle per skill. PO: *"for debuff effects like slows, resists, stuns, one circle, that is fine"*. |
| **D17** | **An entry carries a kinds BITMASK, not one kind** (PO 2026-10-02, after "each skill would get its own entry with all of the effects listed in a text"): `OwnEffect.kinds` is the union of the kinds live under the circle. The side is "harmful if any harmful kind is present" (D13 applied to a mask), so no tie-break was needed; while a skill has dot circles its caster-less kinds ride in each dot circle's mask rather than forming a third circle. The tooltip stays the skill's own text (D14), which already lists every effect. |
| **D18** | **World effects (lava, the bog) are their own circles too** (PO 2026-10-02: *"circles per effect that comes from the world or other players"*): every placed area effect gets an id at load (`world.PlacedAreaEffect.ID`, a range above 2^32 that entity ids never reach), and a dot's caster resolves to it, so two lava pools draw apart. |
| **D19** | **A circle an AURA keeps up draws STEADY, then sweeps out once** (PO look 2026-10-04, amending D2 for this one class): the spider web's slow lives 11 ticks and is re-applied every 10, so its honest wedge strobed three times a second. PO: *"steady and then a very fast circle fill in the case of the web"*, and it then disappears as any other effect does. Positions stay D6's (new at the inner end); gameplay, content and the wire are untouched. D2's refill stands for everything with a real duration (a re-bitten dot). |
| **D20** | **Circle size: 48 px** (PO look 2026-10-04, two passes): first roughly 50 % bigger than the mockup's 46 px (68 px), then 30 % smaller than that. Still [PLACEHOLDER]. |
| **D21** | **Phone shape: two rows, right-aligned** (PO 2026-10-07, C3's session, amending D8's "two boxes side by side"): the harmful row under the bars, the beneficial row under it, each anchored at the right edge and growing leftward (newest at the edge, always-on circles at the outer, left end). Two boxes side by side at one edge cannot both keep D5's fixed anchor; two rows can. Both rows are reserved, so nothing jumps; the combat indicator moves under them. ⚑ As built, "the right edge" is the edge of the FREE strip: the interact button and the utility column (`@mobile-button` wide) own the screen edge under the bars, and a circle there was covered and untappable (C3's harness). The inset was PO-confirmed 2026-10-07. |

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
while-active self modifiers) are harmful and permanent. Since D17 an entry
carries a MASK of kinds, so the rule reads: harmful if any harmful bit is set.

**The circle key (D16, as built in C1).** `Buffs.OwnEffects()`
(`skills/own_effects.go`) groups a skill's streams by the dot streams' caster:
one `OwnEffect{Skill, Caster, Kinds, Total, Left}` per caster, each with that
caster's longest dot stream as its wedge and the skill's caster-less kinds
folded into its mask; a skill with no dot streams is one entry with a nil
caster and its longest stream. Sorted by skill id, then first application, so
the bytes are stable. ⚑ At HEAD no mob skill lands a dot together with a slow
or stun in one skill (the census in C1's session: `venom-spit` is instant
damage + dot), so the "shared kinds ride in a dot circle" branch is reached
only by the test skill `omni-aura` and the player's own `wildfire`.

### 3.2 The wire (D15)

Three additions, all appended, none changing an existing field:

```
// server.fbs (as built in C1; the planning draft said common.fbs, but every
// enum lives in server.fbs and common.fbs holds only Vec2f)
enum EffectKind : ushort (bit_flags) { Resist, Slow, Speed, Lifesteal, Reflect,
                                        TickRate, Dot, Hot, Shield, Calm, Stun, Charm }

struct OwnEffect {
  skill_id:ushort;
  kinds:EffectKind;     // D17: the union of the kinds live under this circle
  total_ticks:ushort;   // the lifetime the longest stream started with; a refresh resets it (D2)
  caster:ulong;         // D16/D18: entity id, area id (> 2^32), or 0 for the skill's shared circle
  expires_tick:ulong;   // the server tick the longest stream ends on; GameState.tick is the clock
}

table GameState { ... own_effects:[OwnEffect]; }   // appended at table end, 24 B per entry
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
  (`:674`, a calm broken by damage or a charm reverted),
  `dropDepletedShields` (`:911`, a shield burned down to zero) and, found at
  C1, `Cleanse()` (no live caller, but it is the store's API). Same pattern as
  `SkillComponent.revision`
  (`component.go:163-167`, bumped at `:442-480`). ⛔ Aging is NOT a change:
  `Tick()` decrements every live entry every tick and bumps only when one
  expires; a bump per decrement would resend the whole owner block on every
  tick any buff lives (pinned: `TestBuffs_RevisionDoesNotBumpWhileALiveEffectAges`,
  `TestNetSystem_OwnEffects_ALiveEffectCostsNothingWhileItAges`).
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
| **C0 (content)** ✅ built 2026-10-03 with C2 (PO: fold it in), see §11 | `icon` (and `packIcon` where the pack has one) on the mob skills that land a timed effect on a player. Census at HEAD, 11 of 42: `bomb-burst`, `ember-aura`, `fire-elemental-aura`, `fire-totem-aura`, `giant-venom-spit`, `rally-drum`, `spider-web-aura`, `totem-aura`, `venom-spit`, `warbanner-shield`, `warlord-cleave`. No mob skill carries an icon today. | nothing; the `add-content` skill |
| **C1 (server)** ✅ built 2026-10-02, see §11 (the row below is the planning shape; D16-D18 changed the entry to (skill, caster) + a kinds mask) | `Buffs.Revision()` bumped on every mutation and expiry; `total` on `buffEntry`; `Buffs.OwnEffects()` projection (one per skill, longest stream, kind); `EffectKind` + `OwnEffect` + `own_effects` on the wire inside the owner block; `ownerStateWatch.buffRev`; the shared-constants pin. | nothing |
| **C2 (client, desktop)** ✅ built 2026-10-03, see §11 | Decode; `BuffTray.ts` (pure tenant set, ordering, wrap, fraction) + the element above the action bars; circles with icon and wedge; countdown off `snapshot.tick`; hover tooltip with the time line; retire the own player's dots (D10). | C1 |
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
- **The revision must bump on every REMOVAL, not only on apply.** Four
  deletion sites, only one of them an expiry: `Tick()` (`buffs.go:522`),
  `dropPayload` (`:674`, calm broken by damage, charm reverted),
  `dropDepletedShields` (`:911`, a shield absorbed to zero) and `Cleanse()`.
  Miss one and the circle lingers until the 5 s heartbeat. C1's
  `TestBuffs_RevisionBumpsOnEveryRemoval` covers all four.
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

### C1 (server) ✅ BUILT 2026-10-02 `49eb390e`

What shipped, against §7's row, with the three rulings the session added
(D16-D18):

- **The store** (`skills/buffs.go`, new `skills/own_effects.go`): `revision`
  + `Revision()`; `total` on every stream, set on insert and on an extending
  refresh; the twelve hand-rolled `if ticks > e.ticks` refresh blocks
  collapsed into one `extend()` helper that bumps the revision when the expiry
  moves; a bump at every removal (`Tick()` expiry, `dropPayload`,
  `dropDepletedShields`, `Cleanse`). `EffectKind` bits with `effectKind()` on
  the payload interface (a new payload does not build without one).
  `OwnEffects()` is the D16/D17 projection (§3.1). ⚑ Deliberately NOT bumping:
  a shield pool draining, a resist refresh re-stamping tags, a hot changing
  hands on a refresh (none moves a circle).
- **The caster id**: `model.SourceID(caster)` resolves a dot's caster to an
  entity id, a placed area's new `world.PlacedAreaEffect.ID` (D18,
  `AreaIDBase` = 2^32, assigned in `CollectAreaEffects`), or 0;
  `model.AreaSource` gained `AreaID()`.
- **The player**: `BuffRevision()` and `OwnEffects()` on `model.PlayerEntity`.
  Mobs got nothing.
- **The gate**: `ownerStateWatch.buffRev` (`core/net.go`).
- **The wire**: `EffectKind` (ushort, `bit_flags`) and `OwnEffect` in
  `server.fbs` (§3.2), `own_effects` appended after `map_fog`;
  `codec.OwnEffectsMarshalFlatbuf` inside the owner-block branch, expiry =
  tick + left, empty = absent (the skill-events convention). Both bindings
  regenerated and committed.
- **The pins**: `effectKindBits` in `api/shared-constants.json` with the Go
  twin (`cmd/aurad/shared_constants_test.go`), the vitest twin against the
  generated `AuraApi.EffectKind`, and `TestEffectKind_MirrorsTheWireEnum` in
  `codec` (the HitKind rule).

**Schema impact: DB NONE** (re-verified: `sys/persist.go` has no buff
reference) · **wire +1 enum, +1 struct, +1 `GameState` field inside the owner
block** · **conf NONE** · **content NONE**.

**Verified:**

- `go test ./...` green except `world.TestPropContent_C1bMigrationPreservesLookAndCollision`
  (Tree/Boulder sizes), which fails identically at clean HEAD `114d5073` in a
  throwaway worktree: pre-existing, not this chunk's. New Go tests: 13 in
  `skills/own_effects_test.go`, 1 gate leg, 3 wire legs (apply resends on the
  same tick with an absolute expiry; a 1000-tick effect adds zero resends and
  byte-stable quiet ticks over 148 ticks; an expiry resends the block empty),
  2 codec round trips + the enum pin, `model.SourceID`, the area id. The alloc
  pins stay green.
- `npm test` 1456/0 (incl. the new twin), `npm run typecheck` clean, prod
  build clean.
- `hygiene-wire-prune.mjs` (the plan's required re-run for any `.fbs`
  change): 694 sprites, 0 console errors, 0 context losses, on a rebuilt
  `aurad` + `frontend/dist`. ⚑ Its first run after the restart died at join,
  the documented race; the re-run passed.
- The buff-store harnesses the verify coverage map names, each alone on a
  fresh restart, on the DEBUG zone set: `swift-cooldown.mjs` **7/7** ·
  `chunk2-calm.mjs` **7/7** · `chunk3-charm.mjs` **7/9** (the two red legs are
  the known "pet died before the charm ran out" pair, CLAUDE.md's 6-8/9) ·
  `c2-player-cc.mjs` **22 PASS, 1 INCONCLUSIVE, 0 FAIL of 23** (the
  INCONCLUSIVE is the DR leg, documented never-red; re-run after the pin fix): the own player's Slow pip, the stun doors and the web expiry all
  hold. ⚑ Its boot leg had a CONTENT COUNT pin (121 skills, 77 mobs) that the
  PO's mob authoring had already reddened (97 mobs); relaxed to a floor per
  harness rule 1 in this chunk. ⚑ On the REBUILT MAIN WORLD swift's pace legs
  read an obstructed baseline and calm/charm found no mob at their venue
  (precondition legs, not assertions): starved venues, recorded in CLAUDE.md.
- ⛔ Nothing is VISIBLE yet: C1 has no client consumer. The in-game look is
  C2's.

**Found on the way:**

- The census in §7 named `venom-spit` as a dot + slow example; it is instant
  damage + a dot. No mob skill at HEAD lands a dot with a slow or stun.
- Area effects pass the placed shape as the dot's caster (`sys/areaeffects.go`),
  which is not an entity: without D18 every pool would have collapsed into
  one caster-0 circle.
- `common.fbs` holds only `Vec2f`; every enum lives in `server.fbs` (§3.2
  corrected).

**For C2:** decode `own_effects` only when `owner_state` is true (absent =
clear on such a tick, keep counting down otherwise, §10); tenant key =
`(skill_id, caster)`; side = any of Slow | Dot | Stun set in `kinds` (D13 on a
mask); `fraction = (expires_tick - tick) / total_ticks` clamped to [0, 1];
a `caster` above 2^32 is a place (name it by the skill, as the tooltip does).

### C2 (client, desktop) + C0 (content) ✅ BUILT 2026-10-03/04 `116a9519`

What shipped, against §7's rows, with the one choice prompt the session took
(C0 folded in, PO 2026-10-03) and the deviations it found:

- **Decode**: `own_effects` read inside the `ownerState()` branch of
  `GameStateMessage.ts` (`unmarshalOwnEffects`, the two ulongs narrowed to
  numbers as `tick` is), undefined on every other tick; carried verbatim by
  `SnapshotFactory.ts`; `Backend.ts` feeds `HUD.updateBuffTray(effects, tick)`
  on EVERY snapshot beside the cooldown bar, since the wedges count down off
  the tick.
- **`BuffTray.ts`** (pure, the CooldownSweep pattern): the tenant set per side,
  newest first; key `skill:caster`; side = any of Slow | Dot | Stun in `kinds`
  (`HARMFUL_KINDS` off the generated enum); a known key keeps its position and
  takes the new expiry (D2/D6), a new one is inserted at the inner end, a key
  the vector no longer lists leaves; `[]` clears, `undefined` keeps (§10) and
  **drops a tenant locally once its expiry passes**, the rule §10 left
  implicit (a lost expiry resend would otherwise leave a dead circle until the
  heartbeat); a circle whose kinds flip sides moves boxes. 16 vitest legs.
- **The element**: `#buffTray` in `#bottomCenter` between the flight bar and
  `#actionBars`, two boxes (`.beneficial` `row-reverse`, `.harmful` `row`, both
  `wrap-reverse` so the second row grows upward, D7), the circle the slot's
  well + ink ring at 46 px with the C4 token re-sized to fill it, a conic
  `--gone` wedge inverted from `.cdSweep`, a dark red rim on a harmful circle.
  ⚑ The tray reserves its 46 px row even when empty, so the cast bar and the
  action bars never jump when the first circle lands. ⚑ Only the circles take
  pointer events; the two half-width boxes would otherwise swallow every click
  across the strip. Every size [PLACEHOLDER] per §9 P4.
- **The tooltip**: `attachTooltips` on the tray (hover only, D12) rendering
  `showEffectTooltip`: `formatSkillTooltip` with NO next-level preview plus one
  `N s left` line (P6); the open tooltip follows the countdown, re-rendered
  only when its seconds change. Level per Q1 as proposed: the own spellbook
  level, else 1.
- **D10**: `Player.ts` no longer feeds the own character's `setAppliedEffects`;
  the `EffectPips.ts` header and the `applied_effects` comment in `server.fbs`
  say "for others" (comment only, no regen). Every other entity keeps its pips.
- **Phone**: `#buffTray` is `display: none` under `html.mobile` until C3 places
  it (§3.5); an interim bottom-column look was never ruled.
- **NOT built**: §3.8's `BuffTray.register(tenant)` / `unregister(key)` for
  world effects (YAGNI until that plan's C2); the `permanent` time line and
  always-on tenants (C3).
- **C0**: `icon` + `packIcon` on the 11 mob skills (bomb-burst `bomb`,
  ember-aura `fireball`, fire-elemental-aura `fire-ring`, fire-totem-aura
  `totem-fire`, giant-venom-spit `venom-drip` NEW, rally-drum `war-drum` NEW,
  spider-web-aura `throwing-net` NEW, totem-aura `totem-blue`, venom-spit
  `venom-splat` NEW, warbanner-shield `war-banner`, warlord-cleave `cleaver`
  NEW; glyphs reused where vendored, `delapouite/drum`, `lorc/spider-web`,
  `lorc/meat-cleaver` fetched). ⚑ **The icon pipeline was scoped to the top
  level of `api/skills` by the UI pass C4 ruling, in four places**: the fetch
  script, `SkillIcons.test.ts`, `PackIcons.test.ts`, and a Go pin asserting
  `mobs/` authors NONE. All four now walk `mobs/` (icon optional there), and
  the Go pin became `TestSkillContent_MobSkillsThatLandATimedEffectAuthorAnIcon`:
  a mob skill carrying any of the 15 effect types that land a timed effect on
  ANOTHER entity must author one. That census matched §7's eleven exactly
  once self-only types were excluded (`warlord-frenzy`'s `tick_rate` is a
  self buff and stays bare). Atlases repacked locally (104 entries, seat
  holder only, `THIRD_PARTY.md`); `manual-content-authoring.md` §4 records
  the amended rule.

**Schema impact: DB NONE · wire NONE** (C1 added the fields; C2 edits two
comments, no regen) · **conf NONE** · **content: 11 mob skills + 5
pack-manifest entries + 3 vendored glyphs**.

**Verified:**

- `go test ./...` green except the pre-existing
  `world.TestPropContent_C1bMigrationPreservesLookAndCollision` (C1's
  finding). The rewritten Go pin passes with `-count=1`.
- `npm test` 1472/0 (16 new in `BuffTray.test.ts`, both icon pins over
  `mobs/`), `npm run typecheck` clean, prod build clean, atlases repacked
  (104 entries).
- Harnesses, each alone on a freshly restarted DEBUG zone set: the new
  `buff-tray.mjs` **13/13** (Swift circle appears / darkens / tooltips /
  leaves; Recover hot circle; the giant spiders' venom as a harmful circle
  keyed by the biting spider, refilled by every re-bite, draining out after
  the warp away; a spider under Immolate keeps its own Dot pip; no own pips).
  `c2-player-cc.mjs` **22 PASS, 1 INCONCLUSIVE, 0 FAIL** (C1's baseline;
  the DR leg is the documented never-red one) after its clock and Slow read
  moved. `swift-cooldown.mjs` **7/7** (legs 3 and 5 read the tray).
  `c5-bars.mjs` capture clean (the own strip unfed, a Warbanner shield
  circle on the tray). `hygiene-wire-prune.mjs` 627 sprites, 0 console
  errors. `mobile-layout.mjs` 3 red on its "journal from the sheet" leg,
  **identical at clean HEAD** (stash round-trip), recorded in CLAUDE.md's
  known-red list, not this chunk's.
- ✅ **The PO's look, 2026-10-04**: *"it works and looks good for now"*, with
  two changes ruled as choice prompts (D19, D20) and built the same day, see
  "The look round" below.
- ✅ **The PO's second look, 2026-10-06** (D19 + D20 on the desktop, main
  world, the Giant Spider pack with GOD off): all nine checklist items
  passed. D19: the web's Slow circle steady while inside (tooltip "while in
  range"), no second circle or shuffle over 20+ s of new webs, one sweep on
  leaving, back to steady IN PLACE on re-entry mid-sweep, no flicker along a
  web's edge, the venom dot's refill wedge honest beside it. D20: 48 px and
  the 6 px gap read well with three or more circles, the upward wrap and the
  tooltip anchor hold. Nothing changed; the look is closed, C3 is unblocked.

**Found on the way:**

- **A hot AURA skips its caster on the server** (`applyHotAura`: "self-HoT is
  the instant_hot cooldown's job"), so §7's harness line "switch Heal on while
  hurt, a hot circle that refills every beat" was unbuildable as written.
  Recover (`instant_hot`, self) gives the hot circle; D2's refill is observed
  on the giant spider's venom, re-applied every bite.
- **The own `setAppliedEffects` was a harness CLOCK**: `c2-player-cc.mjs`
  counted its calls as snapshots for every duration it measures, so D10 would
  have stopped the clock, not just one leg. It now wraps `setAuraTick` (fed on
  every own snapshot) and reads the Slow state off the tray's DOM, one
  snapshot late (every leg has a 30-snapshot tolerance).
- **Sample faster than the refresh**: a 1 s probe against the spider's 1.33 s
  bite cycle aliased the wedge into a sawtooth running backwards.
- `data-skill-name` is the DISPLAY name with spaces ("Giant Venom Spit"); the
  verify skill has the gotcha.
- The venom-drip pack art reads as a green leaf at 40 px (a look item).

**The look round (PO 2026-10-04, D19 + D20):**

- **Measured before ruling**: standing still in the pack for 24 s, the web's
  circle never dropped while its web lived (the server's beat + 1 lifetime is
  already "slowed while in range, gone a third of a second after leaving"), so
  neither the slow's mechanics nor the content needed a change. What the PO
  saw was (a) the wedge of an 11-tick lifetime sweeping and refilling three
  times a second and (b) every re-entry (a new web every 8 s, a step across an
  edge) arriving as a NEW circle at the inner end.
- **D19 as built** (`BuffTray.ts`, client only): a tenant is `sustained` when
  its skill is an aura in the catalog and its kinds carry no dot or hot (the
  four beat + 1 appliers are `slow_aura`, `resist_aura`, `shield_aura`,
  `speed_aura`; a dot or hot has a real duration even under an aura). A
  sustained circle draws full while the server lists it; when the server
  stops (or its expiry passes on a quiet tick) it stays for one more lifetime
  with `leavingAt` set, sweeping its wedge once, then leaves. Caught again
  mid-sweep it returns to steady IN PLACE, which also absorbs a walk along a
  web's edge. The tooltip line reads `while in range` while steady. The
  circle carries the classes `sustained` and `leaving` for the harnesses.
  ⚑ The lookup asks `skillDefinition(id)?.category`, not `skillCategory()`,
  whose fallback is 'aura' while the catalog is in flight. ⚑ The sweep runs
  AFTER the server dropped the effect, so `c2-player-cc.mjs` skips `.leaving`
  circles when it times the server's slow. 6 more vitest legs (22).
- **D20**: `@buff-circle` 48 px after two passes (68 px, then 30 % off),
  `@buff-gap` 6 px, the centre gap unchanged.
- **Not changed**: positions (the PO kept D6 over an outer-end group and a
  remembered slot).
- **Verified after the look round**: vitest 1478/0, typecheck, prod build;
  `buff-tray.mjs` 13/13; `c2-player-cc.mjs` twice on fresh restarts: its new
  leg "inside the web the circle is STEADY" PASS both times, "stepping out
  frees within a second" PASS (Slow dark on the same snapshot the player
  cleared the edge, the `.leaving` sweep excluded), totals 16/1/6 and
  20/1/2 (PASS / FAIL / INCONCLUSIVE; the pack decides the inconclusive
  legs). ⚑ The one FAIL both times was "the web expires on its own": an
  `every` over the webs' lifetimes with a 215-265 window, reddened by a
  single web read at 130 and at 213 beside seven values around 237 (a web
  first seen late or dying with its spider reads short). A knife-edge,
  harness rule 3, and nothing a client-only change can move; repaired to
  median + ceiling. Pre-commit, on the 48 px bundle: `buff-tray.mjs` 13/13
  and `c2-player-cc.mjs` **17 PASS, 0 FAIL, 6 INCONCLUSIVE** with the
  repaired leg green (three webs at 235 / 239 / 235). ⚑ One run before it
  was VOID (connection refused, zero snapshots): another session restarted
  the shared dev server mid-run, the verify skill's "anything else touching
  the server kills the run".

**For C3:** remove the `html.mobile` hide and place the tray under
`#vitalSigns` (§3.5); `showEffectTooltip` grows the `permanent` line (pass
`null` seconds); the 500 ms hold variant in `attachTooltips`; always-on
tenants need a second feed into `TrayState` (passives from `passive_slots`,
drawbacks from the active aura's definition) since they carry no expiry, at
the OUTER end of each box (P5). Harness legs under `?mobile` per §7.

### C3 (client, phone + always-on) ✅ BUILT 2026-10-07 [uncommitted]

What shipped, against §7's row, with the one ruling the session took (D21)
and what it found:

- **Always-on tenants** (D9, §3.7, P5): `BuffTray.alwaysOnTenants(passiveSlots,
  activeAuraSkill, defOf, levelOf)`, pure, derived per snapshot inside
  `HUD.updateBuffTray` from the slots the HUD already holds (the server's
  `active_aura_slot`, never the optimistic click), so a late catalog repairs
  itself. One beneficial circle per equipped passive in slot order; one harmful
  circle for the active aura when any `stat_multiplier` is negative at its
  level (D11: four drawbacks, one circle). A positive while-active modifier
  draws nothing (no content has one, YAGNI). Keyed `always:<skill>`, kept in
  their own arrays (applyOwnEffects drops anything unlisted, and
  `fractionLeft` read a zero lifetime as fully dark), drawn after the timed
  circles at the outer end. `permanent` tenants draw full, carry the
  `permanent` class, and their tooltip line reads `permanent` (P6).
  ⚑ The only aura with drawbacks is `OverchargeAura`, a cheat-only rig: no
  shipped content reaches the harmful always-on circle.
- **The hold** (D12): `attachTooltips(..., holdMs)`, opt-in, passed by the tray
  alone and only under `html.mobile` (the project's one phone switch, so the
  spellbook and loadout lists keep their phone behaviour, and a harness drives
  it with a mouse). Pointerdown on an entry starts the timer; pointerup,
  pointercancel or a move past 8 px [PLACEHOLDER] cancels it and closes the
  tooltip; `contextmenu` is prevented. The circles carry `touch-action: none`,
  `user-select: none`, `-webkit-touch-callout: none`.
- **The phone placement** (D8, D21): `setupBuffTray` MOVES `#buffTray` into
  `#vitalSigns` on the phone, so it follows the bars' rem/vh sizing. Two
  reserved rows, harmful on top, `row-reverse` + `wrap` (downward), 36 px
  circles, 4 px gaps [PLACEHOLDER]; `#combatIndicator` moved down by the two
  rows. ⚑ **D21 amended in the build, PO-confirmed**: the interact button and
  the utility column (`@mobile-button` wide) own the screen edge under the
  bars, and a circle there was covered and untappable, so the rows end one
  gutter left of that column.
- **Not changed**: the desktop tray; the wire; the 2026-08-02 "nothing else on
  the permanent phone HUD" cap is widened by D8 and says so in the stylesheet.

**Schema impact: DB NONE · wire NONE · conf NONE · content NONE.**

**Verified:**

- vitest **1564/0** (7 new in `BuffTray.test.ts`, 6 in the new
  `SkillTooltipHold.test.ts`; the hold tests were written after the code, then
  falsified: with `holdMs` dropped 3 of 6 go red), `npm run typecheck` clean,
  prod build clean.
- `buff-tray.mjs` **22/22** on a fresh DEBUG boot (13 C2 legs + 9 new: the
  passive circle full at the outer end with a `permanent` tooltip, the
  OverchargeAura drawback circle and its leaving when the aura is switched off,
  and five phone legs: under the bars harmful-above-beneficial, 36 px left of
  the tile column, nothing covering the circle, a 200 ms tap opens nothing, a
  700 ms hold opens and lifting closes). ⚑ One earlier run printed nothing at
  all, cause unknown; the rerun is the tally.
- `c2-player-cc.mjs`: 19 PASS / 4 INCONCLUSIVE / 0 FAIL, and one run before it
  with "Stunned: movement input is dead" red (2.19 u drift, a 5.4 s "stun"):
  the leg reads the stun's end off the tray's Slow bit, which a web's slow
  keeps lit after the stun. Permanent circles carry no kind bits, so C3 cannot
  move it; a pack-dependent flake, 1 in 2.
- `mobile-layout.mjs`: everything green but leg 7 ("journal from the sheet"),
  the known red at clean HEAD.
- **No real phone** (PO 2026-10-07: deferred to the next live deploy).
  Simulated-phone screenshots (844 x 390 and 390 x 844, touch on, `?mobile`)
  were shown instead.

**Found on the way:**

- **The registration nag covers the tray**: in landscape the left part of both
  rows (four venom circles live, three visible), in portrait both rows whole.
  Anonymous accounts only, until dismissed. PO 2026-10-07: shipped as is, *"at
  least that forces an interaction with the banner"* (translated).
- **The held tooltip runs past the bottom of a landscape phone**: it is the
  full ability tooltip. A look item for the real-phone check.
- **A background headless page clamps timers.** With the desktop page still
  open, the phone page's 500 ms hold never fired inside 700 ms; closing the
  desktop page first fixed it (the rAF gotcha's sibling).
- **Picking a passive on the phone opens the ☰ sheet** (its slots live there),
  which covers the tray until a player shuts it; the harness taps ☰ after the
  equip.
