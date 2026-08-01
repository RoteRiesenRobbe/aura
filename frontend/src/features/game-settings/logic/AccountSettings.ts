import {Session} from '../../accounts/logic/Session';
import * as AccountFlow from '../../accounts/logic/AccountFlow';
import {BackendState} from '../../backend/logic/IBackend';
import {BackendStateChangedEvent} from '../../core/logic/Events';

/**
 * The settings panel's Account group (plan-accounts-frontend.md §4, §10b).
 *
 * ⚑ It offers Register (anonymous only) and Leave — never Log in. Login is
 * reachable solely from the home screen while logged out (ruling 3), because
 * §6's discard would otherwise be able to soft-delete the character currently
 * in the world.
 */

let isWired = false;

/**
 * Tracks whether the player is in the world (PLAYING or SPECTATING). Updated
 * via BackendStateChangedEvent so it is always current when the settings panel
 * opens — no reference to the Backend singleton needed.
 */
let currentBackendState: BackendState = BackendState.DISCONNECTED;

BackendStateChangedEvent.subscribe((msg) => {
    currentBackendState = msg.newState;
});

export function setup(panel: HTMLElement): void {
    if (isWired) {
        return;
    }
    isWired = true;

    panel.querySelector('#settingsRegisterButton')
        .addEventListener('pointerdown', (event) => {
            event.preventDefault();
            AccountFlow.showRegisterFromSettings();
        });

    panel.querySelector('#leaveToCharacterSelect')
        .addEventListener('pointerdown', (event) => {
            event.preventDefault();
            leave();
        });
}

/**
 * Refresh the group each time the panel opens, since registering mid-session
 * changes what belongs here.
 */
export function refresh(panel: HTMLElement): void {
    const hasAccount = AccountFlow.accountExists();
    const username = AccountFlow.username();
    const isIngame = currentBackendState === BackendState.PLAYING;
    const registered = (Boolean)(username && AccountFlow.isRegistered());

    // ⚑ Before an account exists — the player hasn't even created a character
    // yet — offering Register would fail ("something went wrong") because there
    // is no anonymous account to attach credentials to. The whole section —
    // heading included — hides rather than leaving a dangling title.
    const accountSection = panel.querySelector('#accountSection') as HTMLElement;
    accountSection.classList.toggle('hidden', !hasAccount);

    panel.querySelector('#accountAnonymous').classList.toggle('hidden', registered);
    panel.querySelector('#accountRegistered').classList.toggle('hidden', !registered);
    // ⚑ Register is for ANONYMOUS players only. Hide it when already registered.
    panel.querySelector('#settingsRegisterButton').classList.toggle('hidden', registered);
    panel.querySelector('#leaveToCharacterSelect').classList.toggle('hidden', !isIngame);

    if (username) {
        panel.querySelector('#accountUsername').textContent = username;
    }
}

/**
 * Leave the world and return to character-select (ruling 6).
 *
 * ⚑ Implemented as a page reload, deliberately. The client is built to boot
 * once and has no teardown path; a real in-client "leave world" would mean
 * dismantling the PixiJS scene and every system that holds a reference into
 * it — meaningful new work and a likely source of leaked state and lost GL
 * contexts. Clearing the reconnect token first is what stops the reload from
 * auto-rejoining the character we are trying to leave.
 *
 * ⚑ This exists because login is restricted to the logged-out state: without
 * it there would be no in-game route to ANY account action, and a player has
 * no way to guess that refreshing is the answer.
 */
function leave(): void {
    Session.reconnectToken = null;
    window.location.reload();
}
