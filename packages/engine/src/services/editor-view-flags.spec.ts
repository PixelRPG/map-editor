/**
 * Editor view-flag defaults + merge semantics.
 *
 * `objectsVisible` defaulting to `true` while the other two default to
 * `false` is the asymmetry these tests exist for: an absent component
 * must read as "objects shown", and a merge must never quietly flip it
 * off just because the caller only touched `showGrid`.
 */

import { describe, expect, it } from '@gjsify/unit'

import {
  DEFAULT_EDITOR_VIEW_FLAGS,
  editorViewFlagsEqual,
  mergeEditorViewFlags,
  readEditorViewFlags,
} from './editor-view-flags.ts'

export default async () => {
  await describe('readEditorViewFlags', async () => {
    await it('returns the defaults for an absent carrier', async () => {
      expect(readEditorViewFlags(null)).toStrictEqual({
        showGrid: false,
        dimInactiveLayers: false,
        objectsVisible: true,
      })
      expect(readEditorViewFlags(undefined)).toStrictEqual(readEditorViewFlags(null))
    })

    await it('passes explicit values through, including a disabled objectsVisible', async () => {
      expect(readEditorViewFlags({ showGrid: true, dimInactiveLayers: true, objectsVisible: false })).toStrictEqual({
        showGrid: true,
        dimInactiveLayers: true,
        objectsVisible: false,
      })
    })

    await it('fills only the fields the carrier omits', async () => {
      expect(readEditorViewFlags({ showGrid: true })).toStrictEqual({
        showGrid: true,
        dimInactiveLayers: false,
        objectsVisible: true,
      })
    })
  })

  await describe('mergeEditorViewFlags', async () => {
    await it('keeps untouched fields from the current carrier', async () => {
      const current = { showGrid: false, dimInactiveLayers: true, objectsVisible: false }
      expect(mergeEditorViewFlags(current, { showGrid: true })).toStrictEqual({
        showGrid: true,
        dimInactiveLayers: true,
        objectsVisible: false,
      })
    })

    await it('merges over the defaults when nothing is set yet', async () => {
      expect(mergeEditorViewFlags(null, { dimInactiveLayers: true })).toStrictEqual({
        showGrid: false,
        dimInactiveLayers: true,
        objectsVisible: true,
      })
    })

    await it('is a no-op for an empty partial', async () => {
      const current = { showGrid: true, dimInactiveLayers: false, objectsVisible: false }
      expect(mergeEditorViewFlags(current, {})).toStrictEqual(current)
    })
  })

  await describe('editorViewFlagsEqual', async () => {
    await it('reports an absent carrier as unequal so it always gets written', async () => {
      expect(editorViewFlagsEqual(null, DEFAULT_EDITOR_VIEW_FLAGS)).toBe(false)
    })

    await it('matches a carrier holding the same triple', async () => {
      const flags = { showGrid: true, dimInactiveLayers: false, objectsVisible: true }
      expect(editorViewFlagsEqual(flags, flags)).toBe(true)
    })

    await it('detects a single differing field', async () => {
      const current = { showGrid: true, dimInactiveLayers: false, objectsVisible: true }
      expect(editorViewFlagsEqual(current, { ...current, objectsVisible: false })).toBe(false)
    })
  })
}
