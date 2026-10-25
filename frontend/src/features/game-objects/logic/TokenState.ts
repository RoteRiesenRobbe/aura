import {AURA_CATEGORY_COLORS} from './AuraRings';

/**
 * Client mirror of the backend `skills.AppliedEffect` bitmask, serialized as
 * the `applied_effects` wire ushort on both Character and Mob: the buff/debuff
 * kinds currently applied TO an entity — the received-status opposite of
 * `aura_category`, which describes what the entity projects.
 *
 * SYNCED WITH BACKEND (backend/pkg/aura/skills/applied_effects.go), pinned on
 * both sides by api/shared-constants.json (§35 C4c) — a regular enum on
 * purpose, so the pin test can enumerate its members.
 *
 * Shields have no bit on purpose: the overhead bar's absorb segment
 * (shield_hp) already shows them.
 */
export enum AppliedEffectBit {
    Dot = 1 << 0,
    Slow = 1 << 1,
    Hot = 1 << 2,
    Resist = 1 << 3,
    TickRate = 1 << 4,
    Calm = 1 << 5,
    Charm = 1 << 6,
    Speed = 1 << 7,
    // A timed stat buff or debuff on others (plan-effect-types-round-2.md C1):
    // the sign of the bonus picks the bit.
    StatUp = 1 << 8,
    StatDown = 1 << 9,
    // A live reflect, own or granted (plan-effect-types-round-2.md C2): thorns
    // on an ally or a mob reads before anyone hits it.
    Reflect = 1 << 10,
    // A live fear (plan-effect-types-round-2.md C5): a running mob reads as
    // feared, not as one fleeing on its own.
    Fear = 1 << 11,
    // A live stealth (C6, D24): a whole-entity alpha, never an indicator.
    Stealth = 1 << 12,
}

/** A stealthed entity's alpha, for every viewer and its own player. [PLACEHOLDER] */
export const STEALTH_ALPHA = 0.4;

/**
 * A state's glyph (R12): the pack icon, and the committed `file` drawn where
 * the pack is not on this machine (plan-appearance.md D42).
 */
export interface StateGlyph {
    packIcon: string;
    file: string;
}

/**
 * One state an actor can be in (plan-entity-presentation.md D1). A row with an
 * `angle` is an indicator at that reserved position on the medallion's rim,
 * clockwise from 12 o'clock; a row with a `treatment` changes the whole token.
 */
export interface StateRow {
    id: string;
    source: AppliedEffectBit | 'dead';
    angle?: number;
    colour?: number;
    glyph?: StateGlyph;
    treatment?: { alpha?: number, grey?: true };
}

/**
 * The state table (D1, D2): every state an actor is in is one row here, and
 * nothing else reads `applied_effects` for drawing. Angles are explicit,
 * never derived from a count, so adding a state never moves another (R5).
 * Harmful to the wearer sits on the right half, helpful on the left (R6);
 * calm and charm are done to a mob against its will, so they are harmful
 * (buff tray D13). 0° is stun's (EP2); 157.5° and 202.5° are the spares.
 *
 * The colours are the retired pip strip's and the colour-disc fallback until
 * a glyph is picked (R12). Dot/slow/hot/resist/speed reuse the aura-ring
 * category language, so "purple around a mob" and "purple on its rim" mean
 * the same thing. Calm's pale blue is far from slow's blue (a slowed wolf is
 * still coming for you, a calmed one is not), charm's warm violet far from
 * both. Angles, colours and the glyph [PLACEHOLDER].
 *
 * ⚑ A new effect kind that wants an indicator takes a row here, at a spare
 * angle on its side (the add-content skill's effect-type checklist).
 */
export const STATE_ROWS: readonly StateRow[] = [
    // Right half: harmful.
    {id: 'dot', source: AppliedEffectBit.Dot, angle: 22.5, colour: AURA_CATEGORY_COLORS.dot},
    {id: 'slow', source: AppliedEffectBit.Slow, angle: 45, colour: AURA_CATEGORY_COLORS.slow},
    // A dull rust for a weakened stat.
    {id: 'statDown', source: AppliedEffectBit.StatDown, angle: 67.5, colour: 0x9a4f2c},
    // A sickly green-grey, apart from every ring colour.
    {id: 'fear', source: AppliedEffectBit.Fear, angle: 90, colour: 0x7f9a5a},
    {id: 'calm', source: AppliedEffectBit.Calm, angle: 112.5, colour: 0xa8d8f0},
    {id: 'charm', source: AppliedEffectBit.Charm, angle: 135, colour: 0xc98ae0},
    // 6 o'clock: dead, lit by the corpse (plan-appearance.md C6), never by
    // the wire. Grey everything but the red skull (R2, D42): PONETI
    // `Rune_Death_nb`, with a committed placeholder for clones without it.
    {
        id: 'dead', source: 'dead', angle: 180, colour: 0xc0392b,
        glyph: {packIcon: 'red-skull', file: require('../assets/red-skull.svg')},
        treatment: {grey: true},
    },
    // Left half: helpful.
    // A thorn rose, apart from the damage ring's red.
    {id: 'reflect', source: AppliedEffectBit.Reflect, angle: 247.5, colour: 0xd0507a},
    {id: 'tickRate', source: AppliedEffectBit.TickRate, angle: 225, colour: 0xe0812e},
    {id: 'resist', source: AppliedEffectBit.Resist, angle: 270, colour: AURA_CATEGORY_COLORS.resist},
    // A gold for a raised stat.
    {id: 'statUp', source: AppliedEffectBit.StatUp, angle: 292.5, colour: 0xe8c547},
    {id: 'speed', source: AppliedEffectBit.Speed, angle: 315, colour: AURA_CATEGORY_COLORS.speed},
    {id: 'hot', source: AppliedEffectBit.Hot, angle: 337.5, colour: AURA_CATEGORY_COLORS.heal},
    // Treatment only.
    {id: 'stealth', source: AppliedEffectBit.Stealth, treatment: {alpha: STEALTH_ALPHA}},
];

/** What a token shows for one (mask, dead): the entity applies alpha, the medallion the rest. */
export interface TokenState {
    mask: number;
    dead: boolean;
    alpha: number;
    grey: boolean;
    indicators: readonly StateRow[];
}

function isLive(row: StateRow, mask: number, dead: boolean): boolean {
    return row.source === 'dead' ? dead : (mask & row.source) !== 0;
}

/**
 * The one composition of the state table (D1): `mask` is the wire
 * `applied_effects`, `dead` whether the entity is a corpse (R1, no wire bit).
 */
export function tokenState(mask: number, dead: boolean): TokenState {
    let alpha = 1;
    let grey = false;
    const indicators: StateRow[] = [];
    for (const row of STATE_ROWS) {
        if (!isLive(row, mask, dead)) {
            continue;
        }
        if (row.treatment?.alpha !== undefined) {
            alpha = Math.min(alpha, row.treatment.alpha);
        }
        if (row.treatment?.grey) {
            grey = true;
        }
        if (row.angle !== undefined) {
            indicators.push(row);
        }
    }
    return {mask, dead, alpha, grey, indicators};
}

// The indicator ring's geometry (D4). The medallion ring spans ±size, so the
// band starts INDICATOR_GAP outside it. [PLACEHOLDER] px, judged at the EP1 look.
export const INDICATOR_GAP = 3;
export const INDICATOR_MAX = 12;
const INDICATOR_MIN = 6;
// A share of the arc between two grid positions, so neighbours never touch.
const ARC_SHARE = 0.85;

/** An indicator's diameter on a token of `size`: capped, shrunk to the 22.5° arc on small tokens, floored. */
export function indicatorDiameter(size: number): number {
    const arcSpacing = (size + INDICATOR_GAP) * Math.PI / 8;
    return Math.max(INDICATOR_MIN, Math.min(INDICATOR_MAX, arcSpacing * ARC_SHARE));
}

/** The radius the indicators' centres sit on: the band's inner edge is INDICATOR_GAP outside the ring. */
export function indicatorRadius(size: number): number {
    return size + INDICATOR_GAP + indicatorDiameter(size) / 2;
}

/**
 * How far the band sticks out beyond the ring (D8): the one source every
 * anchor near a medallion (bars, names, level number, E cap, quest glyph) adds.
 */
export function indicatorBand(size: number): number {
    return INDICATOR_GAP + indicatorDiameter(size);
}

/** The offset of `angle` (degrees, clockwise from 12 o'clock) at `radius`, in Pixi's y-down space. */
export function indicatorOffset(angle: number, radius: number): { x: number, y: number } {
    const rad = angle * Math.PI / 180;
    return {x: radius * Math.sin(rad), y: -radius * Math.cos(rad)};
}
