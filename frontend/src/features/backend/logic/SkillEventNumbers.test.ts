import {describe, it, expect} from 'vitest';
import {AuraApi} from './AuraApi';
import {SkillEventData, skillEventNumber} from './SkillEventNumbers';

const OWN = 7;
const MOB = 11;
const OTHER_PLAYER = 22;
const MY_SUMMON = 33;

/** A landed hit; every field overridable, so each test states only its point. */
function hit(overrides: Partial<SkillEventData> = {}): SkillEventData {
    return {
        source: OWN,
        victim: MOB,
        skillId: 1,
        amount: 12,
        kind: AuraApi.HitKind.Damage,
        fired: false,
        ...overrides,
    };
}

describe('skillEventNumber', () => {
    it('draws what the own player dealt, on the victim', () => {
        expect(skillEventNumber(OWN, hit(), 0))
            .toEqual({target: 'victim', kind: 'damage'});
    });

    it('draws what the own player took', () => {
        expect(skillEventNumber(OWN, hit({source: MOB, victim: OWN}), 0))
            .toEqual({target: 'victim', kind: 'damage'});
    });

    it('pops a crit big', () => {
        expect(skillEventNumber(OWN, hit({kind: AuraApi.HitKind.Crit}), 0))
            .toEqual({target: 'victim', kind: 'crit'});
    });

    it('draws a heal', () => {
        expect(skillEventNumber(OWN, hit({kind: AuraApi.HitKind.Heal}), 0))
            .toEqual({target: 'victim', kind: 'heal'});
    });

    // A summon is a separate entity, so its hits carry ITS id as the source
    // (C2 wants the VFX to start at the summon). The credit rides on the
    // source entity's owner_id instead (D6 + §12a.5).
    it('draws what the own player\'s summon dealt', () => {
        expect(skillEventNumber(OWN, hit({source: MY_SUMMON}), OWN))
            .toEqual({target: 'victim', kind: 'damage'});
    });

    // The whole point of D6: a five-player fight used to be a wall of numbers
    // nobody owned.
    it('draws nothing for another player\'s hit on a mob', () => {
        expect(skillEventNumber(OWN, hit({source: OTHER_PLAYER}), 0)).toBeNull();
    });

    it('draws nothing for another player\'s summon', () => {
        expect(skillEventNumber(OWN, hit({source: MY_SUMMON}), OTHER_PLAYER)).toBeNull();
    });

    it('draws nothing for a mob hitting another mob', () => {
        expect(skillEventNumber(OWN, hit({source: MOB, victim: 12}), 0)).toBeNull();
    });

    // A world mob has owner_id 0, and so does an entity the client holds no
    // owner for. Neither may collide with a caller that has no own id yet.
    it('draws nothing when the source is unowned and nobody is the own player', () => {
        expect(skillEventNumber(0, hit({source: MOB, victim: 12}), 0)).toBeNull();
        expect(skillEventNumber(0, hit({source: MOB, victim: 12}), undefined)).toBeNull();
    });

    // Source AND victim are the own player. One event, one number - the rule
    // returns a single draw, so a self heal cannot double up.
    it('draws a self heal once', () => {
        expect(skillEventNumber(OWN, hit({source: OWN, victim: OWN, kind: AuraApi.HitKind.Heal}), 0))
            .toEqual({target: 'victim', kind: 'heal'});
    });

    it('draws the Immune label for a fully mitigated own hit', () => {
        expect(skillEventNumber(OWN, hit({kind: AuraApi.HitKind.Immune, amount: 0}), 0))
            .toEqual({target: 'victim', kind: 'immune'});
    });

    it('draws no Immune label for somebody else\'s mitigated hit', () => {
        expect(skillEventNumber(OWN, hit({source: OTHER_PLAYER, kind: AuraApi.HitKind.Immune, amount: 0}), 0))
            .toBeNull();
    });

    // C1 keeps today's behaviour: a hit the shield ate whole shows the bar
    // dropping and no number.
    it('draws the Absorbed word for an own-caused fully absorbed hit', () => {
        expect(skillEventNumber(OWN, hit({kind: AuraApi.HitKind.Absorb, amount: 9}), 0))
            .toEqual({target: 'victim', kind: 'absorbed'});
    });

    it('draws nothing for a fully absorbed hit that is nobody of ours', () => {
        expect(skillEventNumber(OWN, hit({source: 501, victim: 502, kind: AuraApi.HitKind.Absorb, amount: 9}), 0))
            .toBeNull();
    });

    // FIRED is the cast beat; nothing is drawn for it until C2a gives it VFX.
    it('draws nothing for a fired event', () => {
        expect(skillEventNumber(OWN, hit({victim: 0, amount: 0, fired: true}), 0)).toBeNull();
    });

    // hpToDisplay floors at 1, so a zero-amount landing would otherwise print
    // a "1" nothing caused. Immune is the only zero that draws.
    it('draws nothing for a zero amount', () => {
        expect(skillEventNumber(OWN, hit({amount: 0}), 0)).toBeNull();
        expect(skillEventNumber(OWN, hit({amount: 0, kind: AuraApi.HitKind.Crit}), 0)).toBeNull();
        expect(skillEventNumber(OWN, hit({amount: 0, kind: AuraApi.HitKind.Heal}), 0)).toBeNull();
    });
});
