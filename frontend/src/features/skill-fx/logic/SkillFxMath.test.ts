import {describe, expect, it} from 'vitest';
import {
    BEAM_EXTEND_FADE_FRACTION,
    beamExtend,
    beamFlash,
    chainOrder,
    clamp01,
    contactMs,
    flightMs,
    GLOW_BASE_ALPHA,
    GLOW_MAX_ALPHA,
    IMPACT_CURVE_MS,
    impactPhase,
    jaggedPolyline,
    PROJECTILE_MAX_MS,
    PROJECTILE_MIN_MS,
    PROJECTILE_SPEED_PX_PER_S,
    projectilePoint,
    STRIKE_CURVE_MS,
    StrikeCurve,
    strikePhase,
    swingDirection,
    SWING_HALF_ARC_RAD,
    windUpGlowAlpha,
} from './SkillFxMath';

describe('clamp01', () => {
    it('clamps and rejects non-finite input', () => {
        expect(clamp01(-0.5)).toBe(0);
        expect(clamp01(0.5)).toBe(0.5);
        expect(clamp01(1.5)).toBe(1);
        expect(clamp01(NaN)).toBe(0);
    });
});

describe('flightMs', () => {
    it('clamps point-blank to the minimum', () => {
        expect(flightMs(0, PROJECTILE_SPEED_PX_PER_S)).toBe(PROJECTILE_MIN_MS);
    });
    it('clamps extreme range to the maximum', () => {
        expect(flightMs(100_000, PROJECTILE_SPEED_PX_PER_S)).toBe(PROJECTILE_MAX_MS);
    });
    it('scales with distance in between', () => {
        expect(flightMs(350, 700)).toBe(500);
    });
    it('takes the authored speed, not a constant one', () => {
        // The layer authors px/s; twice the speed is half the flight.
        expect(flightMs(350, 1400)).toBe(250);
    });
    it('falls back to the default speed on a zero or absent one', () => {
        expect(flightMs(350, 0)).toBe(flightMs(350, PROJECTILE_SPEED_PX_PER_S));
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

describe('impactPhase', () => {
    it('snaps shut: the jaws close and hold, then fade', () => {
        const total = IMPACT_CURVE_MS.snap;
        expect(impactPhase('snap', 0, total).scale).toBeCloseTo(1.3);
        const shut = impactPhase('snap', total * 0.5, total);
        expect(shut.scale).toBeCloseTo(0.55);
        expect(shut.alpha).toBe(1);
        expect(impactPhase('snap', total * 0.75, total).alpha).toBeCloseTo(0.5);
        expect(impactPhase('snap', total, total).done).toBe(true);
    });

    it('bursts outward from a third to nine tenths of the victim while fading', () => {
        const total = IMPACT_CURVE_MS.burst;
        const start = impactPhase('burst', 0, total);
        expect(start.scale).toBeCloseTo(0.3);
        expect(start.alpha).toBe(1);
        const mid = impactPhase('burst', total * 0.5, total);
        expect(mid.scale).toBeGreaterThan(start.scale);
        expect(mid.alpha).toBeCloseTo(0.5);
        // The ring never grows past the victim's own silhouette.
        expect(impactPhase('burst', total * 0.999, total).scale).toBeLessThanOrEqual(0.9);
        expect(impactPhase('burst', total, total).done).toBe(true);
    });

    it('falls back to burst for a legacy or unknown curve, never throwing', () => {
        const total = IMPACT_CURVE_MS.burst;
        // `thrust` moved to the `strike` kind (§12c.1); a stale content file
        // must still draw something.
        expect(impactPhase('thrust' as never, total * 0.5, total))
            .toEqual(impactPhase('burst', total * 0.5, total));
        expect(impactPhase('nonsense' as never, 0, total).done).toBe(false);
    });

    it('is done past its total whatever the curve', () => {
        for (const curve of ['snap', 'burst'] as const) {
            expect(impactPhase(curve, 10_000, IMPACT_CURVE_MS[curve]).done).toBe(true);
        }
    });
});

describe('strikePhase', () => {
    // The caster-anchored weapon (§12c.1). `extend` and `offset` are fractions
    // of the caster→victim reach, `scale` multiplies the weapon's size, so the
    // weapon's far end (its head) sits at offset + extend * scale. That head is
    // the invariant every style is judged by: never past the victim before
    // contact, exactly on the victim at contact.
    const head = (p: { extend: number, offset: number, scale: number }) =>
        p.offset + p.extend * p.scale;

    const samples = (curve: StrikeCurve, total: number, count: number) =>
        Array.from({length: count + 1}, (_, i) => strikePhase(curve, (total * i) / count, total));

    it('thrusts out to the victim and back, monotonically on the way out', () => {
        const total = STRIKE_CURVE_MS.thrust;
        const contact = contactMs('thrust', total);
        const start = strikePhase('thrust', 0, total);
        expect(start.extend).toBeGreaterThan(0);
        expect(start.extend).toBeLessThan(1);
        expect(start.alpha).toBe(1);
        expect(start.angleOffset).toBe(0);

        let previous = 0;
        for (let i = 0; i <= 20; i++) {
            const phase = strikePhase('thrust', (contact * i) / 20, total);
            expect(phase.extend).toBeGreaterThanOrEqual(previous);
            previous = phase.extend;
        }
        expect(strikePhase('thrust', contact, total).extend).toBeCloseTo(1);
        expect(strikePhase('thrust', contact, total).alpha).toBeCloseTo(1);

        // Retracts and fades after contact.
        const late = strikePhase('thrust', total * 0.9, total);
        expect(late.extend).toBeLessThan(1);
        expect(late.alpha).toBeGreaterThan(0);
        expect(late.alpha).toBeLessThan(1);
    });

    it('sweeps the swing through the victim, crossing zero exactly at contact', () => {
        const total = STRIKE_CURVE_MS.swing;
        const contact = contactMs('swing', total);
        const start = strikePhase('swing', 0, total);
        expect(start.angleOffset).toBeCloseTo(-SWING_HALF_ARC_RAD);
        expect(strikePhase('swing', contact, total).angleOffset).toBeCloseTo(0);
        const end = strikePhase('swing', total * 0.999, total);
        expect(end.angleOffset).toBeCloseTo(SWING_HALF_ARC_RAD, 1);
        // Full reach throughout: the blade pivots, it does not stretch.
        samples('swing', total, 10).slice(0, 10).forEach(p => expect(p.extend).toBeCloseTo(1));
        // Fades out at the end of the arc.
        expect(end.alpha).toBeLessThan(1);
        expect(end.alpha).toBeGreaterThan(0);
    });

    it('winds the overhead up before it falls, and lands on the victim', () => {
        const total = STRIKE_CURVE_MS.overhead;
        const contact = contactMs('overhead', total);
        // Raised toward the camera during the wind-up, back to its own size on
        // the landing.
        expect(strikePhase('overhead', contact * 0.5, total).scale).toBeGreaterThan(1);
        expect(strikePhase('overhead', contact, total).scale).toBeCloseTo(1);
        expect(strikePhase('overhead', contact, total).extend).toBeCloseTo(1);
        // Pulled back behind the attacker while winding up.
        expect(strikePhase('overhead', total * 0.4, total).offset).toBeLessThan(0);
        expect(strikePhase('overhead', contact, total).offset).toBeCloseTo(0);
        // And never reaches past the victim before it lands.
        for (let i = 0; i < 20; i++) {
            expect(head(strikePhase('overhead', (contact * i) / 20, total))).toBeLessThan(1);
        }
        expect(head(strikePhase('overhead', contact, total))).toBeCloseTo(1);
        // Holds a beat on the victim, then fades.
        expect(strikePhase('overhead', contact + 1, total).alpha).toBe(1);
        expect(strikePhase('overhead', total * 0.95, total).alpha).toBeLessThan(1);
    });

    it('never swings the wrong way: no style reaches past the victim before contact', () => {
        for (const curve of ['thrust', 'swing', 'overhead'] as const) {
            const total = STRIKE_CURVE_MS[curve];
            const contact = contactMs(curve, total);
            for (let i = 0; i <= 20; i++) {
                expect(head(strikePhase(curve, (contact * i) / 20, total))).toBeLessThanOrEqual(1.0001);
            }
        }
    });

    it('is done at its total and past it, whatever the curve', () => {
        for (const curve of ['thrust', 'swing', 'overhead'] as const) {
            const total = STRIKE_CURVE_MS[curve];
            expect(strikePhase(curve, total, total).done).toBe(true);
            expect(strikePhase(curve, 10_000, total).done).toBe(true);
            expect(strikePhase(curve, total * 0.999, total).done).toBe(false);
        }
    });

    it('takes the default total for a zero ms and is deterministic', () => {
        expect(strikePhase('swing', 100, 0)).toEqual(strikePhase('swing', 100, STRIKE_CURVE_MS.swing));
        expect(strikePhase('overhead', 77, 460)).toEqual(strikePhase('overhead', 77, 460));
    });
});

describe('contactMs', () => {
    it('sits inside each style and follows the authored total', () => {
        for (const curve of ['thrust', 'swing', 'overhead'] as const) {
            const contact = contactMs(curve, 1000);
            expect(contact).toBeGreaterThan(0);
            expect(contact).toBeLessThan(1000);
            // Twice the lifetime, twice the wait.
            expect(contactMs(curve, 2000)).toBeCloseTo(contact * 2);
        }
    });
    it('falls back to the style default for a zero total', () => {
        expect(contactMs('overhead', 0)).toBeCloseTo(contactMs('overhead', STRIKE_CURVE_MS.overhead));
    });
});

describe('swingDirection', () => {
    // Repeated hits must not look mechanical, and must still be reproducible.
    it('alternates with the seed and is stable for one', () => {
        expect(swingDirection(0)).toBe(1);
        expect(swingDirection(1)).toBe(-1);
        expect(swingDirection(2)).toBe(1);
        expect(swingDirection(7)).toBe(swingDirection(7));
    });
});

describe('beamFlash', () => {
    it('rises weak to bright, then fades', () => {
        expect(beamFlash(0, 200).intensity).toBeCloseTo(0.25);
        expect(beamFlash(50, 200).intensity).toBeCloseTo(1);
        expect(beamFlash(125, 200).intensity).toBeCloseTo(0.5);
        expect(beamFlash(200, 200).done).toBe(true);
    });
    it('makes the bolt bold exactly where it is bright', () => {
        const peak = beamFlash(50, 200);
        const late = beamFlash(150, 200);
        expect(peak.width).toBeGreaterThan(late.width);
        // Width never collapses to nothing while the bolt is still drawn.
        expect(late.width).toBeGreaterThan(0);
    });
});

describe('beamExtend', () => {
    it('extends from the caster end and retracts to nothing', () => {
        expect(beamExtend(0, 400).extent).toBeCloseTo(0);
        expect(beamExtend(200, 400).extent).toBeCloseTo(1);
        expect(beamExtend(400, 400).extent).toBeCloseTo(0);
        expect(beamExtend(400, 400).done).toBe(true);
    });
    it('holds full alpha until the fade fraction', () => {
        expect(beamExtend(400 * BEAM_EXTEND_FADE_FRACTION, 400).alpha).toBeCloseTo(1);
        expect(beamExtend(400 * (1 + BEAM_EXTEND_FADE_FRACTION) / 2, 400).alpha).toBeCloseTo(0.5);
    });
});

describe('jaggedPolyline', () => {
    // Nothing here is random: the same (from, to, seed) always draws the same
    // bolt, so a test can assert a position rather than a range.
    it('starts and ends exactly on its endpoints', () => {
        const points = jaggedPolyline(10, 20, 110, 20, 6, 10, 3);
        expect(points).toHaveLength(7);
        expect(points[0]).toEqual({x: 10, y: 20});
        expect(points[6]).toEqual({x: 110, y: 20});
    });
    it('puts every interior node at its computed offset', () => {
        // Along +X, so the perpendicular is +Y and the offset IS the y delta.
        const points = jaggedPolyline(0, 0, 100, 0, 6, 10, 3);
        const expected = [
            {x: 0, y: 0},
            {x: 100 / 6, y: 4.1269134202},
            {x: 200 / 6, y: -1.9680188962},
            {x: 50, y: -4.9025265812},
            {x: 400 / 6, y: 8.2293301955},
            {x: 500 / 6, y: -4.5555181156},
            {x: 100, y: 0},
        ];
        points.forEach((p, i) => {
            expect(p.x).toBeCloseTo(expected[i].x, 6);
            expect(p.y).toBeCloseTo(expected[i].y, 6);
        });
    });
    it('is deterministic and seed-separated', () => {
        expect(jaggedPolyline(0, 0, 100, 0, 6, 10, 3))
            .toEqual(jaggedPolyline(0, 0, 100, 0, 6, 10, 3));
        expect(jaggedPolyline(0, 0, 100, 0, 6, 10, 4))
            .not.toEqual(jaggedPolyline(0, 0, 100, 0, 6, 10, 3));
    });
    it('degenerates to the two endpoints for a zero-length bolt', () => {
        expect(jaggedPolyline(5, 5, 5, 5, 6, 10, 0)).toEqual([{x: 5, y: 5}, {x: 5, y: 5}]);
    });
});

describe('chainOrder', () => {
    const caster = {x: 0, y: 0};

    it('walks the victims nearest-first from the caster', () => {
        const far = {x: 100, y: 0, id: 'far'};
        const near = {x: 10, y: 0, id: 'near'};
        const mid = {x: 40, y: 0, id: 'mid'};
        const hops = chainOrder(caster, [far, near, mid]);
        expect(hops.map(h => h.to.id)).toEqual(['near', 'mid', 'far']);
        expect(hops[0].from).toEqual(caster);
        expect(hops[1].from).toBe(near);
        expect(hops[2].from).toBe(mid);
    });

    it('hops from the PREVIOUS victim, not the caster', () => {
        // b is farther from the caster than a, but a is right next to b, so the
        // fan order (a, c) and the chain order (a, b) differ.
        const a = {x: 0, y: 50, id: 'a'};
        const b = {x: 0, y: 58, id: 'b'};
        const c = {x: 60, y: 0, id: 'c'};
        expect(chainOrder(caster, [c, b, a]).map(h => h.to.id)).toEqual(['a', 'b', 'c']);
    });

    it('handles the empty and single cases', () => {
        expect(chainOrder(caster, [])).toEqual([]);
        const only = {x: 3, y: 4, id: 'only'};
        const hops = chainOrder(caster, [only]);
        expect(hops).toHaveLength(1);
        expect(hops[0]).toEqual({from: caster, to: only});
    });

    it('breaks a tie by input order, so the draw is reproducible', () => {
        const first = {x: 10, y: 0, id: 'first'};
        const second = {x: -10, y: 0, id: 'second'};
        expect(chainOrder(caster, [first, second]).map(h => h.to.id)).toEqual(['first', 'second']);
        expect(chainOrder(caster, [second, first]).map(h => h.to.id)).toEqual(['second', 'first']);
    });
});

describe('windUpGlowAlpha', () => {
    // Moved verbatim from AuraTickIndicator (D7): the ring brightens toward the
    // beat and never blinks fully off between ticks.
    it('sits at the baseline right after a tick and peaks at the next', () => {
        expect(windUpGlowAlpha(30, 0)).toBeCloseTo(GLOW_BASE_ALPHA);
        expect(windUpGlowAlpha(30, 30)).toBeCloseTo(GLOW_MAX_ALPHA);
        expect(windUpGlowAlpha(30, 15)).toBeCloseTo((GLOW_BASE_ALPHA + GLOW_MAX_ALPHA) / 2);
    });
    it('clamps an overshooting phase to the peak', () => {
        expect(windUpGlowAlpha(30, 45)).toBeCloseTo(GLOW_MAX_ALPHA);
    });
    it('is 0 without an active aura, which is the hidden state', () => {
        expect(windUpGlowAlpha(0, 12)).toBe(0);
    });
});
