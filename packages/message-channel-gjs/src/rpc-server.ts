import JavaScriptCore from '@girs/javascriptcore-6.0'
import WebKit from '@girs/webkit-6.0'
import {
    RpcServer as CoreRpcServer,
    RpcRequest,
    RpcResponse,
    MessageEvent,
    BaseMessage,
    isRpcRequest,
    createRpcResponse,
    createRpcErrorResponse,
    createRpcRequest
} from '@pixelrpg/message-channel-core'

/**
 * GJS implementation of the RPC server
 * Handles communication between GJS and WebViews using standard WebKit APIs
 * @template TMessage Type of messages that can be sent via sendMessage
 */
export class RpcServer<TMessage extends BaseMessage = BaseMessage> extends CoreRpcServer<TMessage> {
    /**
     * Message counter for unique IDs
     */
    protected messageCounter = 0;

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
                        console.error('Invalid RPC request format', message);
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
     * Send an RPC request to the WebView and wait for the response
     * @param method The method name to call
     * @param params Optional parameters to pass
     * @returns Promise that resolves with the response
     */
    async sendRequest<TParams = unknown, TResult = unknown>(
        method: string,
        params?: TParams
    ): Promise<TResult> {
        const id = `${this.channelName}-${++this.messageCounter}`;
        const request = createRpcRequest(method, params, id, this.channelName);

        // Use JavaScript to evaluate in WebView context
        // Important: Ensure the script always returns a serializable value that WebKit can handle
        const script = `
            (() => {
                try {
                    // Parse the request
                    const request = ${JSON.stringify(request)};
                    
                    // Get the method handler
                    const methodName = request.method;
                    const handler = window.rpcHandlers && window.rpcHandlers[methodName];
                    
                    // If no handler, return error response
                    if (typeof handler !== 'function') {
                        return JSON.stringify({ 
                            type: 'response',
                            id: request.id,
                            error: { 
                                code: -32601, 
                                message: 'Method "' + methodName + '" not found'
                            },
                            channel: request.channel
                        });
                    }
                    
                    // For synchronous results, return immediately
                    try {
                        const result = handler(request.params);
                        
                        // Don't try to handle promises directly - that's not supported by WebKit's evaluate_javascript
                        // Instead, just return a success response with the immediate result
                        const response = {
                            type: 'response',
                            id: request.id,
                            result: result,
                            channel: request.channel
                        };
                        
                        // Always return a serialized string to avoid WebKit type issues
                        return JSON.stringify(response);
                    } catch (error) {
                        // Return error response
                        return JSON.stringify({
                            type: 'response',
                            id: request.id,
                            error: { 
                                code: -32000, 
                                message: error.message || String(error)
                            },
                            channel: request.channel
                        });
                    }
                } catch (error) {
                    // Return general error
                    return JSON.stringify({ 
                        type: 'response',
                        id: request.id,
                        error: { 
                            code: -32000, 
                            message: error.message || String(error)
                        },
                        channel: request.channel
                    });
                }
            })();
        `;

        try {
            // Execute the script to get the response
            const result = await this.webView.evaluate_javascript(
                script,
                -1,
                null,
                null,
                null
            );

            if (!result) {
                throw new Error('No response from WebView');
            }

            // Parse the response which is now a JSON string
            const responseData = result.to_string();
            const response = JSON.parse(responseData);

            // Check for error
            if (response.error) {
                throw new Error(response.error.message);
            }

            // Return the result
            return response.result as TResult;
        } catch (error) {
            console.error(`Error sending RPC request "${method}":`, error);
            throw error;
        }
    }

    /**
     * Send a message to the WebView, primarily for event notifications
     * This is a replacement for the MessageChannel.postMessage method
     * @param message The message to send
     */
    async sendMessage(message: TMessage): Promise<void> {
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
        }
    }

    /**
     * Send a message to the WebView
     * This implements the abstract method from CoreRpcServer for RPC responses
     * Note: Most responses are sent directly through the reply mechanism.
     * @param message The message to send
     */
    protected async postMessage(message: RpcResponse): Promise<void> {
        // Reuse the sendMessage implementation for consistency
        return this.sendMessage(message as unknown as TMessage);
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