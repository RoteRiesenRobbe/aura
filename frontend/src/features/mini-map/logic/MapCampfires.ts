/**
 * Campfire markers on both map states (plan-world-map.md C2).
 *
 * ⚑ THE SET IS SERVER STATE, not an entity lifecycle. Every other icon on this
 * map comes from a game object that entered the AOI and implements
 * IMiniMapRendered; these come from the owner-only GameState fields
 * `discovered_campfires` + `home_campfire`, crossed with the zone data the
 * client already bundles. That is why the layer lives OUTSIDE
 * MiniMap.layerContainers and outside LevelOfDynamic entirely: pushing markers
 * with their own source of truth through the REMOVABLE_REMEMBERED lifecycle is
 * exactly the confusion the plan's landmine 5 warns about.
 *
 * ⚑ NOT MASKED BY THE FOG, deliberately. A discovered fire is one this
 * character has stood at, so it is on revealed ground by construction — and
 * unlike the terrain, the markers survive a logout while the fog does not.
 *
 * ⚑ Markers are a CONSTANT SIZE PER STATE rather than riding the map scale.
 * Docked scale is ~0.010 and full-screen ~0.111, a 10× spread: one factor for
 * both means a marker that is either a single pixel docked or a splodge that
 * covers a zone full-screen.
 */

import {Container, Graphics, Sprite} from 'pixi.js';
import {createInjectedSVG} from '../../core/logic/InjectedSVG';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import {Campfire} from '../../game-objects/logic/Mobs';
import {getZoneData} from '../../ground-textures/logic/GroundTextureManager';
import {meter2px} from '../../../client-data/BasicConfig';
import {campfireMarkers, MapState, ZoneCampfirePoint} from './MapScale';

/**
 * Marker size in canvas pixels, per state. [PLACEHOLDER]
 *
 * The docked map is ~200 px across for the whole 144-unit world, so its marker
 * has to stay small enough that five of them do not read as one blob; the
 * full-screen map has ten times the room.
 */
const MARKER_SIZE = {
    [MapState.DOCKED]: 9,
    [MapState.FULLSCREEN]: 26,
};

/**
 * The bound fire's highlight ring, as a multiple of the marker size, and its
 * colour — the same orange the "Bound to campfire" floating text uses, so the
 * two readings of one fact look like one fact.
 */
const HOME_RING_FACTOR = 0.85;
const HOME_RING_COLOR = 0xE37313;

export class MapCampfires {
    /** Add to the stage under the icon layers; positioned like the terrain. */
    readonly layer: Container;

    private campfires: ZoneCampfirePoint[] = [];
    private discovered = new Set<string>();
    private home = '';

    constructor(zoneName: string) {
        this.layer = createNamedContainer('campfires');
        // Absent bundled data degrades to "no markers", the same way the map
        // degrades to no terrain — never a throw on a zone the client does not
        // happen to ship.
        this.campfires = (getZoneData(zoneName)?.campfires || []) as ZoneCampfirePoint[];
    }

    /**
     * Applies a server publication. Returns whether anything changed, so a
     * caller can skip the redraw on the overwhelmingly common no-op.
     *
     * ⚑ `undefined` means "not published this tick", NOT "cleared" — the fields
     * are one-shots that only ride the wire when they change. Treating an absent
     * field as an empty set would blank the map on every tick but two.
     */
    update(discovered: string[] | undefined, home: string | undefined): boolean {
        let changed = false;
        if (discovered !== undefined && discovered !== null) {
            if (discovered.length !== this.discovered.size
                || discovered.some((id) => !this.discovered.has(id))) {
                this.discovered = new Set(discovered);
                changed = true;
            }
        }
        if (home !== undefined && home !== null && home !== '' && home !== this.home) {
            this.home = home;
            changed = true;
        }
        return changed;
    }

    /**
     * Rebuilds every marker for a state and scale.
     *
     * Rebuild-over-diff is the deliberate choice: there are five campfires in
     * the world, this runs on a state toggle or a window resize, and a diffing
     * path would be more code than it could ever save.
     */
    draw(state: MapState, scale: number) {
        // ⚑ `texture: false` explicitly: the marker sprites share the world's
        // preloaded Campfire texture, and destroying it here would blank every
        // campfire in the game the first time the map redrew.
        this.layer.removeChildren()
            .forEach((child) => child.destroy({children: true, texture: false}));

        const size = MARKER_SIZE[state];
        for (const marker of campfireMarkers(
            this.campfires, this.discovered, this.home, scale, meter2px(1))) {

            if (marker.home) {
                // Behind the sprite, so the flame stays the thing you read and
                // the ring is what tells you which flame is yours.
                this.layer.addChild(new Graphics()
                    .circle(marker.x, marker.y, size * HOME_RING_FACTOR)
                    .stroke({width: Math.max(1, size * 0.16), color: HOME_RING_COLOR}));
            }
            this.layer.addChild(this.sprite(marker.x, marker.y, size));
        }
    }

    /**
     * ⚑ Campfire.svg is the SAME preloaded texture the world's campfires draw
     * from, so the marker cannot drift from the thing it stands for — and it is
     * never destroyed with the sprite (`texture: false` below), or the fires in
     * the world would blank the first time the map redrew.
     */
    private sprite(x: number, y: number, size: number): Sprite {
        return createInjectedSVG(Campfire.svg, x, y, size / 2);
    }

    destroy() {
        this.layer.removeFromParent();
        this.layer.destroy({children: true, texture: false});
    }
}
