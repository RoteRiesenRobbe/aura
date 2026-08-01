import '../assets/startScreen.less';
import '../../assets/toggleSwitch.less';
import * as PlayerName from '../../../player/logic/PlayerName';
import {isDefined, preventInputPropagation, smoothHoverAnimation} from '../../../common/logic/Utils';
import * as DetectBrowser from 'detect-browser';
import * as Preloading from '../../../core/logic/Preloading';
import * as Credits from '../../credits/logic/Credits';
import {
    FirstGameStateHandledEvent,
    BackendConnectionFailureEvent,
    PreloadingProgressedEvent,
    PreloadingStartedEvent,
    StartScreenDomReadyEvent
} from "../../../core/logic/Events";
import * as SocialMedia from "../../social-media-links/logic/SocialMedia";
import * as PlayerCount from "./PlayerCount";
import * as AccountFlow from "../../../accounts/logic/AccountFlow";
import * as GameSettingsUI from '../../../game-settings/logic/GameSettingsUI';


let _progress = 0;
let loadingBar = null;

const htmlFile = require('../assets/startScreen.html');
let isDomReady = false;
let loadingStatus: HTMLElement;
// The loading panel. Kept as a handle because the unsupported-browser warning
// hides it and the account screens hide it again once they take over.
let startForm: HTMLElement;

let rootElement: HTMLElement;
let chromeWarning;

PreloadingStartedEvent.subscribe(() => {
    Preloading.renderPartial(htmlFile, onDomReady);
});

export function onDomReady() {
    rootElement = document.getElementById('startScreen');

    preventInputPropagation(rootElement);

    loadingBar = document.getElementById('loadingBar');
    loadingStatus = document.getElementById('loadingStatus');
    startForm = document.getElementById('startForm');

    isDomReady = true;

    AccountFlow.setup();

    // re-set progress to ensure the loading bar is synced.
    progress(_progress);

    chromeWarning = document.getElementById('chromeWarning');

    let browser = DetectBrowser.detect();
    const supportedBrowsers = ['chrome', 'firefox'];
    if (!supportedBrowsers.includes(browser.name)) {
        chromeWarning.classList.remove('hidden');
        startForm.classList.add('hidden');
        document.getElementById('continueAnywayButton').addEventListener('click', (event) => {
            event.preventDefault();
            chromeWarning.classList.add('hidden');
            startForm.classList.remove('hidden');
        });
    }

    SocialMedia.content.then((htmlContent) => {
        rootElement.querySelector('.socialMediaContainer').innerHTML = htmlContent;

        rootElement.querySelectorAll('.socialLink').forEach(element => {
            smoothHoverAnimation(element, {animationDuration: 0.3});
        });
    });

    smoothHoverAnimation(
        rootElement.querySelector('#betaStamp'),
        {animationDuration: 0.45});

    Credits.setup();

    PlayerCount.setup(rootElement);

    StartScreenDomReadyEvent.trigger(rootElement);
}

export function show() {
    rootElement.classList.remove('hidden');
}

export function hide() {
    rootElement.classList.add('hidden');
    PlayerCount.stop();
}

PreloadingProgressedEvent.subscribe(setProgress);

export function progress(value: number) {
    if (isDefined(value)) {
        setProgress(value);
    } else {
        return getProgress();
    }
}

function setProgress(value) {
    // Prevent the progress from going backwards
    if (value <= _progress) {
        return;
    }
    _progress = value;
    if (isDomReady) {
        loadingBar.style.width = (_progress * 100) + '%';
        if (_progress >= 1) {
            FirstGameStateHandledEvent.subscribe(() => {
                if (PlayerName.willAutoRejoin()) {
                    // Resume the live session: keep the loading look until the
                    // server's Accept hides the screen — no flash of the
                    // account screens.
                    //
                    // ⚑ reconnect() also mints the play ticket the resume now
                    // needs, and asks the server who is playing. Both matter:
                    // without the ticket the join is refused and the player is
                    // stranded here, and without the identity the settings
                    // panel offers "Create an account" to someone who already
                    // has one.
                    void AccountFlow.reconnect();
                    return;
                }
                rootElement.classList.remove('loading');
                rootElement.classList.add('finished');

                // ⚑ The start screen is BACKDROP ONLY now — splash, credits,
                // changelog, player count. A character comes from the account
                // screens, which own creation and selection, so the loading
                // panel goes away the moment they take over.
                startForm.classList.add('hidden');
                GameSettingsUI.hide();
                void AccountFlow.start();
            });
        }
    }
}

BackendConnectionFailureEvent.subscribe(() => {
    rootElement.classList.remove('loading');
    rootElement.classList.add('failure');
    if (loadingStatus) {
        loadingStatus.textContent = "Couldn't connect";
    }
});

function getProgress() {
    return progress;
}
