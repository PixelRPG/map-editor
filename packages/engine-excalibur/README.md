# @pixelrpg/engine-excalibur

Web-based game engine implementation using Excalibur.js with RPC communication for cross-platform integration.

This package provides a complete web-based game engine that integrates with the PixelRPG ecosystem through a unified RPC interface, enabling seamless communication between web views and native applications.

## Features

- Tile-based map rendering with Excalibur.js
- Interactive map editor view with zoom and pan controls
- WebView integration for native application embedding
- RPC-based communication with native hosts (GJS/GTK applications)
- Real-time project and map loading
- Event-driven architecture with typed notifications
- Type-safe RPC method calls and event handling

## Architecture

The engine follows a layered architecture:

1. **Web Engine Layer**: Excalibur.js game engine for rendering and game logic
2. **RPC Communication Layer**: Bidirectional communication with native hosts
3. **Project Management**: Loading and managing game projects and maps
4. **Event System**: Typed event emission for status updates and notifications

### Communication Flow

```
┌─────────────────┐     RPC Request      ┌─────────────────┐
│   Native Host   │ ───────────────────► │  Web Engine     │
│   (GJS/GTK)     │                      │ (Excalibur.js)  │
│                 │ ◄─────────────────── │                 │
│                 │     RPC Response      │                 │
└─────────────────┘                       └─────────────────┘
                                              │
                                              ▼
┌─────────────────┐     Event Notification     ┌─────────────────┐
│   Event         │ ◄──────────────────────── │  Web Engine     │
│   Listeners      │                            │                 │
│   (Native Host)  │                            │                 │
└─────────────────┘                             └─────────────────┘
```

## Usage

### Basic Engine Integration

```typescript
import { Engine } from '@pixelrpg/engine-excalibur';
import { RpcEngineType, EngineStatus } from '@pixelrpg/engine-core';

// Create and initialize the engine
const engine = new Engine();

// Initialize the engine (optional configuration)
await engine.initialize({
  canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
  width: 800,
  height: 600
});

// Load a project
await engine.loadProject('/path/to/project.json');

// Load a specific map
await engine.loadMap('kokiri-forest');

// Start the engine
await engine.start();

// Handle engine events
engine.on(RpcEngineType.STATUS_CHANGED, (status: EngineStatus) => {
  console.log('Engine status changed:', status);
});

engine.on(RpcEngineType.PROJECT_LOADED, (projectId: string) => {
  console.log('Project loaded:', projectId);
});

engine.on(RpcEngineType.ERROR, (message: string, error?: Error) => {
  console.error('Engine error:', message, error);
});
```

### RPC Communication Setup

For integration with native applications, the engine automatically sets up RPC communication:

```typescript
// In the web context (this package handles this automatically)
const engine = new Engine();

// RPC handlers are automatically registered for:
// - loadProject
// - loadMap
// - start
// - stop
// - initialize

// Events are automatically emitted for:
// - statusChanged
// - projectLoaded
// - mapLoaded
// - error
```

### Native Host Integration

When embedded in a native application (e.g., GJS/GTK), the native host can control the engine:

```typescript
// In native host (GJS example)
import { Engine } from '@pixelrpg/engine-gjs';
import WebKit from '@girs/webkit-6.0';

const webView = new WebKit.WebView();
const engine = new Engine();

// Load the web engine
webView.load_uri('${INTERNAL_PROTOCOL}:///index.html');

// Control the web engine via RPC
await engine.loadProject('/path/to/project.json');
await engine.start();

// Listen to web engine events
engine.connect(RpcEngineType.STATUS_CHANGED, (_source, status) => {
  console.log('Web engine status:', status);
});
```

## Project Structure

```
src/
├── engine.ts          # Main engine implementation
├── main.ts           # Application entry point
├── settings.ts       # Engine configuration
├── systems/          # Game systems (input, rendering, etc.)
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
```

## Development

### Prerequisites

- Node.js 16+
- Yarn package manager
- Modern web browser with WebGL support

### Setup

```bash
# Install dependencies
yarn install

# Development with hot reload
yarn dev

# Build for production
yarn build

# Preview production build
yarn preview
```

### Development Commands

```bash
# Type checking
yarn type-check

# Linting
yarn lint

# Testing
yarn test

# Build with watch mode
yarn build:watch
```

## RPC Interface

The engine exposes the following RPC methods:

### Commands (Host → Engine)

- `initialize(config?)`: Initialize the engine with optional configuration
- `loadProject(projectId, options?)`: Load a game project
- `loadMap(mapId)`: Load a specific map
- `start()`: Start the game engine
- `stop()`: Stop the game engine

### Events (Engine → Host)

- `statusChanged(status)`: Engine status has changed
- `projectLoaded(projectId)`: Project has been loaded successfully
- `mapLoaded(mapId)`: Map has been loaded successfully
- `error(message, error?)`: An error occurred in the engine

### Type Safety

All RPC communication is fully type-safe:

```typescript
import { RpcEngineType, RpcEngineParamMap } from '@pixelrpg/engine-core';

// Type-safe RPC calls
await engine.loadProject('my-project', {
  validateResources: true,
  preloadAssets: true
});

// Type-safe event handling
engine.on(RpcEngineType.PROJECT_LOADED, (projectId: string) => {
  // projectId is correctly typed as string
});
```

## Configuration

The engine can be configured with the following options:

```typescript
interface EngineConfig {
  canvas?: HTMLCanvasElement;    // Target canvas element
  width?: number;               // Canvas width (default: 800)
  height?: number;              // Canvas height (default: 600)
  backgroundColor?: string;     // Background color (default: black)
  enableDebug?: boolean;        // Enable debug mode (default: false)
  resourcePaths?: string[];     // Additional resource paths
}
```

## Error Handling

The engine provides comprehensive error handling:

```typescript
engine.on(RpcEngineType.ERROR, (message: string, error?: Error) => {
  if (error) {
    console.error('Engine error:', error.message);
    console.error('Stack trace:', error.stack);
  } else {
    console.error('Engine error:', message);
  }

  // Handle specific error types
  if (message.includes('project')) {
    // Handle project loading errors
  } else if (message.includes('map')) {
    // Handle map loading errors
  }
});
```

## Performance Considerations

- The engine uses Excalibur.js for optimized rendering
- RPC communication is asynchronous to avoid blocking
- Resources are cached to improve loading performance
- The engine supports viewport culling for large maps

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

WebGL support is required for optimal performance.

## Asset Credits

Map and sprite assets are based on:
https://github.com/Colbydude/OoT2DUnity

## Related Packages

- `@pixelrpg/engine-core`: Core engine interfaces and types
- `@pixelrpg/engine-gjs`: GTK/GJS implementation
- `@pixelrpg/message-channel-core`: Core messaging infrastructure
- `@pixelrpg/message-channel-web`: Web messaging implementation