import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { WebView } from './webview.ts'
import { Sidebar } from './sidebar.ts'

import Template from './project-view.ui?raw'

export class ProjectView extends Adw.Bin {

    // GObject internal children
    declare _sidebar: Sidebar | undefined
    declare _webView: WebView | undefined
    declare _splitView: Adw.OverlaySplitView | undefined
    declare _showSidebarButton: Gtk.ToggleButton | undefined

    static {
        GObject.registerClass({
            GTypeName: 'ProjectView',
            Template,
            InternalChildren: ['sidebar', 'webView', 'splitView', 'showSidebarButton'],
        }, this);
    }

    constructor() {
        super()
    }

    get webView(): WebView | undefined {
        return this._webView
    }

    get sidebar(): Sidebar | undefined {
        return this._sidebar
    }
} 