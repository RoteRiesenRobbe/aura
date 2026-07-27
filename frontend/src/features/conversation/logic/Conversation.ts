/**
 * The conversation panel (plan-entity-model.md chunk 3b-ii).
 *
 * Thin by design: all the navigation lives in the DOM-free ConversationModel
 * next door, which vitest covers. This file is the DOM half — render the view,
 * turn clicks into Interact messages.
 *
 * Two rules worth keeping in mind before editing:
 *
 *   · ⚑ `pointerdown`, never `click`. MouseManager registers a `mousedown`
 *     listener with preventDefault() on the document element, which suppresses
 *     the synthetic click — a `click` listener on a HUD panel silently never
 *     fires, and nothing in the source hints at it.
 *   · ⚑ The panel is STATE-DRIVEN. It appears and disappears because the server
 *     sends (or stops sending) a tree, never because this file decided to.
 *     Leave sends `close` and waits. That is what makes every server-side end
 *     condition — range, combat, death, disconnect — need no client counterpart.
 */

import {InteractMessage} from '../../backend/logic/messages/outgoing/InteractMessage';
import {
    ConversationModel,
    ConversationRow,
    ConversationTree,
    NO_GRANT,
} from './ConversationModel';

const model = new ConversationModel();

let panelElement: HTMLElement;
let actorElement: HTMLElement;
let linesElement: HTMLElement;
let rowsElement: HTMLElement;
let backElement: HTMLElement;
let leaveElement: HTMLElement;

/**
 * Signature of what is currently on screen, so an unchanged view re-renders
 * nothing.
 *
 * ⚑ Load-bearing, not an optimisation. The server re-sends the tree EVERY tick,
 * so without this the row list is torn down and rebuilt ~30×/second: `:hover`
 * never survives long enough to show, and a click can land in the gap between
 * the old `<li>` being detached and the new one being inserted. That last part
 * is not theoretical — it made the in-game harness drop clicks on about half its
 * runs, and it would do the same to a player with an unlucky mouse.
 */
let renderedSignature = '';

export function setup() {
    panelElement = document.getElementById('conversation');
    if (!panelElement) {
        return;
    }
    actorElement = panelElement.querySelector('.conversationActor');
    linesElement = panelElement.querySelector('.conversationLines');
    rowsElement = panelElement.querySelector('.conversationRows');
    backElement = panelElement.querySelector('.conversationBack');
    leaveElement = panelElement.querySelector('.conversationLeave');

    backElement.addEventListener('pointerdown', () => {
        model.back();
        render();
    });
    leaveElement.addEventListener('pointerdown', leave);
}

/**
 * Feed a snapshot's conversation field. Called every tick.
 *
 * @param tree the streamed tree, or null when the field is absent
 */
export function update(tree: ConversationTree | null) {
    model.update(tree);
    render();
}

/** Whether a panel is on screen — the interact key reads it to decide E's job. */
export function isOpen(): boolean {
    return model.entityId() !== 0;
}

/** The actor being talked to; 0 = none. The badge suppresses itself for this id. */
export function partnerId(): number {
    return model.entityId();
}

/**
 * Dismiss the panel: Leave, Escape, or a second E.
 *
 * ⚑ It does NOT hide anything. The server drops the session and the tree leaves
 * the next snapshot, which is what actually closes the panel — so the client can
 * never believe a conversation is closed while the server thinks otherwise.
 */
export function leave() {
    const id = model.entityId();
    if (id === 0) {
        return;
    }
    new InteractMessage(id, {close: true}).send();
}

function take(row: ConversationRow) {
    const id = model.entityId();
    const node = model.currentNodeId();

    // Navigate locally first, so the panel answers on the frame of the click.
    model.take(row);
    render();

    // Only a row that hands something over needs the server. ⚑ And it is sent
    // with the AUTHORED indices the server streamed, never the row's position on
    // screen (L21).
    if (row.grantIndex !== NO_GRANT) {
        new InteractMessage(id, {
            nodeId: node,
            optionIndex: row.optionIndex,
            grantIndex: row.grantIndex,
        }).send();
    }
}

function render() {
    if (!panelElement) {
        return;
    }
    const view = model.view();
    if (view === null) {
        if (renderedSignature !== '') {
            panelElement.classList.add('hidden');
            rowsElement.replaceChildren();
            renderedSignature = '';
        }
        return;
    }

    // Nothing visible changed — leave the DOM (and the row the player's cursor
    // is currently over) exactly where it is. See renderedSignature.
    const signature = JSON.stringify(view);
    if (signature === renderedSignature) {
        return;
    }
    renderedSignature = signature;

    panelElement.classList.remove('hidden');
    actorElement.textContent = view.actorName;
    linesElement.textContent = view.lines.join('\n');

    // Rebuilt wholesale each render rather than diffed: a tree is a handful of
    // rows, and rebuilding is what guarantees a taught row cannot linger with a
    // stale handler bound to it.
    const items = view.rows.map((row) => {
        const li = document.createElement('li');
        li.classList.toggle('locked', row.locked);

        const label = document.createElement('span');
        label.textContent = row.text;
        li.appendChild(label);

        // D20: name the wall on a locked row, so the panel reads as a signpost
        // ("come back at 7") rather than as something broken.
        if (row.locked) {
            const wall = document.createElement('span');
            wall.className = 'conversationWall';
            wall.textContent = `level ${row.requiredLevel}`;
            li.appendChild(wall);
        }

        li.addEventListener('pointerdown', () => take(row));
        return li;
    });
    rowsElement.replaceChildren(...items);

    // Back and Leave are automatic, never authored (D15) — content carries only
    // forward links, so nobody can author a dead end a player is stuck in.
    backElement.classList.toggle('hidden', !view.canGoBack);
}
