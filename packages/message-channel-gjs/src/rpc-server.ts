import type JavaScriptCore from '@girs/javascriptcore-6.0'
import WebKit from '@girs/webkit-6.0'
import { RpcServer as CoreRpcServer, RpcResponse, MessageEvent } from '@pixelrpg/message-channel-core'
import { MessageChannel } from './message-channel';

/**
 * GJS implementation of the RPC server
 * Handles communication between GJS and WebViews using standard WebKit APIs
 */
export class RpcServer extends CoreRpcServer {
    /**
     * The underlying message channel for communication
     */
    private messageChannel: MessageChannel;

    /**
     * Create a new GJS RPC server
     * @param channelName Name of the channel
     * @param webView WebKit WebView instance
     */
    constructor(
        channelName: string,
        private readonly webView: WebKit.WebView
    ) {
        super(channelName);

        // Create message channel with the same WebView
        this.messageChannel = new MessageChannel(channelName, webView);

        // Set up custom message handling for RPC messages
        this.setupRpcMessageHandling();
    }

    /**
     * Set up custom message handling for RPC
     */
    private setupRpcMessageHandling(): void {
        // The MessageChannel already sets up the script message handler in WebKit
        // We just need to listen for messages passed via the channel
        const userContentManager = this.webView.get_user_content_manager();

        // Connect to the script-message-received signal
        userContentManager.connect(
            'script-message-received',
            (_userContentManager, jsValue: JavaScriptCore.Value) => {
                try {
                    // Parse the message from JSON
                    const data = jsValue.to_json(0);
                    const messageData = JSON.parse(data);

                    // Create a MessageEvent to pass to the handler
                    const event = new MessageEvent('message', {
                        data: messageData,
                        origin: 'webkit-webview',
                        source: null
                    });

                    // Handle the message through our RPC handler
                    this.handleRpcMessage(event);
                } catch (error) {
                    console.error('Error processing message from WebView:', error);
                }
            }
        );
    }

    /**
     * Send a message to the WebView
     * @param message The message to send
     */
    protected async postMessage(message: RpcResponse): Promise<void> {
        // Use the messageChannel to send the response
        return this.messageChannel.postMessage(message);
    }

    /**
     * Clean up resources
     */
    public override destroy(): void {
        super.destroy();
        // No need to explicitly unregister the script message handler
        // The WebView will clean up when destroyed
    }
} 