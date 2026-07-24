# Plan — Unlock source attribution (Playtest-1 Pass-B items 1c + 1d)

**Status:** ✅ DONE — both chunks + an NPC-name follow-on, committed `2bfee286`
2026-07-24 (planning session 2026-07-23). Server handed to the PO for the
in-game read pass; not yet PO-verified. Closes the last open playtest-1 items.
Deferred from `plan-playtest1-feedback.md` §Pass B item 1 (see its "Watch
items / open calls" — items 1c + 1d were SKIPPED there as "just reposition";
the overlap half was fixed by 1b, the attribution half was never done).

## Outcome / deviations from plan (2026-07-24, `2bfee286`)

Implemented as planned, with these notes:

- **Chunk 1** landed exactly as designed: `EntityMessage.kind` enum + the
  `entity_id`-carries-skill-id overload, `model.Client.SendUnlock`, client
  composes the line from its catalog. Wire-compat pin + reconnect-silent pin
  green.
- **Chunk 2** — the recipe emit lives in **`player.ApplyRecipeCascade`** (which
  has the client), not in `skills.ApplyRecipes` (which has no player/client) as
  the site table loosely suggested; `ApplyRecipes` already returns only the
  freshly-discovered ids, so the cascade is naturally single-announce. Kill-drop
  and milestone/cheat sites got an explicit `!HasDiscovered` guard so an
  already-known grant rolls/relevels without re-announcing.
- **Mob name** uses `skills.DeriveDisplayName(def.Name)` (the CamelCase→spaced
  derivation the `/mobs` nameplate catalog already uses) — there is no
  `DisplayName` on the runtime `MobDefinition`.
- **NPC-name follow-on (beyond the original plan):** the plan's open question
  #1 ("NPC display-name accessor… fall back to the type name") was resolved by
  **adding an authored optional `name` field** to the NPC (zone JSON → `world.Npc`
  → `npc.New` → `Npc.Name()` → `model.NpcEntity`), because NPCs carried no name
  and deriving purely from the sprite mislabels shared-sprite NPCs (Shaman and
  Emberkeeper both ride the `Hermit` sprite; Dog → "Dog Npc"). `npcName` prefers
  the authored name, else the sprite-derived `DeriveDisplayName`. Authored
  `name` for Dog / Shaman / Emberkeeper; the other 11 NPCs fall back correctly.
- **Presentation (PO feedback at the read pass):** the banner now breaks the
  source onto a 2nd line (`white-space: pre-line`; `\n` in `textContent` was
  collapsing), the `.unlock` variant is ~20% smaller, and the shared banner got
  a hard 8-direction black outline + `-webkit-text-stroke` for contrast over a
  similarly-coloured background. Sizes/outline are [PLACEHOLDER].
- **Still 4 sources, not 5:** world-exploration clue anchors and character
  sacrifice have no grant code yet; they add their own `SendUnlock` site when
  they land (see below).

Verified: `go build ./...` exit 0; `go test ./...` 29 packages with tests pass /
0 failures; boot `83 skills/14 factions/50 mobs/10 recipes/777 props/471 spawns/
5 campfires (safeRadius 1.5)/14 npcs, 0 panics`.

## The feedback

The first external playtester "never noticed *where* abilities came from" —
new auras/passives/cooldowns appeared with no indication of their source
(which NPC taught it, which mob dropped it, what level granted it). The
Pass-B unlock banner reads only `New aura: Damage`, with no source line.

- **1d — source attribution** (the substance): the unlock banner should name
  its source, e.g. `Taught by: Farmer`.
- **1c — sequencing** (already effectively handled): Pass-B item **1b** moved
  the unlock banner to the top of the screen, off the NPC speech bubble, so
  the original "popup covers the NPC text" overlap is gone. PO ruling
  2026-07-23: **1d only** — no extra delay logic; the server emits the unlock
  right after the NPC line and the two coexist on separate surfaces.

## Why this needs the server (the core finding)

The current unlock banner is **client-derived and source-blind**.
`HUD.updateSpellbook` (`frontend/.../HUD/logic/HUD.ts:485`) diffs the incoming
spellbook id list against the previous tick and, for each genuinely new id,
fires `AlertBanner.show('New <category>: <name>', 'unlock')` at
**`HUD.ts:559`**. The diff knows *what* unlocked but never *from where* — the
source exists only at the server grant site, one snapshot earlier.

So attribution requires the **server** to author (or at least tag) the unlock
event. Every unlock funnels through one primitive —
`SkillComponent.Discover(id)` (`backend/pkg/aura/skills/component.go:408`) —
but `Discover` is source-agnostic and is also hit by non-announce paths
(sim harness, and it must stay silent on reconnect-restore). Therefore the
source string is emitted **at each grant call site**, not inside the funnel.

### The four real grant sites (+ dev cheat)

| # | Source | Site | Label |
|---|--------|------|-------|
| 1 | Milestone level-up | `model/player/player.go:720` (`applyMilestoneUnlocks`) | `Level N reward` |
| 2 | Monster-kill drop | `model/mob/mob.go:1403` (`rewardPlayer`) | `Dropped by: <MobName>` |
| 3 | NPC teaching | `sys/npc.go:131` (`onApproach`) | `Taught by: <NpcName>` |
| 4 | Recipe/combination cascade | `skills/recipe_apply.go:32` (`ApplyRecipes`) | `Combination discovered` |
| — | Dev cheat `SKILL <name>` | `sys/cmd/cmd.go:141` | `Cheat` |

> **Not implemented, out of scope:** the design vision lists five sources.
> **World-exploration clue anchors** and **character sacrifice** have **no
> grant code today** (`Anchor` in the codebase means encounter/campfire points,
> not skill unlocks; sacrifice is a step-8+ feature). When those land they add
> their own `Discover` call site and pass their own source label — this plan's
> pattern extends to them for free. So "all 5 sources" is really 4 today.

## Decisions (PO choice prompts, 2026-07-23)

1. **Wire mechanism — add an `EntityMessage.kind` field.** A second sentinel
   `entity_id` is **not safe**: `ecs.NewBasic()` allocates ids as
   `atomic.AddUint64(&idInc, 1)` starting at 1, so only id 0 is reserved-able
   and it is already taken (system announcement → banner, `chat/system.go:15`).
   Append one scalar to the table instead (backward-compatible; old clients
   default it to 0):
   ```
   enum EntityMessageKind:ubyte { Chat = 0, Unlock = 1 }
   table EntityMessage {
       entity_id:ulong;   // on Unlock: repurposed to carry the skill id
       message:string;    // on Unlock: the source label only ("Taught by: Farmer")
       kind:EntityMessageKind = Chat;   // NEW
   }
   ```
   Cost: regenerate Go + TS FlatBuffers bindings (`api/schema/make.sh`) and
   rebuild (`make -C backend build`). This is a schema change, so `-content`
   iteration does **not** cover it.

2. **Source labels — descriptive per source** (table above), not a uniform
   `From: X`.

3. **1d only** — no client-side delay/sequencing; 1b already fixed the overlap.

### Presentation split (why `entity_id` carries the skill id)

The **client keeps owning presentation.** The server sends only the source
string; it does *not* compose the `New <category>: <name>` line. That line is
built client-side from the catalog (`skillCategory(id)` / `skillDisplayName(id)`,
the same helpers used at `HUD.ts:559`), which already applies the 4 client-side
`displayName` overrides. If the server authored the full string it could
disagree with the client's display name for those 4 skills. So:

- **Unlock message:** `entity_id = <skill id>`, `message = <source label>`,
  `kind = Unlock`.
- **Client** looks the skill id up in its catalog, composes
  `New <category>: <displayName>` + newline + the source label, and shows it as
  an `'unlock'` banner.

This mirrors the existing `entity_id = 0` overload — a documented reuse of a
generic numeric field for non-entity messages.

## Chunk breakdown

Small feature; one execution chunk is fine, but split for review clarity:

### Chunk 1 — Wire + client display (the plumbing)

**Schema** (`api/schema/`):
- Add `EntityMessageKind` enum + `kind` field to `EntityMessage` in
  `server.fbs`; regenerate Go + TS bindings.

**Backend wire helper** (import-clean — verified no cycle):
- `codec.EntityMessageFlatbufMarshal` gains a `kind` arg (or a sibling
  `MarshalUnlock`); existing callers pass `Chat`.
- Add `SendUnlock(skillID uint64, source string)` to the **`model.Client`**
  interface (`model/client.go`). Implement in `model/client/client.go` (which
  **already imports `codec`**) — marshals `EntityMessage{entity_id: skillID,
  message: source, kind: Unlock}` and enqueues it. Grant sites only ever touch
  the `model.Client` interface, so no package imports `codec` that didn't
  already, and no import cycle (codec imports `model`, never `model/client`).

**Frontend** (`Backend.ts` + `HUD.ts`):
- `Backend.ts:222` EntityMessage handler: branch on `kind`. `Unlock` →
  compose `New ${skillCategory(id)}: ${skillDisplayName(id)}\n${message}` (id =
  `entityMessage.entityId()`), `AlertBanner.show(text, 'unlock')`. `Chat`
  (default) keeps today's `id===0 ? announce : Chat.showMessage` split.
- `HUD.ts:559`: **remove** the `AlertBanner.show(...)` call (the banner now
  comes from the server). **Keep** `li.classList.add('unlocked')` +
  `anyUnlock = true` (555–556) so the panel `unlockPulse` (565–567) and the
  discovered-marking still work, source-agnostic.

### Chunk 2 — Emit source labels at the four grant sites

Each site, immediately after its `Discover(id)`, calls
`p.Client().SendUnlock(id, <label>)`:

1. **Milestone** (`player.go:720`): `applyMilestoneUnlocks(from, to)` — label
   `"Level " + strconv.Itoa(to) + " reward"` (the milestone level).
2. **Kill-drop** (`mob.go:1403`): `rewardPlayer` — label
   `"Dropped by: " + m.definition.<DisplayName>`.
3. **NPC-teach** (`npc.go:131`): `onApproach` — label
   `"Taught by: " + n.<Name>`. Emit **after** `speak()` so the source line
   trails the teaching bubble (satisfies 1c's intent without added delay).
4. **Recipe cascade** (`recipe_apply.go:32`): `ApplyRecipes` — label
   `"Combination discovered"` (no source entity).
5. **Cheat** (`cmd.go:141`): label `"Cheat"` — so devs exercise the same UI
   when testing. (Trivial; drop if unwanted.)

> **Reconnect-restore correctness:** restore rebuilds the `SkillComponent`
> state directly and does **not** pass through these four call sites, so a
> reload does not re-announce the whole spellbook. A regression test pins this
> (see below). This is *cleaner* than the old client diff, which needed an
> explicit silent-baseline seed (`HUD.ts:491`) to avoid re-announcing on join.

## Test strategy (TDD — backend first)

Backend (`go test ./...`), one failing test per behaviour before the code:

- **Per-site emit:** a fake `model.Client` capturing `SendUnlock(id, source)`.
  Granting via each site (milestone level-up, mob `rewardPlayer`, NPC
  `onApproach`, recipe cascade) emits exactly one unlock with the expected id
  and source string. Assert the *label format* per source.
- **Idempotent Discover ⇒ single announce:** a re-`Discover` of an
  already-known skill (idempotent per `component.go:408`) emits **no** unlock.
- **Reconnect-restore is silent:** restoring a stashed character with a
  populated spellbook emits **zero** unlock messages.
- **Wire round-trip:** `EntityMessage` marshals/unmarshals `kind` correctly and
  old-shaped messages decode with `kind == Chat` (default) — a small codec test.

Frontend (`verify` skill / Playwright smoke):
- NPC teach shows a top banner reading `New aura: <name>` + `Taught by: <NpcName>`.
- No JS errors; the panel `unlockPulse` still fires; a normal chat/announce
  (kind Chat / id 0) still routes to the bubble / announce banner unchanged.

## Open questions / placeholders

- **Mob / NPC display-name fields** for the labels — confirm the exact accessor
  at implementation (`m.definition.Name` vs a display name; NPC `Name`). If a
  mob has no friendly display name, fall back to the type name.
- **Cheat announce** (`"Cheat"`) — keep or drop; dev-only, no stakes.
- **Milestone wording** — `"Level N reward"` vs `"Milestone (Level N)"`
  [PLACEHOLDER], PO feel call at the read pass.
- **Recipe wording** — `"Combination discovered"` [PLACEHOLDER].

## Verification checklist (per project "Sanity checks")

- `go build ./...` clean; `go test ./...` (all affected packages) green,
  including the new emit/silent/round-trip pins.
- `api/schema/make.sh` regen committed; `make -C backend build` (schema change
  needs the rebuild, not just `-content`).
- Frontend `npx tsc --noEmit` clean; webpack prod build green.
- In-game (`verify` / `playtest`): teach → banner names the NPC; kill a
  drop-carrier → banner names the mob; hit a milestone level → `Level N reward`;
  reconnect → **no** unlock spam.
- Boot log: item/skill/npc counts unchanged, 0 panics.

## Cross-links

- Parent: `docs/plan-playtest1-feedback.md` §Pass B item 1 (1c/1d were the last
  open playtest-1 items — this closes them).
- Wire precedent: `sys/chat/system.go:15` (`SystemEntityID = 0`) and its client
  route `Backend.ts:222`.
