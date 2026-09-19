import {describe, expect, it} from 'vitest';
import {readFileSync} from 'fs';
import {KIND_REGISTRY, VISUAL_KINDS} from './SkillFxKinds';

// The registry IS the closed vocabulary (§7.2), so it is pinned against the
// authored fixture in BOTH directions: a kind the content loader accepts but
// the client cannot draw, and a client kind no content can ever name, are both
// failures - and the SharedConstants.test.ts precedent says a one-way pin
// catches only half of them.
//
// vitest runs with cwd = frontend/, the same repo-relative read that file uses.
const vocabulary = JSON.parse(readFileSync('../api/skill-vocabulary.json', 'utf-8'));

describe('the kind registry', () => {
    it('holds exactly the authored visualKinds', () => {
        expect(Object.keys(KIND_REGISTRY).sort()).toEqual([...vocabulary.visualKinds].sort());
    });

    it('lists the same seven names it registers', () => {
        expect([...VISUAL_KINDS].sort()).toEqual(Object.keys(KIND_REGISTRY).sort());
    });

    it('builds impact, strike, projectile and beam for real, and stubs the rest', () => {
        // C2a's scope, asserted so C2b's first change is visible here.
        const real = Object.keys(KIND_REGISTRY).filter(k => !KIND_REGISTRY[k].stub).sort();
        expect(real).toEqual(['beam', 'impact', 'projectile', 'strike']);
    });

    it('draws nothing for a stub rather than throwing', () => {
        expect(KIND_REGISTRY['orbit'].spawn(null as any)).toBeNull();
    });
});
