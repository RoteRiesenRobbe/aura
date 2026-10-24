import {overheadBarDimensions} from './OverheadHealthBar';
import {OVERHEAD_BAR_BORDER} from '../../../client-data/Theme';

// Where the overlays around a token sit (plan-entity-presentation.md D8, L4):
// every one clears the state indicators' band, `band` = indicatorBand(size)
// for a medallion, 0 for a plain object, which wears no indicators. The ring
// spans ±size. Pure, so the clearances are pinned (PlateAnchors.test.ts).

// The bar's border is stroked on its edge, so half of it sticks out past the
// rect; a bar clears the band with that half and one more px. [PLACEHOLDER]
const BAR_CLEARANCE = OVERHEAD_BAR_BORDER.width / 2 + 1;

/**
 * The Mob bar's y: 8 % of the size past the ring plus the band, the gap the
 * old art used to leave (Mob.initHealthBar), or further where the bar's top
 * edge needs it. With no band this is today's max(30, 1.08 × size), lower by
 * at most a px on a small plain object. The nameplate hangs off it.
 */
export function mobBarAnchorY(size: number, band: number): number {
    const {barHeight} = overheadBarDimensions(size);
    return Math.max(30, size + band + Math.max(0.08 * size, barHeight / 2 + BAR_CLEARANCE));
}

/** The Character bar's y on its plate: today's place, or lower where the band needs it. */
export function characterBarAnchorY(size: number, band: number): number {
    const {barHeight} = overheadBarDimensions(size);
    return Math.max(48, 1.7 * size, size + band + barHeight / 2 + BAR_CLEARANCE);
}

/** The Character name's y (its centre) above the token, clear of the band (12 o'clock, stun's slot). */
export function characterNameY(size: number, band: number, halfHeight: number): number {
    return -Math.max(1.3 * size, size + band + halfHeight);
}

/**
 * The Character level number's centre, lower right of the token. It used to
 * sit at 0.72 × size on both axes, on the ring at 135°: the charm slot. Now
 * the corner of its box nearest the centre sits on the band's outer edge.
 */
export function levelNumberOffset(size: number, band: number, halfWidth: number, halfHeight: number): { x: number, y: number } {
    const corner = (size + band) / Math.SQRT2;
    return {x: corner + halfWidth, y: corner + halfHeight};
}

/** The y above the token's art (top edge at -spriteTop) that the E cap and the quest glyph stand clear of. */
export function aboveTokenY(spriteTop: number, band: number): number {
    return -(spriteTop + band);
}
