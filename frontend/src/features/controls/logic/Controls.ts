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
    // 1–3 toggle the aura slots, Q/E/F fire the cooldown slots.
    auraHotkeys = [new Keys(KeyCodes.ONE), new Keys(KeyCodes.TWO), new Keys(KeyCodes.THREE)];
    cooldownHotkeys = [new Keys(KeyCodes.Q), new Keys(KeyCodes.E), new Keys(KeyCodes.F)];
    private auraHotkeysWereDown: boolean[] = [false, false, false];
    private cooldownHotkeysWereDown: boolean[] = [false, false, false];
    clock: Tock;
    updateTime: number;
    lastInputType: ('MOUSE' | 'TOUCH') = 'MOUSE';

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
