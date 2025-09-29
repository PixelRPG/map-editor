# Map Editor Architecture

## 🎯 Core Concept

The Map Editor enables runtime tile modification through direct manipulation of Excalibur's tile graphics using a clean ECS architecture.

## 🔑 Technical Foundation

Tiles are modified at runtime using Excalibur's graphics API:
```typescript
tile.clearGraphics()
tile.addGraphic(sprite.clone())
```

## 🏗️ System Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────┐
│                 1. UI Layer (GJS/GTK)                    │
├─────────────────────────────────────────────────────────┤
│  • TilesetSelector - Choose tiles from tileset           │
│  • ToolSelector - Switch between editing tools           │
│  • LayerSelector - Select map layers                     │
│  • MapEditorPanel - Container for editor widgets         │
└────────────────────────┬─────────────────────────────────┘
                         │
                    ↓ RPC Events ↓
                         │
┌────────────────────────▼─────────────────────────────────┐
│             2. Service Layer (Bridge)                     │
├─────────────────────────────────────────────────────────┤
│  • MapEditorService - State coordination                 │
│  • RPC message handling                                  │
│  • UI-Engine synchronization                             │
└────────────────────────┬─────────────────────────────────┘
                         │
                    ↓ State Updates ↓
                         │
┌────────────────────────▼─────────────────────────────────┐
│           3. Engine Layer (Excalibur)                     │
├─────────────────────────────────────────────────────────┤
│  • EditorInputSystem - Mouse event processing            │
│  • MapEditorComponent - Editable state management        │
│  • EditorToolComponent - Tool and selection state        │
│  • MapEditorSystem - Coordination and state sync         │
│  • TileInteractionSystem - Tile interaction handling     │
│  • TileMap - Actual tile graphic manipulation            │
└─────────────────────────────────────────────────────────┘
```

## 📊 Data Flow

### Tile Selection Flow
```
1. User clicks tile in TilesetSelector
2. TilesetSelector emits 'tile-selected' signal
3. MapEditorService.selectTile(tileId) called
4. Service sends RPC: EDITOR_STATE_CHANGED
5. MapEditorSystem receives state update
6. EditorToolComponent.selectedTileId updated
```

### Tile Placement Flow
```
1. User clicks on map
2. EditorInputSystem detects click
3. System reads EditorToolComponent state
4. System calls tile.clearGraphics()
5. System calls tile.addGraphic(sprite)
6. Tile visually changes immediately
7. System sends RPC: TILE_PLACED confirmation
```

## 🛠️ Core Components

### UI Layer Components

#### TilesetSelector
- Displays available tiles in a grid
- Handles tile selection
- Emits selection signals
- Provides visual feedback

#### ToolSelector
- Simple toggle buttons for tools
- Exclusive selection (one tool active)
- Emits tool change signals

#### LayerSelector
- Lists available map layers
- Handles layer switching
- Updates editing context

### Service Layer

#### MapEditorService
- Manages editor state
- Bridges UI and Engine
- Handles RPC communication
- Coordinates tool and tile selection

Key responsibilities:
```typescript
class MapEditorService {
  // State management
  selectedTileId: number
  currentTool: 'brush' | 'eraser'
  selectedLayerId: string
  
  // UI integration
  selectTile(id: number): void
  setTool(tool: string): void
  setLayer(id: string): void
  
  // Engine communication
  updateEngineState(): void
  setupRpcHandlers(): void
}
```

### Engine Layer Components

#### EditorInputSystem
Processes mouse events and triggers tile modifications:
- Converts screen to tile coordinates
- Handles click and hover events
- Executes tile modifications
- Sends RPC notifications

#### MapEditorComponent
Marks entities as editable:
- `isEditable`: Enable/disable editing
- `selectedTileCoords`: Current selection
- `hoverTileCoords`: Hover position
- Event callbacks for UI updates

#### EditorToolComponent
Stores tool and selection state:
- `currentTool`: Active editing tool
- `selectedTileId`: Tile to place
- `selectedLayerId`: Target layer
- Tool-specific settings

#### MapEditorSystem
Coordinates editor functionality:
- Manages component queries
- Handles state synchronization
- Processes RPC messages
- Updates tool components

#### TileInteractionSystem
Processes tile interactions:
- Handles tile selection
- Routes to appropriate tools
- Manages visual feedback

## 🔧 Implementation Phases

### Phase 1: Core Components ✅
- MapEditorComponent
- EditorToolComponent
- RPC type definitions

### Phase 2: Systems ✅
- MapEditorSystem
- TileInteractionSystem
- EditorInputSystem

### Phase 3: Integration 🔄
- MapEditorService
- ToolSelector widget
- Component wiring

### Phase 4: Features (Optional)
- Save/Load
- Undo/Redo
- Advanced tools

### Phase 5: Testing
- Functional validation
- Performance testing
- Bug fixes

## 🎯 Design Principles

### ECS Architecture
- Components store state
- Systems process logic
- Clean separation of concerns
- Runtime composition

### Simplicity
- Direct instantiation
- Minimal dependencies
- Clear data flow
- Easy debugging

### Extensibility
- Add features incrementally
- Maintain backward compatibility
- Plugin-friendly design
- Modular components

## 📋 Success Criteria

The architecture succeeds when:
1. **Tile selection** updates engine state
2. **Map clicks** change tile graphics
3. **Tool switches** modify behavior
4. **No errors** in console
5. **Performance** remains responsive

## 🚀 Extension Points

The architecture supports future additions:

### Persistence
- Serialize map state
- File system integration
- Project management

### Advanced Tools
- Multi-tile brushes
- Fill algorithms
- Selection tools
- Transform operations

### Optimization
- Batch operations
- Dirty rectangles
- Viewport culling
- Sprite caching

### Collaboration
- Multi-user editing
- Change tracking
- Conflict resolution

---

*This architecture provides a solid foundation for map editing while maintaining simplicity and extensibility.*