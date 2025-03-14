/**
 * Interface for WebKit message handler following Apple's WebKit API standard
 */
export interface WebKitMessageHandler {
    /**
     * Standard WebKit method for posting messages from JavaScript to native code
     * @param message Message to post
     */
    postMessage(message: any): void;
}

/**
 * Global WebKit interface available in WebView contexts
 */
declare global {
    interface Window {
        webkit?: {
            messageHandlers: {
                [key: string]: WebKitMessageHandler;
            };
        };
    }
}