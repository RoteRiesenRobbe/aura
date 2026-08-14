import {describe, expect, it} from 'vitest';
import {OverheadHealthBar, overheadBarDimensions} from './OverheadHealthBar';

// Pins for the extracted overhead bar (plan-code-health.md C5 item 1). The
// expectations are hand-computed from the pre-extraction twins
// (Character.initHealthBar / Mob.initHealthBar), so green here means the
// shared component reproduces exactly what both copies rendered.

describe('overheadBarDimensions', () => {
    it('floors the width at 30 for small entities', () => {
        expect(overheadBarDimensions(10)).toEqual({barWidth: 30, barHeight: 5});
    });

    it('tracks 0.9 × size in the midband', () => {
        // width 54, height 54 × 0.12 = 6.48 — inside both clamps
        const {barWidth, barHeight} = overheadBarDimensions(60);
        expect(barWidth).toBe(54);
        expect(barHeight).toBeCloseTo(6.48, 10);
    });

    it('caps the height at 10 before the width caps', () => {
        // width 90 → 10.8 would overflow the height cap
        expect(overheadBarDimensions(100)).toEqual({barWidth: 90, barHeight: 10});
    });

    it('caps the width at 160 for the largest entities', () => {
        expect(overheadBarDimensions(200)).toEqual({barWidth: 160, barHeight: 10});
    });

    it('floors the height at 5 at the width floor', () => {
        // width 30 → 3.6 would underflow the height floor
        expect(overheadBarDimensions(33)).toEqual({barWidth: 30, barHeight: 5});
    });
});

describe('OverheadHealthBar', () => {
    // size 40 → barWidth 36, barHeight 5, innerWidth 34, barInnerX -17
    const build = () => new OverheadHealthBar(40, 66);

    it('anchors the container at the given y', () => {
        const bar = build();
        expect(bar.container.y).toBe(66);
        expect(bar.anchorY).toBe(66);
    });

    it('builds the pixel-contract child order: backdrop, health, shield, pips', () => {
        const bar = build();
        expect(bar.container.children).toHaveLength(4);
    });

    it('starts full until the first snapshot', () => {
        const bar = build();
        const [, health, shield] = bar.container.children;
        expect(health.scale.x).toBe(1);
        expect(shield.visible).toBe(false);
    });

    it('scales the health fill to the wire fraction', () => {
        const bar = build();
        const [, health] = bar.container.children;
        bar.setHealth(50, 100);
        expect(health.scale.x).toBeCloseTo(0.5, 10);
    });

    it('anchors the shield segment at the end of the health fill', () => {
        const bar = build();
        const [, , shield] = bar.container.children;
        bar.setHealth(25, 100);
        bar.setShield(30, 100);
        expect(shield.visible).toBe(true);
        expect(shield.scale.x).toBeCloseTo(0.3, 10);
        // barInnerX + healthFraction × barInnerWidth = -17 + 0.25 × 34
        expect(shield.position.x).toBeCloseTo(-8.5, 10);
    });

    it('hides the shield segment at 0', () => {
        const bar = build();
        const [, , shield] = bar.container.children;
        bar.setShield(30, 100);
        expect(shield.visible).toBe(true);
        bar.setShield(0, 100);
        expect(shield.visible).toBe(false);
    });

    it('parks the effect pips just under the bar', () => {
        const bar = build();
        const pips = bar.container.children[3];
        // barHeight / 2 + the 9 px gap
        expect(pips.y).toBe(11.5);
    });
});
