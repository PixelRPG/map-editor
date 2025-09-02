# Map Editor Implementation Guide

## 🎯 Objective

Enable runtime tile replacement in maps with a clean, maintainable architecture.

## 📋 Prerequisites

The following components are already implemented:
- MapEditorComponent & EditorToolComponent (ECS components)
- MapEditorSystem & TileInteractionSystem (ECS systems)
- EditorInputSystem (input handling)
- RPC communication infrastructure
- TilesetSelector & LayerSelector UI widgets

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                 UI Layer (GJS/GTK)                       │
├─────────────────────────────────────────────────────────┤
│  • TilesetSelector - Select tiles from tileset           │
│  • ToolSelector - Switch between brush/eraser            │
│  • MapEditorPanel - Container for editor widgets         │
└────────────────────────┬─────────────────────────────────┘
                         │ RPC
┌────────────────────────▼─────────────────────────────────┐
│              Service Layer (Bridge)                       │
├─────────────────────────────────────────────────────────┤
│  • MapEditorService - State coordination                 │
│  • RPC message handling                                  │
│  • UI-Engine synchronization                             │
└────────────────────────┬─────────────────────────────────┘
                         │ State Updates
┌────────────────────────▼─────────────────────────────────┐
│           Engine Layer (Excalibur)                        │
├─────────────────────────────────────────────────────────┤
│  • EditorInputSystem - Mouse event processing            │
│  • MapEditorComponent - Editable state management        │
│  • EditorToolComponent - Tool and selection state        │
│  • TileMap - Tile graphic manipulation                   │
└─────────────────────────────────────────────────────────┘
```

## 🔧 Implementation Steps

### Step 1: Enable Tile Modification (30 minutes)

**File:** `packages/engine-excalibur/src/systems/editor-input.system.ts`

Update the `handleTilePlacement` method to actually modify tiles:

```typescript
private handleTilePlacement(
  tileMap: TileMap, 
  tile: Tile, 
  coords: {x: number, y: number}
): void {
  const toolComponent = tileMap.get(EditorToolComponent)
  
  if (!toolComponent?.isReadyForEditing()) return
  
  const { currentTool, selectedTileId, selectedLayerId } = toolComponent
  
  if (currentTool === 'brush' && selectedTileId !== null) {
    // Clear existing graphics
    tile.clearGraphics()
    
    // Get sprite sheet from tilemap
    const spriteSheet = tileMap.getSpriteSheet()
    if (spriteSheet) {
      const sprite = spriteSheet.getSprite(selectedTileId)
      if (sprite) {
        // Apply new graphic
        tile.addGraphic(sprite.clone())
        
        // Update tile properties
        tile.solid = selectedTileId > 0
        tile.data.set('tileId', selectedTileId)
      }
    }
    
    // Send confirmation
    this.rpc.sendNotification(RpcEngineType.TILE_PLACED, {
      coords,
      tileId: selectedTileId,
      layerId: selectedLayerId || 'default'
    })
  } else if (currentTool === 'eraser') {
    // Clear tile
    tile.clearGraphics()
    tile.solid = false
    tile.data.set('tileId', 0)
    
    // Send confirmation
    this.rpc.sendNotification(RpcEngineType.TILE_PLACED, {
      coords,
      tileId: 0,
      layerId: selectedLayerId || 'default'
    })
  }
}
```

### Step 2: Create Map Editor Service (1 hour)

**File:** `packages/engine-gjs/src/services/map-editor.service.ts`

```typescript
import { WebView } from '../widgets/webview'
import { RpcEngineType } from '@pixelrpg/engine-core'

export class MapEditorService {
  private selectedTileId: number = 1
  private currentTool: 'brush' | 'eraser' = 'brush'
  private selectedLayerId: string = 'default'
  
  constructor(private webView: WebView) {
    this.setupRpcHandlers()
  }
  
  private setupRpcHandlers(): void {
    const rpc = this.webView.rpc
    
    // Handle tile click events from engine
    rpc.registerHandler(RpcEngineType.TILE_CLICKED, async (params) => {
      console.log('[MapEditorService] Tile clicked:', params.coords)
      return { success: true }
    })
    
    // Handle tile placement confirmations
    rpc.registerHandler(RpcEngineType.TILE_PLACED, async (params) => {
      console.log('[MapEditorService] Tile placed:', params)
      return { success: true }
    })
  }
  
  public async selectTile(tileId: number): Promise<void> {
    this.selectedTileId = tileId
    await this.updateEngineState()
  }
  
  public async setTool(tool: 'brush' | 'eraser'): Promise<void> {
    this.currentTool = tool
    await this.updateEngineState()
  }
  
  public async setLayer(layerId: string): Promise<void> {
    this.selectedLayerId = layerId
    await this.updateEngineState()
  }
  
  private async updateEngineState(): Promise<void> {
    try {
      await this.webView.rpc.sendNotification(RpcEngineType.EDITOR_STATE_CHANGED, {
        tool: this.currentTool,
        tileId: this.selectedTileId,
        layerId: this.selectedLayerId
      })
    } catch (error) {
      console.error('[MapEditorService] Failed to update engine state:', error)
    }
  }
}
```

### Step 3: Create Tool Selector Widget (30 minutes)

**File:** `packages/ui-gjs/src/widgets/map-editor/tool-selector.ts`

```typescript
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

export class ToolSelector extends Gtk.Box {
  static {
    GObject.registerClass(
      {
        GTypeName: 'ToolSelector',
        Signals: {
          'tool-changed': {
            param_types: [GObject.TYPE_STRING]
          }
        }
      },
      this
    )
  }
  
  private brushButton: Gtk.ToggleButton
  private eraserButton: Gtk.ToggleButton
  
  constructor() {
    super({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      margin_top: 6,
      margin_bottom: 6
    })
    
    // Create tool buttons
    this.brushButton = new Gtk.ToggleButton({
      label: '🖌️ Brush',
      active: true
    })
    
    this.eraserButton = new Gtk.ToggleButton({
      label: '🧹 Eraser'
    })
    
    // Implement exclusive toggle behavior
    this.brushButton.connect('toggled', () => {
      if (this.brushButton.active) {
        this.eraserButton.active = false
        this.emit('tool-changed', 'brush')
      }
    })
    
    this.eraserButton.connect('toggled', () => {
      if (this.eraserButton.active) {
        this.brushButton.active = false
        this.emit('tool-changed', 'eraser')
      }
    })
    
    this.append(this.brushButton)
    this.append(this.eraserButton)
  }
}
```

### Step 4: Wire Components Together (1 hour)

In the main application initialization:

```typescript
import { MapEditorService } from '@pixelrpg/engine-gjs'
import { ToolSelector } from '@pixelrpg/ui-gjs'

// Initialize service
const mapEditorService = new MapEditorService(this.webView)

// Create tool selector
const toolSelector = new ToolSelector()

// Connect UI to service
this.tilesetSelector.connect('tile-selected', (_widget, tileId) => {
  mapEditorService.selectTile(tileId)
})

this.layerSelector.connect('layer-selected', (_widget, layerId) => {
  mapEditorService.setLayer(layerId)
})

toolSelector.connect('tool-changed', (_widget, tool) => {
  mapEditorService.setTool(tool)
})

// Add tool selector to UI
this.mapEditorPanel.add(toolSelector)
```

## 📋 Testing Procedure

### Basic Functionality Test

1. Load a test map (minimum 5x5 tiles)
2. Select a tile from TilesetSelector
3. Ensure brush tool is active
4. Click on a map tile
5. **Verify:** Tile graphic changes to selected tile
6. Switch to eraser tool
7. Click on a tile with graphics
8. **Verify:** Tile graphic disappears

### Debug Checklist

If tiles don't change visually:

```typescript
// Add debug logging at each step
console.log('[Input] Tile clicked:', coords)
console.log('[Input] Current tool:', toolComponent.currentTool)
console.log('[Input] Selected tile ID:', toolComponent.selectedTileId)
console.log('[Input] Sprite found:', sprite !== null)
console.log('[Input] Graphics before clear:', tile.graphics)
tile.clearGraphics()
console.log('[Input] Graphics after clear:', tile.graphics)
tile.addGraphic(sprite.clone())
console.log('[Input] Graphics after add:', tile.graphics)
```

## 🎯 Success Criteria

The implementation is complete when:
- Clicking on tiles changes their graphics immediately
- Brush tool places selected tiles
- Eraser tool removes tile graphics
- No console errors during operation
- State synchronizes between UI and engine

## 📊 Performance Considerations

- Single tile operations should be instant (< 16ms)
- Test with maps up to 50x50 tiles
- Monitor memory usage for sprite cloning
- Consider batching for multi-tile operations in future

## 🚀 Future Enhancements

After the basic functionality works:

1. **Persistence** - Save modified maps to project files
2. **Undo/Redo** - Command pattern for edit history
3. **Multi-tile brush** - Variable brush sizes
4. **Fill tool** - Flood fill algorithm
5. **Layer management** - Edit multiple layers

---

*Focus on getting basic tile replacement working first. All enhancements can be added incrementally once the core functionality is proven.*
