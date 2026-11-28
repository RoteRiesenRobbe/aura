import {Container, Sprite, Text, Texture} from 'pixi.js';
import * as Preloading from '../../core/logic/Preloading';
import {ISvgContainer} from '../../core/logic/ISvgContainer';
import * as TextDisplay from '../../../client-data/TextDisplay';
import {packIconTexture} from '../../../client-data/icons/PackIconFiles';
import {t} from '../../localization/logic/Locale';
import {CROWD_BADGE_ROW} from './PlateAnchors';

// The crowd badge (plan-playtest-versions.md D9, PV2b): version B's crowd
// resistance as a shield and a percent in a row under a mob's health bar. The
// percent comes off the wire as is (L11); 0 hides the row. No hover.

/** The shield's edge in px; the pack art has a transparent margin. [PLACEHOLDER] */
const ICON_SIZE = 20;
/** Between the shield and the number. [PLACEHOLDER] */
const ICON_GAP = 3;

// PONETI Shield_v2_11 (silver, never the absorb blue of the bar's shield
// segment), with a committed placeholder for clones without the pack.
export const CROWD_BADGE_ICON = 'silver-shield';
const fallback: ISvgContainer = {svg: undefined};
// noinspection JSIgnoredPromiseFromCall
Preloading.registerGameObjectSVG(fallback, require('../assets/silver-shield.svg'), ICON_SIZE);

/** The badge's text for a percent, through the catalog (EN `20%`, DE `20 %`). */
export function crowdBadgeText(percent: number): string {
    return t('hud.mob.crowd-resist', {percent: String(percent)});
}

export class CrowdBadge {
    readonly container = new Container({label: 'crowdBadge'});
    private readonly icon = new Sprite();
    private readonly label: Text;
    private percent = 0;
    private packed = false;

    constructor(y: number) {
        this.container.position.set(0, y);
        this.container.visible = false;
        this.icon.anchor.set(0, 0.5);
        this.icon.width = ICON_SIZE;
        this.icon.height = ICON_SIZE;
        this.label = new Text({
            text: '',
            style: TextDisplay.style({
                fill: '#ffffff',
                stroke: {color: '#000000', width: 3},
                // The stroke adds ~3 px to the drawn height: 13 px text fits
                // the 22 px row with its stroke and line padding.
                fontSize: Math.round(CROWD_BADGE_ROW * 0.6),
                fontWeight: '700',
            }),
        });
        this.label.anchor.set(0, 0.5);
        this.container.addChild(this.icon, this.label);
    }

    get shown(): boolean {
        return this.percent > 0;
    }

    /** Shows the percent, 0 hides the row. Reports whether shown flipped. */
    set(percent: number): boolean {
        if (percent > 0 && !this.packed) {
            this.resolveIcon();
        }
        if (percent === this.percent) {
            return false;
        }
        const wasShown = this.shown;
        this.percent = percent;
        this.container.visible = this.shown;
        if (this.shown) {
            this.label.text = crowdBadgeText(percent);
            this.layout();
        }
        return wasShown !== this.shown;
    }

    // The pack's atlas or the placeholder may land after the first show, so a
    // shown badge keeps asking until the pack icon is there.
    private resolveIcon() {
        const pack = packIconTexture(CROWD_BADGE_ICON);
        const texture: Texture | undefined = pack || fallback.svg;
        if (!texture || texture === this.icon.texture) {
            return;
        }
        this.icon.texture = texture;
        this.icon.width = ICON_SIZE;
        this.icon.height = ICON_SIZE;
        this.packed = !!pack;
    }

    // Shield and number centred as one row on the bar's axis.
    private layout() {
        const width = ICON_SIZE + ICON_GAP + this.label.width;
        this.icon.position.set(-width / 2, 0);
        this.label.position.set(-width / 2 + ICON_SIZE + ICON_GAP, 0);
    }
}
