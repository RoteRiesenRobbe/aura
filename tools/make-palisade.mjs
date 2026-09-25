/**
 * Emits `palisade.svg` — the bandit-camp wall segment for Zone 2
 * (docs/art/assets.csv prop-palisade-segment).
 *
 * ⭐ WHY THIS ONE PROP HAS A SCRIPT WHEN EVERY OTHER PLACEHOLDER IS HAND-DRAWN.
 * It is the only prop that has to TILE. Several segments sit shoulder to
 * shoulder, so the stake spacing is not a look choice, it is arithmetic — and
 * arithmetic silently rots the moment someone nudges a circle by two pixels to
 * make one segment look nicer on its own. The rule lives here, the checks
 * below enforce it, and the SVG is output. Same trade the ground-tile
 * generators take (`tools/make-fence-tile.mjs` and friends): a seam-critical
 * asset is generated, everything else is drawn.
 *
 * ⛔ THE TILING RULE, and both halves of it are load-bearing:
 *
 *   1. THE SPACING STRADDLES THE SEAM. The first stake sits HALF a spacing
 *      from the left edge and the last half a spacing from the right, so two
 *      abutting segments put their end stakes exactly one spacing apart, like
 *      every other pair. Centring a stake ON the edge doubles it at every
 *      join; giving it a full margin leaves a gap at every join. There is
 *      exactly one right answer and it is half.
 *   2. THE SHADOW IS OFFSET IN Y ONLY. Every other prop in this folder offsets
 *      its baked shadow down-AND-right, because the light is from the
 *      top-left. An x offset CANNOT tile — it overhangs one edge and undercuts
 *      the other, so every join shows as a notch in the shadow. Here the seam
 *      wins and the light direction loses.
 *
 * ⚑ The art itself is one idea: a SHARPENED LOG TOP. From straight above you
 * never see a palisade's height, only the ends of the stakes, so "sharpened"
 * has to be legible in a circle 29 px across — four axe facets meeting at a
 * point set up-left of centre, so the light has a side to catch. That is a
 * deliberate contrast with `fencePost.svg`, which is the same object at the
 * same angle with a SQUARED top and end-grain rings: a squared top is a fence
 * built to keep stock in, a point is a wall built to keep people out. Those
 * two marks are the whole difference between the props.
 *
 * Usage: node tools/make-palisade.mjs
 */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)),
    '../frontend/src/features/game-objects/assets/resources/palisade.svg');

// Body 2.4 x 0.8 units at 100 px/unit. ⚑ The viewBox aspect MUST stay 3:1 to
// match api/props/palisade.json, or SimpleProp stretches the art (a95a2f0d).
const W = 240, H = 80;
const N = 6;                       // stakes per segment
const SP = W / N;                  // 40 px — see the tiling rule above
const CY = H / 2;
const R = 18;                      // bark radius
const RIN = 14.5;                  // the cut face inside the bark

// Facet rim bearings, rolled so no facet edge is axis-aligned — an axis-
// aligned split reads as a cross carved into the stake.
const ROLL = 20;
const BEAR = [35, 125, 215, 305];
// Fill per facet, by its outward bearing. 215 + ROLL = 235 deg is up-left,
// which is the lit one; the light is from the top-left as everywhere here.
const FILL = ['#8d7241', '#a98a50', '#dabe87', '#c1a36b'];

/* ---- checks -------------------------------------------------------------- */

function assertTileable() {
    if (!Number.isInteger(SP)) {
        throw new Error(`spacing ${SP} is not an integer: ${W} px does not divide `
            + `into ${N} stakes, so the seam lands on a fraction of a pixel.`);
    }
    if (2 * R > SP) {
        throw new Error(`a stake is ${2 * R} px across at a ${SP} px spacing, so `
            + 'neighbours overlap — which looks fine inside a segment and wrong '
            + 'across a seam, because only one of the two overlaps is drawn.');
    }
    const first = SP / 2, last = W - SP / 2;
    if (first !== W - last) {
        throw new Error('the end margins differ, so the run changes rhythm at '
            + 'every join. Both must be half a spacing.');
    }
    console.log(`  tiling: ${N} stakes, spacing ${SP}, margins ${first}/${W - last}`
        + ' — a join keeps the rhythm');
}

/* ---- the drawing --------------------------------------------------------- */

const r2 = (n) => Math.round(n * 10) / 10;

const rim = (cx, deg) => {
    const a = (deg + ROLL) * Math.PI / 180;
    return `${r2(cx + RIN * Math.cos(a))},${r2(CY + RIN * Math.sin(a))}`;
};

function stake(i) {
    const cx = SP / 2 + i * SP;
    const ax = r2(cx - 2.2), ay = r2(CY - 2.2);     // the point, off-centre
    const facets = BEAR.map((b, f) =>
        `    <path d="M${ax},${ay} L${rim(cx, b)} L${rim(cx, BEAR[(f + 1) % 4])} Z" `
        + `fill="${FILL[f]}"/>`).join('\n');
    return [
        '  <g>',
        `    <circle cx="${cx}" cy="${CY}" r="${R}" fill="#3e3120"/>`,
        `    <circle cx="${cx}" cy="${CY}" r="${RIN}" fill="#6b5433"/>`,
        facets,
        `    <circle cx="${cx}" cy="${CY}" r="${RIN}" fill="none" `
            + 'stroke="#2f2416" stroke-width="2.4"/>',
        `    <circle cx="${ax}" cy="${ay}" r="1.8" fill="#f0e0b8"/>`,
        '  </g>',
    ].join('\n');
}

const svg = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
  <!-- Placeholder PALISADE SEGMENT art: the bandit camp wall in Zone 2
       (docs/art/assets.csv prop-palisade-segment). Several sit shoulder to
       shoulder, so this tiles.

       ⛔ GENERATED by tools/make-palisade.mjs — edit that, not this. The stake
       spacing is arithmetic, not taste: it is the only prop in the folder that
       has to line up with a copy of itself, and nudging a circle to make one
       segment look better on its own breaks every join in the wall. The
       script carries the rule, the reasoning and the checks.

       ⭐ THE WHOLE PROP IS ONE IDEA: A SHARPENED LOG TOP, because from above
       you never see a palisade's height, only the ends of the stakes. Four axe
       facets meeting at a point set up-left of centre. ⚑ A deliberate contrast
       with fencePost.svg — same object, same angle, SQUARED top with end-grain
       rings. A squared top is a fence built to keep stock in; a point is a
       wall built to keep people out.

       ⛔ THE SHADOW IS OFFSET IN Y ONLY, full width, square ends — an x offset
       cannot tile, and would notch every join. The seam wins, the light
       direction loses.

       ⚑ Blocking, because it is a wall. Rect body, so since C2b the authored
       rotation turns the collider with the sprite and a run can lie at any
       angle — but abutting segments must SHARE that rotation or the seam is
       thrown away.

       ⛔ preserveAspectRatio="none" is mandatory on the non-square viewBox
       (a95a2f0d); the aspect must stay 3:1 to match the 2.4 x 0.8 body.
       ⛔ Plain href only, never xlink:href (pipeline.md §2). -->

  <!-- SHADOW: full width, square ends, Y offset only. See the header. -->
  <rect x="0" y="30" width="${W}" height="44" fill="#000000" opacity="0.26"/>

  <!-- the earth bank the stakes are driven into, also full width -->
  <rect x="0" y="22" width="${W}" height="42" fill="#6b5a3f" opacity="0.5"/>

  <!-- ⚑ THE BACK RAIL, lashed across behind the stakes and showing only in the
       gaps between them. It is what says BUILT rather than planted, and it is
       drawn first so the stakes cover all but the slivers. -->
  <rect x="0" y="29" width="${W}" height="14" rx="3" fill="#4a3a23"/>
  <rect x="0" y="31" width="${W}" height="9" rx="2" fill="#6d5738"/>

  <!-- THE ${N} STAKES -->
${Array.from({length: N}, (_, i) => stake(i)).join('\n')}
</svg>
`;

console.log('palisade');
assertTileable();
writeFileSync(OUT, svg);
console.log(`  wrote ${OUT}`);
