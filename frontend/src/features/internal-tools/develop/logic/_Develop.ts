import '../assets/developPanel.less';
import * as AABBs from './AABBs';
import * as Fps from './Fps';
import * as Preloading from '../../../core/logic/Preloading';
import {
    htmlToElement,
    isDefined,
    isNumber,
    isUndefined,
    rad2deg,
    resetFocus,
} from '../../../common/logic/Utils';
import * as Console from '../../console/logic/Console';
import {BasicConfig as Constants} from '../../../../client-data/BasicConfig';
import {BerryhunterApi} from '../../../backend/logic/BerryhunterApi';
import {IGame} from "../../../core/logic/IGame";
import {InputMessage} from "../../../backend/logic/messages/outgoing/InputMessage";
import {IDevelop} from "./IDevelop";
import {
    BackendSetupEvent,
    BackendStateChangedEvent,
    BackendStateChangedMsg,
    BackendValidTokenEvent,
    DevelopSetupEvent,
    GameSetupEvent,
} from '../../../core/logic/Events';
import {BackendState, IBackend} from '../../../backend/logic/IBackend';
import _isObject = require('lodash/isObject');
import {QueryParameters} from '../../logic/QueryParameters';
import {Account} from '../../../accounts/logic/Account';

let Game: IGame = null;
let Backend: IBackend = null;
let instance: Develop = null;
let active: boolean = false;

let dragStartX: number = undefined;
let dragStartY: number = undefined;

export class Develop implements IDevelop {
    public settings = {
        showAABBs: false,
        cameraBoundaries: true,
        elementColor: 0xFF0000,
        linewidth: 2,
        /**
         * Aus wievielen Werten wird maximal der Durchschnitt und die
         * mittlere absolute Abweichung gebildet
         */
        measurementSampleRate: 20,
    };

    logs = {
        fps: [],
        serverTickRate: [],
        clientTickRate: [],
    };

    showNextGameState: boolean = false;

    public static trySetup() {
        if (!active) return;
        if (Game === null) return;

        instance = new Develop();
        instance.setup();
    }

    public static get(): IDevelop {
        if (instance === null) {
            instance = new Develop();
            instance.setup();
        }

        return instance;
    }

    public static isActive(): boolean {
        return active;
    }

    private constructor() {
    }

    private setup(): void {
        AABBs.setup(this);
        Fps.setup(Game, this);

        this.setupDevelopPanel();

        switch (Backend.getState()) {
            case BackendState.DISCONNECTED:
            case BackendState.CONNECTING:
                Develop.get().logWebsocketStatus(Backend.getState(), 'neutral');
                break;
            case BackendState.ERROR:
                Develop.get().logWebsocketStatus(Backend.getState(), 'bad');
                break;
            default:
                Develop.get().logWebsocketStatus(Backend.getState(), 'good');
        }

        DevelopSetupEvent.trigger();
    }

    private setupDevelopPanel() {
        Preloading.renderPartial(require('./developPanel.html'), () => {
            const developPanel = document.getElementById('developPanel');
            // Capture inputs to prevent game actions while acting in develop panel
            // TODO use GameSettingsUI behavior
            [
                'click',
                'pointerdown',
                'pointerup',
                'mousedown',
                'mouseup',
                'mousemove',
                'touchstart',
                'touchend',
                'keyup',
                'keydown']
                .forEach((eventName) => {
                    developPanel.addEventListener(eventName, (event) => {
                        event.stopPropagation();
                    });
                });
            // TODO using this leads to the dragging not working anymore
            // developPanel
            //     .querySelectorAll('input, button, a')
            //     .forEach(preventShortcutPropagation);

            developPanel.addEventListener('focusin', (event) => {
                const target = event.target as Element;
                if (['select', 'input'].includes(target.tagName.toLowerCase())) {
                    // Keep input elements focussed
                    return;
                }

                resetFocus();
            });

            developPanel.addEventListener('dragstart', (event: DragEvent) => {
                console.log('DragStart', event);
                event.dataTransfer.setData('application/x-moz-node', developPanel as unknown as string);
                dragStartX = event.offsetX;
                dragStartY = event.offsetY;
            });

            developPanel.addEventListener('dragend', (event: DragEvent) => {
                console.log('DragEnd', event);

                const newX = event.clientX - dragStartX;
                const newY = event.clientY - dragStartY;
                developPanel.style.left = newX + 'px';
                developPanel.style.top = newY + 'px';
                developPanel.style.right = 'unset';
                Account.developPanelPositionX = newX;
                Account.developPanelPositionY = newY;
            });

            const savedX = Account.developPanelPositionX;
            if (savedX !== null) {
                developPanel.style.left = savedX + 'px';
                developPanel.style.right = 'unset';
            }
            const savedY = Account.developPanelPositionY;
            if (savedX !== null) {
                developPanel.style.top = savedY + 'px';
            }

            this.setupToggleButtons();

            this.setupTickSampler();
        });

    }

    private setupToggleButtons() {
        const buttons = document.querySelectorAll('#developPanel .toggleButton');

        const setButtonState = (button: Element, state: boolean) => {
            if (state) {
                button.querySelector('span.state').textContent = 'On';
                button.classList.add('on');
                button.classList.remove('off');
            } else {
                button.querySelector('span.state').textContent = 'Off';
                button.classList.add('off');
                button.classList.remove('on');
            }
        };

        for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];
            setButtonState(button, this.settings[button.getAttribute('data-setting')]);
            button.addEventListener('click', () => {
                let setting = button.getAttribute('data-setting');
                let newValue = !this.settings[setting];
                this.settings[setting] = newValue;
                setButtonState(button, newValue);
                this.onSettingToggle(setting, newValue);
            });
        }
    }

    private onSettingToggle(setting, newValue) {
        switch (setting) {
            case 'showAABBs':
                (Object.values(Game.map.objects) as unknown as AABBs.hasAABB[])
                    .forEach((gameObject: AABBs.hasAABB) => {
                        if (newValue) {
                            gameObject.showAABB();
                            if (isDefined(Game.player)) {
                                Game.player.character['showAABB']();
                            }
                        } else {
                            gameObject.hideAABB();
                            if (isDefined(Game.player)) {
                                Game.player.character['hideAABB']();
                            }
                        }
                    });
            // FIXME Game.render should not be exposed here
            // Game.render();
        }
    }

    private setupTickSampler() {
        let showServerTick = document.getElementById('develop_showServerTick');

        showServerTick.addEventListener('click', () => {
            let serverTickPopup = document.getElementById('serverTickPopup');
            serverTickPopup.classList.remove('hidden');
            this.showNextGameState = true;
        });

        let closeServerTick = document.getElementById('develop_closeServerTickPopup');
        closeServerTick.addEventListener('click', () => {
            let serverTickPopup = document.getElementById('serverTickPopup');
            serverTickPopup.classList.add('hidden');
        });
    }

    private logValue(name: string, value: any) {
        document.getElementById('develop_' + name).textContent = value;
    }

    private logSampledValue(name, logArray, value, unit?) {
        if (isUndefined(unit)) {
            unit = '';
        } else {
            unit = ' ' + unit;
        }
        logArray.push(value);
        if (logArray.length > this.settings.measurementSampleRate) {
            let average = 0;
            let min = 10000;
            let max = 0;
            logArray.forEach((value) => {
                average += value;
                if (value > max) {
                    max = value;
                }
                if (value < min) {
                    min = value;
                }
            });
            average /= logArray.length;

            let abweichung = 0;
            logArray.forEach((value) => {
                abweichung += Math.abs(value - average);
            });
            abweichung /= logArray.length;

            let output = min.toFixed(0);
            output += '/';
            output += average.toFixed(0);
            output += '/';
            output += max.toFixed(0);
            output += unit;
            this.logValue(name, output);

            logArray.length = 0;
        }
    }

    public logFPS(fps): void {
        this.logSampledValue('fps', this.logs.fps, fps);
    }

    public logServerMessage(message, messageType, timeSinceLast): void {
        console.info('Received ' + messageType + ' message.');

        this.logSampledValue('serverTickRate', this.logs.serverTickRate, timeSinceLast, 'ms');
        if (this.showNextGameState) {
            document.getElementById('serverTickOutput').textContent = JSON.stringify(message, null, 2);
            this.showNextGameState = false;
        }
    }

    public logServerTick(gameState, timeSinceLast): void {
        this.logValue('serverTick', gameState.tick);
        this.logSampledValue('serverTickRate', this.logs.serverTickRate, timeSinceLast, 'ms');
        if (this.showNextGameState) {
            document.getElementById('serverTickOutput').textContent =
                JSON.stringify(gameState, this.serverTickReplacer, 2);
            this.showNextGameState = false;
        }
    }

    public logTimeOfDay(formattedTimeOfDay): void {
        document.getElementById('develop_timeOfDay').textContent = formattedTimeOfDay;
    }

    private serverTickReplacer(key: string, value: any) {
        switch (key) {
            case 'item':
            case 'type':
                if (_isObject(value) && value.hasOwnProperty('name')) {
                    return value['name'];
                }
                break;
            case 'x':
            case 'y':
            case 'LowerX':
            case 'LowerY':
            case 'UpperX':
            case 'UpperY':
                if (isNumber(value)) {
                    return Math.round(value * 100) / 100;
                }
                break;
            case 'rotation':
                if (isNumber(value)) {
                    return rad2deg(value).toFixed(1) + 'deg';
                }
                break;
        }

        return value;
    }

    public logClientTick(inputObj: InputMessage): void {
        this.logValue('clientTick', inputObj.tick);

        let movementStr = '';
        if (inputObj.movement !== null) {
            movementStr = inputObj.movement.x.toFixed(2) + ' / ' + inputObj.movement.y.toFixed(2);
            switch (inputObj.movement.x) {
                case 1:
                    switch (inputObj.movement.y) {
                        case 1:
                            movementStr = '\u2198️'; // ↘
                            break;
                        case 0:
                            movementStr = '\u27A1'; // ➡
                            break;
                        case -1:
                            movementStr = '\u2197'; // ↗
                            break;
                    }
                    break;
                case 0:
                    switch (inputObj.movement.y) {
                        case 1:
                            movementStr = '\u2b07'; // ⬇
                            break;
                        case 0:
                            // movementStr = '\u26d4'; // ---
                            break;
                        case -1:
                            movementStr = '\u2b06'; // ⬆
                            break;
                    }
                    break;
                case -1:
                    switch (inputObj.movement.y) {
                        case 1:
                            movementStr = '\u2199'; // ↙
                            break;
                        case 0:
                            movementStr = '\u2b05'; // ⬅
                            break;
                        case -1:
                            movementStr = '\u2196'; // ↖
                            break;
                    }
                    break;
            }
        } else {
            // movementStr = '\u26d4'; // ---
        }

        document.getElementById('develop_input_movement').textContent = movementStr;

        if (isDefined(inputObj.rotation)) {
            document.getElementById('develop_input_rotation').textContent = (inputObj.rotation * (180 / Math.PI)).toFixed(0);
        } else {
            document.getElementById('develop_input_rotation').textContent = '';
        }

    }

    public logClientTickRate(timeSinceLast): void {
        this.logSampledValue('clientTickRate', this.logs.clientTickRate, timeSinceLast, 'ms');
    }

    public logWebsocketStatus(text: string, status: ('neutral' | 'good' | 'bad')): void {
        let webSocketCell = document.getElementById('develop_webSocket');
        if (webSocketCell === null) {
            return;
        }
        webSocketCell.textContent = text;
        webSocketCell.classList.remove('neutral', 'good', 'bad');
        webSocketCell.classList.add(status);
    }
}

GameSetupEvent.subscribe((game) => {
    Game = game;
    Develop.trySetup();
});

BackendSetupEvent.subscribe((backend) => {
    Backend = backend;
});

BackendStateChangedEvent.subscribe((msg: BackendStateChangedMsg) => {
    if (msg.newState === BackendState.WELCOMED) {
        Console.run('ping');

        // Only validate once - remove this listener after execution
        return true;
    }
});

BackendValidTokenEvent.subscribe( () => {
    if (QueryParameters.get().has(Constants.MODE_PARAMETERS.DEVELOPMENT)) {
        active = true;
        Develop.trySetup();
    }
});
