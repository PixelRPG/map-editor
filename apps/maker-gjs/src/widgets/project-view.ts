import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { GjsEngine } from '@pixelrpg/engine-gjs'
import { Sidebar } from './sidebar.ts'

import Template from './project-view.ui?raw'

export class ProjectView extends Adw.Bin {

    // GObject internal children
    declare _sidebar: Sidebar | undefined
    declare _gjsEngine: GjsEngine | undefined
    declare _splitView: Adw.OverlaySplitView | undefined
    declare _showSidebarButton: Gtk.ToggleButton | undefined

    static {
        GObject.registerClass({
            GTypeName: 'ProjectView',
            Template,
            InternalChildren: ['sidebar', 'gjsEngine', 'splitView', 'showSidebarButton'],
            Signals: {
                'ready': {},
            },
        }, this);
    }

    constructor() {
        super()

        // Connect to the message-received signal from the EngineView
        this._gjsEngine?.connect('message-received', (_source: GjsEngine, message: string) => {
            console.log('[ProjectView] Message received from engine:', message)
        })

        this._gjsEngine?.connect('ready', () => {
            console.log('[ProjectView] Ready')
            this.emit('ready')
        })
    }

    /**
     * Get the engine view
     */
    get gjsEngine(): GjsEngine | undefined {
        return this._gjsEngine
    }

    /**
     * Get the sidebar
     */
    get sidebar(): Sidebar | undefined {
        return this._sidebar
    }
}

GObject.type_ensure(ProjectView.$gtype)