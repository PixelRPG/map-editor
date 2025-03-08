# PixelRPG Engine GJS

GJS implementation of the PixelRPG game engine.

This package provides a WebKit-based wrapper for the Excalibur.js engine implementation, allowing it to be used in GNOME JavaScript applications.

## Features

- WebView-based rendering of Excalibur.js games
- Integration with GJS and GTK
- Message-based communication with the Excalibur engine

## Usage

```typescript
import { GjsEngine } from '@pixelrpg/engine-gjs';

// Create a new engine instance
const engine = new GjsEngine();

// Initialize the engine
await engine.initialize();

// Load a game project
await engine.loadProject('path/to/game-project.json');
```

## Related Packages

- `@pixelrpg/engine-core`: Core engine interfaces
- `@pixelrpg/engine-excalibur`: Excalibur.js implementation 