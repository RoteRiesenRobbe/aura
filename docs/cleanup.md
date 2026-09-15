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
| **Superseded by** | `zone.atmospheres` — authored polygons naming a profile that carries `gloom` / `sight` (`docs/plan-region-atmosphere.md` **D0**, PO-ruled 2026-09-12) |
| **Ruling** | *"Agree, keep for now"* — PO, 2026-09-12. `darkAreas` stays live, parsed, validated and drawn; the plan adds a **second** source of dark geometry rather than migrating content. |
| **Trigger** | ⭐ **Chunk A3** of `plan-region-atmosphere.md` — the content retrofit that re-authors `world.json`'s **35** circles as 2–3 atmosphere shapes. The primitive leaves when nothing authors it, and not before. |
| **Status** | Open. A3 is itself optional and PO-gated (§8 Q5), so this row can sit for a while — legitimately. |

**Why it is marked rather than kept indefinitely.** A circle is now strictly a
**degenerate atmosphere shape**: less expressive, differently edged
(`DarknessVisuals.EDGE_FADE` instead of the profile's `blend`), and unable to
carry fog art, drift or `sight`. Two sources of dark geometry is exactly the
duplication D0's reversal exists to avoid — it is only tolerable while the
newer one has no content in it.

**What actually has to go, when it goes** (counted so the eventual chunk is not
a discovery exercise):

- `world.json`'s 35 authored circles, and `tunnel.json`'s array.
- `world.DarkArea` + its validation leg (`zone.go`, ~`:228`, `:446`, `:699`).
- The `darkAreas` branch of `DarknessOverlay.loadZone`, its `darkCircles`
  hit-test array, and `inAnyCircle`'s use of it in `isHidden`.
- `DarknessVisuals.EDGE_FADE` — the **only** consumer once the circles are gone,
  since atmosphere edges are `blend` (D5, reversed 2026-09-12).
- The key in all four zone-format writers (`zone.go` · `aura-convert.js` ·
  `ZoneModel` · `aura-world-format.js`) and the Tiled palette.

⛔ **Do not remove the primitive before A3 lands.** A zone file that still names
`darkAreas` would be refused at boot by `DisallowUnknownFields` — the failure is
loud, but it is a failure of *shipped content*, which is the one kind this
project does not accept casually.

---

## Closed

*(Nothing yet.)*
