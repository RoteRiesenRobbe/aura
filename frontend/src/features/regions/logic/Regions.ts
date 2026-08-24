/**
 * The region primitive (plan-region-primitive.md C1).
 *
 * A zone can name polygons — `zone.regions` — each pointing at a PROFILE: a
 * named bag of client-side presentation properties. Ground colour today;
 * footsteps, music and atmosphere are later consumers of the same lookup
 * (plan-region-audio.md, plan-release-map.md §8).
 *
 * ⭐ There is ONE check, not one per consumer: {@link resolve} takes a property
 * and a point, and every consumer already holds a point. A remote player's
 * footstep is the identical call to your own with a different argument.
 *
 * The server parses `regions` and ignores it (world/zone.go) — nothing here is
 * gameplay, and nothing here is authoritative.
 */
// ⚑ Deliberately imports NOTHING heavy. The zone data is handed in by the
// caller rather than read from GroundTextureManager, whose `require.context`
// and PixiJS asset loading are webpack-only and would make this whole module
// untestable — the lookup is the piece most worth having tests on.
import profilesJson from '../../../client-data/profiles.json';
import {LAND_COLOR} from '../../../client-data/Theme';
import {meter2px} from '../../../client-data/BasicConfig';

/** A profile's presentation properties. Every one is OPTIONAL: a profile that
 *  omits a property is transparent to it (D0), so a small blob inside a zone
 *  need not restate the zone's music. C1 declares only `color`; an audio
 *  consumer adds its own key here and nothing else changes. */
export interface Profile {
    // `null` is an authored value meaning "nothing here" (D11), distinct from
    // the key being absent, which means "I have no opinion, ask the next
    // region". Only reachable for a property where nothing is a sensible
    // answer — silence, once audio lands.
    color?: number | null;
}

/** What the world looks like today, and what every miss falls back to (D11).
 *  ⚑ `LAND_COLOR` stays in Theme.ts: it is the base fill the renderer already
 *  draws AND it has a LESS twin that Theme.test.ts pins. Profile colours have
 *  no LESS twin, which is why they live in JSON instead. */
export const DEFAULT_PROFILE: Required<Profile> = {
    color: LAND_COLOR,
};

/** `"#2c4028"` → `0x2c4028`. The JSON is written in the notation an artist
 *  reads; PixiJS wants a number. An unparseable colour is dropped rather than
 *  turned into NaN, so it falls through to the default like any other miss. */
function parseColor(raw: unknown): number | undefined {
    if (typeof raw !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw)) {
        return undefined;
    }
    return parseInt(raw.slice(1), 16);
}

/**
 * Builds the profile table from authored JSON.
 *
 * ⚑ THE RULE THAT KEEPS D11 TRUE, and it is easy to get wrong: a property is
 * DECLARED only when its authored value is usable. A colour the parser rejects
 * leaves the key ABSENT, so the profile stays transparent to colour and the
 * search falls through — never a present key holding `undefined`, which
 * `resolveIn` would hand straight back to a consumer and blow a hole in the
 * one guarantee the whole chain rests on.
 *
 * The single exception is an authored `null`: that is a VALUE meaning "nothing
 * here", the only way to reach silence once audio lands, and it is kept.
 *
 * ⚑ `_`-prefixed keys are documentation (the repo's `_comment` convention),
 * never profiles.
 *
 * Exported for tests; the shipped table is {@link PROFILES}.
 */
export function buildProfiles(raw: { [k: string]: unknown }): { [name: string]: Profile } {
    const out: { [name: string]: Profile } = {};
    Object.keys(raw).forEach((name) => {
        if (name.charAt(0) === '_') { return; }
        const entry = raw[name] as { color?: unknown };
        const profile: Profile = {};
        if (entry && 'color' in entry) {
            if (entry.color === null) {
                profile.color = null;
            } else {
                const parsed = parseColor(entry.color);
                if (parsed !== undefined) { profile.color = parsed; }
            }
        }
        out[name] = profile;
    });
    return out;
}

/** The authored table, keyed by profile name. */
export const PROFILES: { [name: string]: Profile } = buildProfiles(
    profilesJson as { [k: string]: unknown });

export interface RegionPoint {
    x: number;
    y: number;
}

/** A region as the lookup uses it: polygon in WORLD PIXELS.
 *  ⚑ The zone file authors server units; {@link loadZone} converts once, so
 *  every consumer can pass the pixel position it already holds. */
export interface Region {
    profile: string;
    points: RegionPoint[];
}

let regions: Region[] = [];

/** Ray casting. Vertices and edges are not special-cased: a point exactly on a
 *  shared edge lands in one region or the other, never neither, and no consumer
 *  can tell the difference at pixel scale. */
function pointInPolygon(point: RegionPoint, polygon: RegionPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a.y > point.y) !== (b.y > point.y)
            && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * The whole resolution rule (D0), in one place: **the last region in array
 * order that contains the point AND whose profile declares that property
 * wins**. A profile that does not declare it is transparent, so the search
 * continues outward.
 *
 * Total by construction (D11): an unknown profile name, a profile that omits
 * the property, and a point outside everything all end at the default. It
 * never returns `undefined` and never throws — a typo costs one region's look,
 * never a blank world.
 *
 * Exported for tests and taking its table explicitly, so the resolution rule
 * can be pinned without depending on which profiles are authored today.
 */
export function resolveIn<K extends keyof Profile>(
    property: K,
    point: RegionPoint,
    inRegions: Region[],
    profiles: { [name: string]: Profile },
): Profile[K] {
    for (let i = inRegions.length - 1; i >= 0; i--) {
        const profile = profiles[inRegions[i].profile];
        if (profile && property in profile && pointInPolygon(point, inRegions[i].points)) {
            return profile[property];
        }
    }
    return DEFAULT_PROFILE[property];
}

/** {@link resolveIn} against the loaded zone and the authored table. */
export function resolve<K extends keyof Profile>(property: K, point: RegionPoint): Profile[K] {
    return resolveIn(property, point, regions, PROFILES);
}

/** The loaded zone's regions, in world pixels and in authored order — for the
 *  renderer, which draws each polygon in its own colour rather than asking
 *  {@link resolve} per pixel. */
export function loadedRegions(): Region[] {
    return regions;
}

/** Authored shape, straight out of the zone file: server units. */
export interface RegionDefinition {
    profile: string;
    points: { x: number, y: number }[];
}

/** Authored server units → world pixels. The ONE conversion, so the world and
 *  the full-screen map cannot disagree about where a region is — the same rule
 *  MapTerrain's header states for terrain pieces.
 *  An absent array = no regions, which is every zone shipped before this. */
export function toRegions(defs: RegionDefinition[] | undefined): Region[] {
    return (defs || []).map(r => ({
        profile: r.profile,
        points: (r.points || []).map(p => ({x: meter2px(p.x), y: meter2px(p.y)})),
    }));
}

/** Installs the loaded zone's regions for {@link resolve}. */
export function loadRegions(defs: RegionDefinition[] | undefined) {
    regions = toRegions(defs);
}

/**
 * The colour a region paints, or `null` for "paint nothing here".
 *
 * An unknown profile, or one that declares no colour, falls back to the
 * default (D11) — which is the base land fill, so it is invisible rather than
 * wrong. An authored `null` is the deliberate opposite: the author asking for
 * no region paint at all, letting whatever is underneath show through (D6's
 * base fill, or an outer region). Callers must SKIP a null rather than hand it
 * to `.fill()`.
 *
 * ⚑ Per-region, not per-point: colour is resolved once per polygon at load
 * (§4.3), because the renderer draws each region in its own colour rather than
 * asking a question per pixel.
 */
export function regionColor(region: Region): number | null {
    const profile = PROFILES[region.profile];
    if (profile && 'color' in profile) {
        return profile.color;
    }
    return DEFAULT_PROFILE.color;
}
