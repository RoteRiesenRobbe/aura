# Plan: Region audio — the ground you hear, and the place you hear

> **Status: DESIGNED 2026-08-23 (D4 + D6 PO-ruled; D1–D3, D5, D7–D9 are proposals).
> No chunk built.** The audio consumers of `plan-region-primitive.md`. Split
> out at PO request, same session, from *"can this biome texture also be used
> for things like different footstep sounds for each biome?"* and then widened
> by *"music should also be included"* — which is also what `plan-release-map.md`
> §8 (D6) asks for when it says zones carry their own music.
>
> Both consumers are small at the code level and **not** the same work as
> painting the ground: they share a **hard dependency** on the primitive, a
> **standing blocker** in backlog §19, and — for footsteps — a **live bug**
> that must be fixed first. Hence their own doc.
>
> ⚑ **Schema impact: NONE. No migration.** Client-only: audio assets, one
> lookup, one event payload widening. Not one byte of persisted state, no wire
> change, no Go change (§5).

## 1. What this is

Two consumers of the region primitive, both audio:

- **Footsteps** — walking on swamp sounds like swamp, on ash like ash, instead
  of the single `footsteps-on-road` set the whole world uses today.
- **Music** — the track changes when you cross into a region that declares one,
  instead of the single looping mp3 that starts at boot and never changes.

They are one doc because they share every dependency and every blocker, and
because they read the **same** profile through the **same** primitive. They are
two chunks because their access patterns differ (§3.5) and their costs are not
alike: footsteps are ~18 short files, music is content nobody has written yet.

### 1.1 Footsteps

**The mechanism already exists.** `PlayerJuice.ts:77` holds:

```ts
const steps = ['step', 'step2', 'step3'];
```

played through `spatialAudio` on **both** `PlayerMoved` and `CharacterMoved`
(remote characters too) at a 400 ms trigger interval. The change is one lookup:

```ts
randomFrom(steps)  →  randomFrom(resolve('steps', position))
```

⭐ **The default profile is already authored.** The shipped assets are literally
`750798__simonjeffery13__footsteps-on-road*.mp3` — the world's current sound
*is* the road/dirt profile. Every region added is a departure from a default
that already exists and already sounds right, so there is no "region 0" to
design.

### 1.2 Music

**The mechanism barely exists.** `Music.ts` is **32 lines**: one hardcoded mp3,
`autoPlay`, `loop`, `singleInstance`, and a volume-setting subscriber. There is
no track table, no transition, no concept of "current track".

The extension is a track table plus a crossfade on *region entered* — and
`@pixi/sound` already carries what that needs (`filters`, per-instance volume,
the `sound.find` handle `SpatialAudio` uses).

⚑ **The real cost is content, not code**, and `plan-release-map.md` §8.2 says
so outright: **the repo owns exactly one music track**. Six regions with their
own music is six commissioned or licensed tracks — the largest single content
ask in any plan currently open, and it is not an engineering estimate.

⭐ **Music is the one place §19 pushes toward, not against.** Long tracks are
exactly what §19 names for `@pixi/sound`'s HTML5-streamed mode
(`preload: false` / `html5`), so a region track table wants streaming anyway —
which is the same change §19 asks for. Footsteps add decoded files; music, done
right, adds none.

### 1.3 Why none of it is free, in three parts

Priced honestly, because §1 reads cheaper than the work is:

1. **It cannot start** until `plan-region-primitive.md` C1 ships the `regions`
   array and `resolve()`. (§4)
2. **It should not ship** before backlog **§19**'s audio-loading fix. Per-biome
   footsteps multiply the file count on a memory problem that is already
   measured and already bad. (§4, L1)
3. **It must not ship** on top of the current throttle, which is shared across
   every character in the world. Today that is inaudible; with per-region sounds
   it becomes audible wrongness. (§3.2, L2 — this is the find of the session)

## 2. Decision ledger

**D4 and D6 are PO-ruled** (2026-08-23). D1–D3, D5 and D7–D9 are proposals
adopted without a prompt — the PO may veto any.

- **D1 — the region profile owns both sound sets**, not a parallel table.
  `plan-region-primitive.md` D2/D10 make a profile a client presentation bag;
  `steps` and `music` are simply properties beside `color`. One name, one
  place, no second lookup keyed by profile name somewhere else.
- **D2 — the lookup is client-side, via the primitive's `resolve()`.** Not
  cached on the entity, not pushed over the wire, not tracked as state. The
  client already knows every position; the server stays out of it entirely,
  which is what keeps `plan-region-primitive.md` §1 ("the server never reads
  `regions`") true.
- **D3 — resolution is the primitive's, not a second rule.** The primitive's
  D0 already answers it: last region in array order that contains the point AND
  declares the property. ⭐ For audio the **fall-through half is the useful
  half** — a small bog blob inside a swamp zone declares `steps` and not
  `music`, so you get bog underfoot without the zone's track restarting.
- **D4 — ALWAYS fall back to the default audio. ⭐ PO-RULED 2026-08-23**
  (the primitive's D11, stated for audio). Every miss lands on today's shipped
  sound — `step/step2/step3`, `derpy-berryhunter.mp3` — and that covers **four**
  cases, not just the first:
  1. the position is outside every region;
  2. the containing region's profile declares no `steps` / `music`;
  3. the region names a profile that does not exist (a typo);
  4. the profile names a **sound id that does not exist**.
  ⚑ Case 4 needs writing on purpose, because the audio layer's own miss
  behaviour is *silence*: `SpatialAudio.play` opens with
  `if (!sound.exists(soundId)) return;`, so a mis-spelled step id today is
  dropped without a sound, a warning, or a throw. A region that mutes the game
  because of a typo is exactly what this ruling forbids. No error, no silence,
  no console spam — the unpainted world is most of the world and it already
  sounds the way it sounds now.
  ⚑ The single exception is D8's **explicitly authored `null`**: absence falls
  back, `null` means "nothing here", and it is the only way to ask for quiet.
- **D5 — per-character throttling** (§3.2). The existing shared `'step'` key
  becomes per-character, which needs the movement events to carry the character
  id. Small, and it is a **bug fix that stands on its own** — it should
  arguably land whether or not the rest of this plan does.
- **D6 — PLAYERS ONLY; mobs stay silent. ⭐ PO-RULED 2026-08-23.** Every player
  character gets biome-aware steps — **the local player and remote players
  alike** — and mobs get no footstep sound at all, as today. Put as a choice
  prompt against two narrower scopes (local player only; local player as the
  only thing with footsteps at all), and the widest of the three was taken:
  other players are part of the world you hear, and the swamp should sound like
  swamp when someone else is walking through it. ⚑ **This is what keeps L2, the
  shared-throttle bug, in scope** — the narrow readings would have made C1
  unnecessary by leaving one emitter. It is now load-bearing, not incidental.
  Mobs remain a separate design *and* performance conversation: a wolf pack
  whose every member emits spatial audio every 400 ms is not this plan.

- **D7 — music follows the LOCAL player only.** What you hear is where *you*
  are; nobody else's position may change your track. ⚑ This is a rule about
  **which point to pass**, not about a different lookup — see §3.1. What music
  adds is one remembered value so it can detect a *transition* (§3.5), because
  a crossfade is about the boundary, not the location.
- **D8 — a region without a `music` key does not stop the music.** It is
  transparent (D3's fall-through), so the track keeps playing until some region
  declares a different one. ⚑ "Silence here" therefore needs an explicit value
  — the `music: null` case — or an author cannot ever ask for quiet.
- **D9 — crossfade, and never restart the same track.** Re-entering a region
  that declares the track already playing is a no-op, not a restart. Without
  this, walking back and forth across a boundary is a stutter machine.

## 3. Design

### 3.1 The lookup

**No new lookup is written here.** `plan-region-primitive.md` C1 owns
`resolve(property, point)` and its resolution rule; this plan consumes it:

```ts
randomFrom(resolve('steps', position))   // footsteps — the event's own position
resolve('music', playerPosition)         // music — the local player's (D7)
```

⭐ **A remote player's footstep is the same check as your own**, with a
different argument. Both `PlayerMoved` and `CharacterMoved` already hand over
the position (`Character.onMove()` passes `this.getPosition()` either way), so
the "remote" case costs nothing extra: no lookup by id, no cached region, no
second code path. The only thing that differs between the two subscriptions
after this plan is the throttle key (§3.2).

**Cost: negligible for footsteps, and worth stating precisely** so nobody
re-derives it as scary. The test runs once per 400 ms **per audible character**
— not per frame, not per tick, and not for characters outside `SpatialAudio`'s
700 px range (which returns before playing anything). A ray-cast
point-in-polygon over a handful of regions at ~2.5 Hz per character is not
measurable next to a 30 FPS render loop. Music's tracker is once per frame for
**one** entity (§3.5), which is the cheaper of the two.

⚑ If a profiler ever disagrees, the fix is a bounding-box pre-check inside
`resolve()`, not caching the region on the entity — a cached region is state,
and state has to be invalidated.

### 3.2 The throttle bug this uncovers (D5)

`PlayerJuice.ts:51-66` — both subscriptions call:

```ts
triggerMap.trigger('step', 400)
```

`TriggerIntervalMap` keys **only by that string**, and the map instance is
shared. So **every character in the world contends for one 400 ms footstep
token**: whoever moves first wins it, and everyone else is silent until it
frees. `CharacterMoved` carries only a `Vector` (`Events.ts:190`) — no id — so
per-character throttling is not even *expressible* today.

Today this is inaudible: all footsteps are the same three files, so "someone's
step played" is indistinguishable from "my step played". **Per-biome sounds
make it audible** — stand on the road beside someone in the swamp and your own
steps go missing, replaced at random by theirs. The bug is pre-existing and
this plan is what makes it matter.

Fix: widen `PlayerMoved` / `CharacterMoved` to carry the character id alongside
the position (`Character.onMove()`, `Events.ts`, the two subscriptions), and
key the throttle `step:<id>`. ⚑ The map is never cleaned up, so keys accumulate
for departed characters — bounded by "characters seen this session" and tiny,
but if that offends, evicting on character removal is the place.

### 3.3 Assets

Three variants per biome, matching the existing set's shape. Sourcing follows
the convention already in `features/player/assets/`: Freesound files kept under
their original `<id>__<author>__<name>.mp3` filename, which preserves
provenance in the filename itself.

⚑ **Open, and pre-existing:** `credits.html` contains **no audio attribution at
all** — not for the 16 sounds already shipped. Most Freesound material is CC-BY,
which attribution satisfies. Adding ~18 more files is a good moment to fix the
gap rather than widen it; §6 C3 carries it, and the licenses of the existing
files should be checked at the same time.

### 3.5 The music tracker (D7)

`resolve()` answers *"what applies at this point"* — and that is the same
question footsteps ask (§3.1). Music additionally needs *"what changed since
last frame"*, which is one remembered value on top of the identical call, not a
second mechanism:

```ts
// once per frame, local player only
const next = resolve('music', playerPosition);
if (next !== current) { crossfade(current, next); current = next; }   // D9
```

Two shipped patterns have exactly this shape and should be read before writing
it: `DarknessOverlay.inAnyCircle` (per-frame membership against zone data) and
`MapFog.revealAt` (entered-a-new-cell tracking). `plan-release-map.md` §8.2
independently reached the same conclusion — *"point-in-rect per frame against
the interpolated player position… purely client-side suffices for music and
visuals; the server never needs to know."*

⚑ **The tracker is the reusable half.** Atmosphere/fog (release-map's, later)
wants the identical entered/left signal, so build it as a region-changed event
rather than as something private to `Music.ts`.

⚑ **Boot is a transition too.** The player spawns *inside* some region, so the
first resolve must start the right track rather than the default one — and
`Music.ts` currently starts its track at import time, before any position
exists. That ordering is the one non-obvious piece of this chunk.

### 3.4 What this plan does not do

- **No ambient beds.** A swamp *ambience* layer under the music (insects,
  wind) is a third consumer with the same shape; it would hang off the same
  profile and should wait until music has proven the tracker.
- **No mob footsteps** (D6).
- **No per-category volume slider.** `GameSettings` already has master and
  music volume; footsteps do not justify inventing a third SFX bus.
- **No surface concept beyond the region** — no "wooden bridge" prop that
  overrides the ground under it. That wants per-prop audio, not per-region.
- **No combat/exploration music states.** One track per region, full stop.
  Dynamic music is a system; this is a table.

## 4. Dependencies and ordering

| # | Depends on | Why | State |
|---|---|---|---|
| 1 | `plan-region-primitive.md` **C1** | No `regions` array, no profile and no `resolve()` to hang `steps` / `music` on until it ships | **designed, not started** |
| 2 | backlog **§19** (audio loading) | **Footsteps:** 3 variants × 6 regions = ~18 files onto 29 already eagerly decoded to ~160 MB of PCM, a >60 % increase in file count. **Music:** wants HTML5 streaming, which IS §19's fix | **deferred 2026-07-16**, unowned |
| 3 | D5's throttle fix | Otherwise footsteps ship audibly broken in company (§3.2) | **inside this plan** (C1) |
| 4 | **music tracks that do not exist** | The repo owns exactly one (`plan-release-map.md` §8.2). Not an engineering dependency — a commissioning one | **unowned, unstarted** |

⚑ Dependency 2 decides *when* footsteps are buildable and is owned by nobody.
§19's own fix note — "keep only short combat SFX decoded, load the rest on
demand… switch long music/ambience tracks to HTML5-streamed mode" — cuts both
ways here: **footsteps are short SFX and would stay decoded**, so they are only
affordable once the *long* tracks stop being; **music is the long track**, so
building it correctly means doing §19's job for the file type §19 cares most
about.

⚑ Dependency 4 is the one that decides *when* music ships, and it is not a
code problem. C3 can be built against placeholder or repeated tracks to prove
the tracker, but the feature is not real until the music exists.

**Recommended order:** this plan's C1 (throttle, standalone value) → §19 →
primitive C1 → C2 (footsteps) → C3 (music, when tracks exist).

## 5. Schema impact

**NONE — no migration.** By enumeration: audio assets, `steps` and `music`
keys on a client-side profile object, two event payloads widened by one field,
one lookup helper and one tracker. No Go, no wire, no DB, no zone-format change
(the `regions` array this reads is `plan-region-primitive.md`'s, and is already
NONE there).

## 6. Chunk breakdown

- **C1 — the throttle fix, standalone.** D5: id on the movement events,
  per-character key, a vitest case proving two characters no longer suppress
  each other. **No dependency on anything else in this plan** — it is a bug fix
  and can land at any time, including before regions exist.
- **C2 — region footsteps.** The `steps` key on the profile, the swap at both
  subscriptions via the primitive's `resolve()`, and the audio for the regions
  the color pass actually painted. Gated on primitive C1 and (by
  recommendation, not by mechanism) on §19.
- **C3 — region music.** The `music` key, the track table, the local-player
  tracker (§3.5) emitting a region-changed event, crossfade + no-restart (D9),
  the explicit-silence case (D8), and the boot-inside-a-region ordering. ⚑ The
  tracker is written to be reusable by atmosphere, which is release-map's next
  consumer. Buildable against placeholder tracks; not *shippable* until real
  ones exist (§4 dep 4).
- **C4 — credits.** Audio attribution in `credits.html` for the new files *and*
  the 16 existing ones, plus a license check on what is already shipped (§3.3).
  Small, and the only chunk here with any legal edge to it.

## 7. Test strategy

1. **vitest** — resolution is the primitive's to test (`plan-region-primitive.md`
   §8), so here only the *audio* reading of it: a region declaring `steps` but
   not `music` leaves the track alone (D3 fall-through, D8), and **all four D4
   miss cases land on the shipped default** — no region, no key, unknown
   profile, unknown sound id. ⚑ The fourth is the one worth asserting hardest:
   it is the only one whose current behaviour is silence.
2. **vitest** — the throttle: two distinct character ids both get to play a
   step within one 400 ms window; the same id twice does not.
3. **vitest** — the tracker: entering a region with a new track crossfades;
   re-entering one declaring the *same* track is a no-op (D9); `music: null`
   stops it (D8); spawning inside a region starts that region's track, not the
   default (§3.5).
4. **In-game** (`verify` / a PO pass) — walk across a region edge and hear both
   changes; stand beside a moving character and confirm your own steps are
   unaffected; walk the boundary back and forth and confirm the music does not
   stutter. ⚑ Audio is the one surface the headless harness cannot assert, so
   the real gate for C2 and C3 is a **PO listen**, not a green test.
5. **Memory** — re-run §19's measurement after C2 and after C3, recording each
   delta in the ledger. If a number moved badly, that is §19's evidence, not a
   surprise.
6. `npm run typecheck`, `npm test`, the standing verify tail.

## 8. Landmines

- **L1 — §19 is the real gate**, not the code. See §4.
- **L2 — the shared throttle** (§3.2). The single most likely way this ships
  feeling broken. Note it is *pre-existing*: if footsteps sound wrong after
  C2, the first suspect is this, not the biome lookup.
- **L3 — `CharacterMoved` fires for remote characters**, so every biome lookup
  runs for them too, and a remote character in a biome you are not standing in
  is *supposed* to sound like their ground, not yours. ⚑ **That is D6, ruled
  deliberately** — not an accident of the event wiring — so it is correct
  behaviour that will still read as a bug to anyone who assumes footsteps are
  local. Say so in the ledger before someone "fixes" it.
- **L3b — the audio layer fails SILENT, not loud.** `SpatialAudio.play` returns
  early on `!sound.exists(soundId)` and `@pixi/sound` does not complain about an
  alias nobody registered. Every miss in this plan therefore has to be caught by
  `resolve()` (D4/D11), because nothing downstream will ever tell you.
- **L4 — audio only plays after a user gesture** in every modern browser. The
  game already lives with this for its existing sounds; region footsteps inherit
  it and it is not a regression to chase.
- **L5 — no audio attribution exists today** (§3.3). Widening the asset set
  without touching credits makes an existing gap bigger.

## 9. Open questions

- **How many biomes actually get custom footsteps?** Probably not all of them:
  swamp / stone / sand / ash are distinct underfoot; "dead forest" versus
  "enchanted forest" may not be, and sharing one set between biomes is free
  (the profile just points at the same array). A PO call, and it directly sets
  the §19 cost.
- **Should the local player's own steps be louder or unthrottled** relative to
  everyone else's? Currently identical (`volume: 0.9`, same 400 ms). A feel
  question that C1 makes cheap to answer, since it separates the keys anyway.
- **Does flight silence footsteps?** A flying character presumably should not
  crunch through gravel. Untested; `Character.onMove()` does not know about
  flight state today.

## 10. Chunk ledgers

*(appended per execution session — none yet)*
