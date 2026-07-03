import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { FloatingCollaborators } from './floating-collaborators'
import { FloatingPlay } from './floating-play'
import { FloatingToolRail } from './floating-tool-rail'
import { FloatingTopBar } from './floating-top-bar'
import { FloatingZoom } from './floating-zoom'

import Template from './scene-editor.blp'

GObject.type_ensure(FloatingTopBar.$gtype)
GObject.type_ensure(FloatingToolRail.$gtype)
GObject.type_ensure(FloatingZoom.$gtype)
GObject.type_ensure(FloatingPlay.$gtype)
GObject.type_ensure(FloatingCollaborators.$gtype)

/**
 * Scene-editor content surface.
 *
 * Renders the scratchpad-striped backdrop, a centred engine slot, and
 * three OSD overlays — merged top bar (navigation / history / tool /
 * tile + layer / inspector), zoom pill (bottom left), and the play
 * button (bottom right).
 *
 * This widget is pure content. Window chrome (header bar) lives on
 * the parent view, with all "where am I?" and primary-action controls
 * floating over the canvas via the OSD overlays — the Gradia-pattern
 * "no chrome, controls float over the artwork" feel.
 */
export class SceneEditor extends Adw.Bin {
  declare _overlay: Gtk.Overlay
  declare _engine_holder: Gtk.Box
  declare _top_bar: FloatingTopBar
  declare _tool_rail: FloatingToolRail
  declare _zoom_osd: FloatingZoom
  declare _floating_play: FloatingPlay
  declare _floating_collaborators: FloatingCollaborators
  declare _bottom_left_osds: Gtk.Box

  private _engineWidget: Gtk.Widget | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSceneEditor',
        Template,
        InternalChildren: [
          'overlay',
          'engine_holder',
          'top_bar',
          'tool_rail',
          'zoom_osd',
          'floating_play',
          'floating_collaborators',
          'bottom_left_osds',
        ],
      },
      SceneEditor,
    )
  }

  /** Inject the host engine widget into the centred scratchpad slot. */
  setEngine(widget: Gtk.Widget | null): void {
    if (this._engineWidget) {
      this._engine_holder.remove(this._engineWidget)
      this._engineWidget = null
    }
    if (widget) {
      this._engine_holder.append(widget)
      this._engineWidget = widget
    }
  }

  get zoomOsd(): FloatingZoom {
    return this._zoom_osd
  }

  get topBar(): FloatingTopBar {
    return this._top_bar
  }

  get toolRail(): FloatingToolRail {
    return this._tool_rail
  }

  /**
   * Reflow the tool rail for phone widths: a horizontal bottom bar
   * (compact) instead of the vertical left rail, with the bottom-left
   * OSD stack + Play button lifted above it so nothing overlaps. Driven
   * by `SceneEditorView` on the `inspector-collapsed` (<768sp)
   * breakpoint; a widget-internal `Adw.BreakpointBin` can't observe the
   * narrow width because the engine canvas keeps this overlay wide.
   */
  setCompact(compact: boolean): void {
    const rail = this._tool_rail
    rail.compact = compact
    if (compact) {
      // Centred pill (not FILL): the rail sizes to its six natural-width
      // tool columns and centres at the bottom, so nothing overflows /
      // clips at phone width.
      rail.set_halign(Gtk.Align.CENTER)
      rail.set_valign(Gtk.Align.END)
      rail.set_margin_top(0)
      rail.set_margin_start(0)
      rail.set_margin_end(0)
      rail.set_margin_bottom(0)
      this._bottom_left_osds.set_margin_bottom(76)
      this._floating_play.set_margin_bottom(76)
    } else {
      rail.set_halign(Gtk.Align.START)
      rail.set_valign(Gtk.Align.START)
      rail.set_margin_top(64)
      rail.set_margin_start(12)
      rail.set_margin_end(0)
      rail.set_margin_bottom(0)
      this._bottom_left_osds.set_margin_bottom(12)
      this._floating_play.set_margin_bottom(12)
    }
  }

  get floatingPlay(): FloatingPlay {
    return this._floating_play
  }

  get floatingCollaborators(): FloatingCollaborators {
    return this._floating_collaborators
  }
}

GObject.type_ensure(SceneEditor.$gtype)
