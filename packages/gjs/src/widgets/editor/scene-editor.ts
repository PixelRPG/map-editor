import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ContextChip } from './context-chip'
import { FloatingToolRail } from './floating-tool-rail'
import { FloatingZoom } from './floating-zoom'

import Template from './scene-editor.blp'

GObject.type_ensure(FloatingToolRail.$gtype)
GObject.type_ensure(FloatingZoom.$gtype)
GObject.type_ensure(ContextChip.$gtype)

/**
 * Scene-editor content surface.
 *
 * Renders the scratchpad-striped backdrop, a centred engine slot, and
 * three OSD overlays — tool rail, zoom pill, context chip.
 *
 * The window header (back button, undo/redo, play, sidebar toggles)
 * lives on the parent view so the right-side context inspector can
 * dock **below** the header rather than alongside it. This widget is
 * pure content.
 */
export class SceneEditor extends Adw.Bin {
  declare _overlay: Gtk.Overlay
  declare _engine_holder: Gtk.Box
  declare _tool_rail: FloatingToolRail
  declare _zoom_osd: FloatingZoom
  declare _context_chip: ContextChip

  private _engineWidget: Gtk.Widget | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSceneEditor',
        Template,
        InternalChildren: ['overlay', 'engine_holder', 'tool_rail', 'zoom_osd', 'context_chip'],
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

  get toolRail(): FloatingToolRail {
    return this._tool_rail
  }

  get zoomOsd(): FloatingZoom {
    return this._zoom_osd
  }

  get contextChip(): ContextChip {
    return this._context_chip
  }
}

GObject.type_ensure(SceneEditor.$gtype)
