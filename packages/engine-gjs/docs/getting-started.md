# Getting Started with Engine GJS

This guide shows you how to use the Engine widget in your GJS/GTK applications.

## Overview

The Engine is a GTK widget that provides a complete game engine interface for GNOME applications. It uses WebKit internally to render the game and provides GObject signals for event handling.

## Installation

Make sure you have the required packages installed:

```bash
yarn add @pixelrpg/engine-gjs @pixelrpg/engine-core
```

## Basic Usage

### 1. Import the Engine

```typescript
import { Engine } from '@pixelrpg/engine-gjs';
import { EngineMessageType, EngineStatus } from '@pixelrpg/engine-core';
```

### 2. Create and Configure the Engine

```typescript
// Create a new engine instance
const engine = new Engine();

// Set resource paths (optional - defaults are usually sufficient)
engine.setResourcePaths(['/path/to/your/resources']);

// Add additional resource paths if needed
engine.addResourcePath('/path/to/additional/resources');
```

### 3. Add to Your UI

The Engine is a standard GTK widget that can be added to any container:

```typescript
// Add to any GTK container
myContainer.append(engine);

// Or use in Blueprint templates
// <object class="Engine" id="game_engine"/>
```

### 4. Handle Engine Events

The Engine emits specific signals for different events:

```typescript
// Listen for status changes
engine.connect(EngineMessageType.STATUS_CHANGED, (_source, status: EngineStatus) => {
  console.log('Engine status changed:', status);
  
  switch (status) {
    case EngineStatus.READY:
      console.log('Engine is ready to load projects');
      break;
    case EngineStatus.RUNNING:
      console.log('Engine is running');
      break;
    case EngineStatus.ERROR:
      console.log('Engine encountered an error');
      break;
  }
});

// Listen for project load events
engine.connect(EngineMessageType.PROJECT_LOADED, (_source, projectId: string) => {
  console.log('Project loaded:', projectId);
});

// Listen for map load events
engine.connect(EngineMessageType.MAP_LOADED, (_source, mapId: string) => {
  console.log('Map loaded:', mapId);
});

// Listen for errors
engine.connect(EngineMessageType.ERROR, (_source, message: string, error: Error | null) => {
  console.error('Engine error:', message, error);
});

// Listen for engine ready state
engine.connect('ready', () => {
  console.log('Engine is ready for use');
});
```

### 5. Load and Control Projects

```typescript
// Wait for engine to be ready
engine.connect('ready', async () => {
  try {
    // Load a project
    await engine.loadProject('/path/to/project.json');
    
    // Load a specific map
    await engine.loadMap('map-id');
    
    // Start the engine
    await engine.start();
  } catch (error) {
    console.error('Failed to start engine:', error);
  }
});
```

## Complete Example

Here's a complete example showing how to integrate the Engine into a GTK application:

```typescript
import GObject from '@girs/gobject-2.0';
import Gtk from '@girs/gtk-4.0';
import Adw from '@girs/adw-1';
import { Engine } from '@pixelrpg/engine-gjs';
import { EngineMessageType, EngineStatus } from '@pixelrpg/engine-core';

export class GameWindow extends Adw.ApplicationWindow {
  private engine: Engine;
  private statusLabel: Gtk.Label;

  static {
    GObject.registerClass({
      GTypeName: 'GameWindow',
    }, this);
  }

  constructor(params: Partial<Adw.ApplicationWindow.ConstructorProps> = {}) {
    super(params);

    // Create UI elements
    this.setupUI();
    
    // Setup engine event handlers
    this.setupEngineEvents();
  }

  private setupUI(): void {
    // Create main layout
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    
    // Status label
    this.statusLabel = new Gtk.Label({ label: 'Initializing...' });
    box.append(this.statusLabel);
    
    // Create engine
    this.engine = new Engine();
    this.engine.set_size_request(800, 600);
    box.append(this.engine);
    
    // Control buttons
    const buttonBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    
    const loadButton = new Gtk.Button({ label: 'Load Project' });
    loadButton.connect('clicked', () => this.loadProject());
    buttonBox.append(loadButton);
    
    const startButton = new Gtk.Button({ label: 'Start Engine' });
    startButton.connect('clicked', () => this.startEngine());
    buttonBox.append(startButton);
    
    box.append(buttonBox);
    this.set_content(box);
  }

  private setupEngineEvents(): void {
    // Status changes
    this.engine.connect(EngineMessageType.STATUS_CHANGED, (_source, status) => {
      this.statusLabel.set_label(`Status: ${status}`);
    });

    // Project loaded
    this.engine.connect(EngineMessageType.PROJECT_LOADED, (_source, projectId) => {
      console.log('Project loaded:', projectId);
    });

    // Map loaded
    this.engine.connect(EngineMessageType.MAP_LOADED, (_source, mapId) => {
      console.log('Map loaded:', mapId);
    });

    // Errors
    this.engine.connect(EngineMessageType.ERROR, (_source, message, error) => {
      this.statusLabel.set_label(`Error: ${message}`);
      console.error('Engine error:', message, error);
    });

    // Ready state
    this.engine.connect('ready', () => {
      this.statusLabel.set_label('Engine ready');
    });
  }

  private async loadProject(): Promise<void> {
    try {
      await this.engine.loadProject('/path/to/your/project.json');
    } catch (error) {
      console.error('Failed to load project:', error);
    }
  }

  private async startEngine(): Promise<void> {
    try {
      await this.engine.start();
    } catch (error) {
      console.error('Failed to start engine:', error);
    }
  }
}
```

## Integration with Blueprint Templates

You can also use the Engine in Blueprint UI templates:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<interface>
  <template class="MyGameView" parent="AdwBin">
    <child>
      <object class="GtkBox">
        <property name="orientation">vertical</property>
        
        <child>
          <object class="GtkLabel" id="status_label">
            <property name="label">Initializing...</property>
          </object>
        </child>
        
        <child>
          <object class="Engine" id="game_engine">
            <property name="width-request">800</property>
            <property name="height-request">600</property>
          </object>
        </child>
        
      </object>
    </child>
  </template>
</interface>
```

Then in your TypeScript class:

```typescript
import Template from './my-game-view.blp';

export class MyGameView extends Adw.Bin {
  declare _game_engine: Engine;
  declare _status_label: Gtk.Label;

  static {
    GObject.registerClass({
      GTypeName: 'MyGameView',
      Template,
      InternalChildren: ['game_engine', 'status_label'],
    }, this);
  }

  constructor() {
    super();
    
    // Connect to engine events
    this._game_engine.connect(EngineMessageType.STATUS_CHANGED, (_source, status) => {
      this._status_label.set_label(`Status: ${status}`);
    });
  }
}
```

## Advanced Configuration

### Resource Management

```typescript
// Set multiple resource paths
engine.setResourcePaths([
  '/usr/share/myapp/resources',
  '/home/user/.local/share/myapp/resources'
]);

// Add additional paths dynamically
engine.addResourcePath('/tmp/additional-resources');

// Set GResource path for bundled resources
engine.setGResourcePath('/org/myapp/resources/client.gresource');
```

### Error Handling

```typescript
// Comprehensive error handling
engine.connect(EngineMessageType.ERROR, (_source, message, error) => {
  // Log the error
  console.error('Engine error:', message);
  
  if (error) {
    console.error('Detailed error:', error);
  }
  
  // Update UI to show error state
  showErrorDialog(message);
  
  // Optionally try to recover
  if (message.includes('resource')) {
    // Handle resource loading errors
    tryReloadResources();
  }
});
```

## Best Practices

1. **Always handle the 'ready' signal** before attempting to load projects
2. **Set resource paths early** - preferably right after creating the Engine
3. **Handle all error signals** to provide good user feedback
4. **Use async/await** for all engine operations
5. **Don't forget to handle the lifecycle** - the Engine will automatically clean up when removed from the widget hierarchy

## Troubleshooting

### Engine doesn't start
- Check that resource paths are set correctly
- Ensure the WebKit WebView can access the required files
- Check the console for JavaScript errors

### Projects don't load
- Verify the project file path is correct and accessible
- Check that all required resources are available
- Listen to the ERROR signal for detailed error information

### Performance issues
- Ensure resource files are optimized
- Check WebKit developer tools for performance bottlenecks
- Consider reducing the engine viewport size if needed
