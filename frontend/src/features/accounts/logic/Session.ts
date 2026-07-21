/**
 * Session-scoped state: survives a reload in the same tab, dies with the tab
 * (sessionStorage — deliberately NOT the localStorage-backed Account). Holds
 * the reconnect token the server issues on Accept; presenting it in Join
 * after a reload restores the character (plan-reconnect-token.md).
 */

const RECONNECT_TOKEN_KEY = 'reconnectToken';

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
}
