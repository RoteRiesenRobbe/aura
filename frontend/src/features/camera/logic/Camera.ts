import {Vehicle} from './natureOfCode/arrive/vehicle';
import {Vector} from '../../core/logic/Vector';
import {IGame} from "../../core/logic/IGame";
import {Develop} from "../../internal-tools/develop/logic/_Develop";
import {CameraUpdatedEvent, ISubscriptionToken, PrerenderEvent} from "../../core/logic/Events";
import {ICharacterLike} from "../../game-objects/logic/ICharacter";

let Game: IGame = null;

let Corners = [];

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

        for (let x = -1; x <= 1; x += 2) {
            for (let y = -1; y <= 1; y += 2) {
                Corners.push({x: x * Game.width / 2, y: y * Game.height / 2});
            }
        }
    };

    getScreenX(mapX: number): number {
        return mapX - this.getX() + Game.centerX;
    }

    getScreenY(mapY: number): number {
        return mapY - this.getY() + Game.centerY;
    }

    getMapX(screenX: number): number {
        return screenX + this.getX() - Game.centerX;
    }

    getMapY(screenY: number): number {
        return screenY + this.getY() - Game.centerY;
    }

    getX() {
        return this.position.x;
    }

    getY() {
        return this.position.y;
    }

    update() {
        this.vehicle.arrive(this.character.getPosition());
        this.vehicle.update();

        if (!Develop.isActive() ||
            (Develop.isActive() && Develop.get().settings.cameraBoundaries)) {
            keepWithinMapBoundaries(this.vehicle);
        }

        let position = Vector.clone(this.position);
        position.negate();
        position.add(new Vector(Game.centerX, Game.centerY));
        Game.cameraGroup.position.copyFrom(position);

        CameraUpdatedEvent.trigger(this.getCameraWorldCenter());
    }

    destroy() {
        this.prerenderSubToken.unsubscribe();
    }

    getCameraWorldCenter(): Vector {
        let cornersWorldPosition = Corners.map(corner => {
            return new Vector(corner.x, corner.y).add(this.position);
        });
        let center = new Vector(0, 0);
        cornersWorldPosition.forEach(corner => {
            center.add(corner);
        });
        center.divideScalar(Corners.length);
        return center;
    }
}

function keepWithinMapBoundaries(vehicle: Vehicle) {
    // Rectangular world (world foundation chunk 1): clamp the camera so the
    // viewport stays inside the world bounds. If the world is smaller than the
    // viewport on an axis, lock that axis to centre (whole world visible).
    let maxX = Math.max(0, Game.map.width / 2 - Game.width / 2);
    let maxY = Math.max(0, Game.map.height / 2 - Game.height / 2);

    vehicle.position.x = Math.min(maxX, Math.max(-maxX, vehicle.position.x));
    vehicle.position.y = Math.min(maxY, Math.max(-maxY, vehicle.position.y));
}
