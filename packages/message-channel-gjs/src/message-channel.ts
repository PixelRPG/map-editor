import type JavaScriptCore from '@girs/javascriptcore-6.0'
import Gio from '@girs/gio-2.0'
import WebKit from '@girs/webkit-6.0'

import { MessageChannel as BaseMessageChannel, MessageEvent } from '@pixelrpg/message-channel-core'

// Promisify the evaluate_javascript method
Gio._promisify(WebKit.WebView.prototype, 'evaluate_javascript')

/**
 * GJS implementation of the WebKit message channel.
 * Handles communication between GJS and WebViews using standard WebKit APIs.
 */
export class MessageChannel extends BaseMessageChannel {

    /**
     * Create a new GJS message channel
     * @param channelName Name of the message channel
     * @param webView WebKit WebView instance for communication
     */
    constructor(channelName: string, protected readonly webView: WebKit.WebView) {
        super(channelName)

        console.log('Creating MessageChannel', channelName, webView)

        this.initializeChannel()
    }

    /**
     * Send a message to the WebView using standard postMessage
     * @param data Data to send
     */
    async postMessage(data: any): Promise<void> {
        try {
            // Add channel information if not present
            if (typeof data === 'object' && data !== null && !('channel' in data)) {
                data.channel = this.channelName;
            }

            const script = `
                window.postMessage(${JSON.stringify(data)}, "*");
                void(0);
            `;

            await this.webView.evaluate_javascript(
                script,
                -1,
                null,
                null,
                null
            )
        } catch (error) {
            console.error('Error sending message to webview: s', error)
        }
    }

    /**
     * Initialize the message channel using WebKit standard script message handler
     */
    protected initializeChannel(): void {
        console.log('Initializing message channel')

        if (!this.webView) {
            throw new Error('WebView is not initialized');
        }

        const userContentManager = this.webView.get_user_content_manager()

        // Register a standard WebKit script message handler
        userContentManager.register_script_message_handler(this.channelName, null)

        // Connect to the script-message-received signal to receive messages
        userContentManager.connect(
            'script-message-received',
            (_userContentManager, jsValue: JavaScriptCore.Value) => {
                try {
                    // Parse the message from JSON
                    const data = jsValue.to_json(0)
                    const messageData = JSON.parse(data)

                    // Create a standard MessageEvent using our polyfill
                    const event = new MessageEvent('message', {
                        data: messageData,
                        origin: 'webkit-webview',
                        source: null
                    });

                    // Handle the event
                    this.handleMessageEvent(event);
                } catch (error) {
                    console.error('Error processing message from WebView:', error)
                }
            },
        )
    }
}


