// The buff tray's tenant set (plan-buff-tray.md C2): which circles the tray
// draws, on which side, in which order, and how full each wedge is.
//
// Pure and DOM-free on purpose, the CooldownSweep pattern: HUD.ts owns the
// elements and asks this module what they should show. The wire feeds it
// `own_effects` (one entry per (skill, caster) with an absolute expiry tick,
// D15/D16) and the snapshot tick; everything else is derived here.
//
// ⚑ Two readings of "no entries", both load-bearing (§10 of the plan):
//   `undefined`  the owner block did not ride this tick, so nothing changed.
//                The set is kept and only ages: a tenant whose expiry has
//                passed is dropped locally, so a lost expiry resend cannot
//                leave a dead circle until the 5 s heartbeat.
//   `[]`         the owner block rode and listed nothing: the tray clears.
//
// ⚑ SUSTAINED circles (PO look 2026-10-04). An effect an AURA keeps up (the
// spider web's slow, a resist / shield / speed aura) lives one beat plus one
// tick on the server and is re-applied every beat, so its honest wedge sweeps
// and refills three times a second and says nothing: the time left is always
// "under half a second". Such a circle draws STEADY while the aura holds it;
// when the aura lets go (the server stops listing it, or its expiry passes) it
// stays for one more lifetime, sweeping its wedge once, then leaves. A circle
// caught again mid-sweep returns to steady in place, which also keeps a walk
// along a web's edge from reshuffling the row. The rule is the client's: the
// skill is an aura in the catalog and the circle carries no dot or hot (those
// two have a real duration even when an aura applies them).

import {AuraApi} from '../../../backend/logic/AuraApi';
import {BasicConfig} from '../../../../client-data/BasicConfig';

/** One `OwnEffect` off the wire, bigints already narrowed to numbers. */
export interface OwnEffectData {
    skillId: number;
    /** The union of `AuraApi.EffectKind` bits live under this circle (D17). */
    kinds: number;
    /** The lifetime the longest stream started with; a refresh resets it (D2). */
    totalTicks: number;
    /** The applying entity's id, a placed area's id (above 2^32), or 0 for the skill's shared circle. */
    caster: number;
    /** The server tick the longest stream ends on; `GameState.tick` is the clock. */
    expiresTick: number;
}

/** A circle the tray draws. */
export interface Tenant extends OwnEffectData {
    key: string;
    harmful: boolean;
    /** An aura keeps this effect up: no wedge while it holds (see the header). */
    sustained: boolean;
    /** The tick a sustained circle's aura let go; it sweeps out over `totalTicks` from here. */
    leavingAt?: number;
}

/** Both boxes, each NEWEST FIRST: index 0 is the circle nearest the centre line (D5/D6). */
export interface TrayState {
    beneficial: Tenant[];
    harmful: Tenant[];
}

/**
 * The side rule (D13, on a mask since D17): a circle is harmful when ANY of
 * these bits is set, beneficial otherwise. Calm and charm never land on a
 * player today and are beneficial-by-default (plan §9 P3).
 */
export const HARMFUL_KINDS: number =
    AuraApi.EffectKind.Slow | AuraApi.EffectKind.Dot | AuraApi.EffectKind.Stun;

export function isHarmful(kinds: number): boolean {
    return (kinds & HARMFUL_KINDS) !== 0;
}

/** The circle key (D16): a dot stream ticks per caster on the server, so two wolves are two circles. */
export function tenantKey(e: OwnEffectData): string {
    return `${e.skillId}:${e.caster}`;
}

export function createTrayState(): TrayState {
    return {beneficial: [], harmful: []};
}

/** Kinds with a real duration of their own, even when an aura applies them. */
const TIMED_UNDER_AN_AURA: number = AuraApi.EffectKind.Dot | AuraApi.EffectKind.Hot;

/** Whether a circle is one an aura keeps up; `isAura` is the catalog's answer for the skill. */
export function isSustained(e: OwnEffectData, isAura: (skillId: number) => boolean): boolean {
    return (e.kinds & TIMED_UNDER_AN_AURA) === 0 && isAura(e.skillId);
}

/**
 * The share of the circle still to run, 0..1: what the wedge leaves UNdarkened.
 * A sustained circle is full while its aura holds it and sweeps out once,
 * over one lifetime, from the tick the aura let go.
 */
export function fractionLeft(t: OwnEffectData & Partial<Pick<Tenant, 'sustained' | 'leavingAt'>>, tick: number): number {
    if (!(t.totalTicks > 0)) {
        return 0;
    }
    let left: number;
    if (t.sustained) {
        left = t.leavingAt === undefined ? 1 : 1 - (tick - t.leavingAt) / t.totalTicks;
    } else {
        left = (t.expiresTick - tick) / t.totalTicks;
    }
    return Math.min(1, Math.max(0, left));
}

/** Whole seconds left for the tooltip's time line, rounded UP so a live circle never reads 0. */
export function secondsLeft(t: OwnEffectData, tick: number): number {
    const ticks = Math.max(0, t.expiresTick - tick);
    return Math.ceil(ticks * BasicConfig.SERVER_TICKRATE / 1000);
}

/**
 * Fold one snapshot into the set.
 *
 * With a vector: every listed entry is upserted (a known key keeps its
 * position and takes the new expiry, total and kinds; a new key is inserted
 * at the inner end), and every tenant the vector no longer lists leaves. New
 * keys are inserted in wire order, so the LAST new entry ends nearest the
 * centre: the server sorts a skill's casters by first application.
 *
 * Without one: the set only ages (see the header).
 *
 * "Leaves" means gone at once for a timed circle, and the start of the
 * one-lifetime sweep for a sustained one. `isAura` answers "is this skill an
 * aura" from the catalog; it is injected so this module stays pure, and the
 * default (nothing is an aura) keeps every circle timed.
 */
export function applyOwnEffects(state: TrayState, effects: OwnEffectData[] | undefined, tick: number,
                                isAura: (skillId: number) => boolean = () => false): void {
    const seen = new Set<string>();
    for (const e of effects ?? []) {
        const key = tenantKey(e);
        seen.add(key);
        const harmful = isHarmful(e.kinds);
        const box = harmful ? state.harmful : state.beneficial;
        const other = harmful ? state.beneficial : state.harmful;

        const crossed = other.findIndex((t) => t.key === key);
        if (crossed >= 0) {
            other.splice(crossed, 1);
        }
        const existing = crossed < 0 ? box.find((t) => t.key === key) : undefined;
        if (existing) {
            existing.kinds = e.kinds;
            existing.totalTicks = e.totalTicks;
            existing.expiresTick = e.expiresTick;
            existing.sustained = isSustained(e, isAura);
            existing.leavingAt = undefined; // caught again mid-sweep: steady, in place
        } else {
            box.unshift({...e, key, harmful, sustained: isSustained(e, isAura)});
        }
    }

    // Who is still here? On a block tick the vector rules; on a quiet tick a
    // tenant stays until its expiry passes (the server deleted the stream).
    const listed = (t: Tenant) => (effects === undefined ? t.expiresTick > tick : seen.has(t.key));
    const keep = (t: Tenant): boolean => {
        if (t.leavingAt === undefined && listed(t)) {
            return true;
        }
        if (!t.sustained) {
            return false;
        }
        t.leavingAt ??= tick;
        return tick - t.leavingAt < t.totalTicks;
    };
    state.beneficial = state.beneficial.filter(keep);
    state.harmful = state.harmful.filter(keep);
}
