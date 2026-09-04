/**
 * The programmatic-edit guard chain, pinned without a live scene.
 *
 * The ORDER of the guards is the part worth pinning: it decides which
 * reason a caller sees when several conditions fail at once, and it is
 * what kept the four `Engine.*At` entry points agreeing before they
 * shared this function.
 */

import { describe, expect, it } from '@gjsify/unit'

import { type EditLayerQuery, resolveEditLayer, resolveTileEditTarget } from './tile-edit-target.ts'

const baseLayerQuery: EditLayerQuery = {
  assistantPaused: false,
  hasActiveMap: true,
  requestedLayerId: null,
  activeLayerId: 'ground',
  isLayerLocked: () => false,
}

const tileMap = { columns: 10, rows: 8 }
const editor = { marker: 'editor' }

const baseTargetQuery = {
  ...baseLayerQuery,
  tileX: 0,
  tileY: 0,
  findTileMap: () => ({ tileMap, editor }),
}

export default async () => {
  await describe('resolveEditLayer', async () => {
    await it('falls back to the active layer when none is requested', async () => {
      expect(resolveEditLayer(baseLayerQuery)).toStrictEqual({ type: 'resolved', layerId: 'ground' })
    })

    await it('prefers an explicitly requested layer over the active one', async () => {
      expect(resolveEditLayer({ ...baseLayerQuery, requestedLayerId: 'walls' })).toStrictEqual({
        type: 'resolved',
        layerId: 'walls',
      })
    })

    await it('refuses while the assistant is paused, before any other check', async () => {
      const result = resolveEditLayer({
        ...baseLayerQuery,
        assistantPaused: true,
        hasActiveMap: false,
        activeLayerId: null,
      })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'assistant-paused' })
    })

    await it('refuses without an active map, before resolving a layer', async () => {
      const result = resolveEditLayer({ ...baseLayerQuery, hasActiveMap: false, activeLayerId: null })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'no-active-map' })
    })

    await it('refuses when neither a requested nor an active layer exists', async () => {
      const result = resolveEditLayer({ ...baseLayerQuery, activeLayerId: null })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'no-layer' })
    })

    await it('refuses a locked layer', async () => {
      const result = resolveEditLayer({ ...baseLayerQuery, isLayerLocked: (id) => id === 'ground' })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'layer-locked' })
    })

    await it('checks the lock on the resolved layer, not the active one', async () => {
      const query = { ...baseLayerQuery, requestedLayerId: 'walls', isLayerLocked: (id: string) => id === 'ground' }
      expect(resolveEditLayer(query)).toStrictEqual({ type: 'resolved', layerId: 'walls' })
    })
  })

  await describe('resolveTileEditTarget', async () => {
    await it('carries the resolved tilemap + editor through', async () => {
      expect(resolveTileEditTarget(baseTargetQuery)).toStrictEqual({
        type: 'resolved',
        layerId: 'ground',
        tileMap,
        editor,
      })
    })

    await it('propagates a layer-stage rejection unchanged', async () => {
      const result = resolveTileEditTarget({ ...baseTargetQuery, assistantPaused: true })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'assistant-paused' })
    })

    await it('refuses when no tilemap backs the layer', async () => {
      const result = resolveTileEditTarget({ ...baseTargetQuery, findTileMap: () => null })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'no-tilemap' })
    })

    await it('refuses coordinates past the tilemap bounds', async () => {
      expect(resolveTileEditTarget({ ...baseTargetQuery, tileX: 10, tileY: 0 })).toStrictEqual({
        type: 'rejected',
        reason: 'out-of-bounds',
      })
      expect(resolveTileEditTarget({ ...baseTargetQuery, tileX: 0, tileY: -1 })).toStrictEqual({
        type: 'rejected',
        reason: 'out-of-bounds',
      })
    })

    await it('accepts the last in-bounds tile', async () => {
      const result = resolveTileEditTarget({ ...baseTargetQuery, tileX: 9, tileY: 7 })
      expect(result.type).toBe('resolved')
    })

    await it('looks the tilemap up by the resolved layer id', async () => {
      const seen: string[] = []
      resolveTileEditTarget({
        ...baseTargetQuery,
        requestedLayerId: 'walls',
        findTileMap: (layerId) => {
          seen.push(layerId)
          return { tileMap, editor }
        },
      })
      expect(seen).toStrictEqual(['walls'])
    })
  })
}
