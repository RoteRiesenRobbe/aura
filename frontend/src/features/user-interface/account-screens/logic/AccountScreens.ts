import '../assets/accountScreens.less';
import * as Preloading from '../../../core/logic/Preloading';
import {preventInputPropagation} from '../../../common/logic/Utils';
import {registerFullscreenToggle} from '../../../full-screen/logic/FullScreen';
import {registerMuteToggle} from '../../../audio/logic/Audio';
import * as PlayerCount from '../../start-screen/logic/PlayerCount';
import {attachTooltips, showTooltip, tooltipAnchor} from '../../HUD/logic/SkillTooltip';
import {t} from '../../../localization/logic/Locale';

/**
 * The DOM shell for the pre-game account screens
 * (plan-accounts-frontend.md §4). Panel plumbing only — every decision about
 * *which* panel to show lives in AccountFlow.
 */

export type PanelName = 'characterCreation' | 'characterSelect' | 'loginPanel' | 'registerPanel';

const PANELS: PanelName[] = ['characterCreation', 'characterSelect', 'loginPanel', 'registerPanel'];

let rootElement: HTMLElement;
const domReadyCallbacks: Array<() => void> = [];
let isDomReady = false;

function onDomReady() {
    rootElement = document.getElementById('accountScreens');

    // Without this, typing a character name walks the player around the world:
    // the input-system listens on the document, not on the canvas.
    preventInputPropagation(rootElement);

    // Below whichever panel is showing (the container is a column).
    PlayerCount.mount(element('accountPlayerCount'));

    // ⚑ Registered here, not in each panel's module: the device bar's checkboxes and
    // the settings panel's are views of one preference each, and Audio and
    // FullScreen keep them agreeing. (preventInputPropagation only stops
    // propagation — it never preventDefaults — so the checkbox still toggles
    // and still fires `change`.)
    registerFullscreenToggle(element<HTMLInputElement>('accountFullscreenToggle'));
    registerMuteToggle(element<HTMLInputElement>('accountMuteToggle'));
    wireDeviceTooltips(rootElement.querySelector('.accountDeviceBar'));

    isDomReady = true;
    domReadyCallbacks.forEach((callback) => callback());
    domReadyCallbacks.length = 0;
}

/** The device buttons' hover names what a press would do, so it reads the state at show time. */
function wireDeviceTooltips(bar: HTMLElement) {
    const show = (button: HTMLElement) => {
        const on = button.querySelector('input').checked;
        const title = button.classList.contains('soundToggle')
            ? (on ? t('account.sound-on-hint') : t('account.sound-off-hint'))
            : (on ? t('account.fullscreen-leave') : t('account.fullscreen'));
        showTooltip(button, {title, subtitle: '', lines: []});
    };
    attachTooltips(bar, '.deviceToggle', show);
    // A press flips the state under an open tooltip: refresh it.
    bar.addEventListener('change', () => {
        const anchor = tooltipAnchor();
        if (anchor && bar.contains(anchor)) {
            show(anchor);
        }
    });
}

Preloading.renderPartial(require('../assets/accountScreens.html'), onDomReady);

/** Run once the markup exists, immediately if it already does. */
export function whenReady(callback: () => void): void {
    if (isDomReady) {
        callback();
        return;
    }
    domReadyCallbacks.push(callback);
}

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

/** Show exactly one panel and reveal the container. */
export function showPanel(name: PanelName): void {
    rootElement.classList.remove('hidden');
    PANELS.forEach((panel) => {
        element(panel).classList.toggle('hidden', panel !== name);
    });
}

/**
 * Hide the whole account layer.
 *
 * ⚑ Called on `Accept` alongside StartScreen.hide() — the player is in the
 * world, and a panel left visible would sit over live gameplay.
 */
export function hide(): void {
    if (!isDomReady) {
        return;
    }
    rootElement.classList.add('hidden');
    PANELS.forEach((panel) => element(panel).classList.add('hidden'));
    element('deleteDialog').classList.add('hidden');
}

/** Whether a panel is the one currently on screen. */
export function isPanelVisible(name: PanelName): boolean {
    if (!isDomReady || rootElement.classList.contains('hidden')) {
        return false;
    }
    return !element(name).classList.contains('hidden');
}

export function showError(panel: HTMLElement, message: string, ref?: string): void {
    const target = panel.querySelector('.formError') as HTMLElement;
    if (!target) {
        return;
    }
    // ⚑ `ref` is the correlation id of the server log line that recorded the
    // real cause. Showing it is what makes a vague message reportable — it is
    // the counterweight to §5b's deliberately ambiguous wording.
    target.textContent = ref ? `${message} (ref ${ref})` : message;
    target.classList.remove('hidden');
}

export function clearError(panel: HTMLElement): void {
    const target = panel.querySelector('.formError') as HTMLElement;
    if (!target) {
        return;
    }
    target.textContent = '';
    target.classList.add('hidden');
}

/**
 * Disable a form while a request is in flight, so a double submit cannot mint
 * two characters or two login attempts.
 */
export function setFormBusy(panel: HTMLElement, busy: boolean): void {
    panel.querySelectorAll('input[type="submit"], .button').forEach((el) => {
        (el as HTMLInputElement).classList.toggle('disabled', busy);
        if (el instanceof HTMLInputElement) {
            el.disabled = busy;
        }
    });
}
