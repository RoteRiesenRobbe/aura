import {Container, Graphics} from 'pixi.js';

/**
 * Client mirror of the backend `skills.AuraCategory` bitmask, serialized as the
 * `aura_category` wire ubyte on both Character and Mob (triage item 7).
 *
 * SYNCED WITH BACKEND (backend/pkg/aura/skills/aura_category.go), pinned on
 * both sides by api/shared-constants.json (§35 C4c) — a regular enum on
 * purpose, so the pin test can enumerate its members.
 *
 * Only the bit values are synced — which skills carry which categories is
 * resolved server-side, so this file never needs a skill-ID table.
 */
export enum AuraCategoryBit {
    Damage = 1 << 0,
    Heal = 1 << 1,
    Shield = 1 << 2,
    Dot = 1 << 3,
    Slow = 1 << 4,
    Light = 1 << 5,
    Resist = 1 << 6,
    // ⚑ The LAST free bit in the aura_category ubyte (plan-effect-types.md C4).
    // A ninth category needs a wider wire field — a backlog §39 conversation.
    Speed = 1 << 7,
}

/**
 * The category colour language, shared by the aura rings and the applied-effect
 * pips (EffectPips.ts) — a dot pip and a dot ring mean the same colour on
 * purpose. All colours [PLACEHOLDER] — tune in-game.
 */
export const AURA_CATEGORY_COLORS = {
    damage: 0xe04a3c,
    dot: 0x9a4ec9,
    heal: 0x4ec96a,
    shield: 0xe0b83c,
    slow: 0x4a9ae0,
    light: 0xf0dfa0,
    resist: 0x5fbfb0,
    // The speed pip's own green, moved here from EffectPips.ts rather than
    // duplicated (PO ruling 2026-08-17): a haste RING and a hastened ally's PIP
    // are the same colour because they are the same fact seen from two sides.
    speed: 0x6ee06e,
} as const;

interface AuraCategoryStyle {
    bit: number;
    color: number;
}

/**
 * The ring styles. Order matters: a multi-category aura stacks one band per set
 * bit inward from the aura edge, in this order, so the list doubles as the
 * layering priority. Adding a category is one entry here plus one bit above.
 */
const AURA_CATEGORY_STYLES: readonly AuraCategoryStyle[] = [
    {bit: AuraCategoryBit.Damage, color: AURA_CATEGORY_COLORS.damage},
    {bit: AuraCategoryBit.Dot, color: AURA_CATEGORY_COLORS.dot},
    {bit: AuraCategoryBit.Heal, color: AURA_CATEGORY_COLORS.heal},
    {bit: AuraCategoryBit.Shield, color: AURA_CATEGORY_COLORS.shield},
    {bit: AuraCategoryBit.Slow, color: AURA_CATEGORY_COLORS.slow},
    {bit: AuraCategoryBit.Resist, color: AURA_CATEGORY_COLORS.resist},
    // Beside the other support categories and inside them, so a hypothetical
    // ward-plus-haste aura reads outward as resist-then-speed. Light stays
    // innermost: it is the one category that is not a combat effect at all.
    {bit: AuraCategoryBit.Speed, color: AURA_CATEGORY_COLORS.speed},
    {bit: AuraCategoryBit.Light, color: AURA_CATEGORY_COLORS.light},
];

/** Thickness of one category band, in px. [PLACEHOLDER] */
const BAND_WIDTH = 4;
/** Opacity of a category band. [PLACEHOLDER] */
const BAND_ALPHA = 0.75;
/** Opacity of the interior area wash. [PLACEHOLDER] */
const FILL_ALPHA = 0.1;

/** Ring pulse overshoot on the beat (N5/D3): scale peaks at 1 + this. [PLACEHOLDER] */
const PULSE_AMPLITUDE = 0.06;
/** Per-snapshot pulse decay (~30 Hz → settles in ~250 ms). [PLACEHOLDER] */
const PULSE_DECAY = 0.82;

/**
 * The aura ring: an interior area wash plus one coloured band per effect
 * category, stacked INWARD from the aura edge so a multi-category aura simply
 * has a thicker border.
 *
 * The bands deliberately share one outer edge rather than sitting at different
 * radii: every effect on an aura applies over the same radius, so concentric
 * rings at different distances would imply areas of effect that do not exist
 * (PO feedback, triage item 7). The outermost band's outer edge is exactly the
 * true aura radius — that edge is the gameplay-critical one.
 */
export class AuraRingStack {
    /**
     * The rings live on their own container so the caller decides where they sit
     * in the entity's display list — the character appends it below the avatar,
     * the mob inserts it at the bottom of `shape`.
     */
    readonly container: Container = new Container();

    private readonly graphics: Graphics = new Graphics();
    private radiusPx: number = 0;
    private mask: number = 0;
    // Last drawn state: the setters run on every snapshot, but radius and
    // categories change rarely, so redraw only when they actually differ.
    private drawnRadius: number = -1;
    private drawnMask: number = -1;

    constructor() {
        this.container.addChild(this.graphics);
    }

    /**
     * @param mask the `aura_category` wire byte; 0 = no aura active → no ring
     */
    setCategories(mask: number) {
        this.mask = mask;
        this.redraw();
    }

    /** @param radiusPx the true aura radius; the ring's outer edge sits exactly here */
    setRadius(radiusPx: number) {
        this.radiusPx = radiusPx;
        this.redraw();
    }

    // Pulse energy for the N5 beat pulse: 1 at the beat, decayed per snapshot.
    private pulseEnergy = 0;

    /**
     * Drive the ring pulse (N5/D3): on a landed beat the ring scales up
     * ~PULSE_AMPLITUDE and settles by decay — motion reads where more
     * brightness does not, particularly with several overlapping rings. The
     * overshoot is deliberately brief so the ring's resting edge stays the
     * true aura radius, which is the gameplay-critical line.
     *
     * Called once per snapshot from setAuraTick (the beat surface), so the
     * decay runs at snapshot cadence — no per-frame ticker needed. ⚑ No snap
     * flash: offered and not taken (D3); do not add one here "as part of the
     * pulse".
     */
    beat(landed: boolean) {
        if (landed) {
            this.pulseEnergy = 1;
        } else if (this.pulseEnergy > 0) {
            this.pulseEnergy *= PULSE_DECAY;
            if (this.pulseEnergy < 0.02) {
                this.pulseEnergy = 0;
            }
        } else {
            return; // settled — leave the scale untouched
        }
        this.container.scale.set(1 + PULSE_AMPLITUDE * this.pulseEnergy);
    }

    private redraw() {
        if (this.radiusPx === this.drawnRadius && this.mask === this.drawnMask) {
            return;
        }
        this.drawnRadius = this.radiusPx;
        this.drawnMask = this.mask;

        this.graphics.clear();
        if (this.radiusPx <= 0 || this.mask === 0) {
            this.graphics.visible = false;
            return;
        }
        this.graphics.visible = true;

        const active = AURA_CATEGORY_STYLES.filter(style => (this.mask & style.bit) !== 0);

        // Area wash in the leading category's colour: it marks the area without
        // competing with the bands that carry the actual type information.
        this.graphics
            .circle(0, 0, this.radiusPx)
            .fill({color: active[0].color, alpha: FILL_ALPHA});

        // Bands stack inward from the edge. Strokes are centred on the path, so
        // the first band's outer edge lands on the true radius at half a width in.
        active.forEach((style, i) => {
            const radius = this.radiusPx - BAND_WIDTH * (i + 0.5);
            if (radius <= 0) {
                return;
            }
            this.graphics
                .circle(0, 0, radius)
                .stroke({width: BAND_WIDTH, color: style.color, alpha: BAND_ALPHA});
        });
    }
}
