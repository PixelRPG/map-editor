import { describe, expect, it } from '@gjsify/unit'
import { Scene, TileMap } from 'excalibur'
import { ActiveToolComponent } from '../components/active-tool.component.ts'
import { ZoomLimitsComponent } from '../components/zoom-limits.component.ts'
import { SessionState } from '../utils/session-state.ts'
import { createHoverDotActor, hoverUsesDot, refreshHoverDot, toolHasHoverPreview } from './hover-dot.ts'

export default async () => {
  await describe('hover dot', async () => {
    // Canvas graphics need a DOM: present under GJS, absent on a bare Node run.
    const domAvailable = typeof document !== 'undefined'
    const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 })

    it('follows the same flag as the placements', () => {
      const scene = new Scene()
      expect(hoverUsesDot(scene)).toBe(false)
      SessionState.set(scene, new ZoomLimitsComponent(0.2, 8, true))
      expect(hoverUsesDot(scene)).toBe(true)
      SessionState.get(scene, ZoomLimitsComponent)!.dots = false
      expect(hoverUsesDot(scene)).toBe(false)
    })

    it('the eyedropper previews nothing, every other tool does', () => {
      expect(toolHasHoverPreview('eyedropper')).toBe(false)
      for (const t of ['select', 'pencil', 'fill', 'eraser', 'object']) expect(toolHasHoverPreview(t)).toBe(true)
    })

    it('sits on the centre of the hovered tile and reuses its graphic', () => {
      if (!domAvailable) return
      const scene = new Scene()
      SessionState.set(scene, new ActiveToolComponent('pencil'))
      const actor = createHoverDotActor()
      refreshHoverDot(actor, scene, { tileMap, coords: { x: 2, y: 1 } })
      expect(actor.graphics.isVisible).toBe(true)
      expect(actor.pos.x).toBe(40)
      expect(actor.pos.y).toBe(24)
      const graphic = actor.graphics.current
      refreshHoverDot(actor, scene, { tileMap, coords: { x: 0, y: 0 } })
      expect(actor.graphics.current).toBe(graphic)
      expect(actor.pos.x).toBe(8)
    })

    it('hides off the map and for the eyedropper', () => {
      if (!domAvailable) return
      const scene = new Scene()
      const actor = createHoverDotActor()
      refreshHoverDot(actor, scene, { tileMap, coords: { x: 0, y: 0 } })
      expect(actor.graphics.isVisible).toBe(true)
      refreshHoverDot(actor, scene, null)
      expect(actor.graphics.isVisible).toBe(false)
      SessionState.set(scene, new ActiveToolComponent('eyedropper'))
      refreshHoverDot(actor, scene, { tileMap, coords: { x: 0, y: 0 } })
      expect(actor.graphics.isVisible).toBe(false)
    })
  })
}
