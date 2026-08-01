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

    it('is forgotten on login, so a stale secret cannot downgrade the session', async () => {
        Identity.anonymousSecret = 'stale';
        fetchMock.mockResolvedValue(jsonResponse(200, {username: 'barney', expiresInSeconds: 3600}));

        await AccountsApi.login('barney', 'quarry stone!');

        expect(Identity.anonymousSecret).toBeNull();
    });

    it('rides as a header when present', async () => {
        Identity.anonymousSecret = 'secret-value';
        fetchMock.mockResolvedValue(jsonResponse(200, {characters: [], maxAliveCharacters: 3, hasProgress: false, registered: false}));

        await AccountsApi.listCharacters();

        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers['X-Aura-Anonymous-Secret']).toBe('secret-value');
        // The session JWT is httpOnly, so it only rides if the request asks.
        expect(init.credentials).toBe('include');
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
