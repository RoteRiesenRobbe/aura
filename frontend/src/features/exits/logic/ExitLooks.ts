/**
 * Draws the exits' looks (plan-passages.md P2, D5): one sprite per exit that
 * is not `hidden`, from the bundled zone, into the `terrain.exits` layer.
 * The geometry is ExitLookTable's; this file only owns the textures and the
 * sprites.
 *
 * ⚑ It inherits [[project-zone-edit-half-live]]: a look draws from the bundle
 * before the server behaves, like every other zone geometry.
 */
import * as PIXI from 'pixi.js';
import * as Preloading from '../../core/logic/Preloading';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import {meter2px} from '../../../client-data/BasicConfig';
import {ExitJSON, exitLookPlacements} from './ExitLookTable';

// The raster size an SVG is baked at, px. [PLACEHOLDER]
const BAKE_SIZE = 200;

const textures: Record<string, ISvgContainer> = {
    // ⭐ Reused: the CaveMouth PROP's art (prop 98), so a cave-mouth exit and
    // a hand-placed cave mouth are the same picture.
    'cave-mouth': {svg: null},
    'cave-exit': {svg: null},
    'stairs-down': {svg: null},
    'stairs-up': {svg: null},
    'door': {svg: null},
};
const files: Record<string, string> = {
    'cave-mouth': require('../../game-objects/assets/resources/caveMouth.svg'),
    'cave-exit': require('../assets/cave-exit.svg'),
    'stairs-down': require('../assets/stairs-down.svg'),
    'stairs-up': require('../assets/stairs-up.svg'),
    'door': require('../assets/door.svg'),
};
for (const look of Object.keys(textures)) {
    // noinspection JSIgnoredPromiseFromCall
    Preloading.registerGameObjectSVG(textures[look], files[look], BAKE_SIZE);
}

/**
 * Replaces the layer's contents with this zone's exit looks. Idempotent, so a
 * zone swap (Game.renderZone) simply calls it again.
 */
export function loadExitLooks(
    layer: PIXI.Container,
    exits: ExitJSON[] | undefined,
    origin: {x: number, y: number} | undefined,
) {
    layer.removeChildren().forEach(c => c.destroy());
    for (const p of exitLookPlacements(exits, origin, meter2px)) {
        const texture = textures[p.look]?.svg;
        if (!texture) {
            continue;
        }
        const sprite = new PIXI.Sprite(texture);
        sprite.label = 'exitLook:' + p.look;
        sprite.anchor.set(0.5, 0.5);
        sprite.position.set(p.x, p.y);
        sprite.width = p.width;
        sprite.height = p.height;
        sprite.rotation = p.rotation;
        layer.addChild(sprite);
    }
}
