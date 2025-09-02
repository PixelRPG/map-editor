# 📋 Map Editor Implementation Checklist

## 🎯 Goal: Make tiles replaceable with a single click

### ✅ Prerequisites (Already Done)
- [x] MapEditorComponent created
- [x] EditorToolComponent created  
- [x] MapEditorSystem implemented
- [x] TileInteractionSystem implemented
- [x] EditorInputSystem handles mouse events
- [x] RPC types defined
- [x] TilesetSelector widget exists
- [x] WebView with RPC communication works

### 🔴 Critical Path to MVP

#### Step 1: Fix Tile Replacement (~30 min)
- [ ] Open `packages/engine-excalibur/src/systems/editor-input.system.ts`
- [ ] Find `handleTilePlacement` method (line ~269)
- [ ] Add tile modification code:
  ```typescript
  tile.clearGraphics()
  const sprite = spriteSheet.getSprite(selectedTileId)
  tile.addGraphic(sprite.clone())
  ```
- [ ] Test with hardcoded tile ID first (e.g., always use tile 5)
- [ ] Verify tile changes visually in browser
- [ ] Check console for errors

#### Step 2: Get SpriteSheet Reference (~30 min)
- [ ] Identify where sprite sheets are loaded
- [ ] Store reference in accessible location:
  - [ ] Option A: In TileMap.data
  - [ ] Option B: In EditorToolComponent
  - [ ] Option C: Global registry
- [ ] Update `handleTilePlacement` to retrieve sprite sheet
- [ ] Test tile changes with actual sprite sheet

#### Step 3: Create MapEditorService (~1 hour)
- [ ] Create `packages/engine-gjs/src/services/map-editor.service.ts`
- [ ] Add constructor with WebView dependency
- [ ] Implement `setupRpcHandlers()` method:
  - [ ] Register TILE_CLICKED handler
  - [ ] Register TILE_PLACED handler
- [ ] Implement `updateEngineState()` method:
  - [ ] Send EDITOR_STATE_CHANGED to engine
- [ ] Add `setTool()` and `selectTile()` methods

#### Step 4: Connect UI to Service (~30 min)
- [ ] Import MapEditorService in main app
- [ ] Instantiate service with WebView
- [ ] Connect TilesetSelector signals:
  ```typescript
  tilesetSelector.connect('tile-selected', (w, id) => 
    mapEditorService.selectTile(id))
  ```
- [ ] Test tile selection updates engine state

#### Step 5: Add Tool Selection UI (~30 min)
- [ ] Create simple GTK button box
- [ ] Add Brush button
- [ ] Add Eraser button
- [ ] Connect buttons to `mapEditorService.setTool()`
- [ ] Add to existing UI (MapEditorPanel or main window)
- [ ] Test tool switching

#### Step 6: Fix State Reception in Engine (~30 min)
- [ ] Open `packages/engine-excalibur/src/systems/map-editor.system.ts`
- [ ] Ensure RPC handler for EDITOR_STATE_CHANGED works
- [ ] Verify state updates EditorToolComponent
- [ ] Add console.log to confirm state changes
- [ ] Test full flow: select tile → state updates → click map → tile changes

### 🧪 Testing Checklist

#### Basic Functionality
- [ ] Select tile ID 1 from TilesetSelector
- [ ] Click Brush button
- [ ] Click on map tile at position (2, 2)
- [ ] **Tile should change to selected sprite**
- [ ] Console shows no errors

#### Eraser Test
- [ ] Click Eraser button
- [ ] Click on tile with graphic
- [ ] **Tile graphic should disappear**
- [ ] Tile.solid should be false

#### Multiple Tiles
- [ ] Select different tile ID
- [ ] Click multiple tiles in sequence
- [ ] **All clicked tiles should change**
- [ ] No performance issues

### 🐛 Debugging Steps

If tiles don't change:
1. [ ] Check console for errors
2. [ ] Verify sprite sheet is loaded
3. [ ] Log tile before and after modification
4. [ ] Check if `clearGraphics()` works
5. [ ] Verify `addGraphic()` is called
6. [ ] Ensure sprite.clone() returns valid sprite
7. [ ] Check tile bounds and visibility
8. [ ] Force scene redraw

### 📊 Success Metrics

**MVP is complete when:**
- [ ] Can select any tile from tileset
- [ ] Can click on map to replace tile
- [ ] Change is immediately visible
- [ ] Can erase tiles
- [ ] No console errors
- [ ] State syncs between UI and engine

### 🚫 NOT Required for MVP
- ❌ Save/Load functionality
- ❌ Undo/Redo
- ❌ Multi-tile brush
- ❌ Fill tool
- ❌ Layer management
- ❌ Keyboard shortcuts
- ❌ Preview on hover
- ❌ Dependency injection
- ❌ Complex state management
- ❌ Performance optimization

### 📝 Notes Section
Use this space to track issues and solutions:

```
Date: ___________
Issue: 
Solution:

Date: ___________
Issue:
Solution:
```

### 🎉 Celebration Checklist
When MVP works:
- [ ] Commit working code
- [ ] Update documentation with findings
- [ ] Share success with team
- [ ] Plan next features
- [ ] Take a break! 🎉

---

**Remember: Focus only on making tiles change. Everything else can wait.**
