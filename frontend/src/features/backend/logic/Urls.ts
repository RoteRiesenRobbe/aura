import {BasicConfig as Constants} from "../../../client-data/BasicConfig";
import {QueryParameters} from '../../internal-tools/logic/QueryParameters';

function isLocalhost(hostname: string) {
    switch (hostname) {
        case 'localhost':
        case '127.0.0.1':
            return true;
    }

    return false;
}

function getHostname() {
    let hostname = window.location.hostname;
    if (isLocalhost(hostname)) {
        return 'local.berryhunter.io';
    }

    return hostname;
}

const developmentPort = '2015';

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

    let currentPort = window.location.port;
    let port = '';
    if (currentPort !== '' && currentPort !== '80') {
        port = ':' + developmentPort;
    }

    return protocol + security + '://' + getHostname() + port + '/' + path;
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
