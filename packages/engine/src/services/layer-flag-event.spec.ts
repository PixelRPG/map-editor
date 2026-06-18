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

import { type Command, SetLayerLockedCommand, SetLayerVisibilityCommand } from '../commands/index.ts'
import { layerFlagChange } from './layer-flag-event.ts'

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
}
