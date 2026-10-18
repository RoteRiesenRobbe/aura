import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {FACTION_FAMILIES, FALLBACK_FAMILY, MedallionSpec, RING_FAMILY_FILES, RingResolver, ringFamily, ringTint} from './Medallions';
import {TierRank} from './Mobs';
import {GraphicsConfig} from './Graphics';

// The medallion ring (plan-appearance.md C1, plan-entity-medallions.md §6.1):
// a species' ring is its art FAMILY, keyed on its catalog faction, unless the
// species names its own (D23).
describe('ringFamily', () => {
    it('keys the ring on the faction', () => {
        expect(ringFamily({}, 'wildlife_predator')).toBe('forest');
        expect(ringFamily({}, 'bandit')).toBe('leather');
    });

    it('lets a species ring override the faction (D23)', () => {
        expect(ringFamily({ring: 'forest'}, 'townsfolk')).toBe('forest');
    });

    it('draws the grey fallback for no faction or an unmapped one (PO 2026-10-17)', () => {
        expect(ringFamily({}, '')).toBe(FALLBACK_FAMILY);
        expect(ringFamily({}, 'undead')).toBe(FALLBACK_FAMILY);
        expect(ringFamily({}, undefined)).toBe(FALLBACK_FAMILY);
    });
});

// The tier recolours the ring (PO 2026-10-17): grey, silver, gold. There is
// no separate rim layer any more.
describe('ringTint', () => {
    it('gives each tier its own colour', () => {
        const tints = [TierRank.Normal, TierRank.Elite, TierRank.Boss].map(ringTint);
        expect(new Set(tints).size).toBe(3);
    });

    it('treats an unknown rank as normal', () => {
        expect(ringTint(99)).toBe(ringTint(TierRank.Normal));
    });
});

// M-§5.5: the wire re-sends the species id every tick and the mob only
// redraws on a change, so a ring looked up before the /mobs catalog lands
// must be looked up again, or the mob stays bare forever.
describe('RingResolver', () => {
    const wolf = {faction: 'wildlife_predator'};

    it('retries until the catalog knows the species, then resolves once', () => {
        const resolver = new RingResolver({});
        expect(resolver.resolve(12, undefined)).toBeUndefined();
        expect(resolver.resolve(12, undefined)).toBeUndefined();
        expect(resolver.resolve(12, wolf)).toBe('forest');
        expect(resolver.resolve(12, wolf)).toBeUndefined();
    });

    it('resolves again after forget, for a ring whose texture had not loaded', () => {
        const resolver = new RingResolver({});
        expect(resolver.resolve(12, wolf)).toBe('forest');
        resolver.forget();
        expect(resolver.resolve(12, wolf)).toBe('forest');
    });

    it('resolves again when the species changes', () => {
        const resolver = new RingResolver({});
        expect(resolver.resolve(12, wolf)).toBe('forest');
        expect(resolver.resolve(13, {faction: 'orc'})).toBe('leatherClaws');
    });
});

// Hand-maintained client tables fail silent without a completeness pin
// (plan-entity-medallions.md §6.1). An unmapped faction is legitimate (it
// draws the grey ring); a map key that names no faction is a typo.
describe('the faction map', () => {
    const factionNames = readdirSync('../api/factions')
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(readFileSync(`../api/factions/${f}`, 'utf-8')).name as string);

    it('names only real factions', () => {
        for (const faction of Object.keys(FACTION_FAMILIES)) {
            expect(factionNames, `FACTION_FAMILIES key "${faction}"`).toContain(faction);
        }
    });

    it('maps onto registered families', () => {
        for (const family of [...Object.values(FACTION_FAMILIES), FALLBACK_FAMILY]) {
            expect(Object.keys(RING_FAMILY_FILES)).toContain(family);
        }
    });
});

// M-D14 as ruled for C1 (PO 2026-10-17): a species wears a medallion when its
// Graphics entry carries a `medallion` spec, and every combat target and
// conversant must carry one, EXCEPT the objects you talk to, which keep their
// own art. Summons get theirs in C6.
describe('medallion coverage', () => {
    // Graphics keys of conversant OBJECTS: signs, stones, roots, cave mouths,
    // remains, portals (PO 2026-10-17: "things in the world to interact with
    // that have models instead").
    const OBJECTS = ['signpost', 'remains', 'fireTotem'];
    // Where a class's Graphics key is not its EntityType with a lower-case
    // first letter.
    const KEY_ALIASES: Record<string, string> = {NpcPlaceholder: 'placeholder'};

    const friendly = new Set(readdirSync('../api/factions')
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(readFileSync(`../api/factions/${f}`, 'utf-8')))
        .filter(f => f.friendlyToPlayers)
        .map(f => f.name as string));

    const configs: Record<string, {medallion?: MedallionSpec, packIcon?: string, maxSize: number}> = {...GraphicsConfig.mobs, ...GraphicsConfig.npcs};
    const manifest: Record<string, string> = JSON.parse(readFileSync('src/client-data/icons/pack-manifest.json', 'utf-8')).icons;

    const species = readdirSync('../api/mobs')
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(readFileSync(`../api/mobs/${f}`, 'utf-8')));

    it('covers every combat target and conversant that is not an object', () => {
        for (const def of species) {
            // IsCombatTarget (catalog.go): grants XP (absent xpFactor = 1)
            // and is not friendly to players.
            const xpFactor = def.factors?.xpFactor ?? 1;
            const combatTarget = xpFactor > 0 && !friendly.has(def.faction);
            const conversant = def.interaction !== undefined;
            if (!combatTarget && !conversant) {
                continue;
            }
            const entityType: string = def.entityType ?? def.name;
            const key = KEY_ALIASES[entityType] ?? entityType[0].toLowerCase() + entityType.slice(1);
            expect(configs[key], `${def.name}: no Graphics entry "${key}" (add a KEY_ALIASES row?)`).toBeDefined();
            if (OBJECTS.includes(key)) {
                expect(configs[key].medallion, `${def.name}: "${key}" is an object, it stays bare`).toBeUndefined();
            } else {
                expect(configs[key].medallion, `${def.name}: "${key}" needs a medallion spec`).toBeDefined();
            }
        }
    });

    // D31 (PO 2026-10-18): every live and local build draws a set PONETI
    // portrait for every species that wears a medallion; the species' own
    // (speciesPortraits, D33) wins over its class's packIcon.
    it('gives every medallion species a pack portrait the manifest lists', () => {
        for (const def of species) {
            const entityType: string = def.entityType ?? def.name;
            const key = KEY_ALIASES[entityType] ?? entityType[0].toLowerCase() + entityType.slice(1);
            if (!configs[key]?.medallion) {
                continue;
            }
            const xpFactor = def.factors?.xpFactor ?? 1;
            if (!(xpFactor > 0 && !friendly.has(def.faction)) && def.interaction === undefined) {
                continue;
            }
            const name = GraphicsConfig.speciesPortraits[def.name]?.packIcon ?? configs[key].packIcon;
            expect(name, `${def.name}: no pack portrait (Graphics.ts "${key}".packIcon or speciesPortraits)`).toBeDefined();
            expect(manifest[name], `${def.name}: "${name}" is not in pack-manifest.json`).toBeDefined();
        }
    });

    it('keys speciesPortraits on real species', () => {
        const names = new Set(species.map(def => def.name as string));
        for (const name of Object.keys(GraphicsConfig.speciesPortraits)) {
            expect(names.has(name), `speciesPortraits.${name}: no api/mobs species of that name`).toBe(true);
        }
    });
});
