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
import {Countdown, startConfirmCountdown} from '../../common/logic/ConfirmCountdown';
import {attachSkillTooltips} from '../../user-interface/HUD/logic/SkillTooltip';
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

    // Hovering a row that names an ability shows the spellbook's own tooltip
    // (plan-ascension.md §13.7 item 3). Delegated on the stable container, so it
    // survives the wholesale row rebuild in render().
    //
    // ⚑ ALWAYS LEVEL 1, not the player's current level in it. A reward row
    // answers "what would I get", and what a pick hands over is the skill at
    // level 1. For an ascension reward the player provably does not hold it,
    // and a teach_skill row for a skill they DO hold is omitted from the tree
    // entirely rather than shown.
    attachSkillTooltips(rowsElement, () => 1);
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

    // ⭐ AN IRREVERSIBLE ROW IS HELD BEHIND A COUNTDOWN (D21). Nothing is
    // navigated and nothing is sent until the player confirms, because both of
    // those are how the panel normally says "done" — and this row is not done
    // until they have read what it costs.
    if (row.confirmSeconds > 0 && !row.locked) {
        askToConfirm(row, id, node);
        return;
    }

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

let confirmCountdown: Countdown | null = null;

/**
 * Put the delete dialog's countdown in front of an irreversible row.
 *
 * ⚑ The body is composed from what the panel ALREADY holds: the node's lines
 * are the loss list the author wrote, and the row's text is what is being
 * chosen. Nothing extra travels for it, which is why the wire field is one byte
 * rather than a second string.
 */
function askToConfirm(row: ConversationRow, id: number, node: string): void {
    const root = document.getElementById('confirmRow');
    if (!root) {
        return;
    }
    const view = model.view();
    const body = root.querySelector('.confirmRowBody') as HTMLElement;
    body.textContent = `${(view?.lines ?? []).join(' ')}\n\n${row.text}`;

    const confirm = root.querySelector('.confirmRowConfirm') as HTMLElement;
    const cancel = root.querySelector('.confirmRowCancel') as HTMLElement;

    const close = () => {
        confirmCountdown?.stop();
        confirmCountdown = null;
        root.classList.add('hidden');
        confirm.onpointerdown = null;
        cancel.onpointerdown = null;
    };

    cancel.onpointerdown = (event) => {
        event.preventDefault();
        close();
    };
    confirm.onpointerdown = (event) => {
        event.preventDefault();
        // The countdown is still running: the button says so, and pressing it
        // early does nothing rather than being swallowed silently later.
        if (confirm.classList.contains('disabled')) {
            return;
        }
        close();
        model.take(row);
        render();
        new InteractMessage(id, {
            nodeId: node,
            optionIndex: row.optionIndex,
            grantIndex: row.grantIndex,
        }).send();
    };

    confirmCountdown?.stop();
    confirmCountdown = startConfirmCountdown(confirm, 'Confirm');
    root.classList.remove('hidden');
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

        // The hover tooltip's anchor, read by the delegated handler wired in
        // setup(). ⚑ Set on LOCKED rows too: knowing what is behind a named
        // gate is the point of showing the gate at all (§13.7 item 3), and it is
        // the one place where this row and the inert-on-click rule diverge.
        if (row.skillId > 0) {
            li.dataset.skillId = String(row.skillId);
        }

        const label = document.createElement('span');
        label.textContent = row.text;
        li.appendChild(label);

        // D20: name the wall on a locked row, so the panel reads as a signpost
        // ("come back at 7") rather than as something broken. Q1/R1: that IS
        // the whole answer — a locked row gets no handler, so clicking it does
        // nothing (model.take() guards the same way, the belt to this braces).
        //
        // ⚑ THE WALL IS ONLY DRAWN FOR A LEVEL WALL. `requiredLevel` is the
        // teach_skill gate and nothing else, so a row locked for any other
        // reason carries 0 — and an unconditional wall then reads "level 0"
        // beside a row that has already named its own requirement. That is what
        // an ascension reward gated on `bloodline_ascensions` looks like
        // (plan-ascension.md D18): the server composes "3 ascensions in this
        // line (0/3)" into the row's own text, because the wire deliberately
        // never bought a second field for it.
        if (row.locked) {
            if (row.requiredLevel > 0) {
                const wall = document.createElement('span');
                wall.className = 'conversationWall';
                wall.textContent = `level ${row.requiredLevel}`;
                li.appendChild(wall);
            }
        } else {
            li.addEventListener('pointerdown', () => take(row));
        }
        return li;
    });

    // The synthetic "Leave." row (Q1 §4.3): last, only at root, doing exactly
    // what ✕ does. It is not a server row — no indices, and its handler is
    // leave(), never take(): leave() mutates nothing and waits for the server
    // to drop the tree, which is the one close path.
    if (view.showLeave) {
        const li = document.createElement('li');
        li.className = 'conversationLeaveRow';
        li.textContent = 'Leave.';
        li.addEventListener('pointerdown', leave);
        items.push(li);
    }
    rowsElement.replaceChildren(...items);

    // Back and Leave are automatic, never authored (D15) — content carries only
    // forward links, so nobody can author a dead end a player is stuck in.
    backElement.classList.toggle('hidden', !view.canGoBack);
}
