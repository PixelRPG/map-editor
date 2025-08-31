import { RpcError, RpcErrorCode } from '@pixelrpg/message-channel-core'

/**
 * Engine-specific error codes that map to available RPC error codes
 */
export const EngineErrorCode = {
  /** Engine not initialized */
  ENGINE_NOT_INITIALIZED: RpcErrorCode.SERVER_ERROR,
  /** Engine already running */
  ENGINE_ALREADY_RUNNING: RpcErrorCode.SERVER_ERROR,
  /** Engine not running */
  ENGINE_NOT_RUNNING: RpcErrorCode.SERVER_ERROR,
  /** Invalid engine status */
  INVALID_ENGINE_STATUS: RpcErrorCode.INVALID_PARAMS,
  /** Project not loaded */
  PROJECT_NOT_LOADED: RpcErrorCode.SERVER_ERROR,
  /** Project already loaded */
  PROJECT_ALREADY_LOADED: RpcErrorCode.SERVER_ERROR,
  /** Invalid project path */
  INVALID_PROJECT_PATH: RpcErrorCode.INVALID_PARAMS,
  /** Map not found */
  MAP_NOT_FOUND: RpcErrorCode.SERVER_ERROR,
  /** Map already loaded */
  MAP_ALREADY_LOADED: RpcErrorCode.SERVER_ERROR,
  /** Invalid map ID */
  INVALID_MAP_ID: RpcErrorCode.INVALID_PARAMS,
  /** Resource loading failed */
  RESOURCE_LOAD_FAILED: RpcErrorCode.SERVER_ERROR,
} as const

/**
 * Utility functions for creating engine-specific errors
 */
export const EngineErrors = {
  /**
   * Create an engine not initialized error
   */
  engineNotInitialized: (): RpcError => ({
    code: EngineErrorCode.ENGINE_NOT_INITIALIZED,
    message: 'Engine not initialized',
  }),

  /**
   * Create a project not loaded error
   */
  projectNotLoaded: (): RpcError => ({
    code: EngineErrorCode.PROJECT_NOT_LOADED,
    message: 'Project not loaded',
  }),

  /**
   * Create an engine not running error
   */
  engineNotRunning: (): RpcError => ({
    code: EngineErrorCode.ENGINE_NOT_RUNNING,
    message: 'Engine not running',
  }),

  /**
   * Create an invalid map ID error
   */
  invalidMapId: (mapId: string): RpcError => ({
    code: EngineErrorCode.INVALID_MAP_ID,
    message: `Invalid map ID: ${mapId}`,
  }),

  /**
   * Create a map not found error
   */
  mapNotFound: (mapId: string): RpcError => ({
    code: EngineErrorCode.MAP_NOT_FOUND,
    message: `Map not found: ${mapId}`,
  }),
} as const
