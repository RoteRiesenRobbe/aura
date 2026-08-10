// Baseline utilities (plan-downtime.md D1): a small class of always-present
// abilities outside the skill catalog and the spellbook — Recall now, the
// mini-campfire with C2. The buttons live in #utilityBar between the aura and
// cooldown loadouts; they are not slots (nothing equips into them) and carry
// their tooltip through the SAME element every ability uses (attachTooltips),
// not a native title= attribute.
//
// `trigger` is the ONE definition of what a utility press does — shared by
// the click today and any future hotkey, the Interact.trigger shape.

import {UseUtilityMessage} from '../../backend/logic/messages/outgoing/UseUtilityMessage';
import {AuraApi} from '../../backend/logic/AuraApi';
import {campChargeCap} from '../../../client-data/Skills';
import {attachTooltips, showTooltip, TooltipContent} from '../../user-interface/HUD/logic/SkillTooltip';
import * as Flight from '../../flight/logic/Flight';
import * as AlertBanner from '../../user-interface/alert-banner/logic/AlertBanner';

// Display names for the pinned UtilityKind wire enum. Utilities are not
// catalog skills, so the cast bar cannot resolve them through
// skillDisplayName — this is its label source.
const UTILITY_NAMES: { [kind: number]: string } = {
    [AuraApi.UtilityKind.Recall]: 'Recall',
    [AuraApi.UtilityKind.Camp]: 'Camp',
    // The ascension ceremony's channel (plan-ascension.md C2a step 5). ⚑ There
    // is no button for it and there never will be: it is started by taking a
    // row at the stone, and this entry exists only so the cast bar has a label
    // while it winds up.
    [AuraApi.UtilityKind.Ascend]: 'Ascending',
};

export function utilityDisplayName(kind: number): string {
    return UTILITY_NAMES[kind] ?? 'Utility';
}

// Cast lengths, in seconds. ⚑ A MIRROR of skills/utility.go's UtilityDef
// literals — utilities are deliberately not catalog content (D1), so unlike a
// skill there is no /skills entry to read these from and no wire field
// carrying them. Two numbers, both [PLACEHOLDER], kept beside the names so a
// retune touches one place on this side.
const UTILITY_CAST_SECONDS: { [kind: number]: number } = {
    [AuraApi.UtilityKind.Recall]: 10,
    [AuraApi.UtilityKind.Camp]: 5,
};

// The live charge count and character level, pushed in by updateCampCharges
// from every snapshot. The tooltip is built at HOVER time so it reads whatever
// the last snapshot said, rather than whatever was true when the bar was wired.
let campCharges = 0;
let campLevel = 1;

// The counter's gold, so the tooltip's charge line and the button agree.
const CHARGE_COLOR = 'gold';

// The tooltip a utility button shows. Deliberately the same TooltipContent
// shape every ability uses — title, subtitle, labelled lines — so the two read
// as one vocabulary. The subtitle says what the CLASS is, standing where a
// skill prints "Cooldown · Lv 2/5": there is no level, and that absence is the
// point of the class (D1 — nothing to discover, level, slot or spend on).
function utilityTooltip(kind: number): TooltipContent | null {
    const name = UTILITY_NAMES[kind];
    if (!name) {
        return null;
    }
    const cast = `Cast time: ${UTILITY_CAST_SECONDS[kind].toFixed(1)}s ` +
        '(interrupted by damage or movement)';
    if (kind === AuraApi.UtilityKind.Recall) {
        return {
            title: name,
            subtitle: 'Utility · always available',
            lines: [
                {text: 'Returns you to the campfire you are bound to.'},
                {text: 'Rest at any campfire to bind it.'},
                {text: cast},
                {text: 'Free — no cost, no cooldown.'},
            ],
        };
    }
    return {
        title: name,
        subtitle: 'Utility · always available',
        lines: [
            {text: 'Places a small campfire that heals everyone standing in it.'},
            {text: 'It burns out shortly, protects nothing, and cannot be bound to.'},
            {text: cast},
            {text: `Charges: ${campCharges}/${campChargeCap(campLevel)}`, labelColor: CHARGE_COLOR},
            {text: 'Rest at a real campfire to refill. You carry more as you level.'},
        ],
    };
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
    // Refused mid-flight (plan-flight-paths.md §4.2): Recall would be a
    // teleport out of a committed flight (D11) and Camp would place a
    // mini-campfire in mid-air. The server refuses both — silently, as always —
    // so this only supplies the reason. It reads the Flight module directly
    // rather than routing through HUD, which keeps HUD ↔ Utilities from
    // becoming a cycle.
    if (Flight.isFlying()) {
        AlertBanner.show("Can't use abilities while flying", 'warning');
        return;
    }
    new UseUtilityMessage(kind).send();
}

/**
 * Render the Camp charge counter (plan-downtime.md C2). The server sends the
 * live COUNT only; the cap is derived here from the level the client already
 * knows, which is why there is no second wire field.
 *
 * An empty store greys the button — and unlike Recall, whose bind state the
 * client genuinely cannot see, this one it CAN, so the refusal is shown before
 * the press instead of only as floating text after it. The button stays
 * clickable on purpose: pressing it is how you learn why it is grey.
 */
export function updateCampCharges(charges: number, level: number) {
    campCharges = charges;
    campLevel = level;
    const button = document.querySelector<HTMLElement>('#utilityList > li[data-utility="2"]');
    if (!button) {
        return;
    }
    button.querySelector('.utilityCharges')!.textContent = `${charges}/${campChargeCap(level)}`;
    button.classList.toggle('outOfCharges', charges <= 0);
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
    // The same tooltip element, styling and placement every ability uses. The
    // buttons used to carry a native title= attribute, which was the only hover
    // in the HUD that looked like the browser rather than the game (PO
    // 2026-08-03).
    if (bar) {
        attachTooltips(bar, 'li[data-utility]', (entry) => {
            const content = utilityTooltip(Number(entry.dataset.utility));
            if (content) {
                showTooltip(entry, content);
            }
        });
    }
}
