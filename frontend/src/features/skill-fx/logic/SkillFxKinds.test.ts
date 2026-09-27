import {describe, expect, it} from 'vitest';
import {readFileSync} from 'fs';
import {Container} from 'pixi.js';
import {Fx, FxAnchor, HIT_MARK_KIND, KIND_REGISTRY, kindHandler, VISUAL_KINDS} from './SkillFxKinds';
import {lungeContactMsOf, lungeDistancePx, lungeTotalMsOf} from './SkillFxMath';
import {VisualLayer} from '../../../client-data/Skills';

// The registry IS the closed vocabulary (§7.2), so it is pinned against the
// authored fixture in BOTH directions: a kind the content loader accepts but
// the client cannot draw, and a client kind no content can ever name, are both
// failures - and the SharedConstants.test.ts precedent says a one-way pin
// catches only half of them.
//
// vitest runs with cwd = frontend/, the same repo-relative read that file uses.
const vocabulary = JSON.parse(readFileSync('../api/skill-vocabulary.json', 'utf-8'));

describe('the kind registry', () => {
    it('holds exactly the authored visualKinds', () => {
        expect(Object.keys(KIND_REGISTRY).sort()).toEqual([...vocabulary.visualKinds].sort());
    });

    it('lists the same eight names it registers', () => {
        expect([...VISUAL_KINDS].sort()).toEqual(Object.keys(KIND_REGISTRY).sort());
    });

    // C2b filled in the last three (cast-pose, orbit, emitter), so the `stub`
    // flag and its two cases are gone: every registered kind draws. What a kind
    // draws needs Pixi Graphics and a stage, which is the harness's job
    // (.claude/skills/verify/skill-fx.mjs), not a jsdom unit's.
    it('registers a real handler for every one of them', () => {
        for (const kind of VISUAL_KINDS) {
            expect(typeof KIND_REGISTRY[kind].spawn).toBe('function');
        }
    });
});

// §12g.1 call 2: the hit mark is the ENGINE'S. It is drawable, so the manager
// can spawn what the planner emits, but it is OUTSIDE the registry, so the pin
// above cannot see it and no content can name it.
describe('the hit mark', () => {
    it('is not an authorable kind', () => {
        expect(vocabulary.visualKinds).not.toContain(HIT_MARK_KIND);
        expect(KIND_REGISTRY[HIT_MARK_KIND]).toBeUndefined();
    });

    it('still has a handler, answered by name', () => {
        expect(typeof kindHandler(HIT_MARK_KIND)?.spawn).toBe('function');
    });

    it('answers nothing for a name nobody registered', () => {
        expect(kindHandler('snap')).toBeUndefined();
    });
});

// plan-natural-weapons.md §3.1: the lunge draws nothing and moves the
// attacker's own token through the anchor's `nudge`. Everything it does is
// visible in the nudges, so it is pinned here without a stage (§10 L2: every
// end path must leave the body at EXACT zero).
describe('the lunge', () => {
    interface TestAnchor extends FxAnchor {
        at: { x: number, y: number };
        live: boolean;
        nudges: { x: number, y: number }[];
    }

    function anchor(x: number, y: number, radiusPx = 36): TestAnchor {
        const a: TestAnchor = {
            at: {x, y},
            live: true,
            nudges: [],
            radiusPx,
            point: () => a.at,
            alive: () => a.live,
            nudge: (dx, dy) => a.nudges.push({x: dx, y: dy}),
        };
        return a;
    }

    const START = 1_000;

    function spawn(source: FxAnchor, victim: FxAnchor, def: VisualLayer = {kind: 'lunge', on: 'hit'}): Fx {
        return KIND_REGISTRY['lunge'].spawn({
            layer: new Container(), source, victim, color: 0xffffff, def,
            startAtMs: START, seed: 0, density: 'full', reachPx: 0,
        });
    }

    function last(a: TestAnchor): { x: number, y: number } {
        return a.nudges[a.nudges.length - 1];
    }

    it('adds nothing to the layer', () => {
        const layer = new Container();
        KIND_REGISTRY['lunge'].spawn({
            layer, source: anchor(0, 0), victim: anchor(100, 0), color: 0xffffff,
            def: {kind: 'lunge', on: 'hit'}, startAtMs: START, seed: 0, density: 'full', reachPx: 0,
        });
        expect(layer.children).toHaveLength(0);
    });

    it('waits for its start without moving the body', () => {
        const source = anchor(0, 0);
        const fx = spawn(source, anchor(100, 0));
        expect(fx.update(START - 10)).toBe(true);
        expect(source.nudges).toEqual([]);
    });

    it('jabs the full distance along the aim at the contact moment', () => {
        const source = anchor(0, 0, 36);
        const fx = spawn(source, anchor(0, 100));
        expect(fx.update(START + lungeContactMsOf(undefined))).toBe(true);
        expect(last(source).x).toBeCloseTo(0, 9);
        expect(last(source).y).toBeCloseTo(lungeDistancePx(36, undefined), 9);
    });

    it('follows a victim that moves, and scales with the layer', () => {
        const source = anchor(0, 0, 36);
        const victim = anchor(100, 0);
        const fx = spawn(source, victim, {kind: 'lunge', on: 'hit', scale: 1.6});
        victim.at = {x: -100, y: 0};
        fx.update(START + lungeContactMsOf(undefined));
        expect(last(source).x).toBeCloseTo(-lungeDistancePx(36, 1.6), 9);
    });

    it('ends at its total, and when the attacker leaves the stage', () => {
        const fx = spawn(anchor(0, 0), anchor(100, 0), {kind: 'lunge', on: 'hit', ms: 300});
        expect(fx.update(START + lungeTotalMsOf(300) - 1)).toBe(true);
        expect(fx.update(START + lungeTotalMsOf(300))).toBe(false);

        const gone = anchor(0, 0);
        const cut = spawn(gone, anchor(100, 0));
        gone.live = false;
        expect(cut.update(START + 10)).toBe(false);
    });

    it('nudges (0, 0) when attacker and victim stand on one point, never NaN', () => {
        const source = anchor(50, 50);
        const fx = spawn(source, anchor(50, 50));
        fx.update(START + lungeContactMsOf(undefined));
        expect(last(source)).toEqual({x: 0, y: 0});
    });

    it('puts the body back at EXACT zero on dispose, whenever it is cut', () => {
        const source = anchor(0, 0);
        const fx = spawn(source, anchor(100, 0));
        fx.update(START + lungeContactMsOf(undefined));
        expect(last(source).x).toBeGreaterThan(0);
        fx.dispose();
        expect(last(source)).toEqual({x: 0, y: 0});
    });

    it('does not throw on an anchor that cannot move a body', () => {
        const fixed: FxAnchor = {radiusPx: 30, point: () => ({x: 0, y: 0}), alive: () => true};
        const fx = spawn(fixed, anchor(100, 0));
        expect(() => fx.update(START + 50)).not.toThrow();
        expect(() => fx.dispose()).not.toThrow();
    });
});
