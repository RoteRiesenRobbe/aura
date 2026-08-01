/**
 * Session-scoped state: survives a reload in the same tab, dies with the tab
 * (sessionStorage — deliberately NOT the localStorage-backed Account). Holds
 * the reconnect token the server issues on Accept; presenting it in Join
 * after a reload restores the character (plan-reconnect-token.md).
 */

const RECONNECT_TOKEN_KEY = 'reconnectToken';
const PLAYING_CHARACTER_KEY = 'playingCharacterId';

export class Session {
    static get reconnectToken(): string | null {
        return sessionStorage.getItem(RECONNECT_TOKEN_KEY);
    }

    static set reconnectToken(token: string | null) {
        if (token) {
            sessionStorage.setItem(RECONNECT_TOKEN_KEY, token);
        } else {
            sessionStorage.removeItem(RECONNECT_TOKEN_KEY);
        }
    }

    /**
     * Which character this tab is playing.
     *
     * ⚑ Needed because a RECONNECT now has to prove identity, not just possess a
     * token (step 8a chunk 3). The socket carries no credential, so resuming
     * means minting a fresh play ticket — and `/select` needs a character id.
     * The reconnect token identifies the character server-side but the client
     * cannot read it, so the id is remembered here alongside it.
     */
    static get playingCharacterId(): number | null {
        const raw = sessionStorage.getItem(PLAYING_CHARACTER_KEY);
        return raw === null ? null : Number(raw);
    }

    static set playingCharacterId(id: number | null) {
        if (id) {
            sessionStorage.setItem(PLAYING_CHARACTER_KEY, String(id));
        } else {
            sessionStorage.removeItem(PLAYING_CHARACTER_KEY);
        }
    }
}
