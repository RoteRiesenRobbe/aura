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

// Region profiles (plan-region-primitive.md D12). ⚑ The ONE reason that table
// is JSON and not TypeScript: the client imports it and this Node script reads
// it, so the Tiled dropdown and what the client can actually resolve are the
// same list by construction. A .ts table would have forced a hand-kept enum
// here — the exact drift this generator's header forbids.
//
// ⚑ Authored order, not sorted: profiles.json is a hand-written table and its
// order is the author's grouping. content.json's ENUM_VALUES is derived from
// what is emitted here, so the two orderings cannot drift — which matters,
// because Tiled hands an enum property back as an INDEX into this list.
//
// ⚑ '_'-prefixed keys are documentation (the repo's _comment convention),
// skipped here exactly as Regions.buildProfiles skips them client-side.
function readProfiles() {
    const file = path.join(ROOT, 'frontend/src/client-data/profiles.json');
    if (!existsSync(file)) { fail('profile table not found: ' + path.relative(ROOT, file)); }
    const table = JSON.parse(readFileSync(file, 'utf8'));
    const out = Object.keys(table).filter(k => k.charAt(0) !== '_');
    if (out.length === 0) { fail('parsed zero region profiles from ' + path.relative(ROOT, file)); }
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

function propertyTypes(terrain, props, mobs, profiles) {
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

    // ⭐ The defaults are READ FROM the converter, never retyped here. They must
    // equal its inherit sentinels exactly, and the cheapest way to guarantee
    // that is to have one definition rather than two that a test compares.
    const NUMERIC_TYPE = {level: 'int', respawnTicks: 'int'};   // the rest are floats
    const SPAWN_MEMBERS = [member('mob', 'string', MOB_UNSET, 'AuraMobName')]
        .concat(Object.keys(C.SPAWN_INHERIT).map(
            k => member(k, NUMERIC_TYPE[k] || 'float', C.SPAWN_INHERIT[k])))
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
function contentJson(terrain, props, mobs, profiles, types) {
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
        // at index 0. The converter checks membership against this: the
        // placeholder is not a profile, and earns its own message.
        PROFILE_NAMES: profiles,
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
const profiles = readProfiles();

const types = propertyTypes(terrain, props, mobs, profiles);

mkdirSync(PALETTE, {recursive: true});
writeFileSync(path.join(PALETTE, 'terrain.tsx'), tileset('aura-terrain', 'AuraTerrain', terrain));
writeFileSync(path.join(PALETTE, 'props.tsx'), tileset('aura-props', 'AuraProp', props));
writeFileSync(path.join(PALETTE, 'content.json'), contentJson(terrain, props, mobs, profiles, types));
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
console.log(`region profiles    ${profiles.length} (${profiles.join(', ')}) → AuraProfile + AuraRegion`);
