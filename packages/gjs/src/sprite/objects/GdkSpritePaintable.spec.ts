import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import { describe, expect, it } from '@gjsify/unit'

import { GdkSpritePaintable } from './GdkSpritePaintable.ts'

function texture(): Gdk.Texture {
  const bytes = new GLib.Bytes(new Uint8Array(4 * 4 * 4))
  return Gdk.MemoryTexture.new(4, 4, Gdk.MemoryFormat.R8G8B8A8, bytes, 16)
}

export default async () => {
  await describe('GdkSpritePaintable.setSource', async () => {
    await it('re-points one instance and invalidates its contents', async () => {
      const sheet = texture()
      const paintable = new GdkSpritePaintable(sheet, 0, 0, 2, 2, { keepAspectRatio: true })
      let invalidations = 0
      GObject.signal_connect(paintable, 'invalidate-contents', () => invalidations++)
      paintable.setSource(sheet, 2, 0, 2, 2)
      expect(invalidations).toBe(1)
      expect(paintable.contentChanges).toBe(1)
      expect(paintable.get_intrinsic_width()).toBe(2)
    })

    await it('does nothing when the source is unchanged', async () => {
      const sheet = texture()
      const paintable = new GdkSpritePaintable(sheet, 0, 0, 2, 2)
      paintable.setSource(sheet, 0, 0, 2, 2)
      expect(paintable.contentChanges).toBe(0)
    })

    await it('reports a size change', async () => {
      const sheet = texture()
      const paintable = new GdkSpritePaintable(sheet, 0, 0, 2, 2)
      let sizes = 0
      GObject.signal_connect(paintable, 'invalidate-size', () => sizes++)
      paintable.setSource(sheet, 0, 0, 2, 4)
      expect(sizes).toBe(1)
      expect(paintable.get_intrinsic_height()).toBe(4)
    })
  })
}
