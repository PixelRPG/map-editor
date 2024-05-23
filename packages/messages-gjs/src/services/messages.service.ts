import type WebKit from '@girs/webkit-6.0'
import type JavaScriptCore from '@girs/javascriptcore-6.0'
import { BaseMessageService, Message } from '@pixelrpg/common'
import { proxy } from 'valtio/vanilla'

/**
 * Message service for inter process communication between GJS and WebViews.
 * This is the implementation for the GJS side of the communication.
 */
export class MessagesService<S extends object> extends BaseMessageService<S> {

    state: S

    constructor(messageHandlerName: string, state: S, protected readonly webView: WebKit.WebView) {
        super(messageHandlerName, state)
        this.state = proxy(state)
        this.initReceiver()
    }

    /**
     * Sends a message to the webview
     * @param message The message to send
     */
    async send(message: Message) {
        return new Promise((resolve, reject) => {
            try {
                this.webView.evaluate_javascript(
                    `window.messageReceivers.${this.messageHandlerName}.receive(${JSON.stringify(message)});`,
                    -1,
                    null,
                    null,
                    null,
                    (webView, result) => {
                        try {
                            webView?.evaluate_javascript_finish(result)
                            resolve(result)
                        } catch (error) {
                            reject(error)
                        }
                    },
                )
            } catch (error) {
                reject(error)
            }
        })

    }

    protected initReceiver() {
        const userContentManager = this.webView.get_user_content_manager()
        userContentManager.register_script_message_handler(this.messageHandlerName, null)
        // Connects to the 'script-message-received' signal to receive messages from the webview
        userContentManager.connect(
            'script-message-received',
            (userContentManager, message: JavaScriptCore.Value) => {
                const parsedMessage = JSON.parse(message.to_json(0))
                this.receive(parsedMessage)
            },
        )
    }
}


