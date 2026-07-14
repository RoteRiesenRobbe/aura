# Teaching / Lore NPCs — Execution Step 5 (roadmap item 9, unlock sources)

> **Status: IN PROGRESS.** Plan approved 2026-07-14. **Chunks 1–4 DONE +
> COMMITTED**; **chunk 5 (frontend bubble hoist + latest-wins +
> `Chat.showMessage` guard) DONE + VERIFIED IN-GAME by PO + COMMITTED
> 2026-07-15.** Execution is per-chunk in its own session, order
> 1 → 2 → 3 → 4 → 5 → 6; **NEXT = chunk 6 (zone-editor `npc` placement mode) in
> a new session** — the final chunk of Step 5.
>
> **Scope locked with PO:** teaching/lore NPC with one-way speech only (NOT
> branching dialogue — that stays deferred, backlog item 2). Clue anchors (#3)
> deferred but the entity must double as a lore-only **sign post**. Multi-unlock
> → one combined (newline-joined) bubble. **Zone-editor `npc` placement mode is
> in scope** (consciously overrides roadmap §9's YAGNI "don't build the editor
> mode now" — PO's call). Reuse an existing sprite (placeholder), no
> `EntityType`/wire-enum change. All numbers [PLACEHOLDER].

## Context

Roadmap execution-order **Step 5 = item 9 (remaining unlock sources)**. Step 4
(skill-vocabulary fill) is complete + committed. Two unlock sources remain from
the spellbook's five (milestones + monster-kills already ship): **world-clue
anchors (#3)** and **NPC teaching (#4)**. This step builds a **peaceful,
hand-placed, static teaching/lore NPC** — the first non-hostile interactive
entity in the game.

**Product requirements:**
1. Approach → grant a skill (unlock into spellbook).
2. Speech bubble above the NPC's head on approach ("Congratulations!").
3. Level-gate: too low for the next teaching → speak "come back when stronger",
   grant nothing.
4. Multiple ordered teachings per NPC; on approach grant EVERY qualifying
   not-yet-known teaching back-to-back (a level-skipper who never met the NPC
   gets several unlocks + lines at once).
5. Speech reaches all nearby players via the existing chat feature.
6. Bubble is latest-wins (concurrent triggers → only newest shows). Unlocks are
   per-player and instant, never delayed.
7. Same entity serves lore/hints with no teaching (guard, sign post).

## Key finding — almost everything already exists

The existing "chat" is **not a log; it is an entity-anchored floating speech
bubble**. `EntityMessage {entity_id:ulong, message:string}`
(`api/schema/server.fbs:327`) → frontend `Chat.showMessage` → `Character.say`
renders a bubble above that entity, fanned out per-viewport. So **reqs 2 + 5
collapse into one existing mechanism with no new wire message** — the NPC just
originates an `EntityMessage(npcId, line)`. Combined with the idempotent,
zero-wire skill-grant primitive, this feature is a **small, high-reuse
extension**, exactly as roadmap §9 predicted ("three of four hard parts exist").

## Reused seams (confirmed)

| Need | Seam |
|---|---|
| Grant skill (no wire) | `p.SkillComponent().Discover(id)` (`skills/component.go:359`, idempotent, level-1) + `p.ApplyRecipeCascade()` (`model/player.go:149`). Client renders unlock glow from spellbook diff — no wire event. |
| "Already knows X?" | `p.SkillComponent().HasDiscovered(id)` (`component.go:366`) |
| Player level | `p.Progression().Level` (`PlayerProgression{Level, Experience}`) |
| Resolve skill by name | `g.Skills().GetByName(name)` (`skills/registry.go`) — resolve at zone load like `Spawn.Mob` |
| Static placement | `game.AddEntity` type-switch (`core/game.go:239`); `model/prop/prop.go` (40-line body+stream template); zone arrays in `world/zone.go` (`DisallowUnknownFields` → lockstep schema edits) |
| Proximity sensor | mob aggro pattern: `phy.Circle`, `IsSensor=true`, `Mask=LayerPlayerCollision`, via `Bodies()`, read by iterating `sensor.Collisions()` asserting `model.PlayerEntity` (`model/mob/mob.go:836`; `healer.go` acquires a specific entity — closest template) |
| Speech to nearby | `codec.EntityMessageFlatbufMarshal(builder, id, msg)` (`codec/chat.go:8`); per-viewport fan-out pattern in `sys/chat/system.go:38` |
| Bubble render | `Character.say` (`Character.ts:570`) — floating `Text`, `messagesGroup` above head, `timeToLife` expiry |

## Design

### Entity model — dedicated `model/npc.Npc` (not a Mob, not a Player)
A lightweight `model.BaseEntity` (circle visual body + `EntityType`) **plus a
second sensor circle** exposed via `Bodies()`. Rejected alternatives: a passive
**Mob** drags in HP/threat/aggro/aura + its frontend class also lacks `say`;
reusing **Character** means a connection-less `PlayerEntity` hack. A dedicated
non-combatant NPC is **unattackable by construction** (no HP, not a `Combatant`,
not a valid aura target) → no faction flag needed.

- **Rendering:** rides the **`Resource` wire table** like props do (satisfies
  `model.PropEntity` → the existing `EntitiesMarshalFlatbuf` `PropEntity` case
  marshals it as `Resource`), reusing an existing `EntityType` sprite
  (placeholder). **No `server.fbs` change, no new render class.**
- **Placement needs a dedicated `addNpcEntity` case** in `game.AddEntity`
  (precedent: `addCorpse`): the plain-`Entity` path registers only `Bodies()[0]`,
  which would silently drop the sensor. `addNpcEntity` registers the visual body
  (static/immovable) **+ the sensor into `phy.Space`** + `NetSystem` + the new
  `NpcSystem`. **Impl checkpoint:** confirm a *static* sensor reports
  `Collisions()` against dynamic players (all working sensors today sit on
  *dynamic* bodies — the stationary Campfire mob is the dynamic-but-never-moving
  fallback if static sensors don't pair).

### Config schema — `npcs:[]` in `api/zones/*.json`
```jsonc
"npcs": [
  { "type": "Sage", "x": 0, "y": 0, "radius": 3,
    "tooLowLine": "Come back when you are stronger.",
    "teachings": [
      { "skill": "HealAura", "requiredLevel": 1, "line": "You learned Heal!" },
      { "skill": "DodoAura", "requiredLevel": 5, "line": "You learned Dodo!" }
    ] },
  { "type": "Guard", "x": 20, "y": 0, "radius": 3,
    "lines": ["No entry to the city right now.", "I heard of trolls up north."] }
]
```
All numbers placeholder. Go structs in `world/zone.go` (mirror `Prop`/`Spawn`):
- `Teaching{ Skill string; RequiredLevel uint32; Line string; Def *skills.SkillDefinition (json:"-") }`
- `Npc{ Type string; X,Y,Radius float32; TooLowLine string; Teachings []Teaching; Lines []string }`
- `Npcs []Npc` on `Zone`.
- `validate()`: `Radius > 0`; teaching NPC (`len(Teachings)>0`) requires
  non-empty `TooLowLine`; must have teachings OR lore lines (not empty of both).
- `resolve()`: resolve each `Teaching.Skill` via the skills registry (fail loud
  at boot on unknown skill, like `Spawn.Mob`) — **thread a skills registry into
  `LoadZoneFS`**. `type` maps to a placeholder `EntityType` sprite.
- **TS mirror** `frontend/src/features/zone-editor/logic/ZoneModel.ts`:
  `ZoneTeaching`/`ZoneNpc` interfaces, `npcs?` on `ZoneData`/`ZoneModel`,
  serialized in `getZoneAsJSON()` (omit-when-empty, campfire/darkArea precedent)
  — required so `DisallowUnknownFields` round-trips and the editor exports it.

### Server behavior — new `NpcSystem` (`sys/npc.go`, priority ~20)
Per-NPC `seen map[uint64]bool` for **rising-edge** detection (the main
subtlety — prevents per-tick spam while a player stands in range):
```
current := players in sensor.Collisions()
for p in current where !seen[p.ID]: onApproach(npc, p)   // edge only
seen = current                                            // leave+return re-triggers
```
`onApproach(npc, p)`:
```
lines := []
for t in npc.Teachings (in order):
    if p.HasDiscovered(t.Def.ID): continue
    if p.Level >= t.RequiredLevel:
        p.Discover(t.Def.ID); p.ApplyRecipeCascade(); lines += t.Line   // grant all qualifying, instant
    else:
        lines += npc.TooLowLine; break                                  // ordered gate, stop
if len(lines)==0 and len(npc.Lines)>0: lines = npc.Lines                // lore / sign-post fallback
if len(lines)>0: speak(npc, sensor-players, join(lines, "\n"))          // ONE combined bubble
```
- Grants mutate **that player's** spellbook, instant (req 6).
- **Speech fan-out:** build one `EntityMessage(npc.ID, joinedLines)` and
  `SendMessage` to the players in `sensor.Collisions()` (sensor ⊆ their
  viewport, so the client already tracks the NPC — sidesteps the
  `Chat.showMessage` throw-on-untracked bug). Latest-wins bubble (req 6) is
  automatic: one shared `entity_id`, newest `say` shown.
- Lore fallback also lets a sage speak idle lore once everything is learned, and
  makes a pure-lore guard/sign-post work with the same code.

### Frontend — enable the bubble on the NPC + latest-wins
- **Hoist `say` / `messages[]` / `messagesGroup` / expiry** from `Character` to
  the shared base (`_GameObject`/`GameObject`) so a non-Character render object
  (the NPC's Resource-mapped class) can speak. DRY; small.
- **Single-slot latest-wins mode** (req 6): clear prior bubble children before
  pushing the new `Text` (a ~5-line branch in the hoisted `say`), used by NPC
  lines. (Player chat keeps today's stacking.)
- **Harden `Chat.showMessage`** (`chat/logic/Chat.ts:58`) with an
  undefined-object guard — latent crash fix regardless of this feature.

## Chunk breakdown (TDD; each independently in-game-verifiable)

1. **Schema + loader (backend) + TS mirror. ✅ DONE + VERIFIED 2026-07-14.**
   `Npc`/`Teaching` in `world/zone.go`, `validate`/`resolve` (skills registry
   threaded through `LoadZoneFS`→`resolve` as a new 5th param; `loadZone` +
   `berryhunterd.go` + `loaders_test.go` updated), `ZoneModel.ts`
   interfaces + constructor/`fromJSON`/`getZoneAsJSON` (omit-when-empty like
   `campfires`/`darkAreas`; `ZoneEditor.ts` empty-model call updated). Validate
   rules: `Radius > 0`; teaching NPC (`len(Teachings)>0`) needs non-empty
   `TooLowLine`; NPC must have teachings OR `Lines`; each teaching needs
   non-empty `Skill`+`Line`. 7 new Go tests (added `fakeSkillRegistry`, updated
   all 27 existing `LoadZoneFS` call sites): teaching parse+order+Def-resolved,
   lore-only NPC, unknown skill fails, missing `tooLowLine`, radius ≤ 0,
   empty-of-both, unknown-key rejection. **Sanity:** `go build ./...` +
   full `go test ./...` (0 fail) + `tsc --noEmit` all green; booted
   proving-grounds with a temporary Sage (teaches `HealAura`+`Dash`) + lore
   Guard against `-content ../api` → zone loaded, no panic, temp edit reverted.
   **Not committed yet.**
2. **Entity + placement (backend). ✅ DONE + VERIFIED 2026-07-14.**
   `model/npc/npc.go` (`Npc` = static visual body + `Sensor()` dynamic circle;
   placeholder sprite `EntityTypeFlower` — a **Resource**-backed type, since a
   Mob sprite class expects health/aura wire fields the Resource payload lacks;
   placeholder visual radius 1.0 distinct from the authored sensor radius),
   `model.NpcEntity` interface (`Entity` + `Sensor() phy.DynamicCollider`),
   `addNpcEntity` case in `game.go` (visual body → `AddStaticBody`, sensor →
   `Space().AddShape` **as dynamic**), minimal `sys/npc.go` `NpcSystem`
   (priority 20, holds NPCs + temporary rising-edge log — replaced in chunk 3),
   registered in `NewGameWith`; boot loop in `berryhunterd.go` (after campfires).
   Rides the `Resource`/prop marshal path (`PropEntity` case, existing sprite).
   **Checkpoint RESOLVED:** a static shape's `Collisions()` is always empty
   (`space.go:bruteIntersectShapes` only writes collisions onto dynamic shapes),
   so the sensor MUST be dynamic while the visual body stays static — proven by
   3 `model/npc/npc_test.go` tests (dynamic sensor reports overlapping player;
   ignores out-of-range; a static sensor reports nothing — documents the trap).
   **Sanity:** `go build ./...` + full `go test ./...` (24 pkg ok, 0 fail) green;
   booted proving-grounds via `-content ../api`, `NpcSystem` registered, no
   panic. **VERIFIED IN-GAME 2026-07-14:** flower placeholder renders + is solid;
   the rising-edge sensor log fires on approach and RE-fires only on
   leave+re-enter (no per-tick spam). **Temp Sage staged for chunk 3** in SOURCE
   `api/zones/proving-grounds.json` at (4,3), radius 3, teaches `HealAura`@L1 +
   `Dash`@L5 (uncommitted; boot `-content ../api`). **Not committed.**
3. **`NpcSystem` grant + edge-trigger (backend). ✅ DONE + VERIFIED IN-GAME +
   COMMITTED 2026-07-14.** The chunk-2 temp `NpcSystem.Update` log is replaced by
   `onApproach(n, p)` (free func in `sys/npc.go`), driven by the unchanged chunk-2
   `seen` rising-edge: ordered `n.Teachings()`, `HasDiscovered` skip,
   `Level >= RequiredLevel` grant-all-qualifying (`sc.Discover(id)` +
   `p.ApplyRecipeCascade()` once per grant), else `TooLowLine` + **stop**, else
   lore `Lines` fallback when nothing is taught. It **returns `[]string` but does
   not speak** — a temp `slog "npc onApproach"` records the lines; **chunk 4
   replaces that log with the `EntityMessage` fan-out.** **Payload threaded onto
   the entity:** new `model.Teaching{Def *skills.SkillDefinition; RequiredLevel;
   Line}` + `model.NpcEntity` gains `Teachings()/TooLowLine()/Lines()`;
   `npc.New(pos, radius, teachings []model.Teaching, tooLowLine, lines)` stores +
   exposes; boot loop maps `zone.Npc.Teachings`→`[]model.Teaching`. **PLAN
   DEVIATION (documented):** `Teaching` lives in **`model`**, not `model/npc` —
   an "npc-local" type would make `model.NpcEntity` cycle, and the plan also puts
   grant logic + tests in `NpcSystem`/`sys/npc_test.go`. The real constraints are
   honored: `model/npc` does NOT import `world`, and `Teaching` carries the
   *resolved* `*skills.SkillDefinition` (no name re-resolution). `onApproach`
   reads via narrow local `teacher`/`learner` interfaces (the `skillEntity`
   precedent) so the core is fake-testable. **8 `sys/npc_test.go` tests** green
   (multi-teaching ordered grant, level-gate stop, first-too-low, back-to-back
   multi-unlock, idempotent re-approach, lore fallback ×2, and a rising-edge
   `Update` test against a real `phy.Space`: enter→grant+one `onApproach`;
   stand→no re-fire; leave→nothing; re-enter→re-trigger). **Sanity:**
   `go build ./...` + full `go test ./...` (0 fail) green; booted `-content
   ../api`, no panic, `20 *sys.NpcSystem` registered, `placed npcs count=1`.
   **VERIFIED IN-GAME 2026-07-14 by PO:** approach the Sage (4,3) → HealAura in
   spellbook + unlock glow; Dash gated (L5) → nothing; no re-grant while standing;
   walk out+back → no re-grant of known skills.
4. **Speech origination (backend, reuses `EntityMessage`). ✅ DONE +
   BACKEND-VERIFIED + COMMITTED 2026-07-14.** The temp chunk-3 `slog
   "npc onApproach"` in `NpcSystem.Update` is replaced by a `speak(n, lines)`
   call. New `speak()` (`sys/npc.go`) builds ONE
   `codec.EntityMessageFlatbufMarshal(builder, n.Basic().ID(),
   strings.Join(lines,"\n"))` and fans it out via `p.Client().SendMessage(bytes)`
   to every player in `n.Sensor().Collisions()` — reuses the existing chat wire
   (no `server.fbs` change). Latest-wins is automatic (one shared `entity_id`,
   newest `say`); the sensor ⊆ each player's viewport so the client already
   tracks the NPC. Imports swapped `log/slog`→`flatbuffers`+`codec`.
   **Sanity:** `go build ./...` clean; full `go test ./...` 0 fail; new
   `sys/npc_test.go` test `TestNpcSystem_SpeechReachesAllSensorPlayers` green
   (bystander already in range + newcomer crossing in a later tick → the
   newcomer's bubble ALSO reaches the non-moving bystander [fan-out to all,
   req 5]; decodes the wire back to NPC-anchored id + newline-joined text; added
   `addPlayerCollider`/`sentOf`/`decodeEntityMessage` helpers). Booted
   `-content ../api`: no panic, `20 *sys.NpcSystem` registered,
   `placed npcs count=1`. **NOT YET VISIBLE IN-GAME (by design):** the NPC
   renders as a `Resource`, which has no `say()`, so `Chat.showMessage`'s
   `isFunction(gameObject.say)` guard silently drops the message (no crash) —
   **the visible bubble requires chunk 5's frontend hoist.** Backend origination
   is done, unit-verified, wire-confirmed; PO in-game verification is deferred
   to after chunk 5 (backend-only boundary: chunks 1–4).
5. **Frontend bubble hoist + latest-wins + `Chat.showMessage` guard. ✅ DONE +
   VERIFIED IN-GAME by PO + COMMITTED 2026-07-15.** Hoisted the speech-bubble
   machinery (`messages[]`/`messagesGroup`/`say`/expiry + follow-group
   position-mirror) from `Character` to the shared base `GameObject`
   (`_GameObject.ts`), made **lazy** (built on first `say()` — a silent object
   pays nothing) and self-cleaning (released in `hide()`, which also backs a new
   `GameObject.remove()`; `Character` lost its duplicates + its `update()`/
   `prerenderSubToken`/`remove()`). `say(message, latestWins=false)` gained a
   **single-slot latest-wins branch** (`removeChildren()` before pushing the new
   `Text`); player chat keeps stacking. `Chat.showMessage` hardened with an
   `isDefined` guard (latent throw-on-untracked fix) and
   `latestWins = !(gameObject instanceof Character)` so NPCs (Flower/Resource)
   are single-slot, players stack. **Sanity:** `tsc --noEmit` clean;
   `npm run build` 0 errors. **Also (content, no code change):** Sage idle-lore
   fallback `"lines":["Nice to see you again, traveller."]` — the chunk-3
   `onApproach` already speaks `Lines` when neither grant nor too-low gate
   applies (`sys/npc.go:139`); boot `-content ../api` → `placed npcs count=1`,
   no panic. **VERIFIED IN-GAME by PO:** bubble over the Sage's head; too-low
   line; latest-wins; lore/greeting fallback.
6. **Zone-editor `npc` placement mode.** New `EditorMode` `'npc'`, marker draw +
   hit-test + place/select, a nested teachings/lore config panel, export via
   `getZoneAsJSON`. Precedent: the campfire/dark modes in
   `zone-editor/logic/_ZoneEditorPanel.ts` + `ZoneEditor.ts`. Verify: place an
   NPC in-game, export, reload, it teaches.

Backend-only: 1–4. Frontend/wire: 5–6.

## Test strategy

**Go unit (`sys/npc_test.go`, fake `PlayerEntity` + fake sensor):**
- Multi-teaching ordered grant (level-10, all-unknown, [L1,L5] → both granted,
  both lines, cascade called).
- Level-gate stop (level-3, [L1,L5] → L1 granted, L5 → too-low line + stop, L5
  not granted).
- Idempotent re-approach (all known → no `Discover`, no speech).
- Edge-trigger anti-spam (N ticks in range → one `onApproach`; leave+re-enter →
  triggers again).
- Back-to-back multi-unlock (level-20 first meeting → several grants, one
  combined speech).
- Lore NPC + lore fallback (no teachings, or all-learned sage → speaks `Lines`,
  never grants).
- `world/zone.go` parse/validate/resolve tests (chunk 1).

**In-game checklist:** NPC renders + holds position; high-level fresh char →
multiple unlocks + glow + one combined bubble; low-level → too-low bubble,
nothing learned; stand in radius → no spam; walk out + back → re-speaks; second
player sees the same (latest) bubble; two near-simultaneous triggers → only
newest shows; lore guard/sign-post speaks; boot fails loudly on unknown
skill/type; editor place → export → reload → teaches.

## Sanity checks (per CLAUDE.md, each chunk)
- `go build ./...` from `backend/`; `go test` for `world`, `sys`, `model/npc`.
- `tsc`/webpack for frontend chunks.
- In-game verification per the checklist; report output before "done".

## Open items folded into decisions
- Faction: **not needed** — NPC is unattackable by construction.
- Teaching+lore on one NPC: **allowed** — lore is the fallback when nothing is
  taught (covers sage idle-lore, guard, and the sign-post reuse).
- Editor mode: **in scope** (chunk 6), per PO.
