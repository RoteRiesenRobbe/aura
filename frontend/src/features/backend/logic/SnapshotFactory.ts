import {isDefined, nearlyEqual} from '../../common/logic/Utils';
import {BackendState} from "./IBackend";
import _clone = require('lodash/clone');
import {GameStateMessage} from './messages/incoming/GameStateMessage';


let lastGameState;

export class Snapshot {
    tick: number;
    player: any; // TODO introduce interfaces to player, spectator, entity...
    entities: [];
    inventory: [];
    spellbook: number[]; // discovered skill IDs, owning player only
    auraSlots: number[]; // equipped aura slot contents, positional (index i = slot i, 0 = empty)
    activeAuraSlot: number; // active aura slot index, owning player only; -1 = Nothing
}

export function newSnapshot(backendState: BackendState, gameState: GameStateMessage) {
    let snapshot;
    if (this.hasSnapshot()) {
        snapshot = {};
        snapshot.tick = gameState.tick;

        snapshot.player = _clone(gameState.player);

        if (backendState === BackendState.PLAYING &&
            !lastGameState.player.isSpectator &&
            nearlyEqual(lastGameState.player.position.x, gameState.player.position.x, 0.01) &&
            nearlyEqual(lastGameState.player.position.y, gameState.player.position.y, 0.01)) {
            delete snapshot.player.position;
        }

        // Inventory handles item stacks
        snapshot.inventory = gameState.inventory;

        // EntityManager handles entity states
        snapshot.entities = gameState.entities;

        // Spellbook: always carry the full list (only changes on level-up/unlock)
        snapshot.spellbook = gameState.spellbook;

        // Aura slots: positional, always carry the full array
        snapshot.auraSlots = gameState.auraSlots;

        // Active aura slot: scalar, always carried (server-authoritative highlight)
        snapshot.activeAuraSlot = gameState.activeAuraSlot;
    } else {
        // First snapshot: assign the whole GameStateMessage, which already carries spellbook.
        snapshot = gameState;
    }

    lastGameState = gameState;

    return snapshot;
}

export function hasSnapshot() {
    return isDefined(lastGameState);
}

export function getLastGameState() {
    return lastGameState;
}
