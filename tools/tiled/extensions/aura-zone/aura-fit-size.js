/* aura-fit-size.js — Map ▸ "Fit to true size" (Ctrl+Alt+F).
 *
 * ⭐ WHY THIS EXISTS, and it is not a convenience. In this repo THE BOX IS THE
 * SCALE: a prop's `scale` is derived from its box (plan-prop-scale.md C1) and a
 * terrain patch's `size` IS its box. Tiled, meanwhile, sizes a tile object it
 * INSERTS by the tile IMAGE's natural pixel size — and the art knows nothing
 * about world units. roundTree.png is 512² against a 240 px Tree body, so a
 * tree dragged out of the aura-props tileset authors `"scale": 2.133`, silently,
 * and it stays valid and byte-stable all the way to the game.
 *
 * Templates (palette/templates/, generated) fix the DROP. This fixes everything
 * already dropped, and anything dropped the old way — select and press the key.
 *
 * ⚑ Why BOTH: the templates need Tiled's Insert Template gesture, and a tileset
 * drag is the muscle memory of every zone authored so far. Rather than bet the
 * primitive on one gesture, the wrong one is now one keystroke from right.
 *
 * ⛔ Nothing headless can test this. --export-map has no menus and no selection,
 * so the legs that matter are: (1) this file must not break the CLI at LOAD
 * time, which every verify.sh leg exercises by loading it, and (2) the human
 * check in verify.sh's footer.
 */
(function () {
    'use strict';

    var C = AuraConvert;

    // ⚑ Registering actions is GUI-only. Under --export-map these may be absent
    // or throw, and this file loading is a precondition of every verify.sh leg,
    // so a headless Tiled must fall straight through. (tiled.open() has exactly
    // this shape — "Editor not available" — and it is why loadPalette in
    // aura-world-format.js uses the format reader instead.)
    if (typeof tiled.registerAction !== 'function'
        || typeof tiled.extendMenu !== 'function') {
        return;
    }

    // What "true size" means, per layer. A prop is measured against its TYPE
    // BODY; a texture has no body, so the generated canonical size is the only
    // answer there is — and it is the same number the templates are cut at,
    // published through content.json rather than declared twice.
    function trueBox(o) {
        var layer = o.layer ? o.layer.name : '';
        var name = (o.tile && o.tile.property('auraType')) || o.name;
        if (layer === 'props') {
            var sizes = C.propSizes();
            if (!Object.prototype.hasOwnProperty.call(sizes, name)) { return null; }
            return {w: sizes[name].w * C.PX, h: sizes[name].h * C.PX};
        }
        if (layer === 'terrain') {
            var side = C.terrainSize() * 2 * C.PX;
            if (!(side > 0)) { return null; }
            return {w: side, h: side};
        }
        return null;
    }

    // ⚑ Resize about the CENTRE, not the anchor. A tile object anchors at its
    // bottom-left corner, so writing width/height alone slides the art up and
    // right by half the change — on a tree that is over a unit, and it would
    // quietly walk a placed forest off its layout. The anchor maths is the
    // converter's own (it rotates, too), never a second copy of it here.
    function fit(o) {
        var box = trueBox(o);
        if (!box) { return false; }
        if (Math.abs(o.width - box.w) < 0.001 && Math.abs(o.height - box.h) < 0.001) {
            return false;
        }
        var deg = o.rotation || 0;
        var c = C.tileCentre(o.x, o.y, o.width, o.height, deg);
        var a = C.tileAnchor(c.x, c.y, box.w, box.h, deg);
        o.width = box.w;
        o.height = box.h;
        o.x = a.x;
        o.y = a.y;
        return true;
    }

    var action = tiled.registerAction('AuraFitToTrueSize', function () {
        var map = tiled.activeAsset;
        if (!map || !map.isTileMap) {
            tiled.alert('Open a zone first — this resizes props and terrain in a map.');
            return;
        }
        var selected = map.selectedObjects || [];
        if (selected.length === 0) {
            tiled.alert('Nothing selected.\n\nSelect the props or textures to fix'
                + ' (Edit ▸ Select All takes the whole layer), then run this again.');
            return;
        }

        // ⚑ The vocabulary is loaded when a zone is READ, so it is warm by the
        // time anyone can select something. Saying so beats resizing to a
        // fallback box that looks deliberate.
        if (Object.keys(C.propSizes()).length === 0) {
            tiled.alert('The generated palette is not loaded.\n\nRun:'
                + ' node tools/tiled/generate-palette.mjs, then reopen the zone.');
            return;
        }

        var changed = 0;
        var skipped = [];
        map.macro('Fit to true size', function () {
            for (var i = 0; i < selected.length; i++) {
                var o = selected[i];
                if (trueBox(o) === null) {
                    var layer = o.layer ? o.layer.name : '(no layer)';
                    skipped.push((o.name || '(unnamed)') + ' on ' + layer);
                } else if (fit(o)) {
                    changed++;
                }
            }
        });

        var msg = 'fit ' + changed + ' of ' + selected.length + ' selected object(s)'
            + ' to their true size';
        if (skipped.length > 0) {
            // ⛔ Named, never silent. Only props and terrain HAVE a true size —
            // a region or a spawn is geometry the author drew, and squashing one
            // to a 1-unit box would be the very bug this action exists to undo.
            msg += '\nleft alone (only props and terrain have a true size): '
                + skipped.join(', ');
        }
        tiled.log(msg);
        // Nothing moved and nothing was refused means the selection was already
        // correct — say so, or the keystroke feels dead.
        if (changed === 0 && skipped.length === 0) {
            tiled.alert('Already at true size — nothing to change.');
        }
    });
    action.text = 'Fit to true size';
    action.shortcut = 'Ctrl+Alt+F';

    tiled.extendMenu('Map', [{separator: true}, {action: 'AuraFitToTrueSize'}]);
}());
