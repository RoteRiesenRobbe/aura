import * as Utils from '../../common/logic/Utils';
import * as Console from '../../internal-tools/console/logic/Console';
import * as BackendConstants from './BackendConstants';
import * as SnapshotFactory from './SnapshotFactory';
import {Snapshot} from './SnapshotFactory';
import {GameStateMessage} from './messages/incoming/GameStateMessage';
import {WelcomeMessage} from './messages/incoming/WelcomeMessage';
import * as Chat from '../../chat/logic/Chat';
import * as AlertBanner from '../../user-interface/alert-banner/logic/AlertBanner';
import * as DayCycle from '../../day-cycle/logic/DayCycle';
import * as StartScreen from '../../user-interface/start-screen/logic/StartScreen';
import * as EndScreen from '../../user-interface/end-screen/logic/EndScreen';
import * as HUD from '../../user-interface/HUD/logic/HUD';
import {activationRejectionMessage, skillCategory, skillDisplayName} from '../../../client-data/Skills';
import {AuraApi} from './AuraApi';
import * as flatbuffers from 'flatbuffers';
import * as Urls from './Urls';
import {GameState, IGame} from "../../core/logic/IGame";
import {BackendState, IBackend} from "./IBackend";
import {Session} from "../../accounts/logic/Session";
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
            HUD.updateCastBar(
                snapshot.castSkillId ?? 0,
                snapshot.castTicksLeft ?? 0,
                snapshot.castTicksTotal ?? 0);

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

        if (!this.firstGameStateReceived) {
            this.firstGameStateResolve();
            this.firstGameStateReceived = true;
        }
    }
}
