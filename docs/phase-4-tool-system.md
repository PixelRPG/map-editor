# Phase 4: Tool System Implementation

## 📋 Overview
**Status:** Planned | **Estimate:** 2-3 days | **Priority:** Medium

This phase implements the complete tool system for map editing, including abstract tool architecture and concrete tool implementations.

## 🎯 Goals
- Create abstract tool architecture for extensibility
- Implement concrete tools (Brush, Eraser, Fill)
- Enable tool switching and state management
- Integrate tools with existing editor infrastructure

## 📝 Detailed Tasks

### 4.1 Create Abstract Tool Class
**File:** `packages/engine-gjs/src/tools/abstract-tool.ts`

#### Description
Abstract base class that defines the interface for all editor tools. Provides common functionality and ensures consistent tool behavior.

#### Tool Architecture
```typescript
export abstract class AbstractTool {
  protected mapEditorService: MapEditorService
  protected engine: Engine

  constructor(mapEditorService: MapEditorService, engine: Engine) {
    this.mapEditorService = mapEditorService
    this.engine = engine
  }

  // Lifecycle methods
  public abstract activate(): void
  public abstract deactivate(): void

  // Interaction methods
  public abstract handleTileClick(coords: ex.Vector): Promise<void>
  public abstract handleTileHover(coords: ex.Vector): Promise<void>

  // Utility methods
  protected async placeTile(coords: ex.Vector, tileId: number): Promise<void> {
    await this.engine.rpc.sendRequest(RpcEngineType.TILE_PLACED, {
      coords,
      tileId,
      layerId: this.mapEditorService.getSelectedLayer()
    })
  }

  protected getSelectedTile(): number | null {
    return this.mapEditorService.getSelectedTile()
  }

  protected getSelectedLayer(): string | null {
    return this.mapEditorService.getSelectedLayer()
  }
}
```

#### Abstract Interface
1. **Lifecycle Management**: `activate()` / `deactivate()` methods
2. **Interaction Handling**: `handleTileClick()` / `handleTileHover()` methods
3. **Common Utilities**: Shared functionality for tile placement, state access
4. **Error Handling**: Consistent error handling across tools

#### Acceptance Criteria
- ✅ Clear interface for all tools to implement
- ✅ Proper lifecycle management
- ✅ Extensible for future tools
- ✅ Type-safe method signatures
- ✅ Common utility methods available

#### Implementation Notes
- Abstract class ensures consistent tool behavior
- Dependency injection for service access
- Async methods for RPC communication
- Proper error propagation

### 4.2 Implement Brush Tool
**File:** `packages/engine-gjs/src/tools/brush-tool.ts`

#### Description
Standard brush tool for placing individual tiles or tile patterns on the map.

#### Tool Features
```typescript
export class BrushTool extends AbstractTool {
  private brushSize: number = 1
  private pattern: TilePattern | null = null

  public async handleTileClick(coords: ex.Vector): Promise<void> {
    const selectedTile = this.getSelectedTile()
    if (!selectedTile) return

    if (this.brushSize === 1) {
      // Single tile placement
      await this.placeTile(coords, selectedTile)
    } else {
      // Multi-tile brush
      await this.placeTilePattern(coords, selectedTile, this.brushSize)
    }
  }

  public async handleTileHover(coords: ex.Vector): Promise<void> {
    // Show brush preview
    await this.showBrushPreview(coords)
  }

  private async placeTilePattern(center: ex.Vector, tileId: number, size: number): Promise<void> {
    const halfSize = Math.floor(size / 2)
    const placements: Array<{coords: ex.Vector, tileId: number}> = []

    for (let x = -halfSize; x <= halfSize; x++) {
      for (let y = -halfSize; y <= halfSize; y++) {
        placements.push({
          coords: center.add(new ex.Vector(x, y)),
          tileId
        })
      }
    }

    // Batch placement for performance
    await this.batchPlaceTiles(placements)
  }
}
```

#### Brush Features
1. **Single/Multi Tile**: Support for different brush sizes
2. **Pattern Support**: Ability to paint with tile patterns
3. **Preview**: Visual feedback before placement
4. **Batch Operations**: Efficient multi-tile placement

#### Acceptance Criteria
- ✅ Intuitive single-click tile placement
- ✅ Performance optimized for large brush sizes
- ✅ Correct layer support
- ✅ Visual preview functionality
- ✅ Undo/Redo integration ready

#### Implementation Notes
- Brush size affects placement area
- Preview shows potential changes
- Batch operations reduce RPC calls
- Integration with undo system

### 4.3 Implement Eraser Tool
**File:** `packages/engine-gjs/src/tools/eraser-tool.ts`

#### Description
Eraser tool for removing tiles from the map. Supports single tile and area erasure.

#### Tool Features
```typescript
export class EraserTool extends AbstractTool {
  private eraserSize: number = 1

  public async handleTileClick(coords: ex.Vector): Promise<void> {
    if (this.eraserSize === 1) {
      // Single tile erasure
      await this.eraseTile(coords)
    } else {
      // Area erasure
      await this.eraseTileArea(coords, this.eraserSize)
    }
  }

  public async handleTileHover(coords: ex.Vector): Promise<void> {
    // Show erasure preview
    await this.showErasurePreview(coords)
  }

  private async eraseTile(coords: ex.Vector): Promise<void> {
    await this.placeTile(coords, 0) // 0 = empty tile
  }

  private async eraseTileArea(center: ex.Vector, size: number): Promise<void> {
    const halfSize = Math.floor(size / 2)
    const erasures: ex.Vector[] = []

    for (let x = -halfSize; x <= halfSize; x++) {
      for (let y = -halfSize; y <= halfSize; y++) {
        erasures.push(center.add(new ex.Vector(x, y)))
      }
    }

    await this.batchEraseTiles(erasures)
  }
}
```

#### Eraser Features
1. **Single/Area Erasure**: Different eraser sizes
2. **Safe Operations**: Confirmation for large areas
3. **Visual Feedback**: Preview of tiles to be erased
4. **Recovery Options**: Integration with undo system

#### Acceptance Criteria
- ✅ Safe tile removal operations
- ✅ Visual feedback for erasure preview
- ✅ Recovery options (undo support)
- ✅ Performance optimized for area operations
- ✅ Confirmation dialogs for large erasures

#### Implementation Notes
- Empty tile ID is configurable
- Preview shows tiles before erasure
- Batch operations for efficiency
- Integration with undo system

### 4.4 Implement Fill Tool
**File:** `packages/engine-gjs/src/tools/fill-tool.ts`

#### Description
Flood fill tool for filling contiguous areas with selected tiles.

#### Tool Features
```typescript
export class FillTool extends AbstractTool {
  private tolerance: number = 0

  public async handleTileClick(coords: ex.Vector): Promise<void> {
    const selectedTile = this.getSelectedTile()
    if (!selectedTile) return

    // Get current tile at click position
    const currentTileId = await this.getTileAt(coords)
    if (currentTileId === selectedTile) return

    // Perform flood fill
    const fillArea = await this.calculateFillArea(coords, currentTileId, this.tolerance)
    await this.fillArea(fillArea, selectedTile)
  }

  public async handleTileHover(coords: ex.Vector): Promise<void> {
    // Show fill preview
    const previewArea = await this.calculateFillPreview(coords)
    await this.showFillPreview(previewArea)
  }

  private async calculateFillArea(
    startCoords: ex.Vector,
    targetTileId: number,
    tolerance: number
  ): Promise<ex.Vector[]> {
    // Flood fill algorithm implementation
    const visited = new Set<string>()
    const queue: ex.Vector[] = [startCoords]
    const fillArea: ex.Vector[] = []

    while (queue.length > 0) {
      const current = queue.shift()!
      const key = `${current.x},${current.y}`

      if (visited.has(key)) continue
      visited.add(key)

      const currentTileId = await this.getTileAt(current)

      // Check if tile matches within tolerance
      if (this.tileMatches(currentTileId, targetTileId, tolerance)) {
        fillArea.push(current)

        // Add adjacent tiles
        queue.push(
          current.add(ex.Vector.Up),
          current.add(ex.Vector.Down),
          current.add(ex.Vector.Left),
          current.add(ex.Vector.Right)
        )
      }
    }

    return fillArea
  }
}
```

#### Fill Features
1. **Flood Fill Algorithm**: Efficient area detection and filling
2. **Tolerance Support**: Fill similar tiles within tolerance range
3. **Boundary Respect**: Stop at different tile types
4. **Performance Optimization**: Efficient algorithm for large areas
5. **Preview**: Visual feedback before fill operation

#### Acceptance Criteria
- ✅ Correct area detection and boundary following
- ✅ Performance optimized for large map areas
- ✅ Memory efficient flood fill implementation
- ✅ Tolerance-based filling
- ✅ Visual preview before fill operation

#### Implementation Notes
- Efficient flood fill prevents stack overflow
- Tolerance allows filling similar but not identical tiles
- Preview shows area before actual fill
- Batch operations for performance

## 🔗 Dependencies
- **Phase 3 Services**: MapEditorService for state access
- **Phase 1 Components**: MapEditorComponent, EditorToolComponent
- **Phase 2 Systems**: MapEditorSystem for coordination
- **Existing Infrastructure**: RPC communication, UI components

## ✅ Definition of Done
- [ ] AbstractTool base class implemented
- [ ] BrushTool fully functional
- [ ] EraserTool fully functional
- [ ] FillTool fully functional
- [ ] Tool switching working
- [ ] All acceptance criteria met
- [ ] Code reviewed and approved

## 📋 Testing Strategy
- **Unit Tests**: Individual tool functionality, algorithm correctness
- **Integration Tests**: Tool switching, RPC communication
- **Performance Tests**: Large area operations, memory usage
- **User Experience Tests**: Tool responsiveness, visual feedback

## 🎯 Next Steps
After completing Phase 4:
- Move to **[Phase 5: Testing & Polish](phase-5-testing-polish.md)**
- MVP with all core tools is complete
- Focus shifts to quality assurance and user experience

## 📊 Key Metrics
- **Tool Responsiveness**: < 100ms for all operations
- **Memory Usage**: Efficient for large operations
- **Algorithm Performance**: O(n) for fill operations
- **User Experience**: Intuitive tool behavior

---
*Create extensible tool architecture that can easily accommodate future tools. Focus on performance and user experience.*
