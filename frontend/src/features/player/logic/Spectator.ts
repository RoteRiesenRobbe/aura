import {Vector} from '../../core/logic/Vector';
import {Camera} from '../../camera/logic/Camera';
import * as Zoom from '../../camera/logic/Zoom';
import {IGame} from "../../core/logic/IGame";
import {ICharacterLike} from "../../game-objects/logic/ICharacter";

export class Spectator implements ICharacterLike {
    position: Vector;
    movementSpeed: number;
    camera: Camera;

    constructor(game: IGame, x: number, y: number) {
        this.position = new Vector(x, y);
        // Speed proportional to the visible world size (world px, zoom-aware).
        this.movementSpeed = Math.max(game.width, game.height)
            / Zoom.viewScale(game.width, game.height);
        this.camera = new Camera(this);
    }

    getPosition() {
        return this.position;
    }

    getX() {
        return this.position.x;
    }

    getY() {
        return this.position.y;
    }

    remove() {
        this.camera.destroy();
    }
}
