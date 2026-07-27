import {describe, it, expect} from 'vitest';
import {Badgeable, retargetInteractBadge} from './InteractBadgeTargeting';

/** A game object that records every setInteractable call it receives. */
function fakeEntity(): Badgeable & { calls: boolean[] } {
    const calls: boolean[] = [];
    return {calls, setInteractable: (v: boolean) => calls.push(v)};
}

function lookupOf(entities: Record<number, Badgeable>) {
    return (id: number) => entities[id] ?? null;
}

describe('retargetInteractBadge', () => {
    it('lights the actor the server named', () => {
        const farmer = fakeEntity();

        const next = retargetInteractBadge(0, 7, lookupOf({7: farmer}));

        expect(next).toBe(7);
        expect(farmer.calls).toEqual([true]);
    });

    it('clears the previous actor when the server names a different one', () => {
        const farmer = fakeEntity();
        const hermit = fakeEntity();

        const next = retargetInteractBadge(7, 9, lookupOf({7: farmer, 9: hermit}));

        expect(next).toBe(9);
        expect(farmer.calls).toEqual([false]);
        expect(hermit.calls).toEqual([true]);
    });

    // Walking away is the case the whole field exists for: 0 means nobody, and
    // the badge has to go out rather than linger on whoever wore it last.
    it('clears the badge when nobody is in range', () => {
        const farmer = fakeEntity();

        const next = retargetInteractBadge(7, 0, lookupOf({7: farmer}));

        expect(next).toBe(0);
        expect(farmer.calls).toEqual([false]);
    });

    // The badge is live state, re-sent every tick. An actor that left the
    // viewport and came back is a NEW game object with no badge on it, so an
    // unchanged id must still re-apply.
    it('re-applies an unchanged id so a rebuilt entity regains its badge', () => {
        const rebuilt = fakeEntity();

        const next = retargetInteractBadge(7, 7, lookupOf({7: rebuilt}));

        expect(next).toBe(7);
        expect(rebuilt.calls).toEqual([true]);
        expect(rebuilt.calls).not.toContain(false);
    });

    // The server's viewport and the client's tracked set are not identical, so
    // an id the client cannot resolve is ordinary, not an error.
    it('survives an entity the client is not tracking', () => {
        expect(() => retargetInteractBadge(0, 7, lookupOf({}))).not.toThrow();
        expect(retargetInteractBadge(0, 7, lookupOf({}))).toBe(7);
    });

    // Props and corpses ride the same lookup and have no such method.
    it('survives an entity that cannot wear a badge', () => {
        const tree: Badgeable = {};

        expect(() => retargetInteractBadge(0, 7, lookupOf({7: tree}))).not.toThrow();
    });
});
