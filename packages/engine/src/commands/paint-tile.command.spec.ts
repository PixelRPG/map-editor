/**
 * Apply/revert behaviour of `PaintTileCommand` / `EraseTileCommand`
 * against a three-plane scene (ground / hero / overlay tilemaps).
 *
 * Regression focus: the commands' internal `resolveContext` used to
 * grab the FIRST `TileMap` in the scene — always the ground plane,
 * because `buildPlaneTileMaps` adds planes in ground → hero →
 * overlay order. Every hero/overlay-layer paint therefore mutated the
 * ground tilemap's shadow state (wrong render z), while the
 * `previousSprites` snapshot was read from the plane-correct shadow
 * that never saw the paint — so undoing a second paint ERASED the
 * first one instead of restoring it (silent data loss, replayed
 * identically on every collab peer). The commands must resolve the
 * tilemap by the layer's plane, exactly like the interactive paths
 * (`TileEditorSystem`, `Engine.paintTileAt`).
 */

import { describe, expect, it } from '@gjsify/unit'
import { TileMap } from 'excalibur'

import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileMapPlaneComponent } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { getSpritesAt } from '../services/map-editor-shadow.service.ts'
import { buildTileFillCommand } from '../services/tile-fill.service.ts'
import { findTileMapForLayer, snapshotPreviousSprites } from '../services/tile-paint.service.ts'
import type { LayerPlane } from '../types/data/index.ts'
import { EraseTileCommand, PaintTileCommand } from './paint-tile.command.ts'

/**
 * Minimal stand-in for an Excalibur `Sprite`: `rebuildAllTileGraphics`
 * clones every graphic before attaching, and `Tile.addGraphic` only
 * pushes onto an array — no real texture needed.
 */
function makeFakeSprite(): { clone: () => unknown } {
  return { clone: () => ({}) }
}

interface PlaneFixture {
  scene: MapScene
  ground: TileMap
  hero: TileMap
  overlay: TileMap
}

/**
 * Build a duck-typed `MapScene` (via `Object.create` so `instanceof
 * MapScene` holds without running the constructor's engine wiring)
 * holding one real `TileMap` per plane, in the same order
 * `MapResource.createTileMaps` adds them — ground first, which is
 * exactly what made the old first-TileMap scan always pick ground.
 *
 * One sprite set `terrain` with `firstGid: 1` and local sprites 0+1,
 * so global tile ids 1 and 2 are paintable.
 */
function makePlaneScene(): PlaneFixture {
  const spriteSet = { sprites: { 0: makeFakeSprite(), 1: makeFakeSprite() }, animations: {} }
  const mapResource = {
    mapData: {
      layers: [
        { id: 'ground-layer', name: 'Ground', visible: true, plane: 'ground' },
        { id: 'hero-layer', name: 'Decor', visible: true, plane: 'hero' },
        { id: 'overlay-layer', name: 'Treetops', visible: true, plane: 'overlay' },
        { id: 'legacy-layer', name: 'Legacy (no plane)', visible: true },
      ],
      spriteSets: [{ id: 'terrain', firstGid: 1 }],
    },
    getSpriteSetResource: () => spriteSet,
    getAllSpriteSetResources: () => new Map([['terrain', spriteSet]]),
    refreshTileSolidFromEditor: () => {},
    // biome-ignore lint/suspicious/noExplicitAny: test stub mirrors only the surface the commands exercise
  } as any as MapResource

  const makePlaneTileMap = (plane: LayerPlane): TileMap => {
    const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 })
    tileMap.addComponent(new TileMapPlaneComponent(plane))
    tileMap.addComponent(new MapEditorComponent())
    return tileMap
  }

  const ground = makePlaneTileMap('ground')
  const hero = makePlaneTileMap('hero')
  const overlay = makePlaneTileMap('overlay')

  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource,
    world: { entityManager: { entities: [ground, hero, overlay] } },
  })
  return { scene, ground, hero, overlay }
}

function editorOf(tileMap: TileMap): MapEditorComponent {
  const editor = tileMap.get(MapEditorComponent)
  if (!editor) throw new Error('fixture tilemap lost its MapEditorComponent')
  return editor
}

/** Compact `spriteSetId#spriteId` view of a tile's shadow refs on one layer. */
function refsAt(tileMap: TileMap, x: number, y: number, layerId: string): string[] {
  return getSpritesAt(editorOf(tileMap), x, y, layerId).map((ref) => `${ref.spriteSetId}#${ref.spriteId}`)
}

/**
 * Paint the way every real caller does: snapshot the previous sprites
 * from the layer's plane-correct editor, then apply. Returns the
 * command so tests can `revert` it later.
 */
function paint(fixture: PlaneFixture, layerId: string, x: number, y: number, spriteId: number): PaintTileCommand {
  const found = findTileMapForLayer(fixture.scene, layerId)
  if (!found) throw new Error(`fixture cannot resolve layer ${layerId}`)
  const command = new PaintTileCommand({
    layerId,
    tileX: x,
    tileY: y,
    spriteId,
    previousSprites: snapshotPreviousSprites(found.editor, layerId, x, y),
  })
  command.apply(fixture.scene)
  return command
}

/** Erase counterpart of {@link paint} — same snapshot-then-apply flow. */
function erase(fixture: PlaneFixture, layerId: string, x: number, y: number): EraseTileCommand {
  const found = findTileMapForLayer(fixture.scene, layerId)
  if (!found) throw new Error(`fixture cannot resolve layer ${layerId}`)
  const command = new EraseTileCommand({
    layerId,
    tileX: x,
    tileY: y,
    previousSprites: snapshotPreviousSprites(found.editor, layerId, x, y),
  })
  command.apply(fixture.scene)
  return command
}

/**
 * Silence `console.warn` for the body of `fn` — @gjsify/unit has no
 * `vi.spyOn` equivalent (same shim as sprite-info.resolver.spec).
 */
async function muteWarn<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = console.warn
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.warn = original
  }
}

export default async () => {
  await describe('PaintTileCommand.apply — plane routing', async () => {
    await it('writes a hero-layer paint to the hero tilemap, not the first (ground) one', async () => {
      const fixture = makePlaneScene()
      paint(fixture, 'hero-layer', 1, 1, 1)

      expect(refsAt(fixture.hero, 1, 1, 'hero-layer')).toStrictEqual(['terrain#0'])
      expect(getSpritesAt(editorOf(fixture.ground), 1, 1).length).toBe(0)
      expect(getSpritesAt(editorOf(fixture.overlay), 1, 1).length).toBe(0)
    })

    await it('writes an overlay-layer paint to the overlay tilemap', async () => {
      const fixture = makePlaneScene()
      paint(fixture, 'overlay-layer', 2, 3, 2)

      expect(refsAt(fixture.overlay, 2, 3, 'overlay-layer')).toStrictEqual(['terrain#1'])
      expect(getSpritesAt(editorOf(fixture.ground), 2, 3).length).toBe(0)
      expect(getSpritesAt(editorOf(fixture.hero), 2, 3).length).toBe(0)
    })

    await it('routes a plane-less layer to the ground tilemap (legacy default)', async () => {
      const fixture = makePlaneScene()
      paint(fixture, 'legacy-layer', 0, 0, 1)

      expect(refsAt(fixture.ground, 0, 0, 'legacy-layer')).toStrictEqual(['terrain#0'])
      expect(getSpritesAt(editorOf(fixture.hero), 0, 0).length).toBe(0)
    })

    await it('warns + no-ops for an unknown layer id instead of falling back to a tilemap', async () => {
      const fixture = makePlaneScene()
      const command = new PaintTileCommand({
        layerId: 'deleted-layer',
        tileX: 1,
        tileY: 1,
        spriteId: 1,
        previousSprites: [],
      })
      await muteWarn(() => command.apply(fixture.scene))

      for (const tileMap of [fixture.ground, fixture.hero, fixture.overlay]) {
        expect(getSpritesAt(editorOf(tileMap), 1, 1).length).toBe(0)
      }
    })
  })

  await describe('PaintTileCommand revert — paint → paint → undo round-trip', async () => {
    await it('undo of a second hero-layer paint restores the first (regression: it erased it)', async () => {
      const fixture = makePlaneScene()
      paint(fixture, 'hero-layer', 1, 1, 1)
      const second = paint(fixture, 'hero-layer', 1, 1, 2)
      expect(refsAt(fixture.hero, 1, 1, 'hero-layer')).toStrictEqual(['terrain#1'])

      second.revert(fixture.scene)

      // Pre-fix: `previousSprites` was snapshotted from the hero shadow
      // (which the ground-targeted apply never touched) → empty → the
      // revert removed everything. The first paint must survive.
      expect(refsAt(fixture.hero, 1, 1, 'hero-layer')).toStrictEqual(['terrain#0'])
      expect(getSpritesAt(editorOf(fixture.ground), 1, 1).length).toBe(0)
    })

    await it('undo of the first paint returns the tile to empty', async () => {
      const fixture = makePlaneScene()
      const first = paint(fixture, 'hero-layer', 1, 1, 1)
      const second = paint(fixture, 'hero-layer', 1, 1, 2)

      second.revert(fixture.scene)
      first.revert(fixture.scene)

      expect(getSpritesAt(editorOf(fixture.hero), 1, 1).length).toBe(0)
    })
  })

  await describe('EraseTileCommand — plane routing + revert', async () => {
    await it('erases only the targeted layer plane, leaving congruent tiles on other planes', async () => {
      const fixture = makePlaneScene()
      paint(fixture, 'ground-layer', 1, 1, 1)
      paint(fixture, 'hero-layer', 1, 1, 2)

      erase(fixture, 'hero-layer', 1, 1)

      expect(getSpritesAt(editorOf(fixture.hero), 1, 1).length).toBe(0)
      // Pre-fix the erase cleared the ground tilemap instead.
      expect(refsAt(fixture.ground, 1, 1, 'ground-layer')).toStrictEqual(['terrain#0'])
    })

    await it('undo of an erase restores the erased sprites on the correct plane', async () => {
      const fixture = makePlaneScene()
      paint(fixture, 'hero-layer', 1, 1, 1)
      const eraseCommand = erase(fixture, 'hero-layer', 1, 1)
      expect(getSpritesAt(editorOf(fixture.hero), 1, 1).length).toBe(0)

      eraseCommand.revert(fixture.scene)

      expect(refsAt(fixture.hero, 1, 1, 'hero-layer')).toStrictEqual(['terrain#0'])
      expect(getSpritesAt(editorOf(fixture.ground), 1, 1).length).toBe(0)
    })
  })

  await describe('buildTileFillCommand + FillTileCommand — flood fill', async () => {
    await it('fills the whole empty layer as one command; revert clears it', async () => {
      const fixture = makePlaneScene()
      const cmd = buildTileFillCommand(
        editorOf(fixture.ground),
        fixture.scene.mapResource,
        { columns: 4, rows: 4 },
        'ground-layer',
        0,
        0,
        1,
      )
      if (!cmd) throw new Error('expected a fill command')
      expect(cmd.payload.cells.length).toBe(16) // full 4×4

      cmd.apply(fixture.scene)
      expect(refsAt(fixture.ground, 0, 0, 'ground-layer')).toStrictEqual(['terrain#0'])
      expect(refsAt(fixture.ground, 3, 3, 'ground-layer')).toStrictEqual(['terrain#0'])
      // Fill targets one plane only — other planes stay empty.
      expect(getSpritesAt(editorOf(fixture.hero), 0, 0).length).toBe(0)

      cmd.revert(fixture.scene)
      expect(getSpritesAt(editorOf(fixture.ground), 0, 0).length).toBe(0)
      expect(getSpritesAt(editorOf(fixture.ground), 3, 3).length).toBe(0)
    })

    await it('stops at a wall of a different tile (bounded region)', async () => {
      const fixture = makePlaneScene()
      // Wall down column x=2 with tile 2 (terrain#1), partitioning the map.
      for (let y = 0; y < 4; y++) paint(fixture, 'ground-layer', 2, y, 2)

      const cmd = buildTileFillCommand(
        editorOf(fixture.ground),
        fixture.scene.mapResource,
        { columns: 4, rows: 4 },
        'ground-layer',
        0,
        0,
        1,
      )
      if (!cmd) throw new Error('expected a fill command')
      // Left of the wall only: x∈{0,1} × y∈{0..3} = 8 tiles.
      expect(cmd.payload.cells.length).toBe(8)

      cmd.apply(fixture.scene)
      expect(refsAt(fixture.ground, 0, 0, 'ground-layer')).toStrictEqual(['terrain#0'])
      expect(refsAt(fixture.ground, 1, 3, 'ground-layer')).toStrictEqual(['terrain#0'])
      // Wall untouched; the region right of the wall was never reached.
      expect(refsAt(fixture.ground, 2, 0, 'ground-layer')).toStrictEqual(['terrain#1'])
      expect(getSpritesAt(editorOf(fixture.ground), 3, 0, 'ground-layer').length).toBe(0)
    })

    await it('no-ops (returns null) when the origin already shows the fill tile', async () => {
      const fixture = makePlaneScene()
      paint(fixture, 'ground-layer', 0, 0, 1)
      const cmd = buildTileFillCommand(
        editorOf(fixture.ground),
        fixture.scene.mapResource,
        { columns: 4, rows: 4 },
        'ground-layer',
        0,
        0,
        1,
      )
      expect(cmd).toBe(null)
    })
  })
}
