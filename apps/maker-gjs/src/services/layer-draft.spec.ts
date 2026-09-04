import { describe, expect, it } from '@gjsify/unit'

import type { LayerData } from '@pixelrpg/engine'
import { nextLayerDraft } from './layer-draft.ts'

const layer = (id: string, name: string): LayerData => ({ id, name, visible: true })

export default async () => {
  await describe('nextLayerDraft', async () => {
    await it('numbers the new layer after the existing count', async () => {
      expect(nextLayerDraft([]).name).toBe('Layer 1')
      expect(nextLayerDraft([layer('background', 'Background')]).name).toBe('Layer 2')
    })

    await it('starts visible', async () => {
      expect(nextLayerDraft([]).visible).toBe(true)
    })

    await it('never reuses an id already on the map', async () => {
      const existing = [layer('background', 'Background'), layer('layer-2', 'Layer 2')]
      const draft = nextLayerDraft(existing)
      expect(existing.some((l) => l.id === draft.id)).toBe(false)
    })
  })
}
