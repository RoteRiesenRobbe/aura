// The ascension ceremony's channel effect, as pure numbers
// (plan-ascension.md follow-up ②). The PixiJS half is AscensionChannelFx;
// everything that decides WHERE a mote is and HOW bright it burns lives here,
// so it can be tested without a renderer — the AuraBeat / ShieldBarMath
// precedent.
//
// The shape the PO picked: ~12 motes on a shrinking orbit, spiralling inward
// and accelerating as the channel completes, then a flash at the very end.
//
// ⚑ PLACEHOLDER ART, deliberately. Graphics primitives and these numbers are
// the whole effect; real ceremony art is a later content/art pass (D20 already
// deferred it), and backlog §39's entity-presentation rework is what a durable
// version would be built on. Removing this costs two files and two call sites.
//
// ⚑ Nothing here is random. A mote's stagger is derived from its index, so the
// same channel always draws the same shape and a test can assert a position
// rather than a range.

const TAU = Math.PI * 2;

/** How many motes the effect draws. */
export const MOTE_COUNT = 12;

/** Starting orbit, as a multiple of the character's own size. */
export const START_RADIUS_FACTOR = 3;

/** Turns per second at the start of the channel, and the gain by its end. */
const SPIN_BASE_TPS = 0.6;
const SPIN_GAIN_TPS = 2.4;

/**
 * Where the collapse turns into the flash. The last ~3 % of a 10 s channel is
 * ~0.3 s, which is enough to read and short enough that a player who walks away
 * at 90 % never sees it.
 */
export const FLASH_FROM = 0.97;

export function clamp01(v: number): number {
    if (!Number.isFinite(v)) {
        return 0;
    }
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The orbit radius, as a multiple of the character's size: 3× at the start,
 * 0 at completion. Eased so most of the travel happens late — an orbit that
 * shrank linearly reads as a slow drift rather than as something being pulled
 * in.
 */
export function moteRadiusFactor(progress: number): number {
    return START_RADIUS_FACTOR * Math.pow(1 - clamp01(progress), 1.6);
}

/**
 * The per-mote radius stagger, 0.72–1.0 of the current orbit. Without it the
 * twelve motes sit on one rigid circle and read as a wheel, not a swarm.
 */
export function moteSpread(index: number): number {
    // index * 5 mod 7 walks all seven residues before repeating, so adjacent
    // motes never share a ring.
    return 0.72 + 0.28 * (((index * 5) % 7) / 6);
}

/**
 * A mote's angle in radians. The swarm spins faster as the orbit tightens,
 * which is what makes the collapse read as gathering rather than as fading.
 */
export function moteAngle(index: number, count: number, progress: number, elapsedMs: number): number {
    const turns = (elapsedMs / 1000) * (SPIN_BASE_TPS + SPIN_GAIN_TPS * clamp01(progress));
    return (index / count) * TAU + turns * TAU;
}

/** A mote's offset from the character centre, in px. */
export function motePosition(
    index: number, count: number, progress: number, elapsedMs: number, sizePx: number,
): { x: number, y: number } {
    const r = moteRadiusFactor(progress) * moteSpread(index) * sizePx;
    const a = moteAngle(index, count, progress, elapsedMs);
    return {x: Math.cos(a) * r, y: Math.sin(a) * r};
}

/** Mote brightness: visible from the first tick, brightest as it arrives. */
export function moteAlpha(progress: number): number {
    return 0.55 + 0.45 * clamp01(progress);
}

/**
 * The halo under the motes — a slow breath that deepens as the channel runs, so
 * the character is visibly doing something even in the first seconds when the
 * swarm is still out at three character-widths and easy to miss.
 *
 * ⚑ It reads elapsed time rather than progress alone because a glow that only
 * tracked progress would sit perfectly still for ten seconds.
 */
export function haloAlpha(progress: number, elapsedMs: number): number {
    const breath = 0.5 + 0.5 * Math.sin((elapsedMs / 1000) * Math.PI);
    return (0.12 + 0.28 * clamp01(progress)) * (0.65 + 0.35 * breath);
}

/**
 * The closing flash, 0 → 1 over the last stretch of the channel. It is a
 * separate ramp rather than a one-shot event because the snapshot that would
 * carry "it is done" never arrives: the completed ceremony spends the character
 * and the client leaves the world.
 */
export function flashStrength(progress: number): number {
    const p = clamp01(progress);
    if (p < FLASH_FROM) {
        return 0;
    }
    return (p - FLASH_FROM) / (1 - FLASH_FROM);
}

/**
 * Cast progress from the wire's two counters.
 *
 * ⚑ The no-cast snapshot is all-zero, so this divides 0 by 0 on most ticks of
 * most sessions. There is deliberately NO guard for it: clamp01 is total, and a
 * second zero check here was dead code — a mutation removing it changed nothing
 * any test could see, which is the honest signal that it was never load-bearing.
 */
export function castProgress(ticksLeft: number, ticksTotal: number): number {
    return clamp01((ticksTotal - ticksLeft) / ticksTotal);
}
