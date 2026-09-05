import { describe, expect, it } from '@gjsify/unit'
import type { MapData } from '@pixelrpg/engine'

import { buildDrawOps, type DrawOp, type SheetRange, tileTransform } from './map-preview.ops.ts'

/** Stand-in for a `Gdk.Texture` — `buildDrawOps` only ever passes it through. */
const TEXTURE = { id: 'atlas' } as unknown as DrawOp['texture']

interface SpriteStub {
  x: number
  y: number
  width: number
  height: number
  sourceTexture: DrawOp['texture'] | null
}

/** A decoded sheet whose sprites sit on a 16px grid, four per row. */
function sheet(spriteSetId: string, sprites: SpriteStub[]): SheetRange {
  return {
    spriteSetId,
    start: 1,
    end: sprites.length,
    sheet: { sprites } as unknown as SheetRange['sheet'],
  }
}

function grid(count: number, size = 16, texture: DrawOp['texture'] | null = TEXTURE): SpriteStub[] {
  return Array.from({ length: count }, (_unused, index) => ({
    x: (index % 4) * size,
    y: Math.floor(index / 4) * size,
    width: size,
    height: size,
    sourceTexture: texture,
  }))
}

type Tile = { x: number; y: number; spriteId: number; spriteSetId: string }

function makeMap(layers: { visible?: boolean; sprites?: Tile[] }[], tileSize = 16): MapData {
  return {
    id: 'm',
    name: 'M',
    version: '1.0.0',
    tileWidth: tileSize,
    tileHeight: tileSize,
    columns: 8,
    rows: 8,
    layers: layers.map((layer, index) => ({
      id: `l${index}`,
      name: `L${index}`,
      visible: layer.visible,
      sprites: layer.sprites,
    })),
    spriteSets: [],
  } as unknown as MapData
}

const ranges = [sheet('set', grid(8))]

export default async () => {
  await describe('map-preview.ops', async () => {
    await describe('buildDrawOps', async () => {
      await it('is empty for a map with no layers', async () => {
        expect(buildDrawOps(makeMap([]), ranges, null)).toStrictEqual([])
      })

      await it('places a tile at its map-pixel position', async () => {
        const ops = buildDrawOps(
          makeMap([{ visible: true, sprites: [{ x: 2, y: 3, spriteId: 5, spriteSetId: 'set' }] }]),
          ranges,
          null,
        )
        expect(ops.length).toBe(1)
        expect({ tx: ops[0].tx, ty: ops[0].ty, tw: ops[0].tw, th: ops[0].th }).toStrictEqual({
          tx: 32,
          ty: 48,
          tw: 16,
          th: 16,
        })
      })

      await it('reads the atlas region from the sprite LOCAL id, not a global gid', async () => {
        // Sprite 5 of a 4-per-row sheet sits at column 1, row 1.
        const ops = buildDrawOps(
          makeMap([{ visible: true, sprites: [{ x: 0, y: 0, spriteId: 5, spriteSetId: 'set' }] }]),
          ranges,
          null,
        )
        expect({ sx: ops[0].sx, sy: ops[0].sy, sw: ops[0].sw, sh: ops[0].sh }).toStrictEqual({
          sx: 16,
          sy: 16,
          sw: 16,
          sh: 16,
        })
      })

      await it('skips hidden layers entirely', async () => {
        const map = makeMap([
          { visible: false, sprites: [{ x: 0, y: 0, spriteId: 0, spriteSetId: 'set' }] },
          { visible: true, sprites: [{ x: 1, y: 0, spriteId: 0, spriteSetId: 'set' }] },
        ])
        const ops = buildDrawOps(map, ranges, null)
        expect(ops.length).toBe(1)
        expect(ops[0].tx).toBe(16)
      })

      await it('BAKES a layer whose descriptor has no `visible` key', async () => {
        // Absent means visible — the engine's `isLayerDataVisible` rule.
        // A truthiness test here dropped such a layer from every card and
        // welcome-view preview while the engine rendered it: the preview
        // and the thing it previews disagreed.
        const map = makeMap([{ sprites: [{ x: 0, y: 0, spriteId: 0, spriteSetId: 'set' }] }])
        expect(buildDrawOps(map, ranges, null).length).toBe(1)
      })

      await it('hides ONLY on an explicit false', async () => {
        const shown = makeMap([{ visible: true, sprites: [{ x: 0, y: 0, spriteId: 0, spriteSetId: 'set' }] }])
        const hidden = makeMap([{ visible: false, sprites: [{ x: 0, y: 0, spriteId: 0, spriteSetId: 'set' }] }])
        expect(buildDrawOps(shown, ranges, null).length).toBe(1)
        expect(buildDrawOps(hidden, ranges, null).length).toBe(0)
      })

      await it('skips a layer with no sprite array', async () => {
        expect(buildDrawOps(makeMap([{ visible: true }]), ranges, null)).toStrictEqual([])
      })

      await it('drops a tile whose sprite set is not loaded', async () => {
        const map = makeMap([{ visible: true, sprites: [{ x: 0, y: 0, spriteId: 0, spriteSetId: 'missing' }] }])
        expect(buildDrawOps(map, ranges, null)).toStrictEqual([])
      })

      await it('drops a tile whose local id is past the end of the sheet', async () => {
        const map = makeMap([{ visible: true, sprites: [{ x: 0, y: 0, spriteId: 8, spriteSetId: 'set' }] }])
        expect(buildDrawOps(map, ranges, null)).toStrictEqual([])
      })

      await it('drops a tile with a negative local id', async () => {
        const map = makeMap([{ visible: true, sprites: [{ x: 0, y: 0, spriteId: -1, spriteSetId: 'set' }] }])
        expect(buildDrawOps(map, ranges, null)).toStrictEqual([])
      })

      await it('drops a sprite whose sheet entry never decoded a texture', async () => {
        const undecoded = [sheet('set', grid(4, 16, null))]
        const map = makeMap([{ visible: true, sprites: [{ x: 0, y: 0, spriteId: 0, spriteSetId: 'set' }] }])
        expect(buildDrawOps(map, undecoded, null)).toStrictEqual([])
      })

      await it('keeps layer order — the bake paints back to front', async () => {
        const map = makeMap([
          { visible: true, sprites: [{ x: 0, y: 0, spriteId: 0, spriteSetId: 'set' }] },
          { visible: true, sprites: [{ x: 0, y: 0, spriteId: 1, spriteSetId: 'set' }] },
        ])
        expect(buildDrawOps(map, ranges, null).map((op) => op.sx)).toStrictEqual([0, 16])
      })

      await describe('clipping', async () => {
        // A 16px tile grid; the clip covers map pixels [32, 96).
        const clip = { x: 32, y: 32, w: 64, h: 64 }
        const tileAt = (x: number, y: number) =>
          makeMap([{ visible: true, sprites: [{ x, y, spriteId: 0, spriteSetId: 'set' }] }])

        await it('keeps a tile fully inside', async () => {
          expect(buildDrawOps(tileAt(3, 3), ranges, clip).length).toBe(1)
        })

        await it('drops the tile that ends exactly on the clip start', async () => {
          // Tile (1,3) spans [16, 32) — touching, not overlapping.
          expect(buildDrawOps(tileAt(1, 3), ranges, clip).length).toBe(0)
        })

        await it('keeps the first tile that reaches into the clip', async () => {
          // Tile (2,3) spans [32, 48).
          expect(buildDrawOps(tileAt(2, 3), ranges, clip).length).toBe(1)
        })

        await it('keeps the LAST tile inside the clip', async () => {
          // Tile (5,3) spans [80, 96) — the final column the clip covers.
          expect(buildDrawOps(tileAt(5, 3), ranges, clip).length).toBe(1)
        })

        await it('drops the tile that starts exactly on the clip end', async () => {
          expect(buildDrawOps(tileAt(6, 3), ranges, clip).length).toBe(0)
        })

        await it('clips on both axes, not just x', async () => {
          expect(buildDrawOps(tileAt(3, 6), ranges, clip).length).toBe(0)
        })

        await it('drops everything for a zero-area clip', async () => {
          expect(buildDrawOps(tileAt(3, 3), ranges, { x: 32, y: 32, w: 0, h: 0 }).length).toBe(0)
        })
      })
    })

    await describe('tileTransform', async () => {
      const op = (overrides: Partial<DrawOp> = {}): DrawOp => ({
        texture: TEXTURE,
        sx: 32,
        sy: 48,
        sw: 16,
        sh: 16,
        tx: 64,
        ty: 80,
        tw: 16,
        th: 16,
        ...overrides,
      })

      await it('is the identity at scale 1 with no offset', async () => {
        const t = tileTransform(op(), { scale: 1, offsetXMapPx: 0, offsetYMapPx: 0 })
        expect({ x: t.targetX, y: t.targetY, w: t.targetW, h: t.targetH }).toStrictEqual({
          x: 64,
          y: 80,
          w: 16,
          h: 16,
        })
        expect(t.atlasScale).toBe(1)
      })

      await it('translates the atlas so the sprite lands on the tile', async () => {
        // At scale 1 the sprite's own atlas offset is cancelled exactly.
        const t = tileTransform(op(), { scale: 1, offsetXMapPx: 0, offsetYMapPx: 0 })
        expect({ x: t.translateX, y: t.translateY }).toStrictEqual({ x: 64 - 32, y: 80 - 48 })
      })

      await it('applies the map-pixel offset BEFORE the scale', async () => {
        const t = tileTransform(op(), { scale: 2, offsetXMapPx: 10, offsetYMapPx: 5 })
        expect({ x: t.targetX, y: t.targetY }).toStrictEqual({ x: (64 + 10) * 2, y: (80 + 5) * 2 })
      })

      await it('scales the atlas by target/source, not by the bake scale', async () => {
        // A 32px sprite drawn into a 16px tile at bake scale 2: the tile is
        // 32 bake px wide, so the atlas is drawn 1:1, NOT at 2x.
        const t = tileTransform(op({ sw: 32, sh: 32 }), { scale: 2, offsetXMapPx: 0, offsetYMapPx: 0 })
        expect(t.atlasScale).toBe(1)
        expect(t.translateX).toBe(128 - 32)
      })

      await it('accounts for a non-square tile', async () => {
        const t = tileTransform(op({ tw: 16, th: 32 }), { scale: 1, offsetXMapPx: 0, offsetYMapPx: 0 })
        expect({ w: t.targetW, h: t.targetH }).toStrictEqual({ w: 16, h: 32 })
      })

      await it('handles a fractional bake scale without NaN', async () => {
        const t = tileTransform(op(), { scale: 0.375, offsetXMapPx: 0, offsetYMapPx: 0 })
        expect(t.targetW).toBe(6)
        expect(Number.isFinite(t.translateX)).toBe(true)
        expect(Number.isFinite(t.translateY)).toBe(true)
      })

      await it('degrades instead of dividing by a zero source width', async () => {
        const t = tileTransform(op({ sw: 0 }), { scale: 2, offsetXMapPx: 0, offsetYMapPx: 0 })
        expect(Number.isFinite(t.atlasScale)).toBe(true)
        expect(Number.isFinite(t.translateX)).toBe(true)
        expect(Number.isFinite(t.translateY)).toBe(true)
      })

      await it('collapses to a zero-area target at scale 0 (never NaN)', async () => {
        const t = tileTransform(op(), { scale: 0, offsetXMapPx: 0, offsetYMapPx: 0 })
        expect({ w: t.targetW, h: t.targetH }).toStrictEqual({ w: 0, h: 0 })
        expect(Number.isFinite(t.translateX)).toBe(true)
      })
    })
  })
}
