# Phase 4: Extended Tool System

## 📋 Overview
**Status:** Planned | **Estimate:** 3-4 days | **Priority:** Medium

This phase extends the SelectionToolsWidget to include eraser and fill tools, completing the basic tool set for map editing.

## 🎯 Goals
- Extend SelectionToolsWidget with eraser and fill tool buttons
- Implement eraser tool functionality in MapEditorService
- Implement fill tool functionality in MapEditorService
- Create Stories for eraser and fill tool variants
- Maintain clean service architecture and proper RPC communication

## 📝 Detailed Tasks

### 4.1 Extend SelectionToolsWidget
**File:** `packages/ui-gjs/src/widgets/selection-tools/selection-tools.widget.ts`

#### Description
Extend the SelectionToolsWidget to include eraser and fill tool buttons alongside the existing brush tool.

#### Extended Widget Structure
```typescript
export class SelectionToolsWidget extends Adw.Bin {
  // Internal children from template (extended)
  declare _brushToolButton: Gtk.ToggleButton
  declare _eraserToolButton: Gtk.ToggleButton
  declare _fillToolButton: Gtk.ToggleButton
  declare _selectedTileImage: Gtk.Image
  declare _tileIdLabel: Gtk.Label
  declare _toolOptionsBox: Gtk.Box

  private currentTool: EditorTool = EditorTool.Brush

  constructor() {
    super()
    this.setupAllTools()
  }

  private setupAllTools(): void {
    // Setup brush tool
    this._brushToolButton.connect('toggled', () => {
      if (this._brushToolButton.active) {
        this.setActiveTool(EditorTool.Brush)
      }
    })

    // Setup eraser tool
    this._eraserToolButton.connect('toggled', () => {
      if (this._eraserToolButton.active) {
        this.setActiveTool(EditorTool.Eraser)
      }
    })

    // Setup fill tool
    this._fillToolButton.connect('toggled', () => {
      if (this._fillToolButton.active) {
        this.setActiveTool(EditorTool.Fill)
      }
    })

    // Tool-specific options
    this.updateToolOptions()
  }

  private setActiveTool(tool: EditorTool): void {
    this.currentTool = tool

    // Update button states
    this._brushToolButton.active = (tool === EditorTool.Brush)
    this._eraserToolButton.active = (tool === EditorTool.Eraser)
    this._fillToolButton.active = (tool === EditorTool.Fill)

    // Update options UI
    this.updateToolOptions()

    // Emit signal
    this.emit('tool-selected', tool)
  }

  private updateToolOptions(): void {
    // Clear existing options
    const children = this._toolOptionsBox.observe_children()
    for (let i = children.get_n_items() - 1; i >= 0; i--) {
      this._toolOptionsBox.remove(children.get_item(i) as Gtk.Widget)
    }

    // Add tool-specific options
    switch (this.currentTool) {
      case EditorTool.Brush:
        this.addBrushOptions()
        break
      case EditorTool.Eraser:
        this.addEraserOptions()
        break
      case EditorTool.Fill:
        this.addFillOptions()
        break
    }
  }

  private addBrushOptions(): void {
    // Brush size selector
    const sizeLabel = new Gtk.Label({ label: 'Size:' })
    const sizeSpin = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1, upper: 10, step_increment: 1, value: 1
      })
    })

    this._toolOptionsBox.append(sizeLabel)
    this._toolOptionsBox.append(sizeSpin)

    sizeSpin.connect('value-changed', () => {
      this.emit('brush-size-changed', sizeSpin.value)
    })
  }

  private addEraserOptions(): void {
    // Eraser size selector (similar to brush)
    const sizeLabel = new Gtk.Label({ label: 'Size:' })
    const sizeSpin = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1, upper: 10, step_increment: 1, value: 1
      })
    })

    this._toolOptionsBox.append(sizeLabel)
    this._toolOptionsBox.append(sizeSpin)

    sizeSpin.connect('value-changed', () => {
      this.emit('eraser-size-changed', sizeSpin.value)
    })
  }

  private addFillOptions(): void {
    // Fill tolerance selector
    const toleranceLabel = new Gtk.Label({ label: 'Tolerance:' })
    const toleranceScale = new Gtk.Scale({
      orientation: Gtk.Orientation.HORIZONTAL,
      adjustment: new Gtk.Adjustment({
        lower: 0, upper: 100, step_increment: 1, value: 0
      })
    })

    this._toolOptionsBox.append(toleranceLabel)
    this._toolOptionsBox.append(toleranceScale)

    toleranceScale.connect('value-changed', () => {
      this.emit('fill-tolerance-changed', toleranceScale.adjustment.value)
    })
  }
}
```

#### Widget Extensions
1. **Multiple Tool Buttons**: Brush, eraser, and fill tool toggle buttons
2. **Tool State Management**: Exclusive tool selection with proper button states
3. **Dynamic Options**: Tool-specific configuration options
4. **Signal Extensions**: Additional signals for tool configuration changes

#### Acceptance Criteria
- ✅ All three tools available as toggle buttons
- ✅ Exclusive tool selection (only one active at a time)
- ✅ Tool-specific options displayed dynamically
- ✅ Proper GTK signal emission for all interactions
- ✅ Clean Blueprint template with proper accessibility

### 4.2 Implement Eraser Tool Logic
**File:** `packages/engine-gjs/src/services/map-editor.service.ts`

#### Description
Extend MapEditorService to handle eraser tool operations.

#### Eraser Tool Implementation
```typescript
export class MapEditorService {
  private eraserSize: number = 1

  // Handle eraser tool tile click
  private async handleTileClickedEraser(params: RpcEngineParamMap[RpcEngineType.TILE_CLICKED]): Promise<RpcResponse> {
    if (!this.selectedLayerId) {
      return { success: false, error: 'No layer selected' }
    }

    try {
    if (this.eraserSize === 1) {
      // Single tile erasure
        await this.webView.rpc.sendRequest(RpcEngineType.TILE_PLACED, {
          coords: params.coords,
          tileId: 0, // Empty tile
          layerId: this.selectedLayerId
        })
    } else {
      // Area erasure
        await this.eraseTileArea(params.coords, this.eraserSize)
      }

      return { success: true }
    } catch (error) {
      console.error('[MapEditorService] Failed to erase tile:', error)
      return { success: false, error: 'Failed to erase tile' }
    }
  }

  private async eraseTileArea(center: ex.Vector, size: number): Promise<void> {
    const halfSize = Math.floor(size / 2)
    const erasures: Array<{coords: ex.Vector, tileId: number}> = []

    for (let x = -halfSize; x <= halfSize; x++) {
      for (let y = -halfSize; y <= halfSize; y++) {
        erasures.push({
          coords: center.add(new ex.Vector(x, y)),
          tileId: 0 // Empty tile
        })
      }
    }

    // Batch erase tiles
    await this.webView.rpc.sendRequest(RpcEngineType.BATCH_TILE_PLACEMENT, {
      placements: erasures,
      layerId: this.selectedLayerId
    })
  }

  // Public API for tool configuration
  public setEraserSize(size: number): void {
    this.eraserSize = Math.max(1, Math.min(10, size))
    this.notifyEngineOfStateChange()
  }
}
```

#### Eraser Features
1. **Single/Area Erasure**: Configurable eraser size
2. **Batch Operations**: Efficient multi-tile erasure
3. **Size Validation**: Proper bounds checking for eraser size
4. **Empty Tile Handling**: Consistent use of tile ID 0 for empty tiles

#### Acceptance Criteria
- ✅ Single tile erasure working correctly
- ✅ Area erasure with configurable size
- ✅ Batch operations for performance
- ✅ Proper error handling and validation

### 4.3 Implement Fill Tool Logic
**File:** `packages/engine-gjs/src/services/map-editor.service.ts`

#### Description
Extend MapEditorService to handle fill tool operations with flood fill algorithm.

#### Fill Tool Implementation
```typescript
export class MapEditorService {
  private fillTolerance: number = 0

  // Handle fill tool tile click
  private async handleTileClickedFill(params: RpcEngineParamMap[RpcEngineType.TILE_CLICKED]): Promise<RpcResponse> {
    if (!this.selectedTileId) {
      return { success: false, error: 'No tile selected' }
    }

    if (!this.selectedLayerId) {
      return { success: false, error: 'No layer selected' }
    }

    try {
      // Get the tile at click position from engine
      const tileAtPosition = await this.webView.rpc.sendRequest(RpcEngineType.GET_TILE_AT, {
        coords: params.coords,
        layerId: this.selectedLayerId
      })

      if (!tileAtPosition.success) {
        return { success: false, error: 'Failed to get tile at position' }
      }

      const currentTileId = tileAtPosition.data.tileId

      // Don't fill if same tile
      if (currentTileId === this.selectedTileId) {
        return { success: false, error: 'Tile is already the selected tile' }
      }

      // Calculate fill area
      const fillArea = await this.calculateFillArea(params.coords, currentTileId, this.fillTolerance)

      if (fillArea.length === 0) {
        return { success: false, error: 'No area to fill' }
      }

      // Perform fill
      await this.performFill(fillArea, this.selectedTileId)

      return { success: true, data: { filledTiles: fillArea.length } }
    } catch (error) {
      console.error('[MapEditorService] Failed to perform fill:', error)
      return { success: false, error: 'Failed to perform fill operation' }
    }
  }

  private async calculateFillArea(
    startCoords: ex.Vector,
    targetTileId: number,
    tolerance: number
  ): Promise<ex.Vector[]> {
    const visited = new Set<string>()
    const queue: ex.Vector[] = [startCoords]
    const fillArea: ex.Vector[] = []

    while (queue.length > 0 && fillArea.length < 10000) { // Prevent infinite loops
      const current = queue.shift()!
      const key = `${current.x},${current.y}`

      if (visited.has(key)) continue
      visited.add(key)

      // Get tile at current position
      try {
        const tileResponse = await this.webView.rpc.sendRequest(RpcEngineType.GET_TILE_AT, {
          coords: current,
          layerId: this.selectedLayerId
        })

        if (!tileResponse.success) continue

        const currentTileId = tileResponse.data.tileId

      // Check if tile matches within tolerance
      if (this.tileMatches(currentTileId, targetTileId, tolerance)) {
        fillArea.push(current)

          // Add adjacent tiles (4-way connectivity)
          const adjacent = [
          current.add(ex.Vector.Up),
          current.add(ex.Vector.Down),
          current.add(ex.Vector.Left),
          current.add(ex.Vector.Right)
          ]

          queue.push(...adjacent)
        }
      } catch (error) {
        // Skip invalid positions
        continue
      }
    }

    return fillArea
  }

  private tileMatches(tileId: number, targetTileId: number, tolerance: number): boolean {
    if (tolerance === 0) {
      return tileId === targetTileId
    }

    // Simple tolerance check (can be extended for more complex matching)
    return Math.abs(tileId - targetTileId) <= tolerance
  }

  private async performFill(fillArea: ex.Vector[], tileId: number): Promise<void> {
    const placements = fillArea.map(coords => ({
      coords,
      tileId
    }))

    // Batch fill operation
    await this.webView.rpc.sendRequest(RpcEngineType.BATCH_TILE_PLACEMENT, {
      placements,
      layerId: this.selectedLayerId
    })
  }

  // Public API for tool configuration
  public setFillTolerance(tolerance: number): void {
    this.fillTolerance = Math.max(0, Math.min(100, tolerance))
    this.notifyEngineOfStateChange()
  }
}
```

#### Fill Tool Features
1. **Flood Fill Algorithm**: Efficient area detection with bounds checking
2. **Tolerance Support**: Configurable similarity tolerance for filling
3. **Performance Protection**: Maximum area limits to prevent performance issues
4. **Batch Operations**: Efficient multi-tile filling
5. **Error Recovery**: Graceful handling of invalid positions

#### Acceptance Criteria
- ✅ Correct flood fill algorithm implementation
- ✅ Tolerance-based filling working properly
- ✅ Performance limits prevent excessive operations
- ✅ Batch operations for efficiency
- ✅ Proper error handling for edge cases

### 4.4 Create Extended Stories
**File:** `packages/ui-gjs/src/widgets/selection-tools/selection-tools.widget.story.ts`

#### Description
Extend the SelectionToolsWidget Story to include controls for all three tools.

#### Extended Story Implementation
```typescript
export class SelectionToolsWidgetStory extends StoryWidget {
  static getMetadata(): StoryMeta {
    return {
      title: 'UI/Selection Tools',
      description: 'Complete selection tools widget with brush, eraser, and fill tools',
      component: SelectionToolsWidget.$gtype,
      tags: ['autodocs', 'ui'],
      controls: [
        // Existing controls...
        {
          name: 'activeTool',
          label: 'Active Tool',
          type: ControlType.SELECT,
          options: [
            { label: 'Brush', value: EditorTool.Brush },
            { label: 'Eraser', value: EditorTool.Eraser },
            { label: 'Fill', value: EditorTool.Fill }
          ],
          defaultValue: EditorTool.Brush,
          description: 'Currently active editing tool'
        },
        {
          name: 'brushSize',
          label: 'Brush Size',
          type: ControlType.RANGE,
          min: 1,
          max: 10,
          defaultValue: 1,
          description: 'Size of the brush tool'
        },
        {
          name: 'eraserSize',
          label: 'Eraser Size',
          type: ControlType.RANGE,
          min: 1,
          max: 10,
          defaultValue: 1,
          description: 'Size of the eraser tool'
        },
        {
          name: 'fillTolerance',
          label: 'Fill Tolerance',
          type: ControlType.RANGE,
          min: 0,
          max: 100,
          defaultValue: 0,
          description: 'Tolerance for fill tool similarity matching'
        }
      ]
    }
  }

  updateArgs(args: Record<string, any>): void {
    if (args.activeTool !== undefined) {
      this._selectionToolsWidget.setActiveTool(args.activeTool)
    }

    if (args.brushSize !== undefined && this._selectionToolsWidget.currentTool === EditorTool.Brush) {
      // Update brush size in widget
      this.emitToWidget('brush-size-changed', args.brushSize)
    }

    if (args.eraserSize !== undefined && this._selectionToolsWidget.currentTool === EditorTool.Eraser) {
      // Update eraser size in widget
      this.emitToWidget('eraser-size-changed', args.eraserSize)
    }

    if (args.fillTolerance !== undefined && this._selectionToolsWidget.currentTool === EditorTool.Fill) {
      // Update fill tolerance in widget
      this.emitToWidget('fill-tolerance-changed', args.fillTolerance)
    }
  }
}
```

#### Story Extensions
1. **All Tool Controls**: Interactive controls for all three tools
2. **Tool-Specific Options**: Dynamic display of relevant options
3. **Signal Testing**: Comprehensive signal logging for all tools
4. **State Management**: Proper state synchronization across tools

#### Acceptance Criteria
- ✅ All three tools controllable via Story
- ✅ Tool-specific options working correctly
- ✅ Proper signal emission and logging
- ✅ State consistency across tool switches

## 🔗 Dependencies
- **Phase 3 Services**: MapEditorService with brush tool implementation
- **Phase 3 UI**: SelectionToolsWidget with basic brush tool
- **Phase 1 Components**: MapEditorComponent, EditorToolComponent
- **Phase 2 Systems**: MapEditorSystem for coordination
- **Existing Infrastructure**: RPC communication, Story system

## ✅ Definition of Done
- [ ] SelectionToolsWidget extended with eraser and fill tool buttons
- [ ] Eraser tool logic implemented in MapEditorService
- [ ] Fill tool logic implemented with flood fill algorithm
- [ ] Extended Story created with controls for all tools
- [ ] Tool switching working between brush, eraser, and fill
- [ ] All acceptance criteria met
- [ ] Code reviewed and approved

## 📋 Testing Strategy
- **Story-Based Testing**: Use extended SelectionToolsWidget Story for all tools
- **Service Testing**: Test MapEditorService with different tool configurations
- **Integration Testing**: End-to-end tool switching and functionality
- **RPC Testing**: Verify bidirectional communication for all tools
- **Performance Testing**: Fill tool performance with large areas
- **Algorithm Testing**: Fill tool flood fill correctness

## 🎯 Next Steps
After completing Phase 4:
- Move to **[Phase 5: Testing & Polish](phase-5-testing-polish.md)**
- Complete tool system with all three core tools
- Focus shifts to comprehensive testing and user experience
- Consider advanced features like undo/redo, multi-layer editing

## 📊 Key Metrics
- **Tool Responsiveness**: < 100ms for all operations
- **Fill Performance**: < 500ms for areas up to 1000 tiles
- **Memory Usage**: Efficient flood fill without excessive memory use
- **User Experience**: Intuitive tool switching and configuration
- **Error Rate**: < 1% for all tool operations

---
*Complete the core tool set with eraser and fill tools. Focus on robust algorithms and clean integration with existing service architecture.*
