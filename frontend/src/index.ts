import * as Preloading from './features/core/logic/Preloading';
import * as Events from './features/core/logic/Events';

// Import shims for ES5, ES6, ES7
import 'core-js';

// Import all modules that listen for Events to ensure the listeners are actually registered
import './features/audio/logic/Audio';
import './features/audio/logic/Music';
import './features/backend/logic/Backend';
import './features/internal-tools/develop/logic/DebugCircle';
import './features/internal-tools/develop/logic/_Develop';
import './features/game-objects/logic/Character';
import './features/game-objects/logic/Mobs';
import './features/game-objects/logic/Resources';
import './features/game-settings/logic/GameSettingsUI';
import './features/ground-textures/logic/GroundTexture';
import './features/ground-textures/logic/_GroundTexturesPanel';
import './features/items/logic/Items';
// Tutorial temporarily disabled.
// import './features/tutorial/logic/Tutorial';
import './features/user-interface/logic/UserInterface';
import './features/user-interface/changelog/logic/Changelog';
import './features/user-interface/end-screen/logic/EndScreen';
import './features/user-interface/start-screen/logic/StartScreen';

import './features/internal-tools/browser-console-integration/logic/BrowserConsole';
import './features/controls/logic/Controls';
import './features/full-screen/logic/FullScreen';
import './features/core/logic/Game';

Preloading.executePreload().then(function () {
    Events.ModulesLoadedEvent.trigger();
});
