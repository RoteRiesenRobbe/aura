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
    questMarkerColor,
    questMarkerFor,
    questMarkerGlyph,
} from '../../../client-data/QuestMarkers';
import {isRevealedAt, MapFogData} from './FogReveal';
import {MapState, questGiverMarkers, ZoneSpawnPoint} from './MapScale';

/** Glyph font size in canvas pixels, per state. [PLACEHOLDER] */
const GLYPH_SIZE = {
    [MapState.DOCKED]: 13,
    [MapState.FULLSCREEN]: 24,
};

export class MapQuestMarkers {
    /** Add to the stage just UNDER the campfires: the fires stay the topmost markers (PO 2026-08-04). */
    readonly layer: Container;

    private spawns: ZoneSpawnPoint[] = [];

    constructor(zoneName: string) {
        this.layer = createNamedContainer('questMarkers');
        this.setZone(zoneName);
    }

    /** Points the markers at another zone's spawns; the markers themselves are the character's. */
    setZone(zoneName: string) {
        this.spawns = (getZoneData(zoneName)?.spawns || []) as ZoneSpawnPoint[];
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

    destroy() {
        this.layer.destroy({children: true});
    }
}
