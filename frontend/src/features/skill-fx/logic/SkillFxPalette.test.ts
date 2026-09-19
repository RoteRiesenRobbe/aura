import {describe, expect, it} from 'vitest';
import {readFileSync} from 'fs';
import {SkillDefinition, SkillEffect} from '../../../client-data/Skills';
import {DAMAGE_TYPE_COLORS, NEUTRAL_COLOR, parseTint, skillFxColor} from './SkillFxPalette';

// vitest runs with cwd = frontend/, the SharedConstants.test.ts convention.
const vocabulary = JSON.parse(readFileSync('../api/skill-vocabulary.json', 'utf-8'));

function skill(effects: Partial<SkillEffect>[]): SkillDefinition {
    return {effects: effects as SkillEffect[]} as SkillDefinition;
}

describe('the damage-type palette', () => {
    it('covers exactly the authored damage types', () => {
        expect(Object.keys(DAMAGE_TYPE_COLORS).sort()).toEqual([...vocabulary.damageTypes].sort());
    });
});

describe('skillFxColor', () => {
    it('reads the first damage-carrying effect and its first tag', () => {
        const def = skill([
            {type: 'slow', slow: {fraction: 0.3, fractionPerLevel: 0}},
            {type: 'damage_aura', damage: {tags: ['fire', 'physical']} as any},
        ]);
        expect(skillFxColor(def, undefined)).toBe(DAMAGE_TYPE_COLORS.fire);
    });

    it('reads a dot, a retaliate_damage and a retaliate_burst the same way', () => {
        expect(skillFxColor(skill([{type: 'dot_aura', dot: {tags: ['poison']} as any}]), undefined))
            .toBe(DAMAGE_TYPE_COLORS.poison);
        expect(skillFxColor(
            skill([{type: 'retaliate_damage', retaliateDamage: {tags: ['frost']} as any}]), undefined))
            .toBe(DAMAGE_TYPE_COLORS.frost);
        expect(skillFxColor(
            skill([{type: 'retaliate_burst', retaliateBurst: {tags: ['bleed']} as any}]), undefined))
            .toBe(DAMAGE_TYPE_COLORS.bleed);
    });

    it('falls back to neutral for an untyped, gated or unknown skill', () => {
        expect(skillFxColor(skill([{type: 'heal_aura'}]), undefined)).toBe(NEUTRAL_COLOR);
        // A gateKey payload carries no damage types at all (D4).
        expect(skillFxColor(skill([{type: 'damage_aura', damage: {tags: []} as any}]), undefined))
            .toBe(NEUTRAL_COLOR);
        expect(skillFxColor(skill([{type: 'damage_aura', damage: {tags: ['ether']} as any}]), undefined))
            .toBe(NEUTRAL_COLOR);
        expect(skillFxColor(undefined, undefined)).toBe(NEUTRAL_COLOR);
    });

    it('lets the layer tint win over the damage type', () => {
        const def = skill([{type: 'damage_aura', damage: {tags: ['fire']} as any}]);
        expect(skillFxColor(def, '#9fd8ff')).toBe(0x9fd8ff);
    });

    it('ignores an unparsable tint rather than drawing nothing', () => {
        const def = skill([{type: 'damage_aura', damage: {tags: ['fire']} as any}]);
        expect(skillFxColor(def, 'blue')).toBe(DAMAGE_TYPE_COLORS.fire);
    });
});

describe('parseTint', () => {
    it('takes the authored #rrggbb form', () => {
        expect(parseTint('#ff8c1a')).toBe(0xff8c1a);
        expect(parseTint('#FFFFFF')).toBe(0xffffff);
        expect(parseTint('#000000')).toBe(0x000000);
    });
    it('rejects everything else', () => {
        expect(parseTint('')).toBeNull();
        expect(parseTint(undefined)).toBeNull();
        expect(parseTint('ff8c1a')).toBeNull();
        expect(parseTint('#fff')).toBeNull();
        expect(parseTint('#gggggg')).toBeNull();
    });
});
