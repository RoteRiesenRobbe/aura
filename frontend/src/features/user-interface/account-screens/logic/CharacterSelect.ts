import {AccountsApi, ApiError, Character, CharacterList} from '../../../accounts/logic/AccountsApi';
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
let current: CharacterList | null = null;

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
export function show(list: CharacterList, autoSelectFirst = false): void {
    current = list;

    const panel = AccountScreens.element('characterSelect');
    AccountScreens.clearError(panel);
    render(list);

    // Logout for registered accounts, Log in for guests — never both, and never
    // neither. A guest reaching this screen has characters they could lose, so
    // the login it offers routes through §6's warning.
    AccountScreens.element('logoutButton').classList.toggle('hidden', !list.registered);
    AccountScreens.element('selectLoginPrompt').classList.toggle('hidden', list.registered);
    AccountScreens.showPanel('characterSelect');

    if (autoSelectFirst && list.characters.length === 1) {
        onPlay(list.characters[0]);
    }
}

export function refresh(): Promise<void> {
    return AccountsApi.listCharacters().then((list) => {
        show(list);
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
        DeleteDialog.open(character, () => {
            void refresh();
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
    AccountScreens.setFormBusy(panel, true);
    try {
        await AccountsApi.logout();
        onLoggedOut();
    } catch (error) {
        const message = error instanceof ApiError
            ? error.message
            : 'Something went wrong. Please try again.';
        AccountScreens.showError(panel, message, error instanceof ApiError ? error.ref : undefined);
    } finally {
        AccountScreens.setFormBusy(panel, false);
    }
}

export function currentList(): CharacterList | null {
    return current;
}
