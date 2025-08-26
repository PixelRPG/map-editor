# PixelRPG Engine GJS

GJS implementation of the PixelRPG game engine for GNOME applications.

## Features

- WebKit-based rendering of the Excalibur.js game engine
- GObject integration for easy use in GNOME applications
- Resource management for game assets
- Message passing between GJS and the web engine

## Installation

```bash
yarn add @pixelrpg/engine-gjs
```

## Quick Start

The Engine is a GObject widget that can be directly included in your GNOME application.

For detailed examples and advanced usage, see the [Getting Started Guide](docs/getting-started.md).

### Basic Example

```typescript
import { Engine } from '@pixelrpg/engine-gjs';
import { EngineEventType } from '@pixelrpg/engine-core';

// Create a new engine instance
const engine = new Engine();

// Set resource paths (must be done before or right after adding to UI)
engine.setResourcePaths(['/path/to/resources']);

// Set GResource path if needed
engine.setGResourcePath('/org/pixelrpg/maker/engine-excalibur');

// Add the engine to your UI
myContainer.append(engine);

// Load a project
await engine.loadProject('/path/to/project.json');

// Load a map
await engine.loadMap('map1');

// Start the engine
await engine.start();

// Handle engine events using enum values
engine.connect(EngineEventType.STATUS_CHANGED, (_source, status) => {
  console.log('Engine status changed:', status);
});

engine.connect(EngineEventType.PROJECT_LOADED, (_source, projectId) => {
  console.log('Project loaded:', projectId);
});

engine.connect(EngineEventType.MAP_LOADED, (_source, mapId) => {
  console.log('Map loaded:', mapId);
});

engine.connect(EngineEventType.ERROR, (_source, message, error) => {
  console.error('Engine error:', message, error);
});

```

## Documentation

- [Getting Started Guide](docs/getting-started.md) - Comprehensive guide with examples
- [API Reference](src/) - TypeScript source code with JSDoc comments

## Building

```bash
# Install dependencies
yarn

# Build the package
yarn build
```

## Development

```bash
# Watch for changes
yarn watch
```

## Related Packages

- `@pixelrpg/engine-core`: Core engine interfaces
- `@pixelrpg/engine-excalibur`: Excalibur.js implementation 