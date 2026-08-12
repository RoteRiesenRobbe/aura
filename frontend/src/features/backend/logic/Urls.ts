import {BasicConfig as Constants} from "../../../client-data/BasicConfig";
import {QueryParameters} from '../../internal-tools/logic/QueryParameters';

/**
 *
 * @param protocol http or ws, the 's' for secure layer will be attached according to the current protocol
 * @param path
 */
function getUrl(protocol: string, path: string) {
    let security = '';
    if (window.location.protocol === 'https:') {
        security = 's';
    }

    const port = window.location.port ? ':' + window.location.port : '';

    return protocol + security + '://' + window.location.hostname + port + '/' + path;
}

let _gameServer: string;

if (QueryParameters.get().has(Constants.MODE_PARAMETERS.NO_DOCKER)) {
    _gameServer = 'ws://localhost:2000/game';
} else {
    _gameServer = getUrl('ws', 'game');
}
QueryParameters.get().tryGetString(Constants.VALUE_PARAMETERS.WEBSOCKET_URL, (wsUrl) => {
    _gameServer = wsUrl;
});

export const gameServer = _gameServer;

/**
 * URL of a content-catalog endpoint on the aurad HTTP sidecar, derived from
 * the game socket: ws://host:2000/game → http://host:2000/<path> (wss → https).
 *
 * Shared by every catalog client (Skills.ts, Mobs.ts) so the derivation —
 * including the protocol swap that a deployed wss:// host depends on — has a
 * single definition.
 */
export function catalogUrl(path: string): string {
    const url = new URL(gameServer);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = `/${path}`;
    url.search = '';
    return url.toString();
}

/**
 * URL of an account endpoint (`/api/*`), derived from the game socket exactly
 * as catalogUrl does — one definition, so the protocol swap a deployed wss://
 * host depends on cannot drift between the two.
 *
 * ⚑ This derivation is *why* the account calls are cross-origin: webpack serves
 * the client on :2001 while aurad answers on :2000, which is what makes the
 * echoed-origin CORS rule mandatory (implementation.md §7b).
 *
 * ⚑ It also means the host spelling must match the page's. `localhost` and
 * `127.0.0.1` are different SITES, so a session cookie set under one is not
 * sent to the other — measured, not assumed (plan-accounts-frontend.md §10b).
 * Deriving from `gameServer` rather than from window.location is what keeps the
 * two spellings from being mixed by accident.
 */
export function apiUrl(path: string): string {
    return catalogUrl(`api/${path}`);
}
