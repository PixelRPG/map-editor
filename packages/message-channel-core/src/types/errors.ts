/**
 * Structured RPC error with code, message and optional data
 */
export interface RpcError {
  /** Error code */
  code: RpcErrorCode
  /** Human-readable error message */
  message: string
  /** Optional additional error data */
  data?: unknown
}

/**
 * Utility functions for creating structured RPC errors
 */
export const RpcErrors = {
  /**
   * Create a method not found error
   */
  methodNotFound: (method: string): RpcError => ({
    code: RpcErrorCode.METHOD_NOT_FOUND,
    message: `Method '${method}' not found`,
  }),

  /**
   * Create an invalid parameters error
   */
  invalidParams: (details?: string): RpcError => ({
    code: RpcErrorCode.INVALID_PARAMS,
    message: `Invalid parameters${details ? `: ${details}` : ''}`,
  }),

  /**
   * Create an internal error
   */
  internalError: (details?: string): RpcError => ({
    code: RpcErrorCode.INTERNAL_ERROR,
    message: `Internal error${details ? `: ${details}` : ''}`,
  }),

  /**
   * Create a timeout error
   */
  timeout: (method?: string): RpcError => ({
    code: RpcErrorCode.TIMEOUT,
    message: `Request timeout${method ? ` for method '${method}'` : ''}`,
  }),

  /**
   * Create an invalid message format error
   */
  invalidMessageFormat: (details?: string): RpcError => ({
    code: RpcErrorCode.INVALID_MESSAGE_FORMAT,
    message: `Invalid message format${details ? `: ${details}` : ''}`,
  }),
} as const

/**
 * Standard error codes for RPC communication
 * Following JSON-RPC 2.0 specification where applicable
 */
export enum RpcErrorCode {
  // JSON-RPC 2.0 Standard Error Codes
  /** Unknown or unspecified error */
  UNKNOWN = 0,
  /** Method not found */
  METHOD_NOT_FOUND = -32601,
  /** Invalid parameters */
  INVALID_PARAMS = -32602,
  /** Internal error */
  INTERNAL_ERROR = -32603,
  /** Parse error */
  PARSE_ERROR = -32700,

  // Custom General Error Codes
  /** Request timeout */
  TIMEOUT = -32000,
  /** Server error */
  SERVER_ERROR = -32001,
  /** Client error */
  CLIENT_ERROR = -32002,
  /** Channel not found */
  CHANNEL_NOT_FOUND = -32003,
  /** Message handler not registered */
  HANDLER_NOT_REGISTERED = -32004,
  /** Invalid message format */
  INVALID_MESSAGE_FORMAT = -32005,
  /** Connection failed */
  CONNECTION_FAILED = -32006,
  /** Authentication failed */
  AUTHENTICATION_FAILED = -32007,
  /** Permission denied */
  PERMISSION_DENIED = -32008,
  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED = -32009,
  /** Service unavailable */
  SERVICE_UNAVAILABLE = -32010,
  /** Version mismatch */
  VERSION_MISMATCH = -32011,
}
