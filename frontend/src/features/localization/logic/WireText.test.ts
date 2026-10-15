import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {AuraApi} from '../../backend/logic/AuraApi';
import {objectiveLine, resolveArgs, WireArg} from './WireText';
import {formatMobName, loadMobCatalog, mobName} from '../../../client-data/Mobs';
import {loadCatalog, setLocaleForTest} from './Locale';

beforeAll(() => loadCatalog('de'));
afterEach(() => setLocaleForTest('en'));

const arg = (a: Partial<WireArg>): WireArg => ({name: '', kind: 0, text: '', number: 0, id: 0, items: [], ...a});

describe('resolveArgs (plan-localization.md C2, D8)', () => {
    it('joins a list with Intl.ListFormat and folds the rest into "N others"', () => {
        const values = resolveArgs([
            arg({name: 'names', kind: AuraApi.MessageArgKind.List, items: ['A', 'B', 'C']}),
            arg({name: 'count', kind: AuraApi.MessageArgKind.Number, number: 5}),
        ]);
        expect(values.names).toBe('A, B, C, and 2 others');
        expect(values.count).toBe(5);
    });

    it('joins in German with und', () => {
        setLocaleForTest('de');
        const values = resolveArgs([arg({name: 'names', kind: AuraApi.MessageArgKind.List, items: ['A', 'B']})]);
        expect(values.names).toBe('A und B');
    });

    it('keeps literal text (player names) as it is', () => {
        expect(resolveArgs([arg({name: 'who', kind: AuraApi.MessageArgKind.Text, text: 'Mara'})]).who).toBe('Mara');
    });
});

describe('objectiveLine (Q2)', () => {
    const kill = {kind: AuraApi.QuestObjectiveKind.Kill, stage: false, target: 999, region: '', n: 3, m: 8, done: false, trackerKey: ''};

    it('words a kill line from the template, numbers formatted', () => {
        // An unknown mob id degrades to the id, never blank (D14).
        expect(objectiveLine('q', kill)).toBe('3/8 999 slain');
    });

    it('words it in German', () => {
        setLocaleForTest('de');
        expect(objectiveLine('q', {...kill, n: 1200, m: 1500})).toBe('1.200/1.500 999 getötet');
    });

    it('ticks a finished talk_to line', () => {
        const talk = {...kill, kind: AuraApi.QuestObjectiveKind.TalkTo, done: true};
        expect(objectiveLine('q', talk)).toBe('Talk to 999 ✓');
    });
});

// plan-localization.md C5b (D24): a mob name carries its plural as ICU; the
// tracker formats it with the REQUIRED count, the nameplate with 1.
describe('mob names as ICU (D24)', () => {
    async function loadCatalog(entries: object[]) {
        const stubbedFetch = globalThis.fetch;
        globalThis.fetch = () => Promise.resolve({ok: true, json: () => Promise.resolve(entries)} as Response);
        try {
            await loadMobCatalog();
        } finally {
            globalThis.fetch = stubbedFetch;
        }
    }
    const wolfEn = {id: 7, name: 'Wolf', displayName: '{count, plural, one {Wolf} other {Wolves}}', curveLevel: 3, tier: 0, combatTarget: true, conversant: false, auraSkillId: 0};
    const wolfDe = {...wolfEn, displayName: '{count, plural, one {Wolf} other {Wölfe}}'};
    const farmer = {...wolfEn, id: 8, name: 'Farmer', displayName: 'Farmer'};
    const kill = {kind: AuraApi.QuestObjectiveKind.Kill, stage: false, target: 7, region: '', n: 3, m: 8, done: false, trackerKey: ''};

    it('formats a name for a count, in English and German; a plain name ignores it', async () => {
        await loadCatalog([wolfEn, farmer]);
        expect(mobName(7)).toBe('Wolf');
        expect(mobName(7, 8)).toBe('Wolves');
        expect(mobName(8, 8)).toBe('Farmer');
        expect(formatMobName('{count, plural, one {Wolf} other {Wolves}}', 1)).toBe('Wolf');
        setLocaleForTest('de');
        expect(formatMobName(wolfDe.displayName, 1)).toBe('Wolf');
        expect(formatMobName(wolfDe.displayName, 8)).toBe('Wölfe');
    });

    it('reads "1/1 Wolf slain", "3/8 Wolves slain" and "3/8 Wölfe getötet" on the tracker', async () => {
        await loadCatalog([wolfEn]);
        expect(objectiveLine('q', {...kill, n: 1, m: 1})).toBe('1/1 Wolf slain');
        expect(objectiveLine('q', kill)).toBe('3/8 Wolves slain');
        await loadCatalog([wolfDe]);
        setLocaleForTest('de');
        expect(objectiveLine('q', kill)).toBe('3/8 Wölfe getötet');
    });

    it('degrades a broken name readably, never blank (D14)', () => {
        expect(formatMobName('{count, plural, one {Wolf}', 2)).toBe('{count, plural, one {Wolf}');
    });
});
