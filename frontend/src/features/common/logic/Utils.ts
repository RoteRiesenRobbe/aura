import _isString = require('lodash/isString');
import {radians} from './Types';
import RequireContext = __WebpackModuleApi.RequireContext;

/*
 http://stackoverflow.com/a/3885844
 */
export function isFloat(n) {
    return n === +n && n !== (n | 0);
}

export function isInteger(n) {
    return n === +n && n === (n | 0);
}

export function random(min, max?) {
    let rand = Math.random();

    if (arguments.length === 0) {
        return rand;
    } else if (arguments.length === 1) {
        if (arguments[0] instanceof Array) {
            return arguments[0][Math.floor(rand * arguments[0].length)];
        } else {
            return rand * min;
        }
    } else {
        if (min > max) {
            let tmp = min;
            min = max;
            max = tmp;
        }

        return rand * (max - min) + min;
    }
}

export function randomFrom<T>(array: T[]): T {
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}

export function randomInt(min, max?) {
    if (arguments.length == 1) {
        return Math.floor(random(min));
    }
    return Math.floor(random(min, max));
}

export function randomSign() {
    if (Math.random() <= 0.5) {
        return -1;
    }
    return 1;
}

/**
 * @return whether or not the element was found and removed.
 */
export function removeElement(array, element): boolean {
    let indexOf = array.indexOf(element);
    if (indexOf < 0) {
        return false;
    }
    array.splice(indexOf, 1);
    return true;
}

export const TwoDimensional = {
    angleBetween: function (x1, y1, x2, y2): radians {
        let atan2 = Math.atan2(y1 - y2, x1 - x2);
        return (atan2 < 0 ? Math.PI * 2 + atan2 : atan2);
    },

    /**
     *
     * @param radius
     * @param sides
     * @param flat if true, will create an array like [x1, y1, x2, y2, ...], else [{x1, y1}, {x2, y2}, ...]
     * @returns {Array}
     */
    makePolygon: function (radius, sides, flat) {
        let points = [];
        for (let i = 0; i < sides; i++) {
            let pct = (i + 0.5) / sides;
            let theta = 2 * Math.PI * pct + Math.PI / 2;
            let x = radius * Math.cos(theta);
            let y = radius * Math.sin(theta);
            if (flat) {
                points.push(x, y);
            } else {
                points.push({x, y});
            }
        }
        return points;
    },
};

export function defaultFor(arg, val) {
    return typeof arg !== 'undefined' ? arg : val;
}

export function clearNode(node: Node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

export function escapeRegExp(str) {
    return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
}

export function replaceAll(str, find, replace) {
    return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}

export function executeRandomFunction(weightedFunctions) {
    let weightTotal = 0;

    weightedFunctions.forEach(function (weightedFunction) {
        weightTotal += weightedFunction.weight;
    });

    // http://stackoverflow.com/a/9330493
    const index = randomInt(weightTotal) + 1;
    let sum = 0;
    let i = 0;
    while (sum < index) {
        const weightedFunction = weightedFunctions[i++];
        sum += weightedFunction.weight;
    }
    return weightedFunctions[i - 1].func();
}

export function map(n, start1, stop1, start2, stop2) {
    return ((n - start1) / (stop1 - start1)) * (stop2 - start2) + start2;
}

export function sq(n) {
    return n * n;
}

/**
 *
 * @param {number} limitDirections 4 = only top, right, bottom, left. 8 = top, top-left, ...
 *                     Can be any number, per default no limit is applied and any angle can be returned.
 * @return {number}
 */
export function randomRotation(limitDirections?) {
    if (limitDirections === false || limitDirections === 0) {
        return 0;
    }
    if (isNumber(limitDirections)) {
        return randomInt(0, limitDirections) * Math.PI * 2 / limitDirections;
    }
    return random(0, Math.PI * 2);
}

export function requireAll(requireContext: RequireContext): string[] | { default: string; }[] {
    return requireContext.keys().map(requireContext) as string[];
}

export function htmlModuleToString(html: (string | { 'default': string })): string {
    if (_isString(html)) {
        return html;
    } else {
        return html.default;
    }
}

export function htmlToElement(html: string) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content.firstChild;
}

export function svgToElement(svg) {
    const template = document.createElementNS('http://www.w3.org/2000/svg', 'template');
    template.innerHTML = svg;
    return template.firstChild;
}

/**
 *
 * @param {{method: String, url: String, [headers]: {}, [params]: String|{}}} opts
 * @returns {Promise}
 */
// TODO replace with fetch?
export function makeRequest(opts) {
    return new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.open(opts.method, opts.url);
        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                resolve(xhr.response);
            } else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText,
                });
            }
        };
        xhr.onerror = function () {
            reject({
                status: this.status,
                statusText: xhr.statusText,
            });
        };
        if (opts.headers) {
            Object.keys(opts.headers).forEach(function (key) {
                xhr.setRequestHeader(key, opts.headers[key]);
            });
        }
        let params = opts.params;
        // We'll need to stringify if we've been given an object
        // If we have a string, this is skipped.
        if (params && typeof params === 'object') {
            params = Object.keys(params).map(function (key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
            }).join('&');
        }
        xhr.send(params);
    });
}

export function isDefined(variable) {
    return !isUndefined(variable);
}

export function isUndefined(variable) {
    return typeof variable === 'undefined';
}

export function isFunction(variable) {
    return typeof variable === 'function';
}

export function isNumber(variable) {
    return typeof variable === 'number';
}

export function arraysEqual(a, b, compareFn) {
    if (a === b) {
        return true;
    }
    if (a == null || b == null) {
        return false;
    }
    if (a.length !== b.length) {
        return false;
    }

    compareFn = compareFn || function (a, b) {
        return a === b;
    };

    for (let i = 0; i < a.length; ++i) {
        if (!compareFn(a[i], b[i])) {
            return false;
        }
    }
    return true;
}

/**
 *
 * @param {number} a
 * @param {number} b
 * @param {number} epsilon - relative acceptable difference
 * @returns {boolean}
 */
// export function nearlyEqual(a, b, epsilon) {
// 	epsilon = epsilon || 0.00001;
//
// 	let absA = Math.abs(a);
// 	let absB = Math.abs(b);
// 	let diff = Math.abs(a - b);
//
// 	if (a == b) { // shortcut, handles infinities
// 		return true;
// 	} else if (a == 0 || b == 0 || diff < Number.EPSILON) {
// 		// a or b is zero or both are extremely close to it
// 		// relative error is less meaningful here
// 		return diff < (epsilon * Number.EPSILON);
// 	} else { // use relative error
// 		return diff / (absA + absB) < epsilon;
// 	}
// };

export function nearlyEqual(a, b, epsilon?) {
    if (a === b) {
        return true;
    }
    return Math.abs(a - b) < epsilon;
}

export function sortStrings(array, key?) {
    return array.sort(function (a, b) {
        let valueA;
        let valueB;
        if (key) {
            valueA = a[key];
            valueB = b[key];
        } else {
            valueA = a;
            valueB = b;
        }
        return valueA.localeCompare(valueB, undefined, {sensitivity: 'base'});
    });
}

export function roundToNearest(value, nearest) {
    return Math.round(value / nearest) * nearest;
}

export function rad2deg(radians) {
    return radians * 180 / Math.PI;
}

export function deg2rad(degrees) {
    return degrees * Math.PI / 180;
}

export function resetFocus() {
    document.body.focus();
}

/**
 * Disable event propagation for key and mouse events to prevent those event defaults
 * from being prevented globally.
 * @param element
 * @param keyList if you provide `propagated` keys, all other keys will NOT be propagated.
 *      If you provide `notPropagated`, all other keys WILL be propagated. Mutually exclusive.
 */
export function preventInputPropagation(
    element: Element,
    keyList?: {
        propagated?: string[] | string,
        notPropagated?: string[] | string
    },
) {
    function preventKeyInputPropagation(event: KeyboardEvent) {
        if (!keyList.propagated.includes(event.code)) {
            event.stopPropagation();
        }
    }

    function allowKeyInputPropagation(event: KeyboardEvent) {
        if (keyList.notPropagated.includes(event.code)) {
            event.stopPropagation();
        }
    }

    function preventCodeInputPropagation(event: KeyboardEvent) {
        if (keyList.propagated !== event.code) {
            event.stopPropagation();
        }
    }

    function allowCodeInputPropagation(event: KeyboardEvent) {
        if (keyList.notPropagated !== event.code) {
            event.stopPropagation();
        }
    }

    function preventInputPropagation(event: KeyboardEvent) {
        event.stopPropagation();
    }

    keyList = defaultFor(keyList, {});
    if (Array.isArray(keyList.propagated)) {
        element.addEventListener('keydown', preventKeyInputPropagation);
        element.addEventListener('keyup', preventKeyInputPropagation);
    } else if (_isString(keyList.propagated)) {
        element.addEventListener('keydown', preventCodeInputPropagation);
        element.addEventListener('keyup', preventCodeInputPropagation);
    } else if (Array.isArray(keyList.notPropagated)) {
        element.addEventListener('keydown', allowKeyInputPropagation);
        element.addEventListener('keyup', allowKeyInputPropagation);
    } else if (_isString(keyList.notPropagated)) {
        element.addEventListener('keydown', allowCodeInputPropagation);
        element.addEventListener('keyup', allowCodeInputPropagation);
    } else {
        element.addEventListener('keydown', preventInputPropagation);
        element.addEventListener('keyup', preventInputPropagation);
    }

    element.addEventListener('mousedown', preventInputPropagation);
    element.addEventListener('mousemove', preventInputPropagation);
    element.addEventListener('mouseup', preventInputPropagation);
    element.addEventListener('pointerdown', preventInputPropagation);
    element.addEventListener('pointerup', preventInputPropagation);
    element.addEventListener('touchstart', preventInputPropagation);
    element.addEventListener('touchend', preventInputPropagation);
    element.addEventListener('click', preventInputPropagation);
}

/**
 * Basically {@link preventInputPropagation} with sensible defaults for a range of interactable elements.
 */
export function preventShortcutPropagation(element: Element) {
    if (element instanceof HTMLInputElement) {
        switch (element.type) {
            case 'number':
                preventInputPropagation(element, {notPropagated: ['ArrowUp', 'ArrowDown', 'Tab']});
                return;
            case 'range':
                preventInputPropagation(element, {notPropagated: ['ArrowLeft', 'ArrowRight', 'Tab']});
                return;
            case 'checkbox':
            case 'radio':
                preventInputPropagation(element, {notPropagated: ['Space', 'Tab']});
                return;
            case 'text':
                // Free text input: no key may reach the game shortcuts.
                preventInputPropagation(element);
                return;
            default:
                console.warn(`Unsupported InputElement of type '${element.type}'.`, element);
                return;
        }
    }

    if (element instanceof HTMLTextAreaElement) {
        // Free multi-line text: no key may reach the game shortcuts (Enter must
        // stay in the textarea to insert a newline, not trigger a shortcut).
        preventInputPropagation(element);
        return;
    }

    if (element instanceof HTMLButtonElement) {
        preventInputPropagation(element, {notPropagated: ['Enter', 'Tab']});
        return;
    }

    if (element instanceof HTMLAnchorElement) {
        preventInputPropagation(element, {notPropagated: ['Enter', 'Tab']});
        return;
    }

    if (element instanceof HTMLSelectElement) {
        preventInputPropagation(element, {notPropagated: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Tab']});
        return;
    }

    console.warn('Unsupported Element.', element);
}


export const dateDiffUnit = {
    milliseconds: 1,
    seconds: 1000,
    days: 24 * 60 * 60 * 1000,
};

export function dateDiff(a, b, unit?) {
    if (isUndefined(unit)) {
        unit = dateDiffUnit.milliseconds;
    }

    return (a - b) / unit;
}

// One in-flight cleanup per element (see playCssAnimation). ⚑ Keyed by ELEMENT,
// not by element+class: both callers play exactly one animation class on their
// own element. A second class on the same element would leave the first one's
// class stranded - split the key if a third caller ever needs that.
const animationCleanups = new WeakMap<HTMLElement, (event: Event) => void>();

/**
 * Restart a CSS animation by taking its class off the element and putting it
 * straight back on.
 *
 * ⚑ The removal and the re-add MUST be separated by a style recalc, or the
 * engine never sees the animation-name change, keeps the existing (already
 * finished) animation, and nothing replays. Reading `offsetWidth` forces that
 * recalc synchronously. This used to defer the re-add to a
 * `requestAnimationFrame` on the theory that a frame boundary implies a recalc;
 * whether it does is engine-dependent (Chromium happens to restart reliably,
 * engines that run frame callbacks before the style flush do not), so the pulse
 * worked for some players and died after the first beat for others. UI-pass
 * C5's metronome pip is where that surfaced - plan-ui-pass.md §5 C5.
 *
 * ⚑ The class comes back OFF once the animation is over, so the element rests
 * in the class-absent state. A retained class replays all by itself the next
 * time the element is shown again (`display: none` cancels a running animation,
 * and re-displaying an element whose animation-name still applies creates a
 * fresh one) - on the beat pip that is a pulse on the aura switch that no beat
 * asked for, which is exactly the "a spurious one reads as broken" the
 * BeatDetector's switch guard exists to prevent.
 *
 * ⚑ NOT migrated to the Web Animations API (what the old `@deprecated` note
 * asked for): considered and declined. The keyframes are authored in LESS and
 * both callers want exactly "replay that rule" - two lines here, a duplicated
 * keyframe table there.
 *
 * @param element
 * @param animationClass
 */
export function playCssAnimation(element: HTMLElement, animationClass: string) {
    // Drop the previous call's cleanup FIRST. Restarting cancels the running
    // animation and `animationcancel` is delivered asynchronously, so a
    // listener left over from the superseded pulse would arrive after the new
    // class is already on and strip it right back off - killing the replay it
    // was meant to enable. Reachable in the wild: two spellbook unlocks inside
    // one 5 s glow.
    const stale = animationCleanups.get(element);
    if (stale) {
        element.removeEventListener('animationend', stale);
        element.removeEventListener('animationcancel', stale);
    }

    element.classList.remove(animationClass);
    void element.offsetWidth; // the style recalc that makes the restart real
    element.classList.add(animationClass);

    const done = (event: Event) => {
        // ⚑ Animation events BUBBLE, so only this element's own count. The
        // spellbook panel plays `unlockPulse` on itself while its children run
        // animations of their own - the `.unlocked` row glow and the C4b
        // `.breadcrumb` pulse. Marking a row seen removes `.breadcrumb`, which
        // CANCELS an infinite animation on a still-attached row; without this
        // guard that cancel would reach the panel, strip the 5 s glow mid-flight
        // and tear the cleanup down with it.
        if (event.target !== element) {
            return;
        }
        element.classList.remove(animationClass);
        element.removeEventListener('animationend', done);
        element.removeEventListener('animationcancel', done);
        animationCleanups.delete(element);
    };
    animationCleanups.set(element, done);
    element.addEventListener('animationend', done);
    element.addEventListener('animationcancel', done);
}

/**
 * @param element
 * @param options
 * @param {number} options.animationDuration in seconds
 * @param {boolean} options.alternating default = true
 */
export function smoothHoverAnimation(element: Element, options?: {
    additionalHoverElement?: Element,
    animationDuration?: number
}) {
    let {animationDuration, additionalHoverElement} = options;

    let mouseOverElement = false;
    element.addEventListener('mouseenter', () => {
        element.classList.add('hover');
        mouseOverElement = true;
    });
    if (isDefined(additionalHoverElement)) {
        additionalHoverElement.addEventListener('mouseenter', () => {
            element.classList.add('hover');
            mouseOverElement = true;
        });
    }

    element.addEventListener('mouseleave', () => {
        mouseOverElement = false;
    });
    if (isDefined(additionalHoverElement)) {
        additionalHoverElement.addEventListener('mouseleave', () => {
            mouseOverElement = false;
        });
    }

    element.addEventListener('animationiteration', (event: AnimationEvent) => {
        if (animationDuration) {
            let iterations = event.elapsedTime / animationDuration;
            if (iterations % 2 !== 0) {
                // Ignore alternating iterations
                return;
            }
        }
        if (!mouseOverElement) {
            element.classList.remove('hover');
        }
    });
}

const GROUP_SEPARATOR = '\u2005';
const multipliers = ['', 'K', 'M', 'B', 'T'];

/**
 * Formats numbers in groups
 *
 * 1000    --> "1 000"
 * 432738  --> "432 738"
 * 4432738 --> "4 432 738"
 */
export function formatInt(x: number): string {
    return x.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/**
 * Formats numbers in groups with abbreviations
 *
 * 1000     -->   "1 000"
 * 10000    -->    "10 K"
 * 432738   -->   "432 K"
 * 4432738  --> "4 432 K"
 * 54432738 -->    "54 M"
 */
export function formatIntWithAbbreviation(x: number): string {

    let kExp: number = 0;

    while (x >= 10 * 1000 && kExp < multipliers.length - 1) {
        kExp++;
        x /= 1000;
    }

    return formatInt(Math.floor(x)) + GROUP_SEPARATOR + multipliers[kExp];
}

/**
 * 5 --> 4
 * 1920 --> 2048
 * @param value
 * @return the closest power of 2 (1, 2, 4, 8, 16, ... 1024, 2048, 4096)
 */
export function roundToNearestPowOfTwo(value: number): number {
    return Math.pow(2, Math.round(Math.log2(value)));
}

export function logCallers(numberOfCallers: number = 3) {
    const stack = new Error().stack;
    const lines = stack.split('\n').slice(2, 2 + numberOfCallers); // Skip 'Error' and get next n callers
    console.log('Callers:\n' + lines.join('\n'));
}
