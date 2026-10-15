# Plan - coloured light (the darkness layer becomes a lightmap)

**Status:** BUILT 2026-10-13, L1-L3 in one session on branch `lightmap`
(PO ask: "implement it fully"); pixel-verified, PO in-game look OK 2026-10-13 (§9).
Designed + PO-ruled 2026-10-12. Three chunks: L1 client-only, L2 content + wire + server +
client + editor, L3 content + one loader rule (blue-black partial darkness,
full darkness locked black). D1-D5 PO-approved as
drafted, D6 amended by the PO's per-source ruling, D7 new (§8 has the
rulings). **Schema: DB NONE · conf NONE · wire NONE (L1, L3) / +2 appended
fields (L2) · content +1 optional effect key, +1 optional prop key (L2),
profile colours (L3).** Line refs as of `38bd612c`. Ledger: §9.

**Round 2 (L4-L7): DESIGNED 2026-10-15, PO "I like all of them", nothing built**
(§10). A review after the rebase onto main: L4 removes a colour pop the
doubled campfire glow brings back and colours the sight floor correctly, L5
gives every light an adjustable SHAPE (white heart, fade start, falloff curve,
tunable live from the console), L6 eases lights instead of snapping them, L7
adds flicker to fire. **Schema: DB NONE · conf NONE · wire NONE (L4-L6) / +2
appended fields (L7) · content +1 optional effect key, +1 optional prop key
(L7).** Line refs in §10 as of `a5066f7b`.

The performance knobs on the same layer (filter resolution, `filterArea`,
culling) are **not** in this plan: they were `docs/cleanup.md` entry 5, CLOSED
2026-10-13 as measured and not worth it (§9's ledger notes).

---

## 1. What and why

Today darkness is a black overlay with light **erased** out of it
(`DarknessOverlay.ts`, `blendMode = 'erase'` on every hole). An erase can only
remove black, so every light is the same colourless hole: a campfire, a fire
elemental and a Lantern all look identical, and nothing about a light says
what it is.

A **lightmap** keeps the cost (one render target, one batched sprite per
light) and lets a light carry a colour:

1. The darkness layer renders the **light level** of each pixel, white = fully
   lit, black = nothing seen.
2. Darkness paints toward its colour, exactly as now.
3. Lights **screen** onto it in their own colour.
4. The finished texture is composited over the world with **multiply**.

White lights reproduce today's picture exactly (§3 D2), so L1 is a refactor
with no visible change and L2 adds the colour.

## 2. What stays exactly as it is

- **`isHidden` and every gameplay answer.** Radius-based, untouched. Colour is
  presentation only.
- **The server's map fog** (`sys/state.go:375`) reads the radius only.
- **Haze.** Its own filtered container, its own erase clearings, drawn under
  the darkness: fog still shows only where there is light to see it by.
- **Layer order.** skillFx and haze under darkness, plates and numbers above.
- **Gating.** The layer still renders only in a zone that declares darkness.
- **Cost.** Same render target, same sprites, plus one quad (D3).

## 3. Design decisions (PO-approved 2026-10-12)

**D1. Multiply composite, via the existing filter.** The darkness layer keeps
its `AlphaFilter` (render-target isolation, `DarknessOverlay.ts:169`) and the
filter takes `blendMode: 'multiply'`. Pixi v8 maps multiply natively on WebGL
(`mapWebGLBlendModesToPixi.mjs`) and WebGPU, so no advanced-blend import, no
custom shader. ⚑ Verified at the API level only (`Filter.blendMode` sets the
filter's own state); the pixels are L1's first leg.

**D2. Lights SCREEN, never add and never max.** Screen is
`1 - (1-ambient)(1-light)`. Today's erase leaves `d·(1-a)` of a darkness `d`
under a light of strength `a`, i.e. visibility `1 - d(1-a)`, which is
**exactly** screen of ambient `1-d` and light `a`. So:

- white light = pixel-exact parity with today, in full **and** partial darkness
  (Gloom, Canopy), soft edges included;
- overlapping lights combine as two erases do today (never past white);
- a light over a lit pixel (ambient 1) changes nothing, so a coloured light
  never tints daylight;
- the doubled campfire glow (static hole + wire hole, the comment at
  `DarknessOverlay.ts:252-255`) stays exactly as it is today.

Rejected: **add** (doubles the campfire when it enters range, which brings the
pop back as brightness) and **max** (darker soft edges in partial darkness,
WebGL2 / `EXT_blend_minmax` only, no WebGPU mapping).

**D3. The lightmap is opaque: a white base quad covering the zone.** The
render target clears to transparent, and multiply over transparent is "lit",
so white lights would need no base. A coloured light screened onto
transparent, though, would tint daylight around it. One `Texture.WHITE`
sprite, sized to the zone bounds at `loadZone`, as the layer's first child.
Static, no per-frame work.

**D4. Clearings paint WHITE into the darkness, not erase.** `cutHole`
(`RegionPaint.ts:944`) takes the blend as a parameter: normal-blend white in
the darkness container, erase in haze as today. A white ramp sprite over the
darkness is the same picture as erasing it, and erasing an opaque lightmap
would punch a transparent (= lit) hole that a later coloured light could no
longer colour.

**D5. One colour per entity: the colour of the light that wins the radius.**
`SkillComponent.LightRadius` (`skills/component.go:776`) already takes the
max over the active aura and every passive. The colour comes from the effect
that supplied that max. A tie keeps the first in the existing order (aura,
then passive slots). No blending of two sources' colours.

**D6. One colour per SOURCE, unauthored = white** (amended by Q2, PO
2026-10-12). `color` is optional on a `light_aura` effect; absent means
`#ffffff`, today's look. On the wire `0` means unauthored, because a black
light is meaningless and validation refuses `#000000`. Static lights:

- **campfire glows** read `campfire-aura.json`'s `color`, the same file their
  radius comes from;
- **torch props** author their own optional `lightColor` in `api/props/`
  beside `lightFraction`. ⚑ The drafted D6 had torches follow the campfire's
  colour. "One per source" makes them a source of their own. Absent falls back
  to the campfire's colour, so a prop that only authors `lightFraction` still
  reads as a small fire.

**D7. Coloured darkness is PARTIAL darkness only; darkness 1 is black,
always** (Q3, PO 2026-10-12 "we can try blue black", narrowed 2026-10-13:
*"100% darkness needs to be darkness. no shine through ever."*). Under
multiply a darkness colour **tints** the world instead of covering it, so any
non-black colour on a full-darkness profile is residual vision: the 6 %
playtest-1 Pass C removed (`DarknessOverlay.ts:36-44`, GDD §6.5). Hence:

- **partial darkness** (Gloom, Storm Sky): free to go bluer, since the world
  shows through there by design;
- **full darkness** (darkness 1: Cave Air, Darkness, and every future one):
  colour absent or `#000000`, and the Go loader **refuses** anything else
  (L3). A black lightmap pixel multiplies the world to exactly 0, so an unlit
  pixel at darkness 1 shows nothing, by construction;
- ⚑ `MAX_ALPHA` must stay 1 for the same reason: below 1 the filter mixes
  the world back in under every black pixel. §7's pixel leg pins it.

## 4. Not in scope

- **Shadows / walls blocking light.** That is `plan-line-of-sight.md`, parked
  and not ruled.
- **Normal maps.** Coloured darkness only on partial darkness (D7). (Light
  flicker was out of L1-L3; round 2 takes it as L7, §10.)
- **Editor fields for props and atmosphere profiles.** The content editor
  edits neither (Q4's rule: a field only where the editor already edits the
  thing).
- **Performance knobs.** `cleanup.md` entry 5, closed 2026-10-13.
- **Day/night.** Still OFF. A lightmap is the natural home for a night ambient
  later, but nothing here turns it on.

## 5. The chunks

### L1 - the lightmap, white lights only (client only, no visible change)

`frontend/src/features/darkness/logic/DarknessOverlay.ts`:

- `setup` (167): `AlphaFilter({alpha: MAX_ALPHA, blendMode: 'multiply'})`.
- `loadZone` (191): the white base quad first (D3), then dark circles and the
  atmosphere container as today.
- `texture` (535): a second cached family, a **white** radial gradient, for
  lights. Dark circles keep the black one.
- `punchStaticLight` (291), `setLightRadius` (312): `blendMode = 'screen'` and
  the white texture. `tint` stays white in L1.
- Rewrite the file's header comment and the "double-erase clamps" note
  (252-255): the model is now "light level", not "holes".

`frontend/src/features/regions/logic/RegionPaint.ts`:

- `cutHole` (944) takes the blend (D4); `paintAtmospheres` (869) passes
  normal-white for darkness, erase for haze.

`frontend/src/features/core/logic/Game.ts`: comments only (the haze and
darkness layer notes at ~335-358 talk in erase terms).

Exit: the pixel A/B in §7 matches the pre-L1 baseline.

### L2 - colour (content + wire + server + client)

- **Content:** optional `color` (`"#rrggbb"`) on a `light_aura` effect. Go
  validation: parses, refuses `#000000`, refused on every other effect type.
  `definition.go:1439` gives `light_aura` its own key set (`keysGeometry` +
  `color`).
- **Content editor** (Q4: it edits `light_aura` effects, so yes). The effect
  form renders from Go's key table, so the field mostly appears on its own:
  regenerate `api/skill-vocabulary.json`
  (`UPDATE_SKILL_VOCABULARY=1 go test -count=1 ./pkg/aura/skills/`) and add
  `color: { control: 'text', group: PAYLOAD, hint: '#rrggbb; blank = white' }`
  to `EFFECT_PRESENTATION` (`tools/content-editor/skill-presentation.mjs`).
  ⚑ `smoke.mjs:269` fails on an effect key with no presentation entry, so the
  two land together.
- **Props:** optional `lightColor` (`"#rrggbb"`) in `api/props/`, read by
  `DarknessOverlay`'s `PROP_LIGHT_RADIUS` beside `lightFraction` (D6). Client
  only, since the server's map fog reads radius alone.
- **Server:** `EquippedSkill.LightRadius` (`component.go:79`) and
  `SkillComponent.LightRadius` (776) return the winning effect's colour too
  (D5). `LightColor()` beside `LightRadius()` on both interfaces
  (`model/entity.go:132`, `model/player.go:114`) and both implementations
  (`model/player/player.go:1192`, `model/mob/mob.go:738`).
- **Wire:** `light_color:uint = 0` appended **last** to `Character` and `Mob`
  (`server.fbs`, beside `light_radius` at 440 / 586). Regenerate both
  bindings, then clear the webpack cache
  ([[project-webpack-cache-stale-bindings]]). The codec writes it at
  `codec/gamestate.go:51` and `codec/mob.go:58`. Unauthored is the default 0
  and costs no bytes.
- **Client:** `EntityManager.ts:212` and `Player.ts:134` pass the colour to
  `setLightRadius`, which sets `sprite.tint` (0 → white). Static glows read
  `campfire-aura.json`'s `color`, torch props their own `lightColor` (D6).
- **Content values**, one per source (Q2). All are [PLACEHOLDER] starting
  points for the PO's in-game pass:

  | Source | File | Colour | Reading |
  | --- | --- | --- | --- |
  | Lantern | `skills/lantern.json` | `#ffe6c2` | pale warm (PO: "more warm") |
  | Torch (passive) | `skills/torch.json` | `#ffc98a` | warm |
  | Campfire | `skills/mobs/campfire-aura.json` | `#ffb060` | warm fire (PO: "also") |
  | Camp | `skills/mobs/camp-aura.json` | `#ffb870` | warm fire |
  | Torch (prop) | `props/torch.json` | `#ffc070` | small fire |
  | Fire elemental | `skills/mobs/fire-elemental-aura.json` | `#ff8a3a` | hot orange |
  | Fire totem | `skills/mobs/fire-totem-aura.json` | `#ff9a48` | orange |
  | Wildfire | `skills/wildfire.json` | `#ff7a30` | deep orange |

  Omni rigs stay unauthored.
- **German:** none, there are no strings.

### L3 - blue-black partial darkness, full darkness locked (after L1, independent of L2)

`api/atmospheres/profiles.json`, colours only, [PLACEHOLDER] (D7):

| Profile | Darkness | Today | Try |
| --- | --- | --- | --- |
| Gloom | 0.55 | `#0b0d12` | `#141c30` |
| Canopy | 0.35 | `#0f1a10` | stays green-dark (a forest, not a cave) |
| Storm Sky | 0.28 | `#161b26` | `#1a2238` |
| Cave Air | 1 | `#000000` | `#000000`, locked |
| Darkness | 1 | `#000000` | `#000000`, locked |

**The lock** (D7): `world.LoadAtmosphereDarkness`
(`backend/pkg/aura/world/atmosphere_profiles.go`) refuses a profile with
`darkness` 1 whose `color` is present and not `#000000`. That is a boot
hard-fail, and `aurad -validate` catches it on save. ⚑ It is the one place
that function reads a key other than `darkness`, so its header comment
changes with it (today it says every other key is client-only and never
parsed). Copy the profiles to `backend/pkg/api/` by hand
([[project-no-make-on-windows-box]]), or the embedded copy is what the test
reads.

## 6. Landmines

- **⛔ A mask kills a blend mode** ([[project-pixi-mask-kills-blend]]). No
  light or clearing sprite may be masked, or it silently draws normal. The
  darkness atmospheres' `addFeathered` masks are fine: they blend normal.
- **⛔ Assert pixels, never structure.** "Is the blend mode `screen`?" passes
  on a build that composites wrongly. Every leg in §7 reads pixels.
- **⚑ The base quad must cover every place a light can be.** A light outside
  it screens onto transparent and tints daylight (D3). Zone bounds, not the
  dark shapes' bounds.
- **⚑ Atmosphere darkness colours change meaning slightly.** Today a colour
  is laid over the world, under multiply it tints it. Black is identical. The
  shipped non-black darkness colours (Gloom `#0b0d12`, Canopy `#0f1a10`,
  Storm Sky `#161b26`) differ by at most ~4 % on a black pixel: a look check,
  not a defect.
- **⚑ Wire field appended last**, or every later field's slot shifts. Both
  `Character` and `Mob`, both bindings.
- **⛔ Full darkness never shows the world** (PO 2026-10-13). A non-black
  colour on a darkness-1 profile, or `MAX_ALPHA` below 1, brings residual
  vision back. A screenshot from inside a lit pocket looks fine either way,
  so the loader rule and the pixel leg in §7 are what hold it.
- **⚑ Editor presentation table.** A new effect key with no
  `EFFECT_PRESENTATION` entry fails `tools/content-editor/smoke.mjs`.

## 7. Test strategy

- **Before L1, record a baseline.** Same venue as `a5-darkness-blend.mjs`
  (the underworld, its documented temporary probe shape), Lantern on: sample
  the light's core, its soft edge, a Gloom-or-Canopy partial-dark pixel with a
  light on it, a dark pixel, and a lit pixel outside darkness. Write the
  numbers in the ledger before any code changes.
- **L1 exit:** a new `l1-lightmap.mjs` replays the same samples. Within ±2/255
  per channel of the baseline. Re-run `a5-darkness-blend`, `a4-clearing` and
  `d-map-fog-darkness` (no regression).
- **L2 vitest:** hex → number, 0 → white.
- **L2 Go:** colour selection (D5 tie rule, passive beats aura on radius,
  unauthored → 0), validation (bad hex, `#000000`, `color` on a non-light
  effect), a codec round-trip of `light_color`.
- **L2 pixels:** a warm-authored light's core pixel shows the hue (R > B by a
  margin), and a lit pixel next to that light outside darkness is unchanged
  (the D3 leg).
- **L2 editor:** `node tools/content-editor/smoke.mjs` green, and
  `content-editor-skills-tab.mjs` if it is brought back from stale (CLAUDE.md
  known-inconclusive list). The `color` field shows on a `light_aura` card and
  round-trips a blank (key deleted) and a value.
- **In-game (PO):** a campfire, a torch prop, a Torch, a Lantern and a fire
  elemental in a cave, then the colour values.
- **L3 Go:** the loader refuses `darkness: 1` with `#03050c`, and accepts
  it with `#000000` or no colour. The shipped profiles load.
- **No shine-through, pixels (L1's exit and L3's):** an unlit pixel inside
  darkness 1 reads exactly 0,0,0. This also pins `MAX_ALPHA`.
- **L3 in-game (PO):** the partial-darkness profiles side by side with
  today's.

## 8. PO rulings (2026-10-12)

- **Q1. D1-D6 approved** ("yes").
- **Q2. One colour per source.** The Lantern becomes warmer, and so does the
  campfire. Amends D6 (torch props become their own source) and fills L2's
  colour table.
- **Q3. "We can try blue black."** Narrowed 2026-10-13: *"100% darkness
  needs to be darkness. no shine through ever."* Blue-black goes on partial
  darkness only, and full darkness is locked black by the loader (D7, L3).
- **Q4. An editor field only where the editor already edits the thing.** It
  edits skill effects, so `light_aura`'s `color` gets one (L2). It edits
  neither props nor atmosphere profiles, so `lightColor` and L3 get none.

## 9. Chunk ledger

| Chunk | State | Commit | Verified |
| --- | --- | --- | --- |
| L1 lightmap, white lights | built 2026-10-13 | branch `lightmap` | `l1-lightmap.mjs parity` 5/5, Δ 0.0 on every sample vs the pre-L1 baseline (core, near, edge, lit), dark exactly 0,0,0 |
| L2 colour | built 2026-10-13 | branch `lightmap` | `l1-lightmap.mjs colour` 4/4: campfire core R/B 1.09 → 1.77, daylight beside it Δ 0.0, dark 0,0,0 · Go skills/codec/world tests green · vitest 1626/0 · tsc clean |
| L3 blue-black partial, full locked | built 2026-10-13 | branch `lightmap` | loader lock tests green (`#03050c` at darkness 1 refused, black / bare accepted) |

**Ledger notes (2026-10-13).**

- **Baseline** (`.claude/skills/verify/l1-lightmap-baseline.json`, pre-L1
  build, tunnel zone, the campfire's static glow): core 141/140/129.7 · near
  139.8/133.5/127.7 · edge 94/90/86.9 · dark 0/0/0 · lit 123.6/118.6/112.6.
  L1 reproduced every value exactly, which is D2's maths holding in pixels.
- **Beyond the plan:** `api/props/`'s `lightColor` is validated by the Go prop
  loader too (`DisallowUnknownFields` would otherwise refuse the boot), via the
  now-exported `skills.ParseLightColor`. A colour on a prop with no
  `lightFraction` is refused.
- **Harness legs rewritten (2026-10-13, follow-up):** `a4-clearing.mjs` and
  `a5-darkness-blend.mjs` now ask for a WHITE normal-blended hole (D4) and fail
  on any erase left in the darkness layer. Full A/Bs green with a temporary
  clearing probe (reverted): a5 bank 4 → 117 px (×29.3), rim 4 → 135 px
  (×33.8); a4 seam + structure + pixels ×1.96.
- **`l1-lightmap.mjs parity` is now 2/5 BY DESIGN:** its baseline is the white
  erase build, and L2's warm campfire drops G/B at core/near/edge (R Δ 0.0).
  `colour` 4/4 is the live leg; parity is only meaningful on unauthored lights.
- **Go suite:** green bar the known `TestPropContent_C1bMigrationPreservesLookAndCollision`
  (Tree/Boulder, CLAUDE.md known-inconclusive list).
- **Editor smoke:** 0 findings against a rebuilt binary. ⚑ Its earlier failure
  was a seam bug, not the content: on Windows a spawn of `backend/aurad` runs
  `aurad.exe` (a main-branch build), while the freshness guard checked the
  extensionless file. `aurad-validate.mjs` now uses `aurad.exe` there.
- **Performance (cleanup.md entry 5, closed):** GPU time per frame,
  `darkness-frametime.mjs`, RTX 5070 Ti 1920×1080: the base quad (D3) costs
  ≈ 0.03 ms in daylight; the whole layer 0.04 ms at DPR 1, 0.1-0.2 ms at DPR 2.
  Filter resolution 0.5 measured nothing and was reverted.
- **PO in-game look: OK** (2026-10-13). Nothing owed but the merge.
- **Rebased onto main 2026-10-15** (`83d02042`, `a5066f7b`): one conflict,
  `docs/README.md`'s index line. Main had not touched `Character` or `Mob`,
  so `light_color` stays last on both. `go build` + `go vet` clean, Go
  skills/codec/world/model/cmd-aurad green bar the known C1b prop pin, tsc
  clean, vitest 1679/0.

---

## 10. Round 2 - L4-L7 (designed 2026-10-15)

A review of the built branch found two defects the colour introduced (D8, D9)
and five improvements. The PO took all of them ("I like all of them"), was
least convinced by a white light centre on its own, and asked for it to be
combined with the softer falloff (D10). Order: L4 → L5 → L6 → L7. L4 comes
first because the campfire glow should look right before anyone tunes a
shape or a colour against it, and L5 before L6/L7 so that one in-game look
session tunes colours and shape together.

All numbers below are [PLACEHOLDER].

### 10.1 Design decisions

**D8. A campfire draws ONE light, the static glow** (L4, a defect). Every
campfire draws its static glow (`loadZone`, `DarknessOverlay.ts:226`) and,
once it is in interest range, its wire light on top (the note at
`DarknessOverlay.ts:301-304`). Two white lights screen to white, so L1 could
not show it. Two COLOURED lights do not: `1-(1-c)²` lifts `#ffb060`'s core
from (1, .69, .38) to (1, .90, .61). So a campfire reads deep orange at the
screen edge and turns pale yellow when it streams in, and the PO's 2026-10-13
look most likely saw the pale one (§9's R/B 1.77 sits near the doubled
value). The fix: the client draws no wire light for an entity whose
`dwellRadius > 0` (a respawn anchor, which is exactly what `zone.bindPoints`
places glows for). Identity, never position: a player standing beside the
fire keeps their own light. `isHidden` is unaffected (the static circle
already answers for the pocket). ⚑ Removing the doubling makes campfires
deeper orange and darker, so the campfire colour likely wants re-tuning in
L5's look session (content only).

**D9. Sight takes D5's rule: the bigger of light and sight decides the
colour** (L4, a defect). The own hole is `max(wire, sight)`
(`applyRadius`, `DarknessOverlay.ts:419`) but always carries the wire colour,
so a small Torch in a high-`sight` profile (Canopy, sight 2) tints everything
the player can see, not just what the torch lights. Sight is eyes, not a
light: when sight wins the radius the own light draws white, when the wire
light wins it draws the wire colour. That is D5 ("the colour of the light
that wins the radius") extended to sight. L6's easing smooths the change.

**D10. One adjustable light SHAPE, three numbers** (L5, the PO's
combination of "white centre" and "softer falloff"). Every light, static and
wire, draws with one global shape:

| Knob | Meaning | Default (= today) |
| --- | --- | --- |
| `heart` | fraction of the radius that stays WHITE before the colour comes in | 0 |
| `core` | fraction of the radius fully lit before the fade starts (today's `LIGHT_CORE_FRACTION`) | 0.55 |
| `curve` | the fade's shape, 0 = linear (today), 1 = smoothstep, blended between | 0 |

- **Two sprites per light**: the coloured glow as today, plus a WHITE heart
  sprite on top drawn with the same texture at `heart` × the light's radius,
  also screened. Screen of white over a colour lerps it toward white by the
  heart's alpha, so the heart's soft edge fades white into the colour by
  construction. A tint colours the whole sprite and cannot leave a white
  centre, which is why it is two sprites and not one. `heart` 0 hides the
  heart sprite (`visible = false`), so the default costs nothing.
- **The curve lives in the cached texture** (`texture`,
  `DarknessOverlay.ts:600`): a canvas gradient interpolates linearly between
  stops, so a curved fade is the same gradient with ~16 stops sampled from
  the curve. No per-frame cost; the cache key gains the curve.
- **Tunable live**: `darkness.lightShape({heart, core, curve})` on the
  existing console handle (`BrowserConsole.ts:119`), which rebuilds the
  textures and re-skins every light on screen. The PO tunes by eye in a cave;
  the chosen values go back into `DarknessVisuals` as [PLACEHOLDER].
- **One shape for every light.** A per-source shape (a whiter Lantern than a
  fire) only if one shape turns out not to fit (YAGNI).
- **Gameplay unaffected**: `isHidden` reads radii, never the shape.
- **Item 2's fallback stays open**: if lit ground reads too dark under the
  colours after L4, the PO may prefer paler colours (content) over a heart;
  `heart` 0 then simply stays.

**D11. Wire lights EASE, never snap** (L6). Today `setLightRadius` sets the
size and tint in one frame, so turning a Lantern on or off, or switching
between two lit auras, pops; a lit mob entering view pops in, and one dying
vanishes.

- Radius and colour ease over `LIGHT_RAMP_MS` (300 ms) with the existing
  `Ramp` (`regions/logic/Ramp.ts`, constant duration), colour as an RGB lerp
  on a progress ramp of its own (a colour can change at an unchanged radius).
- A new light fades IN (alpha 0 → 1); a removed one (radius 0, the entity
  leaving view, dying) fades OUT where it last stood and is then destroyed.
- ⛔ `isHidden` reads the TARGET, never the drawn value: the wire radius
  (own light: `max(wire, eased sight)`, as today), and a fading-out light no
  longer counts. Nameplates change at exactly the moment they do today.
- Static lights never change and are not eased. A zone swap (`clear`) stays
  instant, as the sight ramp's own note there already requires.
- Pause-safe for free: `update` runs from `PrerenderEvent`, behind the loop's
  `paused` guard.

**D12. Fire flickers** (L7, needs the wire).

- **Content**: optional `flicker: true` on a `light_aura` effect, optional
  `lightFlicker: true` on a light prop (beside `lightFraction`/`lightColor`;
  refused without `lightFraction`, like `lightColor`). Absent = steady.
  Content editor: the effect key gets an `EFFECT_PRESENTATION` entry (Q4's
  rule), props none.
- **Wire**: `light_flicker:bool = false` appended LAST to `Character` and
  `Mob`; the flag of the effect that won the radius (D5, so `Light()` returns
  it with the colour). A separate bool rather than packing into
  `light_color`'s spare top byte: plainer, and it costs no bytes when off.
- **Sources** (proposed): campfire, camp, Torch (passive), torch prop,
  Wildfire, fire elemental, fire totem. Steady: Lantern, Omni rigs.
- **Draw**: radius ±`FLICKER_SIZE` (3 %) and alpha ±`FLICKER_ALPHA` (6 %)
  from smooth 1-D value noise at ~4 Hz, phase seeded per light (id, or
  position for a static one) so neighbouring fires never pulse together.
  Multiplies on top of D11's eased radius; the heart (D10) flickers with
  its light.
- ⛔ Presentation only: `isHidden` ignores it (D11's "read the target" rule
  already guarantees this), the server's map fog never sees it.

### 10.2 The chunks

**L4 - one colour per light** (client only; D8, D9).

- `EntityManager.ts:212`: skip `setLightRadius` (and remove any light
  already drawn) when the entity's `dwellRadius > 0`. ⚑ First confirm every
  `dwellRadius > 0` entity sits on a `zone.bindPoints` entry, or it would
  lose its only light.
- `DarknessOverlay.ts` `applyRadius` (419): the own light's tint is white
  while sight wins the radius, the wire colour otherwise. The colour must be
  stored on `LightSource` beside `wireRadiusPx` for this.
- Exit: pixels, see 10.3.

**L5 - the light shape** (client only; D10).

- `DarknessVisuals`: `LIGHT_HEART_FRACTION` (0), `LIGHT_CORE_FRACTION`
  (0.55), `LIGHT_CURVE` (0).
- `texture` (600): sampled stops for the curve; key gains the curve.
- `lightSprite` (402), `punchStaticLight` (340), `applyRadius` (419),
  `removeLight` (486): the heart sprite is created, sized, moved and
  destroyed with its light.
- `darkness.lightShape(...)` on the console handle.
- Then the PO's look session: shape and every L2 colour, in a cave.

**L6 - easing** (client only; D11).

- `LightSource` gains a radius ramp, a colour from/to + progress ramp and a
  fade state; `update` (431) advances them; `isHidden` (504) reads the
  target radius instead of `sprite.width`.

**L7 - flicker** (content + wire + server + client + editor; D12).

- Go: `LightParams.Flicker`, `Light()` (`component.go:80`, `:794`) returns
  it, `LightFlicker()` on both entity interfaces and implementations, the
  codec writes it; prop loader accepts and validates `lightFlicker`.
- `server.fbs`: `light_flicker` appended last to `Character` and `Mob`,
  regenerate both bindings, clear the webpack cache
  ([[project-webpack-cache-stale-bindings]]).
- Vocabulary regen + `EFFECT_PRESENTATION` entry (`smoke.mjs` fails
  without it).
- Content: the sources in D12, in `api/` and the `backend/pkg/api/` copy by
  hand ([[project-no-make-on-windows-box]]).
- Client: unmarshal, `setLightRadius` takes the flag, static lights read it
  from `campfire-aura.json` and the prop file.
- German: none, no strings.

### 10.3 Test strategy

- **L4 pixels** (`l1-lightmap.mjs`, a new leg): a campfire's core is the
  same colour with its wire entity in range and out of it (today it pales);
  a light-less player in a sight-2 profile draws a white hole, and with a
  light larger than sight draws its colour. Vitest: the sight-vs-light
  colour rule as a pure function.
- **L5**: at the defaults, `l1-lightmap.mjs parity` and `colour` reproduce
  their current numbers EXACTLY (the defaults are today's picture). Vitest:
  the curve sampler (0 = linear stops, 1 = smoothstep). Pixels at a heart >
  0: the core reads white (R≈G≈B) while the rim keeps the hue. After the
  PO's values land, re-record the baseline, recorded in the ledger.
- **L6**: vitest for the colour lerp and the fade state machine. A pixel or
  harness leg: toggling the Lantern grows the hole over frames instead of in
  one; `isHidden` flips on the same frame as before (a plate test).
- **L7**: Go: `Light()` returns the winning effect's flag (tie rule as D5),
  validation (a prop `lightFlicker` without `lightFraction` refused), a codec
  round-trip. Vitest: the noise stays within ±amplitude and is continuous.
  Pixels: a flickering light's rim varies across frames, a steady one does
  not. Editor `smoke.mjs` green.
- **In-game (PO)**: after L5, the shape + colour look; after L7, the flicker
  amplitude and speed.

### 10.4 Open

- ⚑ **Flicker sources**: D12's list is proposed, not ruled (camp is listed
  because its aura already rises fire particles).
- ⚑ **Every number in §10** waits for the PO's look sessions.

### 10.5 Chunk ledger

| Chunk | State | Commit | Verified |
| --- | --- | --- | --- |
| L4 one colour per light | built 2026-10-15, uncommitted | | `l1-lightmap.mjs single` 3/3 (red-first: 2/3 with D8 reverted, core read the doubled prediction 141/127/79.4) · `colour` 4/4 · vitest 1685/0 (+6) · tsc clean · PO look owed |
| L5 light shape | designed | | |
| L6 easing | designed | | |
| L7 flicker | designed | | |

**L4 notes (2026-10-15).**

- **D8 identity check done**: `dwell_radius` is set in exactly one place,
  `cmd/aurad/aurad.go:262`, on the campfires built from `allCampfires(zones)`
  (the bind points). Nothing else carries one, so no entity loses its only
  light. The client helper is `wireLightRadius` (`LightColor.ts`), called from
  `EntityManager.ts`.
- **The prediction held to the decimal**: with D8 the tunnel campfire's core
  reads 141/96.6/48.8 = the white baseline core × `#ffb060`, exactly one
  screen; without it 141/127/79.4 = the doubled `1-(1-c)²`. The leg derives
  both from the skill file, so a colour retune never reddens it.
- **⚑ Campfires got visibly deeper**: `colour`'s core R/B went 1.77 → 2.85
  (blue in the core 79 → 49). That is the single-light look the PO never saw
  in the 2026-10-13 pass, so it is the first thing L5's look session checks.
- **D9 pixels deviate from §10.3**: no venue has a `sight` above a light's
  radius without a new probe zone (Canopy, sight 2, is not near the tunnel), so
  D9 is pinned by vitest (`ownLightTint`: light wins, sight wins, tie, no light)
  plus the PO's look, not by a pixel leg.
- Schema: DB NONE · wire NONE · conf NONE · content NONE.
