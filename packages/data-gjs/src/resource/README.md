# Sprite Sheet Implementation in data-gjs

This document explains the modern sprite sheet implementation using GDK 4.0 and `GdkPaintable`.

## Overview

The sprite sheet implementation has been completely rewritten to use modern GTK4 patterns:

- **`Sprite`**: Lightweight data structure for sprite regions without GObject overhead
- **`SpritePaintable`**: A custom `GdkPaintable` implementation that renders sub-regions of a texture
- **`SpriteSheet`**: Container for multiple sprites from a single texture
- **`SpriteSetResource`**: Resource loader with proper sprite calculation and texture management

## Key Features

### 1. Modern GTK4 Architecture
- Uses `Gdk.Texture` instead of deprecated `GdkPixbuf`
- Implements `GdkPaintable` for proper sprite rendering
- Uses `Graphene` library for mathematical types (replaces `Gdk.Point`)
- Compatible with `Gtk.Picture` and other GTK4 widgets

### 2. Proper Sub-Texture Support
- Extracts individual sprites from sprite sheets without creating separate textures
- Memory efficient - only stores one texture per sprite sheet
- Proper sprite positioning and sizing calculations

### 3. Clean API
```typescript
// Create a full texture sprite
const sprite = Sprite.fromTexture(texture);

// Create a sub-texture sprite from a sprite sheet
const sprite = Sprite.fromSubTexture(texture, x, y, width, height);

// Use with GTK widgets
const picture = new Gtk.Picture();
picture.set_paintable(sprite.createPaintable());
```

## Usage Examples

### Loading a Sprite Sheet

```typescript
import { SpriteSetResource } from '@pixelrpg/data-gjs';

// Load sprite set resource
const spriteSetResource = new SpriteSetResource({
  path: '/path/to/spriteset.json'
});

const spriteSetData = await spriteSetResource.load();

// Access the sprite sheet
const spriteSheet = spriteSetResource.spriteSheet;
if (spriteSheet) {
  // Access individual sprites by grid position
  const firstSprite = spriteSheet.getSprite(0, 0); // Top-left sprite
  const sprite_1_2 = spriteSheet.getSprite(1, 2); // Column 1, Row 2
  
  // Access all sprites
  const allSprites = spriteSheet.sprites;
}
```

### Using Sprites in GTK Widgets

```typescript
const picture = new Gtk.Picture();
picture.set_paintable(sprite.createPaintable());
```

## Implementation Details

### Sprite and SpritePaintable Architecture

The implementation uses a two-class architecture for optimal performance and GC safety:

#### Sprite Class (Lightweight Data Structure)
- Plain TypeScript class without GObject overhead
- Stores sprite region data (x, y, width, height, sourceTexture)
- Provides `createPaintable()` method for on-demand rendering
- No vfuncs to avoid GC callback issues

#### SpritePaintable Class (Rendering Object)
- Implements the `GdkPaintable` interface for GTK integration
- Created on-demand to minimize GObject instances
- **Snapshot rendering**: Uses transformation matrix to render only the sprite region
- **Intrinsic sizing**: Reports correct sprite dimensions
- **Static flags**: Optimized for static sprite content

### Sprite Calculation Fix

The previous implementation had incorrect position calculations:

```typescript
// WRONG (old implementation)
const posX = x * rows;    // Should be x * spriteWidth
const posY = y * columns; // Should be y * spriteHeight

// CORRECT (new implementation)  
const posX = x * spriteWidth;
const posY = y * spriteHeight;
```

### Memory Efficiency

- Only one `Gdk.Texture` is stored per sprite sheet
- Each `Sprite` is a lightweight data structure without GObject overhead
- `SpritePaintable` instances are created on-demand and can be garbage collected
- No duplicate texture data in memory
- Significantly reduced GObject instances compared to previous implementation

## Migration Guide

If you're migrating from the old implementation:

1. **Replace direct paintable access**: Use `sprite.createPaintable()` instead of `sprite` as paintable
2. **Update widget usage**: `picture.set_paintable(sprite.createPaintable())` instead of `picture.set_paintable(sprite)`
3. **Check sprite indexing**: Sprite ordering is now consistent (left-to-right, top-to-bottom)
4. **No more GC issues**: The new architecture eliminates "JS callback during GC" errors

## Performance Considerations

- **GPU-friendly**: Uses `GdkPaintable` which is optimized for GPU rendering
- **Memory efficient**: Shared texture storage for all sprites in a sheet
- **GC-safe**: Lightweight `Sprite` data structures avoid GC callback issues
- **On-demand rendering**: `SpritePaintable` instances created only when needed
- **Scalable**: Sprites can be scaled at render time without quality loss

## Debugging

Enable sprite creation logging by uncommenting the console.log statement in `createSprites()`:

```typescript
console.log(`Creating sprite ${index} at position (${posX}, ${posY}) with size ${spriteWidth}x${spriteHeight}`)
```

This will help verify correct sprite positioning and sizing.
