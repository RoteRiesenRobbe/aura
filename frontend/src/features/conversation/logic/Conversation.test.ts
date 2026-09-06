/**
 * The DOM half's one piece of lifecycle logic worth pinning: an armed
 * #confirmRow must die WITH the conversation (feedback 2026-08-30, ruled
 * fix-now). The panel itself is server-driven - the tree leaving the snapshot
 * is the close - and the confirm row used to be closed only by its own
 * Cancel/Confirm buttons, so walking away from the ascension stone left the
 * armed countdown on screen with no conversation behind it.
 *
 * Navigation/browsing logic stays in ConversationModel.test.ts; this file
 * drives the module through its public update() exactly as a snapshot would.
 */
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import * as Conversation from './Conversation';
import {ConversationTree} from './ConversationModel';
import {showTooltip} from '../../user-interface/HUD/logic/SkillTooltip';

function buildDom(): void {
    document.body.innerHTML = `
        <div id="conversation" class="hidden">
            <div class="conversationActor"></div>
            <div class="conversationLines"></div>
            <ul class="conversationRows"></ul>
            <div class="conversationBack"></div>
            <div class="conversationLeave"></div>
        </div>
        <div id="confirmRow" class="hidden">
            <div class="confirmRowBody"></div>
            <div class="confirmRowControls">
                <a class="confirmRowCancel"></a>
                <a class="confirmRowConfirm"></a>
            </div>
        </div>`;
}

/**
 * A one-node tree whose single row is irreversible (confirmSeconds > 0). With
 * `skillId` set it doubles as a teaching row, which is what carries the hover
 * tooltip's anchor (`data-skill-id`).
 */
function irreversibleTree(skillId = 0): ConversationTree {
    return {
        entityId: 7,
        actorName: 'Ascension Stone',
        entryNode: 'root',
        nodes: [{
            id: 'root',
            lines: ['This cannot be undone.'],
            rows: [{
                optionIndex: 0,
                grantIndex: 0,
                text: 'Ascend.',
                next: '',
                locked: false,
                requiredLevel: 0,
                reply: '',
                confirmSeconds: 5,
                skillId,
            }],
        }],
    };
}

describe('Conversation - the armed confirm row', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        buildDom();
        Conversation.setup();
        // Module state survives across specs and the render signature dedupes
        // against the PREVIOUS test's DOM - drive the module to its closed
        // state so the next update() renders into the rebuilt document.
        Conversation.update(null);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function armConfirmRow(): HTMLElement {
        Conversation.update(irreversibleTree());
        const row = document.querySelector(
            '#conversation .conversationRows > li') as HTMLElement;
        expect(row).not.toBeNull();
        row.dispatchEvent(new Event('pointerdown'));
        const confirmRow = document.getElementById('confirmRow');
        expect(confirmRow.classList.contains('hidden')).toBe(false);
        return confirmRow;
    }

    it('arms behind the countdown instead of sending', () => {
        armConfirmRow();
        // The panel is still open behind it - arming navigates nothing.
        expect(document.getElementById('conversation')
            .classList.contains('hidden')).toBe(false);
    });

    it('closes with the conversation when the tree leaves the snapshot', () => {
        const confirmRow = armConfirmRow();

        // The server drops the tree (range, combat, death, disconnect).
        Conversation.update(null);

        expect(document.getElementById('conversation')
            .classList.contains('hidden')).toBe(true);
        expect(confirmRow.classList.contains('hidden')).toBe(true);
        // The countdown and its handlers must be disarmed too, or the interval
        // keeps mutating a hidden button forever.
        const confirm = confirmRow.querySelector(
            '.confirmRowConfirm') as HTMLElement;
        expect(confirm.onpointerdown).toBeNull();
    });
});

/**
 * The second orphan of the same shape (feedback 2026-09-02, ruled A): a
 * teaching row's hover tooltip. `attachTooltips` hides on `pointerout` and
 * `pointerdown`, but when the LAST taught skill is taken the server closes the
 * conversation and the closed branch removes the rows - a removed element
 * fires no `pointerout`, so nothing hid it. The tooltip is shown through its
 * public surface here rather than by hovering: the catalog fetch is stubbed to
 * reject in vitest, so a `pointerover` degrades straight to hide and there
 * would be nothing on screen to orphan.
 */
describe('Conversation - the hover tooltip', () => {
    beforeEach(() => {
        buildDom();
        Conversation.setup();
        Conversation.update(null);
    });

    it('hides with the conversation when the tree leaves the snapshot', () => {
        Conversation.update(irreversibleTree(7));
        const row = document.querySelector(
            '#conversation .conversationRows > li[data-skill-id="7"]') as HTMLElement;
        expect(row).not.toBeNull();
        showTooltip(row, {title: 'Strong', subtitle: 'Passive', lines: []});
        const tooltip = document.getElementById('skillTooltip');
        expect(tooltip.classList.contains('hidden')).toBe(false);

        // The server drops the tree under a stationary pointer.
        Conversation.update(null);

        expect(tooltip.classList.contains('hidden')).toBe(true);
    });
});
