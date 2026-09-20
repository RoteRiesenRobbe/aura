import {describe, expect, it} from 'vitest';
import {
    BEAM_EXTEND_FADE_FRACTION,
    beamExtend,
    beamFlash,
    BURST_REACH_FACTOR,
    CAST_POSE_DEFAULT_MS,
    castPoseAlpha,
    chainOrder,
    clamp01,
    contactMs,
    densityCount,
    EMITTER_DEFAULT_MS,
    EMITTER_FADE_IN_FRACTION,
    emitterParticle,
    flightMs,
    GLOW_BASE_ALPHA,
    GLOW_MAX_ALPHA,
    IMPACT_CURVE_MS,
    impactPhase,
    jaggedPolyline,
    ORBIT_FADE_MS,
    ORBIT_PERIOD_MS,
    orbitAlpha,
    orbitPoint,
    PROJECTILE_MAX_MS,
    PROJECTILE_MIN_MS,
    PROJECTILE_SPEED_PX_PER_S,
    projectilePoint,
    RISE_DRIFT_PX,
    OVERHEAD_RAISE_RAD,
    OVERHEAD_WINDUP_FRACTION,
    overheadSide,
    percentileOf,
    STRIKE_CURVE_MS,
    SWIRL_RADIUS_FRACTION,
    StrikeCurve,
    strikePhase,
    swingDirection,
    SWING_HALF_ARC_RAD,
    snapOpenOf,
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
    // Measured ALONG THE AIM: a weapon held off to the side (the swing's arc,
    // the raised overhead) reaches only its projection toward the victim.
    const head = (p: { extend: number, offset: number, scale: number, angleOffset: number }) =>
        (p.offset + p.extend * p.scale) * Math.cos(p.angleOffset);

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

    it('raises the overhead a quarter turn off the aim, then swings it down onto the victim', () => {
        const total = STRIKE_CURVE_MS.overhead;
        const contact = contactMs('overhead', total);
        // PO 2026-09-20: the hammer starts 90 degrees off the line to the
        // victim and HOLDS there for the wind-up...
        expect(strikePhase('overhead', 0, total).angleOffset).toBeCloseTo(-OVERHEAD_RAISE_RAD);
        expect(strikePhase('overhead', contact * 0.4, total).angleOffset)
            .toBeCloseTo(-OVERHEAD_RAISE_RAD);
        // ...raised toward the camera while it is up there...
        expect(strikePhase('overhead', contact * 0.5, total).scale).toBeGreaterThan(1);
        // ...then falls, accelerating, and is ON the aim at its own size at contact.
        const early = strikePhase('overhead', contact * 0.75, total).angleOffset;
        const late = strikePhase('overhead', contact * 0.95, total).angleOffset;
        expect(early).toBeLessThan(late);
        expect(late).toBeLessThan(0);
        // Heavy: halfway through the fall's TIME it has covered under half the arc.
        const fallStart = total * OVERHEAD_WINDUP_FRACTION;
        expect(strikePhase('overhead', (fallStart + contact) / 2, total).angleOffset)
            .toBeLessThan(-OVERHEAD_RAISE_RAD / 2);
        expect(strikePhase('overhead', contact, total).angleOffset).toBeCloseTo(0);
        expect(strikePhase('overhead', contact, total).scale).toBeCloseTo(1);
        // It is a held, fixed-size weapon the whole way: it pivots, never
        // stretches and never leaves the hand.
        samples('overhead', total, 10).slice(0, 10).forEach((p) => {
            expect(p.extend).toBeCloseTo(1);
            expect(p.offset).toBeCloseTo(0);
        });
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

// --- C2b: the other three kinds --------------------------------------------

describe('orbitPoint', () => {
    it('spaces the bodies evenly around the anchor', () => {
        const a = orbitPoint(0, 2, 0, 100);
        const b = orbitPoint(1, 2, 0, 100);
        expect(a.x).toBeCloseTo(100);
        expect(a.y).toBeCloseTo(0);
        expect(b.x).toBeCloseTo(-100);
        expect(b.y).toBeCloseTo(0);
    });

    it('completes exactly one revolution per ORBIT_PERIOD_MS', () => {
        const start = orbitPoint(0, 3, 0, 80);
        const round = orbitPoint(0, 3, ORBIT_PERIOD_MS, 80);
        expect(round.x).toBeCloseTo(start.x);
        expect(round.y).toBeCloseTo(start.y);
        const half = orbitPoint(0, 3, ORBIT_PERIOD_MS / 2, 80);
        expect(half.x).toBeCloseTo(-80);
    });

    it('stays on the radius it was given', () => {
        for (const ms of [0, 137, 640, 3_000]) {
            const p = orbitPoint(1, 4, ms, 55);
            expect(Math.hypot(p.x, p.y)).toBeCloseTo(55);
        }
    });

    it('treats a count of 0 as a single body rather than dividing by zero', () => {
        const p = orbitPoint(0, 0, 0, 30);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    });
});

describe('orbitAlpha', () => {
    it('fades in, holds, and fades out inside a fired layer lifetime', () => {
        expect(orbitAlpha(0, 1_200)).toBe(0);
        expect(orbitAlpha(ORBIT_FADE_MS, 1_200)).toBeCloseTo(1);
        expect(orbitAlpha(600, 1_200)).toBeCloseTo(1);
        expect(orbitAlpha(1_200 - ORBIT_FADE_MS / 2, 1_200)).toBeCloseTo(0.5);
        expect(orbitAlpha(1_200, 1_200)).toBe(0);
        expect(orbitAlpha(5_000, 1_200)).toBe(0);
    });

    it('never fades out for an ambient layer, which lives while the aura runs', () => {
        expect(orbitAlpha(0, 0)).toBe(0);
        expect(orbitAlpha(ORBIT_FADE_MS, 0)).toBeCloseTo(1);
        expect(orbitAlpha(600_000, 0)).toBeCloseTo(1);
    });
});

describe('castPoseAlpha', () => {
    it('holds the body, then fades it out over the tail of its ms', () => {
        expect(castPoseAlpha(0, 250)).toBeCloseTo(1);
        expect(castPoseAlpha(150, 250)).toBeCloseTo(1);
        expect(castPoseAlpha(250, 250)).toBe(0);
        // Halfway down the fade tail.
        expect(castPoseAlpha(200, 250)).toBeCloseTo(0.5);
    });

    it('falls back to the default lifetime when the layer authors no ms', () => {
        expect(castPoseAlpha(CAST_POSE_DEFAULT_MS - 1, 0)).toBeGreaterThan(0);
        expect(castPoseAlpha(CAST_POSE_DEFAULT_MS, 0)).toBe(0);
    });
});

describe('emitterParticle', () => {
    it('rises: starts inside the anchor disc and drifts up by RISE_DRIFT_PX', () => {
        const start = emitterParticle('rise', 0, 8, 0, 900, 40);
        expect(Math.hypot(start.x, start.y)).toBeLessThanOrEqual(40);
        const end = emitterParticle('rise', 0, 8, 899, 900, 40);
        expect(end.y).toBeCloseTo(start.y - RISE_DRIFT_PX, 0);
        expect(end.x).toBeCloseTo(start.x);
    });

    it('swirls: circles at ~70 % of the anchor radius and drifts outward', () => {
        const start = emitterParticle('swirl', 0, 8, 0, 900, 100);
        expect(Math.hypot(start.x, start.y)).toBeCloseTo(100 * SWIRL_RADIUS_FRACTION);
        const late = emitterParticle('swirl', 0, 8, 810, 900, 100);
        expect(Math.hypot(late.x, late.y)).toBeGreaterThan(Math.hypot(start.x, start.y));
    });

    it('bursts: flies radially outward to ~1.5x the anchor radius', () => {
        const start = emitterParticle('burst', 3, 8, 0, 900, 30);
        expect(Math.hypot(start.x, start.y)).toBeCloseTo(0);
        const end = emitterParticle('burst', 3, 8, 899, 900, 30);
        expect(Math.hypot(end.x, end.y)).toBeCloseTo(30 * BURST_REACH_FACTOR, 0);
        // Radially outward: the direction never changes over the life.
        const mid = emitterParticle('burst', 3, 8, 450, 900, 30);
        expect(Math.atan2(mid.y, mid.x)).toBeCloseTo(Math.atan2(end.y, end.x));
    });

    it('fades in from nothing and out to nothing, so a looped respawn never pops', () => {
        expect(emitterParticle('rise', 0, 8, 0, 900, 40).alpha).toBe(0);
        expect(emitterParticle('rise', 0, 8, 900 * EMITTER_FADE_IN_FRACTION, 900, 40).alpha)
            .toBeCloseTo(1);
        expect(emitterParticle('rise', 0, 8, 900, 900, 40).alpha).toBe(0);
    });

    it('is deterministic: the same arguments always give the same particle', () => {
        expect(emitterParticle('swirl', 5, 8, 321, 900, 40))
            .toEqual(emitterParticle('swirl', 5, 8, 321, 900, 40));
    });

    it('spreads a burst over distinct directions per index', () => {
        const angles = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const p = emitterParticle('burst', i, 8, 450, 900, 30);
            return Math.atan2(p.y, p.x).toFixed(4);
        });
        expect(new Set(angles).size).toBe(8);
    });

    it('loops for ambient: particle i is phase-offset by i / count of a lifetime', () => {
        // Particle 2 of 4, half a lifetime in, sits where particle 0 sits a
        // full half-life plus 2/4 in - one steady stream, never all at once.
        const looped = emitterParticle('rise', 2, 4, 0, 900, 40, true);
        const plain = emitterParticle('rise', 2, 4, 900 * 0.5, 900, 40);
        expect(looped.y).toBeCloseTo(plain.y);
        // And it never dies: a lifetime later it is back at its own start.
        const wrapped = emitterParticle('rise', 2, 4, 900, 900, 40, true);
        expect(wrapped.y).toBeCloseTo(looped.y);
    });

    it('falls back to the default lifetime when the layer authors no ms', () => {
        expect(emitterParticle('rise', 0, 8, EMITTER_DEFAULT_MS, 0, 40).alpha).toBe(0);
        expect(emitterParticle('rise', 0, 8, EMITTER_DEFAULT_MS / 2, 0, 40).alpha)
            .toBeGreaterThan(0);
    });
});

describe('densityCount', () => {
    // The PO's rule (§12d.1): `low` is 40 % of every emitter, never zero.
    it('keeps every particle at full', () => {
        expect(densityCount(8, 'full')).toBe(8);
        expect(densityCount(1, 'full')).toBe(1);
    });
    it('thins to 40 %, rounded, with a floor of one', () => {
        expect(densityCount(8, 'low')).toBe(3);
        expect(densityCount(12, 'low')).toBe(5);
        expect(densityCount(2, 'low')).toBe(1);
        expect(densityCount(1, 'low')).toBe(1);
    });
    it('draws nothing at off', () => {
        expect(densityCount(8, 'off')).toBe(0);
    });
    it('never invents a particle for a layer that authored none', () => {
        expect(densityCount(0, 'low')).toBe(0);
        expect(densityCount(-3, 'full')).toBe(0);
    });
});

describe('snapOpenOf', () => {
    it('reads wide open at the start of a snap and shut once it has closed', () => {
        expect(snapOpenOf(impactPhase('snap', 0, 200).scale)).toBe(1);
        expect(snapOpenOf(impactPhase('snap', 100, 200).scale)).toBeCloseTo(0, 5);
        expect(snapOpenOf(impactPhase('snap', 180, 200).scale)).toBeCloseTo(0, 5);
    });

    it('closes monotonically', () => {
        const at = (ms: number) => snapOpenOf(impactPhase('snap', ms, 200).scale);
        expect(at(20)).toBeGreaterThan(at(50));
        expect(at(50)).toBeGreaterThan(at(90));
    });
});

describe('overheadSide', () => {
    // The raised hammer sits at aim - side * 90 degrees, and -y is UP on screen.
    const raisedY = (aim: number) => Math.sin(aim - overheadSide(aim) * OVERHEAD_RAISE_RAD);

    it('raises the hammer toward the TOP of the screen whichever way the victim is', () => {
        for (const aim of [0, 0.6, -0.6, Math.PI, Math.PI - 0.6, -Math.PI + 0.6, 2.5, -2.5]) {
            expect(raisedY(aim)).toBeLessThan(0);
        }
    });

    it('still answers for a victim straight above or below', () => {
        expect(Math.abs(overheadSide(Math.PI / 2))).toBe(1);
        expect(Math.abs(overheadSide(-Math.PI / 2))).toBe(1);
    });
});

describe('percentileOf', () => {
    // The C4 instrument's only arithmetic (§12e.4): nearest-rank over an
    // already-sorted sample, which is what a fixed ring hands it after one
    // sort at call time.
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it('answers the nearest rank, never an interpolated value', () => {
        expect(percentileOf(sorted, 0.5)).toBe(5);
        expect(percentileOf(sorted, 0.95)).toBe(10);
        expect(percentileOf(sorted, 0.9)).toBe(9);
    });

    it('reads the ends exactly', () => {
        expect(percentileOf(sorted, 0)).toBe(1);
        expect(percentileOf(sorted, 1)).toBe(10);
    });

    it('answers a one-sample and an empty ring without throwing', () => {
        expect(percentileOf([42], 0.95)).toBe(42);
        expect(percentileOf([], 0.5)).toBe(0);
    });

    it('clamps a quantile outside 0..1 rather than reading past the array', () => {
        expect(percentileOf(sorted, -1)).toBe(1);
        expect(percentileOf(sorted, 7)).toBe(10);
        expect(percentileOf(sorted, NaN)).toBe(1);
    });
});
