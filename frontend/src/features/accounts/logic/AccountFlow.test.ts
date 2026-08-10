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
import {Session} from './Session';

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

/**
 * ⛑ THE END OF AN ASCENSION, and the hole C2b's browser harness found in C2a.
 *
 * The server closes the socket with no message when a character is spent, so
 * this is where the client learns of it (plan-ascension.md P13). Landing on
 * character-select was always right — and always insufficient: the CLIENT IS
 * BUILT TO BOOT ONCE and has no teardown path, so an in-client route left the
 * player on a correct-looking screen behind a dead WebSocket. The very next
 * Play minted a ticket, sent its JoinMessage into a closed socket, and did
 * nothing at all: no world, no error, no banner.
 *
 * ⚑ It was invisible to every earlier check because they all stopped at "we
 * landed on character select". Only pressing Play afterwards — creating the
 * heir, which is the ascension loop's literal next step — reaches it.
 */
describe('the end of a world session', () => {
    let reload: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        reload = vi.fn();
        // jsdom refuses a real navigation, and the assertion is that one is
        // ASKED FOR rather than that it happens.
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {...window.location, reload},
        });
        sessionStorage.clear();
    });

    const listWithout = (id: number) => jsonResponse(200, {
        characters: [{id, slotIndex: 0, name: 'Heir', avatar: 'default', faction: 'aligned', level: 1}],
        maxAliveCharacters: 3,
        slots: [],
    });

    it('reloads onto character-select when the played character is gone', async () => {
        Session.playingCharacterId = 4711;
        fetchMock.mockResolvedValueOnce(listWithout(9));   // 4711 is not in it

        const ascended = await AccountFlow.onWorldSessionEnded();

        expect(ascended).toBe(true);
        expect(reload).toHaveBeenCalled();
        // ⚑ Cleared BEFORE the reload, or the reload resumes the character the
        // ceremony just spent.
        expect(Session.reconnectToken).toBeNull();
        expect(Session.playingCharacterId).toBeNull();
    });

    it('leaves an ordinary drop alone — that character still exists', async () => {
        Session.playingCharacterId = 4711;
        fetchMock.mockResolvedValueOnce(listWithout(4711));

        const ascended = await AccountFlow.onWorldSessionEnded();

        expect(ascended).toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });
});
