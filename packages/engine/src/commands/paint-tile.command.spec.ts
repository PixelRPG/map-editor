/**
 * Apply/revert behaviour of `PaintTileCommand` / `EraseTileCommand`
 * against a three-tier scene (ground / hero / overlay tilemaps).
 *
 * Regression focus: the commands' internal `resolveContext` used to
 * grab the FIRST `TileMap` in the scene — always the ground tier,
 * because `MapResource.createTileMaps` adds tiers in ground → hero →
 * overlay order. Every hero/overlay-layer paint therefore mutated the
 * ground tilemap's shadow state (wrong render z), while the
 * `previousSprites` snapshot was read from the tier-correct shadow
 * that never saw the paint — so undoing a second paint ERASED the
 * first one instead of restoring it (silent data loss, replayed
 * identically on every collab peer). The commands must resolve the
 * tilemap by the layer's tier, exactly like the interactive paths
 * (`TileEditorSystem`, `Engine.paintTileAt`).
 */

import { describe, expect, it } from '@gjsify/unit'
import { TileMap } from 'excalibur'

import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileMapTierComponent } from '../components/tilemap-tier.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { getSpritesAt } from '../services/map-editor-shadow.service.ts'
import { findTileMapForLayer, snapshotPreviousSprites } from '../services/tile-paint.service.ts'
import type { LayerTier } from '../types/data/index.ts'
import { EraseTileCommand, PaintTileCommand } from './paint-tile.command.ts'

/**
 * Minimal stand-in for an Excalibur `Sprite`: `rebuildAllTileGraphics`
 * clones every graphic before attaching, and `Tile.addGraphic` only
 * pushes onto an array — no real texture needed.
 */
function makeFakeSprite(): { clone: () => unknown } {
  return { clone: () => ({}) }
}

interface TierFixture {
  scene: MapScene
  ground: TileMap
  hero: TileMap
  overlay: TileMap
}

/**
 * Build a duck-typed `MapScene` (via `Object.create` so `instanceof
 * MapScene` holds without running the constructor's engine wiring)
 * holding one real `TileMap` per tier, in the same order
 * `MapResource.createTileMaps` adds them — ground first, which is
 * exactly what made the old first-TileMap scan always pick ground.
 *
 * One sprite set `terrain` with `firstGid: 1` and local sprites 0+1,
 * so global tile ids 1 and 2 are paintable.
 */
function makeTierScene(): TierFixture {
  const spriteSet = { sprites: { 0: makeFakeSprite(), 1: makeFakeSprite() }, animations: {} }
  const mapResource = {
    mapData: {
      layers: [
        { id: 'ground-layer', name: 'Ground', visible: true, tier: 'ground' },
        { id: 'hero-layer', name: 'Decor', visible: true, tier: 'hero' },
        { id: 'overlay-layer', name: 'Treetops', visible: true, tier: 'overlay' },
        { id: 'legacy-layer', name: 'Legacy (no tier)', visible: true },
      ],
      spriteSets: [{ id: 'terrain', firstGid: 1 }],
    },
    getSpriteSetResource: () => spriteSet,
    getAllSpriteSetResources: () => new Map([['terrain', spriteSet]]),
    refreshTileSolidFromEditor: () => {},
    // biome-ignore lint/suspicious/noExplicitAny: test stub mirrors only the surface the commands exercise
  } as any as MapResource

  const makeTierTileMap = (tier: LayerTier): TileMap => {
    const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 })
    tileMap.addComponent(new TileMapTierComponent(tier))
    tileMap.addComponent(new MapEditorComponent())
    return tileMap
  }

  const ground = makeTierTileMap('ground')
  const hero = makeTierTileMap('hero')
  const overlay = makeTierTileMap('overlay')

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
 * from the layer's tier-correct editor, then apply. Returns the
 * command so tests can `revert` it later.
 */
function paint(fixture: TierFixture, layerId: string, x: number, y: number, spriteId: number): PaintTileCommand {
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
function erase(fixture: TierFixture, layerId: string, x: number, y: number): EraseTileCommand {
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
  await describe('PaintTileCommand.apply — tier routing', async () => {
    await it('writes a hero-layer paint to the hero tilemap, not the first (ground) one', async () => {
      const fixture = makeTierScene()
      paint(fixture, 'hero-layer', 1, 1, 1)

      expect(refsAt(fixture.hero, 1, 1, 'hero-layer')).toStrictEqual(['terrain#0'])
      expect(getSpritesAt(editorOf(fixture.ground), 1, 1).length).toBe(0)
      expect(getSpritesAt(editorOf(fixture.overlay), 1, 1).length).toBe(0)
    })

    await it('writes an overlay-layer paint to the overlay tilemap', async () => {
      const fixture = makeTierScene()
      paint(fixture, 'overlay-layer', 2, 3, 2)

      expect(refsAt(fixture.overlay, 2, 3, 'overlay-layer')).toStrictEqual(['terrain#1'])
      expect(getSpritesAt(editorOf(fixture.ground), 2, 3).length).toBe(0)
      expect(getSpritesAt(editorOf(fixture.hero), 2, 3).length).toBe(0)
    })

    await it('routes a tier-less layer to the ground tilemap (legacy default)', async () => {
      const fixture = makeTierScene()
      paint(fixture, 'legacy-layer', 0, 0, 1)

      expect(refsAt(fixture.ground, 0, 0, 'legacy-layer')).toStrictEqual(['terrain#0'])
      expect(getSpritesAt(editorOf(fixture.hero), 0, 0).length).toBe(0)
    })

    await it('warns + no-ops for an unknown layer id instead of falling back to a tilemap', async () => {
      const fixture = makeTierScene()
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
      const fixture = makeTierScene()
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
      const fixture = makeTierScene()
      const first = paint(fixture, 'hero-layer', 1, 1, 1)
      const second = paint(fixture, 'hero-layer', 1, 1, 2)

      second.revert(fixture.scene)
      first.revert(fixture.scene)

      expect(getSpritesAt(editorOf(fixture.hero), 1, 1).length).toBe(0)
    })
  })

  await describe('EraseTileCommand — tier routing + revert', async () => {
    await it('erases only the targeted layer tier, leaving congruent tiles on other tiers', async () => {
      const fixture = makeTierScene()
      paint(fixture, 'ground-layer', 1, 1, 1)
      paint(fixture, 'hero-layer', 1, 1, 2)

      erase(fixture, 'hero-layer', 1, 1)

      expect(getSpritesAt(editorOf(fixture.hero), 1, 1).length).toBe(0)
      // Pre-fix the erase cleared the ground tilemap instead.
      expect(refsAt(fixture.ground, 1, 1, 'ground-layer')).toStrictEqual(['terrain#0'])
    })

    await it('undo of an erase restores the erased sprites on the correct tier', async () => {
      const fixture = makeTierScene()
      paint(fixture, 'hero-layer', 1, 1, 1)
      const eraseCommand = erase(fixture, 'hero-layer', 1, 1)
      expect(getSpritesAt(editorOf(fixture.hero), 1, 1).length).toBe(0)

      eraseCommand.revert(fixture.scene)

      expect(refsAt(fixture.hero, 1, 1, 'hero-layer')).toStrictEqual(['terrain#0'])
      expect(getSpritesAt(editorOf(fixture.ground), 1, 1).length).toBe(0)
    })
  })
}
