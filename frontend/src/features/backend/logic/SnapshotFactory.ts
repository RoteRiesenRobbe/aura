import {isDefined, nearlyEqual} from '../../common/logic/Utils';
import {BackendState} from "./IBackend";
import _clone = require('lodash/clone');
import {ConversationTree} from '../../conversation/logic/ConversationModel';
import {QuestProgress} from '../../journal/logic/JournalModel';
import {GameStateMessage} from './messages/incoming/GameStateMessage';


let lastGameState;

export class Snapshot {
    tick: number;
    player: any; // TODO introduce interfaces to player, spectator, entity...
    entities: [];
    inventory: [];
    spellbook: number[]; // discovered skill IDs, owning player only
    spellbookLevels: number[]; // per-skill levels, positionally parallel to spellbook
    skillPoints: number; // unspent skill points, owning player only
    costFactor: number; // cost-reduction multiplier, owning player only; 1 = none
    damageFactor: number; // outgoing-damage multiplier (Strong), owning player only; 1 = none
    auraSlots: number[]; // equipped aura slot contents, positional (index i = slot i, 0 = empty)
    passiveSlots: number[]; // equipped passive slot contents, positional (index i = slot i, 0 = empty)
    cooldownSlots: number[]; // equipped cooldown slot contents, positional (index i = slot i, 0 = empty)
    cooldownRemainingTicks: number[]; // remaining ticks per cooldown slot; 0 = ready
    activeAuraSlot: number; // active aura slot index, owning player only; -1 = Nothing
    castSkillId: number; // running cast (chunk 4); 0 = no cast
    castTicksLeft: number;
    castTicksTotal: number;
    castUtility: number; // baseline utility winding up (downtime C1); 0 = none
    campCharges: number; // Camp charges held (downtime C2); cap derived from level
    activationRejectedSkillId: number; // one-tick rejection feedback; 0 = none
    activationRejectedReason: number;
    interactableEntityId: number; // conversant in talking range (3b-i); 0 = none
    conversation: ConversationTree | null; // open conversation tree (3b-ii); null = no panel
    questProgress: QuestProgress[]; // running + completed quests, ids only (C3)
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
        snapshot.spellbookLevels = gameState.spellbookLevels;
        snapshot.skillPoints = gameState.skillPoints;
        // Scalar, always carried: it changes the moment a cost-reduction passive
        // is equipped or unequipped, and the tooltip folds it into every price.
        snapshot.costFactor = gameState.costFactor;
        snapshot.damageFactor = gameState.damageFactor;

        // Aura/passive/cooldown slots: positional, always carry the full arrays
        snapshot.auraSlots = gameState.auraSlots;
        snapshot.passiveSlots = gameState.passiveSlots;
        snapshot.cooldownSlots = gameState.cooldownSlots;
        snapshot.cooldownRemainingTicks = gameState.cooldownRemainingTicks;

        // Active aura slot: scalar, always carried (server-authoritative highlight)
        snapshot.activeAuraSlot = gameState.activeAuraSlot;

        // Cast bar scalars + one-tick rejection feedback: always carried
        snapshot.castSkillId = gameState.castSkillId;
        snapshot.castTicksLeft = gameState.castTicksLeft;
        snapshot.castTicksTotal = gameState.castTicksTotal;
        snapshot.castUtility = gameState.castUtility;
        // Always carried like the cast scalars: 0 is a meaningful value here
        // (an empty store greys the button), so a delta snapshot dropping the
        // field would leave the counter showing a charge the player has spent.
        snapshot.campCharges = gameState.campCharges;
        snapshot.activationRejectedSkillId = gameState.activationRejectedSkillId;
        snapshot.activationRejectedReason = gameState.activationRejectedReason;
        // Always carried, like the scalars above: it is live state, so "absent"
        // has to be distinguishable from "nobody in range" — the delta snapshot
        // would otherwise leave a stale badge lit after walking away.
        snapshot.interactableEntityId = gameState.interactableEntityId;
        // Same reasoning, and more sharply: an ABSENT conversation is the close
        // signal (chunk 3b-ii, D16). A delta snapshot that dropped the field
        // would leave the panel open after the server ended the conversation —
        // exactly the desync every end condition exists to prevent.
        snapshot.conversation = gameState.conversation;
        // Always carried, like the spellbook above: it is live state, and an
        // abandoned quest leaving the list is exactly the kind of change a delta
        // snapshot would drop — the journal would keep showing a quest the
        // player just gave up.
        snapshot.questProgress = gameState.questProgress;
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
