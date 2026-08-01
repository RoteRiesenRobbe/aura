/**
 * The anonymous account secret (plan-accounts-frontend.md §2, §3a).
 *
 * One of the three tokens, and the only one this module owns:
 *
 *   reconnectToken   sessionStorage   a live in-memory session   (Session.ts)
 *   anonymousSecret  localStorage     an accounts row            (here)
 *   auth JWT         cookie           an accounts row, via creds (server-set,
 *                                     httpOnly — script cannot read it, which
 *                                     is the point)
 *
 * ⚑ The server hands this out exactly ONCE, in the response to the
 * `POST /api/characters` call that minted the account, and stores only its
 * SHA-256. There is no way to ask for it again: a client that drops it has
 * permanently lost the account and everything on it.
 *
 * ⚑ It is deliberately NOT a cookie. It lives in localStorage, so the client
 * reads it and attaches it as `X-Aura-Anonymous-Secret`; moving it into a
 * cookie would put it back within reach of script for no gain, while the JWT
 * stays httpOnly precisely to stay out of reach.
 */

const ANONYMOUS_SECRET_KEY = 'anonymousSecret';

export class Identity {
    static get anonymousSecret(): string | null {
        return localStorage.getItem(ANONYMOUS_SECRET_KEY);
    }

    static set anonymousSecret(secret: string | null) {
        if (secret) {
            localStorage.setItem(ANONYMOUS_SECRET_KEY, secret);
        } else {
            localStorage.removeItem(ANONYMOUS_SECRET_KEY);
        }
    }

    /**
     * Forget the local anonymous account.
     *
     * ⚑ Called after §6's confirmed discard and after logging in to a different
     * account — at which point the stored secret resolves to nothing anyway.
     * Leaving it behind is harmless but untidy, and an untidy leftover is
     * exactly what the JWT-wins rule in §3a exists to defend against.
     */
    static forgetAnonymous(): void {
        Identity.anonymousSecret = null;
    }
}
