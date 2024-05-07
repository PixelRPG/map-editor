// Inspiration: https://github.com/sonnyp/Tangram/blob/main/src/WebView.js

import GObject from '@girs/gobject-2.0';
import WebKit from '@girs/webkit-6.0';
import JavaScriptCore from '@girs/javascriptcore-6.0';
import mime from 'mime';

import WindowTemplate from "../ui/webview.ui?raw";
import { clientResource } from './resource.ts';

export const WebView = GObject.registerClass({
    GTypeName: 'WebView',
    Template: WindowTemplate,
    // InternalChildren: ['web_view'],
}, class WebView extends WebKit.WebView {
    constructor(props: Partial<WebKit.WebView.ConstructorProps>) {
        const network_session = new WebKit.NetworkSession({});

        const web_context = new WebKit.WebContext();
        web_context.set_spell_checking_enabled(true);
        // web_context.set_spell_checking_languages(get_language_names());

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

          const path = schemeRequest.get_path();
          const extension = path.split(".").pop();

          const stream = clientResource.stream(path);
          if (!stream) {
            console.error("Error opening stream", path);
            return;
          }
          const contentType = extension ? mime.getType(extension) : null;
          schemeRequest.finish(stream, -1, contentType);
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

        this.load_uri("pixelrpg:///org/pixelrpg/map-editor/client/index.html");
    }



});
