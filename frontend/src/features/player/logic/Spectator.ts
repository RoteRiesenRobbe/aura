import {Vector} from '../../core/logic/Vector';
import {Camera} from '../../camera/logic/Camera';
import * as Zoom from '../../camera/logic/Zoom';
import {IGame} from "../../core/logic/IGame";
import {ICharacterLike} from "../../game-objects/logic/ICharacter";
import {ISubscriptionToken, PrerenderEvent} from "../../core/logic/Events";
import {JUMP_DISTANCE, SpectateFade} from './SpectateFade';
import * as SpectateFadeOverlay from './SpectateFadeOverlay';

export class Spectator implements ICharacterLike {
    position: Vector;
    movementSpeed: number;
    camera: Camera;

    /**
     * Set on the PRE-JOIN spectator only: the start screen's backdrop, which the
     * server sweeps across the map (backend `spectator/tour.go`). A death
     * spectator stands on the spot the character died on and has neither the
     * fade nor the zoomed-out view, because its server-side AOI box is the
     * ordinary one.
     */
    private fade: SpectateFade | undefined;
    private prerenderSubToken: ISubscriptionToken;

    constructor(game: IGame, x: number, y: number, touring: boolean = false) {
        this.position = new Vector(x, y);
        // Before movementSpeed and the Camera: both read the view scale.
        Zoom.setSpectateZoom(touring);
        // Speed proportional to the visible world size (world px, zoom-aware).
        this.movementSpeed = Math.max(game.width, game.height)
            / Zoom.viewScale(game.width, game.height);
        if (touring) {
            this.fade = new SpectateFade(x, y);
            // Subscribed BEFORE the Camera, so the camera steers toward this
            // frame's position rather than the last one's.
            this.prerenderSubToken = PrerenderEvent.subscribe(this.update, this);
        }
        this.camera = new Camera(this);
        if (touring && new URLSearchParams(window.location.search).has('develop')) {
            // For start-screen-tour.mjs. Keyed on the URL, not Develop.isActive():
            // that (and `window.game`) only switch on with the first Pong, which
            // a client that never joins does not get. Read-only debug surface.
            window['spectatorTour'] = {spectator: this, cameraGroup: game.cameraGroup};
        }
    }

    /** The server's position for this spectator, from every snapshot. */
    onServerPosition(x: number, y: number): void {
        if (this.fade) {
            this.fade.onPosition(x, y, performance.now());
        } else {
            // A death spectator never moves, so this is a no-op but for the dead
            // reconnect, whose view has to get from the tour to the death spot.
            this.position.set(x, y);
        }
    }

    /**
     * ⚑ Called by a dead RECONNECT: the server swaps the touring spectator for
     * one standing on the death spot, and the only thing the client sees is the
     * Obituary. The view has to stop touring with it.
     */
    stopTouring(): void {
        if (!this.fade) {
            return;
        }
        this.fade = undefined;
        this.prerenderSubToken.unsubscribe();
        SpectateFadeOverlay.remove();
        Zoom.setSpectateZoom(false);
    }

    private update(): void {
        SpectateFadeOverlay.setOpacity(this.fade.update(performance.now()));
        const {x, y} = this.fade.displayed;
        const dx = x - this.position.x;
        const dy = y - this.position.y;
        this.position.set(x, y);
        if (dx * dx + dy * dy > JUMP_DISTANCE * JUMP_DISTANCE) {
            // A cut, not a sweep step: the Camera only snaps by itself past a
            // whole viewport, and a nearer cut would be eased across, visibly,
            // while the black lifts.
            this.camera.vehicle.position.set(x, y);
            this.camera.vehicle.velocity.set(0, 0);
        }
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
        this.stopTouring();
        this.camera.destroy();
    }
}
