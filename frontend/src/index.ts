// plan-localization.md C0a: resolve the locale and declare the page language first.
import {loadCatalog} from './features/localization/logic/Locale';

// Import shims for ES5, ES6, ES7
import 'core-js';

// C8: a locale other than English loads its UI catalog chunk before the game's
// modules run, because several of them render text at import time (the HUD,
// the settings, the account screens). English needs no load and starts
// synchronously, as before. App stays in this chunk: only its evaluation waits.
function start() {
    require('./App');
}

const catalog = loadCatalog();
if (catalog) {
    catalog.then(start);
} else {
    start();
}
