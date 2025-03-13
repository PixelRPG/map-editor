/**
 * Polyfills for standard Web APIs in GJS environments
 * These provide compatible implementations of DOM interfaces that are used
 * by the messaging system.
 */

// Export polyfill implementations
export * from './event-dispatcher.ts'
export * from './message-event.ts'
export * from './window.ts'