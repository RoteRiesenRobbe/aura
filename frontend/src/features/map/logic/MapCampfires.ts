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
import {
    CampfireMarker,
    campfireMarkers,
    MapState,
    pickCampfireMarker,
    ZoneCampfirePoint,
} from './MapScale';

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

/**
 * The armed-destination ring (plan-flight-paths.md C3): the fire a first press
 * selected, awaiting the confirming second press. Drawn OUTSIDE the home ring
 * and in a different colour, because the two rings answer different questions
 * and one fire can be the answer to both.
 * [PLACEHOLDER — the whole marker vocabulary is, since world-map C2.]
 */
const ARMED_RING_FACTOR = 1.15;
const ARMED_RING_COLOR = 0x7FD1E8;

export class MapCampfires {
    /**
     * Add to the stage ABOVE both icon layers — the topmost markers on the map
     * (PO ruling 2026-08-04: *"the campfire is still the most important
     * information the map can provide"*, so nothing may cover one). Positioned
     * like the terrain.
     */
    readonly layer: Container;

    private campfires: ZoneCampfirePoint[] = [];
    private discovered = new Set<string>();
    private home = '';
    /**
     * The markers as last drawn, in layer coordinates — the hit-test set for
     * the flight click (plan-flight-paths.md C3).
     *
     * ⚑ WHAT WAS DRAWN, not what could be: recomputing the layout at press time
     * would let a press hit a marker the player cannot see, whenever the map
     * has been resized or toggled since the last draw. Every draw refreshes it,
     * which is also what makes a stale scale impossible.
     */
    private drawn: CampfireMarker[] = [];
    /** Marker size of the last draw — also the press hit radius. */
    private markerSize = 0;
    /**
     * The destination armed by a first press, awaiting confirmation
     * (plan-flight-paths.md C3); '' = nothing armed. THE only copy — the arm is
     * client-side intent the server never hears about, and it lives here rather
     * than in `MiniMap` because this is the object that has to draw it. A second
     * field alongside the press handler could only drift from the ring on
     * screen.
     */
    private armed = '';

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
        this.markerSize = size;
        this.drawn = campfireMarkers(
            this.campfires, this.discovered, this.home, scale, meter2px(1));
        for (const marker of this.drawn) {
            if (marker.home) {
                // Behind the sprite, so the flame stays the thing you read and
                // the ring is what tells you which flame is yours.
                this.layer.addChild(new Graphics()
                    .circle(marker.x, marker.y, size * HOME_RING_FACTOR)
                    .stroke({width: Math.max(1, size * 0.16), color: HOME_RING_COLOR}));
            }
            if (marker.id === this.armed) {
                // Outside the home ring rather than replacing it — a fire can be
                // both your bind point and the one you are about to fly to, and
                // the two facts must not hide each other.
                this.layer.addChild(new Graphics()
                    .circle(marker.x, marker.y, size * ARMED_RING_FACTOR)
                    .stroke({width: Math.max(1, size * 0.2), color: ARMED_RING_COLOR}));
            }
            this.layer.addChild(this.sprite(marker.x, marker.y, size));
        }
    }

    /**
     * Which discovered fire a press in LAYER coordinates landed on, or null.
     * The hit radius is the marker's own size, so the target grows with the
     * icon and a docked-map press stays as forgiving as it looks.
     */
    markerAt(point: {x: number, y: number}): CampfireMarker | null {
        return pickCampfireMarker(this.drawn, point, this.markerSize);
    }

    /**
     * Arms (or clears, with '') the destination highlight. Returns whether the
     * caller needs a redraw — the ring is drawn, not toggled, so a no-op arm
     * must not rebuild the layer.
     */
    setArmed(campfireId: string): boolean {
        if (this.armed === campfireId) {
            return false;
        }
        this.armed = campfireId;
        return true;
    }

    /** The armed destination, or '' — what the ring on screen is showing. */
    armedId(): string {
        return this.armed;
    }

    /**
     * Whether the authored fire nearest to (x, y) — in ZONE units — has been
     * discovered (plan-flight-paths.md C3, the E prompt's gate).
     *
     * ⚑ It takes a POSITION rather than an id because the caller has a campfire
     * ENTITY, and the wire mob carries no spawn-point id — the two namespaces
     * only ever meet through the position they were both authored from. The
     * tolerance is deliberately tight: these are the same authored coordinates
     * on both sides, so anything but a near-exact match means the caller is
     * asking about something that is not an authored fire at all.
     *
     * The gate exists so the prompt cannot lie: flight validation requires the
     * ORIGIN discovered too (§4.4), and an E that opened a map whose every
     * press was then silently refused is the failure this whole entry point
     * was built to remove.
     */
    isDiscoveredAt(x: number, y: number): boolean {
        const tolerance = 0.5;
        for (const fire of this.campfires) {
            if (!fire.id || !this.discovered.has(fire.id)) {
                continue;
            }
            if (Math.abs(fire.x - x) <= tolerance && Math.abs(fire.y - y) <= tolerance) {
                return true;
            }
        }
        return false;
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
