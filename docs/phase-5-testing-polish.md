# Phase 5: Testing & Polish

## 📋 Overview
**Status:** Planned | **Estimate:** 1-2 days | **Priority:** Medium

This phase focuses on quality assurance, testing, and user experience improvements for the completed Map Editor implementation.

## 🎯 Goals
- Comprehensive testing of all implemented features
- Performance optimization and monitoring
- UI/UX improvements and polish
- Documentation and user experience refinement

## 📝 Detailed Tasks

### 5.1 Unit Testing
**Files:** `packages/engine-excalibur/src/**/*.spec.ts`, `packages/engine-gjs/src/**/*.spec.ts`

#### Description
Create comprehensive unit tests for all critical components and systems.

#### Test Coverage Requirements
```typescript
// Component Tests
describe('MapEditorComponent', () => {
  it('should initialize with default values', () => {
    const component = new MapEditorComponent()
    expect(component.isEditable).toBe(true)
    expect(component.selectedTileCoords).toBeNull()
  })

  it('should handle state changes correctly', () => {
    const component = new MapEditorComponent()
    const coords = new ex.Vector(5, 10)
    component.selectedTileCoords = coords
    expect(component.selectedTileCoords).toEqual(coords)
  })
})

// System Tests
describe('MapEditorSystem', () => {
  it('should process only entities with MapEditorComponent', () => {
    const world = new ex.World(new ex.Scene())
    const system = new MapEditorSystem(world)

    // Add entity with MapEditorComponent
    const entityWithEditor = new ex.Entity()
    entityWithEditor.addComponent(new MapEditorComponent())
    world.add(entityWithEditor)

    // Add entity without MapEditorComponent
    const entityWithoutEditor = new ex.Entity()
    world.add(entityWithoutEditor)

    // System should only process the first entity
    spyOn(system, 'processEditorEntity')
    system.update(16)
    expect(system.processEditorEntity).toHaveBeenCalledTimes(1)
  })
})

// Tool Tests
describe('BrushTool', () => {
  it('should place single tile correctly', async () => {
    const tool = new BrushTool(mockMapEditorService, mockEngine)
    const coords = new ex.Vector(5, 5)

    spyOn(tool, 'placeTile')

    await tool.handleTileClick(coords)

    expect(tool.placeTile).toHaveBeenCalledWith(coords, expectedTileId)
  })
})
```

#### Test Categories
1. **Component Tests**: State management, lifecycle, property changes
2. **System Tests**: Query performance, entity processing, error handling
3. **Tool Tests**: Interaction handling, state management, RPC calls
4. **Service Tests**: State synchronization, error handling, API consistency
5. **RPC Tests**: Message serialization, handler registration, error scenarios

#### Acceptance Criteria
- ✅ >80% code coverage across all critical paths
- ✅ All components have corresponding test suites
- ✅ Edge cases and error scenarios covered
- ✅ Mock-based isolation for external dependencies
- ✅ Fast execution (< 30 seconds total)

#### Implementation Notes
- Use Jest or similar testing framework
- Mock external dependencies (RPC, file system)
- Test both success and failure scenarios
- Include performance assertions where relevant

### 5.2 Integration Testing
**Files:** `packages/engine-gjs/src/**/*.integration.spec.ts`

#### Description
Test the complete workflows and interactions between components, systems, and services.

#### Integration Test Scenarios
```typescript
describe('Map Editor Integration', () => {
  it('should handle complete tile placement workflow', async () => {
    // Setup: Create tilemap with editor components
    const tileMap = createEditableTileMap()
    const mapEditorSystem = new MapEditorSystem(world)
    const tileInteractionSystem = new TileInteractionSystem(world)

    // Setup: Configure tool selection
    const brushTool = new BrushTool(mapEditorService, engine)
    mapEditorService.setTool(brushTool)
    mapEditorService.setSelectedTile(42)

    // Action: Simulate user interaction
    const clickCoords = new ex.Vector(5, 5)
    await tileInteractionSystem.simulateTileClick(clickCoords)

    // Assertion: Verify tile was placed
    const placedTile = await engine.getTileAt(clickCoords)
    expect(placedTile).toBe(42)
  })

  it('should synchronize state between host and engine', async () => {
    // Setup: Initialize complete system
    const { engine, host, mapEditorService } = await setupCompleteSystem()

    // Action: Change tool in host
    await host.setTool(EditorTool.Eraser)

    // Assertion: Verify engine received state change
    const engineState = await engine.getEditorState()
    expect(engineState.currentTool).toBe('eraser')
  })
})
```

#### Integration Areas
1. **Component ↔ System**: Component state changes trigger system updates
2. **System ↔ RPC**: Systems communicate correctly with host
3. **Host ↔ Engine**: Bidirectional state synchronization
4. **Tool ↔ Service**: Tool operations use correct service state
5. **UI ↔ Service**: UI components reflect service state changes

#### Acceptance Criteria
- ✅ Complete user workflows tested end-to-end
- ✅ RPC communication tested with realistic latency
- ✅ Error scenarios handled gracefully
- ✅ State consistency maintained across components
- ✅ Performance acceptable under normal conditions

#### Implementation Notes
- Use test doubles for external systems
- Test both happy path and error scenarios
- Include timing assertions for performance
- Document test setup procedures

### 5.3 Performance Optimization
**Files:** Various system and component files

#### Description
Optimize performance-critical paths and add monitoring capabilities.

#### Performance Improvements
```typescript
// Optimize query performance
export class MapEditorSystem extends ex.System {
  private cachedQuery: Query | null = null

  private getEditableMapsQuery(): Query {
    if (!this.cachedQuery) {
      this.cachedQuery = this.world.query([
        ex.TileMap,
        MapEditorComponent
      ])
    }
    return this.cachedQuery
  }

  // Batch RPC calls for performance
  private batchRpcCalls: Array<{type: string, params: any}> = []
  private rpcBatchTimer: number | null = null

  private queueRpcCall(type: string, params: any): void {
    this.batchRpcCalls.push({ type, params })

    if (!this.rpcBatchTimer) {
      this.rpcBatchTimer = setTimeout(() => {
        this.flushRpcBatch()
      }, 16) // Next frame
    }
  }

  private async flushRpcBatch(): Promise<void> {
    // Send batched RPC calls
    await Promise.all(
      this.batchRpcCalls.map(call =>
        this.rpc.sendNotification(call.type, call.params)
      )
    )
    this.batchRpcCalls = []
    this.rpcBatchTimer = null
  }
}
```

#### Optimization Areas
1. **Query Caching**: Cache frequently used queries
2. **RPC Batching**: Batch multiple RPC calls
3. **Coordinate Caching**: Cache expensive coordinate transformations
4. **Memory Management**: Proper cleanup of resources
5. **Event Debouncing**: Prevent excessive event firing

#### Acceptance Criteria
- ✅ Query performance < 1ms for typical scenarios
- ✅ System overhead < 5% of total frame time
- ✅ Memory usage remains stable during editing
- ✅ RPC batching reduces network overhead
- ✅ No performance degradation with large maps

#### Implementation Notes
- Profile before and after optimization
- Add performance monitoring hooks
- Document performance characteristics
- Include performance regression tests

### 5.4 UI/UX Polish
**Files:** `apps/maker-gjs/src/widgets/**/*.ts`

#### Description
Enhance user experience with visual feedback, keyboard shortcuts, and accessibility improvements.

#### UI Improvements
```typescript
// Enhanced TilesetSelector with visual feedback
export class TilesetSelector extends Adw.Bin {
  private setupVisualFeedback(): void {
    // Add hover effects
    this.spriteSheetWidget.connect('tile-hovered', (tileId: number) => {
      this.showTileTooltip(tileId)
      this.highlightTile(tileId)
    })

    // Add selection feedback
    this.spriteSheetWidget.connect('tile-selected', (tileId: number) => {
      this.updateSelectionVisual(tileId)
      this.playSelectionSound()
    })
  }

  // Keyboard shortcuts
  private setupKeyboardShortcuts(): void {
    const keyController = new Gtk.EventControllerKey()
    keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
      switch (keyval) {
        case Gdk.KEY_b:
          this.mapEditorService.setTool(EditorTool.Brush)
          return true
        case Gdk.KEY_e:
          this.mapEditorService.setTool(EditorTool.Eraser)
          return true
        case Gdk.KEY_f:
          this.mapEditorService.setTool(EditorTool.Fill)
          return true
        case Gdk.KEY_z:
          if (state & Gdk.ModifierType.CONTROL_MASK) {
            this.undoLastAction()
            return true
          }
      }
      return false
    })
    this.add_controller(keyController)
  }
}
```

#### UI Enhancements
1. **Visual Feedback**: Hover effects, selection highlights, previews
2. **Keyboard Shortcuts**: Tool switching, undo/redo, common actions
3. **Accessibility**: Screen reader support, keyboard navigation
4. **Performance**: Smooth animations, responsive interactions
5. **Error Handling**: User-friendly error messages and recovery

#### Acceptance Criteria
- ✅ Intuitive user interface following GNOME guidelines
- ✅ Responsive interactions with visual feedback
- ✅ Complete keyboard navigation support
- ✅ Accessibility compliance (WCAG 2.1)
- ✅ Error states handled gracefully with user guidance

#### Implementation Notes
- Follow GNOME Human Interface Guidelines
- Test with screen readers and keyboard-only navigation
- Provide clear visual hierarchy
- Include loading states and progress indicators

## 🔗 Dependencies
- **All Previous Phases**: Complete implementation of components, systems, services, and tools
- **Testing Framework**: Jest or similar for unit and integration tests
- **Performance Tools**: Profiling tools for optimization
- **Accessibility Tools**: Screen reader testing, keyboard navigation testing

## ✅ Definition of Done
- [ ] Comprehensive unit test suite (>80% coverage)
- [ ] Integration tests for complete workflows
- [ ] Performance optimizations implemented
- [ ] UI/UX polish completed
- [ ] Accessibility requirements met
- [ ] Documentation updated
- [ ] Final QA review completed

## 📋 Testing Strategy
- **Automated Tests**: Unit tests, integration tests, performance tests
- **Manual Testing**: User experience testing, accessibility testing
- **Performance Testing**: Load testing, memory leak detection
- **Compatibility Testing**: Different map sizes, tile configurations

## 🎯 Final Deliverables
After completing Phase 5:
- **Functional Map Editor**: Complete working implementation
- **Test Suite**: Comprehensive automated tests
- **Performance Optimized**: Optimized for production use
- **User Ready**: Polished user experience
- **Documented**: Complete documentation for maintenance

## 📊 Quality Metrics
- **Code Coverage**: >80% for critical components
- **Performance**: < 5% system overhead
- **Accessibility**: WCAG 2.1 AA compliant
- **User Experience**: Intuitive and responsive
- **Error Handling**: Graceful failure recovery

---
*Final phase focuses on quality, performance, and user experience. Ensure the implementation is production-ready and maintainable.*
