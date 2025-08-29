# Unified RPC Communication Guide

## Overview

This document describes the unified RPC communication system that provides type-safe, semantic communication between different parts of the engine system.

## RPC Categories

### Commands (`sendCommand`)
**Use for:** Operations that require confirmation/response
- Engine lifecycle: `start`, `stop`
- Resource loading: `load-project`, `load-map`
- **Characteristics:** 
  - Waits for response
  - Can timeout
  - Returns success/error status
  - Should be used sparingly

### Events (`sendEvent`)
**Use for:** Notifications that don't require responses
- Status changes: engine status updates
- Completion notifications: project loaded, map loaded
- **Characteristics:**
  - Fire-and-forget
  - No response expected
  - Fast execution
  - Used for state synchronization

### Input Events (`sendInput`)
**Use for:** High-frequency user interactions
- Mouse movements, clicks
- Keyboard input
- Touch events
- **Characteristics:**
  - Fire-and-forget
  - High frequency
  - Performance optimized
  - No response expected

## Type Safety

### RPC Method Registry
All RPC methods are defined in `RpcMethodRegistry` with:
- Parameter types
- Response types  
- Category classification

```typescript
export interface RpcMethodRegistry {
  'start': {
    category: RpcCategory.COMMAND
    params: EngineMessageDataMap[EngineMessageType.START]
    response: { success: boolean }
  }
  'notify-engine-event': {
    category: RpcCategory.EVENT
    params: { type: EngineMessageType; data: any }
    response: void
  }
  'handle-input-event': {
    category: RpcCategory.INPUT
    params: InputEvent
    response: void
  }
}
```

### Usage Examples

```typescript
// Command (requires response)
const result = await rpc.sendCommand('start', {})
console.log(result.success) // boolean

// Event (fire-and-forget)
await rpc.sendEvent('notify-engine-event', {
  type: EngineMessageType.STATUS_CHANGED,
  data: EngineStatus.RUNNING
})

// Input (high-frequency, fire-and-forget)
await rpc.sendInput('handle-input-event', {
  type: InputEventType.MOUSE_MOVE,
  data: { x: 100, y: 200 }
})
```

## Migration from Legacy System

### Before (Inconsistent)
```typescript
// Mixed usage - unclear semantics
await rpc.sendRequest('notifyEngineEvent', event) // Should be notification!
rpc.sendNotification('handleInputEvent', input)   // Correct
await rpc.sendRequest('start', {})                // Correct
```

### After (Semantic)
```typescript
// Clear semantic meaning
await rpc.sendEvent('notify-engine-event', event)  // Event notification
await rpc.sendInput('handle-input-event', input)   // Input event  
await rpc.sendCommand('start', {})                  // Command with response
```

## Handler Registration

### Commands
```typescript
rpc.registerCommandHandler('start', async (params) => {
  await engine.start()
  return { success: true } // Must return response
})
```

### Events
```typescript
rpc.registerEventHandler('notify-engine-event', async (eventData) => {
  handleEngineEvent(eventData)
  // No return value needed
})
```

### Input Events
```typescript
rpc.registerInputHandler('handle-input-event', async (inputEvent) => {
  processInputEvent(inputEvent)
  // No return value needed
})
```

## Performance Considerations

1. **Commands:** Use sparingly, has timeout overhead
2. **Events:** Fast, but should not be used for high-frequency data
3. **Input Events:** Optimized for high frequency, minimal overhead

## Implementation Status

- ✅ Core type definitions (`RpcMethodRegistry`, `TypedRpcEndpoint`)
- ✅ Base typed RPC endpoint (`TypedRpcEndpointBase`)
- ✅ GJS typed RPC implementation
- ✅ WebView typed RPC implementation  
- 🔄 Engine implementations (partial)
- ⏳ Complete migration of all RPC calls

## Future Enhancements

1. **Automatic retry logic** for failed commands
2. **Batching support** for high-frequency events
3. **Performance monitoring** and metrics
4. **Schema validation** for runtime type checking
