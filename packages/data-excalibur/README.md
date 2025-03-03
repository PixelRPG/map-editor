# @pixelrpg/data-excalibur

Excalibur.js-specific implementation of the PixelRPG data structures and resource loaders.

## Overview

This package provides the integration layer between the core PixelRPG data structures and the [Excalibur.js](https://excaliburjs.com/) game engine. It allows seamless loading and rendering of PixelRPG game projects, maps, and sprite sets in Excalibur-based games.

As part of the RPG Maker application architecture, this package handles the rendering of game maps and assets within the WebKit environment embedded in the GTK-based editor.

## Key Features

- **Resource Loaders**: Implements Excalibur's `Loadable` interface for all data types
- **Rendering Components**: Converts core data structures to Excalibur objects
- **Animation Support**: Handles animation and rendering concerns
- **Comprehensive Integration**: Provides utilities for working with PixelRPG data in Excalibur
- **Asset Management**: Efficient loading and management of game assets

## Resource Hierarchy

The package implements a hierarchical resource loading system:

- **GameProjectResource**: The top-level resource that:
  - Manages MapResources and SpriteSetResources
  - Handles initial game loading and map switching
  - Controls preloading options for maps and sprite sets
  - Provides access to all game assets via ID-based lookup

- **MapResource**: Loads and renders individual maps
  - Handles different layer types
  - Manages sprites and collisions
  - Supports object layers with game entities

- **SpriteSetResource**: Loads and manages sprites and animations
  - Provides access to individual sprites by ID
  - Handles animation playback
  - Converts sprite data to Excalibur graphics


## Usage

```typescript
import { Engine } from 'excalibur';
import { GameProjectResource } from '@pixelrpg/data-excalibur';

// Create an Excalibur game engine
const game = new Engine({
  width: 800,
  height: 600
});

// Load a game project
const projectPath = 'assets/game-project.json';
const gameProjectResource = new GameProjectResource(projectPath, {
  preloadAllSpriteSets: true,
  preloadAllMaps: false
});

// Add the resource to the loader
const loader = new ex.Loader([gameProjectResource]);

// Start the game
game.start(loader).then(() => {
  // Get the initial map and add it to the scene
  const map = gameProjectResource.getActiveMap();
  game.currentScene.add(map);
  
  // Example of switching maps
  /*
  gameProjectResource.switchMap('another-map-id').then(() => {
    const newMap = gameProjectResource.getActiveMap();
    game.currentScene.clear();
    game.currentScene.add(newMap);
  });
  */
});
```

## Role in RPG Maker Architecture

In the RPG Maker application:
- Powers the map rendering and game preview within a WebKit WebView
- Receives data from the GTK-based editor via the messaging system
- Renders maps and sprites created in the editor for real-time preview
- Provides runtime functionality for testing game mechanics
- Works in conjunction with the GJS editor but runs in a different context

The communication between the Excalibur.js renderer and the GJS editor is facilitated by the messaging system implemented in `@pixelrpg/messages-web` and `@pixelrpg/messages-gjs`.

## Development

### Building the Package

```bash
# Install dependencies
yarn install

# Build
yarn build
```

### Implementation Guidelines

When contributing to this package:

1. Maintain clean separation between core logic and engine-specific code
2. Follow Excalibur.js best practices and patterns
3. Ensure proper resource cleanup to prevent memory leaks
4. Optimize for performance in game rendering scenarios
5. Provide comprehensive examples and documentation
6. Test with various Excalibur.js versions for compatibility

## Relationship to Core Packages

- **@pixelrpg/data-core**: Provides the data structures that this package implements for Excalibur
- **@pixelrpg/messages-web**: Enables communication with the GJS editor
- Core data structures are consumed but never modified
- Engine-specific extensions are kept in this package
- Circular dependencies between packages are avoided

## Dependencies

- **@pixelrpg/data-core**: Core data structures and type definitions
- **excaliburjs/excalibur**: The Excalibur game engine
