/**
 * The Keyboard class monitors keyboard input and dispatches keyboard events.
 *
 * _Note_: many keyboards are unable to process certain combinations of keys due to hardware limitations known as ghosting.
 * See http://www.html5gamedevs.com/topic/4876-impossible-to-use-more-than-2-keyboard-input-buttons-at-the-same-time/ for more details.
 *
 * Also please be aware that certain browser extensions can disable or override Phaser keyboard handling.
 * For example the Chrome extension vimium is known to disable Phaser from using the D key. And there are others.
 * So please check your extensions before opening Phaser issues.
 */

import {Key} from './keys/Key';
import {KeyCodes} from './keys/KeyCodes';
import {KeyCombo} from './combo/KeyCombo';
import {ProcessKeyDown} from './keys/ProcessKeyDown';
import {ProcessKeyUp} from './keys/ProcessKeyUp';
import {ResetKey} from './keys/ResetKey';

// Keys that zoom the browser when held with Ctrl (or Cmd on macOS). Matched on
// `event.key` rather than `keyCode` so the main row and the numpad are both
// covered on every layout — on a US layout the zoom-in key reports '=' unshifted
// and '+' shifted, and the numpad reports '+' either way.
const BROWSER_ZOOM_KEYS = new Set(['+', '-', '=', '_']);

/**
 * Ctrl/Cmd +/− — the browser's own zoom. Ctrl+0 is deliberately NOT matched:
 * it resets the zoom, and swallowing it too would strand anyone who had already
 * zoomed with the mouse wheel or the browser menu (neither of which a page can
 * intercept from here).
 */
function isBrowserZoomShortcut(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && BROWSER_ZOOM_KEYS.has(event.key);
}

export class KeyboardManager {
    enabled = false;
    target;
    keys = [];
    combos = [];
    captures = [];
    // Standard FIFO queue
    queue = [];
    handler;
    blurHandler;
    visibilityHandler;

    constructor() {
        // EventEmitter.call(this);
    }

    /**
     * The Boot handler is called by Phaser.Game when it first starts up.
     * The renderer is available by now.
     */
    boot() {
        this.enabled = true;
        this.target = window;

        if (this.enabled) {
            this.startListeners();
        }
    }

    startListeners() {
        let queue = this.queue;
        let captures = this.captures;

        let handler = function (event) {
            if (isBrowserZoomShortcut(event)) {
                // Browser zoom fights the fixed field of view (camera/Zoom.ts):
                // the world keeps its size and only the HUD rescales, so the
                // page ends up mismatched with no in-game benefit. Game zoom is
                // its own control in the HUD.
                event.preventDefault();
            }

            // FIXME Space is always prevented!?
            if (event.defaultPrevented && (event.keyCode !== KeyCodes.SPACE)) {
                // Do nothing if event already handled
                return;
            }

            queue.push(event);

            if (captures[event.keyCode]) {
                event.preventDefault();
            }
        };

        this.handler = handler;

        this.target.addEventListener('keydown', handler, false);
        this.target.addEventListener('keyup', handler, false);

        // A key held across a focus loss never gets its keyup — the browser
        // delivers it to whoever has focus then — so without a sweep the key
        // stays down forever and movement keeps streaming to the server
        // (round-8 item 3). Sweeping the KEYS (rather than zeroing Controls'
        // movement vector) matters: Controls' next tick then reads (0,0)
        // through its normal released-keys path, which is what arms the
        // stop-tail. blur catches window switches; visibilitychange catches
        // tab switches and mobile app-switching, gated on hidden so becoming
        // visible again doesn't sweep a legitimately re-pressed key.
        this.blurHandler = () => this.releaseAllKeys();
        this.visibilityHandler = () => {
            if (document.hidden) {
                this.releaseAllKeys();
            }
        };
        window.addEventListener('blur', this.blurHandler);
        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    stopListeners() {
        this.target.removeEventListener('keydown', this.handler);
        this.target.removeEventListener('keyup', this.handler);
        window.removeEventListener('blur', this.blurHandler);
        document.removeEventListener('visibilitychange', this.visibilityHandler);
    }

    /**
     * Forces every key back to its up state. Also drops the unprocessed event
     * queue — a keydown queued just before the focus loss would otherwise
     * resurrect its key on the next update(), with no keyup ever coming.
     */
    releaseAllKeys() {
        this.queue.length = 0;
        this.keys.forEach((key) => {
            if (key) {
                ResetKey(key);
            }
        });
    }

    /**
     * Creates and returns an object containing 4 hotkeys for Up, Down, Left and Right and also space and shift.
     */
    createCursorKeys() {
        return this.addKeys({
            up: KeyCodes.UP,
            down: KeyCodes.DOWN,
            left: KeyCodes.LEFT,
            right: KeyCodes.RIGHT,
            space: KeyCodes.SPACE,
            shift: KeyCodes.SHIFT
        });
    }

    /**
     * A practical way to create an object containing user selected hotkeys.
     *
     * For example,
     *
     *     addKeys( { 'up': Phaser.KeyCode.W, 'down': Phaser.KeyCode.S, 'left': Phaser.KeyCode.A, 'right': Phaser.KeyCode.D } );
     *
     * would return an object containing properties (`up`, `down`, `left` and `right`) referring to {@link Phaser.Key} object.
     */
    addKeys(keys) {
        let output = {};

        for (let key in keys) {
            output[key] = this.addKey(keys[key]);
        }

        return output;
    }

    /**
     * If you need more fine-grained control over a Key you can create a new Phaser.Key object via this method.
     * The Key object can then be polled, have events attached to it, etc.
     */
    addKey(keyCode) {
        let keys = this.keys;

        if (!keys[keyCode]) {
            keys[keyCode] = new Key(keyCode);
            this.captures[keyCode] = true;
        }

        return keys[keyCode];
    }

    /**
     * Removes a Key object from the Keyboard manager.
     */
    removeKey(keyCode) {
        if (this.keys[keyCode]) {
            this.keys[keyCode] = undefined;
            this.captures[keyCode] = false;
        }
    }

    addKeyCapture(keyCodes) {
        if (!Array.isArray(keyCodes)) {
            keyCodes = [keyCodes];
        }

        for (let i = 0; i < keyCodes.length; i++) {
            this.captures[keyCodes[i]] = true;
        }
    }

    removeKeyCapture(keyCodes) {
        if (!Array.isArray(keyCodes)) {
            keyCodes = [keyCodes];
        }

        for (let i = 0; i < keyCodes.length; i++) {
            this.captures[keyCodes[i]] = false;
        }
    }

    createCombo(keys, config) {
        return new KeyCombo(this, keys, config);
    }

    //  https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/KeyboardEvent
    //  type = 'keydown', 'keyup'
    //  keyCode = integer

    update() {
        let len = this.queue.length;

        if (!this.enabled || len === 0) {
            return;
        }

        //  Clears the queue array, and also means we don't work on array data that could potentially
        //  be modified during the processing phase
        let queue = this.queue.splice(0, len);

        let keys = this.keys;

        //  Process the event queue, dispatching all of the events that have stored up
        for (let i = 0; i < len; i++) {
            let event = queue[i];

            //  Will emit a keyboard or keyup event
            // this.emit(event.type, event);

            if (event.type === 'keydown') {
                // this.emit('down_' + event.keyCode, event);

                if (keys[event.keyCode]) {
                    ProcessKeyDown(keys[event.keyCode], event);
                }
            }
            else {
                // this.emit('up_' + event.keyCode, event);

                if (keys[event.keyCode]) {
                    ProcessKeyUp(keys[event.keyCode], event);
                }
            }
        }
    }

    shutdown() {
    }

    destroy() {
        this.stopListeners();

        this.keys = [];
        this.combos = [];
        this.captures = [];
        this.queue = [];
        this.handler = undefined;
    }
}
