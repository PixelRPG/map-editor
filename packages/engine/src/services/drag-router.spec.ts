import { describe, expect, it } from '@gjsify/unit'

import type { EditorTool } from '../components/active-tool.component.ts'
import { isBrushTool, resolveDragIntent } from './drag-router.ts'

const base = { editing: true, tool: 'pencil' as EditorTool, layerLocked: false }

export default async () => {
  await describe('resolveDragIntent', async () => {
    await it('strokes with the two continuous tools', async () => {
      expect(resolveDragIntent({ ...base, tool: 'pencil' })).toBe('stroke')
      expect(resolveDragIntent({ ...base, tool: 'eraser' })).toBe('stroke')
    })

    await it('pans with the select tool', async () => {
      // The one the spec names explicitly (TERRAIN.md §6.3): select is
      // how you move the map while a brush is armed.
      expect(resolveDragIntent({ ...base, tool: 'select' })).toBe('pan')
    })

    await it('pans with the point tools', async () => {
      // A dragged bucket would flood-fill once per crossed cell, a
      // dragged object brush would scatter a placement per cell.
      expect(resolveDragIntent({ ...base, tool: 'fill' })).toBe('pan')
      expect(resolveDragIntent({ ...base, tool: 'object' })).toBe('pan')
      expect(resolveDragIntent({ ...base, tool: 'eyedropper' })).toBe('pan')
    })

    await it('pans while the editor is not live', async () => {
      // A Test run: the tools are armed in the chrome but inert, and
      // the drag has to stay the camera pan a run has always had.
      expect(resolveDragIntent({ ...base, editing: false })).toBe('pan')
    })

    await it('pans over a locked layer rather than doing nothing', async () => {
      // Refusing the edit is right (§7.3); refusing the gesture too
      // would leave a map whose active layer is padlocked unscrollable.
      expect(resolveDragIntent({ ...base, layerLocked: true })).toBe('pan')
    })
  })

  await describe('isBrushTool', async () => {
    await it('admits exactly the pencil and the eraser', async () => {
      const tools: EditorTool[] = ['select', 'pencil', 'eraser', 'fill', 'eyedropper', 'object']
      expect(tools.filter(isBrushTool).join(' ')).toBe('pencil eraser')
    })
  })
}
