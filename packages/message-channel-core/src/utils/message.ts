import type { BaseMessage, RpcMessage, RpcRequest, RpcResponse } from "../types/message";

/**
 * Helper function to create a base message with an optional channel
 */
export function createBaseMessage(channel?: string): BaseMessage {
    return { channel };
}

/**
 * Helper function to create a request message
 */
export function createRpcRequest(method: string, params?: unknown, id?: string, channel?: string): RpcRequest {
    return {
        type: 'request',
        id: id || generateUniqueId(),
        method,
        params,
        channel
    };
}

/**
 * Helper function to create a success response message
 */
export function createRpcResponse(id: string, result?: unknown, channel?: string): RpcResponse {
    return {
        type: 'response',
        id,
        result,
        channel
    };
}

/**
 * Helper function to create an error response message
 */
export function createRpcErrorResponse(
    id: string,
    errorCode: number,
    errorMessage: string,
    channel?: string
): RpcResponse {
    return {
        type: 'response',
        id,
        error: {
            code: errorCode,
            message: errorMessage
        },
        channel
    };
}

/**
 * Type guard to check if an object is a valid RPC message
 */
export function isRpcMessage(data: unknown): data is RpcMessage {
    return data !== null &&
        typeof data === 'object' &&
        'id' in data;
}

/**
 * Type guard to check if an object is a valid RPC request
 */
export function isRpcRequest(data: unknown): data is RpcRequest {
    return isRpcMessage(data) &&
        'type' in data &&
        data.type === 'request' &&
        'method' in data &&
        typeof data.method === 'string';
}

/**
 * Type guard to check if an object is a valid RPC response
 */
export function isRpcResponse(data: unknown): data is RpcResponse {
    return isRpcMessage(data) &&
        'type' in data &&
        data.type === 'response' &&
        (('result' in data) || ('error' in data && typeof data.error === 'object'));
}

/**
 * Generate a unique ID for RPC messages
 */
export function generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
} 