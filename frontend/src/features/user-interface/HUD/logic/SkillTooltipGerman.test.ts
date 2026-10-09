import {describe, expect, it} from 'vitest';
import type {SkillDefinition, SkillEffect} from '../../../../client-data/Skills';

// plan-localization.md C4: the tooltip in German. The locale is resolved once
// at module load (D11), so it is pinned BEFORE the formatter is imported: this
// file's own module registry boots in de.
window.localStorage.setItem('aura.locale', 'de');

function effect(partial: Partial<SkillEffect> & { type: string }): SkillEffect {
    return {
        costFractionOfMax: 0, costFractionOfMaxPerLevel: 0,
        radius: 0, radiusPerLevel: 0,
        tickInterval: 0, tickIntervalPerLevel: 0,
        selector: 'all', maxTargets: 0, maxTargetsPerLevel: 0,
        targetsEnemies: false, targetsAllies: false, targetsStructures: false,
        ...partial,
    };
}

const rejuvenation: SkillDefinition = {
    id: 1, name: 'Rejuvenation', displayName: 'Verjüngung', icon: '', packIcon: '',
    category: 'aura', maxLevel: 3, legacy: false,
    cooldownTicks: 0, cooldownTicksPerLevel: 0,
    castTicks: 45, castTicksPerLevel: 0, castInterruptedByDamage: true,
    effects: [effect({
        type: 'hot_aura',
        radius: 2.5, radiusPerLevel: 0.2,
        tickInterval: 60,
        targetsAllies: true,
        hot: {hp: 4, hpPerLevel: 2, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0, tickCount: 6, interval: 60, targetsSelf: true},
    })],
};

describe('the skill tooltip in German (C4)', () => {
    it('words every line in German, with the decimal comma and spaced units', async () => {
        const {formatSkillTooltip} = await import('./SkillTooltip');
        const content = formatSkillTooltip(rejuvenation, 1, 1, 0, 1, true);
        const text = content.lines.map(l => l.text);
        expect(content.subtitle).toBe('Aura · St. 1/3');
        expect(text[0]).toBe('Heilung über Zeit: 4 → 6 × 6 über 12 s, erneuert alle 2 s');
        expect(text).toContain('Heilt auch dich');
        expect(text).toContain('Radius: 2,5 → 2,7 m');
        expect(text).toContain('Ziele: alle Verbündete in Reichweite');
        expect(text).toContain('Wirkzeit: 1,5 s (wird durch Schaden unterbrochen)');
    });
});
