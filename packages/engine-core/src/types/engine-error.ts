/**
 * Enumeration of error types that can occur within the engine.
 * Used for categorizing and handling different types of engine errors.
 *
 * @enum EngineErrorType
 * @since 0.1.0
 */
export enum EngineErrorType {
  /**
   * Error that occurs during engine initialization
   */
  INITIALIZATION_ERROR = 'initialization-error',

  /**
   * Error that occurs during normal engine operation
   */
  RUNTIME_ERROR = 'runtime-error',

  /**
   * Error related to resource loading or management
   */
  RESOURCE_ERROR = 'resource-error',

  /**
   * Error related to data validation
   */
  VALIDATION_ERROR = 'validation-error',

  /**
   * Error related to network communication
   */
  NETWORK_ERROR = 'network-error',
}

/**
 * Base error class for all engine-related errors.
 * Provides structured error information and context.
 *
 * @class EngineError
 * @extends Error
 * @since 0.1.0
 */
export class EngineError extends Error {
  /**
   * The type of error that occurred
   */
  public readonly type: EngineErrorType

  /**
   * Additional context data related to the error
   */
  public readonly context?: Record<string, unknown>

  /**
   * Original error that caused this error (if any)
   */
  public readonly cause?: Error

  constructor(
    type: EngineErrorType,
    message: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message)
    this.name = 'EngineError'
    this.type = type
    this.context = context
    this.cause = cause

    // Maintain proper stack trace
    if (
      'captureStackTrace' in Error &&
      typeof (Error as any).captureStackTrace === 'function'
    ) {
      ;(Error as any).captureStackTrace(this, EngineError)
    }
  }

  /**
   * Creates an initialization error
   */
  static initialization(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ): EngineError {
    return new EngineError(
      EngineErrorType.INITIALIZATION_ERROR,
      message,
      context,
      cause,
    )
  }

  /**
   * Creates a runtime error
   */
  static runtime(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ): EngineError {
    return new EngineError(
      EngineErrorType.RUNTIME_ERROR,
      message,
      context,
      cause,
    )
  }

  /**
   * Creates a resource error
   */
  static resource(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ): EngineError {
    return new EngineError(
      EngineErrorType.RESOURCE_ERROR,
      message,
      context,
      cause,
    )
  }

  /**
   * Creates a validation error
   */
  static validation(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ): EngineError {
    return new EngineError(
      EngineErrorType.VALIDATION_ERROR,
      message,
      context,
      cause,
    )
  }

  /**
   * Creates a network error
   */
  static network(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error,
  ): EngineError {
    return new EngineError(
      EngineErrorType.NETWORK_ERROR,
      message,
      context,
      cause,
    )
  }
}
