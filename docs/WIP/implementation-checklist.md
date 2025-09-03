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

### Step 1: Fix Tile Replacement (~30 min) ✅ COMPLETED
- [x] Open `packages/engine-excalibur/src/systems/editor-input.system.ts`
- [x] Find `handleTilePlacement` method (line ~269)
- [x] Add tile modification code with Excalibur Canvas fallback
- [x] Test with color-coded tiles based on tile ID
- [x] Verify tile changes visually in browser
- [x] Check console for errors

### Step 2: Get SpriteSheet Reference (~30 min) ✅ COMPLETED
- [x] Extended MapResource with public methods for sprite set access
- [x] Store MapResource reference on TileMap for editor access
- [x] Implement `getSpriteForTile` helper method
- [x] Test sprite sheet retrieval from TileMap
- [x] **Status**: Infrastructure ready, real sprites will work when available

### Step 3: Create MapEditorService (~1 hour) ✅ COMPLETED
- [x] Create `packages/engine-gjs/src/services/map-editor.service.ts`
- [x] Add constructor with WebView dependency
- [x] Implement `setupRpcHandlers()` method for RPC communication
- [x] Implement `updateEngineState()` method for state synchronization
- [x] Add `setTool()` and `selectTile()` methods
- [x] Test service instantiation and basic functionality

### Step 4: Connect UI to Service (~30 min) ✅ COMPLETED
- [x] Import MapEditorService in main GJS app
- [x] Instantiate service with WebView instance in `_onMapLoaded()`
- [x] Connect TilesetSelector `sprite-selected` signal to `mapEditorService.selectTile()`
- [x] Add tool selection buttons (Brush/Eraser) to UI in new Tools tab
- [x] Connect tool buttons to `mapEditorService.setTool()` via signal chain
- [x] Fix timing issues with sidebar signal connections
- [x] Test tile selection updates engine state (RPC communication ready)
- [x] Test tool switching updates editor mode (UI components connected)

### Step 5: Layer Selection System Refactor (~45 min) ✅ COMPLETED
- [x] Moved Layer Selection Logic from MapEditorPanel to LayerSelector
- [x] Created `setMapData()` method in LayerSelector for self-contained layer management
- [x] Added `layer-selected` signal to LayerSelector for proper event handling
- [x] Updated MapEditorPanel to use LayerSelector's new API and forward signals
- [x] Removed obsolete `_createLayersWidget` method from MapEditorPanel
- [x] Added proper CSS styling for layer selection visual feedback

### Step 6: Code Cleanup & Optimization (~30 min) ✅ COMPLETED
- [x] Cleaned up hover optimization attempts in `editor-input.system.ts`
- [x] Reverted to simple, robust hover event handling
- [x] Removed debug console.log statements for clean codebase
- [x] Fixed CSS styling issues and removed unused classes
- [x] Ensured all packages build without warnings

### Step 7: Problem Analysis & Research (~2 hours) 🔄 IN PROGRESS
**Why important**: Resolve remaining issues for clean and sustainable solutions

**Known Issues:**
- **Layer Selection Issue**: Selected layer is not considered, all graphics are replaced
- **Tile Selection Issue**: Selected tile is not considered, always the first tile from the tileset
- **Tool Selection Issue**: Brush tool is pre-selected, but must be re-selected

**Research Tasks:**
- [ ] Analyze the `handleTilePlacement` method in EditorInputSystem
- [ ] Check the `EditorToolComponent` state management
- [ ] Investigate RPC communication between UI and Engine
- [ ] Verify the `MapEditorSystem` state updates
- [ ] Test the `TilesetSelector` and `LayerSelector` signal connections
- [ ] Debug the tool button state management

**Expected Result:** Clear root cause analysis and solution paths for each problem

### Step 8: Implement Fixes (~1-2 hours)
- [ ] Fix Layer Selection Integration
- [ ] Fix Tile Selection Integration
- [ ] Fix Tool Selection State Management
- [ ] Comprehensive Testing

## 🧪 Testing Checklist

### Basic Functionality
- [x] Select tile ID 1 from TilesetSelector
- [x] Click Brush button (must be re-selected due to known issue)
- [x] Click on map tile at position (2, 2)
- [x] Tile changes to selected sprite (color-coded placeholder)
- [x] Console shows no errors

### Eraser Test
- [x] Click Eraser button
- [x] Click on tile with graphic
- [x] Tile graphic disappears
- [x] Tile.solid is false

### Multiple Tiles
- [x] Select different tile ID
- [x] Click multiple tiles in sequence
- [x] All clicked tiles change (same tile due to known issue)
- [x] No performance issues

## 🐛 Known Issues & Current Status

### ✅ Resolved Issues
1. **Hover Events Optimization**: Simplified to robust base implementation
2. **Layer Display**: All layers are correctly displayed with names
3. **Layer Selection UI**: Refactored architecture with clean signal connections
4. **Code Quality**: Removed all debug logs and unnecessary attempts
5. **Build Status**: All packages build without warnings

### 🚧 Active Issues (Priority for Step 7-8)
1. **Layer Selection Not Working**: Selected layer is ignored during tile replacement
   - **Symptom**: Always all graphics at a position are replaced
   - **Cause**: Probably missing integration in `handleTilePlacement`

2. **Tile Selection Not Working**: Selected tile is ignored
   - **Symptom**: Always the first tile from the tileset is used
   - **Cause**: Probably missing state synchronization in `EditorToolComponent`

3. **Tool Selection State**: Brush tool must be re-selected
   - **Symptom**: Pre-selection doesn't work on first load
   - **Cause**: Probably timing issue during initialization

### 🔍 Research Strategy for Step 7

**For each problem:**
1. **Code Review**: Analyze affected methods
2. **State Debugging**: Check current values in EditorToolComponent
3. **RPC Monitoring**: Track communication between UI and Engine
4. **Integration Testing**: Test functionality step by step
5. **Root Cause Analysis**: Identify cause and document solution

**Debug Steps:**
- Add console logs in critical paths (temporary)
- State inspection in EditorToolComponent
- Monitor RPC messages
- Timing analysis for initialization

## 📊 Success Criteria

MVP is complete when:
- [x] Can select any tile from tileset (UI works)
- [x] Can click on map to replace tile (basic functionality ✅)
- [x] Change is immediately visible (✅)
- [x] Can erase tiles (✅)
- [x] No console errors (✅)
- [x] State syncs between UI and engine (⚠️ partially)
- [ ] Selected layer is respected in tile placement
- [ ] Selected tile is actually used (not always first tile)
- [ ] Tool selection works without re-selection

## 📊 Current Status Report

### ✅ Major Achievements
- **Functional Tile Replacement**: Tiles can be visually modified
- **Eraser Tool**: Works reliably
- **RPC Infrastructure**: Complete bidirectional communication
- **Clean Architecture**: Refactored layer selection with clean separation
- **Build Stability**: All packages build without errors or warnings

### 🚧 Next Priority: Step 7 - Problem Analysis & Research
**Why important**: Systematically identify and resolve remaining issues
**Time required**: ~2 hours research + ~1-2 hours implementation
**Expected result**: Fully functional map editor

### 🔄 Technical Architecture
```
GJS UI Layer          Service Layer          Engine Layer
├── TilesetSelector ──→ MapEditorService ──→ EditorInputSystem    ⚠️ Tile Selection Issue
├── Tool Buttons   ───→ RPC Communication ──→ EditorToolComponent ⚠️ Tool State Issue
├── LayerSelector  ───→ State Sync       ───→ MapEditorComponent  ⚠️ Layer Selection Issue
└── WebView        ←─── Feedback         ←─── TileMap
```

## 📝 Implementation Notes

### Lessons Learned
- **Hover Optimization**: Overly complex solutions can cause more problems than they solve
- **Layer Management**: Self-contained widgets with clear signals are more maintainable
- **State Synchronization**: RPC-based architecture works, but timing is critical
- **Code Cleanup**: Regular cleanup prevents technical debt

### Current Capabilities
- ✅ Tile placement with visual feedback (color-coded placeholders)
- ✅ RPC communication infrastructure (bidirectional)
- ✅ Service-based architecture for UI-Engine synchronization
- ✅ Complete UI integration with TilesetSelector and Tool buttons
- ✅ Layer display and selection UI (refactored architecture)
- ✅ Error handling and logging
- ✅ Clean, maintainable codebase
- ⚠️ Layer selection integration (needs debugging)
- ⚠️ Tile selection integration (needs debugging)
- ⚠️ Tool state management (needs debugging)

### Success Metrics
- [x] Code compiles without errors or warnings
- [x] Basic tile replacement works (visual feedback)
- [x] Service architecture implemented and functional
- [x] UI controls connected and responsive
- [x] Clean, refactored codebase
- [x] All major components integrated
- [ ] Full workflow tested with selected tiles
- [ ] Layer-specific editing works
- [ ] Tool selection persistent across sessions

---

*Next: Step 7 - Systematic analysis of remaining issues for sustainable solutions.*