import '../assets/endScreen.less';
import * as Preloading from '../../../core/logic/Preloading';
import * as Console from '../../../internal-tools/console/logic/Console';
import {preventInputPropagation} from '../../../common/logic/Utils';
import {EndScreenShownEvent, GameJoinEvent} from '../../../core/logic/Events';
import {RespawnMessage} from '../../../backend/logic/messages/outgoing/RespawnMessage';

// The death overlay (atmosphere & recovery chunk 4): "You Died" + a Respawn
// button. No name re-entry — the server keeps the name reserved while dead —
// and the Berryhunter "you survived N days" obituary + rating are retired.

let rootElement;

function onDomReady() {
    rootElement = document.getElementById('endScreen');

    document.getElementById('endForm').addEventListener('submit', (event) => {
        event.preventDefault();
        new RespawnMessage().send();
        GameJoinEvent.trigger('end');
    });

    preventInputPropagation(rootElement);

    rootElement.getElementsByClassName('playerForm').item(0)
        .addEventListener('animationend', function () {
            EndScreenShownEvent.trigger();
        });
}

Preloading.renderPartial(require('../assets/endScreen.html'), onDomReady);

export function show() {
    Console.hide();

    rootElement.classList.add('showing');
}

export function hide() {
    rootElement.classList.remove('showing');
}
