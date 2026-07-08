# Zone Editor — Step-by-Step Manual

How to author `zone.json` (world bounds, props, mob spawn points) directly
in-game, and how to make the server load your result. No coding required.

The editor is a dev tool: it lives in the browser client, is activated by a
query parameter, and never appears for normal players.

---

## 1. Start everything

You need both servers running locally. **All commands start from the repo
root** (`aurahunter/`) — check your prompt: if you are already inside
`backend/` or `frontend/`, skip the `cd`.

**Backend:**

```bash
make -C backend build
cd backend && ./berryhunterd -dev -content ../api
```

`-content ../api` makes the server read `api/zones/zone.json` (and props/mobs)
straight from the repo — that's the file you will be replacing with your edits.

**Frontend** (second terminal, again from the repo root):

```bash
cd frontend && npm install && npm run start
```

## 2. Open the game with the editor enabled

In your browser:

```
http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&textures
```

The important part is **`&textures`** — that's the editor switch. Join the game
normally. You get:

- The editor panel in the **top-right corner**.
- GOD mode (auto-activated, so mobs can't interrupt your editing).
- The current `zone.json` already loaded: yellow rectangle = world bounds,
  circles = props (red = blocks movement, blue = decorative, inner ring =
  blocks aura), green diamonds = spawn points. Labels show the prop type / mob
  name. These markers are editor-only overlays — the real props and mobs are
  still there underneath.

> The markers show what's **authored**, not what's live: a mob wanders away
> from its diamond, and a dead mob's diamond stays until it respawns there.

## 3. Pick a mode

Top of the panel: **Off / Terrain / Props / Spawns**.

- **Off** — clicking does nothing special (default, so you can play normally).
- **Terrain** — the old ground-texture painter (see §8).
- **Props** — place/edit props.
- **Spawns** — place/edit mob spawn points.

Only the active mode reacts to clicks. The "Mouse (units)" readout shows where
your cursor is in **server units** — the same numbers that end up in the JSON.

## 4. Place and edit props (Props mode)

**To place:** choose a *Prop type* (the list comes from `api/props/`), set
*Rotation* if you care, tick/untick *blocks movement* and *blocks aura*, then
**click on the ground** where the prop should stand — or press **"Place at my
position"** to drop it exactly where your character stands (the "You (units)"
readout shows that spot). A circle marker appears and is automatically
selected (yellow outline).

**To edit an existing prop:** click on its marker. It gets selected, and its
values load into the panel controls. Change the controls, then press
**Update**. Press **Delete** to remove it, **Deselect** to leave it alone.

**To move a prop:** there is no drag — Delete it, then place a new one at the
right spot (your control values are still set, so it's one click).

Notes:
- *blocks movement* = players and mobs collide with it. Unticked = purely
  decorative, you can walk through it.
- *blocks aura* is stored but does nothing yet (line-of-sight comes later).
- Placing a new prop while another is selected: clicking empty ground places,
  clicking a marker selects — if you want to place *overlapping* an existing
  marker, delete or move the old one first.

## 5. Place and edit spawn points (Spawns mode)

Works exactly like props: choose a *Mob* (list from `api/mobs/`), set *Respawn
ticks* (30 ticks = 1 second; 900 = 30 s), *Respawn variance* (0.2 = ±20 % on
the respawn delay), optionally *Angle* (initial facing), then **click** to
place a green diamond — or press **"Place at my position"**. Click a diamond
to select, **Update**/**Delete** as above.

Each spawn point = exactly one mob alive at a time: it spawns there, and after
dying respawns at the same spot once the timer elapses.

## 6. Zone name and bounds

The *Zone name* and *Bounds* fields (visible in Props/Spawns mode) edit the
zone header. Changing bounds redraws the yellow rectangle immediately so you
can see the new world edge — but the **physical wall only moves after the
server restart** in step 7. Keep all props/spawns inside the rectangle; the
wall is centered on the origin (a 60×40 zone spans x −30..+30, y −20..+20).

## 7. Export and load into the server

1. Click the **"Zone: N props / M spawns"** link at the bottom of the panel.
   A popup shows the complete `zone.json`.
2. Press **Download** — you get a `zone.json` file.
3. Replace the repo file with it: `api/zones/zone.json`.
4. **Restart the backend** (`Ctrl+C`, then `./berryhunterd -dev -content ../api`).
   The boot log prints the loaded zone (name, bounds, prop/spawn counts) — if
   you made a typo by hand-editing, the server refuses to boot and names the
   problem.
5. Reload the browser. The webpack dev server picks the new file up
   automatically (the editor bundles the same `api/zones/zone.json` the server
   reads), so the editor markers now match the new state — you can keep
   iterating: edit → download → replace → restart → edit …

> If you run the server **without** `-content ../api` (embedded content), your
> new zone only takes effect after `make -C backend build` (which copies and
> embeds `api/` into the binary).

## 8. Terrain mode (the old texture painter)

Terrain mode is the pre-existing ground-texture painter: pick a texture type,
click the ground to paint. Its export is **separate** from the zone: use the
"N Textures on the Map" link → Download → replace
`frontend/src/client-data/ground-textures.json`. Textures are client-only
cosmetics; the server never sees them.

## Quick reference

| I want to…                       | Do this                                            |
|----------------------------------|----------------------------------------------------|
| Open the editor                  | Add `&textures` to the game URL                    |
| Place a prop / spawn             | Pick mode + type, click the ground (or "Place at my position") |
| Edit one                         | Click its marker, change controls, **Update**      |
| Move one                         | **Delete**, then click the new spot                |
| Remove one                       | Click its marker, **Delete**                       |
| Save my work                     | Bottom link → **Download** → `api/zones/zone.json` |
| Make the server use it           | Restart backend with `-content ../api`             |
| See where I am / the cursor is   | "Mouse (units)" readout in the panel               |
