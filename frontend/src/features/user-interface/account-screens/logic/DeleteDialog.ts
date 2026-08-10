import {AccountsApi, ApiError, Character} from '../../../accounts/logic/AccountsApi';
import {Countdown, startConfirmCountdown} from '../../../common/logic/ConfirmCountdown';
import * as AccountScreens from './AccountScreens';

/**
 * The delete confirmation (plan-accounts-frontend.md §7).
 *
 * Net-new UI: no modal or confirm pattern existed anywhere in the frontend
 * before this. It reuses the show/hide `.hidden`-class idiom the
 * settings/credits/changelog panels already use rather than inventing one.
 */

// ⚑ The countdown moved to common/logic/ConfirmCountdown when the ascension
// ceremony needed the same treatment (plan-ascension.md D21). Its comments —
// hardcoded on purpose, and friction against a misclick rather than a security
// control — travelled with it.

let target: Character | null = null;
let onDeleted: (staleViewMessage?: string) => void = () => undefined;
let countdown: Countdown | null = null;
let isWired = false;

function dialog(): HTMLElement {
    return AccountScreens.element('deleteDialog');
}

function wire(): void {
    if (isWired) {
        return;
    }
    isWired = true;

    AccountScreens.element('deleteCancelButton')
        .addEventListener('pointerdown', (event) => {
            event.preventDefault();
            close();
        });

    AccountScreens.element('deleteConfirmButton')
        .addEventListener('pointerdown', (event) => {
            event.preventDefault();
            void confirm();
        });
}

/**
 * @param onSuccess re-read the list. Called with a message when the refusal
 *   said the caller's view of that character was already out of date — see
 *   CharacterSelect.refreshWithMessage.
 */
export function open(character: Character, onSuccess: (staleViewMessage?: string) => void): void {
    AccountScreens.whenReady(() => {
        wire();
        target = character;
        onDeleted = onSuccess;

        const root = dialog();
        AccountScreens.clearError(root);
        (root.querySelector('.deleteDialogBody') as HTMLElement).textContent =
            `${character.name}, level ${character.level}, will be gone for good.`;

        startCountdown();
        root.classList.remove('hidden');
    });
}

export function close(): void {
    stopCountdown();
    target = null;
    dialog().classList.add('hidden');
}

function startCountdown(): void {
    stopCountdown();
    countdown = startConfirmCountdown(AccountScreens.element('deleteConfirmButton'), 'Delete');
}

function stopCountdown(): void {
    countdown?.stop();
    countdown = null;
}

async function confirm(): Promise<void> {
    const button = AccountScreens.element('deleteConfirmButton');
    if (button.classList.contains('disabled') || !target) {
        return;
    }

    const root = dialog();
    AccountScreens.clearError(root);
    button.classList.add('disabled');

    try {
        await AccountsApi.deleteCharacter(target.id);
        close();
        onDeleted();
    } catch (error) {
        // ⚑ Two refusals mean the CARD BEHIND THIS DIALOG IS STALE, not that
        // anything went wrong: the character was already deleted in another tab
        // (the server answers "no such character of yours" the same way it
        // answers "not yours" — ids are guessable), or it has since entered the
        // world. Keeping the dialog open on an error the player cannot act on
        // leaves them staring at a card that should not be there; closing and
        // re-reading resolves it either way, and in the already-deleted case
        // that IS the outcome they asked for.
        if (error instanceof ApiError
            && (error.code === 'bad_request' || error.code === 'character_playing')) {
            close();
            onDeleted(error.code === 'bad_request'
                ? 'That character is already gone.'
                : error.message);
            return;
        }
        const message = error instanceof ApiError
            ? error.message
            : 'Something went wrong. Please try again.';
        AccountScreens.showError(root, message, error instanceof ApiError ? error.ref : undefined);
        button.classList.remove('disabled');
    }
}
