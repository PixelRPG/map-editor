import { WebKitMessageChannel, MessageEvent, MessageData, MessageEventSource } from '@pixelrpg/messages-core'

/**
 * Combined WebKit and Window message implementation for web context.
 * This implementation tries WebKit message handlers first (for native communication),
 * then falls back to standard Window message API.
 */
export class MessageChannel<T = string> extends WebKitMessageChannel<T> {
    /**
     * Create a new WebView message channel
     * @param channelName Name of the message channel
     */
    constructor(channelName: string) {
        super(channelName)
        this.initializeChannel()
    }

    /**
     * Initialize both WebKit and Window message channels
     */
    protected initializeChannel(): void {
        console.log('Initializing WebKit message channel', this.channelName)
        // TODO: Switch to `window.postMessage`?
        // Try to get WebKit message handler if available
        // if (this.isWebKitAvailable()) {


        //     // Legacy: Provide backward compatibility with old GJS code
        //     if (typeof window !== 'undefined') {
        //         window.webkit ||= {} as any;
        //         window.webkit!.messageReceivers ||= {} as any;
        //         window.webkit!.messageReceivers![this.channelName] ||= {} as any;
        //         if (!window.webkit!.messageReceivers![this.channelName].receive) {

        //         } else {
        //             window.webkit!.messageReceivers![this.channelName].receive = (messageData: MessageData<string, any>) => {
        //                 // Create a standard event and handle it
        //                 const event = new MessageEvent('message', {
        //                     data: messageData,
        //                     origin: 'gjs-legacy',
        //                     source: null
        //                 });

        //                 this.handleMessageEvent(event);
        //             }
        //         };
        //     }

        //     this.webKitHandler = window.webkit?.messageHandlers[this.channelName] || null;
        // } else {
        //     console.warn('WebKit message handler not available, using window message listener')
        // }

        // Set up window message listener for receiving messages
        window.addEventListener('message', (event) => {
            this.handleMessageEvent(event as unknown as MessageEvent<MessageData<T>>);
        });

    }

    /**
     * Check if WebKit API is available in this environment
     */
    protected isWebKitAvailable(): boolean {
        return typeof window !== 'undefined' &&
            !!window.webkit &&
            !!window.webkit.messageHandlers;
    }
}


