/**
 * A terrain brush: paint "Path" or "Water" and the edges and corners
 * pick themselves.
 *
 * Terrains are a property of the TILESET, next to the per-tile collision
 * they resemble — see `docs/design/ui-redesign/TERRAIN.md` §3.2. The
 * consequence worth stating twice: **maps store nothing new.** A cell
 * "is Path" because the sprite sitting in it belongs to Path's table or
 * its `members`, so a tile placed by hand with the plain pencil joins
 * in, an old map gains terrain behaviour the moment its tileset gains a
 * terrain, and there is no per-cell flag that could disagree with the
 * picture.
 *
 * Additive and optional: a reader that ignores `terrains` still loads
 * the set and renders every map, so this needs no format bump (§3.3).
 */

/**
 * How a terrain's table was filled in — a picture-level description of
 * where the variants sit in a block of the sheet (§4).
 *
 * Serialised inside {@link TerrainData.layout}, which is why the enum
 * lives with the data rather than beside the tables in
 * `resource/terrain-presets.ts`: the string is written to disk.
 */
export enum TerrainPreset {
  /** One 5×6 block: a complete 1-wide path set plus a filled-area set. */
  Ground29 = 'ground-29',
  /** One 8×6 block holding all 47 pieces, in ascending mask order. */
  Blob47 = 'blob-47',
  /** A 3×3 block plus a 2×2 of inner corners; no 1-wide pieces. */
  Patch13 = 'patch-13',
  /** One plain 3×3 block, no inner corners. */
  Block9 = 'block-9',
  /** One 4×4 block of 1-wide pieces, no areas, in N·E·S·W bit order. */
  Path16 = 'path-16',
}

/** Where one part of a preset was placed in the sheet, in cells. */
export interface TerrainLayoutPart {
  readonly col: number
  readonly row: number
}

/**
 * Editor memory: which preset filled `tiles`, and where each of its
 * parts sat. The ENGINE NEVER READS THIS — it exists so the definition
 * dialog can reopen on the same frames, and a tile fixed by hand does
 * not have to agree with it. {@link TerrainData.tiles} is the truth.
 */
export interface TerrainLayout {
  readonly preset: TerrainPreset
  /** Part id → its top-left cell in the sheet. */
  readonly parts: Record<string, TerrainLayoutPart>
}

/** One terrain brush defined on a sprite set. */
export interface TerrainData {
  /**
   * Stable within the sprite set; a brush is addressed as
   * `(spriteSetId, terrainId)`.
   */
  id: string

  /** Shown on the brush chip. */
  name: string

  /**
   * Sprite id used as the chip's picture. Defaults to the entry for
   * mask 0 (the "single" tile), else the one for 255 (the filled
   * centre) — see `terrainIconSpriteId`.
   */
  icon?: number

  /**
   * Normalised 8-neighbour mask → sprite id, SPARSE. Keys are decimal
   * strings because JSON objects have no numeric keys.
   *
   * Sprite ids are the set's local ids (`row * columns + col` for every
   * sheet the import dialog writes). How many entries a table has is
   * what makes it an edge set (16), a plain block (9), a patch (13),
   * this pack's ground (29) or a full blob (47): the engine has one
   * code path for all of them and nearest-match fills the gaps.
   */
  tiles: Record<string, number>

  /**
   * Sprite ids that COUNT as this terrain when a neighbour is examined
   * but are never chosen as a variant. How plain water counts as water
   * without being one of the thirteen patch pieces.
   */
  members?: number[]

  /**
   * The terrain's edges are transparent, so it keeps the floor beneath
   * it: painting writes `[floor, terrainTile]` into the cell rather
   * than replacing what is there (§3.4). Dirt, stone and sand are
   * overlays; opaque water is not.
   */
  overlay?: boolean

  /** Editor memory only — see {@link TerrainLayout}. */
  layout?: TerrainLayout
}
