# @pixelrpg/data-gjs

GJS (GNOME JavaScript) implementation for PixelRPG data structures.

## Overview

This package provides GJS-specific implementations for loading and managing PixelRPG game data. It integrates with the GNOME platform and provides utilities for working with game resources in a GJS environment.

## Features

- Load map data from JSON files
- Load sprite sets with modern Gdk.Texture integration
- Lightweight Sprite data structures with on-demand Gdk.Paintable creation
- Load game projects with resource management
- GResource support for packaged applications
- Utilities for file operations in GJS
- Integration with GNOME file system and resources
- GC-safe sprite rendering without vfunc disposal issues

## Installation

```bash
yarn add @pixelrpg/data-gjs
```

## Usage

### Loading a Map

```typescript
import { MapResource } from '@pixelrpg/data-gjs';

// Create a map resource
const mapResource = new MapResource({
  path: '/path/to/map.json'
});

// Load the map data
const mapData = await mapResource.load();
console.log(mapData.name);
```

### Loading a Sprite Set

```typescript
import { SpriteSetResource } from '@pixelrpg/data-gjs';

// Create a sprite set resource
const spriteSetResource = new SpriteSetResource({
  path: '/path/to/spriteset.json'
});

// Load the sprite set data
const spriteSetData = await spriteSetResource.load();
console.log(spriteSetData.name);

// Access the loaded texture and sprite sheet
const texture = spriteSetResource.texture;
const spriteSheet = spriteSetResource.spriteSheet;

if (texture && spriteSheet) {
  // Get individual sprites
  const sprite = spriteSheet.getSprite(0, 0); // First sprite
  
  // Use sprite with GTK widgets
  const picture = new Gtk.Picture();
  picture.set_paintable(sprite.createPaintable());
}
```

### Loading a Game Project

```typescript
import { GameProjectResource } from '@pixelrpg/data-gjs';

// Create a game project resource
const projectResource = new GameProjectResource({
  path: '/path/to/project.json',
  preloadResources: true, // Automatically load all referenced resources
  useGResource: false // Set to true to load from GResource
});

// Load the project data
const projectData = await projectResource.load();

// Get a specific map
const mapData = await projectResource.getMap('map1');

// Get a specific sprite set
const spriteSetData = await projectResource.getSpriteSet('spriteset1');
```

### Using GResource

```typescript
import { GResourceHelper } from '@pixelrpg/data-gjs';

// Register a GResource file
const resourceHelper = new GResourceHelper('/path/to/resources.gresource');
resourceHelper.register();

// List files in a resource directory
const files = resourceHelper.listFiles('/org/pixelrpg/game/maps');

// Load a file from the resource
const mapJson = resourceHelper.loadTextFile('/org/pixelrpg/game/maps/map1.json');
```

### File Utilities

```typescript
import { loadTextFile, saveTextFile } from '@pixelrpg/data-gjs';

// Load a text file
const content = await loadTextFile('/path/to/file.json');

// Save a text file
await saveTextFile('/path/to/output.json', '{"name": "Test"}');
```

## GJS Application Integration

This package is designed to be used in GJS applications following the GNOME application structure. It provides the necessary utilities for loading and managing game data in a GJS environment.

For a complete application example, see the [GJS Application Template](https://gjs.guide/guides/gtk/application-packaging.html).

## License

MIT 