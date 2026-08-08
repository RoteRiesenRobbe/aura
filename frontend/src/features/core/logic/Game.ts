import {Application, Container, Graphics, Ticker} from 'pixi.js';

import {Backend} from '../../backend/logic/Backend';
import {EntityManager} from '../../backend/logic/EntityManager';
import {MiniMap} from '../../map/logic/MiniMap';
import * as DayCycle from '../../day-cycle/logic/DayCycle';
import {Player} from '../../player/logic/Player';
import {Spectator} from '../../player/logic/Spectator';
import {GameObject} from '../../game-objects/logic/_GameObject';
import * as HUD from '../../user-interface/HUD/logic/HUD';
import * as Chat from '../../chat/logic/Chat';
import * as AlertBanner from '../../user-interface/alert-banner/logic/AlertBanner';
import {BasicConfig as Constants} from '../../../client-data/BasicConfig';
import {InputManager} from '../../input-system/logic/InputManager';
import {JoystickManager} from '../../input-system/logic/virtual-joystick/JoystickManager';
import {isDefined, resetFocus} from '../../common/logic/Utils';
import {WelcomeMessage} from '../../backend/logic/messages/incoming/WelcomeMessage';
import * as Console from '../../internal-tools/console/logic/Console';
import {Camera} from '../../camera/logic/Camera';
import * as GroundTextureManager from '../../ground-textures/logic/GroundTextureManager';
import * as DarknessOverlay from '../../darkness/logic/DarknessOverlay';
import * as AttackLines from '../../game-objects/logic/AttackLines';
import {GameState, IGame, IGameLayers} from './IGame';
import {gameObjectId} from '../../common/logic/Types';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {setGrayKnobs} from '../../../client-data/Mobs';
import {IBackend} from '../../backend/logic/IBackend';
import {
    BackendValidTokenEvent,
    BeforeDeathEvent,
    GameLateSetupEvent,
    GamePlayingEvent,
    GameSetupEvent,
    ModulesLoadedEvent,
    PrerenderEvent,
    UserInteraceDomReadyEvent,
} from './Events';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import {registerPreload} from './Preloading';
import {installContextLossWarning} from './ContextLossWarning';
import {isMobile} from '../../user-interface/logic/Mobile';

/**
 * Ceiling on the mobile render resolution — see Game.renderResolution(). 2 is
 * the sharpness/speed balance point the PO picked; 1.5 is measurably faster
 * again and at phone viewing distance close to indistinguishable, so this is
 * the knob to turn if a real device still struggles. [PLACEHOLDER]
 */
const MOBILE_MAX_RESOLUTION = 2;

export let instance: Game;

export class Game implements IGame {

    public state = GameState.INITIALIZING;

    // The active zone's id, delivered in Welcome (chunk 6). Empty until then.
    public zoneName = '';

    private application: Application;
    public layers: IGameLayers;
    public cameraGroup: Container;

    public map: EntityManager = null;
    public miniMap: MiniMap = null;

    public inputManager: InputManager;
    public joystickManager: JoystickManager;

    // TODO merge with GameState?
    public started: boolean;
    public paused: boolean;
    public playing: boolean;

    public timeDelta: number;

    public spectator: Spectator;
    public player: Player;
    private backend: IBackend;

    public get width(): number {
        return this.application.renderer.screen.width;
    }

    public get height(): number {
        return this.application.renderer.screen.height;
    }

    public get centerX(): number {
        return this.width / 2;
    }

    public get centerY(): number {
        return this.height / 2;
    }

    public get domElement(): HTMLCanvasElement {
        return this.application.canvas;
    }

    private get stage(): Container {
        return this.application.stage;
    }

    /**
     * Render resolution — the ONE definition, read by both init() and every
     * resize. A second `window.devicePixelRatio` at either site would drift the
     * cap back off on the first orientation change, which is exactly the class
     * of bug the resize handler below was written to close.
     *
     * A phone reports devicePixelRatio 3, so the uncapped canvas was a
     * 1170×2532 backbuffer — 2.97 Mpx per frame, more pixels than a 1440p
     * desktop monitor, on a phone GPU. Measured headless, frame time is very
     * nearly LINEAR in pixel count (~16 ms fixed + ~204 ms/Mpx), i.e. the scene
     * is fill-bound, not JS-bound: capping at 2 alone cuts the frame ~2.3×.
     *
     * ⚑ The cap is what makes MOVEMENT playable, not just the framerate. The
     * input clock (Controls' Tock) is setTimeout-based at 33 ms and so is
     * nominally independent of rendering — but it still needs the main thread,
     * and a saturated one starves it: measured input sends tracked the frame
     * rate 1:1 (1.8/s at DPR 3, 10.4/s at DPR 1, against a 30/s target). The
     * server then coasts between inputs and corrects, which reads as lurching
     * and rubber-banding on top of the low framerate.
     *
     * Desktop is untouched BY CONSTRUCTION: off mobile this is the bare
     * `window.devicePixelRatio` the renderer has always been given.
     */
    private renderResolution(): number {
        if (!isMobile()) {
            return window.devicePixelRatio;
        }
        return Math.min(window.devicePixelRatio, MOBILE_MAX_RESOLUTION);
    }

    constructor() {
        this.application = new Application();

        // noinspection JSIgnoredPromiseFromCall
        registerPreload(this.application.init({
            // MSAA is close to pure cost here and is off on mobile (measured
            // −26 % frame time at DPR 3, on top of the resolution cap). It
            // antialiases GEOMETRY edges only, so in a sprite-based 2D game it
            // touches nothing but the vector Graphics — aura rings, the bars,
            // tier frames — while being paid for over the whole framebuffer.
            antialias: !isMobile(),
            autoDensity: true,
            resolution: this.renderResolution(),
        }).then(() => {
            this.setupResizeHandling();
            // Only reachable once init() resolved — application.canvas does not
            // exist before that, so a loss during init itself stays unlabelled.
            installContextLossWarning(this.application.canvas);
        }));
    }

    /**
     * Owns canvas sizing (replaces Pixi's resizeTo plugin): every window
     * resize AND every devicePixelRatio change (browser zoom, monitor/DPI
     * switch) re-applies size + resolution together. The previous init-time
     * resolution snapshot left the canvas buffer and parts of the render
     * state on different metrics after a hard reload at ≠100% browser zoom —
     * the "blue border" clipping bug.
     */
    private setupResizeHandling(): void {
        const resize = () => {
            this.application.renderer.resize(
                window.innerWidth,
                window.innerHeight,
                this.renderResolution(),
            );
        };
        window.addEventListener('resize', resize);

        // matchMedia is the only reliable DPR-change signal; a query matches
        // one specific DPR value, so it re-registers after every change.
        const watchDprChange = () => {
            const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
            query.addEventListener('change', () => {
                resize();
                watchDprChange();
            }, {once: true});
        };
        watchDprChange();

        resize();
        // A hard reload at ≠100% browser zoom can apply the zoom level after
        // init took its measurements — reconcile once more on the next frame.
        requestAnimationFrame(resize);
    }

    /**
     * The actor the player can talk to right now; 0 = nobody, and also 0
     * before the backend exists (chunk 3b-i). The interact key reads it.
     */
    getInteractableEntityId(): number {
        return this.backend?.getInteractableEntityId() ?? 0;
    }

    setup(): void {
        let setupPromises = [];

        // Setup backend first, as this will take some time to connect.
        this.backend = new Backend();
        this.backend.setup(this);
        GameSetupEvent.trigger(this);

        //Add the canvas to the HTML document
        document.body.prepend(this.domElement);

        /**
         * Ordered by z-index
         */
        this.layers = {
            terrain: {
                water: createNamedContainer('water'),
                ground: createNamedContainer('ground'),
                textures: createNamedContainer('textures'),
                resourceSpots: createNamedContainer('resourceSpots'),
            },
            // No `placeables` group: the Berryhunter build/placeable feature is
            // gone (backlog §26/§28), so all seven of its containers rendered
            // nothing. Real campfires are mobs and live on layers.mobs.campfire.
            // Player corpses (chunk 4): under the living.
            corpses: createNamedContainer('corpses'),
            characters: createNamedContainer('characters'),
            mobs: {
                dodo: createNamedContainer('dodo'),
                saberToothCat: createNamedContainer('saberToothCat'),
                mammoth: createNamedContainer('mammoth'),
                totem: createNamedContainer('totem'),
                rabbit: createNamedContainer('rabbit'),
                companion: createNamedContainer('companion'),
                brazier: createNamedContainer('brazier'),
                healer: createNamedContainer('healer'),
                campfire: createNamedContainer('campfireMob'),
                turnip: createNamedContainer('turnip'),
                // Z1 wildlife + brambles share one layer (content pass C2).
                wildlife: createNamedContainer('wildlife'),
            },
            resources: {
                minerals: createNamedContainer('minerals'),
                trees: createNamedContainer('trees'),
            },
            bossMobs: createNamedContainer('bossMobs'),
            // A character in FLIGHT, above props and boss mobs (flight C3, PO
            // pass 2026-08-05). Every other character stays on `characters`,
            // deliberately BELOW the trees and rocks it walks behind — this
            // layer exists only for the one entity that is meant to be over
            // them, and only while it is. Empty on the ground, and it can hold
            // at most the local player: a flyer is removed from everyone
            // else's snapshot (D13), so no remote character can ever reach it.
            flyers: createNamedContainer('flyers'),
            // Darkness overlay (chunk 3): above all entities, below the
            // floating numbers; deliberately NOT in the DayCycle filtered
            // set — dark areas are dark independent of the cycle (§6.5).
            darkness: createNamedContainer('darkness'),
            characterAdditions: {
                // Character name + overhead HP/shield plates: world-space
                // follow overlay OUTSIDE the night filter, so characters stay
                // findable at full night (night-readability fix — the tinted
                // in-shape plates used to go near-black while unfiltered
                // layers stayed bright, reading as "my character is gone").
                namePlates: createNamedContainer('namePlates'),
                chatMessages: createNamedContainer('chatMessages'),
                // Floating damage/heal/XP numbers (item 11): topmost world layer
                // so they read above every entity.
                floatingNumbers: createNamedContainer('floatingNumbers'),
            },
            overlays: {
                vitalSignIndicators: createNamedContainer('vitalSignIndicators'),
            },
            // UI Overlay is the highest layer, but not managed with pixi.js
        };

        // Terrain Background
        this.stage.addChild(this.layers.terrain.water);

        this.cameraGroup = createNamedContainer('cameraGroup');
        this.stage.addChild(this.cameraGroup);

        // Terrain Textures moving with the camera
        this.cameraGroup.addChild(
            this.layers.terrain.ground,
            this.layers.terrain.textures,
            this.layers.terrain.resourceSpots,
        );

        // Corpses below the living
        this.cameraGroup.addChild(this.layers.corpses);

        // Mobs — deliberately UNDER the characters: a player standing on a
        // mob-layer entity (campfire, turnip field) must never be covered by
        // its art (night-readability fix `6afbee84`; the fire sprite used to
        // hide the avatar completely).
        //
        // ⚑ THE MAP'S ORDER IS THE OPPOSITE, AND THE TWO ARE NOT TIED TOGETHER
        // (PO ruling 2026-08-04, plan-world-map.md C3 finding 8). On the map,
        // campfire markers draw ABOVE the player dots — *"the campfire is still
        // the most important information the map can provide"*. In the WORLD
        // the player stays on top, which is this line, unchanged since
        // `6afbee84`. A map marker is a claim about where something is; a world
        // sprite is the thing itself, and you must be able to see yourself
        // standing in it. Building the world to match the map was tried in this
        // chunk and bounced back by the PO from a screenshot.
        this.cameraGroup.addChild(
            this.layers.mobs.dodo,
            this.layers.mobs.saberToothCat,
            this.layers.mobs.mammoth,
            this.layers.mobs.totem,
            this.layers.mobs.rabbit,
            this.layers.mobs.companion,
            this.layers.mobs.brazier,
            this.layers.mobs.healer,
            this.layers.mobs.campfire,
            this.layers.mobs.turnip,
            this.layers.mobs.wildlife,
        );

        // Characters above mobs
        this.cameraGroup.addChild(this.layers.characters);

        // Resources
        this.cameraGroup.addChild(
            this.layers.resources.minerals,
            this.layers.resources.trees,
        );

        // Boss mobs overlaying resources
        this.cameraGroup.addChild(this.layers.bossMobs);

        // …and a flyer above even those. Walking behind a tree is correct;
        // flying behind one breaks the only thing selling the flight, since
        // altitude has no other representation (no shadow, no scale change).
        // Above darkness would be wrong — a flyer crossing a dark region is
        // still in it — so this sits just below it.
        this.cameraGroup.addChild(this.layers.flyers);

        // PROTOTYPE (backlog §57): attack-attribution lines, above the entities
        // they connect but deliberately BELOW the darkness — a dark area stays
        // fully dark, and an overlay drawn over it would be the first thing to
        // break that rule. One addChild; delete this line to revert.
        this.cameraGroup.addChild(AttackLines.container);

        // Darkness overlay above every entity
        this.cameraGroup.addChild(this.layers.darkness);

        // Character Additions
        this.cameraGroup.addChild(
            this.layers.characterAdditions.namePlates,
            this.layers.characterAdditions.chatMessages,
            this.layers.characterAdditions.floatingNumbers,
        );

        // Vital Sign Indicators on top of everything
        // And not part of the night filter container
        this.stage.addChild(this.layers.overlays.vitalSignIndicators);

        this.createBackground();

        Camera.setup(this);
        GroundTextureManager.setup(this);
        DarknessOverlay.setup(this.layers.darkness);

        GameObject.setup();

        this.inputManager = new InputManager({
            inputKeyboard: true,
            inputKeyboardEventTarget: window,

            inputMouse: true,
            inputMouseEventTarget: document.documentElement,
            inputMouseCapture: true,

            inputTouch: true,
            inputTouchEventTarget: document.documentElement,
            inputTouchCapture: true,

            inputGamepad: false,
        });
        this.inputManager.boot();

        this.joystickManager = new JoystickManager();
        this.joystickManager.setup();

        // Browser zoom has no effect on the world view (fixed FOV, see
        // camera/logic/Zoom.ts), but an accidental ctrl+wheel mid-fight would
        // still rescale the DOM HUD — block it.
        document.addEventListener('wheel', (event) => {
            if (event.ctrlKey) {
                event.preventDefault();
            }
        }, {passive: false});

        // Disable context menu on right click to use the right click in-game
        document.body.addEventListener('contextmenu', (event) => {
            if (event.target === this.domElement || this.domElement.contains(event.target as Node)) {
                event.preventDefault();
            }
        });

        // Not really sure why, but clicking through the game (and thus into the body) does not restore the focus on the game
        // but this would be required to interact with overlay panels such as Develop or Settings
        document.body.addEventListener('click', (event) => {
            resetFocus();
        });


        HUD.setup(this);

        /*
         * Initializing modules that require an initialized UI
         */

        Chat.setup(this, Backend);
        AlertBanner.setup();

        /*
         * https://trello.com/c/aq5lqJB7/289-schutz-gegen-versehentliches-verlassen-des-spiels
         */
        window.onbeforeunload = (event: BeforeUnloadEvent) => {
            // Only ask for confirmation if the user is in-game
            if (this.state !== GameState.PLAYING) {
                return;
            }

            // Don't bother developers with confirmations
            if (developEnabled) {
                return;
            }

            let dialogText = 'Do you want to leave this game? You\'re progress will be lost.';
            event.preventDefault();
            // noinspection JSDeprecatedSymbols
            event.returnValue = dialogText;
            return dialogText;
        };

        Promise.all(setupPromises).then(() => {
            GameLateSetupEvent.trigger(this);
        });
    }

    private loop(ticker: Ticker): void {
        if (this.paused) {
            return;
        }

        this.timeDelta = ticker.deltaMS;
        PrerenderEvent.trigger(this.timeDelta);
    }

    play(): void {
        this.playing = true;
        this.paused = false;
        this.application.start();
        this.application.ticker.add(this.loop, this);
    }

    pause(): void {
        this.playing = false;
        this.paused = true;
        this.application.stop();
    }

    /**
     * Creating a player starts implicitly the game
     */
    createPlayer(id: gameObjectId, x: number, y: number, name: string): void {
        if (isDefined(this.spectator)) {
            this.spectator.remove();
            this.spectator = undefined;
        }

        // The spectator's view is not the character's (backlog §53). Everything
        // the pre-join spectator saw at the world origin is dropped here, and
        // what is genuinely in view right now is rebuilt — before the Player is
        // constructed, because that is what adds the own character's own icon.
        this.map.reseedMinimap();

        /**
         * @type Player
         */
        this.player = new Player(id, x, y, name, this.miniMap);
        this.player.init();
        this.state = GameState.PLAYING;
        GamePlayingEvent.trigger(this);
    }

    removePlayer(): void {
        if (!isDefined(this.player)) {
            // Dead reconnect (plan-reconnect-token.md): the Obituary arrives
            // before any player was created this page load — the spectator
            // from the first GameState is already in place, nothing to remove.
            return;
        }
        BeforeDeathEvent.trigger(this);
        this.createSpectator(this.player.character.getX(), this.player.character.getY());
        this.player.remove();
        this.player = undefined;
        if (Constants.CLEAR_MINIMAP_ON_DEATH) {
            this.miniMap.clear();
            this.map.clear();
        }
        this.state = GameState.RENDERING;
    }

    createSpectator(x: number, y: number): void {
        this.spectator = new Spectator(this, x, y);
    }

    startRendering(gameInformation: WelcomeMessage): void {
        Console.log('Joined Server "' + gameInformation.serverName + '"');
        // Render the terrain of the zone the server selected (chunk 6). setup()
        // has already run during construction, so placed textures render now.
        this.zoneName = gameInformation.zoneName;
        GroundTextureManager.loadZone(gameInformation.zoneName);
        DarknessOverlay.loadZone(gameInformation.zoneName);
        // The server's gray knobs, before anything renders — a nameplate cannot
        // exist before this point, which is why the tint needs no fallback pair
        // (plan-world-replacement.md C0).
        setGrayKnobs(gameInformation.grayBase, gameInformation.grayStep);
        const mapWidth = gameInformation.mapWidth;
        const mapHeight = gameInformation.mapHeight;
        // Shallow-water beach ring OUTSIDE the physical bounds (C2 fix: the
        // old inset ring sat inside the wall, so the last 2 units of walkable
        // land rendered as water). Land now fills the exact bounds the border
        // collision uses.
        const waterMargin = 240;
        this.layers.terrain.ground.addChild(new Graphics()
            .rect(-mapWidth / 2 - waterMargin, -mapHeight / 2 - waterMargin,
                mapWidth + 2 * waterMargin, mapHeight + 2 * waterMargin)
            .fill(GraphicsConfig.shallowWaterColor));
        this.layers.terrain.ground.addChild(new Graphics()
            .rect(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight)
            .fill(GraphicsConfig.landColor));

        // The zone name reaches the map for the same reason it reaches the
        // ground textures above: the full-screen state bakes that zone's
        // terrain from the bundled data (plan-world-map.md C1).
        this.miniMap.setup(mapWidth, mapHeight, gameInformation.zoneName);
        this.map = new EntityManager(mapWidth, mapHeight, this.miniMap);
        // NOTE: the night tint is currently DEACTIVATED — see
        // DAY_CYCLE_PRESENTATION_ENABLED in DayCycle.ts for why. The list below
        // is still derived and handed over so re-enabling is a one-word change;
        // with the flag off DayCycle never assigns a filter to any of it.
        //
        // Night-tinted layers are DERIVED (every layer minus the exempt set)
        // instead of hand-listed: the old include-list predated the content
        // pass, so every newer mob layer (wildlife, healer, companion, …)
        // silently skipped the night tint — the world stayed bright while the
        // characters layer went near-black, which read as "my character turned
        // invisible at night". A new layer is now night-correct by default.
        // Exempt: light sources (campfires, braziers), the darkness overlay
        // (dark areas are dark independent of the cycle, §6.5), and the
        // readability overlays (name plates, chat, floating numbers, vitals).
        const nightExempt = new Set<Container>([
            this.layers.mobs.brazier,
            this.layers.mobs.campfire,
            this.layers.darkness,
            this.layers.characterAdditions.namePlates,
            this.layers.characterAdditions.chatMessages,
            this.layers.characterAdditions.floatingNumbers,
            this.layers.overlays.vitalSignIndicators,
        ]);
        const nightTinted: Container[] = [];
        const collectLayers = (group: object) => {
            Object.values(group).forEach((entry) => {
                if (entry instanceof Container) {
                    if (!nightExempt.has(entry)) {
                        nightTinted.push(entry);
                    }
                } else {
                    collectLayers(entry);
                }
            });
        };
        collectLayers(this.layers);
        DayCycle.setup(
            gameInformation.totalDayCycleTicks,
            gameInformation.dayTimeTicks,
            nightTinted,
        );
        this.play();
        this.state = GameState.RENDERING;
    }

    private createBackground() {
        this.application.renderer.background.color = GraphicsConfig.deepWaterColor;
        // Screen-sized deep-water backdrop (also carries the night tint, see
        // DayCycle) — must follow every canvas resize.
        const waterRect = new Graphics();
        const redraw = () => {
            waterRect.clear()
                .rect(0, 0, this.width, this.height)
                .fill(GraphicsConfig.deepWaterColor);
        };
        redraw();
        this.application.renderer.on('resize', redraw);
        this.layers.terrain.water.addChild(waterRect);
    }
}

instance = new Game();

ModulesLoadedEvent.subscribe(instance.setup, instance);
UserInteraceDomReadyEvent.subscribe(() => {
    instance.miniMap = new MiniMap();
});
/*
 * Make sure the body can be focused.
 */
document.body.tabIndex = 0;


let developEnabled = false;
BackendValidTokenEvent.subscribe(function () {
    developEnabled = true;
});
