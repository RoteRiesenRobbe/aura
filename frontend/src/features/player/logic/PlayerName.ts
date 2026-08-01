import {Session} from "../../accounts/logic/Session";

/**
 * Whether this tab has a live session to resume (plan-reconnect-token.md).
 *
 * ⚑ All this module used to do is gone, and deliberately:
 *
 *  - the start screen's name form (prepareForm / fillInput / onSubmit) went with
 *    step 8a chunk 2 — a character now comes from the account screens;
 *  - the auto-rejoin Join went with chunk 3 — a reconnect must present a PLAY
 *    TICKET as well as the token, so it lives in AccountFlow.reconnect() where
 *    the accounts API is.
 *
 * What is left is the one question the boot sequence asks: cold start, or
 * resume? The answer decides whether the account screens appear at all.
 */
export function willAutoRejoin(): boolean {
    return Session.reconnectToken !== null;
}
