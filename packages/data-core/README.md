# @pixelrpg/data-core

Core data structures and type definitions for the PixelRPG project, platform-independent implementation.

## Overview

This package provides the foundation for all data formats used in the PixelRPG project. It contains runtime-agnostic implementations of data structures, interfaces, and utilities that can be used across different environments and rendering engines.

As part of the RPG Maker application architecture, this package defines the core data formats that are shared between the GTK-based editor (GJS) and the Excalibur.js-based game engine (WebKit).

## Key Features

- **Type Definitions**: Comprehensive TypeScript interfaces for all data structures
- **Validation Logic**: Robust validation of data formats
- **Serialization Utilities**: Tools for data conversion and persistence
- **Platform Independence**: No dependencies on specific rendering engines or platforms

## Core Data Structures

The package defines several key data structures:

- **GameProjectData**: Project configuration that references maps and sprite sets
- **MapData**: The core map structure for game worlds
- **LayerData**: Layer information within maps
- **SpriteSetData**: Sprite set definitions with metadata
- **SpriteData**: Individual sprite information
- **AnimationData**: Animation definitions and frame sequences
- **ObjectData**: Game objects with position, size, and properties
- **ColliderShape**: Collision shape definitions

## Usage

```typescript
import { 
  GameProjectData, 
  MapData, 
  SpriteSetData, 
  GameProjectFormat 
} from '@pixelrpg/data-core';

// Create a new game project
const project: GameProjectData = {
  version: "1.0.0",
  id: "my-rpg-game",
  name: "My RPG Adventure",
  maps: [],
  spriteSets: [],
  // ...additional properties
};

// Validate the project data
const format = new GameProjectFormat();
const isValid = format.validate(project);

if (isValid) {
  // Use the project data
  console.log(`Project "${project.name}" is valid!`);
} else {
  console.error("Invalid project data");
}
```

## Role in RPG Maker Architecture

In the RPG Maker application:
- Defines the data structures used by both the editor and game engine
- Provides a shared contract between different runtime environments
- Enables consistent validation and serialization across the application
- Serves as the foundation for runtime-specific implementations

The data defined here is passed between the GJS editor interface and the WebKit-embedded Excalibur.js renderer using the messaging system implemented in `@pixelrpg/messages-gjs` and `@pixelrpg/messages-web`.

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

1. Maintain strict runtime independence
2. Ensure comprehensive validation of all data structures
3. Use explicit TypeScript interfaces with thorough JSDoc documentation
4. Avoid dependencies that would tie the core to specific runtimes
5. Design with extensibility in mind for future integrations
6. Keep APIs consistent across different data types

## Related Packages

- **@pixelrpg/data-excalibur**: Excalibur.js-specific implementation that renders this data
- **@pixelrpg/data-gjs**: GNOME JavaScript runtime implementation
- **@pixelrpg/messages-gjs** and **@pixelrpg/messages-web**: Communication system for transferring this data
