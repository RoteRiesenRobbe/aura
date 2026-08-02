import {
    AccountsApi, ApiError, Character, CharacterList, SessionState,
} from '../../../accounts/logic/AccountsApi';
import * as AccountScreens from './AccountScreens';
import * as DeleteDialog from './DeleteDialog';

/**
 * Character-select (plan-accounts-frontend.md §5.3, §10b ruling 7).
 *
 * Slot CARDS, not a list: each card is a `slot_index`, and a sacrifice
 * successor inherits its predecessor's slot, so a slot is a continuous
 * bloodline. Cards are rendered in slot order, never creation order — a
 * player's slots must not reshuffle under them.
 */

let onPlay: (character: Character) => void = () => undefined;
let onCreate: (characterCount: number) => void = () => undefined;
let onLoggedOut: () => void = () => undefined;
let onLoginRequested: () => void = () => undefined;
let currentState: SessionState | null = null;
/** The account's live world session, from the server; null for none. */
let playingCharacterId: number | null = null;
/** Whether the "logging out ends that world session" warning has been seen. */
let logoutConfirmed = false;

export function setup(handlers: {
    onPlay: (character: Character) => void,
    onCreate: (characterCount: number) => void,
    onLoggedOut: () => void,
    onLoginRequested: () => void,
}): void {
    onPlay = handlers.onPlay;
    onCreate = handlers.onCreate;
    onLoggedOut = handlers.onLoggedOut;
    onLoginRequested = handlers.onLoginRequested;

    AccountScreens.whenReady(() => {
        AccountScreens.element('logoutButton')
            .addEventListener('pointerdown', (event) => {
                event.preventDefault();
                void logout();
            });
        AccountScreens.element('selectLoginButton')
            .addEventListener('pointerdown', (event) => {
                event.preventDefault();
                onLoginRequested();
            });
    });
}

/**
 * Render the screen from a list the caller already fetched.
 *
 * @param autoSelectFirst play the sole character immediately. ⚑ Scoped to "a
 *   creation just happened and it was the first", NEVER to "there is exactly
 *   one character" (§5.3). The unscoped reading looks equivalent and is a trap:
 *   a returning player whose only character is their last one could then never
 *   reach this screen — and this is where Delete and Logout live.
 */
export function show(list: CharacterList, state: SessionState, autoSelectFirst = false): void {
    currentState = state;
    playingCharacterId = state.playingCharacterId || null;
    logoutConfirmed = false;

    const panel = AccountScreens.element('characterSelect');
    AccountScreens.clearError(panel);
    render(list);

    // ⚑ Say it out loud rather than letting the player discover it by pressing
    // things. Reaching this screen while the account is in the world takes no
    // login — the session cookie is browser-wide — and every action here then
    // behaves differently from how it reads.
    const warning = panel.querySelector('.playingWarning') as HTMLElement;
    warning.classList.toggle('hidden', playingCharacterId === null);
    if (playingCharacterId !== null) {
        warning.textContent = 'This account is in the world in another window. '
            + 'Logging out will end that session.';
    }
    AccountScreens.element('logoutButton').textContent = 'Log out';

    // Logout for registered accounts, Log in for guests — never both, and never
    // neither. A guest reaching this screen has characters they could lose, so
    // the login it offers routes through §6's warning.
    AccountScreens.element('logoutButton').classList.toggle('hidden', !state.registered);
    AccountScreens.element('selectLoginPrompt').classList.toggle('hidden', state.registered);
    AccountScreens.showPanel('characterSelect');

    if (autoSelectFirst && list.characters.length === 1) {
        onPlay(list.characters[0]);
    }
}

export function refresh(): Promise<void> {
    // ⚑ Both, in parallel: a re-read exists to correct a stale view, and "who is
    // in the world" goes stale exactly as readily as "which characters exist".
    return Promise.all([AccountsApi.listCharacters(), AccountsApi.session()])
        .then(([list, state]) => {
            show(list, state);
        });
}

/**
 * Re-read the list from the server, then say why.
 *
 * ⚑ THIS IS THE ANSWER TO EVERY STALE-VIEW CASE, and it is why none of them
 * needed a lock. The list is a snapshot: another tab can delete a character,
 * enter the world, or leave it, and this one keeps rendering what it fetched.
 * Every such refusal means "your snapshot is old" — so re-fetching on one is
 * self-correcting, including for cases nobody has thought of, because the
 * server's rows are the only authority. Forbidding a second reader would not
 * even have helped: two tabs can press Delete in the same tick and one still
 * loses the race.
 *
 * ⚑ The message goes on AFTER the refresh, never before — `show()` clears the
 * error slot, so setting it first would paint it and then wipe it.
 */
export function refreshWithMessage(message: string, ref?: string): Promise<void> {
    const panel = AccountScreens.element('characterSelect');
    return refresh()
        .catch(() => undefined) // a failed re-read still owes the player the message
        .then(() => {
            AccountScreens.showError(panel, message, ref);
        });
}

function render(list: CharacterList): void {
    const container = AccountScreens.element('characterSelect')
        .querySelector('.slotCards') as HTMLElement;
    container.innerHTML = '';

    const bySlot = new Map<number, Character>();
    list.characters.forEach((character) => bySlot.set(character.slotIndex, character));

    const atCap = list.characters.length >= list.maxAliveCharacters;
    let createOffered = false;

    for (let slot = 0; slot < list.maxAliveCharacters; slot++) {
        const character = bySlot.get(slot);
        if (character) {
            container.appendChild(characterCard(character));
            continue;
        }
        // The create affordance goes in the FIRST empty slot only; later empty
        // slots stay inert, so the row keeps its shape without offering the
        // same action three times.
        if (!createOffered && !atCap) {
            container.appendChild(createCard(list.characters.length));
            createOffered = true;
        } else {
            container.appendChild(emptyCard());
        }
    }
}

function characterCard(character: Character): HTMLElement {
    const card = document.createElement('div');
    card.className = 'slotCard';
    card.dataset.characterId = String(character.id);

    // ⚑ `avatar` is wired but the art is not: plan-avatar-system.md owns it, so
    // every character renders the one default portrait for now (§4).
    const portrait = document.createElement('div');
    portrait.className = 'characterPortrait default';
    card.appendChild(portrait);

    const name = document.createElement('div');
    name.className = 'slotCharacterName';
    name.textContent = character.name;
    card.appendChild(name);

    const level = document.createElement('div');
    level.className = 'slotCharacterLevel';
    level.textContent = `Level ${character.level}`;
    card.appendChild(level);

    // ⚑ The character in the world gets a LABEL, not controls. Both of the
    // controls below would be refused by the server for it — `/select` because
    // the account already holds a live session, delete because the row would go
    // out from under it — and offering an action whose only outcome is a
    // refusal is worse than showing the state that causes it.
    if (character.id === playingCharacterId) {
        const inWorld = document.createElement('div');
        inWorld.className = 'slotInWorld';
        inWorld.textContent = 'In world';
        card.appendChild(inWorld);
        card.classList.add('inWorld');
        return card;
    }

    const play = document.createElement('a');
    play.className = 'button';
    play.href = '#';
    play.textContent = 'Play';
    play.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        onPlay(character);
    });
    card.appendChild(play);

    const remove = document.createElement('a');
    remove.className = 'slotDelete';
    remove.href = '#';
    remove.textContent = 'Delete';
    remove.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        DeleteDialog.open(character, (message) => {
            void (message ? refreshWithMessage(message) : refresh());
        });
    });
    card.appendChild(remove);

    return card;
}

function createCard(characterCount: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'slotCard empty';

    const plus = document.createElement('div');
    plus.className = 'slotPlus';
    plus.textContent = '+';
    card.appendChild(plus);

    const label = document.createElement('div');
    label.className = 'slotCreateLabel';
    label.textContent = 'Create character';
    card.appendChild(label);

    card.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        onCreate(characterCount);
    });

    return card;
}

function emptyCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'slotCard locked';
    return card;
}

/**
 * ⚑ Logout is offered to REGISTERED accounts only (§5.3). For an anonymous
 * player there is no JWT to clear, and the only thing "logout" could mean is
 * discarding the local secret — abandoning the account permanently with no
 * recovery path. That is not a thing to put behind a button labelled "Logout".
 */
async function logout(): Promise<void> {
    const panel = AccountScreens.element('characterSelect');
    AccountScreens.clearError(panel);

    // ⚑ Logging out ENDS THE WORLD SESSION (§3), which from a second tab means
    // dropping the window the player is actually playing in — it freezes on
    // "Connection lost" with no idea why. The warning is already on screen; this
    // makes them press through it, and relabels the button so the second press
    // says what it does.
    if (playingCharacterId !== null && !logoutConfirmed) {
        logoutConfirmed = true;
        AccountScreens.element('logoutButton').textContent = 'Log out and leave the world';
        return;
    }

    AccountScreens.setFormBusy(panel, true);
    try {
        await AccountsApi.logout();
    } catch (error) {
        if (!(error instanceof ApiError) || (error.code !== 'no_identity' && error.code !== 'session_expired')) {
            const message = error instanceof ApiError
                ? error.message
                : 'Something went wrong. Please try again.';
            AccountScreens.showError(panel, message, error instanceof ApiError ? error.ref : undefined);
            return;
        }
    } finally {
        AccountScreens.setFormBusy(panel, false);
    }
    onLoggedOut();
}

/** The session behind the screen on display — who the player is, per the server. */
export function currentSession(): SessionState | null {
    return currentState;
}
