// The interact verb's two entry points (chunk 3b-i built the key; this adds
// the mobile button, 2026-08-02).
//
// `trigger` is the ONE definition of what an interact press does — the E key
// and the on-screen button both call it, so the two can never drift on the
// second-press-closes rule or on the empty-offer guard. Same shape as the
// aura slots, where `toggleAuraSlot` is shared by the hotkey and the click.
//
// The button exists because a phone has no E: the PO ruling 2026-08-02 is that
// on mobile the badge over the actor's head is replaced by a button at the
// bottom right, not accompanied by one. Backend suppresses the badge on mobile
// at the same site that drives this — see Backend.applyGameState.

import * as Conversation from '../../conversation/logic/Conversation';
import {InteractMessage} from '../../backend/logic/messages/outgoing/InteractMessage';
import {isMobile} from '../../user-interface/logic/Mobile';

let buttonElement: HTMLElement;
// The offer the button would act on — mirrors what the badge is drawn on, so
// the button and the badge can never point at different actors.
let offeredEntityId = 0;

/**
 * Perform an interact press against `target` (0 = nobody offered).
 *
 * A press while a conversation is open CLOSES it (chunk 3b-ii, D21) — the same
 * control that opened it, which is what players reach for first.
 */
export function trigger(target: number) {
    if (Conversation.isOpen()) {
        Conversation.leave();
        return;
    }
    if (target !== 0) {
        new InteractMessage(target).send();
    }
}

export function setupButton() {
    // Desktop has the key and the badge; the button is never shown there, so
    // it registers no listener at all.
    if (!isMobile()) {
        return;
    }
    buttonElement = document.getElementById('interactButton');
    // pointerdown, not click — MouseManager preventDefaults mousedown on the
    // document element, which suppresses the synthetic click.
    buttonElement?.addEventListener('pointerdown', () => trigger(offeredEntityId));
}

/**
 * Show or hide the button for the actor currently being offered.
 *
 * `id` is the BADGED id, not the raw offer: it already has the "my own panel
 * is open" suppression applied. The extra isOpen() check covers the other
 * case — a second actor in range while a panel is open — where the button
 * would otherwise sit on top of the conversation it cannot help with.
 */
export function updateButton(id: number) {
    offeredEntityId = id;
    if (!buttonElement) {
        return;
    }
    const show = id !== 0 && !Conversation.isOpen();
    buttonElement.classList.toggle('hidden', !show);
}
