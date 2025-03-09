import { EngineErrorType } from '../types/errors.ts';

/**
 * Engine-specific error class
 */
export class EngineError extends Error {
    /**
     * Create a new engine error
     * @param type Error type
     * @param message Error message
     * @param cause Original error that caused this error
     */
    constructor(
        public readonly type: EngineErrorType,
        message: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'EngineError';
    }
} 