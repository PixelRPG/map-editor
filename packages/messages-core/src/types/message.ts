/**
 * Generic message interface that allows for custom message types
 * This allows other packages to define their own message types
 * without modifying the messages-core package
 */
export interface Message<T = any, D = any> {
    type: T;
    data: D;
} 