# Plan: Ascension sites - many stones, each with its own price and its own rewards

> **Status: C1 SHIPPED 2026-08-11 (`[uncommitted]`) — C2 and C3 open.** Four PO
> rulings taken in the design session (D1-D4), three more at C1 (the second
> stone's price and place, and P2 pulled forward). Successor to
> `docs/archive/plan-ascension.md`, which shipped the loop against exactly one
> stone at exactly one price. Every number is **[PLACEHOLDER]** unless marked.
> Ledger: §9.
>
> ⚑ **Schema impact: DB NONE · FlatBuffers NONE · conf NONE.** Verified against
> the shipped `000001` DDL and `server.fbs`, not reasoned: `bloodline_unlocks`
> is already keyed by slot and unlock key, and a locked row with authored text
> has been on the wire since C2a/D18.
>
> ⚑ **Read §2 before §4.** Half of what this plan is *about* turned out to be
> authorable already, and the chunk sizes only make sense once you know which
> half.

## 1. What this is

Today ascension has one price and one reward list, both effectively global:

- **The price** is "be at the level cap", enforced in Go against
  `game.player.levelCurve.maxLevel` and authored a second time on the stone,
  with a test pinning the two together.
- **The rewards** are one catalog, served identically to any node that asks
  for them.

The ask is that a *site* owns both: one stone might ask for level 30, another
for level 25 **and** a finished quest, and the two might hand out different
things. That turns ascension from a single world fixture into a content
vocabulary, which is what lets zones differ from each other.

## 2. What already works, and the three things that block it

**The node condition vocabulary already does the interesting half.** A node's
`conditions` is a list, evaluated by `conditionsPass`, and the vocabulary is
`minLevel` · `quest_at_stage` (three sentinels since 2026-08-11 — `not_started`,
`completed` and **`running`**, the whole in-progress band; intake round 8 item 2) ·
`bloodline_ascensions` · `kills_this_life`. So *"level 25 and `the-lost-lamp`
completed"* is a JSON edit today, and it already gates both the greeting and
the reward list, because C2a step 3 learned the hard way that the row-source
node must carry the gate too (`applyGrant` validates a row against its node).

Three things stop that edit from working.

**⛔ Blocker 1 - the server overrides the content.**
`ConnectionStateSystem.RequestAscension` (`sys/persist.go:144`) checks
`p.Progression().Level < levelCurve.MaxLevel` and refuses below it, whatever
the stone authored. A stone gated at 25 would show its rows, take the pick,
channel for ten seconds and then refuse, surfacing as P14's *"The stone is
silent. Nothing has changed."* ⚑ The check is deliberately **not** in SQL, and
the reason is recorded there: the character row's level is eventually
consistent, so a `level >= maxLevel` clause in the transaction would refuse
somebody who just reached it. Whatever replaces it must keep reading the live
player.

**⛔ Blocker 2 - there is one catalog and the row source cannot tell who is
asking.** `core/game.go` builds `sys.NewAscensionRows(gc.AscensionCatalog)`
once and registers it for the kind, and the `RowSource` interface is
`PresentRows(kind, p)` / `ApplyRow(kind, p, option, grant)`. The actor is known
at both call sites and passed to neither.

**⛔ Blocker 3 - a gate nobody can read.** An unqualified player gets the
fallback node's authored line, which today says *"Needs a max-level
character"*. With several differently-priced stones that sentence is both wrong
and useless: a player cannot tell which stone to come back to, or when. This is
C3's own principle one level up, and D2 rules it in scope.

## 3. Decision ledger

- **D1 - P1 is retired: each site names its own price, and there is no global
  rule left.** The only requirement is what a stone authors, and the server
  enforces exactly that. ⚑ The **existing stone keeps `minLevel: 30`**, so
  nothing about today's loop changes until a second stone is authored. ⚑ The
  rejected alternative was a global floor stones may raise: it puts the number
  in two places again, which is precisely the coupling this plan exists to
  remove.
- **D2 - an unmet gate is NAMED, with progress.** *"Requires level 25, and
  `The Lost Lamp` completed."* A gate you cannot read is indistinguishable from
  one that is merely hard (D18's rule, applied to the site instead of the
  reward).
- **D3 - the stone lists its own rewards**, by unlock key, on the node that
  already carries `rows`. The reward JSONs keep their current shape and learn
  nothing about where they are offered. ⚑ Order is authored, so a site controls
  the order its rows appear in.
- **D4 - reward lists MAY overlap.** The same unlock key may sit on several
  stones, and spending it at one removes it from every one of them. This is
  free: `bloodline_unlocks`' primary key already enforces once-per-slot, and P4
  ("a taken entry leaves that bloodline's catalog forever") already says it.

### Proposals adopted without a choice prompt (PO may veto any)

- **P1 - the pick carries its gate.** `SkillComponent.PendingAscension` becomes
  a small struct: the unlock key **plus a snapshot of the site's conditions**
  (`[]mobs.InteractionCondition`), taken when the row is clicked. Completion
  re-judges that snapshot with the same `conditionsPass`. ⚑ A snapshot rather
  than a node pointer or a `(MobID, NodeID)` pair: the row source is handed a
  `learner` and has no registry to re-resolve names against, and a pointer into
  loaded content is a lifetime question nobody needs to answer.
  ⚑ **The live-level property survives**, because `conditionsPass` reads the
  player, not the row.
- **P2 - `RowSource` takes the NODE, not the kind.** `PresentRows(node, p)` /
  `ApplyRow(node, p, option, grant)`. This is a net simplification rather than
  an addition: the kind is already `node.Rows`, both call sites already hold
  the node, and the mux keeps dispatching exactly as it does now. It is also
  what makes D3 cheap, since the reward list is a node field.
- **P3 - an authored `rewards` list is refused on any node whose `rows` is not
  the ascension catalog**, the same discipline the loader already applies to
  authored options on a `rows` node.
- **P4 - an unknown unlock key in a `rewards` list HARD-FAILS at boot.** C3's
  lesson, unchanged: an unvalidated reference renders as a row that is locked,
  unpickable and indistinguishable from a gate that is merely hard. ⚑ The check
  cannot live in `mobs` (the `ascension` package imports it, so the reverse is
  a cycle). It belongs where both are known: the loader in `cmd/aurad`, or a
  `CrossValidate` on the ascension side.
- **P5 - a locked navigation row is OPT-IN per row.** Rendering every row whose
  destination is gated would leak hidden nodes across every quest tree in the
  game; `destinationVisible` hides them today and must keep hiding them by
  default.
- **P6 - the ceremony itself does not vary by site.** Same channel length, same
  confirm countdown, same effect, same exit. A site prices the entry and pays
  the reward; it does not re-choreograph the ritual.

## 4. Chunk breakdown

Three chunks, each independently shippable and verifiable.

### C1 - the site owns its price ✅ SHIPPED 2026-08-11 (§9)

The blocker-1 change, and the one that unlocks the ask.

⚑ **P2 MOVED HERE FROM C3**, which retires this section's own "C3 is the only
one that touches an interface": the gate snapshot has to travel through the
`ApplyRow` call, the row source is global, and there is no side channel that
does not break the pick-dies-with-the-cast property. So C1 split into **C1a**
(the interface, behaviour-neutral) and **C1b** (the price), and C3 inherits an
interface that is already right.

| Layer | Change |
| --- | --- |
| `sys/interaction.go` | **P2, pulled forward**: `RowSource` takes the NODE |
| `skills/component.go` | `PendingAscension` carries key + gate snapshot (P1) |
| `sys/ascension_rows.go` | `stash` records the gate; `ValidatePick` re-judges it |
| `sys/persist.go` | `RequestAscension` drops the `maxLevel` comparison |
| `cmd/aurad/ascension_site_content_test.go` | the coupling pin is **replaced**, not deleted |
| `api/mobs/` | a second stone, authored at a different price, as the proof |

⚑ **The coupling pin keeps most of its body.** Its real content is *every
non-fallback node is gated* and *the row-source node is gated*, which stays
true and stays load-bearing. Only the "equals `levelCurve.maxLevel`" assert
goes, and with it the duplication that made the pin necessary.

⚑ **`ValidatePick`'s empty-key branch returns true unconditionally today** and
must not keep doing so: D14's ascend-anyway row is still offered *at a site*,
so it inherits that site's price like every other row.

⚑ **The second stone is content, and its placement is a PO call.** It also must
not stand near the existing stone or the memorial: `E` goes to the nearest
actor, and C3 already paid for that lesson with two conversants 3 units apart.

### C2 - the gate reads

A navigation row whose destination node is gated renders **locked, with the
gate named**, instead of vanishing. `describeConditions` already exists in
`sys`, already covers the whole vocabulary, and already produces
*"3 ascensions in this line (0/3)"* for reward rows.

Opt-in per row (P5). The authored row gains one flag; the site's
"Show me the rewards" row sets it, and every quest tree in the game is
untouched.

⚑ This is the chunk that makes C1's second stone honest. Until it lands, a new
stone's price is only as legible as the fallback text somebody authored by
hand.

### C3 - the site owns its rewards

| Layer | Change |
| --- | --- |
| `mobs/interaction.go` | `InteractionNode.Rewards []string`, refused elsewhere (P3) |
| ~~`sys/interaction.go`~~ | ~~`RowSource` takes the node (P2)~~ — **done in C1a** |
| `sys/ascension_rows.go` | rows come from the node's list, filtered as today |
| `cmd/aurad/loaders.go` | cross-validation, boot hard-fails on an unknown key (P4) |
| `api/mobs/` | the two stones author different lists |

⛑ **THE INDEX SPACE IS THE HAZARD.** `ApplyRow`'s `option` indexes the catalog
today; it must index *that node's* list, and present and apply must derive it
from the same authored order, or a stale click spends a reward the player never
saw. This is the same failure the loader already refuses authored options on a
`rows` node to prevent, and it is what the "present and apply cannot disagree"
pin exists for.

⚑ **An empty list is legitimate** (D14's empty pick is a per-site question now),
and a list every entry of which is spent or gated is the same picture C3 already
handles.

**Order.** C1 → C2 → C3 is the recommendation: C1 unblocks the ask, C2 is small
and makes C1 truthful, C3 is the largest and is the only one that touches an
interface. C1 → C3 → C2 is defensible if differing rewards matter more than
legible prices.

## 5. Schema impact

- **DB: NONE.** `bloodline_unlocks(slot, unlock_key)` already expresses D4, and
  nothing here adds per-site state. A bloodline's history does not record
  *where* it ascended. ⚑ If that ever matters (a memorial line naming the site,
  a per-site achievement) it is a migration and a new plan.
- **FlatBuffers: NONE.** A locked row with authored text and a `skill_id` has
  been on the wire since C2a/D18 and §13.9.
- **conf: NONE.** `game.player.levelCurve.maxLevel` keeps its other meanings and
  simply stops being ascension's price.
- **Content: two new authored keys** (a node's `rewards`, and C2's per-row
  opt-in flag), both optional, both backward-compatible with the eight shipped
  entries and the one shipped stone.
- **Deploy: content plus backend, NOT a both-sides deploy.** No wire change, so
  no hard reload.

## 6. Test strategy

- **TDD red-first, mutation-verified on every load-bearing pin**, as the whole
  ascension plan was. The specific mutations worth writing down in advance:
  delete the completion re-judge (a quest abandoned mid-channel must refuse);
  make `ValidatePick` accept the empty key unconditionally again; serve node A's
  rows and apply against node B's list; drop the boot cross-validation.
- **The negative control that matters**: a player who qualifies at stone A but
  not at stone B must be refused at B. One player, two sites, in one test.
- **Harness boundaries.** `c2a-ascension-site.mjs` owns the ORIGINAL stone and
  keeps asserting today's behaviour unchanged. A new script owns the second
  stone, its price and its list. Two harnesses must not assert the same content.
  ⚑ Both existing scripts prove the below-gate preview on a fresh level-1
  character before raising the level, so any new site priced at level 1 would
  make that shape unreachable.
- **`c3-memorial-catalog.mjs` is affected by C3 only**, through the `RowSource`
  signature, and must be re-run there.

## 7. Open questions and deferred

**Open, and PO calls when the time comes:**

- ~~**Where the second stone stands, and what it asks for.**~~ **ANSWERED at C1
  (PO 2026-08-11):** `FrontAscensionStone` stands at **(55.2, 20.2)**, inside
  the army camp behind the front line, and asks for **level 25 + a completed
  `thin-the-orc-line`**. The placement is measured rather than eyeballed (§9).
- **Whether a site's price should be visible from outside talking range** (a
  map marker, a plate). Out of scope here.
- **The lore write for both stones**, inherited unchanged from the archived
  plan's §8.

**Deferred by ruling or by dependency:**

- **Per-faction sites** stay where the archived plan's D8 left them, blocked on
  `plan-camps.md`.
- **Per-site history** (which stone a name was laid down at) is the one idea
  here that would cost a migration. Not taken.
- **A price that is not a condition** (an item, a payment, a cooldown between
  ascensions) needs a vocabulary the node conditions do not have, and nothing
  currently asks for it.

## 8. Amendments this plan carries

- **`docs/archive/plan-ascension.md` P1 is retired by D1.** The archived doc
  stays as the historical record; this plan is where the rule now lives.
  Its §8 "Numbers" entry (the channel length) is unaffected.
- **CLAUDE.md's "Ascension's leftovers" bullet** loses the tuning-open mention
  of the entry price once C1 lands, and keeps the rest.

## 9. Chunk ledgers

### C1 — the site owns its price ✅ 2026-08-11, `[uncommitted]`

Shipped in two sessions in one chat, deliberately split so a behaviour-neutral
refactor could be verified by *nothing changing*: **C1a** moved the row-source
interface, **C1b** moved the price. **Schema: DB NONE · FlatBuffers NONE · conf
NONE** — one Go pass plus one content file, client untouched, so an ordinary
deploy (content **and** backend, but no wire change and therefore no hard
reload).

**Three PO calls:** the second stone asks **level 25 + a completed
`thin-the-orc-line`** · it stands **at the front** (55.2, 20.2) · **P2 pulled
forward** into C1a, which is why §4's "C3 is the only chunk that touches an
interface" no longer holds.

⛑ **THE GATE CANNOT BE A CLOSURE, AND THE REASON IS A LIFETIME.** P1 says the
pick carries a snapshot of the site's conditions; the obvious Go shape is a
`func() bool` capturing the player, since `skills` cannot name
`[]mobs.InteractionCondition` (`mobs` imports `skills`, so the honest field is an
import cycle). It is wrong: **`ConnectionStateSystem.reattach` installs the
STASHED SkillComponent — cast state included — into a freshly built
`player.New(...)`**, and nothing on that path cancels the cast, so a mid-channel
disconnect/reconnect resumes the ceremony on a *different object*. A captured
player would then be judged detached, losing the live-player property that is the
entire reason the old check was in Go rather than in SQL. The shipped shape is
`AscensionPick{Key string; Gate any}` — data, judged by `sys` against the live
player — and one type assertion yields all three states: nil interface (nobody
priced it) refuses, typed empty slice (ungated site, legitimate under D1) passes,
wrong type refuses.

⚑ **A SIGNATURE CHANGE WAS THE ONLY WAY IN.** The row source is global and
`ApplyRow(kind, …)` never learned which node it spoke for, so P2 was not a
tidy-up that could wait for C3 — the gate has to travel through that call. Doing
it alone first (C1a) meant its acceptance criterion was *every existing test and
both existing harnesses unchanged*, which is only cheap to check while it is
alone in a diff.

⚑ **THE PIN THAT SURVIVED IS NOT THE PIN THAT WENT.** The old content test
required the stone's gate to EQUAL `game.player.levelCurve.maxLevel` — the
duplication D1 exists to remove — and it also required *every non-fallback node
to be gated*, which is about `present()` picking the first passing node as the
greeting and has nothing to do with the cap. The first assert is gone with
`confMaxLevel`; the second is now walked over **every def carrying an
`ascension_catalog` rows node**, so stone three is pinned the day it is authored.
Two new pins ride with it: sites stand clear of every other conversant (the
threshold is derived from the two talk ranges, because the shipped village pair
is 3.0 units apart *by design*), and not all sites charge the same price.

⛑ **THE SECOND STONE'S PRICE IS NOT HARNESS-PAYABLE, and that is measured, not
assumed.** `c1-front-stone.mjs` reports **9/12 with 3 inconclusive**: the journal
read **0/5 orcs killed** after 30 s of standing in the pack with the aura on and
four skill points spent, because an elite Orc carries ~3,617 HP (420 ×
1.12¹⁹) against a Dire Wolf's ~222 — 16× what `c3-memorial-catalog` grinds
through in the same window. **PO ruling 2026-08-11: leave the price, record the
gap.** The three legs stay in the script and go green for free if anything ever
makes it payable (a cheaper gate, a kill cheat, a stronger starting build); the
positive half is carried by Go
(`TestAscension_OnePlayerTwoSites_ThePriceThatCountsIsTheSitesOwn`,
`TestRequestAscensionDoesNotPriceTheAscensionItself`), and what only a browser
can show — the stone answers, it is the *right* stone, level 25 alone does not
open it — passes.

⚑ **THREE CONTENT-CENSUS PINS COUNT THE ROSTER** (`items/mobs`: conversants,
roles, xpFactor-0 species) and a new authored mob breaks all three. They are
cheap to update and are *supposed* to break; the trap is that they read `api/`
from disk, so **`-count=1` is mandatory** — an earlier suite reading in this very
session looked clean while they were already broken.

**Verified.** TDD red-first at both surfaces: 7 Go tests red for the right
reasons before the implementation, plus one for the mux's nil path. **6 mutations
caught** — delete the completion re-judge · the empty pick skips the gate · an
unpriced pick passes · the second stone is authored but never placed · both
stones charge the same · the stone stands on the captain's toes. `go test
-count=1 ./...` **34 packages ok**, `-race` clean, boot **68 mobs / 488 spawns,
0 WARN / 0 ERROR**. Harnesses: **`c2a-ascension-site` 29/29** and
**`c3-memorial-catalog` 14/14** (both exact baselines, re-run for C1a because P2
touches the memorial's row source), **`c1-front-stone` 9/12 + 3 inconclusive**
(new, owns the front stone only).

**Owed by C2**, and now visible in the world: the front stone's price is only as
legible as the fallback line authored by hand for it.
