/**
 * The journal panel (plan-quests.md chunk C3, D7/D16; two-pane since
 * plan-conversation-journal.md Q3).
 *
 * Thin by design, like the conversation panel: the view model lives in the
 * DOM-free JournalModel next door, which vitest covers. This file renders it —
 * a quest list on the left, the selected quest's diary on the right — and turns
 * clicks into selections and AbandonQuest messages.
 *
 * Three rules worth knowing before editing:
 *
 *   · ⚑ `pointerdown`, never `click`. MouseManager preventDefaults `mousedown`
 *     on the document element, which suppresses the synthetic click — a `click`
 *     listener on a HUD panel silently never fires.
 *   · ⚑ VISIBILITY is the client's (J, the HUD button, ✕, Escape); CONTENT is
 *     the server's. The panel opens because the player asked, but a quest leaves
 *     it because it left the ledger on the wire — abandoning hides nothing
 *     locally, exactly like the conversation panel's close. SELECTION is the
 *     client's too, and it lives in the model — so it survives the panel
 *     closing (PO ruling 2026-07-30: reopening lands on the quest last read).
 *   · ⚑ The signature check is load-bearing, not an optimisation: the ledger is
 *     re-sent every tick, so without it the panel is torn down and rebuilt
 *     ~30×/second and a click can land in the gap between the old row being
 *     detached and the new one inserted. The selection is part of the view, so
 *     selecting re-renders and an unchanged tick does not.
 */

import {AbandonQuestMessage} from '../../backend/logic/messages/outgoing/AbandonQuestMessage';
import {catalogState, questDefinition, stageJournal} from '../../../client-data/Quests';
import {JournalCatalog, JournalModel, QuestProgress, JournalListRow, JournalDetailView} from './JournalModel';

// The real catalog, adapted to the model's narrow port. The model takes this
// injected so it stays fetch-free and unit-testable. Exported for the quest
// tracker next door, which reads the same words - one adapter, not two.
export const journalCatalog: JournalCatalog = {
    state: () => catalogState(),
    title: (questId) => questDefinition(questId)?.title,
    stageJournal,
};

const model = new JournalModel(journalCatalog);

let panelElement: HTMLElement;
let statusElement: HTMLElement;
let panesElement: HTMLElement;
let runningElement: HTMLElement;
let completedElement: HTMLElement;
let detailTitleElement: HTMLElement;
let detailBodyElement: HTMLElement;
let buttonElement: HTMLElement;

let open = false;
let renderedSignature = '';

export function setup() {
    panelElement = document.getElementById('journal');
    if (!panelElement) {
        return;
    }
    statusElement = panelElement.querySelector('.journalStatus');
    panesElement = panelElement.querySelector('.journalPanes');
    runningElement = panelElement.querySelector('.journalRunning');
    completedElement = panelElement.querySelector('.journalCompleted');
    detailTitleElement = panelElement.querySelector('.journalDetailTitle');
    detailBodyElement = panelElement.querySelector('.journalDetailBody');

    panelElement.querySelector('.journalClose')
        .addEventListener('pointerdown', close);

    buttonElement = document.getElementById('journalButton');
    buttonElement?.addEventListener('pointerdown', toggle);

    render();
}

/** Feed a snapshot's quest ledger. Called every tick. */
export function update(progress: QuestProgress[]) {
    model.update(progress);
    render();
}

/** J, and the HUD button (D16). */
export function toggle() {
    open = !open;
    render();
}

/** ✕, Escape, and a second J. */
export function close() {
    if (!open) {
        return;
    }
    open = false;
    render();
}

export function isOpen(): boolean {
    return open;
}

/** A quest tracker row: open the panel already turned to that quest. */
export function openQuest(questId: string) {
    model.select(questId);
    open = true;
    render();
}

function select(questId: string) {
    model.select(questId);
    render();
}

function abandon(questId: string) {
    new AbandonQuestMessage(questId).send();
}

function render() {
    if (!panelElement) {
        return;
    }

    const view = model.view();
    const signature = JSON.stringify({open, view});
    if (signature === renderedSignature) {
        return;
    }
    renderedSignature = signature;

    panelElement.classList.toggle('hidden', !open);
    if (!open) {
        return;
    }

    // The three states a player can be in, kept distinguishable on purpose: the
    // catalog carries every word the journal has, so a failed fetch must say so
    // rather than render as a diary with nothing in it.
    let status = '';
    if (view.state === 'loading') {
        status = 'Opening the journal…';
    } else if (view.state === 'unavailable') {
        status = 'Journal unavailable — the quest catalog could not be loaded.';
    } else if (view.running.length === 0 && view.completed.length === 0) {
        status = 'Nothing written here yet.';
    }
    statusElement.textContent = status;
    statusElement.classList.toggle('hidden', status === '');
    panesElement.classList.toggle('hidden', status !== '');

    renderSection(runningElement, view.running);
    renderSection(completedElement, view.completed);
    renderDetail(view.detail);
}

function renderSection(section: HTMLElement, quests: JournalListRow[]) {
    section.classList.toggle('hidden', quests.length === 0);
    const list = section.querySelector('.journalQuests');

    // Rebuilt wholesale rather than diffed: a journal is a handful of quests,
    // and rebuilding is what guarantees an abandoned quest's row cannot linger
    // with a stale handler bound to it.
    const items = quests.map((quest) => {
        const li = document.createElement('li');
        li.className = 'journalQuest' + (quest.selected ? ' selected' : '');
        li.textContent = quest.title;
        li.addEventListener('pointerdown', () => select(quest.questId));
        return li;
    });
    list.replaceChildren(...items);
}

function renderDetail(detail: JournalDetailView | null) {
    // null only while the journal is empty, and then the panes are hidden
    // behind the status line anyway — cleared so a stale diary cannot flash on
    // the next open.
    detailTitleElement.textContent = detail?.title ?? '';
    if (detail === null) {
        detailBodyElement.replaceChildren();
        return;
    }

    const children: HTMLElement[] = [];
    for (const entry of detail.entries) {
        const p = document.createElement('p');
        p.className = 'journalEntry';
        p.textContent = entry;
        children.push(p);
    }

    // The current stage's objective lines (Q2) — server-composed, rendered
    // verbatim under the diary. Completed quests arrive with none.
    for (const objective of detail.objectives) {
        const p = document.createElement('p');
        p.className = 'journalObjective';
        p.textContent = objective;
        children.push(p);
    }

    // Only a running quest can be given up — a completed one is sealed
    // forever (D13), so it gets no row to click.
    if (detail.running) {
        const button = document.createElement('span');
        button.className = 'journalAbandon';
        button.textContent = 'Abandon';
        button.addEventListener('pointerdown', () => abandon(detail.questId));
        children.push(button);
    }
    detailBodyElement.replaceChildren(...children);
}
