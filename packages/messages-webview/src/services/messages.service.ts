import type { WebkitMessageHandler } from '../types/index.ts'
import { EventDispatcher, BaseMessageService, Message, EventListener } from '@pixelrpg/common'

/**
 * Message service for inter process communication between GJS and WebViews.
 * This is implementation for the WebView side of the communication.
 */
export class MessagesService extends BaseMessageService {

    events = new EventDispatcher()
    handler?: WebkitMessageHandler

    constructor(private readonly messageHandlerName: string) {
        super()
        this.initReceiver()
    }

    /**
     * Sends a message to GJS
     * @param message The message to send
     */
    send(message: Message) {
        this.handler?.postMessage(message)
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

    /**
     * Receives a message from GJS
     * @param message The message to receive
     */
    protected receive(message: Message) {
        this.events.dispatch(`${this.messageHandlerName}:message`, message)
    }
}


