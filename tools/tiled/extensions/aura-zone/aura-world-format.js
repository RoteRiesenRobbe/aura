/* aura-world-format.js — the Tiled glue for Aura zone files.
 *
 * Registers api/zones/*.json as a map format Tiled can both READ and WRITE, so
 * world.json stays the single source of truth: open it, edit, Ctrl+S, done.
 * No intermediate .tmj, no converter step.
 *
 * Everything numeric lives in aura-convert.js, which Tiled loads first
 * (same extension = shared globals, alphabetical order — measured in C0).
 * This file only moves values between that plain model and Tiled's objects.
 *
 * ⚑ These two files are the WHOLE extension. Since C5 the generated content
 * lives in the repo palette rather than here, so this directory is installed
 * once per machine and never needs reinstalling when content is added.
 *
 * ⚑ world.json shares its extension with Tiled's OWN JSON map format. That is
 * fine: Tiled tries readers in turn and falls through to this one when its own
 * rejects the file (measured in C0).
 */
(function () {
    'use strict';

    var C = AuraConvert;

    var SHAPE_TO_TILED = {
        rect: MapObject.Rectangle,
        tile: MapObject.Rectangle, // a Rectangle carrying a tile IS a tile object
        point: MapObject.Point,
        ellipse: MapObject.Ellipse,
        polyline: MapObject.Polyline,
    };

    function shapeFromTiled(o) {
        switch (o.shape) {
            case MapObject.Point: return 'point';
            case MapObject.Ellipse: return 'ellipse';
            case MapObject.Polyline: return 'polyline';
            case MapObject.Polygon: return 'polyline';
            default: return o.tile ? 'tile' : 'rect';
        }
    }

    /* ---- the generated palette ---------------------------------------------
     * Resolved RELATIVE TO THE ZONE FILE (<root>/api/zones/world.json), so the
     * extension needs no knowledge of where the repo lives — it only ever gets
     * installed into Tiled's user extensions directory, which is elsewhere. */
    // Walk UP from the zone file looking for the palette, rather than assuming
    // a fixed depth: a zone file is normally at <root>/api/zones/, but a copy
    // taken anywhere else in the repo must still open.
    function findPaletteDir(zoneFileName) {
        var dir = FileInfo.path(zoneFileName);
        for (var i = 0; i < 16; i++) {
            var candidate = FileInfo.cleanPath(dir + '/tools/tiled/palette');
            if (File.exists(candidate + '/terrain.tsx')) { return candidate + '/'; }
            var up = FileInfo.cleanPath(dir + '/..');
            if (up === dir) { break; }
            dir = up;
        }
        throw new Error('could not find tools/tiled/palette above ' + FileInfo.path(zoneFileName)
            + '\nThe zone file must live inside the aura repo, and the palette must be'
            + ' generated: node tools/tiled/generate-palette.mjs');
    }

    /* The generated content vocabulary, loaded from the palette alongside the
     * tilesets (C5) rather than shipped inside the extension. That is what lets
     * the extension be installed once per machine and never again: adding a mob
     * or a texture regenerates the palette, and nothing here changes.
     *
     * ⚑ Cached module-wide because write() cannot always find it: under
     * --export-map the OUTPUT path may be outside the repo. read() always runs
     * first in both the GUI and the CLI, so the cache is warm by then. */
    var contentLoaded = false;
    function loadContent(nearFile) {
        if (contentLoaded) { return; }
        var p = findPaletteDir(nearFile) + 'content.json';
        if (!File.exists(p)) {
            throw new Error('palette missing: ' + p
                + '\nRun: node tools/tiled/generate-palette.mjs');
        }
        var file = new TextFile(p, TextFile.ReadOnly);
        var text = file.readAll();
        file.close();
        C.useContent(JSON.parse(text));
        contentLoaded = true;
    }

    function loadPalette(zoneFileName) {
        var dir = findPaletteDir(zoneFileName);
        // ⚑ tiled.open() is GUI-only — it throws "Editor not available" under
        // --export-map, which is exactly how this format gets tested. The
        // tileset FORMAT reader works in both (measured).
        var tsx = tiled.tilesetFormat('tsx');
        if (!tsx) { throw new Error('Tiled has no tsx tileset format'); }
        var sets = {};
        ['terrain', 'props'].forEach(function (name) {
            var p = dir + name + '.tsx';
            if (!File.exists(p)) {
                throw new Error('palette missing: ' + p
                    + '\nRun: node tools/tiled/generate-palette.mjs');
            }
            var ts = tsx.read(p);
            if (!ts || !ts.tiles) { throw new Error('could not load tileset: ' + p); }
            // index the tiles by the aura type they stand for
            var byType = {};
            for (var i = 0; i < ts.tiles.length; i++) {
                byType[ts.tiles[i].property('auraType')] = ts.tiles[i];
            }
            sets[name] = {tileset: ts, byType: byType};
        });
        return sets;
    }

    /* A property that a custom ENUM types must be set as a TYPED value, not as
     * a bare string: a plain string property SHADOWS the class member that
     * declares the enum, and the Properties panel degrades from a dropdown to a
     * free-text box. Measured in the GUI — the dropdown came back only after
     * resetting the field, which is the panel falling back to the member.
     *
     * ⚑ Falls back to the bare string when the type is unknown, which is what
     * happens with no project loaded: tiled.propertyValue THROWS on an
     * unregistered type. Opening the zone without the project is a supported
     * (if less pleasant) flow, so it must not fail. */
    function typedValue(src, key) {
        var enumType = src.enums && src.enums[key];
        if (!enumType) { return src.properties[key]; }
        try {
            return tiled.propertyValue(enumType, src.properties[key]);
        } catch (e) {
            return src.properties[key];
        }
    }

    /* ---- read: world.json -> TileMap --------------------------------------- */
    function read(fileName) {
        var file = new TextFile(fileName, TextFile.ReadOnly);
        var text = file.readAll();
        file.close();

        loadContent(fileName);
        var model = C.zoneToModel(JSON.parse(text));
        var palette = loadPalette(fileName);

        var map = new TileMap();
        map.setSize(Math.ceil(model.boundsWidth), Math.ceil(model.boundsHeight));
        map.setTileSize(C.PX, C.PX);
        map.addTileset(palette.terrain.tileset);
        map.addTileset(palette.props.tileset);
        // Bounds may be fractional and the tile grid may not be; carry the
        // authored values verbatim so the writer never has to guess them back.
        map.setProperty('zoneName', model.zoneName);
        map.setProperty('boundsWidth', model.boundsWidth);
        map.setProperty('boundsHeight', model.boundsHeight);
        // Whichever of the repo's two writers last touched this file decides
        // whether it ends in a newline; we reproduce what we found rather than
        // taking a side (see endsWithNewline in aura-convert.js).
        map.setProperty('trailingNewline', C.endsWithNewline(text));

        for (var i = 0; i < model.layers.length; i++) {
            var spec = model.layers[i];
            var group = new ObjectGroup(spec.name);
            // terrain array order IS paint order, so the canvas must draw by
            // index rather than Tiled's default y-sort.
            group.drawOrder = ObjectGroup.IndexOrder;

            for (var j = 0; j < spec.objects.length; j++) {
                var src = spec.objects[j];
                var obj = new MapObject(src.name);
                obj.shape = SHAPE_TO_TILED[src.shape];

                if (src.shape === 'tile') {
                    var set = palette[src.tileset];
                    var tile = set.byType[src.tileType];
                    if (!tile) {
                        throw new Error('no palette tile for ' + src.tileset + ' type "'
                            + src.tileType + '" — regenerate with'
                            + ' node tools/tiled/generate-palette.mjs');
                    }
                    obj.tile = tile;
                    obj.tileFlippedHorizontally = !!src.flipH;
                    obj.tileFlippedVertically = !!src.flipV;
                }

                obj.x = src.x;
                obj.y = src.y;
                if (src.shape === 'tile' || src.shape === 'rect' || src.shape === 'ellipse') {
                    obj.width = src.width;
                    obj.height = src.height;
                }
                if (src.rotation) { obj.rotation = src.rotation; }
                if (src.polygon) { obj.polygon = src.polygon; }
                // Class drives Tiled's per-object colour; for spawns it is the
                // derived mob kind, matching the in-game editor's marker palette.
                if (src.cls) { obj.className = src.cls; }
                for (var key in src.properties) {
                    if (Object.prototype.hasOwnProperty.call(src.properties, key)) {
                        obj.setProperty(key, typedValue(src, key));
                    }
                }
                group.addObject(obj);
            }
            map.addLayer(group);
        }
        return map;
    }

    /* ---- write: TileMap -> world.json -------------------------------------- */
    function write(map, fileName) {
        var known = {};
        for (var k = 0; k < C.LAYERS.length; k++) { known[C.LAYERS[k]] = true; }

        var layers = [];
        var unknown = [];
        for (var i = 0; i < map.layerCount; i++) {
            var layer = map.layerAt(i);
            if (!layer.isObjectLayer) { continue; }
            if (!known[layer.name]) { unknown.push(layer.name); continue; }

            var objects = [];
            for (var j = 0; j < layer.objectCount; j++) {
                var o = layer.objectAt(j);
                var out = {
                    shape: shapeFromTiled(o),
                    layer: layer.name,
                    // Carried for validation messages only — Tiled's own object
                    // id is what Edit ▸ Select Object by Id takes, so it is the
                    // one handle that points at the thing you actually dragged.
                    id: o.id,
                    // A tile object's identity is the TILE it carries, not the
                    // object's name — dragging a Sand tile onto the terrain
                    // layer gives an unnamed object, and the tile is what says
                    // what it is.
                    name: (o.tile && o.tile.property('auraType')) || o.name,
                    x: o.x,
                    y: o.y,
                    width: o.width,
                    height: o.height,
                    rotation: o.rotation,
                    flipH: !!o.tileFlippedHorizontally,
                    flipV: !!o.tileFlippedVertically,
                    properties: o.properties(),
                };
                if (out.shape === 'polyline') { out.polygon = o.polygon; }
                objects.push(out);
            }
            layers.push({name: layer.name, objects: objects});
        }

        // D5: a layer name selects a world.json array. An unrecognised object
        // layer is an authoring mistake, and silently dropping it would delete
        // content on save — refuse instead.
        if (unknown.length > 0) {
            return 'unknown object layer(s): ' + unknown.join(', ')
                + '. Expected only: ' + C.LAYERS.join(', ');
        }

        var bw = map.property('boundsWidth');
        var bh = map.property('boundsHeight');
        var model = {
            zoneName: map.property('zoneName'),
            boundsWidth: bw === undefined ? map.width : bw,
            boundsHeight: bh === undefined ? map.height : bh,
            layers: layers,
        };

        // Normally already warm from read(); the fallback covers a map built
        // from scratch inside Tiled and saved straight to a zone path.
        if (!contentLoaded) {
            try { loadContent(fileName); } catch (e) { return String(e.message || e); }
        }

        // C4: catch here everything the server would reject at boot, while the
        // author is still looking at the object that caused it. Returning a
        // string aborts the save with that message; the document stays open.
        var errors = C.validateModel(model);
        if (errors.length > 0) { return C.formatErrors(errors); }

        var text;
        try {
            text = C.serializeZone(C.modelToZone(model), map.property('trailingNewline') === true);
        } catch (e) {
            return String(e.message || e);
        }

        // ⚑ BinaryFile, not TextFile: TextFile writes CRLF on Windows, which
        // adds one byte per line (14602 of them on world.json) and breaks
        // byte-stability against an LF repo on every single save.
        var bytes = C.utf8Bytes(text);
        var buffer = new ArrayBuffer(bytes.length);
        var view = new Uint8Array(buffer);
        for (var b = 0; b < bytes.length; b++) { view[b] = bytes[b]; }

        var file = new BinaryFile(fileName, BinaryFile.WriteOnly);
        file.write(buffer);
        file.commit();
    }

    tiled.registerMapFormat('aura-zone', {
        name: 'Aura zone',
        extension: 'json',
        read: read,
        write: write,
    });
})();
