import type { MessageData } from "../types/message";

/**
 * Helper function to create a properly structured message data object
 */
export function createMessageData<T = string, P = any>(
    messageType: T,
    payload: P,
    channel?: string
): MessageData<T, P> {
    return {
        messageType,
        payload,
        channel
    };
}

/**
 * Type guard to check if an object is a valid MessageData structure
 */
export function isMessageData(data: any): data is MessageData {
    return data &&
        typeof data === 'object' &&
        'messageType' in data &&
        'payload' in data;
} 