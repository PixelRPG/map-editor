/**
 * Interface for resource event handling across different platforms
 * Provides a common pattern for event handling in both Excalibur.js and GJS implementations
 */
export interface ResourceEventEmitter {
    /**
     * Connect an event handler to a resource event
     * @param event The event name
     * @param callback The event handler function
     */
    connect(event: string, callback: (...args: any[]) => void): void;

    /**
     * Disconnect an event handler from a resource event
     * @param event The event name
     * @param callback The event handler function to disconnect
     */
    disconnect(event: string, callback: (...args: any[]) => void): void;

    /**
     * Emit an event with specified arguments
     * @param event The event name
     * @param args Event arguments
     */
    emit?(event: string, ...args: any[]): void;
} 