import JavaScriptCore from '@girs/javascriptcore-6.0'
import WebKit from '@girs/webkit-6.0'
import {
    RpcServer as CoreRpcServer,
    RpcRequest,
    RpcResponse,
    MessageEvent,
    isRpcRequest,
    createRpcResponse,
    createRpcErrorResponse
} from '@pixelrpg/message-channel-core'

/**
 * GJS implementation of the RPC server
 * Handles communication between GJS and WebViews using standard WebKit APIs
 */
export class RpcServer extends CoreRpcServer {
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

        // Set up RPC message handler with reply support
        this.setupRpcMessageHandling();
    }

    /**
     * Set up RPC message handler with direct reply support
     */
    private setupRpcMessageHandling(): void {
        if (!this.webView) {
            throw new Error('WebView is not initialized');
        }

        const userContentManager = this.webView.get_user_content_manager();

        // Register a specialized handler for RPC messages that allows direct replies
        userContentManager.register_script_message_handler_with_reply(this.channelName, null);

        // Connect to the script-message-with-reply-received signal
        userContentManager.connect(
            'script-message-with-reply-received',
            (_userContentManager, jsValue: JavaScriptCore.Value, reply: WebKit.ScriptMessageReply) => {
                try {
                    // Parse the message from JSON
                    const data = jsValue.to_json(0);
                    const message = JSON.parse(data);
                    const jsContext = jsValue.get_context();

                    // Check if this is a valid RPC request
                    if (!isRpcRequest(message) || (message.channel && message.channel !== this.channelName)) {
                        // Not a valid request or not for us
                        reply.return_error_message('Invalid RPC request format');
                        return false;
                    }

                    // Create a MessageEvent to pass to the handler
                    const event = new MessageEvent('message', {
                        data: message,
                        origin: 'webkit-webview',
                        source: null
                    });

                    // Create a direct reply function that uses WebKit's reply mechanism
                    const directReply = (response: RpcResponse) => {
                        try {
                            const jsValue = JavaScriptCore.Value.new_from_json(jsContext, JSON.stringify(response));
                            reply.return_value(jsValue);
                        } catch (error) {
                            console.error('Error sending direct reply:', error);
                            reply.return_error_message(`Error sending reply: ${error}`);
                        }
                    };

                    // Handle the message with direct reply support
                    this.handleRpcMessage(event, directReply);

                    // Return true to indicate we're handling the request asynchronously
                    return true;
                } catch (error) {
                    console.error('Error processing RPC message:', error);
                    reply.return_error_message(`Internal error: ${error}`);
                    return false;
                }
            }
        );
    }

    /**
     * Send a message to the WebView
     * Note: This method is primarily for backward compatibility. 
     * Most responses are sent directly through the reply mechanism.
     * @param message The message to send
     */
    protected async postMessage(message: RpcResponse): Promise<void> {
        try {
            // Convert message to JSON string
            const messageJson = JSON.stringify(message);

            // Create a script to send the message to the WebView
            const script = `
                window.postMessage(${messageJson}, "*");
                void(0);
            `;

            // Execute the script in the WebView
            await this.webView.evaluate_javascript(script, -1, null, null, null);
        } catch (error) {
            console.error('Error sending message to WebView:', error);
        }
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