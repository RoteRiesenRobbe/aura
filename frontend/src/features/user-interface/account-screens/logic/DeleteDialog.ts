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
let onDeleted: () => void = () => undefined;
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

export function open(character: Character, onSuccess: () => void): void {
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
        const message = error instanceof ApiError
            ? error.message
            : 'Something went wrong. Please try again.';
        AccountScreens.showError(root, message, error instanceof ApiError ? error.ref : undefined);
        button.classList.remove('disabled');
    }
}
