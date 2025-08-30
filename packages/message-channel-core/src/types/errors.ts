/**
 * Standard error codes for RPC communication
 */
export enum RpcErrorCode {
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
  /** Request timeout */
  TIMEOUT = -32000,
  /** Server error */
  SERVER_ERROR = -32001,
  /** Client error */
  CLIENT_ERROR = -32002,
}
