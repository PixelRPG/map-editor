/**
 * Base message interface for all messages
 */
export interface BaseMessage {
    /** Optional channel identifier for multi-channel systems */
    channel?: string;
}

/**
 * Message with unique ID for RPC communication
 */
export interface RpcMessage extends BaseMessage {
    /** Unique ID to correlate requests and responses */
    id: string;
}

/**
 * Request message for RPC communication
 */
export interface RpcRequest extends RpcMessage {
    type: 'request';
    /** Method name to be called */
    method: string;
    /** Optional parameters for the method */
    params?: unknown;
}

/**
 * Response message for RPC communication
 */
export interface RpcResponse extends RpcMessage {
    type: 'response';
    /** Result of the method call */
    result?: unknown;
    /** Error information if the call failed */
    error?: {
        code: number;
        message: string;
    };
}

/**
 * Union type for all RPC messages
 */
export type RpcMessageType = RpcRequest | RpcResponse;
