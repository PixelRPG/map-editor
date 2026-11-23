import { describe, expect, it } from '@gjsify/unit'
import { type Actor, GraphicsGroup, Scene } from 'excalibur'
import { RuntimeModeComponent } from '../components/index.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { EntityDefinition, LayerData } from '../types/data/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { ObjectSpawnSystem } from './object-spawn.system.ts'

const layer: LayerData = { id: 'l1', name: 'L', visible: true, sprites: [] }
const def: EntityDefinition = {
  id: 'spot',
  name: 'Spot',
  components: [{ type: 'trigger', on: 'walk-onto' }],
  editorData: { template: 'trigger' },
}
const mapResource = {
  mapData: {
    tileWidth: 16,
    tileHeight: 16,
    rows: 8,
    columns: 8,
    layers: [layer],
    objectPlacements: [{ id: 'p1', layerId: 'l1', tileX: 1, tileY: 1, inline: def }],
  },
  getSpriteSetResource: () => undefined,
} as unknown as MapResource

export default async () => {
  await describe('ObjectSpawnSystem', async () => {
    // Graphics need a DOM canvas, which only GJS / the browser provide.
    const domAvailable = typeof document !== 'undefined'

    const spawn = (runtime: boolean): Actor | undefined => {
      const scene = new Scene()
      if (runtime) SessionState.set(scene, new RuntimeModeComponent())
      new ObjectSpawnSystem(mapResource).onInitialize(scene.world, scene)
      return scene.actors.find((a) => a.name.endsWith(':p1'))
    }

    await it('draws no editor frame when the scene is built mid-run', async () => {
      if (!domAvailable) return
      const group = spawn(true)?.graphics.current
      expect(group instanceof GraphicsGroup && group.members.length).toBe(0)
    })

    await it('keeps the editor frame and marker in the editor', async () => {
      if (!domAvailable) return
      const group = spawn(false)?.graphics.current
      expect(group instanceof GraphicsGroup && group.members.length).toBe(2)
    })
  })
}
