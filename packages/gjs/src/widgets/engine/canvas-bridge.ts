import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import GLib from '@girs/glib-2.0'
import { Canvas2DBridge } from '@gjsify/canvas2d'
import { WebGLBridge } from '@gjsify/webgl'

/** The two canvas backends the engine widget can host. */
export type CanvasBridge = WebGLBridge | Canvas2DBridge

/**
 * Create the canvas bridge widget the Excalibur engine renders into:
 * a `Gtk.GLArea`-backed WebGL 2 bridge, or the Cairo `Canvas2DBridge`
 * fallback.
 *
 * The WebGL bridge defaults to an opaque framebuffer. Excalibur clears
 * with `Color.Transparent`, but without `has-alpha` the alpha channel is
 * dropped by GLArea before composition — the GTK widgets behind the
 * canvas (the editor scratchpad backdrop) stay invisible. Opting into
 * alpha here lets the canvas composite against the GTK background, and
 * it MUST happen before the area is realized, which is why it runs right
 * after construction and before the widget is parented.
 */
export function createCanvasBridge(useFallback: boolean): CanvasBridge {
  const widget = useFallback ? new Canvas2DBridge() : new WebGLBridge()
  widget.set_hexpand(true)
  widget.set_vexpand(true)
  enableAlpha(widget)
  // The Canvas2D fallback isn't a GLArea — paint over a transparent
  // CSS background so it composites the same way.
  widget.add_css_class('engine-canvas')
  return widget
}

function enableAlpha(widget: CanvasBridge): void {
  const setter = (widget as { set_has_alpha?: (v: boolean) => void }).set_has_alpha
  if (typeof setter === 'function') {
    setter.call(widget, true)
    return
  }
  // Fallback for GIR bindings that expose the GObject property directly
  // instead of the explicit setter; not every binding lets it be set.
  try {
    ;(widget as unknown as { has_alpha?: boolean }).has_alpha = true
  } catch {
    // Property may not be settable in this binding; ignore.
  }
}

/**
 * `gl.readPixels` + row flip + PNG encode. Only valid INSIDE a frame
 * (`postdraw`): GTK's GLArea framebuffer is bound only during ::render,
 * and an out-of-frame read returns blanks.
 */
export function readFramebufferPng(gl: WebGL2RenderingContext): Uint8Array | null {
  const width = gl.drawingBufferWidth
  const height = gl.drawingBufferHeight
  if (width <= 0 || height <= 0) return null

  const rowBytes = width * 4
  const pixels = new Uint8Array(rowBytes * height)
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

  const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
    GLib.Bytes.new(flipRows(pixels, rowBytes, height)),
    GdkPixbuf.Colorspace.RGB,
    true,
    8,
    width,
    height,
    rowBytes,
  )
  const [ok, buffer] = pixbuf.save_to_bufferv('png', [], [])
  return ok && buffer ? new Uint8Array(buffer) : null
}

/** GL rows come out bottom-up — flip them into GdkPixbuf's top-down order. */
function flipRows(pixels: Uint8Array, rowBytes: number, height: number): Uint8Array {
  const flipped = new Uint8Array(pixels.length)
  for (let y = 0; y < height; y++) {
    flipped.set(pixels.subarray(y * rowBytes, (y + 1) * rowBytes), (height - 1 - y) * rowBytes)
  }
  return flipped
}
