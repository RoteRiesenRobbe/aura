# Plan: Ascension sites - many stones, each with its own price and its own rewards

> **Status: COMPLETE — C1, C2, C3a and C3b all shipped 2026-08-11 (`509321e6`,
> `d66ca9f3`, `350701c9`, C3b uncommitted).** Four PO rulings taken in the
> design session (D1-D4), three more at C1 (the second stone's price and place,
> and P2 pulled forward), four more at C3's design pass (D5, D6, P7, P8 — and
> D5 amends §5). Successor to
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
- **D5 - a catalog node MUST author its list; there is no catch-all.** (PO
  2026-08-11, at C3.) An absent `rewards` is a **boot failure**, an authored `[]`
  is the legitimate empty list of §4, and only an authored list is ever served.
  ⚑ This **overrides §5's "optional, backward-compatible"**, and for D1's own
  reason one layer up: "absent means the whole catalog" is exactly the implicit
  global that C1 took out of the price. It also keeps the resolved Go field a
  plain `[]string` — absent is refused at the loader, so nil and `[]` may mean
  the same thing everywhere below it. ⚑ The cost is paid once: twelve test
  fixtures across three files must author a list.
- **D6 - the front stone offers `KeenEye`, `FrostShield`, `RimeBurst`.** (PO
  2026-08-11.) Three entries against the village's eight, so "the lists differ"
  is unmistakable; `FrostShield` is gated, so a locked row differs per site too;
  and `RimeBurst` is the **deliberate overlap** that lets one Go test pin D4 —
  spend it at the village stone, it is gone from the front stone as well.

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
- **P7 - a catalog entry offered by NO site is a boot WARN** (PO 2026-08-11).
  P4's mirror: under D5 nothing is served implicitly any more, so a reward file
  nobody placed on a stone is dead content and today nothing says so. A warning
  rather than a failure, following `quests.CrossValidate`'s own rule for content
  that loads but cannot be reached: authoring the reward file and placing it are
  two edits, and the order between them should stay free. It is visible because
  the boot log's health check is *0 WARN / 0 ERROR*.
- **P8 - the village stone authors all eight in a deliberately NON-catalog
  order.** A test-strength decision, not a content one. `Catalog.All()` is sorted
  by unlock key, so a stone whose list happens to be alphabetical leaves **every
  index unchanged**, and the central mutation of this chunk — index the catalog
  instead of this node's list — becomes invisible at every row. Reordered, that
  mutation hands over the *wrong reward*, which `c2a-ascension-site`'s existing
  ceremony leg already checks end to end.
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

### C2 - the gate reads ✅ SHIPPED 2026-08-11 (§9)

A navigation row whose destination node is gated renders **locked, with the
gate named**, instead of vanishing. ⚑ **As built it was two halves, not one**:
the flag, and the fallback-node row for it to apply to: the shipped stones had
no such row at all (§9). `describeConditions` already exists in
`sys`, already covers the whole vocabulary, and already produces
*"3 ascensions in this line (0/3)"* for reward rows.

Opt-in per row (P5). The authored row gains one flag; the site's
"Show me the rewards" row sets it, and every quest tree in the game is
untouched.

⚑ This is the chunk that makes C1's second stone honest. Until it lands, a new
stone's price is only as legible as the fallback text somebody authored by
hand.

### C3 - the site owns its rewards

**Split C3a / C3b** (PO 2026-08-11), the C1a/C1b discipline reused because it
worked: the plumbing and the content both move indices, and if they move in one
commit a harness delta cannot be attributed to either without bisecting by hand.

| | Layer | Change |
| --- | --- | --- |
| **C3a** | `mobs/interaction.go` | `InteractionNode.Rewards []string`; **required** on a catalog node (D5), refused elsewhere (P3), refused when it names one key twice |
| **C3a** | `ascension/interactions.go` | `CrossValidate(mr, catalog)`: unknown key HARD-FAILS (P4), unoffered entry WARNS (P7) |
| **C3a** | `cmd/aurad/loaders.go` | calls it, inside `loadAscensionCatalog`, which already holds `mr` |
| **C3a** | `sys/ascension_rows.go` | one `entriesFor(node)` feeding present, apply **and `anyPickable`** |
| **C3a** | `api/mobs/` | both stones author **the same eight, in catalog order** — behaviour-neutral by construction |
| **C3b** | `api/mobs/` | the village list is reordered (P8); the front stone drops to its own three (D6) |
| **C3b** | harnesses + content test | the new pins, and `c2a`'s new row order |
| ~~C3~~ | ~~`sys/interaction.go`~~ | ~~`RowSource` takes the node (P2)~~ — **done in C1a** |

⚑ **C3a's acceptance criterion is that NOTHING changes**: every Go test and all
three harnesses at their exact baseline, because both stones serve the same eight
entries in the same order they are served today. C3b is then a pure content diff
with its pins.

⛑ **THE INDEX SPACE IS THE HAZARD.** `ApplyRow`'s `option` indexes the catalog
today; it must index *that node's* list, and present and apply must derive it
from the same authored order, or a stale click spends a reward the player never
saw. This is the same failure the loader already refuses authored options on a
`rows` node to prevent, and it is what the "present and apply cannot disagree"
pin exists for.

⛑ **`anyPickable` IS THE SECOND INDEX-SPACE READER, and the table above is the
first place this plan names it.** It guards D14's ascend-anyway row, and it asks
today whether anything *in the whole catalog* is pickable. Left global under
per-site lists, a stone whose own three entries are all spent or gated would
**present** the ascend-anyway row (its list has nothing pickable) and then
**refuse the click** (some other stone's entry still does), which is precisely
the present/apply disagreement L24's pin exists to catch, arriving through a
method nobody was looking at. It has to be node-scoped like the other two.

⚑ **`ValidatePick` stays catalog-global, deliberately.** What can regress during
the ten-second channel is the entry's own gate (re-judged there) and the site's
price (re-judged through `Gate`, C1). Membership in a site's list is *static
content*, already validated when the row was clicked, so re-checking it would add
a lookup and no property — and the pick carries a gate snapshot, not a node.

⚑ **An empty list is legitimate** (D14's empty pick is a per-site question now),
and a list every entry of which is spent or gated is the same picture C3 already
handles.

⛑ **THE FRONT STONE'S LIST IS NOT BROWSER-REACHABLE, and that is measured.**
`QUEST ADVANCE` refuses `thin-the-orc-line`'s first stage outright (*"stage
%q is an objective stage; it advances off its counters"*), so reaching that
stone's catalog node still needs five real orc kills — the price C1 measured as
unpayable and the PO ruled to leave. So the differing list is carried by Go, and
**C3's browser proof is the village stone's authored ORDER** (P8), which `c2a`
reads for free. Same shape as C1's recorded gap.

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
  opt-in flag). ⚑ **D5 overrode this line at C3**: the flag is optional, but
  `rewards` is **required** on a catalog node, so the two shipped stones are both
  edited rather than inheriting a default.
- **Deploy: content plus backend, NOT a both-sides deploy.** No wire change, so
  no hard reload.

## 6. Test strategy

- **TDD red-first, mutation-verified on every load-bearing pin**, as the whole
  ascension plan was. The specific mutations worth writing down in advance:
  delete the completion re-judge (a quest abandoned mid-channel must refuse);
  make `ValidatePick` accept the empty key unconditionally again; serve node A's
  rows and apply against node B's list; drop the boot cross-validation. **Added
  at C3's design pass**: leave `anyPickable` reading the whole catalog (the
  ascend-anyway row is presented at a stone and refused there) · accept `rewards`
  on a `memorial_names` node · let one list name a key twice · let a catalog node
  author no list at all (D5).
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

### C1 — the site owns its price ✅ 2026-08-11, `509321e6`

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

### C2 - the gate reads ✅ 2026-08-11, `d66ca9f3`

A navigation row whose destination is gated now renders **locked, with the gate
named**, instead of vanishing, and **opt-in per row** (P5). **Schema: DB NONE ·
FlatBuffers NONE · conf NONE**, verified against `model/conversation.go` rather
than reasoned: `Locked` plus authored text has been on the wire since C2a/D18.
Go plus two content files, **client untouched**, so an ordinary both-parts deploy
with no hard reload. **One PO call:** both stones' fallback lines were rewritten
to stop hand-typing the price, so each price is authored exactly once (in the
node's conditions) and cannot go stale.

⭐ **THE ROW HAD NOWHERE TO LIVE, AND FINDING THAT OUT WAS THE FIRST HALF OF THE
CHUNK.** §4 describes C2 as a rendering change, and it is, but the shipped
stones had **no row to render**: the price sat on `ready`, an unqualified player
was bounced to `root`, and `root` authored **no options at all**. So the flag
alone would have changed nothing on either stone; the chunk is the flag *plus*
the row on the fallback node that the flag applies to. A design that stopped at
"presentOptions renders it locked" would have shipped green with no visible
difference in the game.

⛑ **EVERY EMPTY FIELD ON THAT ROW IS LOAD-BEARING, and `Next` most of all.**
`present()` serialises **only visible nodes**, so the destination is not in the
streamed tree at all, so a locked row that kept its `Next` would be one render bug
away from walking a player into a node their client does not have. Dropping it is
also what carries the row past `pruneEmptyDestinations`, which exists to delete
navigation rows whose target shows nothing, *precisely* what a gated target
looks like from there. A locked row is not a dead end; it **is** the content.
(`Reply` empty and `GrantIndex` = the navigation sentinel are Q1/R1's inert row,
inherited unchanged.)

⚑ **THE CLIENT NEEDED NOTHING, and that was checked rather than hoped.**
`Conversation.ts` gives a locked row no `pointerdown` handler and `model.take`
guards the same way, so the row is inert on both ends the day it appears. Zero
frontend diff in a chunk whose entire subject is what a player sees.

⛑ **THE GATE NAMED THE AUTHORING KEY.** `describeCondition` rendered a quest
condition as `complete "thin-the-orc-line"`: a string no player has ever seen,
in the one surface whose whole purpose is legibility, and it would have shipped
that way because no *reward* gate had used a quest before. Fixed at the source
with `quests.Ledger.Title`, which degrades to the id (nil registry in the sim, or
an unknown quest): a gate naming **nothing** is worse than one naming a key. It
lands on the reward rows too, where `Lantern - locked: complete "The Lost Lamp"`
now reads as English.

⚑ **THE LOADER REFUSES THE FLAG IN THREE PLACES**, all of them "this could never
fire": no `next` (nothing to name), an **unconditional** destination (always
visible, so the flag is inert), and a row that **grants** (it would be offered
locked and refused by `applyGrant`, the present/apply disagreement L24's pin
exists to prevent). Same discipline as the `rows`-node option refusal: a silently
inert authored key is what `DisallowUnknownFields` catches one keystroke earlier.

⚑ **THE HARNESS BASELINES ASSERTED THE ABSENCE OF THIS FEATURE**, in three legs
across two scripts (`c2a` leg 2, `c1-front-stone` legs 1 and 4, all of the form
*"the preview offers no rows"*), plus `c2a`'s `PREVIEW_LINE` constant, which
quoted the very sentence the PO call deleted. Read **before** writing code, so
they were rewritten as part of the chunk rather than discovered red inside it.

⭐ **AND ONE OF THEM COULD BE MADE TO RUN.** C2's headline claim (one character,
two stones, two different prices, both readable) sat in `c1-front-stone` leg 4,
which **skips**, because C1 measured that the front stone's orc gate is not
harness-payable. The same claim needs only the level cheat: at level 25 the
village stone answers `level 30 (25/30)` while the front stone answers
`level 25 (25/25), complete "Thin the Orc Line"`. Scored as a new leg 2b, green,
with the unpayable form left in place. ⛑ Its assertion is that the two counters
**disagree**: a row that rendered the node it stands *on* instead of the node it
leads *to* would still look plausible at a glance, and only the numbers say
otherwise.

**Verified.** TDD red-first at three surfaces (loader, render, quest registry);
**4 of 4 mutations caught**: the opt-in guard deleted (the P5 leak, caught by
the negative-space pin *and* three pre-existing quest-tree tests) · the row not
marked locked · the gate not named · the row keeping its destination and a real
grant index. `go test -count=1 ./...` **0 FAIL** across 34 packages bar the known
`TestDwell` flake, **proven at HEAD by stash-and-rerun**; `-race` clean on the
four touched packages. Boot **68 mobs / 13 quests, 0 WARN / 0 ERROR**. Harnesses:
**`c2a-ascension-site` 30/30** (was 29/29, the flipped leg became two),
**`c1-front-stone` 13/16 + the same 3 inconclusive** (was 9/12 + 3),
**`c3-memorial-catalog` 14/14** (exact baseline, re-run because the quest-title
change lands on its catalog rows; its trailing *"undelivered clicks: row not
found"* diagnostic is unchanged by C2, and if anything this chunk gives that
click a row rather than taking one away).

**Left for C3**: the site owns its rewards. C2 changed nothing about the reward
list, and the index-space hazard §4 records is untouched.

### C3a - a site authors what it offers (plumbing) ✅ 2026-08-11, `350701c9`

The whole of C3's machinery, shipped **behaviour-neutral by construction**: both
stones author the same eight rewards in the order `Catalog.All()` already served
them, so the acceptance criterion is that nothing changes anywhere. C3b is then a
pure content diff. **Schema: DB NONE · FlatBuffers NONE · conf NONE** — one new
authored content key, Go only, **client untouched**.

⛑ **`anyPickable` WAS THE SECOND INDEX-SPACE READER, and no design document
named it.** §4 called out `ApplyRow`'s `option`, which is the obvious half; the
one that would have shipped is the guard on D14's ascend-anyway row. It asks
"is anything pickable", and the answer has to mean *at this site*: left global,
a stone whose own list is spent or gated **presents** the row (nothing pickable
here) and then **refuses the click** (something is pickable elsewhere), which is
an L24 present/apply disagreement arriving through a method that looks like a
private helper. Found by reading the call sites for the index space, pinned
red-first, and the mutation that restores the global scope reddens three tests.

⚑ **D5 CHOSE THE STRICTER SHAPE AND `§5` HAD TO BE AMENDED FOR IT.** The plan as
approved called `rewards` optional with an absent list meaning "the whole
catalog". That is the implicit global C1 removed one layer up, so the PO ruled it
required: absent hard-fails, `[]` is the authored empty list. It also collapses
the runtime type — absent is refused at the loader, so nil and `[]` may mean the
same thing everywhere below — at the cost of a `*[]string` in the authored shape
and twelve fixtures across three files.

⚑ **THE CROSS-VALIDATION HAS NOWHERE ELSE TO LIVE, and this is now recorded
twice** (P4 predicted it, the build confirmed it): `mobs` holds no catalog and
cannot import one (`ascension` imports `mobs`), and the catalog loader does not
know who offers what. `ascension.CrossValidate(mr, catalog)` follows
`quests.CrossValidate` exactly and is called from `loadAscensionCatalog`, which
already takes the mob registry for the gate half.

⚑ **THE THREE CONTENT CENSUSES BROKE AGAIN, exactly as the C1 ledger warned**,
and this time from a content *edit* rather than a new mob: adding a required key
made every `items/mobs` census that parses `api/` red until both stones authored
it. They are supposed to break. `-count=1` and `cp-defs` are both mandatory.

⛑ **A CONTENT TEST WAS DRIVING THE PROVIDER AGAINST CONTENT NOBODY SHIPS.**
`catalogRowsNode()` built a synthetic node, which was harmless while the node was
only a dispatch key — and became meaningless the moment the node carried the
list. It now digs the named stone's real node out of the registry, so
*"a first life sees five pickable and three locked"* is once again a statement
about the village stone rather than about a fixture.

**Verified.** TDD red-first at three surfaces (loader, cross-validation, row
source); **8 of 8 mutations caught** — the global `anyPickable` · apply indexing
a re-sorted list · an unknown key rendered as a blank row · the D5 refusal
deleted · the P3 refusal deleted · a duplicated key tolerated · P4's hard-fail
deleted · P7's warning deleted. `go test -count=1 ./...` **34 packages ok** bar
the known `TestDwell` flake (measured 1/8 here, inside its recorded band);
`-race` clean on the four touched packages. Boot **68 mobs / 13 quests / 8
rewards / 488 spawns, 0 WARN / 0 ERROR** — the P7 warning is silent because every
entry is offered. Harnesses, all three at their **exact** baselines, which is the
whole acceptance criterion of a behaviour-neutral chunk: **`c2a-ascension-site`
30/30** (its ceremony leg is the end-to-end path through the new `entriesFor` —
Rime-Burst picked, channelled, spent), **`c1-front-stone` 13/16 + the same 3
inconclusive**, **`c3-memorial-catalog` 14/14** (its trailing *"undelivered
clicks: row not found"* diagnostic unchanged).

**Left for C3b**: the content. The village list is reordered off catalog order
(P8), the front stone drops to its own three (D6), and the pins that only differ
once the two disagree — *not all sites offer the same list*, and `c2a`'s row
order becoming an authored fact rather than an alphabetical accident.

### C3b - the two stones offer different things ✅ 2026-08-11, uncommitted

The content half, and the chunk that makes C3a visible: the village stone keeps
all eight but authors its own order (five takeable, then the three walls), the
front stone drops to **KeenEye · FrostShield · RimeBurst** (D6). **Schema: DB
NONE · FlatBuffers NONE · conf NONE** — two content files, three new Go pins and
one harness leg, **no production Go at all**.

⭐ **THE ORDER IS THE ONLY PLACE A BROWSER CAN SEE THIS CHUNK.** The two lists
differ, but the front stone's catalog node sits behind an orc gate C1 measured as
unpayable, so *"a site owns its rewards"* is unreachable in a harness at that
stone. `c2a` reads the village's rows instead, and P8 is what makes that reading
mean something: the panel now shows `Envenom | Frostbite | Keen Eye | Rime-Burst
| Venomward | Blight… | Frost Shield… | Lantern…`, where the catalog's own sort
would interleave the three locked rows at positions 1, 3 and 6. Scored as a new
leg (**31/31**, was 30/30).

⛑ **THE FIRST VERSION OF THE ORDER PIN WAS SATISFIED BY THE WRONG STONE, and the
mutation is what said so.** It was written generically — *at least one site
orders its rewards itself* — which is the shape this file prefers, and it stayed
green when the village list was mutated back to alphabetical, because the FRONT
stone's three keys happen not to be sorted either. That is exactly the state
where the hazard stops being observable: the village is the only stone a browser
can open. The pin now names it, with the reachability argument attached.

⚑ **ONE NEW PIN CANNOT FAIL TODAY, and it says so in its own doc.** *The reward
lists overlap* (D4 reachable in play) is implied by the village offering the
whole catalog, so no edit to the front stone can redden it — only a shrinking
village can, which is precisely the day two disjoint stones become authorable
unnoticed. Recorded rather than dressed up.

⛑ **THE ROW-SOURCE WIRING WALK HAD QUIETLY STOPPED TESTING CONTENT.** It drove
the provider with one arbitrary probe skill, which was a fine stand-in while a
node's rows were the whole catalog — and became a key no site names once sites
authored their own. It kept passing, because a site with nothing pickable is
served D14's ascend-anyway row, so *"the provider serves this kind"* stayed true
while none of the content under it was reaching the panel. Its catalog is now
built from what the sites actually offer.

**Verified.** TDD red-first (three pins red before the content edit); **3 of 3
content mutations caught** — the village list re-sorted · the front stone
copy-pasted from the village · the two lists made genuinely disjoint (which also
reddens P7's *offered by no site* pin, doing exactly its job). `go test -count=1
./...` **0 FAIL** across 34 packages bar the known `TestDwell` flake; `-race`
clean on the four packages; boot **68 mobs / 13 quests / 8 rewards, 0 WARN / 0
ERROR** (P7 still silent — the village offers everything). Harnesses:
**`c2a-ascension-site` 31/31** (was 30/30, the new order leg), **`c1-front-stone`
13/16 + the same 3 inconclusive**, **`c3-memorial-catalog` 14/14** — the last two
exact baselines, re-run because both read the village stone's catalog node.

**C3 is complete, and with it the plan.** What is left is not chunk work: §7's
open questions (a price visible from outside talking range; the lore write both
stones still owe) and the deferred cluster.
