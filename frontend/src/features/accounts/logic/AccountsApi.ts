/**
 * The client for the eight account endpoints (plan-accounts-frontend.md §3,
 * §3a — the wire contract chunk 1c wrote down and this chunk codes against).
 *
 * Three rules hold for every call here, and each is load-bearing:
 *
 *  1. `credentials: 'include'`, always. The session JWT is an httpOnly cookie,
 *     so it only rides if the request asks for it — and because these calls are
 *     cross-origin in dev (webpack :2001 → aurad :2000), omitting it silently
 *     produces an unauthenticated request rather than an error.
 *  2. `X-Aura-Anonymous-Secret` whenever one is stored. ⚑ When both it and the
 *     cookie are present the SERVER prefers the JWT (§3a) — the client does not
 *     try to be clever about which to send.
 *  3. Refusals are `{error, code, ref?}` and callers **branch on `code`, never
 *     on `error`**. Several distinct causes deliberately share one sentence
 *     (implementation.md §5b), so matching on text would conflate them.
 */

import {apiUrl} from '../../backend/logic/Urls';
import {Identity} from './Identity';

/** Every refusal code the server can return (§3a). */
export type ApiErrorCode =
    | 'rule'
    | 'name_taken'
    | 'username_taken'
    | 'slots_full'
    | 'invalid_credentials'
    | 'already_logged_in'
    | 'already_registered'
    | 'character_playing'
    | 'no_identity'
    | 'session_expired'
    | 'forbidden_origin'
    | 'bad_request'
    | 'busy'
    | 'database_unavailable'
    | 'internal'
    // Not a server code: the request never got a reply at all.
    | 'network';

export class ApiError extends Error {
    readonly code: ApiErrorCode;
    readonly status: number;
    /**
     * The correlation id of the server log line describing the real cause.
     * Present only when the server logged one; quotable in a bug report.
     */
    readonly ref?: string;

    constructor(code: ApiErrorCode, message: string, status: number, ref?: string) {
        super(message);
        // ⚑ WITHOUT THIS LINE, `error instanceof ApiError` IS ALWAYS FALSE in the
        // shipped bundle, and every server message degrades to "Something went
        // wrong" — the player is told nothing while the server said exactly what
        // was wrong.
        //
        // tsconfig targets es5, and the __extends helper TypeScript emits cannot
        // subclass a built-in: `Error.call(this)` returns a fresh object, so the
        // instance's prototype is Error's, not ApiError's. Restoring it by hand
        // is the standard fix.
        //
        // ⚑ NO UNIT TEST CAN CATCH THIS. Vitest compiles with esbuild targeting
        // modern JS, where subclassing works natively — AccountsApi.test.ts
        // asserts `toBeInstanceOf(ApiError)` and passed green the whole time this
        // was broken in production. It was found by driving a real browser.
        Object.setPrototypeOf(this, ApiError.prototype);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
        this.ref = ref;
    }
}

export interface Character {
    id: number;
    slotIndex: number;
    name: string;
    avatar: string;
    faction: string;
    level: number;
    experience: number;
    createdAt: string;
}

export interface CharacterList {
    characters: Character[];
    maxAliveCharacters: number;
    /**
     * ⚑ Answers §6's "is this anonymous account worth warning about" on the
     * SERVER. Inferring it from the character list would be right today and
     * wrong the day sacrifice ships, when an account whose only character was
     * sacrificed still holds bloodline unlocks.
     */
    hasProgress: boolean;
    /** Gates Logout (§5.3) and the registration nag (§5.4). */
    registered: boolean;
    /** Present only when registered — the settings panel's "Signed in as …". */
    username?: string;
}

export interface CreatedCharacter {
    character: Character;
    /** Present ONLY when this request minted a new account. See Identity.ts. */
    anonymousSecret?: string;
}

export interface Session {
    username: string;
    /** The client schedules its silent refresh at roughly half of this. */
    expiresInSeconds: number;
}

export interface PlayTicket {
    characterId: number;
    /** ⚑ Opaque. Present it on Join; never parse anything out of it (§10 ②). */
    ticket: string;
    ticketTtlSeconds: number;
}

/**
 * ⚑ `busy` (503) is not a failed request — the bcrypt gate was momentarily
 * full, and retrying is the correct response (§10b ruling 9). One retry, then
 * report; a loop would turn a transient condition into a hang.
 */
const BUSY_RETRY_DELAY_MS = 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, isRetry = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    const secret = Identity.anonymousSecret;
    if (secret) {
        headers['X-Aura-Anonymous-Secret'] = secret;
    }

    let response: Response;
    try {
        response = await fetch(apiUrl(path), {
            method,
            credentials: 'include',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (cause) {
        // No status at all: DNS, a refused connection, or a CORS refusal — the
        // browser does not tell us which, on purpose.
        throw new ApiError('network', 'Aura could not be reached. Please try again in a moment.', 0);
    }

    if (response.ok) {
        // 204 has no body; every other success here does.
        if (response.status === 204) {
            return undefined as T;
        }
        return await response.json() as T;
    }

    let code: ApiErrorCode = 'internal';
    let message = 'Something went wrong. Please try again.';
    let ref: string | undefined;
    try {
        const refusal = await response.json();
        if (refusal && typeof refusal.code === 'string') {
            code = refusal.code as ApiErrorCode;
        }
        if (refusal && typeof refusal.error === 'string') {
            message = refusal.error;
        }
        if (refusal && typeof refusal.ref === 'string') {
            ref = refusal.ref;
        }
    } catch {
        // A refusal with no JSON body is a bug, not a case to model — fall
        // through to the generic message rather than inventing a code.
    }

    if (code === 'busy' && !isRetry) {
        await delay(BUSY_RETRY_DELAY_MS);
        return request<T>(method, path, body, true);
    }

    throw new ApiError(code, message, response.status, ref);
}

export const AccountsApi = {
    /**
     * Create a character, minting an account behind it when no identity is
     * presented — the anonymous-first path, and the most common write in the
     * product (§5.1).
     *
     * ⚑ Stores the returned secret IMMEDIATELY when one comes back. It is
     * readable exactly once.
     */
    async createCharacter(name: string): Promise<CreatedCharacter> {
        const created = await request<CreatedCharacter>('POST', 'characters', {name});
        if (created.anonymousSecret) {
            Identity.anonymousSecret = created.anonymousSecret;
        }
        return created;
    },

    listCharacters(): Promise<CharacterList> {
        return request<CharacterList>('GET', 'characters');
    },

    deleteCharacter(id: number): Promise<void> {
        return request<void>('POST', `characters/${id}/delete`);
    },

    /**
     * Prove ownership and mint a play ticket.
     *
     * ⚑ Chunk 2 calls this and then joins by name on the existing path, because
     * `Join` carries no ticket field until chunk 3 (§10b ruling 1). The call is
     * not ceremony: it is where ownership is checked and where
     * `already_logged_in` is reported to the player.
     */
    selectCharacter(id: number): Promise<PlayTicket> {
        return request<PlayTicket>('POST', `characters/${id}/select`);
    },

    /** Sets credentials on the CURRENT (anonymous) account — never creates one. */
    register(username: string, password: string): Promise<Session> {
        return request<Session>('POST', 'auth/register', {username, password});
    },

    /**
     * Switch to an existing account.
     *
     * ⚑ `discardAnonymous` is §6's confirmed discard, and defaults to false on
     * purpose: switching accounts must never destroy the one you came from by
     * accident. Pass true only after the player has confirmed a warning naming
     * what is lost.
     */
    async login(username: string, password: string, discardAnonymous = false): Promise<Session> {
        const session = await request<Session>('POST', 'auth/login', {username, password, discardAnonymous});
        // A registered player is not supposed to carry a local anonymous secret
        // at all (§5.3); leaving one would be a stale claim on an old account.
        Identity.forgetAnonymous();
        return session;
    },

    logout(): Promise<void> {
        return request<void>('POST', 'auth/logout');
    },

    /**
     * Renew the session cookie mid-play (§7b).
     *
     * ⚑ Refusal is meaningful: it means logged out elsewhere, erased, or the
     * token generation was bumped. Treating a refusal as retryable is what turns
     * "silent refresh" into "immortal session".
     */
    refresh(): Promise<Session> {
        return request<Session>('POST', 'session/refresh');
    },
};
