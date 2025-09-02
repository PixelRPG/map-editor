# Map Editor Implementation Checklist

## 🎯 Goal
Enable tile replacement with a single click in the map editor.

## 📋 Prerequisites (Completed)
- [x] MapEditorComponent created
- [x] EditorToolComponent created  
- [x] MapEditorSystem implemented
- [x] TileInteractionSystem implemented
- [x] EditorInputSystem handles mouse events
- [x] RPC types defined
- [x] TilesetSelector widget exists
- [x] WebView with RPC communication works

## 🔧 Implementation Tasks

### Step 1: Fix Tile Replacement (~30 min)
- [ ] Open `packages/engine-excalibur/src/systems/editor-input.system.ts`
- [ ] Find `handleTilePlacement` method (line ~269)
- [ ] Add tile modification code:
  ```typescript
  tile.clearGraphics()
  const sprite = spriteSheet.getSprite(selectedTileId)
  tile.addGraphic(sprite.clone())
  ```
- [ ] Test with hardcoded tile ID (e.g., always use tile 5)
- [ ] Verify tile changes visually in browser
- [ ] Check console for errors

### Step 2: Get SpriteSheet Reference (~30 min)
- [ ] Identify where sprite sheets are loaded
- [ ] Store reference in accessible location
- [ ] Update `handleTilePlacement` to retrieve sprite sheet
- [ ] Test tile changes with actual sprite sheet

### Step 3: Create MapEditorService (~1 hour)
- [ ] Create `packages/engine-gjs/src/services/map-editor.service.ts`
- [ ] Add constructor with WebView dependency
- [ ] Implement `setupRpcHandlers()` method
- [ ] Implement `updateEngineState()` method
- [ ] Add `setTool()` and `selectTile()` methods
- [ ] Test service instantiation

### Step 4: Connect UI to Service (~30 min)
- [ ] Import MapEditorService in main app
- [ ] Instantiate service with WebView
- [ ] Connect TilesetSelector signals
- [ ] Test tile selection updates engine state

### Step 5: Add Tool Selection UI (~30 min)
- [ ] Create simple GTK button box
- [ ] Add Brush button
- [ ] Add Eraser button
- [ ] Connect buttons to `mapEditorService.setTool()`
- [ ] Add to existing UI
- [ ] Test tool switching

### Step 6: Fix State Reception in Engine (~30 min)
- [ ] Open `packages/engine-excalibur/src/systems/map-editor.system.ts`
- [ ] Ensure RPC handler for EDITOR_STATE_CHANGED works
- [ ] Verify state updates EditorToolComponent
- [ ] Add console.log to confirm state changes
- [ ] Test full flow

## 🧪 Testing Checklist

### Basic Functionality
- [ ] Select tile ID 1 from TilesetSelector
- [ ] Click Brush button
- [ ] Click on map tile at position (2, 2)
- [ ] Tile changes to selected sprite
- [ ] Console shows no errors

### Eraser Test
- [ ] Click Eraser button
- [ ] Click on tile with graphic
- [ ] Tile graphic disappears
- [ ] Tile.solid is false

### Multiple Tiles
- [ ] Select different tile ID
- [ ] Click multiple tiles in sequence
- [ ] All clicked tiles change
- [ ] No performance issues

## 🐛 Debugging Guide

If tiles don't change:
1. [ ] Check console for errors
2. [ ] Verify sprite sheet is loaded
3. [ ] Log tile before and after modification
4. [ ] Check if `clearGraphics()` works
5. [ ] Verify `addGraphic()` is called
6. [ ] Ensure sprite.clone() returns valid sprite
7. [ ] Check tile bounds and visibility

## 📊 Success Criteria

MVP is complete when:
- [ ] Can select any tile from tileset
- [ ] Can click on map to replace tile
- [ ] Change is immediately visible
- [ ] Can erase tiles
- [ ] No console errors
- [ ] State syncs between UI and engine

## 📝 Notes
_Use this space to track issues and solutions during implementation_

---

*Focus on making tiles change. Everything else is secondary.*