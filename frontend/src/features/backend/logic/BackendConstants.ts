import {StatusEffect, StatusEffectDefinition} from '../../game-objects/logic/StatusEffect';
import {AuraApi} from './AuraApi';


export const statusEffectLookupTable: StatusEffectDefinition[] = [];

function initializeStatusEffectLookupTable() {
    for (let statusEffect in AuraApi.StatusEffect) {
        //noinspection JSUnfilteredForInLoop
        statusEffectLookupTable[AuraApi.StatusEffect[statusEffect]] = StatusEffect[statusEffect];
    }
}

export function setup() {
    initializeStatusEffectLookupTable();
}
