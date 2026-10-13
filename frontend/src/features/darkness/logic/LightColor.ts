import {parseColor} from '../../regions/logic/Regions';

/** Today's look: a light nobody coloured is white (plan-lightmap.md D6). */
export const WHITE_LIGHT = 0xffffff;

/**
 * The tint a light sprite draws with.
 *
 * ⚑ `0` is the WIRE's "unauthored" (`light_color` defaults to 0 and costs no
 * bytes), never a black light: the Go loader refuses `#000000` on a
 * `light_aura`, so 0 can only mean "nobody coloured this".
 */
export function lightTint(color: number): number {
    return color > 0 ? color : WHITE_LIGHT;
}

/**
 * The colour of an authored static light — the campfire glow from its skill's
 * `light_aura` effect, a torch prop from its own `lightColor` — with the
 * fallback the caller names (D6: a torch that authors no colour reads as a
 * small campfire). Unparseable is treated as unauthored.
 */
export function authoredLightColor(raw: unknown, fallback: number): number {
    return parseColor(raw) ?? fallback;
}
