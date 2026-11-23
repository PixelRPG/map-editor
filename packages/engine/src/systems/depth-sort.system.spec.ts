import { describe, expect, it } from '@gjsify/unit'
import { Actor, Scene } from 'excalibur'
import { DepthSortComponent } from '../components/depth-sort.component.ts'
import { SpriteRefComponent } from '../components/sprite-ref.component.ts'
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

    await it('takes the hero foot from his sprite, not from his 8 px foot collider', async () => {
      const scene = new Scene()
      const system = new DepthSortSystem(mapResource)
      system.onInitialize(scene.world, scene)
      // Sign one tile south of the hero's centre: foot at y 168 + 8 = 176.
      const sign = new Actor({ x: 80, y: 168, width: 16, height: 16 })
      applyActorDepth(sign, 'hero', HEIGHT)
      // 16x32 sprite, box shrunk to the foot collider like PlayerSystem does.
      const hero = new Actor({ x: 80, y: 160, width: 16, height: 8 })
      hero.addComponent(new MovementComponent(4))
      applyActorDepth(hero, 'hero', HEIGHT, 0, 16)
      scene.add(sign)
      scene.add(hero)
      // Hero foot 176 equals the sign's foot 176: spawn order decides, not a
      // 4 px offset that would put the hero 12 px short and behind the sign.
      expect(hero.z).toBe(sign.z)
      hero.pos.y = 164
      system.onUpdate(16)
      expect(hero.z).toBeGreaterThan(sign.z)
      // North of the sign: the sign draws over him.
      hero.pos.y = 140
      system.onUpdate(16)
      expect(hero.z).toBeLessThan(sign.z)
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

    await it('pins a visual with a depth override and leaves it unmarked', async () => {
      const behind = new Actor({ x: 80, y: 300, width: 16, height: 16 })
      behind.addComponent(new SpriteRefComponent('s', 0, undefined, 'behind'))
      applyActorDepth(behind, 'hero', HEIGHT)
      const { hero, tree } = rig()
      expect(behind.has(DepthSortComponent)).toBe(false)
      expect(behind.z).toBeLessThan(hero.z)
      expect(behind.z).toBeLessThan(tree.z)
      expect(behind.z).toBeGreaterThan(zFor('hero'))

      const front = new Actor({ x: 80, y: 0, width: 16, height: 16 })
      front.addComponent(new SpriteRefComponent('s', 0, undefined, 'in-front'))
      applyActorDepth(front, 'hero', HEIGHT)
      expect(front.z).toBeGreaterThan(tree.z)
      expect(front.z).toBeLessThan(zFor('overlay'))
    })

    await it('re-applies the sort when the override goes back to sorted', async () => {
      const a = new Actor({ x: 80, y: 100, width: 16, height: 16 })
      const ref = new SpriteRefComponent('s', 0, undefined, 'behind')
      a.addComponent(ref)
      applyActorDepth(a, 'hero', HEIGHT)
      ref.depth = 'sorted'
      applyActorDepth(a, 'hero', HEIGHT)
      expect(a.has(DepthSortComponent)).toBe(true)
      expect(a.z).toBeGreaterThan(zFor('hero') + 1)
    })
  })
}
