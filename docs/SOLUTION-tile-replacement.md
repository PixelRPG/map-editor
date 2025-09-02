# 🎯 SOLUTION: How to Actually Replace Tiles

## 🔑 Key Discovery

**Excalibur tiles CAN be modified at runtime using `tile.addGraphic()`!**

Found in `packages/data-excalibur/src/resource/MapResource.ts`:
```typescript
tile.addGraphic(spriteSet.sprites[spriteId].clone());
```

## ✅ Working Solution

### The Missing Piece: Actual Tile Modification

**File:** `packages/engine-excalibur/src/systems/editor-input.system.ts`

```typescript
private handleTilePlacement(
  tileMap: TileMap, 
  tile: Tile, 
  coords: {x: number, y: number}
): void {
  const toolComponent = tileMap.get(EditorToolComponent)
  
  if (!toolComponent?.isReadyForEditing()) return
  
  const { currentTool, selectedTileId, selectedLayerId } = toolComponent
  
  // CRITICAL: Actually change the tile graphic!
  if (currentTool === 'brush' && selectedTileId !== null) {
    // 1. Remove existing graphics
    tile.clearGraphics()
    
    // 2. Get the sprite sheet from the tilemap
    const spriteSheet = tileMap.getSpriteSheet()
    if (spriteSheet) {
      // 3. Get the sprite for the selected tile ID
      const sprite = spriteSheet.getSprite(selectedTileId)
      if (sprite) {
        // 4. Add the new graphic to the tile
        tile.addGraphic(sprite.clone())
        
        // 5. Optional: Update tile properties
        tile.solid = selectedTileId > 0 // Example: non-zero tiles are solid
        tile.data.set('tileId', selectedTileId)
        
        console.log(`Tile at (${coords.x}, ${coords.y}) changed to sprite ${selectedTileId}`)
      }
    }
    
    // Send confirmation RPC
    this.rpc.sendNotification(RpcEngineType.TILE_PLACED, {
      coords,
      tileId: selectedTileId,
      layerId: selectedLayerId || 'default'
    })
  } else if (currentTool === 'eraser') {
    // Clear the tile
    tile.clearGraphics()
    tile.solid = false
    tile.data.set('tileId', 0)
    
    console.log(`Tile at (${coords.x}, ${coords.y}) erased`)
    
    // Send confirmation RPC
    this.rpc.sendNotification(RpcEngineType.TILE_PLACED, {
      coords,
      tileId: 0,
      layerId: selectedLayerId || 'default'
    })
  }
}
```

## 🔧 Implementation Steps

### Step 1: Fix the Core Issue (30 minutes)

1. **Update `editor-input.system.ts`** with the code above
2. **Test with hardcoded values** first:
   ```typescript
   // Temporary test - always place tile ID 5
   const testTileId = 5
   const sprite = spriteSheet.getSprite(testTileId)
   tile.clearGraphics()
   tile.addGraphic(sprite.clone())
   ```
3. **Verify visual update** - tile should change immediately

### Step 2: Get SpriteSheet Reference (30 minutes)

The tricky part is getting the sprite sheet. Options:

#### Option A: Store in TileMap (Recommended)
```typescript
// When loading the map, store spritesheet reference
tileMap.data.set('spriteSheet', spriteSheet)

// In handleTilePlacement:
const spriteSheet = tileMap.data.get('spriteSheet') as SpriteSheet
```

#### Option B: Pass through Component
```typescript
// Add to EditorToolComponent:
public spriteSheet: SpriteSheet | null = null

// Set when initializing:
toolComponent.spriteSheet = loadedSpriteSheet
```

#### Option C: Global Registry
```typescript
// Create a sprite sheet registry
class SpriteSheetRegistry {
  private static sheets = new Map<string, SpriteSheet>()
  
  static register(id: string, sheet: SpriteSheet) {
    this.sheets.set(id, sheet)
  }
  
  static get(id: string): SpriteSheet | undefined {
    return this.sheets.get(id)
  }
}
```

### Step 3: Connect Host to Engine (1 hour)

**File:** `packages/engine-gjs/src/services/map-editor.service.ts` (NEW)

```typescript
import { WebView } from '../widgets/webview'
import { RpcEngineType } from '@pixelrpg/engine-core'

export class MapEditorService {
  private selectedTileId: number = 1 // Default to tile 1
  private currentTool: 'brush' | 'eraser' = 'brush'
  
  constructor(
    private webView: WebView,
    private tilesetSelector: any, // TilesetSelector widget
  ) {
    this.setupConnections()
    this.setupRpcHandlers()
  }
  
  private setupConnections(): void {
    // Listen to tileset selector
    this.tilesetSelector.connect('tile-selected', (_widget: any, tileId: number) => {
      this.selectedTileId = tileId
      this.updateEngineState()
    })
  }
  
  private setupRpcHandlers(): void {
    // Listen for tile clicks from engine
    this.webView.rpc.registerHandler(RpcEngineType.TILE_CLICKED, async (params) => {
      console.log('Tile clicked at:', params.coords)
      // State is already in engine, just log for now
      return { success: true }
    })
    
    // Listen for successful tile placement
    this.webView.rpc.registerHandler(RpcEngineType.TILE_PLACED, async (params) => {
      console.log('Tile placed:', params)
      return { success: true }
    })
  }
  
  public setTool(tool: 'brush' | 'eraser'): void {
    this.currentTool = tool
    this.updateEngineState()
  }
  
  private async updateEngineState(): Promise<void> {
    // Send state to engine
    await this.webView.rpc.sendNotification(RpcEngineType.EDITOR_STATE_CHANGED, {
      tool: this.currentTool,
      tileId: this.selectedTileId,
      layerId: 'default' // TODO: Get from layer selector
    })
  }
}
```

### Step 4: Handle State Updates in Engine (30 minutes)

**File:** `packages/engine-excalibur/src/systems/map-editor.system.ts`

Update the existing `handleEditorStateChange` method to properly receive state from host:

```typescript
private handleEditorStateChange(params: EditorStateChangeParams): void {
  const editableEntities = this.editableEntitiesQuery.entities
  
  for (const entity of editableEntities) {
    const toolComponent = entity.get(EditorToolComponent)
    
    if (toolComponent) {
      // Update tool component with host state
      if (params.tool) {
        toolComponent.currentTool = params.tool as EditorTool
      }
      if (params.tileId !== undefined) {
        toolComponent.selectedTileId = params.tileId
      }
      if (params.layerId) {
        toolComponent.selectedLayerId = params.layerId
      }
      
      console.log('Editor state updated:', {
        tool: toolComponent.currentTool,
        tileId: toolComponent.selectedTileId,
        layerId: toolComponent.selectedLayerId
      })
    }
  }
}
```

### Step 5: Wire Everything Together (1 hour)

**In the main application:**

```typescript
// When initializing the map editor
const mapEditorService = new MapEditorService(
  this.webView,
  this.mapEditorPanel._tilesetSelector
)

// Add simple tool buttons (temporary UI)
const toolBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL })
const brushBtn = new Gtk.Button({ label: '🖌️ Brush' })
const eraserBtn = new Gtk.Button({ label: '🧹 Eraser' })

brushBtn.connect('clicked', () => mapEditorService.setTool('brush'))
eraserBtn.connect('clicked', () => mapEditorService.setTool('eraser'))

toolBox.append(brushBtn)
toolBox.append(eraserBtn)
// Add toolBox to your UI
```

## 🎉 Expected Result

1. Select a tile from TilesetSelector
2. Click "Brush" button
3. Click on map
4. **Tile visually changes to selected tile!**
5. Click "Eraser" button
6. Click on map
7. **Tile disappears!**

## 🐛 Debugging Tips

If tiles don't change visually:

1. **Check if sprite exists:**
   ```typescript
   const sprite = spriteSheet.getSprite(selectedTileId)
   console.log('Sprite found:', sprite !== null)
   ```

2. **Verify clearGraphics works:**
   ```typescript
   console.log('Graphics before:', tile.graphics.current)
   tile.clearGraphics()
   console.log('Graphics after:', tile.graphics.current)
   ```

3. **Check tile bounds:**
   ```typescript
   console.log('Tile bounds:', tile.bounds)
   console.log('Tile visible:', tile.isVisible)
   ```

4. **Force a scene update:**
   ```typescript
   // After changing tile
   tileMap.emit('tilechanged', { tile, coords })
   scene.update(0, 16) // Force update with 16ms delta
   ```

## ⚠️ Known Issues & Solutions

### Issue 1: SpriteSheet not accessible
**Solution:** Store it when loading the map in MapResource

### Issue 2: Changes don't persist
**Solution:** Will need to implement save functionality later

### Issue 3: Performance with many tile changes
**Solution:** Batch updates and use dirty rectangles

### Issue 4: Undo/Redo
**Solution:** Store tile changes in a command pattern (future enhancement)

## 🚀 Next Steps After MVP Works

1. **Persistence:** Save modified maps back to file
2. **Multi-layer:** Support editing different layers
3. **Brush sizes:** Change multiple tiles at once
4. **Fill tool:** Implement flood fill
5. **Undo/Redo:** Command pattern for edit history
6. **Preview:** Show ghost tile on hover

## 📊 Success Criteria

✅ **MVP is complete when:**
- [ ] Clicking a tile changes its graphic
- [ ] Change is immediately visible
- [ ] Eraser removes tile graphics
- [ ] No errors in console
- [ ] State syncs between UI and engine

**That's it! Everything else is enhancement.**
