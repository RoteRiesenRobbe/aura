import {describe, expect, it} from 'vitest';
import {
    flakeCount,
    flightMs,
    projectilePoint,
    PROJECTILE_MAX_MS,
    PROJECTILE_MIN_MS,
    REACH_SLACK_PX,
    snowflake,
    STRIKE_THRUST_MS,
    STRIKE_TOTAL_MS,
    strikePhase,
    visualStyleFor,
    withinReach,
} from './SkillVisualsMath';

describe('visualStyleFor', () => {
    it('maps the prototype skills and nothing else', () => {
        expect(visualStyleFor(1)).toBe('strike-sword');
        expect(visualStyleFor(141)).toBe('field-ice');
        expect(visualStyleFor(146)).toBe('field-ice');
        expect(visualStyleFor(45)).toBe('projectile-fire');
        expect(visualStyleFor(59)).toBe('projectile-frost');
        // Unmapped skills keep today's visuals - including "no active aura".
        expect(visualStyleFor(0)).toBeNull();
        expect(visualStyleFor(52)).toBeNull(); // Spearhead (maxTargets 3) deliberately unmapped
    });
});

describe('withinReach', () => {
    // The §57 lesson mirrored: the victim's own radius extends reachability.
    it('accepts a victim at exact ring + collider reach', () => {
        const reach = 120 + 20 + REACH_SLACK_PX;
        expect(withinReach(reach, 0, 120, 20)).toBe(true);
    });
    it('rejects a victim past the slack', () => {
        const reach = 120 + 20 + REACH_SLACK_PX;
        expect(withinReach(reach + 1, 0, 120, 20)).toBe(false);
    });
    it('works off-axis', () => {
        expect(withinReach(80, 80, 120, 20)).toBe(true); // ~113 < 154
    });
});

describe('flightMs', () => {
    it('clamps point-blank to the minimum', () => {
        expect(flightMs(0)).toBe(PROJECTILE_MIN_MS);
    });
    it('clamps extreme range to the maximum', () => {
        expect(flightMs(100_000)).toBe(PROJECTILE_MAX_MS);
    });
    it('scales with distance in between', () => {
        expect(flightMs(350)).toBe(500); // 700 px/s
    });
});

describe('projectilePoint', () => {
    it('starts at the origin and ends on the target', () => {
        expect(projectilePoint(10, 20, 110, 220, 0)).toEqual({x: 10, y: 20});
        expect(projectilePoint(10, 20, 110, 220, 1)).toEqual({x: 110, y: 220});
    });
    it('clamps t outside [0,1]', () => {
        expect(projectilePoint(0, 0, 100, 0, -0.5)).toEqual({x: 0, y: 0});
        expect(projectilePoint(0, 0, 100, 0, 1.5)).toEqual({x: 100, y: 0});
    });
});

describe('strikePhase', () => {
    it('starts partially extended and fully visible', () => {
        const p = strikePhase(0);
        expect(p.extend).toBeCloseTo(0.25);
        expect(p.alpha).toBe(1);
        expect(p.done).toBe(false);
    });
    it('is fully extended and still visible at the end of the thrust', () => {
        const p = strikePhase(STRIKE_THRUST_MS);
        expect(p.extend).toBeCloseTo(1);
        expect(p.alpha).toBe(1);
    });
    it('fades after the thrust and terminates', () => {
        const mid = strikePhase((STRIKE_THRUST_MS + STRIKE_TOTAL_MS) / 2);
        expect(mid.alpha).toBeGreaterThan(0);
        expect(mid.alpha).toBeLessThan(1);
        expect(strikePhase(STRIKE_TOTAL_MS).done).toBe(true);
    });
});

describe('snowflake field', () => {
    it('sizes the flake count to the radius, clamped', () => {
        expect(flakeCount(10)).toBe(12);
        expect(flakeCount(120)).toBe(17);
        expect(flakeCount(10_000)).toBe(40);
    });
    it('is deterministic', () => {
        expect(snowflake(3, 1234, 120)).toEqual(snowflake(3, 1234, 120));
    });
    it('keeps every flake inside the ring (with the 6% breath)', () => {
        for (let i = 0; i < 40; i++) {
            for (const t of [0, 500, 5000, 60_000]) {
                const f = snowflake(i, t, 120);
                expect(Math.hypot(f.x, f.y)).toBeLessThanOrEqual(120 * 1.01);
                expect(f.alpha).toBeGreaterThan(0);
                expect(f.alpha).toBeLessThanOrEqual(1);
            }
        }
    });
    it('staggers neighbouring flakes onto different rings', () => {
        const r0 = Math.hypot(snowflake(0, 0, 120).x, snowflake(0, 0, 120).y);
        const r1 = Math.hypot(snowflake(1, 0, 120).x, snowflake(1, 0, 120).y);
        expect(Math.abs(r0 - r1)).toBeGreaterThan(5);
    });
});
