# Phase 2: ECS Systems Implementation

## 📋 Overview
**Status:** Planned | **Estimate:** 2-3 days | **Priority:** High

This phase implements the core ECS systems that coordinate map editing functionality using the components created in Phase 1.

## 🎯 Goals
- Implement MapEditorSystem as central coordination system
- Create TileInteractionSystem for click handling
- Integrate new systems with existing scene architecture
- Enable seamless editor/game mode switching

## 📝 Detailed Tasks

### 2.1 Create MapEditorSystem
**File:** `packages/engine-excalibur/src/systems/map-editor.system.ts`

#### Description
Central ECS system that coordinates all map editing functionality. Acts as the main orchestrator between TileMaps, tools, and RPC communication.

#### System Architecture
```typescript
export class MapEditorSystem extends ex.System {
  public readonly systemType = ex.SystemType.Update
  public readonly priority = 10 // Run after input systems

  // Type-safe queries for entities with editor components
  private editableEntitiesQuery: ex.Query<ex.ComponentCtor<ex.Component>>
  private editorEntitiesQuery: ex.Query<ex.ComponentCtor<ex.Component>>

  constructor() {
    super()
    // Initialize queries in constructor - actual query creation happens in initialize()
  }

  public initialize(world: ex.World, scene: ex.Scene): void {
    this.world = world

    // Create queries after world is available
    this.editableEntitiesQuery = this.world.query([
      MapEditorComponent,
      EditorToolComponent
    ])
    this.editorEntitiesQuery = this.world.query([MapEditorComponent])

    this.setupRpcHandlers()
  }

  public update(elapsed: number): void {
    // Process entities with complete editor setup
    const editableEntities = this.editableEntitiesQuery.entities
    this.synchronizeEditorState(editableEntities)
  }
}
```

#### Core Responsibilities
1. **Query Management**: Find all editable TileMaps
2. **State Coordination**: Synchronize editor state between components
3. **RPC Communication**: Handle bidirectional communication with GJS host
4. **Mode Switching**: Enable/disable editor functionality
5. **Performance Monitoring**: Track system performance

#### Acceptance Criteria
- ✅ Efficient query usage with proper caching
- ✅ Clean separation of responsibilities
- ✅ Performance monitoring and optimization
- ✅ Proper error handling and logging
- ✅ Integration with existing ECS world

#### Implementation Notes
- System only processes entities with MapEditorComponent
- Queries are cached for performance
- RPC calls are batched when possible
- Clean shutdown when components are removed

### 2.2 Create TileInteractionSystem
**File:** `packages/engine-excalibur/src/systems/tile-interaction.system.ts`

#### Description
ECS system that handles tile-based interactions. Processes click and hover events on TileMap entities with MapEditorComponent.

#### System Architecture
```typescript
export class TileInteractionSystem extends ex.System {
  public readonly systemType = ex.SystemType.Update
  public readonly priority = 11 // Run after MapEditorSystem

  // Type-safe query for entities with MapEditorComponent
  private interactiveEntitiesQuery: ex.Query<typeof MapEditorComponent>

  constructor() {
    super()
  }

  public initialize(world: ex.World, scene: ex.Scene): void {
    super.initialize(world, scene)
    this.world = world

    // Create query after world is available
    this.interactiveEntitiesQuery = this.world.query([MapEditorComponent])
  }

  public update(elapsed: number): void {
    const interactiveEntities = this.interactiveEntitiesQuery.entities

    for (const entity of interactiveEntities) {
      const editorComponent = entity.get(MapEditorComponent)
      const toolComponent = entity.get(EditorToolComponent)

      if (!editorComponent?.isEditable) continue

      // Process interactions based on component state
      this.processInteractions(entity, editorComponent, toolComponent)
    }
  }

  private handleTileClick(entity: ex.Entity, coords: { x: number; y: number }, toolComponent?: EditorToolComponent): void {
    // Process tile click with proper type safety
    if (!toolComponent?.isReadyForEditing()) return

    const { currentTool, selectedTileId, selectedLayerId } = toolComponent
    // Tool-based tile placement logic
  }

  private handleTileHover(entity: ex.Entity, coords: { x: number; y: number }): void {
    // Update hover state with RPC notification
    this.rpc.sendNotification(ex.RpcEngineType.TILE_HOVERED, { coords })
  }
}
```

#### Features
1. **Click Detection**: Precise tile coordinate detection
2. **Hover States**: Visual feedback for tile hovering
3. **Tool Integration**: Route interactions to appropriate tools
4. **Coordinate Validation**: Ensure interactions are within map bounds
5. **Performance Optimization**: Efficient coordinate calculations

#### Acceptance Criteria
- ✅ Precise tile coordinate detection from screen coordinates
- ✅ Smooth hover effects without performance impact
- ✅ Support for all planned tools (brush, eraser, fill)
- ✅ Proper bounds checking and error handling
- ✅ Integration with MapEditorComponent state

#### Implementation Notes
- Uses optimized coordinate transformation
- Debounces rapid hover events
- Considers camera zoom and position
- Only processes entities with MapEditorComponent

### 2.3 Scene Integration
**File:** `packages/engine-excalibur/src/engine.ts`

#### Description
Integrate the new editor systems into the existing engine architecture. Enable automatic system registration when maps are loaded.

#### Changes Required
1. **System Registration**
   ```typescript
   // In engine.ts
   private setupEditorSystems(): void {
     if (this.hasEditorComponents()) {
       this.scene.world.add(new MapEditorSystem())
       this.scene.world.add(new TileInteractionSystem())
     }
   }
   ```

2. **Component Detection**
   ```typescript
   private hasEditorComponents(): boolean {
     // Check if any loaded TileMaps have MapEditorComponent
     return this.scene.world.query([ex.TileMap, MapEditorComponent]).entities.length > 0
   }
   ```

3. **Dynamic System Management**
   ```typescript
   private updateEditorSystems(): void {
     const hasEditorMaps = this.hasEditorComponents()

     if (hasEditorMaps && !this.editorSystemsActive) {
       this.activateEditorSystems()
     } else if (!hasEditorMaps && this.editorSystemsActive) {
       this.deactivateEditorSystems()
     }
   }
   ```

#### Acceptance Criteria
- ✅ Seamless integration with existing engine architecture
- ✅ No breaking changes to existing functionality
- ✅ Automatic system activation/deactivation
- ✅ Proper system priorities and execution order
- ✅ Clean cleanup on scene transitions

#### Implementation Notes
- Systems are only added when needed
- Proper cleanup prevents memory leaks
- System priorities ensure correct execution order
- Integration with existing scene lifecycle

## 🔗 Dependencies
- **Phase 1 Components**: MapEditorComponent, EditorToolComponent
- **Phase 1 RPC Types**: Extended RpcEngineType and RpcEngineParamMap
- **Existing Systems**: EditorInputSystem (extended in Phase 1)
- **Excalibur ECS**: World, Query, System APIs

## ✅ Definition of Done
- [x] MapEditorSystem created and functional
- [x] TileInteractionSystem created and functional
- [x] Scene integration completed
- [x] System activation/deactivation working
- [x] Performance monitoring implemented
- [ ] All acceptance criteria met
- [ ] Code reviewed and approved

## 📋 Testing Strategy
- **Unit Tests**: Individual system functionality, query performance
- **Integration Tests**: System interaction with components and entities
- **Performance Tests**: System overhead, query efficiency, memory usage
- **Scenario Tests**: Editor mode activation/deactivation workflows

## 🚀 Implementation Summary

### ✅ What Was Implemented

#### 2.1 MapEditorSystem
**File:** `packages/engine-excalibur/src/systems/map-editor.system.ts`

**Key Features:**
- **Type-Safe Architecture**: Complete TypeScript type safety with proper Query and Entity types
- **Central Coordination**: Main orchestrator between TileMaps, tools, and RPC communication
- **Query Management**: Efficient, type-safe queries for entities with editor components
- **State Synchronization**: Bidirectional communication with GJS host using typed RPC parameters
- **Performance Monitoring**: Built-in metrics tracking for system performance
- **RPC Integration**: Handles EDITOR_STATE_CHANGED events with proper parameter typing
- **Component Lifecycle**: Monitors component additions/removals with type safety

**Core Responsibilities Achieved:**
- ✅ Efficient query usage with proper caching
- ✅ Clean separation of responsibilities
- ✅ Performance monitoring and optimization
- ✅ Proper error handling and logging
- ✅ Integration with existing ECS world

#### 2.2 TileInteractionSystem
**File:** `packages/engine-excalibur/src/systems/tile-interaction.system.ts`

**Key Features:**
- **Type-Safe Interactions**: Complete TypeScript type safety for Entity and Component handling
- **Precise Coordinate Detection**: Screen-to-tile coordinate transformation using Excalibur Vector types
- **Tool-Based Actions**: Support for brush, eraser, and fill tools with proper type checking
- **Debounced Hover Events**: Performance-optimized hover detection with type-safe RPC notifications
- **Bounds Validation**: Ensures interactions are within map boundaries using typed coordinates
- **Visual Feedback**: Framework for hover state visualization with typed component access
- **RPC Notifications**: Sends TILE_CLICKED, TILE_HOVERED, TILE_PLACED events with proper parameter typing

**Features Achieved:**
- ✅ Precise tile coordinate detection from screen coordinates
- ✅ Smooth hover effects without performance impact
- ✅ Support for all planned tools (brush, eraser, fill)
- ✅ Proper bounds checking and error handling
- ✅ Integration with MapEditorComponent state

#### 2.3 Engine Integration
**File:** `packages/engine-excalibur/src/engine.ts`

**Integration Features:**
- **Automatic System Activation**: Systems activate when TileMaps with MapEditorComponent are detected
- **Dynamic System Management**: Systems are added/removed based on component presence
- **Scene Monitoring**: Continuous monitoring of active scenes for editor components
- **Clean Lifecycle Management**: Proper cleanup when scenes change
- **Status Reporting**: `getEditorSystemsStatus()` method for debugging

**Integration Achieved:**
- ✅ Seamless integration with existing engine architecture
- ✅ No breaking changes to existing functionality
- ✅ Automatic system activation/deactivation
- ✅ Proper system priorities and execution order
- ✅ Clean cleanup on scene transitions

### 🎯 Architecture Benefits Achieved

1. **Clean ECS Architecture**: Systems follow Excalibur ECS patterns with proper queries and lifecycle management
2. **Type-Safe Implementation**: Complete TypeScript type safety with proper Query<ComponentType>, Entity, and RPC parameter types
3. **Performance Optimization**: Debounced events, efficient queries, and performance monitoring
4. **Modular Design**: Clear separation between coordination (MapEditorSystem), interaction (TileInteractionSystem), and integration (Engine)
5. **Robust Error Handling**: Comprehensive error handling and logging throughout all systems
6. **Excalibur Integration**: Proper use of Excalibur Vector, Tile, and Component types for optimal performance

### 📊 Performance Metrics Achieved

- **Query Performance**: Efficient ECS queries with proper caching
- **System Overhead**: Lightweight systems with minimal performance impact
- **Memory Usage**: Proper cleanup and resource management
- **RPC Latency**: Optimized communication with host system
- **Event Processing**: Debounced hover events prevent performance issues

## 🎯 Next Steps
After completing Phase 2:
- Move to **[Phase 3: GJS Integration](phase-3-gjs-integration.md)**
- Host-side services will use the RPC communication established here
- UI components will integrate with the systems created in this phase
- Integration testing with GJS host can begin

## 📊 Key Metrics
- **Query Performance**: < 1ms for typical map sizes
- **System Overhead**: < 5% of total frame time
- **Memory Usage**: Minimal additional memory for editor mode
- **RPC Latency**: < 10ms for state synchronization

---
*Focus on clean ECS architecture and performance optimization. Systems should be lightweight and only activate when needed.*
