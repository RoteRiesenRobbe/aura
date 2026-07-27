import {IGame} from "../../core/logic/IGame";

export enum BackendState {
    DISCONNECTED = 'DISCONNECTED',
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
    WELCOMED = 'WELCOMED',
    SPECTATING = 'SPECTATING',
    PLAYING = 'PLAYING',
    ERROR = 'ERROR',
}

export interface IBackend {
    readonly webSocket: WebSocket;

    setup(game: IGame): void;

    getState(): BackendState;

    /**
     * The actor the server says this player can talk to right now; 0 = nobody
     * (plan-entity-model.md chunk 3b-i). Server-authoritative: the interact
     * key names this id, and the server refuses anything else.
     */
    getInteractableEntityId(): number;
}
