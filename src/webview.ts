// Inspiration: https://github.com/sonnyp/Tangram/blob/main/src/WebView.js

import GObject from '@girs/gobject-2.0';
import Adw from '@girs/adw-1';
import Gtk from "@girs/gtk-4.0";
import GLib from '@girs/glib-2.0';
import WebKit from '@girs/webkit-6.0';
import Gio from '@girs/gio-2.0';

import WindowTemplate from "../ui/webview.ui?raw";
import indexHtml from "../client/index.html?raw";
import { resource } from './resource.ts';

import { CLIENT_DIR } from "./constants";

export const WebView = GObject.registerClass({
    GTypeName: 'WebView',
    Template: WindowTemplate,
    // InternalChildren: ['web_view'],
}, class WebView extends WebKit.WebView {
    constructor(props: Partial<WebKit.WebView.ConstructorProps>) {
        console.log('WebView constructor', CLIENT_DIR.get_path());

        const web_context = new WebKit.WebContext();
        web_context.set_spell_checking_enabled(true);
        // web_context.set_spell_checking_languages(get_language_names());
        // web_context.add_path_to_sandbox(data_dir, true);
        web_context.add_path_to_sandbox(CLIENT_DIR.get_path()!, true);

        const security_manager = web_context.get_security_manager();

        security_manager.register_uri_scheme_as_local("pixelrpg-resource");
        web_context.register_uri_scheme("pixelrpg-resource", (schemeRequest) => {
          const stream = resource.stream(schemeRequest.get_path());
          schemeRequest.finish(stream, -1, null);
        });

        super({
            ...props,
            web_context: web_context,
        });

        // Both works
        // this.load_html(indexHtml, 'pixelrpg-resource:///');
        this.load_uri("pixelrpg-resource:///org/pixelrpg/map-editor/client/index.html");
    }



});
