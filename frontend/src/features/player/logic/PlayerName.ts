import * as NameGenerator from './NameGenerator';
import {Account} from "../../accounts/logic/Account";
import {Session} from "../../accounts/logic/Session";
import {IBackend} from "../../backend/logic/IBackend";
import {JoinMessage} from "../../backend/logic/messages/outgoing/JoinMessage";
import {BackendSetupEvent, FirstGameStateHandledEvent, GameJoinEvent, screen} from "../../core/logic/Events";

let Backend: IBackend = null;
BackendSetupEvent.subscribe((backend: IBackend) => {
    Backend = backend;
});

/**
 * Reconnect auto-rejoin (plan-reconnect-token.md): a stored session token
 * means this tab had a character — rejoin without the start-screen form as
 * soon as the game is ready to accept a Join. A stale token (server restart /
 * stash expired) degrades server-side to a fresh join under the same name.
 * Deliberately NO GameJoinEvent: it re-enters fullscreen, which needs a user
 * gesture an auto-rejoin doesn't have.
 */
export function willAutoRejoin(): boolean {
    return Session.reconnectToken !== null;
}

FirstGameStateHandledEvent.subscribe(() => {
    if (!willAutoRejoin()) {
        return;
    }
    const name = (Account.playerName || NameGenerator.generate()).substr(0, MAX_LENGTH);
    new JoinMessage(name, Session.reconnectToken).send();
});

const MAX_LENGTH = 20;

function get() {
    const playerName = {
        name: Account.playerName,
        suggestion: NameGenerator.generate(),
        fromStorage: true,
    };
    if (playerName.name === null) {
        playerName.fromStorage = false;
    }

    return playerName;
}

function set(name) {
    Account.playerName = name;
}

function remove() {
    Account.playerName = null;
}

export function prepareForm(formElement, inputElement, screen: screen) {
    inputElement.setAttribute('maxlength', MAX_LENGTH);
    formElement.addEventListener('submit', (event) => {
        onSubmit(event, inputElement, screen);
    });
}

export function fillInput(inputElement) {
    let playerName = get();
    inputElement.setAttribute('placeholder', playerName.suggestion);
    if (playerName.fromStorage) {
        inputElement.value = playerName.name;
    }

    inputElement.focus();
}

function onSubmit(event, inputElement, screen: screen) {
    event.preventDefault();

    let name: string = inputElement.value;
    const blacklist = ".,-_;:'!@#$%^&*()|<>{[]}+~";
    const trimmedName = name.trim();
    const isOnlyBlacklistedChars = trimmedName.length > 0 && [...trimmedName].every(char => blacklist.includes(char));

    if (!name || trimmedName.length === 0 || isOnlyBlacklistedChars) {
        name = inputElement.getAttribute('placeholder');
        remove();
    } else {
        // Only save the name if its not generated
        set(name);
    }
    name = name.substr(0, MAX_LENGTH);


    new JoinMessage(name, Session.reconnectToken).send();
    GameJoinEvent.trigger(screen);
}
