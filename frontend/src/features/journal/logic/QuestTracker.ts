/**
 * The quest tracker (2026-08-23): the always-on strip on the right edge, under
 * the map button - the journal button's new desktop home plus one chrome box
 * per running quest showing its last objective line. Thin like Journal.ts: the
 * view lives in questTrackerRows (JournalModel.ts, vitest-covered), this file
 * renders it and turns clicks into journal openings.
 *
 * Three rules inherited from the journal, still load-bearing here:
 *
 *   · ⚑ `pointerdown`, never `click` - MouseManager preventDefaults `mousedown`
 *     on the document element, which suppresses the synthetic click.
 *   · ⚑ The signature check is not an optimisation: the ledger is re-sent
 *     every tick, so without it the rows are torn down and rebuilt ~30x/second
 *     and a click can land in the gap.
 *   · CONTENT is the server's: a quest leaves the tracker because it left the
 *     ledger on the wire, exactly like the journal.
 *
 * Mobile has no tracker (HUD.mobile.less hides it): the ☰ sheet keeps its own
 * #journalButton row, which is why that element still exists in #leftColumn -
 * see the markup comment on #questTracker.
 */

import * as Journal from './Journal';
import {questTrackerRows, QuestProgress} from './JournalModel';

let trackerElement: HTMLElement;
let listElement: HTMLElement;

let renderedSignature = '';

export function setup() {
    trackerElement = document.getElementById('questTracker');
    if (!trackerElement) {
        return;
    }
    listElement = document.getElementById('questTrackerList');

    document.getElementById('questTrackerJournal')
        ?.addEventListener('pointerdown', Journal.toggle);
}

/** Feed a snapshot's quest ledger. Called every tick, beside Journal.update. */
export function update(progress: QuestProgress[]) {
    if (!trackerElement) {
        return;
    }

    const rows = questTrackerRows(progress, Journal.journalCatalog);
    const signature = JSON.stringify(rows);
    if (signature === renderedSignature) {
        return;
    }
    renderedSignature = signature;

    listElement.classList.toggle('hidden', rows.length === 0);

    // Rebuilt wholesale rather than diffed, the journal list's rule: a handful
    // of quests, and rebuilding guarantees an abandoned quest's row cannot
    // linger with a stale handler bound to it.
    const items = rows.map((row) => {
        const li = document.createElement('li');
        li.className = 'questTrackerQuest';

        const title = document.createElement('div');
        title.className = 'questTrackerTitle';
        title.textContent = row.title;
        li.appendChild(title);

        if (row.line !== null) {
            const line = document.createElement('div');
            line.className = 'questTrackerLine';
            line.textContent = row.line;
            li.appendChild(line);
        }

        li.addEventListener('pointerdown', () => Journal.openQuest(row.questId));
        return li;
    });
    listElement.replaceChildren(...items);
}
