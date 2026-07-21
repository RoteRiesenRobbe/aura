import {Container, Graphics} from 'pixi.js';
import {AURA_CATEGORY_COLORS} from './AuraRings';

/**
 * Client mirror of the backend `skills.AppliedEffect` bitmask, serialized as
 * the `applied_effects` wire ubyte on both Character and Mob: the buff/debuff
 * kinds currently applied TO an entity — the received-status opposite of
 * `aura_category`, which describes what the entity projects.
 *
 * SYNCED WITH BACKEND (backend/pkg/aura/skills/applied_effects.go)
 *
 * Shields have no bit on purpose: the overhead bar's absorb segment
 * (shield_hp) already shows them.
 */
export const enum AppliedEffectBit {
    Dot = 1 << 0,
    Slow = 1 << 1,
    Hot = 1 << 2,
    Resist = 1 << 3,
    TickRate = 1 << 4,
}

interface PipStyle {
    bit: AppliedEffectBit;
    color: number;
}

/**
 * Pip colours and display order (debuffs first, then buffs). Dot/slow/hot reuse
 * the aura-ring category language so "purple around a mob" and "purple pip on
 * me" mean the same thing; resist and tick-rate have no ring category, so their
 * colours are new here. All colours [PLACEHOLDER] — tune in-game.
 */
const PIP_STYLES: readonly PipStyle[] = [
    {bit: AppliedEffectBit.Dot, color: AURA_CATEGORY_COLORS.dot},
    {bit: AppliedEffectBit.Slow, color: AURA_CATEGORY_COLORS.slow},
    {bit: AppliedEffectBit.Hot, color: AURA_CATEGORY_COLORS.heal},
    {bit: AppliedEffectBit.Resist, color: 0x5fbfb0},
    {bit: AppliedEffectBit.TickRate, color: 0xe0812e},
];

/** Pip radius in px. [PLACEHOLDER] */
const PIP_RADIUS = 4;
/** Center-to-center spacing between pips, in px. [PLACEHOLDER] */
const PIP_SPACING = 11;
/** Width of the dark backing rim that keeps pips readable on any ground. */
const RIM_WIDTH = 1.5;

/**
 * The buff/debuff pip strip: one coloured dot per applied-effect kind, centered
 * on x=0 — the caller positions the container (under the overhead HP bar on
 * both characters and mobs). Hidden while nothing is applied.
 */
export class EffectPips {
    readonly container: Container = new Container();

    private readonly graphics: Graphics = new Graphics();
    // Snapshots repeat the mask 30×/s; redraw only when it actually changes.
    private drawnMask: number = 0;

    constructor() {
        this.container.addChild(this.graphics);
    }

    /**
     * @param mask the `applied_effects` wire byte; 0 = nothing applied → hidden
     */
    setMask(mask: number) {
        if (mask === this.drawnMask) {
            return;
        }
        this.drawnMask = mask;

        this.graphics.clear();
        const active = PIP_STYLES.filter(style => (mask & style.bit) !== 0);
        this.graphics.visible = active.length > 0;

        const startX = -((active.length - 1) * PIP_SPACING) / 2;
        active.forEach((style, i) => {
            const x = startX + i * PIP_SPACING;
            this.graphics
                .circle(x, 0, PIP_RADIUS + RIM_WIDTH)
                .fill({color: 0x000000, alpha: 0.6})
                .circle(x, 0, PIP_RADIUS)
                .fill({color: style.color, alpha: 0.95});
        });
    }
}
