# PixelRPG Engine Core

Core interfaces, types, and utilities for the PixelRPG game engine with RPC-based communication.

This package provides common interfaces used by both the Excalibur and GJS engine implementations, featuring a unified RPC communication architecture for cross-platform engine control.

## Features

- Common engine interfaces with RPC communication
- Shared types for engine communication (`RpcEngineType`, `RpcEngineParamMap`)
- Platform-agnostic engine functionality
- Type-safe RPC message handling
- Event-driven architecture with typed events
- Engine status management and error handling

## Core Types

### RPC Engine Types

```typescript
import {
  RpcEngineType,
  RpcEngineParamMap,
  EngineInterface,
  EngineStatus,
  ProjectLoadOptions
} from '@pixelrpg/engine-core';

// RpcEngineType enum defines all available RPC commands and events
enum RpcEngineType {
  // Commands (requests from client to engine)
  INITIALIZE = 'initialize',
  LOAD_PROJECT = 'loadProject',
  LOAD_MAP = 'loadMap',
  START = 'start',
  STOP = 'stop',

  // Events (notifications from engine to client)
  STATUS_CHANGED = 'statusChanged',
  PROJECT_LOADED = 'projectLoaded',
  MAP_LOADED = 'mapLoaded',
  ERROR = 'error'
}

// RpcEngineParamMap provides type-safe parameter definitions
type RpcEngineParamMap = {
  [RpcEngineType.INITIALIZE]: { config?: EngineConfig };
  [RpcEngineType.LOAD_PROJECT]: { projectId: string; options?: ProjectLoadOptions };
  [RpcEngineType.LOAD_MAP]: { mapId: string };
  [RpcEngineType.START]: Record<string, never>; // No parameters
  [RpcEngineType.STOP]: Record<string, never>;   // No parameters

  [RpcEngineType.STATUS_CHANGED]: { status: EngineStatus };
  [RpcEngineType.PROJECT_LOADED]: { projectId: string };
  [RpcEngineType.MAP_LOADED]: { mapId: string };
  [RpcEngineType.ERROR]: { message: string; error?: Error };
};
```

## Usage

### Basic Engine Interface

```typescript
import { EngineInterface, RpcEngineType, EngineStatus } from '@pixelrpg/engine-core';

// Engine interface with RPC methods
interface EngineInterface {
  // RPC command methods
  initialize(config?: EngineConfig): Promise<void>;
  loadProject(projectId: string, options?: ProjectLoadOptions): Promise<void>;
  loadMap(mapId: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;

  // Event subscription
  on(event: RpcEngineType, handler: Function): void;
  off(event: RpcEngineType, handler: Function): void;

  // Status
  readonly status: EngineStatus;
}
```

### Engine Status Management

```typescript
import { EngineStatus } from '@pixelrpg/engine-core';

enum EngineStatus {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  LOADING_PROJECT = 'loadingProject',
  LOADING_MAP = 'loadingMap',
  RUNNING = 'running',
  ERROR = 'error',
  STOPPED = 'stopped'
}
```

### Error Handling

```typescript
import { EngineError, EngineErrorCode } from '@pixelrpg/engine-core';

// Engine-specific errors with typed error codes
class EngineError extends Error {
  constructor(
    public code: EngineErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

enum EngineErrorCode {
  INITIALIZATION_FAILED = 'initialization_failed',
  PROJECT_LOAD_FAILED = 'project_load_failed',
  MAP_LOAD_FAILED = 'map_load_failed',
  INVALID_PROJECT = 'invalid_project',
  RESOURCE_NOT_FOUND = 'resource_not_found'
}
```

## Architecture

The engine core follows a layered architecture:

1. **Engine Interface Layer**: Platform-agnostic interfaces and types
2. **RPC Communication Layer**: Typed request-response communication
3. **Event System**: Typed event emission and subscription
4. **Error Handling**: Structured error types and codes
5. **Platform Implementations**: Concrete implementations for each platform

### Communication Flow

```
┌─────────────┐     RPC Request      ┌─────────────┐
│   Client    │ ──────────────────► │   Engine    │
│             │                     │             │
│             │ ◄────────────────── │             │
│             │     RPC Response     │             │
└─────────────┘                     └─────────────┘
                                        │
                                        ▼
┌─────────────┐     Event Notification  ┌─────────────┐
│  Event      │ ◄───────────────────── │   Engine    │
│ Listeners   │                         │             │
└─────────────┘                         └─────────────┘
```

## Migration Guide

### From MessageChannel to RPC

The engine core has been refactored from a MessageChannel-based architecture to a direct RPC-based system:

**Before (deprecated):**
```typescript
// Old MessageChannel approach
const channel = new MessageChannel('engine-channel');
channel.postMessage({
  type: 'LOAD_PROJECT',
  projectId: 'my-project'
});
```

**After (current):**
```typescript
// New RPC approach
const engine = new Engine();
await engine.loadProject('my-project');
```

### Event Handling Migration

**Before:**
```typescript
channel.onmessage = (event) => {
  if (event.data.type === 'STATUS_CHANGED') {
    // handle status change
  }
};
```

**After:**
```typescript
engine.on(RpcEngineType.STATUS_CHANGED, (status) => {
  // handle status change with type safety
});
```

## Related Packages

- `@pixelrpg/engine-excalibur`: Web/Excalibur.js implementation
- `@pixelrpg/engine-gjs`: GTK/GJS implementation
- `@pixelrpg/message-channel-core`: Core messaging infrastructure 