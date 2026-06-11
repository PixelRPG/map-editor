import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { FloatingCollaborators } from './floating-collaborators'
import { FloatingPlay } from './floating-play'
import { FloatingTopBar } from './floating-top-bar'
import { FloatingZoom } from './floating-zoom'

import Template from './scene-editor.blp'

GObject.type_ensure(FloatingTopBar.$gtype)
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
  declare _zoom_osd: FloatingZoom
  declare _floating_play: FloatingPlay
  declare _floating_collaborators: FloatingCollaborators

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
          'zoom_osd',
          'floating_play',
          'floating_collaborators',
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

  get floatingPlay(): FloatingPlay {
    return this._floating_play
  }

  get floatingCollaborators(): FloatingCollaborators {
    return this._floating_collaborators
  }
}

GObject.type_ensure(SceneEditor.$gtype)
