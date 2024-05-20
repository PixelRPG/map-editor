import type { WebkitMessageHandler } from '../types/index.ts'
import { BaseMessageService, Message } from '@pixelrpg/common'
import { proxy, subscribe } from 'valtio/vanilla'

/**
 * Message service for inter process communication between GJS and WebViews.
 * This is implementation for the WebView side of the communication.
 */
export class MessagesService<S extends object> extends BaseMessageService<S> {

    handler?: WebkitMessageHandler

    state: S

    constructor(messageHandlerName: string, state: S) {
        super(messageHandlerName, state)
        this.state = proxy<S>(state)

        subscribe(this.state, () => console.log('state has changed to', this.state))

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


