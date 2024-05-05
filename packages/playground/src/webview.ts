// Inspiration: https://github.com/sonnyp/Tangram/blob/main/src/WebView.js

import GObject from '@girs/gobject-2.0';
import Adw from '@girs/adw-1';
import Gtk from "@girs/gtk-4.0";
import GLib from '@girs/glib-2.0';
import WebKit from '@girs/webkit-6.0';
import Gio from '@girs/gio-2.0';

import WindowTemplate from "../ui/webview.ui?raw";
import indexHtml from "../../client/dist/index.html?raw";
import { resource } from './resource.ts';

import { CLIENT_DIR } from "./constants";

export const WebView = GObject.registerClass({
    GTypeName: 'WebView',
    Template: WindowTemplate,
    // InternalChildren: ['web_view'],
}, class WebView extends WebKit.WebView {
    constructor(props: Partial<WebKit.WebView.ConstructorProps>) {
        console.log('WebView constructor', CLIENT_DIR.get_path());

        const network_session = new WebKit.NetworkSession({
            data_directory: CLIENT_DIR.get_path()!,
        });

        const web_context = new WebKit.WebContext();
        web_context.set_spell_checking_enabled(true);
        // web_context.set_spell_checking_languages(get_language_names());
        
        // TODO: Make this work
        web_context.add_path_to_sandbox(CLIENT_DIR.get_path()!, true);

        const settings = new WebKit.Settings({
            enable_smooth_scrolling: true,
            media_playback_requires_user_gesture: false,
            enable_developer_extras: true,
            javascript_can_open_windows_automatically: true,
            allow_top_navigation_to_data_urls: false,
            // TODO: Find a more secure way to allow local resource urls like "pixelrpg-resource:///org/pixelrpg/map-editor/client/index.html"
            disable_web_security: true,

        });

        // settings.set_user_agent_with_application_details("PixelRPG", pkg.version);

        const security_manager = web_context.get_security_manager();
        security_manager.register_uri_scheme_as_local("pixelrpg-resource");

        web_context.register_uri_scheme("pixelrpg-resource", (schemeRequest) => {
          const path = schemeRequest.get_path();
          const extension = path.split(".").pop();
          const stream = resource.stream(path);
          console.log("schemeRequest.get_path()", path);
          let content_type: string | null = null;
          if (extension === "js") {
            content_type = "text/javascript";
          } else if (extension === "css") {
            content_type = "text/css";
          } else if (extension === "html") {
            content_type = "text/html";
          }
          schemeRequest.finish(stream, -1, content_type);
        });

        const user_content_manager = new WebKit.UserContentManager();

        super({
            ...props,
            web_context,
            settings,
            user_content_manager,
            network_session,
        });

        // Both works
        // this.load_html(indexHtml, 'pixelrpg-resource:///org/pixelrpg/map-editor/client/');
        this.load_uri("pixelrpg-resource:///org/pixelrpg/map-editor/client/index.html");
    }



});
