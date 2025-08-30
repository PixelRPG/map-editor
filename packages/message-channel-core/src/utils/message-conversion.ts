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
  return {
    id,
    type: 'response',
    ...(response.success
      ? { result: response.data }
      : {
          error: {
            code: RpcErrorCode.UNKNOWN,
            message: response.error || 'Unknown error',
          },
        }),
  }
}

/**
 * Convert a message response to RPC format
 */
export function fromMessageResponse(
  response: WireRpcResponse,
): RpcResponse<unknown> {
  if (response.error) {
    return {
      success: false,
      error: response.error.message,
    }
  }
  return {
    success: true,
    data: response.result,
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
