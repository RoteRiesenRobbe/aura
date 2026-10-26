import {Container, Graphics, Sprite, Texture} from 'pixi.js';
import * as Preloading from '../../core/logic/Preloading';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import {OVERHEAD_BAR_BACKDROP} from '../../../client-data/Theme';
import {packIconTexture} from '../../../client-data/icons/PackIconFiles';
import {INDICATOR_MAX, STATE_ROWS, StateRow, TokenState, indicatorDiameter, indicatorOffset, indicatorRadius} from './TokenState';

/** Width of the dark backing rim that keeps a disc readable on any ground (the pips' rim). */
const RIM_WIDTH = 1.5;

// Each glyph's committed placeholder file (plan-appearance.md D42), preloaded
// once per row, as the ring families are (Medallion.ts). Rasterised at twice
// the biggest indicator's diameter (registerGameObjectSVG doubles its size
// argument), so it stays sharp at DPR 2.
const glyphFiles = new Map<string, ISvgContainer>(
    STATE_ROWS.filter(row => row.glyph).map(row => {
        const holder: ISvgContainer = {svg: undefined};
        // noinspection JSIgnoredPromiseFromCall
        Preloading.registerGameObjectSVG(holder, row.glyph.file, INDICATOR_MAX);
        return [row.id, holder];
    }),
);

/** A row's glyph: the pack icon, else its placeholder file, else none (the disc). */
function glyphTexture(row: StateRow): Texture | null {
    if (!row.glyph) {
        return null;
    }
    // Truthiness, not isDefined: the holder starts as `undefined`.
    return packIconTexture(row.glyph.packIcon) || glyphFiles.get(row.id)?.svg || null;
}

/**
 * The state indicators of one medallion (plan-entity-presentation.md D4): each
 * live indicator at its row's reserved angle on the circle just outside the
 * ring, as its glyph when the pack has it, else as a disc in the row's colour
 * on the dark rim the pip strip used. One child per indicator, labelled with
 * the row's id, so a harness reads positions off the scene graph.
 *
 * Redrawn on a state change only, never per frame; no filter (D4). It lives in
 * the token's `indicators` slot, outside `actualShape` (D3, L1).
 */
export class StateIndicators {
    readonly container: Container = new Container({label: 'stateIndicators'});

    private readonly radius: number;
    private readonly diameter: number;
    // The state drawn; snapshots repeat the mask 30×/s, so setState redraws
    // only when it changes.
    private drawnState: TokenState = null;
    // The glyph texture drawn per glyph row (null = the disc), so refresh
    // can tell when a later one has loaded.
    private readonly drawnGlyphs = new Map<StateRow, Texture | null>();

    constructor(size: number) {
        this.radius = indicatorRadius(size);
        this.diameter = indicatorDiameter(size);
        this.container.visible = false;
    }

    setState(state: TokenState) {
        const drawn = this.drawnState;
        if ((drawn?.mask ?? 0) === state.mask && (drawn?.dead ?? false) === state.dead) {
            return;
        }
        this.draw(state);
    }

    /**
     * Redraws if a glyph has loaded since the last draw (the pack, or the
     * placeholder file): a corpse sets its state once and would otherwise
     * keep the disc (plan-entity-presentation.md, EP1 ledger). Cheap while
     * nothing changed: one lookup per glyph row drawn.
     */
    refresh() {
        for (const [row, drawn] of this.drawnGlyphs) {
            if (glyphTexture(row) !== drawn) {
                this.draw(this.drawnState);
                return;
            }
        }
    }

    private draw(state: TokenState) {
        this.drawnState = state;
        this.drawnGlyphs.clear();
        for (const child of this.container.removeChildren()) {
            child.destroy();
        }
        for (const row of state.indicators) {
            const indicator = this.drawIndicator(row);
            indicator.label = row.id;
            const {x, y} = indicatorOffset(row.angle, this.radius);
            indicator.position.set(x, y);
            this.container.addChild(indicator);
        }
        this.container.visible = state.indicators.length > 0;
    }

    private drawIndicator(row: StateRow): Container {
        const texture = glyphTexture(row);
        if (row.glyph) {
            this.drawnGlyphs.set(row, texture);
        }
        if (texture) {
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.width = this.diameter;
            sprite.height = this.diameter;
            return sprite;
        }
        const r = this.diameter / 2;
        return new Graphics()
            .circle(0, 0, r)
            .fill(OVERHEAD_BAR_BACKDROP)
            .circle(0, 0, r - RIM_WIDTH)
            .fill({color: row.colour, alpha: 0.95});
    }
}
