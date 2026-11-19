/**
 * What a stroke owes the map it painted on.
 *
 * `StrokeSession` is the half of TERRAIN T7 that cannot be checked by
 * reading it: it paints into the live shadow as the finger moves and
 * keeps, on the side, enough of the BEFORE state to either turn the
 * whole drag into one command or put everything back. Three properties
 * carry that, and each has a way of going wrong that the types cannot
 * catch:
 *
 * 1. A cell crossed twice must snapshot ONCE. Snapshot per visit and
 *    the second visit records the first visit's paint as "before" —
 *    the stroke then reverts to its own output and the second finger
 *    leaves half the paint behind.
 * 2. `toCommand` must describe the result, cell for cell, including
 *    the neighbours a terrain brush re-resolved rather than only the
 *    origins the pointer crossed.
 * 3. A stroke that ends where it started changes nothing and must
 *    produce NO command, or the undo stack fills with entries that
 *    undo nothing.
 */

import { describe, expect, it } from '@gjsify/unit'
import { type Entity, TileMap } from 'excalibur'

import { PaintCellsCommand } from '../commands/paint-tile.command.ts'
import type { Command } from '../commands/types.ts'
import { MapEditorComponent, type TileSpriteRef } from '../components/map-editor.component.ts'
import { TileMapPlaneComponent } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { getSpritesAt, setSpritesAt } from './map-editor-shadow.service.ts'
import { StrokeSession } from './stroke-session.ts'

const LAYER = 'ground-layer'
const SET = 'sheet'

interface Harness {
  scene: MapScene
  editor: MapEditorComponent
  tileMap: TileMap
}

/**
 * A realised 4×4 ground plane and nothing else. `PaintCellsCommand`
 * resolves its target through `findTileMapForLayer`, so the scene has
 * to be a real `MapScene` (hence `Object.create`) carrying a tilemap
 * with both the plane and the editor component. The sprite set is
 * deliberately absent: `rebuildAllTileGraphics` then resolves no
 * graphic and the test exercises the shadow writes, which are what the
 * stroke reads back.
 */
function makeHarness(): Harness {
  const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 })
  tileMap.addComponent(new TileMapPlaneComponent('ground'))
  const editor = new MapEditorComponent()
  tileMap.addComponent(editor)
  const mapResource = {
    mapData: {
      id: 'm1',
      columns: 4,
      rows: 4,
      layers: [{ id: LAYER, name: 'Ground', visible: true, plane: 'ground' }],
      objectPlacements: [],
    },
    getSpriteSetResource: () => undefined,
    refreshTileSolidFromEditor: () => {},
    // biome-ignore lint/suspicious/noExplicitAny: stub mirrors only what the write path reads
  } as any as MapResource
  const entities: Entity[] = [tileMap]
  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, { mapResource, world: { entityManager: { entities } } })
  return { scene, editor, tileMap }
}

/** Put one sprite on a cell without going through a command. */
function seed(editor: MapEditorComponent, tileX: number, tileY: number, spriteId: number): void {
  setSpritesAt(editor, tileX, tileY, LAYER, [{ spriteSetId: SET, spriteId }])
}

/** What is on a cell now, as a comparable string (`@gjsify/unit` has no deep array compare). */
function spritesOf(editor: MapEditorComponent, tileX: number, tileY: number): string {
  return getSpritesAt(editor, tileX, tileY, LAYER)
    .map((ref: TileSpriteRef) => ref.spriteId)
    .join(',')
}

/**
 * The command a single brush application produces — the same shape
 * `buildBrushCommand` hands the session, built here so the test does
 * not need the planner or an armed brush.
 */
function paintCells(cells: Array<{ tileX: number; tileY: number; spriteId: number | null }>): Command {
  return new PaintCellsCommand({
    layerId: LAYER,
    label: { verb: 'paint' },
    cells: cells.map((cell) => ({
      tileX: cell.tileX,
      tileY: cell.tileY,
      sprites: cell.spriteId === null ? [] : [{ spriteSetId: SET, spriteId: cell.spriteId }],
      // The session snapshots the real prior state itself; what a
      // single application claims here is never read back.
      previousSprites: [],
    })),
  })
}

export default async () => {
  await describe('StrokeSession.claim — one brush application per cell', async () => {
    await it('refuses a cell this stroke has already painted', async () => {
      const { scene, editor } = makeHarness()
      const stroke = new StrokeSession(scene, editor, LAYER, { verb: 'paint' })
      expect(stroke.claim(1, 1)).toBe(true)
      // A finger wobbling inside one cell reports many positions; each
      // would otherwise re-plan and re-paint the same brush.
      expect(stroke.claim(1, 1)).toBe(false)
      expect(stroke.claim(2, 1)).toBe(true)
    })

    await it('reports the last claimed cell as the origin', async () => {
      const { scene, editor } = makeHarness()
      const stroke = new StrokeSession(scene, editor, LAYER, { verb: 'paint' })
      expect(stroke.lastOrigin).toBe(null)
      stroke.claim(0, 0)
      stroke.claim(3, 2)
      // The closing TILE_PLACED fires here — the cell the finger left.
      expect(`${stroke.lastOrigin?.x},${stroke.lastOrigin?.y}`).toBe('3,2')
    })
  })

  await describe('StrokeSession.apply — the preview is the paint', async () => {
    await it('writes the brush straight into the shadow', async () => {
      const { scene, editor } = makeHarness()
      const stroke = new StrokeSession(scene, editor, LAYER, { verb: 'paint' })
      stroke.claim(1, 1)
      expect(stroke.apply(paintCells([{ tileX: 1, tileY: 1, spriteId: 7 }]))).toBe(true)
      // Not an overlay: the cell the planner will read next is already
      // the painted one.
      expect(spritesOf(editor, 1, 1)).toBe('7')
    })

    await it('refuses a command with no footprint rather than painting blind', async () => {
      const { scene, editor } = makeHarness()
      const stroke = new StrokeSession(scene, editor, LAYER, { verb: 'paint' })
      // Paint this session cannot snapshot is paint it cannot take
      // back when the second finger lands.
      const footprintless = {
        kind: 'x',
        label: 'x',
        payload: {},
        apply: () => {},
        revert: () => {},
      } as unknown as Command
      expect(stroke.apply(footprintless)).toBe(false)
      expect(stroke.isEmpty).toBe(true)
    })
  })

  await describe('StrokeSession.toCommand — the whole drag as one entry', async () => {
    await it('collects every cell the stroke touched, origins and neighbours alike', async () => {
      const { scene, editor } = makeHarness()
      const stroke = new StrokeSession(scene, editor, LAYER, { verb: 'paint' })
      stroke.claim(1, 1)
      stroke.apply(paintCells([{ tileX: 1, tileY: 1, spriteId: 7 }]))
      stroke.claim(2, 1)
      // A terrain brush's second origin re-resolves its neighbour, so
      // the command has to carry a cell the pointer never claimed.
      stroke.apply(
        paintCells([
          { tileX: 2, tileY: 1, spriteId: 8 },
          { tileX: 1, tileY: 1, spriteId: 9 },
        ]),
      )

      const command = stroke.toCommand()
      expect(command?.payload.cells.length).toBe(2)
      expect(
        command?.payload.cells
          .map((cell) => `${cell.tileX},${cell.tileY}:${cell.sprites.map((s) => s.spriteId).join('+')}`)
          .sort()
          .join(' '),
      ).toBe('1,1:9 2,1:8')
    })

    await it('snapshots a re-crossed cell once, from before the finger went down', async () => {
      const { scene, editor } = makeHarness()
      seed(editor, 1, 1, 3)
      const stroke = new StrokeSession(scene, editor, LAYER, { verb: 'paint' })
      stroke.claim(1, 1)
      stroke.apply(paintCells([{ tileX: 1, tileY: 1, spriteId: 7 }]))
      // Second visit: re-snapshotting here would record 7 as "before"
      // and the undo would stop at the stroke's own first pass.
      stroke.apply(paintCells([{ tileX: 1, tileY: 1, spriteId: 9 }]))

      const cell = stroke.toCommand()?.payload.cells[0]
      expect(cell?.previousSprites.map((s) => s.spriteId).join(',')).toBe('3')
    })

    await it('produces nothing when the stroke ends where it started', async () => {
      const { scene, editor } = makeHarness()
      seed(editor, 1, 1, 3)
      const stroke = new StrokeSession(scene, editor, LAYER, { verb: 'paint' })
      stroke.claim(1, 1)
      stroke.apply(paintCells([{ tileX: 1, tileY: 1, spriteId: 7 }]))
      stroke.apply(paintCells([{ tileX: 1, tileY: 1, spriteId: 3 }]))
      // The cells were written, so `isEmpty` is false — but the result
      // equals the start, and an undo entry for it would undo nothing.
      expect(stroke.isEmpty).toBe(false)
      expect(stroke.toCommand()).toBe(null)
    })

    await it('carries the label the first cell fixed, for the whole stroke', async () => {
      const { scene, editor } = makeHarness()
      const stroke = new StrokeSession(scene, editor, LAYER, {
        verb: 'paint',
        terrain: { spriteSetId: SET, terrainId: 'water' },
      })
      stroke.claim(1, 1)
      stroke.apply(paintCells([{ tileX: 1, tileY: 1, spriteId: 7 }]))
      stroke.claim(2, 1)
      stroke.apply(paintCells([{ tileX: 2, tileY: 1, spriteId: 8 }]))
      // "Paint water", not "Paint 2 tiles" and not one label per cell.
      expect(stroke.toCommand()?.label).toBe('Paint water')
    })
  })

  await describe('StrokeSession.revert — the second finger', async () => {
    await it('restores every touched cell, painted and erased alike', async () => {
      const { scene, editor } = makeHarness()
      seed(editor, 1, 1, 3)
      seed(editor, 2, 1, 4)
      const stroke = new StrokeSession(scene, editor, LAYER, { verb: 'paint' })
      stroke.claim(1, 1)
      stroke.apply(paintCells([{ tileX: 1, tileY: 1, spriteId: 7 }]))
      stroke.claim(2, 1)
      // An eraser's cell goes to the empty list, which reverts through
      // the other branch of `writeCellSprites`.
      stroke.apply(paintCells([{ tileX: 2, tileY: 1, spriteId: null }]))
      stroke.claim(3, 1)
      stroke.apply(paintCells([{ tileX: 3, tileY: 1, spriteId: 9 }]))

      stroke.revert()

      expect(spritesOf(editor, 1, 1)).toBe('3')
      expect(spritesOf(editor, 2, 1)).toBe('4')
      // A cell that was empty before the stroke goes back to empty.
      expect(spritesOf(editor, 3, 1)).toBe('')
    })

    await it('leaves the session spent, so a late commit dispatches nothing', async () => {
      const { scene, editor } = makeHarness()
      const stroke = new StrokeSession(scene, editor, LAYER, { verb: 'paint' })
      stroke.claim(1, 1)
      stroke.apply(paintCells([{ tileX: 1, tileY: 1, spriteId: 7 }]))
      stroke.revert()
      expect(stroke.isEmpty).toBe(true)
      expect(stroke.toCommand()).toBe(null)
    })
  })
}
