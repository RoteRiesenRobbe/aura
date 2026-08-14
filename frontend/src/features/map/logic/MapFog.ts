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
 *   · ⚑ SESSION-ONLY. The reveal lives in this object and nowhere else — no
 *     wire field, no column, no migration. That is what keeps C1 free of the
 *     schema change §8 promised it would not make. Persistence can join part
 *     2's migration, which already stores discovered campfires. Logging in
 *     re-fogs the world; that is the accepted cost, not a bug.
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

import {Container, Graphics, Renderer, RenderTexture, Sprite} from 'pixi.js';
import {BasicConfig, meter2px} from '../../../client-data/BasicConfig';
import {isMobile} from '../../user-interface/logic/Mobile';

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

    constructor(renderer: Renderer, mapWidth: number, mapHeight: number) {
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;

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

    /** Whether anything has been revealed yet — the map is blank before this. */
    get hasRevealedAnything(): boolean {
        return this.revealedCells.size > 0;
    }

    destroy() {
        this.stamp.destroy();
        this.mask.destroy({children: true, texture: false});
        this.texture.destroy(true);
        this.revealedCells.clear();
    }
}
