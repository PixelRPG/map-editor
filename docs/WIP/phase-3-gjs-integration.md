# Phase 3: GJS Integration

## 📋 Overview
**Status:** Not Started | **Estimate:** 2-3 hours | **Priority:** High

This phase creates the service layer to connect the GJS UI with the Excalibur engine for tile replacement functionality.

## 🎯 Goals
- Create MapEditorService for state coordination
- Connect existing TilesetSelector to service
- Add tool selection UI (Brush/Eraser)
- Establish bidirectional RPC communication

## 📝 Implementation Tasks

### 3.1 Create MapEditorService (1 hour)
**File:** `packages/engine-gjs/src/services/map-editor.service.ts`

#### Service Implementation
```typescript
import { WebView } from '../widgets/webview'
import { RpcEngineType } from '@pixelrpg/engine-core'

export class MapEditorService {
  private selectedTileId: number = 1
  private currentTool: 'brush' | 'eraser' = 'brush'
  private selectedLayerId: string = 'default'
  
  constructor(private webView: WebView) {
    this.setupRpcHandlers()
  }
  
  private setupRpcHandlers(): void {
    const rpc = this.webView.rpc
    
    // Listen for clicks from engine
    rpc.registerHandler(RpcEngineType.TILE_CLICKED, async (params) => {
      console.log('[MapEditorService] Tile clicked at:', params.coords)
      return { success: true }
    })
    
    // Listen for successful placements
    rpc.registerHandler(RpcEngineType.TILE_PLACED, async (params) => {
      console.log('[MapEditorService] Tile placed:', params)
      return { success: true }
    })
  }
  
  // Called when user selects a tile from UI
  public async selectTile(tileId: number): Promise<void> {
    this.selectedTileId = tileId
    await this.updateEngineState()
  }
  
  // Called when user switches tools
  public async setTool(tool: 'brush' | 'eraser'): Promise<void> {
    this.currentTool = tool
    await this.updateEngineState()
  }
  
  // Send current state to engine
  private async updateEngineState(): Promise<void> {
    try {
      await this.webView.rpc.sendNotification(RpcEngineType.EDITOR_STATE_CHANGED, {
        tool: this.currentTool,
        tileId: this.selectedTileId,
        layerId: this.selectedLayerId
      })
      console.log('[MapEditorService] State updated in engine')
    } catch (error) {
      console.error('[MapEditorService] Failed to update engine state:', error)
    }
  }
}
```

#### Acceptance Criteria
- Service instantiates without errors
- RPC handlers registered successfully
- State updates trigger engine notifications
- Error handling for RPC failures

### 3.2 Create Tool Selector Widget (30 minutes)
**File:** `packages/ui-gjs/src/widgets/map-editor/tool-selector.ts`

#### Widget Implementation
```typescript
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

export class ToolSelector extends Gtk.Box {
  static {
    GObject.registerClass(
      {
        GTypeName: 'ToolSelector',
        Signals: {
          'tool-changed': {
            param_types: [GObject.TYPE_STRING]
          }
        }
      },
      this
    )
  }
  
  private brushButton: Gtk.ToggleButton
  private eraserButton: Gtk.ToggleButton
  
  constructor() {
    super({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      margin_top: 6,
      margin_bottom: 6
    })
    
    // Create buttons
    this.brushButton = new Gtk.ToggleButton({
      label: '🖌️ Brush',
      active: true
    })
    
    this.eraserButton = new Gtk.ToggleButton({
      label: '🧹 Eraser'
    })
    
    // Make them exclusive
    this.brushButton.connect('toggled', () => {
      if (this.brushButton.active) {
        this.eraserButton.active = false
        this.emit('tool-changed', 'brush')
      }
    })
    
    this.eraserButton.connect('toggled', () => {
      if (this.eraserButton.active) {
        this.brushButton.active = false
        this.emit('tool-changed', 'eraser')
      }
    })
    
    // Add to box
    this.append(this.brushButton)
    this.append(this.eraserButton)
  }
}
```

#### Acceptance Criteria
- Widget displays two tool buttons
- Only one tool can be active at a time
- Emits 'tool-changed' signal on selection
- Integrates with GTK theme

### 3.3 Wire Components Together (1 hour)
**Location:** Main application or MapEditorPanel

#### Integration Code
```typescript
import { MapEditorService } from '@pixelrpg/engine-gjs'
import { ToolSelector } from '@pixelrpg/ui-gjs'

// During initialization:
const mapEditorService = new MapEditorService(this.webView)
const toolSelector = new ToolSelector()

// Connect TilesetSelector (already exists)
this.tilesetSelector.connect('tile-selected', (_widget, tileId) => {
  mapEditorService.selectTile(tileId)
})

// Connect ToolSelector
toolSelector.connect('tool-changed', (_widget, tool) => {
  mapEditorService.setTool(tool)
})

// Add toolSelector to UI (e.g., to MapEditorPanel)
this.mapEditorPanel.add(toolSelector)
```

#### Acceptance Criteria
- All components connect without errors
- Tile selection updates service state
- Tool changes update service state
- UI remains responsive

### 3.4 Test Integration (30 minutes)

#### Test Checklist
- [ ] Service instantiates without errors
- [ ] TilesetSelector tile selection triggers service update
- [ ] Tool buttons switch between brush and eraser
- [ ] RPC messages are sent to engine (check console)
- [ ] Engine receives state updates (check engine console)
- [ ] No errors in GJS or browser console

## 🔗 Dependencies
- WebView with RPC (already exists)
- TilesetSelector widget (already exists)
- RPC types (already defined)
- Phase 1 & 2 components and systems

## ✅ Definition of Done
- [ ] MapEditorService created and connects to WebView
- [ ] ToolSelector widget created with brush/eraser buttons
- [ ] TilesetSelector connected to service
- [ ] Tool selection updates engine state via RPC
- [ ] Console logs confirm state synchronization
- [ ] Ready for tile replacement testing

## 📊 Success Metrics
- **Implementation time:** < 3 hours
- **Code complexity:** Minimal
- **Dependencies added:** None
- **Test coverage:** Manual testing sufficient for MVP

---

*This phase establishes the critical connection between UI and engine. Keep implementation simple and focused on functionality.*