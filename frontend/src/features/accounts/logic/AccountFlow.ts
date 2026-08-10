import {
    AccountsApi, ApiError, ApiErrorCode, Character, CharacterList, PlayTicket, SessionState,
} from './AccountsApi';
import {Identity} from './Identity';
import {Session} from './Session';
import * as AccountScreens from '../../user-interface/account-screens/logic/AccountScreens';
import * as CharacterCreation from '../../user-interface/account-screens/logic/CharacterCreation';
import * as CharacterSelect from '../../user-interface/account-screens/logic/CharacterSelect';
import * as AuthForms from '../../user-interface/account-screens/logic/AuthForms';
import * as RegistrationNag from '../../user-interface/account-screens/logic/RegistrationNag';
import {JoinMessage} from '../../backend/logic/messages/outgoing/JoinMessage';
import {GameJoinEvent} from '../../core/logic/Events';

/**
 * The pre-game routing (plan-accounts-frontend.md §5).
 *
 * Every branch except the live-session reconnect ends at character-select. The
 * reconnect skip is an existing feature resuming an *in-memory* session, so it
 * never had a character to select — that path is handled by PlayerName.ts and
 * never reaches here.
 */

let started = false;
let hasAccount = false;
let registered = false;
let signedInAs: string | null = null;
/** The character whose Play was pressed, so an expired ticket can be re-minted. */
let playing: Character | null = null;
/** ⚑ The loop guard: at most ONE silent retry per join attempt (§7b). */
let retriedTicket = false;

/**
 * Where Register was opened from, so closing it goes back there.
 *
 * ⚑ 'world' and 'select' are NOT interchangeable, which was a real bug: opening
 * Register from the settings panel while at CHARACTER-SELECT used to hide every
 * account screen on close, leaving the player staring at the empty backdrop with
 * no way back. Registering never switches accounts (§5.2), so the correct
 * destination is always wherever they already were.
 */
type RegisterOrigin = 'none' | 'world' | 'select';
let registerOrigin: RegisterOrigin = 'none';

/**
 * The refusals that mean "the list you are looking at is out of date".
 *
 * ⚑ `bad_request` is what a 404 carries here: the server answers "no such
 * character of yours" exactly as it answers "not yours", because ids are
 * BIGSERIAL and guessable. On this screen, acting on a character the list just
 * handed us, it can only be the first.
 */
function isStaleView(code: ApiErrorCode): boolean {
    return code === 'bad_request' || code === 'already_logged_in' || code === 'character_playing';
}

export function setup(): void {
    CharacterCreation.setup({
        onCreated: (character, wasFirstCharacter) => {
            // The account either existed or was just minted by the server.
            hasAccount = true;
            // ⚑ BOTH mounts return to character-select. There is deliberately no
            // bootstrap path that bypasses this screen (§5.3): one code path,
            // one place a character is committed to, and — once chunk 3 lands —
            // one place a play ticket is minted.
            void toCharacterSelect(wasFirstCharacter);
        },
        onCancel: () => {
            void toCharacterSelect(false);
        },
        onLoginRequested: () => {
            showLogin();
        },
    });

    CharacterSelect.setup({
        onPlay: (character) => {
            void enterWorld(character);
        },
        onCreate: (characterCount) => {
            CharacterCreation.show('select', characterCount);
        },
        onLoggedOut: () => {
            // A registered player never carries an anonymous secret, so after
            // logout there is no local identity at all — which lands exactly on
            // the home screen's creation + Log in (§5.3).
            Identity.forgetAnonymous();
            Session.reconnectToken = null;
            hasAccount = false;
            CharacterCreation.show('home', 0);
        },
        onLoginRequested: () => {
            // ⚑ A guest at character-select HAS characters, so this always goes
            // through §6's warning — logging in abandons them.
            showLogin('select');
        },
    });

    AuthForms.setup({
        onAuthenticated: (username) => {
            signedInAs = username;
            registered = true;
            hasAccount = true;
            RegistrationNag.hide();
            // ⚑ Only registering-while-playing stays in the world. Everything
            // else lands on character-select — including a login from the home
            // screen, which must show the account you just signed into rather
            // than falling back through start() to the creation form.
            if (registerOrigin === 'world') {
                registerOrigin = 'none';
                AccountScreens.hide();
                return;
            }
            registerOrigin = 'none';
            void toCharacterSelect(false);
        },
        onCancel: () => {
            returnFromAuthPanel();
        },
    });

    RegistrationNag.setup({
        onRegisterRequested: () => {
            showRegisterFromSettings();
        },
    });
}

/**
 * Open the register panel from the settings panel or the HUD nag.
 *
 * ⚑ Remembers whether the player was in the WORLD or at CHARACTER-SELECT,
 * because closing has to put them back where they were.
 */
export function showRegisterFromSettings(): void {
    registerOrigin = AccountScreens.isPanelVisible('characterSelect') ? 'select' : 'world';
    AuthForms.showRegister();
}

/**
 * Close an auth panel and return to wherever it was opened from.
 *
 * ⚑ Registering does not switch accounts (§5.2) — it adds credentials to the one
 * already in play — so there is never anything to re-select afterwards, and the
 * destination is simply the previous screen.
 */
function returnFromAuthPanel(): void {
    const origin = registerOrigin;
    registerOrigin = 'none';
    switch (origin) {
        case 'world':
            AccountScreens.hide();
            return;
        case 'select':
            // Re-fetched rather than re-shown from cache: registering changes
            // `registered`, which gates Logout and the nag on that very screen.
            void toCharacterSelect(false);
            return;
        default:
            void start();
    }
}

export function isRegistered(): boolean {
    return registered;
}

export function username(): string | null {
    return signedInAs;
}

/**
 * Decide what the player sees on a cold load (§5.1).
 *
 * ⚑ Not called when a live session is reconnectable — that path resumes in
 * PlayerName.ts and skips every screen here.
 */
export async function start(): Promise<void> {
    started = true;

    // ⚑ ASK THE SERVER even with no local secret. Identity can also be the
    // session COOKIE, which script cannot see — so gating this call on
    // localStorage would send every returning REGISTERED player to the
    // character-creation form instead of their own characters.
    try {
        let state = await AccountsApi.session();
        if (!state.hasAccount && Identity.anonymousSecret) {
            // A returning guest: the session is gone but the secret that can
            // re-open it is not (backlog §46).
            //
            // ⚑ THE EXCHANGE MUST COME BEFORE ANY FORGETTING, and this is the
            // single most dangerous line in §46. Until the secret came off every
            // request, `!hasAccount` genuinely meant "the stored secret is dead
            // — had it resolved, the server would have said so", so forgetting
            // it here was safe. It is not any more: the server never saw the
            // secret, and forgetting it now would permanently destroy an
            // unregistered player's account on an ordinary cold boot.
            state = await exchangeOrForget(state);
        }
        adoptIdentity(state);
        if (!state.hasAccount) {
            CharacterCreation.show('home', 0);
            return;
        }
        CharacterSelect.show(await AccountsApi.listCharacters(), state);
    } catch (error) {
        // Only a real failure reaches here now, and it must not masquerade as
        // "you have no characters", which would invite creating a duplicate.
        CharacterCreation.show('home', 0);
        AccountScreens.showError(
            AccountScreens.element('characterCreation'),
            error instanceof ApiError ? error.message : 'Aura could not be reached. Please try again in a moment.',
            error instanceof ApiError ? error.ref : undefined);
    }
}

/**
 * Spend the stored anonymous secret, and re-read who we are.
 *
 * ⚑ ONLY `session_expired` MAY FORGET THE SECRET. That refusal is the server
 * saying the secret names no account, which is the one condition under which
 * dropping it loses nothing. Every other failure — the network, a 500, a
 * database outage — leaves it exactly where it is, because a guest's secret is
 * the only key to an unregistered account and there is no way to get it back.
 * Erring towards keeping a dead secret costs a wasted request on the next boot;
 * erring the other way costs someone their character.
 */
async function exchangeOrForget(current: SessionState): Promise<SessionState> {
    try {
        await AccountsApi.exchangeAnonymous();
        return await AccountsApi.session();
    } catch (error) {
        if (error instanceof ApiError && error.code === 'session_expired') {
            Identity.forgetAnonymous();
            return current;
        }
        throw error;
    }
}

export function hasStarted(): boolean {
    return started;
}

/**
 * Resume a live session after a page refresh (plan-reconnect-token.md, extended
 * by step 8a chunk 3).
 *
 * ⚑ A RECONNECT NOW NEEDS A PLAY TICKET. The socket carries no credential, so
 * chunk 3 made the server refuse a stashed character to anyone who cannot prove
 * they own it — which means presenting the reconnect token ALONE is no longer
 * enough, and a client that sends only the token gets its socket closed and
 * sits on the loading screen forever.
 *
 * ⚑ `/select` succeeds here precisely because the session is STASHED rather
 * than connected — that is the whole reason `Session.Stashed` exists. A
 * connected session would (correctly) be refused as a second login.
 *
 * Falls back to the ordinary cold path whenever anything is missing or refused,
 * so a stale tab lands on character-select rather than a dead screen.
 */
export async function reconnect(): Promise<void> {
    const characterId = Session.playingCharacterId;
    const token = Session.reconnectToken;
    if (!characterId || !token) {
        await start();
        return;
    }
    try {
        const ticket = await AccountsApi.selectCharacter(characterId);
        void resolveIdentityQuietly();
        new JoinMessage('', token, ticket.ticket).send();
        GameJoinEvent.trigger('start');
    } catch {
        // The character is gone, the account is playing elsewhere, or the stash
        // expired. None of those is resumable — show the player their options.
        Session.reconnectToken = null;
        Session.playingCharacterId = null;
        await start();
    }
}

/**
 * The world session ended. Report whether it ended because the CHARACTER is
 * gone, which today means exactly one thing: they ascended
 * (plan-ascension.md P13).
 *
 * ⭐ IT ASKS THE SERVER'S ROWS rather than waiting for a message, which is this
 * screen's own documented philosophy applied one screen earlier ("the server's
 * rows are the only authority", CharacterSelect). It costs no wire field, and
 * it stays correct through a server restart mid-ceremony, where a message would
 * simply never arrive.
 *
 * ⚑ A FAILED re-read reports false, so an ordinary network drop still gets the
 * "Connection lost" banner. Only a successful listing that no longer contains
 * this character routes to character-select.
 */
export async function onWorldSessionEnded(): Promise<boolean> {
    const characterId = Session.playingCharacterId;
    if (!characterId) {
        return false;
    }
    let list;
    try {
        list = await AccountsApi.listCharacters();
    } catch {
        return false; // the socket AND the API are gone: an ordinary drop
    }
    if (list.characters.some((c) => c.id === characterId)) {
        return false;
    }
    // ⚑ CLEAR `playing` TOO, not just the session ids. It is what the
    // join-refused retry resumes from, and left set it fires a
    // POST /characters/<id>/select at a character that no longer exists: a 404
    // in the console at the end of an otherwise perfect ceremony. The screen
    // was right either way, which is exactly why it needed a console listener
    // to find.
    playing = null;
    Session.reconnectToken = null;
    Session.playingCharacterId = null;
    await start();
    return true;
}

/** Take the server's answer to "who am I" as this session's identity. */
function adoptIdentity(state: SessionState): void {
    hasAccount = state.hasAccount;
    registered = state.registered;
    signedInAs = state.username || null;
}

/**
 * Learn who the player is WITHOUT touching the screens.
 *
 * ⚑ This exists for the RECONNECT path, and its absence was a real bug. A
 * reconnect resumes straight into the world from `sessionStorage` — deliberately
 * skipping every account screen, which is the whole point of that feature — so
 * `start()` never runs and nothing ever asks the server who is playing. The
 * result was a registered player who, after a refresh, saw "Create an account"
 * in settings and no username: fully logged in, and the client had simply never
 * been told.
 *
 * ⚑ It must NOT show a panel. The player is already in the world; the only job
 * here is to populate the identity the settings panel reads.
 */
export async function resolveIdentityQuietly(): Promise<void> {
    try {
        // ⚑ One call, and it asks the question it actually has: this used to
        // fetch the player's whole character list from inside the world and
        // throw the characters away, because "who am I" had nowhere else to live.
        adoptIdentity(await AccountsApi.session());
    } catch {
        // A reconnect that cannot resolve an account is still a valid session —
        // the reconnect token is its own credential. Leave the defaults alone
        // rather than signing the player out of a world they are standing in.
    }
}

/**
 * Whether the player has an account — anonymous or registered. False on a
 * cold load before the first character is created, and after logout clears
 * the identity. The settings panel uses this to decide whether the Account
 * section makes sense at all.
 */
export function accountExists(): boolean {
    return hasAccount;
}

async function toCharacterSelect(autoSelectFirst: boolean): Promise<void> {
    let list: CharacterList;
    let state: SessionState;
    try {
        // ⚑ In parallel, not in sequence. They answer two independent questions
        // ("what do I own", "who am I") and neither needs the other's answer, so
        // the split costs a connection rather than a round trip.
        [list, state] = await Promise.all([AccountsApi.listCharacters(), AccountsApi.session()]);
    } catch (error) {
        AccountScreens.showError(
            AccountScreens.element('characterCreation'),
            error instanceof ApiError ? error.message : 'Aura could not be reached. Please try again in a moment.');
        return;
    }
    // The server is the authority on whether this account has credentials —
    // it is what gates Logout and the nag, and a client-side guess would be
    // wrong for an account registered in another tab.
    adoptIdentity(state);
    CharacterSelect.show(list, state, autoSelectFirst);
}

function showLogin(origin: RegisterOrigin = 'none'): void {
    // Closing the login panel returns where it was opened from — the home
    // screen's creation form, or character-select for a guest.
    registerOrigin = origin;
    const state = CharacterSelect.currentSession();
    AuthForms.showLogin({
        hasSecret: Identity.anonymousSecret !== null,
        // ⚑ Server-answered (§3a). Inferring it from the character list would be
        // right today and wrong once sacrifice ships, when an account whose only
        // character was sacrificed still holds unlocks worth warning about.
        hasProgress: state ? state.hasProgress : false,
    });
}

export function showRegister(): void {
    AuthForms.showRegister();
}

/**
 * Play a character: prove ownership at `/select`, then present the ticket it
 * mints on the socket.
 *
 * ⚑ The ticket is the ONLY credential this join carries. It is opaque — passed
 * through untouched, never parsed (§10 invariant ②).
 */
async function enterWorld(character: Character): Promise<void> {
    const panel = AccountScreens.element('characterSelect');
    AccountScreens.clearError(panel);
    AccountScreens.setFormBusy(panel, true);

    let ticket: PlayTicket;
    try {
        ticket = await AccountsApi.selectCharacter(character.id);
    } catch (error) {
        AccountScreens.setFormBusy(panel, false);
        // ⚑ These three all mean the SCREEN IS STALE rather than that Play
        // failed: the character was deleted in another tab, or the account
        // entered the world in one. Re-reading the list is what makes the next
        // thing the player sees agree with the message — the card disappears, or
        // it stops offering Play and says "In world" instead. Without it they
        // are told no and left looking at the same button that just said no.
        if (error instanceof ApiError && isStaleView(error.code)) {
            void CharacterSelect.refreshWithMessage(error.message, error.ref);
            return;
        }
        AccountScreens.showError(
            panel,
            error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
            error instanceof ApiError ? error.ref : undefined);
        return;
    }

    AccountScreens.setFormBusy(panel, false);
    // Remember who is playing, so an expired ticket can be re-minted for the
    // same character without asking the player to choose again (§7b) — and so a
    // RECONNECT after a page refresh can mint one too (see reconnect()).
    playing = character;
    Session.playingCharacterId = character.id;
    new JoinMessage(character.name, Session.reconnectToken, ticket.ticket).send();
    GameJoinEvent.trigger('start');

    // ⚑ §5.4's "fresh login" is exactly this path — character-select → Play. A
    // reconnect resume never reaches here, which is why the rule needs no flag.
    RegistrationNag.showForFreshLogin(registered);
}

/**
 * The world refused our join — almost always an expired play ticket (§7b).
 *
 * The window between minting a ticket and using it is normally milliseconds. It
 * stretches when a laptop lid closes right after Play, when the network drops
 * between the HTTP call and the socket, when a background tab is throttled, or
 * when the SERVER RESTARTS — tickets live in memory, so every deploy forgets all
 * of them. Expiry firing here is the mechanism working correctly; the defect
 * would be what the player sees.
 *
 * ⚑ RETRY EXACTLY ONCE, NEVER LOOP. A genuinely broken state — a revoked
 * session, a deleted character, someone else already in the world — must
 * terminate rather than spin. The loop guard is the part worth having: the happy
 * path and the give-up path are both obvious, and an unbounded retry is the
 * failure that would only ever show up in production.
 *
 * ⚑ The retry re-runs `/select`'s checks, which is a feature. If the account
 * acquired a live session meanwhile, the second call answers "This account is
 * already logged in" — the correct message, instead of a confusing one about a
 * ticket the player never knew existed.
 */
export async function onJoinRefused(): Promise<void> {
    const character = playing;
    if (!character || retriedTicket) {
        // Second failure, or nothing to retry: bounce to character-select with a
        // plain message. ⚑ Never surface the word "ticket".
        playing = null;
        retriedTicket = false;
        await toCharacterSelect(false);
        AccountScreens.showError(
            AccountScreens.element('characterSelect'),
            'That took too long; please pick your character again.');
        return;
    }

    retriedTicket = true;
    try {
        const ticket = await AccountsApi.selectCharacter(character.id);
        new JoinMessage(character.name, Session.reconnectToken, ticket.ticket).send();
        GameJoinEvent.trigger('start');
    } catch (error) {
        playing = null;
        retriedTicket = false;
        await toCharacterSelect(false);
        AccountScreens.showError(
            AccountScreens.element('characterSelect'),
            error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
            error instanceof ApiError ? error.ref : undefined);
    }
}

/** Called on a successful Accept: the join stuck, so the retry budget resets. */
export function onJoinAccepted(): void {
    retriedTicket = false;
}

/**
 * Whether a join is awaiting its Accept.
 *
 * ⚑ This is how a REFUSED join is told apart from an ordinary mid-game drop.
 * The server closes the socket rather than sending a refusal message, so the
 * close event is identical in both cases and only the client knows which it was
 * expecting.
 */
export function isJoinInFlight(): boolean {
    return playing !== null;
}
