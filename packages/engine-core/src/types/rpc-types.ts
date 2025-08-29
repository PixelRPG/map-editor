import { EngineMessageType } from './engine-message-type'
import { EngineMessageDataMap } from './engine-message'
import { InputEvent } from './input-event'

/**
 * RPC Method Categories
 */
export enum RpcCategory {
  /** Commands that require confirmation/response */
  COMMAND = 'command',
  /** Events/notifications that don't require response */
  EVENT = 'event',
  /** Input events (high frequency, no response needed) */
  INPUT = 'input',
}

/**
 * RPC Method Registry - defines all available RPC methods and their types
 */
export interface RpcMethodRegistry {
  // Engine Commands (require response)
  'start': {
    category: RpcCategory.COMMAND
    params: EngineMessageDataMap[EngineMessageType.START]
    response: { success: boolean }
  }
  'stop': {
    category: RpcCategory.COMMAND
    params: EngineMessageDataMap[EngineMessageType.STOP]
    response: { success: boolean }
  }
  'load-project': {
    category: RpcCategory.COMMAND
    params: EngineMessageDataMap[EngineMessageType.LOAD_PROJECT]
    response: { success: boolean }
  }
  'load-map': {
    category: RpcCategory.COMMAND
    params: EngineMessageDataMap[EngineMessageType.LOAD_MAP]
    response: { success: boolean }
  }

  // Engine Events (fire-and-forget notifications)
  'notify-engine-event': {
    category: RpcCategory.EVENT
    params: {
      type: EngineMessageType
      data: EngineMessageDataMap[EngineMessageType]
    }
    response: void
  }

  // Input Events (high frequency, fire-and-forget)
  'handle-input-event': {
    category: RpcCategory.INPUT
    params: InputEvent
    response: void
  }
}

/**
 * Extract method names by category
 */
export type CommandMethods = {
  [K in keyof RpcMethodRegistry]: RpcMethodRegistry[K]['category'] extends RpcCategory.COMMAND ? K : never
}[keyof RpcMethodRegistry]

export type EventMethods = {
  [K in keyof RpcMethodRegistry]: RpcMethodRegistry[K]['category'] extends RpcCategory.EVENT ? K : never
}[keyof RpcMethodRegistry]

export type InputMethods = {
  [K in keyof RpcMethodRegistry]: RpcMethodRegistry[K]['category'] extends RpcCategory.INPUT ? K : never
}[keyof RpcMethodRegistry]

/**
 * Type-safe RPC method parameters
 */
export type RpcParams<T extends keyof RpcMethodRegistry> = RpcMethodRegistry[T]['params']

/**
 * Type-safe RPC method responses
 */
export type RpcResponse<T extends keyof RpcMethodRegistry> = RpcMethodRegistry[T]['response']

/**
 * Helper types for type-safe RPC calls
 */
export interface TypedRpcEndpoint {
  // Commands (use sendRequest)
  sendCommand<T extends CommandMethods>(
    method: T,
    params: RpcParams<T>
  ): Promise<RpcResponse<T>>

  // Events (use sendNotification)
  sendEvent<T extends EventMethods>(
    method: T,
    params: RpcParams<T>
  ): Promise<void>

  // Input Events (use sendNotification)
  sendInput<T extends InputMethods>(
    method: T,
    params: RpcParams<T>
  ): Promise<void>

  // Generic handlers
  registerCommandHandler<T extends CommandMethods>(
    method: T,
    handler: (params: RpcParams<T>) => Promise<RpcResponse<T>>
  ): void

  registerEventHandler<T extends EventMethods>(
    method: T,
    handler: (params: RpcParams<T>) => Promise<void>
  ): void

  registerInputHandler<T extends InputMethods>(
    method: T,
    handler: (params: RpcParams<T>) => Promise<void>
  ): void
}
