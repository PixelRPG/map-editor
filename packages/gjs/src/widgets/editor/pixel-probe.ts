import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

/**
 * The rig behind every display-backed pixel probe in this package:
 * render a widget through a real GSK renderer and read individual
 * pixels back out of the resulting texture.
 *
 * A geometry module says where a drawn element *should* land; a probe
 * spec proves the rendered pixels agree. Both the depth glyph and the
 * brush badge make that kind of claim, so the window pumping, the
 * texture download and the colour predicates live here once rather than
 * being copied per widget.
 *
 * GTK-only. Every consumer is loaded through a dynamic `import()` from
 * its spec, so the node test bundle never evaluates this module.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Whether a display is reachable — `false` headless (CI), `true` on a workstation. */
export function hasDisplay(): boolean {
  return Gtk.init_check()
}

/** The directory named by `envVar` to drop rendered PNGs into, or `null`. */
export function pngDir(envVar: string): string | null {
  return GLib.getenv(envVar)
}

/** Max channel minus min channel: 0 for any grey, large for a saturated colour. */
export function chroma({ r, g, b }: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

/** Perceived brightness, for "is this near-white" style assertions. */
export function luminance({ r, g, b }: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Random access to one rendered square's pixels. */
export interface PixelReader {
  at(x: number, y: number): Rgb
}

/** Spin the main loop until `until()` holds, or throw after five seconds. */
export function pumpUntil(until: () => boolean, what: string): void {
  const ctx = GLib.MainContext.default()
  const deadline = GLib.get_monotonic_time() + 5_000_000
  while (!until()) {
    if (GLib.get_monotonic_time() > deadline) throw new Error(`${what} never became ready`)
    ctx.iteration(true)
  }
  // Let CSS and the first frame settle before reading the node back.
  for (let i = 0; i < 3; i++) ctx.iteration(false)
}

/**
 * Render `build()`'s widget at `size × size` inside a bare mapped window
 * — mapped, so the widget has a real allocation and a resolved style —
 * and hand back a pixel reader. Writes the square to `pngPath` for the
 * eye when given. The window is destroyed before returning.
 */
export function renderSquare(build: () => Gtk.Widget, size: number, pngPath?: string): PixelReader {
  const widget = build()
  const window = new Gtk.Window({ default_width: size, default_height: size, decorated: false })
  window.set_child(widget)
  window.present()
  pumpUntil(() => widget.get_mapped() && widget.get_width() >= size, 'probe window')

  const renderer = window.get_renderer()
  if (!renderer) throw new Error('probe window has no renderer')
  const texture = renderWidget(renderer, widget, size)
  if (pngPath) texture.save_to_png(pngPath)
  const reader = readerFor(texture)
  window.destroy()
  return reader
}

/** Snapshot `widget` at `size × size` through `renderer`. */
export function renderWidget(renderer: Gsk_Renderer, widget: Gtk.Widget, size: number): Gdk.Texture {
  const paintable = Gtk.WidgetPaintable.new(widget)
  const snapshot = Gtk.Snapshot.new()
  paintable.snapshot(snapshot, size, size)
  const node = snapshot.to_node()
  if (!node) throw new Error('widget snapshot is empty')
  const viewport = new Graphene.Rect()
  viewport.init(0, 0, size, size)
  return renderer.render_texture(node, viewport)
}

/** The subset of `Gsk.Renderer` this module needs, so `gi://Gsk` stays out of the imports. */
interface Gsk_Renderer {
  render_texture(node: unknown, viewport: Graphene.Rect): Gdk.Texture
}

/** Download a texture once and index into it by pixel. */
export function readerFor(texture: Gdk.Texture): PixelReader {
  const downloader = Gdk.TextureDownloader.new(texture)
  downloader.set_format(Gdk.MemoryFormat.R8G8B8A8)
  const [bytes, stride] = downloader.download_bytes()
  const data = bytes.toArray()
  return {
    at(x: number, y: number): Rgb {
      const o = y * stride + x * 4
      return { r: data[o], g: data[o + 1], b: data[o + 2] }
    },
  }
}

/**
 * A flat, fully-opaque paintable in one colour — a stand-in tile sprite,
 * so a probe spec needs no fixture PNG on disk.
 */
export function solidPaintable(size: number, rgb: Rgb): Gdk.Paintable {
  const snapshot = Gtk.Snapshot.new()
  const rect = new Graphene.Rect()
  rect.init(0, 0, size, size)
  snapshot.append_color(new Gdk.RGBA({ red: rgb.r / 255, green: rgb.g / 255, blue: rgb.b / 255, alpha: 1 }), rect)
  const node = snapshot.to_node()
  if (!node) throw new Error('solid paintable snapshot is empty')
  const window = new Gtk.Window({ default_width: size, default_height: size, decorated: false })
  window.present()
  pumpUntil(() => window.get_mapped(), 'paintable window')
  const renderer = window.get_renderer()
  if (!renderer) throw new Error('paintable window has no renderer')
  const texture = renderer.render_texture(node, rect)
  window.destroy()
  return texture
}
