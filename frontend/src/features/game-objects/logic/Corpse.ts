import {Container, Sprite, Texture} from 'pixi.js';
import {GameObject} from './_GameObject';
import {Character} from './Character';
import {createTokenSlots} from './TokenSlots';
import {Medallion} from './Medallion';
import {tokenState} from './TokenState';
import type {CharacterLook} from './WireSetters';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {IGame} from '../../core/logic/IGame';
import {GameSetupEvent, ISubscriptionToken, PrerenderEvent} from '../../core/logic/Events';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

/**
 * A dead player's corpse (atmosphere & recovery chunk 4), streamed by the
 * server over the Resource wire table and removed when the player respawns or
 * their client disconnects. Static, no health, no minimap presence.
 *
 * Since plan-appearance.md C6 it is a medallion wearing the dead player's
 * portrait and ring (D40, D41), at the player's size (D44), lit with the
 * `dead` state: everything grey but the red skull at 6 o'clock
 * (plan-entity-presentation.md D9, R2). Dead is set here, never by the wire
 * (EP D7's third door).
 */
export class Corpse extends GameObject implements CharacterLook {
    // Set in initShape, so declared WITHOUT an initializer (an `= null` would
    // overwrite it), as on Character.
    private medallion: Medallion;
    private refreshSubToken: ISubscriptionToken = null;

    constructor(id: number, x: number, y: number) {
        super(id, Game.layers.corpses, x, y, GraphicsConfig.character.size, Character.PORTRAIT_ROTATION, Character.avatar.svg);
        this.medallion.setState(tokenState(0, true));
        // The look and the skull may land after the first draw (Medallion.refresh).
        this.refreshSubToken = PrerenderEvent.subscribe(() => this.medallion.refresh());
    }

    initShape(svg: Texture, x: number, y: number, size: number, rotation: number): Container {
        const group = new Container();
        group.position.set(x, y);
        const portrait = super.initShape(svg, 0, 0, size, rotation) as Sprite;
        this.medallion = Medallion.forPlayer(createTokenSlots(group, portrait), portrait, size);
        return group;
    }

    setLook(portrait: number, ring: number) {
        this.medallion.setLook(portrait, ring);
    }

    override hide() {
        super.hide();
        if (this.refreshSubToken !== null) {
            this.refreshSubToken.unsubscribe();
            this.refreshSubToken = null;
        }
    }
}
