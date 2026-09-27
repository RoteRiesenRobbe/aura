import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Container} from 'pixi.js';
import {readFileSync} from 'fs';
import {
    buildPreviewDefinition,
    fitScale,
    GALLERY_LAYERS,
    isTrustedOrigin,
    parsePreviewMessage,
    PREVIEW_GAP_MS,
    PREVIEW_SKILL_ID,
    previewCycleMs,
    previewDistancePx,
    PreviewMessage,
} from './SkillFxPreview';
import {VISUAL_KINDS} from './SkillFxKinds';
import {eventLifetimeMs} from './SkillFxStress';
import {skillFxColor} from './SkillFxPalette';
import {flightMs, lungeContactMsOf, lungeTotalMsOf} from './SkillFxMath';
import {PrerenderEvent} from '../../core/logic/Events';
import {registerSkillDefinition, skillDefinition, skillDisplayNameFor, SkillDefinition, VisualLayer} from '../../../client-data/Skills';
import {counters, forgetVisual, onSnapshot, reset, setup} from './SkillFx';
import {AuraApi} from '../../backend/logic/AuraApi';
import type {GameObject} from '../../game-objects/logic/_GameObject';

/**
 * The dev-only live VFX preview (plan-skill-vfx.md §12f.7.4): everything the
 * page decides without Pixi, plus the two seams it needs in the client
 * (`registerSkillDefinition`, `forgetVisual`) driven through the real manager.
 */
const vocabulary = JSON.parse(readFileSync('../api/skill-vocabulary.json', 'utf-8'));

function message(overrides: Partial<PreviewMessage> = {}): PreviewMessage {
    return {
        visual: {layers: [
            {kind: 'strike', on: 'hit', curve: 'thrust'},
            {kind: 'wave', on: 'fired'},
        ]},
        layerIndex: 1,
        category: 'active_aura',
        paletteTag: 'fire',
        reachUnits: 2.5,
        ...overrides,
    };
}

describe('buildPreviewDefinition', () => {
    it('makes the chosen layer the ONLY layer', () => {
        const def = buildPreviewDefinition(message({layerIndex: 1}));
        expect(def.visual.layers).toEqual([{kind: 'wave', on: 'fired'}]);
        expect(def.id).toBe(PREVIEW_SKILL_ID);
    });

    it('turns the palette tag into damage.tags, which the palette reads', () => {
        const def = buildPreviewDefinition(message({paletteTag: 'frost'}));
        expect(def.effects[0].damage.tags).toEqual(['frost']);
        expect(skillFxColor(def, undefined)).toBe(skillFxColor(
            {effects: [{damage: {tags: ['frost']}}]} as unknown as SkillDefinition, undefined));
    });

    it('carries no damage payload for a null tag, and forges no tint', () => {
        const def = buildPreviewDefinition(message({paletteTag: null}));
        expect(def.effects[0].damage).toBeUndefined();
        expect(def.visual.layers[0].tint).toBeUndefined();
    });

    it('turns the reach into the effect radius the planner reads', () => {
        const def = buildPreviewDefinition(message({reachUnits: 3.25}));
        expect(def.effects).toHaveLength(1);
        expect(def.effects[0].radius).toBe(3.25);
    });

    it('normalises the file category to the client one, a draft to aura', () => {
        expect(buildPreviewDefinition(message({category: 'active_aura'})).category).toBe('aura');
        expect(buildPreviewDefinition(message({category: 'cooldown'})).category).toBe('cooldown');
        expect(buildPreviewDefinition(message({category: 'passive'})).category).toBe('passive');
        expect(buildPreviewDefinition(message({category: 'aura'})).category).toBe('aura');
        expect(buildPreviewDefinition(message({category: null})).category).toBe('aura');
    });

    it('takes another id for the gallery slots', () => {
        expect(buildPreviewDefinition(message(), PREVIEW_SKILL_ID + 3).id).toBe(PREVIEW_SKILL_ID + 3);
    });
});

describe('previewCycleMs', () => {
    const dist = 240;
    it('is every kind\'s own life, as the C4 helper prices it, plus the gap', () => {
        for (const kind of VISUAL_KINDS) {
            const layer = GALLERY_LAYERS[kind];
            expect(previewCycleMs(layer, dist), kind).toBe(
                eventLifetimeMs([layer], dist, layer.on === 'hit') + PREVIEW_GAP_MS);
        }
    });

    it('counts the engine\'s hit mark on a hit, and not on a cast or an application', () => {
        const strike: VisualLayer = {kind: 'strike', on: 'hit', curve: 'thrust'};
        const applied: VisualLayer = {...strike, on: 'applied'};
        expect(previewCycleMs(strike, dist)).toBeGreaterThan(previewCycleMs(applied, dist));
        expect(previewCycleMs(applied, dist)).toBe(eventLifetimeMs([applied], dist, false) + PREVIEW_GAP_MS);
    });

    it('prices a bolt by its flight, so a longer reach loops longer', () => {
        const bolt: VisualLayer = {kind: 'projectile', on: 'applied', speed: 500};
        const longer = previewCycleMs(bolt, 480) - previewCycleMs(bolt, 240);
        expect(longer).toBeGreaterThan(0);
        expect(longer).toBe(flightMs(480, 500) - flightMs(240, 500));
    });

    it('does not loop an ambient layer', () => {
        expect(previewCycleMs({kind: 'emitter', on: 'ambient'}, dist)).toBe(0);
    });
});

describe('previewDistancePx', () => {
    it('is the reach in px, clamped to [1 u, 4 u]', () => {
        expect(previewDistancePx(2)).toBe(240);
        expect(previewDistancePx(0)).toBe(120);
        expect(previewDistancePx(0.4)).toBe(120);
        expect(previewDistancePx(9)).toBe(480);
        expect(previewDistancePx(NaN)).toBe(120);
    });
});

describe('fitScale', () => {
    it('fits a square of reach + pad around the caster into the short side', () => {
        // (120 + 38) * 2 = 316 world px into a 240 px tall canvas
        expect(fitScale(120, 480, 240)).toBeCloseTo(240 / 316, 6);
        expect(fitScale(120, 200, 800)).toBeCloseTo(200 / 316, 6);
    });

    it('shrinks as the reach grows', () => {
        expect(fitScale(480, 480, 240)).toBeLessThan(fitScale(240, 480, 240));
    });

    it('answers 1 for a degenerate input', () => {
        expect(fitScale(0, 480, 240)).toBe(1);
        expect(fitScale(120, 0, 240)).toBe(1);
        expect(fitScale(NaN, 480, 240)).toBe(1);
    });
});

describe('isTrustedOrigin', () => {
    it('accepts a dev origin on any port', () => {
        expect(isTrustedOrigin('http://localhost:4610')).toBe(true);
        expect(isTrustedOrigin('http://127.0.0.1:4610')).toBe(true);
        expect(isTrustedOrigin('http://localhost')).toBe(true);
    });

    it('refuses everything else', () => {
        expect(isTrustedOrigin('null')).toBe(false); // a data: page
        expect(isTrustedOrigin('https://localhost:4610')).toBe(false);
        expect(isTrustedOrigin('http://localhost.evil.com')).toBe(false);
        expect(isTrustedOrigin('http://evil.com')).toBe(false);
        expect(isTrustedOrigin('http://192.168.1.5:4610')).toBe(false);
        expect(isTrustedOrigin('')).toBe(false);
    });
});

describe('GALLERY_LAYERS', () => {
    it('names every kind in VISUAL_KINDS exactly once (an eighth kind reddens this)', () => {
        expect(Object.keys(GALLERY_LAYERS).sort()).toEqual([...VISUAL_KINDS].sort());
        for (const kind of VISUAL_KINDS) {
            expect(GALLERY_LAYERS[kind].kind).toBe(kind);
        }
    });

    it('plays every layer on a moment its kind allows, and never on ambient', () => {
        for (const kind of VISUAL_KINDS) {
            const layer = GALLERY_LAYERS[kind];
            expect(vocabulary.visualTriggersByKind[kind], kind).toContain(layer.on);
            expect(layer.on).not.toBe('ambient');
        }
    });
});

describe('parsePreviewMessage', () => {
    const wire = {type: 'aura-fx-preview', ...message()};

    it('accepts the protocol message', () => {
        expect(parsePreviewMessage(wire)).toEqual(message());
    });

    it('accepts every moment the vocabulary names', () => {
        for (const on of vocabulary.visualTriggers) {
            expect(parsePreviewMessage({...wire, layerIndex: 0,
                visual: {layers: [{kind: 'emitter', on}]}}), on).not.toBeNull();
        }
    });

    it('reads an empty tag and a missing category as none', () => {
        const parsed = parsePreviewMessage({...wire, paletteTag: '', category: undefined});
        expect(parsed.paletteTag).toBeNull();
        expect(parsed.category).toBeNull();
    });

    it('refuses anything malformed, the preview\'s own ready message included', () => {
        const bad: unknown[] = [
            null, undefined, 'aura-fx-preview', 42, [],
            {type: 'aura-fx-preview-ready'},
            {...wire, type: 'something-else'},
            {...wire, visual: null},
            {...wire, visual: {layers: 'no'}},
            {...wire, layerIndex: 2},
            {...wire, layerIndex: -1},
            {...wire, layerIndex: 0.5},
            {...wire, layerIndex: '1'},
            {...wire, layerIndex: 0, visual: {layers: [{kind: 'impact', on: 'hit'}]}},
            {...wire, layerIndex: 0, visual: {layers: [{kind: 'strike', on: 'tick'}]}},
            {...wire, layerIndex: 0, visual: {layers: [null]}},
            {...wire, reachUnits: '2'},
            {...wire, reachUnits: Infinity},
        ];
        bad.forEach((data, i) => expect(parsePreviewMessage(data), `case ${i}`).toBeNull());
    });
});

/**
 * The two seams, through the REAL manager (the C4 posture): register a skill,
 * feed one event, read the per-kind counter; re-register the same id with
 * another layer and see the new kind only after `forgetVisual`.
 */
describe('registerSkillDefinition + forgetVisual', () => {
    const stub = (id: number): GameObject => ({
        id, size: 26,
        shape: {position: {x: id, y: 0}, destroyed: false, parent: {}},
    }) as unknown as GameObject;
    const caster = stub(1);
    const fired = [{
        source: 1, victim: 0, skillId: PREVIEW_SKILL_ID, amount: 1,
        kind: AuraApi.HitKind.Damage, fired: true, phase: AuraApi.HitPhase.Direct,
    }];
    const feed = () => onSnapshot(fired, id => id === 1 ? caster : undefined);
    const withLayer = (layer: VisualLayer) => buildPreviewDefinition(message({
        visual: {layers: [layer]}, layerIndex: 0,
    }));

    it('draws the registered layer, and a re-registered one after forgetVisual', () => {
        setup(new Container());
        reset();
        registerSkillDefinition(withLayer({kind: 'wave', on: 'fired'}));
        expect(skillDefinition(PREVIEW_SKILL_ID).visual.layers[0].kind).toBe('wave');

        const before = counters().spawnedByKind;
        feed();
        const afterWave = counters().spawnedByKind;
        expect(afterWave.wave - before.wave).toBe(1);

        // Re-registered under the SAME id: the page-life cache still answers
        // the old look until it is told to forget.
        registerSkillDefinition(withLayer({kind: 'orbit', on: 'fired'}));
        feed();
        const stale = counters().spawnedByKind;
        expect(stale.wave - afterWave.wave).toBe(1);
        expect(stale.orbit - afterWave.orbit).toBe(0);

        forgetVisual(PREVIEW_SKILL_ID);
        feed();
        const fresh = counters().spawnedByKind;
        expect(fresh.orbit - stale.orbit).toBe(1);
        expect(fresh.wave - stale.wave).toBe(0);
        reset();
    });

    it('keeps the by-name index in step on a rename under one id', () => {
        registerSkillDefinition({...withLayer({kind: 'wave', on: 'fired'}), id: PREVIEW_SKILL_ID + 50, name: 'PreviewA'});
        registerSkillDefinition({...withLayer({kind: 'wave', on: 'fired'}), id: PREVIEW_SKILL_ID + 50, name: 'PreviewB'});
        expect(skillDefinition(PREVIEW_SKILL_ID + 50).name).toBe('PreviewB');
        expect(skillDisplayNameFor('PreviewB')).toBe('VFX preview');
        // the stale name falls back to itself, as an unknown name does
        expect(skillDisplayNameFor('PreviewA')).toBe('PreviewA');
    });
});

/**
 * The lunge through the REAL manager (plan-natural-weapons.md §3.2), on a stub
 * with a `setBodyOffset` of its own, which is exactly how the preview page
 * shows it (§10 L10). Every one of the four reset paths must leave the body at
 * EXACT zero (§10 L2); the frame clock is `performance.now()`, driven here by
 * hand and advanced by triggering the frame event the manager listens on.
 */
describe('the lunge through the manager', () => {
    const LUNGE_ID = PREVIEW_SKILL_ID + 60;
    const CASTER = 71;
    const VICTIM = 72;

    interface LungeStub {
        id: number;
        size: number;
        shape: { position: { x: number, y: number }, destroyed: boolean, parent: object };
        offsets: { x: number, y: number }[];
        setBodyOffset(x: number, y: number): void;
    }

    function stub(id: number, x: number): LungeStub {
        const s: LungeStub = {
            id, size: 30, offsets: [],
            shape: {position: {x, y: 0}, destroyed: false, parent: {}},
            setBodyOffset: (dx, dy) => s.offsets.push({x: dx, y: dy}),
        };
        return s;
    }

    let clock = 10_000;
    beforeEach(() => {
        vi.spyOn(performance, 'now').mockImplementation(() => clock);
        setup(new Container());
        registerSkillDefinition(buildPreviewDefinition(message({
            visual: {layers: [{kind: 'lunge', on: 'hit'}]}, layerIndex: 0,
        }), LUNGE_ID));
        reset();
    });
    afterEach(() => {
        reset();
        vi.restoreAllMocks();
    });

    function world() {
        const caster = stub(CASTER, 0);
        const victim = stub(VICTIM, 100);
        const byId = new Map<number, LungeStub>([[CASTER, caster], [VICTIM, victim]]);
        const bite = () => onSnapshot([{
            source: CASTER, victim: VICTIM, skillId: LUNGE_ID, amount: 1,
            kind: AuraApi.HitKind.Damage, fired: false, phase: AuraApi.HitPhase.Direct,
        }], id => byId.get(id) as unknown as GameObject);
        return {caster, victim, bite};
    }

    function frameAt(ms: number): void {
        clock = ms;
        PrerenderEvent.trigger(16);
    }

    function last(s: LungeStub): { x: number, y: number } {
        return s.offsets[s.offsets.length - 1];
    }

    it('keeps the lunge OUT of the budget, and counts it', () => {
        const {bite} = world();
        const before = counters();
        bite();
        const after = counters();
        expect(after.spawnedByKind.lunge - before.spawnedByKind.lunge).toBe(1);
        expect(after.lunges).toBe(1);
        // Only the engine's hit mark entered `live`.
        expect(after.live - before.live).toBe(1);
    });

    it('jabs the attacker toward the victim, and only the attacker', () => {
        const {caster, victim, bite} = world();
        const start = clock;
        const nudgesBefore = counters().lungeNudges;
        bite();
        frameAt(start + lungeContactMsOf(undefined));
        expect(last(caster).x).toBeGreaterThan(0);
        expect(last(caster).y).toBe(0);
        expect(victim.offsets).toEqual([]);
        expect(counters().lungeNudges).toBeGreaterThan(nudgesBefore);
        // The logical position is never touched.
        expect(caster.shape.position).toEqual({x: 0, y: 0});
    });

    it('reset path 1: the lunge ends, at exact zero', () => {
        const {caster, bite} = world();
        const start = clock;
        bite();
        frameAt(start + lungeContactMsOf(undefined));
        frameAt(start + lungeTotalMsOf(undefined));
        expect(last(caster)).toEqual({x: 0, y: 0});
        expect(counters().lunges).toBe(0);
    });

    it('reset path 2: a new lunge replaces the running one, from zero', () => {
        const {caster, bite} = world();
        const start = clock;
        bite();
        frameAt(start + lungeContactMsOf(undefined));
        expect(last(caster).x).toBeGreaterThan(0);
        bite();
        expect(last(caster)).toEqual({x: 0, y: 0});
        expect(counters().lunges).toBe(1);
    });

    it('reset path 3: the attacker leaves the stage mid-jab', () => {
        const {caster, bite} = world();
        const start = clock;
        bite();
        frameAt(start + lungeContactMsOf(undefined));
        caster.shape.parent = null;
        frameAt(start + lungeContactMsOf(undefined) + 16);
        expect(last(caster)).toEqual({x: 0, y: 0});
        expect(counters().lunges).toBe(0);
    });

    it('reset path 4: the manager\'s reset()', () => {
        const {caster, bite} = world();
        const start = clock;
        bite();
        frameAt(start + lungeContactMsOf(undefined));
        reset();
        expect(last(caster)).toEqual({x: 0, y: 0});
        expect(counters().lunges).toBe(0);
    });
});
