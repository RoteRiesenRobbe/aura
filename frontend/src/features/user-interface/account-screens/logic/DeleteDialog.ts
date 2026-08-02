import {AccountsApi, ApiError, Character} from '../../../accounts/logic/AccountsApi';
import * as AccountScreens from './AccountScreens';

/**
 * The delete confirmation (plan-accounts-frontend.md §7).
 *
 * Net-new UI: no modal or confirm pattern existed anywhere in the frontend
 * before this. It reuses the show/hide `.hidden`-class idiom the
 * settings/credits/changelog panels already use rather than inventing one.
 */

/**
 * ⚑ Hardcoded, not configurable (§10b ruling 4). Earlier drafts made this
 * `game.player.characterDeleteConfirmCooldownSeconds`; that knob was never
 * built and does not need to exist.
 *
 * ⚑ This is UI friction against a MISCLICK, not a security control — a direct
 * POST to the delete endpoint bypasses it entirely. It must never later be
 * mistaken for rate limiting or abuse protection.
 */
const CONFIRM_COOLDOWN_MS = 5000;

let target: Character | null = null;
let onDeleted: (staleViewMessage?: string) => void = () => undefined;
let countdownTimer: number | null = null;
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

/**
 * ⚑ The countdown restarts on every open, deliberately. It is framed as "make
 * sure you read this", not as a rate limit, so there is no reason to carry
 * partial progress across a close/reopen.
 */
function startCountdown(): void {
    stopCountdown();

    const button = AccountScreens.element('deleteConfirmButton');
    let remaining = Math.ceil(CONFIRM_COOLDOWN_MS / 1000);

    const paint = () => {
        button.textContent = remaining > 0 ? `Delete (${remaining})` : 'Delete';
        button.classList.toggle('disabled', remaining > 0);
    };
    paint();

    countdownTimer = window.setInterval(() => {
        remaining--;
        paint();
        if (remaining <= 0) {
            stopCountdown();
        }
    }, 1000);
}

function stopCountdown(): void {
    if (countdownTimer !== null) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
    }
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
