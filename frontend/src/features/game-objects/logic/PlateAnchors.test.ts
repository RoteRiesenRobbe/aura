import {describe, expect, it} from 'vitest';
import {aboveTokenY, characterBarAnchorY, characterNameY, levelNumberOffset, mobBarAnchorY} from './PlateAnchors';
import {overheadBarDimensions} from './OverheadHealthBar';
import {indicatorBand} from './TokenState';
import {OVERHEAD_BAR_BORDER} from '../../../client-data/Theme';

// The bar's stroke sits on its edge: half of it sticks out past the rect.
const STROKE = OVERHEAD_BAR_BORDER.width / 2;

// plan-entity-presentation.md D8, L4: every anchor around a medallion clears
// the indicator band (ring at ±size, then the band), or an indicator sits
// under the bar, the name, the level number, the E cap or the quest glyph.
// Sizes: the smallest medallion (26), the player (30), a mid mob, a boss.
const SIZES = [26, 30, 36, 46, 82];

describe('anchors clear the indicator band', () => {
    it('the Mob bar (and the nameplate under it)', () => {
        for (const size of SIZES) {
            const band = indicatorBand(size);
            const {barHeight} = overheadBarDimensions(size);
            expect(mobBarAnchorY(size, band) - barHeight / 2 - STROKE, `size ${size}`).toBeGreaterThanOrEqual(size + band);
        }
    });

    // A plain object wears no indicators: its bar keeps today's 1.08 × size,
    // lower by under a px where the bar's own clearance needs it.
    it('the Mob bar of a plain object stays where it was', () => {
        expect(mobBarAnchorY(54, 0) - 54 * 1.08).toBeGreaterThanOrEqual(0);
        expect(mobBarAnchorY(54, 0) - 54 * 1.08).toBeLessThan(1);
        expect(mobBarAnchorY(180, 0)).toBeCloseTo(180 * 1.08, 10);
        expect(mobBarAnchorY(10, 0)).toBe(30);
    });

    it('the Character bar on its plate', () => {
        for (const size of SIZES) {
            const band = indicatorBand(size);
            const {barHeight} = overheadBarDimensions(size);
            expect(characterBarAnchorY(size, band) - barHeight / 2 - STROKE, `size ${size}`).toBeGreaterThanOrEqual(size + band);
        }
        // The player's bar already cleared it: it stays put.
        expect(characterBarAnchorY(30, indicatorBand(30))).toBe(51);
    });

    it('the Character name', () => {
        for (const size of SIZES) {
            const band = indicatorBand(size);
            const halfHeight = 12;
            expect(-characterNameY(size, band, halfHeight) - halfHeight, `size ${size}`).toBeGreaterThanOrEqual(size + band);
        }
    });

    // The level number sat at 135°, just outside the ring: the charm slot.
    it('the Character level number', () => {
        for (const size of SIZES) {
            const band = indicatorBand(size);
            const halfWidth = 8;
            const halfHeight = 12;
            const {x, y} = levelNumberOffset(size, band, halfWidth, halfHeight);
            // The box corner nearest the token centre.
            const corner = Math.hypot(x - halfWidth, y - halfHeight);
            expect(corner, `size ${size}`).toBeGreaterThanOrEqual(size + band - 1e-9);
        }
    });

    it('the E cap and the quest glyph above the art', () => {
        for (const size of SIZES) {
            const band = indicatorBand(size);
            // The art's top edge sits at -size on a medallion.
            expect(-aboveTokenY(size, band), `size ${size}`).toBeGreaterThanOrEqual(size + band);
        }
        expect(aboveTokenY(40, 0)).toBe(-40);
    });
});
