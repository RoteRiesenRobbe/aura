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
 * The tint of the LOCAL player's light, which is drawn at `max(wire, sight)`
 * (plan-lightmap.md D9). Sight is eyes, not a light, so it takes D5's rule —
 * the source that wins the radius gives the colour: the wire colour while the
 * light reaches at least as far as sight, white once sight reaches further. A
 * small Torch in a high-`sight` profile would otherwise tint everything the
 * player can see.
 */
export function ownLightTint(wireRadiusPx: number, sightPx: number, color: number): number {
    return wireRadiusPx >= sightPx ? lightTint(color) : WHITE_LIGHT;
}

/**
 * The wire light an entity actually draws (plan-lightmap.md D8).
 *
 * ⭐ A respawn anchor (`dwell_radius > 0`, which only the `zone.bindPoints`
 * campfires carry) draws NONE: its static glow is already painted at zone load
 * and lights the pocket before the fire streams in. Drawing both screens the
 * colour twice — `1-(1-c)²` — so the fire turned from orange to pale yellow the
 * moment it entered interest range. Identity, never position: a player standing
 * beside the fire keeps their own light.
 */
export function wireLightRadius(lightRadiusPx: number, dwellRadiusPx: number | undefined): number {
    return (dwellRadiusPx ?? 0) > 0 ? 0 : lightRadiusPx;
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
