/**
 * Standard RPC response format
 */
export interface RpcResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Base interface for RPC method registry
 * Each application should extend this to define their specific methods
 */
export interface RpcMethodRegistry {
  [method: string]: {
    params: unknown
    response: RpcResponse<unknown>
  }
}

/**
 * Type-safe RPC endpoint configuration
 */
export interface RpcEndpointConfig<
  T extends RpcMethodRegistry = RpcMethodRegistry,
> {
  methods: T
}

/**
 * Helper type to extract the params type from a registry method
 */
export type RpcMethodParams<
  T extends RpcMethodRegistry,
  K extends keyof T,
> = T[K]['params']

/**
 * Helper type to extract the response type from a registry method
 */
export type RpcMethodResponse<
  T extends RpcMethodRegistry,
  K extends keyof T,
> = T[K]['response']

/**
 * Type for RPC method handlers
 */
export type RpcMethodHandler<T extends RpcMethodRegistry, K extends keyof T> = (
  params: RpcMethodParams<T, K>,
) => Promise<RpcMethodResponse<T, K>> | RpcMethodResponse<T, K>
