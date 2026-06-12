/**
 * Sample world data used by the Atlas storybook scenes — ported from
 * the design handoff's `world-data.jsx`. Same scene IDs, same tile
 * sizes, same teleport curves so the storybook reproduces the design
 * mocks 1:1.
 *
 * NOT shipped to end users. Lives under `__demo__/` so it stays out of
 * the public package surface but is still buildable for stories +
 * first-run empty-project content during development.
 */

/** A single scene placed at atlas-space coordinates. */
export interface SampleScene {
  id: string
  name: string
  /**
   * Row-major terrain grid; one char per tile. See {@link TILE_COLOR_MAP}.
   * Empty for real-project scenes that don't have a thumbnail strategy
   * yet — supply `cols`/`previewRows` instead to render a solid
   * placeholder of the right shape.
   */
  rows: string[]
  /** Card-preview columns when `rows` is empty (real-project fallback). */
  cols?: number
  /** Card-preview rows when `rows` is empty (real-project fallback). */
  previewRows?: number
  /** Optional solid colour used for the placeholder preview. */
  previewColor?: string
  /** Atlas-space coordinates of the card's top-left. */
  x: number
  y: number
  /** Mini-map tile size in CSS pixels. */
  tilePx: number
  /** Persisted preview-viewport centre (tile coords), if any. */
  previewTileX?: number
  /** See {@link previewTileX}. */
  previewTileY?: number
  npcs?: { x: number; y: number; cast: number }[]
  hero?: { x: number; y: number }
  /** Total events placed in this scene (for the corner badge). */
  events: number
  music?: string
}

/** Teleport between a source tile in one scene and a destination tile in another. */
export interface SampleTeleport {
  from: string
  fx: number
  fy: number
  to: string
  tx: number
  ty: number
  label: string
}

/** Whispering Forest — 14×12 grass + path + small cluster of houses. */
const MAP_FOREST = [
  'GGGGGGGGGGGGGG',
  'GTGGGGGTTGGGGG',
  'GGGGFGGGTGGGGG',
  'GGGPPPPPPPPGGG',
  'GGGPGGGGGGPGGG',
  'GGGPGHHHHGPGGG',
  'GGGPGHDDHGPGGG',
  'GGGPPPPPPPPGGG',
  'GGGGGGGGGGPGGG',
  'GGGwwwwwGGPGGG',
  'GGGSSSSSGGPGGG',
  'GGGGGGGGGGPGGG',
]

/** Riverside Village — 20×14 with houses, paths, river. */
const MAP_VILLAGE = [
  'GGGGGGGGGGGGGGGGGGGG',
  'GTGGGGGGGGGGGGGGGTGG',
  'GGGGGGHHHGGGGGGGGGGG',
  'GGGGGGHDHGGGHHHGGGGG',
  'GGGPPPPPPPPPPDHGGGGG',
  'GGGPGGGGGGGGGPHGGGGG',
  'GGGPGGFGGGGGGPGGGGGG',
  'GGGPPPPPPPPPPPPPPGGG',
  'GGGGGGGPGGGGGGGGPGGG',
  'GGGGGGGPGGwwwwwGPGGG',
  'GGGGGGGPGGwWWwwGPGGG',
  'GGGGGGGPGGwwwwwGPGGG',
  'GGGGGGGPGGGGGGGGPGGG',
  'GGGGGGGPGGGGGGGGPGGG',
]

/** Crystal Caverns — 12×8 stone with a few crystal accents. */
const MAP_CAVE = [
  'MMMMMMMMMMMM',
  'YYYYYYYYYYYM',
  'YPPPPPPYYYYM',
  'YYYYYPPYRYYM',
  'YYRYYPPYYYYM',
  'YYYYYPPPPPPM',
  'YYYYYYYYPYYM',
  'MMMMMMMMPMMM',
]

/** Castle Interior — 14×8 with central hall + door. */
const MAP_CASTLE = [
  'BBBBBBBBBBBBBB',
  'BPPPPPPPPPPPPB',
  'BPGGGGDGGGGGPB',
  'BPGGGGGGGGGGPB',
  'BPGGFGGGGGFGPB',
  'BPGGGGGGGGGGPB',
  'BPPPPPPPPPPPPB',
  'BBBBBBDBBBBBBB',
]

/** Dream Shrine — 10×8 mystic night biome with scattered flowers. */
const MAP_DREAM = [
  'NNNNNNNNNN',
  'NFNNNFNNFN',
  'NNNNNNNNNN',
  'NTNNNNNNTN',
  'NNNFNNFNNN',
  'NNNNNNNNNN',
  'NNNTNNNTNN',
  'NNNNNNNNNN',
]

/** Five demo scenes, positioned in atlas-space for a varied composition. */
export const SAMPLE_SCENES: SampleScene[] = [
  {
    id: 'forest',
    name: 'Whispering Forest',
    rows: MAP_FOREST,
    x: 30,
    y: 40,
    tilePx: 7,
    npcs: [
      { x: 5, y: 6, cast: 0 },
      { x: 8, y: 5, cast: 2 },
    ],
    hero: { x: 6, y: 3 },
    events: 4,
  },
  {
    id: 'village',
    name: 'Riverside Village',
    rows: MAP_VILLAGE,
    x: 190,
    y: 20,
    tilePx: 7,
    npcs: [
      { x: 8, y: 5, cast: 4 },
      { x: 12, y: 4, cast: 3 },
      { x: 5, y: 6, cast: 5 },
    ],
    events: 12,
    music: 'village_theme',
  },
  {
    id: 'cave',
    name: 'Crystal Caverns',
    rows: MAP_CAVE,
    x: 110,
    y: 250,
    tilePx: 9,
    npcs: [{ x: 3, y: 4, cast: 6 }],
    events: 3,
    music: 'cave_theme',
  },
  {
    id: 'castle',
    name: 'Castle Interior',
    rows: MAP_CASTLE,
    x: 400,
    y: 80,
    tilePx: 10,
    npcs: [
      { x: 5, y: 4, cast: 5 },
      { x: 9, y: 4, cast: 1 },
    ],
    events: 7,
    music: 'castle_theme',
  },
  {
    id: 'dream',
    name: 'Dream Shrine',
    rows: MAP_DREAM,
    x: 320,
    y: 270,
    tilePx: 9,
    npcs: [],
    events: 1,
    music: 'dream_theme',
  },
]

export const SAMPLE_TELEPORTS: SampleTeleport[] = [
  { from: 'forest', fx: 13, fy: 5, to: 'village', tx: 0, ty: 6, label: 'Path' },
  { from: 'village', fx: 7, fy: 13, to: 'cave', tx: 8, ty: 1, label: 'Cave Mouth' },
  { from: 'village', fx: 19, fy: 7, to: 'castle', tx: 0, ty: 4, label: 'Gate' },
  { from: 'cave', fx: 11, fy: 4, to: 'dream', tx: 0, ty: 4, label: 'Shimmer' },
]

/**
 * Colour table for the procedural tile chars in the mini-maps.
 *
 * Hand-picked to read as terrain at thumbnail scale; not meant to match
 * a real tileset. The real editor will replace these with actual
 * `Gdk.Texture` previews once a tileset is loaded.
 */
export const TILE_COLOR_MAP: Record<string, string> = {
  G: '#5fb04c', // grass
  T: '#2d6a25', // tree
  F: '#f0a85c', // flower
  P: '#c6a576', // path
  H: '#8b6240', // house wall
  D: '#4a2e1e', // door
  w: '#5db9d6', // water
  W: '#2b6783', // deep water
  S: '#f0d995', // sand
  M: '#6a6a6f', // mountain
  Y: '#d4c060', // cave glow
  R: '#cf5454', // crystal red
  B: '#65564a', // castle stone
  N: '#322a5c', // night sky
}

/** Fallback for unknown chars. */
export const TILE_DEFAULT_COLOR = '#3a3a40'

/**
 * Vivid palette used by Storybook stories that want synthetic tile
 * swatches without loading a real sprite sheet. Shared by every
 * `TilePalette`-based story so the look stays consistent.
 */
export const DEMO_TILE_COLORS = [
  '#6ab04c',
  '#22a6b3',
  '#f0932b',
  '#eb4d4b',
  '#7ed6df',
  '#e056fd',
  '#686de0',
  '#30336b',
  '#95afc0',
  '#535c68',
  '#badc58',
  '#dff9fb',
  '#ffbe76',
  '#ff7979',
  '#c7ecee',
]

/** Build a deterministic list of synthetic tile descriptors. */
export function buildDemoTiles(count: number): { id: number; color: string; name: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: DEMO_TILE_COLORS[i % DEMO_TILE_COLORS.length],
    name: `Tile #${i}`,
  }))
}
