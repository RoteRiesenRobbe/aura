import {beforeAll, describe, expect, it, vi} from 'vitest';
import {readdirSync, readFileSync} from 'fs';
import {Container, Texture} from 'pixi.js';

/**
 * plan-vertical-slice.md PF1, F55: who a player can walk through draws above
 * the player (`mobs.npcs`); everybody else stays below. The two halves live in
 * two languages (api/mobs collision layers, the Mobs.ts classes), so this pins
 * the one to the other. Placeholder art stays below whoever wears it:
 * hostile species share the class.
 */
vi.mock('flatbuffers', () => ({}));
vi.mock('../../darkness/logic/DarknessOverlay', () => ({}));
vi.mock('./Medallion', () => ({
    Medallion: class {
        setRing() {}
    },
}));
// The layer is under test, not the art: nothing is fetched.
vi.mock('../../core/logic/Preloading', () => ({
    registerGameObjectSVG: vi.fn(),
    registerPreload: vi.fn(),
    renderPartial: vi.fn(),
    executePreload: vi.fn(),
}));

const PLAYER_STATIC = 1;

const species = readdirSync('../api/mobs')
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(`../api/mobs/${f}`, 'utf-8')));

const walkThroughTalker = (def: any) => def.role !== 'structure'
    && def.entityType !== 'NpcPlaceholder'
    && (def.interaction !== undefined || def.herd !== undefined)
    && (def.body.collisionLayer & PLAYER_STATIC) === 0;

describe('the layer of a talker', () => {
    const layers: Record<string, Container> = {};
    let Mobs: any;

    beforeAll(async () => {
        for (const name of ['totem', 'companion', 'campfire', 'turnip', 'wildlife', 'fixtures', 'npcs']) {
            layers[name] = new Container();
        }
        const {GameSetupEvent} = await import('../../core/logic/Events');
        Mobs = await import('./Mobs');
        // The preload sets these in the game.
        for (const exported of Object.values<any>(Mobs)) {
            if (typeof exported === 'function') exported.svg = Texture.EMPTY;
        }
        GameSetupEvent.trigger({
            layers: {mobs: layers, characterAdditions: {namePlates: new Container()}},
        } as any);
    });

    it('is npcs exactly for the talkers players walk through', () => {
        for (const def of species) {
            const type: string = def.entityType ?? def.name;
            const layer = new Mobs[type](1, 0, 0, 30).layer;
            expect(layer === layers.npcs, `${def.name} (${type})`).toBe(walkThroughTalker(def));
        }
    });
});
