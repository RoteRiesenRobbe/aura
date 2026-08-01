import * as NameGenerator from '../../../player/logic/NameGenerator';
import {AccountsApi, ApiError, Character} from '../../../accounts/logic/AccountsApi';
import * as AccountScreens from './AccountScreens';

/**
 * Character creation (plan-accounts-frontend.md §4b) — the first thing a new
 * player ever touches.
 *
 * ONE panel, TWO mounts. Both are full screens and both route to
 * character-select on success; they differ only in what sits below the form.
 */

export type CreationMount = 'home' | 'select';

const MAX_LENGTH = 20;

/**
 * ⚑ How many times a REJECTED SUGGESTION is re-rolled (§4b).
 *
 * The generator draws from ~550 combinations and character names are now
 * globally unique, so a player who simply accepts the offered name will
 * increasingly be told it is taken — for a name the game itself proposed. That
 * is the game's fault, not the player's, so it silently tries another.
 *
 * ⚑ Bounded, and it only ever applies to a name the PLAYER DID NOT TYPE. A name
 * someone chose deliberately must come back as "that name is taken" — silently
 * substituting a different one would create a character they did not ask for.
 */
const SUGGESTION_REROLLS = 5;

let onCreated: (character: Character, wasFirstCharacter: boolean) => void = () => undefined;
let onCancel: () => void = () => undefined;
let onLoginRequested: () => void = () => undefined;
let knownCharacterCount = 0;

export function setup(handlers: {
    onCreated: (character: Character, wasFirstCharacter: boolean) => void,
    onCancel: () => void,
    onLoginRequested: () => void,
}): void {
    onCreated = handlers.onCreated;
    onCancel = handlers.onCancel;
    onLoginRequested = handlers.onLoginRequested;

    AccountScreens.whenReady(() => {
        const panel = AccountScreens.element('characterCreation');

        AccountScreens.element('characterCreationForm')
            .addEventListener('submit', (event) => {
                event.preventDefault();
                void submit();
            });

        // pointerdown, not click: MouseManager preventDefault()s mousedown on
        // documentElement, which suppresses the synthetic click entirely.
        AccountScreens.element('creationBackButton')
            .addEventListener('pointerdown', (event) => {
                event.preventDefault();
                onCancel();
            });

        AccountScreens.element('creationLoginButton')
            .addEventListener('pointerdown', (event) => {
                event.preventDefault();
                onLoginRequested();
            });

        AccountScreens.clearError(panel);
    });
}

/**
 * @param mount        which mount to render (§4b)
 * @param characterCount how many characters the account already has — decides
 *                       whether a successful creation is the account's first,
 *                       which is what the auto-select is scoped to (§5.3)
 */
export function show(mount: CreationMount, characterCount = 0): void {
    knownCharacterCount = characterCount;

    const panel = AccountScreens.element('characterCreation');
    AccountScreens.clearError(panel);
    AccountScreens.setFormBusy(panel, false);

    // The home mount is the entry point — there is nowhere to go back to, so it
    // offers Log in instead of Back.
    const isHome = mount === 'home';
    panel.querySelector('.creationHomeMount').classList.toggle('hidden', !isHome);
    AccountScreens.element('creationBackButton').classList.toggle('hidden', isHome);

    const input = nameInput();
    input.value = '';
    // ⚑ The suggestion is a PLACEHOLDER, never a prefilled value. Prefilling the
    // last-used name (what the old start screen did) guarantees a rejected
    // submit under global uniqueness — see §4c.
    input.setAttribute('placeholder', NameGenerator.generate());

    AccountScreens.showPanel('characterCreation');
    input.focus();
}

function nameInput(): HTMLInputElement {
    return AccountScreens.element('characterCreation')
        .querySelector('.characterNameInput') as HTMLInputElement;
}

async function submit(): Promise<void> {
    const panel = AccountScreens.element('characterCreation');
    const input = nameInput();

    const typed = input.value.trim();
    // An empty field means "I'll take the one you offered".
    const usedSuggestion = typed.length === 0;
    let name = (usedSuggestion ? input.getAttribute('placeholder') : typed).substr(0, MAX_LENGTH);

    AccountScreens.clearError(panel);
    AccountScreens.setFormBusy(panel, true);

    try {
        for (let attempt = 0; ; attempt++) {
            try {
                const created = await AccountsApi.createCharacter(name);
                onCreated(created.character, knownCharacterCount === 0);
                return;
            } catch (error) {
                const taken = error instanceof ApiError && error.code === 'name_taken';
                if (taken && usedSuggestion && attempt < SUGGESTION_REROLLS) {
                    name = NameGenerator.generate().substr(0, MAX_LENGTH);
                    input.setAttribute('placeholder', name);
                    continue;
                }
                throw error;
            }
        }
    } catch (error) {
        if (error instanceof ApiError) {
            // ⚑ `rule` carries the specific rule that failed and is safe to show
            // verbatim — the server will only ever put an auth.RuleError there.
            AccountScreens.showError(panel, error.message, error.ref);
        } else {
            AccountScreens.showError(panel, 'Something went wrong. Please try again.');
        }
        // The field keeps its value on rejection (§4b) so a long name is not
        // retyped; only re-focus it.
        input.focus();
    } finally {
        AccountScreens.setFormBusy(panel, false);
    }
}
