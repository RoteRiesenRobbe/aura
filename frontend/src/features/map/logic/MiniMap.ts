import {Application, Container, ContainerChild, Graphics, Sprite, ViewContainer} from 'pixi.js';
import {registerPreload} from '../../core/logic/Preloading';
import * as HUD from '../../user-interface/HUD/logic/HUD';
import {IMiniMapRendered, Layer, LevelOfDynamic} from './MiniMapInterfaces';
import {gameObjectId} from '../../common/logic/Types';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import {Character} from '../../game-objects/logic/Character';
import {BasicConfig, meter2px} from '../../../client-data/BasicConfig';
import {
    CampfireMarker,
    GROUND_RING_REACH_M,
    MapState,
    RosterPlayer,
    fixedIconScale,
    groundRing,
    isInsideDrawnMap,
    layerOffset,
    mapScale,
    rescaleCoordinate,
    resizeTerrain,
    rimPoint,
    toZoneLocal,
    worldToMap,
} from './MapScale';
import {StartFlightMessage} from '../../backend/logic/messages/outgoing/StartFlightMessage';
import {bakeTerrain, destroyTerrain} from './MapTerrain';
import {MapFog} from './MapFog';
import {MapFogData, mergeMapFog} from './FogReveal';
import {HOME_RING_COLOR, MapCampfires} from './MapCampfires';
import {DOT_SIZE, MapPlayers} from './MapPlayers';
import {WHEEL_IDLE, WheelState, accumulateWheel, canStepRadar, snapRadarDiameter, stepRadar} from './RadarZoom';
import {DevicePrefs} from '../../common/logic/DevicePrefs';
import {getZoneData} from '../../ground-textures/logic/GroundTextureManager';
import * as Regions from '../../regions/logic/Regions';

const sizeFactorRelatedToMapSize = 2;

/**
 * How long an armed flight destination waits for its confirming second press
 * (plan-flight-paths.md C3). The spellbook Reset button's window, because it is
 * the same gesture. [PLACEHOLDER]
 */
const ARM_TIMEOUT_MS = 4000;

/**
 * The radar's home-campfire pointer (plan-minimap-local-viewport.md M3): its
 * length in canvas px, and how far inside the disc's edge it sits. [PLACEHOLDER]
 * both. ⚑ The margin is sized to clear the COMPASS, not just the round clip:
 * the N/E/S/W labels are DOM laid over the canvas's outer ~20 px, and at 8 px a
 * home due south drew its pointer under the S (seen in the M3 harness shot).
 */
const HOME_POINTER_SIZE = 10;
const HOME_POINTER_MARGIN = 24;

/**
 * The map (plan-world-map.md C1, D5) — ONE module with two states: the docked
 * minimap it has always been, and a viewport-filling full-screen state.
 *
 * ⚑ There is one Application and one marker set, and the toggle REPARENTS its
 * canvas between the two containers. That is not a stylistic choice:
 * `createMinimapIcon()` returns a single ViewContainer, and a pixi display
 * object lives in exactly one stage — a second Application would need a second
 * icon per game object, i.e. a change to IMiniMapRendered, which every game
 * object implements. It also keeps the GL context count at two on a platform
 * already at its ceiling (CLAUDE.md: the minimap is already a second per-frame
 * context; project_mobile_layout).
 *
 * ⚑ A state toggle IS a resize, so it reuses the resize path rather than
 * inventing a second one — `app.resizeTo = element` synchronously resizes and
 * emits `resize`, and onResize already walks every icon from the old scale to
 * the new one. Anything that has to happen on a state change belongs in
 * updateScaling/onResize, where a window resize will exercise it too.
 */
export class MiniMap {
    mapWidth: number;
    mapHeight: number;
    state: MapState = MapState.DOCKED;

    /**
     * All game objects added to the minimap.
     */
    registeredGameObjectIds: Set<gameObjectId> = new Set<gameObjectId>();

    dynamicIcons: { [key in LevelOfDynamic]?: { [key: gameObjectId]: MiniMapIcon } };
    iconsMarkedForRemoval: { [key: gameObjectId]: MiniMapIcon };

    application: Application;
    stage: Container;
    layerContainers: { [key in Layer]: Container };
    scale: number;
    iconSizeFactor: number;
    paused: boolean;
    playing: boolean;
    private playerCharacter: Character = null;
    private stateControlsWired = false;
    /** The baked terrain, drawn in both states (plan-minimap-local-viewport.md
     *  D4). Null until a zone is loaded, and on any zone the client has no
     *  bundled data for. */
    private terrain: Sprite = null;
    private terrainLayer: Container = null;
    /**
     * The zone's ground colour past its bounds, docked only (D7) — a child of
     * terrainLayer, so it lives and dies with it. Drawn once in px space and
     * fitted by `scale`, like the terrain sprite.
     */
    private groundRingGraphic: Graphics = null;
    /**
     * The world position (px) the docked radar is centred on: your character's,
     * or — once `clear()` has nulled it (reseedMinimap, or a death while
     * CLEAR_MINIMAP_ON_DEATH is on) — where it last was (D13). ⚑ An ordinary
     * death does NOT null it: the dead character stays referenced and its
     * getX/getY keep reading where it fell, which holds the radar by itself.
     * Null only when there never was one in this zone, which centres the zone.
     */
    private lastFocus: {x: number, y: number} | null = null;
    /**
     * The docked radar's diameter in metres (plan-minimap-local-viewport.md M2,
     * D9-D11): one of RadarZoom's steps, remembered per browser. Read once
     * here, written on every step.
     */
    private radarDiameterM = snapRadarDiameter(DevicePrefs.radarDiameterM);
    /** The wheel gesture in progress over the docked disc (RadarZoom.accumulateWheel). */
    private wheel: WheelState = WHEEL_IDLE;
    /** The rim chevron aimed at your bound fire (M3); see setupHomePointer. */
    private homePointer: Graphics = null;
    /** Re-greys the ± buttons; set when they are wired. */
    private renderRadarButtons: () => void = () => undefined;
    /** The zone the terrain above was baked from — kept so {@link rebakeTerrain}
     *  needs no argument nobody else holds. Empty until setup() runs. */
    private zoneName = '';
    /**
     * The active zone's origin in the client's px space (plan-underworld.md U4).
     * `{0,0}` for `world` and for any zone that authors none.
     *
     * ⭐ EVERY LIVE POSITION THIS MAP PLOTS IS A WORLD COORDINATE, and the map is
     * baked zone-local, so this is the term that reconciles them. Without it a
     * player in the underworld draws 300 units off their own map — silently, and
     * only in that zone. ⛔ It does NOT apply to campfire markers: those come out
     * of the zone file and are zone-local already (MapScale.campfireMarkers).
     */
    private zoneOriginX = 0;
    private zoneOriginY = 0;
    /**
     * The fog over the terrain — see MapFog's header — kept PER ZONE.
     *
     * ⭐ One fog per zone rather than one fog, because setupTerrain rebuilds on
     * every crossing and a single instance would be destroyed with it: walk down
     * a cave and back up, and the surface you had explored would be blank again.
     * Sharing ONE texture across zones is the opposite bug and just as wrong —
     * walking the caves would reveal the surface (plan-underworld.md §5.3).
     */
    private fogByZone: Map<string, MapFog> = new Map();
    /** The active zone's fog — an alias into fogByZone, never a second owner. */
    private fog: MapFog = null;
    /**
     * Every stored-reveal publication received since this join, merged
     * (plan-map-fog-persistence.md F2, D8). Kept for the WHOLE world, not per
     * zone: a zone whose fog does not exist yet (the underworld, until first
     * entered this session) takes its cells from here the moment it is created.
     */
    private storedFog: MapFogData | null = null;
    /** Discovered-campfire markers, drawn in BOTH states — see MapCampfires. */
    private campfires: MapCampfires = null;
    /**
     * The expiry timer for a pending flight arm (plan-flight-paths.md C3). The
     * armed destination ITSELF lives in MapCampfires, which draws the ring —
     * only the timeout is the press handler's business, so there is nothing
     * here for the ring to disagree with.
     */
    private armedFlightTimeout: ReturnType<typeof setTimeout> | undefined;
    /**
     * Whether this opening of the map can start a flight — true only when E at
     * a campfire opened it (see openForFlight). Cleared on every close, so it
     * can never outlive the standing-at-a-fire fact that set it.
     */
    private flightMode = false;

    /** Other players, from the 1 Hz roster, in BOTH states — see MapPlayers. */
    private players: MapPlayers = null;

    // `renderer.screen`, not `canvas.width`: screen is the LOGICAL size the
    // stage's coordinate system uses, while canvas.width is the backing store
    // (logical × resolution). They are equal today only because resolution is
    // left at 1 — see the devicePixelDensity TODO in the constructor. Reading
    // the logical size means acting on that TODO cannot silently multiply
    // every icon position by the device pixel ratio.
    public get width(): number {
        return this.application.renderer.screen.width;
    }

    public get height(): number {
        return this.application.renderer.screen.height;
    }

    constructor() {
        let container = HUD.getMinimapContainer();

        this.application = new Application();

        this.dynamicIcons = {
            [LevelOfDynamic.REMOVABLE_REMEMBERED]: {},
            [LevelOfDynamic.REMOVABLE_FORGOTTEN]: {},
            [LevelOfDynamic.DYNAMIC]: {},
        };
        this.iconsMarkedForRemoval = {};

        // noinspection JSIgnoredPromiseFromCall
        registerPreload(this.application.init({
            backgroundAlpha: 0,
            resizeTo: container as HTMLElement,
            antialias: true,
            autoDensity: true,
            // TODO apply devicePixelDensity, see game.ts
        }));
    }

    public setup(
        mapWidth: number, mapHeight: number, zoneName: string,
        zoneOriginX: number = 0, zoneOriginY: number = 0,
    ) {
        let container = HUD.getMinimapContainer();
        container.appendChild(this.application.canvas);

        // A re-setup (a second join in one page life) must not inherit an open
        // overlay from the previous one.
        this.state = MapState.DOCKED;
        HUD.getWorldMapPanel()?.classList.add('hidden');
        this.wireStateControls();

        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        // Before anything is baked or sized: setupTerrain and the first
        // updateScaling both plot against it.
        this.zoneOriginX = zoneOriginX;
        this.zoneOriginY = zoneOriginY;
        // A new join may land anywhere; holding the previous character's last
        // position would open the radar on the wrong ground for a frame.
        this.lastFocus = null;
        // ⚑ A re-setup is a second JOIN in one page life, and the fog is the
        // previous character's history. Dropping it here is the counterpart to
        // switchZone deliberately keeping it: crossing into a cave is not
        // becoming a different person.
        //
        // ⛔ Detach before destroying, and clear the alias: the masks are still
        // parented to the LIVE terrain layer at this point, and setupTerrain runs
        // at the end of this method — it would otherwise reach through a stale
        // `this.fog` and call removeFromParent on an already-destroyed sprite.
        this.fogByZone.forEach(fog => {
            fog.mask.removeFromParent();
            fog.destroy();
        });
        this.fogByZone.clear();
        this.fog = null;
        // The stored reveal belongs to the previous character too. The join's
        // own publication follows this Welcome and restores the right one.
        this.storedFog = null;

        this.stage = this.application.stage;

        this.layerContainers = {
            [Layer.CHARACTER]: createNamedContainer('character'),
            [Layer.OTHER]: createNamedContainer('other'),
        };
        // ⚑ THE DRAW ORDER IS A PO RULING, lowest first (2026-08-04, C3):
        //
        //     terrain → props → other players → you → campfires
        //
        // *"the campfire is still the most important information the map can
        // provide"*, so nothing is allowed to cover one. ⚑ This REVERSES C2's
        // "above the scenery, below the people": C2 put fires under both icon
        // layers, reasoning that a person must not be swallowed by the landmark
        // they stand at. The ruling inverts that trade — a dot lost under a
        // fire costs less than a landmark lost under a dot, because the dot
        // moves and the fire is what the map is *for*.
        //
        // What survives from C2 unchanged: fires must stay above the ~777 prop
        // icons in Layer.OTHER. Under them, a fire in dense forest is buried —
        // that was the shipped-and-caught bug, reported in-game with one fire
        // clear, one half-covered and one invisible. The harness asserts the
        // whole order as stage indices, because C2's lesson was that every
        // other leg passes while a marker is invisible.
        this.stage.addChild(this.layerContainers[Layer.OTHER]);
        this.setupPlayers();
        this.stage.addChild(this.layerContainers[Layer.CHARACTER]);
        this.setupCampfires(zoneName);
        this.setupHomePointer();

        this.zoneName = zoneName;
        this.setupTerrain(zoneName);

        this.updateScaling();

        this.application.ticker.add(this.update, this);
        this.application.renderer.addListener('resize', this.onResize, this);
    }

    /**
     * Moves the whole map to another zone (plan-underworld.md U4) — a CROSSING,
     * which is emphatically not a join.
     *
     * ⭐ IT EXISTS BECAUSE setup() IS A RESET. Driving a crossing through setup()
     * re-appends the canvas, rebuilds every layer, closes an open map, and
     * throws away two pieces of state that belong to the CHARACTER rather than
     * to the zone: the fog they have walked off, and the campfires they have
     * discovered. Both are published once and never again, so losing them loses
     * them for the session. This redoes exactly the zone-derived parts.
     */
    public switchZone(
        mapWidth: number, mapHeight: number, zoneName: string,
        zoneOriginX: number, zoneOriginY: number,
    ) {
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.zoneOriginX = zoneOriginX;
        this.zoneOriginY = zoneOriginY;
        this.zoneName = zoneName;
        // The held position belongs to the zone just left (D13).
        this.lastFocus = null;
        // The fires move, the discovered set does not.
        this.campfires?.setZone(zoneName);
        this.setupTerrain(zoneName);
        // Re-derives the scale for the new zone's bounds and redraws every
        // marker against the new origin.
        this.updateScaling();
    }

    /**
     * Installs the campfire-marker layer for a zone.
     *
     * A re-setup (a second join in one page life) rebuilds it, for the same
     * reason setupTerrain rebuilds the terrain: the old layer is ours, and
     * leaving it on the stage would stack two sets of markers — and the second
     * character's discovered set is not the first one's.
     *
     * ⚑ Anchored to the CHARACTER layer by INDEX rather than appended. Under
     * the PO's order the fires are the topmost markers, so appending is right
     * the first time through setup() — and wrong on every re-setup, where the
     * terrain layer has since been inserted at 0 and a bare append is no longer
     * expressing "just above the people". Anchoring says what is meant.
     */
    private setupCampfires(zoneName: string) {
        if (this.campfires) {
            this.campfires.destroy();
        }
        this.campfires = new MapCampfires(zoneName);
        this.campfires.layer.position.set(this.width / 2, this.height / 2);

        const characters = this.layerContainers[Layer.CHARACTER];
        const above = characters.parent === this.stage
            ? this.stage.getChildIndex(characters) + 1
            : this.stage.children.length;
        this.stage.addChildAt(this.campfires.layer, above);
    }

    /**
     * Installs the radar's home-campfire pointer (plan-minimap-local-viewport.md
     * M3, D12): a chevron on the disc's rim, aimed at your bound fire while it
     * is off the radar.
     *
     * ⚑ On the STAGE, never in an offset layer: it is placed in canvas pixels
     * from the disc centre each frame (updateHomePointer), and a layer that
     * scrolls with the world would carry it off the rim. Appended last, so it
     * sits above everything the rim could cover.
     *
     * Drawn once pointing along +x; only its position and rotation change.
     */
    private setupHomePointer() {
        this.homePointer?.destroy();
        const s = HOME_POINTER_SIZE;
        this.homePointer = new Graphics()
            .poly([s * 0.6, 0, -s * 0.4, -s * 0.5, -s * 0.4, s * 0.5])
            .fill(HOME_RING_COLOR)
            .stroke({width: 1, color: 0x000000, alpha: 0.6});
        this.homePointer.label = 'homePointer';
        this.homePointer.visible = false;
        this.stage.addChild(this.homePointer);
    }

    /**
     * Aims the rim pointer for this frame: at the home marker's bearing from
     * you, while it lies beyond the rim; hidden otherwise, and always hidden
     * full-screen, where every fire is on the map (D3).
     */
    private updateHomePointer() {
        if (!this.homePointer) {
            return;
        }
        const home = this.state === MapState.DOCKED && this.lastFocus
            ? this.campfires?.homeMarker() : null;
        const rim = home && rimPoint(
            home.x - worldToMap(this.lastFocus.x, this.scale, this.zoneOriginX),
            home.y - worldToMap(this.lastFocus.y, this.scale, this.zoneOriginY),
            Math.min(this.width, this.height) / 2,
            HOME_POINTER_MARGIN,
        );
        this.homePointer.visible = !!rim;
        if (rim) {
            this.homePointer.position.set(this.width / 2 + rim.x, this.height / 2 + rim.y);
            this.homePointer.rotation = rim.angle;
        }
    }

    /**
     * Installs the roster-dot layer, between the props and your own dot.
     *
     * ⚑ Inserted by INDEX, never appended — the C2 rule, and for the same
     * reason: appending is right on the first setup() and wrong on every
     * re-setup, where it lands on top of everything and starts hiding the very
     * markers the PO's order puts above it. Anchoring to the prop layer's index
     * means the two cannot swap however often setup() runs.
     */
    private setupPlayers() {
        if (this.players) {
            this.players.destroy();
        }
        this.players = new MapPlayers();
        this.players.layer.position.set(this.width / 2, this.height / 2);

        const props = this.layerContainers[Layer.OTHER];
        const above = props.parent === this.stage ? this.stage.getChildIndex(props) + 1 : 0;
        this.stage.addChildAt(this.players.layer, above);
    }

    /**
     * Applies a roster publication (plan-world-map.md C3): every live player in
     * the zone, ~1×/s.
     *
     * ⚑ Unlike the campfire one-shots, this genuinely changes almost every time
     * — players move — so it redraws unconditionally rather than diffing.
     */
    public setRoster(players: RosterPlayer[]) {
        if (!this.players) {
            return;
        }
        this.players.update(players);
        // Re-applied on every publication rather than latched once: on a fresh
        // join the first roster can arrive before the local character exists,
        // and this way that resolves itself a second later instead of drawing
        // your own dot twice for the rest of the session.
        this.players.setSelf(this.playerCharacter?.id ?? 0);
        this.players.draw(this.state, this.scale, {x: this.zoneOriginX, y: this.zoneOriginY});
    }

    /**
     * Applies a server publication of the discovered set + the bound fire.
     *
     * ⚑ Called every tick with whatever the snapshot carried, which is almost
     * always nothing: both are one-shots. `update` returning false is the
     * common case and skips the redraw entirely.
     */
    public setDiscoveredCampfires(discovered: string[] | undefined, home: string | undefined) {
        if (this.campfires?.update(discovered, home)) {
            this.campfires.draw(this.state, this.scale);
        }
    }

    /**
     * Applies a server publication of the stored map reveal
     * (plan-map-fog-persistence.md F2).
     *
     * ⚑ Called every tick with whatever the snapshot carried, which is almost
     * always nothing: a one-shot on entering the world (D7). What arrives is
     * MERGED into what is held (D8) and painted into every zone fog that
     * already exists; a zone seen later is painted when its fog is created.
     */
    public setMapFog(published: MapFogData | undefined) {
        if (!published) {
            return;
        }
        this.storedFog = mergeMapFog(this.storedFog, published);
        this.fogByZone.forEach(fog => fog.applyRevealed(this.application.renderer, this.storedFog));
    }

    /**
     * Re-bakes the current zone's terrain. The ONE caller is the region ground
     * tiles landing after the first bake (plan-region-primitive.md C4): the map
     * would otherwise show the fallback colours for the rest of the session,
     * which §4.7 calls what it is — a map that is a wrong drawing of the world.
     *
     * ⚑ MapTerrain's header warns that a re-bake path re-introduces the cost
     * that file exists to pay once. This is not that: it is a SECOND one-shot,
     * at zone load, only when the zone has tiles, and it goes through the exact
     * destroy-and-rebuild setupTerrain already runs on a second join.
     */
    public rebakeTerrain() {
        if (!this.stage) { return; }   // setup() has not run; nothing to re-bake
        this.setupTerrain(this.zoneName);
        this.updateScaling();
    }

    /**
     * Bakes the zone's terrain once and parks it UNDER both icon layers.
     *
     * It gets its own container rather than joining the Layer enum, so no game
     * object can ever claim it as a marker layer — but that container is
     * positioned exactly like the marker layers (canvas centre, updated in
     * updateScaling). Sharing the origin is what keeps a marker from drifting
     * away from the ground it stands on.
     */
    private setupTerrain(zoneName: string) {
        if (this.terrain) {
            // A second join in one page life: the old texture is GPU memory
            // nobody else holds a reference to, and the layer that held it is
            // ours to take off the stage.
            destroyTerrain(this.terrain);
            this.terrain = null;
        }
        // ⚑ The fog is NOT destroyed here, unlike the terrain above: it is the
        // one piece of map state that is a player's own history rather than a
        // drawing of the zone, and it is kept per zone across crossings.
        //
        // ⛔ BUT ITS MASK IS A CHILD OF THE LAYER BELOW, which is destroyed with
        // `{children: true}` — so the mask has to come OFF FIRST. Leaving it on
        // destroys the sprite of a fog we are about to hand back, and the next
        // resizeTerrain throws reading `orig` of a null texture. ⚑ This fires
        // without ever crossing a zone: rebakeTerrain re-enters here for the
        // SAME zone the moment the region ground tiles land.
        this.fog?.mask.removeFromParent();
        this.fog = null;
        if (this.terrainLayer) {
            this.terrainLayer.removeFromParent();
            // Takes the ground ring with it (a child), so only the alias is ours.
            this.terrainLayer.destroy({children: true});
            this.terrainLayer = null;
            this.groundRingGraphic = null;
        }

        this.terrain = bakeTerrain(
            this.application.renderer, zoneName, this.mapWidth, this.mapHeight);
        if (!this.terrain) {
            return;
        }

        const layer = createNamedContainer('terrain');
        layer.position.set(this.width / 2, this.height / 2);
        // ⚑ Built HERE, with the layer, and nowhere else (plan-minimap-local-
        // viewport.md §3.3): this method re-enters on a crossing AND on
        // rebakeTerrain, destroying the layer's children each time, so a ring
        // owned elsewhere would either die under its owner or keep the colour
        // of a zone already left. Below the terrain, and unmasked: it lies
        // wholly outside the bounds, where there is nothing to explore.
        this.groundRingGraphic = this.buildGroundRing(zoneName);
        layer.addChild(this.groundRingGraphic);
        layer.addChild(this.terrain);

        // The fog masks the terrain, so only what the character has walked
        // past is drawn. ⚑ The mask sprite has to be IN the scene graph to
        // have a world transform — a detached mask silently masks nothing.
        // It sits beside the terrain, not inside it, so both are fitted by the
        // same resize (updateScaling) instead of one inheriting the other's
        // scale twice.
        // Kept across crossings and rebuilt only the first time a zone is seen.
        this.fog = this.fogByZone.get(zoneName);
        if (!this.fog) {
            this.fog = new MapFog(this.application.renderer, this.mapWidth, this.mapHeight,
                this.zoneOriginX, this.zoneOriginY);
            this.fogByZone.set(zoneName, this.fog);
            // A zone first seen after the publication arrived (F2, §4.5).
            if (this.storedFog) {
                this.fog.applyRevealed(this.application.renderer, this.storedFog);
            }
        }
        layer.addChild(this.fog.mask);
        this.terrain.mask = this.fog.mask;

        this.stage.addChildAt(layer, 0);
        this.terrainLayer = layer;
    }

    /**
     * The zone's ground colour past its bounds (D7), in the zone-local px
     * space the terrain is baked in — the world's own backdrop, so the radar
     * shows Water past `world`'s edge and black past the barn's. Unscaled here;
     * updateScaling fits it with the same `scale` as the terrain sprite.
     */
    private buildGroundRing(zoneName: string): Graphics {
        const color = Regions.groundColor(getZoneData(zoneName)?.ground);
        const ring = new Graphics();
        for (const rect of groundRing(this.mapWidth, this.mapHeight, meter2px(GROUND_RING_REACH_M))) {
            ring.rect(rect.x, rect.y, rect.width, rect.height);
        }
        return ring.fill(color);
    }

    /**
     * The ways into the full-screen state (⚑ pointerdown, never click —
     * MouseManager preventDefaults mousedown on the document element, which
     * suppresses the synthetic click; a `click` listener here would silently
     * never fire).
     *
     * Wired once even if setup() runs again: these listen on HUD elements that
     * outlive a re-join, so re-registering would toggle the map twice per tap.
     */
    private wireStateControls() {
        if (this.stateControlsWired) {
            return;
        }
        this.stateControlsWired = true;

        // The docked map is itself the biggest, most obvious target for
        // "show me the map" — and on a phone it is the only one that costs no
        // permanent screen space.
        HUD.getMinimapContainer()?.addEventListener('pointerdown', () => this.open());
        document.getElementById('mapButton')
            ?.addEventListener('pointerdown', () => this.toggle());
        HUD.getWorldMapPanel()?.querySelector('.worldMapClose')
            ?.addEventListener('pointerdown', () => this.close());
        this.wireRadarZoom();

        // Click-away dismissal. The overlay is viewport-filling but the MAP
        // inside it is not — the world is 2:1, so there is normally a band of
        // empty overlay on two sides, plus the header strip. A press anywhere
        // off the drawn map means "done".
        //
        // ⚑ Presses ON the map are NOT a dismissal: that gesture is spoken for,
        // and since plan-flight-paths.md C3 it is destination selection (the
        // habit part 1 deliberately avoided teaching, now cashed in). A press
        // that hits no campfire still does nothing — the map is not a
        // fly-anywhere surface (D2: fire to fire, and only discovered ones).
        HUD.getWorldMapPanel()?.addEventListener('pointerdown', (event: PointerEvent) => {
            if (!this.isPressOnDrawnMap(event)) {
                this.close();
                return;
            }
            this.pressOnMap(event);
        });
    }

    /**
     * The radar's zoom controls (plan-minimap-local-viewport.md M2, D10): the
     * mouse wheel over the docked disc, and the ± buttons on its rim.
     *
     * ⚑ The buttons are SIBLINGS of `#minimap > .wrapper`, like the compass,
     * and the open-the-map listener sits on the wrapper — so a press on them
     * never reaches it and needs no stopPropagation. Moving them inside the
     * wrapper would make every zoom press also open the full-screen map.
     */
    private wireRadarZoom() {
        const disc = document.getElementById('minimap');
        const zoomIn = document.getElementById('radarZoomIn');
        const zoomOut = document.getElementById('radarZoomOut');

        // pointerdown, never click: MouseManager's mousedown preventDefault
        // suppresses the synthetic click on HUD elements.
        zoomIn?.addEventListener('pointerdown', () => this.zoomRadar(-1));
        zoomOut?.addEventListener('pointerdown', () => this.zoomRadar(1));

        // ⚑ Not passive: preventDefault is what stops the page from scrolling
        // under the disc. Ctrl+wheel is left to the global block (Game.ts),
        // which exists to stop browser zoom and must not also zoom the radar.
        disc?.addEventListener('wheel', (event: WheelEvent) => {
            if (event.ctrlKey || this.state !== MapState.DOCKED) {
                return;
            }
            event.preventDefault();
            const {state, step} = accumulateWheel(this.wheel, event.deltaY, event.deltaMode, event.timeStamp);
            this.wheel = state;
            if (step !== 0) {
                this.zoomRadar(step);
            }
        }, {passive: false});

        this.renderRadarButtons = () => {
            zoomIn?.classList.toggle('inactive', !canStepRadar(this.radarDiameterM, -1));
            zoomOut?.classList.toggle('inactive', !canStepRadar(this.radarDiameterM, 1));
        };
        this.renderRadarButtons();
    }

    /**
     * One radar step in (−1, a smaller patch of world) or out (+1). Docked
     * only: the full-screen map has no zoom (D3).
     *
     * ⚑ A step IS a rescale, so it goes through onResize like a window resize
     * (plan landmine 8): entity icons are kept in canvas px and walked from the
     * previous scale there. Setting the scale directly would leave every tree
     * where the old zoom put it.
     */
    public zoomRadar(direction: -1 | 1) {
        if (this.state !== MapState.DOCKED || !this.stage) {
            return;
        }
        const next = stepRadar(this.radarDiameterM, direction);
        if (next === this.radarDiameterM) {
            return;
        }
        this.radarDiameterM = next;
        DevicePrefs.radarDiameterM = String(next);
        this.onResize();
        this.renderRadarButtons();
    }

    /**
     * A press on the drawn map: arm a discovered campfire, or confirm the one
     * already armed and ask to fly there (plan-flight-paths.md C3).
     *
     * ⚑ TWO PRESSES, not one, and this is the interim of C5's confirm dialog
     * rather than a placeholder for it. A flight is COMMITTED — once airborne
     * you arrive, there is no bail-out (D11) — so a single stray press would
     * cost the player the full crossing. The arm/confirm shape is the one the
     * spellbook's Reset button already uses, and it degrades into C5's dialog
     * instead of being thrown away by it.
     *
     * ⚑ It asks; it does not decide. Every precondition is still the server's
     * (§4.4) and every refusal is still silent. What changed with the PO's
     * 2026-08-05 ruling is that the ONE precondition the map could not observe
     * — standing at a discovered fire — is now guaranteed by how the map was
     * opened rather than reported after the fact: `flightMode` is set only by
     * E at a fire. A map opened with M reads; it does not depart.
     */
    private pressOnMap(event: PointerEvent) {
        if (!this.flightMode) {
            return;
        }
        const marker = this.markerUnderPress(event);
        if (!marker) {
            // A press on open map clears a pending arm: it is the natural
            // "never mind", and leaving the ring up would let a much later
            // second press on the same fire fly without a fresh intent.
            this.disarmFlight();
            return;
        }
        if (marker.id === this.campfires?.armedId()) {
            this.disarmFlight();
            new StartFlightMessage(marker.id).send();
            this.close();
            return;
        }
        this.armFlight(marker.id);
    }

    /** The campfire marker under a press, in LAYER coordinates (canvas centre). */
    private markerUnderPress(event: PointerEvent): CampfireMarker | null {
        const box = this.application.canvas.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) {
            return null;
        }
        return this.campfires?.markerAt({
            x: event.clientX - box.left - box.width / 2,
            y: event.clientY - box.top - box.height / 2,
        }) ?? null;
    }

    private armFlight(campfireId: string) {
        this.setArmed(campfireId);
        clearTimeout(this.armedFlightTimeout);
        // Times out rather than staying armed forever: the second press has to
        // be an answer to the first, not to something the player did minutes
        // ago and has since forgotten about.
        this.armedFlightTimeout = setTimeout(() => this.disarmFlight(), ARM_TIMEOUT_MS);
    }

    /** Clears a pending arm. A no-op when nothing is armed. */
    private disarmFlight() {
        clearTimeout(this.armedFlightTimeout);
        this.armedFlightTimeout = undefined;
        this.setArmed('');
    }

    /** Arms (or clears) the ring, redrawing only when it actually changed. */
    private setArmed(campfireId: string) {
        if (this.campfires?.setArmed(campfireId)) {
            this.campfires.draw(this.state, this.scale);
        }
    }

    /**
     * Whether a press landed on the drawn map. False for the header, the
     * letterbox bands, and anything else in the overlay.
     */
    private isPressOnDrawnMap(event: PointerEvent): boolean {
        if (!this.isOpen()) {
            return false;
        }
        const canvas = this.application.canvas;
        const box = canvas.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) {
            return false;
        }

        // Via the bounding box rather than offsetX/offsetY: those are relative
        // to the event's TARGET, which is only the canvas for presses that hit
        // it — a press on the header would be measured against the header.
        return isInsideDrawnMap(
            {x: event.clientX - box.left, y: event.clientY - box.top},
            {width: box.width, height: box.height},
            {mapWidth: this.mapWidth, mapHeight: this.mapHeight},
            this.scale,
        );
    }

    public isOpen(): boolean {
        return this.state === MapState.FULLSCREEN;
    }

    /**
     * Whether the authored fire at (x, y) in ZONE units has been discovered —
     * the E prompt's gate (flight C3). Delegated to MapCampfires, which owns
     * the discovered set; the map is where that knowledge already lives, so
     * asking it beats keeping a second copy beside the interact badge.
     */
    public isDiscoveredAt(x: number, y: number): boolean {
        return this.campfires?.isDiscoveredAt(x, y) ?? false;
    }

    public toggle() {
        // Through close()/open() rather than setState directly, so the M key and
        // the map button drop a pending flight arm like every other exit does.
        if (this.isOpen()) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * The map as a MAP: fires are visible, presses do nothing (PO ruling
     * 2026-08-05). M and the map button land here.
     */
    public open() {
        this.flightMode = false;
        this.setTitle('Map');
        this.setState(MapState.FULLSCREEN);
    }

    /**
     * The map as a DEPARTURE BOARD — opened by E at a discovered campfire, the
     * only way into flight (PO ruling 2026-08-05).
     *
     * ⚑ The mode is what makes the gesture honest. Flight needs the player to
     * be STANDING at a discovered fire, and nothing on the map can show that;
     * before this, a confirmed press anywhere else was refused by the server in
     * silence (§4.4) with no way to tell the player why. Gating the gesture on
     * how the map was opened removes the case instead of reporting it: you
     * cannot reach this state unless the precondition already held.
     *
     * It is not a security boundary — the server re-validates everything, as it
     * must, since a hand-built StartFlight can still be sent. It is a promise
     * that every press the UI accepts is one the server will honour.
     */
    public openForFlight() {
        this.flightMode = true;
        // The departure board says what it wants from you; the read-only map
        // stays "Map". Stamped on every open, so no restore is needed on close.
        this.setTitle('Pick a destination to fly to...');
        this.setState(MapState.FULLSCREEN);
    }

    private setTitle(text: string) {
        const title = HUD.getWorldMapPanel()?.querySelector('.worldMapTitle');
        if (title) {
            title.textContent = text;
        }
    }

    /** A no-op when already docked, like Journal.close(). */
    public close() {
        // Every way out of the map lands here — Esc, M, the ✕, the click-away,
        // and the confirm itself — so this is the one place a pending flight arm
        // has to be dropped. Closing the map is "never mind" by any route.
        this.disarmFlight();
        this.flightMode = false;
        this.setState(MapState.DOCKED);
    }

    /**
     * Moves the single canvas between the two containers.
     *
     * ⚑ Order is load-bearing. The overlay must be un-hidden BEFORE the canvas
     * is handed to it and BEFORE resizeTo reads it: a display:none element
     * measures 0 × 0, and pixi would size the renderer to nothing. On the way
     * back the overlay is hidden only AFTER the canvas has left it, for the
     * same reason in reverse.
     */
    private setState(next: MapState) {
        if (this.state === next || !this.stage) {
            // No stage yet means setup() has not run — there is nothing to
            // show and no scale to compute.
            return;
        }

        const panel = HUD.getWorldMapPanel();
        const fullscreenWrapper = panel?.querySelector('.wrapper');
        const dockedWrapper = HUD.getMinimapContainer();
        if (!panel || !fullscreenWrapper || !dockedWrapper) {
            return;
        }

        this.state = next;

        if (next === MapState.FULLSCREEN) {
            panel.classList.remove('hidden');
            fullscreenWrapper.appendChild(this.application.canvas);
            this.application.resizeTo = fullscreenWrapper as HTMLElement;
        } else {
            dockedWrapper.appendChild(this.application.canvas);
            this.application.resizeTo = dockedWrapper as HTMLElement;
            panel.classList.add('hidden');
        }

        // resizeTo resizes synchronously and emits `resize`, so onResize has
        // usually run already. Calling it again is deliberate and idempotent
        // (the second pass rescales by scale/scale = 1): the renderer skips
        // nothing, but the two containers CAN happen to be the same size, and
        // a state change must re-derive the scale even when the pixels did not
        // move — docked and full-screen fit differently at identical sizes.
        this.onResize();
    }

    private updateScaling() {
        const previousScale = this.scale;
        this.scale = mapScale(
            this.state,
            {width: this.width, height: this.height},
            {mapWidth: this.mapWidth, mapHeight: this.mapHeight},
            meter2px(this.radarDiameterM),
        );
        this.iconSizeFactor = this.scale * sizeFactorRelatedToMapSize;

        // After the scale, because the docked offset is measured in it — and
        // HERE as well as per frame, so a resize or a state toggle never shows
        // a frame of the world snapped to the zone centre (plan-minimap-local-
        // viewport.md §3.2).
        this.positionLayers();

        if (this.terrain) {
            // Two numbers, no rasterisation — see MapTerrain's header. Drawn in
            // both states since plan-minimap-local-viewport.md D4: at radar zoom
            // the ground is what the disc is for.
            resizeTerrain(this.terrain, this.mapWidth, this.mapHeight, this.scale);
            // ⚑ The mask must be fitted to exactly the same rectangle. A mask
            // at a different scale does not look like a scaling bug — it looks
            // like the fog is revealing the wrong places.
            if (this.fog) {
                resizeTerrain(this.fog.mask, this.mapWidth, this.mapHeight, this.scale);
            }
        }
        if (this.groundRingGraphic) {
            // Drawn in px space, so the scale IS its fit. Docked only (D7): the
            // full-screen letterbox stays the overlay's own (D3).
            this.groundRingGraphic.scale.set(this.scale);
            this.groundRingGraphic.visible = this.state === MapState.DOCKED;
        }

        // The markers are placed by the same scale, so they are re-derived here
        // rather than walked from the old scale like the entity icons. Their
        // source of truth is a set the server published, not a position on a
        // canvas — nothing about them has to be preserved across a resize.
        //
        // ⚑ Redrawn on a STATE change too, and not only on a size change: the
        // marker size is per state, so the same canvas dimensions still need a
        // new drawing.
        this.campfires?.draw(this.state, this.scale);
        // Same reasoning for the roster dots, which are placed by the scale and
        // sized by the icon factor — both of which have just been re-derived.
        // Redrawing from the held roster keeps them on the ground they were on
        // across a resize or a state toggle, with no wait for the next 1 Hz
        // publication (otherwise opening the map could show a second of dots
        // sitting at their docked-scale positions).
        // ⚑ With the origin: roster positions are WORLD px, and without it a
        // resize in the underworld drew every dot 300 units off until the next
        // publication.
        this.players?.draw(this.state, this.scale, {x: this.zoneOriginX, y: this.zoneOriginY});

        // After the redraws: the pointer aims at the marker AS DRAWN, and a state
        // toggle must hide or show it without waiting for the next frame.
        this.updateHomePointer();

        return previousScale;
    }

    /**
     * Moves every map layer to where it belongs this frame: the canvas centre
     * full-screen, and under the pinned player docked (layerOffset).
     *
     * ⚑ EVERY layer, together. One left behind does not look wrong at the
     * centre — it looks like fires or dots sliding off their ground as you walk.
     */
    private positionLayers() {
        const offset = layerOffset(
            this.state,
            {width: this.width, height: this.height},
            this.scale,
            this.lastFocus,
            {x: this.zoneOriginX, y: this.zoneOriginY},
        );
        if (this.layerContainers) {
            Object.values(this.layerContainers).forEach((layerContainer) => {
                layerContainer.position.set(offset.x, offset.y);
            });
        }
        this.terrainLayer?.position.set(offset.x, offset.y);
        this.campfires?.layer.position.set(offset.x, offset.y);
        this.players?.layer.position.set(offset.x, offset.y);
    }

    private onResize() {
        const previousScale = this.updateScaling();

        // Adjust all minimap icon's position & size
        [Layer.CHARACTER, Layer.OTHER].forEach((layer) => {
            this.layerContainers[layer].children.forEach((child) => {
                this.updateMinimapIconOnResize(child, previousScale, layer);
            });
        });
    }

    private updateMinimapIconOnResize(child: ContainerChild, previousScale: number, layer: Layer) {
        child.position.set(
            rescaleCoordinate(child.position.x, previousScale, this.scale),
            rescaleCoordinate(child.position.y, previousScale, this.scale),
        );
        this.applyIconScale(child, layer);
    }

    /**
     * Sizes an entity icon for the current state and scale.
     *
     * Trees and stones (Layer.OTHER) stay GEOGRAPHIC — `iconSizeFactor` rides the
     * scale, so they zoom with the ground they stand on, which is what a radar
     * should do. ⭐ Your own dot is the exception (plan-minimap-local-viewport.md
     * D6): it is the only thing on Layer.CHARACTER (every other character opts
     * out of the minimap), and at radar zoom the geographic rule made it a
     * ~24 px blob. It is drawn at the roster dots' size instead, per state.
     */
    private applyIconScale(icon: ContainerChild, layer: Layer) {
        if (layer !== Layer.CHARACTER) {
            icon.scale.set(this.iconSizeFactor);
            return;
        }
        // getLocalBounds is the UNSCALED geometry, so this is stable however
        // many times it runs.
        icon.scale.set(fixedIconScale(icon.getLocalBounds().width, DOT_SIZE[this.state]));
    }

    public start() {
        this.play();
    }

    public stop() {
        this.pause();
    }

    private play() {
        this.playing = true;
        this.paused = false;
        this.application.start();
    };

    private pause() {
        this.playing = false;
        this.paused = true;
        this.application.stop();
    };

    private update() {
        // Discovery happens while PLAYING, not while looking at the map — the
        // fog accumulates whether the map is open or docked, which is what
        // makes opening it show where you have been rather than where you are.
        if (this.fog && this.playerCharacter) {
            // ⚑ Zone-local, not world: revealAt corner-origins the coordinate
            // against the ZONE's rectangle, so a world y of 300 units would
            // stamp far off the texture and reveal nothing at all.
            this.fog.revealAt(
                this.application.renderer,
                toZoneLocal(this.playerCharacter.getX(), this.zoneOriginX),
                toZoneLocal(this.playerCharacter.getY(), this.zoneOriginY),
            );
        }

        Object.values(this.dynamicIcons[LevelOfDynamic.DYNAMIC]).forEach((icon: MiniMapIcon) => {
            icon.shape.position.x = worldToMap(icon.gameObject.getX(), this.scale, this.zoneOriginX);
            icon.shape.position.y = worldToMap(icon.gameObject.getY(), this.scale, this.zoneOriginY);
        });

        // The radar follows AFTER the icons are placed, from the same getX/getY,
        // so your dot never lags a frame behind the centre (plan-minimap-local-
        // viewport.md landmine 1). Without a character (clear() nulled it)
        // the last position is simply kept (D13).
        if (this.playerCharacter) {
            const x = this.playerCharacter.getX();
            const y = this.playerCharacter.getY();
            if (Number.isFinite(x) && Number.isFinite(y)) {
                this.lastFocus = {x, y};
            }
        }
        this.positionLayers();
        this.updateHomePointer();

        // Icons that have been marked for removal and should now be in range again
        // will actually be removed --> if they are actually in range, they would not be marked anymore
        Object.values(this.iconsMarkedForRemoval).forEach((icon: MiniMapIcon) => {
            if (this.isInViewport(icon)) {
                // Is within viewport --> drop
                icon.shape.removeFromParent();
                delete this.dynamicIcons[LevelOfDynamic.REMOVABLE_REMEMBERED][icon.gameObjectId];
                delete this.iconsMarkedForRemoval[icon.gameObjectId];
            }
        });
    }

    private isInViewport(icon: MiniMapIcon) {
        if (this.playerCharacter === null) {
            return true;
        }
        if (Math.abs(this.playerCharacter.getX() - icon.gameObject.getX()) > (BasicConfig.VIEWPORT.WIDTH / 2)) {
            return false;
        }
        if (Math.abs(this.playerCharacter.getY() - icon.gameObject.getY()) > (BasicConfig.VIEWPORT.HEIGHT / 2)) {
            return false;
        }

        return true;
    }

    setPlayerCharacter(character: Character) {
        this.playerCharacter = character;
    }

    /**
     * Adds the icon of the object to the map.
     */
    public add(gameObject: IMiniMapRendered) {
        if (this.registeredGameObjectIds.has(gameObject.id)) {
            // The object is already on the mini map
            return;
        }

        this.registeredGameObjectIds.add(gameObject.id);

        if (gameObject.miniMapDynamic === LevelOfDynamic.REMOVABLE_REMEMBERED &&
            this.iconsMarkedForRemoval.hasOwnProperty(gameObject.id)) {
            delete this.iconsMarkedForRemoval[gameObject.id];
            return;
        }

        // Position each icon relative to its position on the real map.
        const minimapIcon = gameObject.createMinimapIcon();
        this.layerContainers[gameObject.miniMapLayer].addChild(minimapIcon);

        minimapIcon.position.set(
            worldToMap(gameObject.getX(), this.scale, this.zoneOriginX),
            worldToMap(gameObject.getY(), this.scale, this.zoneOriginY),
        );
        this.applyIconScale(minimapIcon, gameObject.miniMapLayer);

        if (gameObject.miniMapDynamic > LevelOfDynamic.STATIC) {
            this.dynamicIcons[gameObject.miniMapDynamic][gameObject.id] = {
                gameObjectId: gameObject.id,
                shape: minimapIcon,
                gameObject: gameObject,
            };
        }
    }

    public remove(gameObject: IMiniMapRendered) {
        switch (gameObject.miniMapDynamic) {
            case LevelOfDynamic.STATIC:
                // Doesn't get removed
                return;

            case LevelOfDynamic.REMOVABLE_REMEMBERED: {
                // only remove if within viewport. Otherwise, mark for removal and
                // remove as soon as in viewport OR de-mark if added again
                const icon = this.dynamicIcons[LevelOfDynamic.REMOVABLE_REMEMBERED][gameObject.id];
                if (this.isInViewport(icon)) {
                    // Is within viewport --> drop
                    icon.shape.removeFromParent();
                    delete this.dynamicIcons[LevelOfDynamic.REMOVABLE_REMEMBERED][gameObject.id];
                } else {
                    this.iconsMarkedForRemoval[gameObject.id] = icon;
                }
                break;
            }

            case LevelOfDynamic.REMOVABLE_FORGOTTEN:
            case LevelOfDynamic.DYNAMIC: {
                // Just remove it - if gone from viewport or actually removed doesn't make a difference
                const icon = this.dynamicIcons[gameObject.miniMapDynamic][gameObject.id];
                icon.shape.removeFromParent();
                delete this.dynamicIcons[gameObject.miniMapDynamic][gameObject.id];
                break;
            }
        }

        this.registeredGameObjectIds.delete(gameObject.id);
    }

    /**
     * Drops every ENTITY icon. Deliberately leaves the terrain, the fog and the
     * campfire markers alone — none of the three comes from an entity, and the
     * one caller that matters is backlog §53's "the spectator's view is not the
     * character's", which is a statement about entities only.
     *
     * ⚑ The roster dots ARE dropped, though they are not entities either, and
     * the reason is the other caller: death. The roster only goes to players in
     * the world, so a dead client stops receiving publications — and without
     * this the last roster before dying would stay frozen on the map for as
     * long as the death overlay is up. Rejoining repopulates it within a
     * second; there is nothing to rebuild here, unlike the icons.
     */
    public clear() {
        this.players?.update([]);
        this.players?.draw(this.state, this.scale);

        this.registeredGameObjectIds.clear();

        this.dynamicIcons[LevelOfDynamic.REMOVABLE_REMEMBERED] = {};
        this.dynamicIcons[LevelOfDynamic.REMOVABLE_FORGOTTEN] = {};
        this.dynamicIcons[LevelOfDynamic.DYNAMIC] = {};
        this.iconsMarkedForRemoval = {};

        Object.values(this.layerContainers).forEach((layerContainer) => {
            layerContainer.removeChildren();
        });

        this.playerCharacter = null;
    }
}

interface MiniMapIcon {
    gameObjectId: gameObjectId;
    shape: ViewContainer;
    gameObject: IMiniMapRendered;
}
