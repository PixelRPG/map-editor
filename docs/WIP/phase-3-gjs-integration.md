# Phase 3: Map Editor Service Architecture & Brush Tool Widget

## 📋 Overview
**Status:** Planned | **Estimate:** 3-4 days | **Priority:** High

This phase establishes the service architecture for map editing using Needle DI for clean dependency injection and creates a dedicated GTK widget for selection tools, focusing initially on the brush tool with single tile placement.

## 🎯 Goals
- Establish clean service architecture with Needle DI for dependency injection
- Create SelectionToolsWidget in `packages/ui-gjs` for brush tool controls
- Implement MapEditorService with centralized state management
- Create Story for SelectionToolsWidget using @storybook-guidelines.mdc
- Enable brush tool functionality with single tile placement
- Establish bidirectional RPC communication between host and client

## 📝 Detailed Tasks

### 3.1 Establish Service Architecture with Needle DI
**Files:**
- `packages/engine-gjs/src/services/map-editor.service.ts`
- `apps/maker-gjs/src/di/container.ts` (DI container at app level)
- `packages/engine-gjs/tsconfig.json`
- `packages/ui-gjs/tsconfig.json` (for SelectionToolsWidget)

#### Description
Create a clean service architecture using Needle DI that centralizes RPC handler management and provides proper dependency injection for WebView access. **Package-Separation**: Services remain in their packages, DI container is configured at app level. No experimental decorators or reflection polyfills needed.

#### Package-Separation Strategy

Since we have a Yarn Workspace with isolated packages, there are several approaches for DI across package boundaries:

**🎯 Recommended Solution: App-Level Container**
```typescript
// ✅ Best approach for our architecture
// apps/maker-gjs/src/di/container.ts
import { Container } from '@needle-di/core'
import { WebView, MapEditorService } from '@pixelrpg/engine-gjs'
import { TilesetSelector, LayerSelector } from '@pixelrpg/ui-gjs'

export const container = new Container()
// All services from different packages are registered here
```

**Alternative Options:**
- **Multiple Containers**: Each package has its own container (difficult to coordinate)
- **Service Locator**: Services injected via interfaces (less type-safe)
- **Factory Pattern**: Services created via factory functions (more boilerplate)

**Why App-Level Container?**
- ✅ Respects package isolation
- ✅ Type-safe across package boundaries
- ✅ Easy to test and maintain
- ✅ Clear separation between library and app code

#### TypeScript Configuration
```json
// packages/engine-gjs/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    // Note: No experimentalDecorators or emitDecoratorMetadata needed!
    // Needle DI uses modern ECMAScript decorators (Stage 3)
  }
}
```

#### DI Container Setup (App-Level)
```typescript
// apps/maker-gjs/src/di/container.ts
import { Container } from '@needle-di/core'
import { WebView, MapEditorService } from '@pixelrpg/engine-gjs'
import { TilesetSelector, LayerSelector, SelectionToolsWidget } from '@pixelrpg/ui-gjs'

// Create global container instance at app level
export const container = new Container()

// Register engine services (from engine-gjs package)
container.register(WebView, { useClass: WebView })
container.register(MapEditorService, { useClass: MapEditorService })

// Register UI services (from ui-gjs package)
container.register(TilesetSelector, { useClass: TilesetSelector })
container.register(LayerSelector, { useClass: LayerSelector })
container.register(SelectionToolsWidget, { useClass: SelectionToolsWidget })

// Export for use in application
export { Container }
```

#### Service Architecture with Needle DI
```typescript
// packages/engine-gjs/src/services/map-editor.service.ts
import { injectable, inject } from '@needle-di/core'
import { WebView } from '../widgets/webview'
import { TilesetSelector } from '../../ui-gjs/widgets/tileset-selector'
import { LayerSelector } from '../../ui-gjs/widgets/layer-selector'

@injectable()
export class MapEditorService {
  constructor(
    private webView = inject(WebView),
    private tilesetSelector = inject(TilesetSelector),
    private layerSelector = inject(LayerSelector)
  ) {
    this.setupRpcHandlers()
    this.setupUIConnections()
  }

  // Centralized RPC handler management
  private setupRpcHandlers(): void {
    const rpc = this.webView.rpc

    // Engine event handlers
    rpc.registerHandler(RpcEngineType.TILE_CLICKED, this.handleTileClicked.bind(this))
    rpc.registerHandler(RpcEngineType.TILE_HOVERED, this.handleTileHovered.bind(this))
    rpc.registerHandler(RpcEngineType.EDITOR_STATE_CHANGED, this.handleEditorStateChanged.bind(this))

    // Input event handlers (from existing WebView)
    rpc.registerHandler(RpcEngineType.HANDLE_INPUT_EVENT, this.handleInputEvent.bind(this))
  }

  // UI state management
  private setupUIConnections(): void {
    this.tilesetSelector.connect('tile-selected', this.onTileSelected.bind(this))
    this.layerSelector.connect('layer-selected', this.onLayerSelected.bind(this))
  }

  // Public API
  handleTileClicked(params: RpcEngineParamMap[RpcEngineType.TILE_CLICKED]): Promise<RpcResponse> {
    // Implementation...
  }
}

// Usage in application (apps/maker-gjs/src/main.ts)
import { container } from './di/container'

// Get service instance - dependencies automatically resolved!
const mapEditorService = container.get(MapEditorService)

// Services remain in their packages, container is in the app
// engine-gjs package: exports MapEditorService
// ui-gjs package: exports TilesetSelector, LayerSelector
// App: imports both and configures DI
```

#### Architecture Benefits
1. **Modern DI**: Uses ECMAScript Stage 3 decorators (no legacy experimentalDecorators)
2. **No Reflection Polyfill**: Needle DI has built-in reflection mechanism
3. **Package Separation**: Services remain in their packages, DI configured at app level
4. **Clean Dependency Injection**: WebView is injected, not accessed globally
5. **Centralized RPC Management**: All editor-related handlers in one place
6. **UI-Service Coupling**: Direct connections between UI and service across package boundaries
7. **Testability**: Services can be easily mocked for testing
8. **Maintainability**: Clear separation of concerns and package isolation
9. **GJS Compatible**: Works perfectly with GObject inheritance
10. **Workspace Friendly**: Respects Yarn Workspace package structure

#### Acceptance Criteria
- ✅ Needle DI setup with modern TypeScript configuration
- ✅ Dependency injection pattern implemented
- ✅ Centralized RPC handler management
- ✅ Clean service initialization
- ✅ Proper error handling and logging
- ✅ Type-safe interfaces throughout
- ✅ GObject compatibility maintained

### 3.2 Create SelectionToolsWidget
**File:** `packages/ui-gjs/src/widgets/selection-tools/selection-tools.widget.ts`

#### Description
Create a dedicated GTK widget for selection tools, starting with brush tool functionality.

#### Widget Structure
```typescript
export class SelectionToolsWidget extends Adw.Bin {
  // Internal children from template
  declare _brushToolButton: Gtk.ToggleButton
  declare _selectedTileImage: Gtk.Image
  declare _tileIdLabel: Gtk.Label

  constructor() {
    super()
    this.setupBrushTool()
  }

  private setupBrushTool(): void {
    // Connect brush tool button
    this._brushToolButton.connect('toggled', () => {
      if (this._brushToolButton.active) {
        this.emit('tool-selected', EditorTool.Brush)
      }
    })

    // Update selected tile display
    this.connect('tile-selected', (tileId: number, tileImage: Gdk.Texture) => {
      this._selectedTileImage.set_from_paintable(tileImage)
      this._tileIdLabel.set_label(`Tile ID: ${tileId}`)
    })
  }

  // Public API
  public setSelectedTile(tileId: number, texture: Gdk.Texture): void {
    this.emit('tile-selected', tileId, texture)
  }

  public setActiveTool(tool: EditorTool): void {
    this._brushToolButton.active = (tool === EditorTool.Brush)
  }
}

// Signals
SelectionToolsWidget.signals = {
  'tool-selected': { param_types: [GObject.TYPE_STRING] },
  'tile-selected': { param_types: [GObject.TYPE_INT, Gdk.Texture.$gtype] }
}
```

#### Widget Features
1. **Brush Tool Button**: Toggle button for brush tool selection
2. **Selected Tile Display**: Visual feedback for currently selected tile
3. **Tile ID Display**: Text feedback showing selected tile ID
4. **Signal Emission**: Proper GTK signal emission for state changes

#### Acceptance Criteria
- ✅ Follows GTK/GJS best practices
- ✅ Proper signal definitions and emission
- ✅ Clean Blueprint template integration
- ✅ Type-safe implementation
- ✅ Accessible UI elements

### 3.3 Create SelectionToolsWidget Story
**File:** `packages/ui-gjs/src/widgets/selection-tools/selection-tools.widget.story.ts`

#### Description
Create a comprehensive Story for the SelectionToolsWidget following @storybook-guidelines.mdc.

#### Story Implementation
```typescript
export class SelectionToolsWidgetStory extends StoryWidget {
  declare _selectionToolsWidget: SelectionToolsWidget

  static getMetadata(): StoryMeta {
    return {
      title: 'UI/Selection Tools',
      description: 'Interactive selection tools widget for map editor with brush tool',
      component: SelectionToolsWidget.$gtype,
      tags: ['autodocs', 'ui'],
      controls: [
        {
          name: 'selectedTileId',
          label: 'Selected Tile ID',
          type: ControlType.RANGE,
          min: 0,
          max: 100,
          defaultValue: 42,
          description: 'ID of the currently selected tile'
        },
        {
          name: 'activeTool',
          label: 'Active Tool',
          type: ControlType.SELECT,
          options: [
            { label: 'None', value: null },
            { label: 'Brush', value: EditorTool.Brush }
          ],
          defaultValue: EditorTool.Brush,
          description: 'Currently active editing tool'
        }
      ]
    }
  }

  initialize(): void {
    // Create widget instance
    this._selectionToolsWidget = new SelectionToolsWidget()

    // Connect to widget signals for testing
    this._selectionToolsWidget.connect('tool-selected', (tool: EditorTool) => {
      console.log('Tool selected:', tool)
    })

    this._selectionToolsWidget.connect('tile-selected', (tileId: number) => {
      console.log('Tile selected:', tileId)
    })

    // Add to container
    this.add_child(this._selectionToolsWidget)
  }

  updateArgs(args: Record<string, any>): void {
    if (args.selectedTileId !== undefined) {
      // Simulate tile selection with mock texture
      const mockTexture = this.createMockTileTexture(args.selectedTileId)
      this._selectionToolsWidget.setSelectedTile(args.selectedTileId, mockTexture)
    }

    if (args.activeTool !== undefined) {
      this._selectionToolsWidget.setActiveTool(args.activeTool)
    }
  }
}
```

#### Story Features
1. **Interactive Controls**: Range control for tile ID selection
2. **Tool Selection**: Select control for active tool
3. **Signal Testing**: Console logging for emitted signals
4. **Mock Data**: Realistic tile texture simulation
5. **State Management**: Proper state updates via controls

#### Acceptance Criteria
- ✅ Follows @storybook-guidelines.mdc completely
- ✅ Comprehensive controls for all widget features
- ✅ Proper signal handling and logging
- ✅ Realistic mock data for testing
- ✅ Clean Blueprint template
- ✅ Type-safe implementation

### 3.4 Implement Brush Tool Logic
**File:** `packages/engine-gjs/src/services/map-editor.service.ts`

#### Description
Implement the core brush tool functionality within the MapEditorService.

#### Brush Tool Implementation
```typescript
export class MapEditorService {
  private selectedTileId: number | null = null
  private selectedLayerId: string | null = null

  // Handle tile click from engine
  private async handleTileClicked(params: RpcEngineParamMap[RpcEngineType.TILE_CLICKED]): Promise<RpcResponse> {
    if (!this.selectedTileId) {
      return { success: false, error: 'No tile selected' }
    }

    if (!this.selectedLayerId) {
      return { success: false, error: 'No layer selected' }
    }

    try {
      // Send tile placement request to engine
      await this.webView.rpc.sendRequest(RpcEngineType.TILE_PLACED, {
        coords: params.coords,
        tileId: this.selectedTileId,
        layerId: this.selectedLayerId
      })

      return { success: true }
    } catch (error) {
      console.error('[MapEditorService] Failed to place tile:', error)
      return { success: false, error: 'Failed to place tile' }
    }
  }

  // Handle tile hover for preview
  private async handleTileHovered(params: RpcEngineParamMap[RpcEngineType.TILE_HOVERED]): Promise<RpcResponse> {
    // Update UI with hover state
    this.emit('tile-hovered', params.coords)
    return { success: true }
  }

  // Public API for UI components
  public setSelectedTile(tileId: number): void {
    this.selectedTileId = tileId
    this.notifyEngineOfStateChange()
  }

  public setSelectedLayer(layerId: string): void {
    this.selectedLayerId = layerId
    this.notifyEngineOfStateChange()
  }

  // Notify engine of state changes
  private async notifyEngineOfStateChange(): void {
    try {
      await this.webView.rpc.sendNotification(RpcEngineType.EDITOR_STATE_CHANGED, {
        selectedTileId: this.selectedTileId,
        selectedLayerId: this.selectedLayerId
      })
    } catch (error) {
      console.error('[MapEditorService] Failed to notify engine of state change:', error)
    }
  }
}
```

#### Brush Tool Features
1. **Single Tile Placement**: Place selected tile at clicked coordinates
2. **State Validation**: Ensure tile and layer are selected before placement
3. **Error Handling**: Comprehensive error handling for RPC failures
4. **State Synchronization**: Notify engine of selection changes
5. **Hover Preview**: Handle hover events for visual feedback

#### Acceptance Criteria
- ✅ Single tile placement working correctly
- ✅ Proper state validation before operations
- ✅ Error handling for all failure scenarios
- ✅ Bidirectional state synchronization
- ✅ Hover preview functionality

## 🔗 Dependencies
- **Phase 1 Components**: MapEditorComponent, EditorToolComponent
- **Phase 1 RPC Types**: Extended RpcEngineType definitions
- **Phase 2 Systems**: MapEditorSystem, TileInteractionSystem
- **Existing UI Components**: TilesetSelector, LayerSelector, MapEditorPanel (from `ui-gjs` package)
- **Existing Story Infrastructure**: StoryWidget, StoryMeta, ControlType
- **Existing GJS Infrastructure**: WebView, RPC communication (from `engine-gjs` package)
- **Needle DI**: `@needle-di/core` package for cross-package dependency injection
- **App-Level Setup**: DI container in `apps/maker-gjs` for cross-package services

## ✅ Definition of Done
- [ ] MapEditorService with clean dependency injection implemented
- [ ] SelectionToolsWidget created in `packages/ui-gjs` with brush tool functionality
- [ ] Comprehensive Story created following @storybook-guidelines.mdc
- [ ] Brush tool single tile placement working end-to-end
- [ ] Bidirectional RPC communication established
- [ ] Service architecture properly tested via Story
- [ ] All acceptance criteria met

## 📋 Testing Strategy
- **Story-Based Testing**: Use SelectionToolsWidget Story for interactive testing
- **Service Testing**: Test MapEditorService with mocked WebView dependencies
- **Integration Testing**: End-to-end brush tool functionality
- **RPC Testing**: Verify bidirectional communication works correctly
- **UI Testing**: Test widget responsiveness and signal emission
- **Error Testing**: Network failures, invalid states, edge cases

## 🎯 Next Steps
After completing Phase 3:
- Move to **[Phase 4: Extended Tool System](phase-4-tool-system.md)**
- Add eraser and fill tools to SelectionToolsWidget
- Extend MapEditorService for additional tool types
- Create Stories for each tool variant
- Expand RPC communication for advanced tool features

## 📊 Key Metrics
- **Story Load Time**: < 2 seconds for SelectionToolsWidget Story
- **RPC Latency**: < 50ms for tile placement operations
- **UI Responsiveness**: < 100ms for state updates
- **Brush Tool Accuracy**: 100% correct tile placement
- **Error Rate**: < 1% for RPC communications

---
*Establish solid foundation with service architecture and brush tool. Focus on clean code and comprehensive Story testing before expanding to other tools.*
