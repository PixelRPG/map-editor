import { describe, expect, it } from '@gjsify/unit'

import type { LayerData } from '@pixelrpg/engine'
import { nextLayerDraft, planeTarget } from './layer-draft.ts'

const layer = (id: string, name: string): LayerData => ({ id, name, visible: true })

/** The layer id a tap lands on, or null when it would create one. */
const targetId = (t: ReturnType<typeof planeTarget>): string | null => (t.kind === 'existing' ? t.id : null)

export default async () => {
  await describe('nextLayerDraft', async () => {
    await it('numbers the new layer after the existing count', async () => {
      expect(nextLayerDraft([]).name).toBe('Layer 1')
      expect(nextLayerDraft([layer('background', 'Background')]).name).toBe('Layer 2')
    })

    await it('starts visible', async () => {
      expect(nextLayerDraft([]).visible).toBe(true)
    })

    await it('takes the plane it is given and omits the key otherwise', async () => {
      expect(nextLayerDraft([], 'overlay').plane).toBe('overlay')
      expect('plane' in nextLayerDraft([])).toBe(false)
    })

    await it('never reuses an id already on the map', async () => {
      const existing = [layer('background', 'Background'), layer('layer-2', 'Layer 2')]
      const draft = nextLayerDraft(existing)
      expect(existing.some((l) => l.id === draft.id)).toBe(false)
    })
  })

  await describe('planeTarget', async () => {
    const starter = [layer('layer_0', 'Background')]

    await it('creates a layer for a plane a new game does not have yet', async () => {
      expect(planeTarget(starter, 'hero').kind).toBe('create')
      expect(planeTarget(starter, 'overlay').kind).toBe('create')
    })

    await it('lands on the ground layer, which has no plane key', async () => {
      expect(targetId(planeTarget(starter, 'ground'))).toBe('layer_0')
    })

    await it('prefers the remembered layer, then the topmost of the plane', async () => {
      const layers = [
        ...starter,
        { ...layer('a', 'A'), plane: 'hero' as const },
        { ...layer('b', 'B'), plane: 'hero' as const },
      ]
      expect(targetId(planeTarget(layers, 'hero'))).toBe('b')
      expect(targetId(planeTarget(layers, 'hero', 'a'))).toBe('a')
      expect(targetId(planeTarget(layers, 'hero', 'gone'))).toBe('b')
    })
  })
}
