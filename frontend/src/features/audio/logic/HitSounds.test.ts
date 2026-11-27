import {describe, it, expect, vi, afterEach} from 'vitest';
import {AuraApi} from '../../backend/logic/AuraApi';
import {SkillEventData} from '../../backend/logic/SkillEventNumbers';
import {TriggerIntervalMap} from './TriggerIntervalMap';
import {HIT_SOUND_INTERVAL_MS, hitSoundVictims} from './HitSounds';

const PLAYER = 7;
const MOB = 11;
const OTHER_MOB = 12;

function hit(overrides: Partial<SkillEventData> = {}): SkillEventData {
    return {
        source: PLAYER,
        victim: MOB,
        skillId: 1,
        amount: 12,
        kind: AuraApi.HitKind.Damage,
        fired: false,
        phase: AuraApi.HitPhase.Direct,
        ...overrides,
    };
}

// Mob hits went silent on 2026-08-16 (e9a0894c): the old hook rode the
// `Damaged` status, which the server never sets on a mob (every aura hit is
// `DamagedAmbient`). The sound now rides the skill events, everyone's.
describe('hitSoundVictims', () => {
    afterEach(() => vi.useRealTimers());

    it('sounds a damage or crit landing, whoever dealt or took it', () => {
        expect(hitSoundVictims([hit()], new TriggerIntervalMap())).toEqual([MOB]);
        expect(hitSoundVictims([hit({kind: AuraApi.HitKind.Crit})], new TriggerIntervalMap())).toEqual([MOB]);
        expect(hitSoundVictims([hit({source: MOB, victim: PLAYER})], new TriggerIntervalMap())).toEqual([PLAYER]);
        expect(hitSoundVictims([hit({phase: AuraApi.HitPhase.Tick})], new TriggerIntervalMap())).toEqual([MOB]);
    });

    it('stays silent on casts, applications, heals, the grey words and zeros', () => {
        const silent = [
            hit({fired: true, victim: 0, amount: 0}),
            hit({phase: AuraApi.HitPhase.Applied, amount: 0}),
            hit({kind: AuraApi.HitKind.Heal}),
            hit({kind: AuraApi.HitKind.Immune, amount: 0}),
            hit({kind: AuraApi.HitKind.Absorb, amount: 0}),
            hit({amount: 0}),
        ];
        expect(hitSoundVictims(silent, new TriggerIntervalMap())).toEqual([]);
    });

    it('sounds each victim at most once per interval', () => {
        vi.useFakeTimers();
        const gate = new TriggerIntervalMap();
        expect(hitSoundVictims([hit(), hit(), hit({victim: OTHER_MOB})], gate)).toEqual([MOB, OTHER_MOB]);
        vi.advanceTimersByTime(HIT_SOUND_INTERVAL_MS - 1);
        expect(hitSoundVictims([hit()], gate)).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(hitSoundVictims([hit()], gate)).toEqual([MOB]);
    });
});
