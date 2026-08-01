import * as Preloading from '../../../core/logic/Preloading';
import {preventShortcutPropagation} from '../../../common/logic/Utils';

/**
 * The HUD registration nag (plan-accounts-frontend.md §5.4).
 *
 * Two surfaces exist for registration; this is the noisy one. The other is the
 * settings panel entry, which is always present and never auto-hides.
 *
 * ⚑ Rendered as its own root, not inside #accountScreens, because that
 * container is hidden wholesale on Accept and this banner has to survive into
 * the world.
 */

let rootElement: HTMLElement;
let onRegisterRequested: () => void = () => undefined;
let dismissedThisSession = false;

function onDomReady(): void {
    rootElement = document.getElementById('registrationNag');

    const register = document.getElementById('nagRegisterButton');
    preventShortcutPropagation(register);
    register.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        hide();
        onRegisterRequested();
    });

    const dismiss = document.getElementById('nagDismissButton');
    preventShortcutPropagation(dismiss);
    dismiss.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        dismissedThisSession = true;
        hide();
    });
}

Preloading.renderPartial(require('../assets/accountNag.html'), onDomReady);

export function setup(handlers: { onRegisterRequested: () => void }): void {
    onRegisterRequested = handlers.onRegisterRequested;
}

/**
 * Show the nag for a fresh login.
 *
 * ⚑ "Fresh login" is the character-select → Play path, which is exactly where
 * this is called from. A reconnect resume never passes through it, so the
 * §5.4 rule needs no flag of its own — the call site IS the rule.
 */
export function showForFreshLogin(registered: boolean): void {
    if (!rootElement || registered) {
        return;
    }
    // A player who dismissed it already said no; asking again in the same tab
    // is nagging rather than reminding.
    if (dismissedThisSession) {
        return;
    }
    rootElement.classList.remove('hidden');
}

export function hide(): void {
    if (rootElement) {
        rootElement.classList.add('hidden');
    }
}
