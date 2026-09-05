/**
 * The mutating-edit guard chain, pinned without a live scene.
 *
 * The ORDER of the guards is the part worth pinning: it decides which
 * reason a caller sees when several conditions fail at once, and it is
 * what kept the four `Engine` mutation entry points agreeing before
 * they shared this function.
 *
 * Two properties beyond ordering matter and are pinned below: the
 * assistant-pause gate is OPT-OUT BY NAME (`{ mode: 'skip' }`), and the
 * layer lock has no opt-out at all.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  type EditLayerQuery,
  isTileOutsideMap,
  resolveEditLayer,
  resolveMapBounds,
  resolveTileEditTarget,
} from './tile-edit-target.ts'

const baseLayerQuery: EditLayerQuery = {
  assistantPause: { mode: 'enforce', paused: false },
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
  mapBounds: null,
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
        assistantPause: { mode: 'enforce', paused: true },
        hasActiveMap: false,
        activeLayerId: null,
      })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'assistant-paused' })
    })

    await it('lets an entry point opt OUT of the pause gate by name', async () => {
      // `removeObject` is the one skipper — the human's Props "Remove"
      // button routes through it, so gating it here would disable the
      // user's own button while the assistant is paused.
      const result = resolveEditLayer({ ...baseLayerQuery, assistantPause: { mode: 'skip' } })
      expect(result).toStrictEqual({ type: 'resolved', layerId: 'ground' })
    })

    await it('has NO opt-out for the layer lock — it protects the layer, not the caller', async () => {
      const result = resolveEditLayer({
        ...baseLayerQuery,
        assistantPause: { mode: 'skip' },
        isLayerLocked: () => true,
      })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'layer-locked' })
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
      const result = resolveTileEditTarget({
        ...baseTargetQuery,
        assistantPause: { mode: 'enforce', paused: true },
      })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'assistant-paused' })
    })

    await it('refuses when no tilemap backs the layer', async () => {
      const result = resolveTileEditTarget({ ...baseTargetQuery, findTileMap: () => null })
      expect(result).toStrictEqual({ type: 'rejected', reason: 'no-tilemap' })
    })

    await it('bounds-checks against mapBounds when the scene has map data', async () => {
      // The persisted extent WINS over the tilemap's derived one. If the
      // two ever diverge, the map data is the truth — and this is the
      // assertion that makes the choice observable rather than
      // accidental.
      const smallerMap = { ...baseTargetQuery, mapBounds: { columns: 4, rows: 4 } }
      expect(resolveTileEditTarget({ ...smallerMap, tileX: 5, tileY: 0 })).toStrictEqual({
        type: 'rejected',
        reason: 'out-of-bounds',
      })
      expect(resolveTileEditTarget({ ...smallerMap, tileX: 3, tileY: 3 }).type).toBe('resolved')
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

  await describe('isTileOutsideMap', async () => {
    await it('is the ONE bounds verdict used by pointer + programmatic paths', async () => {
      const bounds = { columns: 3, rows: 2 }
      expect(isTileOutsideMap(bounds, 0, 0)).toBe(false)
      expect(isTileOutsideMap(bounds, 2, 1)).toBe(false)
      expect(isTileOutsideMap(bounds, 3, 1)).toBe(true)
      expect(isTileOutsideMap(bounds, 0, 2)).toBe(true)
      expect(isTileOutsideMap(bounds, -1, 0)).toBe(true)
    })

    await it('treats absent bounds as unbounded (no parsed map data)', async () => {
      expect(isTileOutsideMap(null, 99, 99)).toBe(false)
      expect(isTileOutsideMap(undefined, -5, -5)).toBe(false)
    })
  })

  await describe('resolveMapBounds', async () => {
    await it('prefers the persisted extent over the derived tilemap', async () => {
      const persisted = { columns: 4, rows: 4 }
      const derived = { columns: 8, rows: 8 }
      expect(resolveMapBounds(persisted, derived)).toBe(persisted)
    })

    await it('falls back to the tilemap only when there is no map data', async () => {
      const derived = { columns: 8, rows: 8 }
      expect(resolveMapBounds(null, derived)).toBe(derived)
      expect(resolveMapBounds(undefined, derived)).toBe(derived)
    })
  })
}
