import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {AuraApi} from '../../backend/logic/AuraApi';
import {lockedText, lockReasonText, objectiveLine, resolveArgs, WireArg, wireMessageText} from './WireText';
import {formatMobName, loadMobCatalog, mobName} from '../../../client-data/Mobs';
import {loadLangBundle} from '../../../client-data/LangBundle';
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

    it('words a herd line, and ticks none without a named tracker (plan-herding.md D6)', () => {
        const herd = {...kill, kind: AuraApi.QuestObjectiveKind.Herd, n: 2, m: 6};
        expect(objectiveLine('q', herd)).toBe('2/6 999 brought back');
        expect(objectiveLine('q', {...herd, n: 6, done: true})).toBe('6/6 999 brought back');
        setLocaleForTest('de');
        expect(objectiveLine('q', herd)).toBe('2/6 999 zurückgebracht');
    });
});

// The speech bubble's text (Backend.ts): what an NPC calls out, and the
// ascension refusal, both arrive keyed and must not show the English.
describe('wireMessageText for speech bubbles', () => {
    // Just the EntityMessage surface wireMessageText reads.
    const message = (key: string, english: string, ids: string[] = []) => ({
        key: () => key,
        message: () => english,
        argsLength: () => (ids.length ? 1 : 0),
        args: () => ({
            name: () => 'ids', kind: () => AuraApi.MessageArgKind.List, text: () => '', number: () => 0, id: () => 0,
            itemsLength: () => ids.length, items: (j: number) => ids[j],
        }),
    }) as unknown as AuraApi.EntityMessage;

    it('words an ambient line from the /lang bundle, the English as fallback', async () => {
        const stubbedFetch = globalThis.fetch;
        globalThis.fetch = () => Promise.resolve({ok: true, json: () => Promise.resolve({
            'conv.TownCrier.hail-adventurer': 'Gegrüßt seist du!',
        })} as Response);
        try {
            await loadLangBundle();
        } finally {
            globalThis.fetch = stubbedFetch;
        }
        expect(wireMessageText(message('content.lines', 'Hail, adventurer!\nWolves!',
            ['conv.TownCrier.hail-adventurer', 'conv.TownCrier.unknown'])))
            .toBe('Gegrüßt seist du!\nWolves!');
    });

    it('words the ascension refusal in German', () => {
        setLocaleForTest('de');
        expect(wireMessageText(message('ascension.refused', 'The stone is silent. Nothing has changed.')))
            .toBe('Der Stein schweigt. Nichts hat sich verändert.');
    });

    it('shows an unkeyed message (player chat) verbatim', () => {
        setLocaleForTest('de');
        expect(wireMessageText(message('', 'hello there'))).toBe('hello there');
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

// plan-appearance.md C5c: one wording for a lock reason, whether it arrived on
// a conversation row or on the owner block's locked appearance items.
describe('lockReasonText', () => {
    it('words a numeric kind with its progress', () => {
        expect(lockReasonText({kind: AuraApi.ConversationLockKind.MinLevel, value: 3, have: 1}))
            .toBe('level 3 (1/3)');
        expect(lockReasonText({kind: AuraApi.ConversationLockKind.Ascensions, value: 1, have: 0}))
            .toBe('1 ascension in this line (0/1)');
    });

    it('words a quest kind by its id when the catalog lacks it', () => {
        expect(lockReasonText({kind: AuraApi.ConversationLockKind.QuestComplete, quest: 'village-welcome'}))
            .toBe('complete “village-welcome”');
    });

    it('falls back for a kind it does not know', () => {
        expect(lockReasonText({kind: 200})).toBe('an unnamed requirement');
    });

    // plan-appearance.md C5b: a look only a stone gives has no progress.
    it('words a stone gift', () => {
        expect(lockReasonText({kind: AuraApi.ConversationLockKind.StoneGift}))
            .toBe('a gift of an ascension stone');
        setLocaleForTest('de');
        expect(lockReasonText({kind: AuraApi.ConversationLockKind.StoneGift}))
            .toBe('ein Geschenk eines Aufstiegssteins');
    });
});

describe('lockedText', () => {
    const level = {kind: AuraApi.ConversationLockKind.MinLevel, value: 3, have: 1};
    const line = {kind: AuraApi.ConversationLockKind.Ascensions, value: 1, have: 0};

    it('joins reasons by the mode, after the label', () => {
        expect(lockedText('Forest ring', [level, line], false))
            .toBe('Forest ring - locked: level 3 (1/3) and 1 ascension in this line (0/1)');
        expect(lockedText('Forest ring', [level, line], true))
            .toBe('Forest ring - locked: level 3 (1/3) or 1 ascension in this line (0/1)');
    });

    it('words it in German', () => {
        setLocaleForTest('de');
        expect(lockedText('Waldring', [level], false)).toBe('Waldring – gesperrt: Stufe 3 (1/3)');
    });
});
