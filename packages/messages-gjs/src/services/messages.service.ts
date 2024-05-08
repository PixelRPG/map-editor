import type WebKit from '@girs/webkit-6.0'
import type JavaScriptCore from '@girs/javascriptcore-6.0'
import { EventDispatcher, BaseMessageService, Message } from '@pixelrpg/common'

/**
 * Message service for inter process communication between GJS and WebViews.
 * This is implementation for the GJS side of the communication.
 */
export class MessagesService implements BaseMessageService {

    events = new EventDispatcher()

    protected userContentManager: WebKit.UserContentManager

    constructor(private readonly webView: WebKit.WebView, private readonly messageHandlerName: string) {
        this.userContentManager = webView.get_user_content_manager()
        this.userContentManager.register_script_message_handler(messageHandlerName, null)
        this.receive()
    }

    /**
     * Sends a message to the webview
     * @param message The message to send
     */
    send(message: Message) {
        this.webView.evaluate_javascript(
            `window.webkit.messageHandlers.${this.messageHandlerName}.receiveMessage(${JSON.stringify(message)});`,
            -1,
            null,
            null,
            null,
            (webView, result) => {
                webView?.evaluate_javascript_finish(result)
            },
        )
    }

    onMessage(callback: (message: Message) => void) {
        this.events.on(`${this.messageHandlerName}:message`, callback)
    }

    onceMessage(callback: (message: Message) => void) {
        this.events.once(`${this.messageHandlerName}:message`, callback)
    }

    offMessage(callback: (message: Message) => void) {
        this.events.off(`${this.messageHandlerName}:message`, callback)
    }

    /**
     * Connects to the 'script-message-received' signal to receive messages from the webview
     */
    protected receive() {
        this.userContentManager.connect(
            'script-message-received',
            (manager: WebKit.UserContentManager, message: JavaScriptCore.Value) => {
                const obj = JSON.parse(message.to_json(0))
                this.events.dispatch(`${this.messageHandlerName}:message`, obj)
            },
        )

    }
}


