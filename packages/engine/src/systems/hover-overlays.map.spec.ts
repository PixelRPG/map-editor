/**
 * The preview / click equality on a SHIPPED map.
 *
 * `hover-overlays.spec.ts` proves the wiring on a 6 × 4 grid; this
 * suite drives the same overlays over `games/zelda-like/maps/
 * kokiri-forest.json` (176 × 148, 16,517 ground sprites) and asserts,
 * origin by origin, that the cells the fill preview highlights are the
 * cells the click repaints — and for the eraser, that what the preview
 * promises is what the erase removes. This is the invariant a second
 * flood-fill traversal would break.
 *
 * Named origins cover the shapes a screenshot never reaches together —
 * a region with a hole, a region bounded by the map edge, an isolated
 * cell, a no-op click, a locked layer — and diff the SHADOW the real
 * command wrote, not its payload. A sweep over every region of both
 * painted layers then compares the preview with the click builder's
 * cell list (the list `FillTileCommand.apply` iterates), which keeps the
 * whole map's worth of regions under a second.
 */

import { describe, expect, it } from '@gjsify/unit'
import { type Actor, type Entity, EventEmitter, type Scene, TileMap } from 'excalibur'

import kokiri from '../../../../games/zelda-like/maps/kokiri-forest.json' with { type: 'json' }
import { ActiveLayerComponent } from '../components/active-layer.component.ts'
import { ActiveTileComponent } from '../components/active-tile.component.ts'
import { ActiveToolComponent } from '../components/active-tool.component.ts'
import { MapEditorComponent, type TileSpriteRef } from '../components/map-editor.component.ts'
import { TileMapPlaneComponent } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { previewedErase } from '../services/eraser-preview.ts'
import { previewedFillRegion } from '../services/fill-preview.ts'
import type { GridCell } from '../services/flood-fill.ts'
import { getSpritesAt, setInitialSprites, setSpritesAt } from '../services/map-editor-shadow.service.ts'
import { computeRegionBounds } from '../services/region-geometry.ts'
import { resolveEditLayer } from '../services/tile-edit-target.ts'
import { buildTileFillCommand } from '../services/tile-fill.service.ts'
import { findTileMapForLayer, makeTilePaintCommand, snapshotPreviousSprites } from '../services/tile-paint.service.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { HoverOverlays } from './hover-overlays.ts'

const GROUND = 'layer_ground'
const OVERLAY = 'layer_overlay'
/** `lokiri-forest` starts at gid 1 (sprite 257 = sand), `water` at gid 1025 (sprite 24 = deep water). */
const SAND = 258
const DEEP_WATER = 1049
const COLUMNS = kokiri.columns
const ROWS = kokiri.rows

interface Fixture {
  scene: MapScene
  tileMap: TileMap
  editor: MapEditorComponent
  mapResource: MapResource
  events: EventEmitter<EngineEventMap>
  overlays: HoverOverlays
  fillActor: Actor
  eraserActor: Actor
  layer: { locked?: boolean }
}

/** A sprite index with `span` truthy entries — all `findSpriteInfoForTileId` reads of a sprite set. */
function spriteTable(span: number): { sprites: Record<number, object> } {
  const sprites: Record<number, object> = {}
  for (let i = 0; i < span; i++) sprites[i] = {}
  return { sprites }
}

/**
 * One tilemap per plane the map uses, each holding its layers' refs —
 * what `buildPlaneTileMaps` + the shadow routing produce for the real
 * scene, so `findTileMapForLayer` resolves every layer under test.
 */
function makeFixture(): Fixture {
  const planes = new Map<string, { tileMap: TileMap; editor: MapEditorComponent; refs: Map<string, TileSpriteRef[]> }>()
  for (const layer of kokiri.layers) {
    const plane = layer.plane ?? 'ground'
    let entry = planes.get(plane)
    if (!entry) {
      const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: COLUMNS, rows: ROWS })
      tileMap.addComponent(new TileMapPlaneComponent(plane as 'ground'))
      const editor = new MapEditorComponent()
      tileMap.addComponent(editor)
      entry = { tileMap, editor, refs: new Map() }
      planes.set(plane, entry)
    }
    for (const s of layer.sprites ?? []) {
      const key = `${s.x},${s.y}`
      const refs = entry.refs.get(key) ?? []
      refs.push({ spriteSetId: s.spriteSetId, spriteId: s.spriteId, layerId: layer.id })
      entry.refs.set(key, refs)
    }
  }
  for (const { editor, refs } of planes.values()) setInitialSprites(editor, refs)
  const ground = planes.get('ground')
  if (!ground) throw new Error('kokiri-forest has no ground-plane layer')
  const { tileMap, editor } = ground

  // Layers keep a live `locked` flag the lock case flips; sprites are
  // dropped from the data — the shadow above is the editor's copy.
  const layers = kokiri.layers.map((l) => ({
    id: l.id,
    name: l.name,
    visible: l.visible,
    plane: l.plane,
    locked: false,
  }))
  const mapResource = {
    mapData: {
      id: kokiri.id,
      columns: COLUMNS,
      rows: ROWS,
      tileWidth: kokiri.tileWidth,
      tileHeight: kokiri.tileHeight,
      spriteSets: kokiri.spriteSets,
      layers,
      objectPlacements: [],
    },
    getFirstLayerId: () => GROUND,
    getAllSpriteSetResources: () =>
      new Map([
        ['lokiri-forest', spriteTable(32 * 32)],
        ['water', spriteTable(6 * 5)],
      ]),
    // No graphics in a headless apply: the tile rebuild skips a set it cannot resolve.
    getSpriteSetResource: () => undefined,
    refreshTileSolidFromEditor: () => {},
    // biome-ignore lint/suspicious/noExplicitAny: stub carries only what the preview + commands read
  } as any as MapResource

  const entities: Entity[] = [...planes.values()].map((p) => p.tileMap)
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
  SessionState.set(scene, new ActiveLayerComponent(GROUND))
  return {
    scene,
    tileMap,
    editor,
    mapResource,
    events,
    overlays,
    fillActor: actorNamed('fill-region-preview'),
    eraserActor: actorNamed('eraser-preview'),
    layer: layers[0],
  }
}

const key = (c: GridCell) => `${c.x},${c.y}`
const keys = (cells: readonly GridCell[]) => new Set(cells.map(key))
const sameCells = (a: readonly GridCell[], b: readonly GridCell[]) => {
  const ka = keys(a)
  const kb = keys(b)
  return ka.size === kb.size && [...ka].every((k) => kb.has(k))
}

function groundSignature(editor: MapEditorComponent, x: number, y: number): string {
  return getSpritesAt(editor, x, y, GROUND)
    .map((r) => `${r.spriteSetId}#${r.spriteId}`)
    .join('|')
}

/** The ground signature of every occupied cell — cheap to diff, independent of any command payload. */
function groundSnapshot(editor: MapEditorComponent): Map<string, string> {
  const snapshot = new Map<string, string>()
  for (const k of Object.keys(editor.sprites)) {
    const comma = k.indexOf(',')
    const sig = groundSignature(editor, Number(k.slice(0, comma)), Number(k.slice(comma + 1)))
    if (sig) snapshot.set(k, sig)
  }
  return snapshot
}

/** Cells whose ground signature differs between two snapshots. */
function changedCells(before: Map<string, string>, after: Map<string, string>): GridCell[] {
  const changed: GridCell[] = []
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(k) !== after.get(k)) {
      const comma = k.indexOf(',')
      changed.push({ x: Number(k.slice(0, comma)), y: Number(k.slice(comma + 1)) })
    }
  }
  return changed
}

function armFill(f: Fixture, tileId: number, x: number, y: number): readonly GridCell[] | null {
  SessionState.set(f.scene, new ActiveToolComponent('fill'))
  SessionState.set(f.scene, new ActiveTileComponent(tileId))
  f.overlays.setHover({ tileMap: f.tileMap, coords: { x, y } })
  return previewedFillRegion(f.fillActor)
}

/** Run the click's command against the shadow and return the cells it changed; the command is reverted afterwards. */
function clickFill(f: Fixture, tileId: number, x: number, y: number): { painted: GridCell[]; noop: boolean } {
  const bounds = { columns: COLUMNS, rows: ROWS }
  const command = buildTileFillCommand(f.editor, f.mapResource, bounds, GROUND, x, y, tileId)
  if (!command) return { painted: [], noop: true }
  const before = groundSnapshot(f.editor)
  command.apply(f.scene as unknown as Scene)
  const painted = changedCells(before, groundSnapshot(f.editor))
  // Every painted cell now shows the fill tile — the SAME sprite the badge shows.
  const expected = tileId === SAND ? 'lokiri-forest#257' : 'water#24'
  expect(painted.every((c) => groundSignature(f.editor, c.x, c.y) === expected)).toBe(true)
  command.revert(f.scene as unknown as Scene)
  expect(changedCells(before, groundSnapshot(f.editor)).length).toBe(0)
  return { painted, noop: false }
}

export default async () => {
  await describe('fill preview = fill click, on kokiri-forest', async () => {
    await it('a pond with an island: the preview outlines the water and leaves the hole, and so does the click', async () => {
      const f = makeFixture()
      const shown = armFill(f, SAND, 88, 39)
      expect(shown).not.toBe(null)
      const region = shown ?? []
      const bounds = computeRegionBounds(region)
      // The island sits inside the bounding box but outside the region.
      expect(bounds).toStrictEqual({ x: 83, y: 39, width: 13, height: 14 })
      expect(keys(region).has('88,45')).toBe(false)
      expect(region.every((c) => groundSignature(f.editor, c.x, c.y) === 'water#24')).toBe(true)
      const { painted } = clickFill(f, SAND, 88, 39)
      expect(painted.length).toBe(region.length)
      expect(sameCells(painted, region)).toBe(true)
    })

    await it('the empty margin: a 9,806-cell region bounded by the map edge, previewed and painted alike', async () => {
      const f = makeFixture()
      const region = armFill(f, SAND, 2, 30) ?? []
      expect(region.length).toBeGreaterThan(5000)
      expect(computeRegionBounds(region)).toStrictEqual({ x: 0, y: 0, width: COLUMNS, height: ROWS })
      expect(region.some((c) => c.x === 0)).toBe(true)
      expect(region.some((c) => c.x === COLUMNS - 1)).toBe(true)
      expect(region.some((c) => c.y === ROWS - 1)).toBe(true)
      const { painted } = clickFill(f, SAND, 2, 30)
      expect(sameCells(painted, region)).toBe(true)
    })

    await it('an isolated cell: a one-cell preview and a one-cell paint', async () => {
      const f = makeFixture()
      expect(groundSignature(f.editor, 38, 20)).toBe('lokiri-forest#257')
      const region = armFill(f, DEEP_WATER, 38, 20) ?? []
      expect([...keys(region)]).toStrictEqual(['38,20'])
      const { painted } = clickFill(f, DEEP_WATER, 38, 20)
      expect([...keys(painted)]).toStrictEqual(['38,20'])
    })

    await it('a cell that already shows the armed tile: no preview, and the click does nothing', async () => {
      const f = makeFixture()
      expect(armFill(f, SAND, 38, 20)).toBe(null)
      expect(clickFill(f, SAND, 38, 20).noop).toBe(true)
    })

    await it('a locked layer: no preview, and the click is refused', async () => {
      const f = makeFixture()
      expect(armFill(f, SAND, 88, 39)).not.toBe(null)
      f.layer.locked = true
      f.events.emit(EngineEvent.LAYER_FLAG_CHANGED, { layerId: GROUND, flag: 'locked', value: true })
      expect(previewedFillRegion(f.fillActor)).toBe(null)
      const verdict = resolveEditLayer({
        assistantPause: { mode: 'skip' },
        hasActiveMap: true,
        requestedLayerId: null,
        activeLayerId: GROUND,
        isLayerLocked: (id) => id === GROUND,
      })
      expect(verdict).toStrictEqual({ type: 'rejected', reason: 'layer-locked' })
    })

    await it('every region of both painted layers previews exactly what the click builds', async () => {
      const f = makeFixture()
      const bounds = { columns: COLUMNS, rows: ROWS }
      const summary: Record<string, { regions: number; largest: number; mismatches: number }> = {}
      for (const layerId of [GROUND, OVERLAY]) {
        SessionState.set(f.scene, new ActiveLayerComponent(layerId))
        const editor = findTileMapForLayer(f.scene, layerId)?.editor
        if (!editor) throw new Error(`no plane tilemap for ${layerId}`)
        const covered = new Set<number>()
        const stats = { regions: 0, largest: 0, mismatches: 0 }
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLUMNS; x++) {
            if (covered.has(y * COLUMNS + x)) continue
            const sprites = getSpritesAt(editor, x, y, layerId)
            const showsSand =
              sprites.length === 1 && sprites[0].spriteSetId === 'lokiri-forest' && sprites[0].spriteId === 257
            const tileId = showsSand ? DEEP_WATER : SAND
            const shown = armFill(f, tileId, x, y) ?? []
            const clicked = buildTileFillCommand(editor, f.mapResource, bounds, layerId, x, y, tileId)
            const built = clicked ? clicked.payload.cells.map((c) => ({ x: c.tileX, y: c.tileY })) : []
            if (shown.length === 0 || !sameCells(shown, built)) stats.mismatches++
            // The origin is always covered, even when nothing was shown:
            // a hidden preview must fail this test, not turn it into a
            // 26,048-origin crawl over a 22,818-cell region.
            covered.add(y * COLUMNS + x)
            for (const c of shown) covered.add(c.y * COLUMNS + c.x)
            stats.regions++
            if (shown.length > stats.largest) stats.largest = shown.length
          }
        }
        summary[layerId] = stats
        expect(stats.mismatches).toBe(0)
        expect(stats.regions).toBeGreaterThan(1000)
        expect(stats.largest).toBeGreaterThan(5000)
      }
      console.log(`[hover-overlays.map] kokiri-forest sweep: ${JSON.stringify(summary)}`)
    })
  })

  await describe('eraser preview = erase click, on kokiri-forest', async () => {
    function armErase(f: Fixture, x: number, y: number): boolean | null {
      SessionState.set(f.scene, new ActiveToolComponent('eraser'))
      f.overlays.setHover({ tileMap: f.tileMap, coords: { x, y } })
      return previewedErase(f.eraserActor)
    }
    function clickErase(f: Fixture, x: number, y: number): { removed: TileSpriteRef[]; changed: GridCell[] } {
      const previous = snapshotPreviousSprites(f.editor, GROUND, x, y)
      const command = makeTilePaintCommand(GROUND, x, y, null, previous)
      expect(command.kind).toBe('tile.erase')
      const before = groundSnapshot(f.editor)
      command.apply(f.scene as unknown as Scene)
      const changed = changedCells(before, groundSnapshot(f.editor))
      return { removed: previous.map((r) => ({ ...r, layerId: GROUND })), changed }
    }

    await it('promises a removal exactly where the active layer holds sprites, and the click removes that stack only', async () => {
      const f = makeFixture()
      // Give the water cell an overlay sprite too: the eraser must leave it alone.
      setSpritesAt(f.editor, 88, 39, OVERLAY, [{ spriteSetId: 'lokiri-forest', spriteId: 26 }])
      expect(armErase(f, 88, 39)).toBe(true)
      const { removed, changed } = clickErase(f, 88, 39)
      expect(removed.map((r) => `${r.spriteSetId}#${r.spriteId}`)).toStrictEqual(['water#24'])
      expect([...keys(changed)]).toStrictEqual(['88,39'])
      expect(getSpritesAt(f.editor, 88, 39, GROUND).length).toBe(0)
      expect(getSpritesAt(f.editor, 88, 39, OVERLAY).length).toBe(1)
      // Without pointer motion the preview now says "nothing left here".
      f.events.emit(EngineEvent.COMMAND_EXECUTED, { command: { kind: 'tile.erase' } as never })
      expect(previewedErase(f.eraserActor)).toBe(false)
    })

    await it('promises nothing on an empty cell, and on a cell only another layer paints — and the click changes nothing', async () => {
      const f = makeFixture()
      expect(armErase(f, 2, 30)).toBe(false)
      expect(clickErase(f, 2, 30).changed.length).toBe(0)
      setSpritesAt(f.editor, 2, 31, OVERLAY, [{ spriteSetId: 'lokiri-forest', spriteId: 26 }])
      expect(armErase(f, 2, 31)).toBe(false)
      expect(clickErase(f, 2, 31).changed.length).toBe(0)
      expect(getSpritesAt(f.editor, 2, 31, OVERLAY).length).toBe(1)
    })

    await it('a locked layer: no preview, and the click is refused', async () => {
      const f = makeFixture()
      expect(armErase(f, 88, 39)).toBe(true)
      f.layer.locked = true
      f.events.emit(EngineEvent.LAYER_FLAG_CHANGED, { layerId: GROUND, flag: 'locked', value: true })
      expect(previewedErase(f.eraserActor)).toBe(null)
      const verdict = resolveEditLayer({
        assistantPause: { mode: 'skip' },
        hasActiveMap: true,
        requestedLayerId: null,
        activeLayerId: GROUND,
        isLayerLocked: (id) => id === GROUND,
      })
      expect(verdict).toStrictEqual({ type: 'rejected', reason: 'layer-locked' })
    })
  })
}
