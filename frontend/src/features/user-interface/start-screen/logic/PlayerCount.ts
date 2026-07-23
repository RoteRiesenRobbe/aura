import {catalogUrl} from '../../../backend/logic/Urls';

/**
 * The "players online" readout under the Play button.
 *
 * Reads GET /players, the one live sidecar endpoint (the /skills and /mobs
 * catalogs are static after boot). The count is the server's own
 * ConnectionStateSystem player list, so there is nothing to keep in sync
 * client-side.
 *
 * The socket is already open while the start screen is up, but the client is
 * only a spectator then and its GameState carries in-view entities — never a
 * server-wide total. Hence the separate endpoint.
 */

const REFRESH_INTERVAL_MS = 10_000;

let element: HTMLElement = null;
let valueElement: HTMLElement = null;
let timer: number = null;
let warned = false;

export function setup(root: HTMLElement) {
    element = root.querySelector('#playerCount');
    valueElement = root.querySelector('#playerCountValue');
    if (timer !== null) {
        return;
    }
    refresh();
    timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
}

/**
 * Called when the start screen goes away — nobody is looking at the number
 * anymore, so stop asking for it.
 */
export function stop() {
    if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
    }
}

function refresh() {
    fetch(catalogUrl('players'))
        .then(response => {
            if (!response.ok) {
                throw new Error(`GET /players returned ${response.status}`);
            }
            return response.json();
        })
        .then((payload: { players: number }) => {
            valueElement.textContent = String(payload.players);
            element.classList.remove('hidden');
        })
        .catch(error => {
            // An old server without the endpoint, or one that just went away:
            // show nothing rather than a stale or wrong number. Warn once —
            // this retries every 10 s and would otherwise flood the console.
            element.classList.add('hidden');
            if (!warned) {
                warned = true;
                console.warn('Player count unavailable', error);
            }
        });
}
