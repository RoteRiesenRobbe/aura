/**
 * The countdown on an irreversible confirmation button.
 *
 * Extracted from `DeleteDialog.startCountdown` when the ascension ceremony
 * needed the same treatment (plan-ascension.md D21, C2a step 6): the PO asked
 * for "the same version we have in the character deletion selection, with the
 * 5 seconds countdown".
 *
 * ⚑ What is shared is the LOGIC, not the dialog. `DeleteDialog` lives in the
 * account screens, an HTML overlay that only exists outside the world; the
 * ascension confirm is drawn over the running game. There is no element both
 * can use, so this is where the duplication actually was.
 *
 * ⚑ FRICTION AGAINST A MISCLICK, NOT A SECURITY CONTROL — `DeleteDialog`'s own
 * comment, and it travels with the code. A direct request to the server bypasses
 * it entirely, and neither caller may ever mistake it for rate limiting.
 */

/** How long an irreversible confirmation is held. Hardcoded (§10b ruling 4). */
export const CONFIRM_COOLDOWN_MS = 5000;

export interface Countdown {
    /** Stop the timer. Idempotent, and safe to call on an already-finished one. */
    stop(): void;
}

/**
 * Count `button` down from CONFIRM_COOLDOWN_MS, relabelling it each second and
 * keeping it `.disabled` until it reaches zero.
 *
 * ⚑ The countdown RESTARTS on every open, deliberately: it is framed as "make
 * sure you read this", not as a rate limit, so there is no reason to carry
 * partial progress across a close and reopen.
 *
 * @param label the button's text without the counter, e.g. "Delete" or "Ascend".
 */
export function startConfirmCountdown(button: HTMLElement, label: string): Countdown {
    let remaining = Math.ceil(CONFIRM_COOLDOWN_MS / 1000);
    let timer: number | null = null;

    const paint = () => {
        button.textContent = remaining > 0 ? `${label} (${remaining})` : label;
        button.classList.toggle('disabled', remaining > 0);
    };
    const stop = () => {
        if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
        }
    };

    paint();
    timer = window.setInterval(() => {
        remaining--;
        paint();
        if (remaining <= 0) {
            stop();
        }
    }, 1000);

    return {stop};
}
