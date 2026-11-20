/**
 * The ascension stone's look step in the conversation panel
 * (plan-ascension-ceremony.md D8): the look picker's third mount, one slot
 * only, in place of the node's rows.
 *
 * ⚑ It lives INSIDE the conversation panel, never as a panel of its own:
 * opening a member of the exclusive panel family closes the conversation,
 * and the server throws the draft away with it.
 *
 * A tile press only SELECTS (the preview follows); "Take this look." sends the
 * selected item's row and "No new look." the skip row, both through the
 * panel's ordinary take(), so the server's index and the walk's Next are the
 * rows' own. Back is the panel's button. The selection is the panel's local
 * state: the tree is resent every tick and must not wipe it.
 */

import {AppearanceSlot, appearanceCatalog, itemAtFlat} from '../../../client-data/Appearance';
import {Look, renderLookPicker} from '../../user-interface/account-screens/logic/LookPicker';
import {t} from '../../localization/logic/Locale';
import {ConversationRow} from './ConversationModel';
import {onRowPress} from './RowPress';

/** A look step's rows, split: one per offered item, and the skip row. */
export interface LookStepRows {
    slot: AppearanceSlot | null;
    /** Item id → the row that takes it. */
    looks: Map<string, ConversationRow>;
    skip: ConversationRow | undefined;
}

export function lookStepRows(rows: ConversationRow[]): LookStepRows {
    const out: LookStepRows = {slot: null, looks: new Map(), skip: undefined};
    for (const row of rows) {
        if (row.appearance === 0) {
            out.skip = row;
            continue;
        }
        const found = itemAtFlat(row.appearance - 1);
        if (found) {
            out.slot = found.slot;
            out.looks.set(found.item.id, row);
        }
    }
    return out;
}

/**
 * The step's list items: the picker, then the take row and the skip row.
 *
 * @param worn the look the character wears, which the preview starts from
 * @param selected the selected item's id, '' for none
 */
export function lookStepItems(rows: ConversationRow[], worn: Look, selected: string,
                              onSelect: (id: string) => void,
                              onTake: (row: ConversationRow) => void): HTMLLIElement[] {
    const step = lookStepRows(rows);
    const catalog = appearanceCatalog();
    const items: HTMLLIElement[] = [];
    if (catalog && step.slot) {
        const slot = step.slot;
        const picker = document.createElement('li');
        picker.className = 'conversationLookStep lookPicker';
        picker.innerHTML = `<div class="lookPreview"></div><div class="lookOptions" data-slot="${slot}"></div>`;
        const choice = step.looks.has(selected) ? selected : '';
        renderLookPicker(picker, catalog, {...worn, [slot]: choice || worn[slot]},
            look => onSelect(look[slot]), {shown: item => step.looks.has(item.id)});
        items.push(picker);

        const take = document.createElement('li');
        take.className = 'conversationLookTake';
        const row = step.looks.get(choice);
        take.classList.toggle('locked', !row);
        take.textContent = row ? t('conversation.ascend.take-look') : t('conversation.ascend.pick-a-look');
        if (row) {
            onRowPress(take, () => onTake(row));
        }
        items.push(take);
    }
    if (step.skip) {
        const skip = document.createElement('li');
        skip.className = 'conversationLookSkip';
        skip.textContent = step.skip.text;
        const row = step.skip;
        onRowPress(skip, () => onTake(row));
        items.push(skip);
    }
    return items;
}
