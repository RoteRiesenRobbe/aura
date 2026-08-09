# plan-ui-font.md: picking a readable UI font

> **Status: NOT SCHEDULED. Nothing is built and nothing is decided.** This is a
> reference doc, written 2026-08-09 after a screenshot pass the PO asked for
> (*"I mostly want an easily readable font for everything, the current one can
> become hard to read"*). The pass ran, the candidates were shot in the live
> game, and the PO's verdict was: *"I don't want to go forward with any of them
> now but they give me a good starting spot. I will investigate more."* The
> working tree was reverted to `HEAD` the same session; **no product code
> changed**.
>
> Its job is to make sure the next attempt starts from what this one learned
> instead of rediscovering it. It is the home of the parked **round-9 item 2**
> font half (`plan-playtest-feedback.md` §Intake round 9); the *cleaner UI* and
> *dialogue UI* halves of that item stay where they are, with the step-8b UI
> pass.
>
> **Schema impact: DB NONE · FlatBuffers NONE · conf NONE.** A font is a
> frontend asset and two style declarations. Nothing about it reaches the wire
> or the database, at any scope this doc considers.

**The comparison page (keep this link):**
<https://claude.ai/code/artifact/88f58fa5-9a7a-4bdb-bc3a-e5b0c76e3484>

Six faces (the current one plus five candidates) across three scenes, shot in
the running game at 1600×900 with the same character in the same spot in every
frame. Each candidate card toggles between a size-matched view and a
same-`rem`-as-today view. See §5 for why that toggle has to exist.

---

## 1. How fonts are implemented today

Two faces ship, and they do different jobs.

| Face | Where it is declared | What it covers |
| --- | --- | --- |
| `stone-age` | `frontend/src/features/user-interface/assets/fonts/stoneage/` | Everything readable: the whole DOM HUD **and** all in-world text |
| `Capture Smallz` | `.../assets/fonts/capture-smallz/` | The **AURA logo** on the start screen only (`startScreen.less:320`). Branding, not reading |

`stone-age` reaches the game through exactly **two** declarations, and that is
the whole reason a swap is cheap:

- `frontend/src/features/user-interface/assets/userInterface.less:11`:
  `body { font-family: "stone-age", serif; font-size: 1.5rem; font-variant: small-caps; }`.
  This is every DOM HUD surface: spellbook, action bars, tooltips, journal,
  conversation panel, account screens.
- `frontend/src/client-data/TextDisplay.ts:4`, where `defaultStyle()` returns
  `{ fontFamily: 'stone-age', fontSize: 30, fontVariant: 'small-caps', letterSpacing: 2 }`.
  This is every PixiJS `Text` in the world: player and mob **nameplates**
  (`Character.ts:147/165`, `Mobs.ts:176`), **speech bubbles** and announcements
  (`_GameObject.ts:291`), and the zone editor's labels (`ZoneEditor.ts:663`).

Three things deliberately do **not** use it, and a swap should leave all three
alone:

- **Floating damage numbers** are already `Arial` bold (`_GameObject.ts:480`).
- **The interact badge** is already `monospace` (`InteractBadge.ts:91`).
- **The dev console, dev panel, ground-texture panel and `code`** all declare
  their own `"Menlo", "Noto Mono", "Consolas", monospace` stacks.

**Loading and bundling.** `@font-face` lives in a hand-written
`stylesheet.css` per face, `@import`ed at the top of `userInterface.less`.
webpack's `type: 'asset'` rule (`webpack.common.js:95`) picks the `woff/woff2`
up with no config change, so **adding a face is: drop the files in a new
directory, write its `stylesheet.css`, add one `@import`.** There is no font
manifest, no preload tag, no loader step.

**Sizing.** There is **no explicit root font-size on desktop**; the root is
whatever the browser defaults to (16px), and `body` sits at `1.5rem` on top of
it. On phones there *is* one, and it is the single scaling knob for the whole
mobile HUD: `html.mobile { font-size: clamp(15px, 4.1vmin, 28px) }`
(`HUD.mobile.less:66`, from the mobile-layout pass). §5 is about why that knob
becomes load-bearing the moment the face changes.

---

## 2. What was actually done in the pass

One frontend build, six runs. A temporary `?font=<family>` query hook in
`TextDisplay.ts` swapped the Pixi face; the DOM half was overridden from the
Playwright script with an injected stylesheet, so no build change was needed for
it. Fonts were inlined into the page as `data:` URIs rather than linked from
`fonts.gstatic.com`, so the browser needed no network and a shot could never
silently be a fallback face. Every run asserted the face was resident and that
the Pixi `fontFamily` had really changed before shooting.

Scenes, chosen because they are the three different reading problems the game
has: **world + HUD** at the densest spawn cluster in `world.json` (23 spawns
inside ±7, so nameplates overlap, which is when the current face gets hardest to
read) · **skill tooltip** (small labels, numbers, an arrow, on a dark panel) ·
**quest journal** (the longest continuous prose, including italic body copy).

The script, the downloaded faces and the 33 screenshots lived in the session
scratchpad and are gone. Rebuilding them is ~20 minutes; the artifact above is
the durable output.

---

## 3. The candidates, and why these five

All five are SIL Open Font Licence and self-hostable as `woff2`, i.e. drop-in
under the arrangement in §1. Regular plus bold is 20–40 KB per family.

| Face | Why it was in the set |
| --- | --- |
| **Inter** | The neutral UI workhorse. Highest raw legibility, least personality. The control: if nothing beats it on readability, readability is not what is being chosen for |
| **Barlow Semi Condensed** | Condensed, so more text fits per HUD pixel and long quest titles stop wrapping. Reads as a game HUD rather than a document |
| **Rubik** | Slightly rounded geometric, tall x-height. Readable without going fully neutral |
| **Alegreya Sans** | Humanist, a little old-world warmth. The closest thing in the set to a fantasy tone that is still a readability win |
| **Fira Sans** | Workhorse with some character in the letterforms; strongest of the five at the smallest sizes |

⚑ **The set is deliberately all sans.** The ask was readability, and the
current face's problem is legibility rather than tone. A serif or a display
face with fantasy character is a legitimate direction, and this set does not
represent it. If the next investigation is about *tone*, it needs a different
shortlist.

---

## 4. ⛑ The findings that will apply to any face, not just these five

**F1. The current face is inlined; every candidate will not be.**
`stoneage-webfont.woff2` is **4352 bytes**, under webpack's 8 KB `asset`
threshold, so it is emitted as a `data:` URI *inside the stylesheet*. Only
Capture Smallz's files appear in `frontend/dist/` as separate assets. Every
candidate measured **10–19 KB** per weight, which lands it over the threshold
and turns it into a separate network request.

That matters more than it sounds, because of F2.

**F2. PixiJS bakes glyphs when a `Text` object is CREATED, and nothing in the
client waits for a font.** There is no `document.fonts.ready`, no `FontFace`
handling, no preload anywhere in `frontend/src`. A face that resolves after the
world spawns leaves every nameplate and speech bubble in fallback serif
**permanently**, with no error, because Pixi never re-renders them.
`font-display: swap` on the `@font-face` covers the DOM and does nothing for the
canvas. Today this race is invisible only because F1 makes the face arrive with
the stylesheet. **Combining F1 and F2: a naive swap can ship a game whose HUD is
in the new font and whose nameplates are in Times New Roman, intermittently, on
cold caches only.** Three ways out, cheapest first: subset the face under 8 KB
(which is exactly what the `subset-` prefix on the Capture Smallz files is) ·
raise webpack's inline threshold via `parser.dataUrlCondition.maxSize` · or
await `document.fonts.ready` before the first world render.

**F3. A swap is not a swap, it is a swap plus a size retune.** `stone-age` has
a small x-height for its em, so any real two-case font at the shipped `1.5rem`
renders much larger. In the first pass the spellbook panel **overflowed and the
Cooldowns section fell off the bottom of the screen** on all five candidates.
The size-matched shots put the root at `12.6px` (about **0.79×**), which fits
everything again. ⚑ **That number is eyeballed, [PLACEHOLDER], and it was
derived per-face by nobody**, and different faces want different ratios.

**F4. Rescaling means moving the ROOT font-size, not `body`'s.** Every HUD
panel sizes itself in `rem`, and `rem` resolves against `<html>`. An
`!important` on `body { font-size }` is inherited by nothing and changes
nothing, silently. This cost one wasted screenshot pass. ⚑ Consequence for a
real implementation: the desktop retune wants a root `font-size` that does not
exist yet (§1), and it **collides with `html.mobile`'s clamp**, which already
owns the root on phones. Those two have to be retuned as one decision, or the
phone silently keeps the old optical size.

**F5. `font-variant: small-caps` is free today and stops being free.**
`stone-age`'s upper- and lowercase glyphs are identical, so small-caps costs
nothing and `letterSpacing: 2` compensates for it. On a two-case font the
browser **synthesises** small-caps, which fights exactly the readability being
bought. ⚑ Dropping it is **not one line**: it is `body` plus six explicit
re-applications (`userInterface.less:13` and `:346`, `accountScreens.less:55`,
`:241`, `:345`, `startScreen.less:103`), and one deliberate opt-out already
exists at `userInterface.less:323` (`font-variant: none`). ⚑ It also means
**every candidate screenshot differs from the baseline by more than the
typeface**, which is a property of the comparison, not a flaw in it.

**F6. A stale `frontend/dist` is invisible to unit tests.** Already recorded
from the FrostShield chunk and it applies verbatim here: the backend serves
`frontend/dist`, so any font change needs `npm run build` before it exists at
the real surface. A `vitest` run cannot see this class of miss at all.

---

## 5. What a real swap would have to do

Not a chunk breakdown, because this is unscheduled. A checklist, so the size of
the job is honest.

1. Pick the face, and decide **scope**: HUD only, or HUD plus in-world Pixi text
   (§6, open question 1).
2. Add the face under `assets/fonts/<name>/` with its own `stylesheet.css` and
   an `@import`. **Subset it, or handle F1/F2 another way.**
3. `userInterface.less:11`: the `font-family`, and the `font-variant` decision
   from F5 across all seven sites.
4. `TextDisplay.ts` `defaultStyle()`: `fontFamily`, and the `fontVariant` /
   `letterSpacing: 2` pair, which exist for `stone-age` specifically.
5. The size retune (F3/F4): a desktop root `font-size`, reconciled with
   `html.mobile`'s `clamp(15px, 4.1vmin, 28px)`.
6. `npm run build`, then verify at the real surface (F6). The scenes in §2 are
   the ones worth re-shooting; `round4-tooltip.mjs` and `mobile-layout.mjs`
   already own text-bearing layout assertions and are the natural regression
   gate, since a size retune is exactly the kind of change that reflows a panel
   past an assertion.
7. Check the **start screen and account screens** too. They were not in the
   three scenes and they carry three of the six small-caps sites.

---

## 6. Open questions

1. **In-world text as well, or HUD only?** Nameplates and speech bubbles are
   arguably art direction in a way a quest journal is not. Every card on the
   comparison page changes both at once, so the *World & HUD* scene is where
   that trade is visible. Not asked of the PO yet.
2. **Is the direction readability or tone?** §3's shortlist answers the first.
   If a fantasy-leaning face is wanted that is still a legibility win over
   today, that is a different shortlist and a different pass.
3. **Does `Capture Smallz` stay on the logo?** Assumed yes throughout, never
   put to the PO.
4. **Per-face size ratio.** F3's 0.79× is one eyeballed number applied to five
   faces. A real pick wants its own, and it interacts with the mobile clamp.
