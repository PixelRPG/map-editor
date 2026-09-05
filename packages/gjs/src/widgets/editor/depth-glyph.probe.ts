import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'
import { DepthGlyph } from './depth-glyph.ts'
import { depthGlyphProbes, GLYPH_PLANES, type GlyphPlane } from './depth-glyph.geometry.ts'

/**
 * Display-backed half of the glyph's "distinguishable at 14 px" claim:
 * render a real `PixelRpgDepthGlyph` through the window's GSK renderer
 * and read the three probe pixels of `depth-glyph.geometry.ts` back.
 * `depth-glyph.geometry.spec.ts` proves the probes cannot overlap on
 * paper; this proves the rendered pixels carry the colour where the
 * paper says. GTK-only — `depth-glyph.probe.spec.ts` loads this module
 * lazily so the node test bundle never evaluates it.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface GlyphProbeResult {
  plane: GlyphPlane
  size: number
  /** The probe pixel of every plane's element, for the glyph highlighting `plane`. */
  pixels: Record<GlyphPlane, Rgb>
}

/** Whether a display is reachable — `false` headless (CI), `true` on a workstation. */
export function hasDisplay(): boolean {
  return Gtk.init_check()
}

/** Directory to drop the rendered squares into (`DEPTH_GLYPH_PNG_DIR`), or `null` to render in memory only. */
export function pngDir(): string | null {
  return GLib.getenv('DEPTH_GLYPH_PNG_DIR')
}

/** Max channel minus min channel: 0 for any grey, large for the three plane colours. */
export function chroma({ r, g, b }: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

/**
 * Render one glyph state at `size` inside a bare window (mapped, so
 * the widget has a real allocation and style) and sample the probes.
 * Writes the rendered square to `pngPath` when given, for the eye.
 */
export function renderGlyphProbe(plane: GlyphPlane, size: number, pngPath?: string): GlyphProbeResult {
  const glyph = new DepthGlyph({ plane, size })
  const window = new Gtk.Window({ default_width: size, default_height: size, decorated: false })
  window.set_child(glyph)
  window.present()

  const ctx = GLib.MainContext.default()
  const deadline = GLib.get_monotonic_time() + 5_000_000
  while (!glyph.get_mapped() || glyph.get_width() < size) {
    if (GLib.get_monotonic_time() > deadline) throw new Error('depth glyph window never mapped')
    ctx.iteration(true)
  }
  // Let CSS + the first frame settle before reading the node back.
  for (let i = 0; i < 3; i++) ctx.iteration(false)

  const renderer = window.get_renderer()
  if (!renderer) throw new Error('window has no renderer')
  const paintable = Gtk.WidgetPaintable.new(glyph)
  const snapshot = Gtk.Snapshot.new()
  paintable.snapshot(snapshot, size, size)
  const node = snapshot.to_node()
  if (!node) throw new Error('glyph snapshot is empty')
  const viewport = new Graphene.Rect()
  viewport.init(0, 0, size, size)
  const texture = renderer.render_texture(node, viewport)
  if (pngPath) texture.save_to_png(pngPath)

  const downloader = Gdk.TextureDownloader.new(texture)
  downloader.set_format(Gdk.MemoryFormat.R8G8B8A8)
  const [bytes, stride] = downloader.download_bytes()
  const data = bytes.toArray()
  const probes = depthGlyphProbes(size)
  const pixels = {} as Record<GlyphPlane, Rgb>
  for (const p of GLYPH_PLANES) {
    const { x, y } = probes[p]
    const o = y * stride + x * 4
    pixels[p] = { r: data[o], g: data[o + 1], b: data[o + 2] }
  }
  window.destroy()
  return { plane, size, pixels }
}
