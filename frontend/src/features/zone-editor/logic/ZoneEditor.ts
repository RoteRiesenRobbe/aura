/**
 * Runtime state of the zone editor (world foundation chunk 5): loads the
 * authored zone + the prop/mob registries straight from the repo api/ directory
 * (bundled at build time, so the editor can never drift from what the server
 * loads with -content ../api), owns the editor-only PIXI marker overlay, and
 * routes all px <-> server-unit conversion through meter2px.
 *
 * The model (ZoneModel) is kept in SERVER UNITS; only marker rendering and
 * hit-testing convert to pixels.
 */
import {Container, Graphics, Text} from 'pixi.js';
import {meter2px} from '../../../client-data/BasicConfig';
import * as TextDisplay from '../../../client-data/TextDisplay';
import {requireAll} from '../../common/logic/Utils';
import {IGame} from '../../core/logic/IGame';
import * as GroundTextureManager from '../../ground-textures/logic/GroundTextureManager';
import {ZoneAnchor, ZoneCampfire, ZoneDarkArea, ZoneData, ZoneModel, ZoneNpc, ZoneProp, ZoneSpawn} from './ZoneModel';

export interface PropTypeDef {
    name: string;
    entityType: string;
    radius: number; // server units; 0 for rect bodies
    width: number; // server units; 0 for circle bodies
    height: number;
}

interface PropDefJSON {
    name: string;
    entityType: string;
    // Exactly one body form, matching the server-side parse (world/props.go):
    // a circle (radius) or an axis-aligned rectangle (width + height).
    body: { radius?: number; width?: number; height?: number };
}

interface MobDefJSON {
    name: string;
    factors?: { wanderRadius?: number };
}

interface SkillDefJSON {
    name: string;
}

// Bundled straight from the repo api/ — the same files the server reads.
const propDefJSONs = requireAll(require.context('../../../../../api/props', false, /\.json$/)) as unknown as PropDefJSON[];
const mobDefJSONs = requireAll(require.context('../../../../../api/mobs', false, /\.json$/)) as unknown as MobDefJSON[];
const skillDefJSONs = requireAll(require.context('../../../../../api/skills', false, /\.json$/)) as unknown as SkillDefJSON[];

// Every zone bundled by file stem — the load picker can open any of them (or a
// blank one), and the editor exports the stem as <id>.json (chunk 6).
const zonesContext = require.context('../../../../../api/zones', false, /\.json$/);
const zonesByStem: { [stem: string]: ZoneData } = {};
zonesContext.keys().forEach((key: string) => {
    const stem = key.replace(/^\.\//, '').replace(/\.json$/, '');
    zonesByStem[stem] = zonesContext(key) as ZoneData;
});

export const zoneStems: string[] = Object.keys(zonesByStem).sort((a, b) => a.localeCompare(b));

export const propTypes: PropTypeDef[] = propDefJSONs
    .map(def => ({
        name: def.name,
        entityType: def.entityType,
        radius: def.body.radius || 0,
        width: def.body.width || 0,
        height: def.body.height || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

export const mobNames: string[] = mobDefJSONs
    .map(def => def.name)
    .sort((a, b) => a.localeCompare(b));

// The registry skill names (e.g. "HealAura", "Dash") the teaching dropdown
// offers — the exact keys the backend zone loader resolves a Teaching.Skill
// against, so an authored NPC never references an unknown skill.
export const skillNames: string[] = skillDefJSONs
    .map(def => def.name)
    .sort((a, b) => a.localeCompare(b));

// Type-level default wander radii (factors.wanderRadius) — a spawn without
// its own radius inherits these, so the marker previews the effective disc.
const mobDefaultWanderRadius: { [name: string]: number } = {};
mobDefJSONs.forEach(def => {
    mobDefaultWanderRadius[def.name] = (def.factors && def.factors.wanderRadius) || 0;
});

/**
 * The wander radius a spawn actually gets: its own tri-state value
 * (undefined = inherit, 0 = stationary, > 0 = override) resolved against the
 * mob type's default. Waypoints take precedence over any radius.
 */
export function effectiveWanderRadius(spawn: ZoneSpawn): number {
    if (spawn.waypoints && spawn.waypoints.length > 0) {
        return 0;
    }
    if (spawn.wanderRadius !== undefined) {
        return spawn.wanderRadius;
    }
    return mobDefaultWanderRadius[spawn.mob] || 0;
}

// Default to the live world zone if bundled (there is no 'zone' stem — that
// was a vestigial default; the shipped zones are 'world' and 'proving-grounds'),
// else the first available stem (triage item 3/9 DRIFT-A).
const DEFAULT_STEM = zonesByStem['world'] ? 'world' : zoneStems[0];
const NEW_ZONE_BOUNDS = {width: 60, height: 40};

// currentStem is the loaded zone's file stem — the -zone key and download name.
// Empty for an unsaved new zone until the user names it in the panel.
export let currentStem: string = DEFAULT_STEM;
export let model: ZoneModel = ZoneModel.fromJSON(zonesByStem[DEFAULT_STEM]);

export function propTypeByName(name: string): PropTypeDef {
    return propTypes.find(type => type.name === name);
}

export type SelectionKind = 'prop' | 'spawn' | 'campfire' | 'dark' | 'npc' | 'anchor';

export interface Selection {
    kind: SelectionKind;
    index: number;
}

let selection: Selection = null;

const COLOR_BLOCKING = 0xF44336;
const COLOR_DECORATIVE = 0x03A9F4;
const COLOR_SPAWN = 0x4CAF50;
const COLOR_CAMPFIRE = 0xFF9800;
const COLOR_DARK = 0x673AB7;
const COLOR_NPC = 0xE91E63;
const COLOR_ANCHOR = 0x00BCD4;
const COLOR_SELECTED = 0xFFEB3B;
const COLOR_BOUNDS = 0xFFEB3B;
const SPAWN_MARKER_RADIUS = 0.5; // server units
const CAMPFIRE_MARKER_RADIUS = 0.5; // server units
const ANCHOR_MARKER_RADIUS = 0.5; // server units
const MIN_HIT_RADIUS = 0.4; // server units, so tiny props stay clickable

let container: Container = null;
// markersLayer holds only the prop/spawn markers, so "Hide markers" can toggle
// them (and their labels) without hiding the bounds outline, which lives
// directly on container. It persists across zone switches, so its visibility
// survives rebuildMarkers.
let markersLayer: Container = null;
let boundsGraphic: Graphics = null;
let propMarkers: Container[] = [];
let spawnMarkers: Container[] = [];
let campfireMarkers: Container[] = [];
let darkAreaMarkers: Container[] = [];
let npcMarkers: Container[] = [];
let anchorMarkers: Container[] = [];

export function isAttached(): boolean {
    return container !== null;
}

/** Shows/hides the prop+spawn marker overlay (bounds outline stays visible). */
export function setMarkersVisible(visible: boolean) {
    if (markersLayer !== null) {
        markersLayer.visible = visible;
    }
}

export function attach(game: IGame) {
    if (container !== null) {
        return;
    }

    container = new Container();
    markersLayer = new Container();
    container.addChild(markersLayer);
    game.cameraGroup.addChild(container);

    rebuildMarkers();
}

/**
 * Tears down and rebuilds all prop/spawn markers + the bounds outline from the
 * current model. Used on attach and after switching zones. No-op before attach.
 */
function rebuildMarkers() {
    if (container === null) {
        return;
    }
    propMarkers.forEach(marker => marker.destroy({children: true}));
    spawnMarkers.forEach(marker => marker.destroy({children: true}));
    campfireMarkers.forEach(marker => marker.destroy({children: true}));
    darkAreaMarkers.forEach(marker => marker.destroy({children: true}));
    npcMarkers.forEach(marker => marker.destroy({children: true}));
    anchorMarkers.forEach(marker => marker.destroy({children: true}));
    propMarkers = [];
    spawnMarkers = [];
    campfireMarkers = [];
    darkAreaMarkers = [];
    npcMarkers = [];
    anchorMarkers = [];
    selection = null;

    redrawBounds();
    propMarkers = model.props.map(prop => addMarkerToStage(drawPropMarker(prop, false)));
    spawnMarkers = model.spawns.map(spawn => addMarkerToStage(drawSpawnMarker(spawn, false)));
    campfireMarkers = model.campfires.map(campfire => addMarkerToStage(drawCampfireMarker(campfire, false)));
    darkAreaMarkers = model.darkAreas.map(darkArea => addMarkerToStage(drawDarkAreaMarker(darkArea, false)));
    npcMarkers = model.npcs.map(npc => addMarkerToStage(drawNpcMarker(npc, false)));
    anchorMarkers = model.anchors.map(anchor => addMarkerToStage(drawAnchorMarker(anchor, false)));
}

/**
 * Loads a bundled zone by file stem: swaps the model, rebuilds markers, and
 * reloads its terrain into the GroundTextureManager (chunk 6).
 */
export function loadZone(stem: string) {
    if (!zonesByStem[stem]) {
        return;
    }
    currentStem = stem;
    model = ZoneModel.fromJSON(zonesByStem[stem]);
    rebuildMarkers();
    GroundTextureManager.clear();
    GroundTextureManager.loadZone(stem);
}

/**
 * Aligns the editor to the zone the server actually loaded (Welcome.zone_name),
 * before markers are built. Unlike loadZone it does NOT touch the terrain — the
 * server already rendered this zone's terrain — and does not rebuild markers
 * (attach does that next). No-op if the stem is unknown or already current.
 */
export function selectInitialZone(stem: string) {
    if (!stem || stem === currentStem || !zonesByStem[stem]) {
        return;
    }
    currentStem = stem;
    model = ZoneModel.fromJSON(zonesByStem[stem]);
}

/**
 * Starts a blank zone (default bounds, no terrain/props/spawns). The user names
 * it via the panel's id field before exporting.
 */
export function newZone() {
    currentStem = '';
    model = new ZoneModel('New Zone', {...NEW_ZONE_BOUNDS}, [], [], [], [], [], [], []);
    rebuildMarkers();
    GroundTextureManager.clear();
}

function addMarkerToStage(marker: Container): Container {
    markersLayer.addChild(marker);
    return marker;
}

export function getSelection(): Selection {
    return selection;
}

export function setSelection(newSelection: Selection) {
    let previous = selection;
    selection = newSelection;
    if (previous !== null) {
        redrawMarker(previous.kind, previous.index);
    }
    if (selection !== null) {
        redrawMarker(selection.kind, selection.index);
    }
}

/**
 * Hit-test in server units. Returns the topmost (= latest placed) match or -1.
 */
export function hitTestProp(x: number, y: number): number {
    for (let i = model.props.length - 1; i >= 0; i--) {
        let prop = model.props[i];
        let def = propTypeByName(prop.type);
        if (def && def.width > 0) {
            // Rect body: point-in-rect, padded to the minimum hit size.
            let hw = Math.max(def.width / 2, MIN_HIT_RADIUS);
            let hh = Math.max(def.height / 2, MIN_HIT_RADIUS);
            if (Math.abs(x - prop.x) <= hw && Math.abs(y - prop.y) <= hh) {
                return i;
            }
            continue;
        }
        let hitRadius = Math.max(def ? def.radius : MIN_HIT_RADIUS, MIN_HIT_RADIUS);
        if (distance(x, y, prop.x, prop.y) <= hitRadius) {
            return i;
        }
    }
    return -1;
}

export function hitTestSpawn(x: number, y: number): number {
    for (let i = model.spawns.length - 1; i >= 0; i--) {
        let spawn = model.spawns[i];
        if (distance(x, y, spawn.x, spawn.y) <= SPAWN_MARKER_RADIUS) {
            return i;
        }
    }
    return -1;
}

export function hitTestCampfire(x: number, y: number): number {
    for (let i = model.campfires.length - 1; i >= 0; i--) {
        let campfire = model.campfires[i];
        if (distance(x, y, campfire.x, campfire.y) <= CAMPFIRE_MARKER_RADIUS) {
            return i;
        }
    }
    return -1;
}

// Hit-tests the full authored radius — the marker circle IS the dark area.
export function hitTestDarkArea(x: number, y: number): number {
    for (let i = model.darkAreas.length - 1; i >= 0; i--) {
        let darkArea = model.darkAreas[i];
        if (distance(x, y, darkArea.x, darkArea.y) <= darkArea.radius) {
            return i;
        }
    }
    return -1;
}

// Hit-tests the authored sensor radius — the marker circle IS the NPC's
// approach range (clamped so a tiny-radius NPC stays clickable).
export function hitTestNpc(x: number, y: number): number {
    for (let i = model.npcs.length - 1; i >= 0; i--) {
        let npc = model.npcs[i];
        if (distance(x, y, npc.x, npc.y) <= Math.max(npc.radius, MIN_HIT_RADIUS)) {
            return i;
        }
    }
    return -1;
}

export function hitTestAnchor(x: number, y: number): number {
    for (let i = model.anchors.length - 1; i >= 0; i--) {
        let anchor = model.anchors[i];
        if (distance(x, y, anchor.x, anchor.y) <= ANCHOR_MARKER_RADIUS) {
            return i;
        }
    }
    return -1;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
    let dx = x2 - x1;
    let dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export function placeProp(prop: ZoneProp): number {
    let index = model.addProp(prop);
    if (container !== null) {
        propMarkers.push(addMarkerToStage(drawPropMarker(prop, false)));
    }
    setSelection({kind: 'prop', index});
    return index;
}

export function placeSpawn(spawn: ZoneSpawn): number {
    let index = model.addSpawn(spawn);
    if (container !== null) {
        spawnMarkers.push(addMarkerToStage(drawSpawnMarker(spawn, false)));
    }
    setSelection({kind: 'spawn', index});
    return index;
}

export function updateProp(index: number, prop: ZoneProp) {
    model.updateProp(index, prop);
    redrawMarker('prop', index);
}

export function updateSpawn(index: number, spawn: ZoneSpawn) {
    model.updateSpawn(index, spawn);
    redrawMarker('spawn', index);
}

export function removeProp(index: number) {
    model.removeProp(index);
    removeMarker(propMarkers, index);
    adjustSelectionAfterRemove('prop', index);
}

export function removeSpawn(index: number) {
    model.removeSpawn(index);
    removeMarker(spawnMarkers, index);
    adjustSelectionAfterRemove('spawn', index);
}

export function placeCampfire(campfire: ZoneCampfire): number {
    let index = model.addCampfire(campfire);
    if (container !== null) {
        campfireMarkers.push(addMarkerToStage(drawCampfireMarker(campfire, false)));
    }
    setSelection({kind: 'campfire', index});
    return index;
}

export function removeCampfire(index: number) {
    model.removeCampfire(index);
    removeMarker(campfireMarkers, index);
    adjustSelectionAfterRemove('campfire', index);
}

export function placeDarkArea(darkArea: ZoneDarkArea): number {
    let index = model.addDarkArea(darkArea);
    if (container !== null) {
        darkAreaMarkers.push(addMarkerToStage(drawDarkAreaMarker(darkArea, false)));
    }
    setSelection({kind: 'dark', index});
    return index;
}

export function updateDarkArea(index: number, darkArea: ZoneDarkArea) {
    model.updateDarkArea(index, darkArea);
    redrawMarker('dark', index);
}

export function removeDarkArea(index: number) {
    model.removeDarkArea(index);
    removeMarker(darkAreaMarkers, index);
    adjustSelectionAfterRemove('dark', index);
}

export function placeNpc(npc: ZoneNpc): number {
    let index = model.addNpc(npc);
    if (container !== null) {
        npcMarkers.push(addMarkerToStage(drawNpcMarker(npc, false)));
    }
    setSelection({kind: 'npc', index});
    return index;
}

export function updateNpc(index: number, npc: ZoneNpc) {
    model.updateNpc(index, npc);
    redrawMarker('npc', index);
}

export function removeNpc(index: number) {
    model.removeNpc(index);
    removeMarker(npcMarkers, index);
    adjustSelectionAfterRemove('npc', index);
}

export function placeAnchor(anchor: ZoneAnchor): number {
    let index = model.addAnchor(anchor);
    if (container !== null) {
        anchorMarkers.push(addMarkerToStage(drawAnchorMarker(anchor, false)));
    }
    setSelection({kind: 'anchor', index});
    return index;
}

export function updateAnchor(index: number, anchor: ZoneAnchor) {
    model.anchors[index] = anchor;
    redrawMarker('anchor', index);
}

export function removeAnchor(index: number) {
    model.removeAnchor(index);
    removeMarker(anchorMarkers, index);
    adjustSelectionAfterRemove('anchor', index);
}

function adjustSelectionAfterRemove(kind: SelectionKind, removedIndex: number) {
    if (selection === null || selection.kind !== kind) {
        return;
    }
    if (selection.index === removedIndex) {
        selection = null;
    } else if (selection.index > removedIndex) {
        // Markers after the removed one shift down by one.
        selection.index--;
    }
}

export function setBounds(width: number, height: number) {
    model.bounds.width = width;
    model.bounds.height = height;
    redrawBounds();
}

function removeMarker(markers: Container[], index: number) {
    if (container !== null && markers[index]) {
        markers[index].destroy({children: true});
    }
    markers.splice(index, 1);
}

function redrawMarker(kind: SelectionKind, index: number) {
    if (container === null) {
        return;
    }

    let selected = isSelected(kind, index);
    if (kind === 'prop') {
        if (index >= model.props.length) {
            return;
        }
        propMarkers[index].destroy({children: true});
        propMarkers[index] = addMarkerToStage(drawPropMarker(model.props[index], selected));
    } else if (kind === 'spawn') {
        if (index >= model.spawns.length) {
            return;
        }
        spawnMarkers[index].destroy({children: true});
        spawnMarkers[index] = addMarkerToStage(drawSpawnMarker(model.spawns[index], selected));
    } else if (kind === 'campfire') {
        if (index >= model.campfires.length) {
            return;
        }
        campfireMarkers[index].destroy({children: true});
        campfireMarkers[index] = addMarkerToStage(drawCampfireMarker(model.campfires[index], selected));
    } else if (kind === 'dark') {
        if (index >= model.darkAreas.length) {
            return;
        }
        darkAreaMarkers[index].destroy({children: true});
        darkAreaMarkers[index] = addMarkerToStage(drawDarkAreaMarker(model.darkAreas[index], selected));
    } else if (kind === 'npc') {
        if (index >= model.npcs.length) {
            return;
        }
        npcMarkers[index].destroy({children: true});
        npcMarkers[index] = addMarkerToStage(drawNpcMarker(model.npcs[index], selected));
    } else {
        if (index >= model.anchors.length) {
            return;
        }
        anchorMarkers[index].destroy({children: true});
        anchorMarkers[index] = addMarkerToStage(drawAnchorMarker(model.anchors[index], selected));
    }
}

function isSelected(kind: SelectionKind, index: number): boolean {
    return selection !== null && selection.kind === kind && selection.index === index;
}

function redrawBounds() {
    if (container === null) {
        return;
    }

    if (boundsGraphic !== null) {
        boundsGraphic.destroy();
    }
    let widthPx = meter2px(model.bounds.width);
    let heightPx = meter2px(model.bounds.height);
    boundsGraphic = new Graphics()
        .rect(-widthPx / 2, -heightPx / 2, widthPx, heightPx)
        .stroke({width: 4, color: COLOR_BOUNDS, alpha: 0.6});
    container.addChild(boundsGraphic);
}

function drawPropMarker(prop: ZoneProp, selected: boolean): Container {
    let def = propTypeByName(prop.type);
    let color = prop.blocksMovement ? COLOR_BLOCKING : COLOR_DECORATIVE;

    let marker = new Container();
    let graphic: Graphics;
    let labelOffsetPx: number;
    if (def && def.width > 0) {
        // Rect body (never rotates — the server body is axis-aligned).
        let hwPx = meter2px(Math.max(def.width / 2, MIN_HIT_RADIUS));
        let hhPx = meter2px(Math.max(def.height / 2, MIN_HIT_RADIUS));
        graphic = new Graphics()
            .rect(-hwPx, -hhPx, hwPx * 2, hhPx * 2)
            .fill({color, alpha: prop.blocksMovement ? 0.25 : 0.1})
            .stroke({width: selected ? 6 : 3, color: selected ? COLOR_SELECTED : color});
        labelOffsetPx = hhPx;
    } else {
        let radiusPx = meter2px(Math.max(def ? def.radius : MIN_HIT_RADIUS, MIN_HIT_RADIUS));
        graphic = new Graphics()
            .circle(0, 0, radiusPx)
            .fill({color, alpha: prop.blocksMovement ? 0.25 : 0.1})
            .stroke({width: selected ? 6 : 3, color: selected ? COLOR_SELECTED : color})
            // Rotation tick, so authored rotation is visible even on circles.
            .moveTo(0, 0)
            .lineTo(radiusPx, 0)
            .stroke({width: 2, color});
        graphic.rotation = prop.rotation;
        labelOffsetPx = radiusPx;
    }
    marker.addChild(graphic);
    marker.addChild(markerLabel(prop.type, labelOffsetPx));
    marker.position.set(meter2px(prop.x), meter2px(prop.y));
    return marker;
}

function drawSpawnMarker(spawn: ZoneSpawn, selected: boolean): Container {
    let radiusPx = meter2px(SPAWN_MARKER_RADIUS);

    let marker = new Container();

    // Wander-radius preview: the effective disc the mob ambles (and respawns)
    // in — inherited type defaults render slightly fainter than explicit ones.
    let wanderRadius = effectiveWanderRadius(spawn);
    if (wanderRadius > 0) {
        let inherited = spawn.wanderRadius === undefined;
        marker.addChild(new Graphics()
            .circle(0, 0, meter2px(wanderRadius))
            .fill({color: COLOR_SPAWN, alpha: inherited ? 0.03 : 0.06})
            .stroke({width: 2, color: COLOR_SPAWN, alpha: inherited ? 0.35 : 0.6}));
    }

    // Patrol-route preview: polyline from the spawn through the ordered
    // waypoints (marker-local coordinates), each point numbered; loop mode
    // closes the polygon back to the first point.
    if (spawn.waypoints && spawn.waypoints.length > 0) {
        let route = new Graphics().moveTo(0, 0);
        spawn.waypoints.forEach(w => {
            route.lineTo(meter2px(w.x - spawn.x), meter2px(w.y - spawn.y));
        });
        if (spawn.patrolMode === 'loop' && spawn.waypoints.length > 1) {
            route.lineTo(meter2px(spawn.waypoints[0].x - spawn.x), meter2px(spawn.waypoints[0].y - spawn.y));
        }
        route.stroke({width: 3, color: COLOR_SPAWN, alpha: 0.6});
        spawn.waypoints.forEach(w => {
            route.circle(meter2px(w.x - spawn.x), meter2px(w.y - spawn.y), 10)
                .fill({color: COLOR_SPAWN, alpha: 0.8});
        });
        marker.addChild(route);
        spawn.waypoints.forEach((w, i) => {
            let num = markerLabel(String(i + 1), 10);
            num.position.set(meter2px(w.x - spawn.x), meter2px(w.y - spawn.y) - 14);
            marker.addChild(num);
        });
    }

    let graphic = new Graphics()
        .poly([0, -radiusPx, radiusPx, 0, 0, radiusPx, -radiusPx, 0])
        .fill({color: COLOR_SPAWN, alpha: 0.25})
        .stroke({width: selected ? 6 : 3, color: selected ? COLOR_SELECTED : COLOR_SPAWN})
        .moveTo(0, 0)
        .lineTo(radiusPx, 0)
        .stroke({width: 2, color: COLOR_SPAWN});
    graphic.rotation = spawn.angle;
    marker.addChild(graphic);
    marker.addChild(markerLabel(spawn.mob, radiusPx));
    marker.position.set(meter2px(spawn.x), meter2px(spawn.y));
    return marker;
}

function drawCampfireMarker(campfire: ZoneCampfire, selected: boolean): Container {
    let radiusPx = meter2px(CAMPFIRE_MARKER_RADIUS);

    let marker = new Container();
    let graphic = new Graphics()
        .circle(0, 0, radiusPx)
        .fill({color: COLOR_CAMPFIRE, alpha: 0.25})
        .stroke({width: selected ? 6 : 3, color: selected ? COLOR_SELECTED : COLOR_CAMPFIRE});
    marker.addChild(graphic);
    marker.addChild(markerLabel('Campfire', radiusPx));
    marker.position.set(meter2px(campfire.x), meter2px(campfire.y));
    return marker;
}

// The marker circle doubles as the darkness preview: drawn at the TRUE
// authored radius (unlike the fixed-size campfire/spawn markers).
function drawDarkAreaMarker(darkArea: ZoneDarkArea, selected: boolean): Container {
    let radiusPx = meter2px(darkArea.radius);

    let marker = new Container();
    let graphic = new Graphics()
        .circle(0, 0, radiusPx)
        .fill({color: COLOR_DARK, alpha: 0.25})
        .stroke({width: selected ? 6 : 3, color: selected ? COLOR_SELECTED : COLOR_DARK});
    marker.addChild(graphic);
    marker.addChild(markerLabel('Dark', radiusPx));
    marker.position.set(meter2px(darkArea.x), meter2px(darkArea.y));
    return marker;
}

// Like the dark-area marker, the circle is drawn at the TRUE authored radius —
// it previews the NPC's approach/teaching sensor. A solid centre dot marks the
// exact NPC position, since the sensor disc can be large. The label is the
// NPC type plus, for teaching NPCs, the number of skills it grants.
function drawNpcMarker(npc: ZoneNpc, selected: boolean): Container {
    let radiusPx = meter2px(Math.max(npc.radius, MIN_HIT_RADIUS));

    let marker = new Container();
    let graphic = new Graphics()
        .circle(0, 0, radiusPx)
        .fill({color: COLOR_NPC, alpha: 0.2})
        .stroke({width: selected ? 6 : 3, color: selected ? COLOR_SELECTED : COLOR_NPC})
        .circle(0, 0, meter2px(0.3))
        .fill({color: COLOR_NPC, alpha: 0.9});
    marker.addChild(graphic);
    let teachingCount = (npc.teachings || []).length;
    let label = teachingCount > 0 ? npc.type + ' (' + teachingCount + ')' : npc.type;
    marker.addChild(markerLabel(label, radiusPx));
    marker.position.set(meter2px(npc.x), meter2px(npc.y));
    return marker;
}

// Anchors are script-lookup points (content pass C6), drawn as a crosshair —
// no radius to preview, the position IS the payload. The label is the name the
// encounter script looks up, so a rename here must be mirrored in Go.
function drawAnchorMarker(anchor: ZoneAnchor, selected: boolean): Container {
    let radiusPx = meter2px(ANCHOR_MARKER_RADIUS);

    let marker = new Container();
    let color = selected ? COLOR_SELECTED : COLOR_ANCHOR;
    let graphic = new Graphics()
        .circle(0, 0, radiusPx)
        .fill({color: COLOR_ANCHOR, alpha: 0.15})
        .stroke({width: selected ? 6 : 3, color})
        .moveTo(-radiusPx, 0).lineTo(radiusPx, 0)
        .moveTo(0, -radiusPx).lineTo(0, radiusPx)
        .stroke({width: 2, color});
    marker.addChild(graphic);
    marker.addChild(markerLabel(anchor.name, radiusPx));
    marker.position.set(meter2px(anchor.x), meter2px(anchor.y));
    return marker;
}

function markerLabel(label: string, offsetPx: number): Text {
    let text = new Text({
        text: label,
        style: TextDisplay.style({
            fill: 'white',
            fontSize: 20,
            stroke: {color: '#000000', width: 3},
        }),
    });
    text.anchor.set(0.5, 1);
    text.position.set(0, -offsetPx - 4);
    return text;
}
