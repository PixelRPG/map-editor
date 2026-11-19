# OoT2DUnity Kokiri Forest: original vs. our port

Research notes for adapting the original game's behaviour to PixelRPG Maker's own
engine/maker logic. Sources:

- Original: a local shallow clone of the public OoT2DUnity repository (large binaries filtered).
- Ours: this repository (fresh checkout).

All factual claims cite `file:line`. Interpretations are marked *(inferred)*.

## Status

- [x] Section 1: TMX structure
- [x] Section 2: our port
- [x] Section 3: player
- [x] Section 4: signs, NPCs, enemies, items
- [x] Section 5: fix list

## 1. TMX structure of Kokiri Forest

### 1.1 Map header and tilesets

`Assets/Tiled/Maps/Kokiri Forest.tmx:2`: Tiled 1.2 / 1.3.4, orthogonal,
`renderorder="right-down"`, 100x100 tiles at 16x16 px, `infinite="1"`,
`nextlayerid="17"`, `nextobjectid="315"`. All tile layers use CSV-encoded
**chunks** (`Kokiri Forest.tmx:9-10`, chunks are 16x16 at integer tile coords),
not a single flat grid — the populated area is a small part of the 100x100 grid.

Two tilesets (`Kokiri Forest.tmx:3-4`):

| firstgid | source | tile size | notes |
|---|---|---|---|
| 1 | `../Tilesets/OoT2D Kokiri Forest.tsx` | 16x16, 32 columns, 1024 tiles | `.../OoT2D Kokiri Forest.tsx:2`; per-tile collision polygons (e.g. tile 14/15/16/17 sloped edges, 18/19 diagonals, 37/38/39 full 16x16 blockers) at `.tsx:4-45` |
| 1025 | `../Tilesets/OoT2D Water.tsx` | 16x16, 6 columns, 30 tiles | `.../OoT2D Water.tsx:2`; animated water, 3 frames x 200 ms per tile (`:4-40`) |

`Assets/Tiled/objecttypes.xml:2-5` defines only `Deep Water` and `Water` object
types; all other object `type` strings in the map are plain labels with no
shared property schema.

### 1.2 Layers in file order (top to bottom as stored)

| # | id | name | kind | properties | contents |
|---|---|---|---|---|---|
| 1 | 8 | Map Layer 0 | tile | `unity:SortingLayer = "Map Layer 0"` (`:7`) | 9 chunks, 484 non-zero tiles, gids up to 1050 -> includes water tileset (`:5-173`) |
| 2 | 11 | Water | object | `unity:IsTrigger = true` (`:176`) | 4 `Water` objects, each an irregular polygon (pond / stream / water ring) (`:178-190`) |
| 3 | 1 | Map Layer 1 | tile | `unity:SortingLayer = "Map Layer 1"` (`:193`) | 70 chunks, 16033 non-zero tiles, gids <= 943 (`:191-1457`) — the main ground layer |
| 4 | 10 | Manual Boundaries | object | none | 4 unnamed rects, 8x32 / 8x96 px, no `type` (`:1459-1462`) |
| 5 | 12 | Grass | object | none | 177 `Grass` objects, gid 340 (`:1465-1641`) |
| 6 | 13 | Shrubs | object | none | 85 `Shrub` objects, gid 373 (`:1644-1728`) |
| 7 | 14 | Rocks | object | none | 16 `Rock` objects, gid 372 (`:1731-1746`) |
| 8 | 15 | Signs | object | none | 13 `Sign` objects, gid 403 (`:1748-1762`) |
| 9 | 2 | Map Layer 2 | tile | `unity:SortingLayer = "Map Layer 2"` (`:1765`) | 64 chunks, 3196 non-zero tiles, gids <= 729 (`:1763-2921`) |
| 10 | 16 | Camera Boundaries | object | none | 1 polygon named "Camera Boundaries" (a large L-shaped confining region) (`:2922-2926`) |

No `group` layers. No NPC, door, ledge, chest, item-spawn, enemy-spawn or
generic trigger object exists in this TMX — the only semantic object types are
`Water`, `Grass`, `Shrub`, `Rock`, `Sign` plus the two untyped boundary layers.

### 1.3 Which layers are above the player

The Unity sorting-layer order (bottom to top) is in
`ProjectSettings/TagManager.asset:42-69`: `Map Layer -2`, `Map Layer -1`,
`Map Layer 0` (`:49`), `Map Layer 1` (`:52`), **`Default`** (`:55`),
`Map Layer 2` (`:58`), `Map Layer 3`, `Map Layer 4`, `UI`.

Each tile layer is assigned the identically named sorting layer by the
importer (`Assets/Packages/SuperTiled2Unity/Scripts/Editor/Importers/RendererSorter.cs:100-113`,
which reads the `unity:SortingLayer` custom property). The player and the
object prefabs sit on `Default` sorting layer 0 (`Prefabs/Player.prefab:106-108`,
`Prefabs/Environment/Sign.prefab:70-72`, likewise Grass/Rock/Shrub).

Therefore, at runtime:

- **below the player:** Map Layer 0 (water/ground), Map Layer 1 (main ground);
- **same layer as player:** the four object groups (Grass/Shrub/Rock/Sign,
  all `sortingOrder=0`, ordered by the renderer's Y-sort within the layer);
- **above the player:** Map Layer 2 — *(inferred)* the house roofs, tree
  canopies and anything else that must occlude Link. This is the layer a
  top-down port must preserve as a separate "canopy/roof" pass.

Tile flags: none of the 3 tile layers uses Tiled's flip/rotate high gid bits
(gid values <= 1050, no `0xF0000000` bits set — computed from all chunk CSVs),
so the original map stores **no flipped or rotated tiles**; slopes come from
per-tile collision polygons in the `.tsx`, not from tile transforms.

The renderer is configured with `m_TransparencySortMode: 0` and
`m_TransparencySortAxis: {x: 0, y: 1, z: 0}` in
`Assets/Settings/Rendering/Renderer2D.asset:21-22` — a Y-axis transparency sort
axis is declared, so objects sharing Default can overlap correctly by depth
*(inferred)*.

## 2. Our port: structure and the depth / house-rendering question

### 2.1 What the port actually contains

The port lives in `games/zelda-like/`: `game-project.json`,
`maps/kokiri-forest.json`, `maps/kokiri-forest.tmx`, and `spritesets/`.

- The art is copied **verbatim**: `spritesets/kokiri-forest.png` and the
  original `Tilesets/tileset_kokiri_forest.png` share md5 `59ebf4a0…`;
  `spritesets/water.png` and `Tilesets/tileset_water.png` share `eb0471aa…`.
  Both are 512x512 / 96x80 RGBA at 16x16 px. So any visual difference is in
  data or rendering, not in the pixels.
- `maps/kokiri-forest.tmx` is a local copy of the original TMX. A byte diff
  shows the **only** change is two tileset `source` paths
  (`../spritesets/{kokiri-forest,water}.tsx` instead of
  `../Tilesets/OoT2D Kokiri Forest.tsx` / `OoT2D Water.tsx`); all layers,
  chunks and objects are identical. The `.tmx` was not where structure changed.
- The conversion product is `maps/kokiri-forest.json`.

### 2.2 gid to spriteId mapping

The port keeps the original firstgids — `1` and `1025`
(`games/zelda-like/maps/kokiri-forest.json:14`, `:20`). Sheet indices are
0-based, so `gid = spriteId + firstGid`; the host bake helper does exactly this
with `ref.firstGid` (`packages/gjs/src/widgets/editor/map-preview.bake.ts:33-34`).
The Kokiri sheet holds 1024 sprites (32x32) and the water sheet 30 (6x5).

Parsing both files confirms the overlay maps **exactly**: every one of the
3196 `layer_overlay` sprites matches its Map Layer 2 gid at the same cell, with
zero mismatches (`kokiri-forest.json:99659-99662` vs. `Kokiri Forest.tmx:1763-2921`).

One deliberate exception exists. Original gid 943 (tile id 942) is Tiled's
animated flower tile: `OoT2D Kokiri Forest.tsx:2011-2017` defines an animation
of frames 940 / 941 / 942 at 200 ms each. The port stores spriteId 940 plus
`animationId: "flower"` on 396 `layer_ground` sprites, and
`spritesets/kokiri-forest.json` defines `flower` with the same three frames at
200 ms. So the 943 -> 941 substitution is an **animation conversion**, not a
lost tile. This also explains the 396 `animationId: "flower"` occurrences in
`layer_ground`.

### 2.3 Layer collapse

| original layers | port layer | plane | entries |
|---|---|---|---|
| Map Layer 0 (484) + Map Layer 1 (16033) | `layer_ground` (`kokiri-forest.json:25-28`) | `ground` | 16517 entries / 16242 distinct cells |
| Grass / Shrub / Rock / Sign object groups | `objectPlacements` (e.g. `:124533`) | per placement | 291 placements |
| Map Layer 2 (3196) | `layer_overlay` (`:99659-99662`) | `overlay` | 3196, exact match |
| — | `layer_decorations` (`:99653-99656`) | `hero` | **empty** |
| Water / Manual / Camera boundaries | `layer_functional` (`:118843-118845`) | none, `visible: false` | mostly empty components |

275 cells carried a tile on **both** Map Layer 0 and Map Layer 1. Because both
map to our single `ground` plane and our format stores one sprite ref per cell
per layer, the port kept one (268 kept the Layer 1 tile, 7 kept neither) —
parsed from `kokiri-forest.json:29-99652`. *(inferred)* This stacking loss is
forced by the schema, not by a bad conversion pass.

### 2.4 The rendering model — and why "flipped tiles" is the wrong hypothesis

Depth in our engine is entirely `(plane, layer order, actor offset)`:

- plane z: `ground = 0`, `hero = 100`, `overlay = 200`
  (`packages/engine/src/components/tilemap-plane.component.ts:34-38`, `zFor` at
  `:55-57`);
- the player sits at `zFor('hero') + 50` = 150
  (`packages/engine/src/systems/player.system.ts:184`);
- placements sit at exactly `zFor(plane)`
  (`packages/engine/src/entity/spawn-placement.ts:66`);
- inside one plane, a later layer in `MapData.layers` draws over an earlier one
  (`packages/engine/src/types/data/LayerData.ts:25-31`).

There is **no world-Y transparency sort** in our engine. The only `(y, x)` sort
in the codebase is a serialization sort for stable wire bytes
(`packages/engine/src/resource/shadow-fold.ts:47`), not render depth.

The original stores a Y transparency sort axis (`Renderer2D.asset:21-22`, §1.3),
**but with `m_TransparencySortMode: 0` (Default)**. Unity applies the custom axis
only in mode `CustomAxis`, so whether the original really interleaves player and
walls by screen Y is **unverified** (orchestrator review). Confirm by running
the original or checking per-object sorting layers/orders before building
Y-sorting on this premise.

*(inferred)* This is the structural cause of "the house renders wrong": a house
whose lower wall should draw **in front** of Link when he stands behind it and
**behind** him when he stands in front cannot be expressed when the entire
house body is one flat `ground` pass and only the roof is `overlay`. Link is at
z 150 and every ground tile at z 0, so he is always in front of all of them,
regardless of Y. The port preserved the correct roof band (§2.2) but lost the
depth cue that makes walking *around* a house read correctly.

Ruled out: **flipped or rotated tiles**. No gid flag bits are set in any
original tile layer (§1.3), so no tile transform could have been dropped in
conversion. A visual house defect is a depth/order problem, not a transform one.

**Checked and ruled out (orchestrator review): an object row offset.** Every
`Grass`/`Shrub`/`Rock`/`Sign` placement sits at `(0, -1)` relative to its TMX
object's `x/16,y/16`. That is correct, not a bug: all 291 are *tile objects*
(they carry `gid=`), and Tiled anchors an orthogonal tile object at its
**bottom-left** corner, so `y/16 - 1` is the tile's top row. Do not "fix" the
converter.

### 2.5 What to carry over

Keep the three-band arrangement: Map Layer 0/1 -> `ground`, Map Layer 2 ->
`overlay` (already correct). What is missing is a per-Y ordering *within* the
hero band, or an explicit "front wall" overlay strip, so the house can occlude
Link at its base while the roof still occludes him from above *(inferred)*.

## 3. Player: speed, animation, jump, interaction

### 3.1 Movement speed

- Original: `_moveSpeed = 12f`, `_rollSpeed = 24f`
  (`Assets/Scripts/Player/PlayerController.cs:7-8`); diagonal movement divided
  by `Mathf.Sqrt(2)` so it is normalised (`:151-153`).
- Our port: `tilesPerSec: 6` for Link (`game-project.json:129-130`, and the
  other actor at `:109-110`). The engine computes
  `speedPxPerSec = speedTilesPerSec * tw`
  (`packages/engine/src/systems/player.system.ts:149`).
- *(inferred)* The apparent "12 vs 6 = half speed" is an apples-to-oranges
  comparison: the TMX importer uses `pixelsPerUnit: 8`
  (`Assets/Tiled/Maps/Kokiri Forest.tmx.meta`), so 12 units/s = 96 px/s = 6
  tiles/s at 16 px per tile — the same 6 tiles/s the port already declares.
  Measure both in tiles/s before changing this number; doubling it would likely
  make our Link twice as fast as the original.

### 3.2 Walk animation

| | original | ours |
|---|---|---|
| frames per walk cycle | ~10 keyframes (`Link_Walk_D.anim:23-53`, stopTime 0.5 at `:94`) | 4 (`games/zelda-like/spritesets/link.json:130-146`) |
| frame time | 0.05 s = 20 fps (`Link_Walk_D.anim:23-26`) | 200 ms = 5 fps (`link.json:134-146`) |
| idle | one frame | one frame (`link.json:121-125`) |

*(inferred)* Our walk is both chunkier (4 vs ~10 frames) and about four times
slower in cadence, which is the most visible fidelity gap in motion. There is
also an internal inconsistency: `walk-left` uses 130 ms per frame
(`link.json:194-206`) while up/down/right use 200 ms (`:134-146`, `:164-176`,
`:224-236`), so left-facing Link cycles roughly 1.5x faster than the rest.

The original controller's states are BlendTree, Normal, Walk, Idle, Pickup,
Carry, Sword and Swim (`Assets/Sprites/Animations/Link.controller` `m_Name`
entries at `:31-664`); there is no Run/Jump/Fall state.

### 3.3 Jump and ledges

There is **no jump or ledge behavior in the original** to port. The states
folder holds only Roll, Pickup, Sword, Swim and Throw
(`Assets/Scripts/Player/States/`), `Link_Fall.anim` is not referenced by
`Link.controller` (grep found no reference), and `Jump` / `Climb` exist only as
unused enum members (`Assets/Scripts/Enums.cs:33-53`, `Jump` at `:46`,
`Climb` at `:38`). Our engine has no jump/gravity system either (no matching
symbols in `packages/engine/src`). Any jump or ledge feature is therefore a new
design decision, not a port-fidelity fix (see §5 item 9).

### 3.4 Interaction

The original interacts by a short forward raycast from the player:
`Physics2D.Raycast(origin + (0, -1.55), Actor.Direction.ToVector2(), 1.5f,
_hittableLayers)`, then reads a `Carriable` component off the hit transform
(`Assets/Scripts/Player/Carrier.cs:35-41`). Pickup / carry / throw are state
machines (`States/PickupSMB.cs`, `States/ThrowSMB.cs`). *(inferred)* Our engine's
interaction should keep this "facing-direction probe, then act on the target's
component" shape rather than a radius check, so the player must actually face a
sign or object.

## 4. Signs, NPCs, enemies and items

### 4.1 What the original map actually has

From §1.2: the TMX contains no authored NPC, enemy, chest, item-spawn or door
object. Only `Water`, `Grass`, `Shrub`, `Rock`, `Sign` and two boundary layers
exist. So strict port fidelity does **not** require NPCs, enemies or items —
whatever we add there is new product work, not recovered behavior.

- **Signs:** 13 `Sign` objects, gid 403 (`Kokiri Forest.tmx:1748-1762`). The
  prefab is a `Breakable` physics object with a `BoxCollider2D`
  (`Assets/Prefabs/Environment/Sign.prefab`) and **no read script**. The
  original signs are not readable — they exist only as breakable scenery.
  *(inferred)* A "press to read" interaction is a new behavior.
- **Grass / Shrubs / Rocks:** 177 / 85 / 16 objects
  (`Kokiri Forest.tmx:1465-1746`); their prefabs are physics objects with no
  behavior script beyond being hittable/carriable.
- **Water:** 4 polygon trigger objects (`Kokiri Forest.tmx:178-190`); entering
  one swaps the player into the Swim state (`PlayerController.cs:58`
  `OnTriggerEnter2D`, `States/SwimSMB.cs`).

### 4.2 What our port has

- Signs, Grass, Shrubs and Rocks are `objectPlacements` carrying **only** a
  `visual` component (e.g. the sign at `kokiri-forest.json:124533` uses
  spriteId 402 -> gid 403, matching the original). There is no dialogue,
  interaction or behavior component on them.
- The tree-house doors are the one semantic placement: `trigger` +
  `teleport` to `tree-house` (`kokiri-forest.json:124807` and its neighbours),
  but no `visual` component, so the doorway is invisible.
- Water / boundary objects have mostly empty component lists, so the water
  trigger currently has no runtime effect *(inferred from the parsed data)*.
- On the positive side, the engine already defines component specs for
  `dialogue`, `npc-route`, `hostile`, `item`, `trigger` and `teleport`, so the
  machinery for §4.3 exists; the port map simply does not use it.

### 4.3 The gap to close for a real product

*(inferred)* To go from a faithful static port to something playable:

1. give signs a `dialogue` component and an interaction trigger (new behavior,
   since the original had none);
2. turn the 4 water polygons into `trigger` + swim-state transitions, restoring
   the one genuine original object behavior;
3. author NPCs, enemies and items from scratch using the existing specs — the
   original provides no reference data for these, so design them rather than
   pretending to recover them.

## 5. Ordered fix list

Order is by player-visible impact per unit effort. Size: S = data / one file,
M = a few systems plus tests, L = new engine capability.

| # | Symptom | Root cause | Proposed change | Size |
|---|---|---|---|---|
| 1 | ~~Props one row too high~~ — refuted in review | Tile objects are bottom-left anchored in Tiled, so the `(0,-1)` offset is correct (§2.4) | None. Optionally a regression test pinning `tileY = y/16 - 1` for `gid` objects | — |
| 2 | Left-facing Link animates ~1.5x faster than other directions | `walk-left` frame time 130 ms vs 200 ms elsewhere (`link.json:194-206`) | Set all four walk cycles to one frame time | S |
| 3 | Walk looks choppy and slow | 4 frames @ 5 fps vs the original ~10 frames @ 20 fps (§3.2) | Slice the original walk sheets to ~10 frames and set ~50 ms frames; keep idle at one frame | S |
| 4 | Doorway is invisible; player walks into an unmarked tile | Teleport placements have no `visual` component (§4.2) | Add `visual` with the door tile sprite to both door placements | S |
| 5 | Water polygons do nothing | Water objects have empty components (§4.2) | Add `trigger` + a swim movement profile, mirroring `OnTriggerEnter2D` -> Swim (§4.1) | M |
| 6 | Signs are inert | `visual`-only placements; original signs were not readable either (§4.1) | Add `dialogue` + interaction trigger; treat as new behavior, not fidelity | M |
| 7 | Overlapping ground tiles missing in 275 cells | Two original tile layers collapsed into one `ground` plane (§2.3) | Allow a second ground layer / decoration plane and re-import Map Layer 0 separately | M |
| 8 | Link is always in front of house walls; cannot walk behind them | Flat plane z with no world-Y ordering (§2.4) | Add per-Y ordering within the hero band or an explicit front-wall overlay strip; keep roofs on `overlay` | L |
| 9 | No jump / ledge behavior | Neither original nor engine implements it (§3.3) | Out of scope for a fidelity pass; design deliberately if wanted, with gravity + ledge colliders | L |

Do **not** "fix" movement speed (12 -> 24) on the strength of the raw numbers:
§3.1 shows both implementations resolve to 6 tiles/s. Do **not** chase a
flip/rotate conversion bug: §1.3 proves none exists.

