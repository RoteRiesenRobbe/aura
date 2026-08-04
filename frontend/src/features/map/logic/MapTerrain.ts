/**
 * The full-screen map's terrain layer (plan-world-map.md C1, §4.2).
 *
 * ⚑ THE WHOLE POINT OF THIS FILE IS THAT IT RENDERS ONCE. The zone holds 537
 * terrain pieces; re-rasterising them every frame in a second GL context is
 * precisely the mobile perf ceiling the project already sits at (CLAUDE.md
 * standing gotchas — the minimap is ALREADY a second per-frame context;
 * project_mobile_layout). So the pieces are drawn a single time into one
 * RenderTexture and the map thereafter draws ONE sprite.
 *
 * ⚑ And it does not re-bake on resize either, which the plan allowed for: the
 * baked texture is resolution-independent once it exists, so a resize just
 * changes the sprite's width/height. Nothing re-rasterises for the life of the
 * zone. If you ever add a re-bake path, know that you are re-introducing the
 * cost this file exists to pay once.
 *
 * ⚑ Coordinates here are the client's px space (world units × 120), the same
 * space `Welcome.mapWidth` and `getX()/getY()` use — see MapScale's note. The
 * terrain JSON is authored in world units, so it goes through meter2px exactly
 * as GroundTextureManager.loadZone does; the two must agree or the map is a
 * subtly wrong drawing of the world.
 */

import {Container, Graphics, Rectangle, Renderer, Sprite, Texture} from 'pixi.js';
import {getZoneData} from '../../ground-textures/logic/GroundTextureManager';
import {groundTextureTypes} from '../../ground-textures/logic/GroundTextureTypes';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {meter2px} from '../../../client-data/BasicConfig';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {isMobile} from '../../user-interface/logic/Mobile';
import {resizeTerrain} from './MapScale';

/**
 * Width of the baked texture in texels. The map is only ever drawn smaller
 * than this (a 1920-wide viewport asks for 1920), so it is an upper bound on
 * quality, not a target — and it is squarely inside every GL implementation's
 * max-texture-size, which 17280 (the world's actual px width) is emphatically
 * not.
 *
 * Halved on mobile: the phone is the platform at its render ceiling, a 2048 ×
 * 1024 RGBA texture is 8 MB of GPU memory, and no phone viewport can show
 * enough of it to tell.
 */
function bakeWidth(): number {
    return isMobile() ? 1024 : 2048;
}

/**
 * Draws the zone's terrain into a single sprite, sized to the map bounds.
 *
 * Returns null when the zone is unknown — the same degrade GroundTextureManager
 * takes, and the map is still perfectly usable without terrain under it.
 *
 * The returned sprite is anchored at its centre and positioned at the origin,
 * because the world is origin-centred and the map's layers already sit at the
 * canvas centre. Callers only ever set its width/height (see resize below).
 */
export function bakeTerrain(
    renderer: Renderer,
    zoneName: string,
    mapWidth: number,
    mapHeight: number,
): Sprite | null {
    const zone = getZoneData(zoneName);
    if (!zone) {
        console.warn(`No bundled zone data for "${zoneName}"; the map shows no terrain.`);
        return null;
    }

    const scratch = new Container();

    // The land the pieces sit on. Without it the map is terrain floating on
    // the overlay's black, which reads as holes in the world rather than as
    // ground. Matches the world renderer's own land fill (Game.startRendering);
    // its shallow-water margin is deliberately skipped — the map is bounded by
    // the world, and a beach ring outside those bounds would just be a border.
    scratch.addChild(new Graphics()
        .rect(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight)
        .fill(GraphicsConfig.landColor));

    let unknownTypes = 0;
    (zone.terrain || []).forEach((piece) => {
        const type = groundTextureTypes[piece.type];
        if (!type) {
            unknownTypes++;
            return;
        }

        // Mirrors GroundTexture.addToMap: same helper, same doubling of size,
        // same flip semantics. Two drawings of one world.
        const sprite = createInjectedSVG(
            type.svg,
            meter2px(piece.x),
            meter2px(piece.y),
            meter2px(piece.size),
            piece.rotation,
        );
        switch ((piece.flipped || 'none').toLowerCase()) {
            case 'horizontal':
                sprite.scale.x *= -1;
                break;
            case 'vertical':
                sprite.scale.y *= -1;
                break;
        }
        scratch.addChild(sprite);
    });

    if (unknownTypes > 0) {
        console.warn(`Map terrain: skipped ${unknownTypes} piece(s) of unknown type.`);
    }

    // ⚑ The frame is given explicitly rather than left to the container's own
    // bounds. Terrain does not reach the exact edges (the world zone's
    // furthest piece is at 71.53 of 72), so bounds-derived framing would bake
    // a texture a few units narrower than the world and then stretch it across
    // the full bounds — every feature on the map slightly displaced, in a way
    // that looks like nothing at all is wrong.
    const texture = renderer.generateTexture({
        target: scratch,
        frame: new Rectangle(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight),
        resolution: bakeWidth() / mapWidth,
        antialias: true,
    });

    // The scratch container has served its purpose; the texture is on the GPU.
    // Its children are Sprites over SHARED, preloaded SVG textures, so they are
    // destroyed without their textures — destroying those would blank the
    // terrain in the actual world, which draws from the same ones.
    scratch.destroy({children: true, texture: false});

    const terrain = new Sprite(texture);
    terrain.anchor.set(0.5, 0.5);
    terrain.position.set(0, 0);
    resizeTerrain(terrain, mapWidth, mapHeight, 0);
    return terrain;
}

/** Releases the baked texture. Only the BAKED one is ours to free. */
export function destroyTerrain(terrain: Sprite) {
    const texture = terrain.texture;
    terrain.destroy({children: true, texture: false});
    if (texture && texture !== Texture.EMPTY) {
        texture.destroy(true);
    }
}
