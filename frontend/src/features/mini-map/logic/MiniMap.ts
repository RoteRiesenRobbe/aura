import {Application, Container, ContainerChild, Sprite, ViewContainer} from 'pixi.js';
import {registerPreload} from '../../core/logic/Preloading';
import * as HUD from '../../user-interface/HUD/logic/HUD';
import {IMiniMapRendered, Layer, LevelOfDynamic} from './MiniMapInterfaces';
import {gameObjectId} from '../../common/logic/Types';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import {Character} from '../../game-objects/logic/Character';
import {BasicConfig} from '../../../client-data/BasicConfig';
import {MapState, isInsideDrawnMap, mapScale, rescaleCoordinate, resizeTerrain} from './MapScale';
import {bakeTerrain, destroyTerrain} from './MapTerrain';
import {MapFog} from './MapFog';
import {MapCampfires} from './MapCampfires';

const sizeFactorRelatedToMapSize = 2;

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
    /** The baked terrain, drawn only in the full-screen state. Null until a
     *  zone is loaded, and on any zone the client has no bundled data for. */
    private terrain: Sprite = null;
    private terrainLayer: Container = null;
    /** Session-only fog over the terrain — see MapFog's header. */
    private fog: MapFog = null;
    /** Discovered-campfire markers, drawn in BOTH states — see MapCampfires. */
    private campfires: MapCampfires = null;

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

    public setup(mapWidth: number, mapHeight: number, zoneName: string) {
        let container = HUD.getMinimapContainer();
        container.appendChild(this.application.canvas);

        // A re-setup (a second join in one page life) must not inherit an open
        // overlay from the previous one.
        this.state = MapState.DOCKED;
        HUD.getWorldMapPanel()?.classList.add('hidden');
        this.wireStateControls();

        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;

        this.stage = this.application.stage;

        this.layerContainers = {
            [Layer.CHARACTER]: createNamedContainer('character'),
            [Layer.OTHER]: createNamedContainer('other'),
        };
        // ⚑ THE MARKER LAYER GOES BETWEEN THE TWO ICON LAYERS, and the split is
        // the whole point. Under OTHER — which is where the ~777 prop icons
        // live — a fire in dense forest is completely buried; that was the
        // shipped-and-caught bug, reported in-game with one fire clear, one
        // half-covered and one invisible. Over CHARACTER it would hide the
        // player dot standing at the fire. Above the scenery, below the people.
        this.stage.addChild(this.layerContainers[Layer.OTHER]);
        this.setupCampfires(zoneName);
        this.stage.addChild(this.layerContainers[Layer.CHARACTER]);

        this.setupTerrain(zoneName);

        this.updateScaling();

        this.application.ticker.add(this.update, this);
        this.application.renderer.addListener('resize', this.onResize, this);
    }

    /**
     * Installs the campfire-marker layer for a zone.
     *
     * A re-setup (a second join in one page life) rebuilds it, for the same
     * reason setupTerrain rebuilds the terrain: the old layer is ours, and
     * leaving it on the stage would stack two sets of markers — and the second
     * character's discovered set is not the first one's.
     *
     * ⚑ Inserted just above the OTHER layer by INDEX rather than appended.
     * Appending happens to be right the first time through setup() and wrong on
     * every re-setup, where it would land above CHARACTER and start hiding the
     * player dot — a bug that only a second join in one page life could show.
     */
    private setupCampfires(zoneName: string) {
        if (this.campfires) {
            this.campfires.destroy();
        }
        this.campfires = new MapCampfires(zoneName);
        this.campfires.layer.position.set(this.width / 2, this.height / 2);

        const props = this.layerContainers[Layer.OTHER];
        const above = props.parent === this.stage ? this.stage.getChildIndex(props) + 1 : 0;
        this.stage.addChildAt(this.campfires.layer, above);
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
        if (this.fog) {
            this.fog.destroy();
            this.fog = null;
        }
        if (this.terrainLayer) {
            this.terrainLayer.removeFromParent();
            this.terrainLayer.destroy({children: true});
            this.terrainLayer = null;
        }

        this.terrain = bakeTerrain(
            this.application.renderer, zoneName, this.mapWidth, this.mapHeight);
        if (!this.terrain) {
            return;
        }

        const layer = createNamedContainer('terrain');
        layer.position.set(this.width / 2, this.height / 2);
        layer.addChild(this.terrain);

        // The fog masks the terrain, so only what the character has walked
        // past is drawn. ⚑ The mask sprite has to be IN the scene graph to
        // have a world transform — a detached mask silently masks nothing.
        // It sits beside the terrain, not inside it, so both are fitted by the
        // same resize (updateScaling) instead of one inheriting the other's
        // scale twice.
        this.fog = new MapFog(this.application.renderer, this.mapWidth, this.mapHeight);
        layer.addChild(this.fog.mask);
        this.terrain.mask = this.fog.mask;

        this.stage.addChildAt(layer, 0);
        this.terrainLayer = layer;
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

        // Click-away dismissal. The overlay is viewport-filling but the MAP
        // inside it is not — the world is 2:1, so there is normally a band of
        // empty overlay on two sides, plus the header strip. A press anywhere
        // off the drawn map means "done".
        //
        // ⚑ Presses ON the map are deliberately ignored rather than closing:
        // that gesture is spoken for. Part 2 turns it into destination
        // selection, and a map that closed when you clicked it would have to
        // un-learn the habit later.
        HUD.getWorldMapPanel()?.addEventListener('pointerdown', (event: PointerEvent) => {
            if (!this.isPressOnDrawnMap(event)) {
                this.close();
            }
        });
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

    public toggle() {
        this.setState(this.isOpen() ? MapState.DOCKED : MapState.FULLSCREEN);
    }

    public open() {
        this.setState(MapState.FULLSCREEN);
    }

    /** A no-op when already docked, like Journal.close(). */
    public close() {
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
        Object.values(this.layerContainers).forEach((layerContainer) => {
            layerContainer.position.set(
                this.width / 2,
                this.height / 2,
            );
        });
        this.terrainLayer?.position.set(this.width / 2, this.height / 2);
        this.campfires?.layer.position.set(this.width / 2, this.height / 2);

        const previousScale = this.scale;
        this.scale = mapScale(
            this.state,
            {width: this.width, height: this.height},
            {mapWidth: this.mapWidth, mapHeight: this.mapHeight},
        );
        this.iconSizeFactor = this.scale * sizeFactorRelatedToMapSize;

        if (this.terrain) {
            // Two numbers, no rasterisation — see MapTerrain's header. Terrain
            // is a full-screen-only affordance (the plan's §4.1 table): the
            // docked minimap has never drawn it and is not gaining it here.
            resizeTerrain(this.terrain, this.mapWidth, this.mapHeight, this.scale);
            this.terrain.visible = this.state === MapState.FULLSCREEN;
            // ⚑ The mask must be fitted to exactly the same rectangle. A mask
            // at a different scale does not look like a scaling bug — it looks
            // like the fog is revealing the wrong places.
            if (this.fog) {
                resizeTerrain(this.fog.mask, this.mapWidth, this.mapHeight, this.scale);
            }
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

        return previousScale;
    }

    private onResize() {
        const previousScale = this.updateScaling();

        // Adjust all minimap icon's position & size
        Object.values(this.layerContainers).forEach((layerContainer) => {
            layerContainer.children.forEach((child) => {
                this.updateMinimapIconOnResize(child, previousScale);
            });
        });
    }

    private updateMinimapIconOnResize(child: ContainerChild, previousScale: number) {
        child.position.set(
            rescaleCoordinate(child.position.x, previousScale, this.scale),
            rescaleCoordinate(child.position.y, previousScale, this.scale),
        );
        child.scale.set(this.iconSizeFactor);
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
            this.fog.revealAt(
                this.application.renderer,
                this.playerCharacter.getX(),
                this.playerCharacter.getY(),
            );
        }

        Object.values(this.dynamicIcons[LevelOfDynamic.DYNAMIC]).forEach((icon: MiniMapIcon) => {
            icon.shape.position.x = icon.gameObject.getX() * this.scale;
            icon.shape.position.y = icon.gameObject.getY() * this.scale;
        });

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
            gameObject.getX() * this.scale,
            gameObject.getY() * this.scale,
        );
        minimapIcon.scale.set(this.iconSizeFactor);

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
     */
    public clear() {
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
