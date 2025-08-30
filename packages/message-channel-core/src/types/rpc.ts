/**
 * Standard RPC response format following JSON-RPC 2.0 specification
 *
 * @template T - The type of data returned on success
 *
 * @example
 * ```typescript
 * // Success response
 * const successResponse: RpcResponse<string> = {
 *   success: true,
 *   data: "Hello World"
 * }
 *
 * // Error response
 * const errorResponse: RpcResponse = {
 *   success: false,
 *   error: "Method not found"
 * }
 * ```
 */
export interface RpcResponse<T = void> {
  /** Indicates whether the RPC call was successful */
  success: boolean
  /** Data returned from the successful RPC call */
  data?: T
  /** Error message if the RPC call failed */
  error?: string
  /** Optional error code for programmatic error handling */
  code?: number
}

/**
 * Base interface for RPC method registry
 *
 * Applications should extend this interface to define their specific RPC methods
 * with proper typing for parameters and responses.
 *
 * @example
 * ```typescript
 * interface MyRpcRegistry extends RpcMethodRegistry {
 *   'user.get': {
 *     params: { id: string }
 *     response: RpcResponse<User>
 *   }
 *   'user.create': {
 *     params: { name: string; email: string }
 *     response: RpcResponse<User>
 *   }
 * }
 * ```
 */
export interface RpcMethodRegistry {
  /** Each method key maps to its parameter and response types */
  [method: string]: {
    /** Parameters expected by the method */
    params: unknown
    /** Response type returned by the method */
    response: RpcResponse<unknown>
  }
}

/**
 * Extracts the parameter type for a specific RPC method from the registry
 *
 * @template T - The RPC method registry type
 * @template K - The method key in the registry
 *
 * @example
 * ```typescript
 * type GetUserParams = RpcMethodParams<MyRpcRegistry, 'user.get'>
 * // Results in: { id: string }
 * ```
 */
export type RpcMethodParams<
  T extends RpcMethodRegistry,
  K extends keyof T,
> = T[K]['params']

/**
 * Extracts the response type for a specific RPC method from the registry
 *
 * @template T - The RPC method registry type
 * @template K - The method key in the registry
 *
 * @example
 * ```typescript
 * type GetUserResponse = RpcMethodResponse<MyRpcRegistry, 'user.get'>
 * // Results in: RpcResponse<User>
 * ```
 */
export type RpcMethodResponse<
  T extends RpcMethodRegistry,
  K extends keyof T,
> = T[K]['response']

/**
 * Type-safe RPC method handler function
 *
 * @template T - The RPC method registry type
 * @template K - The method key in the registry
 *
 * @param params - Parameters passed to the method
 * @returns Promise or synchronous response from the method execution
 *
 * @example
 * ```typescript
 * const getUserHandler: RpcMethodHandler<MyRpcRegistry, 'user.get'> =
 *   async (params) => {
 *     const user = await userService.findById(params.id)
 *     return { success: true, data: user }
 *   }
 * ```
 */
export type RpcMethodHandler<T extends RpcMethodRegistry, K extends keyof T> = (
  params: RpcMethodParams<T, K>,
) => Promise<RpcMethodResponse<T, K>> | RpcMethodResponse<T, K>
