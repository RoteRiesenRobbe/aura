#!/usr/bin/env node
/**
 * Generates Tiled's palette for the Aura zone format, from the same content the
 * game loads. Run from the repo root:
 *
 *     node tools/tiled/generate-palette.mjs
 *
 * Output (all checked in, all overwritten wholesale — never hand-edit):
 *   tools/tiled/palette/terrain.tsx        image-collection tileset, 1 tile per ground-texture type
 *   tools/tiled/palette/props.tsx          image-collection tileset, 1 tile per prop type
 *   tools/tiled/palette/propertytypes.json the same custom types, for hand-import when
 *                                          working WITHOUT the project
 *   tools/tiled/palette/content.json        the converter's content vocabulary
 *                                          (terrain types, prop bodies, mob kinds + speeds,
 *                                           region profiles)
 *   tools/tiled/aura.tiled-project          its propertyTypes array, patched in place
 *
 * ⚑ Why generated: the in-game editor bundles api/ straight in with
 * require.context "so the editor can never drift from what the server loads".
 * A hand-maintained palette would drift the moment a prop or texture is added,
 * and silently — so this fails LOUDLY on anything it cannot resolve.
 *
 * ⚑ The tilesets reference the frontend's real asset files by relative path.
 * Nothing is copied and nothing is rasterised: Tiled ships Qt's SVG image
 * plugin, so the 14 SVG textures load as-is (measured in C0).
 */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const PALETTE = path.join(ROOT, 'tools', 'tiled', 'palette');
const TOOLS = path.join(ROOT, 'tools', 'tiled');

// The converter owns the inherit sentinels (C6). Reading them from it keeps the
// palette’s class defaults and the converter’s omit rules a SINGLE definition
// — two copies that a test compares would still be two copies.
const C = createRequire(import.meta.url)(
    path.join(TOOLS, 'extensions', 'aura-zone', 'aura-convert.js'));
const MOB_UNSET = C.MOB_UNSET;
const PROFILE_UNSET = C.PROFILE_UNSET;
const EFFECT_UNSET = C.EFFECT_UNSET;

function fail(msg) {
    console.error('generate-palette: ' + msg);
    process.exit(1);
}

/* ---- asset dimensions --------------------------------------------------- */

function imageSize(abs) {
    if (!existsSync(abs)) { fail('asset not found: ' + path.relative(ROOT, abs)); }
    const buf = readFileSync(abs);
    if (abs.endsWith('.png')) {
        if (buf.readUInt32BE(0) !== 0x89504e47) { fail('not a PNG: ' + abs); }
        return {w: buf.readUInt32BE(16), h: buf.readUInt32BE(20)};
    }
    if (abs.endsWith('.svg')) {
        const head = buf.toString('utf8', 0, 2000);
        const wh = /width="(\d+(?:\.\d+)?)(?:px)?"[^>]*?height="(\d+(?:\.\d+)?)(?:px)?"/.exec(head);
        if (wh) { return {w: Math.round(+wh[1]), h: Math.round(+wh[2])}; }
        const vb = /viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/.exec(head);
        if (vb) { return {w: Math.round(+vb[1]), h: Math.round(+vb[2])}; }
        fail('cannot read SVG dimensions: ' + path.relative(ROOT, abs));
    }
    fail('unsupported asset type: ' + abs);
}

/* ---- sources ------------------------------------------------------------- */

// Ground textures live in the client's Graphics config, keyed by exactly the
// string world.json's terrain[].type carries.
function readTerrainTypes() {
    const src = readFileSync(path.join(ROOT, 'frontend/src/client-data/Graphics.ts'), 'utf8');
    const i = src.indexOf('groundTextureTypes:');
    if (i < 0) { fail('groundTextureTypes not found in Graphics.ts'); }
    const re = /'([^']+)':\s*\{[^}]*?file:\s*require\('([^']+)'\)/g;
    const out = [];
    let m;
    while ((m = re.exec(src.slice(i)))) {
        // paths in Graphics.ts are relative to frontend/src/client-data/
        const abs = path.resolve(ROOT, 'frontend/src/client-data', m[2]);
        out.push({type: m[1], abs, ...imageSize(abs)});
    }
    if (out.length === 0) { fail('parsed zero ground-texture types'); }
    return out;
}

// Each prop names its own sprite file directly (relative to
// frontend/src/features/game-objects/assets/resources/) via `sprite` in its
// api/props/*.json — the single source of truth the client's generic prop
// class (Props.ts) also reads. A missing/empty `sprite` is a boot-time
// hard-fail server-side (world/props.go), so it can never reach this script.
function readProps() {
    const dir = path.join(ROOT, 'api', 'props');
    return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
        const def = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
        const rel = 'frontend/src/features/game-objects/assets/resources/' + def.sprite;
        const abs = path.resolve(ROOT, rel);
        const body = def.body || {};
        // Units, matching the physics body: a circle spans 2*radius, a rect its
        // own width/height. This is what makes a prop hit-test at true size.
        const wUnits = body.radius ? body.radius * 2 : body.width;
        const hUnits = body.radius ? body.radius * 2 : body.height;
        if (!(wUnits > 0) || !(hUnits > 0)) { fail(`prop "${def.name}" has no usable body`); }
        return {type: def.name, entityType: def.entityType, abs, wUnits, hUnits, ...imageSize(abs)};
    }).sort((a, b) => a.type.localeCompare(b.type));
}

// kindOf, mirrored from ZoneModel.ts — the derived spawn category the in-game
// editor already colours its markers by. Never authored, always derived.
function kindOf(def) {
    if (def.interaction != null) { return 'talker'; }
    if (def.role === 'structure') { return 'fixture'; }
    if (def.role === 'follower') { return 'companion'; }
    return 'combat';
}

function readMobs() {
    const dir = path.join(ROOT, 'api', 'mobs');
    return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
        const def = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
        // speed feeds the save-time mirror of zone.go's resolve() check: a mob that
        // cannot walk cannot wander or patrol. Absent is 0 there, so absent is 0 here.
        return {name: def.name, kind: kindOf(def), speed: (def.factors && def.factors.speed) || 0};
    }).sort((a, b) => a.name.localeCompare(b.name));
}

// The effect vocabulary an area may name (plan-area-effects.md E1/D3). An
// `effect` on a shape names an AUTHORED SKILL — never a raw number, because a
// bare magnitude would invent a second damage pipeline with no damage type, no
// resistances and no immunity rails. So the dropdown is the skill roster, read
// from the same api/skills/ the server loads.
//
// ⭐ It offers EVERY skill, and that is deliberate rather than lax. Filtering to
// "skills carrying an effect type an area can apply" would bake E2's ruling into
// E1's palette a chunk early — E2 is what decides which effect types an area
// consumes, and until it does there is no rule to filter by. The boot-time check
// (world.CrossValidateAreaEffects) takes the same posture: existence only.
//
// ⛔ IT RECURSES, AND THAT IS NOT A DETAIL. api/skills/ has a mobs/ SUBDIRECTORY
// holding 33 more definitions, and the Go registry walks the tree
// (skills.RegistryFromFS uses fs.WalkDir), so the server knows all of them. A
// flat readdir here offered 72 of 105 — which would make Tiled REFUSE a name the
// server accepts, the palette drifting from the content it is generated from,
// which is the exact failure this file's header forbids. ⚑ It also matters on
// the merits: an area effect has no caster (L2), so a mob-flavoured aura is
// often the better fit for a lava pool than a player skill.
//
// ⚑ SORTED, unlike the profile tables. Those are hand-written tables whose order
// is the author's grouping; this is a hundred-odd files across two directories,
// where walk order is an accident and alphabetical is the only stable thing to
// show a person hunting for a name. ⚑ Names are unique across the whole tree —
// the registry hard-fails on a duplicate — so flattening two directories into
// one list is faithful rather than lossy.
function readEffects() {
    const root = path.join(ROOT, 'api', 'skills');
    const out = [];
    (function walk(dir) {
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(abs); continue; }
            if (!entry.name.endsWith('.json')) { continue; }
            const def = JSON.parse(readFileSync(abs, 'utf8'));
            if (!def.name) { fail('skill file has no name: ' + path.relative(ROOT, abs)); }
            out.push(def.name);
        }
    })(root);
    if (out.length === 0) { fail('parsed zero skills from api/skills'); }
    const seen = new Set();
    for (const n of out) {
        if (seen.has(n)) { fail('duplicate skill name: ' + n); }
        seen.add(n);
    }
    return out.sort((a, b) => a.localeCompare(b));
}

// Profile tables (plan-region-primitive.md D12). ⚑ The ONE reason they are JSON
// and not TypeScript: the client imports them and this Node script reads them,
// so the Tiled dropdown and what the client can actually resolve are the same
// list by construction. A .ts table would have forced a hand-kept enum here —
// the exact drift this generator's header forbids.
//
// ⭐ TWO tables since 2026-09-15, and the split is the whole point: they used to
// share one file and therefore ONE dropdown, so a ground profile could be named
// on an atmosphere (drawing nothing) and an atmosphere profile on a region
// (painting grey mud). Two files means two enums — AuraProfile for the ground,
// AuraAtmosphereProfile for the air — and neither mistake is offerable.
//
// ⚑ Authored order, not sorted: each is a hand-written table and its order is
// the author's grouping. content.json's ENUM_VALUES is derived from what is
// emitted here, so the two orderings cannot drift — which matters, because
// Tiled hands an enum property back as an INDEX into this list.
//
// ⚑ '_'-prefixed keys are documentation (the repo's _comment convention),
// skipped here exactly as Regions.buildProfiles skips them client-side.
function readProfileTable(name) {
    const file = path.join(ROOT, 'frontend/src/client-data/' + name);
    if (!existsSync(file)) { fail('profile table not found: ' + path.relative(ROOT, file)); }
    const table = JSON.parse(readFileSync(file, 'utf8'));
    const out = Object.keys(table).filter(k => k.charAt(0) !== '_');
    if (out.length === 0) { fail('parsed zero profiles from ' + path.relative(ROOT, file)); }
    return out;
}

/* ---- emitters ------------------------------------------------------------ */

const xmlEscape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function tileset(name, cls, tiles) {
    const maxW = Math.max(...tiles.map(t => t.w));
    const maxH = Math.max(...tiles.map(t => t.h));
    const body = tiles.map((t, i) => {
        const src = path.relative(PALETTE, t.abs).replace(/\\/g, '/');
        return ` <tile id="${i}" type="${cls}">\n`
            + `  <properties>\n   <property name="auraType" value="${xmlEscape(t.type)}"/>\n  </properties>\n`
            + `  <image source="${xmlEscape(src)}" width="${t.w}" height="${t.h}"/>\n`
            + ` </tile>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n`
        + `<!-- GENERATED by tools/tiled/generate-palette.mjs — do not hand-edit. -->\n`
        + `<tileset version="1.10" tiledversion="1.12.2" name="${name}"`
        + ` tilewidth="${maxW}" tileheight="${maxH}" tilecount="${tiles.length}" columns="0">\n`
        + ` <grid orientation="orthogonal" width="1" height="1"/>\n${body}\n</tileset>\n`;
}

// Tiled custom types. ⚑ Enums only for the free-text fields, plus one class per
// spawn kind, carrying a COLOUR and — since C6 — the typed spawn form.
//
// ⭐ C2 refused class members because a member carries a DEFAULT, which would
// make the property present on every object and silently rewrite ~226
// inheriting spawns. C6 makes them safe by setting each default TO the inherit
// sentinel (aura-convert.js SPAWN_INHERIT). That closes the loop both ways:
// the converter maps sentinel → omitted, and if Tiled instead drops a property
// that merely equals its class default, the converter sees it absent and
// reaches the same answer. The design does not depend on which Tiled does.
//
// ⚑ Which is exactly why AuraProp gets NO members. `blocksMovement` is a bool
// with no spare value, so it has no sentinel — a default of true and a Tiled
// that omits default-valued properties would flip all 777 props to false.
const KIND_COLOUR = {
    combat: '#ff4caf50',    // the in-game editor's marker colours, verbatim
    talker: '#ffe91e63',
    fixture: '#ff9e9e9e',
    companion: '#ff795548',
};

function propertyTypes(terrain, props, mobs, profiles, airProfiles, effects) {
    let id = 0;
    const enumType = (name, values) => ({
        id: ++id, name, type: 'enum', storageType: 'string',
        values, valuesAsFlags: false,
    });
    const classType = (name, color, members = []) => ({
        id: ++id, name, type: 'class', color,
        drawFill: true, useAs: ['property', 'object'], members,
    });

    const member = (name, type, value, propertyType) =>
        propertyType ? {name, type, propertyType, value} : {name, type, value};

    // A second surface along the shape's boundary — a riverbank, a mortar edge,
    // a cliff lip (plan-zone-polygons.md D3). On BOTH surface classes, because
    // they carry exactly the same pair.
    //
    // ⚑ Leaving outlineProfile at the placeholder means NO OUTLINE here, which
    // is legal — unlike `profile`, where the same sentinel is refused. Tiled has
    // no nullable enum, so one value has to mean "unset" on both members and the
    // validator decides what unset means per member.
    // ⛔ outlineWidth is DECORATION and never touches collision (L4). On a
    // polygon it is also the ONLY width there is, which is the thing an author
    // reaching for "how wide is my wall" will find (L7).
    const OUTLINE_MEMBERS = [
        member('outlineProfile', 'string', PROFILE_UNSET, 'AuraProfile'),
        member('outlineWidth', 'float', 0),
    ];

    // The area effect (plan-area-effects.md E1). ONE member, shared by the three
    // shapes that may carry one, because they carry exactly the same key.
    //
    // ⚑ EFFECT_UNSET means NO EFFECT here — the outlineProfile reading of the
    // sentinel, not the profile one. Tiled has no nullable enum and a class
    // member always has a value, so one entry has to stand for "unset" and the
    // validator decides per member what unset means. On 'profile' it is a
    // mistake the save refuses; here it is the overwhelmingly common case and
    // perfectly legal, which is what keeps every existing shape unchanged.
    //
    // ⛔ NOT on AuraRegion and NOT on AuraClearing, and both omissions are
    // rulings. A region is the MATERIAL UNDERFOOT — the footsteps/music/colour
    // lookup — and an effect is a thing in a place, not a property of every
    // patch of that material. A clearing paints nothing and carries no profile
    // at all (A4/L7); an erase that also burned you would be one shape doing two
    // jobs, which is the ambiguity A4 exists to have removed.
    const EFFECT_MEMBER = member('effect', 'string', EFFECT_UNSET, 'AuraEffect');

    // ⭐ The defaults are READ FROM the converter, never retyped here. They must
    // equal its inherit sentinels exactly, and the cheapest way to guarantee
    // that is to have one definition rather than two that a test compares.
    // Everything not named here is a float. ⛑ `anchor` is the first NON-NUMERIC
    // spawn knob (plan-underworld.md U3b), which is why this stopped being a
    // NUMERIC_TYPE map: typing it 'float' would give Tiled a numeric field for a
    // zone-anchor name and silently discard whatever was typed into it.
    const MEMBER_TYPE = {level: 'int', respawnTicks: 'int', anchor: 'string'};
    const SPAWN_MEMBERS = [member('mob', 'string', MOB_UNSET, 'AuraMobName')]
        .concat(Object.keys(C.SPAWN_INHERIT).map(
            k => member(k, MEMBER_TYPE[k] || 'float', C.SPAWN_INHERIT[k])))
        .concat([member('patrolMode', 'string', C.PATROL_INHERIT, 'AuraPatrolMode')]);

    const types = [
        enumType('AuraTerrainType', terrain.map(t => t.type)),
        enumType('AuraPropType', props.map(p => p.type)),
        // MOB_UNSET leads the list so it is the natural default: a hand-drawn
        // spawn that nobody has assigned refuses the save instead of silently
        // becoming whichever mob happens to sort first.
        enumType('AuraMobName', [MOB_UNSET].concat(mobs.map(m => m.name))),
        enumType('AuraPatrolMode', ['pingpong', 'loop']),
        enumType('AuraFlipped', ['none', 'horizontal', 'vertical']),
        // Same sentinel-leads rule as AuraMobName, for the same reason: an
        // unassigned region would otherwise repaint that ground in whichever
        // profile happens to lead the table.
        enumType('AuraProfile', [PROFILE_UNSET].concat(profiles)),
        // ⭐ The AIR's own vocabulary, separate since 2026-09-15. Same sentinel,
        // same rule, a different list — which is what makes naming `Forest` on
        // a fog bank impossible rather than merely wrong.
        enumType('AuraAtmosphereProfile', [PROFILE_UNSET].concat(airProfiles)),
        // ⭐ A4's vocabulary, and the ONE enum here that is not a profile table:
        // it names which LAYERS a hole cuts. Mirrors world.ClearsDarkness /
        // ClearsHaze / ClearsBoth in zone.go, which refuses anything outside it.
        //
        // ⛔ NO PROFILE_UNSET SENTINEL, and that is the difference from every
        // enum above it. A sentinel exists where "unassigned" is a real state the
        // save must refuse — a region with no profile repaints the ground in
        // whichever name sorts first. A clearing has no such state: it always
        // cuts something, 'both' is the honest default, and offering an
        // unassigned entry would invent a broken shape the author can pick.
        enumType('AuraClears', ['darkness', 'haze', 'both']),
        // ⭐ The AREA-EFFECT vocabulary (plan-area-effects.md E1) — the skill
        // roster, because an area's 'effect' names an authored skill (D3).
        //
        // ⚑ EFFECT_UNSET leads the list like MOB_UNSET and PROFILE_UNSET do, but
        // for the OPPOSITE reason: those lead so an unassigned object refuses the
        // save, this leads so an unassigned object is INERT. Absent = no effect
        // is the whole of D10, and a shape that grew a random skill because one
        // sorted first would be a hazard nobody drew.
        enumType('AuraEffect', [EFFECT_UNSET].concat(effects)),
        classType('AuraTerrain', '#ff8bc34a'),
        classType('AuraProp', '#fff44336'),
        classType('AuraCampfire', '#ffff9800'),
        classType('AuraDarkArea', '#ff673ab7'),
        classType('AuraAnchor', '#ff00bcd4'),
        // ⚑ AuraRegion DOES carry a member where AuraProp deliberately does
        // not, and the rule is the one C6 settled: a member is safe exactly
        // when its default is a value the converter maps back to "not
        // authored". PROFILE_UNSET is that value — it is not a profile name and
        // the save refuses it — so a Tiled that drops a default-valued property
        // and a Tiled that keeps it reach the same answer.
        classType('AuraRegion', '#ffcddc39',
            [member('profile', 'string', PROFILE_UNSET, 'AuraProfile')]),
        // A path wears the same profile vocabulary as a region and adds its own
        // geometry. ⚑ Both extra members obey the C6 rule the AuraRegion note
        // above states: 'width' defaults to 0, which the save REFUSES, so a
        // dropped default and a kept one reach the same answer; 'blocksMovement'
        // defaults to false, which the converter maps back to "not authored"
        // and omits from the JSON entirely.
        classType('AuraPath', '#ff03a9f4',
            [member('profile', 'string', PROFILE_UNSET, 'AuraProfile'),
                member('width', 'float', 0),
                member('blocksMovement', 'bool', false),
                ...OUTLINE_MEMBERS, EFFECT_MEMBER]),
        // ⚑ A filled AREA, sharing the paths layer and told apart by this class
        // (plan-zone-polygons.md D5). It has NO width member on purpose: a
        // polygon has no stroke to be wide, and an author who reaches for "how
        // wide is my wall" should find nothing rather than a field that quietly
        // means something else (L7). ⛔ A blocking polygon can SEAL A REGION OFF
        // rather than merely across — a path can only cut a line, a polygon has
        // an inside — and no automated check catches that (L3).
        classType('AuraPolygon', '#ff8d6e63',
            [member('profile', 'string', PROFILE_UNSET, 'AuraProfile'),
                member('blocksMovement', 'bool', false),
                ...OUTLINE_MEMBERS, EFFECT_MEMBER]),
        // ⭐ The AIR over an area (plan-region-atmosphere.md A0) — and the ONE
        // class with a layer of its own rather than a share of `paths` (D16),
        // because `darkAreas` (the primitive it retires) already has one, and
        // because an atmosphere COVERS the walls it darkens while a polygon sits
        // beside them — Tiled toggles visibility per layer and never per class.
        //
        // ⛔ ONE member, and the emptiness is the ruling (D15). No
        // blocksMovement, no outline, no width: a polygon is a wall you walk
        // into, an atmosphere is air you walk through. An author reaching for
        // "how solid is my fog" must find NOTHING here rather than a field that
        // quietly means something else — the same L7 argument the polygon's
        // missing `width` records, applied to collision instead of geometry.
        // zone.go refuses every one of those keys by name, so a member added
        // here would round-trip into a zone file that no longer boots.
        // ⛔ AuraAtmosphereProfile, NOT AuraProfile. The member name is the
        // same because the ZONE KEY is the same (`profile`); only the
        // vocabulary behind it differs.
        // ⚑ TWO members now, and 'effect' is the ONE key D15 does not refuse —
        // see zone.go's Atmosphere.Effect for why. Everything D15 turned away
        // (blocksMovement, outline, width) describes a WALL; an area effect
        // describes a region of space acting on what stands in it, which air
        // does as readily as ground.
        classType('AuraAtmosphere', '#ff9e9e9e',
            [member('profile', 'string', PROFILE_UNSET, 'AuraAtmosphereProfile'),
                EFFECT_MEMBER]),
        // ⭐ THE HOLE (plan-region-atmosphere.md A4) — the second class on the
        // atmospheres layer, told apart from the air it cuts by CLASS the way
        // AuraPolygon is told from AuraPath (zone-polygons D5).
        //
        // ⛔ NO PROFILE MEMBER, AND THE EMPTINESS IS THE RULING (L7). This is
        // the whole of A4: the PO rejected 'darkness: 0 means erase' because one
        // key was doing two jobs, "how much" and "which operation". The class now
        // carries the operation and a profile carries only the look — so
        // 'darkness: 0' on an AuraAtmosphereProfile became a plain DECLARATION of
        // zero, which is legal, useful, and unsayable before. An author reaching
        // here for "what colour is my clearing" must find NOTHING.
        //
        // ⚑ 'both' is the default and it must stay equal to CLEARS_DEFAULT in
        // aura-convert.js. The C6 rule applies with no sentinel available: a
        // Tiled that DROPS a default-valued property and one that KEEPS it have
        // to reach the same answer, and readClears supplies exactly this value
        // when the property is absent. Changing one side alone would silently
        // rewrite every freshly drawn clearing on its first save.
        classType('AuraClearing', '#ffffeb3b',
            [member('clears', 'string', 'both', 'AuraClears')]),
    ];
    for (const kind of Object.keys(KIND_COLOUR)) {
        types.push(classType('AuraSpawn' + kind[0].toUpperCase() + kind.slice(1),
            KIND_COLOUR[kind], SPAWN_MEMBERS));
    }
    return types;
}

// The content vocabulary the converter needs at runtime.
//
// ⚑ C5 moved this OUT of the extension and into the palette, and turned it from
// a script into plain JSON. Both halves matter: living beside the tilesets means
// the extension carries no content at all and is installed once per machine and
// never again; being JSON means the extension parses it with JSON.parse rather
// than eval'ing a script it read off disk.
function contentJson(terrain, props, mobs, profiles, airProfiles, effects, types) {
    const sizes = {};
    props.forEach(p => { sizes[p.type] = {w: p.wUnits, h: p.hUnits}; });
    const kinds = {};
    mobs.forEach(m => { kinds[m.name] = m.kind; });
    const speeds = {};
    mobs.forEach(m => { speeds[m.name] = m.speed; });
    // ⚑ Tiled hands a typed enum property back as an INDEX into the type's
    // values array, never as the string, so the converter cannot decode one
    // without the exact list the palette declared. Taken from the emitted
    // types rather than rebuilt, or the two orderings could drift apart.
    const enums = {};
    types.filter(t => t.type === 'enum').forEach(t => { enums[t.name] = t.values; });
    return JSON.stringify({
        _generated: 'tools/tiled/generate-palette.mjs — do not hand-edit',
        ENUM_VALUES: enums,
        TERRAIN_TYPES: terrain.map(t => t.type),
        PROP_SIZE: sizes,
        MOB_KIND: kinds,
        MOB_SPEED: speeds,
        // ⚑ The profile names WITHOUT the sentinel, which ENUM_VALUES carries
        // at index 0. The converter checks membership against these: the
        // placeholder is not a profile, and earns its own message.
        //
        // ⭐ TWO lists, so the converter can say WHICH vocabulary a name belongs
        // to. Naming `Fog` on a region is no longer "unknown profile" — it is
        // "that is an atmosphere profile", which is the error an author can
        // actually act on.
        PROFILE_NAMES: profiles,
        AIR_PROFILE_NAMES: airProfiles,
        // ⚑ The effect names WITHOUT the sentinel, the same rule the two profile
        // lists follow: ENUM_VALUES carries the placeholder at index 0, and the
        // converter checks membership against this list so the placeholder earns
        // its own (legal) answer rather than "unknown effect".
        EFFECT_NAMES: effects,
    }, null, 2) + '\n';
}

// Tiled stores custom types INSIDE the project (there is no propertyTypesFile
// key — measured against the shipped binary), so generating them straight into
// aura.tiled-project is what removes C2's once-per-machine hand-import.
//
// ⚑ Patched in place rather than rewritten: the project file carries the user's
// own settings (folders, extensionsPath, commands) and only this one array is
// ours to own.
function patchProject(file, types) {
    const project = JSON.parse(readFileSync(file, 'utf8'));
    project.propertyTypes = types;
    return JSON.stringify(project, null, 4) + '\n';
}

/* ---- run ----------------------------------------------------------------- */

const terrain = readTerrainTypes();
const props = readProps();
const mobs = readMobs();
const profiles = readProfileTable('terrain-profiles.json');
const airProfiles = readProfileTable('atmosphere-profiles.json');
// ⛔ The two namespaces must stay DISJOINT: every accessor picks its table by
// call site, so a name in both would make "which Fog?" depend on which lookup
// ran. Regions.test.ts pins the same thing client-side; this is the half that
// fires before a bad palette can reach Tiled.
const clash = profiles.filter(n => airProfiles.indexOf(n) >= 0);
if (clash.length > 0) {
    fail('profile name in BOTH tables: ' + clash.join(', ')
        + ' — terrain-profiles.json and atmosphere-profiles.json are separate'
        + ' namespaces, so rename one.');
}

const effects = readEffects();

const types = propertyTypes(terrain, props, mobs, profiles, airProfiles, effects);

mkdirSync(PALETTE, {recursive: true});
writeFileSync(path.join(PALETTE, 'terrain.tsx'), tileset('aura-terrain', 'AuraTerrain', terrain));
writeFileSync(path.join(PALETTE, 'props.tsx'), tileset('aura-props', 'AuraProp', props));
writeFileSync(path.join(PALETTE, 'content.json'),
    contentJson(terrain, props, mobs, profiles, airProfiles, effects, types));
writeFileSync(path.join(TOOLS, 'aura.tiled-project'), patchProject(path.join(TOOLS, 'aura.tiled-project'), types));
// ⚑ Kept as well as the project copy, and deliberately: project-embedded types
// apply only while the PROJECT is open. Opening api/zones/world.json on its own
// still works, and this is the file to import by hand for that flow.
writeFileSync(path.join(PALETTE, 'propertytypes.json'), JSON.stringify({propertyTypes: types}, null, 2) + '\n');

const kindCounts = mobs.reduce((a, m) => (a[m.kind] = (a[m.kind] || 0) + 1, a), {});
console.log(`terrain.tsx        ${terrain.length} textures`);
console.log(`props.tsx          ${props.length} props (${props.map(p => p.type).join(', ')})`);
const nEnum = types.filter(t => t.type === 'enum').length;
console.log(`custom types       ${types.length} (${nEnum} enums + ${types.length - nEnum} classes) → aura.tiled-project + palette/propertytypes.json`);
console.log(`content.json       ${terrain.length} textures, ${props.length} props, ${mobs.length} mobs ${JSON.stringify(kindCounts)}`);
console.log(`terrain profiles   ${profiles.length} (${profiles.join(', ')}) → AuraProfile + AuraRegion + AuraPath + AuraPolygon`);
console.log(`air profiles       ${airProfiles.length} (${airProfiles.join(', ')}) → AuraAtmosphereProfile + AuraAtmosphere`);
console.log(`area effects       ${effects.length} skills → AuraEffect + AuraPath + AuraPolygon + AuraAtmosphere`);
