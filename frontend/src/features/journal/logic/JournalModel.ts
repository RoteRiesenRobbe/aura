/**
 * The journal's view model (plan-quests.md chunk C3, D7; two-pane since
 * plan-conversation-journal.md Q3) — DOM-free, so vitest covers it; Journal.ts
 * next door owns the panel and the clicks.
 *
 * Two inputs meet here and neither is enough alone: the wire carries the
 * player's ledger as IDS ONLY (which quests are running, and the ordered stages
 * this character actually walked — L6), and the /quests catalog carries the
 * words. The catalog is injected rather than imported so this module stays
 * fetch-free as well as DOM-free.
 *
 * The Q3 shape: a LIST of titles (running and completed sections, D7's
 * grouping) beside a DETAIL pane holding the selected quest's diary. Selection
 * is client state over a per-tick re-send — exactly the ConversationModel
 * hazard — so it lives here by quest ID, where the re-send cannot reset it,
 * and it deliberately survives the panel closing (PO ruling 2026-07-30:
 * reopening lands on the quest last read).
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

/** One row of the list pane: a title to click, nothing more. */
export interface JournalListRow {
    questId: string;
    title: string;
    selected: boolean;
}

/** The detail pane: the selected quest's diary. */
export interface JournalDetailView {
    questId: string;
    title: string;
    /** The diary of the stages walked, in order. */
    entries: string[];
    /** The current stage's server-composed objective lines, verbatim (Q2). */
    objectives: string[];
    /** Only a running quest can be abandoned (D13). */
    running: boolean;
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
    running: JournalListRow[];
    completed: JournalListRow[];
    /** The selected quest, or null when the journal is empty. */
    detail: JournalDetailView | null;
}

/** One row of the quest tracker: a running quest and its last objective line. */
export interface QuestTrackerRow {
    questId: string;
    title: string;
    /**
     * The LAST of the current stage's server-composed objective lines
     * ("the last current line", PO mockup 2026-08-23), verbatim like the
     * journal's - or null when the stage has none, and the title stands alone.
     */
    line: string | null;
}

/**
 * The quest tracker's view (2026-08-23): the always-on strip under the map
 * button, rendered by QuestTracker.ts. A pure function rather than a second
 * stateful model - the tracker holds no selection, so there is nothing for a
 * per-tick re-send to reset. Running quests only; a catalog that is not ready
 * yields nothing, because the tracker has no room to explain itself and the
 * journal panel already owns saying why.
 */
export function questTrackerRows(progress: QuestProgress[], catalog: JournalCatalog): QuestTrackerRow[] {
    if (catalog.state() !== 'ready') {
        return [];
    }
    return (progress ?? []).filter(p => !p.completed).map(p => ({
        questId: p.questId,
        // The id as a last-resort title, same rule as the journal list.
        title: catalog.title(p.questId) ?? p.questId,
        line: p.objectives.length > 0 ? p.objectives[p.objectives.length - 1] : null,
    }));
}

export class JournalModel {
    private progress: QuestProgress[] = [];
    private selectedQuestId: string | null = null;

    constructor(private readonly catalog: JournalCatalog) {
    }

    /** Feed a snapshot's quest_progress. Called every tick. */
    update(progress: QuestProgress[]) {
        this.progress = progress ?? [];
        // Resolve the selection HERE rather than in view(), so view() stays
        // pure and an unchanged ledger provably yields an identical view. A
        // selection that left the ledger falls back to the first running
        // quest, else the first completed, else nothing (PO ruling
        // 2026-07-30) — and a first snapshot lands on the first running quest
        // by the same rule.
        if (this.selectedQuestId === null || !this.progress.some(p => p.questId === this.selectedQuestId)) {
            const fallback = this.progress.find(p => !p.completed) ?? this.progress[0];
            this.selectedQuestId = fallback?.questId ?? null;
        }
    }

    /** Click a list row. A quest not in the journal cannot be selected. */
    select(questId: string) {
        if (this.progress.some(p => p.questId === questId)) {
            this.selectedQuestId = questId;
        }
    }

    view(): JournalView {
        const state = this.catalog.state();
        if (state !== 'ready') {
            return {state, running: [], completed: [], detail: null};
        }
        const selected = this.progress.find(p => p.questId === this.selectedQuestId) ?? null;
        return {
            state,
            running: this.progress.filter(p => !p.completed).map(p => this.listRow(p)),
            completed: this.progress.filter(p => p.completed).map(p => this.listRow(p)),
            detail: selected === null ? null : this.detailView(selected),
        };
    }

    private listRow(p: QuestProgress): JournalListRow {
        // The id as a last-resort title keeps an unknown quest visible — and
        // abandonable — instead of silently vanishing from the panel.
        return {
            questId: p.questId,
            title: this.catalog.title(p.questId) ?? p.questId,
            selected: p.questId === this.selectedQuestId,
        };
    }

    private detailView(p: QuestProgress): JournalDetailView {
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
        // The objective lines pass through verbatim: the server composed them
        // (R2), this model adds no words of its own.
        return {
            questId: p.questId,
            title: this.catalog.title(p.questId) ?? p.questId,
            entries,
            objectives: p.objectives,
            running: !p.completed,
        };
    }
}
