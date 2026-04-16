# @pixelrpg/ui-gjs

Reusable GTK4/Adwaita UI components for GJS-based applications in the PixelRPG ecosystem.

## Overview

This package provides a collection of UI widgets and components built with GTK4 and Adwaita, designed to be shared across multiple GJS applications such as the RPG Maker and Storybook applications.

## Features

- **Sprite Widgets**: Display and interact with individual sprites and sprite sheets
- **GTK4/Adwaita Integration**: Modern GTK widgets following GNOME HIG guidelines
- **Blueprint Templates**: Declarative UI definitions using Blueprint markup
- **Type Safety**: Full TypeScript support with proper GObject bindings
- **Reusable Components**: Designed for use across multiple applications

## Architecture

This package follows the established naming convention:
- `*-core`: Platform-independent interfaces and types
- `*-gjs`: GJS/GTK implementation for desktop environments  
- `*-excalibur`: Web/Excalibur.js implementation for browsers
- `*-web`: Standard web implementations

## Components

### Sprite Components

#### SpriteWidget
Modern GTK4 sprite widget using unified **Gtk.Picture + Gdk.Texture** architecture.

**Architecture:**
- **`Gtk.Picture`** = UI Widget (displays the content)
- **`Gdk.Texture`** = Data Format (the image content)
- **Unified approach** = No legacy GdkPixbuf complications

```typescript
import { SpriteWidget } from '@pixelrpg/ui-gjs';
import { Sprite } from '@pixelrpg/data-gjs';

// Create sprite from texture
const texture = Gdk.Texture.new_from_file(Gio.File.new_for_path('sprite.png'));
const sprite = Sprite.fromTexture(texture);
const widget = new SpriteWidget(sprite);

// Create sprite from sub-texture (sprite sheet)
const spriteFromSheet = Sprite.fromSubTexture(texture, 0, 0, 32, 32);
const sheetWidget = new SpriteWidget(spriteFromSheet);

// Lightweight sprite architecture with on-demand paintable creation
// Note: Sprites are lightweight data structures, paintables created as needed
```

**Key Benefits:**
- ✅ **Performance**: Native GTK4 texture rendering with on-demand paintables
- ✅ **Memory**: Lightweight sprite data structures without GObject overhead
- ✅ **GC-Safe**: No "JS callback during GC" errors with new architecture
- ✅ **Clean**: Separation of data (Sprite) and rendering (SpritePaintable)
- ✅ **Scalable**: Efficient handling of large sprite sheets

#### SpriteSheetWidget  
Displays a collection of sprites in a scrollable grid layout.

```typescript
import { SpriteSheetWidget } from '@pixelrpg/ui-gjs';
import { SpriteSetResource } from '@pixelrpg/data-gjs';

// Load sprite set resource
const spriteSetResource = new SpriteSetResource({ path: '/path/to/spriteset.json' });
await spriteSetResource.load();

const spriteSheet = spriteSetResource.spriteSheet;
if (spriteSheet) {
    const widget = new SpriteSheetWidget(spriteSheet);

    // Handle sprite selection
    widget.connect('child-activated', (parent, flowBoxChild) => {
        const spriteWidget = flowBoxChild.child as SpriteWidget;
        console.log('Selected sprite:', spriteWidget.sprite);
    });
}
```

## Dependencies

### Runtime Dependencies
- `@pixelrpg/data`: Core data types and interfaces
- `@pixelrpg/data-gjs`: GJS-specific data resources

### Development Dependencies
- GTK4 and Adwaita bindings via `@girs/*` packages
- TypeScript for type checking
- Vite with Blueprint plugin for build tooling

## Development

### Building
```bash
yarn workspace @pixelrpg/ui-gjs run check
```

### Type Checking
The package includes TypeScript declarations for Blueprint (`.blp`) files and follows strict type safety practices.

## Integration

### In Applications
Add as a workspace dependency:

```json
{
  "dependencies": {
    "@pixelrpg/ui-gjs": "workspace:^"
  }
}
```

### In Storybook
Components can be imported and used in Storybook stories for testing and documentation:

```typescript
import { SpriteWidget } from '@pixelrpg/ui-gjs';
import { StoryWidget } from '@pixelrpg/story-gjs';

export class SpriteStory extends StoryWidget {
  static meta = {
    title: 'UI/Sprite',
    // ... story configuration
  };
}
```

## File Structure

```
src/
├── widgets/
│   └── sprite/
│       ├── sprite.widget.ts          # Individual sprite display
│       ├── sprite.widget.blp         # Blueprint template
│       ├── sprite-sheet.widget.ts    # Sprite sheet grid
│       ├── sprite-sheet.widget.blp   # Blueprint template  
│       └── index.ts                  # Component exports
├── types/
│   └── index.ts                      # Type definitions
├── env.d.ts                          # Environment declarations
└── index.ts                          # Package exports
```

## Design Principles

### GObject-Oriented Programming
- Uses GObject properties and signals for reactive UI updates
- Follows declarative patterns with Blueprint templates
- Implements proper GTK widget lifecycle management

### Type Safety
- Explicit TypeScript types for all public interfaces
- Proper GObject property and signal type definitions
- Runtime type checking where appropriate

### Reusability
- Components designed to work across multiple applications
- Clean separation of concerns between UI and business logic
- Consistent API patterns following GTK conventions

## Contributing

When adding new components:

1. Create component files in appropriate subdirectories under `src/widgets/`
2. Include both TypeScript implementation and Blueprint template
3. Export components through the index files
4. Follow existing naming and architectural patterns
5. Add comprehensive JSDoc documentation
6. Ensure components work in both maker and storybook applications

## License

Part of the PixelRPG project ecosystem.