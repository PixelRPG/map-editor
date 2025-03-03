# @pixelrpg/data-gjs

GJS-specific implementation of the PixelRPG data structures for GTK applications.

## Overview

This package provides the integration layer between the core PixelRPG data structures and the GNOME JavaScript (GJS) runtime. It allows seamless loading and rendering of PixelRPG game projects, maps, and sprite sets in GTK-based applications.

As part of the RPG Maker application architecture, this package handles the representation of game projects, maps, and sprite sets in native GTK widgets within the GTK-based editor.

## Key Features

- **GTK Widget Integration**: Wraps core data structures in GTK-friendly components
- **Native Rendering**: Displays project data, TileSets, and other assets in native GTK widgets
- **Signal-based Events**: Implements GObject-style signals for data changes
- **Efficient Resource Management**: Optimized for GJS runtime environment
- **Project Structure Navigation**: Tree-based views for project hierarchy

## Component Hierarchy

The package implements a component hierarchy for GTK:

- **GameProjectProvider**: The top-level provider that:
  - Manages MapProviders and SpriteSetProviders
  - Handles project loading and saving
  - Provides access to all game assets via ID-based lookup
  - Exposes project structure for GTK widgets

- **MapProvider**: Loads and represents individual maps
  - Handles different layer types in native widgets
  - Supports editing operations on map data
  - Facilitates communication with the WebKit renderer

- **SpriteSetProvider**: Loads and manages sprites and TileSets
  - Provides access to individual sprites by ID
  - Displays sprites in GTK widgets
  - Supports organization and categorization of sprites

## Usage

```typescript
import Gtk from '@girs/gtk-4.0';
import { GameProjectProvider } from '@pixelrpg/data-gjs';

// Create a GTK application
const app = new Gtk.Application({
  application_id: 'org.pixelrpg.maker'
});

app.connect('activate', () => {
  // Create a window
  const win = new Gtk.ApplicationWindow({ application: app });
  
  // Load a game project
  const projectProvider = new GameProjectProvider();
  projectProvider.loadFromFile('path/to/project.json')
    .then(() => {
      // Access project data
      const projectName = projectProvider.name;
      
      // Create a project tree view
      const treeView = projectProvider.createTreeView();
      
      // Display sprite sets in a GTK widget
      const spriteSetWidget = projectProvider.createSpriteSetWidget('sprite-set-id');
      
      // Add widgets to the window
      const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
      box.append(treeView);
      box.append(spriteSetWidget);
      win.set_child(box);
      
      win.show();
    });
});

app.run([]);
```

## Role in RPG Maker Architecture

In the RPG Maker application:
- Provides native GTK widgets for project structure and management
- Handles display of TileSets and sprite resources in the editor
- Maintains data structures that are passed to the WebKit renderer
- Integrates with the messaging system to communicate with Excalibur.js
- Supports editing operations on project data

The native GTK interface is built using this package, while map rendering is handled by `@pixelrpg/data-excalibur` in a WebKit context. Communication between these components is facilitated by the messaging system implemented in `@pixelrpg/messages-gjs` and `@pixelrpg/messages-web`.

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

1. Follow GObject and GTK design patterns
2. Use proper signal handling for object state changes
3. Ensure proper resource management for GJS environment
4. Maintain compatibility with GTK4 and Libadwaita
5. Document widget properties and signals
6. Consider memory management in the GJS runtime

## Relationship to Core Packages

- **@pixelrpg/data-core**: Provides the data structures that this package implements for GJS
- **@pixelrpg/messages-gjs**: Enables communication with the WebKit renderer
- Core data structures are consumed but never modified
- GJS-specific extensions are kept in this package
- Circular dependencies between packages are avoided

## Dependencies

- **@pixelrpg/data-core**: Core data structures and type definitions
- **@girs/gtk-4.0**: GTK4 bindings for GJS
- **@girs/adw-1**: Libadwaita bindings for GJS 