/**
 * Pure value logic for the spawn-mode panel inputs
 * (plan-zone-editor-structure.md C2): the string face of the controls on one
 * side, ZoneSpawn field values on the other. Extracted from _ZoneEditorPanel's
 * read/populate pair so the tri-state and capability rules are unit-testable -
 * the panel imports ZoneEditor, whose require.context exists only inside a
 * webpack build, so no test can ever import the panel itself (L3).
 *
 * The panel stays a thin DOM adapter: it collects input strings, hands them
 * here together with the picked species' capabilities, and voices the error.
 */
import {deg2rad, rad2deg} from '../../common/logic/Utils';
import {MobCapabilities, ZoneSpawn} from './ZoneModel';

// One string per input, exactly as the DOM holds them. patrolMode is a select
// with a fixed vocabulary, not free text.
export interface SpawnControlValues {
    level: string;
    respawnTicks: string;
    respawnVariance: string;
    angle: string; // degrees, the input's unit; the model keeps radians
    wanderRadius: string;
    idleSpeed: string;
    patrolMode: 'pingpong' | 'loop';
}

// Everything the inputs own. mob, position and the waypoint route are owned by
// the picker, the map and the waypoint buttons respectively.
export type SpawnControlFields = Pick<ZoneSpawn,
    'angle' | 'respawnTicks' | 'respawnVariancePct' | 'wanderRadius' | 'idleSpeedFactor' | 'level'>;

export type SpawnReadResult =
    | { ok: true; fields: SpawnControlFields }
    | { ok: false; error: string };

/**
 * Parses and validates the inputs. Hidden controls are never read: a species
 * that cannot move contributes no wander/idle override, and a talker (a def
 * carrying an interaction) contributes NO respawn keys, whatever stale text
 * the inputs hold - the predicate is the def, never input emptiness, because
 * a combat spawn with an absent key would respawn every tick (§4.6).
 */
export function readSpawnValues(values: SpawnControlValues, capabilities: MobCapabilities): SpawnReadResult {
    // The per-spawn level override: empty = inherit the species curveLevel
    // (plan-mob-levels.md D1/L6 — the field is never pre-filled from the
    // picked species, because a copied default is no longer inheritance).
    // Mirrors the loader's ">= 1" hard-fail, and rejects fractions on top of
    // it: world.Spawn.Level is a *int, so a 2.5 in the file fails
    // json.Unmarshal at boot instead of reporting the friendly message.
    let level: number = undefined;
    if (values.level.trim() !== '') {
        let parsedLevel = parseFloat(values.level);
        if (!Number.isInteger(parsedLevel) || parsedLevel < 1) {
            return {ok: false, error: 'Level must be a whole number >= 1'};
        }
        level = parsedLevel;
    }
    // A talker contributes no respawn keys at all - its controls are hidden
    // and the serializer omits the keys, matching how world.json's 17
    // interaction carriers are hand-authored. A combat mob keeps the hard
    // validation: it must never silently lose its keys.
    let respawnTicks: number = undefined;
    let respawnVariancePct: number = undefined;
    if (capabilities.respawns) {
        respawnTicks = parseInt(values.respawnTicks);
        if (isNaN(respawnTicks) || respawnTicks < 0) {
            return {ok: false, error: 'Invalid respawn ticks'};
        }
        let variance = parseFloat(values.respawnVariance);
        if (isNaN(variance) || variance < 0) {
            variance = 0;
        }
        respawnVariancePct = variance;
    }
    // Tri-state: empty input = inherit the mob type's default (undefined),
    // 0 = explicit stationary, > 0 = explicit radius. A species that cannot
    // move gets neither override, mirroring the server's boot refusal for
    // movement authoring on a speed-0 mob.
    let wanderRadius: number = undefined;
    let idleSpeedFactor: number = undefined;
    if (capabilities.moves) {
        if (values.wanderRadius.trim() !== '') {
            wanderRadius = Math.max(0, parseFloat(values.wanderRadius) || 0);
        }
        if (values.idleSpeed.trim() !== '') {
            let parsed = parseFloat(values.idleSpeed);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 1) {
                idleSpeedFactor = parsed;
            } else {
                return {ok: false, error: 'Idle speed factor must be in (0, 1]'};
            }
        }
    }
    return {
        ok: true,
        fields: {
            angle: deg2rad(parseFloat(values.angle) || 0),
            respawnTicks,
            respawnVariancePct,
            wanderRadius,
            idleSpeedFactor,
            level,
        },
    };
}

/**
 * The populate direction: a spawn's field values as input strings. Every
 * absent optional renders as '' - never the string "undefined", which a
 * number input silently blanks and Update then refuses (L2, the live
 * ascension-stone bug).
 */
export function spawnControlValues(spawn: ZoneSpawn): SpawnControlValues {
    return {
        level: spawn.level !== undefined ? String(spawn.level) : '',
        respawnTicks: spawn.respawnTicks !== undefined ? String(spawn.respawnTicks) : '',
        respawnVariance: spawn.respawnVariancePct !== undefined ? String(spawn.respawnVariancePct) : '',
        angle: String(Math.round(rad2deg(spawn.angle))),
        wanderRadius: spawn.wanderRadius !== undefined ? String(spawn.wanderRadius) : '',
        idleSpeed: spawn.idleSpeedFactor !== undefined ? String(spawn.idleSpeedFactor) : '',
        patrolMode: spawn.patrolMode === 'loop' ? 'loop' : 'pingpong',
    };
}
