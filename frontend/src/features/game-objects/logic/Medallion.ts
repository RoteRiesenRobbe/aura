import {ColorMatrixFilter, Sprite, Texture} from 'pixi.js';
import * as Preloading from '../../core/logic/Preloading';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {GREY_DISC, GREY_RING, RING_FAMILY_FILES, RingFamily, ringTint, stanceTint} from '../../../client-data/Medallions';
import {PORTRAIT_FILL, packIconTexture} from '../../../client-data/icons/PackIconFiles';
import {lumaGreyscale} from '../../pixi-js/logic/ColorMatrixFilterExtensions';
import type {TokenSlots} from './TokenSlots';
import {StateIndicators} from './StateIndicators';
import type {TokenState} from './TokenState';

// One shared texture per ring family (client-data/Medallions.ts). The size is
// the SVG raster size: the families' 256 px canvas at its own scale, which
// covers the biggest collider (the Dragon's 96 px half-size) at DPR 2. Each
// family needs its own `ISvgContainer` holder because `registerGameObjectSVG`
// writes exactly one `.svg` field per target.
const RING_PRELOAD_SIZE = 128;
const ringTextures = Object.fromEntries(
    (Object.keys(RING_FAMILY_FILES) as RingFamily[]).map(family => {
        const holder: ISvgContainer = {svg: undefined};
        // noinspection JSIgnoredPromiseFromCall
        Preloading.registerGameObjectSVG(holder, RING_FAMILY_FILES[family], RING_PRELOAD_SIZE);
        return [family, holder];
    }),
) as Record<RingFamily, ISvgContainer>;

// The disc behind every medallion portrait (C1b): one white circle, drawn
// once on a 2D canvas (no renderer needed) and shared by every token; each
// sprite tints it by stance (Medallions.stanceTint, C2). Built on first use,
// so a test importing this module never touches a canvas.
const DISC_TEXTURE_SIZE = 128;
let sharedDiscTexture: Texture = null;

function discTexture(): Texture {
    if (sharedDiscTexture === null) {
        const canvas = document.createElement('canvas');
        canvas.width = DISC_TEXTURE_SIZE;
        canvas.height = DISC_TEXTURE_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(DISC_TEXTURE_SIZE / 2, DISC_TEXTURE_SIZE / 2, DISC_TEXTURE_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
        sharedDiscTexture = Texture.from(canvas);
    }
    return sharedDiscTexture;
}

/**
 * A token's medallion (plan-appearance.md C2b, D37: "art can differ but the
 * process and logic needs to be the same for all"): the disc behind the
 * portrait, tinted by stance (C2), the portrait itself, and the ring over
 * it, tinted by tier (C1). It fills the token slots (createTokenSlots); Mob
 * and Character only feed it. Everything else is a plain world object
 * (sprite only, no frame, D38).
 *
 * The ring stays in the frame slot, outside `actualShape`, so the damage flash
 * floods the portrait only (docs/art/pipeline.md §4).
 *
 * It owns its final tints (plan-entity-presentation.md D6): tier, stance and
 * the state's grey all go through applyTints, so no write order can bring a
 * tier colour back onto a dead token (L2). setState draws the state
 * indicators and the grey; the entity applies the state's alpha itself.
 */
export class Medallion {
    private readonly disc: Sprite;
    private ring: Sprite = null;
    // The texture the portrait started with, so a species portrait
    // (setPortrait) can be put on and taken off again.
    private readonly classPortrait: Texture;
    // Kept apart from the ring because the wire sends the tier before the
    // species id every tick, so the first tier arrives before the ring
    // exists. 0 = normal.
    private tierRank = 0;
    // The stance toward the player side. 0 = hostile, the wire default.
    private stance = 0;
    // The state's grey (dead, D5), and the portrait's grey filter, built on
    // the first grey only: a living token never carries one.
    private grey = false;
    private greyFilter: ColorMatrixFilter = null;
    private readonly indicators: StateIndicators;

    constructor(
        private readonly slots: TokenSlots,
        private readonly portrait: Sprite,
        private readonly size: number,
        disc: Texture = discTexture(),
    ) {
        this.classPortrait = portrait.texture;
        // Sized to the pack portrait's own disc, so it fills the ring's
        // window and its edge hides under the ring.
        this.disc = createInjectedSVG(disc, 0, 0, size * PORTRAIT_FILL, 0);
        slots.disc.addChild(this.disc);
        this.indicators = new StateIndicators(size);
        slots.indicators.addChild(this.indicators.container);
        this.applyTints();
    }

    /**
     * Draws the ring of `family`, replacing any ring drawn before. False while
     * its texture is still loading: the caller tries again on a later tick
     * rather than leaving the token bare.
     */
    setRing(family: RingFamily): boolean {
        // Truthiness, not isDefined: the holder starts as `undefined`.
        const texture = ringTextures[family].svg;
        if (!texture) {
            return false;
        }
        this.ring?.destroy();
        this.ring = createInjectedSVG(texture, 0, 0, this.size, 0);
        this.slots.frame.addChild(this.ring);
        this.applyTints();
        return true;
    }

    /**
     * Puts on the species' own pack portrait when its sprite class is shared
     * (Graphics.ts `speciesPortraits`, plan-appearance.md D33), or the class
     * portrait back when it has none. Without the pack on this machine
     * packIconTexture answers null and the class portrait stays.
     */
    setPortrait(species: string) {
        const entry = GraphicsConfig.speciesPortraits[species];
        this.setPortraitTexture(entry && packIconTexture(entry.packIcon, entry.packTint));
    }

    /**
     * Wears `texture` as the portrait, at the size drawn so far, or the class
     * portrait for null. The player's chosen portrait (plan-appearance.md C3)
     * and the species bust above both come through here.
     */
    setPortraitTexture(texture: Texture | null) {
        texture = texture || this.classPortrait;
        if (this.portrait.texture === texture) {
            return;
        }
        const {width, height} = this.portrait;
        this.portrait.texture = texture;
        this.portrait.width = width;
        this.portrait.height = height;
    }

    /** Recolours the ring by the wire tier rank (C1): grey, silver, gold. */
    setTier(rank: number) {
        if (this.tierRank === rank) {
            return;
        }
        this.tierRank = rank;
        this.applyTints();
    }

    /** Tints the disc by the stance toward the player side (C2): red, yellow, blue. */
    setStance(stance: number) {
        if (this.stance === stance) {
            return;
        }
        this.stance = stance;
        this.applyTints();
    }

    /**
     * Shows a token state (plan-entity-presentation.md D4-D6): its indicators
     * on the rim, and the grey. The alpha is the entity's (it covers the
     * whole entity, R3).
     */
    setState(state: TokenState) {
        this.indicators.setState(state);
        if (state.grey === this.grey) {
            return;
        }
        this.grey = state.grey;
        this.applyTints();
        this.applyGreyFilter();
    }

    // The one writer of the disc and ring tints (D6).
    private applyTints() {
        this.disc.tint = this.grey ? GREY_DISC : stanceTint(this.stance);
        if (this.ring) {
            this.ring.tint = this.grey ? GREY_RING : ringTint(this.tierRank);
        }
    }

    // The portrait alone greys by a filter (D5, L1: never on the token, or the
    // skull and every indicator grey with it). Appended beside the damage
    // flash's filter, the StatusEffect pattern. One render pass per greyed
    // token: only for a bounded population (corpses).
    private applyGreyFilter() {
        if (this.greyFilter === null) {
            if (!this.grey) {
                return;
            }
            this.greyFilter = new ColorMatrixFilter();
            lumaGreyscale(this.greyFilter, 1, false);
            const shape = this.slots.actualShape;
            shape.filters = Array.isArray(shape.filters) ? [...shape.filters, this.greyFilter] : [this.greyFilter];
        }
        this.greyFilter.enabled = this.grey;
    }
}
