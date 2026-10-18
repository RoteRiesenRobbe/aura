/**
 * Draws the touch exits (plan-passages.md P5, D10, Q3/Q4): a gold glow over
 * each area, its look at the centroid, and the name of where it leads, shown
 * while the player is within EXIT_NAME_RANGE of it. A `hidden` area draws
 * none of it. The light the glow casts in the dark is DarknessOverlay's
 * (resetZone), from the same table.
 *
 * ⚑ It inherits [[project-zone-edit-half-live]]: an area draws from the
 * bundle before the server behaves.
 */
import * as PIXI from 'pixi.js';
import {meter2px} from '../../../client-data/BasicConfig';
import {PrerenderEvent} from '../../core/logic/Events';
import {GameState, IGame} from '../../core/logic/IGame';
import * as GroundTextureManager from '../../ground-textures/logic/GroundTextureManager';
import {EXIT_GLOW_COLOR, EXIT_NAME_RANGE, ExitAreaJSON, exitAreaPlacements, ExitAreaPlacement, distanceToPolygon} from './ExitAreaTable';
import {exitHeader} from './ExitHeader';
import {lookTexture} from './ExitLooks';
import {EXIT_LOOK_SIZES} from './ExitLookTable';

// [PLACEHOLDER] the glow's look: a soft fill with a brighter rim.
const FILL_ALPHA = 0.28;
const RIM_ALPHA = 0.75;
const RIM_WIDTH = 6;

interface Drawn {
    placement: ExitAreaPlacement;
    name: PIXI.Text | null;
}

let drawn: Drawn[] = [];

/**
 * Replaces both layers' exit-area contents with this zone's. Idempotent, so a
 * zone swap (Game.renderZone) simply calls it again.
 */
export function loadExitAreas(
    glowLayer: PIXI.Container,
    nameLayer: PIXI.Container,
    areas: ExitAreaJSON[] | undefined,
    origin: {x: number, y: number} | undefined,
) {
    for (const d of drawn) {
        d.name?.destroy();
    }
    glowLayer.removeChildren().forEach(c => c.destroy());
    drawn = [];
    for (const p of exitAreaPlacements(areas, origin, meter2px)) {
        const glow = new PIXI.Graphics()
            .poly(p.points.flatMap(v => [v.x, v.y]))
            .fill({color: EXIT_GLOW_COLOR, alpha: FILL_ALPHA})
            .stroke({color: EXIT_GLOW_COLOR, alpha: RIM_ALPHA, width: RIM_WIDTH});
        glow.label = 'exitGlow:' + p.key;
        glowLayer.addChild(glow);

        const texture = lookTexture(p.look);
        if (texture) {
            const sprite = new PIXI.Sprite(texture);
            sprite.label = 'exitLook:' + p.look;
            sprite.anchor.set(0.5, 0.5);
            sprite.position.set(p.centroid.x, p.centroid.y);
            const size = EXIT_LOOK_SIZES[p.look];
            if (size) {
                sprite.width = meter2px(size.width);
                sprite.height = meter2px(size.height);
            }
            glowLayer.addChild(sprite);
        }

        // Q3: the place it leads to, by the door header's own rule.
        const title = exitHeader(p.key, GroundTextureManager.getZoneSet());
        let name: PIXI.Text | null = null;
        if (title) {
            name = new PIXI.Text({
                text: title,
                style: {
                    fontFamily: 'Arial',
                    fontSize: 22,
                    fontWeight: 'bold',
                    fill: EXIT_GLOW_COLOR,
                    stroke: {color: 0x000000, width: 4},
                },
            });
            name.label = 'exitName:' + p.key;
            name.anchor.set(0.5, 1);
            name.position.set(p.centroid.x, Math.min(...p.points.map(v => v.y)) - 8);
            name.visible = false;
            nameLayer.addChild(name);
        }
        drawn.push({placement: p, name});
    }
}

/** Shows each area's name while the player stands within range of it. */
export function setup(game: IGame) {
    PrerenderEvent.subscribe(() => {
        const character = game.state === GameState.PLAYING ? game.player?.character : undefined;
        const range = meter2px(EXIT_NAME_RANGE);
        for (const d of drawn) {
            if (!d.name) {
                continue;
            }
            d.name.visible = character !== undefined
                && distanceToPolygon({x: character.getX(), y: character.getY()}, d.placement.points) <= range;
        }
    });
}
