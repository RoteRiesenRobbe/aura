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
    HIT_MARK_MS,
    impactPhase,
    jaggedPolyline,
    ORBIT_FADE_MS,
    ORBIT_PERIOD_MS,
    orbitAlpha,
    orbitPoint,
    PROJECTILE_MAX_MS,
    PROJECTILE_MIN_MS,
    PROJECTILE_SIZE_FACTOR,
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
    beamSpriteScale,
    landsOnVictim,
    spriteScaleToExtent,
    strikeCurveOf,
    waveCountOf,
    waveRing,
    waveTotalMsOf,
    WAVE_DEFAULT_MS,
    WAVE_MAX_COUNT,
    windUpGlowAlpha,
} from './SkillFxMath';
import {
    LUNGE_DEFAULT_MS,
    LUNGE_DISTANCE_FACTOR,
    LUNGE_OUT_FRACTION,
    lungeContactMsOf,
    lungeDistancePx,
    lungeShare,
    RUSH_DEFAULT_MS,
    rushShare,
    rushTotalMsOf,
    lungeTotalMsOf,
} from './SkillFxMath';
import {
    BITE_OPEN_GAP,
    BITE_OPEN_SCALE,
    CLAW_ANGLE_RAD,
    GORE_ANGLE_RAD,
    KICK_POP_SCALE,
    MAUL_CURVE_MS,
    MAUL_MIN_SIZE_PX,
    MAUL_PART_LENGTH,
    MAUL_PARTS,
    MaulCurve,
    MaulPhase,
    PINCER_OPEN_RAD,
    bitePhase,
    clawPhase,
    gorePhase,
    kickPhase,
    maulCurveOf,
    maulPhase,
    maulSizePx,
    maulTotalMsOf,
    pincerPhase,
} from './SkillFxMath';
import {meter2px} from '../../../client-data/BasicConfig';
import wolfBite from '../../../../../api/skills/mobs/wolf-bite.json';

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
        // The PO look (2026-09-23): "30 % bigger in general and a bit slower".
        expect(PROJECTILE_SIZE_FACTOR).toBe(1.3);
        expect(PROJECTILE_SPEED_PX_PER_S).toBe(500);
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
    // ⭐ The ENGINE'S OWN hit mark since §12g.1 call 2: no content authors it,
    // there is one look, and the curve parameter is gone with `snap`.
    it('bursts outward from a third to nine tenths of the victim while fading', () => {
        const total = HIT_MARK_MS;
        const start = impactPhase(0, total);
        expect(start.scale).toBeCloseTo(0.3);
        expect(start.alpha).toBe(1);
        const mid = impactPhase(total * 0.5, total);
        expect(mid.scale).toBeGreaterThan(start.scale);
        expect(mid.alpha).toBeCloseTo(0.5);
        // The ring never grows past the victim's own silhouette.
        expect(impactPhase(total * 0.999, total).scale).toBeLessThanOrEqual(0.9);
        expect(impactPhase(total, total).done).toBe(true);
    });

    it('takes the mark default for a zero total, and is done past it', () => {
        expect(impactPhase(100, 0)).toEqual(impactPhase(100, HIT_MARK_MS));
        expect(impactPhase(10_000, HIT_MARK_MS).done).toBe(true);
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

describe('strikeCurveOf', () => {
    // plan-natural-weapons.md C2: the bite and the pincer are the maul's. The
    // server refuses them on a strike; a stale catalog still draws a weapon.
    it('reads the three held weapons, and nothing that left for the maul', () => {
        expect(strikeCurveOf('swing')).toBe('swing');
        expect(strikeCurveOf('overhead')).toBe('overhead');
        expect(strikeCurveOf('bite')).toBe('thrust');
        expect(strikeCurveOf('pincer')).toBe('thrust');
        expect(strikeCurveOf(undefined)).toBe('thrust');
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

describe('waveRing', () => {
    // The `wave` kind (§12g.2, the mammoth stomp): `count` rings expanding from
    // the CASTER to the skill's reach, staggered across the first half of `ms`.
    // `radius` is a share of the reach, so one set of numbers drives a stomp at
    // 90 px and one at 400.
    const TOTAL = 600;

    it('starts the first ring at the caster and grows it to the reach', () => {
        const start = waveRing(0, 1, 0, TOTAL);
        expect(start.radius).toBeCloseTo(0);
        expect(start.alpha).toBeCloseTo(1);
        expect(start.visible).toBe(true);
        expect(waveRing(0, 1, TOTAL * 0.999, TOTAL).radius).toBeCloseTo(1, 2);
    });

    it('expands monotonically and fades while it does', () => {
        let radius = -1;
        let alpha = 2;
        for (let i = 0; i <= 20; i++) {
            const ring = waveRing(0, 1, (TOTAL * i) / 20, TOTAL);
            expect(ring.radius).toBeGreaterThanOrEqual(radius);
            expect(ring.alpha).toBeLessThanOrEqual(alpha + 1e-9);
            radius = ring.radius;
            alpha = ring.alpha;
        }
        expect(alpha).toBeCloseTo(0, 2);
    });

    it('thins the stroke as the ring grows', () => {
        expect(waveRing(0, 1, TOTAL * 0.9, TOTAL).width)
            .toBeLessThan(waveRing(0, 1, 0, TOTAL).width);
        expect(waveRing(0, 1, TOTAL * 0.9, TOTAL).width).toBeGreaterThan(0);
    });

    it('staggers the later rings across the FIRST HALF, and ends them together', () => {
        // Three rings: the last one starts a third of the way in, and every
        // ring is over at the layer's own `ms` - they travel at one speed.
        expect(waveRing(1, 3, 0, TOTAL).visible).toBe(false);
        expect(waveRing(2, 3, 0, TOTAL).visible).toBe(false);
        expect(waveRing(1, 3, TOTAL / 6, TOTAL).visible).toBe(true);
        expect(waveRing(2, 3, TOTAL / 3, TOTAL).visible).toBe(true);
        // ONE SPEED: ring 2, a third of a total behind ring 0, is exactly where
        // ring 0 was a third of a total earlier. Rings chase, they never catch.
        expect(waveRing(2, 3, TOTAL / 3 + 100, TOTAL).radius)
            .toBeCloseTo(waveRing(0, 3, 100, TOTAL).radius, 6);
        expect(waveRing(2, 3, TOTAL * 0.999, TOTAL).radius).toBeCloseTo(1, 2);
    });

    it('gives a single ring the whole of the layer, not half of it', () => {
        // The stagger span is a share of `ms`, so one ring spends all of it.
        expect(waveRing(0, 1, TOTAL * 0.6, TOTAL).visible).toBe(true);
        expect(waveRing(0, 1, TOTAL * 0.95, TOTAL).radius).toBeLessThan(1);
        expect(waveRing(0, 1, TOTAL * 0.95, TOTAL).visible).toBe(true);
    });

    it('is invisible past the end rather than drawing a frozen ring', () => {
        expect(waveRing(0, 1, TOTAL, TOTAL).visible).toBe(false);
        expect(waveRing(0, 3, TOTAL * 2, TOTAL).visible).toBe(false);
    });

    it('takes the default total for a zero ms and survives a zero count', () => {
        expect(waveRing(0, 1, 100, 0)).toEqual(waveRing(0, 1, 100, WAVE_DEFAULT_MS));
        expect(Number.isFinite(waveRing(0, 0, 100, TOTAL).radius)).toBe(true);
    });
});

describe('waveCountOf / waveTotalMsOf', () => {
    it('draws one ring when the layer authors no count, and caps at the maximum', () => {
        expect(waveCountOf(undefined)).toBe(1);
        expect(waveCountOf(2)).toBe(2);
        expect(waveCountOf(99)).toBe(WAVE_MAX_COUNT);
        expect(waveCountOf(0)).toBe(1);
        expect(waveCountOf(-4)).toBe(1);
        expect(waveCountOf(2.4)).toBe(2);
    });

    it('takes the authored ms over the default', () => {
        expect(waveTotalMsOf(undefined)).toBe(WAVE_DEFAULT_MS);
        expect(waveTotalMsOf(0)).toBe(WAVE_DEFAULT_MS);
        expect(waveTotalMsOf(900)).toBe(900);
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

// --- sizing an ART body (C3a, §12f.4 D) -------------------------------------
//
// A placeholder is drawn at the size it wants and sits at scale 1; a PNG is
// drawn at whatever size the artist chose, so every sprite branch needs one of
// these three factors. They are the whole of what C3a adds to the arithmetic.

describe('spriteScaleToExtent', () => {
    it('makes a texture exactly as long as the reach it is handed', () => {
        expect(spriteScaleToExtent(64, 192)).toBe(3);
        expect(spriteScaleToExtent(200, 50)).toBe(0.25);
    });

    it('is UNIFORM: one factor, so the caller cannot flatten a sword', () => {
        // §12f.2: a weapon scales uniformly, only a beam stretches. The proof
        // is that this answers a scalar and never a pair.
        expect(typeof spriteScaleToExtent(64, 192)).toBe('number');
    });

    it('answers 1 for an unmeasured texture, so a body still draws', () => {
        expect(spriteScaleToExtent(0, 192)).toBe(1);
        expect(spriteScaleToExtent(NaN, 192)).toBe(1);
    });

    it('answers 1 for a nonsense extent rather than collapsing the body', () => {
        expect(spriteScaleToExtent(64, 0)).toBe(1);
        expect(spriteScaleToExtent(64, -10)).toBe(1);
        expect(spriteScaleToExtent(64, NaN)).toBe(1);
    });
});

describe('beamSpriteScale', () => {
    it('stretches along the span and holds the authored width across it', () => {
        const s = beamSpriteScale(32, 8, 320, 4);
        expect(s.x).toBe(10);
        expect(s.y).toBe(0.5);
    });

    it('is the ONE kind allowed to distort: x and y move independently', () => {
        const near = beamSpriteScale(32, 8, 64, 4);
        const far = beamSpriteScale(32, 8, 640, 4);
        expect(far.x).toBeGreaterThan(near.x);
        expect(far.y).toBe(near.y);
    });

    it('draws NOTHING at a zero span, rather than a full-width texture', () => {
        // The first frame of an `extend` has extent 0. Falling back to "own
        // size" there - right for a reach that was authored wrong - would pop
        // the whole body onto the caster for one frame and then collapse it.
        expect(beamSpriteScale(32, 8, 0, 4).x).toBe(0);
        expect(beamSpriteScale(32, 8, -10, 4).x).toBe(0);
    });

    it('degrades to 1 on an unmeasured texture in either axis', () => {
        expect(beamSpriteScale(0, 0, 320, 4)).toEqual({x: 1, y: 1});
    });
});

describe('landsOnVictim (which end a layer anchors at)', () => {
    it('anchors a hit and an application on the victim (§12h: applied anchors like hit)', () => {
        expect(landsOnVictim('hit')).toBe(true);
        expect(landsOnVictim('applied')).toBe(true);
    });

    it('anchors a cast and an ambient layer on the caster', () => {
        expect(landsOnVictim('fired')).toBe(false);
        expect(landsOnVictim('ambient')).toBe(false);
    });
});

// plan-natural-weapons.md §3.1: the attacker's own token jabs at its victim
// and snaps back. The share is what the manager multiplies the distance by, so
// its two ends must be EXACT zero (§10 L2: a body left a hair off its collider
// is a stuck offset), and its peak exactly 1 at the contact moment.
describe('the lunge (plan-natural-weapons.md §3.1)', () => {
    it('lasts the authored ms, else the default', () => {
        expect(lungeTotalMsOf(300)).toBe(300);
        expect(lungeTotalMsOf(undefined)).toBe(LUNGE_DEFAULT_MS);
        expect(lungeTotalMsOf(0)).toBe(LUNGE_DEFAULT_MS);
        expect(lungeTotalMsOf(-5)).toBe(LUNGE_DEFAULT_MS);
    });

    it('makes contact at the end of the out phase: 77 ms at the default', () => {
        expect(lungeContactMsOf(undefined)).toBeCloseTo(77, 9);
        expect(lungeContactMsOf(undefined)).toBe(LUNGE_DEFAULT_MS * LUNGE_OUT_FRACTION);
        expect(lungeContactMsOf(400)).toBe(400 * LUNGE_OUT_FRACTION);
    });

    it('jabs a share of the attacker\'s own radius, times the layer scale', () => {
        expect(lungeDistancePx(36, undefined)).toBeCloseTo(36 * LUNGE_DISTANCE_FACTOR, 9);
        expect(lungeDistancePx(36, 1.6)).toBeCloseTo(36 * LUNGE_DISTANCE_FACTOR * 1.6, 9);
        // An unauthored or nonsense scale is 1, like every other kind's.
        expect(lungeDistancePx(36, 0)).toBe(lungeDistancePx(36, undefined));
        expect(lungeDistancePx(36, -2)).toBe(lungeDistancePx(36, undefined));
    });

    it('never jabs a negative or non-finite distance', () => {
        expect(lungeDistancePx(0, 1)).toBe(0);
        expect(lungeDistancePx(-10, 1)).toBe(0);
        expect(lungeDistancePx(NaN, 1)).toBe(0);
    });

    it('sits at EXACT zero at both ends', () => {
        const total = LUNGE_DEFAULT_MS;
        expect(lungeShare(0, total)).toBe(0);
        expect(lungeShare(-50, total)).toBe(0);
        expect(lungeShare(total, total)).toBe(0);
        expect(lungeShare(total + 1, total)).toBe(0);
    });

    it('peaks at exactly 1 at the contact moment', () => {
        for (const total of [LUNGE_DEFAULT_MS, 180, 333, 1_000]) {
            expect(lungeShare(lungeContactMsOf(total), total), `total ${total}`).toBe(1);
        }
    });

    it('rises monotonically before contact and falls monotonically after', () => {
        const total = LUNGE_DEFAULT_MS;
        const contact = lungeContactMsOf(total);
        let previous = lungeShare(0, total);
        for (let t = 1; t <= contact; t++) {
            const share = lungeShare(t, total);
            expect(share, `out ${t}`).toBeGreaterThanOrEqual(previous);
            previous = share;
        }
        previous = 1;
        for (let t = Math.ceil(contact); t <= total; t++) {
            const share = lungeShare(t, total);
            expect(share, `back ${t}`).toBeLessThanOrEqual(previous);
            expect(share).toBeGreaterThanOrEqual(0);
            previous = share;
        }
    });

    it('goes out faster than it comes back (an ease-out jab, an ease-in-out return)', () => {
        const total = LUNGE_DEFAULT_MS;
        const contact = lungeContactMsOf(total);
        // Halfway through the out phase the body is well past half way.
        expect(lungeShare(contact / 2, total)).toBeGreaterThan(0.5);
        // Halfway through the return it is exactly half way (the symmetric ease).
        expect(lungeShare(contact + (total - contact) / 2, total)).toBeCloseTo(0.5, 9);
    });

    it('answers 0, never NaN, for a degenerate total or a non-finite time', () => {
        expect(lungeShare(10, 0)).toBe(0);
        expect(lungeShare(10, -100)).toBe(0);
        expect(lungeShare(NaN, LUNGE_DEFAULT_MS)).toBe(0);
        expect(lungeShare(10, NaN)).toBe(0);
    });
});

// plan-natural-weapons.md §3.3 (C2): the natural weapon's mark ON the victim.
// Every part is in units of the mark's size and relative to the victim's
// centre, and ⭐ SCREEN-ALIGNED (D10, PO 2026-09-28): no phase function takes
// an attacker, so nothing here can turn toward the attack line. The lunge
// alone says who struck.
describe('the maul (plan-natural-weapons.md §3.3)', () => {
    const CURVES: MaulCurve[] = ['bite', 'pincer', 'gore', 'claw', 'kick'];

    const samples = (curve: MaulCurve, count = 40): MaulPhase[] => {
        const total = MAUL_CURVE_MS[curve];
        return Array.from({length: count}, (_, i) => maulPhase(curve, (total * i) / count, total));
    };

    it('reads the curve, absent or unknown = bite', () => {
        for (const curve of CURVES) {
            expect(maulCurveOf(curve)).toBe(curve);
        }
        expect(maulCurveOf(undefined)).toBe('bite');
        expect(maulCurveOf('thrust')).toBe('bite');
    });

    it('lasts the authored ms, else the curve\'s default', () => {
        expect(maulTotalMsOf('claw', 400)).toBe(400);
        expect(maulTotalMsOf('claw', undefined)).toBe(MAUL_CURVE_MS.claw);
        expect(maulTotalMsOf('claw', 0)).toBe(MAUL_CURVE_MS.claw);
        expect(maulTotalMsOf(undefined, undefined)).toBe(MAUL_CURVE_MS.bite);
    });

    it('is sized to the VICTIM times the layer scale, with a floor', () => {
        expect(maulSizePx(40, undefined)).toBe(40);
        expect(maulSizePx(40, 1.5)).toBe(60);
        expect(maulSizePx(0, undefined)).toBe(MAUL_MIN_SIZE_PX);
        expect(maulSizePx(NaN, 2)).toBe(MAUL_MIN_SIZE_PX * 2);
    });

    it('sizes the wolf\'s teeth on a player to the player, never to the wolf\'s reach', () => {
        // Graphics.ts PLAYER_COLLIDER_RADIUS_METERS, 0.25 u; the rim bite's
        // lesson ("a crocodile attack") is that the reach is the wrong ruler.
        const playerRadiusPx = meter2px(0.25);
        const reachPx = meter2px(wolfBite.effects[0].radius);
        expect(maulSizePx(playerRadiusPx, undefined)).toBe(playerRadiusPx);
        expect(maulSizePx(playerRadiusPx, undefined)).toBeLessThan(reachPx);
    });

    it('draws the part count of its curve, every frame, all finite', () => {
        for (const curve of CURVES) {
            for (const phase of samples(curve)) {
                expect(phase.parts).toHaveLength(MAUL_PARTS[curve]);
                for (const part of phase.parts) {
                    for (const v of [part.x, part.y, part.rotation, part.stretch, part.scale, part.alpha]) {
                        expect(Number.isFinite(v)).toBe(true);
                    }
                    expect(part.alpha).toBeGreaterThanOrEqual(0);
                    expect(part.alpha).toBeLessThanOrEqual(1);
                }
            }
            expect(MAUL_PART_LENGTH[curve]).toBeGreaterThan(0);
        }
    });

    it('is done at its total and past it, and not a moment before', () => {
        for (const curve of CURVES) {
            const total = MAUL_CURVE_MS[curve];
            expect(maulPhase(curve, total, total).done).toBe(true);
            expect(maulPhase(curve, 10_000, total).done).toBe(true);
            expect(maulPhase(curve, total * 0.999, total).done).toBe(false);
        }
    });

    it('takes the default total for a zero ms, and is deterministic', () => {
        for (const curve of CURVES) {
            expect(maulPhase(curve, 50, 0)).toEqual(maulPhase(curve, 50, MAUL_CURVE_MS[curve]));
            expect(maulPhase(curve, 77, 300)).toEqual(maulPhase(curve, 77, 300));
        }
    });

    it('dispatches each curve to its own phase function', () => {
        expect(maulPhase('bite', 40, 180)).toEqual(bitePhase(40, 180));
        expect(maulPhase('pincer', 40, 180)).toEqual(pincerPhase(40, 180));
        expect(maulPhase('gore', 40, 180)).toEqual(gorePhase(40, 180));
        expect(maulPhase('claw', 40, 180)).toEqual(clawPhase(40, 180));
        expect(maulPhase('kick', 40, 180)).toEqual(kickPhase(40, 180));
    });

    it('holds full alpha early and fades out before it ends', () => {
        for (const curve of CURVES) {
            const total = MAUL_CURVE_MS[curve];
            const late = maulPhase(curve, total * 0.97, total).parts;
            late.forEach(part => expect(part.alpha).toBeLessThan(0.2));
        }
    });
});

describe('bitePhase (D11: two front-view rows of teeth, biting down)', () => {
    const total = MAUL_CURVE_MS.bite;

    it('puts the UPPER row above the centre and the MIRRORED lower row below it', () => {
        const [upper, lower] = bitePhase(0, total).parts;
        expect(upper.y).toBeCloseTo(-BITE_OPEN_GAP);
        expect(lower.y).toBeCloseTo(BITE_OPEN_GAP);
        expect(upper.mirrored).toBe(false);
        expect(lower.mirrored).toBe(true);
    });

    it('is screen-aligned: both rows centred on x, never turned', () => {
        for (let i = 0; i <= 20; i++) {
            for (const part of bitePhase((total * i) / 20, total).parts) {
                expect(part.x).toBe(0);
                expect(part.rotation).toBe(0);
                expect(part.stretch).toBe(1);
            }
        }
    });

    it('closes the rows onto the centre in the first half, and stays shut', () => {
        const shut = bitePhase(total * 0.5, total).parts;
        expect(shut[0].y).toBeCloseTo(0);
        expect(shut[1].y).toBeCloseTo(0);
        expect(bitePhase(total * 0.8, total).parts[0].y).toBeCloseTo(0);
        let previous = BITE_OPEN_GAP + 1;
        for (let i = 0; i <= 20; i++) {
            const gap = -bitePhase((total * 0.5 * i) / 20, total).parts[0].y;
            expect(gap).toBeLessThanOrEqual(previous + 1e-12);
            previous = gap;
        }
    });

    it('snaps from a little larger down to its own size as it closes (the first bite)', () => {
        expect(bitePhase(0, total).parts[0].scale).toBeCloseTo(BITE_OPEN_SCALE);
        expect(BITE_OPEN_SCALE).toBeGreaterThan(1);
        expect(bitePhase(total * 0.5, total).parts[0].scale).toBeCloseTo(1);
    });

    it('holds shut at full alpha, then fades', () => {
        expect(bitePhase(total * 0.5, total).parts[0].alpha).toBe(1);
        expect(bitePhase(total * 0.75, total).parts[0].alpha).toBeLessThan(1);
        expect(bitePhase(total * 0.75, total).parts[0].alpha).toBeGreaterThan(0);
    });
});

describe('pincerPhase (the spider\'s fangs, on a fixed frame under D10)', () => {
    const total = MAUL_CURVE_MS.pincer;

    it('hinges one fang on the victim\'s rim at screen LEFT and one at screen RIGHT', () => {
        const [left, right] = pincerPhase(0, total).parts;
        expect({x: left.x, y: left.y}).toEqual({x: -1, y: 0});
        expect({x: right.x, y: right.y}).toEqual({x: 1, y: 0});
        expect(left.mirrored).toBe(false);
        expect(right.mirrored).toBe(true);
        expect(MAUL_PART_LENGTH.pincer).toBe(1);
    });

    it('gapes both fangs toward the TOP of the screen', () => {
        const [left, right] = pincerPhase(0, total).parts;
        // A fang points along its rotation; up is −y on screen.
        expect(Math.sin(left.rotation)).toBeCloseTo(-Math.sin(PINCER_OPEN_RAD));
        expect(Math.sin(right.rotation)).toBeCloseTo(-Math.sin(PINCER_OPEN_RAD));
        // ...and inward: the left fang leans right, the right one left.
        expect(Math.cos(left.rotation)).toBeGreaterThan(0);
        expect(Math.cos(right.rotation)).toBeLessThan(0);
    });

    it('is mirror-symmetric about the vertical through the centre, every frame', () => {
        for (let i = 0; i < 20; i++) {
            const [left, right] = pincerPhase((total * i) / 20, total).parts;
            expect(right.x).toBeCloseTo(-left.x);
            expect(Math.cos(right.rotation)).toBeCloseTo(-Math.cos(left.rotation));
            expect(Math.sin(right.rotation)).toBeCloseTo(Math.sin(left.rotation));
        }
    });

    it('swings down until the two tips meet at the centre, then holds', () => {
        const [left, right] = pincerPhase(total * 0.5, total).parts;
        const tip = (p: typeof left) => ({
            x: p.x + Math.cos(p.rotation) * MAUL_PART_LENGTH.pincer,
            y: p.y + Math.sin(p.rotation) * MAUL_PART_LENGTH.pincer,
        });
        expect(tip(left).x).toBeCloseTo(0);
        expect(tip(left).y).toBeCloseTo(0);
        expect(tip(right).x).toBeCloseTo(0);
        expect(tip(right).y).toBeCloseTo(0);
        expect(pincerPhase(total * 0.7, total).parts[0].rotation).toBeCloseTo(0);
    });

    it('hangs open, then SLAMS shut (ease-in, the shipped pincer\'s motion)', () => {
        const opening = (t: number) => -pincerPhase(t, total).parts[0].rotation;
        expect(opening(total * 0.25)).toBeGreaterThan(PINCER_OPEN_RAD / 2);
    });
});

describe('gorePhase (two tusk gashes, side by side)', () => {
    const total = MAUL_CURVE_MS.gore;

    it('lays both gashes on the same fixed diagonal, parallel', () => {
        for (let i = 0; i < 10; i++) {
            const [a, b] = gorePhase((total * i) / 10, total).parts;
            expect(a.rotation).toBe(GORE_ANGLE_RAD);
            expect(b.rotation).toBe(GORE_ANGLE_RAD);
        }
    });

    it('centres the pair on the victim, one gash either side of the centre', () => {
        const [a, b] = gorePhase(total * 0.5, total).parts;
        const half = MAUL_PART_LENGTH.gore / 2;
        const mid = (p: typeof a) => ({
            x: p.x + Math.cos(p.rotation) * half,
            y: p.y + Math.sin(p.rotation) * half,
        });
        expect(mid(a).x + mid(b).x).toBeCloseTo(0);
        expect(mid(a).y + mid(b).y).toBeCloseTo(0);
        expect(Math.hypot(mid(a).x - mid(b).x, mid(a).y - mid(b).y)).toBeGreaterThan(0.1);
    });

    it('drives both in from nothing to full length, then holds', () => {
        const start = gorePhase(0, total).parts;
        expect(start[0].stretch).toBe(0);
        expect(start[1].stretch).toBe(0);
        const driven = gorePhase(total * 0.5, total).parts;
        expect(driven[0].stretch).toBeCloseTo(1);
        expect(driven[1].stretch).toBeCloseTo(1);
        let previous = -1;
        for (let i = 0; i <= 20; i++) {
            const stretch = gorePhase((total * 0.5 * i) / 20, total).parts[0].stretch;
            expect(stretch).toBeGreaterThanOrEqual(previous);
            previous = stretch;
        }
    });
});

describe('clawPhase (three rakes, one after the other)', () => {
    const total = MAUL_CURVE_MS.claw;

    it('lays all three on the same fixed diagonal, the other one from the gore\'s', () => {
        for (const part of clawPhase(total * 0.5, total).parts) {
            expect(part.rotation).toBe(CLAW_ANGLE_RAD);
        }
        expect(CLAW_ANGLE_RAD).not.toBeCloseTo(GORE_ANGLE_RAD);
    });

    it('rakes them in order: an early frame has the first ahead of the second ahead of the third', () => {
        const [a, b, c] = clawPhase(total * 0.25, total).parts;
        expect(a.stretch).toBeGreaterThan(b.stretch);
        expect(b.stretch).toBeGreaterThan(c.stretch);
    });

    it('hides a rake that has not started, and has all three full before the fade', () => {
        const [, , c] = clawPhase(0, total).parts;
        expect(c.alpha).toBe(0);
        clawPhase(total * 0.6, total).parts.forEach((part) => {
            expect(part.stretch).toBeCloseTo(1);
            expect(part.alpha).toBe(1);
        });
    });

    it('spaces the rakes evenly about the centre', () => {
        const [a, b, c] = clawPhase(total * 0.6, total).parts;
        expect(b.x - a.x).toBeCloseTo(c.x - b.x);
        expect(b.y - a.y).toBeCloseTo(c.y - b.y);
        const half = MAUL_PART_LENGTH.claw / 2;
        expect(b.x + Math.cos(b.rotation) * half).toBeCloseTo(0);
        expect(b.y + Math.sin(b.rotation) * half).toBeCloseTo(0);
    });
});

describe('kickPhase (a hoof print punched in)', () => {
    const total = MAUL_CURVE_MS.kick;

    it('is one upright print on the centre', () => {
        for (let i = 0; i <= 10; i++) {
            const [hoof] = kickPhase((total * i) / 10, total).parts;
            expect({x: hoof.x, y: hoof.y, rotation: hoof.rotation}).toEqual({x: 0, y: 0, rotation: 0});
        }
    });

    it('pops in large and settles to its own size', () => {
        expect(kickPhase(0, total).parts[0].scale).toBeCloseTo(KICK_POP_SCALE);
        expect(KICK_POP_SCALE).toBeGreaterThan(1);
        expect(kickPhase(total * 0.4, total).parts[0].scale).toBeCloseTo(1);
        expect(kickPhase(total * 0.4, total).parts[0].alpha).toBe(1);
    });
});

// plan-effect-types-round-2.md C3: the rush. The body starts back where the
// entity jumped from and catches up with it; the share is how much of that
// jump is still to cover.
describe('rushShare', () => {
    it('is EXACT at both ends: the whole jump at the start, nothing at the end', () => {
        expect(rushShare(0, 180)).toBe(1);
        expect(rushShare(180, 180)).toBe(0);
        expect(rushShare(500, 180)).toBe(0);
    });

    it('falls steadily, fastest at the start (an ease-out)', () => {
        let prev = 1;
        for (let t = 10; t < 180; t += 10) {
            const share = rushShare(t, 180);
            expect(share).toBeLessThan(prev);
            prev = share;
        }
        expect(rushShare(90, 180)).toBeLessThan(0.5);
    });

    it('never answers NaN', () => {
        expect(rushShare(NaN, 180)).toBe(0);
        expect(rushShare(10, 0)).toBe(0);
    });

    it('defaults the duration when none is authored', () => {
        expect(rushTotalMsOf(undefined)).toBe(RUSH_DEFAULT_MS);
        expect(rushTotalMsOf(250)).toBe(250);
    });
});
