/**
 * Other players' dots on both map states (plan-world-map.md C3, D7).
 *
 * ⚑ THE ROSTER IS SERVER STATE, not an entity lifecycle — the MapCampfires
 * contract verbatim. The dots come from the 1 Hz PlayerRoster message, not from
 * game objects that entered the AOI, so this layer lives OUTSIDE
 * MiniMap.layerContainers and outside LevelOfDynamic entirely (the plan's
 * landmine 5: markers with their own source of truth must not be pushed through
 * REMOVABLE_REMEMBERED, whose removal rule is "left the viewport" rather than
 * "left the roster").
 *
 * ⚑ AND IT IS THE *ONLY* SOURCE for other players. §2 of the plan recorded that
 * other characters already appear on the minimap; they never have —
 * `Character.visibleOnMinimap` is false in the constructor and only the local
 * `Player` flips it true. So there is nothing to reconcile against, and the
 * landmine-6 arbitration the plan asked for reduces to "skip your own id".
 *
 * ⚑ NOT MASKED BY THE FOG. A player standing in ground you have never walked is
 * still drawn: the fog hides terrain you have not seen, and D7's whole ask is
 * "the world feels populated" — which a fog that ate every distant dot would
 * defeat. (Discovered campfires are unmasked for a different reason: they are on
 * revealed ground by construction.)
 *
 * ⚑ THE DOTS STEP, once a second, while your own dot glides. That asymmetry is
 * the accepted, written-down cost of a 1 Hz roster (core/net.go's
 * rosterIntervalTicks) — interpolating a marker a few pixels across is a moving
 * average nobody has asked for yet.
 */

import {Container, Graphics} from 'pixi.js';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import {GraphicsConfig} from '../../../client-data/Graphics';
import {MapState, RosterMarker, RosterPlayer, rosterMarkers} from './MapScale';

/**
 * Dot diameter in canvas pixels, per state. [PLACEHOLDER]
 *
 * ⚑ A CONSTANT PER STATE, like the campfire markers, and NOT the own dot's
 * scale-derived size — which is what this was first built as, on the reasoning
 * that the PO's "same shape and size as your own dot" was best honoured by
 * feeding both from one number. Measured, that produced a **29.2 px** dot
 * full-screen against a **26.0 px** campfire marker: at the time the dots drew
 * above the fires, so a player standing at a fire erased it.
 *
 * The layer order has since been inverted by PO ruling (fires on top — see
 * MiniMap.setup), which makes that particular collision impossible. The
 * constants stay anyway: they were the sizes the PO looked at and kept, and a
 * dot that grows to 29 px full-screen and shrinks to 4 px docked is a marker
 * whose legibility depends on which state you are in.
 */
const DOT_SIZE = {
    [MapState.DOCKED]: 7,
    [MapState.FULLSCREEN]: 20,
};

export class MapPlayers {
    /** Add to the stage above the campfires, below the character layer. */
    readonly layer: Container;

    /**
     * The last roster, kept whole rather than reduced to positions.
     *
     * ⚑ Deliberately holds the entries, ids included, though nothing drawn
     * today needs an id: the PO ruled "no names in v1, but a hover readout may
     * come — don't block it". A layer that threw the ids away after drawing
     * would make that a wire change instead of a client one.
     */
    private players: RosterPlayer[] = [];
    private selfId = 0;

    constructor() {
        this.layer = createNamedContainer('players');
    }

    /**
     * Applies a roster publication.
     *
     * No change detection, unlike MapCampfires: a moving player changes this
     * every second, so the common case IS a redraw and a comparison pass would
     * only ever be work that found something.
     *
     * ⚑ THE WHOLE ROSTER, EVERY TIME, and absence means gone. There is no
     * removal message to miss, so a disconnected player cannot leave a stale
     * dot parked where they logged out.
     */
    update(players: RosterPlayer[]) {
        this.players = players || [];
    }

    /**
     * Tells the layer which dot is the local player, so it can be skipped.
     *
     * Kept as its own call rather than an argument to update(): the roster
     * arrives before the local character exists on a fresh join, and the id
     * is re-applied on every draw, so an early roster self-heals on the next
     * publication instead of drawing a duplicate dot forever.
     */
    setSelf(id: number) {
        this.selfId = id || 0;
    }

    /**
     * Rebuilds every dot for a state and scale.
     *
     * Rebuild-over-diff, exactly like MapCampfires: this runs once a second
     * over a handful of players, and a diffing path would be more code than it
     * could ever save.
     */
    draw(state: MapState, scale: number) {
        this.layer.removeChildren().forEach((child) => child.destroy({children: true}));

        const cfg = GraphicsConfig.miniMap.icons.otherPlayer;
        const radius = DOT_SIZE[state] / 2;

        for (const marker of this.markers(scale)) {
            // Drawn at the origin and POSITIONED, rather than drawn at the
            // marker's coordinates: it is how every entity icon on this map is
            // placed, so a dot's `.x/.y` mean the same thing as an icon's.
            const dot = new Graphics()
                .circle(0, 0, radius)
                .fill({color: cfg.color, alpha: cfg.alpha});
            dot.position.set(marker.x, marker.y);
            this.layer.addChild(dot);
        }
    }

    private markers(scale: number): RosterMarker[] {
        return rosterMarkers(this.players, this.selfId, scale);
    }

    destroy() {
        this.layer.removeFromParent();
        this.layer.destroy({children: true});
    }
}
