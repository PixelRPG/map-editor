import { RpcEndpoint } from './rpc-endpoint'
/**
 * Note: These types would normally be imported from @pixelrpg/engine-core,
 * but to avoid circular dependencies, we define the interface here.
 * The actual types are defined in engine-core/src/types/rpc-types.ts
 */

export interface TypedRpcEndpoint {
  sendCommand<TParams = unknown, TResult = unknown>(
    method: string,
    params: TParams
  ): Promise<TResult>

  sendEvent<TParams = unknown>(
    method: string,
    params: TParams
  ): Promise<void>

  sendInput<TParams = unknown>(
    method: string,
    params: TParams
  ): Promise<void>

  registerCommandHandler<TParams = unknown, TResult = unknown>(
    method: string,
    handler: (params: TParams) => Promise<TResult>
  ): void

  registerEventHandler<TParams = unknown>(
    method: string,
    handler: (params: TParams) => Promise<void>
  ): void

  registerInputHandler<TParams = unknown>(
    method: string,
    handler: (params: TParams) => Promise<void>
  ): void
}

/**
 * Type-safe wrapper around RpcEndpoint that enforces correct usage patterns
 */
export abstract class TypedRpcEndpointBase extends RpcEndpoint implements TypedRpcEndpoint {
  /**
   * Send a command that requires a response
   * Commands are operations that need confirmation (start, stop, load, etc.)
   */
  public async sendCommand<TParams = unknown, TResult = unknown>(
    method: string,
    params: TParams
  ): Promise<TResult> {
    return this.sendRequest(method, params) as Promise<TResult>
  }

  /**
   * Send an event notification (fire-and-forget)
   * Events are notifications that don't require responses (status changes, etc.)
   */
  public async sendEvent<TParams = unknown>(
    method: string,
    params: TParams
  ): Promise<void> {
    return this.sendNotification(method, params)
  }

  /**
   * Send an input event (fire-and-forget, high frequency)
   * Input events are frequent user interactions that don't need responses
   */
  public async sendInput<TParams = unknown>(
    method: string,
    params: TParams
  ): Promise<void> {
    return this.sendNotification(method, params)
  }

  /**
   * Register a handler for commands that must return responses
   */
  public registerCommandHandler<TParams = unknown, TResult = unknown>(
    method: string,
    handler: (params: TParams) => Promise<TResult>
  ): void {
    this.registerHandler(method, async (params) => {
      return handler(params as TParams)
    })
  }

  /**
   * Register a handler for events (no response required)
   */
  public registerEventHandler<TParams = unknown>(
    method: string,
    handler: (params: TParams) => Promise<void>
  ): void {
    this.registerHandler(method, async (params) => {
      await handler(params as TParams)
      // Events don't return values
      return undefined
    })
  }

  /**
   * Register a handler for input events (no response required)
   */
  public registerInputHandler<TParams = unknown>(
    method: string,
    handler: (params: TParams) => Promise<void>
  ): void {
    this.registerHandler(method, async (params) => {
      await handler(params as TParams)
      // Input events don't return values
      return undefined
    })
  }

  /**
   * Deprecated: Use sendCommand, sendEvent, or sendInput instead
   * @deprecated Use sendCommand for operations requiring responses, sendEvent for notifications, or sendInput for input events
   */
  public override async sendRequest<TParams = unknown, TResult = unknown>(
    method: string,
    params?: TParams,
    timeoutMs?: number
  ): Promise<TResult> {
    console.warn(`[TypedRpcEndpoint] Direct sendRequest usage is deprecated. Use sendCommand for '${method}' if it requires a response.`)
    return super.sendRequest<TParams, TResult>(method, params, timeoutMs)
  }

  /**
   * Deprecated: Use sendEvent or sendInput instead
   * @deprecated Use sendEvent for notifications or sendInput for input events
   */
  public override async sendNotification<TParams = unknown>(
    method: string,
    params?: TParams
  ): Promise<void> {
    console.warn(`[TypedRpcEndpoint] Direct sendNotification usage is deprecated. Use sendEvent or sendInput for '${method}'.`)
    return super.sendNotification<TParams>(method, params)
  }
}
