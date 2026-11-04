/**
 * The bug report's facts, read at the press (plan-bug-report.md D4-D6).
 *
 * Everything that only the player's machine knows: browser, screen and DPR,
 * both renderers, the GPU string, a short fps window, the latency to the game
 * server, and where the character stands. Off the world (start screen) the
 * in-game lines stay absent and print `n/a`.
 */
import type {Renderer, WebGLRenderer} from 'pixi.js';
import {BackendStateChangedEvent, GameSetupEvent} from '../../core/logic/Events';
import type {IGame} from '../../core/logic/IGame';
import {GameSettings} from '../../game-settings/logic/GameSettings';
import * as Locale from '../../localization/logic/Locale';
import {isMobile} from '../../user-interface/logic/Mobile';
import {gameServer} from '../../backend/logic/Urls';
import {AccountsApi} from '../../accounts/logic/AccountsApi';
import * as Zoom from '../../camera/logic/Zoom';
import {DevicePrefs} from '../../common/logic/DevicePrefs';
import {snapRadarDiameter} from '../../map/logic/RadarZoom';
import {BUILD_DATE, GAME_VERSION} from './buildInfo';
import {consoleRing} from './ConsoleRing';
import {Diagnostics, formatFrameStats, formatLocalTime, formatUptime, frameStats, warpForm} from './ReportText';

let game: IGame = null;
GameSetupEvent.subscribe((g: IGame) => {
    game = g;
});

/** The connection's last state, and when it got there (a reconnect loop shows as a young state). */
let backendState = 'n/a';
let backendStateAt = 0;
BackendStateChangedEvent.subscribe((msg) => {
    backendState = msg.newState;
    backendStateAt = performance.now();
});

/** D5 [PLACEHOLDER]s: at least this long and this many frames, never longer than the cap. */
const FPS_MIN_MS = 2000;
const FPS_MIN_FRAMES = 30;
const FPS_CAP_MS = 5000;
/** D6 [PLACEHOLDER]. */
const RTT_TIMEOUT_MS = 2000;

/**
 * Frame deltas from requestAnimationFrame. Pixi's ticker runs on rAF, so in
 * the world this is the game's frame rate; unlike PrerenderEvent it also runs
 * on the start screen, where the game loop is paused.
 *
 * ⚑ The cap is wall clock (a timer), not a frame count: a backgrounded tab
 * runs rAF at ~1 fps or not at all (L8), and 30 frames would take forever.
 */
function measureFrames(): Promise<number[]> {
    return new Promise((resolve) => {
        const deltas: number[] = [];
        const start = performance.now();
        let last: number | null = null;
        let handle = 0;
        const finish = () => {
            cancelAnimationFrame(handle);
            clearTimeout(cap);
            resolve(deltas);
        };
        const cap = setTimeout(finish, FPS_CAP_MS);
        const frame = (now: number) => {
            if (last !== null) {
                deltas.push(now - last);
            }
            last = now;
            if (now - start >= FPS_MIN_MS && deltas.length >= FPS_MIN_FRAMES) {
                finish();
                return;
            }
            handle = requestAnimationFrame(frame);
        };
        handle = requestAnimationFrame(frame);
    });
}

/**
 * D6, amended 2026-11-04: PING is a token-gated cheat, so latency is one
 * `GET /api/session` round trip through the accounts client.
 */
async function measureRtt(): Promise<string> {
    const start = performance.now();
    const timeout = new Promise<string>(resolve => setTimeout(() => resolve('n/a (timeout)'), RTT_TIMEOUT_MS));
    const call = AccountsApi.session()
        .then(() => `${Math.round(performance.now() - start)} ms`)
        .catch(() => 'n/a (request failed)');
    return Promise.race([call, timeout]);
}

function rendererLine(renderer: Renderer | undefined): string | undefined {
    if (!renderer) {
        return undefined;
    }
    const canvas = renderer.canvas;
    const mpx = (canvas.width * canvas.height / 1e6).toFixed(1);
    const gl = (renderer as WebGLRenderer).gl;
    const msaa = gl ? ` · MSAA ${gl.getContextAttributes()?.antialias ? 'on' : 'off'}` : '';
    return `${renderer.name} · resolution ${renderer.resolution} · canvas ${canvas.width}×${canvas.height} (${mpx} Mpx)${msaa}`;
}

/** Firefox and Safari mask the unmasked string; whatever comes back is recorded. */
function gpuLine(renderer: Renderer | undefined): string | undefined {
    const gl = (renderer as WebGLRenderer | undefined)?.gl;
    if (!gl) {
        return undefined;
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${name} · max texture ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`;
}

function characterLine(): string | undefined {
    const player = game?.player;
    if (!player?.character) {
        return undefined;
    }
    const c = player.character;
    return `${c.name} · level ${player.level ?? 'n/a'} · zone ${game.activeZoneName() ?? 'n/a'} · ${warpForm(c.getX(), c.getY())}`;
}

/** The facts that need no waiting. */
function snapshot(): Omit<Diagnostics, 'fpsCheck' | 'httpRtt'> {
    const settings = GameSettings.get();
    const deviceMemoryGb = (navigator as Navigator & {deviceMemory?: number}).deviceMemory;
    return {
        gameVersion: `${GAME_VERSION} (${BUILD_DATE})`,
        localTime: formatLocalTime(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().getTimezoneOffset()),
        browser: `${navigator.userAgent} · language ${navigator.language} · game language ${Locale.locale()}`,
        // deviceMemory is Chromium-only (rounded GB); Firefox and Safari print n/a.
        device: `${isMobile() ? 'mobile' : 'desktop'} · touch ${navigator.maxTouchPoints > 0 ? 'yes' : 'no'} · platform ${navigator.platform}`
            + ` · cores ${navigator.hardwareConcurrency ?? 'n/a'}`
            + ` · memory ${deviceMemoryGb ? `${deviceMemoryGb} GB` : 'n/a'}`,
        screen: `${screen.width}×${screen.height} css px · DPR ${window.devicePixelRatio} · window ${window.innerWidth}×${window.innerHeight}`
            + ` · fullscreen ${document.fullscreenElement ? 'yes' : 'no'}`,
        renderer: rendererLine(game?.renderer),
        gpu: gpuLine(game?.renderer),
        minimap: rendererLine(game?.miniMap?.application?.renderer),
        settings: `skill effects ${settings.vfx.density} · muted ${settings.audio.masterMuted ? 'yes' : 'no'}`
            + ` · camera zoom ${Zoom.getLevelNumber()} · radar ${snapRadarDiameter(DevicePrefs.radarDiameterM)} m`,
        character: characterLine(),
        server: gameServer,
        session: `uptime ${formatUptime(performance.now())} · ${backendState}`
            + (backendStateAt ? ` for ${formatUptime(performance.now() - backendStateAt)}` : ''),
        console: consoleRing.entries(),
    };
}

/** Everything, after the fps window (the latency runs beside it). */
export async function collectDiagnostics(): Promise<Diagnostics> {
    const [deltas, httpRtt] = await Promise.all([measureFrames(), measureRtt()]);
    return {
        ...snapshot(),
        fpsCheck: formatFrameStats(frameStats(deltas), document.visibilityState),
        httpRtt,
    };
}
