import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'fs';
import {join} from 'path';
import {hasPackIcon, packIconRegion, packIconStyle, setPackLookup} from './PackIcons';
import {GraphicsConfig} from '../Graphics';

const repoRoot = join(__dirname, '..', '..', '..', '..');

/** The npcs map is a union of hand-written entries; only some carry a portrait. */
function portraitOf(npc: object): string | undefined {
    return (npc as { packIcon?: string }).packIcon;
}
const manifest = JSON.parse(readFileSync(join(repoRoot, 'frontend/src/client-data/icons/pack-manifest.json'), 'utf8'));
const manifestNames = new Set(Object.keys(manifest.icons));

function skillPackIcons(): { file: string, packIcon: string }[] {
    const dir = join(repoRoot, 'api/skills');
    return readdirSync(dir, {withFileTypes: true})
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => ({file: entry.name, packIcon: JSON.parse(readFileSync(join(dir, entry.name), 'utf8')).packIcon ?? ''}));
}

describe('pack icon lookup', () => {
    it('answers "no" for everything until a lookup is set', () => {
        setPackLookup(null);
        expect(hasPackIcon('potion-red')).toBe(false);
        expect(hasPackIcon(null)).toBe(false);
        expect(packIconRegion('potion-red')).toBeNull();
    });

    it('finds a region through the lookup and drops it when the lookup goes', () => {
        setPackLookup({iconSize: 256, atlasSize: 2048, atlases: ['atlas-abc.png'],
            icons: {'potion-red': {atlas: 'atlas-abc.png', x: 258, y: 516, w: 256, h: 256}}});
        expect(hasPackIcon('potion-red')).toBe(true);
        expect(hasPackIcon('nope')).toBe(false);
        expect(hasPackIcon('')).toBe(false);
        setPackLookup(null);
        expect(hasPackIcon('potion-red')).toBe(false);
    });

    it('computes a background sprite in percentages, so it fits any token size', () => {
        const style = packIconStyle({atlas: 'atlas-abc.png', x: 258, y: 516, w: 256, h: 256}, 2048);
        expect(style.backgroundImage).toBe('url("icons/atlas-abc.png")');
        expect(style.backgroundSize).toBe('800% 800%');
        // p = x / (atlasSize - w): 258 / 1792, 516 / 1792.
        const [px, py] = style.backgroundPosition.split(' ').map(parseFloat);
        expect(px).toBeCloseTo(258 / 1792 * 100, 6);
        expect(py).toBeCloseTo(516 / 1792 * 100, 6);
        // An atlas exactly one icon wide would divide by zero: guarded to 0%.
        expect(packIconStyle({atlas: 'a.png', x: 0, y: 0, w: 256, h: 256}, 256).backgroundPosition).toBe('0% 0%');
    });
});

describe('pack icon content pins (the manifest is the only committed raw-pack data)', () => {
    it('every packIcon in api/skills names a manifest entry', () => {
        const unknown = skillPackIcons()
            .filter(({packIcon}) => packIcon !== '' && !manifestNames.has(packIcon))
            .map(({file, packIcon}) => `${file} -> ${packIcon}`);
        expect(unknown, 'add the icon to pack-manifest.json').toEqual([]);
    });

    it('every packIcon in Graphics.ts names a manifest entry', () => {
        const entries: { key: string, packIcon?: string }[] = [
            {key: 'character', packIcon: GraphicsConfig.character.packIcon},
            ...Object.entries(GraphicsConfig.mobs).map(([key, mob]) => ({key, packIcon: mob.packIcon})),
            ...Object.entries(GraphicsConfig.npcs).map(([key, npc]) => ({key, packIcon: portraitOf(npc)})),
        ];
        const unknown = entries
            .filter(({packIcon}) => packIcon !== undefined && !manifestNames.has(packIcon))
            .map(({key, packIcon}) => `${key} -> ${packIcon}`);
        expect(unknown, 'add the portrait to pack-manifest.json').toEqual([]);
    });

    it('every manifest entry is used by a skill or a portrait', () => {
        // The manifest is what the seat holder packs; an unused entry is dead
        // weight in the committed atlas and a stale pick nobody can see.
        const used = new Set<string>([
            ...skillPackIcons().map(({packIcon}) => packIcon),
            ...Object.values(GraphicsConfig.mobs).map((mob) => mob.packIcon ?? ''),
            ...Object.values(GraphicsConfig.npcs).map((npc) => portraitOf(npc) ?? ''),
            GraphicsConfig.character.packIcon ?? '',
        ]);
        const unused = [...manifestNames].filter((name) => !used.has(name));
        expect(unused, 'remove the entry or name it somewhere').toEqual([]);
    });
});
