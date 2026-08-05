import * as PIXI from "pixi.js";
import {EntityManager} from "../../backend/logic/EntityManager";
import {JoystickManager} from "../../input-system/logic/virtual-joystick/JoystickManager";
import {MiniMap} from "../../map/logic/MiniMap";
import {Spectator} from "../../player/logic/Spectator";
import {Player} from "../../player/logic/Player";
import {InputManager} from "../../input-system/logic/InputManager";
import {WelcomeMessage} from "../../backend/logic/messages/incoming/WelcomeMessage";
import {gameObjectId} from "../../common/logic/Types";
import {Container} from 'pixi.js';

export enum GameState {
    INITIALIZING,
    RENDERING,
    PLAYING
}

export interface IGameLayers {
    terrain: Record<string, Container>,
    // Player corpses (chunk 4): below characters, above the terrain.
    corpses: Container,
    characters: Container,
    mobs: Record<string, Container>,
    resources: Record<string, Container>,
    bossMobs: Container,
    // A character in flight (C3): above props and boss mobs, below darkness.
    // Holds at most the local player, and only while airborne.
    flyers: Container,
    // Darkness overlay (chunk 3): dark areas + erase-blend light holes.
    darkness: Container,
    characterAdditions: Record<string, Container>,
    overlays: Record<string, Container>,
}

export interface IGame {
    readonly state: GameState;

    // The active zone's id (Welcome.zone_name), set once the server sends it.
    // Used by the zone editor to default to the zone the server actually loaded.
    readonly zoneName: string;

    readonly width: number;
    readonly height: number;
    readonly centerX: number;
    readonly centerY: number;

    readonly layers: IGameLayers;
    readonly cameraGroup: PIXI.Container;

    readonly map: EntityManager;
    readonly miniMap: MiniMap;

    /**
     * The actor the server says the player can talk to right now; 0 = nobody
     * (plan-entity-model.md chunk 3b-i). Delegates to the backend, which owns
     * the value — the interact key names exactly this id, and the server
     * refuses anything else.
     */
    getInteractableEntityId(): number;

    readonly domElement: HTMLCanvasElement;
    readonly inputManager: InputManager;
    readonly joystickManager: JoystickManager;

    readonly started: boolean;
    readonly paused: boolean;
    readonly playing: boolean;

    readonly timeDelta: number;

    readonly spectator: Spectator;
    readonly player: Player;

    setup(): void;

    play(): void;

    pause(): void;

    createPlayer(id: gameObjectId, x: number, y: number, name: string): void;

    removePlayer(): void;

    createSpectator(x: number, y: number): void;

    startRendering(gameInformation: WelcomeMessage): void;
}
