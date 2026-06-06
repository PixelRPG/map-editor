import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

/**
 * Render a GTK widget — typically the top-level window — to PNG bytes,
 * fully in-process via the GSK renderer. No external screenshot tools,
 * no compositor portal: the widget's own `Gsk.Renderer` rasterises a
 * `Gtk.WidgetPaintable` snapshot to a `Gdk.Texture`, which we serialise
 * to PNG.
 *
 * Returns `null` when the widget isn't realised yet (no renderer or zero
 * size) so callers can surface a clear "not ready" error instead of
 * emitting an empty image.
 *
 * Caveat: capturing a `Gtk.GLArea` (the engine's WebGL canvas) this way
 * relies on the active GSK renderer compositing GL content into the
 * offscreen render. The NGL / Vulkan renderers do; if a stack ever
 * returns a blank canvas region here, capture the engine widget on its
 * own (`scope: 'canvas'`) as a fallback.
 */
export function captureWidgetPng(widget: Gtk.Widget): Uint8Array | null {
  const native = widget.get_native()
  const renderer = native?.get_renderer()
  if (!renderer) return null

  const width = widget.get_width()
  const height = widget.get_height()
  if (width <= 0 || height <= 0) return null

  const paintable = Gtk.WidgetPaintable.new(widget)
  const snapshot = Gtk.Snapshot.new()
  paintable.snapshot(snapshot, width, height)
  const node = snapshot.to_node()
  if (!node) return null

  const viewport = new Graphene.Rect()
  viewport.init(0, 0, width, height)
  const texture = renderer.render_texture(node, viewport)

  const data = texture.save_to_png_bytes().get_data()
  return data ? new Uint8Array(data) : null
}
