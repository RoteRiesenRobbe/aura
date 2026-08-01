import fscreen from 'fscreen';
import {GameJoinEvent, screen, StartScreenDomReadyEvent} from "../../core/logic/Events";
import {DevicePrefs} from "../../common/logic/DevicePrefs";

let fullscreenToggle: HTMLInputElement;

StartScreenDomReadyEvent.subscribe(() => {
    fullscreenToggle = document.getElementById('fullscreenToggle') as HTMLInputElement;
    fullscreenToggle.checked = DevicePrefs.fullScreen;
});


GameJoinEvent.subscribe((screen: screen) => {
    if (screen === 'start') {
        let fullScreenToggled = fullscreenToggle.checked;
        DevicePrefs.fullScreen = fullScreenToggled;
        if (fullScreenToggled) {
            fscreen.requestFullscreen(document.body);
        }
    }
});
