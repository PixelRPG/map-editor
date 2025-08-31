import { RpcResponse } from '../types/rpc'
import { RpcRequest, WireRpcResponse } from '../types/wire'
import { RpcErrorCode } from '../types/errors'

/**
 * Convert an RPC response to message format
 */
export function toMessageResponse(
  id: string,
  response: RpcResponse<unknown>,
): WireRpcResponse {
  // Ensure we always have either result or error field, never both
  if (response.success) {
    return {
      id,
      type: 'response',
      result: response.data !== undefined ? response.data : null, // Convert undefined to null for JSON compatibility
    }
  } else {
    return {
      id,
      type: 'response',
      error: {
        code: response.code || RpcErrorCode.UNKNOWN,
        message: response.error || 'Unknown error',
        ...(response.data !== undefined ? { data: response.data } : {}),
      },
    }
  }
}

/**
 * Convert a message response to RPC format
 */
export function fromMessageResponse(
  response: WireRpcResponse,
): RpcResponse<unknown> {
  // Check for error first (takes precedence)
  if (response.error !== undefined) {
    return {
      success: false,
      error: response.error.message,
      code: response.error.code,
      ...(response.error.data !== undefined
        ? { data: response.error.data }
        : {}),
    }
  }

  // For successful responses, return result (could be null from undefined conversion)
  return {
    success: true,
    data: response.result !== undefined ? response.result : undefined,
  }
}

/**
 * Create a new RPC request message
 */
export function createMessageRequest(
  id: string,
  method: string,
  params?: unknown,
): RpcRequest {
  return {
    id,
    type: 'request',
    method,
    params,
  }
}
