/**
 * Standard message data structure for all messages
 */
export interface MessageData<T = string, P = any> {
    /** Message type identifier for routing purposes */
    messageType: T;
    /** Actual payload data */
    payload: P;
    /** Optional channel identifier for multi-channel systems */
    channel?: string;
}
