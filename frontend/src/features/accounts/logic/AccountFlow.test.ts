import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

/**
 * The cold-boot decision for a returning ANONYMOUS player (backlog §46).
 *
 * ⚑ THIS FILE EXISTS FOR ONE ASSERTION: a guest's stored secret survives a boot
 * where the session has expired. Before §46 the secret rode every request, so
 * `hasAccount: false` genuinely proved it was dead — "had it resolved, the
 * server would have said so" — and forgetting it there was correct. Taking the
 * secret off ordinary requests makes that reasoning false, and the same line
 * then permanently destroys an unregistered account on an ordinary page load.
 * There is no recovery from it: the server keeps only a SHA-256.
 *
 * The screens are mocked because none of them is what is being tested; the
 * question is only which credential survives.
 */

vi.mock('../../user-interface/account-screens/logic/AccountScreens', () => ({
    showError: vi.fn(),
    element: vi.fn(() => document.createElement('div')),
}));
vi.mock('../../user-interface/account-screens/logic/CharacterCreation', () => ({
    show: vi.fn(),
    bind: vi.fn(),
}));
vi.mock('../../user-interface/account-screens/logic/CharacterSelect', () => ({
    show: vi.fn(),
    bind: vi.fn(),
}));
vi.mock('../../user-interface/account-screens/logic/AuthForms', () => ({
    bind: vi.fn(),
    show: vi.fn(),
}));
vi.mock('../../user-interface/account-screens/logic/RegistrationNag', () => ({
    update: vi.fn(),
    bind: vi.fn(),
}));
// ⚑ Not for isolation — for RESOLUTION. These reach the generated FlatBuffers
// bindings, whose `import * as flatbuffers` is satisfied by a webpack alias that
// vitest does not have. Nothing here is on the path under test.
vi.mock('../../backend/logic/messages/outgoing/JoinMessage', () => ({
    JoinMessage: class {},
}));
vi.mock('../../core/logic/Events', () => ({
    GameJoinEvent: {trigger: vi.fn(), subscribe: vi.fn()},
}));

import * as AccountFlow from './AccountFlow';
import * as CharacterSelect from '../../user-interface/account-screens/logic/CharacterSelect';
import {Identity} from './Identity';

const jsonResponse = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const nobody = {hasAccount: false, registered: false, hasProgress: false};
const aGuest = {hasAccount: true, registered: false, hasProgress: true};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('a cold boot with a stored anonymous secret', () => {
    it('exchanges it for a session instead of throwing it away', async () => {
        Identity.anonymousSecret = 'the-only-key';
        fetchMock
            // The cookie is gone, so the server says "nobody" — it never saw the
            // secret, which is exactly why this is not proof the secret is dead.
            .mockResolvedValueOnce(jsonResponse(200, nobody))
            .mockResolvedValueOnce(jsonResponse(200, {username: '', expiresInSeconds: 3600}))
            .mockResolvedValueOnce(jsonResponse(200, aGuest))
            .mockResolvedValueOnce(jsonResponse(200, {characters: [], maxAliveCharacters: 3}));

        await AccountFlow.start();

        expect(String(fetchMock.mock.calls[1][0])).toContain('session/anonymous');
        expect(Identity.anonymousSecret).toBe('the-only-key');
        expect(CharacterSelect.show).toHaveBeenCalled();
    });

    it('KEEPS the secret when the exchange fails for any reason but a dead secret', async () => {
        // ⚑ The asymmetry is deliberate and is the whole safety argument. Keeping
        // a genuinely dead secret costs one wasted request on the next boot;
        // dropping a live one costs someone their character. So only the server
        // saying "this names no account" may clear it — never a network blip, a
        // 500, or a database outage.
        Identity.anonymousSecret = 'the-only-key';
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, nobody))
            .mockResolvedValueOnce(jsonResponse(503, {error: 'Database down.', code: 'database_unavailable'}));

        await AccountFlow.start();

        expect(Identity.anonymousSecret).toBe('the-only-key');
    });

    it('forgets it only when the server says it names no account', async () => {
        Identity.anonymousSecret = 'genuinely-dead';
        fetchMock
            .mockResolvedValueOnce(jsonResponse(200, nobody))
            .mockResolvedValueOnce(jsonResponse(401, {error: 'Signed out.', code: 'session_expired'}));

        await AccountFlow.start();

        expect(Identity.anonymousSecret).toBeNull();
    });

    it('does not reach for the exchange when there is no secret at all', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, nobody));

        await AccountFlow.start();

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
