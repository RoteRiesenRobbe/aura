/**
 * Quest-giver markers on both map states (plan-quest-giver-markers.md C3).
 *
 * The MapCampfires shape: server state (GameState.quest_markers, per species)
 * crossed with the zone file the client bundles (where each species is
 * placed), in its own layer outside the entity lifecycle. A spawn is drawn only
 * on ground this character has uncovered (D3), read off the merged stored
 * reveal the fog itself is painted from.
 *
 * ⚑ A constant size per state, like the campfires: the map scale spans 10×
 * between the docked radar and the full-screen map.
 */

import {Container, Text} from 'pixi.js';
import {createNamedContainer} from '../../pixi-js/logic/CustomData';
import {getZoneData} from '../../ground-textures/logic/GroundTextureManager';
import {meter2px} from '../../../client-data/BasicConfig';
import {mobIdByName} from '../../../client-data/Mobs';
import {
    QuestMarkerData,
    questHoverLines,
    questMarkerColor,
    questMarkerFor,
    questMarkerGlyph,
} from '../../../client-data/QuestMarkers';
import {questDefinition} from '../../../client-data/Quests';
import {isRevealedAt, MapFogData} from './FogReveal';
import {MapState, pickNearestMarker, QuestGiverMapMarker, questGiverMarkers, questHoverPosition, ZoneSpawnPoint} from './MapScale';

/** Glyph font size in canvas pixels, per state. [PLACEHOLDER] */
const GLYPH_SIZE = {
    [MapState.DOCKED]: 13,
    [MapState.FULLSCREEN]: 24,
};

/** Hover hit radius and box gap, as fractions of the glyph size. [PLACEHOLDER] */
const HOVER_RADIUS_FACTOR = 0.75;
const HOVER_GAP_FACTOR = 0.6;

export class MapQuestMarkers {
    /** Add to the stage just UNDER the campfires: the fires stay the topmost markers (PO 2026-08-04). */
    readonly layer: Container;

    private spawns: ZoneSpawnPoint[] = [];
    /** The markers as last drawn, at each glyph's CENTRE: what the hover picks from. */
    private drawn: QuestGiverMapMarker<QuestMarkerData>[] = [];
    private glyphSize = 0;

    constructor(zoneName: string) {
        this.layer = createNamedContainer('questMarkers');
        this.setZone(zoneName);
    }

    /** Points the markers at another zone's spawns; the markers themselves are the character's. */
    setZone(zoneName: string) {
        const zone = getZoneData(zoneName);
        // An exit is its door mob standing at that spot (plan-passages.md D3),
        // so a door that gives a quest marks the map like any giver.
        // 'CaveMouth' is world.GenericDoor.
        const doors = (zone?.exits || []).map(e => ({mob: e.door || 'CaveMouth', x: e.x, y: e.y}));
        this.spawns = [...(zone?.spawns || []) as ZoneSpawnPoint[], ...doors];
    }

    /**
     * Rebuilds every marker. Rebuild-over-diff, the campfire rule: a dozen
     * givers, redrawn on a marker publication, a fog publication, a state
     * toggle or a resize.
     *
     * @param origin the zone's world-space origin, to read the world-space fog
     */
    draw(state: MapState, scale: number, fog: MapFogData | null, origin: {x: number, y: number}) {
        this.layer.removeChildren().forEach((child) => child.destroy());

        const drawn = questGiverMarkers<QuestMarkerData>(
            this.spawns,
            (mobName) => {
                const mobId = mobIdByName(mobName);
                return mobId === undefined ? undefined : questMarkerFor(mobId);
            },
            (x, y) => isRevealedAt(fog, x + origin.x, y + origin.y),
            scale,
            meter2px(1),
        );
        const size = GLYPH_SIZE[state];
        this.glyphSize = size;
        // The glyph hangs above its point (anchor 0.5, 1), so its centre is
        // about half a font size up.
        this.drawn = drawn.map((m) => ({...m, y: m.y - size / 2}));
        for (const {x, y, marker} of drawn) {
            const glyph = new Text({
                text: questMarkerGlyph(marker.kind),
                style: {
                    fontFamily: 'sans-serif',
                    fontSize: size,
                    fontWeight: '900',
                    fill: questMarkerColor(marker),
                    stroke: {color: 0x000000, width: Math.max(2, size / 6)},
                },
            });
            glyph.anchor.set(0.5, 1);
            glyph.position.set(x, y);
            this.layer.addChild(glyph);
        }
    }

    /** The marker under a point in LAYER coordinates, or null (the campfire pick). */
    markerAt(point: {x: number, y: number}): QuestGiverMapMarker<QuestMarkerData> | null {
        return pickNearestMarker(this.drawn, point, this.glyphSize * HOVER_RADIUS_FACTOR);
    }

    /**
     * Fills the hover box with the marker's quest titles, each in its level
     * tint, and places it beside the glyph (a mouse) or above it (a tap, see
     * questHoverPosition). Hides it when no title resolves.
     *
     * @param glyph the glyph's centre in CLIENT (viewport) px
     */
    showHover(box: HTMLElement, marker: QuestMarkerData, glyph: {x: number, y: number}, placement: 'side' | 'above') {
        const lines = questHoverLines(marker, questDefinition);
        if (lines.length === 0) {
            hideQuestHover(box);
            return;
        }
        box.replaceChildren(...lines.map(({title, color}) => {
            const line = document.createElement('div');
            line.textContent = title;
            line.style.color = color;
            return line;
        }));
        box.classList.remove('hidden');

        const {x, y} = questHoverPosition(
            glyph,
            {width: box.offsetWidth, height: box.offsetHeight},
            this.glyphSize * HOVER_GAP_FACTOR,
            {width: window.innerWidth, height: window.innerHeight},
            placement,
        );
        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
    }

    destroy() {
        this.layer.destroy({children: true});
    }
}

export function hideQuestHover(box: HTMLElement | null) {
    box?.classList.add('hidden');
}
