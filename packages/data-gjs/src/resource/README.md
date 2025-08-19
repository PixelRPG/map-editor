# Sprite Sheet Implementation in data-gjs

This document explains the modern sprite sheet implementation using GDK 4.0 and `GdkPaintable`.

## Overview

The sprite sheet implementation has been completely rewritten to use modern GTK4 patterns:

- **`SpritePaintable`**: A custom `GdkPaintable` implementation that renders sub-regions of a texture
- **`SpriteResource`**: Updated to support both full textures and sub-texture regions
- **`SpriteSheetResource`**: Fixed sprite calculation and proper sub-texture extraction

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
const sprite = SpriteResource.fromTexture(texture);

// Create a sub-texture sprite from a sprite sheet
const sprite = SpriteResource.fromSubTexture(texture, x, y, width, height);

// Use with GTK widgets
const picture = new Gtk.Picture();
picture.set_paintable(sprite.paintable);
```

## Usage Examples

### Loading a Sprite Sheet

```typescript
import { SpriteSheetResource, ImageResource } from '@pixelrpg/data-gjs';

// Load sprite sheet data and image
const imageResource = new ImageResource('path/to/spritesheet.png');
await imageResource.load();

const spriteSheetData = {
  rows: 4,
  columns: 8,
  image: { path: 'path/to/spritesheet.png' }
};

// Create sprite sheet with proper sub-texture extraction
const spriteSheet = new SpriteSheetResource(spriteSheetData, imageResource);

// Access individual sprites
const sprites = spriteSheet._sprites;
const firstSprite = sprites[0]; // Top-left sprite
const lastSprite = sprites[sprites.length - 1]; // Bottom-right sprite
```

### Using Sprites in GTK Widgets

```typescript
// Method 1: Using the paintable directly
const picture = new Gtk.Picture();
picture.set_paintable(sprite.paintable);

// Method 2: For backward compatibility with texture-based code
const texture = sprite.texture; // Returns the full sprite sheet texture
```

## Implementation Details

### SpritePaintable Class

The `SpritePaintable` class implements the `GdkPaintable` interface to render sub-regions of a texture:

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
- Each sprite uses a `SpritePaintable` that references the shared texture
- No duplicate texture data in memory

## Migration Guide

If you're migrating from the old implementation:

1. **Replace direct texture access**: Use `sprite.paintable` instead of `sprite.texture` when possible
2. **Update widget usage**: `Gtk.Picture.set_paintable()` instead of texture-based methods
3. **Check sprite indexing**: Sprite ordering is now consistent (left-to-right, top-to-bottom)

## Performance Considerations

- **GPU-friendly**: Uses `GdkPaintable` which is optimized for GPU rendering
- **Memory efficient**: Shared texture storage for all sprites in a sheet
- **Scalable**: Sprites can be scaled at render time without quality loss

## Debugging

Enable sprite creation logging by uncommenting the console.log statement in `createSprites()`:

```typescript
console.log(`Creating sprite ${index} at position (${posX}, ${posY}) with size ${spriteWidth}x${spriteHeight}`)
```

This will help verify correct sprite positioning and sizing.
