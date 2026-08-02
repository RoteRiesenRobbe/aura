import {
    ControlsMovementEvent,
    ControlsRotateEvent,
    GameSetupEvent,
} from '../../core/logic/Events';
import {BasicConfig as Constants} from '../../../client-data/BasicConfig';
import * as Console from '../../internal-tools/console/logic/Console';
import * as Chat from '../../chat/logic/Chat';
import {isUndefined} from '../../common/logic/Utils';
import Tock from 'tocktimer';
import {KeyCodes} from '../../input-system/logic/keyboard/keys/KeyCodes';
import {Character} from '../../game-objects/logic/Character';
import {GameState, IGame} from '../../core/logic/IGame';
import {InputMessage} from '../../backend/logic/messages/outgoing/InputMessage';
import * as Conversation from '../../conversation/logic/Conversation';
import * as Journal from '../../journal/logic/Journal';
import * as Help from '../../help/logic/Help';
import {InteractMessage} from '../../backend/logic/messages/outgoing/InteractMessage';
import * as HUD from '../../user-interface/HUD/logic/HUD';
import {Vector} from '../../core/logic/Vector';
import {Develop} from '../../internal-tools/develop/logic/_Develop';

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

let consoleCooldown = 0;

class Keys {
    keys;

    constructor(...keys: number[]) {
        this.keys = [];
        for (let i = 0; i < arguments.length; i++) {
            this.keys.push(Game.inputManager.keyboard.addKey(arguments[i]));
        }
    }

    get isDown() {
        return this.keys.some(function (key) {
            return key.isDown;
        });
    }
}


export class Controls {
    character: Character;
    lastX: number;
    lastY: number;

    upKeys = new Keys(KeyCodes.W, KeyCodes.UP);
    downKeys = new Keys(KeyCodes.S, KeyCodes.DOWN);
    leftKeys = new Keys(KeyCodes.A, KeyCodes.LEFT);
    rightKeys = new Keys(KeyCodes.D, KeyCodes.RIGHT);
    pauseKeys = new Keys(KeyCodes.P);
    // Hotkeys [PLACEHOLDER bindings until a keybinding UI exists]:
    // 1–3 toggle the aura slots, Q/R/F fire the cooldown slots, E talks to
    // whoever is in range.
    //
    // ⚑ Cooldown slot 2 was E until chunk 3b-i took that key for the interact
    // verb. Q and F were taken too, so there was no free letter next to them —
    // R is the move the PLACEHOLDER note above sanctions (D9). Muscle memory
    // for anyone already playing changes with it.
    auraHotkeys = [new Keys(KeyCodes.ONE), new Keys(KeyCodes.TWO), new Keys(KeyCodes.THREE)];
    cooldownHotkeys = [new Keys(KeyCodes.Q), new Keys(KeyCodes.R), new Keys(KeyCodes.F)];
    interactKey = new Keys(KeyCodes.E);
    private auraHotkeysWereDown: boolean[] = [false, false, false];
    private cooldownHotkeysWereDown: boolean[] = [false, false, false];
    private interactKeyWasDown = false;
    clock: Tock;
    updateTime: number;
    lastInputType: ('MOUSE' | 'TOUCH') = 'MOUSE';
    // Release-signal state (plan-input-jitter.md chunk B): the client sends an
    // explicit zero-movement input for a short tail after the keys are released,
    // so the server's coast (chunk A) sees the stop even if a packet is lost.
    private wasMoving = false;
    private stopTailRemaining = 0;

    constructor(character: Character) {
        this.character = character;

        if (Constants.ALWAYS_VIEW_CURSOR) {
            this.lastX = character.getX();
            this.lastY = character.getY();
        }

        this.clock = new Tock({
            interval: Constants.INPUT_TICKRATE,
            callback: this.update.bind(this),
            complete: () => {
            },
        });

        this.clock.start();

        // Not part of Inputs as its way more complicated to implement desired behavior there.
        window.addEventListener('keydown', Controls.handleFunctionKeys);
    }

    static handleFunctionKeys(event: KeyboardEvent) {
        if (Chat.isOpen()) {
            return;
        }

        if (Console.KEY_CODE === event.code) {
            if (consoleCooldown > 0) {
                consoleCooldown--;
            } else {
                Console.toggle();
                consoleCooldown = 30;
            }
            event.preventDefault();
            return;
        }
        if (Console.isOpen()) {
            return;
        }


        if (Chat.KEYS.includes(event.which)) {
            Chat.show();
            event.preventDefault();
            return;
        }

        // Escape cancels a pending click-to-bind selection (feedback pass C
        // item 1). No preventDefault — Escape keeps its browser meanings
        // (leaving fullscreen above all), and the call is a no-op when no
        // skill is pending.
        // Journal (plan-quests.md C3, D16). J was free — E is interact, R is
        // cooldown slot 2 — and this sits behind the same chat/console guards
        // above, so typing "journal" in chat cannot open it.
        if (event.code === 'KeyJ') {
            Journal.toggle();
            event.preventDefault();
            return;
        }

        if (event.code === 'Escape') {
            HUD.cancelEquipSelection();
            // ...and closes the journal, which is client-owned visibility (C3)
            // rather than a request to the server. A no-op when it is shut.
            Journal.close();
            // ...and the help panel — purely client-side, same rule.
            Help.close();
            // ...and dismisses an open conversation (chunk 3b-ii, D21). Also a
            // no-op when no panel is open. It only ASKS: the panel closes when
            // the server drops the tree from the next snapshot.
            Conversation.leave();
            return;
        }
    }

    update() {
        let inputManager = Game.inputManager;
        inputManager.update(Date.now());

        if (Game.state !== GameState.PLAYING) {
            return;
        }

        if (Develop.isActive()) {
            if (isUndefined(this.updateTime)) {
                this.updateTime = this.clock.lap();
                Develop.get().logClientTickRate(this.updateTime);
            } else {
                let currentTime = this.clock.lap();
                let timeSinceUpdate = currentTime - this.updateTime;
                this.updateTime = currentTime;
                Develop.get().logClientTickRate(timeSinceUpdate);
            }

            // Pausing is only available in Develop mode
            if (this.pauseKeys.isDown) {
                if (Game.playing) {
                    Game.pause();
                } else {
                    Game.play();
                }
                return;
            }
        }

        if (consoleCooldown > 0) {
            consoleCooldown--;
        }

        if (Game.joystickManager.touchActionActive) {
            this.lastInputType = 'TOUCH';
        } else if (Game.inputManager.activePointer.justMoved) {
            this.lastInputType = 'MOUSE';
        }

        let movement: Vector;
        let rotationFace: ('CURSOR' | 'WALKING_DIRECTION');

        const joystickMovement = Game.joystickManager.movementVector;
        if (joystickMovement === null) {
            if (this.lastInputType === 'MOUSE') {
                rotationFace = 'CURSOR';
            } else {
                rotationFace = 'WALKING_DIRECTION';
            }
            movement = new Vector();
        } else {
            rotationFace = 'WALKING_DIRECTION';
            movement = joystickMovement;
            this.lastInputType = 'TOUCH';
        }

        if (this.upKeys.isDown) {
            movement.y -= 1;
        }
        if (this.downKeys.isDown) {
            movement.y += 1;
        }
        if (this.leftKeys.isDown) {
            movement.x -= 1;
        }
        if (this.rightKeys.isDown) {
            movement.x += 1;
        }

        let input = new InputMessage();
        let hasInput = false;

        if (Constants.ALWAYS_VIEW_CURSOR) {
            if (inputManager.activePointer.justMoved ||
                this.lastX !== this.character.getX() ||
                this.lastY !== this.character.getY()
            ) {
                input.rotation = this.adjustCharacterRotation(rotationFace, movement);
                hasInput = true;
                this.lastX = this.character.getX();
                this.lastY = this.character.getY();
            }
        } else if (inputManager.activePointer.justMoved) {
            input.rotation = this.adjustCharacterRotation(rotationFace, movement);
            hasInput = true;
        }

        if (movement.x !== 0 || movement.y !== 0) {
            input.movement = movement;
            ControlsMovementEvent.trigger(movement);
            hasInput = true;
            this.wasMoving = true;
            this.stopTailRemaining = 0;
        } else {
            // Keys released this tick → start the stop-tail so the server gets an
            // explicit "not walking" state even under packet loss. Without it a
            // release is signalled only by silence, which the server coast
            // (chunk A) would replay as continued movement. Then go quiet, so an
            // idle player sends nothing (no standing spam).
            if (this.wasMoving) {
                this.stopTailRemaining = Constants.STOP_TAIL_TICKS;
            }
            this.wasMoving = false;
            if (this.stopTailRemaining > 0) {
                input.movement = new Vector(); // explicit (0,0) stop
                hasInput = true;
                this.stopTailRemaining--;
            }
        }

        // Edge-triggered slot hotkeys: one action per key press, not per tick
        // held. Both delegate to the HUD handlers so keyboard and slot clicks
        // share the exact same guards and optimistic highlights.
        this.auraHotkeys.forEach((keys, slot) => {
            const down = keys.isDown;
            if (down && !this.auraHotkeysWereDown[slot]) {
                HUD.hotkeyAuraSlot(slot);
            }
            this.auraHotkeysWereDown[slot] = down;
        });
        this.cooldownHotkeys.forEach((keys, slot) => {
            const down = keys.isDown;
            if (down && !this.cooldownHotkeysWereDown[slot]) {
                HUD.hotkeyCooldownSlot(slot);
            }
            this.cooldownHotkeysWereDown[slot] = down;
        });

        // Interact (chunk 3b-i): same edge-triggered path as the slot hotkeys,
        // which is what earns it the PLAYING-state guard above for free — a
        // dead spectator cannot talk. The id comes straight from the badge the
        // server lit, and the server refuses anything else, so a stale press
        // costs nothing.
        const interactDown = this.interactKey.isDown;
        if (interactDown && !this.interactKeyWasDown) {
            if (Conversation.isOpen()) {
                // A second E closes the panel (chunk 3b-ii, D21) — the same key
                // that opened it, which is what players reach for first.
                Conversation.leave();
            } else {
                const target = Game.getInteractableEntityId();
                if (target !== 0) {
                    new InteractMessage(target).send();
                }
            }
        }
        this.interactKeyWasDown = interactDown;

        if (hasInput) {
            if (isUndefined(input.rotation)) {
                // Just send the current character rotation to not confuse the server
                input.rotation = this.character.getRotation();
            }

            if (inputManager.activePointer.justMoved) {
                ControlsRotateEvent.trigger(input.rotation);
            }

            input.send();
        }
    }

    adjustCharacterRotation(face: 'CURSOR' | 'WALKING_DIRECTION', movement: Vector) {
        // Rotation input is disabled.
        return this.character.getRotation();
    }

    destroy() {
        this.clock.stop();
        window.removeEventListener('keydown', Controls.handleFunctionKeys);
    }
}
