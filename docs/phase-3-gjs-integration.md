# Phase 3: GJS Host Integration

## 📋 Overview
**Status:** Planned | **Estimate:** 2-3 days | **Priority:** High

This phase implements the GJS host-side services and RPC handlers that manage editor state and coordinate with the Excalibur engine.

## 🎯 Goals
- Create MapEditorService for centralized state management
- Implement RPC handlers for engine communication
- Prepare UI integration for tool and layer selection
- Enable bidirectional state synchronization

## 📝 Detailed Tasks

### 3.1 Create MapEditorService
**File:** `packages/engine-gjs/src/services/map-editor.service.ts`

#### Description
Central service in the GJS host that manages all editor state and coordinates communication with the Excalibur engine.

#### Service Architecture
```typescript
export class MapEditorService {
  // Current editor state
  private currentTool: EditorTool = EditorTool.Brush
  private selectedTile: TileInfo | null = null
  private selectedLayer: LayerInfo | null = null

  // Engine communication
  private engine: Engine

  constructor(engine: Engine) {
    this.engine = engine
    this.setupRpcHandlers()
  }

  // Public API for UI components
  public setTool(tool: EditorTool): void {
    this.currentTool = tool
    this.notifyEngineOfStateChange()
  }

  public setSelectedTile(tileId: number): void {
    this.selectedTile = { id: tileId }
    this.notifyEngineOfStateChange()
  }
}
```

#### Core Responsibilities
1. **State Management**: Central storage for editor state
2. **Tool Coordination**: Manage tool selection and configuration
3. **RPC Communication**: Handle bidirectional communication
4. **UI Synchronization**: Keep UI components in sync
5. **Error Handling**: Robust error handling for RPC failures

#### Acceptance Criteria
- ✅ Type-safe interfaces for all public methods
- ✅ Reactive state updates with proper change detection
- ✅ Error-resilient RPC communication
- ✅ Clean separation between UI and engine logic
- ✅ Observable state for UI reactivity

#### Implementation Notes
- Service follows singleton pattern for global access
- State changes trigger immediate RPC notifications
- Proper cleanup on service destruction
- Integration with existing GJS architecture

### 3.2 Implement RPC Handlers
**File:** `packages/engine-gjs/src/widgets/webview.ts`

#### Description
Extend the existing WebView RPC handlers to support editor-specific communication with the Excalibur engine.

#### New RPC Handlers
```typescript
// Extend existing WebView class
export class WebView extends WebKit.WebView {
  private mapEditorService: MapEditorService

  private setupEditorRpcHandlers(): void {
    // Handle tile click events from engine
    this.rpc.registerHandler(RpcEngineType.TILE_CLICKED, (params) => {
      return this.mapEditorService.handleTileClicked(params)
    })

    // Handle tile hover events from engine
    this.rpc.registerHandler(RpcEngineType.TILE_HOVERED, (params) => {
      return this.mapEditorService.handleTileHovered(params)
    })

    // Handle editor state changes from engine
    this.rpc.registerHandler(RpcEngineType.EDITOR_STATE_CHANGED, (params) => {
      return this.mapEditorService.handleEditorStateChanged(params)
    })
  }

  // Send commands to engine
  public async notifyEngineOfTilePlacement(coords: ex.Vector, tileId: number): Promise<void> {
    await this.rpc.sendRequest(RpcEngineType.TILE_PLACED, {
      coords,
      tileId,
      layerId: this.mapEditorService.getSelectedLayer()
    })
  }
}
```

#### Handler Implementation
1. **TILE_CLICKED Handler**: Process tile clicks and route to appropriate tool
2. **TILE_HOVERED Handler**: Update UI hover states
3. **EDITOR_STATE_CHANGED Handler**: Synchronize engine state with host

#### Acceptance Criteria
- ✅ Consistent with existing RPC handler patterns
- ✅ Comprehensive error handling for all scenarios
- ✅ Performance optimized for frequent events
- ✅ Proper async/await handling
- ✅ Type-safe parameter validation

#### Implementation Notes
- Handlers are registered during WebView initialization
- Error handling prevents RPC communication failures
- Debouncing for high-frequency events (hover)
- Clean integration with existing RPC infrastructure

### 3.3 Prepare UI Integration
**File:** `apps/maker-gjs/src/widgets/sidebar.ts`

#### Description
Prepare the UI components for integration with the MapEditorService and editor state management.

#### Integration Points
```typescript
export class Sidebar extends Adw.Bin {
  private mapEditorService: MapEditorService

  private setupEditorIntegration(): void {
    // Connect TilesetSelector to service
    this.tilesetSelector.connect('tile-selected', (tileId: number) => {
      this.mapEditorService.setSelectedTile(tileId)
    })

    // Connect LayerSelector to service
    this.layerSelector.connect('layer-selected', (layerId: string) => {
      this.mapEditorService.setSelectedLayer(layerId)
    })

    // Connect ToolSelector to service
    this.toolSelector.connect('tool-selected', (tool: EditorTool) => {
      this.mapEditorService.setTool(tool)
    })
  }

  // Update UI based on service state
  private updateUIFromService(): void {
    const state = this.mapEditorService.getCurrentState()
    this.tilesetSelector.setSelectedTile(state.selectedTile)
    this.layerSelector.setSelectedLayer(state.selectedLayer)
    this.toolSelector.setSelectedTool(state.currentTool)
  }
}
```

#### UI Components Integration
1. **TilesetSelector**: Display available tiles and handle selection
2. **LayerSelector**: Show map layers and handle layer selection
3. **ToolSelector**: Provide tool selection interface

#### Acceptance Criteria
- ✅ Intuitive user interface following GNOME guidelines
- ✅ Reactive UI updates based on service state
- ✅ Consistent state management across components
- ✅ Proper error handling and user feedback
- ✅ Accessibility support

#### Implementation Notes
- UI components observe service state changes
- Changes are immediately reflected in all components
- Proper GTK signal handling
- Clean separation between UI and business logic

## 🔗 Dependencies
- **Phase 1 Components**: MapEditorComponent, EditorToolComponent
- **Phase 1 RPC Types**: Extended RpcEngineType definitions
- **Phase 2 Systems**: MapEditorSystem, TileInteractionSystem
- **Existing GJS Infrastructure**: WebView, RPC communication

## ✅ Definition of Done
- [ ] MapEditorService created and functional
- [ ] RPC handlers implemented and tested
- [ ] UI integration prepared and functional
- [ ] Bidirectional communication working
- [ ] Error handling implemented
- [ ] All acceptance criteria met

## 📋 Testing Strategy
- **Unit Tests**: Service methods, RPC handler logic
- **Integration Tests**: Service ↔ UI communication, RPC round-trips
- **UI Tests**: Component integration, state synchronization
- **Error Tests**: Network failures, invalid states, edge cases

## 🎯 Next Steps
After completing Phase 3:
- Move to **[Phase 4: Tool System](phase-4-tool-system.md)**
- Tool implementations will use the infrastructure created here
- UI components are ready for tool integration

## 📊 Key Metrics
- **RPC Latency**: < 50ms for state synchronization
- **UI Responsiveness**: < 100ms for state updates
- **Memory Usage**: Minimal service overhead
- **Error Rate**: < 1% for RPC communications

---
*Focus on robust communication and clean service architecture. The foundation created here will support all future editor functionality.*
