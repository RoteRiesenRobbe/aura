import {afterEach, describe, expect, it} from 'vitest';
import {AuraApi} from '../../backend/logic/AuraApi';
import {objectiveLine, resolveArgs, WireArg} from './WireText';
import {setLocaleForTest} from './Locale';

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
