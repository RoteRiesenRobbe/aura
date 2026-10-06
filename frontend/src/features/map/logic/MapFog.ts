/**
 * Fog of war over the map's terrain (PO ruling 2026-08-04).
 *
 * ⚑ THIS REVERSES A RECORDED DECISION. `plan-world-map.md` §4.2 said, in so
 * many words, "No fog of war — the whole terrain is visible from the first
 * open... if the PO later wants unexplored terrain hidden, that is a new
 * decision, not an oversight." This is that new decision: props are only ever
 * seen inside the streamed area of interest, and a map that showed the whole
 * world while the world itself had to be discovered read as inconsistent.
 *
 * Two properties, both PO-chosen, that explain every line below:
 *
 *   · ⚑ THE SERVER DECIDES EVERY REVEAL (plan-map-fog-darkness.md D6, which
 *     finishes what plan-map-fog-persistence.md D1 started). The server marks
 *     the reveal from the character's position, publishes the stored copy on
 *     entering the world, and pushes the chunks each new mark touched while
 *     walking; applyRevealed paints both. This object marks nothing itself: a
 *     second, local rule is how a pitch-black cave once got mapped in full.
 *   · ⚑ A REVEAL IS THE AOI, MINUS DARKNESS NOBODY LIT. The server marks the
 *     20 × 12 unit rectangle it streams, except completely dark cells that
 *     neither a static light nor the character's own light reaches.
 *
 * How it works: one RenderTexture the shape of the map, transparent to start.
 * Each publication paints opaque cells into it, and it is used as the terrain
 * sprite's MASK — so terrain shows only where the texture is opaque, and
 * everywhere else falls through to the overlay's own darkness.
 *
 * ⚑ Painted INCREMENTALLY (`clear: false`): a walking publication carries only
 * the chunks it touched, so each paint is bounded by those chunks, not by the
 * zone (FogReveal.zoneCellMask).
 */

import {Container, Renderer, RenderTexture, Sprite, Texture} from 'pixi.js';
import {meter2px, px2meter} from '../../../client-data/BasicConfig';
import {isMobile} from '../../user-interface/logic/Mobile';
import {MapFogData, zoneCellMask} from './FogReveal';

/**
 * Texel width of the fog texture. At 1024 across a 144-unit world one texel is
 * about a seventh of a unit, far finer than the 2-unit reveal cell.
 * Halved on mobile for the same reason MapTerrain halves its bake.
 */
function fogWidth(): number {
    return isMobile() ? 512 : 1024;
}

export class MapFog {
    /** Use as the terrain sprite's `mask`. Must also be in the scene graph. */
    readonly mask: Sprite;

    private readonly texture: RenderTexture;
    private readonly texelsPerPx: number;
    private readonly mapWidth: number;
    private readonly mapHeight: number;
    /** The zone's origin in px — what places a WORLD cell on this zone's texture. */
    private readonly originX: number;
    private readonly originY: number;
    /** Whether a publication has painted anything (see hasRevealedAnything). */
    private paintedAnything = false;

    constructor(renderer: Renderer, mapWidth: number, mapHeight: number, originX = 0, originY = 0) {
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.originX = originX;
        this.originY = originY;

        const width = fogWidth();
        this.texelsPerPx = width / mapWidth;
        this.texture = RenderTexture.create({
            width,
            height: Math.round(mapHeight * this.texelsPerPx),
            // The cells are axis-aligned squares; there is nothing to smooth,
            // and a scaled-up mask reads better hard than blurry.
            antialias: false,
        });

        // ⚑ A fresh RenderTexture's contents are undefined, not blank. Clearing
        // it to fully transparent is what makes the world start hidden —
        // without this the first frame shows whatever was in that memory.
        renderer.render({
            container: new Container(),
            target: this.texture,
            clear: true,
            clearColor: [0, 0, 0, 0],
        });

        this.mask = new Sprite(this.texture);
        this.mask.anchor.set(0.5, 0.5);
        this.mask.position.set(0, 0);
    }

    /**
     * Paints a server publication of the reveal into this zone's texture
     * (plan-map-fog-persistence.md F2, plan-map-fog-darkness.md C3).
     *
     * ⭐ ONE DRAW per publication: the publication's revealed cells inside this
     * zone become one texel each of a small canvas, which is stretched onto the
     * texture with NEAREST sampling so every cell lands as a hard square.
     * Drawn with `clear: false`, so it UNIONS with what is already painted
     * (D8), and applying the same publication twice changes nothing.
     *
     * ⚑ Only this zone's cells are taken (L7): a chunk can straddle two zones,
     * and zoneCellMask clips to this one's rectangle, origin included.
     */
    applyRevealed(renderer: Renderer, data: MapFogData) {
        const mask = zoneCellMask(data, {
            originX: px2meter(this.originX),
            originY: px2meter(this.originY),
            width: px2meter(this.mapWidth),
            height: px2meter(this.mapHeight),
        });
        if (mask.count === 0) {
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = mask.cols;
        canvas.height = mask.rows;
        const context = canvas.getContext('2d');
        const pixels = context.createImageData(mask.cols, mask.rows);
        for (let i = 0; i < mask.revealed.length; i++) {
            if (mask.revealed[i]) {
                pixels.data.set([255, 255, 255, 255], i * 4);
            }
        }
        context.putImageData(pixels, 0, 0);

        const texture = Texture.from(canvas);
        texture.source.scaleMode = 'nearest';
        const sprite = new Sprite(texture);
        // World px of the mask's first cell → this zone's corner-origined
        // texture: subtract the origin, add half the zone.
        const cellPx = meter2px(data.cellSize);
        sprite.position.set(
            (mask.cellX0 * cellPx - this.originX + this.mapWidth / 2) * this.texelsPerPx,
            (mask.cellY0 * cellPx - this.originY + this.mapHeight / 2) * this.texelsPerPx,
        );
        sprite.scale.set(cellPx * this.texelsPerPx);
        renderer.render({container: sprite, target: this.texture, clear: false});

        sprite.destroy();
        texture.destroy(true);
        this.paintedAnything = true;
    }

    /** Whether anything has been revealed yet — the map is blank before this. */
    get hasRevealedAnything(): boolean {
        return this.paintedAnything;
    }

    destroy() {
        this.mask.destroy({children: true, texture: false});
        this.texture.destroy(true);
    }
}
