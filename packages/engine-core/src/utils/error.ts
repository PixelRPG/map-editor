import { EngineErrorType } from '../types/engine-error-type.ts';
import { EngineError } from '../errors/engine-error.ts';

/**
 * Create an initialization error
 * @param message Error message
 * @param cause Original error that caused this error
 */
export const createInitializationError = (message: string, cause?: Error): EngineError => {
    console.error('Initialization error:', message, cause);
    return new EngineError(EngineErrorType.INITIALIZATION_ERROR, message, cause);
}

/**
 * Create a runtime error
 * @param message Error message
 * @param cause Original error that caused this error
 */
export const createRuntimeError = (message: string, cause?: Error): EngineError => {
    console.error('Runtime error:', message, cause);
    return new EngineError(EngineErrorType.RUNTIME_ERROR, message, cause);
}

/**
 * Create a resource error
 * @param message Error message
 * @param cause Original error that caused this error
 */
export const createResourceError = (message: string, cause?: Error): EngineError => {
    console.error('Resource error:', message, cause);
    return new EngineError(EngineErrorType.RESOURCE_ERROR, message, cause);
}

/**
 * Create a validation error
 * @param message Error message
 * @param cause Original error that caused this error
 */
export const createValidationError = (message: string, cause?: Error): EngineError => {
    console.error('Validation error:', message, cause);
    return new EngineError(EngineErrorType.VALIDATION_ERROR, message, cause);
}

/**
 * Create a network error
 * @param message Error message
 * @param cause Original error that caused this error
 */
export const createNetworkError = (message: string, cause?: Error): EngineError => {
    console.error('Network error:', message, cause);
    return new EngineError(EngineErrorType.NETWORK_ERROR, message, cause);
}

/**
 * Format an error for logging or display
 * @param error Error to format
 */
export const formatError = (error: Error): string => {
    if (error instanceof EngineError) {
        return `[${error.type}] ${error.message}${error.cause ? ` (Caused by: ${error.cause.message})` : ''}`;
    }
    return error.message;
}
