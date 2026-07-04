import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

import {
  frameAtTime,
  frameSpans,
  frameStartTime,
  timeForX,
  totalDuration,
  xForTime,
} from './animation-timeline.geometry.ts'

/** Track height (px) — a single compact lane under the sequence chips. */
const MIN_HEIGHT = 30
const NAT_HEIGHT = 34
const NAT_WIDTH = 240
const MIN_WIDTH = 80
/** Playhead line thickness (px). */
const PLAYHEAD_WIDTH = 2
/** Playhead knob half-width (px) — the little grab handle at the top. */
const KNOB_HALF = 5
const KNOB_HEIGHT = 6

const ACCENT_FALLBACK = '#3584e4'

/**
 * A ruler + scrubbing playhead for the animation editor's frame sequence —
 * the `soll-anim-editor` timeline lane. Draws the sequence as time-
 * proportional segments (a 400 ms frame is twice as wide as a 200 ms one),
 * boundary ticks between frames, the currently-playing frame highlighted,
 * and a draggable playhead. `Gtk.Picture`/a plain `Box` can't do the
 * proportional axis + overlaid playhead, so this is a `vfunc_snapshot`
 * widget (geometry in {@link ./animation-timeline.geometry.ts}, unit-tested).
 *
 * Host drives it: {@link setFrames} on sequence change, {@link setPlayheadFrame}
 * from the playback tick. It emits `scrubbed` (a time in ms) when the user
 * drags/taps the lane, so the host can pause playback + jump the preview to
 * that frame.
 */
export class AnimationTimeline extends Gtk.Widget {
  /** Per-frame durations (ms), in sequence order. */
  private _durations: number[] = []
  /** Playhead position in ms. */
  private _playheadTime = 0
  private _accent: Gdk.RGBA

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgAnimationTimeline',
        Signals: {
          // The user scrubbed the playhead (drag or tap) — payload is
          // the new playhead time in ms.
          scrubbed: { param_types: [GObject.TYPE_DOUBLE] },
        },
      },
      AnimationTimeline,
    )
  }

  constructor() {
    super()
    this._accent = new Gdk.RGBA()
    this._accent.parse(ACCENT_FALLBACK)
    this.set_hexpand(true)

    // A single drag gesture covers both a tap (drag-begin fires on press)
    // and a scrub (drag-update as the pointer moves). No separate click
    // gesture needed — a plain press scrubs to the press point.
    const drag = new Gtk.GestureDrag()
    drag.connect('drag-begin', (_g: Gtk.GestureDrag, startX: number) => this._scrubTo(startX))
    drag.connect('drag-update', (g: Gtk.GestureDrag) => {
      const [ok, startX] = g.get_start_point()
      const [, offsetX] = g.get_offset()
      if (ok) this._scrubTo(startX + offsetX)
    })
    this.add_controller(drag)
  }

  /** Replace the per-frame durations (ms). Keeps the playhead in range. */
  setFrames(durations: number[]): void {
    this._durations = durations
    const total = totalDuration(durations)
    if (this._playheadTime > total) this._playheadTime = 0
    this.queue_draw()
  }

  /** Position the playhead at an absolute time (ms). */
  setPlayheadTime(ms: number): void {
    this._playheadTime = Math.max(0, ms)
    this.queue_draw()
  }

  /** Position the playhead at the start of frame `index` (playback tick). */
  setPlayheadFrame(index: number): void {
    this.setPlayheadTime(frameStartTime(this._durations, index))
  }

  get playheadTime(): number {
    return this._playheadTime
  }

  private _scrubTo(x: number): void {
    const width = this.get_width()
    if (width <= 0 || this._durations.length === 0) return
    const t = timeForX(x, this._durations, width)
    this._playheadTime = t
    this.queue_draw()
    this.emit('scrubbed', t)
  }

  vfunc_measure(orientation: Gtk.Orientation, _forSize: number): [number, number, number, number] {
    if (orientation === Gtk.Orientation.VERTICAL) return [MIN_HEIGHT, NAT_HEIGHT, -1, -1]
    return [MIN_WIDTH, NAT_WIDTH, -1, -1]
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const width = this.get_width()
    const height = this.get_height()
    if (width <= 0 || height <= 0) return

    const fg = this.get_color()
    const accent = this._lookupAccent()

    // Track background — a faint wash of the foreground colour so it
    // reads on both light + dark themes without a hardcoded colour.
    snapshot.append_color(this._tint(fg, 0.06), this._rect(0, 0, width, height))

    if (this._durations.length === 0) return

    const spans = frameSpans(this._durations)
    const currentIndex = frameAtTime(this._durations, this._playheadTime)

    for (const span of spans) {
      const x0 = xForTime(span.start, this._durations, width)
      const x1 = xForTime(span.end, this._durations, width)
      // Highlight the frame the playhead is over.
      if (span.index === currentIndex) {
        snapshot.append_color(this._tint(accent, 0.22), this._rect(x0, 0, Math.max(0, x1 - x0), height))
      }
      // Boundary tick before every frame except the first.
      if (span.index > 0) {
        snapshot.append_color(this._tint(fg, 0.28), this._rect(x0, 0, 1, height))
      }
    }

    // Playhead: a full-height accent line with a small knob on top.
    const px = xForTime(this._playheadTime, this._durations, width)
    const lineX = Math.max(0, Math.min(px - PLAYHEAD_WIDTH / 2, width - PLAYHEAD_WIDTH))
    snapshot.append_color(accent, this._rect(lineX, 0, PLAYHEAD_WIDTH, height))
    const knobX = Math.max(0, Math.min(px - KNOB_HALF, width - KNOB_HALF * 2))
    snapshot.append_color(accent, this._rect(knobX, 0, KNOB_HALF * 2, KNOB_HEIGHT))
  }

  private _rect(x: number, y: number, w: number, h: number): Graphene.Rect {
    const rect = new Graphene.Rect()
    rect.init(x, y, w, h)
    return rect
  }

  /** A copy of `base` at a fixed alpha (theme-adaptive tint helper). */
  private _tint(base: Gdk.RGBA, alpha: number): Gdk.RGBA {
    const c = new Gdk.RGBA()
    c.red = base.red
    c.green = base.green
    c.blue = base.blue
    c.alpha = alpha
    return c
  }

  /** Resolve the theme accent, falling back to the cached blue. */
  private _lookupAccent(): Gdk.RGBA {
    try {
      const [found, color] = this.get_style_context().lookup_color('accent_bg_color')
      if (found) {
        this._accent = color
        return color
      }
    } catch {
      /* lookup_color deprecated on newer GTK — use the fallback. */
    }
    return this._accent
  }
}

GObject.type_ensure(AnimationTimeline.$gtype)
