import GObject from '@girs/gobject-2.0';
import Adw from '@girs/adw-1';
import Gtk from "@girs/gtk-4.0";
import GLib from '@girs/glib-2.0';
import WebKit from '@girs/webkit-6.0';

import { WebView } from './webview.ts';
import WindowTemplate from "../ui/window.ui?raw";

// Init WebKit.WebView to ensure it's loaded and can be used in the XML
GObject.type_ensure(WebView as unknown as GObject.GType);

export const TestWindow = GObject.registerClass({
    GTypeName: 'TestWindow',
    Template: WindowTemplate,
    // InternalChildren: ['web_view'],
}, class TestWindow extends Adw.ApplicationWindow {
    constructor(application: Adw.Application) {
        super({ application });
    }
});
