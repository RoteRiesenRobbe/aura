# Vendored icon assets - attribution

The glyphs in `vendor/` and the data inlined in `SkillIcons.generated.ts`
come from [game-icons.net](https://game-icons.net) and are licensed
**CC BY 3.0** (<https://creativecommons.org/licenses/by/3.0/>).

They were downloaded once by `scripts/fetch-skill-icons.mjs` and stripped of
their background rectangle and hardcoded fills so the UI can tint them; no
other modification was made. The file name under `vendor/<author>/` is the
icon name on game-icons.net, so every asset stays traceable to its original.

## Authors used

- **carl-olsen** (1): flame
- **delapouite** (6): drum, healing, invisible, knight-banner, knocked-out-stars, peace-dove
- **lorc** (28): ankh, bleeding-wound, bordered-shield, broadsword, campfire, charm, energy-shield, land-mine, lantern-flame, life-tap, magic-portal, meat-cleaver, meditation, mining, muscle-up, poison-bottle, return-arrow, scythe, shield-reflect, shouting, snail, snowflake-1, spider-web, star-swirl, stopwatch, totem-head, vine-leaf, wingfoot
- **sbed** (1): health-increase

Total: 36 glyphs.

These are FUNCTIONAL PLACEHOLDERS (UI pass C4, ruling D3) - a small shared
vocabulary keyed to what a skill does, expected to be replaced by original
art later.
