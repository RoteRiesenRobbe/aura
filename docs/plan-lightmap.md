# Plan - coloured light (the darkness layer becomes a lightmap)

**Status:** DESIGNED + PO-RULED 2026-10-12 (planning session, docs only,
nothing built). Three chunks: L1 client-only, L2 content + wire + server +
client + editor, L3 content + one loader rule (blue-black partial darkness,
full darkness locked black). D1-D5 PO-approved as
drafted, D6 amended by the PO's per-source ruling, D7 new (§8 has the
rulings). **Schema: DB NONE · conf NONE · wire NONE (L1, L3) / +2 appended
fields (L2) · content +1 optional effect key, +1 optional prop key (L2),
profile colours (L3).** Line refs as of `38bd612c`. Ledger: §9.

The performance knobs on the same layer (filter resolution, `filterArea`,
culling) are **not** in this plan: they are `docs/cleanup.md` entry 5, and
they are independent of it in either order.

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
- **Normal maps**, light flicker. Coloured darkness only on partial
  darkness (D7).
- **Editor fields for props and atmosphere profiles.** The content editor
  edits neither (Q4's rule: a field only where the editor already edits the
  thing).
- **Performance knobs.** `cleanup.md` entry 5.
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
| L1 lightmap, white lights | not started | | |
| L2 colour | not started | | |
| L3 blue-black partial, full locked | not started | | |
