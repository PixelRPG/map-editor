/**
 * Type definitions for RPC handlers and related functionality
 */
import { RpcResponse } from './message';

/**
 * Type for method handlers
 * @template TParams Type of parameters for the method
 * @template TResult Type of result returned by the method
 */
export type MethodHandler<TParams = unknown, TResult = unknown> =
    (params?: TParams) => Promise<TResult> | TResult;

/**
 * Function type for direct reply mechanism
 * Used in platform-specific implementations that support direct replies
 */
export type DirectReplyFunction = (response: RpcResponse) => void; 