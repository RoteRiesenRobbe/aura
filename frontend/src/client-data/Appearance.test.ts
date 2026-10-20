import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {AppearanceCatalog, defaultLook, lookArt, portraitAt, ringAt, ringFamilyOf, setAppearanceCatalog, wireOf} from './Appearance';
import {RING_FAMILY_FILES} from './Medallions';
import {GraphicsConfig} from './Graphics';

// plan-appearance.md C3: Character.portrait / ring are 1 + the position in the
// served arrays, 0 = the item the catalog marks default.
const catalog: AppearanceCatalog = {
    portraits: [
        {id: 'auburn-curls', name: 'Auburn Curls', starter: true},
        {id: 'default', name: 'Morion Helm', starter: true, default: true},
    ],
    rings: [
        {id: 'ring-leather', name: 'Leather Ring', family: 'leather', starter: true},
        {id: 'ring-plain', name: 'Plain Ring', family: 'grey', starter: true, default: true},
    ],
};

describe('the wire values', () => {
    it('index the served arrays from 1, and 0 is the default', () => {
        setAppearanceCatalog(catalog);
        expect(portraitAt(1)?.id).toBe('auburn-curls');
        expect(portraitAt(2)?.id).toBe('default');
        expect(portraitAt(0)?.id).toBe('default');
        expect(ringAt(1)?.id).toBe('ring-leather');
        expect(ringAt(0)?.id).toBe('ring-plain');
    });

    it('draw the default for a value past the end (a newer server)', () => {
        setAppearanceCatalog(catalog);
        expect(portraitAt(9)?.id).toBe('default');
        expect(ringAt(9)?.id).toBe('ring-plain');
    });

    it('answer nothing before the catalog arrives', () => {
        setAppearanceCatalog(null);
        expect(portraitAt(1)).toBeUndefined();
        expect(ringAt(0)).toBeUndefined();
    });

    it('turn an id back into its wire value', () => {
        setAppearanceCatalog(catalog);
        expect(wireOf('portrait', 'default')).toBe(2);
        expect(wireOf('ring', 'ring-leather')).toBe(1);
        expect(wireOf('ring', 'nobody')).toBe(0);
    });
});

describe('ringFamilyOf', () => {
    it('names the item family, and grey for one the client does not draw', () => {
        expect(ringFamilyOf({id: 'r', name: 'r', family: 'leather', starter: true})).toBe('leather');
        expect(ringFamilyOf({id: 'r', name: 'r', family: 'gold-leaf', starter: true})).toBe('grey');
        expect(ringFamilyOf(undefined)).toBe('grey');
    });
});

describe('defaultLook', () => {
    it('is the item each slot marks default', () => {
        expect(defaultLook(catalog)).toEqual({portrait: 'default', ring: 'ring-plain'});
    });
});

describe('lookArt', () => {
    it('is the bust and the ring family a worn look draws', () => {
        setAppearanceCatalog(catalog);
        expect(lookArt(1, 1)).toEqual({packIcon: 'portrait-auburn-curls', family: 'leather'});
        expect(lookArt(0, 0)).toEqual({packIcon: 'portrait-morion-helm', family: 'grey'});
    });

    it('draws the class portrait in the grey ring before the catalog arrives', () => {
        setAppearanceCatalog(null);
        expect(lookArt(1, 1)).toEqual({packIcon: undefined, family: 'grey'});
    });
});

// Hand-maintained client tables fail silent without a completeness pin (§8).
describe('the authored catalog', () => {
    const items = readdirSync('../api/appearance')
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(readFileSync(`../api/appearance/${f}`, 'utf-8')) as {id: string, slot: string, family?: string});
    const manifest: Record<string, string> = JSON.parse(readFileSync('src/client-data/icons/pack-manifest.json', 'utf-8')).icons;

    it('every portrait has a manifest bust, and every bust a portrait', () => {
        const portraits = items.filter(i => i.slot === 'portrait').map(i => i.id).sort();
        expect(Object.keys(GraphicsConfig.playerPortraits).sort()).toEqual(portraits);
        const missing = Object.entries(GraphicsConfig.playerPortraits)
            .filter(([, entry]) => !(entry.packIcon in manifest))
            .map(([id, entry]) => `${id} -> ${entry.packIcon}`);
        expect(missing).toEqual([]);
    });

    it('every ring names a family the client draws', () => {
        const unknown = items.filter(i => i.slot === 'ring' && !(i.family in RING_FAMILY_FILES)).map(i => `${i.id}: ${i.family}`);
        expect(unknown).toEqual([]);
    });
});
