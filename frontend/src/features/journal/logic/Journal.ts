/**
 * The journal panel (plan-quests.md chunk C3, D7/D16).
 *
 * Thin by design, like the conversation panel: the view model lives in the
 * DOM-free JournalModel next door, which vitest covers. This file renders it and
 * turns clicks into AbandonQuest messages.
 *
 * Three rules worth knowing before editing:
 *
 *   · ⚑ `pointerdown`, never `click`. MouseManager preventDefaults `mousedown`
 *     on the document element, which suppresses the synthetic click — a `click`
 *     listener on a HUD panel silently never fires.
 *   · ⚑ VISIBILITY is the client's (J, the HUD button, ✕, Escape); CONTENT is
 *     the server's. The panel opens because the player asked, but a quest leaves
 *     it because it left the ledger on the wire — abandoning hides nothing
 *     locally, exactly like the conversation panel's close.
 *   · ⚑ The signature check is load-bearing, not an optimisation: the ledger is
 *     re-sent every tick, so without it the abandon rows are torn down and
 *     rebuilt ~30×/second and a click can land in the gap between the old row
 *     being detached and the new one inserted.
 */

import {AbandonQuestMessage} from '../../backend/logic/messages/outgoing/AbandonQuestMessage';
import {catalogState, questDefinition, stageJournal} from '../../../client-data/Quests';
import {JournalCatalog, JournalModel, QuestProgress, JournalQuestView} from './JournalModel';

// The real catalog, adapted to the model's narrow port. The model takes this
// injected so it stays fetch-free and unit-testable.
const catalog: JournalCatalog = {
    state: () => catalogState(),
    title: (questId) => questDefinition(questId)?.title,
    stageJournal,
};

const model = new JournalModel(catalog);

let panelElement: HTMLElement;
let runningElement: HTMLElement;
let completedElement: HTMLElement;
let statusElement: HTMLElement;
let buttonElement: HTMLElement;

let open = false;
let renderedSignature = '';

export function setup() {
    panelElement = document.getElementById('journal');
    if (!panelElement) {
        return;
    }
    runningElement = panelElement.querySelector('.journalRunning');
    completedElement = panelElement.querySelector('.journalCompleted');
    statusElement = panelElement.querySelector('.journalStatus');

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

    renderSection(runningElement, view.running, true);
    renderSection(completedElement, view.completed, false);
}

function renderSection(section: HTMLElement, quests: JournalQuestView[], running: boolean) {
    section.classList.toggle('hidden', quests.length === 0);
    const list = section.querySelector('.journalQuests');

    // Rebuilt wholesale rather than diffed: a journal is a handful of quests,
    // and rebuilding is what guarantees an abandoned quest's row cannot linger
    // with a stale handler bound to it.
    const items = quests.map((quest) => {
        const li = document.createElement('li');
        li.className = 'journalQuest';

        const title = document.createElement('div');
        title.className = 'journalQuestTitle';
        title.textContent = quest.title;
        li.appendChild(title);

        for (const entry of quest.entries) {
            const p = document.createElement('p');
            p.className = 'journalEntry';
            p.textContent = entry;
            li.appendChild(p);
        }

        // Only a running quest can be given up — a completed one is sealed
        // forever (D13), so it gets no row to click.
        if (running) {
            const button = document.createElement('span');
            button.className = 'journalAbandon';
            button.textContent = 'Abandon';
            button.addEventListener('pointerdown', () => abandon(quest.questId));
            li.appendChild(button);
        }

        return li;
    });
    list.replaceChildren(...items);
}
