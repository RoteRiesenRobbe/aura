/**
 * Skill VFX colour (plan-skill-vfx.md C2a, §4.2): a skill's visuals take their
 * colour from what the skill DOES, so an authored layer needs no `tint` to
 * read as fire or frost, and a retune that changes a skill's damage type
 * recolours its VFX for free.
 *
 * The rule: the first effect that carries damage tags decides, by its first
 * tag; anything else (heals, shields, a gate-keyed payload, an unknown tag) is
 * neutral. A layer's own `tint` wins outright.
 *
 * ⚑ Every hex below is [PLACEHOLDER] - readable, deliberately not art.
 */
import {SkillDefinition, SkillEffect} from '../../../client-data/Skills';

/**
 * The six authored damage types (api/skill-vocabulary.json `damageTypes`),
 * pinned against the fixture by SkillFxPalette.test.ts.
 */
export const DAMAGE_TYPE_COLORS: Record<string, number> = {
    fire: 0xff7a1a,
    frost: 0x9fd8ff,
    nature: 0x8fe36b,
    poison: 0xa8e04a,
    bleed: 0xd14545,
    physical: 0xdfe4ea,
};

/** Untyped: heals, shields, gate-keyed payloads, a tag we do not know. */
export const NEUTRAL_COLOR = 0xe8e8e8;

/** `#rrggbb` → a Pixi colour, or null for anything else. */
export function parseTint(tint: string | undefined): number | null {
    if (!tint || !/^#[0-9a-fA-F]{6}$/.test(tint)) {
        return null;
    }
    return parseInt(tint.slice(1), 16);
}

/** The damage tags an effect can carry, in the order they are looked at. */
function damageTags(effect: SkillEffect): string[] | undefined {
    return effect.damage?.tags
        ?? effect.dot?.tags
        ?? effect.retaliateDamage?.tags
        ?? effect.retaliateBurst?.tags;
}

/** The colour a layer of this skill draws in, `tint` taking precedence. */
export function skillFxColor(def: SkillDefinition | undefined, tint: string | undefined): number {
    const authored = parseTint(tint);
    if (authored !== null) {
        return authored;
    }
    for (const effect of def?.effects ?? []) {
        const tags = damageTags(effect);
        if (tags && tags.length > 0) {
            return DAMAGE_TYPE_COLORS[tags[0]] ?? NEUTRAL_COLOR;
        }
    }
    return NEUTRAL_COLOR;
}
