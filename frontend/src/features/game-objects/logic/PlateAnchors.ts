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

/** The Mob nameplate's top below its bar's centre, in px. [PLACEHOLDER] */
export const NAMEPLATE_GAP = 16;

/**
 * The height of the crowd badge row under the Mob bar (plan-playtest-versions.md
 * D9): the shield and the percent. The nameplate moves down by exactly this
 * while the row is shown (L10). [PLACEHOLDER]
 */
export const CROWD_BADGE_ROW = 22;

/** The crowd badge row's centre: right under the bar's bottom edge, stroke included. */
export function crowdBadgeY(size: number, band: number): number {
    const {barHeight} = overheadBarDimensions(size);
    return mobBarAnchorY(size, band) + barHeight / 2 + OVERHEAD_BAR_BORDER.width / 2 + CROWD_BADGE_ROW / 2;
}

/**
 * The Mob nameplate's top (its text hangs from it): under the bar, and under
 * the crowd badge while that is shown. The one anchor every reader of the
 * plate's y derives from (L10).
 */
export function mobNameplateY(size: number, band: number, crowdBadge: boolean): number {
    return mobBarAnchorY(size, band) + NAMEPLATE_GAP + (crowdBadge ? CROWD_BADGE_ROW : 0);
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
