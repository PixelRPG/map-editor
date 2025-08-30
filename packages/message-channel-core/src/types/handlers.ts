import { WireRpcResponse } from './wire'

/**
 * Function to directly reply to a request
 * Used in platform-specific implementations where direct reply is possible
 */
export type DirectReplyFunction = (response: WireRpcResponse) => void
