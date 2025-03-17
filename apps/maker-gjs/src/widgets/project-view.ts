import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { Engine } from '@pixelrpg/engine-gjs'
import { Sidebar } from './sidebar.ts'

import Template from './project-view.ui?raw'

export class ProjectView extends Adw.Bin {

    // GObject internal children
    declare _sidebar: Sidebar | undefined
    declare _engine: Engine | undefined
    declare _splitView: Adw.OverlaySplitView | undefined
    declare _showSidebarButton: Gtk.ToggleButton | undefined

    static {
        GObject.registerClass({
            GTypeName: 'ProjectView',
            Template,
            InternalChildren: ['sidebar', 'engine', 'splitView', 'showSidebarButton'],
            Signals: {
                'ready': {},
            },
        }, this);
    }

    constructor() {
        super()

        // Connect to the message-received signal from the EngineView
        this._engine?.connect('message-received', (_source: Engine, message: string) => {
            // console.log('[ProjectView] Message received from engine:', message)
        })

        this._engine?.connect('ready', () => {
            console.log('[ProjectView] Ready')
            this.emit('ready')
        })
    }

    /**
     * Get the engine view
     */
    get engine(): Engine | undefined {
        return this._engine
    }

    /**
     * Get the sidebar
     */
    get sidebar(): Sidebar | undefined {
        return this._sidebar
    }
}

GObject.type_ensure(ProjectView.$gtype)