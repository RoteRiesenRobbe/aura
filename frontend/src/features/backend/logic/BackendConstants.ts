import {StatusEffect, StatusEffectDefinition} from '../../game-objects/logic/StatusEffect';
import {AuraApi} from './AuraApi';


export const statusEffectLookupTable: StatusEffectDefinition[] = [];

function initializeStatusEffectLookupTable() {
    for (let statusEffect in AuraApi.StatusEffect) {
        // A numeric enum object also carries the value → name reverse mapping;
        // without this filter the loop writes name-keyed undefined entries too
        // (BackendConstants.test.ts pins the table clean).
        if (typeof AuraApi.StatusEffect[statusEffect] !== 'number') {
            continue;
        }
        statusEffectLookupTable[AuraApi.StatusEffect[statusEffect]] = StatusEffect[statusEffect];
    }
}

export function setup() {
    initializeStatusEffectLookupTable();
}
