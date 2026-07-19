# Zone Editor — Step-by-Step Manual

How to author a zone file (`api/zones/<id>.json` — world bounds, terrain,
props, mob spawns, campfires, dark areas, NPCs, anchors) directly in-game, and
how to make the server load your result. No coding required. Current as of
2026-07-19. Two zones ship today: `world.json` (the live game world — the
default via conf `game.zone`) and `proving-grounds.json` (the debug/test map,
loaded with `-zone proving-grounds`).

This manual is the **placement half**; mob/skill/prop *definitions* and art
live in `docs/manual-content-authoring.md`.

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

`-content ../api` makes the server read the zone files in `api/zones/` (and
props/mobs) straight from the repo — `world.json` unless `-zone`/conf says
otherwise. Those are the files you will be replacing with your edits.

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
- The server's current zone (default: `world`) already loaded: yellow
  rectangle = world bounds,
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

Top of the panel: **Off / Terrain / Props / Spawns / Campfires / Dark /
NPCs / Anchors**.

- **Off** — clicking does nothing special (default, so you can play normally).
- **Terrain** — paint ground textures; they are now part of the zone (see §8).
- **Props** — place/edit props.
- **Spawns** — place/edit mob spawn points.
- **Campfires / Dark / NPCs** — the later sections work the same way:
  click to place, click a marker to select, Update/Delete.
- **Anchors** — named points encounter scripts look up (see §5b).

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

## 5b. Anchors mode — encounter positions

Anchors are **named points** that Go encounter scripts read at boot (content
pass C6): the zone owns WHERE a fight plays out, the script owns WHAT
happens. The Orc Warlord uses four: `warlord-home`, `warbanner-1`,
`warbanner-2`, `wave-mouth`.

Type a **Name**, then click the map (or **"Place at my position"**) — a cyan
crosshair with the name label appears. Click a crosshair to select it
(**Update name** / **Delete** as usual). To *move* an anchor: delete it and
re-place it with the same name, like campfires.

Two rules the server enforces at boot:

- Names must be **unique** (the editor warns on duplicates too).
- **Renaming or deleting an anchor a script looks up breaks the server
  boot** — deliberately loud, never a silent fallback position. Move
  anchors freely; rename only together with the Go script.

## 5c. NPCs mode — author an NPC end-to-end (placement half)

Teaching/lore NPCs are zone content: everything below lives in the zone JSON
and is editor-authorable. The **definition/art half** — which sprite renders,
how big it draws, brand-new art — is covered in
`docs/manual-content-authoring.md` §1c (hand-off at the end of this list).

1. **Place it.** NPCs mode → type a **Type** label (free text, e.g. `Farmer` —
   the display/marker name, *not* the sprite), set the **Radius** (server
   units — this is the **sensor radius**, the approach circle that triggers
   teachings/lore, NOT the visual size), then click the map (or **"Place at
   my position"**). Click a marker to select it, **Update**/**Delete** as
   usual.
2. **Too-low line.** One line spoken to a player below the next teaching's
   level gate. **Required for every teaching NPC** — the server refuses to
   boot a teaching NPC without one, so NPCs whose teachings are all ungated
   still carry a flavor line that never fires (the Hermit/Dog pattern).
3. **Lore lines.** The textarea holds idle lines, one per line. Every NPC
   must have teachings or lore lines (or both) — one empty of both fails the
   boot.
4. **Ordered teachings.** With the NPC selected, the teaching sub-row appends
   to its list: pick a **skill** (dropdown from the skill registry), a
   **required level**, and the **line** spoken when it is granted. Teachings
   are granted **in order** on approach; a player below a gate hears the
   too-low line and gets nothing further — so "Harvest ungated, then
   DamageAura @L2" works in one NPC. Each list row has a remove button.
5. **Sprite binding — JSON-only, deliberately.** The zone entry's
   `"entityType"` field names the sprite (a Resource-backed `EntityType` enum
   name, validated at boot; absent = the Flower placeholder). There is **no
   panel control** — hand-edit the exported JSON; the editor round-trips the
   field untouched. Details: `manual-content-authoring.md` §1c.
6. **Visual size is NOT in zone data.** The authored radius is only the
   sensor; the wire sprite radius is a fixed placeholder
   (`model/npc/npc.go`), and the drawn size comes from the matching
   `Graphics.ts` `npcs:` entry (`maxSize`) — a frontend edit, see
   `manual-content-authoring.md` §1c.
7. **Export + restart** (§7) and check the boot log's NPC count.

**New art?** A brand-new NPC sprite is the usual 5-file path (enum append →
regen → SVG → Resource render class → `gameObjectClasses` slot) — steps in
`manual-content-authoring.md` §1c.

## 6. Choose a zone, or start a new one

A world can have several zones — one file each in `api/zones/`, named by its
**file stem** (`proving-grounds.json` → the id `proving-grounds`). Two ship
today: **`world.json`** (the live game world — what the server loads by
default via conf `game.zone`) and **`proving-grounds.json`** (the canonical
debug/test map, loaded with `-zone proving-grounds`).

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

   (Or set `game.zone` in `conf.json` — without `-zone` the server loads the
   configured zone, `world` by default.) The boot log prints the loaded zone (id, name,
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
| Author an NPC (place/text/teachings) | NPCs mode — end-to-end walkthrough in §5c      |
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
