import {Application, Container, Graphics, Ticker} from 'pixi.js';

import {Backend} from '../../backend/logic/Backend';
import {EntityManager} from '../../backend/logic/EntityManager';
import {MiniMap} from '../../mini-map/logic/MiniMap';
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
import {GameState, IGame, IGameLayers} from './IGame';
import {gameObjectId} from '../../common/logic/Types';
import {GraphicsConfig} from '../../../client-data/Graphics';
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

    constructor() {
        this.application = new Application();

        // noinspection JSIgnoredPromiseFromCall
        registerPreload(this.application.init({
            antialias: true,
            autoDensity: true,
            resolution: window.devicePixelRatio,
        }).then(() => this.setupResizeHandling()));
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
                window.devicePixelRatio,
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
            placeables: {
                campfire: createNamedContainer('campfire'),
                chest: createNamedContainer('chest'),
                workbench: createNamedContainer('workbench'),
                furnace: createNamedContainer('furnace'),

                doors: createNamedContainer('doors'),
                walls: createNamedContainer('walls'),
                spikyWalls: createNamedContainer('spikyWalls'),
            },
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
                berryBush: createNamedContainer('berryBush'),
                minerals: createNamedContainer('minerals'),
                trees: createNamedContainer('trees'),
            },
            bossMobs: createNamedContainer('bossMobs'),
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

        // Lower Placeables
        this.cameraGroup.addChild(
            this.layers.placeables.campfire,
            this.layers.placeables.chest,
            this.layers.placeables.workbench,
            this.layers.placeables.furnace,
            this.layers.resources.berryBush,
        );

        // Corpses below the living
        this.cameraGroup.addChild(this.layers.corpses);

        // Mobs — deliberately UNDER the characters: a player standing on a
        // mob-layer entity (campfire, turnip field) must never be covered by
        // its art (night-readability fix; the fire sprite used to hide the
        // avatar completely).
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

        // Higher Placeables
        this.cameraGroup.addChild(
            this.layers.placeables.doors,
            this.layers.placeables.walls,
            this.layers.placeables.spikyWalls,
        );

        // Resources
        this.cameraGroup.addChild(
            this.layers.resources.minerals,
            this.layers.resources.trees,
        );

        // Boss mobs overlaying resources
        this.cameraGroup.addChild(this.layers.bossMobs);

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

        this.miniMap.setup(mapWidth, mapHeight);
        this.map = new EntityManager(mapWidth, mapHeight, this.miniMap);
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
            this.layers.placeables.campfire,
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
