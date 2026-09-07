/**
 * The fill and eraser hover previews, driven through `HoverOverlays`
 * against one headless scene, and compared with what the click builds
 * from the same scene — the property that makes them previews rather
 * than pictures: what is shown is what happens.
 */

import { describe, expect, it } from '@gjsify/unit'
import { type Actor, type Entity, EventEmitter, type Scene, TileMap } from 'excalibur'

import { ActiveLayerComponent } from '../components/active-layer.component.ts'
import { ActiveTileComponent } from '../components/active-tile.component.ts'
import { ActiveToolComponent, type EditorTool } from '../components/active-tool.component.ts'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileMapPlaneComponent } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { previewedErase } from '../services/eraser-preview.ts'
import { previewedFillRegion } from '../services/fill-preview.ts'
import type { GridCell } from '../services/flood-fill.ts'
import { setSpritesAt } from '../services/map-editor-shadow.service.ts'
import { buildTileFillCommand } from '../services/tile-fill.service.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { HoverOverlays } from './hover-overlays.ts'

const LAYER = 'ground'
const COLUMNS = 6
const ROWS = 4
/** Global ids: sprite set `tiles` starts at gid 1, so local sprite `n` is global `n + 1`. */
const WALL_TILE = 2
const FILL_TILE = 3
const ISLAND_TILE = 1

interface Fixture {
  scene: MapScene
  tileMap: TileMap
  editor: MapEditorComponent
  mapResource: MapResource
  events: EventEmitter<EngineEventMap>
  overlays: HoverOverlays
  fillActor: Actor
  eraserActor: Actor
  layer: { id: string; locked: boolean }
}

/**
 * A 6 × 4 map with one ground layer. A wall of `WALL_TILE` runs down
 * column 3 for rows 0–2, leaving (3, 3) open, so the empty region on
 * the left wraps around the bottom to the right side. Cell (1, 1)
 * holds `ISLAND_TILE` — a one-cell region of its own.
 */
function makeFixture(): Fixture {
  const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: COLUMNS, rows: ROWS })
  tileMap.addComponent(new TileMapPlaneComponent('ground'))
  const editor = new MapEditorComponent()
  tileMap.addComponent(editor)
  for (const y of [0, 1, 2]) setSpritesAt(editor, 3, y, LAYER, [{ spriteSetId: 'tiles', spriteId: WALL_TILE - 1 }])
  setSpritesAt(editor, 1, 1, LAYER, [{ spriteSetId: 'tiles', spriteId: ISLAND_TILE - 1 }])

  const layer = { id: LAYER, name: 'Ground', visible: true, plane: 'ground', locked: false }
  const mapResource = {
    mapData: {
      id: 'm1',
      columns: COLUMNS,
      rows: ROWS,
      tileWidth: 16,
      tileHeight: 16,
      spriteSets: [{ id: 'tiles', firstGid: 1 }],
      layers: [layer],
      objectPlacements: [],
    },
    getFirstLayerId: () => LAYER,
    getAllSpriteSetResources: () => new Map([['tiles', { sprites: { 0: {}, 1: {}, 2: {}, 3: {} } }]]),
    // The pencil ghost asks for the armed tile's sprite; none resolves here, so it stays hidden.
    getSpriteSetResource: () => null,
    // biome-ignore lint/suspicious/noExplicitAny: stub mirrors only what the preview + click read
  } as any as MapResource

  const entities: Entity[] = [tileMap]
  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource,
    entityLibrary: [],
    add(entity: Entity) {
      entities.push(entity)
    },
    world: { entityManager: { entities } },
  })

  const events = new EventEmitter<EngineEventMap>()
  const overlays = new HoverOverlays()
  overlays.attach(scene as unknown as Scene, events)
  const actorNamed = (name: string) => entities.find((e) => e.name === name) as Actor
  return {
    scene,
    tileMap,
    editor,
    mapResource,
    events,
    overlays,
    fillActor: actorNamed('fill-region-preview'),
    eraserActor: actorNamed('eraser-preview'),
    layer,
  }
}

function arm(f: Fixture, tool: EditorTool, tileId?: number): void {
  SessionState.set(f.scene, new ActiveToolComponent(tool))
  SessionState.set(f.scene, new ActiveLayerComponent(LAYER))
  if (tileId !== undefined) SessionState.set(f.scene, new ActiveTileComponent(tileId))
}

function hover(f: Fixture, x: number, y: number): void {
  f.overlays.setHover({ tileMap: f.tileMap, coords: { x, y } })
}

function keys(cells: readonly GridCell[]): string[] {
  return cells.map((c) => `${c.x},${c.y}`).sort()
}

/** The cells the CLICK would repaint from `(x, y)` — the same builder `TileEditorSystem.applyFill` uses. */
function clickRegion(f: Fixture, x: number, y: number, tileId: number): GridCell[] | null {
  const bounds = { columns: COLUMNS, rows: ROWS }
  const command = buildTileFillCommand(f.editor, f.mapResource, bounds, LAYER, x, y, tileId)
  return command ? command.payload.cells.map((c) => ({ x: c.tileX, y: c.tileY })) : null
}

export default async () => {
  await describe('fill preview — shows the region the click would repaint', async () => {
    await it('outlines exactly the cells buildTileFillCommand would repaint', async () => {
      const f = makeFixture()
      arm(f, 'fill', FILL_TILE)
      hover(f, 0, 0)
      const shown = previewedFillRegion(f.fillActor)
      const clicked = clickRegion(f, 0, 0, FILL_TILE)
      expect(shown).not.toBe(null)
      expect(clicked).not.toBe(null)
      expect(keys(shown ?? [])).toStrictEqual(keys(clicked ?? []))
      // The empty region wraps around the wall: 24 cells − 3 wall − 1 island.
      expect(shown?.length).toBe(20)
    })

    await it('shows a one-cell region for a bounded tile', async () => {
      const f = makeFixture()
      arm(f, 'fill', FILL_TILE)
      hover(f, 1, 1)
      expect(keys(previewedFillRegion(f.fillActor) ?? [])).toStrictEqual(['1,1'])
      expect(keys(clickRegion(f, 1, 1, FILL_TILE) ?? [])).toStrictEqual(['1,1'])
    })

    await it('shows nothing where the click would be a no-op (origin already shows the fill tile)', async () => {
      const f = makeFixture()
      arm(f, 'fill', ISLAND_TILE)
      hover(f, 1, 1)
      expect(previewedFillRegion(f.fillActor)).toBe(null)
      expect(clickRegion(f, 1, 1, ISLAND_TILE)).toBe(null)
    })

    await it('is hidden without an armed tile, on other tools, and on a locked layer', async () => {
      const f = makeFixture()
      arm(f, 'fill')
      hover(f, 0, 0)
      expect(previewedFillRegion(f.fillActor)).toBe(null)

      // `'select'` is left out: its border rasterises an Excalibur `Rectangle`, which needs a DOM canvas the node leg lacks.
      for (const tool of ['pencil', 'eraser', 'eyedropper', 'object'] as const) {
        arm(f, tool, FILL_TILE)
        hover(f, 0, 0)
        expect(previewedFillRegion(f.fillActor)).toBe(null)
      }

      arm(f, 'fill', FILL_TILE)
      hover(f, 0, 0)
      expect(previewedFillRegion(f.fillActor)).not.toBe(null)
      f.layer.locked = true
      f.events.emit(EngineEvent.LAYER_FLAG_CHANGED, { layerId: LAYER, flag: 'locked', value: true })
      expect(previewedFillRegion(f.fillActor)).toBe(null)
      f.layer.locked = false
      f.events.emit(EngineEvent.LAYER_FLAG_CHANGED, { layerId: LAYER, flag: 'locked', value: false })
      expect(previewedFillRegion(f.fillActor)).not.toBe(null)
    })

    await it('vanishes after the click repaints the region, without the pointer moving', async () => {
      const f = makeFixture()
      arm(f, 'fill', FILL_TILE)
      hover(f, 0, 0)
      const region = clickRegion(f, 0, 0, FILL_TILE) ?? []
      // What FillTileCommand.apply does to the shadow, cell by cell.
      for (const { x, y } of region)
        setSpritesAt(f.editor, x, y, LAYER, [{ spriteSetId: 'tiles', spriteId: FILL_TILE - 1 }])
      f.events.emit(EngineEvent.COMMAND_EXECUTED, { command: { kind: 'tile.fill' } as never })
      expect(previewedFillRegion(f.fillActor)).toBe(null)
      // And on undo the region is back — still without pointer motion.
      for (const { x, y } of region) setSpritesAt(f.editor, x, y, LAYER, [])
      f.events.emit(EngineEvent.COMMAND_REVERTED, { command: { kind: 'tile.fill' } as never })
      expect(keys(previewedFillRegion(f.fillActor) ?? [])).toStrictEqual(keys(region))
    })

    await it('reuses the computed region while the pointer stays inside it', async () => {
      const f = makeFixture()
      arm(f, 'fill', FILL_TILE)
      hover(f, 0, 0)
      const first = f.fillActor.graphics.current
      hover(f, 5, 3) // far side of the same wrapped region
      expect(f.fillActor.graphics.current).toBe(first)
      hover(f, 1, 1) // the island: a different region
      expect(f.fillActor.graphics.current).not.toBe(first)
      hover(f, 2, 2) // back in the big region: recomputed, not the island's graphic
      expect(f.fillActor.graphics.current).not.toBe(first)
      expect(previewedFillRegion(f.fillActor)?.length).toBe(20)
    })

    await it('follows a layer switch without pointer motion', async () => {
      const f = makeFixture()
      arm(f, 'fill', FILL_TILE)
      hover(f, 0, 0)
      expect(previewedFillRegion(f.fillActor)?.length).toBe(20)
      // A layer the map does not have: the click would be refused (no plane tilemap).
      SessionState.set(f.scene, new ActiveLayerComponent('gone'))
      expect(previewedFillRegion(f.fillActor)).toBe(null)
      SessionState.set(f.scene, new ActiveLayerComponent(LAYER))
      expect(previewedFillRegion(f.fillActor)?.length).toBe(20)
    })
  })

  await describe('eraser preview — shows the cell the click would clear', async () => {
    await it('promises a removal only where the active layer has sprites', async () => {
      const f = makeFixture()
      arm(f, 'eraser')
      hover(f, 1, 1)
      expect(previewedErase(f.eraserActor)).toBe(true)
      hover(f, 0, 0)
      expect(previewedErase(f.eraserActor)).toBe(false)
      expect(f.eraserActor.pos.x).toBe(0)
      expect(f.eraserActor.pos.y).toBe(0)
      hover(f, 3, 2)
      expect(previewedErase(f.eraserActor)).toBe(true)
      expect(f.eraserActor.pos.x).toBe(48)
      expect(f.eraserActor.pos.y).toBe(32)
    })

    await it('reads the ACTIVE layer, not the whole cell', async () => {
      const f = makeFixture()
      // A sprite on another layer at (0, 0): the eraser leaves it alone.
      setSpritesAt(f.editor, 0, 0, 'other', [{ spriteSetId: 'tiles', spriteId: 0 }])
      arm(f, 'eraser')
      hover(f, 0, 0)
      expect(previewedErase(f.eraserActor)).toBe(false)
    })

    await it('is hidden on other tools and on a locked layer', async () => {
      const f = makeFixture()
      // `'select'` is left out: its border rasterises an Excalibur `Rectangle`, which needs a DOM canvas the node leg lacks.
      for (const tool of ['pencil', 'fill', 'eyedropper', 'object'] as const) {
        arm(f, tool, FILL_TILE)
        hover(f, 1, 1)
        expect(previewedErase(f.eraserActor)).toBe(null)
      }
      arm(f, 'eraser')
      hover(f, 1, 1)
      expect(previewedErase(f.eraserActor)).toBe(true)
      f.layer.locked = true
      f.events.emit(EngineEvent.LAYER_FLAG_CHANGED, { layerId: LAYER, flag: 'locked', value: true })
      expect(previewedErase(f.eraserActor)).toBe(null)
    })

    await it('turns grey after the click cleared the cell, without the pointer moving', async () => {
      const f = makeFixture()
      arm(f, 'eraser')
      hover(f, 1, 1)
      expect(previewedErase(f.eraserActor)).toBe(true)
      setSpritesAt(f.editor, 1, 1, LAYER, []) // what EraseTileCommand.apply does to the shadow
      f.events.emit(EngineEvent.COMMAND_EXECUTED, { command: { kind: 'tile.erase' } as never })
      expect(previewedErase(f.eraserActor)).toBe(false)
    })
  })

  await describe('overlays off the map and on the eyedropper', async () => {
    await it('hides every overlay when the pointer leaves the map or the eyedropper is picked', async () => {
      const f = makeFixture()
      arm(f, 'fill', FILL_TILE)
      hover(f, 0, 0)
      expect(previewedFillRegion(f.fillActor)).not.toBe(null)
      f.overlays.setHover(null)
      expect(previewedFillRegion(f.fillActor)).toBe(null)
      expect(previewedErase(f.eraserActor)).toBe(null)

      arm(f, 'eyedropper', FILL_TILE)
      hover(f, 1, 1)
      expect(previewedFillRegion(f.fillActor)).toBe(null)
      expect(previewedErase(f.eraserActor)).toBe(null)
    })
  })
}
