import {describe, expect, it} from 'vitest';
import {firstNames, generate, lastNames} from './NameGenerator';
import names from '../../../client-data/character-names.json';

// The server's rule (auth.ValidateCharacterName): 2-20 characters, letters or
// digits, single separators (space ' ’ - _) only between them. The pattern is
// the ASCII subset of that rule (stricter, so a match always passes it).
const SERVER_MAX_LENGTH = 20;
const SERVER_SHAPE = /^[A-Za-z0-9]+(?:[ '’\-_][A-Za-z0-9]+)*$/;

describe('NameGenerator', () => {
    it('suggests from both first-name lists', () => {
        expect(names.femaleFirstNames.length).toBeGreaterThan(0);
        for (const name of [...names.maleFirstNames, ...names.femaleFirstNames]) {
            expect(firstNames).toContain(name);
        }
    });

    it('every combination passes the server name rule uncut', () => {
        for (const first of firstNames) {
            for (const last of lastNames) {
                const name = first + ' ' + last;
                expect(name.length, name).toBeLessThanOrEqual(SERVER_MAX_LENGTH);
                expect(name, name).toMatch(SERVER_SHAPE);
            }
        }
    });

    it('lists no name twice', () => {
        expect(new Set(firstNames).size).toBe(firstNames.length);
        expect(new Set(lastNames).size).toBe(lastNames.length);
    });

    it('generates first + space + last', () => {
        const [first, last] = generate().split(' ');
        expect(firstNames).toContain(first);
        expect(lastNames).toContain(last);
    });
});
