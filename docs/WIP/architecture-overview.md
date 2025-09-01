# Map Editor Architecture Overview

## 🎯 Core Concept: ECS Mode Switching

The Map Editor architecture is built around a revolutionary **ECS (Entity Component System) Mode Switching** approach that enables clean separation between game runtime and editor functionality.

## 🏗️ Architecture Principles

### 1. Component-Based Feature Activation
```typescript
// Editor mode activation through components
tileMap.addComponent(new MapEditorComponent())
tileMap.addComponent(new EditorToolComponent())

// Editor mode deactivation
tileMap.removeComponent(MapEditorComponent)
tileMap.removeComponent(EditorToolComponent)
```

### 2. System-Conditional Execution
```typescript
// Systems only run when components are present
export class MapEditorSystem extends ex.System {
  public update(): void {
    // This system only processes entities WITH MapEditorComponent
    for (const entity of this.editableMapsQuery.entities) {
      // Editor logic here
    }
  }
}
```

### 3. Clean Separation of Concerns
- **Game Runtime**: Pure Excalibur ECS without editor overhead
- **Editor Mode**: Additional components and systems for editing
- **Host Integration**: GJS host manages editor state and UI

## 🏛️ System Architecture

### Core Components

#### 🎮 MapEditorComponent
```typescript
export class MapEditorComponent extends ex.Component {
  // Editor activation flag
  public isEditable: boolean = true

  // Current interaction state
  public selectedTileCoords: ex.Vector | null = null
  public hoverTileCoords: ex.Vector | null = null

  // RPC callbacks for state synchronization
  public onTileSelected?: (coords: ex.Vector) => void
  public onTileHovered?: (coords: ex.Vector) => void
}
```

#### 🛠️ EditorToolComponent
```typescript
export class EditorToolComponent extends ex.Component {
  // Current tool selection
  public currentTool: 'brush' | 'eraser' | 'fill' | null = null

  // Selected resources
  public selectedTileId: number | null = null
  public selectedLayerId: string | null = null

  // Tool-specific state
  public brushSize: number = 1
  public fillTolerance: number = 0
}
```

### Core Systems

#### 🎯 MapEditorSystem (Coordinator)
- **Purpose**: Central coordination system with type-safe architecture
- **Queries**: Type-safe queries for entities with MapEditorComponent and EditorToolComponent
- **Type Safety**: Uses `Query<ComponentCtor<Component>>` and `Entity[]` for complete type safety
- **Responsibilities**:
  - State synchronization between components with proper typing
  - RPC communication management with typed parameters
  - Performance monitoring with built-in metrics
  - Mode switching coordination with clean component lifecycle

#### 🖱️ TileInteractionSystem (Input Handler)
- **Purpose**: Handle tile-based interactions with complete type safety
- **Queries**: Type-safe query using `Query<typeof MapEditorComponent>` for precise entity selection
- **Type Safety**: Uses `Entity` and proper component access patterns for type-safe operations
- **Responsibilities**:
  - Coordinate-to-tile conversion using Excalibur Vector types
  - Click and hover event processing with typed RPC notifications
  - Tool routing based on current selection with proper type checking
  - Visual feedback management using typed component access

#### 🔧 EditorInputSystem (Extended)
- **Purpose**: Extended input handling for editor with type-safe Excalibur integration
- **Type Safety**: Proper use of Excalibur `Vector`, `vec()`, and `Tile` types
- **Enhancements**:
  - Tile coordinate calculation using `screenToWorldCoordinates(vec(x, y))`
  - Component integration with typed entity access
  - RPC event generation with proper parameter typing

## 🌐 Communication Architecture

### RPC Communication Flow
```
GJS Host ←───────RPC────────→ Excalibur Engine
    │                           │
    ├── MapEditorService        ├── MapEditorSystem
    ├── Tool Management         ├── Component State
    ├── UI State                ├── TileMap Interactions
    └── User Actions            └── Visual Feedback
```

### Key RPC Messages
```typescript
enum RpcEngineType {
  // TileMap interactions
  TILE_CLICKED = 'tile-clicked',
  TILE_HOVERED = 'tile-hovered',
  TILE_PLACED = 'tile-placed',

  // Editor state
  EDITOR_STATE_CHANGED = 'editor-state-changed'
}
```

## 🛠️ Tool System Architecture

### Abstract Tool Pattern
```typescript
export abstract class AbstractTool {
  constructor(
    protected mapEditorService: MapEditorService,
    protected engine: Engine
  ) {}

  // Lifecycle
  abstract activate(): void
  abstract deactivate(): void

  // Interactions
  abstract handleTileClick(coords: ex.Vector): Promise<void>
  abstract handleTileHover(coords: ex.Vector): Promise<void>
}
```

### Concrete Tools
- **BrushTool**: Single/multi-tile placement with patterns
- **EraserTool**: Safe tile removal with area support
- **FillTool**: Flood fill with tolerance and boundary detection

## 🎨 Mode Switching Mechanism

### Activation Process
```typescript
async function activateEditorMode(tileMap: ex.TileMap): Promise<void> {
  // 1. Add editor components to TileMap entity
  tileMap.addComponent(new MapEditorComponent())
  tileMap.addComponent(new EditorToolComponent())

  // 2. Add editor systems to scene
  scene.world.add(new MapEditorSystem())
  scene.world.add(new TileInteractionSystem())

  // 3. Configure RPC handlers
  engine.setupEditorRpcHandlers()

  // 4. Initialize UI components
  sidebar.initializeEditorMode()
}
```

### Deactivation Process
```typescript
async function deactivateEditorMode(tileMap: ex.TileMap): Promise<void> {
  // 1. Remove editor components
  tileMap.removeComponent(MapEditorComponent)
  tileMap.removeComponent(EditorToolComponent)

  // 2. Remove editor systems
  scene.world.remove(MapEditorSystem)
  scene.world.remove(TileInteractionSystem)

  // 3. Cleanup RPC handlers
  engine.cleanupEditorRpcHandlers()

  // 4. Reset UI components
  sidebar.deactivateEditorMode()
}
```

## 📊 Performance Characteristics

### Runtime Impact
- **Game Mode**: Zero editor overhead (no editor components/systems)
- **Editor Mode**: Minimal overhead (< 5% of frame time)
- **Memory**: Efficient component-based activation

### Optimization Strategies
- **Query Caching**: Frequently used queries are cached
- **RPC Batching**: Multiple RPC calls batched for performance
- **Coordinate Caching**: Expensive transformations cached
- **Event Debouncing**: High-frequency events debounced

## 🔧 Integration Points

### GJS Host Integration
- **MapEditorService**: Central state management
- **RPC Handlers**: Bidirectional communication
- **UI Components**: Reactive state updates
- **Tool Management**: Host-side tool coordination

### Excalibur Engine Integration
- **Scene Management**: Dynamic system addition/removal
- **Component System**: Entity-based editor state
- **RPC Communication**: Seamless host communication
- **Performance Monitoring**: Built-in performance tracking

## 🎯 Benefits of This Architecture

### ✅ Pure ECS Design
- No conditional logic in core game code
- Clean separation through component composition
- Extensible through new components and systems

### ✅ Type-Safe Implementation
- Complete TypeScript type safety throughout all systems
- Proper use of Excalibur types (`Query<ComponentType>`, `Entity`, `Vector`, `Tile`)
- Eliminated `any` types for better maintainability and error prevention
- Strong typing for RPC parameters and component interactions

### ✅ Performance Optimized
- Zero runtime cost when editor is inactive
- Efficient queries and caching
- Batched operations for network communication

### ✅ Maintainable
- Clear separation of concerns with typed interfaces
- Modular component and system design
- Easy to extend with new tools and features
- Self-documenting code through TypeScript types

### ✅ Testable
- Components can be tested in isolation
- Systems can be tested with mock components
- Integration tests for complete workflows
- Type safety enables better test coverage

### ✅ User Experience
- Seamless mode switching
- Responsive interactions
- Visual feedback and previews
- Keyboard shortcuts and accessibility

## 🚀 Future Extensibility

### New Tools
```typescript
// Easy to add new tools with type safety
export class NewCustomTool extends AbstractTool {
  // Implement required methods with proper typing
  async handleTileClick(coords: ex.Vector): Promise<void> {
    // Custom tool logic with type-safe component access
    const editorComponent = this.entity.get(MapEditorComponent)
    const toolComponent = this.entity.get(EditorToolComponent)

    if (editorComponent && toolComponent) {
      // Type-safe tool implementation
    }
  }
}
```

### New Components
```typescript
// Easy to add new editor features with type safety
export class AdvancedSelectionComponent extends ex.Component {
  // Advanced selection state with proper typing
  public selectedTiles: ex.Vector[] = []
  public selectionMode: 'single' | 'multi' | 'area' = 'single'

  // Type-safe methods
  public addTile(tileCoords: ex.Vector): void {
    this.selectedTiles.push(tileCoords)
  }

  public clearSelection(): void {
    this.selectedTiles = []
  }
}
```

### New Systems
```typescript
// Easy to add new editor systems with type safety
export class AdvancedEditingSystem extends ex.System {
  // Type-safe queries for advanced editing
  private advancedEntitiesQuery: ex.Query<typeof AdvancedSelectionComponent>

  public initialize(world: ex.World, scene: ex.Scene): void {
    this.world = world
    this.advancedEntitiesQuery = this.world.query([AdvancedSelectionComponent])
  }

  public update(elapsed: number): void {
    // Advanced editing logic with type safety
    const entities = this.advancedEntitiesQuery.entities

    for (const entity of entities) {
      const selectionComponent = entity.get(AdvancedSelectionComponent)
      if (selectionComponent) {
        // Type-safe advanced editing operations
        this.processAdvancedSelection(entity, selectionComponent)
      }
    }
  }

  private processAdvancedSelection(entity: ex.Entity, component: AdvancedSelectionComponent): void {
    // Type-safe processing of advanced selections
  }
}
```

## 📋 Development Phases

1. **[Phase 1](phase-1-ecs-components.md)**: Core components and RPC foundation
2. **[Phase 2](phase-2-ecs-systems.md)**: Editor systems and scene integration
3. **[Phase 3](phase-3-gjs-integration.md)**: Host services and UI integration
4. **[Phase 4](phase-4-tool-system.md)**: Complete tool implementations
5. **[Phase 5](phase-5-testing-polish.md)**: Quality assurance and optimization

This architecture provides a solid, extensible foundation for the Map Editor while maintaining clean separation between game runtime and editor functionality.
