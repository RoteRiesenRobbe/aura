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
import terrainProfilesJson from '../../../client-data/terrain-profiles.json';
import atmosphereProfilesJson from '../../../client-data/atmosphere-profiles.json';
import {LAND_COLOR} from '../../../client-data/Theme';
import {meter2px, px2meter} from '../../../client-data/BasicConfig';

/**
 * The local player's own glow, in world PX — how far you see with no light
 * source at all. Deliberately TINY, just covering the avatar sprite itself
 * (PO ruling 2026-07-17: darkness stays fully dark).
 *
 * ⭐ ONE definition. It lived in `Player.ts` as `MIN_SELF_LIGHT_PX` until A2,
 * where it became the default of an authorable property — and two copies of a
 * floor, one of them a profile default, is exactly the drift this table exists
 * to prevent. Player.ts no longer floors anything; the darkness overlay applies
 * D7's `max(wire, sight)` once, per frame, for every light it owns.
 *
 * [PLACEHOLDER], like every number a profile can carry.
 */
export const SELF_SIGHT_FLOOR_PX = 40;

/** A profile's presentation properties. Every one is OPTIONAL: a profile that
 *  omits a property is transparent to it (D0), so a small blob inside a zone
 *  need not restate the zone's music. C1 declares only `color`; an audio
 *  consumer adds its own key here and nothing else changes. */
export interface TerrainProfile {
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
    // How fast this profile's TILE drifts, in world UNITS PER SECOND (C3/D9).
    // Absent or {0,0} = still, which is every profile shipped before this and
    // the reason the feature costs exactly zero until it is authored.
    //
    // ⚑ It scrolls the TEXTURE, not the shape: the river stays where it was
    // drawn and the water inside it moves. So a profile authoring `texture:
    // null` (or naming a file that is not there) animates NOTHING — a flat
    // colour has no visible phase. That is D14's fallback staying honest, not
    // a missing case.
    //
    // ⚑ Per PROFILE, like `blend` and for D2's reason: it is what the material
    // IS. A river's direction is not expressible here — the drift is one world
    // vector shared by every shape on the profile — and that is the accepted
    // limit, not an oversight (D9).
    scroll?: { x: number, y: number };
}

/**
 * The AIR over an area: every terrain key, plus the three only air answers.
 *
 * ⭐ THE SPLIT IS A SEPARATE FILE, not a flag (PO 2026-09-15). One shared
 * table meant one Tiled dropdown holding both vocabularies, so a ground
 * profile on an atmosphere drew nothing and an atmosphere profile on a region
 * painted grey mud — L15, and it cost a session. `atmosphere-profiles.json`
 * feeds its own `AuraAtmosphereProfile` enum, so neither mistake is offerable.
 *
 * ⚑ It EXTENDS rather than replaces, because fog legitimately wants `texture`,
 * `scale`, `blend`, `scroll` and `color` — the air is a surface too. What the
 * split buys is the other direction: `TERRAIN_PROFILES.Forest.darkness` is now
 * a compile error rather than data nothing reads.
 */
export interface AtmosphereProfile extends TerrainProfile {
    // ⭐ THE AIR IS TWO THINGS, and this pair is the split (PO 2026-09-14,
    // replacing the single `gloom`). They are not two names for one dial:
    //
    //   `darkness` is the ABSENCE OF LIGHT. A lantern removes it by definition,
    //   so it is drawn where the light holes can erase it.
    //
    //   `haze` is SUSPENDED MATTER — fog, smoke, dust. A lantern does not blow
    //   it away (headlights in fog make things worse), so it is drawn where
    //   nothing can erase it.
    //
    // ⭐ The behaviour follows from WHICH ONE YOU AUTHOR rather than from a flag
    // beside a number, so the two can never contradict each other — the same
    // "no second source of truth" rule the closed-path shape flag follows.
    //
    // ⚑ Authoring BOTH is the smoky cave and it is supported: the shape is
    // painted into both layers, so a lantern cuts the black and leaves the fog
    // lit. ⛔ Their opacities COMPOUND rather than max — 0.8 darkness under 0.4
    // haze reads about 0.88 unlit — which is the thing to remember when tuning.

    // How dark this profile's air is — 0…1, the opacity of the BLACK painted
    // over the shape (plan-region-atmosphere.md A1). Absent = this profile has
    // no opinion, so the next containing atmosphere answers; `0` is an authored
    // CLEARING and draws as an ERASE (D3), which is how a lit pocket inside a
    // dark cave works without a second drawing system.
    //
    // ⛔ COLOUR ONLY — never textured, never drifting. Darkness has no texture
    // in the world and none here: `texture` and `scroll` belong to `haze`, and
    // honouring them on both would draw one profile's tile TWICE, compounding
    // it against itself.
    //
    // ⚑ Read ONLY from the `atmospheres` array (D0/D15) and ONLY out of
    // {@link ATMOSPHERE_PROFILES}. Since the 2026-09-15 split a ground profile
    // cannot declare this at all — the key is not on {@link TerrainProfile} and
    // Regions.test.ts fails if terrain-profiles.json grows one.
    //
    // ⚑ PER PROFILE and per SHAPE, like `blend` and `scroll` and for D2's
    // reason: it is what the air IS. The per-POINT question ("how dark is it
    // where I am standing") is the same number reached through resolve(), and
    // §3.3 is why the two agree for free.
    darkness?: number;
    // How thick this profile's visible medium is — 0…1, the opacity of the fog
    // or smoke painted over the shape. Absent = none; `0` is an authored hole
    // in the haze, by the same rule `darkness: 0` is a hole in the black.
    //
    // ⭐ THIS is the half that carries `texture`, `scale`, `scroll` and
    // `blend` — a fog bank is a drifting tile with a soft edge, and darkness is
    // not.
    //
    // ⛔ NOTHING ERASES IT. It renders in its own layer beneath the darkness,
    // outside the reach of every light hole, which is the whole point: a lamp
    // shows you the fog, it does not disperse it.
    //
    // ⚑ Drawn UNDER the darkness, so fog is only visible where there is light
    // to see it by — an unlit smoky cave reads black, and the fog appears in
    // the lantern pocket. That ordering is the rule, not a preference.
    haze?: number;
    // How far the local player sees UNAIDED inside this air, in WORLD UNITS
    // (plan-region-atmosphere.md A2). Resolved PER POINT at the player, unlike
    // the two above, which are drawn per shape — §3.1 is why getting the two the wrong
    // way round is the trap.
    //
    // ⭐ D7: it can only ever make a place KINDER. The hole is
    // `max(wire light_radius, sight)`, never a replacement, so an atmosphere
    // cannot cancel a Lantern — and the GDD's light-vs-damage trade-off, where
    // the aura is what buys you the room, survives a knob nobody has tuned yet.
    //
    // For scale against a 20 x 12 unit screen: Lantern is r 4.0 (+0.5/level),
    // Torch 2.5 (+0.25), a campfire 7.0. So ~2 reads as "grope forward", ~4 as
    // "a dim room", and much past ~8 stops being darkness at all.
    sight?: number;
}

/** Every key any profile can carry — the type the generic lookup machinery
 *  ({@link resolveIn}, {@link DEFAULT_PROFILE}) works in, since a terrain table
 *  is assignable to it and an atmosphere table IS it. Reach for
 *  {@link TerrainProfile} or {@link AtmosphereProfile} when naming which half
 *  you mean; this alias is for code that genuinely handles both. */
export type Profile = AtmosphereProfile;

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
    // The world before C3: nothing moves. ⚑ A non-zero default would put a
    // TilingSprite and a per-frame write under every textured region in every
    // zone that never asked for one.
    scroll: {x: 0, y: 0},
    // The world before atmosphere: nothing is dark except the authored
    // `darkAreas` circles. ⚑ A non-zero default would black out every zone the
    // moment A1 shipped — the feature has to cost exactly zero until a profile
    // asks for it, the bar `blend` and `scroll` were both held to.
    darkness: 0,
    // ⚑ Zero for the same reason: the feature costs nothing until a profile
    // asks for it. An undeclared shape is not a hole, it simply does not draw
    // — see declaresHaze.
    haze: 0,
    // ⭐ The shipped floor, unchanged in world terms: this IS the tiny self-glow
    // the darkness overlay has always given the local player, now expressed as
    // a profile default so a region can raise it. Nothing moves until a profile
    // authors otherwise. See {@link SELF_SIGHT_FLOOR_PX}.
    sight: px2meter(SELF_SIGHT_FLOOR_PX),
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

/** Sight is a RADIUS in world units: finite and not negative.
 *
 *  ⚑ `0` is legal and means "you see nothing unaided" — a profile is entitled
 *  to say that, and D7 keeps it survivable, because a Lantern still wins the
 *  `max`. There is no upper bound to check: a very large value simply stops
 *  being darkness, which is a look decision and not an error. */
function parseSight(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !isFinite(raw) || raw < 0) {
        return undefined;
    }
    return raw;
}

/** Both air dials are an OPACITY: a finite number in 0…1.
 *
 *  ⛔ Do NOT reject `0`, for the reason {@link parseBlend} documents and then
 *  one more: zero is not merely "explicitly not dark", it is the AUTHORED
 *  CLEARING that D3 draws as an erase. Dropping it would leave the key absent,
 *  which means "no opinion" — and the lit pocket would silently stay black.
 *
 *  ⚑ Out-of-range is DROPPED rather than clamped. A profile asking for `2`
 *  has misunderstood the unit, and falling back to the default makes that
 *  visible immediately; silently clamping to 1 would look like it worked. */
function parseOpacity(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !isFinite(raw) || raw < 0 || raw > 1) {
        return undefined;
    }
    return raw;
}

/** A drift vector is a pair of finite numbers of world units per second.
 *
 *  ⛔ Do NOT reject `{x: 0, y: 0}`, however pointless it looks — it is the
 *  same trap {@link parseBlend} documents. Zero is a VALID authored value
 *  meaning "explicitly still", and dropping it would leave the key absent,
 *  which under D0 lets an outer region's drift answer instead.
 *
 *  A non-finite component is meaningless and would walk `tilePosition` to NaN,
 *  which blanks the sprite rather than degrading — so the whole vector is
 *  dropped, like an unparseable colour. */
function parseScroll(raw: unknown): { x: number, y: number } | undefined {
    if (typeof raw !== 'object' || raw === null) {
        return undefined;
    }
    const {x, y} = raw as { x?: unknown, y?: unknown };
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
        return undefined;
    }
    return {x, y};
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
 * ⚑ ONE builder for BOTH tables, on purpose: this parses a JSON bag and has
 * no opinion about which half it is parsing. What separates the two is the
 * FILE they come from and the TYPE they are read back at.
 *
 * Exported for tests; the shipped tables are {@link TERRAIN_PROFILES} and
 * {@link ATMOSPHERE_PROFILES}.
 */
export function buildProfiles(raw: { [k: string]: unknown }): { [name: string]: Profile } {
    const out: { [name: string]: Profile } = {};
    Object.keys(raw).forEach((name) => {
        if (name.charAt(0) === '_') { return; }
        const entry = raw[name] as {
            color?: unknown, texture?: unknown, scale?: unknown, blend?: unknown,
            scroll?: unknown, darkness?: unknown, haze?: unknown, sight?: unknown,
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
        if (entry && 'darkness' in entry) {
            const parsed = parseOpacity(entry.darkness);
            if (parsed !== undefined) { profile.darkness = parsed; }
        }
        if (entry && 'haze' in entry) {
            const parsed = parseOpacity(entry.haze);
            if (parsed !== undefined) { profile.haze = parsed; }
        }
        if (entry && 'sight' in entry) {
            const parsed = parseSight(entry.sight);
            if (parsed !== undefined) { profile.sight = parsed; }
        }
        if (entry && 'scroll' in entry) {
            const parsed = parseScroll(entry.scroll);
            if (parsed !== undefined) { profile.scroll = parsed; }
        }
        out[name] = profile;
    });
    return out;
}

/**
 * The GROUND table, keyed by profile name — what `zone.regions`, `zone.paths`
 * and `zone.polygons` name, plus the `outlineProfile` of the latter two.
 *
 * ⚑ Typed DOWN to {@link TerrainProfile} deliberately: `TERRAIN_PROFILES.Forest
 * .darkness` is a compile error, where before the split it was data that simply
 * nothing read.
 */
export const TERRAIN_PROFILES: { [name: string]: TerrainProfile } = buildProfiles(
    terrainProfilesJson as { [k: string]: unknown });

/**
 * The AIR table, keyed by profile name — what `zone.atmospheres` names, and the
 * only table `darkness`, `haze` and `sight` are ever read out of.
 *
 * ⛔ The names in the two tables are DISJOINT and a test pins that. They are
 * separate namespaces, not one table split for tidiness: a name in both would
 * make "which Fog?" depend on which accessor you happened to call.
 */
export const ATMOSPHERE_PROFILES: { [name: string]: AtmosphereProfile } = buildProfiles(
    atmosphereProfilesJson as { [k: string]: unknown });

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
 *  can tell the difference at pixel scale.
 *
 *  ⭐ EXPORTED since A4, and the export is the point: a clearing names no
 *  profile, so it can never ride `resolveIn` the way the four profile-bearing
 *  shapes do — but it must answer the SAME containment question, by the same
 *  rule, or a hole would be drawn in one place and resolved in another. One
 *  ray-cast, four callers. */
export function pointInPolygon(point: RegionPoint, polygon: RegionPoint[]): boolean {
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
    return resolveIn(property, point, regions, TERRAIN_PROFILES);
}

/** The loaded zone's regions, in world pixels and in authored order — for the
 *  renderer, which draws each polygon in its own colour rather than asking
 *  {@link resolve} per pixel. */
export function loadedRegions(): Region[] {
    return regions;
}

/** Authored shape, straight out of the zone file: server units. */
/**
 * A second surface drawn along a shape's boundary (plan-zone-polygons.md D3) —
 * on BOTH paths and polygons, which is why it lives beside Region rather than in
 * either module.
 *
 * ⭐ It names a PROFILE, not a colour, and that is the whole design: a profile
 * carries its own `blend`, so a wall's rim is hard and a riverbank's is soft
 * without either of them constraining the surface underneath.
 */
export interface Outlined {
    /** Absent or empty = no outline. */
    outlineProfile?: string;
    /** Stroke width in world PIXELS (the zone authors server units). */
    outlineWidth?: number;
}

/**
 * Authored outline fields → the renderer's, in world pixels. ONE function for
 * both shapes, because a second copy is a second place for the unit conversion
 * to drift.
 *
 * ⚑ HALF-authored degrades to NO outline rather than to half of one. The server
 * refuses both halves (world/zone.go validateOutline), so this is the client's
 * own degrade path for a hand-edited file — and a zero-width stroke or a
 * profile-less one would draw nothing anyway, so the only choice is whether the
 * absence is deliberate.
 */
export function outlineOf(def: {outlineProfile?: string, outlineWidth?: number}): Outlined {
    const width = def.outlineWidth;
    if (!def.outlineProfile || typeof width !== 'number' || !isFinite(width) || width <= 0) {
        return {};
    }
    return {outlineProfile: def.outlineProfile, outlineWidth: meter2px(width)};
}

export interface RegionDefinition {
    profile: string;
    points: { x: number, y: number }[];
}

/** Authored server units → world pixels. The ONE conversion, so the world and
 *  the full-screen map cannot disagree about where a region is — the same rule
 *  MapTerrain's header states for terrain pieces.
 *  An absent array = no regions, which is every zone shipped before this. */
export function toRegions(defs: RegionDefinition[] | undefined, origin?: {x: number, y: number}): Region[] {
    return (defs || []).map(r => ({
        profile: r.profile,
        points: (r.points || []).map(p => ({
            x: meter2px(p.x + (origin ? origin.x : 0)),
            y: meter2px(p.y + (origin ? origin.y : 0)),
        })),
    }));
}

/** Installs the loaded zone's regions for {@link resolve}.
 *
 *  ⚑ REPLACES, never appends — a zone swap calls this again with the new
 *  zone's polygons and the old ones must not survive it.
 *
 *  origin places the zone in the shared coordinate space (plan-underworld.md
 *  U2). Absent = {0,0}, which is the overworld and every zone authored before
 *  zones could be placed. */
export function loadRegions(defs: RegionDefinition[] | undefined, origin?: {x: number, y: number}) {
    regions = toRegions(defs, origin);
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
    profiles: { [name: string]: TerrainProfile } = TERRAIN_PROFILES,
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
    profiles: { [name: string]: TerrainProfile } = TERRAIN_PROFILES,
): number {
    const profile = profiles[region.profile];
    const blend = profile && 'blend' in profile ? profile.blend : DEFAULT_PROFILE.blend;
    // An unknown profile, or one transparent to `blend`, ends at the default - 
    // D11's totality, restated at the one layer that can hand a number to Pixi.
    return typeof blend === 'number' ? blend : DEFAULT_PROFILE.blend;
}

/**
 * How far the local player sees unaided at `point`, in world units — the LAST
 * containing atmosphere that declares `sight`, else the shipped floor
 * (plan-region-atmosphere.md A2).
 *
 * ⚑ PER POINT, unlike {@link regionDarkness}: this answers "where am I standing",
 * so it is a `resolveIn` over the shape list and not a read off one shape. The
 * caller passes the ATMOSPHERES; sight does not live on the ground (D0/D15).
 */
export function resolveSight(
    point: RegionPoint,
    inAtmospheres: Region[],
    profiles: { [name: string]: AtmosphereProfile } = ATMOSPHERE_PROFILES,
): number {
    const sight = resolveIn('sight', point, inAtmospheres, profiles);
    return typeof sight === 'number' ? sight : DEFAULT_PROFILE.sight;
}

/**
 * ⭐ **D7 — the whole of it, and it is one `Math.max`.** The local player's
 * darkness hole is the LARGER of the light they are carrying and the sight the
 * air affords them, both in world PX.
 *
 * `sight` may only ever RAISE the hole, never lower it. Without that an
 * authored region could cancel a Lantern, and the GDD's light-vs-damage
 * trade-off — the aura is what buys you the room — would be revocable by map
 * data. It also means an atmosphere can only ever make a place KINDER, which
 * is a good property for a knob nobody has tuned.
 *
 * ⛔ Pure, exported and tested HERE rather than left inline in
 * `DarknessOverlay`, because the failure is silent: flipped to a plain
 * assignment, a Lantern simply stops working inside any region that authors
 * `sight`, nothing throws, and the screen still looks like darkness working.
 */
export function lightRadiusWithSight(wireRadiusPx: number, sightPx: number): number {
    return Math.max(wireRadiusPx, sightPx);
}

/**
 * How dark this surface's air is, 0…1 — its OWN profile's `darkness`, else the
 * shipped default of 0 (plan-region-atmosphere.md A1).
 *
 * ⚑ Per-shape, exactly like {@link regionBlend}: the number that DRAWS comes
 * from the shape being drawn, never from a resolve() at some point inside it.
 * A clearing drawn inside a fog bank must not inherit the bank's opacity, for
 * the same reason a still pond inside a river must not inherit its current.
 */
export function regionDarkness(
    region: Region,
    profiles: { [name: string]: AtmosphereProfile } = ATMOSPHERE_PROFILES,
): number {
    return opacityOf(region, 'darkness', profiles);
}

/** How thick this surface's visible medium is, 0…1 — its OWN profile's
 *  `haze`, else the shipped default of 0. Same per-shape rule as
 *  {@link regionDarkness}. */
export function regionHaze(
    region: Region,
    profiles: { [name: string]: AtmosphereProfile } = ATMOSPHERE_PROFILES,
): number {
    return opacityOf(region, 'haze', profiles);
}

function opacityOf(
    region: Region,
    key: 'darkness' | 'haze',
    profiles: { [name: string]: Profile },
): number {
    const profile = profiles[region.profile];
    const value = profile && key in profile ? profile[key] : DEFAULT_PROFILE[key];
    return typeof value === 'number' ? value : (DEFAULT_PROFILE[key] as number);
}

/**
 * Does this surface's own profile SAY anything about darkness?
 *
 * ⭐ Distinct from `regionDarkness(s) === 0`, and the difference is the whole
 * of D3: a profile that DECLARES `darkness: 0` is an authored clearing and
 * draws as an ERASE, while one that declares nothing is transparent and draws
 * NOTHING AT ALL. Collapsing the two would punch a hole through every fog bank
 * that an ordinary undeclared shape happens to overlap.
 *
 * ⚑ It is also what makes the property EXIST rather than merely be dim, which
 * cost a PO session: removing `gloom` from Fog made the whole bank vanish —
 * texture, drift and all — rather than making it pale. Same rule here, now
 * split across two properties, so a fog profile needs `haze` and a dark one
 * needs `darkness` before anything is drawn at all.
 */
export function declaresDarkness(
    region: Region,
    profiles: { [name: string]: AtmosphereProfile } = ATMOSPHERE_PROFILES,
): boolean {
    return declares(region, 'darkness', profiles);
}

/** Does this surface's own profile SAY anything about haze? Same rule and same
 *  reason as {@link declaresDarkness}. */
export function declaresHaze(
    region: Region,
    profiles: { [name: string]: AtmosphereProfile } = ATMOSPHERE_PROFILES,
): boolean {
    return declares(region, 'haze', profiles);
}

function declares(
    region: Region,
    key: 'darkness' | 'haze',
    profiles: { [name: string]: Profile },
): boolean {
    const profile = profiles[region.profile];
    return !!profile && key in profile && typeof profile[key] === 'number';
}

/**
 * How fast this surface's tile drifts, in world UNITS PER SECOND (C3).
 * `{x: 0, y: 0}` means still and costs the renderer nothing at all — no
 * TilingSprite, no per-frame write.
 *
 * ⚑ Its OWN profile's `scroll`, else the shipped default — deliberately NOT a
 * `resolve()` call, for exactly the reason {@link regionBlend} is not one: D0
 * answers each property at a POINT, so a still pond drawn inside a flowing
 * river would inherit the river's current. The motion belongs to the shape
 * being drawn, so the vector does too.
 *
 * ⚑ Returns a FRESH object every call. The default is a shared literal, and a
 * caller that scaled it in place would make every still profile in the session
 * drift.
 */
export function regionScroll(
    region: Region,
    profiles: { [name: string]: TerrainProfile } = TERRAIN_PROFILES,
): { x: number, y: number } {
    const profile = profiles[region.profile];
    const scroll = profile && 'scroll' in profile ? profile.scroll : DEFAULT_PROFILE.scroll;
    // An unknown profile, or one transparent to `scroll`, ends at the default —
    // D11's totality, restated at the layer that hands numbers to Pixi.
    return scroll === undefined || scroll === null
        ? {...DEFAULT_PROFILE.scroll}
        : {x: scroll.x, y: scroll.y};
}

/** The texture names the given regions' profiles ask for, deduplicated — what
 *  the loader has to fetch for this zone, and nothing else (⛔ never every
 *  zone's set: §4.9's boot-blocking trap). */
export function neededTextures(
    inRegions: Region[],
    profiles: { [name: string]: TerrainProfile } = TERRAIN_PROFILES,
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
