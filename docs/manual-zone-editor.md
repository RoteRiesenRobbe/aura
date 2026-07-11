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
  circles = props (red = blocks movement, blue = decorative), green diamonds =
  spawn points. Labels show the prop type / mob name. These markers are
  editor-only overlays — the real props and mobs are still there underneath.

> The markers show what's **authored**, not what's live: a mob wanders away
> from its diamond, and a dead mob's diamond stays until it respawns there.

**Markers vs. the real world — important.** Three things render, from two
different sources:

- **Real props & mobs** (solid Tree/Rock sprites, actual Dodos/etc.) are
  **streamed by the server** from whichever zone it booted with (`-zone <id>`).
  The editor **cannot** move these — only a server restart can.
- **Editor markers** (red circles / green diamonds) and the **terrain** follow
  the **Load-zone dropdown** — i.e. the zone you're *authoring*.

So if the dropdown ≠ the server's `-zone`, you'll see one zone's markers +
terrain layered over another zone's real sprites/mobs ("content from both").
When they match (the default on join), every prop/spawn shows up **twice** — its
real sprite *and* its marker on top. Tick **"Hide editor markers (show real
world)"** to drop the overlay and see just the live world. To make the real
world actually match a zone, export it and restart the server with
`-zone <id>` (§7).

## 3. Pick a mode

Top of the panel: **Off / Terrain / Props / Spawns**.

- **Off** — clicking does nothing special (default, so you can play normally).
- **Terrain** — paint ground textures; they are now part of the zone (see §8).
- **Props** — place/edit props.
- **Spawns** — place/edit mob spawn points.

Only the active mode reacts to clicks. The "Mouse (units)" readout shows where
your cursor is in **server units** — the same numbers that end up in the JSON.

The zone-wide controls (**Load zone**, **Zone id**, **Zone name**, **Bounds**,
and the export link) are visible in every mode, since they apply to the whole
zone rather than a single prop or spawn.

## 4. Place and edit props (Props mode)

**To place:** choose a *Prop type* (the list comes from `api/props/`), set
*Rotation* if you care, tick/untick *blocks movement*, then
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
  decorative, you can walk through it. (Auras always pass through props —
  aura line-of-sight was cut 2026-07-10 and the old `blocksAura` flag was
  deleted 2026-07-11.)
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

### Movement archetypes: wander and patrol routes

A spawn's archetype (mob-depth chunk 5): route patrol beats wander, wander
beats stationary. Idle movement always runs at the mob's **idle pace** —
a fraction of chase speed — so an aggroed mob visibly speeds up.

- **Local wander** — the *Wander radius* input is tri-state: **empty =
  inherit the mob type's default** (Dodos graze out of the box —
  `factors.wanderRadius` in `api/mobs/`), **0 = force stationary** (a
  "bridge guard" of a wandering species), **> 0 = this radius**. The marker
  shows the effective disc (fainter when inherited); the mob ambles between
  random points inside it with long pauses and **(re)spawns at a random spot
  within the disc** instead of the exact point.
- **Patrol route** — select a spawn, tick **"Add on map click"** in the
  selection box, then click the route points in order on the map (numbered
  dots + a line from the diamond appear). **Remove last** / **Clear** edit
  the list; untick the box to go back to normal placing/selecting. The
  **Traversal** select picks how the route repeats: **Ping-pong** (A→B→C→
  B→A, the default — right for open lines like wall patrols) or **Loop**
  (…→C→A→B→…, wraps around — right for circling a landmark/tower; the
  preview closes the polygon). A route needs at least 2 points; making it
  *walkable* is your job as the designer — obstacle steering only smooths
  small blockers.
- **Idle speed factor** — per-spawn pace override in (0, 1] (empty =
  inherit the type's `factors.idleSpeedFactor`, which itself defaults
  globally). Lets two spawns of the same species amble differently.

Rules the editor enforces (the server refuses to boot otherwise): an
explicit wander radius > 0 and waypoints never together, a traversal mode
only with waypoints, and no wander/route on a mob that can't walk (speed 0,
e.g. Totem). In every archetype a mob that aggros mid-route **runs back at
full speed** to the exact point where it left its route once combat ends,
then drops back into the amble.

## 6. Choose a zone, or start a new one

A world can have several zones now — one file each in `api/zones/`, named by
its **file stem** (`proving-grounds.json` → the id `proving-grounds`; since
2026-07-11 this is the only shipped zone — the canonical debug/test map).

- **Load zone** dropdown — pick any existing zone to open it for editing, or
  **＋ New zone** to start a blank one (default bounds, no terrain/props/spawns).
  Loading a zone swaps everything: markers, terrain, name, bounds.
- **Zone id (filename)** — the operational identity. This is what the server's
  `-zone` flag selects and what the download is named (`<id>.json`). Set it
  before exporting a new zone.
- **Zone name** — a human-readable label stored inside the file; it can differ
  from the id and is not used to select the zone.
- **Bounds** — changing them redraws the yellow rectangle immediately so you can
  see the new world edge, but the **physical wall only moves after the server
  restart** (§7). Keep props/spawns inside; the wall is centered on the origin
  (a 60×40 zone spans x −30..+30, y −20..+20).

## 7. Export and load into the server

1. Click the **"Zone: N props / M spawns"** link at the bottom of the panel.
   A popup shows the complete zone file (bounds + terrain + props + spawns).
2. Press **Download** — you get `<id>.json` (from the *Zone id* field).
3. Copy it into the repo: `api/zones/<id>.json`.
4. **Restart the backend**, selecting your zone by id:

   ```bash
   ./berryhunterd -dev -content ../api -zone <id>
   ```

   (Or set `game.zone` in `conf.json`. With only one zone file and no `-zone`,
   the server just loads it.) The boot log prints the loaded zone (id, name,
   bounds, prop/spawn counts) — a hand-edit typo makes the server refuse to boot
   and name the problem.
5. **If you changed terrain**, also let the frontend rebuild: the client bundles
   each zone's terrain, so a terrain edit needs the webpack dev server to pick up
   the changed `api/zones/<id>.json` (it does so automatically under
   `npm run start`; hard-reload the browser). Bounds/props/spawns are streamed
   from the server, so those only need the backend restart.

Iterate: edit → download → copy → restart backend (→ frontend rebuild for
terrain) → reload → edit …

> If you run the server **without** `-content ../api` (embedded content), your
> new zone only takes effect after `make -C backend build` (which copies and
> embeds `api/` into the binary).

## 8. Terrain mode

Terrain mode is the ground-texture painter: pick a texture type, click the
ground to paint. Terrain is now **part of the zone** — it exports inside
`<id>.json` (in server units) alongside props and spawns, and the client renders
whichever zone's terrain the server selected. There is **no** separate terrain
download anymore; the "N Textures on the Map" link is just a preview of what's
currently placed (shown in pixels). Save terrain the same way as everything
else: the zone editor's **Download** (§7).

## Quick reference

| I want to…                       | Do this                                            |
|----------------------------------|----------------------------------------------------|
| Open the editor                  | Add `&textures` to the game URL                    |
| Place a prop / spawn             | Pick mode + type, click the ground (or "Place at my position") |
| Edit one                         | Click its marker, change controls, **Update**      |
| Move one                         | **Delete**, then click the new spot                |
| Remove one                       | Click its marker, **Delete**                       |
| Open a different zone            | **Load zone** dropdown → pick it                   |
| Start a fresh zone               | **Load zone** → **＋ New zone**, then set *Zone id* |
| Paint terrain                    | Terrain mode, click the ground (exports with the zone) |
| See just the real world          | Tick **"Hide editor markers"**                     |
| Save my work                     | Bottom link → **Download** → `api/zones/<id>.json` |
| Make the server use it           | Restart backend with `-content ../api -zone <id>`  |
| See where I am / the cursor is   | "Mouse (units)" readout in the panel               |
