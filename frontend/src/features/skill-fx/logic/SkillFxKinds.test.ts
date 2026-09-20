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

    // C2b filled in the last three (cast-pose, orbit, emitter), so the `stub`
    // flag and its two cases are gone: every registered kind draws. What a kind
    // draws needs Pixi Graphics and a stage, which is the harness's job
    // (.claude/skills/verify/skill-fx.mjs), not a jsdom unit's.
    it('registers a real handler for every one of them', () => {
        for (const kind of VISUAL_KINDS) {
            expect(typeof KIND_REGISTRY[kind].spawn).toBe('function');
        }
    });
});
