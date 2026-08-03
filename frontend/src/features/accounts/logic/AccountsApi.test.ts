import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AccountsApi, ApiError} from './AccountsApi';
import {Identity} from './Identity';

/**
 * Pure-logic units for the account API client (plan-accounts-frontend.md §11).
 *
 * The three things worth pinning are the ones a screen cannot check for itself:
 * that a refusal arrives as a typed `code` rather than a sentence, that a `busy`
 * reply is retried EXACTLY once, and that the anonymous secret is stored the one
 * time it is ever readable.
 */

const jsonResponse = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('refusals', () => {
    it('surfaces the server code, not the sentence', async () => {
        fetchMock.mockResolvedValue(jsonResponse(409, {error: 'That character name is taken.', code: 'name_taken'}));

        const error = await AccountsApi.createCharacter('Barney').catch((e) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error.code).toBe('name_taken');
        expect(error.status).toBe(409);
        // ⚑ Branch on `code`, never on `error` (§3a): several distinct causes
        // share one sentence on purpose, so matching text would conflate them.
        expect(error.message).toBe('That character name is taken.');
    });

    it('carries the correlation id when the server logged one', async () => {
        fetchMock.mockResolvedValue(jsonResponse(500, {error: 'Something went wrong.', code: 'internal', ref: 'abc123'}));

        const error = await AccountsApi.listCharacters().catch((e) => e);

        expect(error.ref).toBe('abc123');
    });

    it('reports a network failure as a code rather than throwing raw', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

        const error = await AccountsApi.listCharacters().catch((e) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error.code).toBe('network');
        expect(error.status).toBe(0);
    });
});

describe('the busy retry', () => {
    it('retries exactly once, then succeeds', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(503, {error: 'Busy.', code: 'busy'}))
            .mockResolvedValueOnce(jsonResponse(200, {username: 'barney', expiresInSeconds: 3600}));

        const pending = AccountsApi.refresh();
        await vi.advanceTimersByTimeAsync(1100);

        await expect(pending).resolves.toEqual({username: 'barney', expiresInSeconds: 3600});
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('gives up after one retry rather than looping', async () => {
        // ⚑ The loop guard is the part worth pinning. The happy path and the
        // give-up path are both obvious; an unbounded retry against a gate that
        // stays full is the failure that would only show up in production.
        fetchMock.mockResolvedValue(jsonResponse(503, {error: 'Busy.', code: 'busy'}));

        const pending = AccountsApi.refresh().catch((e) => e);
        await vi.advanceTimersByTimeAsync(5000);

        expect((await pending).code).toBe('busy');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe('the anonymous secret', () => {
    it('is stored the one time it is readable', async () => {
        fetchMock.mockResolvedValue(jsonResponse(201, {
            character: {id: 1, slotIndex: 0, name: 'Barney', avatar: 'default', faction: 'aligned', level: 1, experience: 0, createdAt: ''},
            anonymousSecret: 'the-only-copy',
        }));

        await AccountsApi.createCharacter('Barney');

        // ⚑ The server keeps only its SHA-256, so a client that fails to store
        // this has permanently lost the account.
        expect(Identity.anonymousSecret).toBe('the-only-copy');
    });

    it('is left alone when the request did not mint an account', async () => {
        Identity.anonymousSecret = 'existing';
        fetchMock.mockResolvedValue(jsonResponse(201, {
            character: {id: 2, slotIndex: 1, name: 'Mera', avatar: 'default', faction: 'aligned', level: 1, experience: 0, createdAt: ''},
        }));

        await AccountsApi.createCharacter('Mera');

        expect(Identity.anonymousSecret).toBe('existing');
    });

    it('SURVIVES a login that did not discard the account', async () => {
        // ⚑ This assertion is INVERTED from what it said before backlog §46, and
        // the old one was losing people's progress. `discardAnonymous` defaults
        // to false, which means the server deliberately KEEPS the anonymous
        // account — and the secret is the only key to it. Forgetting the key
        // while the account survives orphans it permanently.
        Identity.anonymousSecret = 'the-only-key';
        fetchMock.mockResolvedValue(jsonResponse(200, {username: 'barney', expiresInSeconds: 3600}));

        await AccountsApi.login('barney', 'quarry stone!');

        expect(Identity.anonymousSecret).toBe('the-only-key');
    });

    it('is forgotten only when the discard was confirmed', async () => {
        Identity.anonymousSecret = 'abandoned';
        fetchMock.mockResolvedValue(jsonResponse(200, {username: 'barney', expiresInSeconds: 3600}));

        await AccountsApi.login('barney', 'quarry stone!', true);

        // The account it names is gone, so the secret resolves to nothing.
        expect(Identity.anonymousSecret).toBeNull();
    });

    it('NEVER rides an ordinary request', async () => {
        // ⚑ Also inverted by §46, and this is the assertion that keeps the
        // second authenticator from coming back. The secret used to ride every
        // call, which is what forced resolveCaller to arbitrate between two
        // identities — the rule the two-tab logout bug lived in.
        Identity.anonymousSecret = 'secret-value';
        fetchMock.mockResolvedValue(jsonResponse(200, {characters: [], maxAliveCharacters: 3}));

        await AccountsApi.listCharacters();

        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers['X-Aura-Anonymous-Secret']).toBeUndefined();
        // The session JWT is httpOnly, so it only rides if the request asks.
        expect(init.credentials).toBe('include');
    });

    it('is presented in the body of the exchange, and only there', async () => {
        Identity.anonymousSecret = 'secret-value';
        fetchMock.mockResolvedValue(jsonResponse(200, {username: '', expiresInSeconds: 3600}));

        await AccountsApi.exchangeAnonymous();

        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toContain('session/anonymous');
        expect(JSON.parse(init.body).anonymousSecret).toBe('secret-value');
        expect(init.headers['X-Aura-Anonymous-Secret']).toBeUndefined();
    });
});

describe('the silent re-exchange', () => {
    it('re-opens an expired anonymous session and retries the original request', async () => {
        Identity.anonymousSecret = 'still-good';
        fetchMock
            .mockResolvedValueOnce(jsonResponse(401, {error: 'Signed out.', code: 'session_expired'}))
            .mockResolvedValueOnce(jsonResponse(200, {username: '', expiresInSeconds: 3600}))
            .mockResolvedValueOnce(jsonResponse(200, {characters: [], maxAliveCharacters: 3}));

        await expect(AccountsApi.listCharacters()).resolves.toEqual({characters: [], maxAliveCharacters: 3});

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(String(fetchMock.mock.calls[1][0])).toContain('session/anonymous');
        // ⚑ The secret is untouched by a SUCCESSFUL re-exchange. It is spent
        // repeatedly over an account's life, not consumed once.
        expect(Identity.anonymousSecret).toBe('still-good');
    });

    it('does not re-exchange when there is no secret to spend', async () => {
        fetchMock.mockResolvedValue(jsonResponse(401, {error: 'Signed out.', code: 'session_expired'}));

        const error = await AccountsApi.listCharacters().catch((e) => e);

        expect(error.code).toBe('session_expired');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reports rather than looping when the secret is dead too', async () => {
        // ⚑ The loop guard, and it needs two of them: the exchange must not
        // trigger an exchange, and one failed re-auth must not arm another.
        Identity.anonymousSecret = 'dead';
        fetchMock.mockResolvedValue(jsonResponse(401, {error: 'Signed out.', code: 'session_expired'}));

        const error = await AccountsApi.listCharacters().catch((e) => e);

        expect(error.code).toBe('session_expired');
        expect(fetchMock).toHaveBeenCalledTimes(2); // the request, then the refused exchange
        // ⚑ NOT forgotten here. Only the boot path decides that, where it can
        // tell the player — a mid-session blip must never silently drop the key
        // to an unregistered account.
        expect(Identity.anonymousSecret).toBe('dead');
    });
});

describe('login discard', () => {
    it('never discards the anonymous account unless asked', async () => {
        fetchMock.mockResolvedValue(jsonResponse(200, {username: 'barney', expiresInSeconds: 3600}));

        await AccountsApi.login('barney', 'quarry stone!');

        // ⚑ Default false on purpose: switching accounts must not destroy the
        // one you came from by accident (§6).
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).discardAnonymous).toBe(false);
    });

    it('passes the confirmed discard through', async () => {
        fetchMock.mockResolvedValue(jsonResponse(200, {username: 'barney', expiresInSeconds: 3600}));

        await AccountsApi.login('barney', 'quarry stone!', true);

        expect(JSON.parse(fetchMock.mock.calls[0][1].body).discardAnonymous).toBe(true);
    });
});
