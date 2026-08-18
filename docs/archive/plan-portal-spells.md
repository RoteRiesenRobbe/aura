# Plan: Portal spells (Open Portal + Pull Through)

**Status: COMPLETE + ARCHIVED 2026-08-18.** C1 shipped `564f62c8`, C2 shipped
the same day; **PO in-game check passed 2026-08-18 on the pair, played
together** ("tested works"). Only §10 item 13 outlives the plan, and it is a
pricing call rather than a chunk: it rides forward in `CLAUDE.md` Open items.
Survey at `2689175e` (four parallel sweeps: cast
machinery, teleport seams, interaction system, spawn path); ⚑ line refs below
are pinned to that commit, re-verified for C1 at execution 2026-08-18 (all
seams held); C2 should spot-check its own (§6 steps 5-8).

## 1. What this builds

Two cooldown spells for group logistics, the mage-portal / warlock-summon
pair:

- **Open Portal** - after a wind-up cast, a portal stands next to the caster
  for 30 s. Any player can press E on it, accept the prompt, and be
  teleported to the *caster's bound campfire*.
- **Pull Through** - after the same wind-up, the portal appears *at the
  caster's bound campfire*. Players there can step through and arrive at
  the caster's live position.

Their niche is moving OTHER players: personal travel to the own bound
campfire already ships free as the Recall utility (10 s cast,
damage-interruptible, `skills/utility.go:49`). Price the cooldowns for
group transport, not personal escape (all numbers [PLACEHOLDER], GDD rule).

**Design change vs. the original pitch (PO 2026-08-17):** the portal is NOT
sustained by a 30 s channel; it is a short wind-up cast followed by a 30 s
TTL. Two reasons, both structural: cast state rides own-player-only wire
fields by design (`server.fbs:545`, the ascension D29 precedent), so no
other player could see a channel anyway - "open while channeling" and
"open for 30 s" are indistinguishable to everyone but the caster; and no
sustain/cancel hook exists (`CancelCast` is a bare mutation invoked from
~9 sites with no callback), so the channel version is new engine plumbing
for an effect nobody can perceive. The wind-up keeps the interruptible-cast
counterplay; the TTL frees the caster to act.

## 2. Why this is cheap (survey 2026-08-17)

- **The cast is authored, not coded**: `castTicks` / `castTicksPerLevel` /
  `castInterruptedByDamage` on any cooldown skill (`skills/definition.go:1000`)
  buy the wind-up, the cast bar, the full interrupt matrix (movement, damage
  opt-in, other presses, death, unequip) and cost-charged-only-on-completion
  (`sys/skills.go:1509` `advanceCast`, `:1555` `fireAndCharge`).
- **"Spawn a temporary entity with a TTL" ships today**: the `spawn` effect
  type + FireTotem (`sys/skills.go:2480` `spawnSummon`,
  `api/skills/fire-totem.json`). TTL countdown, death-sweep despawn, wire
  streaming and client rendering are all wired; `ttlTicks: 900` = 30 s is
  pure authoring, no upper bound in validation.
- **"Press E, get a prompt, accept" is the conversation system**, and it is
  capability-based: any mob def carrying an `interaction` block registers
  with the InteractionSystem (`sys/interaction.go:212`) and drives the
  panel. `api/mobs/memorial-stone.json` is the sanctioned "inert object
  that talks" template (its `_comment` says exactly this). A yes-row plus
  the automatic "Leave." row is the accept/decline shape used by every
  quest offer; no authored decline row exists anywhere in content.
- **The teleport is two lines**: `Ground()` then
  `SetPosition(JitterAround(dest, ...))` - the WARP/Recall recipe
  (`sys/cmd/cmd.go:80`, `sys/skills.go:1981` `applyRecall`).
  `player.SetPosition` moves body + viewport + aura colliders together, AOI
  streaming rides the viewport shape, and the phy grid rebuilds per tick;
  no re-registration.
- **The client already handles large jumps generically**: interp-buffer
  flush past `TELEPORT_SNAP_DISTANCE_PX` (`_GameObject.ts:181`) and camera
  hard-set past one viewport (`Camera.ts:71`); comments name Recall and
  WARP.
- **The bound campfire has a clean read seam**: `AnchorOf(clientUUID)`
  (`sys/state.go:1104`), returns false rather than a stale fire. It is
  connection state, not player state - relevant for the owner-disconnect
  refusal.
- **The anchor precondition exists**: cooldown skills already gate on
  "bound to a fire" with the `ActivationRejectedNoAnchor` wire reason
  (`sys/skills.go:1569`, `model/player.go:39`) - the Recall effect's
  precedent, checked at press AND at cast completion.
- **A flyer cannot interact**: flight removes body + aura shapes from the
  space (`flight.go:61`), so a flyer is never offered an interactable; and
  takeoff cancels casts + pending presses (`core/input.go:389`, the D11
  rule). The flying edge cases mostly solve themselves.

## 3. The two real gaps (all the new Go lives here)

1. **No conversation grant can move a player.** Grant kinds are a closed
   set of four (`items/mobs/interaction.go:233`: teach_skill, offer_quest,
   advance_quest, grant_xp). New kind **`travel_to`** (D3).
2. **The `spawn` effect only places next to the caster** (its allowed keys
   deliberately exclude placement: "placement is the spawn site's
   business", `definition.go:1258`). Pull Through needs one new effect
   type that places at the caster's anchor (D4), following the projectile
   plan's D2 pattern for adding an effect type.

## 4. Decisions

- **D1 - Shape: wind-up + TTL** (PO ruling 2026-08-17, §1). Cast
  `castTicks` ~75 (2.5 s) [PLACEHOLDER], `castInterruptedByDamage: true`
  (matches Recall's posture), portal `ttlTicks: 900` (30 s) [PLACEHOLDER].
  Mid-cast reconnect resumes the cast (component reattach,
  `skills/component.go:318`) - harmless under this shape, the portal only
  exists after completion.
- **D2 - The portal is an authored mob def**, spawned at runtime (props are
  structurally out: not interactable, and `PhysicsSystem.Remove` panics on
  statics). Recipe: memorial-stone's inert-interactable shape (role
  creature-or-structure with `factors.speed: 0`, inert `aggroRadius`,
  `interaction.range` doing the work, explicit `collisionLayer` - mandatory
  when an `interaction` block is present, boot-fails otherwise) crossed
  with fire-totem's lifecycle (TTL, owner). Standing locks: tier +
  baseline authored, `factors.xpFactor: 0` (pays nothing, no nameplate),
  `curveLevel: 1`. `entityType` reuses an existing sprite
  (`"NpcPlaceholder"` or `"FireTotem"`) [PLACEHOLDER art]; a bespoke portal `EntityType` is deliberately not
  free (exhaustive client `Record`, next free wire value 76, gaps
  permanent) and waits until the spell earns it, same stance as the
  projectile plan. Two carried landmines if the spawn path is followed:
  `SetOwner` then `RestoreToFullHealth()` (that order), and
  `EnlistUnder` vs `Align` sets faction AND reaction table together.
  Choose the collision/faction recipe so mobs do not chew on the portal;
  if enlisting makes it aggro-able like a totem, author a big health pool
  [PLACEHOLDER] and read mob-attacks-portal as an accepted feel artifact
  (projectile plan §5 precedent) - PO judges in §10.
- **D3 - One new GrantKind `travel_to`** with a destination mode:
  `home_campfire` (Open Portal: resolve `AnchorOf(owner's client)` at
  interact time) and `caster` (Pull Through: the owner's live position at
  interact time). Parsed in `items/mobs/interaction.go` (`:255` region,
  plus `mapGrant`), applied in `sys/interaction.go` `applyGrant` (`:868`
  region). Handler body: refusal line if the destination cannot resolve
  (owner disconnected, unbound, dead, or flying for `caster` mode), else
  `Ground()` + `SetPosition(JitterAround(dest, respawnJitterRadius))`.
  Server-authoritative; rides the existing Interact message and the
  existing "must equal the stamped `Interactable()`" validation. No
  `confirmSeconds` countdown - it is not JSON-authorable (only the
  ascension RowSource produces it) and the accept-row satisfies the
  prompt requirement; decline is the automatic "Leave." row.
- **D4 - One new effect type for remote placement** (Pull Through), name
  `spawn_at_anchor` [naming open], modelled line-for-line on `spawnSummon`
  but placing via a probe around `AnchorOf(caster)` instead of the caster.
  Params: `spawnMob`, `ttlTicks`(+`PerLevel`). Precondition: joins the
  anchor-required set (`ActivationRejectedNoAnchor`), checked at press and
  completion like Recall.
- **D5 - Destination resolves at step-through time, not at cast time.**
  Open Portal follows the owner's anchor if they rebind mid-life
  (accepted, 30 s window); Pull Through delivers to wherever the caster
  now stands - the caster may keep moving, which is the point of a summon.
- **D6 - Anyone may step through, including the caster.** No faction or
  group gating in v1 (no groups exist); stepping through is opt-in by
  construction (E + accept), so no-griefing-by-design holds. The caster
  using their own Open Portal duplicates free Recall; harmless.
- **D7 - One portal per caster by cooldown arithmetic, not bookkeeping**:
  author `cooldownTicks` ≥ cast + TTL [PLACEHOLDER] so a second portal
  cannot coexist with the first. Fallback if tuning ever wants overlap:
  the Camp utility's one-per-owner replacement map
  (`replaceStandingCamp`, `sys/skills.go:1786`) is the shipped pattern.
- **D8 - ⚑ Pull Through's portal must land OUTSIDE the fire's dwell
  radius.** The client synthesizes a campfire interact offer that
  OVERRIDES the server's offer (`Backend.ts:527`:
  `flightOrigin || offered`), so a portal inside the dwell circle would
  lose every E press to the flight map. Placement probe: anchor + offset
  just beyond the streamed `dwell_radius` [PLACEHOLDER units]; §10 checks
  both presses near the fire.
- **D9 - Schema NONE at every layer.** No wire change (grant kinds and
  effect types are server-side vocabularies; conversations and Interact
  already ride the wire), no DB change, no migration; portals are
  transient and never persisted.
- **D10 - Unlock path is a later PO call**; both skills are SKILL-cheat
  granted for now, like FireVulnerability. Costs `costFractionOfMax`
  [PLACEHOLDER], priced as group transport (§1). Content edits follow the
  add-content skill (census pins, `go test -count=1` after any `api/`
  edit).
- **D11 - Tooltip**: reusing `spawn` for Open Portal gets the existing
  "Summons Portal for 30s" line free; the new D4 type needs a
  `SkillTooltip.ts` case (the effect-type checklist at
  `definition.go:137` names this). Wording [PLACEHOLDER], decided in C2.

## 5. Feel artifacts to read correctly

- **The wind-up is invisible to others** (own-player-only cast fields). If
  the PO wants a visible "casting a portal" moment, that is a broadcast
  field and a backlog §39 conversation - deliberately not pre-built.
- **Mobs may aggro the portal** if it spawns enlisted (D2). Read it as the
  totem/decoy artifact, give it its own verdict.
- **Arrivals dwell**: a player delivered to the campfire stands in the
  dwell circle and will discover/bind it like any visitor. Reads as a
  feature; noted so it is not mistaken for a bug.
- **Step-through closes the conversation**: after the teleport the portal
  is out of range and `refreshConversations` drops the session. C1 pins
  this; if the panel lingers a tick, that is the pin to tighten.

## 6. Chunks

**C1 - Open Portal** (grant + content, the whole loop playable)
1. **`travel_to` grant, red-first**: parse (mode required, unknown mode
   hard-fails at boot) · `applyGrant` happy path (player moved, jittered,
   grounded) · refusals (owner disconnected / unbound → line, no move) ·
   validation that the Interact still passes the `Interactable()` stamp.
2. **Spawned conversant, red-first in `sys`**: a runtime-spawned mob with
   an `interaction` block registers with the InteractionSystem, offers to
   a player in range, and unregisters cleanly at TTL death (conversation
   in progress closes). ⚑ Establish here which way the combat gate cuts:
   the `Conversant` interface carries `InCombat()` (`sys/interaction.go:27`),
   so a mob chewing on an enlisted portal may refuse the conversation
   exactly when someone tries to escape through it. If in-combat
   conversants go mute, pick `Align` over `EnlistUnder` (or an aggro-proof
   collision recipe) in D2 rather than shipping a portal that dies as a
   prompt while under attack; pin whichever way it lands.
3. **Content**: `api/mobs/portal-home.json` (D2 recipe, conversation node
   "Step through." → `travel_to: home_campfire`) +
   `api/skills/open-portal.json` (`category: cooldown`, cast + spawn
   effect, D1/D7 numbers).
4. Verify tail (§9) + PO session (§10 items 1-8).

**C2 - Pull Through** (remote placement + second destination mode)
5. **`spawn_at_anchor` effect type, red-first**: enum + `effectTypeMap` +
   allowed-keys row + params/validation (spawnMob resolution hard-fails at
   boot) · fire case placing beyond the dwell radius (D8) · press and
   completion refused unbound (`ActivationRejectedNoAnchor`).
6. **`caster` destination mode, red-first**: delivered to the owner's live
   position · refusals (owner dead / flying / gone).
7. **Content**: `api/mobs/portal-summon.json` (conversation →
   `travel_to: caster`) + `api/skills/pull-through.json` + the D11
   tooltip case.
8. Verify tail + PO session (§10 items 9-13).

## 7. Schema impact

**NONE** (D9). New content JSON + server-side vocabulary entries only;
runtime-spawned entities are never persisted.

## 8. Test posture and expected fallout

- TDD on every Go layer (grant parse, `sys` interaction behavior, effect
  parse, `sys` fire/placement); vitest only for the D11 tooltip case.
- ⚑ `go test -count=1` after every `api/` edit; the new skills and mob
  defs shift the catalog censuses the add-content skill lists (registry
  pin moves twice).
- simharness guardrails should NOT shift - no existing skill, mob or
  formula is touched. A shift means the change bled.
- The CLAUDE.md known-inconclusive list applies unchanged; measure before
  diagnosing a flake as this plan's fallout.

## 9. Verify tail

`go build ./...` · `go test -count=1 ./...` (at minimum `skills`, `sys`,
`items/mobs`) · `npm run typecheck` · `npm test` · `make -C backend build`
before booting (stale-binary gotcha) · boot 0 WARN / 0 ERROR + census ·
PO checklist · `harnessdb -cleanup` after Playwright runs.

## 10. PO in-game checklist

**C1 (Open Portal):**
1. Cast: bar visible, movement cancels, damage cancels, cost charged only
   on completion.
2. Portal appears next to the caster, placeholder sprite fine, expires at
   30 s.
3. E near the portal shows the prompt; "Step through." delivers to the
   caster's bound campfire, jittered, camera snaps clean.
4. "Leave." declines; nothing moves.
5. A SECOND player (or second window) steps through - the actual point of
   the spell.
6. Caster unbound (fresh character): the press is refused with the
   no-anchor reason, no cast starts.
7. Portal despawns mid-conversation: panel closes, no ghost offer.
8. Does a mob attack the portal (D2 artifact)? Verdict, not bug report.
9. Caster logs out with the portal standing: stepping through refuses with
   a line.

**C2 (Pull Through):**
10. Portal appears at the bound fire, OUTSIDE the dwell circle; E on the
    fire still opens the flight map, E near the portal still prompts (D8,
    both presses).
11. Step through: arrive at the caster's CURRENT position after the caster
    walked away from the cast spot (D5).
12. Caster dies / takes off flying with the portal standing: refusal line.
13. After 15 minutes of two-window play: do the two spells read as the
    group-logistics pair, and what should they cost?

## 11. Ledger

### C2 - Pull Through ✅ 2026-08-18 - PO in-game check PASSED 2026-08-18

**Shipped.** New effect type **`spawn_at_anchor`** (33rd entry in `effectTypeMap`) - the same
`SpawnParams` payload as `spawn`, placed on a ring around the caster's bound campfire ·
**`caster` destination mode** on the `travel_to` grant (owner's LIVE position, resolved at
step-through per D5) · content: **PortalSummon mob id 70** (PortalHome's body verbatim,
`caster` row) + **PullThrough skill id 148** (cast 75t, TTL 900, CD 1200, cost 0.10,
maxLevel 1 - Open Portal's numbers, so the pair reads as one thing) · D11 tooltip case.
Skill registry 102, mobs 60, cheat-only THIRTEEN. Schema **NONE** (D9 held).

**Decisions landed in-chunk.**
- ⭐ **The anchor gate is the TYPE's here, not the content's** - the opposite call from C1's,
  and the two together are the rule: `spawn`'s `requiresAnchor` is an opt-in because
  anchor-free content shares that type (FireTotem) and the anchor is only its DESTINATION;
  for `spawn_at_anchor` the anchor is the PLACEMENT, so no anchor-free semantics exist. The
  key is therefore OFF the type's allowlist (`powerPerOwnerLevel` too - nothing placed at a
  campfire fights), so authoring either - even `requiresAnchor: false` - hard-fails at boot
  rather than suggesting the gate were optional.
- **One payload, two placements**: `def.Spawn` is shared, which is what makes the type nearly
  free - `items/mobs validateSpawnEffects` resolves `spawnMob` at boot off `Spawn != nil`, the
  catalog emits it under the same `spawn` key the client already reads, and `loaders_test`'s
  reshaped loadout assert passes legitimately (PortalSummon is the SECOND skill-less summon:
  0 == 0, and FireTotem still feeds the non-vacuity arm). `spawnSummon` split into
  `buildSummon` + placement; the two effect types differ in exactly the placement call.
- **D8 placement**: `sys.anchorSpawnOffset` = **2.5 u** [PLACEHOLDER], probed like
  `summonPosition` with ONE extra rejection - a candidate inside any fire's bind circle is
  skipped, asked via a new `ConnState.CampfireAt` rather than compared against a constant
  (bind radii are per-fire runtime data; a compile-time "the offset clears every fire" pin
  would be a second copy of that derivation). ⚑ The fallback is never the anchor itself:
  covered-but-blocked beats unblocked-but-covered, because a portal clipping a rock is
  cosmetic while a portal in the bind circle eats every press. ⚑ **What 2.5 does NOT buy**:
  a player anywhere inside the bind circle is still within the portal's 2.0 talk range from
  the near edge; the client's campfire offer owns that annulus by design. What it does buy is
  that standing ON the fire there is no portal in range at all.
- **Caster-mode refusal set** = owner nil · owner not in the world · owner flying. ⭐ "Not in
  the world" is **membership in the InteractionSystem's player list**, not a flag: logging out
  and dying both run ONE fan-out (`handleDeath` calls `game.RemoveEntity` too) that drops the
  player from every system - the mirror of C1's one-AnchorOf-miss covering two refusals.
  Flying is separate and not a liveness question (D3): a flyer is in the world, but flight
  removes the body from the space. Refusal SHAPE is C1's verbatim - present-time locked row
  reusing the single `travelClosedReason` ("its far end is gone" reads correctly for a
  vanished caster; a mode-specific reason would thread mode into `travelRow` for no
  player-facing gain), apply-time silent refusal for the race.
- ⚑ The anchor is **not consulted at all** in caster mode: Pull Through's portal is PLACED at
  the fire, but where it LEADS is the caster.
- Tooltip: one shared `spawn`/`spawn_at_anchor` case differing in four words
  (" at your campfire"); the loadout-lines splice covers both (an anchored summon with skills
  would otherwise lose them silently), while the Call-for-Aid **dedupe stays `spawn`-only** -
  its key is the payload, which both types share, so folding the twin in would collapse two
  different lines into one. Verified NOT needed: `TICKING_TYPES` (no cadence) and
  `COST_TRIGGER_TEXT` / `shared-constants.json` (pays on cast, not per application).

**Verified.** `go build ./...` · `go test -count=1 ./...` all green (simharness guardrails
UNSHIFTED; `-race` green on `sys`/`skills`/`items/mobs`/`core`) · vitest **372/372** (+3, and
the tooltip case proven red-first by disabling it: the unknown-type path rendered
`(spawn_at_anchor)`) · typecheck · `make -C backend build` + `npm run build` · boot **0 WARN /
0 ERROR, census 102 skills / 60 mobs**. Census pins moved as designed and all four went red
first: skills registry 101 → 102 · role census 45 → 46 · xpFactor-0 census 32 → 33 ·
conversant census + PortalSummon. ⚑ The three mob content censuses read the EMBEDDED mirror,
so they stayed green until `cp-defs` - C1's escaped-defect trap, hit and cleared in-chunk.

**Verified at the game surface.** New **`c2-pull-through.mjs`**, final run **22 PASS / 0 FAIL /
1 INCONCLUSIVE**: remote placement (portal on the 2.5 u ring at the caster's bound fire,
Δ0.00, nothing within 4 u of the caster standing 7.9 u away) · cast bar named, pool untouched
mid-cast, 9.0-9.2 % charged on completion · **D8 both presses** (E inside the bind circle
opens the flight map and no conversation; E outside the bind edge opens "Portal Summon") ·
decline drift 0.00 u · **the walked-away caster** (A casts, moves 17 u, B steps through and
lands 0.04 u from A's CURRENT position - §10 item 11) · **owner DEAD and owner DISCONNECTED
both render "Step through. - locked: its far end is gone"** (§10 item 12; owner-FLYING is
Go-pinned only, `TestPortalTravel_CasterModeRefusesAFlyingOwner` +
`TestInteractionSystem_PullThroughLocksForAFlyingCaster`) · TTL 27.0-31.9 s, an open panel
closes with the portal and the next E opens nothing · tooltip verbatim. The one INCONCLUSIVE
is the unbound-press leg, C1 leg J's spawn-dwell race (it PASSED in the previous run; the
property is Go-pinned at press and completion). Coverage re-runs all at baseline:
`c1-open-portal` **18/18** · `chunk3b-interact` **14/14** · `c2a-ascension-site` **31/31** ·
`chunk3b-ii-conversation` **28/34, exactly the recorded six** (Leave-row click, walk-out
close, the Wanderer trio, the stale TownCrier leg) · `round4-tooltip` green. `harnessdb
-cleanup` (34 accounts) with aurad stopped.

⚑ **Zero product defects, and every red was the harness measuring itself** - worth carrying
because three of the four recur in any portal-shaped script: (1) **`IsGod` short-circuits the
pricing site**, so "the pool dropped" scores a god-mode cast as an interrupt - completion is
read off the OBSERVER seeing the portal, never the caster's pool (and never the caster's
surroundings: at 7.9 u the portal is outside their view); (2) **an E press gets swallowed** by
the rAF-throttled edge trigger, so one hold is not evidence - press up to three times;
(3) **a leg block can outlive the 30 s TTL** (measured 90.2 s and 35.3 s), which presents as a
broken refusal - each block now gets its own cast and reports portal age plus how many
portals stand; (4) an equip-slot label read once, 900 ms after the click, caught "— Empty —"
on a run whose server log recorded the equip in the same second.

### C1 - Open Portal ✅ 2026-08-18, `564f62c8` - PO in-game check PASSED 2026-08-18 (with C2)

**Shipped.** `travel_to` grant kind (required `mode`, only `home_campfire` legal until C2;
unknown or missing mode hard-fails at boot) · `requiresAnchor` opt-in on the `spawn`
effect (press AND completion refuse `ActivationRejectedNoAnchor`; FireTotem stays
ungated - the anchor gate was per-effect-TYPE, a §10-item-6 gap the plan text missed) ·
runtime-spawned conversants register mid-run and unregister at TTL death with an open
conversation closing · content: **PortalHome mob id 69** (memorial-stone body verbatim,
FireTotem sprite [PLACEHOLDER] art) + **OpenPortal skill id 147** (cast 75t, TTL 900t,
CD 1200 ≥ cast+TTL per D7, cost 0.10, **maxLevel 1**: the closed {1,5,10} vocabulary
defines 1 as "binary ability, nothing to scale" - Recall's company, and it collapses D7
to one line). Skill registry 101, mobs 59. Schema **NONE** (D9 held).

**Decisions landed in-chunk.**
- **The §6-step-2 combat gate cuts NEITHER way**, two independent reasons, both pinned:
  the InteractionSystem no longer consults `InCombat()` anywhere (the Q1 §4.2 inversion
  already shipped), and the layer-97/mask-16 body carries neither combatant bit, so no
  aura can damage and no aggro sensor can see the portal
  (`TestPortalRecipe_IsUnreachableByAurasAndAggro`). `EnlistUnder` on the spawn path is
  therefore harmless; D2's big-health fallback does not apply.
- **Refusal shape**: present-time LOCKED row ("… - locked: its far end is gone") when
  `AnchorOf(owner)` misses (one miss covers disconnected AND unbound - it is connection
  state; the player struct outlives the connection, `removeFromPlayers` deletes the
  anchor entry), apply-time silent refusal for the race. Owner exposed via an explicit
  `Conversant.Owner()` accessor, never a type assert. New narrow `AnchorSource` seam
  threaded as an argument (the RowSource precedent), wired in `core/game.go`.
- **Travel row loader rules** (violations hard-fail at boot): authored `text`, no
  `next`, the ONLY grant on its option, refused inside a quest bundle, `mode` refused on
  every other kind. `Travel()` closes the session explicitly, tightening §5's noted
  one-tick panel linger.
- ⚑ **A gap beyond the two the plan named**: `presentOptions` rendered ONLY teach rows,
  so a travel grant would have presented no row at all; now its own branch with a locked
  variant.
- ⚑ **Id spaces are per-registry, not shared** (id 61 is a skill AND a mob); derive each
  from its own directory.

**⚑ Escaped defect from the omni trio (`9ee8cdb4`), found and fixed in-chunk**: this
chunk's mandatory `cp-defs` was the FIRST since the trio landed (`backend/pkg/api/` is
gitignored, so embedded-content tests run against a stale mirror until someone builds -
the trio's "all green" was true only against a mirror predating it). Six `cmd/simharness`
tests went red: OmniAura's damage effect authored a `radiusPerLevel` its dot lacked (the
shared-sensor radius rule), and its stacked riders put it at 3.29 ev/tick, above every §A
ceiling ref - **the ceiling guardrail has no cheat-only concept**. Fix: slope dropped,
damage numbers cut (damage 3+0.25/L, dot 1+0.25/L → strongest non-ceiling is Wildfire
1.267 again); the rig's `_comment` now records the bound (godlike in BREADTH, not
throughput). Also reshaped: `loaders_test.go`'s every-summon-has-a-loadout assert
(PortalHome is the first summon authoring no skills, structurally - nothing can reach its
collision layer to become an aura target) now checks the loadout against the mob def plus
a non-vacuity arm.

**Verified.** `go build ./...` · `go test -count=1 ./...` all green ×3 (incl. simharness
guardrails after the omni fix; `-race` green on `sys`/`skills`/`items/mobs`/`core`) ·
vitest 369/369 · typecheck · `make -C backend build` + `npm run build` · boot 0 WARN /
0 ERROR, census 101 skills / 59 mobs · new **`c1-open-portal.mjs` 18/18** (bind→walk-out
→cast bar→cost-on-completion 9.8 %→portal 0.9 u→decline drift 0.00→accept lands 0.98 u
from the bound fire→panel closes→**two-window step-through** (B lands at A's fire, 0.54 u)
→TTL expiry 29.1 s→owner-gone locked row→unbound press refused, no cast bar→tooltip
"Summons Portal Home for 30s") · `round4-tooltip` green · coverage-map re-runs:
**`chunk3b-interact` 14/14** · **`c2a-ascension-site` 31/31** (the generated rows exist
in no file, so this is the strongest proof the `travelSeam` threading left the RowSource
path intact) · **`chunk3b-ii-conversation` 28/34, EXACTLY the recorded baseline** - the
six failures are the two known-fragile clusters (the Leave-row click race, legs 43/45
prove closing works; the Wanderer drift pin, stationary in the window) plus leg 67's
stale assert against the TownCrier `teachings` node that died with Recall (downtime D8);
settled by evidence, not stash-rerun (untracked content files made a stash risky - a
differential settlement can run post-commit if wanted) · `harnessdb -cleanup` with aurad
stopped. Harness notes for §10: the leg-J unbound state needs an in-page `addInitScript`
WARP to beat the ~1.7 s spawn-fire dwell; arrivals at `spawnpoint-5` stand ~1.1 u from
the Emberkeeper, so their next E goes to HIM (conversant-cluster trap, not a defect).
