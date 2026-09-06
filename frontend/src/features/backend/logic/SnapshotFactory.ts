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
    // The owner-only "slow" block (plan-server-performance.md chunk 3):
    // change-only now, plus a ~5s heartbeat. undefined = unchanged since the
    // last tick that sent it — keep whatever the HUD already has.
    spellbook: number[] | undefined; // discovered skill IDs, owning player only
    spellbookLevels: number[] | undefined; // per-skill levels, positionally parallel to spellbook
    skillPoints: number | undefined; // unspent skill points, owning player only
    costFactor: number | undefined; // cost-reduction multiplier, owning player only; 1 = none
    damageFactor: number | undefined; // outgoing-damage multiplier (Strong), owning player only; 1 = none
    auraSlots: number[] | undefined; // equipped aura slot contents, positional (index i = slot i, 0 = empty)
    passiveSlots: number[] | undefined; // equipped passive slot contents, positional (index i = slot i, 0 = empty)
    cooldownSlots: number[] | undefined; // equipped cooldown slot contents, positional (index i = slot i, 0 = empty)
    // NOT part of the change-only block above (chunk 3, L3): changes every
    // tick a cooldown is running, so it stays always-sent.
    cooldownRemainingTicks: number[];
    activeAuraSlot: number | undefined; // active aura slot index, owning player only; -1 = Nothing
    castSkillId: number; // running cast (chunk 4); 0 = no cast
    castTicksLeft: number;
    castTicksTotal: number;
    castUtility: number; // baseline utility winding up (downtime C1); 0 = none
    campCharges: number; // Camp charges held (downtime C2); cap derived from level
    // The map's campfire markers (plan-world-map.md C2). undefined = not
    // published this tick, which is the case on all but two ticks of a session.
    discoveredCampfires: string[] | undefined;
    homeCampfire: string | undefined;
    activationRejectedSkillId: number; // one-tick rejection feedback; 0 = none
    activationRejectedReason: number;
    interactableEntityId: number; // conversant in talking range (3b-i); 0 = none
    // Who the panel belongs to; 0 = closed. The ONLY close signal (chunk 3,
    // D3) — always carried, never undefined.
    conversationEntityId: number;
    // The tree itself: undefined = no fresh content this tick (chunk 3, D3),
    // NOT "closed" any more — see conversationEntityId for that.
    conversation: ConversationTree | undefined;
    // running + completed quests, ids only (C3). Rides the same change-only
    // gate as the spellbook block above; undefined = unchanged.
    questProgress: QuestProgress[] | undefined;
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

        // The owner-only "slow" block (chunk 3): carried VERBATIM, undefineds
        // included, exactly like discoveredCampfires below — undefined means
        // "unchanged since the last tick that sent it", and substituting a
        // value (or defaulting to []) would blank the HUD on every tick but
        // the rare ones that actually changed something.
        snapshot.spellbook = gameState.spellbook;
        snapshot.spellbookLevels = gameState.spellbookLevels;
        snapshot.skillPoints = gameState.skillPoints;
        snapshot.costFactor = gameState.costFactor;
        snapshot.damageFactor = gameState.damageFactor;
        snapshot.auraSlots = gameState.auraSlots;
        snapshot.passiveSlots = gameState.passiveSlots;
        snapshot.cooldownSlots = gameState.cooldownSlots;
        snapshot.activeAuraSlot = gameState.activeAuraSlot;

        // NOT part of the block above (chunk 3, L3): changes every tick a
        // cooldown is running, so it stays always-carried.
        snapshot.cooldownRemainingTicks = gameState.cooldownRemainingTicks;

        // Cast bar scalars + one-tick rejection feedback: always carried
        snapshot.castSkillId = gameState.castSkillId;
        snapshot.castTicksLeft = gameState.castTicksLeft;
        snapshot.castTicksTotal = gameState.castTicksTotal;
        snapshot.castUtility = gameState.castUtility;
        // Always carried like the cast scalars: 0 is a meaningful value here
        // (an empty store greys the button), so a delta snapshot dropping the
        // field would leave the counter showing a charge the player has spent.
        snapshot.campCharges = gameState.campCharges;
        // ⚑ Carried VERBATIM, undefineds included — the opposite of the
        // always-carry reasoning above, and deliberately so. These two are
        // one-shots: undefined means "unchanged", and substituting a value
        // would turn every tick into a redraw of markers nobody moved.
        snapshot.discoveredCampfires = gameState.discoveredCampfires;
        snapshot.homeCampfire = gameState.homeCampfire;
        snapshot.activationRejectedSkillId = gameState.activationRejectedSkillId;
        snapshot.activationRejectedReason = gameState.activationRejectedReason;
        // Always carried, like the scalars above: it is live state, so "absent"
        // has to be distinguishable from "nobody in range" — the delta snapshot
        // would otherwise leave a stale badge lit after walking away.
        snapshot.interactableEntityId = gameState.interactableEntityId;
        // Always carried, live state: the ONLY close signal now (chunk 3, D3)
        // — a delta snapshot that dropped it would leave the panel open after
        // the server closed it.
        snapshot.conversationEntityId = gameState.conversationEntityId;
        // Change-only (chunk 3, D3): undefined means no fresh content this
        // tick, NOT closed any more — closing is conversationEntityId's job.
        snapshot.conversation = gameState.conversation;
        // Change-only like the spellbook above (chunk 3): undefined means
        // unchanged, so an abandoned quest keeps showing until the ledger
        // actually resends — which it does the same tick Abandon() runs,
        // since that bumps the ledger's revision.
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
