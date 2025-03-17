import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import Template from './welcome-view.ui?raw'

export class WelcomeView extends Adw.Bin {

    // GObject internal children
    declare _createButton: Gtk.Button | undefined
    declare _openButton: Gtk.Button | undefined

    static {
        GObject.registerClass({
            GTypeName: 'WelcomeView',
            Template,
            InternalChildren: ['createButton', 'openButton'],
            Signals: {
                'create-project': {},
                'open-project': {},
            },
        }, this);
    }

    constructor() {
        super()

        // Connect button signals
        this._createButton?.connect('clicked', () => {
            this.emit('create-project')
        })

        this._openButton?.connect('clicked', () => {
            this.emit('open-project')
        })
    }
}

GObject.type_ensure(WelcomeView.$gtype)