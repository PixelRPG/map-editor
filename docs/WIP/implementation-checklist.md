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
**Warum wichtig**: Behebung der verbleibenden Probleme für eine saubere und nachhaltige Lösung

**Bekannte Probleme:**
- **Layer Selection Issue**: Ausgewählter Layer wird nicht berücksichtigt, alle Grafiken werden ersetzt
- **Tile Selection Issue**: Ausgewähltes Tile wird nicht berücksichtigt, immer das erste Tile aus dem Tileset
- **Tool Selection Issue**: Brush Tool ist vorausgewählt, muss aber erneut ausgewählt werden

**Research-Aufgaben:**
- [ ] Analysieren der `handleTilePlacement` Methode in EditorInputSystem
- [ ] Prüfen der `EditorToolComponent` State-Verwaltung
- [ ] Untersuchen der RPC-Kommunikation zwischen UI und Engine
- [ ] Verifizieren der `MapEditorSystem` State-Aktualisierung
- [ ] Testen der `TilesetSelector` und `LayerSelector` Signal-Verbindungen
- [ ] Debuggen der Tool-Button State-Verwaltung

**Erwartetes Ergebnis:** Klare Ursachenanalyse und Lösungswege für jedes Problem

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
1. **Hover Events Optimization**: Vereinfacht zu robuster Basis-Implementierung
2. **Layer Display**: Alle Layer werden korrekt angezeigt mit Namen
3. **Layer Selection UI**: Refaktorierte Architektur mit sauberer Signal-Verbindung
4. **Code Quality**: Entfernt alle Debug-Logs und überflüssigen Versuche
5. **Build Status**: Alle Packages bauen ohne Warnungen

### 🚧 Active Issues (Priorität für Step 7-8)
1. **Layer Selection Not Working**: Ausgewählter Layer wird ignoriert bei Tile-Ersetzung
   - **Symptom**: Immer alle Grafiken an einer Position werden ersetzt
   - **Ursache**: Wahrscheinlich fehlende Integration in `handleTilePlacement`

2. **Tile Selection Not Working**: Ausgewähltes Tile wird ignoriert
   - **Symptom**: Immer das erste Tile aus dem Tileset wird verwendet
   - **Ursache**: Wahrscheinlich fehlende State-Synchronisation in `EditorToolComponent`

3. **Tool Selection State**: Brush Tool muss erneut ausgewählt werden
   - **Symptom**: Vorauswahl funktioniert nicht beim ersten Laden
   - **Ursache**: Wahrscheinlich Timing-Problem bei Initialisierung

### 🔍 Research Strategy for Step 7

**Für jedes Problem:**
1. **Code Review**: Betroffene Methoden analysieren
2. **State Debugging**: Aktuelle Werte in EditorToolComponent prüfen
3. **RPC Monitoring**: Kommunikation zwischen UI und Engine verfolgen
4. **Integration Testing**: Schrittweise Funktionalität testen
5. **Root Cause Analysis**: Ursache identifizieren und dokumentieren

**Debug-Schritte:**
- Console logs in kritischen Pfaden hinzufügen (temporär)
- State-Inspektion in EditorToolComponent
- RPC-Nachrichten überwachen
- Timing-Analyse für Initialisierung

## 📊 Success Criteria

MVP is complete when:
- [x] Can select any tile from tileset (UI funktioniert)
- [x] Can click on map to replace tile (grundlegende Funktionalität ✅)
- [x] Change is immediately visible (✅)
- [x] Can erase tiles (✅)
- [x] No console errors (✅)
- [x] State syncs between UI and engine (⚠️ teilweise)
- [ ] Selected layer is respected in tile placement
- [ ] Selected tile is actually used (not always first tile)
- [ ] Tool selection works without re-selection

## 📊 Current Status Report

### ✅ Major Achievements
- **Functional Tile Replacement**: Tiles können visuell verändert werden
- **Eraser Tool**: Funktioniert zuverlässig
- **RPC Infrastructure**: Vollständige bidirektionale Kommunikation
- **Clean Architecture**: Refaktorierte Layer-Auswahl mit sauberer Trennung
- **Build Stability**: Alle Packages bauen ohne Fehler oder Warnungen

### 🚧 Next Priority: Step 7 - Problem Analysis & Research
**Warum wichtig**: Verbleibende Probleme systematisch identifizieren und beheben
**Zeitaufwand**: ~2 Stunden Research + ~1-2 Stunden Implementierung
**Erwartetes Ergebnis**: Vollständig funktionierender Map Editor

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
- **Hover Optimization**: Zu komplexe Lösungen können mehr Probleme verursachen als lösen
- **Layer Management**: Selbstständige Widgets mit klaren Signalen sind wartbarer
- **State Synchronization**: RPC-basierte Architektur funktioniert, aber Timing ist kritisch
- **Code Cleanup**: Regelmäßiges Aufräumen verhindert technische Schulden

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

*Next: Step 7 - Systematische Analyse der verbleibenden Probleme für nachhaltige Lösungen.*