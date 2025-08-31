# Phase 1: ECS Components and Foundation

## 📋 Overview
**Status:** Planned | **Estimate:** 1-2 days | **Priority:** High

This phase establishes the foundational ECS components and extends the RPC communication layer for map editing functionality.

## 🎯 Goals
- Create basic ECS components for Map Editor functionality
- Extend existing RPC types for TileMap interaction
- Integrate new components into existing architecture
- Enable clean activation/deactivation of editor mode

## 📝 Detailed Tasks

### 1.1 Create MapEditorComponent
**File:** `packages/engine-excalibur/src/components/map-editor.component.ts`

#### Description
ECS component that enables TileMap entities to be edited. This component contains all the editor-specific state for a map.

#### Requirements
- **Inherits from:** `ex.Component`
- **Purpose:** Marks TileMap entities as editable and manages editor state

#### Properties
```typescript
export class MapEditorComponent extends ex.Component {
  // Editor activation
  public isEditable: boolean = true

  // Current interaction state
  public selectedTileCoords: ex.Vector | null = null
  public hoverTileCoords: ex.Vector | null = null

  // RPC callbacks for state synchronization
  public onTileSelected?: (coords: ex.Vector) => void
  public onTileHovered?: (coords: ex.Vector) => void
}
```

#### Acceptance Criteria
- ✅ Component inherits from `ex.Component`
- ✅ Contains `isEditable`, `selectedTileCoords`, `hoverTileCoords` properties
- ✅ RPC callbacks for state synchronization
- ✅ Type safety with TypeScript
- ✅ Easy activation/deactivation through component management
- ✅ Proper cleanup in `onRemove()` method

#### Implementation Notes
- Component has zero-arg constructor for ECS requirements
- State is observable for reactive UI updates
- Clean separation between game and editor state

### 1.2 Create EditorToolComponent
**File:** `packages/engine-excalibur/src/components/editor-tool.component.ts`

#### Description
ECS component that manages the current editor tool state and selections. Attached to TileMap entities when in editor mode.

#### Requirements
- **Inherits from:** `ex.Component`
- **Purpose:** Manages tool selection and current editor state

#### Properties
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

#### Acceptance Criteria
- ✅ Manages `currentTool`, `selectedTileId`, `selectedLayerId`
- ✅ Integration with tool system architecture
- ✅ Observable for state changes (for UI reactivity)
- ✅ Type-safe tool enumeration
- ✅ Extensible for future tool properties

#### Implementation Notes
- Tool state is synchronized with GJS host
- Changes trigger RPC notifications to host
- State validation for tool compatibility

### 1.3 Extend RPC Types
**File:** `packages/engine-core/src/types/rpc-engine.ts`

#### Description
Extend the existing RPC engine types to support TileMap interaction and editor state synchronization.

#### New RPC Types
```typescript
export enum RpcEngineType {
  // ... existing types

  // TileMap interaction events
  TILE_CLICKED = 'tile-clicked',
  TILE_HOVERED = 'tile-hovered',
  TILE_PLACED = 'tile-placed',

  // Editor state synchronization
  EDITOR_STATE_CHANGED = 'editor-state-changed'
}

export interface RpcEngineParamMap {
  // ... existing mappings

  // TileMap interaction
  [RpcEngineType.TILE_CLICKED]: {
    coords: ex.Vector
    tileMapId: string
  }
  [RpcEngineType.TILE_HOVERED]: {
    coords: ex.Vector
    tileMapId: string
  }
  [RpcEngineType.TILE_PLACED]: {
    coords: ex.Vector
    tileId: number
    layerId: string
  }

  // Editor state
  [RpcEngineType.EDITOR_STATE_CHANGED]: {
    tool: string
    tileId: number
    layerId: string
  }
}
```

#### Acceptance Criteria
- ✅ Complete type safety for all new RPC types
- ✅ Consistent with existing RPC patterns
- ✅ Proper TypeScript interfaces for all parameters
- ✅ Documented interfaces with JSDoc comments
- ✅ No breaking changes to existing RPC functionality

#### Implementation Notes
- New types follow existing naming conventions
- Bidirectional communication support (host ↔ engine)
- Error handling for invalid parameters

### 1.4 Extend EditorInputSystem
**File:** `packages/engine-excalibur/src/systems/editor-input.system.ts`

#### Description
Extend the existing EditorInputSystem to handle TileMap interaction and integrate with the new MapEditorComponent.

#### Changes Required
1. **Tile Coordinate Calculation**
   - Convert screen coordinates to tile coordinates
   - Handle camera zoom and position
   - Validate coordinate bounds

2. **MapEditorComponent Integration**
   - Query for TileMap entities with MapEditorComponent
   - Update component state on interactions
   - Trigger RPC notifications

3. **RPC Event Generation**
   - Send TILE_CLICKED events
   - Send TILE_HOVERED events
   - Include proper tile map identification

#### Acceptance Criteria
- ✅ Correct coordinate transformation (screen → tile)
- ✅ Performance optimized (no unnecessary calculations)
- ✅ Error handling for invalid coordinates
- ✅ Integration with MapEditorComponent state
- ✅ Proper RPC event generation
- ✅ No interference with existing input handling

#### Implementation Notes
- Coordinate calculation considers TileMap position, camera, and zoom
- Only processes input when MapEditorComponent is present
- Debounced hover events for performance
- Clean separation from game input handling

## 🔗 Dependencies
- Requires existing `EditorInputSystem` (already exists)
- Requires existing RPC infrastructure
- Requires `ex.Component` from Excalibur

## ✅ Definition of Done
- [ ] MapEditorComponent created and functional
- [ ] EditorToolComponent created and functional
- [ ] RPC types extended without breaking changes
- [ ] EditorInputSystem extended for tile interaction
- [ ] Basic component activation/deactivation tested
- [ ] All acceptance criteria met
- [ ] Code reviewed and approved

## 📋 Testing Strategy
- **Unit Tests**: Component creation, property management, RPC type validation
- **Integration Tests**: Component attachment to TileMap entities, state synchronization
- **Performance Tests**: Coordinate transformation accuracy, event generation overhead

## 🎯 Next Steps
After completing Phase 1:
- Move to **[Phase 2: ECS Systems](phase-2-ecs-systems.md)**
- MapEditorSystem will use the components created here
- RPC communication layer is ready for use

---
*This document contains all necessary information for implementing Phase 1. Focus on the acceptance criteria and ensure clean, testable code.*
