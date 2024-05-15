import type { WebkitMessageHandler } from '../types/index.ts'
import { BaseMessageService, Message } from '@pixelrpg/common'

/**
 * Message service for inter process communication between GJS and WebViews.
 * This is implementation for the WebView side of the communication.
 */
export class MessagesService extends BaseMessageService {

    handler?: WebkitMessageHandler

    constructor(messageHandlerName: string) {
        super(messageHandlerName)
        this.initReceiver()
    }

    /**
     * Sends a message to GJS
     * @param message The message to send
     */
    send(message: Message) {
        this.handler?.postMessage(message)
    }

    protected initReceiver() {
        const handler = window.webkit?.messageHandlers[this.messageHandlerName];
        if (!handler) {
            console.warn(`No WebKit message handler found for ${this.messageHandlerName}, this can be enabled for the WebView by GJS using UserContentManager.register_script_message_handler("${this.messageHandlerName}", null)`)
            return;
        }
        this.handler = handler;

        // Used to make `window.messageReceivers.pixelrpg.receive(${JSON.stringify(message)});` available for GJS
        // This must be called in GJS using "evaluate_javascript(...)"
        (window as any).messageReceivers ||= {};
        (window as any).messageReceivers[this.messageHandlerName] = { receive: this.receive.bind(this) }

        console.log('Message handler initialized', handler)
    }
}


