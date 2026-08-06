import {afterEach, describe, expect, it} from 'vitest';

import {
    DIFFICULTY_GRAY,
    difficultyColor,
    setGrayKnobs,
    setLocalPlayerLevel,
} from './Mobs';

// The honest plate (plan-world-replacement.md C0 / plan-xp-formula.md D7).
//
// The client used to own a SECOND, frozen copy of the gray rule while the
// server computed ZD(P) = grayBase + P/grayStep — so from player level 12 up,
// mobs that still paid ~14 % of an at-level kill were tinted gray. The boundary
// is now derived from the two knobs the server ships in Welcome.
//
// ⚑ These tests assert the BICONDITIONAL — gray ⟺ this kill pays nothing —
// against an independent reference implementation of the server's modifier,
// rather than re-stating the client's own arithmetic. An implementation that
// drifts from curve.Modifier goes red here even if it is self-consistent.

// referenceModifier mirrors backend curve.KillXP.Modifier, including its two
// clamps (levels floor at 1) and its `gray < 1 → 0` guard. UpBonus/UpCap are
// the shipped defaults; only the sign of the result matters below.
function referenceModifier(playerLevel: number, mobLevel: number,
                           grayBase: number, grayStep: number): number {
    const p = Math.max(1, playerLevel);
    const m = Math.max(1, mobLevel);
    const delta = m - p;
    if (delta >= 0) {
        return 1 + 0.05 * Math.min(delta, 4);
    }
    const gray = grayBase + (grayStep < 1 ? 0 : Math.floor(p / grayStep));
    if (gray < 1) {
        return 0;
    }
    return Math.max(0, 1 + delta / gray);
}

const SHIPPED_BASE = 5;
const SHIPPED_STEP = 6;

afterEach(() => {
    // The knobs and the mirrored player level are module state; leave the
    // module as the next test expects to find it.
    setGrayKnobs(SHIPPED_BASE, SHIPPED_STEP);
    setLocalPlayerLevel(1);
});

describe('nameplate difficulty tint', () => {
    it.each([
        ['the shipped economy', SHIPPED_BASE, SHIPPED_STEP],
        ['a wide band', 11, 3],
        ['a narrow band', 2, 6],
        ['grayStep 0 — the distance stops widening with level', 5, 0],
        ['no band at all — everything below you is gray', 0, 0],
    ])('gray means exactly "pays nothing" — %s', (_label, base, step) => {
        setGrayKnobs(base, step);
        for (let playerLevel = 1; playerLevel <= 30; playerLevel++) {
            setLocalPlayerLevel(playerLevel);
            for (let mobLevel = 1; mobLevel <= 30; mobLevel++) {
                const pays = referenceModifier(playerLevel, mobLevel, base, step) > 0;
                const isGray = difficultyColor(mobLevel) === DIFFICULTY_GRAY;
                expect(isGray,
                    `P=${playerLevel} vs mob ${mobLevel} (grayBase ${base}, grayStep ${step}): ` +
                    `plate is ${isGray ? 'gray' : 'coloured'} but the kill ` +
                    `${pays ? 'pays' : 'pays nothing'}`).toBe(!pays);
            }
        }
    });

    // The measured lie C0 exists to delete: at P=12 the old frozen copy grayed
    // everything at or below level 6, while ZD(12) = 7 means a level-6 mob
    // still pays 1/7 of an at-level kill.
    it('no longer grays the level-6 mob that still pays a level-12 player', () => {
        setLocalPlayerLevel(12);
        expect(difficultyColor(6)).not.toBe(DIFFICULTY_GRAY);
        expect(difficultyColor(5)).toBe(DIFFICULTY_GRAY);
    });

    // Gray is decided BEFORE the frozen presentation thresholds, so it cannot
    // be undercut by them. With a narrow band the boundary reaches up into what
    // the ordered band list calls "even" — and a yellow mob paying nothing is
    // exactly the divergence being deleted, just at the other end.
    it('wins over the frozen thresholds when the band is narrow', () => {
        setGrayKnobs(2, 0); // ZD = 2 at every level
        setLocalPlayerLevel(10);
        expect(referenceModifier(10, 8, 2, 0)).toBe(0);
        expect(difficultyColor(8)).toBe(DIFFICULTY_GRAY); // the band list calls Δ −2 "even"
    });

    // The four presentation thresholds have no server twin and are unchanged.
    it('keeps the red/orange/yellow/green thresholds', () => {
        setLocalPlayerLevel(20);
        expect(difficultyColor(25)).toBe(0xff5555);   // Δ +5 deadly
        expect(difficultyColor(23)).toBe(0xff9a3c);   // Δ +3 hard
        expect(difficultyColor(20)).toBe(0xf5d442);   // Δ  0 even
        expect(difficultyColor(18)).toBe(0xf5d442);   // Δ −2 even
        expect(difficultyColor(17)).toBe(0x5fd35f);   // Δ −3 easy
    });
});
