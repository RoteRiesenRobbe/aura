import '../assets/playerCount.less';
import {catalogUrl} from '../../../backend/logic/Urls';
import {t} from '../../../localization/logic/Locale';

/**
 * The "players online" readout, on the loading screen and under every account
 * screen panel.
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

type Readout = {element: HTMLElement, value: HTMLElement};

const readouts: Readout[] = [];
/** The last count the server gave, or null while unknown or unavailable. */
let lastCount: number = null;
let timer: number = null;
let warned = false;

/**
 * Append a readout to `container` and start polling if nothing is yet. A
 * readout starts hidden; the first successful GET /players reveals it, so a
 * server without the endpoint shows nothing rather than a placeholder.
 */
export function mount(container: HTMLElement) {
    const element = document.createElement('div');
    element.className = 'playerCount hidden';
    element.title = t('start.player-count.title');

    const label = document.createElement('span');
    label.textContent = t('start.player-count.label');

    const value = document.createElement('span');

    element.append(label, personIcon(), value);
    container.appendChild(element);

    const readout = {element, value};
    readouts.push(readout);
    show(readout);

    if (timer === null) {
        refresh();
        timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    }
}

/**
 * Called when the player enters the world — nobody is looking at the number
 * anymore, so stop asking for it.
 */
export function stop() {
    if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
    }
}

function show(readout: Readout) {
    readout.element.classList.toggle('hidden', lastCount === null);
    if (lastCount !== null) {
        readout.value.textContent = String(lastCount);
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
            lastCount = payload.players;
            readouts.forEach(show);
        })
        .catch(error => {
            // An old server without the endpoint, or one that just went away:
            // show nothing rather than a stale or wrong number. Warn once —
            // this retries every 10 s and would otherwise flood the console.
            lastCount = null;
            readouts.forEach(show);
            if (!warned) {
                warned = true;
                console.warn('Player count unavailable', error);
            }
        });
}

function personIcon(): SVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '7');
    circle.setAttribute('r', '4');
    svg.append(path, circle);
    return svg;
}
