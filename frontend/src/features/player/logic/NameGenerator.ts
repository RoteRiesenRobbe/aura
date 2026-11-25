import {randomInt} from '../../common/logic/Utils';
import names from '../../../client-data/character-names.json';

/**
 * The suggested name on the character creation screen: a first name from
 * either list, a space, a last name (plan-vertical-slice.md PF4, F2). The lists
 * live in `client-data/character-names.json`; its test checks that every
 * combination passes the server's name rule, so a suggestion is never cut.
 */
export const firstNames: readonly string[] = [...names.maleFirstNames, ...names.femaleFirstNames];
export const lastNames: readonly string[] = names.lastNames;

function randomElement(array: readonly string[]): string {
    return array[randomInt(0, array.length)];
}

export function generate(): string {
    return randomElement(firstNames) + ' ' + randomElement(lastNames);
}
