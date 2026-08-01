import {AccountsApi, ApiError} from '../../../accounts/logic/AccountsApi';
import * as AccountScreens from './AccountScreens';

/**
 * Login and register (plan-accounts-frontend.md §5.2, §6).
 *
 * Two different actions, deliberately not unified:
 *
 *   Register  sets credentials ON the current account — progress is kept, and
 *             is simply now reachable by those credentials too.
 *   Login     SWITCHES to a different, already-existing account — so the
 *             account you came from may have to be discarded (§6).
 *
 * ⚑ Login is reachable ONLY while logged out, from the home screen
 * (§10b ruling 3). That is not merely tidier: §6's discard soft-deletes every
 * alive character on the anonymous account, and while playing that would
 * include the character currently in the world — `/api/auth/login` has no
 * live-session check, only `/select` does. Restricting reachability makes the
 * case unreachable instead of guarding it.
 */

export interface AnonymousState {
    hasSecret: boolean;
    /** From the server (§3a) — counts bloodline unlocks, not just characters. */
    hasProgress: boolean;
}

let onAuthenticated: (username: string) => void = () => undefined;
let onCancel: () => void = () => undefined;
let anonymous: AnonymousState = {hasSecret: false, hasProgress: false};
let discardConfirmed = false;

export function setup(handlers: {
    onAuthenticated: (username: string) => void,
    onCancel: () => void,
}): void {
    onAuthenticated = handlers.onAuthenticated;
    onCancel = handlers.onCancel;

    AccountScreens.whenReady(() => {
        AccountScreens.element('loginForm').addEventListener('submit', (event) => {
            event.preventDefault();
            void submitLogin();
        });
        AccountScreens.element('registerForm').addEventListener('submit', (event) => {
            event.preventDefault();
            void submitRegister();
        });
        AccountScreens.element('loginBackButton').addEventListener('pointerdown', (event) => {
            event.preventDefault();
            onCancel();
        });
        AccountScreens.element('registerBackButton').addEventListener('pointerdown', (event) => {
            event.preventDefault();
            onCancel();
        });
    });
}

export function showLogin(state: AnonymousState): void {
    anonymous = state;
    discardConfirmed = false;

    const panel = AccountScreens.element('loginPanel');
    AccountScreens.clearError(panel);
    AccountScreens.setFormBusy(panel, false);
    (panel.querySelector('.anonymousWarning') as HTMLElement).classList.add('hidden');
    (AccountScreens.element('loginForm') as HTMLFormElement).reset();
    (panel.querySelector('input[type="submit"]') as HTMLInputElement).value = 'Log in';

    AccountScreens.showPanel('loginPanel');
    AccountScreens.element<HTMLInputElement>('loginUsername').focus();
}

export function showRegister(): void {
    const panel = AccountScreens.element('registerPanel');
    AccountScreens.clearError(panel);
    AccountScreens.setFormBusy(panel, false);
    (AccountScreens.element('registerForm') as HTMLFormElement).reset();

    AccountScreens.showPanel('registerPanel');
    AccountScreens.element<HTMLInputElement>('registerUsername').focus();
}

async function submitLogin(): Promise<void> {
    const panel = AccountScreens.element('loginPanel');
    const username = AccountScreens.element<HTMLInputElement>('loginUsername').value.trim();
    const password = AccountScreens.element<HTMLInputElement>('loginPassword').value;

    AccountScreens.clearError(panel);

    // §6: the warning is CONDITIONAL, and each branch is a different decision.
    //   no local secret          → nothing to lose, log straight in
    //   local account, empty     → discard silently, no warning
    //   local account, progress  → warn, and require an explicit second press
    const mustWarn = anonymous.hasSecret && anonymous.hasProgress && !discardConfirmed;
    if (mustWarn) {
        const warning = panel.querySelector('.anonymousWarning') as HTMLElement;
        warning.textContent =
            'You are currently playing without an account. Logging in will abandon '
            + 'that progress permanently — it cannot be recovered afterwards. '
            + 'Press Log in again to continue.';
        warning.classList.remove('hidden');
        (panel.querySelector('input[type="submit"]') as HTMLInputElement).value =
            'Log in and abandon progress';
        discardConfirmed = true;
        return;
    }

    // ⚑ Only ever true once the player has seen a warning naming what is lost,
    // or when there was demonstrably nothing to lose.
    const discardAnonymous = anonymous.hasSecret;

    AccountScreens.setFormBusy(panel, true);
    try {
        const session = await AccountsApi.login(username, password, discardAnonymous);
        onAuthenticated(session.username);
    } catch (error) {
        report(panel, error);
        discardConfirmed = false;
        (panel.querySelector('input[type="submit"]') as HTMLInputElement).value = 'Log in';
    } finally {
        AccountScreens.setFormBusy(panel, false);
    }
}

async function submitRegister(): Promise<void> {
    const panel = AccountScreens.element('registerPanel');
    const username = AccountScreens.element<HTMLInputElement>('registerUsername').value.trim();
    const password = AccountScreens.element<HTMLInputElement>('registerPassword').value;
    const repeatPassword = AccountScreens.element<HTMLInputElement>('registerPasswordRepeat').value;
    if (password !== repeatPassword) {
        AccountScreens.setFormBusy(panel, false);
        AccountScreens.showError(panel, "Passwords do not match.");
        return;
    }

    AccountScreens.clearError(panel);
    AccountScreens.setFormBusy(panel, true);
    try {
        const session = await AccountsApi.register(username, password);
        onAuthenticated(session.username);
    } catch (error) {
        report(panel, error);
    } finally {
        AccountScreens.setFormBusy(panel, false);
    }
}

/**
 * ⚑ Branch on `code`, never on `error` (§3a) — several distinct causes share
 * one sentence on purpose. The server's sentence is shown as-is for the cases
 * where it is authored to be shown; the rest get copy chosen here so an
 * internal string can never reach a player.
 */
function report(panel: HTMLElement, error: unknown): void {
    if (!(error instanceof ApiError)) {
        AccountScreens.showError(panel, 'Something went wrong. Please try again.');
        return;
    }

    switch (error.code) {
        case 'rule':
        case 'invalid_credentials':
        case 'username_taken':
        case 'already_logged_in':
        case 'database_unavailable':
            AccountScreens.showError(panel, error.message);
            return;
        case 'already_registered':
            AccountScreens.showError(panel, 'This account already has a username.');
            return;
        case 'busy':
            AccountScreens.showError(panel, 'Aura is busy right now. Please try again in a moment.');
            return;
        case 'network':
            AccountScreens.showError(panel, error.message);
            return;
        default:
            AccountScreens.showError(panel, 'Something went wrong. Please try again.', error.ref);
    }
}
