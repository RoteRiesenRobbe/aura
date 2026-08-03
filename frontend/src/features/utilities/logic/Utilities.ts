// Baseline utilities (plan-downtime.md D1): a small class of always-present
// abilities outside the skill catalog and the spellbook — Recall now, the
// mini-campfire with C2. The buttons live in #utilityBar between the aura and
// cooldown loadouts; they are not slots (nothing equips into them) and carry
// their tooltip as a title= attribute, the helpButton convention.
//
// `trigger` is the ONE definition of what a utility press does — shared by
// the click today and any future hotkey, the Interact.trigger shape.

import {UseUtilityMessage} from '../../backend/logic/messages/outgoing/UseUtilityMessage';
import {AuraApi} from '../../backend/logic/AuraApi';

// Display names for the pinned UtilityKind wire enum. Utilities are not
// catalog skills, so the cast bar cannot resolve them through
// skillDisplayName — this is its label source.
const UTILITY_NAMES: { [kind: number]: string } = {
    [AuraApi.UtilityKind.Recall]: 'Recall',
};

export function utilityDisplayName(kind: number): string {
    return UTILITY_NAMES[kind] ?? 'Utility';
}

/**
 * Press a baseline utility. Fire-and-forget: the server validates the kind,
 * runs the precondition (Recall refuses without a bound campfire — the
 * rejection comes back as the usual floating text) and owns the cast.
 */
export function trigger(kind: number) {
    if (!UTILITY_NAMES[kind]) {
        return;
    }
    new UseUtilityMessage(kind).send();
}

export function setup() {
    const bar = document.getElementById('utilityList');
    // pointerdown, not click — MouseManager preventDefaults mousedown on the
    // document element, which suppresses the synthetic click.
    bar?.addEventListener('pointerdown', (event) => {
        const button = (event.target as HTMLElement).closest('li[data-utility]') as HTMLElement | null;
        if (!button) {
            return;
        }
        trigger(Number(button.dataset.utility));
    });
}
