// ShieldBarMath is the single source of the health/shield bar split (N1,
// plan-feel-pass-2.md §5) — shared by the HUD Focus bar (Player.ts →
// HUD.updateShield) and both overhead bars (Character, Mobs).
//
// The denominator is total effective HP: max(maxHealth, health + shield).
// While health + shield fit inside the pool, the pool stays the denominator
// and the bar renders exactly as it always did — the missing-Focus gap
// included. Only when a shield pushes the total past the pool (a level-30
// Warbanner on a level-1 target) does the denominator grow, so 100 Focus
// under a 200 shield reads 1/3 Focus + 2/3 shield instead of a solid
// shield-colored bar.
//
// This is also what made the old slide-left anchoring (shield sliding back
// over a full HP fill so it stayed visible) safe to delete: under this
// denominator healthFraction + shieldFraction <= 1 by construction, so the
// shield segment always has room after the health fill.

export interface ShieldBarSegments {
    healthFraction: number;
    shieldFraction: number;
}

export function shieldBarSegments(health: number, shieldHp: number, maxHealth: number): ShieldBarSegments {
    if (!(maxHealth > 0)) {
        return {healthFraction: 0, shieldFraction: 0};
    }
    const h = Math.max(0, health);
    const s = Math.max(0, shieldHp);
    const total = Math.max(maxHealth, h + s);
    return {
        healthFraction: Math.min(h, maxHealth) / total,
        shieldFraction: s / total,
    };
}
