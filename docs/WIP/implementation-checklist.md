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

### Step 4: Connect UI to Service (~30 min) 🚧 NEXT
- [ ] Import MapEditorService in main GJS app
- [ ] Instantiate service with WebView instance
- [ ] Connect TilesetSelector `tile-selected` signal to `mapEditorService.selectTile()`
- [ ] Add tool selection buttons (Brush/Eraser) to UI
- [ ] Connect tool buttons to `mapEditorService.setTool()`
- [ ] Test tile selection updates engine state
- [ ] Test tool switching updates editor mode

### Step 5: Fix State Reception in Engine (~30 min)
- [ ] Open `packages/engine-excalibur/src/systems/map-editor.system.ts`
- [ ] Ensure RPC handler for EDITOR_STATE_CHANGED works
- [ ] Verify state updates EditorToolComponent properly
- [ ] Add console.log to confirm state changes
- [ ] Test full UI-to-Engine state synchronization

### Step 6: Integration Testing & Polish (~45 min)
- [ ] Test complete workflow: tile selection → tool selection → tile placement
- [ ] Verify RPC communication works in both directions
- [ ] Test eraser functionality
- [ ] Fix any remaining issues
- [ ] Performance optimization if needed

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

## 📊 Current Status Report

### ✅ Completed (75% of core functionality)
- **Tile Replacement**: Tiles können visuell verändert werden (mit farbkodierten Platzhaltern)
- **SpriteSheet Infrastructure**: Bereit für echte Sprites, sobald diese verfügbar sind
- **MapEditorService**: Vollständiger Service für UI-Engine-Kommunikation implementiert
- **Build Status**: Alle Packages bauen erfolgreich ohne Fehler

### 🚧 Next Priority: Step 4 - UI Integration
**Warum wichtig**: Verbindet die bestehende UI mit dem neuen Service für echte Funktionalität
**Zeitaufwand**: ~30 Minuten
**Erwartetes Ergebnis**: Tile-Auswahl und Tool-Wechsel funktionieren

### 🐛 Known Issues & Solutions
1. **Canvas vs ImageSource**: Behoben durch Verwendung von Excalibur `Canvas` Klasse
2. **SpriteSheet Access**: Infrastruktur erstellt, funktioniert wenn echte Sprites verfügbar
3. **RPC Communication**: Framework bereit, muss nur noch mit UI verbunden werden

### 🔄 Technical Architecture
```
GJS UI Layer          Service Layer          Engine Layer
├── TilesetSelector ──→ MapEditorService ──→ EditorInputSystem
├── Tool Buttons   ───→ RPC Communication ──→ EditorToolComponent
└── WebView        ←─── State Sync       ←─── TileMap
```

## 📝 Implementation Notes

### Lessons Learned
- Excalibur `Canvas` Klasse ist der richtige Weg für dynamische Grafiken
- MapResource-Referenz auf TileMap speichern ermöglicht sauberen Sprite-Zugriff
- RPC-basierte Architektur skaliert gut für komplexere Editor-Funktionen

### Current Capabilities
- ✅ Tile placement with visual feedback (color-coded)
- ✅ RPC communication infrastructure
- ✅ Service-based architecture for UI-Engine sync
- ✅ Error handling and logging
- ⏳ Real sprite integration (infrastructure ready)
- ⏳ UI event binding (next step)

### Success Metrics
- [x] Code compiles without errors
- [x] Basic tile replacement works
- [x] Service architecture implemented
- [ ] UI controls connected (next)
- [ ] Full workflow tested (Step 6)

---

*Next: Focus on connecting UI controls to make the editor fully functional.*