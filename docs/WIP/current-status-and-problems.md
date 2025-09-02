# Current Implementation Status & Identified Problems

> 🎯 **For the solution**: See [SOLUTION-tile-replacement.md](SOLUTION-tile-replacement.md)  
> 📋 **For implementation steps**: See [implementation-checklist.md](implementation-checklist.md)  
> 🔧 **For detailed plans**: See updated [Phase Documents](WIP/)

## 📊 Implementation Analysis

### What's Working ✅

#### Engine Side (Excalibur)
- **ECS Architecture is solid** - Components and Systems are well-designed
- **Input handling works** - Mouse events are captured and tile coordinates calculated
- **RPC communication established** - Messages flow from engine to host
- **System registration automatic** - Systems activate when components are present

#### Host Side (GJS)  
- **UI widgets exist** - TilesetSelector, LayerSelector, MapEditorPanel
- **WebView works** - RPC endpoint functional
- **Stories for testing** - Good test infrastructure

### Critical Problems 🔴

#### 1. **No Actual Tile Modification**
```typescript
// In editor-input.system.ts line 269
private handleTilePlacement(tileMap: TileMap, tile: Tile, coords: {x: number, y: number}): void {
  // This method exists but DOESN'T ACTUALLY CHANGE THE TILE!
  // It only sends RPC notifications
}
```
**Solution:** Need to actually modify the tile's sprite/graphics

#### 2. **Missing State Synchronization**
- Engine components have state (selectedTileId, currentTool)
- UI has different state (selected tile in TilesetSelector)
- **No service layer to sync them**

#### 3. **RPC Events Not Handled**
```typescript
// These events are sent but nobody listens:
RpcEngineType.TILE_CLICKED // Sent from engine
RpcEngineType.EDITOR_STATE_CHANGED // Never sent from host
```

#### 4. **TileMap Modification API Unclear**
- How to change a tile's sprite?
- How to update tile properties?
- Need to investigate Excalibur's TileMap API

### Architecture Gaps 🟡

#### Missing Service Layer
```
Current:
UI Widget ──X──> ??? ──X──> Engine Components

Needed:
UI Widget ──> MapEditorService ──> RPC ──> Engine Components
```

#### No Tool Selection UI
- TilesetSelector exists for choosing tiles
- But no way to choose brush/eraser tool
- EditorToolComponent expects a tool but none is set

#### State Management Issues
- EditorToolComponent initialized with `currentTool: null`
- Never gets updated because no host-side service sets it
- Tool is always null, so nothing happens

### Technical Debt 🟠

#### Over-Engineered Plans
- Phase 3-5 plans are too complex for MVP
- Needle DI unnecessary complexity
- Advanced features before basics work

#### Type Safety Issues
```typescript
// In map-editor.system.ts
private editableEntitiesQuery: Query<ComponentCtor<Component>>
// Should be more specific:
private editableEntitiesQuery: Query<typeof MapEditorComponent | typeof EditorToolComponent>
```

#### Performance Concerns
- Systems run every frame even when not needed
- No debouncing on tile hover events
- Could cause performance issues with large maps

## 🔧 Immediate Fixes Needed

### 1. Make Tiles Actually Change
```typescript
// Add to handleTilePlacement:
const layer = tileMap.layers[0] // or get from toolComponent.selectedLayerId
const targetTile = layer.getTile(coords.x, coords.y)
if (targetTile && toolComponent.selectedTileId !== null) {
  // Need to figure out how to change tile graphic
  targetTile.setGraphic(...) // Research Excalibur API
}
```

### 2. Create Simple Service
```typescript
// Minimal service to bridge UI and engine
class MapEditorService {
  onTileSelected(tileId: number) {
    this.rpc.send(RpcEngineType.EDITOR_STATE_CHANGED, {
      tool: 'brush',
      tileId: tileId,
      layerId: 'default'
    })
  }
}
```

### 3. Add Tool Buttons
```typescript
// Simple GTK buttons for brush/eraser
const brushBtn = new Gtk.Button({ label: 'Brush' })
const eraserBtn = new Gtk.Button({ label: 'Eraser' })
```

## 🎯 Path Forward

### Step 1: Research Excalibur TileMap API
- How to modify tile graphics dynamically?
- Can we change tile sprites at runtime?
- What's the proper way to update tiles?

### Step 2: Implement Minimal Tile Change
- Just get ONE tile to change when clicked
- Don't worry about tools or UI yet
- Prove the concept works

### Step 3: Add Simple Service Layer
- Bridge TilesetSelector to engine
- Handle tool selection
- Sync state via RPC

### Step 4: Test End-to-End
- Select tile in UI
- Click on map
- Tile should change
- That's MVP!

## ⚠️ Risks

1. **Excalibur Limitations** - May not support runtime tile changes
2. **Performance** - Changing many tiles could be slow
3. **State Complexity** - Keeping UI and engine in sync
4. **Save System** - How to persist changes back to project files

## 💡 Recommendations

1. **Start with hardcoded tile change** - Don't use UI, just make tile change work
2. **Use console.log liberally** - Track what's actually happening
3. **Ignore advanced features** - No fill, no brush size, just basic replacement
4. **Test with small map** - 10x10 tiles max for testing
5. **Document Excalibur findings** - What works, what doesn't

## 📝 Questions to Answer

1. Does Excalibur support changing tile graphics at runtime?
2. How does Excalibur's TileMap store tile data?
3. Can we modify the underlying tilemap data structure?
4. How to trigger visual updates after changing tiles?
5. What's the performance impact of tile changes?

## 🚀 Success Metrics

**MVP is successful when:**
1. Click on any tile
2. It changes to a different tile graphic
3. Change is visible immediately
4. No crashes or errors

Everything else is bonus!
