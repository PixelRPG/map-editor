/**
 * The terrain planner: which sprite every cell holds after a
 * terrain-aware edit, and what travels on the wire.
 *
 * Four properties this file pins down, because each one is a way the
 * feature fails SILENTLY — the map looks painted and is wrong:
 *
 *  1. **The ring.** A cell that gains or loses a terrain member changes
 *     the picture its eight neighbours should show. If only the painted
 *     cell is re-resolved, the path grows a seam of stale corner pieces
 *     pointing at nothing (TERRAIN.md §6.2).
 *  2. **The overlay rule.** An `overlay` terrain keeps the floor under
 *     it — `[grass, pathPiece]`, not `[pathPiece]`. Flattening that
 *     cell to one sprite erases the grass with no undo entry of its own
 *     (§3.4).
 *  3. **Determinism.** The payload carries resolved tiles, so two peers
 *     must plan the same edit into byte-identical cells whatever order
 *     the intents arrived in — `Map` iteration order is insertion
 *     order (§7.1).
 *  4. **Exact revert.** `previousSprites` has to restore a multi-sprite
 *     cell as it was, in order. A revert that keeps only the top sprite
 *     is the same data loss as (2), one undo later.
 *
 * Plus the §10.1 round trip at the end: a two-sprite cell has to
 * survive save → load, or the overlay rule holds only until the file is
 * reopened.
 */

import { describe, expect, it } from '@gjsify/unit'
import { TileMap } from 'excalibur'

import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileMapPlaneComponent } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { terrainTilesForPreset } from '../resource/terrain-presets.ts'
import type { TerrainBounds } from '../resource/terrain.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { TerrainPreset } from '../types/data/TerrainData.ts'
import type { LayerData, LayerPlane, MapData, SpriteSetData, TerrainData } from '../types/data/index.ts'
import { collectInitialSprites } from '../resource/tilemap-builder.ts'
import { snapshotLayerContent } from './layer-content.service.ts'
import { getSpritesAt, setSpritesAt } from './map-editor-shadow.service.ts'
import {
  type TerrainPaintIntent,
  type TerrainPlan,
  buildTerrainEraseCommand,
  buildTerrainPaintCommand,
  planTerrainEdit,
  terrainCatalogOf,
} from './terrain-paint.service.ts'

const LAYER = 'ground-layer'
const SET = 'pack'
/** Wide enough that the three terrains below occupy disjoint columns. */
const SHEET = { columns: 20 }
const BOUNDS: TerrainBounds = { columns: 6, rows: 6 }

/**
 * `path` — a full `ground-29` block at the sheet's top-left, so every
 * mask the tests produce has an EXACT entry and an assertion that reads
 * a sprite id is reading the resolver's choice, not its nearest-match
 * fallback.
 */
const PATH: TerrainData = {
  id: 'path',
  name: 'Path',
  tiles: terrainTilesForPreset(TerrainPreset.Ground29, { block: { col: 0, row: 0 } }, SHEET),
}

/** The same 29 pieces, declared as an overlay — the §3.4 case. */
const MOSS: TerrainData = {
  id: 'moss',
  name: 'Moss',
  overlay: true,
  tiles: terrainTilesForPreset(TerrainPreset.Ground29, { block: { col: 10, row: 0 } }, SHEET),
}

/** `patch-13` — no mask-0 entry, so one tap paints a 2×2 footprint. */
const POND: TerrainData = {
  id: 'pond',
  name: 'Pond',
  tiles: terrainTilesForPreset(
    TerrainPreset.Patch13,
    { block: { col: 7, row: 0 }, corners: { col: 5, row: 0 } },
    SHEET,
  ),
}

/** A sprite belonging to no terrain — the floor an overlay keeps. */
const GRASS = { spriteSetId: SET, spriteId: 300 }

const CATALOG = terrainCatalogOf([[SET, { terrains: [PATH, MOSS, POND] }]])

/** The sprite id `terrain` uses for `mask`, asserted to exist in its table. */
function tileFor(terrain: TerrainData, mask: number): number {
  const id = terrain.tiles[String(mask)]
  if (id === undefined) throw new Error(`fixture terrain ${terrain.id} has no tile for mask ${mask}`)
  return id
}

function makeEditor(): MapEditorComponent {
  return new MapEditorComponent()
}

/** Compact `spriteId` view of a cell's refs on the planned layer. */
function idsAt(editor: MapEditorComponent, x: number, y: number): number[] {
  return getSpritesAt(editor, x, y, LAYER).map((ref) => ref.spriteId)
}

function plan(editor: MapEditorComponent, intents: TerrainPaintIntent[]): TerrainPlan {
  return planTerrainEdit({ editor, layerId: LAYER, catalog: CATALOG, bounds: BOUNDS, intents })
}

/**
 * Write a plan into the shadow, the way `PaintCellsCommand.apply`
 * does — so a test can paint, then paint again against the result,
 * instead of hand-seeding cells whose resolved ids it would have to
 * compute itself.
 */
function commit(editor: MapEditorComponent, result: TerrainPlan): TerrainPlan {
  for (const cell of result.cells) setSpritesAt(editor, cell.tileX, cell.tileY, LAYER, cell.sprites)
  return result
}

/** Paint a terrain and commit it, in one step. */
function paint(editor: MapEditorComponent, terrainId: string, x: number, y: number): TerrainPlan {
  return commit(editor, plan(editor, [{ kind: 'terrain', x, y, terrain: { spriteSetId: SET, terrainId } }]))
}

export default async function terrainPaintServiceSuite(): Promise<void> {
  await describe('planTerrainEdit — one tap', async () => {
    await it('paints the "single" piece into an empty neighbourhood', async () => {
      const editor = makeEditor()
      const result = paint(editor, 'path', 2, 2)
      expect(result.touchesTerrain).toBe(true)
      expect(result.cells.length).toBe(1)
      // Mask 0: nothing around it, so the sheet's lone-tile piece.
      expect(idsAt(editor, 2, 2)).toStrictEqual([tileFor(PATH, 0)])
    })

    await it('treats cells beyond the map as the SAME terrain', async () => {
      const editor = makeEditor()
      paint(editor, 'path', 0, 0)
      // N, W and NW lie outside a 6×6 map and count as path, so the
      // top-left cell reads as the BOTTOM-RIGHT corner of a region that
      // runs off the edge (§3.1) — not as a lone tile with a shoreline
      // drawn along the map border.
      expect(idsAt(editor, 0, 0)).toStrictEqual([tileFor(PATH, 193)])
    })

    await it('paints a 2×2 footprint for a terrain with no single tile', async () => {
      const editor = makeEditor()
      const result = paint(editor, 'pond', 1, 1)
      // `patch-13` has no mask-0 piece; a 1×1 tap could only be a
      // nearest-match guess at a lone quarter-pond.
      expect(result.cells.map((cell) => `${cell.tileX},${cell.tileY}`)).toStrictEqual(['1,1', '2,1', '1,2', '2,2'])
      expect(idsAt(editor, 1, 1)).toStrictEqual([tileFor(POND, 28)])
      expect(idsAt(editor, 2, 1)).toStrictEqual([tileFor(POND, 112)])
      expect(idsAt(editor, 1, 2)).toStrictEqual([tileFor(POND, 7)])
      expect(idsAt(editor, 2, 2)).toStrictEqual([tileFor(POND, 193)])
    })
  })

  await describe('planTerrainEdit — the ring', async () => {
    await it('re-resolves the neighbour the new cell changed', async () => {
      const editor = makeEditor()
      paint(editor, 'path', 1, 1)
      const result = paint(editor, 'path', 2, 1)

      // Both cells travel in ONE plan: the painted cell AND the
      // neighbour whose picture it changed.
      expect(result.cells.map((cell) => `${cell.tileX},${cell.tileY}`)).toStrictEqual(['1,1', '2,1'])
      // W of the new cell → the piece whose path leaves to the east.
      expect(idsAt(editor, 1, 1)).toStrictEqual([tileFor(PATH, 4)])
      expect(idsAt(editor, 2, 1)).toStrictEqual([tileFor(PATH, 64)])
      // The old lone-tile piece is what the plan undoes back to.
      expect(result.cells[0]?.previousSprites).toStrictEqual([{ spriteSetId: SET, spriteId: tileFor(PATH, 0) }])
    })

    await it('closes a 3×3 area into block pieces', async () => {
      const editor = makeEditor()
      for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) paint(editor, 'path', x, y)

      expect(idsAt(editor, 2, 2)).toStrictEqual([tileFor(PATH, 255)])
      expect(idsAt(editor, 1, 1)).toStrictEqual([tileFor(PATH, 28)])
      expect(idsAt(editor, 3, 1)).toStrictEqual([tileFor(PATH, 112)])
      expect(idsAt(editor, 1, 3)).toStrictEqual([tileFor(PATH, 7)])
      expect(idsAt(editor, 3, 3)).toStrictEqual([tileFor(PATH, 193)])
      expect(idsAt(editor, 2, 1)).toStrictEqual([tileFor(PATH, 124)])
    })

    await it('reports no change when the cells already show this shape', async () => {
      const editor = makeEditor()
      paint(editor, 'path', 2, 2)
      // Same brush, same cell, nothing left to do — the plan is empty
      // and the caller dispatches no command at all, so repainting over
      // finished ground never grows the undo stack.
      expect(
        plan(editor, [{ kind: 'terrain', x: 2, y: 2, terrain: { spriteSetId: SET, terrainId: 'path' } }]).cells,
      ).toStrictEqual([])
    })

    await it('leaves a different terrain next door alone', async () => {
      const editor = makeEditor()
      paint(editor, 'path', 1, 1)
      const before = idsAt(editor, 1, 1)
      paint(editor, 'pond', 2, 2)
      // The mask asks "is the neighbour THIS terrain", not "is it any
      // terrain" — a pond beside a path is a boundary, not a join.
      expect(idsAt(editor, 1, 1)).toStrictEqual(before)
    })
  })

  await describe('planTerrainEdit — overlay terrains (§3.4)', async () => {
    await it('keeps the floor under the terrain piece', async () => {
      const editor = makeEditor()
      setSpritesAt(editor, 2, 2, LAYER, [GRASS])
      paint(editor, 'moss', 2, 2)
      expect(idsAt(editor, 2, 2)).toStrictEqual([GRASS.spriteId, tileFor(MOSS, 0)])
    })

    await it('replaces the cell for an opaque terrain', async () => {
      const editor = makeEditor()
      setSpritesAt(editor, 2, 2, LAYER, [GRASS])
      paint(editor, 'path', 2, 2)
      expect(idsAt(editor, 2, 2)).toStrictEqual([tileFor(PATH, 0)])
    })

    await it('repaints in place instead of stacking a second piece', async () => {
      const editor = makeEditor()
      setSpritesAt(editor, 2, 2, LAYER, [GRASS])
      paint(editor, 'moss', 2, 2)
      paint(editor, 'moss', 3, 2)
      // (2,2) is re-resolved by the ring pass, not re-placed: still
      // exactly two sprites, floor first.
      expect(idsAt(editor, 2, 2)).toStrictEqual([GRASS.spriteId, tileFor(MOSS, 4)])
    })
  })

  await describe('planTerrainEdit — the eraser (§6.2)', async () => {
    await it('peels the top sprite off and reshapes the neighbours', async () => {
      const editor = makeEditor()
      for (let x = 1; x <= 3; x++) setSpritesAt(editor, x, 1, LAYER, [GRASS])
      for (let x = 1; x <= 3; x++) paint(editor, 'moss', x, 1)
      expect(idsAt(editor, 2, 1)).toStrictEqual([GRASS.spriteId, tileFor(MOSS, 68)])

      const result = commit(editor, plan(editor, [{ kind: 'clear', x: 2, y: 1 }]))
      expect(result.touchesTerrain).toBe(true)
      // The moss goes, the grass under it stays — the eraser takes the
      // top thing off, it does not empty the cell.
      expect(idsAt(editor, 2, 1)).toStrictEqual([GRASS.spriteId])
      // And the two stumps go back to lone tiles instead of keeping the
      // ends that pointed at the erased cell.
      expect(idsAt(editor, 1, 1)).toStrictEqual([GRASS.spriteId, tileFor(MOSS, 0)])
      expect(idsAt(editor, 3, 1)).toStrictEqual([GRASS.spriteId, tileFor(MOSS, 0)])
    })

    await it('reports a plain tile edit as not touching terrain', async () => {
      const editor = makeEditor()
      setSpritesAt(editor, 5, 5, LAYER, [GRASS])
      const result = plan(editor, [{ kind: 'clear', x: 5, y: 5 }])
      // The routing signal: no terrain involved, so the caller keeps
      // the `tile.erase` it has always dispatched.
      expect(result.touchesTerrain).toBe(false)
    })

    await it('counts a plain tile dropped INTO a terrain as a terrain edit', async () => {
      const editor = makeEditor()
      for (let x = 1; x <= 3; x++) paint(editor, 'path', x, 1)
      const result = commit(editor, plan(editor, [{ kind: 'tile', x: 2, y: 1, sprite: GRASS }]))
      expect(result.touchesTerrain).toBe(true)
      // Stamping a flower into a path closes the path around it.
      expect(idsAt(editor, 2, 1)).toStrictEqual([GRASS.spriteId])
      expect(idsAt(editor, 1, 1)).toStrictEqual([tileFor(PATH, 0)])
      expect(idsAt(editor, 3, 1)).toStrictEqual([tileFor(PATH, 0)])
    })
  })

  await describe('planTerrainEdit — determinism (§7.1)', async () => {
    await it('plans the same cells whatever order the intents arrive in', async () => {
      const intents: TerrainPaintIntent[] = [
        { kind: 'terrain', x: 1, y: 1, terrain: { spriteSetId: SET, terrainId: 'path' } },
        { kind: 'terrain', x: 2, y: 1, terrain: { spriteSetId: SET, terrainId: 'path' } },
        { kind: 'terrain', x: 3, y: 1, terrain: { spriteSetId: SET, terrainId: 'path' } },
        { kind: 'terrain', x: 2, y: 2, terrain: { spriteSetId: SET, terrainId: 'path' } },
      ]
      const forwards = plan(makeEditor(), intents)
      const backwards = plan(makeEditor(), [...intents].reverse())
      // Resolution never changes membership, so the two passes commute;
      // the sort is what makes the PAYLOAD identical rather than merely
      // equivalent — and the payload is what the peer replays.
      expect(JSON.stringify(backwards.cells)).toBe(JSON.stringify(forwards.cells))
      expect(forwards.cells.map((cell) => `${cell.tileX},${cell.tileY}`)).toStrictEqual(['1,1', '2,1', '3,1', '2,2'])
    })
  })

  await describe('PaintCellsCommand — apply / revert against a scene', async () => {
    await it('restores every cell, including a two-sprite one', async () => {
      const fixture = makeScene()
      const editor = fixture.editor
      setSpritesAt(editor, 2, 2, LAYER, [GRASS])
      setSpritesAt(editor, 3, 2, LAYER, [GRASS])
      const before = snapshot(editor)

      const command = buildTerrainPaintCommand({
        editor,
        mapResource: fixture.mapResource,
        layerId: LAYER,
        tileX: 2,
        tileY: 2,
        bounds: BOUNDS,
        terrain: { spriteSetId: SET, terrainId: 'moss' },
      })
      if (!command) throw new Error('the fixture terrain should have produced a command')

      command.apply(fixture.scene)
      expect(idsAt(editor, 2, 2)).toStrictEqual([GRASS.spriteId, tileFor(MOSS, 0)])

      command.revert(fixture.scene)
      // Byte for byte, floor included — a revert that kept only the top
      // sprite would silently drop the grass.
      expect(snapshot(editor)).toStrictEqual(before)
    })

    await it('labels the step with the terrain, not a tile count', async () => {
      const fixture = makeScene()
      const command = buildTerrainPaintCommand({
        editor: fixture.editor,
        mapResource: fixture.mapResource,
        layerId: LAYER,
        tileX: 2,
        tileY: 2,
        bounds: BOUNDS,
        terrain: { spriteSetId: SET, terrainId: 'path' },
      })
      expect(command?.label).toBe('Paint path')
    })

    await it('declines the erase when the cell holds no terrain', async () => {
      const fixture = makeScene()
      setSpritesAt(fixture.editor, 2, 2, LAYER, [GRASS])
      // `null` is how the service says "not a terrain edit" — the
      // caller then dispatches the plain full-cell `tile.erase`.
      expect(
        buildTerrainEraseCommand({
          editor: fixture.editor,
          mapResource: fixture.mapResource,
          layerId: LAYER,
          tileX: 2,
          tileY: 2,
          bounds: BOUNDS,
        }),
      ).toBe(null)
    })
  })

  await describe('multi-sprite cells survive save → load (§10.1)', async () => {
    await it('keeps both sprites of a cell, in order', async () => {
      const fixture = makeScene()
      setSpritesAt(fixture.editor, 2, 2, LAYER, [GRASS, { spriteSetId: SET, spriteId: tileFor(MOSS, 0) }])

      // Save: the shadow read out into `LayerData.sprites`.
      const content = snapshotLayerContent(fixture.scene, LAYER)
      const saved = content?.layer.sprites ?? []
      expect(saved.map((sprite) => sprite.spriteId)).toStrictEqual([GRASS.spriteId, tileFor(MOSS, 0)])

      // Load: the same list back into a fresh shadow.
      const layer: LayerData = { ...fixture.layer, sprites: saved }
      const reloaded = collectInitialSprites(
        { ...fixture.mapData, layers: [layer] } as MapData,
        fixture.planes,
        () => ({
          solid: false,
        }),
      )
      const refs = reloaded.get('ground')?.get('2,2') ?? []
      // Order is the stacking order: floor first, terrain piece on top.
      // A load that folded the cell to one sprite would make the
      // overlay rule hold only until the file is reopened.
      expect(refs.map((ref) => ref.spriteId)).toStrictEqual([GRASS.spriteId, tileFor(MOSS, 0)])
      expect(refs.every((ref) => ref.layerId === LAYER)).toBe(true)
    })
  })
}

/** A deep, order-preserving copy of the shadow — what `toStrictEqual` compares. */
function snapshot(editor: MapEditorComponent): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const [key, refs] of Object.entries(editor.sprites)) out[key] = refs.map((ref) => ({ ...ref }))
  return out
}

interface SceneFixture {
  scene: MapScene
  mapResource: MapResource
  editor: MapEditorComponent
  planes: Map<LayerPlane, TileMap>
  layer: LayerData
  mapData: MapData
}

/**
 * A duck-typed `MapScene` (via `Object.create`, so `instanceof` holds
 * without the constructor's engine wiring) with ONE ground-plane
 * tilemap carrying the terrains above.
 */
function makeScene(): SceneFixture {
  const spriteSet = {
    sprites: Object.fromEntries(
      [...Object.values(PATH.tiles), ...Object.values(MOSS.tiles), ...Object.values(POND.tiles), GRASS.spriteId].map(
        (id) => [id, { clone: () => ({}) }],
      ),
    ),
    animations: {},
    data: { terrains: [PATH, MOSS, POND] } as SpriteSetData,
  }
  const layer: LayerData = { id: LAYER, name: 'Ground', visible: true, plane: 'ground' } as LayerData
  const mapData = {
    name: 'fixture',
    columns: BOUNDS.columns,
    rows: BOUNDS.rows,
    tileWidth: 16,
    tileHeight: 16,
    layers: [layer],
    spriteSets: [{ id: SET, firstGid: 1 }],
    objectPlacements: [],
  } as unknown as MapData

  const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: BOUNDS.columns, rows: BOUNDS.rows })
  tileMap.addComponent(new TileMapPlaneComponent('ground'))
  const editor = new MapEditorComponent()
  tileMap.addComponent(editor)

  const mapResource = {
    mapData,
    getSpriteSetResource: () => spriteSet,
    getAllSpriteSetResources: () => new Map([[SET, spriteSet]]),
    refreshTileSolidFromEditor: () => {},
    // biome-ignore lint/suspicious/noExplicitAny: test stub mirrors only the surface the planner + commands exercise
  } as any as MapResource

  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, { mapResource, world: { entityManager: { entities: [tileMap] } } })

  return { scene, mapResource, editor, planes: new Map<LayerPlane, TileMap>([['ground', tileMap]]), layer, mapData }
}
