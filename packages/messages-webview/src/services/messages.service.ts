import type { WebkitMessageHandler } from '../types/index.ts'
import { EventDispatcher, BaseMessageService, Message } from '@pixelrpg/common'

/**
 * Message service for inter process communication between GJS and WebViews.
 * This is implementation for the WebView side of the communication.
 */
export class MessagesService implements BaseMessageService {

    events = new EventDispatcher()
    handler: WebkitMessageHandler

    constructor(private readonly messageHandlerName: string) {
        const handler = window.webkit.messageHandlers[messageHandlerName];
        if (!handler) {
            throw new Error(`No WebKit message handler found for ${messageHandlerName}, this can be enabled for the WebView by GJS using UserContentManager.register_script_message_handler("${messageHandlerName}", null)`)
        }
        // Used to make `window.webkit.messageHandlers.pixelrpg.receiveMessage(${JSON.stringify(message)});` available for GJS
        // This must be called in GJS using "evaluate_javascript(window.webkit.messageHandlers[messageHandlerName]?.receiveMessage(${JSON.stringify(message)});`)"
        handler.receiveMessage = this.receive.bind(this)
        this.handler = handler
    }

    /**
     * Sends a message to GJS
     * @param message The message to send
     */
    send(message: Message) {
        this.handler.postMessage(message)
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
     * Receives a message from GJS
     * @param message The message to receive
     */
    protected receive(message: Message) {
        this.events.dispatch(`${this.messageHandlerName}:message`, message)
    }
}


