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
    // The ground tile this profile paints (C4/D13), named by file stem in
    // features/regions/assets/ground. Under a texture, `color` is the FALLBACK
    // and NEVER a tint (D14) — see {@link regionPaintSpec}, which is where that
    // ruling lives.
    texture?: string | null;
    // Tile scale for that texture, the sensitive knob (§4.8): the raw 750 px
    // tile reads as either ground or wallpaper depending on world scale. Data,
    // tuned by eye, per profile.
    scale?: number;
    // Width of the soft border, in WORLD UNITS (C5/D20). `0` is a hard edge - 
    // the world C4 shipped, and the reason D5's look stays expressible per
    // profile instead of becoming unreachable.
    //
    // ⭐ The authored polygon is the band's MIDDLE (D22): the ramp is symmetric,
    // so a region spills half a band past the line drawn in Tiled. Chosen over
    // insetting because two regions that ABUT then crossfade instead of opening
    // a band-wide gutter of base fill between them.
    //
    // ⚑ Per PROFILE, never per region (D2), and it feathers the region's OWN
    // edge with no knowledge of its neighbours - which is what makes "region
    // meets region" and "region meets bare land" the same code path.
    blend?: number;
}

/** What the world looks like today, and what every miss falls back to (D11).
 *  ⚑ `LAND_COLOR` stays in Theme.ts: it is the base fill the renderer already
 *  draws AND it has a LESS twin that Theme.test.ts pins. Profile colours have
 *  no LESS twin, which is why they live in JSON instead. */
export const DEFAULT_PROFILE: Required<Profile> = {
    color: LAND_COLOR,
    // The world before C4: flat land, no tile. A textured default would make
    // every unpainted corner of every zone depend on an asset load.
    texture: null,
    // 1 = the tile at its own pixel size. Only reached by a profile that
    // declares a texture and omits its scale; every shipped one authors it.
    scale: 1,
    // The world before C5: hard edges. ⚑ A non-zero default would put a mask
    // and a blur pass under every region in every zone that never asked for
    // one - the feature has to cost exactly zero until it is authored.
    blend: 0,
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

/** A texture name is a FILE STEM in `features/regions/assets/ground` — the
 *  loader turns it into a URL by lookup, so anything that is not a plain stem
 *  cannot name a file and is dropped like an unparseable colour.
 *
 *  ⚑ This validates the NOTATION, not the world: whether the file actually
 *  exists is unknowable here (the asset set is a webpack `require.context`,
 *  and this module deliberately stays free of both). A stem naming a file that
 *  is not in the set is caught one layer out, by {@link regionPaintSpec}'s D14
 *  fallback — which is the same answer the spec asks for (paint the colour),
 *  reached at the only layer that can know. */
function parseTextureName(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw)) {
        return undefined;
    }
    return raw;
}

/** A tile scale is a finite positive number. `0` would paint a degenerate
 *  matrix, a negative one mirrors the tile for no reason anyone authored. */
function parseScale(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) {
        return undefined;
    }
    return raw;
}

/** A blend width is a finite NON-NEGATIVE number of world units.
 *
 *  ⛔ Do NOT copy {@link parseScale}'s `<= 0` rejection here, however alike the
 *  two keys look. `0` is a VALID authored value - it is how a profile says
 *  "hard edge", the C4 world and D5's look - and dropping it would leave the
 *  key absent, which under D0 means the next containing region answers instead.
 *  A profile authored `blend: 0` inside one authored `blend: 3` would then
 *  feather anyway, which is the exact opposite of what was written down.
 *
 *  A negative width is meaningless (there is no inward-only band; D22 ruled the
 *  ramp symmetric) and is dropped like an unparseable colour. */
function parseBlend(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !isFinite(raw) || raw < 0) {
        return undefined;
    }
    return raw;
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
        const entry = raw[name] as {
            color?: unknown, texture?: unknown, scale?: unknown, blend?: unknown,
        };
        const profile: Profile = {};
        if (entry && 'color' in entry) {
            if (entry.color === null) {
                profile.color = null;
            } else {
                const parsed = parseColor(entry.color);
                if (parsed !== undefined) { profile.color = parsed; }
            }
        }
        if (entry && 'texture' in entry) {
            if (entry.texture === null) {
                profile.texture = null;
            } else {
                const parsed = parseTextureName(entry.texture);
                if (parsed !== undefined) { profile.texture = parsed; }
            }
        }
        if (entry && 'scale' in entry) {
            const parsed = parseScale(entry.scale);
            if (parsed !== undefined) { profile.scale = parsed; }
        }
        if (entry && 'blend' in entry) {
            const parsed = parseBlend(entry.blend);
            if (parsed !== undefined) { profile.blend = parsed; }
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

/** What a region paints, as data — a tile, a flat colour, or nothing.
 *  Turned into a PixiJS fill by RegionPaint; kept pixi-free here so the D14
 *  ruling below can be pinned by a unit test. */
export type RegionPaintSpec =
    { texture: string, scale: number }
    | { color: number }
    | null;

/**
 * What a region paints (C4), and where **D14** lives: a profile's `color`
 * under a `texture` is the FALLBACK, never a tint. Texture usable → paint the
 * texture; texture missing → paint that same profile's colour; neither → the
 * default (D11), which is the base land fill and therefore invisible rather
 * than wrong.
 *
 * ⚑ **The fallback is WITHIN ONE PROFILE.** It deliberately does NOT go
 * through `resolve()`: D0 answers each property independently, so
 * `resolve('texture') ?? resolve('color')` would happily take the tile from an
 * outer region and the colour from an inner one — two authors' intent blended
 * by accident. Per-point consumers (audio) are unaffected: they ask for one
 * property and take D11's answer.
 *
 * `isTextureUsable` is what the pure module cannot know: whether the named file
 * exists AND finished loading. Injected rather than imported, because the asset
 * set is a webpack `require.context` this module must stay clear of.
 *
 * `null` means "paint nothing here" — an authored `color: null`, the author
 * letting the base fill (D6) or an outer region show through. Callers must SKIP
 * it rather than hand it to `.fill()`.
 *
 * ⚑ Per-region, not per-point (§4.3): the renderer draws each polygon once, it
 * does not ask a question per pixel.
 */
export function regionPaintSpec(
    region: Region,
    isTextureUsable: (name: string) => boolean,
    profiles: { [name: string]: Profile } = PROFILES,
): RegionPaintSpec {
    const profile = profiles[region.profile];
    const texture = profile && 'texture' in profile ? profile.texture : DEFAULT_PROFILE.texture;
    if (typeof texture === 'string' && isTextureUsable(texture)) {
        const scale = profile && 'scale' in profile && profile.scale !== undefined
            ? profile.scale
            : DEFAULT_PROFILE.scale;
        return {texture, scale};
    }
    const color = profile && 'color' in profile ? profile.color : DEFAULT_PROFILE.color;
    return color === null || color === undefined ? null : {color};
}

/**
 * How wide this region's soft border is, in WORLD UNITS (C5). `0` means a hard
 * edge and costs the renderer nothing at all - no mask, no blur pass.
 *
 * ⚑ Its OWN profile's `blend`, else the shipped default - deliberately NOT a
 * `resolve()` call, for the same reason {@link regionPaintSpec} is not one:
 * D0 answers each property at a point, so a region drawn inside another would
 * inherit the outer one's band width and feather an edge its author wrote as
 * hard. The edge belongs to the shape being drawn, so the width does too.
 *
 * ⚑ Per-region, not per-point: the renderer builds one mask per polygon.
 */
export function regionBlend(
    region: Region,
    profiles: { [name: string]: Profile } = PROFILES,
): number {
    const profile = profiles[region.profile];
    const blend = profile && 'blend' in profile ? profile.blend : DEFAULT_PROFILE.blend;
    // An unknown profile, or one transparent to `blend`, ends at the default - 
    // D11's totality, restated at the one layer that can hand a number to Pixi.
    return typeof blend === 'number' ? blend : DEFAULT_PROFILE.blend;
}

/** The texture names the given regions' profiles ask for, deduplicated — what
 *  the loader has to fetch for this zone, and nothing else (⛔ never every
 *  zone's set: §4.9's boot-blocking trap). */
export function neededTextures(
    inRegions: Region[],
    profiles: { [name: string]: Profile } = PROFILES,
): string[] {
    const seen: { [name: string]: true } = {};
    inRegions.forEach((region) => {
        const profile = profiles[region.profile];
        if (profile && typeof profile.texture === 'string') {
            seen[profile.texture] = true;
        }
    });
    return Object.keys(seen);
}
