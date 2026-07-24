'use strict';

/**
 * Meter are the unit in backend. Pixels are units in the frontend.
 *
 * Used meter2px(meter) to calculate px length from configured meter lengths.
 *
 * SYNCED WITH BACKEND
 */
const PIXEL_PER_METER: number = 120;

export function meter2px(meter: number) {
    return meter * PIXEL_PER_METER;
}

export const BasicConfig = {
    /**
     * Contains all available query parameter that modify the behavior of the game
     */
    MODE_PARAMETERS: <{[key: string]: string}> {
        MAP_EDITOR: 'map-editor',
        DEVELOPMENT: 'develop',
        GROUND_TEXTURE_EDITOR: 'textures',
        NO_DOCKER: 'no-docker',
    },

    VALUE_PARAMETERS: <{[key: string]: string}> {
        WEBSOCKET_URL: 'wsUrl',
        TOKEN: 'token',
        START_COMMANDS: 'start-cmds',
    },

    /**
     * Movement speed of characters in the game. Is use for camera tracking.
     *
     * SYNCED WITH BACKEND
     */
    BASE_MOVEMENT_SPEED: <number> meter2px(0.055),

    /**
     * Area of interest as management by the backend.
     *
     * SYNCED WITH BACKEND (backend/pkg/aura/model/constant/const.go:5)
     */
    VIEWPORT: {
        WIDTH: <number>  meter2px(20),
        HEIGHT: <number>  meter2px(12),
    },

    /**
     * true: character movement AND mouse movement adjust the character facing direction
     * false: only mouse movement adjust the character facing direction
     */
    // FIXME doesn't work currently
    ALWAYS_VIEW_CURSOR: <boolean> true,

    /**
     * Whether the minimap should "forget" the map every time the player starts again
     */
    CLEAR_MINIMAP_ON_DEATH: <boolean>true,

    /**
     * Pixel size of all graphic files. Scaling and loading is done considering this constant.
     */
    GRAPHIC_BASE_SIZE: <number> 100,

    /**
     * Higher numbers = sharper textures, but more texture memory used
     *
     * Default: 1
     */
    GRAPHICS_RESOLUTION: <number> 1,

    /**
     * Settings for the map editor
     */
    mapEditor: {
        /**
         * Defines the distance of the yellow grid lines
         */
        GRID_SPACING: <number> 100,

        /**
         * How many times the GRID_SPACING is 1 quadrant?
         */
        FIELDS_IN_QUADRANT: <number> 8,
    },

    // TODO unused, can be deleted?
    BACKEND: {
        LOCAL_URL: <string> 'ws://localhost:2000/game',
        REMOTE_URL: <string> 'wss://berryhunter.io/game',
    },

    /**
     * Milliseconds between input sampling ticks. Must equal the backend tick
     * period exactly: the server ticks every `time.Second / 30` = 33.333 ms
     * (constant.TicksPerSecond = 30). The rounded 33 made the client fast
     * (30.303 vs 30.0 Hz), over-feeding the input queue — the measured 10 %
     * eviction / q_mean 1.09 after the input-jitter fix. 1000/30 aligns the
     * two rates. Move the CLIENT, never the server (a server tick-rate change
     * shifts every seconds→ticks conversion 1 %). (plan-render-jitter.md Lever A)
     *
     * SYNCED WITH BACKEND (backend/pkg/aura/model/constant/const.go:7 = 30/s)
     */
    INPUT_TICKRATE: <number> 1000 / 30,

    /**
     * How many ticks to keep re-sending an explicit "stopped" (zero-movement)
     * input after the movement keys are released, so the server gets the release
     * even if a packet is lost — the client-side half of the server coast
     * (plan-input-jitter.md chunk B). Without it, releasing a key is signalled
     * only by silence, which the server's hold would replay as continued
     * movement. Kept small so an idle player goes quiet quickly (no standing
     * spam). [PLACEHOLDER]
     */
    STOP_TAIL_TICKS: <number> 5,

    /**
     * The true inter-snapshot interval: one server tick = `time.Second / 30` =
     * 33.333 ms. Confirmed by live measurement (the [snapshot-arrival] mean is
     * 33.3 ms on the wire; the 30.3 seen on localhost was a loopback artifact).
     * The rounded 33 made the reactive lerp finish ~0.333 ms early every tick —
     * a constant per-tick micro-freeze. Used as the interval basis for the
     * buffered render delay. (plan-render-jitter.md Lever A/B)
     *
     * SYNCED WITH BACKEND (backend/pkg/aura/model/constant/const.go:7 = 30/s)
     */
    SERVER_TICKRATE: <number> 1000 / 30,

    /**
     * Whether movement of game objects should be smoothed.
     * Can be disabled to save performance.
     */
    MOVEMENT_INTERPOLATION: <boolean> true,

    /**
     * Is there are maximum angle that objects are allowed to turn during one tick?
     */
    LIMIT_TURN_RATE: <boolean> true,

    /**
     * Maximum radians game objects are rotated per millisecond
     * 1 full rotation per half a second
     */
    DEFAULT_TURN_RATE: <number> (2 * 2 * Math.PI / 1000),

    /**
     * Number of milliseconds that a chat message will stay visible
     */
    CHAT_MESSAGE_DURATION: <number> 5000,

    /**
     * Number of milliseconds that an NPC line stays visible (playtest-1
     * feedback pass B item 1: doubled — texts vanished before they could be
     * read). Separate from player chat on purpose: an NPC line is content to
     * read, a chat line is conversation. [PLACEHOLDER]
     */
    NPC_MESSAGE_DURATION: <number> 10000,
};
