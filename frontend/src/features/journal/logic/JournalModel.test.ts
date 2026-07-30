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

const cullRunning: QuestProgress = {questId: 'wolf-cull', stages: ['cull'], completed: false, objectives: ['0/3 Wolf slain']};
const cullDone: QuestProgress = {questId: 'wolf-cull', stages: ['cull', 'report'], completed: true, objectives: []};
const choiceRunning: QuestProgress = {questId: 'choice', stages: ['choose'], completed: false, objectives: []};

describe('JournalModel', () => {
    it('is empty before any snapshot', () => {
        const view = new JournalModel(catalogOf()).view();
        expect(view.state).toBe('ready');
        expect(view.running).toEqual([]);
        expect(view.completed).toEqual([]);
        expect(view.detail).toBeNull();
    });

    // Q3: the list carries titles only; the words live in the detail pane.
    it('lists a running quest and details it — the first running quest is selected by default', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullRunning]);

        const view = model.view();
        expect(view.completed).toEqual([]);
        expect(view.running).toEqual([{questId: 'wolf-cull', title: 'The Wolf Cull', selected: true}]);
        expect(view.detail).toEqual({
            questId: 'wolf-cull',
            title: 'The Wolf Cull',
            entries: ['Old Miller says the pack has taken three lambs.'],
            objectives: ['0/3 Wolf slain'],
            running: true,
        });
    });

    // Q2 (R2): the server composes the line, the client renders it verbatim —
    // the model passes it through untouched, no words of its own.
    it('passes the server-composed objective lines through verbatim', () => {
        const model = new JournalModel(catalogOf());
        model.update([{questId: 'wolf-cull', stages: ['cull'], completed: false,
            objectives: ['2/3 Wolf slain', 'Talk to the Farmer ✓']}]);

        expect(model.view().detail?.objectives).toEqual(['2/3 Wolf slain', 'Talk to the Farmer ✓']);
    });

    // L6: the walked path is ordered, and the diary reads in that order.
    it('renders the entries in the order the stages were entered', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullDone]);

        expect(model.view().detail?.entries).toEqual([
            'Old Miller says the pack has taken three lambs.',
            'The pack is thinned. Miller should hear of it.',
        ]);
    });

    it('splits running from completed (D7)', () => {
        const model = new JournalModel(catalogOf());
        model.update([choiceRunning, cullDone]);

        const view = model.view();
        expect(view.running.map(q => q.questId)).toEqual(['choice']);
        expect(view.completed.map(q => q.questId)).toEqual(['wolf-cull']);
    });

    it('select() moves the selected flag and the detail pane together', () => {
        const model = new JournalModel(catalogOf());
        model.update([choiceRunning, cullDone]);
        model.select('wolf-cull');

        const view = model.view();
        expect(view.running[0].selected).toBe(false);
        expect(view.completed[0].selected).toBe(true);
        expect(view.detail?.questId).toBe('wolf-cull');
        // D13: a completed quest is sealed — the detail pane must say so, or
        // the panel would offer an Abandon that cannot apply.
        expect(view.detail?.running).toBe(false);
    });

    it('ignores selecting a quest that is not in the journal', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullRunning]);
        model.select('ghost-quest');

        expect(model.view().detail?.questId).toBe('wolf-cull');
    });

    // ⚑ The ledger arrives ~30×/s; selection is client state and must not
    // reset on a re-send (§4.5 — the ConversationModel.update() hazard).
    it('keeps the selection across a per-tick re-send', () => {
        const model = new JournalModel(catalogOf());
        model.update([choiceRunning, cullDone]);
        model.select('wolf-cull');
        model.update([choiceRunning, cullDone]);

        expect(model.view().detail?.questId).toBe('wolf-cull');
    });

    // Selection is by id, so a quest completing (moving sections) keeps it.
    it('follows the selected quest when it completes and moves sections', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullRunning, choiceRunning]);
        model.select('wolf-cull');
        model.update([cullDone, choiceRunning]);

        const view = model.view();
        expect(view.completed[0].selected).toBe(true);
        expect(view.detail?.questId).toBe('wolf-cull');
        expect(view.detail?.running).toBe(false);
    });

    // PO ruling 2026-07-30: when the selected quest leaves the list, fall back
    // to the first running quest, else the first completed, else nothing.
    it('falls back to the first running quest when the selection leaves the ledger', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullRunning, choiceRunning]);
        model.select('choice');
        model.update([cullRunning]);

        const view = model.view();
        expect(view.detail?.questId).toBe('wolf-cull');
        expect(view.running[0].selected).toBe(true);
    });

    it('falls back to the first completed quest when nothing is running', () => {
        const model = new JournalModel(catalogOf());
        model.update([choiceRunning, cullDone]);
        model.select('choice');
        model.update([cullDone]);

        expect(model.view().detail?.questId).toBe('wolf-cull');
    });

    // D13: abandoning drops the quest from the ledger entirely, so it simply
    // stops arriving — the panel must not keep a stale copy of it.
    it('drops a quest that leaves the ledger, and details nothing when it was the last', () => {
        const model = new JournalModel(catalogOf());
        model.update([cullRunning]);
        model.update([]);

        const view = model.view();
        expect(view.running).toEqual([]);
        expect(view.detail).toBeNull();
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
            expect(view.detail).toBeNull();
        }
    });

    it('keeps an unknown quest visible under its id, and skips prose it has no words for', () => {
        const model = new JournalModel(catalogOf());
        model.update([{questId: 'ghost-quest', stages: ['gone'], completed: false, objectives: []}]);

        const view = model.view();
        expect(view.running).toEqual([{questId: 'ghost-quest', title: 'ghost-quest', selected: true}]);
        expect(view.detail).toEqual({questId: 'ghost-quest', title: 'ghost-quest', entries: [], objectives: [], running: true});
    });

    // The panel diffs on a signature of the view, which is only sound if an
    // unchanged ledger produces an identical view — the server re-sends the
    // ledger ~30×/s, so anything else rebuilds the panel under the player's
    // cursor. Selection is part of the view, so it is covered too.
    it('produces a stable view for an unchanged ledger', () => {
        const model = new JournalModel(catalogOf());
        model.update([choiceRunning, cullDone]);
        model.select('wolf-cull');
        const first = JSON.stringify(model.view());

        model.update([
            {questId: 'choice', stages: ['choose'], completed: false, objectives: []},
            {questId: 'wolf-cull', stages: ['cull', 'report'], completed: true, objectives: []},
        ]);
        expect(JSON.stringify(model.view())).toBe(first);
    });
});
