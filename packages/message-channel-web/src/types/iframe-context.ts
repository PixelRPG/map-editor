/**
 * Defines the context of the iframe communication
 */
export enum IframeContext {
    /**
     * Main window context - communicates with its iframes
     */
    PARENT = 'parent',

    /**
     * Iframe context - communicates with its parent window
     */
    CHILD = 'child'
}

/**
 * Options for initializing the RPC endpoint
 */
export interface RpcEndpointOptions {
    /**
     * Context of the communication
     */
    context: IframeContext;

    /**
     * Target origin for postMessage
     * Use '*' for any origin, but consider security implications
     */
    targetOrigin?: string;

    /**
     * For parent context, specify the iframe element
     * Required when context is PARENT
     */
    targetIframe?: HTMLIFrameElement;
} 