# Migration Guide

This guide explains how to migrate from the previous EngineView + Engine pattern to the new integrated Engine widget.

## Previous Pattern

Previously, you would use the Engine class with a separate EngineView wrapper:

```typescript
// Create the EngineView component
const engine = new EngineView();

// Get the engine from the view
const engine = engine.getEngine();

// Add the view to your UI
myContainer.append(engine);

// Use the engine through the view
await engine.loadProject('/path/to/project.json');
await engine.loadMap('map1');
await engine.start();
```

## New Pattern

Now, the Engine is a GObject widget that can be directly included in your application:

```typescript
// Create the Engine directly
const engine = new Engine();

// Set resource paths (must be done before or right after adding to UI)
engine.setResourcePaths(['/path/to/resources']);

// Add the engine to your UI
myContainer.append(engine);

// Use the engine directly
await engine.loadProject('/path/to/project.json');
await engine.loadMap('map1');
await engine.start();

// Handle messages from the engine
engine.connect('message-received', (_source, message) => {
  console.log('Message from engine:', message);
});
```

## Migration Steps

1. Replace imports:
   ```typescript
   // Old
   import { EngineView } from './widgets/engine-view';
   
   // New
   import { Engine } from '@pixelrpg/engine-gjs';
   ```

2. Replace instantiation:
   ```typescript
   // Old
   const engine = new EngineView();
   const engine = engine.getEngine();
   
   // New
   const engine = new Engine();
   engine.setResourcePaths(['/path/to/resources']);
   ```

3. Replace UI integration:
   ```typescript
   // Old
   myContainer.append(engine);
   
   // New
   myContainer.append(engine);
   ```

4. Replace method calls:
   ```typescript
   // Old
   await engine.loadProject('/path/to/project.json');
   await engine.loadMap('map1');
   await engine.start();
   
   // New
   await engine.loadProject('/path/to/project.json');
   await engine.loadMap('map1');
   await engine.start();
   ```

5. Update message handling:
   ```typescript
   // Old
   engine.connect('message-received', (_source, message) => {
     console.log('Message from engine:', message);
   });
   
   // New
   engine.connect('message-received', (_source, message) => {
     console.log('Message from engine:', message);
   });
   ```

6. Remove any references to the EngineView class and related files from your project.

## Benefits of the New Pattern

- Simplified architecture with fewer components
- Direct access to the engine without going through a wrapper
- Better integration with GObject and GTK
- Improved type safety and error handling
- Easier to use in GNOME applications 