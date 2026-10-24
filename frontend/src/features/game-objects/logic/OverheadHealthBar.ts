import {Container, Graphics} from 'pixi.js';
import {shieldBarSegments} from './ShieldBarMath';
import {
    OVERHEAD_BAR_BACKDROP,
    OVERHEAD_BAR_BORDER,
    OVERHEAD_BAR_HEALTH_FILL,
    OVERHEAD_BAR_SHIELD_FILL,
} from '../../../client-data/Theme';

// OverheadHealthBar is the shared overhead health/shield bar (plan-code-health.md
// C5): Character and Mob used to carry near-byte-identical private copies, so
// every restyle had to be made twice or shipped half-done. The two deliberate
// asymmetries stay with the callers: the anchor y (constructor param) and the
// parent — Character adds the container to its unfiltered nameplate plate,
// Mob adds it to `shape` so the bar inherits the night tint and corpse fade.
//
// The style constants live in client-data/Theme.ts since C6 (the leaf both
// this module and StateIndicators read; importing them from here was a cycle).

export interface OverheadBarDimensions {
    barWidth: number;
    barHeight: number;
}

// The bar tracks 0.9 × entity size, clamped so tiny mobs stay readable and
// bosses don't wear a screen-wide bar; the height follows the width.
export function overheadBarDimensions(size: number): OverheadBarDimensions {
    const barWidth = Math.min(160, Math.max(30, size * 0.9));
    const barHeight = Math.max(5, Math.min(10, barWidth * 0.12));
    return {barWidth, barHeight};
}

export class OverheadHealthBar {
    readonly container: Container;

    private readonly healthFillGroup: Container;
    // Absorb segment on the bar (skill-vocab chunk 2, bare).
    private readonly shieldFillGroup: Container;
    private readonly barInnerX: number;
    private readonly barInnerWidth: number;
    // Raw wire values, kept so either setter can re-derive BOTH bar segments —
    // the split depends on health + shield together (N1, shieldBarSegments).
    private lastHealth: number = 1;
    private lastMaxHealth: number = 1;
    private lastShieldHp: number = 0;

    constructor(size: number, anchorY: number) {
        const {barWidth, barHeight} = overheadBarDimensions(size);
        const borderWidth = OVERHEAD_BAR_BORDER.width;

        this.container = new Container();
        this.container.y = anchorY;

        this.container.addChild(
            new Graphics()
                .rect(-barWidth / 2, -barHeight / 2, barWidth, barHeight)
                .fill(OVERHEAD_BAR_BACKDROP)
                .stroke(OVERHEAD_BAR_BORDER),
        );

        const innerWidth = barWidth - 2 * borderWidth;
        const innerHeight = barHeight - 2 * borderWidth;
        this.healthFillGroup = new Container();
        this.healthFillGroup.position.set(-innerWidth / 2, -innerHeight / 2);
        this.healthFillGroup.addChild(
            new Graphics()
                .rect(0, 0, innerWidth, innerHeight)
                .fill(OVERHEAD_BAR_HEALTH_FILL),
        );
        this.container.addChild(this.healthFillGroup);

        // Absorb segment; laid out by layoutBars.
        this.barInnerX = -innerWidth / 2;
        this.barInnerWidth = innerWidth;
        this.shieldFillGroup = new Container();
        this.shieldFillGroup.position.set(-innerWidth / 2, -innerHeight / 2);
        this.shieldFillGroup.addChild(
            new Graphics()
                .rect(0, 0, innerWidth, innerHeight)
                .fill(OVERHEAD_BAR_SHIELD_FILL),
        );
        this.shieldFillGroup.visible = false;
        this.container.addChild(this.shieldFillGroup);

        this.setHealth(1, 1); // full until the first snapshot
    }

    // The bar's own y offset — Mob.nameplateY derives the plate text position
    // from it, so the two cannot drift apart.
    get anchorY(): number {
        return this.container.y;
    }

    setHealth(health: number, maxHealth: number) {
        this.lastHealth = health;
        this.lastMaxHealth = maxHealth;
        this.layoutBars();
    }

    // setShield renders the absorb segment; 0 hides it. Split maths shared
    // with the HUD bar via shieldBarSegments (N1): the shield sits directly
    // after the health fill and always fits, because the bar's denominator is
    // total effective HP.
    setShield(shieldHp: number, maxHealth: number) {
        this.lastShieldHp = shieldHp;
        this.lastMaxHealth = maxHealth;
        this.layoutBars();
    }

    private layoutBars() {
        const {healthFraction, shieldFraction} =
            shieldBarSegments(this.lastHealth, this.lastShieldHp, this.lastMaxHealth);
        this.healthFillGroup.scale.x = healthFraction;
        this.shieldFillGroup.visible = shieldFraction > 0;
        this.shieldFillGroup.scale.x = shieldFraction;
        this.shieldFillGroup.position.x = this.barInnerX + healthFraction * this.barInnerWidth;
    }
}
