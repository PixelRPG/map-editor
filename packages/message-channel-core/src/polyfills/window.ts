/**
 * Polyfill for standard DOM Window in GJS environments
 * This implements the essential windowing methods needed for messaging
 */
import { EventDispatcher } from './event-dispatcher.ts';
import { MessageEvent } from './message-event.ts';

/**
 * Implementation of a minimal Window interface for GJS
 */
class Window {
    /**
     * Event dispatcher to simulate DOM events
     */
    private events = new EventDispatcher<MessageEvent>();

    /**
     * Event listeners mapped by type
     */
    private listeners: { [type: string]: Set<Function> } = {};

    /**
     * Post a message to this window context
     * @param message Message data to post
     * @param targetOrigin Target origin for security checks (not enforced in GJS)
     */
    postMessage(message: any, targetOrigin: string): void {
        // Create a standard-compliant MessageEvent
        const messageEvent = new MessageEvent('message', {
            data: message,
            origin: 'gjs',
            source: null
        });

        // Trigger all registered message listeners
        if (this.listeners['message']) {
            this.listeners['message'].forEach(listener => {
                try {
                    listener(messageEvent);
                } catch (error) {
                    console.error('Error in message listener:', error);
                }
            });
        }

        // Also emit through EventDispatcher for internal use
        this.events.dispatch(messageEvent);
    }

    /**
     * Add an event listener for DOM events
     * @param type Event type to listen for
     * @param listener Function to call when event occurs
     */
    addEventListener(type: string, listener: Function): void {
        if (!this.listeners[type]) {
            this.listeners[type] = new Set();
        }
        this.listeners[type].add(listener);

        // Also register with our EventDispatcher (only for 'message' events)
        if (type === 'message') {
            this.events.addEventListener(listener as any);
        }
    }

    /**
     * Remove an event listener
     * @param type Event type to remove listener from
     * @param listener Function to remove
     */
    removeEventListener(type: string, listener: Function): void {
        if (this.listeners[type]) {
            this.listeners[type].delete(listener);
        }

        // Also remove from EventDispatcher (only for 'message' events)
        if (type === 'message') {
            this.events.removeEventListener(listener as any);
        }
    }
}

// Create global window instance
const window = new Window();

export { window, type Window }; 