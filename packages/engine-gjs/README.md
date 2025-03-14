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

## Usage

The Engine is now a GObject widget that can be directly included in your GNOME application:

```typescript
import { Engine } from '@pixelrpg/engine-gjs';

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

// Handle messages from the engine
engine.connect('message-received', (_source, message) => {
  console.log('Message from engine:', message);
});

// Send a message to the engine
engine.sendMessage({ type: 'custom-message', data: { foo: 'bar' } });
```

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