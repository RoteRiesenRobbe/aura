# Cleanup register — things that are SHIPPED, SUPERSEDED, and not yet gone

> **What this file is for.** A standing register of code, content and vocabulary
> that a newer design has replaced but that is still live in the build, each
> with the **named trigger** that retires it. It exists so that *"keep it for
> now"* — which is almost always the right call at the moment it is made —
> cannot quietly become *"keep it forever"*.
>
> ⭐ **The trigger is the point.** An entry without one is a wish, not a plan:
> it will be re-litigated every time somebody reads the code and re-decided the
> same way. An entry with one closes itself.

**What belongs here:** something that still works, still ships, and has a
successor. Two implementations of one idea, kept side by side on purpose.

**What does not:**

- **`docs/backlog.md`** — unscoped ideas and watch items. Nothing there has been
  superseded; it has not been built.
- **`docs/feedback.md`** — raw intake, which exits to a plan, a ruling, a
  backlog watch item, or the bin. Feedback is not a deletion.
- **A plan doc's own landmines** — a trap inside live code is not a thing to be
  removed, it is a thing to be remembered.
- **Dead code with no successor.** That is just a deletion; do it.

**How an entry closes:** delete the thing, delete the row, and say so in the
chunk ledger of whatever chunk did it. A row that has been sitting past its
trigger is a finding in its own right — raise it rather than extending it.

---

## Open

### 1. `zone.darkAreas` — hand-placed circles of constant darkness

| | |
|---|---|
| **Superseded by** | `zone.atmospheres` — authored areas naming a profile that carries `darkness` / `haze` / `sight` (`docs/plan-region-atmosphere.md` **D0**, PO-ruled 2026-09-12; the dial was one `gloom` when this row was written and A1 split it in two) |
| **Ruling** | *"Agree, keep for now"* — PO, 2026-09-12. `darkAreas` stays live, parsed, validated and drawn. |
| **Trigger** | ⭐ **The next time a zone wants a dark CIRCLE.** ⚑ A deliberate event rather than a bare decision, because this file’s own preamble is right that *“an entry without one is a wish”* — and “the PO decides” is a wish. At the moment somebody reaches for a round dark patch they must choose: author one more `darkArea` (and say so, which keeps the primitive), or find the ellipse tool missing on the atmospheres layer (which is the third option below, and the cheapest moment to build it). ⛔ **The migration that used to be chunk A3 rides with whichever way that goes.** |
| **Status** | Open, and **not** blocked on any engineering. Nothing is waiting on it. |

⭐ **A3 MOVED HERE 2026-09-16 (PO ask).** It was the last chunk in
`plan-region-atmosphere.md` and it was never engineering: re-authoring
`world.json`'s **35** circles as 2–3 atmosphere shapes is a content judgement
about *where the dark places actually are*, the same shape as
`plan-world-paths.md` C4. ⚑ It sat in a chunk table implying someone would
implement it, which is exactly the *"keep it for now"* drift this register
exists to stop — a retirement belongs with the thing being retired.

#### ⛔ The prior question: should `darkAreas` be retired AT ALL?

**This row used to assume the answer was yes and only the timing was open.** The
PO reopened that on 2026-09-16, and it is the right question to ask before
spending a content migration on it. ⚑ **Nothing below is a recommendation to
keep it — it is the case a decision has to beat.**

**The case for RETIRING** (the 2026-09-12 argument, unchanged):

- A circle is a **degenerate atmosphere shape**: it cannot carry fog art, drift
  or `sight`, and it edges differently (`DarknessVisuals.EDGE_FADE` rather than
  the profile's `blend`).
- **Two sources of dark geometry is the duplication D0's reversal exists to
  avoid.** Every reader of "is this point dark" has to consult both, and
  `isHidden` already does exactly that today.
- Every zone-format key costs **four writers**. A redundant one taxes every
  future change to the format, forever.

**The case for KEEPING**, which did not get a fair hearing in September:

- ⭐ **A circle is far cheaper to AUTHOR.** `{x, y, radius}` and one drag in
  Tiled, against a polygon that needs at least three vertices placed by hand.
  For *"this hollow is a bit dark"* the polygon is real work for no expressive
  gain, and authoring ergonomics is a PO cost, not an engineering one.
- It is **shipped, working and drawn**, with 35 uses. The migration is churn in
  a world the PO is currently judging in front of the game.
- The edges are genuinely different, not merely differently implemented:
  `EDGE_FADE` is a **radial** falloff to the sprite's rim, while `blend` is a
  band inset from a boundary. A circle re-authored as a polygon will not look
  identical, and the difference is the thing the PO would be judging.

⭐ **There is a THIRD option, and it may be the one that wins: keep the
ERGONOMICS, drop the PRIMITIVE.** Teach the **atmospheres layer the ellipse
tool**, so a dark circle is drawn with one drag and stored as an ordinary
atmosphere shape. Then there is one primitive, one lookup, one edge rule — and
authoring a round dark patch stays a single gesture.

⚑ **Its cost is known and small, which is why it deserves to be on the table**
(⛔ scoped, NOT estimated as a chunk): Tiled's ellipse already round-trips
through both writers — `darkAreas` itself is written as `shape: 'ellipse'`
(`aura-convert.js`), and `aura-world-format.js` maps `MapObject.Ellipse` in both
directions. What is missing is one branch in `closedAreaPoints`, which today
expands a `rect` to four rotated corners and otherwise returns `o.polygon`; an
ellipse would tessellate to N points the same way. The zone file would store a
polygon like every other atmosphere, so **the server, the resolve and the
painter would not change at all**.

⚑ **Whichever way it goes, record it here and close the row** — a register entry
that has been re-litigated twice is a finding about the register, not about the
code.

---

**What actually has to go, IF it goes** (counted so the eventual chunk is not a
discovery exercise):

- `world.json`'s 35 authored circles, and `tunnel.json`'s array.
- `world.DarkArea` + its validation leg (`zone.go`, ~`:228`, `:446`, `:699`).
- The `darkAreas` branch of `DarknessOverlay.loadZone`, its `darkCircles`
  hit-test array, and `inAnyCircle`'s use of it in `isHidden`.
- `DarknessVisuals.EDGE_FADE` — the **only** consumer once the circles are gone,
  since atmosphere edges are `blend` (D5, reversed 2026-09-12).
- The key in all four zone-format writers (`zone.go` · `aura-convert.js` ·
  `ZoneModel` · `aura-world-format.js`) and the Tiled palette.
- ⚑ **[2026-09-16]** `isHidden` now has a THIRD input as well —
  `Clearings.clearsAt` (A4) — so whoever removes the circle branch is editing a
  function with three sources and no test that fails if one is dropped
  silently. ⛔ Mutation-verify it; the A4 ledger records what that class of seam
  costs when it is missed.

⛔ **Do not remove the primitive before the content is migrated.** A zone file
that still names `darkAreas` would be refused at boot by
`DisallowUnknownFields` — the failure is loud, but it is a failure of *shipped
content*, which is the one kind this project does not accept casually.

### 2. Ground noise on the PHONE — the edge knobs and the overlays, never seen there

⚑ Not a superseded implementation like entry 1: a check the PO parked here
(2026-09-27), kept to this file's rule that a row carries a trigger.

| | |
|---|---|
| **What** | `docs/plan-ground-noise.md` W1b + W1c (wobbly edges, the finest fade: ≈ 0.25 u on a phone vs 0.125 u desktop) and W2 (overlays: one more mask texture and one more masked draw per overlaid surface; `FieldsForestBlend` is the first). All of it is desktop-judged only. |
| **Why it matters** | Mobile halves the mask density (`BASE_TEXELS_PER_UNIT` 3, ceiling 8), so edges and patches bake coarser there, and the extra masks are VRAM on the platform already at its render ceiling. The W2 estimate: ≈ 0.9 MB of patch masks per four large overlaid regions on mobile (not a GPU reading). |
| **Trigger** | ⭐ **The next time the game is opened on a phone for any reason** (the skill-VFX and icon-pack phone checks ride the same visit). Look at a road edge, a field plot, a soft biome border and a `FieldsForestBlend` region; watch the frame rate there. |
| **Closes when** | Judged fine (delete this row), or a finding lands in `plan-ground-noise.md` with its own fix. |

### 3. Ground overlays PER OBJECT — an open PO decision

⚑ Not a superseded implementation either: a decision the PO parked here
(2026-09-27). Nothing is built; both halves are options, not plans.

| | |
|---|---|
| **Today** | `docs/plan-ground-noise.md` W2: an overlay's `coverage` / `size` / `roughness` live on the PROFILE (D2's rule: looks are per profile, never per region), and the patch LAYOUT is one world-keyed noise field. Every shape wearing a profile gets the same settings; a different look is a second profile (`FieldsForestBlend` is `Fields` + `Forest` patches). |
| **Option A: per-object settings** | Optional overlay `coverage` / `size` / `roughness` on the region, polygon or path itself (set in Tiled), falling back to the profile's. ⭐ Runtime cost NONE: every surface already bakes its own patch mask. The cost is plumbing: a new zone field in the three serializers (`zone.go` · `aura-convert.js` · `ZoneModel`), Tiled class members with a safe "not authored" default, validation. About one chunk. ⛔ **Breaks D2**, so it needs that ruling amended first. |
| **Option B: per-object layout** | A per-shape noise offset (a seed derived from the shape, nothing to author): each shape gets its own patch layout. One uniform, a few lines. ⚑ Loses the property that two touching shapes with the same overlay continue each other's patches across the seam; map parity survives. Only worth it if repetition across shapes is ever SEEN, which world-keyed noise makes unlikely. |
| **Trigger** | ⭐ **The first time a second profile is made ONLY to change an overlay's numbers** (A), or repetition between shapes is noticed in-game (B). Until then, extra profiles are free and cover it. |
| **Closes when** | The PO rules either option in (it becomes a `plan-ground-noise.md` chunk) or out (delete this row). |

---


## Closed

*(Nothing yet.)*
