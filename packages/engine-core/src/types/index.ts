// Common types
export * from './position'

// Engine status and events
export * from './engine-status'

// Input events
export * from './input-event-type'
export * from './mouse-event-data'
export * from './key-event-data'
export * from './input-event'

// Error types
export * from './engine-error-type'

// Project options
export * from './project-options'

// Message types (unified)
export * from './engine-message-type'
export * from './engine-message'

// Legacy message types (deprecated - use EngineMessageType instead)
/** @deprecated Use EngineMessageType instead */
export * from './engine-event-type'
/** @deprecated Use EngineMessage instead */
export * from './engine-event'
/** @deprecated Use EngineMessageType instead */
export * from './engine-command-type'
/** @deprecated Use EngineMessage instead */
export * from './engine-command'
