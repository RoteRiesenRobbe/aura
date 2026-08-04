import * as Utils from '../../common/logic/Utils';
import * as Console from '../../internal-tools/console/logic/Console';
import * as BackendConstants from './BackendConstants';
import * as SnapshotFactory from './SnapshotFactory';
import {Snapshot} from './SnapshotFactory';
import {GameStateMessage} from './messages/incoming/GameStateMessage';
import {PlayerRosterMessage} from './messages/incoming/PlayerRosterMessage';
import {WelcomeMessage} from './messages/incoming/WelcomeMessage';
import * as Chat from '../../chat/logic/Chat';
import * as AlertBanner from '../../user-interface/alert-banner/logic/AlertBanner';
import * as DayCycle from '../../day-cycle/logic/DayCycle';
import * as StartScreen from '../../user-interface/start-screen/logic/StartScreen';
import * as AccountScreens from '../../user-interface/account-screens/logic/AccountScreens';
import * as AccountFlow from '../../accounts/logic/AccountFlow';
import * as EndScreen from '../../user-interface/end-screen/logic/EndScreen';
import * as HUD from '../../user-interface/HUD/logic/HUD';
import {
    activationRejectionMessage,
    setLocalPlayerCostFactor,
    setLocalPlayerDamageFactor,
    skillCategory,
    skillDisplayName,
} from '../../../client-data/Skills';
import {getLocalPlayerLevel} from '../../../client-data/Mobs';
import {AuraApi} from './AuraApi';
import * as flatbuffers from 'flatbuffers';
import * as Urls from './Urls';
import {GameState, IGame} from "../../core/logic/IGame";
import {BackendState, IBackend} from "./IBackend";
import {Session} from "../../accounts/logic/Session";
import {Badgeable, retargetInteractBadge} from "./InteractBadgeTargeting";
import * as Interact from "../../interact/logic/Interact";
import {isMobile} from "../../user-interface/logic/Mobile";
import * as Conversation from "../../conversation/logic/Conversation";
import * as Journal from "../../journal/logic/Journal";
import {Develop} from "../../internal-tools/develop/logic/_Develop";
import {
    BackendConnectionFailureEvent,
    BackendSetupEvent,
    BackendStateChangedEvent,
    BackendValidTokenEvent,
    FirstGameStateHandledEvent,
    GameLateSetupEvent, PongReceivedEvent,
} from '../../core/logic/Events';

export class Backend implements IBackend {

    game: IGame = null;

    state: BackendState = BackendState.DISCONNECTED;

    firstGameStateReceived: boolean = false;
    firstGameStateResolve: () => void;
    firstGameStateReject: () => void;

    webSocket: WebSocket;
    lastMessageReceivedTime: number;
    firstPongReceived = false;

    // The conversant the server says is in range (chunk 3b-i); 0 = none. What
    // the interact key names when it opens a conversation.
    private interactableEntityId = 0;

    // The entity currently WEARING the badge; 0 = none. Tracked so the previous
    // one can be cleared when the server names a different actor or nobody —
    // the badge is state, not an event.
    //
    // ⚑ Deliberately not the same field as the offer above: while a panel is
    // open the badge is suppressed (the prompt has already been accepted) but
    // the actor is still very much in range.
    private badgedEntityId = 0;

    public setup(game: IGame): void {
        this.game = game;

        BackendConstants.setup();

        new Promise<void>((resolve, reject) => {
            this.firstGameStateResolve = resolve;
            this.firstGameStateReject = reject;
        }).then(() => {
            FirstGameStateHandledEvent.trigger();
        }).catch(() => {
            BackendConnectionFailureEvent.trigger();
        });

        this.setState(BackendState.CONNECTING);
        this.webSocket = new WebSocket(Urls.gameServer);
        this.webSocket.binaryType = 'arraybuffer';
        this.webSocket.onopen = () => {
            this.setState(BackendState.CONNECTED);
        };
        this.webSocket.onerror = () => {
            this.setState(BackendState.ERROR);
            if (!this.firstGameStateReceived) {
                this.firstGameStateReject();
                this.firstGameStateReceived = true;
            }
        };
        this.webSocket.onclose = () => {
            // ⚑ A close while a join is IN FLIGHT is the server refusing it
            // (step 8a chunk 3): an expired play ticket, or the account already
            // playing elsewhere. The server closes rather than sending a refusal
            // message, so this is where the client learns of it — AccountFlow
            // re-mints a ticket and retries exactly once, then falls back to
            // character-select with a plain message (§7b).
            //
            // It must be checked BEFORE the state is cleared, and it is
            // deliberately distinguished from a mid-game drop: a refused join
            // never became a session, so "Connection lost" would be wrong.
            if (AccountFlow.isJoinInFlight()) {
                this.setState(BackendState.DISCONNECTED);
                void AccountFlow.onJoinRefused();
                return;
            }
            // Only announce a drop of an established session — pre-join
            // failures are handled by the onerror/start-screen path. The
            // character is stashed server-side; a reload reconnects it.
            let wasInGame = this.state === BackendState.PLAYING
                || this.state === BackendState.SPECTATING;
            this.setState(BackendState.DISCONNECTED);
            if (wasInGame) {
                AlertBanner.show('Connection lost — reload to reconnect');
            }
        };

        this.webSocket.onmessage = this.receive.bind(this);

        if (Develop.isActive()) {
            this.lastMessageReceivedTime = performance.now();
        }

        BackendSetupEvent.trigger(this);
    }

    public getState(): BackendState {
        return this.state;
    }

    setState(newState: BackendState) {
        let oldState = this.state;
        this.state = newState;
        Console.log('Backend State: ' + this.state);

        if (Develop.isActive()) {
            switch (this.state) {
                case BackendState.DISCONNECTED:
                case BackendState.CONNECTING:
                    Develop.get().logWebsocketStatus(this.state, 'neutral');
                    break;
                case BackendState.ERROR:
                    Develop.get().logWebsocketStatus(this.state, 'bad');
                    break;
                default:
                    Develop.get().logWebsocketStatus(this.state, 'good');
            }
        }

        BackendStateChangedEvent.trigger({
            oldState: oldState,
            newState: newState
        });
    }

    private receive(message: MessageEvent): void {
        if (!message.data) {
            if (Develop.isActive()) {
                Develop.get().logWebsocketStatus('Receiving empty messages', 'bad');
            }
            console.warn('Received empty message.');
            return;
        }

        let data: Uint8Array;
        let buffer: flatbuffers.ByteBuffer;
        let serverMessage: AuraApi.ServerMessage;
        try {
            data = new Uint8Array(message.data);
        } catch (e) {
            if (Develop.isActive()) {
                Develop.get().logWebsocketStatus('Error converting message.data to Uint8Array.', 'bad');
            }
            console.error('Error converting message.data to Uint8Array.', message.data, e);
            return;
        }

        try {
            buffer = new flatbuffers.ByteBuffer(data);
        } catch (e) {
            if (Develop.isActive()) {
                Develop.get().logWebsocketStatus('Error creating ByteBuffer from Uint8Array.', 'bad');
            }
            console.error('Error creating ByteBuffer from Uint8Array.', data, e);
            return;
        }

        try {
            serverMessage = AuraApi.ServerMessage.getRootAsServerMessage(buffer);
        } catch (e) {
            if (Develop.isActive()) {
                Develop.get().logWebsocketStatus('Error reading ServerMessage from ByteBuffer.', 'bad');
            }
            console.error('Error reading ServerMessage from ByteBuffer.', buffer, e);
            return;
        }

        let timeSinceLastMessage;
        let messageReceivedTime;
        if (Develop.isActive()) {
            messageReceivedTime = performance.now();
            timeSinceLastMessage = messageReceivedTime - this.lastMessageReceivedTime;
            this.lastMessageReceivedTime = messageReceivedTime;
        }

        switch (serverMessage.bodyType()) {
            case AuraApi.ServerMessageBody.Welcome:
                this.setState(BackendState.WELCOMED);
                let welcome = new WelcomeMessage(serverMessage.body(new AuraApi.Welcome()));
                if (Develop.isActive()) {
                    Develop.get().logServerMessage(welcome, 'Welcome', timeSinceLastMessage);
                }
                this.game.startRendering(welcome);
                break;
            case AuraApi.ServerMessageBody.Accept:
                this.setState(BackendState.PLAYING);
                let accept = serverMessage.body(new AuraApi.Accept()) as AuraApi.Accept;
                if (Develop.isActive()) {
                    Develop.get().logServerMessage(accept, 'Accept', timeSinceLastMessage);
                }

                // Every Accept carries the character's reconnect token; storing
                // it on each one self-heals a stale token after a fresh join.
                let reconnectToken = accept.reconnectToken();
                if (reconnectToken) {
                    Session.reconnectToken = reconnectToken;
                }

                StartScreen.hide();
                // The account screens sit above the start screen, so hiding
                // only the latter would leave character-select over the world.
                AccountScreens.hide();
                AccountFlow.onJoinAccepted();
                EndScreen.hide();
                HUD.show();

                break;
            case AuraApi.ServerMessageBody.Obituary:
                this.setState(BackendState.SPECTATING);
                if (Develop.isActive()) {
                    Develop.get().logServerMessage(serverMessage.body(new AuraApi.Obituary()), 'Obituary', timeSinceLastMessage);
                }

                this.game.removePlayer();
                EndScreen.show();

                break;
            case AuraApi.ServerMessageBody.EntityMessage:
                /**
                 *
                 * @type {AuraApi.}
                 */
                let entityMessage: AuraApi.EntityMessage = serverMessage.body(new AuraApi.EntityMessage());

                if (Develop.isActive()) {
                    Develop.get().logServerMessage(entityMessage, 'EntityMessage', timeSinceLastMessage);
                }

                if (entityMessage.kind() === AuraApi.EntityMessageKind.Unlock) {
                    // Skill unlock (plan-unlock-attribution.md): entity_id carries
                    // the skill id, message carries the source label. The client
                    // owns the "New <category>: <name>" line so it stays in sync
                    // with the catalog's displayName overrides.
                    const skillId = Number(entityMessage.entityId());
                    const source = entityMessage.message();
                    const text = `New ${skillCategory(skillId)}: ${skillDisplayName(skillId)}`
                        + (source ? `\n${source}` : '');
                    AlertBanner.show(text, 'unlock');
                }
                // Journal ping (plan-quests.md D17): a quest entered a new stage
                // or finished. Garnish — the message carries only the line; the
                // journal's state rides GameState every tick (L8), so a dropped
                // banner loses nothing but the sentence.
                else if (entityMessage.kind() === AuraApi.EntityMessageKind.Journal) {
                    AlertBanner.show(entityMessage.message(), 'unlock');
                }
                // Entity id 0 = server announcement (chat.SystemEntityID) —
                // routed to the alert banner, not a speech bubble (C6).
                else if (Number(entityMessage.entityId()) === 0) {
                    AlertBanner.show(entityMessage.message(), 'announce');
                } else {
                    Chat.showMessage(Number(entityMessage.entityId()), entityMessage.message());
                }

                break;
            case AuraApi.ServerMessageBody.GameState:
                let gameState = new GameStateMessage(serverMessage.body(new AuraApi.GameState()));
                if (this.state === BackendState.WELCOMED) {
                    this.setState(BackendState.SPECTATING);
                    this.game.createSpectator(gameState.player.x, gameState.player.y);
                }
                if (Develop.isActive()) {
                    Develop.get().logServerTick(gameState, timeSinceLastMessage);
                    // Snapshot-only arrival interval (GameState→GameState), the
                    // metric that actually sizes the render-jitter fix — the
                    // serverTickRate line above is time-since-any-message and is
                    // polluted by interleaved EntityMessages/Pongs.
                    // (plan-render-jitter.md chunk 1)
                    Develop.get().logSnapshotArrival(messageReceivedTime);
                }
                GameLateSetupEvent.subscribe(() => {
                    this.receiveSnapshot(SnapshotFactory.newSnapshot(this.state, gameState));
                });
                break;
            case AuraApi.ServerMessageBody.PlayerRoster:
                // The map's other-player dots (plan-world-map.md C3, D7): every
                // live player in the zone, ~1×/s. Handed straight to the map —
                // it is not snapshot state and deliberately does not travel
                // through Snapshot/receiveSnapshot, which is the 30 Hz path.
                let roster = new PlayerRosterMessage(serverMessage.body(new AuraApi.PlayerRoster()));
                if (Develop.isActive()) {
                    Develop.get().logServerMessage(roster, 'PlayerRoster', timeSinceLastMessage);
                }
                this.game.miniMap?.setRoster(roster.players);
                break;
            case AuraApi.ServerMessageBody.Pong:
                PongReceivedEvent.trigger();

                if (!this.firstPongReceived) {
                    BackendValidTokenEvent.trigger(this);
                    this.firstPongReceived = true;
                }

                break;
            default:
                if (Develop.isActive()) {
                    Develop.get().logWebsocketStatus('Received unknown body type ' + serverMessage.bodyType(), 'bad');
                }
                console.warn('Received unknown body type ' + serverMessage.bodyType());
        }

    }

    public receiveSnapshot(snapshot: Snapshot) {
        this.game.map.newSnapshot(snapshot.entities);

        DayCycle.setTimeByTick(snapshot.tick);

        if (this.state === BackendState.PLAYING) {
            if (this.game.state === GameState.PLAYING) {
                this.game.player.updateFromBackend(snapshot.player);
            } else {
                this.game.createPlayer(
                    snapshot.player.id,
                    snapshot.player.position.x,
                    snapshot.player.position.y,
                    snapshot.player.name);
            }

            // The tooltip prices every cost through it (R1/F2). Mirrored before
            // the spellbook update below, so the panel that opens on an unlock
            // already prices with it; `?? 1` is the neutral value, which is what
            // an absent field means on the wire too.
            setLocalPlayerCostFactor(snapshot.costFactor ?? 1);
            // Same contract for the damage side (round-7 item 5, Strong).
            setLocalPlayerDamageFactor(snapshot.damageFactor ?? 1);

            // snapshot.spellbook is always defined ([] for empty); isDefined guard
            // matches inventory pattern and is safe against the first-tick edge case.
            if (Utils.isDefined(snapshot.spellbook)) {
                HUD.updateSpellbook(snapshot.spellbook, snapshot.spellbookLevels ?? [], snapshot.skillPoints ?? 0);
            }

            if (Utils.isDefined(snapshot.auraSlots)) {
                HUD.updateAuraLoadout(snapshot.auraSlots);
            }

            if (Utils.isDefined(snapshot.passiveSlots)) {
                HUD.updatePassiveLoadout(snapshot.passiveSlots);
            }

            if (Utils.isDefined(snapshot.cooldownSlots)) {
                HUD.updateCooldownLoadout(snapshot.cooldownSlots, snapshot.cooldownRemainingTicks ?? []);
            }

            if (Utils.isDefined(snapshot.activeAuraSlot)) {
                HUD.updateActiveAuraSlot(snapshot.activeAuraSlot);
            }

            // Cast bar (skill-vocab chunk 4): all-zero = no cast, hides the bar.
            // A baseline-utility cast (downtime C1) rides the same bar via the
            // fourth argument — its label source, since utilities are not
            // catalog skills.
            HUD.updateCastBar(
                snapshot.castSkillId ?? 0,
                snapshot.castTicksLeft ?? 0,
                snapshot.castTicksTotal ?? 0,
                snapshot.castUtility ?? 0);

            // The Camp charge counter (downtime C2). Only the count is on the
            // wire; the cap comes from getLocalPlayerLevel, which Player has
            // already mirrored from this same snapshot's own character.
            HUD.updateCampCharges(snapshot.campCharges ?? 0, getLocalPlayerLevel());

            // The map's campfire markers (plan-world-map.md C2). Passed
            // straight through, including the undefineds: absent means "not
            // published this tick", which is the case on all but two ticks of a
            // session, and the map is the thing that knows what to do with it.
            this.game.miniMap.setDiscoveredCampfires(
                snapshot.discoveredCampfires, snapshot.homeCampfire);

            // Rejection feedback (chunk 4, §3.5): one-tick stamp → floating
            // text over the own character (the campfire-bound rendering path).
            if ((snapshot.activationRejectedReason ?? 0) > 0) {
                this.game.player.character.showFloatingText(
                    activationRejectionMessage(snapshot.activationRejectedReason), 0xE05252);
            }

            if (Develop.isActive()) {
                this.game.player.character['updateAABB'](snapshot.player.aabb);
            }
        }

        snapshot.entities.forEach((entity) => {
            this.game.map.addOrUpdate(entity);
        });

        // Conversation panel (chunk 3b-ii). Before the badge, because the badge
        // suppresses itself for whoever the panel belongs to.
        Conversation.update(snapshot.conversation ?? null);

        // The quest ledger (plan-quests.md chunk C3): live state, re-sent every
        // tick like the tree above. The panel's own visibility is the client's;
        // only its CONTENT comes from here.
        Journal.update(snapshot.questProgress ?? []);

        // Interact badge (chunk 3b-i). After addOrUpdate, so an actor that
        // entered the viewport this same tick already has a game object to
        // hang the prompt on.
        //
        // ⚑ The badge hides while its OWN conversation is open: the prompt has
        // already been accepted, and leaving it lit reads as "press E again to
        // do the thing you are already doing".
        //
        // ⚑ Suppression is applied to the BADGE ONLY, never to the tracked id.
        // Feeding 0 into updateInteractBadge would also zero what
        // getInteractableEntityId() reports, so the whole client would believe
        // nobody is in range for as long as a panel is open — harmless today
        // only because the interact key checks Conversation.isOpen() first, and
        // a trap for the next reader of that getter.
        const offered = snapshot.interactableEntityId ?? 0;
        this.interactableEntityId = offered;
        const badged = offered === Conversation.partnerId() ? 0 : offered;
        // ⚑ On mobile the badge is REPLACED, not accompanied (PO 2026-08-02):
        // a phone has no E, so the offer is presented as a HUD button instead.
        // Both surfaces are driven from this one site off the same `badged`
        // id, so they can never disagree about which actor is on offer.
        this.updateInteractBadge(isMobile() ? 0 : badged);
        Interact.updateButton(badged);

        if (!this.firstGameStateReceived) {
            this.firstGameStateResolve();
            this.firstGameStateReceived = true;
        }
    }

    /**
     * The actor this player can talk to right now; 0 = nobody. The interact
     * key reads it so the message names exactly what the badge is drawn on.
     */
    public getInteractableEntityId(): number {
        return this.interactableEntityId;
    }

    /**
     * Move the interact badge to whichever entity should wear it, or clear it.
     *
     * ⚑ Tracked separately from interactableEntityId: what is DRAWN and what is
     * OFFERED diverge while a panel is open (the badge hides, the offer stands).
     */
    private updateInteractBadge(id: number): void {
        this.badgedEntityId = retargetInteractBadge(
            this.badgedEntityId,
            id,
            (entityId) => this.game.map.getObject(entityId) as Badgeable);
    }
}
