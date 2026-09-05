/**
 * Pure command→`LAYER_FLAG_CHANGED`-payload mapping used by
 * `Engine._emitLayerFlagChanged`.
 *
 * Why this matters: the engine emits this payload after EVERY apply/revert
 * path (local, undo, redo, AND inbound peer ops — which deliberately don't
 * emit `COMMAND_EXECUTED`) so the inspector's eye/padlock follows changes
 * it didn't originate. The `apply`-reports-target vs `revert`-reports-
 * previous distinction is the bit that keeps the Layers tab in sync after
 * an undo, so it is pinned here independently of a live engine.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  AddLayerCommand,
  type Command,
  ReorderLayerCommand,
  SetLayerLockedCommand,
  SetLayerPlaneCommand,
  SetLayerVisibilityCommand,
} from '../commands/index.ts'
import { layerFlagChange, layerListChange } from './layer-flag-event.ts'

/** A command that is NOT a layer-flag toggle, for the null path. */
const nonLayerCommand: Command = {
  kind: 'noop',
  label: 'noop',
  payload: {},
  apply() {},
  revert() {},
}

export default async () => {
  await describe('layerFlagChange', async () => {
    await describe('visibility command', async () => {
      await it('reports the target value on apply', async () => {
        const cmd = new SetLayerVisibilityCommand({ layerId: 'ground', visible: false, previousVisible: true })
        expect(layerFlagChange(cmd, 'apply')).toStrictEqual({ layerId: 'ground', flag: 'visible', value: false })
      })

      await it('reports the previous value on revert', async () => {
        const cmd = new SetLayerVisibilityCommand({ layerId: 'ground', visible: false, previousVisible: true })
        expect(layerFlagChange(cmd, 'revert')).toStrictEqual({ layerId: 'ground', flag: 'visible', value: true })
      })

      await it('carries the stable layer id through', async () => {
        const cmd = new SetLayerVisibilityCommand({ layerId: 'overlay-7', visible: true, previousVisible: false })
        expect(layerFlagChange(cmd, 'apply')?.layerId).toBe('overlay-7')
      })
    })

    await describe('locked command', async () => {
      await it('reports the target value on apply', async () => {
        const cmd = new SetLayerLockedCommand({ layerId: 'hero', locked: true, previousLocked: false })
        expect(layerFlagChange(cmd, 'apply')).toStrictEqual({ layerId: 'hero', flag: 'locked', value: true })
      })

      await it('reports the previous value on revert', async () => {
        const cmd = new SetLayerLockedCommand({ layerId: 'hero', locked: true, previousLocked: false })
        expect(layerFlagChange(cmd, 'revert')).toStrictEqual({ layerId: 'hero', flag: 'locked', value: false })
      })
    })

    await describe('non-layer command', async () => {
      await it('returns null on apply', async () => {
        expect(layerFlagChange(nonLayerCommand, 'apply')).toBe(null)
      })

      await it('returns null on revert', async () => {
        expect(layerFlagChange(nonLayerCommand, 'revert')).toBe(null)
      })
    })
  })

  await describe('layerListChange', async () => {
    await it('reports an added layer by its stable id', async () => {
      const cmd = new AddLayerCommand({ layer: { id: 'decor', name: 'Decor', visible: true } })
      expect(layerListChange(cmd)).toStrictEqual({ layerId: 'decor' })
    })

    await it('reports a reorder and a change of plane', async () => {
      expect(layerListChange(new ReorderLayerCommand({ layerId: 'bg', index: 1, previousIndex: 0 }))).toStrictEqual({
        layerId: 'bg',
      })
      const setPlane = new SetLayerPlaneCommand({
        layerId: 'roofs',
        plane: 'overlay',
        previousPlane: 'hero',
        index: 2,
        previousIndex: 2,
      })
      expect(layerListChange(setPlane)).toStrictEqual({ layerId: 'roofs' })
    })

    await it('is null for the flag commands and for non-layer commands', async () => {
      // The flags have their own mirror; a flag toggle must not make the
      // Layers tab rebuild its rows.
      expect(
        layerListChange(new SetLayerVisibilityCommand({ layerId: 'g', visible: false, previousVisible: true })),
      ).toBe(null)
      expect(layerListChange(new SetLayerLockedCommand({ layerId: 'g', locked: true, previousLocked: false }))).toBe(
        null,
      )
      expect(layerListChange(nonLayerCommand)).toBe(null)
    })
  })
}
