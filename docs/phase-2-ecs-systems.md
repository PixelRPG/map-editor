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

  // Query for all editable TileMaps
  private editableMapsQuery = this.world.query([
    ex.TileMap,
    MapEditorComponent,
    EditorToolComponent
  ])

  // Query for maps with editor components only
  private editorMapsQuery = this.world.query([
    ex.TileMap,
    MapEditorComponent
  ])

  public update(elapsed: number): void {
    // Coordinate editor functionality
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

  // Query for interactive TileMaps
  private interactiveMapsQuery = this.world.query([
    ex.TileMap,
    MapEditorComponent
  ])

  public update(elapsed: number): void {
    // Handle tile interactions
  }

  private handleTileClick(tileMap: ex.TileMap, coords: ex.Vector): void {
    // Process tile click based on current tool
  }

  private handleTileHover(tileMap: ex.TileMap, coords: ex.Vector): void {
    // Update hover state and visual feedback
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
- [ ] MapEditorSystem created and functional
- [ ] TileInteractionSystem created and functional
- [ ] Scene integration completed
- [ ] System activation/deactivation working
- [ ] Performance monitoring implemented
- [ ] All acceptance criteria met
- [ ] Code reviewed and approved

## 📋 Testing Strategy
- **Unit Tests**: Individual system functionality, query performance
- **Integration Tests**: System interaction with components and entities
- **Performance Tests**: System overhead, query efficiency, memory usage
- **Scenario Tests**: Editor mode activation/deactivation workflows

## 🎯 Next Steps
After completing Phase 2:
- Move to **[Phase 3: GJS Integration](phase-3-gjs-integration.md)**
- Host-side services will use the RPC communication established here
- UI components will integrate with the systems created in this phase

## 📊 Key Metrics
- **Query Performance**: < 1ms for typical map sizes
- **System Overhead**: < 5% of total frame time
- **Memory Usage**: Minimal additional memory for editor mode
- **RPC Latency**: < 10ms for state synchronization

---
*Focus on clean ECS architecture and performance optimization. Systems should be lightweight and only activate when needed.*
