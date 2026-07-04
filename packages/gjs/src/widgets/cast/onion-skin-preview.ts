import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

/** Ghost (neighbour-frame) opacity when onion-skinning is on. */
const GHOST_ALPHA = 0.28

/**
 * Animation preview that draws the current frame with optional
 * **onion-skin** ghosts of the previous + next frames behind it — the
 * `soll-anim-editor` affordance a plain `Gtk.Picture` can't do (it can
 * only show one paintable). Each frame is a `Gdk.Paintable` (a sprite
 * region); `vfunc_snapshot` contain-fits every frame into the widget and
 * layers the neighbours at reduced opacity.
 *
 * Host drives it: {@link setFrames} on sequence change, {@link setCurrentIndex}
 * from the playback timer, {@link setOnion} from the onion toggle.
 */
export class OnionSkinPreview extends Gtk.Widget {
  /** Frame paintables in sequence order; `null` = a frame whose sprite didn't resolve. */
  private _frames: (Gdk.Paintable | null)[] = []
  private _index = 0
  private _onion = true

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgOnionSkinPreview' }, OnionSkinPreview)
  }

  /** Replace the frame paintables (in sequence order; `null` slots are skipped when drawing). */
  setFrames(frames: (Gdk.Paintable | null)[]): void {
    this._frames = frames
    if (this._index >= frames.length) this._index = 0
    this.queue_draw()
  }

  /** Set which frame is the "current" (fully-opaque, foreground) one. */
  setCurrentIndex(index: number): void {
    if (index === this._index) return
    this._index = index
    this.queue_draw()
  }

  get onion(): boolean {
    return this._onion
  }

  /** Toggle onion-skin ghosts of the neighbouring frames. */
  setOnion(on: boolean): void {
    if (on === this._onion) return
    this._onion = on
    this.queue_draw()
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const frames = this._frames
    if (frames.length === 0) return
    const width = this.get_width()
    const height = this.get_height()
    if (width <= 0 || height <= 0) return

    const index = Math.min(this._index, frames.length - 1)
    const current = frames[index]

    const drawFrame = (paintable: Gdk.Paintable | null, alpha: number): void => {
      if (!paintable) return
      const iw = paintable.get_intrinsic_width() || width
      const ih = paintable.get_intrinsic_height() || height
      const scale = Math.min(width / iw, height / ih)
      const dw = iw * scale
      const dh = ih * scale
      const offset = new Graphene.Point()
      offset.init((width - dw) / 2, (height - dh) / 2)
      snapshot.push_opacity(alpha)
      snapshot.save()
      snapshot.translate(offset)
      paintable.snapshot(snapshot, dw, dh)
      snapshot.restore()
      snapshot.pop()
    }

    // Ghost the neighbours first (behind), then the current frame on top.
    if (this._onion && frames.length > 1) {
      const prev = frames[(index - 1 + frames.length) % frames.length]
      const next = frames[(index + 1) % frames.length]
      if (prev !== current) drawFrame(prev, GHOST_ALPHA)
      if (next !== current) drawFrame(next, GHOST_ALPHA)
    }
    drawFrame(current, 1)
  }
}

GObject.type_ensure(OnionSkinPreview.$gtype)
