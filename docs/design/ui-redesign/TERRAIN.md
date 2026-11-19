# Terrain brushes — PixelRPG Maker

Paint "Path" or "Water" and the edges and corners pick themselves. This document designs
that feature end to end: the data in the tileset, the matching rule, how a terrain is
defined, how it is painted, what it costs the engine, and how the first starter pack
(task H1 of [REDESIGN.md](REDESIGN.md) §9) ships with its terrains already set.

It is a companion to REDESIGN.md and uses its vocabulary (Brush page §5.3, starter packs
§6.5, collab litmus §8, step tables §9). Where it changes something REDESIGN says, the
section names it.

**H1 is decided:** the first pack is Kenney's *Roguelike/RPG pack* (kenney.nl, 2015, CC0).
One sheet, `roguelikeSheet_transparent.png`, 968×526, 57×31 tiles of 16 px with **1 px
spacing** and no outer margin.

---

## 1. What exists today

Read from the code at `fcebb0b3`, not assumed.

- **A brush is one tile id.** `ActiveTileComponent.spriteId` is a single global id end to
  end; `PaintTileCommand` writes one sprite to one cell; `FillTileCommand` writes one
  sprite to many cells. Nothing looks at a neighbour.
- **A cell can already hold several sprites per layer.** The shadow state
  (`map-editor-shadow.service.ts`) stores a list of refs per `(cell, layer)`,
  `previousSprites` is an array, and the fill service compares cells by the joined
  signature of that list. Only the paint helper `addSpriteToTileForLayer` always writes a
  list of one. §3.4 relies on this.
- **Painting is a tap or a stroke.** `TileEditorSystem` paints on `POINTER_TAP`, and since
  T7 a one-finger drag strokes with the pencil or the eraser; with every other tool the
  drag still pans (`drag-router.ts`, §6.3).
- **Tile collision is per sprite, in the tileset.** `tile-collision.ts` presets, written
  in batches by `ProjectStore.setTileCollisions`, riding
  `__project/spriteset.update.chunk`. The map reads it per cell through
  `MapResource.collisionAt`, which unions the stacked sprites.
- **Sprites carry `name`, `tags`, `tileProperties.surface`.** No shipped tileset fills
  them.
- **Spacing is supported everywhere — since T0.** `SpriteSetData` has `margin` and
  `spacing`, and all four consumers now agree cell for cell:

  | Consumer | `spacing` | `margin` |
  |---|---|---|
  | `createSpriteSheet` (Excalibur, the map) | honoured (Excalibur's `spacing.margin`) | honoured (`spacing.originOffset`) |
  | `sheetGridOf` / `TileSheet` (Brush page sheet, hit-testing) | honoured | honoured |
  | `iterateSpriteGrid` → `GdkSpriteSheet` (every GTK swatch: Library palette, inspector, recents, brush badge, Things thumbnails) | honoured | honoured |
  | `SpriteSetImportDialog` | Spacing row (Full view) | Margin row (Full view) |

  Before T0 the GTK swatches ignored both, so a spaced sheet painted correctly on the map
  and picked correctly on the Brush page while every swatch drifted one pixel further per
  column: at column 56 of this pack a swatch showed a tile three and a half columns away.
  The one translation now lives in `spriteSheetSpacingOf` (ours → Excalibur's), the one
  grid formula in `cellsAlong` (Tiled's, outer margin on both sides), and
  `sheet-slicers.spec.ts` pins the three slicers against each other on a spaced fixture.
- **The terrain model exists — since T1.** `SpriteSetData.terrains`, the matcher in
  `terrain.ts` and the preset tables in `terrain-presets.ts`, all pure and unit-tested.
  Nothing calls them yet: no brush paints a terrain until T2 lands the planner and the
  command, and no shipped sheet defines one until T3.

## 2. The pack, measured

Coordinates are `(col, row)`, zero-based. They were established by reading every tile's
alpha at its four corners and four edge midpoints, then confirmed by rendering test shapes
with the resulting table (paths, T-junctions, rings, blobs, single cells) and looking at
the result. The owner's description of the groups is right in substance; two details
differ and are marked.

### 2.1 Three ground terrains share one 5×6 group

Dirt at origin **(5,7)**, grey stone at **(5,13)**, sand at **(5,19)**. All three have
transparent surroundings, so they sit on top of any floor. Offsets within the group:

| | +0 | +1 | +2 | +3 | +4 |
|---|---|---|---|---|---|
| **+0** | T: east·south·west | T: north·south·west | bend: east·south | bend: south·west | straight: north·south |
| **+1** | T: north·east·south | T: north·east·west | bend: north·east | bend: north·west | straight: east·west |
| **+2** | inner corner SE | inner corner SW | block top-left | block top | block top-right |
| **+3** | inner corner NE | inner corner NW | block left | block centre | block right |
| **+4** | end, open north | end, open south | block bottom-left | block bottom | block bottom-right |
| **+5** | end, open west | end, open east | cross | single | *(empty)* |

For dirt that is: T-junctions (5–6, 7–8), bends (7–8, 7–8), straights (9, 7–8), inner
corners (5–6, 9–10), the 3×3 block (7–9, 9–11), ends (5–6, 11–12), cross (7,12), single
(8,12). (9,12) is empty in all three groups.

Two corrections to the working description: the 2×2 at (7–8, 7–8) is not a round blob but
the four **1-wide bends** (their inner corner pixel is transparent; assembled they make a
ring), and the 2×2 at (5–6, 7–8) is the four **T-junctions**. The group is therefore a
complete 1-wide path set (16 tiles) plus a complete filled-area set (13 tiles): 29 tiles.

### 2.2 Patches share a 5×3 group

A 3×3 block at cols 2–4 and a 2×2 of inner corners at cols 0–1 — 13 tiles, no 1-wide
pieces.

| Terrain | 3×3 block | Inner corners | Surroundings |
|---|---|---|---|
| Water with a grass shore | (2–4, 0–2) | (0–1, **1–2**) | opaque, grass baked in |
| Pool with a stone rim | (2–4, 3–5) | (0–1, 3–4) | opaque |
| Flower bed, red / white / blue | (2–4, 6–8) / (9–11) / (12–14) | (0–1, 6–7) / (9–10) / (12–13) | opaque inside, transparent corners |
| Grass / autumn leaves / purple | (2–4, 15–17) / (18–20) / (21–23) | (0–1, 15–16) / (18–19) / (21–22) | transparent |

Water is the one group whose inner corners sit a row lower than the rest; (0,0) and (1,0)
above them are plain water, pixel-identical to the block centre (3,1). The preset must
therefore let the corner part move independently (§4).

### 2.3 Plain 3×3 blocks

Cols 10–12, rows 7–24: six 3×3 blocks (rimmed pools and rugs) with no inner corners.
Verified by alpha signature only; not part of the first import.

### 2.4 Fills

Plain grass (5,0)/(5,1), dirt (6,0)/(6,1), stone (7,0)/(7,1), sand (8,0)/(8,1). The block
centre of dirt (8,10) is *not* pixel-identical to plain dirt (6,0), so a terrain never
needs to guess whether a plain floor tile belongs to it.

## 3. Data model

### 3.1 Matching model: one 8-neighbour mask, a sparse table, nearest match

Each cell of a terrain looks at its eight neighbours on the same layer and builds a mask:

```
N = 1   NE = 2   E = 4   SE = 8   S = 16   SW = 32   W = 64   NW = 128
```

A diagonal bit only counts when both edges beside it are set (a diagonal neighbour that
touches only at a point changes no pixel). That normalisation leaves the classic **47**
distinct masks. Cells beyond the map edge count as the same terrain, so water runs off the
map instead of drawing a shore along the border.

A terrain stores a **sparse table** `mask → tile`. The resolver returns the exact entry,
or else the **nearest** one: a differing edge bit costs 4, a differing corner bit costs 1,
ties go to the entry with more bits set, then to the lower mask. Painting never fails and
never leaves a hole.

Why this and not the alternatives:

- **Tiled's corner (vertex) sets** cannot express a 1-wide path at all, and this pack's
  paths are its best feature. Corner sets also paint at tile *corners*, which is a second
  coordinate system for a child to learn.
- **Edge-only (16)** covers the paths and loses filled areas: a 3×3 pond would be drawn
  from crosses.
- **Full blob-47 as a requirement** would reject every group in this pack: the largest has
  29.
- **RPG Maker quarter-tile composition** needs art drawn for it. This art is not.
- **Tiled-style rule maps** are a programming language; out by the owner's constraint.

One mask model with a sparse table covers all of them: a 16-entry table is an edge set, a
9-entry table a plain block, 13 a patch, 29 this pack's ground, 47 a full blob. The preset
decides how many entries get filled; the engine has one code path.

**What a missing variant looks like.** For the 29-tile group the 18 missing masks are the
"mixed" ones — a T-junction or bend with a filled corner on one side. The nearest match
substitutes the piece with the right edges and the wrong corner; in the test renders (3–4
substitutions across a shape built to provoke them) the seam is a corner notch a few
pixels wide. For the 13-tile patches the missing masks are everything 1-wide, where the
nearest match is visibly wrong (a lone quarter-pond). So:

- A terrain whose table has **no entry for mask 0** (no "single" tile) paints a **2×2
  footprint**: the tapped cell plus its right, lower and lower-right neighbours. The rule
  is derived from the table, not stored. Shapes made of 2×2 footprints need only the 13
  patch tiles, except the two-opposite-inner-corners case of a diagonal staircase, where
  nearest match shows one of the two corners.
- The definition dialog states coverage in a sentence, not a number: "Paints paths and
  areas" / "Paints areas, two tiles wide".

### 3.2 Where it lives

Terrains are a property of the **tileset**, next to the per-tile collision they resemble:

```ts
// SpriteSetData
terrains?: TerrainData[]

interface TerrainData {
  /** Stable within the sprite set; a brush is addressed as (spriteSetId, terrainId). */
  id: string
  /** Shown on the brush chip. */
  name: string
  /** Sprite id used as the chip's picture; defaults to the entry for mask 0, else 255. */
  icon?: number
  /** Normalised 8-neighbour mask → sprite id. Sparse. Keys are decimal strings. */
  tiles: Record<string, number>
  /** Sprite ids that count as this terrain for neighbours but are never chosen. */
  members?: number[]
  /** Edges are transparent: the terrain keeps the floor underneath. See §3.4. */
  overlay?: boolean
  /** How the table was filled — lets the definition dialog reopen on the same frame. */
  layout?: { preset: TerrainPreset; parts: Record<string, { col: number; row: number }> }
}
```

- `tiles` is the truth. `layout` is editor memory only: the engine never reads it, and a
  hand-fixed tile does not have to agree with it.
- Sprite ids are the set's local ids (`row * columns + col` for every sheet the import
  dialog writes; (8,12) of this pack is 692).
- A sprite belongs to at most one terrain. The definition dialog enforces it; the reverse
  index `spriteId → terrain` is built once per sprite set and is what the map asks.
- **Maps store nothing new.** A cell "is Path" because the sprite in it belongs to Path's
  table or `members`. A tile placed by hand with the plain pencil joins in; an old map
  gains terrain behaviour the moment its tileset gains a terrain; and there is no
  per-cell flag that could disagree with the picture.
- `members` is how plain water (0,0)/(1,0) counts as water without being a variant.

No collision and no surface on `TerrainData` — see §7.2.

### 3.3 Format version

Additive and optional; a reader that ignores `terrains` still loads the set and renders
every map. No version bump, no migration.

### 3.4 Overlay terrains keep the floor

Dirt, stone and sand have transparent corners. Painted as the only sprite of a cell, a
path corner shows the map's background colour. An `overlay` terrain therefore writes
`[floor, terrainTile]` into the cell's list for that layer, where `floor` is the first
sprite already there that belongs to no overlay terrain. Painting a path across grass and
then across sand keeps grass and sand under their own stretches; erasing the path removes
only the terrain sprite and the floor is simply still there.

This uses the per-layer list the shadow state already has (§1) instead of a hidden
"Paths" layer, because a layer is exactly the concept the child path avoids. Water and the
pool are not `overlay`: they are opaque and replace the cell.

Consequence to state plainly: Kenney's water has its **grass shore baked in**. It looks
right on grass and wrong on sand. The pack has no sand shore; the brush does not invent
one.

## 4. Layout presets

A preset is a picture-level description of where the variants sit in a block of the sheet.
It exists only in the editor; applying one writes `tiles`. Each preset is a set of
**parts** — rectangular sub-blocks with a default position relative to the first — so a
sheet that arranges the same pieces slightly differently needs a nudge, not a new preset.

| Preset | Parts | Entries | Fits |
|---|---|---|---|
| `ground-29` | one 5×6 block, the table in §2.1 | 29 | this pack's dirt, stone, sand |
| `patch-13` | `block` 3×3 · `corners` 2×2, default two columns left of the block, same top row | 13 | this pack's water (corners moved one row down), pool, flower beds, grass, leaves |
| `block-9` | one 3×3 block | 9 | this pack's rimmed pools and rugs; most "fence around an area" art |
| `path-16` | one 4×4 block in mask order | 16 | common edge-only path sheets |
| `blob-47` | one 8×6 block in the common "blob" order (last cell empty) | 47 | sheets drawn for full autotiling |
| *(none)* | — | — | tile by tile (§5.3) |

`ground-29` is this pack's group verbatim; it is named for its shape, not for Kenney, since
his other 16 px packs repeat it. `path-16` and `blob-47` are built (T8) though nothing in the first pack uses them; both are
fixed-order blocks (`path-16`: cell index = N·E·S·W bits 1·2·4·8; `blob-47`: ascending mask,
row-major), so a sheet in another order goes through "Tile by tile".

Preset tables live in one pure engine module (`terrain-presets.ts`) as
`{ part, dc, dr, mask }[]`. A spec asserts for every preset that masks are normalised and
unique.

## 5. Defining a terrain

The model to mirror is PR #331's collision pictograms: the answer is picked **by
picture**, and one sentence says what it will do everywhere.

### 5.1 Where

Library › Graphics › a tileset: **one `Adw.ActionRow`, "Ground brushes"**, in the detail
pane's content column next to "Show walls" and the Wall-brush row. Its subtitle counts
what the set has ("3 brushes" / "None yet"); activating it opens the dialog, whose first
page is the list.

One row rather than an inline group, and in the content column rather than the tile
inspector, because the inspector is the *selected tile's* pane: on a phone it is a bottom
sheet that only exists while a tile is picked, and a brush is a property of the SET.
The content column is the one place both layouts render identically — the phone path
hides `side_slot` and re-parents the inspector, so a row here is one code path for
desktop and phone instead of two placements that drift.

The row's "⋯" carries **Delete** only. Rename lives on the edit page's Name row, where
the name is already an `Adw.EntryRow`; a second rename path would be a second dialog
for a field that is on screen one tap away. (Deviation from the original "Rename and
Delete".)

### 5.2 The dialog: three pages

An `Adw.Dialog` over an `Adw.NavigationView`, the pattern step 6.3 established.

**Page 1 — the brushes this set has.** A `boxed-list` of the set's terrains (thumbnail,
name, "Paints paths and areas") plus a **New brush…** `Adw.ButtonRow`. Activating a row
reopens the dialog on that terrain; "⋯" deletes. This is Simple view: a child who
imported a sheet can make a brush.

**Page 2 — "What does it look like on the sheet?"** A grid of cards, one per preset. Each
card is a generated pictogram of the block's silhouette (the shape the pieces make, drawn
like the `collision-*-symbolic` icons) over a kid name and one line:

- **Paths and areas** — "A big block with paths, corners and ends." (`ground-29`)
- **Area with corners** — "A square patch and four corner pieces." (`patch-13`)
- **Square patch** — "Just a 3×3 square." (`block-9`)
- **Tile by tile** — "No block — pick every piece yourself." (Full view only, and last:
  it is the answer for a sheet no preset fits, not the first thing to reach for. It lands
  on the fix-up page below with an empty table.)

**Page 3 — "Where is it?"** Three things, top to bottom:

1. A **live sample**: a fixed 14×10 test shape (a path with a T and a bend, a filled blob,
   a ring, a single cell, floor on all four sides) drawn with the tiles currently under the
   frame, on a floor tile. It redraws on every move of the
   frame. A wrong position is obvious without knowing what an inner corner is: the sample
   turns to rubble. The shape itself is pure engine data (`terrain-sample.ts`), so what it
   asks for — both inner corners, all four outer ones, both ends of a path — is pinned by
   a spec rather than by a widget.

   The floor is the set's **first fully opaque tile that the brush does not use itself**,
   not — as this section said until T5 — its most common one. "Most common" is a histogram
   over every map's tile data, and the Graphics view holds none: it would have to load
   every map in the project to pick a background colour for a preview. The opaque scan is
   lazy and stops at the first usable hit, and on every sheet we ship that is a plain
   ground tile. The brush's own tiles are skipped because on a water set the first opaque
   tile *is* water, and water on water hides the very mistake the sample exists to show.

   A sheet that knows better says so: **`floorSpriteId` on the sprite-set descriptor** names
   the tile its own surfaces are drawn on, and the dialog uses that instead of scanning
   (`floorSpriteIdOf`, engine). It is editor-only data — the engine never reads it and a map
   stores nothing about it. `roguelike.json` declares grass (sprite 5, the tile
   `blank-scene` is filled with), so the pack's water brush is previewed on land. A declared
   id the set has no sprite for, or cannot draw, falls back to the scan rather than leaving
   the sample on nothing.
2. The **sheet** (`TileSheet`), with the preset's parts drawn as accent frames whose cells
   carry faint pictograms of the piece expected there. **Tap a tile → the active part's
   top-left jumps there**, and an explicit part selector (`Adw.ToggleGroup`, one toggle per
   part) says which part a tap moves. That is the whole "water's corners sit a row lower"
   fix.

   Dragging a frame is **deferred**: `TileSheet` already owns the pointer, and its drag is
   a marquee that arms a stamp. Teaching it a second drag meaning needs a mode flag plus a
   hit test on the frames, and on a phone a one-finger drag is the scroller's — so the
   gesture that would be nicest on desktop is the one that cannot exist on the device that
   matters most. Tap-to-place works identically on both, and the selector makes "which
   part" visible instead of hidden in a grab target. Revisit when a desktop-only nicety is
   worth the mode flag.
3. An `Adw.EntryRow` **Name**, prefilled "Brush", "Brush 2"… and an `Adw.SwitchRow` **"The
   hero can walk on it"** (on by default; §7.2).

"Create" in the header is the suggested action. It is insensitive while any part hangs off
the sheet or covers a tile that already belongs to another terrain; the frame turns
`--error-color` and a caption says which brush owns the tile.

`overlay` is not asked. It is derived at creation: the entry for the block centre is fully
opaque and any other entry has a transparent pixel → `overlay: true`.

### 5.3 Fix-up (Full view)

A **"Fix single pieces"** row on page 2 pushes a third page: the sample shape again, but
tappable. Tapping a cell of the sample selects the *piece it uses* (all cells using it
highlight) and the sheet below scrolls to the tile behind it; tapping another tile on the
sheet reassigns that piece. Pieces the table lacks show the nearest-match tile with a
dashed ring; assigning one adds the entry. A second section, **"Also counts as this"**,
edits `members` by tapping tiles on the sheet.

The selection keys on the **mask**, not on the drawn sprite. The ring has to promise what
the next tap on the sheet changes, and that is one row of `tiles` — by drawn tile, the
first fix on a tile-by-tile brush would claim the whole shape, because every cell borrows
the same entry. Hand-assigned pieces are kept as an OVERLAY over what the frames produce
(the asymmetry `TerrainLayout` already describes: the layout is editor memory, `tiles` is
the truth), so moving the block afterwards still works and saving again does not drop
them.

This fixes by *looking at a result*, not by filling a 47-slot form. "Tile by tile" on
page 1 lands here with an empty table.

### 5.4 Phone and desktop

- **Phone** (dialog presents as a bottom sheet): the sample stays pinned at the top at
  about a quarter of the height; the sheet pans with two fingers and pinches; one finger
  taps to place the active part. Tiles are 48 px at the sheet's 3×, so every target clears
  the 44 px floor. Part selector, name and switch scroll below the sheet.
- **Desktop**: sample left, sheet right, form under the sample; the active part also moves
  with the arrow keys. Parts are switched in the selector, not with Tab — Tab is the focus
  chain's, and stealing it inside a dialog breaks keyboard navigation out of the sheet.

### 5.5 Collab

A terrain definition is tileset data: it rides the existing
`__project/spriteset.update.chunk` through a new `ProjectStore.setTerrain` /
`removeTerrain` pair built on `_mutateSpriteTiles`' sibling for set-level fields. Like
every sprite-set write it has no undo (TODO "Collision follow-ups" (a)); deleting a brush
asks for confirmation and leaves the painted tiles on every map untouched.

## 6. Painting

### 6.1 Brush page

REDESIGN §5.3's Brush page gains one row between the tileset chips and the sheet:

```
( Forest )( Town ) →                    tileset chips, as today
[ Path ][ Water ][ Sand ][ Grass ] →    brushes of this tileset — NEW; hidden when it has none
┌───────────────────────────────┐
│ tileset as a contiguous sheet │
└───────────────────────────────┘
```

A brush chip is 56×56: the terrain's 3×3 rendered at 1× over a checker (so "Path" looks
like a patch of path, not like one brown square) above its name. Tapping it arms the
brush and collapses the sheet to Peek, as picking a Thing does. With brushes present, the
sheet opens scrolled so the chips are in view: for a beginner the chips *are* the palette,
and the 1767-tile sheet is where decorations come from.

### 6.2 What is armed

One new session component, `ActiveTerrainComponent { spriteSetId, terrainId }`, mutually
exclusive with `ActiveTileComponent`: arming a brush clears the tile, picking a tile
clears the brush. One setter in `EditorSession` does both writes; nothing else may write
either. The tool stays `pencil` — a terrain is *what* is painted, not a sixth tool — so
the toolbar, shortcuts and the tool guard chain do not change.

- **Badge and recents:** the brush badge shows the chip picture; the recent strip stores
  `tile | terrain` entries, so a terrain is one tap away after its first use.
- **Eyedropper:** sampling a cell whose sprite belongs to a terrain arms that terrain.
  Sampling with a long press (or Full view's modifier) arms the exact tile instead.
- **Pencil:** paints the terrain at the tapped cell (2×2 for patch terrains, §3.1) and
  re-resolves the eight neighbours. The hover ghost shows the footprint.
- **Fill:** floods the region with the terrain, then re-resolves the region and its
  one-cell border.
- **Eraser:** removes the terrain from the cell and re-resolves the neighbours — whatever
  is armed. On an `overlay` terrain a first erase removes the path and leaves the floor; a
  second erases the floor. That is the eraser's whole rule: *take the top thing off.*
- **Plain pencil over a terrain cell:** the cell takes the plain tile and the neighbours
  re-resolve, so stamping a flower into a path closes the path around it instead of
  leaving two open stubs.

The rule behind the last three: **any edit that adds or removes a terrain member
re-resolves the ring around it.** It is one planner (§7.1), not per-tool logic.

### 6.3 Touch strokes

A terrain is where tap-only painting hurts most: a path of twelve cells is twelve taps
and twelve undo entries. The stroke of REDESIGN §5.5 therefore lands with this feature
(step T7), on the command of §7.1: finger down opens a stroke, each newly crossed cell
(`strokeSamples`, the walk step 7.1's Wall brush already uses, so a fast flick leaves no
gaps) is planned and drawn immediately as a **local preview**, and release commits the
whole stroke as one command. A second finger cancels the stroke and reverts the preview.
Until T7, a tap paints one footprint as one command.

### 6.4 Hand-placed tiles stay possible

The 29 tiles remain ordinary tiles on the sheet. Placing one by hand works and counts as
terrain for its neighbours; the next terrain edit beside it may re-resolve it. Nothing
"locks" a cell: the picture is the state.

## 7. Engine and commands

### 7.1 One planner, one command

**Pure core** — `packages/engine/src/resource/terrain.ts`, GTK- and Excalibur-free like
`tile-collision.ts`: `normaliseMask`, `resolveTerrainTile(table, mask)` (exact, else
nearest), `terrainFootprint(table)`, `terrainIndexOf(spriteSet)`, `applyPreset`.

**Planner** — `services/terrain-paint.service.ts`: given the shadow state, a layer and a
list of intents (`set terrain T at cells…`, `clear at cells…`, `set plain tile…`), it
computes the after-state of every touched cell and of the ring around them, and returns
only the cells whose sprite list actually changes, each with its `previousSprites`. It
reads neighbours **only on the same layer**.

**Command** — one new registered command, `PaintCellsCommand` (`tile.cells`):

```ts
interface PaintCellsPayload {
  layerId: string
  /** Label only: "Paint Path", "Erase Water". */
  label?: { verb: 'paint' | 'erase' | 'fill' | 'stamp'; terrain?: { spriteSetId: string; terrainId: string } }
  cells: Array<{
    tileX: number
    tileY: number
    sprites: Array<{ spriteSetId: string; spriteId: number; animationId?: string }>
    previousSprites: Array<{ spriteSetId: string; spriteId: number; animationId?: string }>
  }>
}
```

`apply` writes `sprites` per cell, `revert` writes `previousSprites`; both rebuild
graphics and call `refreshTileSolidFromEditor` per cell, as `restorePreviousSprites` does
today. Properties that follow:

- **One undo.** Painted cell and recomputed neighbours are one payload → one entry on
  `UndoStackComponent`.
- **Reaches peers, deterministically.** The payload carries the *resolved* tiles. A peer
  applies data; it does not run the resolver, so two peers cannot disagree because one of
  them holds a tileset edit the other has not received yet.
- **It is the stroke and stamp command too.** REDESIGN §8 says a stamp stroke rides "one
  tile-paint command per stroke (existing vocabulary, larger payload)"; `FillTileCommand`
  cannot carry it (one sprite for all cells). `tile.cells` is that vocabulary, and steps
  7.4 (stamp) and the one-finger stroke reuse it. This replaces §8's wording, not its
  intent.
- **`tile.stamp` is GONE, not kept beside it** *(decided in T2)*. The stamp brush landed
  in #336 with `StampTilesCommand` (`tile.stamp`): the same "many cells, one command"
  idea, one sprite id per cell and no sprite *list*. Keeping both would be two commands
  for one concept — the parallel state §7.2 refuses elsewhere — so T2 widened it instead:
  `cells[].spriteId` became `cells[].sprites`, and the kind became `tile.cells`. The
  stamp's own label survives as `label.verb: 'stamp'`. Nothing has shipped, so there are
  no old peers and no saved projects holding `tile.stamp` ops; the format is pre-release.
- **Sprites on the wire are refs, not global tile ids** *(decided in T2)*. `previousSprites`
  has always been `{spriteSetId, spriteId, animationId?}` and the planner resolves within
  one sprite set, so `sprites` uses the same form. Callers holding a global id (the stamp
  brush, the plain pencil) convert via `findSpriteInfoForTileId` before planning — one
  conversion, at the edge, instead of two forms that could disagree. `animationId` is
  omitted rather than set to `undefined`, so an absent key and an explicit `undefined`
  are not two spellings of the same slot.
- **Existing commands stay.** `tile.paint`, `tile.erase`, `tile.fill` keep their kinds for
  edits that touch no terrain. `TileEditorSystem` asks the planner
  first; if no terrain member is added or removed it dispatches the old command unchanged.
- **Registration:** `BUILT_IN_COMMANDS`, `registry.spec.ts`, and a spec that apply →
  revert restores the shadow byte for byte, including multi-sprite cells.

**Two passes, because order must not matter.** Pass one applies the intents, writing a
*provisional* member tile (`resolveTerrainTile(terrain, 255)`) wherever a terrain lands:
which of its 29 pieces belongs in a cell cannot be decided while its neighbours are still
being placed, and any member answers "yes, this cell is Path" for the mask. Pass two
re-resolves every terrain sprite in the touched cells **and their 8-ring** against the
finished state. Resolution never changes membership, so the two commute and the payload
is identical whatever order the intents arrived in — and the cells are sorted before they
travel, because `Map` iteration order is insertion order.

**Control plane:** `Engine.paintTerrainAt(layerId, x, y, spriteSetId, terrainId)` beside
`paintTileAt`, a `PaintTerrain` D-Bus method (`mutating`) and an mcp-bridge
`paint_terrain` tool, so the AI collaborator draws a river with the same op a child does.
`get_status` reporting the armed terrain is **deferred to T4** — the armed brush lives in
`ActiveTerrainComponent`, which T4 introduces; until then nothing holds it to report.

### 7.2 Collision and surface

There is no terrain-level collision. Solidity is per tile (§1), the map unions it per
cell, and a second source would be the parallel state step 7.1 removed. The dialog's
**"The hero can walk on it"** switch is a *batch write*: it calls
`ProjectStore.setTileCollisions` with `free` or `wall` for every tile in `tiles` and
`members`. Reopening the dialog derives the switch from those tiles; if they disagree
(someone fixed one tile in the inspector) the row shows "Mixed — some pieces differ" and
flipping it overwrites.

So **water = wall** means all 13 water tiles plus plain water are Wall. A shore tile blocks
as a whole tile even though half of it is grass; the half-tile presets could refine that
per piece and the inspector already allows it, but the default stays whole-tile — a hero
who can stand on a third of a shore tile reads as a bug to a child.

For `overlay` terrains the union does the right thing unasked: path over grass is
walkable because both are; path painted over a rock tile stays blocked because the rock
is still in the cell.

Surface works the same way where a terrain names one (water → `surface: 'water'`), written
to the tiles by the pack import; the dialog does not ask.

### 7.3 Layers and planes

- A terrain paints on the **active layer** and matches neighbours on that layer only.
  The same terrain on two layers is two independent shapes.
- The lock guard is unchanged: a locked active layer refuses the stroke before the
  planner runs. Re-resolved neighbours are on the same layer, so no other layer's lock is
  ever involved.
- Hidden layers: the planner works on the shadow, which keeps hidden sprites, so painting
  with the layer hidden is as allowed as it is today.
- Planes: no special case. Ground terrains go on a ground-plane layer by habit of the
  starter map, not by rule; a "treetop canopy" terrain on the overlay plane works.
- "Show walls" needs nothing: it reads `collisionAt`, which already sees the new cells.

### 7.4 Performance

A tap touches at most 9 cells (16 for a 2×2 footprint); a fill of *n* cells touches
*n* + border. The reverse index is a `Map<number, TerrainData>` per sprite set, rebuilt on
`tile-properties-changed`. Nothing here scales with map size.

## 8. Starter pack and the shelf

### 8.1 What ships

`games/blank-starter` gains:

- `spritesets/roguelike.png` — the sheet **unmodified** (95 KB), and
  `spritesets/roguelike.json`: `spriteWidth/Height: 16`, `spacing: 1`, `margin: 0`,
  `columns: 57`, `rows: 31`.
- `spritesets/roguelike.LICENSE.txt` — Kenney's licence text verbatim, plus source URL and
  retrieval date. CC0 asks for no credit; the About page credits Kenney anyway.
- **Terrains:** Path (dirt, `ground-29` at (5,7)), Stone (5,13), Sand (5,19), Water
  (`patch-13`, block (2,0), corners (0,1), members (0,0) (1,0)), Grass (block (2,15),
  corners (0,15)). Pool, flower beds and leaves are one dialog each and can follow; five
  chips is what fits a phone row without scrolling.
- **Walls:** water Wall; the four ground terrains Free; everything else set by a table in
  the import script (trees, walls, furniture Wall; floors, rugs, doors Free).
- **Names and tags** for the terrains, the fills and the §6.5 list (trees, house, door,
  fence, sign, chest) — enough for the Floor row of step 5.1 and for search to return.
  Naming all 1767 tiles is not the goal.
- **The start map** stops being empty: 20×14 filled with grass (5,0), so the first tap
  with "Path" draws a path on a meadow instead of brown corners on black.

The JSON is **generated**: `scripts/import-kenney-roguelike.mjs` holds the tables of this
document (origins, wall ranges, names) and writes the descriptor through the same
`applyPreset` the dialog uses. Re-running it is how a correction lands; nobody hand-edits
1767 sprite entries.

### 8.2 The shelf (§6.5)

Nothing in §6.5 changes shape; terrains make it better:

- A pack card copies the sprite set **with its `terrains`** — they are fields of the same
  descriptor, so "the sprite-set import project-op (exists)" of §8 already carries them to
  peers.
- After the copy the Brush page selects the tileset and shows its brush chips first. The
  promise of the card becomes "tap, then paint a path", not "tap, then find grass in a
  57×31 grid".
- Further packs are further cards, each with its own generated descriptor; Kenney's other
  16 px sheets reuse `ground-29`.

This unblocks 3.6 (shelf at the foot of the Brush page), 7.3 (its other three places) and
7.5 (Blank becomes "New game" and moves first).

## 9. Phased plan

Same conventions as REDESIGN §9: small, shippable, each step updating `TODO.md` and the
guards it touches. "T" steps slot in before 3.6; T0–T4 are the path to a usable starter.

| # | Step | Resolves / unblocks |
|---|---|---|
| T0 | ✅ **Spaced sheets work everywhere.** `iterateSpriteGrid` honours `spacing` and `margin`; `spriteSheetSpacingOf` feeds `createSpriteSheet` both (`originOffset` + Excalibur's `margin`); `sprite-set-import.model.ts` takes a `SheetSlicing` object and counts cells with Tiled's formula; `sheet-slicers.spec.ts` asserts all three slicers agree cell for cell on a spaced fixture; the import dialog gained Spacing and Margin rows (Full view) | §1's table; prerequisite for the pack |
| T1 | ✅ **Terrain model.** `TerrainData` + `TerrainPreset` on `SpriteSetData`; `terrain.ts` (mask, normalise, nearest match, footprint, reverse index) and `terrain-presets.ts` (`ground-29`, `patch-13`, `block-9`, `defaultTerrainLayout`, `terrainTilesForPreset`); two specs — the 47 derived rather than tabulated, and §2's measured coordinates as golden tables | — |
| T2 | ✅ **Planner + `tile.cells`.** `terrain-paint.service.ts` (two-pass, ring re-resolution, deterministic sort); `StampTilesCommand` widened into `PaintCellsCommand` and `tile.stamp` removed; `TileEditorSystem` routes pencil / eraser / stamp / fill through the planner and keeps the old command when no terrain is touched; `Engine.paintTerrainAt`, `PaintTerrain`, mcp `paint_terrain`; round-trip spec for multi-sprite cells through save → load. `get_status` deferred to T4 | one undo, peers, AI |
| T3 | ✅ **The pack.** `scripts/import-kenney-roguelike.mjs` (re-runnable; decodes the sheet's alpha itself to derive `overlay` and to never name or wall a blank cell, and builds the tables through `defaultTerrainLayout` + `terrainTilesForPreset` rather than copying numbers); `roguelike.{png,json,LICENSE.txt}` in `blank-starter` + its `game-project.json` entry; the 20×14 start map filled with grass; 1767 sprites, 944 walls, 560 named, five terrains; `set_artists` on the About dialog; `check:assets` gained a second pass over sprite-set descriptors (`image.path`, `properties.licenseFile`) | **H1 done**; TODO "No bundled tileset collection"; unblocks 3.6, 7.3, 7.5, the Tiles/Floor rows of 5.1 |
| T4 | ✅ **Brush chips.** The Ground row on the Brush page (`Adw.ToggleGroup`, a 3×3 `TerrainThumbnail` per chip, hidden when the sheet has no terrain); `ActiveTerrainComponent` + `TerrainAddress` with the mutual exclusion in `EditorSession`; `win.set-terrain-brush`, badge, recents widened to `tile:` / `terrain:` keys, eyedropper handing back the brush a cell was drawn with; footprint hover ghost and a fill preview that anchors only inside the region; `activeTerrain` in `get_status` | the feature is usable end to end |
| T5 | ✅ **Define a brush.** A "Ground brushes" row in the tileset detail pane opens a three-page dialog (brush list → preset picked by picture → place the block on the sheet); tap-to-place with arrow keys and an explicit part selector instead of frame dragging (§5.2); the live sample drawn from pure data (`terrain-sample.ts`) over the first opaque tile the brush does not own; `overlay` derived from the sheet's alpha at save (`sheet-alpha.ts`); `ProjectStore.setTerrain` / `removeTerrain` + the `terrains-changed` event; the walk switch as one `setTileCollisions` batch, re-derived from the set's `solid` flags on reopen; `win.edit-terrains` so the dialog is reachable by keyboard and over D-Bus; `scrollRectIntoView` pans the sheet to the active part; a sheet may NAME its ground (`SpriteSetData.floorSpriteId`, editor-only, read through `floorSpriteIdOf`) so the pack's water brush is previewed on land (§5.2) | imported sheets get brushes |
| T6 | ✅ **Fix-up page** (Full view): the sample again, tappable — tap a piece that looks wrong, tap the tile it should be. Selection keys on the mask, not the drawn sprite (§5.3); pieces with no entry come up dashed over their nearest match and assigning one adds the row; a mode toggle switches the sheet between *Pieces* and *Also counts as this* (`members`). Reached from a "Fix single pieces" row on the place page and from the new **Tile by tile** card, which lands there with an empty table and its own Name row. Hand-picked pieces are an overlay over the frames' output, so the block can still be moved afterwards. `win.edit-terrains` grew two deep links: `<brushId>/fix` and `tile-by-tile` | sheets no preset fits exactly |
| T7 | ✅ **Strokes.** `drag-router.ts` decides pan vs stroke from (editing, tool, layer locked) with `'pan'` as the default, so a locked layer or a Test run scrolls rather than doing nothing; the answer travels to `CameraControlSystem` on `DragIntentComponent`. Stroke tools are exactly the pencil and the eraser — a dragged bucket would re-flood per cell, a dragged object brush would scatter placements, and their drag stays the way to pan with a brush armed. `StrokeSession` paints each newly crossed cell straight into the scene (the preview IS the paint, so the planner sees the stroke's own earlier cells) and withholds only the COMMAND until release, where the whole drag becomes one `tile.cells`; `POINTER_DRAG_END` gained `cancelled`, and the second finger's sequence claim reverts the lot. `strokeSamples` moved into the engine and the step is derived from tile size × zoom, so a flick at zoom 0.3 still hits every cell | TODO "One-finger drag does not paint a stroke"; half of 7.4 (stamp) |
| T8 | ✅ (presets) `path-16` and `blob-47` presets, picker cards "Paths only" / "Everything"; ✅ **"Find brushes"** (a row on the brush list; `findTerrainProposals` matches each preset's predicted alpha signature, 4 edge midpoints + 4 corners, over the sheet, richest preset first; a tile joins one proposal; solid-background groups are not found) — propose terrains from alpha signatures (the method of §2 as a button); more pack cards | further packs of 7.3 |

T0–T3 touch no UI and can run beside Phase 7's remaining steps. T4 touches
`brush-page.blp`, which 3.6 also edits — land T4 first, then the shelf below it.

## 10. Risks to verify first

1. ✅ **Multi-sprite cells survive a round trip.** Proven in T2:
   `terrain-paint.service.spec.ts` runs `snapshotSprites` → `LayerData.sprites` →
   `collectInitialSprites` and gets both entries back, in order, on the right layer. So
   §3.4's `overlay` terrains hold past a save, and the fallback they would otherwise have
   needed (replace the cell, paint paths from the opaque inner tiles only) is not needed.
2. **Excalibur's `originOffset` with spacing.** T0 assumes `SpriteSheet.fromImageSource`
   applies `originOffset` and `margin` independently. The pack needs only spacing, which
   works today; the outer-margin half is unverified.
3. **Texture bleeding.** The map draws 16 px sprites cut from a spaced sheet with nearest
   filtering; at fractional camera zoom a neighbour's column can bleed in. The 1 px gutter
   of this sheet is transparent, which helps; check at the atlas's fractional zooms.
4. **Concurrent strokes.** Two peers painting adjacent cells at the same instant each
   resolve against a state that lacks the other's stroke; the seam between them can keep a
   stale edge. It heals on the next edit beside it. A "re-tile this layer" action would
   heal it on demand; not planned until someone sees the seam.
5. **Sheet size on a phone.** 57×31 at 3× is 2907×1581 px of panning. The chips carry the
   beginner; whether the sheet needs cutting is the first open question below.
6. ~~**Chip row height.**~~ Settled at T4: `phone-chrome.probe` measures the Ground row at
   **73 px** natural height at the 360 px floor, inside the 76 px budget, and
   `phone-chrome.probe.spec.ts` now fails if it grows past it. The chips are 58 px wide
   there, so five of them scroll rather than wrap — a second line would cost the sheet
   another 73 px at Half detent.

Not in scope: animated terrain (water frames), terrain-to-terrain transitions (sand
shore), bridges over water (solidity unions across a plane's layers today), random
variants of one mask (flowers in grass). Each fits the model later — `tiles` values become
lists — and none is needed for a first game.

## 11. Decided by the owner

All three are settled; they are kept here with their reasoning so a later step does not
reopen them by accident.

1. **Whole sheet, for now.** T3 ships the 1767-tile sheet unmodified as one pack. Cutting
   it into "Outdoors", "Town", "Indoors" (more cards on the shelf, smaller sheets on a
   phone, a repack script to maintain) is **revisited at 7.3**, once the chips have been
   used on a phone and §10.5's panning cost is something measured rather than guessed.
2. **The row is called "Ground" / "Boden".** Not "brushes" — that collides with the
   *Brush* page — and not "Terrain" / "Gelände", which no child reads. The Library entry
   reads "New ground brush…". This document keeps saying "terrain" for the *model*
   (`TerrainData`, `terrain.ts`); "Ground" is the word in the UI only.
3. **Water stays in the first five**, with Kenney's grass shore baked in (§3.4). The start
   map is a meadow, so the shore is right there; the stone-rimmed Pool is not a
   replacement, it is a different thing and can join later.
