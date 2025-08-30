import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import Template from './welcome-view.blp'

export class WelcomeView extends Adw.Bin {
  // GObject internal children
  declare _createButton: Gtk.Button | undefined
  declare _openButton: Gtk.Button | undefined

  // Signal management
  private _signalHandlers: number[] = []

  static {
    GObject.registerClass(
      {
        GTypeName: 'WelcomeView',
        Template,
        InternalChildren: ['createButton', 'openButton'],
        Signals: {
          'create-project': {},
          'open-project': {},
        },
      },
      this,
    )
  }

  constructor() {
    super()
  }

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()

    if (this._signalHandlers.length === 0) {
      // Connect button signals
      if (this._createButton) {
        const createHandlerId = this._createButton.connect('clicked', () => {
          this.emit('create-project')
        })
        this._signalHandlers.push(createHandlerId)
      }

      if (this._openButton) {
        const openHandlerId = this._openButton.connect('clicked', () => {
          this.emit('open-project')
        })
        this._signalHandlers.push(openHandlerId)
      }
    }
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    if (this._signalHandlers.length > 0) {
      // Disconnect all signal handlers from their respective objects
      let handlerIndex = 0
      if (this._createButton && handlerIndex < this._signalHandlers.length) {
        this._createButton.disconnect(this._signalHandlers[handlerIndex])
        handlerIndex++
      }
      if (this._openButton && handlerIndex < this._signalHandlers.length) {
        this._openButton.disconnect(this._signalHandlers[handlerIndex])
        handlerIndex++
      }
      this._signalHandlers = []
    }

    super.vfunc_unmap()
  }
}

GObject.type_ensure(WelcomeView.$gtype)
