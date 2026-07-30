/**
 * The journal's view model (plan-quests.md chunk C3, D7) — DOM-free, so vitest
 * covers it; Journal.ts next door owns the panel and the clicks.
 *
 * Two inputs meet here and neither is enough alone: the wire carries the
 * player's ledger as IDS ONLY (which quests are running, and the ordered stages
 * this character actually walked — L6), and the /quests catalog carries the
 * words. The catalog is injected rather than imported so this module stays
 * fetch-free as well as DOM-free.
 *
 * Gothic 1's shape, which is what D7 rules: entries grouped under their quest,
 * a running and a completed section. Not a checklist — every line is prose the
 * player has already been shown.
 */

/** One quest as GameState.quest_progress carries it. */
export interface QuestProgress {
    questId: string;
    /** The stages entered, oldest first — the walked path, not a position. */
    stages: string[];
    completed: boolean;
    /**
     * The CURRENT stage's objective lines, composed by the server and rendered
     * verbatim (Q2, R2): "3/8 Wolf slain", "Talk to the Farmer ✓". Empty for
     * completed quests — the diary is their record.
     */
    objectives: string[];
}

export type JournalCatalogState = 'loading' | 'ready' | 'unavailable';

/** The slice of the quest catalog the journal needs. */
export interface JournalCatalog {
    state(): JournalCatalogState;
    title(questId: string): string | undefined;
    stageJournal(questId: string, stageId: string): string | undefined;
}

export interface JournalQuestView {
    questId: string;
    title: string;
    /** The diary of the stages walked, in order. */
    entries: string[];
    /** The current stage's server-composed objective lines, verbatim (Q2). */
    objectives: string[];
}

export interface JournalView {
    /**
     * ⚑ Carried through rather than collapsed to a boolean: "the catalog has not
     * landed yet" and "the catalog failed" read very differently to a player,
     * and BOTH have to be distinguishable from "you have no quests" — an empty
     * journal and a broken one look identical otherwise, which is the one
     * degrade this panel must not get wrong.
     */
    state: JournalCatalogState;
    running: JournalQuestView[];
    completed: JournalQuestView[];
}

export class JournalModel {
    private progress: QuestProgress[] = [];

    constructor(private readonly catalog: JournalCatalog) {
    }

    /** Feed a snapshot's quest_progress. Called every tick. */
    update(progress: QuestProgress[]) {
        this.progress = progress ?? [];
    }

    view(): JournalView {
        const state = this.catalog.state();
        if (state !== 'ready') {
            return {state, running: [], completed: []};
        }
        return {
            state,
            running: this.progress.filter(p => !p.completed).map(p => this.questView(p)),
            completed: this.progress.filter(p => p.completed).map(p => this.questView(p)),
        };
    }

    private questView(p: QuestProgress): JournalQuestView {
        const entries: string[] = [];
        for (const stageId of p.stages) {
            const prose = this.catalog.stageJournal(p.questId, stageId);
            // A stage the catalog does not know is skipped rather than faked:
            // a server restarted on edited content can hand out a ledger naming
            // stages this catalog never saw, and inventing a line for one would
            // put words in the world's mouth.
            if (prose !== undefined) {
                entries.push(prose);
            }
        }
        // The id as a last-resort title keeps an unknown quest visible — and
        // abandonable — instead of silently vanishing from the panel. The
        // objective lines pass through verbatim: the server composed them (R2),
        // this model adds no words of its own.
        return {questId: p.questId, title: this.catalog.title(p.questId) ?? p.questId, entries, objectives: p.objectives};
    }
}
