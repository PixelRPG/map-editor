import { describe, expect, it } from '@gjsify/unit'
import { Actor, Scene } from 'excalibur'
import { DepthSortComponent } from '../components/depth-sort.component.ts'
import { MovementComponent } from '../components/movement.component.ts'
import { zFor } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { applyActorDepth } from '../services/actor-depth.ts'
import { DepthSortSystem } from './depth-sort.system.ts'

const mapResource = { mapData: { rows: 20, tileHeight: 16 } } as unknown as MapResource
const HEIGHT = 20 * 16

function rig() {
  const scene = new Scene()
  const system = new DepthSortSystem(mapResource)
  system.onInitialize(scene.world, scene)
  const tree = new Actor({ x: 80, y: 120, width: 16, height: 16 })
  applyActorDepth(tree, 'hero', HEIGHT)
  const hero = new Actor({ x: 80, y: 40, width: 16, height: 32 })
  hero.addComponent(new MovementComponent(4))
  applyActorDepth(hero, 'hero', HEIGHT)
  scene.add(tree)
  scene.add(hero)
  return { scene, system, tree, hero }
}

export default async () => {
  await describe('DepthSortSystem', async () => {
    await it('draws a placement over the hero standing north of it', async () => {
      const { hero, tree } = rig()
      expect(tree.z).toBeGreaterThan(hero.z)
    })

    await it('draws the hero over a placement once he walks south of it', async () => {
      const { system, hero, tree } = rig()
      hero.pos.y = 200
      system.onUpdate(16)
      expect(hero.z).toBeGreaterThan(tree.z)
    })

    await it('writes z only when y changed', async () => {
      const { system, hero } = rig()
      hero.z = 12345
      system.onUpdate(16)
      expect(hero.z).toBe(12345)
    })

    await it('does not visit standing things', async () => {
      const { system, tree } = rig()
      const z = tree.z
      tree.pos.y = 300
      system.onUpdate(16)
      expect(tree.z).toBe(z)
    })

    await it('keeps off-hero-plane actors flat and unmarked', async () => {
      const a = new Actor({ x: 0, y: 500, width: 16, height: 16 })
      applyActorDepth(a, 'overlay', HEIGHT)
      expect(a.z).toBe(zFor('overlay'))
      expect(a.has(DepthSortComponent)).toBe(false)
    })
  })
}
