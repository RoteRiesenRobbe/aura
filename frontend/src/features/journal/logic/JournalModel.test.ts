import {describe, expect, it} from 'vitest';
import {JournalCatalog, JournalCatalogState, JournalModel, QuestProgress} from './JournalModel';

function catalogOf(state: JournalCatalogState = 'ready'): JournalCatalog {
    const quests: { [id: string]: { title: string, stages: { [id: string]: string } } } = {
        'wolf-cull': {
            title: 'The Wolf Cull',
            stages: {
                cull: 'Old Miller says the pack has taken three lambs.',
                report: 'The pack is thinned. Miller should hear of it.',
            },
        },
        'choice': {
            title: 'The Choice',
            stages: {choose: 'Two camps, one road.', 'a-end': 'I sided with the miners.'},
        },
    };
    return {
        state: () => state,
        title: (id) => quests[id]?.title,
        stageJournal: (questId, stageId) => quests[questId]?.stages[stageId],
    };
}

const cullRunning: QuestProgress = {questId: 'wolf-cull', stages: ['cull'], completed: false};
const cullDone: QuestProgress = {questId: 'wolf-cull', stages: ['cull', 'report'], completed: true};

describe('JournalModel', () => {
    it('is empty before any snapshot', () => {
        const view = new JournalModel(catalogOf()).view();
        expect(view.state).toBe('ready');
        expect(view.running).toEqual([]);
        expect(view.completed).toEqual([]);
    });

    it('groups a running quest under its title with the prose it has walked', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullRunning]);

        const view = model.view();
        expect(view.completed).toEqual([]);
        expect(view.running).toEqual([{
            questId: 'wolf-cull',
            title: 'The Wolf Cull',
            entries: ['Old Miller says the pack has taken three lambs.'],
        }]);
    });

    // L6: the walked path is ordered, and the diary reads in that order.
    it('renders the entries in the order the stages were entered', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullDone]);

        expect(model.view().completed[0].entries).toEqual([
            'Old Miller says the pack has taken three lambs.',
            'The pack is thinned. Miller should hear of it.',
        ]);
    });

    it('splits running from completed (D7)', () => {
        const model = new JournalModel(catalogOf());
        model.update([{questId: 'choice', stages: ['choose'], completed: false}, cullDone]);

        const view = model.view();
        expect(view.running.map(q => q.questId)).toEqual(['choice']);
        expect(view.completed.map(q => q.questId)).toEqual(['wolf-cull']);
    });

    // D13: abandoning drops the quest from the ledger entirely, so it simply
    // stops arriving — the panel must not keep a stale copy of it.
    it('drops a quest that leaves the ledger', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullRunning]);
        model.update([]);

        expect(model.view().running).toEqual([]);
    });

    // The degrade that matters: an empty journal and a broken one look identical
    // unless the state is carried through.
    it('reports the catalog state instead of an empty journal when it is not ready', () => {
        for (const state of ['loading', 'unavailable'] as JournalCatalogState[]) {
            const model = new JournalModel(catalogOf(state));
            model.update([cullRunning]);

            const view = model.view();
            expect(view.state).toBe(state);
            expect(view.running).toEqual([]);
        }
    });

    it('keeps an unknown quest visible under its id, and skips prose it has no words for', () => {
        const model = new JournalModel(catalogOf());
        model.update([{questId: 'ghost-quest', stages: ['gone'], completed: false}]);

        expect(model.view().running).toEqual([{questId: 'ghost-quest', title: 'ghost-quest', entries: []}]);
    });

    // The panel diffs on a signature of the view, which is only sound if an
    // unchanged ledger produces an identical view — the server re-sends the
    // ledger ~30×/s, so anything else rebuilds the abandon rows under the
    // player's cursor.
    it('produces a stable view for an unchanged ledger', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullRunning]);
        const first = JSON.stringify(model.view());

        model.update([{questId: 'wolf-cull', stages: ['cull'], completed: false}]);
        expect(JSON.stringify(model.view())).toBe(first);
    });
});
