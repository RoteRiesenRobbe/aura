/**
 * Which of this tick's skill landings make the hit sound, and on whom.
 *
 * Every damage or crit that moved health does, whoever dealt or took it: your
 * aura on a mob, another player's, a mob's on you or on another player. Unlike
 * the floating numbers (SkillEventNumbers, D6) there is no "own" gate; distance
 * does the fading (SpatialAudio). Each victim sounds at most once per
 * HIT_SOUND_INTERVAL_MS, so a pull of five mobs under two auras stays a beat,
 * not a drum roll.
 *
 * Pure apart from the clock inside TriggerIntervalMap; Backend resolves the ids.
 */
import {AuraApi} from '../../backend/logic/AuraApi';
import {SkillEventData} from '../../backend/logic/SkillEventNumbers';
import {TriggerIntervalMap} from './TriggerIntervalMap';

/** [PLACEHOLDER] the per-victim gap between two hit sounds. */
export const HIT_SOUND_INTERVAL_MS = 300;

function soundsHit(event: SkillEventData): boolean {
    return !event.fired
        && event.phase !== AuraApi.HitPhase.Applied
        && (event.kind === AuraApi.HitKind.Damage || event.kind === AuraApi.HitKind.Crit)
        && event.amount > 0;
}

/** The victim ids to play the hit sound on, each once, gated per victim. */
export function hitSoundVictims(events: SkillEventData[], gate: TriggerIntervalMap): number[] {
    const victims: number[] = [];
    events.forEach((event) => {
        if (soundsHit(event) && gate.trigger('hit-' + event.victim, HIT_SOUND_INTERVAL_MS)) {
            victims.push(event.victim);
        }
    });
    return victims;
}
