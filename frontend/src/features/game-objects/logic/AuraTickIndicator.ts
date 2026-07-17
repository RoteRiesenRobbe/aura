import {Container, Graphics} from 'pixi.js';

/**
 * Bare aura tick indicator (skill-vocab chunk 6): a thin ring highlight at the
 * aura edge whose brightness RAMPS UP toward each tick and discharges when the
 * tick lands, driven by the wire aura_tick_interval / aura_tick_phase fields.
 * Deliberately subtle — it only glows the ring you already draw, never floods
 * the interior — so a screenful of auras reads as a calm rhythm, not alarms.
 * The beat is still visible (and visibly speeds up under a haste); the hit
 * itself keeps its existing aura-hit VFX (slash / fire). This is only the
 * wind-up glow.
 *
 * Minimal by design (one stroked ring, alpha modulated per snapshot) — the
 * polished indicator is a step-8 concern. Both Character and Mob own one on
 * their shape and feed it the same px-space ring radius their aura sprite uses.
 */
export class AuraTickIndicator {
    private glow: Graphics = null;
    private radiusPx = 0;
    private interval = 0;
    private phase = 0;

    constructor(private readonly parent: Container) {
    }

    /** The ring radius in px (the same value the aura sprite is sized to). */
    setRadius(radiusPx: number) {
        if (radiusPx === this.radiusPx) {
            return;
        }
        this.radiusPx = radiusPx;
        this.rebuild();
    }

    /** interval + phase in game ticks; interval 0 = no active aura → hidden. */
    setTick(interval: number, phase: number) {
        this.interval = interval;
        this.phase = phase;
        this.applyGlow();
    }

    // Redraw the stroked ring only when the radius changes; per-tick updates
    // just modulate the Graphics' alpha (applyGlow), which is far cheaper.
    private rebuild() {
        if (this.radiusPx <= 0) {
            if (this.glow !== null) {
                this.glow.visible = false;
            }
            return;
        }
        if (this.glow === null) {
            this.glow = new Graphics();
            // On top of the base ring sprite so the highlight reads; a thin
            // edge stroke never covers the character/mob art in the centre.
            this.parent.addChild(this.glow);
        }
        this.glow
            .clear()
            .circle(0, 0, this.radiusPx)
            .stroke({width: GLOW_WIDTH_PX, color: GLOW_COLOR, alpha: 1});
        this.applyGlow();
    }

    private applyGlow() {
        const active = this.interval > 0 && this.radiusPx > 0 && this.glow !== null;
        if (!active) {
            if (this.glow !== null) {
                this.glow.visible = false;
            }
            return;
        }
        this.glow.visible = true;
        // phase / interval is 0 right after a tick and grows toward 1 as the
        // next tick approaches: the ring brightens toward the beat, then eases
        // back at the tick (discharging into the existing hit VFX). The
        // baseline keeps the edge always faintly lit — without it the ring
        // blinked fully off at every tick AND right after each aura switch
        // (the switch resets the tick accumulator server-side), which read as
        // a broken on/off stutter (C2 PO finding 2026-07-17).
        const fraction = Math.min(this.phase / this.interval, 1);
        this.glow.alpha = GLOW_BASE_ALPHA + fraction * (GLOW_MAX_ALPHA - GLOW_BASE_ALPHA);
    }
}

const GLOW_COLOR = 0xffffff;
const GLOW_WIDTH_PX = 3;
const GLOW_MAX_ALPHA = 0.45;
const GLOW_BASE_ALPHA = 0.18;
