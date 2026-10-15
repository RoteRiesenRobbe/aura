# Plan: Audio, music that follows the game and sounds that answer the player

> **Status: C0 (design) DONE 2026-10-15, all eleven §5 questions ruled (§5a);
> ⭐ C1 (foundation) is next.** v1 = lanes A-F; G (ambience) and H (stems) are
> out of v1. §6 is the re-cut chunk list. Sketched the same day from one
> survey session after the main title shipped (`1168b00e`).
>
> ⚑ **Takes over `archive/plan-region-audio.md`** (PO 2026-10-15). Its region
> music and region footsteps become lanes D and E here. Its design detail
> (D1-D9, the throttle bug, the boot-inside-a-region ordering) stays in that
> doc and is referenced, not copied; its rulings D4 and D6 still stand unless
> C0 says otherwise.
>
> ⚑ **Schema impact (expected): DB NONE, wire NONE or near it, one content
> field.** Almost all of it is client-side. The likely exception is a per-mob
> sound family (lane C). Confirmed per chunk.

## 1. What this is

The PO's ask (2026-10-14, translated): *"we will need to be able to play
different music at different times. Is there already a plan for the audio
implementation? Triggered audio, maybe even audio layers?"*, with these
examples:

- music per region
- music during an ascension
- the main title in the main menu and character select, until entering the world
- opening the spellbook or journal; closing the spellbook or journal
- levelling up
- the campfire bind sound
- a general click sound
- getting hit by generic damage; hitting an enemy with generic damage
- a dialogue start sound
- a beast death sound; a humanoid death sound
- "and more"

Two different things hide in that list:

1. **Music that changes with the game's state**: menu, region, ascension.
   Several sources compete for one speaker, so this needs a rule for who wins.
2. **One-shot sounds tied to events**: UI, progression, combat, deaths. Each is
   small; together they need one place where sounds are named, loaded and
   balanced, or they spread across the code as they do today.

## 2. What exists (surveyed 2026-10-15)

- **Library:** `@pixi/sound`. `features/audio/logic/Audio.ts` applies master
  volume, master mute and the background-audio toggle.
- **Settings:** `AudioSettings` (`game-settings/logic/GameSettings.ts:44`) has
  `masterMuted`, `masterVolume`, `enableBackgroundAudio`, `musicVolume`. There
  is no sound-effects or UI volume. ⚑ **`masterMuted` defaults to `true`**: a
  new player starts muted and never hears the main title unless they find the
  setting (Q1). Since `4725163d` (2026-10-15) a "Mute all" switch sits beside
  Fullscreen on the account screens (the first screen a player sees), the same
  setting as the settings panel's; `musicVolume` defaults to 0.5.
- **Music:** `Music.ts`, 32 lines. One hardcoded track (`Aura - Main
  Title.mp3` since `1168b00e`), `autoPlay`, `loop`, started at import time,
  before any position or game state exists. No track table, no notion of a
  current track, no crossfade. It plays in the menus and in the world alike.
  `derpy-berryhunter.mp3` is still in the assets folder, unused.
- **Sound effects:** 22 mp3s registered by hand in the Juice files
  (`PlayerJuice.ts`, `MobJuice.ts`, `DayCycleJuice.ts`) via `PIXI.Assets.add`
  and `registerPreload`. Ids are bare strings at each call site.
  `SpatialAudio.ts` adds distance volume and stereo pan (a 700 px magic range,
  marked TODO). `TriggerIntervalMap.ts` throttles by a string key.
  `StatusEffect.ts` carries `SoundData[]` for hit flashes.
- **Silent failure:** `SpatialAudio.play` returns early on
  `!sound.exists(soundId)`, so a misspelled id plays nothing and says nothing
  (`plan-region-audio.md` L3b).
- **Memory (backlog §19):** every mp3 is decoded to PCM at boot, ~160 MB
  measured 2026-07-16. Deferred, unowned. The fix: keep short SFX decoded,
  stream long tracks (`html5`, `preload: false`).
- **Pieces other plans already built that audio can reuse:**
  - regions with place ids, `placeAt()` and the `PlaceAnnouncer` that drives
    the region title banner (`features/regions/logic/RegionNames.ts`): an
    entered-a-place signal with a settle time and a repeat cooldown;
  - the remembered-value `Ramp` (`features/regions/logic/Ramp.ts`) that
    atmosphere built for exactly this reuse (`plan-region-atmosphere.md` A2);
  - the per-hit `SkillEvent` wire (caster, target, hit kind) that skill VFX and
    floating numbers consume (`Backend.ts`, `SkillEventNumbers.ts`);
  - level, home campfire and the ascension flow, all visible to the client
    (`GameStateMessage.ts`, `Backend.ts`).
- **Credits:** `credits.html` has no audio attribution at all
  (`plan-region-audio.md` §3.3, and the 2026-09-26 rights audit).

## 3. The candidate lanes

C0 decides which lanes are v1 and in what order. Each lane says what it needs
from the survey above, not what it will cost to compose.

| Lane | What | Needs | Rough size |
|---|---|---|---|
| **A. Foundation** | one sound table (id, file, channel, volume, decoded or streamed), channels (music, SFX, UI, maybe ambience) with settings, the §19 loading fix, a loud miss for an unknown id | nothing new on the wire | 1 chunk |
| **B. Music controller** | who plays: a priority stack of music requests (menu < region < event), crossfade on every change, never restart the playing track (`plan-region-audio.md` D9); the main title becomes the menu entry and stops (or yields) on entering the world | A | 1 chunk |
| **C. One-shots** | UI (click, spellbook/journal open and close, dialogue start), progression (level up, campfire bind), combat (hit, got hit), deaths by family | A; the death split needs a per-mob family field (content) | 1-2 chunks |
| **D. Region music** | a track per place, from `plan-region-audio.md` C3, driven by the place signal | A, B | 1 chunk |
| **E. Region footsteps** | `plan-region-audio.md` C1 (the shared throttle bug, standalone) and C2 | A (§19) | 1 chunk |
| **F. Event music** | ascension, and whatever else C0 names (boss, cave, death) | B | small, per event |
| **G. Ambience** | a bed under the music (wind, insects, cave drip), per place | A, B's channel | 1 chunk |
| **H. Music layers (stems)** | intensity layers fading in over a base track (combat drums) | B, and music composed in stems | a system; likely not v1 |

## 4. Proposals (NOT ruled; C0 confirms or replaces each)

- **P1, one sound table.** Every sound is declared once (id, file, channel,
  default volume, loading mode). Call sites name an id; nothing else imports
  an mp3. This is what lets §19 be fixed in one place and what gives "and more"
  a home.
- **P2, music is a stack of requests, not a current track.** A source asks for
  a track at a priority and later withdraws. The highest request plays. When
  the ascension ends, its request goes and the region track fades back. This
  covers menu, region and event music with one rule and no special cases.
- **P3, the controller does not rule out layers, and does not build them.** A
  request names a track today; a later chunk can let it name stems. YAGNI
  until stems exist.
- **P4, client-side.** Every trigger in §1 is already visible to the client.
  No server change unless C0 finds a trigger that is not.
- **P5, absence falls back, never silence.** `plan-region-audio.md` D4 (ruled),
  widened from regions to the whole table: an unknown id or a missing file logs
  once in dev and plays the default for its channel (or nothing for a
  one-shot), never throws.

## 5. Open questions for C0

- **Q1. Muted by default?** `masterMuted` defaults to `true` today. Unmuted
  means new players hear the title (after the browser's first-click unlock).
  ⚑ The account screens now carry the mute switch, so a muted default no longer
  hides the setting; this weakens the case for unmuting by default.
- **Q2. Which lanes are v1?** Of A-H, which ship before release and in what
  order. The size table in §3 is the input.
- **Q3. The music priority order.** Menu < region < event is the proposal.
  Where do combat, death and flight sit, if anywhere?
- **Q4. Menu to world.** Does the title stop on entering the world, crossfade
  to the region track, or keep playing until a region declares one?
- **Q5. Channels and settings.** Music and SFX sliders only, or also UI and
  ambience? (`plan-region-audio.md` §3.4 said no third bus for footsteps alone;
  a full one-shot set may change that.)
- **Q6. Death sound families.** A new authored field per mob (`sound` family:
  beast, humanoid, ...), or derived from something that exists (faction,
  `entityType`)? Derived is free but couples two meanings; authored is one
  more line in each of the ~112 mob files.
- **Q7. Hit sounds in crowds.** Every hit, only the own player's, or
  throttled per target? A pack fight is many hits a second.
- **Q8. Spatial or flat.** Which one-shots are positioned (`SpatialAudio`) and
  which are UI-flat? Does the 700 px range get a real number?
- **Q9. Where sounds come from.** Commissioned, licensed packs, Freesound
  (CC-BY needs attribution), or the same source as the main title? This sets
  the credits work.
- **Q10. Ambience and stems.** In v1 or not (lanes G and H)?
- **Q11. The old track.** Delete `derpy-berryhunter.mp3`, or keep it as the
  fallback track P5 needs?

## 5a. C0 rulings (PO, 2026-10-15)

P1-P5 in §4 are confirmed as written, except where a ruling below narrows them.

- **R1 (Q1). Muted stays the default.** PO: *hearing sound on a browser tab
  should be a choice*. The condition is that the toggle is instantly visible,
  which the account-screen "Mute all" switch (`4725163d`) already satisfies.
  No change to `masterMuted`'s default.
- **R2 (Q2, Q10). v1 = lanes A, B, C, D, E, F.** G (ambience) and H (music
  stems) are out of v1. P3 stands: the controller must not rule stems out,
  and must not build them.
- **R3 (Q3). Music priority: menu < region < event.** No combat, boss or death
  music in v1. Ascension is the first (and so far only) event.
- **R4 (Q4). Entering the world crossfades the title to the region track.**
  Where a region declares no track, the fallback track plays (P5,
  `plan-region-audio.md` D4). The title is the fallback until a better one
  exists.
- **R5 (Q5). Two sliders beside master: Music and SFX.** UI sounds, footsteps
  and combat all ride SFX. A UI bus can be split out later if clicks annoy.
- **R6 (Q6). Death sound family is an optional, authored mob field.** Absent
  means the generic death sound, so only mobs that need a specific family
  (beast, humanoid, ...) get the line. Content schema: one optional field;
  the field name and whether the client reads it from the mob catalog it
  already fetches (wire NONE) or needs it on the wire are settled in C3.
- **R7 (Q7). Every hit plays, always throttled per target, attenuated by
  distance AND by involvement.** Hits are positioned (they fade with
  distance); a hit the own player neither dealt nor took plays at a lower
  gain (0.5, [PLACEHOLDER]). The exact mix is tuned by ear in C3.
- **R8 (Q8). World sounds positioned, UI flat.** Positioned: hits, deaths,
  footsteps, another player's campfire bind and level up. Flat: clicks,
  spellbook/journal open and close, dialogue start, the own player's level up
  and campfire bind. The 700 px range moves into the sound table as a
  [PLACEHOLDER].
- **R9 (Q9). Sounds come from the internal composer and artist**, the same
  source as the main title, SFX included; licensed packs may be added later.
  ⚑ Consequence: until their files land, chunks build and test against
  placeholder files (or the fallback, P5), and the PO listen judges the
  mechanism, not the sound. Credits (C6) name the internal team plus any pack
  licence.
- **R10 (Q11). Delete `derpy-berryhunter.mp3`** (and its `Zone.Identifier`
  sidecar). It is unreferenced (grep 2026-10-15) and an open rights question.
  Done in C1.

## 6. Chunks (re-cut by C0, 2026-10-15)

- **C0, design.** ✅ 2026-10-15: §5a.
- **C1, foundation** (lane A). One sound table (id, file, channel, default
  volume, decoded or streamed, spatial or flat per R8); the Music and SFX
  channels with their sliders (R5); the §19 loading fix (short SFX decoded,
  long tracks streamed), measured before and after; a loud dev miss plus
  fallback for an unknown id (P5); every existing Juice file and
  `SpatialAudio` call site moves onto table ids; delete the old track (R10).
- **C2, music controller** (lane B). The request stack (R3), crossfade on
  every change, no restart of the playing track (`plan-region-audio.md` D9),
  start on the browser's audio unlock (L1, L5); the main title becomes the
  menu request and the fallback (R4).
- **C3, one-shots** (lane C). UI (click, spellbook/journal open and close,
  dialogue start), progression (level up, campfire bind), combat hits (R7),
  deaths by family (R6, the one content field). May split into
  UI + progression and combat + deaths if it runs large.
- **C4, region music and footsteps** (lanes D + E), from
  `archive/plan-region-audio.md` C1-C3, on the C2 controller (region requests)
  and the C1 table (footstep sets, the L4 throttle fix).
- **C5, event music** (lane F): ascension requests the event level while it
  runs and withdraws when it ends.
- **C6, credits** (`plan-region-audio.md` C4): attribution for every shipped
  sound (R9), the existing ones included.

## 7. Test strategy

- **vitest** for the pure parts: the sound table's fallback (P5), the music
  stack (push, withdraw, priority, no restart of the same track), throttles.
- **Headless harness** can assert that a sound was REQUESTED (hook the
  controller or `sound.play`) and that files are served, never how it sounds.
- **A PO listen ends every chunk.** Audio is the one surface no harness can
  judge (`plan-region-audio.md` §7.4).
- **§19's memory measurement** before C1 and after each asset-adding chunk.

## 8. Landmines

- **L1, browsers hold audio until the first user gesture.** Music started at
  import time may be silent on the first load; the controller must start (or
  resume) on unlock. Not a bug to chase.
- **L2, silent misses.** The audio layer drops unknown ids without a word
  (§2). P5 exists for this.
- **L3, §19.** Every added file grows a known memory problem until C1 fixes
  the loading strategy.
- **L4, the shared footstep throttle** (`plan-region-audio.md` §3.2): one
  400 ms token shared by every character. Pre-existing; audible once sounds
  differ.
- **L5, Music.ts starts at import time**, before game state exists. Any
  state-driven music has to move that start.
- **L6, a Zone.Identifier sidecar** (Windows download metadata) lands next to
  every mp3 copied in from Windows. It is gitignored; keep it that way.

## 9. Chunk ledgers

*(appended per execution session; none yet)*
