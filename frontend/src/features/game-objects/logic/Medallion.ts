import {Sprite, Texture} from 'pixi.js';
import * as Preloading from '../../core/logic/Preloading';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {RING_FAMILY_FILES, RingFamily, ringTint, stanceTint} from '../../../client-data/Medallions';
import {PORTRAIT_FILL, packIconTexture} from '../../../client-data/icons/PackIconFiles';
import type {TokenSlots} from './TokenSlots';

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
        this.disc.tint = stanceTint(this.stance);
        slots.disc.addChild(this.disc);
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
        this.ring.tint = ringTint(this.tierRank);
        this.slots.frame.addChild(this.ring);
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
        if (this.ring) {
            this.ring.tint = ringTint(rank);
        }
    }

    /** Tints the disc by the stance toward the player side (C2): red, yellow, blue. */
    setStance(stance: number) {
        if (this.stance === stance) {
            return;
        }
        this.stance = stance;
        this.disc.tint = stanceTint(stance);
    }
}
