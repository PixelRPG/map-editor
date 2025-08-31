import { isRpcRequest, isRpcResponse, isBaseMessage } from './message'

/**
 * Validation result indicating success or failure with details
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean
  /** Error message if validation failed */
  error?: string
  /** Additional validation details */
  details?: unknown
}

/**
 * Configuration for RPC message validation
 */
export interface RpcValidationConfig {
  /** Maximum allowed message ID length */
  maxMessageIdLength?: number
  /** Maximum allowed method name length */
  maxMethodNameLength?: number
  /** Maximum allowed parameter depth (for circular reference detection) */
  maxParameterDepth?: number
  /** Whether to allow unknown properties in parameters */
  allowUnknownProperties?: boolean
  /** Custom validation functions */
  customValidators?: {
    messageId?: (id: string) => ValidationResult
    methodName?: (method: string) => ValidationResult
    parameters?: (params: unknown) => ValidationResult
  }
}

/**
 * Default validation configuration
 */
const DEFAULT_VALIDATION_CONFIG: Required<RpcValidationConfig> = {
  maxMessageIdLength: 256,
  maxMethodNameLength: 256,
  maxParameterDepth: 10,
  allowUnknownProperties: true,
  customValidators: {},
}

/**
 * Validate an RPC request message
 *
 * @param message - The message to validate
 * @param config - Optional validation configuration
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateRpcRequest(request)
 * if (!result.valid) {
 *   console.error('Invalid request:', result.error)
 * }
 * ```
 */
export function validateRpcRequest(
  message: unknown,
  config: RpcValidationConfig = {},
): ValidationResult {
  const mergedConfig = { ...DEFAULT_VALIDATION_CONFIG, ...config }

  // Check if it's a valid RPC request structure
  if (!isRpcRequest(message)) {
    return {
      valid: false,
      error: 'Message is not a valid RPC request',
      details: { type: typeof message },
    }
  }

  // Validate message ID
  const idValidation = validateMessageId(message.id, mergedConfig)
  if (!idValidation.valid) {
    return idValidation
  }

  // Validate method name
  const methodValidation = validateMethodName(message.method, mergedConfig)
  if (!methodValidation.valid) {
    return methodValidation
  }

  // Validate base message properties
  const baseValidation = validateBaseMessage(message, mergedConfig)
  if (!baseValidation.valid) {
    return baseValidation
  }

  // Validate parameters
  if (message.params !== undefined) {
    const paramsValidation = validateParameters(message.params, mergedConfig)
    if (!paramsValidation.valid) {
      return paramsValidation
    }
  }

  return { valid: true }
}

/**
 * Validate an RPC response message
 *
 * @param message - The message to validate
 * @param config - Optional validation configuration
 * @returns Validation result
 */
export function validateRpcResponse(
  message: unknown,
  config: RpcValidationConfig = {},
): ValidationResult {
  const mergedConfig = { ...DEFAULT_VALIDATION_CONFIG, ...config }

  // Check if it's a valid RPC response structure
  if (!isRpcResponse(message)) {
    return {
      valid: false,
      error: 'Message is not a valid RPC response',
      details: { type: typeof message },
    }
  }

  // Validate message ID
  const idValidation = validateMessageId(message.id, mergedConfig)
  if (!idValidation.valid) {
    return idValidation
  }

  // Validate base message properties
  const baseValidation = validateBaseMessage(message, mergedConfig)
  if (!baseValidation.valid) {
    return baseValidation
  }

  // Validate response structure - check for existence rather than undefined
  // This aligns with the type definition where both result and error are optional
  if (!('result' in message) && !('error' in message)) {
    return {
      valid: false,
      error: 'Response must contain either result or error field',
      details: { hasResult: 'result' in message, hasError: 'error' in message },
    }
  }

  if (message.result !== undefined && message.error !== undefined) {
    return {
      valid: false,
      error: 'Response cannot contain both result and error',
    }
  }

  // Validate error structure if present
  if (message.error !== undefined) {
    const errorValidation = validateRpcError(message.error)
    if (!errorValidation.valid) {
      return errorValidation
    }
  }

  return { valid: true }
}

/**
 * Validate a message ID
 *
 * @param id - The message ID to validate
 * @param config - Validation configuration
 * @returns Validation result
 */
export function validateMessageId(
  id: string,
  config: RpcValidationConfig = {},
): ValidationResult {
  const mergedConfig = { ...DEFAULT_VALIDATION_CONFIG, ...config }

  if (typeof id !== 'string') {
    return {
      valid: false,
      error: 'Message ID must be a string',
      details: { type: typeof id },
    }
  }

  if (id.length === 0) {
    return {
      valid: false,
      error: 'Message ID cannot be empty',
    }
  }

  if (id.length > mergedConfig.maxMessageIdLength) {
    return {
      valid: false,
      error: `Message ID is too long (max ${mergedConfig.maxMessageIdLength} characters)`,
      details: { length: id.length },
    }
  }

  // Run custom validator if provided
  if (mergedConfig.customValidators.messageId) {
    return mergedConfig.customValidators.messageId(id)
  }

  return { valid: true }
}

/**
 * Validate a method name
 *
 * @param method - The method name to validate
 * @param config - Validation configuration
 * @returns Validation result
 */
export function validateMethodName(
  method: string,
  config: RpcValidationConfig = {},
): ValidationResult {
  const mergedConfig = { ...DEFAULT_VALIDATION_CONFIG, ...config }

  if (typeof method !== 'string') {
    return {
      valid: false,
      error: 'Method name must be a string',
      details: { type: typeof method },
    }
  }

  if (method.length === 0) {
    return {
      valid: false,
      error: 'Method name cannot be empty',
    }
  }

  if (method.length > mergedConfig.maxMethodNameLength) {
    return {
      valid: false,
      error: `Method name is too long (max ${mergedConfig.maxMethodNameLength} characters)`,
      details: { length: method.length },
    }
  }

  // Basic method name validation (no control characters, etc.)
  if (/[\x00-\x1F\x7F]/.test(method)) {
    return {
      valid: false,
      error: 'Method name contains invalid control characters',
    }
  }

  // Run custom validator if provided
  if (mergedConfig.customValidators.methodName) {
    return mergedConfig.customValidators.methodName(method)
  }

  return { valid: true }
}

/**
 * Validate base message properties
 *
 * @param message - The message to validate
 * @param config - Validation configuration
 * @returns Validation result
 */
export function validateBaseMessage(
  message: unknown,
  _config: RpcValidationConfig = {},
): ValidationResult {
  if (!isBaseMessage(message)) {
    return {
      valid: false,
      error: 'Message is not a valid base message',
    }
  }

  // Validate channel if present
  if (message.channel !== undefined) {
    if (typeof message.channel !== 'string') {
      return {
        valid: false,
        error: 'Channel must be a string',
        details: { type: typeof message.channel },
      }
    }

    if (message.channel.length === 0) {
      return {
        valid: false,
        error: 'Channel cannot be empty',
      }
    }
  }

  return { valid: true }
}

/**
 * Validate RPC parameters
 *
 * @param params - The parameters to validate
 * @param config - Validation configuration
 * @param depth - Current recursion depth (internal)
 * @returns Validation result
 */
export function validateParameters(
  params: unknown,
  config: RpcValidationConfig = {},
  depth = 0,
): ValidationResult {
  const mergedConfig = { ...DEFAULT_VALIDATION_CONFIG, ...config }

  // Check recursion depth to prevent circular references
  if (depth > mergedConfig.maxParameterDepth) {
    return {
      valid: false,
      error: 'Parameter depth exceeds maximum allowed depth',
      details: { maxDepth: mergedConfig.maxParameterDepth },
    }
  }

  // Validate basic types
  if (params === null || params === undefined) {
    return { valid: true }
  }

  // Validate primitives
  if (
    typeof params === 'string' ||
    typeof params === 'number' ||
    typeof params === 'boolean'
  ) {
    return { valid: true }
  }

  // Validate arrays
  if (Array.isArray(params)) {
    for (let i = 0; i < params.length; i++) {
      const itemValidation = validateParameters(
        params[i],
        mergedConfig,
        depth + 1,
      )
      if (!itemValidation.valid) {
        return {
          ...itemValidation,
          error: `Array item at index ${i}: ${itemValidation.error}`,
        }
      }
    }
    return { valid: true }
  }

  // Validate objects
  if (typeof params === 'object') {
    const obj = params as Record<string, unknown>

    // Check for circular references (simple check)
    try {
      JSON.stringify(obj)
    } catch (error) {
      return {
        valid: false,
        error: 'Parameters contain circular references',
        details: {
          originalError: error instanceof Error ? error.message : String(error),
        },
      }
    }

    // Validate each property
    for (const [key, value] of Object.entries(obj)) {
      if (typeof key !== 'string') {
        return {
          valid: false,
          error: 'Object property keys must be strings',
          details: { key, keyType: typeof key },
        }
      }

      const valueValidation = validateParameters(value, mergedConfig, depth + 1)
      if (!valueValidation.valid) {
        return {
          ...valueValidation,
          error: `Property '${key}': ${valueValidation.error}`,
        }
      }
    }

    // Run custom validator if provided
    if (mergedConfig.customValidators.parameters) {
      return mergedConfig.customValidators.parameters(params)
    }

    return { valid: true }
  }

  // Reject functions and symbols
  if (typeof params === 'function' || typeof params === 'symbol') {
    return {
      valid: false,
      error: `Parameters cannot contain ${typeof params}`,
    }
  }

  return { valid: true }
}

/**
 * Validate an RPC error object
 *
 * @param error - The error object to validate
 * @returns Validation result
 */
export function validateRpcError(error: unknown): ValidationResult {
  if (typeof error !== 'object' || error === null) {
    return {
      valid: false,
      error: 'RPC error must be an object',
      details: { type: typeof error },
    }
  }

  const err = error as Record<string, unknown>

  // Validate error code
  if (!('code' in err) || typeof err.code !== 'number') {
    return {
      valid: false,
      error: 'RPC error must contain a numeric code',
    }
  }

  // Validate error message
  if (!('message' in err) || typeof err.message !== 'string') {
    return {
      valid: false,
      error: 'RPC error must contain a string message',
    }
  }

  if (err.message.length === 0) {
    return {
      valid: false,
      error: 'RPC error message cannot be empty',
    }
  }

  return { valid: true }
}

/**
 * Validate an RPC response object
 *
 * @param response - The response to validate
 * @returns Validation result
 */
export function validateRpcResponseObject(response: unknown): ValidationResult {
  if (typeof response !== 'object' || response === null) {
    return {
      valid: false,
      error: 'RPC response must be an object',
      details: { type: typeof response },
    }
  }

  const resp = response as Record<string, unknown>

  // Validate success flag
  if (!('success' in resp) || typeof resp.success !== 'boolean') {
    return {
      valid: false,
      error: 'RPC response must contain a boolean success flag',
    }
  }

  // If success is true, validate data
  if (resp.success === true) {
    // Data is optional for successful responses
    return { valid: true }
  }

  // If success is false, validate error
  if (resp.success === false) {
    if (!('error' in resp) || typeof resp.error !== 'string') {
      return {
        valid: false,
        error: 'Failed RPC response must contain a string error message',
      }
    }

    if (resp.error.length === 0) {
      return {
        valid: false,
        error: 'RPC error message cannot be empty',
      }
    }
  }

  return { valid: true }
}

/**
 * Comprehensive validation for any RPC message
 *
 * @param message - The message to validate
 * @param config - Optional validation configuration
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateRpcMessage(message)
 * if (!result.valid) {
 *   throw new Error(`Invalid RPC message: ${result.error}`)
 * }
 * ```
 */
export function validateRpcMessage(
  message: unknown,
  config: RpcValidationConfig = {},
): ValidationResult {
  if (!isBaseMessage(message)) {
    return {
      valid: false,
      error: 'Message is not a valid RPC message',
    }
  }

  // Try to validate as request
  if ('type' in message && (message as any).type === 'request') {
    return validateRpcRequest(message, config)
  }

  // Try to validate as response
  if ('type' in message && (message as any).type === 'response') {
    return validateRpcResponse(message, config)
  }

  return {
    valid: false,
    error: 'Message type is not recognized',
    details: { message },
  }
}

/**
 * Create a validation configuration with common settings
 *
 * @param overrides - Configuration overrides
 * @returns Validation configuration
 *
 * @example
 * ```typescript
 * const config = createValidationConfig({
 *   maxMessageIdLength: 128,
 *   customValidators: {
 *     methodName: (method) => ({
 *       valid: method.startsWith('api.'),
 *       error: 'Method name must start with "api."'
 *     })
 *   }
 * })
 * ```
 */
export function createValidationConfig(
  overrides: Partial<RpcValidationConfig> = {},
): RpcValidationConfig {
  return { ...DEFAULT_VALIDATION_CONFIG, ...overrides }
}
