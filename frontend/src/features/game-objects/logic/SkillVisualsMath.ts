// Per-skill hit/field visuals, as pure numbers (prototype/skill-visuals).
// The PixiJS half is SkillVisuals.ts; everything that decides WHERE a flake,
// sword or fireball is and HOW visible it is lives here, so it can be tested
// without a renderer - the AscensionChannelMath precedent.
//
// ⚑ PROTOTYPE, deliberately unmerged-by-default: this is the client-side
// mirror of the §57 attack-lines experiment, outbound. The attribution is an
// INFERENCE (own beat + victim in reach + damage landed), which over-draws
// when a second damage source hits the same victim in the same tick. A
// shipped version rides §39's per-hit source wire field
// (docs/plan-entity-presentation.md §6 items 3+4), not this file.
//
// ⚑ Nothing here is random. A snowflake's ring, speed and twinkle are derived
// from its index, so the same field always draws the same shape and a test
// can assert a position rather than a range.

const TAU = Math.PI * 2;

/**
 * The visual dressings a skill can name. 'field-*' is an ambient particle
 * field inside the own aura ring; 'strike-*' draws a melee swing from the
 * player to the victim on the hit tick; 'projectile-*' flies a bolt from the
 * player to the victim and defers the damage number to visual impact.
 */
export type SkillVisualStyle =
    'field-ice' | 'strike-sword' | 'projectile-fire' | 'projectile-frost';

/**
 * Skill id → visual style. Client-side table on purpose: the own player knows
 * their active skill id from the wire, so the prototype needs no schema
 * change. A shipped version authors this in the skill JSON (a §39 consumer).
 * Unmapped skills keep today's visuals (ring wash + victim slash/fire).
 */
const SKILL_VISUAL_STYLES: Record<number, SkillVisualStyle> = {
    1: 'strike-sword',      // Damage - the starting melee-range aura
    141: 'field-ice',       // Frostbite
    146: 'field-ice',       // Hoarfrost
    45: 'projectile-fire',  // LongRangeStrike - ranged nearest-1, the fireball shape
    59: 'projectile-frost', // Suppression - ranged nearest-1 frost + slow
};

export function visualStyleFor(skillId: number): SkillVisualStyle | null {
    return SKILL_VISUAL_STYLES[skillId] ?? null;
}

/**
 * Containment slack on the reach test, in px. The server's hit test is
 * shape-vs-shape (§57's attackReachPx lesson, mirrored): the victim's own
 * collider extends its reachability past the raw ring radius, and both
 * rendered positions sit a render-delay behind the server, so a tight test
 * misses precisely the hits that landed at exact melee reach.
 */
export const REACH_SLACK_PX = 14;

/** Is the victim close enough that the own aura can have hit it? */
export function withinReach(
    dx: number, dy: number, auraRadiusPx: number, victimRadiusPx: number,
): boolean {
    const reach = auraRadiusPx + victimRadiusPx + REACH_SLACK_PX;
    return dx * dx + dy * dy <= reach * reach;
}

// --- Projectiles ------------------------------------------------------------

/** Flight speed and its clamp. [PLACEHOLDER] */
const PROJECTILE_SPEED_PX_PER_S = 700;
export const PROJECTILE_MIN_MS = 140;
export const PROJECTILE_MAX_MS = 900;

/**
 * Flight duration for a bolt covering distPx. Clamped: a point-blank hit
 * still reads as a throw, and a max-range one never delays its damage number
 * past the point where cause and effect drift apart.
 */
export function flightMs(distPx: number): number {
    const ms = (distPx / PROJECTILE_SPEED_PX_PER_S) * 1000;
    return Math.min(PROJECTILE_MAX_MS, Math.max(PROJECTILE_MIN_MS, ms));
}

/** Straight-line flight, eased in slightly so the launch reads as a launch. */
export function projectilePoint(
    fromX: number, fromY: number, toX: number, toY: number, t: number,
): { x: number, y: number } {
    const p = clamp01(t);
    const eased = p * p * (3 - 2 * p); // smoothstep
    return {x: fromX + (toX - fromX) * eased, y: fromY + (toY - fromY) * eased};
}

// --- The strike (sword thrust) ----------------------------------------------

export const STRIKE_THRUST_MS = 140;
export const STRIKE_TOTAL_MS = 320;

/**
 * The swing over time: `extend` scales the blade out along the aim direction
 * (0.25 → 1, eased out so the tip arrives fast), `alpha` holds through the
 * thrust and fades after, `done` ends the ticker.
 */
export function strikePhase(elapsedMs: number): { extend: number, alpha: number, done: boolean } {
    if (elapsedMs >= STRIKE_TOTAL_MS) {
        return {extend: 1, alpha: 0, done: true};
    }
    const thrust = clamp01(elapsedMs / STRIKE_THRUST_MS);
    const extend = 0.25 + 0.75 * (1 - Math.pow(1 - thrust, 3)); // ease-out cubic
    const alpha = elapsedMs <= STRIKE_THRUST_MS
        ? 1
        : 1 - (elapsedMs - STRIKE_THRUST_MS) / (STRIKE_TOTAL_MS - STRIKE_THRUST_MS);
    return {extend, alpha, done: false};
}

// --- The ice field ----------------------------------------------------------

/** Flake count for a field of the given radius. */
export function flakeCount(radiusPx: number): number {
    return Math.min(40, Math.max(12, Math.round(radiusPx / 7)));
}

/**
 * One snowflake's offset from the player centre, scale and twinkle. Flakes
 * sit on staggered rings (the moteSpread residue walk, so neighbours never
 * share one), drift around the centre at index-varied speeds and breathe
 * radially - the mockup's "swirl" arrows.
 */
export function snowflake(
    index: number, elapsedMs: number, radiusPx: number,
): { x: number, y: number, alpha: number, scale: number } {
    const ringFrac = 0.22 + 0.72 * (((index * 5) % 9) / 8);
    const turnsPerS = 0.05 + 0.05 * (((index * 3) % 5) / 4);
    const angle = (index * 2.399963) + (elapsedMs / 1000) * turnsPerS * TAU; // golden-angle seed
    const breath = 1 + 0.06 * Math.sin((elapsedMs / 1000) * 0.8 + index);
    const r = ringFrac * radiusPx * breath;
    const alpha = 0.55 + 0.35 * Math.sin((elapsedMs / 1000) * (1.1 + (index % 3) * 0.3) + index * 2.1);
    const scale = 0.75 + 0.5 * (((index * 7) % 4) / 3);
    return {x: Math.cos(angle) * r, y: Math.sin(angle) * r, alpha, scale};
}

export function clamp01(v: number): number {
    if (!Number.isFinite(v)) {
        return 0;
    }
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
