import {Application, Container, Graphics, RenderTexture, Ticker} from 'pixi.js';

import {meter2px, px2meter} from '../../../client-data/BasicConfig';
import {ActiveZoneTracker} from '../../zones/logic/ActiveZone';
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
import * as Regions from '../../regions/logic/Regions';
import {Region} from '../../regions/logic/Regions';
import * as Paths from '../../paths/logic/Paths';
import * as RegionPaint from '../../regions/logic/RegionPaint';
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
    // Which zones exist this boot and which one the player is in, derived from
    // position (plan-underworld.md U2). Undefined until the Welcome lands.
    private activeZone: ActiveZoneTracker;

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

    /** The blend-mask textures the last region paint created (C5) - GPU memory
     *  nothing else references, freed by the next paint. See {@link paintRegions}. */
    private regionMasks: RenderTexture[] = [];

    /** The drifting terrain surfaces the last paint created (world-paths C3) -
     *  advanced once per frame in {@link loop}.
     *
     *  ⚑ REPLACED, never appended, by {@link paintTerrainSurfaces}: the sprites
     *  in it are destroyed with the layer on a repaint, and animating a
     *  destroyed sprite is a null write into a freed uniform. */
    private regionScrollers: RegionPaint.ScrollingSurface[] = [];

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
                // Biome/zone ground colour (plan-region-primitive.md C1):
                // OVER the base land fill, UNDER the texture blobs — which is
                // what lets the shipped blobs keep doing edge treatment where
                // a region meets the land. (D5 ruled hard edges here; C5's D21
                // REVERSED that - a profile's `blend` now feathers the region's
                // own edge, colour and texture alike. `blend: 0` is D5's world.)
                regions: createNamedContainer('regions'),
                // Roads and rivers (plan-world-paths.md C1): OVER the region
                // ground, UNDER the texture blobs. A road lies ON the field it
                // crosses, and the blobs keep doing edge treatment on top of
                // both. A bridge is a PROP (D6) and therefore an entity, so it
                // draws far above this — nothing here has to know about it.
                paths: createNamedContainer('paths'),
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
                totem: createNamedContainer('totem'),
                companion: createNamedContainer('companion'),
                campfire: createNamedContainer('campfireMob'),
                turnip: createNamedContainer('turnip'),
                // Z1 wildlife + brambles share one layer (content pass C2).
                wildlife: createNamedContainer('wildlife'),
            },
            resources: {
                minerals: createNamedContainer('minerals'),
                trees: createNamedContainer('trees'),
            },
            // A character in FLIGHT, above the props (flight C3, PO
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
            this.layers.terrain.regions,
            this.layers.terrain.paths,
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
            this.layers.mobs.totem,
            this.layers.mobs.companion,
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

        // …and a flyer above even those. Walking behind a tree is correct;
        // flying behind one breaks the only thing selling the flight, since
        // altitude has no other representation (no shadow, no scale change).
        // Above darkness would be wrong — a flyer crossing a dark region is
        // still in it — so this sits just below it.
        this.cameraGroup.addChild(this.layers.flyers);

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
        // Drifting terrain surfaces — animated water (plan-world-paths.md C3).
        // Two number writes per drifting surface and nothing else; a zone that
        // authors no scroll has an empty array and this is a length check.
        //
        // ⚑ Above the `paused` guard would be wrong and below it is the point:
        // a paused game must not advance the water, or the river jumps forward
        // by the whole pause the moment play resumes.
        RegionPaint.advanceSurfaceScroll(this.regionScrollers, this.timeDelta);
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
        // The server's gray knobs, before anything renders — a nameplate cannot
        // exist before this point, which is why the tint needs no fallback pair
        // (plan-world-replacement.md C0).
        setGrayKnobs(gameInformation.grayBase, gameInformation.grayStep);

        // Which zones exist this boot, and which one we start in
        // (plan-underworld.md U2). The tracker answers "where am I" from
        // position alone; nothing about a zone change rides the wire.
        this.activeZone = new ActiveZoneTracker(gameInformation.zoneNames, gameInformation.zoneName);
        const start = this.activeZone.active;
        const mapWidth = start ? meter2px(start.width) : gameInformation.mapWidth;
        const mapHeight = start ? meter2px(start.height) : gameInformation.mapHeight;

        this.renderZone(gameInformation.zoneName);

        // The zone name reaches the map for the same reason it reaches the
        // ground textures above: the full-screen state bakes that zone's
        // terrain from the bundled data (plan-world-map.md C1).
        this.miniMap.setup(mapWidth, mapHeight, gameInformation.zoneName,
            start ? meter2px(start.originX) : 0, start ? meter2px(start.originY) : 0);
        this.map = new EntityManager(mapWidth, mapHeight, this.miniMap);
        // The starting zone may not be at the shared origin either — nothing
        // says the primary zone has to sit at {0,0}.
        this.map.setBounds(mapWidth, mapHeight,
            start ? meter2px(start.originX) : 0, start ? meter2px(start.originY) : 0);
        // NOTE: the night tint is currently DEACTIVATED — see
        // DAY_CYCLE_PRESENTATION_ENABLED in DayCycle.ts for why. The list below
        // is still derived and handed over so re-enabling is a one-word change;
        // with the flag off DayCycle never assigns a filter to any of it.
        //
        // Night-tinted layers are DERIVED (every layer minus the exempt set)
        // instead of hand-listed: the old include-list predated the content
        // pass, so every newer mob layer (wildlife, companion, …)
        // silently skipped the night tint — the world stayed bright while the
        // characters layer went near-black, which read as "my character turned
        // invisible at night". A new layer is now night-correct by default.
        // Exempt: light sources (campfires), the darkness overlay
        // (dark areas are dark independent of the cycle, §6.5), and the
        // readability overlays (name plates, chat, floating numbers, vitals).
        const nightExempt = new Set<Container>([
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

    /**
     * (Re)draws the loaded zone's regions into their own layer. Runs twice per
     * zone at most: once at load with whatever paint is available, and once
     * more if the zone's ground tiles land afterwards (C4).
     *
     * Empties the layer first — it holds nothing else, and the second pass must
     * replace the first rather than stack a textured polygon on a coloured one.
     */
    /**
     * Draws one zone's whole visual world, and can be called AGAIN to swap to
     * another (plan-underworld.md U2).
     *
     * ⭐ THIS IS THE PIECE THE ZONE EDITOR ONLY HALF HAD. ZoneEditor.loadZone
     * already swapped ground textures at runtime, but left Regions, Paths, the
     * darkness overlay and the map bake on the previous zone — which is exactly
     * the set that makes a swap look right and behave wrong. Every one of them
     * REPLACES rather than appends, so this is idempotent by construction.
     *
     * ⚑ The ground fill is torn down explicitly. It is the only thing here
     * added straight to a container rather than through a loader that clears
     * its own state, so without this the second zone's water rectangle stacks
     * on top of the first one's forever.
     */
    private renderZone(zoneName: string): void {
        this.zoneName = zoneName;
        const rect = this.activeZone?.zones.find(z => z.name === zoneName);
        const width = rect ? meter2px(rect.width) : 0;
        const height = rect ? meter2px(rect.height) : 0;
        const originX = rect ? meter2px(rect.originX) : 0;
        const originY = rect ? meter2px(rect.originY) : 0;

        this.layers.terrain.ground.removeChildren().forEach(c => c.destroy());
        GroundTextureManager.clear();
        GroundTextureManager.loadZone(zoneName);
        DarknessOverlay.loadZone(zoneName);

        // Shallow-water beach ring OUTSIDE the physical bounds (C2 fix: the
        // old inset ring sat inside the wall, so the last 2 units of walkable
        // land rendered as water). Land now fills the exact bounds the border
        // collision uses — this zone's, at this zone's origin.
        const waterMargin = 240;
        this.layers.terrain.ground.addChild(new Graphics()
            .rect(originX - width / 2 - waterMargin, originY - height / 2 - waterMargin,
                width + 2 * waterMargin, height + 2 * waterMargin)
            .fill(GraphicsConfig.shallowWaterColor));
        this.layers.terrain.ground.addChild(new Graphics()
            .rect(originX - width / 2, originY - height / 2, width, height)
            .fill(GraphicsConfig.landColor));

        // Region ground, painted over the base fill in AUTHORED ORDER — the
        // same order the resolution rule reads (D0), so what you see on top is
        // what a lookup at that point answers. Static Graphics drawn once, like
        // the fill above: no per-frame cost.
        //
        // ⚑ The origin goes in HERE, not on the server: regions and paths are
        // client-visual, so world.Place leaves them zone-local deliberately.
        const zoneData = GroundTextureManager.getZoneData(zoneName);
        const origin = rect ? {x: rect.originX, y: rect.originY} : undefined;
        Regions.loadRegions(zoneData?.regions, origin);
        Paths.loadPaths(zoneData?.paths, origin);
        this.paintTerrainSurfaces();
        // The zone's ground tiles (C4). Loaded HERE and not through Preloading:
        // the preload gate blocks boot, and by the time a zone is known it has
        // long since passed (§4.9). Until they land — and forever, if a file is
        // missing — every region paints its fallback colour (D14), so this is a
        // repaint of something already correct, never a blank world.
        // ⚑ BOTH arrays, or a zone whose only textured profile is a river
        // loads nothing and the water paints its fallback colour forever.
        RegionPaint.loadZoneTextures(
            (Regions.loadedRegions() as Region[]).concat(Paths.loadedPaths()),
        ).then((landed) => {
            if (!landed) { return; }
            // ⚑ A late texture load must not repaint a zone the player has
            // since left: the promise outlives the swap that started it.
            if (this.zoneName !== zoneName) { return; }
            this.paintTerrainSurfaces();
            // ⚑ Map parity is NOT optional (§4.7/L2): the bake below has
            // already run by now, with the fallback colours. One re-bake — the
            // path setupTerrain was written for — is what keeps the map from
            // being a wrong drawing of the world for the rest of the session.
            this.miniMap?.rebakeTerrain();
        });
    }

    /**
     * Follows the local player into another zone (plan-underworld.md U2).
     *
     * ⭐ Driven by POSITION, not by a message. The server warps the player, the
     * AOI moves with them and the snapshot replaces its own contents; all the
     * client has to notice is that the position is now inside a different
     * rectangle. Returns the zone it switched TO, or undefined if nothing
     * changed — so a caller can hang a transition off the return value.
     */
    updateActiveZone(xPx: number, yPx: number): string | undefined {
        if (!isDefined(this.activeZone)) {
            return undefined;
        }
        const entered = this.activeZone.update(px2meter(xPx), px2meter(yPx));
        if (!isDefined(entered)) {
            return undefined;
        }
        this.renderZone(entered.name);
        // The camera clamp, the entity bounds and the map are all sized to ONE
        // zone's rectangle, never a union of them (L13) — so they move too.
        const width = meter2px(entered.width);
        const height = meter2px(entered.height);
        this.map?.setBounds(width, height,
            meter2px(entered.originX), meter2px(entered.originY));
        // ⭐ switchZone, NOT setup: a crossing is not a join. setup() is a reset —
        // it re-appends the canvas, rebuilds every layer, closes an open map, and
        // throws away the fog you have walked off and the campfires you have
        // discovered. Both are published once and never again, so driving a
        // crossing through it loses them for the session.
        //
        // ⚑ The ORIGIN rides along with the bounds and is not optional: every live
        // position the map plots is a world coordinate while the map is baked
        // zone-local, so without it a player in a zone at {0, 300} draws 300 units
        // off their own map (plan-underworld.md U4).
        this.miniMap?.switchZone(width, height, entered.name,
            meter2px(entered.originX), meter2px(entered.originY));
        return entered.name;
    }

    private paintTerrainSurfaces(): void {
        const layer = this.layers.terrain.regions;
        const pathLayer = this.layers.terrain.paths;
        // ⚑ Bare `destroy()`, deliberately: with no options Pixi frees the
        // Graphics' OWN context (its geometry) and leaves textures alone, which
        // is exactly right for a GROUND TILE - shared by every region using that
        // profile and by the map's bake. Passing `{texture: false}` would read
        // as the safer call and actually leak the context instead.
        layer.removeChildren().forEach(child => child.destroy());
        pathLayer.removeChildren().forEach(child => child.destroy());
        // ⚑ …but a C5 blend mask is NOT shared, and the line above deliberately
        // does not free it. One RenderTexture per feathered region per paint,
        // and this method runs a second time the moment the zone's tiles land,
        // so without this the second pass strands the first pass's masks on the
        // GPU for the life of the session. They are ours because paintRegions
        // handed them back; nothing else holds a reference.
        this.regionMasks.forEach(texture => texture.destroy(true));
        const painted = RegionPaint.paintTerrainSurfaces(
            layer, pathLayer,
            Regions.loadedRegions(), Paths.loadedPaths(),
            this.application.renderer);
        this.regionMasks = painted.masks;
        // ⚑ The scrollers need no freeing of their own - their sprites are the
        // layer's children and died in the removeChildren above - but the
        // reference MUST be replaced, or the frame loop keeps writing
        // tilePosition on destroyed sprites from the previous pass.
        this.regionScrollers = painted.scrollers;
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
