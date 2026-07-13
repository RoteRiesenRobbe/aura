import * as PIXI from 'pixi.js';
import {GameObject} from './_GameObject';
import * as Preloading from '../../core/logic/Preloading';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {IGame} from '../../core/logic/IGame';
import {GameSetupEvent} from '../../core/logic/Events';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

/**
 * A dead player's corpse (atmosphere & recovery chunk 4): a gravestone at the
 * deathspot, streamed by the server over the Resource wire table and removed
 * when the player respawns or their client disconnects. Pure marker — static,
 * no health, no stock, no minimap presence.
 */
export class Corpse extends GameObject {
    static svg: PIXI.Texture;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.corpses, x, y, GraphicsConfig.corpse.size, 0, Corpse.svg);
        this.visibleOnMinimap = false;
    }
}

// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(Corpse, GraphicsConfig.corpse.file, GraphicsConfig.corpse.size);
