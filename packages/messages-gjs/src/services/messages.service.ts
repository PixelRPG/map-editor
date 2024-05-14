import type WebKit from '@girs/webkit-6.0'
import type JavaScriptCore from '@girs/javascriptcore-6.0'
import { EventDispatcher, BaseMessageService, Message, EventListener } from '@pixelrpg/common'

/**
 * Message service for inter process communication between GJS and WebViews.
 * This is implementation for the GJS side of the communication.
 */
export class MessagesService extends BaseMessageService {

    events = new EventDispatcher()

    constructor(private readonly webView: WebKit.WebView, private readonly messageHandlerName: string) {
        super()
        this.initReceiver()
    }

    /**
     * Sends a message to the webview
     * @param message The message to send
     */
    send(message: Message) {
        this.webView.evaluate_javascript(
            `window.messageReceivers.${this.messageHandlerName}.receive(${JSON.stringify(message)});`,
            -1,
            null,
            null,
            null,
            (webView, result) => {
                webView?.evaluate_javascript_finish(result)
            },
        )
    }

    onMessage(callback: EventListener<Message>) {
        this.events.on(`${this.messageHandlerName}:message`, callback)
    }

    onceMessage(callback: EventListener<Message>) {
        this.events.once(`${this.messageHandlerName}:message`, callback)
    }

    offMessage(callback: EventListener<Message>) {
        this.events.off(`${this.messageHandlerName}:message`, callback)
    }

    protected initReceiver() {
        const userContentManager = this.webView.get_user_content_manager()
        userContentManager.register_script_message_handler(this.messageHandlerName, null)
        // Connects to the 'script-message-received' signal to receive messages from the webview
        userContentManager.connect(
            'script-message-received',
            (userContentManager, message) => {
                const parsedMessage = JSON.parse(message.to_json(0))
                this.receive(parsedMessage)
            },
        )
    }

    /**
     * Receives a message from the webview
     */
    protected receive(message: Message) {
        this.events.dispatch(`${this.messageHandlerName}:message`, message)
    }
}


