import { EngineErrorType } from '../types/errors.ts';
import { EngineError } from '../errors/engine-error.ts';

/**
 * Service for consistent error handling across the engine
 */
class ErrorService {
    /**
     * Create an initialization error
     * @param message Error message
     * @param cause Original error that caused this error
     */
    createInitializationError(message: string, cause?: Error): EngineError {
        return new EngineError(EngineErrorType.INITIALIZATION_ERROR, message, cause);
    }

    /**
     * Create a runtime error
     * @param message Error message
     * @param cause Original error that caused this error
     */
    createRuntimeError(message: string, cause?: Error): EngineError {
        return new EngineError(EngineErrorType.RUNTIME_ERROR, message, cause);
    }

    /**
     * Create a resource error
     * @param message Error message
     * @param cause Original error that caused this error
     */
    createResourceError(message: string, cause?: Error): EngineError {
        return new EngineError(EngineErrorType.RESOURCE_ERROR, message, cause);
    }

    /**
     * Create a validation error
     * @param message Error message
     * @param cause Original error that caused this error
     */
    createValidationError(message: string, cause?: Error): EngineError {
        return new EngineError(EngineErrorType.VALIDATION_ERROR, message, cause);
    }

    /**
     * Create a network error
     * @param message Error message
     * @param cause Original error that caused this error
     */
    createNetworkError(message: string, cause?: Error): EngineError {
        return new EngineError(EngineErrorType.NETWORK_ERROR, message, cause);
    }

    /**
     * Format an error for logging or display
     * @param error Error to format
     */
    formatError(error: Error): string {
        if (error instanceof EngineError) {
            return `[${error.type}] ${error.message}${error.cause ? ` (Caused by: ${error.cause.message})` : ''}`;
        }
        return error.message;
    }
}

export const errorService = new ErrorService();