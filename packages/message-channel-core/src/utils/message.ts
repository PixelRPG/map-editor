import {
  BaseMessage,
  RpcMessage,
  RpcRequest,
  WireRpcResponse,
} from '../types/wire'

/**
 * Check if a value is a base message
 */
export function isBaseMessage(data: unknown): data is BaseMessage {
  return typeof data === 'object' && data !== null
}

/**
 * Check if a value is an RPC message
 */
export function isRpcMessage(data: unknown): data is RpcMessage {
  return (
    isBaseMessage(data) &&
    'id' in data &&
    typeof (data as RpcMessage).id === 'string'
  )
}

/**
 * Check if a value is a request message
 */
export function isRpcRequest(data: unknown): data is RpcRequest {
  return (
    isRpcMessage(data) &&
    'type' in data &&
    (data as RpcRequest).type === 'request' &&
    'method' in data &&
    typeof (data as RpcRequest).method === 'string'
  )
}

/**
 * Check if a value is a response message
 */
export function isRpcResponse(data: unknown): data is WireRpcResponse {
  return (
    isRpcMessage(data) &&
    'type' in data &&
    (data as WireRpcResponse).type === 'response' &&
    ('result' in data || 'error' in data)
  )
}
