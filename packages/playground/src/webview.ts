// Inspiration: https://github.com/sonnyp/Tangram/blob/main/src/WebView.js

import GObject from '@girs/gobject-2.0';
import Adw from '@girs/adw-1';
import Gtk from "@girs/gtk-4.0";
import GLib from '@girs/glib-2.0';
import WebKit from '@girs/webkit-6.0';
import Gio from '@girs/gio-2.0';
import JavaScriptCore from '@girs/javascriptcore-6.0';

import WindowTemplate from "../ui/webview.ui?raw";
// import indexHtml from "../../client/dist/index.html?raw";
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
            // data_directory: CLIENT_DIR.get_path()!,
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
        });

        // settings.set_user_agent_with_application_details("PixelRPG", pkg.version);

        const security_manager = web_context.get_security_manager();
        security_manager.register_uri_scheme_as_cors_enabled("pixelrpg");

        web_context.register_uri_scheme("pixelrpg", (schemeRequest) => {
          const uri = schemeRequest.get_uri();

          console.log("uri", uri);

          const path = schemeRequest.get_path();
          const extension = path.split(".").pop();
          // const stream = resource.streamDirect(path);
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

        // Allows to call this in client: window.webkit.messageHandlers.pixelrpg.postMessage('Hello from client');
        user_content_manager.register_script_message_handler("pixelrpg", null);
        user_content_manager.connect('script-message-received', (manager: WebKit.UserContentManager, message: JavaScriptCore.Value) => {
          console.log("Message from WebView: " + message.to_json(0));

          this.evaluate_javascript("console.log('Message from GJS!');", -1, null, null, null, (webView, result) => {
            this.evaluate_javascript_finish(result);
        });
        });

        super({
            ...props,
            web_context,
            settings,
            user_content_manager,
            network_session,
        });

        // console.log("indexHtmlUrl", indexHtmlUrl);

        // Both works
        // this.load_html(indexHtml, indexHtmlUrl);
        // const indexHtml = resource.getDirect("index.html").toString();
        // console.log("indexHtml", indexHtml);
        // this.load_html(indexHtml, "pixelrpg:///org/pixelrpg/map-editor/client/index.html");
        this.load_uri("pixelrpg:///org/pixelrpg/map-editor/client/index.html");
    }



});
