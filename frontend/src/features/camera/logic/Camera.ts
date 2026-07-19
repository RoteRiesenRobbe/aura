import {Vehicle} from './natureOfCode/arrive/vehicle';
import {Vector} from '../../core/logic/Vector';
import {IGame} from "../../core/logic/IGame";
import {Develop} from "../../internal-tools/develop/logic/_Develop";
import {CameraUpdatedEvent, ISubscriptionToken, PrerenderEvent} from "../../core/logic/Events";
import {ICharacterLike} from "../../game-objects/logic/ICharacter";
import * as Zoom from './Zoom';

let Game: IGame = null;

/**
 * Screen px per world px for the current zoom level and canvas size.
 * Read live everywhere so zoom level changes and window/DPR resizes
 * apply on the next frame without any bookkeeping.
 */
function viewScale(): number {
    return Zoom.viewScale(Game.width, Game.height);
}

export class Camera {
    character: ICharacterLike;
    vehicle: Vehicle;
    position: Vector;
    private prerenderSubToken: ISubscriptionToken;

    /**
     * @param character the character to follow
     */
    constructor(character: ICharacterLike) {
        this.character = character;

        this.vehicle = new Vehicle(
            character.getX(),
            character.getY());

        this.vehicle.setMaxSpeed(character.movementSpeed * 2);

        this.position = this.vehicle.position;

        this.prerenderSubToken = PrerenderEvent.subscribe(this.update, this);
    }

    static setup(game: IGame) {
        Game = game;
    };

    getScreenX(mapX: number): number {
        return (mapX - this.getX()) * viewScale() + Game.centerX;
    }

    getScreenY(mapY: number): number {
        return (mapY - this.getY()) * viewScale() + Game.centerY;
    }

    getMapX(screenX: number): number {
        return (screenX - Game.centerX) / viewScale() + this.getX();
    }

    getMapY(screenY: number): number {
        return (screenY - Game.centerY) / viewScale() + this.getY();
    }

    getX() {
        return this.position.x;
    }

    getY() {
        return this.position.y;
    }

    update() {
        const target = this.character.getPosition();
        const scale = viewScale();

        // After a teleport (WARP cheat, Recall) the followed character jumps far
        // beyond one frame of follow-steering. Rather than let the steering
        // Vehicle crawl across the whole gap at ~walk speed, snap the camera
        // straight onto the target. Threshold: the target sits more than a full
        // viewport away — only a real teleport does that, never on-screen
        // movement — so normal following (and its easing) is untouched.
        const dx = target.x - this.vehicle.position.x;
        const dy = target.y - this.vehicle.position.y;
        const snapDistance = Math.max(Game.width, Game.height) / scale;
        if (dx * dx + dy * dy > snapDistance * snapDistance) {
            this.vehicle.position.set(target.x, target.y);
            this.vehicle.velocity.set(0, 0);
        } else {
            this.vehicle.arrive(target);
            this.vehicle.update();
        }

        if (!Develop.isActive() ||
            (Develop.isActive() && Develop.get().settings.cameraBoundaries)) {
            keepWithinMapBoundaries(this.vehicle);
        }

        Game.cameraGroup.scale.set(scale);
        Game.cameraGroup.position.set(
            Game.centerX - this.position.x * scale,
            Game.centerY - this.position.y * scale,
        );

        CameraUpdatedEvent.trigger(this.getCameraWorldCenter());
    }

    destroy() {
        this.prerenderSubToken.unsubscribe();
    }

    getCameraWorldCenter(): Vector {
        // The camera centers the viewport on its position.
        return Vector.clone(this.position);
    }
}

function keepWithinMapBoundaries(vehicle: Vehicle) {
    // Rectangular world (world foundation chunk 1): clamp the camera so the
    // viewport stays inside the world bounds. If the world is smaller than the
    // viewport on an axis, lock that axis to centre (whole world visible).
    const scale = viewScale();
    let maxX = Math.max(0, Game.map.width / 2 - Game.width / scale / 2);
    let maxY = Math.max(0, Game.map.height / 2 - Game.height / scale / 2);

    vehicle.position.x = Math.min(maxX, Math.max(-maxX, vehicle.position.x));
    vehicle.position.y = Math.min(maxY, Math.max(-maxY, vehicle.position.y));
}
