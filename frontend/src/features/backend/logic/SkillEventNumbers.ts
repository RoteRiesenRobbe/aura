/**
 * What a per-hit skill event draws, and on whom (plan-skill-vfx.md C1, D6).
 *
 * Before C1 every entity carried a per-TICK damage/heal aggregate and the
 * client drew whatever landed on it, whoever caused it: a five-player fight
 * was a wall of numbers nobody owned, and a dotted mob walking out of range
 * showed a number you could not tell was yours. The wire now carries the hits
 * themselves, with a source, so the client can answer "was that mine?".
 *
 * D6: a number is drawn for damage and heals the own player DEALT (their own
 * DoT ticking on a mob that has left range included) and for damage and heals
 * the own player TOOK. Nobody else's, dealt or taken.
 *
 * Kept pure and apart from Backend and PixiJS, like InteractBadgeTargeting:
 * the interesting part is the attribution rule, not the drawing.
 */
import {AuraApi} from './AuraApi';

/**
 * One decoded `SkillEvent` off the wire (GameStateMessage). Entity ids are
 * narrowed to numbers there, as every other id on the snapshot is.
 */
export interface SkillEventData {
    /** the casting entity: the SUMMON on an owned cast, the reflector on a reflect */
    source: number;
    /** the entity that was hit; 0 on a FIRED event */
    victim: number;
    skillId: number;
    /** post-mitigation HP, display units; 0 on FIRED and on Immune */
    amount: number;
    kind: AuraApi.HitKind;
    /** true = a cast went off, false = a hit landed */
    fired: boolean;
}

/**
 * 'immune' and 'absorbed' are the grey words, not numbers - see IMMUNE_COLOR /
 * IMMUNE_LANE. Both say why a hit that landed moved no health.
 */
export type SkillNumberKind = 'damage' | 'crit' | 'heal' | 'immune' | 'absorbed';

export interface SkillNumberDraw {
    /** C1 draws on the struck entity only; the caster's beat is C2a's. */
    target: 'victim';
    kind: SkillNumberKind;
}

/**
 * Decide what a single event draws for THIS viewer.
 *
 * @param ownId         the own character's entity id
 * @param event         one decoded event
 * @param sourceOwnerId `owner_id` of the source entity (§12a.5): the player an
 *                      owned summon is credited to, 0 for a world mob, and
 *                      undefined when the client holds no source entity at all
 * @returns what to draw, or null when this event is none of the viewer's
 *          business (or has nothing to show)
 */
export function skillEventNumber(
    ownId: number,
    event: SkillEventData,
    sourceOwnerId: number | undefined,
): SkillNumberDraw | null {
    // The cast beat carries no number of its own; C2a gives it VFX.
    if (event.fired) {
        return null;
    }
    // ⚑ 0 is "no owner" on the wire, so it must never match an own id - a
    // viewer with no character yet would otherwise own every world mob's hit.
    const ownSummon = sourceOwnerId !== undefined && sourceOwnerId !== 0 && sourceOwnerId === ownId;
    const ownCaused = ownId !== 0 && (event.source === ownId || event.victim === ownId || ownSummon);
    if (!ownCaused) {
        return null;
    }

    // The only zero that draws: the word explains why nothing happened.
    if (event.kind === AuraApi.HitKind.Immune) {
        return {target: 'victim', kind: 'immune'};
    }
    // A hit the shield ate whole (PO 2026-09-19): the same grey word style.
    // A PARTIAL absorb arrives as Damage / Crit with the real loss and says
    // nothing about the shield's share, which is not on the wire.
    if (event.kind === AuraApi.HitKind.Absorb) {
        return {target: 'victim', kind: 'absorbed'};
    }
    // hpToDisplay floors at 1, so a zero landing would print a "1" that
    // nothing caused. The aggregates were guarded the same way.
    if (event.amount <= 0) {
        return null;
    }

    switch (event.kind) {
        case AuraApi.HitKind.Crit:
            return {target: 'victim', kind: 'crit'};
        case AuraApi.HitKind.Heal:
            return {target: 'victim', kind: 'heal'};
        default:
            return {target: 'victim', kind: 'damage'};
    }
}
