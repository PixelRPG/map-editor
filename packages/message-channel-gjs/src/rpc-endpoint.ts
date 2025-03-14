import JavaScriptCore from '@girs/javascriptcore-6.0'
import WebKit from '@girs/webkit-6.0'
import GObject from "gi://GObject";
import {
    RpcEndpoint as CoreRpcEndpoint,
    RpcRequest,
    RpcResponse,
    MessageEvent,
    BaseMessage,
    isRpcRequest,
    createRpcRequest
} from '@pixelrpg/message-channel-core'

/**
 * GJS implementation of the RPC endpoint
 * Handles communication between GJS and WebViews using standard WebKit APIs
 * @template TMessage Type of messages that can be sent via notification methods
 */
export class RpcEndpoint extends CoreRpcEndpoint {
    /**
     * Create a new GJS RPC endpoint
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

        // 1. Register a regular script message handler for responses and notifications
        userContentManager.register_script_message_handler(this.channelName, null);

        // Connect to the script-message-received signal for responses
        userContentManager.connect(
            'script-message-received',
            (_userContentManager, jsValue: JavaScriptCore.Value) => {
                try {
                    // Parse the message from JSON
                    const data = jsValue.to_json(0);
                    const message = JSON.parse(data);

                    // Skip messages that aren't for our channel
                    if (message.channel && message.channel !== this.channelName) {
                        return;
                    }

                    // Create a MessageEvent to pass to the handler
                    const event = new MessageEvent('message', {
                        data: message,
                        origin: 'webkit-webview',
                        source: null
                    });

                    // Handle the message (this will resolve pending requests for responses)
                    this.handleRpcMessage(event);
                } catch (error) {
                    console.error('Error processing RPC message:', error);
                }
            }
        );

        // TODO: Implement direct reply support

        // 2. Register specialized handler for RPC requests that need direct replies
        // userContentManager.register_script_message_handler_with_reply(this.channelName, null);

        // // Connect to the script-message-with-reply-received signal for requests
        // userContentManager.connect(
        //     'script-message-with-reply-received',
        //     (_userContentManager, jsValue: JavaScriptCore.Value, reply: WebKit.ScriptMessageReply) => {
        //         try {
        //             // Parse the message from JSON
        //             const data = jsValue.to_json(0);
        //             const message = JSON.parse(data);
        //             const jsContext = jsValue.get_context();

        //             // Check if this is a valid RPC request
        //             if (!isRpcRequest(message) || (message.channel && message.channel !== this.channelName)) {
        //                 console.error('Invalid RPC request format', message);
        //                 // Not a valid request or not for us
        //                 reply.return_error_message('Invalid RPC request format');
        //                 return false;
        //             }

        //             // Create a MessageEvent to pass to the handler
        //             const event = new MessageEvent('message', {
        //                 data: message,
        //                 origin: 'webkit-webview',
        //                 source: null
        //             });

        //             // Create a direct reply function that uses WebKit's reply mechanism
        //             const directReply = (response: RpcResponse) => {
        //                 try {
        //                     const jsValue = JavaScriptCore.Value.new_from_json(jsContext, JSON.stringify(response));
        //                     reply.return_value(jsValue);
        //                 } catch (error) {
        //                     console.error('Error sending direct reply:', error);
        //                     reply.return_error_message(`Error sending reply: ${error}`);
        //                 }
        //             };

        //             // Handle the message with direct reply support
        //             this.handleRpcMessage(event, directReply);

        //             // Return true to indicate we're handling the request asynchronously
        //             return true;
        //         } catch (error) {
        //             console.error('Error processing RPC message:', error);
        //             reply.return_error_message(`Internal error: ${error}`);
        //             return false;
        //         }
        //     }
        // );
    }

    /**
     * Send an RPC message (request or response) to the WebView
     * @param message The message to send
     */
    protected async postMessage(message: RpcRequest | RpcResponse): Promise<void> {
        try {
            // Set the channel property if not already set
            if (message.channel === undefined) {
                message.channel = this.channelName;
            }

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
            throw error;
        }
    }

    /**
     * Override the sendNotification method from the base class to implement method/params style notification
     * @param method The method name to call
     * @param params The parameters to send
     */
    public override async sendNotification<TParams = unknown>(
        method: string,
        params?: TParams
    ): Promise<void> {
        return super.sendNotification(method, params);
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