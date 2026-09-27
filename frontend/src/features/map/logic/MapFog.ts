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
 *   · ⚑ PERSISTED BY THE SERVER, NOT BY THIS OBJECT (plan-map-fog-persistence.md,
 *     which REVERSES the old "session-only" half of this ruling). The server
 *     tracks the reveal from the character's position and publishes the stored
 *     copy once on entering the world; applyRevealed paints it in. Everything
 *     else here is still the live, local reveal — the client never uploads it.
 *   · ⚑ A REVEAL IS THE AOI. The stamp is the 20 × 12 unit rectangle the
 *     server actually streams (BasicConfig.VIEWPORT), so the map shows exactly
 *     what the character has laid eyes on — the same rule the props obey.
 *
 * How it works: one RenderTexture the shape of the map, transparent to start.
 * Walking stamps opaque rectangles into it, and it is used as the terrain
 * sprite's MASK — so terrain shows only where the texture is opaque, and
 * everywhere else falls through to the overlay's own darkness.
 *
 * ⚑ Stamps are rendered INCREMENTALLY (`clear: false`), one rectangle at a
 * time, and only when the character crosses into a cell it has not stamped
 * before. The alternative — keeping every reveal and redrawing them all — is
 * unbounded work that grows for as long as someone plays.
 */

import {Container, Graphics, Renderer, RenderTexture, Sprite, Texture} from 'pixi.js';
import {BasicConfig, meter2px, px2meter} from '../../../client-data/BasicConfig';
import {isMobile} from '../../user-interface/logic/Mobile';
import {MapFogData, zoneCellMask} from './FogReveal';

/**
 * Texel width of the fog texture. The reveal is a hard-edged rectangle, so
 * this buys nothing but edge crispness: at 1024 across a 144-unit world, one
 * texel is about a seventh of a unit, far finer than the 20-unit stamp.
 * Halved on mobile for the same reason MapTerrain halves its bake.
 */
function fogWidth(): number {
    return isMobile() ? 512 : 1024;
}

/**
 * Side of the cell that decides "have I already revealed from here", in px
 * space. One world unit — small enough that walking reveals smoothly, large
 * enough that a stationary character stamps once and then stops.
 */
const CELL_SIZE = meter2px(1);

export class MapFog {
    /** Use as the terrain sprite's `mask`. Must also be in the scene graph. */
    readonly mask: Sprite;

    private readonly texture: RenderTexture;
    private readonly stamp: Graphics;
    private readonly revealedCells = new Set<string>();
    private readonly texelsPerPx: number;
    private readonly mapWidth: number;
    private readonly mapHeight: number;
    /** The zone's origin in px — what places a WORLD cell on this zone's texture. */
    private readonly originX: number;
    private readonly originY: number;
    /** Whether a stored reveal has painted anything (see hasRevealedAnything). */
    private restoredAnything = false;

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
            // The stamps are axis-aligned rectangles; there is nothing to
            // smooth, and a scaled-up mask reads better hard than blurry.
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

        // One reusable stamp, moved before each render rather than rebuilt.
        // Drawn around its own origin so positioning it is a single set().
        const halfStampX = (BasicConfig.VIEWPORT.WIDTH / 2) * this.texelsPerPx;
        const halfStampY = (BasicConfig.VIEWPORT.HEIGHT / 2) * this.texelsPerPx;
        this.stamp = new Graphics()
            .rect(-halfStampX, -halfStampY, halfStampX * 2, halfStampY * 2)
            .fill(0xffffff);

        this.mask = new Sprite(this.texture);
        this.mask.anchor.set(0.5, 0.5);
        this.mask.position.set(0, 0);
    }

    /**
     * Reveals around a position in px space (what `getX()/getY()` return).
     *
     * Cheap to call every tick: all but the first call from within a given
     * cell is a Set lookup and a return.
     */
    revealAt(renderer: Renderer, x: number, y: number) {
        const key = `${Math.floor(x / CELL_SIZE)}:${Math.floor(y / CELL_SIZE)}`;
        if (this.revealedCells.has(key)) {
            return;
        }
        this.revealedCells.add(key);

        // Map space is origin-centred; the texture's is corner-origined.
        this.stamp.position.set(
            (x + this.mapWidth / 2) * this.texelsPerPx,
            (y + this.mapHeight / 2) * this.texelsPerPx,
        );
        renderer.render({container: this.stamp, target: this.texture, clear: false});
    }

    /**
     * Paints the server's stored reveal into this zone's texture
     * (plan-map-fog-persistence.md F2, §4.5).
     *
     * ⭐ ONE DRAW, whatever was explored: the zone's revealed cells become one
     * texel each of a small canvas, which is stretched onto the texture with
     * NEAREST sampling so every cell lands as a hard square like a live stamp.
     * Drawn with `clear: false`, so it UNIONS with the live stamps (D8), and
     * applying the same publication twice changes nothing.
     *
     * ⚑ Only this zone's cells are taken (L7): a stored chunk can straddle two
     * zones, and zoneCellMask clips to this one's rectangle, origin included.
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
        // texture: subtract the origin, add half the zone (the revealAt rule).
        const cellPx = meter2px(data.cellSize);
        sprite.position.set(
            (mask.cellX0 * cellPx - this.originX + this.mapWidth / 2) * this.texelsPerPx,
            (mask.cellY0 * cellPx - this.originY + this.mapHeight / 2) * this.texelsPerPx,
        );
        sprite.scale.set(cellPx * this.texelsPerPx);
        renderer.render({container: sprite, target: this.texture, clear: false});

        sprite.destroy();
        texture.destroy(true);
        this.restoredAnything = true;
    }

    /** Whether anything has been revealed yet — the map is blank before this. */
    get hasRevealedAnything(): boolean {
        return this.restoredAnything || this.revealedCells.size > 0;
    }

    destroy() {
        this.stamp.destroy();
        this.mask.destroy({children: true, texture: false});
        this.texture.destroy(true);
        this.revealedCells.clear();
    }
}
