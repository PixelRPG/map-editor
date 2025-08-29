import { EngineCommandType } from './engine-command-type'

/**
 * Type mapping for command data based on command type
 */
export interface EngineCommandEventDataMap {
  [EngineCommandType.START]: { command: EngineCommandType.START }
  [EngineCommandType.STOP]: { command: EngineCommandType.STOP }
}

/**
 * Base type for all engine command data
 */
export type EngineCommandEventData = EngineCommandEventDataMap[EngineCommandType]

/**
 * Generic engine command with typed data based on command type
 */
export interface EngineCommand<T extends EngineCommandType = EngineCommandType> {
  type: T
  data: EngineCommandEventDataMap[T]
}

/**
 * Command handler function type for engine commands
 */
export type EngineCommandHandler = (command: EngineCommand) => void | Promise<void>
