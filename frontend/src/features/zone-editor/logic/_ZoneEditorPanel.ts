/**
 * Zone editor panel (world foundation chunk 5): placement modes for props,
 * mob spawns, campfires, dark areas and anchors, plus zone-JSON export,
 * sharing the ground-texture panel DOM. Owns the editor mode (see EditorMode:
 * 'off' | 'terrain' | 'prop' | 'spawn' | 'campfire' | 'dark' |
 * 'anchor') that also gates ground-texture click placement — the old
 * MysticWand hand-equip gate is gone (defunct since Block 2 removed the item
 * system).
 *
 * Dev-only: activated together with the ground-texture panel via the
 * ?textures query parameter (+ valid token).
 */
import '../assets/zoneEditorPanel.less';
import {deg2rad, preventShortcutPropagation} from '../../common/logic/Utils';
import {meter2px} from '../../../client-data/BasicConfig';
import {GameState, IGame} from '../../core/logic/IGame';
import {GamePlayingEvent, PrerenderEvent} from '../../core/logic/Events';
import {saveAs} from 'file-saver';
import * as Console from '../../internal-tools/console/logic/Console';
import * as GroundTextureManager from '../../ground-textures/logic/GroundTextureManager';
import * as ZoneEditor from './ZoneEditor';
import {readSpawnValues, spawnControlValues} from './SpawnControls';
import {ZoneProp, ZoneSpawn} from './ZoneModel';

const NEW_ZONE_OPTION = '__new__';

export type EditorMode = 'off' | 'terrain' | 'prop' | 'spawn' | 'campfire' | 'dark' | 'anchor';

const PX_PER_UNIT = meter2px(1);

let Game: IGame = null;

let active = false;
let wired = false;
let mode: EditorMode = 'off';

export function activate() {
    active = true;
}

export function isActive(): boolean {
    return active;
}

export function getMode(): EditorMode {
    return mode;
}

/**
 * True if a pointer event pressed the game world rather than a UI panel.
 *
 * The full-screen #inputAreas overlay (virtual joystick) sits ABOVE the game
 * canvas, so map presses target it and NEVER reach a listener on the canvas
 * itself — world-click listeners must sit on document.documentElement (like
 * the game's own MouseManager) and filter with this predicate. UI panels and
 * popups render above the overlay, so presses on them target neither the
 * canvas nor the overlay.
 */
export function isMapPointerEvent(event: PointerEvent, canvas: HTMLElement): boolean {
    let target = event.target as Element;
    if (target === canvas) {
        return true;
    }
    return target !== null && target.closest('#inputAreas') !== null;
}

let textureSection: HTMLElement;
let zoneControls: HTMLElement;
let loadZoneSelect: HTMLSelectElement;
let idInput: HTMLInputElement;
let nameInput: HTMLInputElement;
let boundsWidthInput: HTMLInputElement;
let boundsHeightInput: HTMLInputElement;
let hideMarkersToggle: HTMLInputElement;
let mouseXLabel: HTMLElement;
let mouseYLabel: HTMLElement;
let currentXLabel: HTMLElement;
let currentYLabel: HTMLElement;

let propControls: HTMLElement;
let propTypeSelect: HTMLSelectElement;
let propRadiusLabel: HTMLElement;
let propRotationInput: HTMLInputElement;
let blocksMovementToggle: HTMLInputElement;
let propSelectionGroup: HTMLElement;
let propSelectedIndexLabel: HTMLElement;

let spawnControls: HTMLElement;
let spawnMobSelect: HTMLSelectElement;
let spawnLevelInput: HTMLInputElement;
let respawnTicksInput: HTMLInputElement;
let respawnVarianceInput: HTMLInputElement;
let spawnAngleInput: HTMLInputElement;
let wanderRadiusInput: HTMLInputElement;
let idleSpeedInput: HTMLInputElement;
let patrolModeSelect: HTMLSelectElement;
let spawnSelectionGroup: HTMLElement;
let spawnSelectedIndexLabel: HTMLElement;
let waypointModeToggle: HTMLInputElement;
let waypointCountLabel: HTMLElement;
// The capability-gated rows (§4.5): hidden, not disabled (P3), when the
// picked species cannot do the thing.
let respawnTicksRow: HTMLElement;
let respawnVarianceRow: HTMLElement;
let wanderRadiusRow: HTMLElement;
let idleSpeedRow: HTMLElement;
let waypointRow: HTMLElement;
let patrolModeRow: HTMLElement;

let campfireControls: HTMLElement;
let campfireSelectionGroup: HTMLElement;
let campfireSelectedIndexLabel: HTMLElement;

let darkControls: HTMLElement;
let darkRadiusInput: HTMLInputElement;
let darkSelectionGroup: HTMLElement;
let darkSelectedIndexLabel: HTMLElement;


let anchorControls: HTMLElement;
let anchorNameInput: HTMLInputElement;
let anchorSelectionGroup: HTMLElement;
let anchorSelectedIndexLabel: HTMLElement;

let propCountLabel: HTMLElement;
let spawnCountLabel: HTMLElement;
let campfireCountLabel: HTMLElement;
let darkCountLabel: HTMLElement;
let anchorCountLabel: HTMLElement;

// " (cL2)" / " (cL11, elite)": the curve level, plus the tier when it
// carries information (normal is the default). Only Combat entries get it
// (plan-zone-editor-structure.md P2): every talker and fixture authors
// cL1 with xpFactor 0, so there the suffix says nothing and costs a reading.
function mobOptionSuffix(mob: ZoneEditor.MobOption): string {
    if (mob.kind !== 'combat') {
        return '';
    }
    let suffix = 'cL' + mob.curveLevel;
    if (mob.tier !== 'normal') {
        suffix += ', ' + mob.tier;
    }
    return ' (' + suffix + ')';
}

/**
 * Wires the zone-editor sections of the shared panel. Called by
 * _GroundTexturesPanel after the panel partial is rendered.
 */
export function setupPanel() {
    textureSection = document.getElementById('groundTexture_section');
    zoneControls = document.getElementById('zoneEditor_zoneControls');
    loadZoneSelect = document.getElementById('zoneEditor_loadZone') as HTMLSelectElement;
    idInput = document.getElementById('zoneEditor_id') as HTMLInputElement;
    nameInput = document.getElementById('zoneEditor_name') as HTMLInputElement;
    boundsWidthInput = document.getElementById('zoneEditor_boundsWidth') as HTMLInputElement;
    boundsHeightInput = document.getElementById('zoneEditor_boundsHeight') as HTMLInputElement;
    hideMarkersToggle = document.getElementById('zoneEditor_hideMarkers') as HTMLInputElement;
    mouseXLabel = document.getElementById('zoneEditor_mouseX');
    mouseYLabel = document.getElementById('zoneEditor_mouseY');
    currentXLabel = document.getElementById('zoneEditor_currentX');
    currentYLabel = document.getElementById('zoneEditor_currentY');

    propControls = document.getElementById('zoneEditor_propControls');
    propTypeSelect = document.getElementById('zoneEditor_propType') as HTMLSelectElement;
    propRadiusLabel = document.getElementById('zoneEditor_propRadius');
    propRotationInput = document.getElementById('zoneEditor_propRotation') as HTMLInputElement;
    blocksMovementToggle = document.getElementById('zoneEditor_blocksMovement') as HTMLInputElement;
    propSelectionGroup = document.getElementById('zoneEditor_propSelection');
    propSelectedIndexLabel = document.getElementById('zoneEditor_propSelectedIndex');

    spawnControls = document.getElementById('zoneEditor_spawnControls');
    spawnMobSelect = document.getElementById('zoneEditor_spawnMob') as HTMLSelectElement;
    spawnLevelInput = document.getElementById('zoneEditor_spawnLevel') as HTMLInputElement;
    respawnTicksInput = document.getElementById('zoneEditor_respawnTicks') as HTMLInputElement;
    respawnVarianceInput = document.getElementById('zoneEditor_respawnVariance') as HTMLInputElement;
    spawnAngleInput = document.getElementById('zoneEditor_spawnAngle') as HTMLInputElement;
    wanderRadiusInput = document.getElementById('zoneEditor_wanderRadius') as HTMLInputElement;
    idleSpeedInput = document.getElementById('zoneEditor_idleSpeed') as HTMLInputElement;
    patrolModeSelect = document.getElementById('zoneEditor_patrolMode') as HTMLSelectElement;
    spawnSelectionGroup = document.getElementById('zoneEditor_spawnSelection');
    spawnSelectedIndexLabel = document.getElementById('zoneEditor_spawnSelectedIndex');
    waypointModeToggle = document.getElementById('zoneEditor_waypointMode') as HTMLInputElement;
    waypointCountLabel = document.getElementById('zoneEditor_waypointCount');
    respawnTicksRow = document.getElementById('zoneEditor_respawnTicksRow');
    respawnVarianceRow = document.getElementById('zoneEditor_respawnVarianceRow');
    wanderRadiusRow = document.getElementById('zoneEditor_wanderRadiusRow');
    idleSpeedRow = document.getElementById('zoneEditor_idleSpeedRow');
    waypointRow = document.getElementById('zoneEditor_waypointRow');
    patrolModeRow = document.getElementById('zoneEditor_patrolModeRow');

    campfireControls = document.getElementById('zoneEditor_campfireControls');
    campfireSelectionGroup = document.getElementById('zoneEditor_campfireSelection');
    campfireSelectedIndexLabel = document.getElementById('zoneEditor_campfireSelectedIndex');

    darkControls = document.getElementById('zoneEditor_darkControls');
    darkRadiusInput = document.getElementById('zoneEditor_darkRadius') as HTMLInputElement;
    darkSelectionGroup = document.getElementById('zoneEditor_darkSelection');
    darkSelectedIndexLabel = document.getElementById('zoneEditor_darkSelectedIndex');


    anchorControls = document.getElementById('zoneEditor_anchorControls');
    anchorNameInput = document.getElementById('zoneEditor_anchorName') as HTMLInputElement;
    anchorSelectionGroup = document.getElementById('zoneEditor_anchorSelection');
    anchorSelectedIndexLabel = document.getElementById('zoneEditor_anchorSelectedIndex');

    propCountLabel = document.getElementById('zoneEditor_propCount');
    spawnCountLabel = document.getElementById('zoneEditor_spawnCount');
    campfireCountLabel = document.getElementById('zoneEditor_campfireCount');
    darkCountLabel = document.getElementById('zoneEditor_darkCount');
    anchorCountLabel = document.getElementById('zoneEditor_anchorCount');

    let popup = document.getElementById('zoneEditorPopup');
    popup.querySelectorAll('input, textarea, button, a, select')
        .forEach(preventShortcutPropagation);

    ZoneEditor.propTypes.forEach(type => {
        let option = document.createElement('option');
        option.value = type.name;
        option.textContent = type.name;
        propTypeSelect.appendChild(option);
    });
    propTypeSelect.addEventListener('change', updatePropRadiusLabel);
    updatePropRadiusLabel();

    // One <optgroup> per derived category (plan-zone-editor-structure.md §4.3),
    // in placement-frequency order; entries stay alphabetical within a group
    // (mobOptions is pre-sorted). Labels [PLACEHOLDER].
    const MOB_GROUPS: { kind: ZoneEditor.MobOption['kind']; label: string }[] = [
        {kind: 'combat', label: 'Combat'},
        {kind: 'talker', label: 'Talkers'},
        {kind: 'fixture', label: 'Fixtures'},
        {kind: 'companion', label: 'Companions'},
    ];
    MOB_GROUPS.forEach(group => {
        let mobs = ZoneEditor.mobOptions.filter(mob => mob.kind === group.kind);
        if (mobs.length === 0) {
            return;
        }
        let optgroup = document.createElement('optgroup');
        optgroup.label = group.label;
        mobs.forEach(mob => {
            let option = document.createElement('option');
            // The value stays the bare name: that is what the zone JSON stores
            // and what populateSpawnControls() assigns back on selection.
            option.value = mob.name;
            option.textContent = mob.name + mobOptionSuffix(mob);
            optgroup.appendChild(option);
        });
        spawnMobSelect.appendChild(optgroup);
    });
    // Gating direction 1 of 2 (⚑ §4.5): picking a species gates the controls
    // for placing. Direction 2 is populateSpawnControls, for selecting an
    // existing marker.
    spawnMobSelect.addEventListener('change', () => {
        updateSpawnCapabilityRows(spawnMobSelect.value);
    });



    // The zone controls (load/id/name/bounds/export) are zone-wide, so they
    // stay visible in every mode — not just prop/spawn.
    zoneControls.classList.remove('hidden');

    // Populate the load-zone picker: every bundled zone + a blank "new zone".
    ZoneEditor.zoneStems.forEach(stem => {
        let option = document.createElement('option');
        option.value = stem;
        option.textContent = stem;
        loadZoneSelect.appendChild(option);
    });
    let newOption = document.createElement('option');
    newOption.value = NEW_ZONE_OPTION;
    newOption.textContent = '＋ New zone';
    loadZoneSelect.appendChild(newOption);

    refreshPanelFromModel();

    loadZoneSelect.addEventListener('change', () => {
        if (loadZoneSelect.value === NEW_ZONE_OPTION) {
            ZoneEditor.newZone();
        } else {
            ZoneEditor.loadZone(loadZoneSelect.value);
        }
        refreshPanelFromModel();
    });
    nameInput.addEventListener('change', () => {
        ZoneEditor.model.name = nameInput.value;
    });
    boundsWidthInput.addEventListener('change', onBoundsChanged);
    boundsHeightInput.addEventListener('change', onBoundsChanged);
    hideMarkersToggle.addEventListener('change', () => {
        ZoneEditor.setMarkersVisible(!hideMarkersToggle.checked);
    });

    document.getElementsByName('zoneEditor_mode').forEach(element => {
        let radio = element as HTMLInputElement;
        radio.addEventListener('change', () => setMode(radio.value as EditorMode));
    });

    document.getElementById('zoneEditor_propPlaceButton').addEventListener('click', event => {
        event.preventDefault();
        placeAtPlayer();
    });
    document.getElementById('zoneEditor_spawnPlaceButton').addEventListener('click', event => {
        event.preventDefault();
        placeAtPlayer();
    });
    document.getElementById('zoneEditor_campfirePlaceButton').addEventListener('click', event => {
        event.preventDefault();
        placeAtPlayer();
    });
    document.getElementById('zoneEditor_campfireDelete').addEventListener('click', event => {
        event.preventDefault();
        deleteSelection();
    });
    document.getElementById('zoneEditor_campfireDeselect').addEventListener('click', event => {
        event.preventDefault();
        deselect();
    });
    document.getElementById('zoneEditor_darkPlaceButton').addEventListener('click', event => {
        event.preventDefault();
        placeAtPlayer();
    });
    document.getElementById('zoneEditor_darkUpdate').addEventListener('click', event => {
        event.preventDefault();
        applyControlsToSelection();
    });
    document.getElementById('zoneEditor_darkDelete').addEventListener('click', event => {
        event.preventDefault();
        deleteSelection();
    });
    document.getElementById('zoneEditor_darkDeselect').addEventListener('click', event => {
        event.preventDefault();
        deselect();
    });
    document.getElementById('zoneEditor_propUpdate').addEventListener('click', event => {
        event.preventDefault();
        applyControlsToSelection();
    });
    document.getElementById('zoneEditor_propDelete').addEventListener('click', event => {
        event.preventDefault();
        deleteSelection();
    });
    document.getElementById('zoneEditor_propDeselect').addEventListener('click', event => {
        event.preventDefault();
        deselect();
    });
    document.getElementById('zoneEditor_spawnUpdate').addEventListener('click', event => {
        event.preventDefault();
        applyControlsToSelection();
    });
    document.getElementById('zoneEditor_spawnDelete').addEventListener('click', event => {
        event.preventDefault();
        deleteSelection();
    });
    document.getElementById('zoneEditor_spawnDeselect').addEventListener('click', event => {
        event.preventDefault();
        deselect();
    });
    document.getElementById('zoneEditor_anchorPlaceButton').addEventListener('click', event => {
        event.preventDefault();
        placeAtPlayer();
    });
    document.getElementById('zoneEditor_anchorUpdate').addEventListener('click', event => {
        event.preventDefault();
        applyControlsToSelection();
    });
    document.getElementById('zoneEditor_anchorDelete').addEventListener('click', event => {
        event.preventDefault();
        deleteSelection();
    });
    document.getElementById('zoneEditor_anchorDeselect').addEventListener('click', event => {
        event.preventDefault();
        deselect();
    });
    document.getElementById('zoneEditor_waypointRemoveLast').addEventListener('click', event => {
        event.preventDefault();
        editSelectedWaypoints(waypoints => waypoints.slice(0, -1));
    });
    document.getElementById('zoneEditor_waypointClear').addEventListener('click', event => {
        event.preventDefault();
        editSelectedWaypoints(() => []);
    });

    let output = document.getElementById('zoneEditorOutput');
    document.getElementById('zoneEditor_showPopup').addEventListener('click', event => {
        event.preventDefault();
        popup.classList.remove('hidden');
        output.textContent = currentZoneJSON();
    });
    document.getElementById('zoneEditor_closePopup').addEventListener('click', event => {
        event.preventDefault();
        popup.classList.add('hidden');
    });
    document.getElementById('zoneEditor_download').addEventListener('click', event => {
        event.preventDefault();
        let filename = (idInput.value.trim() || 'zone') + '.json';
        let blob = new Blob([currentZoneJSON()], {type: 'application/json;charset=utf-8'});
        saveAs(blob, filename);
    });
}

/**
 * Syncs the live terrain (edited in pixels in the GroundTextureManager) into the
 * model as server units, then serializes the whole zone. The single export path.
 */
function currentZoneJSON(): string {
    ZoneEditor.model.terrain = GroundTextureManager.getTerrainServerUnits();
    return ZoneEditor.model.getZoneAsJSON();
}

/** Refreshes the panel inputs after a zone load / new-zone. */
function refreshPanelFromModel() {
    idInput.value = ZoneEditor.currentStem;
    nameInput.value = ZoneEditor.model.name;
    boundsWidthInput.value = String(ZoneEditor.model.bounds.width);
    boundsHeightInput.value = String(ZoneEditor.model.bounds.height);
    loadZoneSelect.value = ZoneEditor.currentStem !== '' ? ZoneEditor.currentStem : NEW_ZONE_OPTION;
    updateCounts();
    updateSelectionDisplay();
}

GamePlayingEvent.subscribe((game: IGame) => {
    Game = game;
    if (!active || wired) {
        return;
    }
    wired = true;

    // Default to the zone the server actually loaded, so the editor's markers
    // line up with the terrain the server rendered (chunk 6). The dropdown is
    // then only for switching to author a different zone. refreshPanelFromModel
    // resyncs the inputs (setupPanel already ran on BackendValidTokenEvent).
    ZoneEditor.selectInitialZone(game.zoneName);
    ZoneEditor.attach(game);
    refreshPanelFromModel();
    Console.log('Zone editor ready - loaded zone "' + ZoneEditor.model.name +
        '" (' + ZoneEditor.model.props.length + ' props, ' +
        ZoneEditor.model.spawns.length + ' spawns). Pick a mode in the panel.');

    PrerenderEvent.subscribe(() => {
        if (Game.state !== GameState.PLAYING) {
            return;
        }
        let x = Game.player.camera.getMapX(Game.inputManager.activePointer.x) / PX_PER_UNIT;
        let y = Game.player.camera.getMapY(Game.inputManager.activePointer.y) / PX_PER_UNIT;
        mouseXLabel.textContent = x.toFixed(2);
        mouseYLabel.textContent = y.toFixed(2);

        let position = Game.player.character.getPosition();
        currentXLabel.textContent = (position.x / PX_PER_UNIT).toFixed(2);
        currentYLabel.textContent = (position.y / PX_PER_UNIT).toFixed(2);
    }, this);

    // On documentElement, NOT the canvas — see isMapPointerEvent. pointerdown,
    // not click: MouseManager preventDefault()s mousedown, which suppresses
    // synthetic click events.
    document.documentElement.addEventListener('pointerdown', onMapPointerDown);
});

function setMode(newMode: EditorMode) {
    mode = newMode;
    deselect(); // also unchecks the waypoint toggle

    textureSection.classList.toggle('hidden', mode !== 'terrain');
    // zoneControls stays visible in every mode (unhidden in setupPanel).
    propControls.classList.toggle('hidden', mode !== 'prop');
    spawnControls.classList.toggle('hidden', mode !== 'spawn');
    campfireControls.classList.toggle('hidden', mode !== 'campfire');
    darkControls.classList.toggle('hidden', mode !== 'dark');
    anchorControls.classList.toggle('hidden', mode !== 'anchor');
}

function onBoundsChanged() {
    let width = parseFloat(boundsWidthInput.value);
    let height = parseFloat(boundsHeightInput.value);
    if (isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
        return;
    }
    ZoneEditor.setBounds(width, height);
}

function onMapPointerDown(event: PointerEvent) {
    if (event.button !== 0) {
        return;
    }
    if (mode !== 'prop' && mode !== 'spawn' && mode !== 'campfire' && mode !== 'dark' && mode !== 'anchor') {
        return;
    }
    if (Game.state !== GameState.PLAYING) {
        return;
    }
    if (!isMapPointerEvent(event, Game.domElement)) {
        return;
    }

    let x = Game.player.camera.getMapX(event.pageX) / PX_PER_UNIT;
    let y = Game.player.camera.getMapY(event.pageY) / PX_PER_UNIT;

    if (mode === 'prop') {
        let hit = ZoneEditor.hitTestProp(x, y);
        if (hit >= 0) {
            ZoneEditor.setSelection({kind: 'prop', index: hit});
            populatePropControls(ZoneEditor.model.props[hit]);
            updateSelectionDisplay();
            return;
        }
    } else if (mode === 'campfire') {
        let hit = ZoneEditor.hitTestCampfire(x, y);
        if (hit >= 0) {
            ZoneEditor.setSelection({kind: 'campfire', index: hit});
            updateSelectionDisplay();
            return;
        }
    } else if (mode === 'dark') {
        let hit = ZoneEditor.hitTestDarkArea(x, y);
        if (hit >= 0) {
            ZoneEditor.setSelection({kind: 'dark', index: hit});
            populateDarkControls(ZoneEditor.model.darkAreas[hit]);
            updateSelectionDisplay();
            return;
        }
    } else if (mode === 'anchor') {
        let hit = ZoneEditor.hitTestAnchor(x, y);
        if (hit >= 0) {
            ZoneEditor.setSelection({kind: 'anchor', index: hit});
            anchorNameInput.value = ZoneEditor.model.anchors[hit].name;
            updateSelectionDisplay();
            return;
        }
    } else {
        // Waypoint authoring (chunk 5b): while the toggle is on, map clicks
        // append route points to the selected spawn instead of placing/
        // selecting spawns.
        if (waypointModeToggle.checked) {
            appendWaypointToSelection(x, y);
            return;
        }
        let hit = ZoneEditor.hitTestSpawn(x, y);
        if (hit >= 0) {
            ZoneEditor.setSelection({kind: 'spawn', index: hit});
            populateSpawnControls(ZoneEditor.model.spawns[hit]);
            updateSelectionDisplay();
            return;
        }
    }

    placeAt(x, y);
}

function placeAtPlayer() {
    if (Game === null || Game.state !== GameState.PLAYING) {
        return;
    }
    let position = Game.player.character.getPosition();
    placeAt(position.x / PX_PER_UNIT, position.y / PX_PER_UNIT);
}

function placeAt(x: number, y: number) {
    if (mode === 'prop') {
        let prop = readPropControls(x, y);
        if (prop === null) {
            return;
        }
        ZoneEditor.placeProp(prop);
    } else if (mode === 'spawn') {
        let spawn = readSpawnControls(x, y);
        if (spawn === null) {
            return;
        }
        ZoneEditor.placeSpawn(spawn);
    } else if (mode === 'campfire') {
        // The spawn-point id is minted by the model (ZoneModel.addCampfire), so
        // placing a fire needs no id here and cannot forget one.
        ZoneEditor.placeCampfire({id: '', x, y});
    } else if (mode === 'dark') {
        let radius = readDarkRadius();
        if (radius === null) {
            return;
        }
        ZoneEditor.placeDarkArea({x, y, radius});
    } else if (mode === 'anchor') {
        let name = readAnchorName(-1);
        if (name === null) {
            return;
        }
        ZoneEditor.placeAnchor({name, x, y});
    }

    updateCounts();
    updateSelectionDisplay();
}

// Mirrors the backend loader's hard-fail: a dark area needs a positive radius.
function readDarkRadius(): number {
    let radius = parseFloat(darkRadiusInput.value);
    if (isNaN(radius) || radius <= 0) {
        Game.player.character.say('Dark area radius must be positive');
        return null;
    }
    return radius;
}

function populateDarkControls(darkArea: {radius: number}) {
    darkRadiusInput.value = String(darkArea.radius);
}

function readPropControls(x: number, y: number): ZoneProp {
    if (propTypeSelect.value === '') {
        Game.player.character.say('No prop type selected');
        return null;
    }
    return {
        type: propTypeSelect.value,
        x,
        y,
        rotation: deg2rad(parseFloat(propRotationInput.value) || 0),
        blocksMovement: blocksMovementToggle.checked,
    };
}

// The parse/validation rules live in SpawnControls.ts (readSpawnValues), the
// only vitest-reachable seam - this stays a DOM adapter that collects the
// strings and voices the error.
function readSpawnControls(x: number, y: number): ZoneSpawn {
    if (spawnMobSelect.value === '') {
        Game.player.character.say('No mob selected');
        return null;
    }
    let result = readSpawnValues({
        level: spawnLevelInput.value,
        respawnTicks: respawnTicksInput.value,
        respawnVariance: respawnVarianceInput.value,
        angle: spawnAngleInput.value,
        wanderRadius: wanderRadiusInput.value,
        idleSpeed: idleSpeedInput.value,
        patrolMode: patrolModeSelect.value === 'loop' ? 'loop' : 'pingpong',
    }, ZoneEditor.mobCapabilities(spawnMobSelect.value));
    if (result.ok === false) {
        Game.player.character.say(result.error);
        return null;
    }
    return {
        mob: spawnMobSelect.value,
        x,
        y,
        ...result.fields,
        waypoints: [],
    };
}

function populatePropControls(prop: ZoneProp) {
    propTypeSelect.value = prop.type;
    updatePropRadiusLabel();
    propRotationInput.value = String(Math.round(prop.rotation * 180 / Math.PI));
    blocksMovementToggle.checked = prop.blocksMovement;
}

function populateSpawnControls(spawn: ZoneSpawn) {
    spawnMobSelect.value = spawn.mob;
    let values = spawnControlValues(spawn);
    spawnLevelInput.value = values.level;
    respawnTicksInput.value = values.respawnTicks;
    respawnVarianceInput.value = values.respawnVariance;
    spawnAngleInput.value = values.angle;
    wanderRadiusInput.value = values.wanderRadius;
    idleSpeedInput.value = values.idleSpeed;
    patrolModeSelect.value = values.patrolMode;
    // Gating direction 2 of 2 (⚑ §4.5): selecting an existing marker gates
    // the controls too, not just picking in the dropdown.
    updateSpawnCapabilityRows(spawn.mob);
}

// Hidden, not disabled (P3): a greyed row still costs a line of height in an
// already-tall panel, and the fields are meaningless for the species rather
// than temporarily unavailable. '' = nothing picked yet - show everything.
function updateSpawnCapabilityRows(mobName: string) {
    let capabilities = mobName !== ''
        ? ZoneEditor.mobCapabilities(mobName)
        : {moves: true, respawns: true};
    respawnTicksRow.classList.toggle('hidden', !capabilities.respawns);
    respawnVarianceRow.classList.toggle('hidden', !capabilities.respawns);
    wanderRadiusRow.classList.toggle('hidden', !capabilities.moves);
    idleSpeedRow.classList.toggle('hidden', !capabilities.moves);
    waypointRow.classList.toggle('hidden', !capabilities.moves);
    patrolModeRow.classList.toggle('hidden', !capabilities.moves);
}

function applyControlsToSelection() {
    let selection = ZoneEditor.getSelection();
    if (selection === null) {
        return;
    }

    if (selection.kind === 'prop') {
        let current = ZoneEditor.model.props[selection.index];
        let updated = readPropControls(current.x, current.y);
        if (updated !== null) {
            // ⚑ L1, second face. readPropControls rebuilds the prop from the
            // panel, and this editor has no scale control — so without this
            // line, nudging a prop that Tiled scaled silently resets it to its
            // type's size. Naming scale in getZoneAsJSON is not enough on its
            // own. Same carry-over the spawn branch does for waypoints below.
            updated.scale = current.scale;
            ZoneEditor.updateProp(selection.index, updated);
        }
    } else if (selection.kind === 'spawn') {
        let current = ZoneEditor.model.spawns[selection.index];
        let updated = readSpawnControls(current.x, current.y);
        if (updated !== null) {
            // The waypoint list is edited via its own buttons, not the
            // controls — carry it over. Mirror the backend loader's
            // hard-fails (explicit radius + waypoints; mode without a route)
            // before they bite at boot.
            updated.waypoints = current.waypoints || [];
            if (updated.wanderRadius > 0 && updated.waypoints.length > 0) {
                Game.player.character.say('Wander radius and waypoints are mutually exclusive');
                return;
            }
            if (updated.waypoints.length > 0 && patrolModeSelect.value === 'loop') {
                updated.patrolMode = 'loop';
            }
            ZoneEditor.updateSpawn(selection.index, updated);
        }
    } else if (selection.kind === 'dark') {
        let current = ZoneEditor.model.darkAreas[selection.index];
        let radius = readDarkRadius();
        if (radius !== null) {
            ZoneEditor.updateDarkArea(selection.index, {...current, radius});
        }
    } else if (selection.kind === 'anchor') {
        let current = ZoneEditor.model.anchors[selection.index];
        let name = readAnchorName(selection.index);
        if (name !== null) {
            ZoneEditor.updateAnchor(selection.index, {...current, name});
        }
    }
}

// readAnchorName validates the anchor name input: non-empty and unique
// (mirroring the backend loader's hard-fails before they bite at boot).
// excludeIndex skips the anchor being renamed in the uniqueness check.
function readAnchorName(excludeIndex: number): string | null {
    let name = anchorNameInput.value.trim();
    if (name.length === 0) {
        Game.player.character.say('Anchor needs a name');
        return null;
    }
    let duplicate = ZoneEditor.model.anchors.some((a, i) => a.name === name && i !== excludeIndex);
    if (duplicate) {
        Game.player.character.say('Anchor name already used');
        return null;
    }
    return name;
}

function deleteSelection() {
    let selection = ZoneEditor.getSelection();
    if (selection === null) {
        return;
    }

    if (selection.kind === 'prop') {
        ZoneEditor.removeProp(selection.index);
    } else if (selection.kind === 'spawn') {
        ZoneEditor.removeSpawn(selection.index);
    } else if (selection.kind === 'campfire') {
        ZoneEditor.removeCampfire(selection.index);
    } else if (selection.kind === 'dark') {
        ZoneEditor.removeDarkArea(selection.index);
    } else {
        ZoneEditor.removeAnchor(selection.index);
    }

    updateCounts();
    updateSelectionDisplay();
}

function deselect() {
    ZoneEditor.setSelection(null);
    if (waypointModeToggle) {
        waypointModeToggle.checked = false;
    }
    updateSelectionDisplay();
}

// appendWaypointToSelection adds a route point at the clicked map position
// (chunk 5b). Requires a selected spawn without a wander radius — the backend
// loader hard-fails on both being set.
function appendWaypointToSelection(x: number, y: number) {
    let selection = ZoneEditor.getSelection();
    if (selection === null || selection.kind !== 'spawn') {
        Game.player.character.say('Select a spawn to add waypoints to');
        return;
    }
    let spawn = ZoneEditor.model.spawns[selection.index];
    if (spawn.wanderRadius > 0) {
        Game.player.character.say('Wander radius and waypoints are mutually exclusive');
        return;
    }
    let waypoints = (spawn.waypoints || []).concat([{x, y}]);
    ZoneEditor.updateSpawn(selection.index, {...spawn, waypoints});
    updateSelectionDisplay();
}

function editSelectedWaypoints(edit: (waypoints: {x: number, y: number}[]) => {x: number, y: number}[]) {
    let selection = ZoneEditor.getSelection();
    if (selection === null || selection.kind !== 'spawn') {
        return;
    }
    let spawn = ZoneEditor.model.spawns[selection.index];
    ZoneEditor.updateSpawn(selection.index, {...spawn, waypoints: edit(spawn.waypoints || [])});
    updateSelectionDisplay();
}

function updateSelectionDisplay() {
    let selection = ZoneEditor.getSelection();
    let propSelected = selection !== null && selection.kind === 'prop';
    let spawnSelected = selection !== null && selection.kind === 'spawn';
    let campfireSelected = selection !== null && selection.kind === 'campfire';
    let darkSelected = selection !== null && selection.kind === 'dark';
    let anchorSelected = selection !== null && selection.kind === 'anchor';

    propSelectionGroup.classList.toggle('hidden', !propSelected);
    spawnSelectionGroup.classList.toggle('hidden', !spawnSelected);
    campfireSelectionGroup.classList.toggle('hidden', !campfireSelected);
    darkSelectionGroup.classList.toggle('hidden', !darkSelected);
    anchorSelectionGroup.classList.toggle('hidden', !anchorSelected);
    if (propSelected) {
        propSelectedIndexLabel.textContent = String(selection.index);
    }
    if (spawnSelected) {
        spawnSelectedIndexLabel.textContent = String(selection.index);
        let spawn = ZoneEditor.model.spawns[selection.index];
        waypointCountLabel.textContent = String((spawn.waypoints || []).length);
    }
    if (campfireSelected) {
        campfireSelectedIndexLabel.textContent = String(selection.index);
    }
    if (darkSelected) {
        darkSelectedIndexLabel.textContent = String(selection.index);
    }
    if (anchorSelected) {
        anchorSelectedIndexLabel.textContent = String(selection.index);
    }
}

function updatePropRadiusLabel() {
    let type = ZoneEditor.propTypeByName(propTypeSelect.value);
    propRadiusLabel.textContent = type ? 'r ' + type.radius + 'u' : '';
}

function updateCounts() {
    propCountLabel.textContent = String(ZoneEditor.model.props.length);
    spawnCountLabel.textContent = String(ZoneEditor.model.spawns.length);
    campfireCountLabel.textContent = String(ZoneEditor.model.campfires.length);
    darkCountLabel.textContent = String(ZoneEditor.model.darkAreas.length);
    anchorCountLabel.textContent = String(ZoneEditor.model.anchors.length);
}
