import {Develop} from '../../internal-tools/develop/logic/_Develop';
import {ColorMatrixFilter, Container, Filter} from 'pixi.js';
import {flood, lumaGreyscale} from '../../pixi-js/logic/ColorMatrixFilterExtensions';
import {isUndefined} from '../../common/logic/Utils';
import {OnDayTimeStartEvent, OnNightTimeStartEvent} from '../../core/logic/Events';
import './DayCycleJuice';

/**
 * Master switch for the day/night PRESENTATION — the night colour tint and the
 * dawn/dusk boundary SFX. **DEACTIVATED 2026-07-22 (PO call), not deleted.**
 *
 * Why: players went invisible to themselves during the day→night transition —
 * the avatar (and its aura ring) stopped rendering while the name plate, level
 * and HP bar, which live on the night-EXEMPT `namePlates` overlay, kept
 * drawing. It reproduced only with an active aura, which is the one thing that
 * changes the `characters` layer's bounds, and therefore the size of the filter
 * render-texture PixiJS allocates for that layer's own tint pass. The tint is
 * applied per layer (~25 separate filter passes, see Game.ts), and during a
 * twilight fade `getNightFilterOpacity()` changes every tick, so all ~25
 * `container.filters` assignments were being re-made at 30 Hz. Never
 * reproduced headlessly (software GL), so the fault is GPU/driver dependent.
 *
 * The cycle is cosmetic — nothing gameplay-facing reads it — so it is switched
 * off rather than debugged for now. Flip this back to `true` to restore it; if
 * the bug returns with it on, the fix to try first is collapsing the ~25
 * per-layer passes into ONE filter on a single parent container.
 *
 * The clock itself keeps running (`getTime`/`isDay`/`isNight`/the dev-panel
 * readout) — only the presentation is suppressed.
 */
const DAY_CYCLE_PRESENTATION_ENABLED = false;

let ticksPerDay: number;
let dayTimeTicks: number;
const hoursPerDay = 24;
/**
 * First hour that is considered "day" in regard to visuals and temperature
 */
const sunriseHour: number = 6;
let sunsetHour: number;
/**
 * Time of color fade on dusk / dawn
 */
const twilightDuration: number = 1.5;

const sunriseStart = sunriseHour - (twilightDuration * 2 / 3);
const sunriseEnd = sunriseHour + (twilightDuration / 3);

let sunsetStart;
let sunsetEnd;

const NightVisuals = {
    SATURATION: 0.4,
    FLOOD_COLOR: {
        red: 107,
        green: 131,
        blue: 185,
    },
    // The flood MULTIPLIES each channel down toward the flood color, so dark
    // sprites (the blue/purple avatar) hit near-black long before bright ones
    // dim: at the former 0.9 a character at full night was effectively
    // invisible while unfiltered layers stayed bright. 0.6 keeps night
    // clearly night but leaves tinted sprites readable. [PLACEHOLDER — tune
    // in-game at full night]
    FLOOD_OPACITY: 0.6,
};

let timeOfDay: number;

let filteredContainers: Container[];
let colorMatrix: ColorMatrixFilter;
let filters: Filter[];
let knownIsDay;

/**
 * Initializes the day cycle setup with the specified parameters.
 * 
 * @param ticksPerDay - The number of ticks in a full day cycle.
 * @param dayTimeTicks - The number of ticks that constitute the daytime period.
 * @param pFilteredContainers - An array of PIXI.js Containers to be filtered by the day cycle effects.
 */
export function setup(totalTicksPerDay: number, ldayTimeTicks: number, pFilteredContainers: Container[]) {
    ticksPerDay = totalTicksPerDay;
    dayTimeTicks = ldayTimeTicks;
    sunsetHour = sunriseHour + dayTimeTicks / ticksPerDay * hoursPerDay;
    sunsetStart = sunsetHour - (twilightDuration / 3);
    sunsetEnd = sunsetHour + (twilightDuration * 2 / 3)

    filteredContainers = pFilteredContainers;

    colorMatrix = new ColorMatrixFilter();
    filters = [colorMatrix];
}

export function getTime() {
    return timeOfDay;
}

export function isDay() {
    return timeOfDay > sunriseHour && timeOfDay < sunsetHour;
}

export function isNight() {
    return !isDay();
}

export function getDays(serverTicks: number) {
    return serverTicks / ticksPerDay;
}

export function getFormattedTime() {
    let hours = Math.floor(timeOfDay);
    let minutes = Math.round(timeOfDay % 1 * 60);

    let result = '';
    if (hours < 10) {
        result += '0';
    }
    result += hours;
    result += ':';

    if (minutes < 10) {
        result += '0';
    }
    result += minutes;

    if (timeOfDay < sunriseStart) {
        result += ' night';
    } else if (timeOfDay < sunriseEnd) {
        result += ' dawn'; // Morgendämmerung
    } else if (timeOfDay < sunsetStart) {
        result += ' day';
    } else if (timeOfDay < sunsetEnd) {
        result += ' dusk'; // Abendämmerung
    } else {
        result += ' night';
    }

    return result;
}

let lastOpacity = 0;

function getNightFilterOpacity() {
    if (timeOfDay < sunriseStart) {
        return 1;
    } else if (timeOfDay < sunriseEnd) {
        return 1 - (timeOfDay - sunriseStart) / twilightDuration;
    } else if (timeOfDay < sunsetStart) {
        return 0;
    } else if (timeOfDay < sunsetEnd) {
        return (timeOfDay - sunsetStart) / twilightDuration;
    } else {
        return 1;
    }
}

export function setTimeByTick(tick: number) {
    timeOfDay = (tick % ticksPerDay / ticksPerDay * hoursPerDay + sunriseHour) % hoursPerDay;
    if (Develop.isActive()) {
        Develop.get().logTimeOfDay(getFormattedTime());
    }

    // Deactivated: leave every layer untinted and skip the boundary SFX. The
    // filters are never assigned in this mode, so there is nothing to clear.
    if (!DAY_CYCLE_PRESENTATION_ENABLED) {
        return;
    }

    if (knownIsDay != isDay()) {
        if (!isUndefined(knownIsDay)){
            if (isDay()){
                OnDayTimeStartEvent.trigger();
            }
            else {
                OnNightTimeStartEvent.trigger();
            }
        }

        knownIsDay = isDay();
    }

    let opacity = getNightFilterOpacity();
    if (opacity !== lastOpacity) {
        lastOpacity = opacity;

        if (opacity === 0) {
            filteredContainers.forEach((container: Container) => {
                container.filters = null;
            });
        } else {
            filteredContainers.forEach((container: Container) => {
                container.filters = filters;
            });
            /**
             * Opacity: Saturation
             * 0    : 1
             * 0.5  : 0.65
             * 1    : 0.3
             */
            flood(
                colorMatrix,
                NightVisuals.FLOOD_COLOR.red,
                NightVisuals.FLOOD_COLOR.green,
                NightVisuals.FLOOD_COLOR.blue,
                opacity * NightVisuals.FLOOD_OPACITY,
            );
            lumaGreyscale(
                colorMatrix,
                opacity * (1 - NightVisuals.SATURATION),
                true,
            );
        }
    }
}
