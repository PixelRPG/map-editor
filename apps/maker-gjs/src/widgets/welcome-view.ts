import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { SignalScope } from '@pixelrpg/gjs'

import Template from './welcome-view.blp'

export class WelcomeView extends Adw.Bin {
  // GObject internal children
  declare _createButton: Gtk.Button | undefined
  declare _openButton: Gtk.Button | undefined

  private signals = new SignalScope()

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
      WelcomeView,
    )
  }

  vfunc_map(): void {
    super.vfunc_map()
    if (this._createButton) {
      this.signals.connect(this._createButton, 'clicked', () => this.emit('create-project'))
    }
    if (this._openButton) {
      this.signals.connect(this._openButton, 'clicked', () => this.emit('open-project'))
    }
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(WelcomeView.$gtype)
