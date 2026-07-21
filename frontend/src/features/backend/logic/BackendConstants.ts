import {Items} from '../../items/logic/Items';
import {StatusEffect, StatusEffectDefinition} from '../../game-objects/logic/StatusEffect';
import {AuraApi} from './AuraApi';


export const NONE_ITEM_ID = 0;
export const itemLookupTable = [];

function initializeItemLookupTable() {
    itemLookupTable[NONE_ITEM_ID] = null;
    for (let itemName in Items) {
        //noinspection JSUnfilteredForInLoop
        let item = Items[itemName];
        itemLookupTable[item.id] = item;
    }
}

export const statusEffectLookupTable: StatusEffectDefinition[] = [];

function initializeStatusEffectLookupTable() {
    for (let statusEffect in AuraApi.StatusEffect) {
        //noinspection JSUnfilteredForInLoop
        statusEffectLookupTable[AuraApi.StatusEffect[statusEffect]] = StatusEffect[statusEffect];
    }
}

export function setup() {
    initializeItemLookupTable();
    initializeStatusEffectLookupTable();
}
