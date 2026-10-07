import {describe, expect, it} from 'vitest';
import {AuraApi} from '../../../backend/logic/AuraApi';
import {SkillDefinition, SkillEffect} from '../../../../client-data/Skills';
import {
    alwaysOnTenants,
    applyOwnEffects,
    createTrayState,
    fractionLeft,
    HARMFUL_KINDS,
    isHarmful,
    OwnEffectData,
    secondsLeft,
    tenantKey,
} from './BuffTray';

const K = AuraApi.EffectKind;

function effect(partial: Partial<OwnEffectData>): OwnEffectData {
    return {skillId: 1, kinds: K.Speed, totalTicks: 150, caster: 0, expiresTick: 1150, ...partial};
}

function keys(list: { key: string }[]): string[] {
    return list.map((t) => t.key);
}

describe('BuffTray side by kind (D13 on a mask)', () => {
    it('calls slow, dot and stun harmful and every other kind beneficial', () => {
        expect(isHarmful(K.Slow)).toBe(true);
        expect(isHarmful(K.Dot)).toBe(true);
        expect(isHarmful(K.Stun)).toBe(true);
        for (const kind of [K.Resist, K.Speed, K.Lifesteal, K.Reflect, K.TickRate, K.Hot, K.Shield, K.Calm, K.Charm]) {
            expect(isHarmful(kind), `kind ${kind}`).toBe(false);
        }
    });

    it('reads a mask: any harmful bit makes the circle harmful', () => {
        expect(isHarmful(K.Resist | K.Slow)).toBe(true);
        expect(isHarmful(K.Hot | K.Shield)).toBe(false);
        expect(HARMFUL_KINDS).toBe(K.Slow | K.Dot | K.Stun);
    });
});

describe('BuffTray fraction', () => {
    it('is the time left over the total, off the snapshot tick', () => {
        const t = effect({totalTicks: 200, expiresTick: 1200});
        expect(fractionLeft(t, 1000)).toBe(1);
        expect(fractionLeft(t, 1100)).toBeCloseTo(0.5);
        expect(fractionLeft(t, 1150)).toBeCloseTo(0.25);
    });

    it('clamps at 0 and 1', () => {
        const t = effect({totalTicks: 200, expiresTick: 1200});
        expect(fractionLeft(t, 1300)).toBe(0);
        expect(fractionLeft(t, 900)).toBe(1);
    });

    it('treats a zero total as fully gone rather than dividing by it', () => {
        expect(fractionLeft(effect({totalTicks: 0, expiresTick: 1200}), 1000)).toBe(0);
    });

    it('reports whole seconds left, never negative', () => {
        const t = effect({expiresTick: 1150});
        expect(secondsLeft(t, 1000)).toBe(5);
        expect(secondsLeft(t, 1140)).toBe(1); // 10 ticks = 0.33 s rounds up: the circle is still there
        expect(secondsLeft(t, 1200)).toBe(0);
    });
});

describe('BuffTray tenant set', () => {
    it('keys a circle by (skill, caster)', () => {
        expect(tenantKey(effect({skillId: 7, caster: 0}))).toBe('7:0');
        expect(tenantKey(effect({skillId: 7, caster: 4294967301}))).toBe('7:4294967301');
    });

    it('sorts each entry to its side', () => {
        const s = createTrayState();
        applyOwnEffects(s, [effect({skillId: 1, kinds: K.Speed}), effect({skillId: 2, kinds: K.Slow})], 1000);
        expect(keys(s.beneficial)).toEqual(['1:0']);
        expect(keys(s.harmful)).toEqual(['2:0']);
    });

    it('inserts a new tenant at the inner end (D6)', () => {
        const s = createTrayState();
        applyOwnEffects(s, [effect({skillId: 1})], 1000);
        applyOwnEffects(s, [effect({skillId: 1}), effect({skillId: 2})], 1010);
        expect(keys(s.beneficial)).toEqual(['2:0', '1:0']);
    });

    it('keeps positions stable while a tenant refreshes', () => {
        const s = createTrayState();
        applyOwnEffects(s, [effect({skillId: 1}), effect({skillId: 2})], 1000);
        const before = keys(s.beneficial);
        // skill 1 refreshed: a new expiry, same key
        applyOwnEffects(s, [effect({skillId: 1, expiresTick: 1300, totalTicks: 300}), effect({skillId: 2})], 1050);
        expect(keys(s.beneficial)).toEqual(before);
        expect(s.beneficial.find((t) => t.key === '1:0')!.expiresTick).toBe(1300);
        expect(s.beneficial.find((t) => t.key === '1:0')!.totalTicks).toBe(300);
    });

    it('drops a tenant the server no longer lists and closes the gap', () => {
        const s = createTrayState();
        applyOwnEffects(s, [effect({skillId: 1}), effect({skillId: 2}), effect({skillId: 3})], 1000);
        applyOwnEffects(s, [effect({skillId: 1}), effect({skillId: 3})], 1010);
        expect(keys(s.beneficial)).toEqual(['3:0', '1:0']);
    });

    it('draws two casters of one skill as two circles (D16)', () => {
        const s = createTrayState();
        applyOwnEffects(s, [
            effect({skillId: 9, kinds: K.Dot, caster: 11}),
            effect({skillId: 9, kinds: K.Dot, caster: 12}),
        ], 1000);
        expect(keys(s.harmful)).toEqual(['9:12', '9:11']);
    });

    it('clears everything on an empty vector (owner block present, nothing on you)', () => {
        const s = createTrayState();
        applyOwnEffects(s, [effect({skillId: 1}), effect({skillId: 2, kinds: K.Dot})], 1000);
        applyOwnEffects(s, [], 1010);
        expect(s.beneficial).toEqual([]);
        expect(s.harmful).toEqual([]);
    });

    it('keeps everything on a tick without the owner block (undefined = unchanged)', () => {
        const s = createTrayState();
        applyOwnEffects(s, [effect({skillId: 1, expiresTick: 1150})], 1000);
        applyOwnEffects(s, undefined, 1100);
        expect(keys(s.beneficial)).toEqual(['1:0']);
    });

    it('drops a tenant locally once its expiry passes with no block in sight', () => {
        // A lost expiry resend would otherwise leave a dead circle until the
        // 5 s heartbeat; the server has already deleted the stream by then.
        const s = createTrayState();
        applyOwnEffects(s, [effect({skillId: 1, expiresTick: 1150}), effect({skillId: 2, expiresTick: 1400})], 1000);
        applyOwnEffects(s, undefined, 1150);
        expect(keys(s.beneficial)).toEqual(['2:0']);
    });

    it('moves a circle across the line when its kinds flip sides', () => {
        // A skill's shared circle (caster 0) gaining a harmful bit on a
        // refresh is harmful from then on; the key stays, the box changes.
        const s = createTrayState();
        applyOwnEffects(s, [effect({skillId: 1, kinds: K.Resist})], 1000);
        applyOwnEffects(s, [effect({skillId: 1, kinds: K.Resist | K.Slow})], 1010);
        expect(s.beneficial).toEqual([]);
        expect(keys(s.harmful)).toEqual(['1:0']);
    });
});

// PO look 2026-10-04: an effect an AURA keeps up (the spider web's slow, a
// resist / shield / speed aura) lives one beat plus a tick and is re-applied
// every beat, so its honest wedge strobes three times a second. It draws
// STEADY while the aura holds it, then sweeps its wedge once and leaves.
describe('BuffTray sustained circles (an aura keeps the effect up)', () => {
    const WEB = 156;
    const isAura = (skillId: number) => skillId === WEB;
    const web = (partial: Partial<OwnEffectData> = {}) =>
        effect({skillId: WEB, kinds: K.Slow, totalTicks: 11, expiresTick: 1011, ...partial});

    it('marks an aura skill\'s circle sustained, unless it carries a dot or a hot', () => {
        const s = createTrayState();
        applyOwnEffects(s, [
            web(),
            effect({skillId: 2, kinds: K.Slow}),                    // a cooldown's slow: not an aura
            effect({skillId: WEB + 1, kinds: K.Dot, caster: 7}),    // not an aura skill either
        ], 1000, isAura);
        expect(s.harmful.find((t) => t.key === `${WEB}:0`)!.sustained).toBe(true);
        expect(s.harmful.find((t) => t.key === '2:0')!.sustained).toBe(false);

        // An aura whose circle carries a dot (or a hot) has a REAL duration: it keeps its wedge.
        const d = createTrayState();
        applyOwnEffects(d, [web({kinds: K.Slow | K.Dot, caster: 7}), web({skillId: WEB, kinds: K.Hot, caster: 0})], 1000, isAura);
        expect(d.harmful[0].sustained).toBe(false);
        expect(d.beneficial[0].sustained).toBe(false);
    });

    it('draws a sustained circle full for as long as the aura refreshes it', () => {
        const s = createTrayState();
        applyOwnEffects(s, [web()], 1000, isAura);
        const t = s.harmful[0];
        expect(fractionLeft(t, 1000)).toBe(1);
        expect(fractionLeft(t, 1009)).toBe(1); // an honest wedge would read 2/11 here
        applyOwnEffects(s, [web({expiresTick: 1021})], 1010, isAura);
        expect(fractionLeft(s.harmful[0], 1019)).toBe(1);
    });

    it('sweeps the wedge once over its lifetime after the aura lets go, then leaves', () => {
        const s = createTrayState();
        applyOwnEffects(s, [web()], 1000, isAura);
        applyOwnEffects(s, [], 1011, isAura);          // the server dropped it
        expect(keys(s.harmful)).toEqual([`${WEB}:0`]); // still drawn: leaving
        expect(s.harmful[0].leavingAt).toBe(1011);
        expect(fractionLeft(s.harmful[0], 1011)).toBe(1);
        applyOwnEffects(s, undefined, 1016, isAura);
        expect(fractionLeft(s.harmful[0], 1016)).toBeCloseTo(6 / 11);
        applyOwnEffects(s, undefined, 1022, isAura);   // 11 ticks after it left
        expect(s.harmful).toEqual([]);
    });

    it('starts the sweep on a local expiry too (no block rode that tick)', () => {
        const s = createTrayState();
        applyOwnEffects(s, [web()], 1000, isAura);
        applyOwnEffects(s, undefined, 1011, isAura);
        expect(s.harmful[0].leavingAt).toBe(1011);
    });

    it('returns to steady IN PLACE when the aura catches it again mid-sweep', () => {
        // Walking a web's edge: out for a few ticks, back in. The circle must
        // not re-enter at the inner end and shove the venom circles around.
        const s = createTrayState();
        applyOwnEffects(s, [web()], 1000, isAura);
        applyOwnEffects(s, [web(), effect({skillId: 9, kinds: K.Dot, caster: 3})], 1005, isAura);
        expect(keys(s.harmful)).toEqual(['9:3', `${WEB}:0`]);
        applyOwnEffects(s, [effect({skillId: 9, kinds: K.Dot, caster: 3})], 1016, isAura); // web gone
        applyOwnEffects(s, [web({expiresTick: 1031}), effect({skillId: 9, kinds: K.Dot, caster: 3})], 1020, isAura);
        expect(keys(s.harmful)).toEqual(['9:3', `${WEB}:0`]);
        expect(s.harmful[1].leavingAt).toBeUndefined();
        expect(fractionLeft(s.harmful[1], 1021)).toBe(1);
    });

    it('never holds a timed circle back: only sustained ones sweep out', () => {
        const s = createTrayState();
        applyOwnEffects(s, [effect({skillId: 2, kinds: K.Slow})], 1000, isAura);
        applyOwnEffects(s, [], 1010, isAura);
        expect(s.harmful).toEqual([]);
    });
});


describe('BuffTray always-on circles (D9, P5)', () => {
    // Just the fields alwaysOnTenants reads; the catalog has many more.
    function def(id: number, category: string, bonuses: [number, number][] = []): SkillDefinition {
        const effects = bonuses.map(([bonus, bonusPerLevel]) =>
            ({type: 'stat_multiplier', stat: {name: 'movementSpeed', bonus, bonusPerLevel}}) as unknown as SkillEffect);
        return {id, category, effects} as unknown as SkillDefinition;
    }
    const catalog = new Map<number, SkillDefinition>([
        [10, def(10, 'passive', [[0.1, 0]])],
        [11, def(11, 'passive')],
        [20, def(20, 'aura', [[-0.3, 0], [-0.2, 0]])], // four drawbacks or two: one circle
        [21, def(21, 'aura')], // no modifier at all
        [22, def(22, 'aura', [[0.1, 0]])], // a positive while-active modifier: no circle (YAGNI)
        [23, def(23, 'aura', [[-0.1, 0.05]])], // a drawback that turns positive from level 3
    ]);
    const defOf = (id: number) => catalog.get(id);
    const level1 = () => 1;

    it('draws one beneficial circle per equipped passive, in slot order, skipping empty slots', () => {
        const s = alwaysOnTenants([11, 0, 10], 0, defOf, level1);
        expect(s.beneficial.map((t) => t.skillId)).toEqual([11, 10]);
        expect(s.harmful).toEqual([]);
        expect(s.beneficial.every((t) => t.permanent && !t.harmful)).toBe(true);
    });

    it('draws one harmful circle for an active aura with drawbacks, however many', () => {
        const s = alwaysOnTenants([], 20, defOf, level1);
        expect(s.harmful.map((t) => t.skillId)).toEqual([20]);
        expect(s.harmful[0].harmful).toBe(true);
    });

    it('draws nothing for an aura without a negative modifier, or no active aura', () => {
        expect(alwaysOnTenants([], 21, defOf, level1).harmful).toEqual([]);
        expect(alwaysOnTenants([], 22, defOf, level1).harmful).toEqual([]);
        expect(alwaysOnTenants([], 0, defOf, level1).harmful).toEqual([]);
    });

    it('reads the drawback sign at the aura\'s own level', () => {
        expect(alwaysOnTenants([], 23, defOf, () => 2).harmful).toHaveLength(1);
        expect(alwaysOnTenants([], 23, defOf, () => 3).harmful).toEqual([]);
    });

    it('draws nothing for a skill the catalog does not know yet', () => {
        const s = alwaysOnTenants([99], 98, defOf, level1);
        expect(s.beneficial.map((t) => t.skillId)).toEqual([99]); // a passive slot is a passive
        expect(s.harmful).toEqual([]); // a drawback needs the definition
    });

    it('keys always-on circles apart from timed ones of the same skill', () => {
        const s = alwaysOnTenants([10], 0, defOf, level1);
        expect(s.beneficial[0].key).not.toBe(tenantKey(effect({skillId: 10})));
    });

    it('draws a permanent circle full: no wedge', () => {
        const [t] = alwaysOnTenants([10], 0, defOf, level1).beneficial;
        expect(fractionLeft(t, 5000)).toBe(1);
    });
});
