# Phase 4: Extended Features (Optional)

## 📋 Overview
**Status:** Future Enhancement | **Estimate:** Variable | **Priority:** Low

This phase contains additional features that can be implemented after the core tile replacement functionality is working.

## 🎯 Feature Priorities

### High Priority (After MVP)

#### 1. Save/Load Functionality
**Purpose:** Persist map changes to project files

```typescript
// Save modified tilemap back to project
async saveMap(mapId: string): Promise<void> {
  const tileData = this.collectTileData()
  await this.projectResource.saveMap(mapId, tileData)
}
```

**Implementation considerations:**
- Serialize tile state to map format
- Update project files
- Handle file system permissions
- Backup original files

### Medium Priority

#### 2. Undo/Redo System
**Purpose:** Allow users to reverse mistakes

```typescript
class EditCommand {
  constructor(
    public coords: {x: number, y: number},
    public oldTileId: number,
    public newTileId: number
  ) {}
  
  execute() { /* apply change */ }
  undo() { /* revert change */ }
}

class CommandHistory {
  private history: EditCommand[] = []
  private currentIndex: number = -1
  
  execute(command: EditCommand) {
    command.execute()
    this.history = this.history.slice(0, this.currentIndex + 1)
    this.history.push(command)
    this.currentIndex++
  }
  
  undo() {
    if (this.currentIndex >= 0) {
      this.history[this.currentIndex].undo()
      this.currentIndex--
    }
  }
  
  redo() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++
      this.history[this.currentIndex].execute()
    }
  }
}
```

### Low Priority

#### 3. Multi-Tile Brush
**Purpose:** Edit larger areas efficiently

```typescript
// Variable brush sizes: 1x1, 3x3, 5x5
function applyBrush(center: {x: number, y: number}, radius: number) {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const tile = tileMap.getTile(center.x + dx, center.y + dy)
      if (tile) {
        replaceTile(tile, selectedTileId)
      }
    }
  }
}
```

#### 4. Fill Tool
**Purpose:** Fill contiguous areas with same tile

```typescript
// Basic flood fill algorithm
function fillArea(startTile: Tile, targetId: number, replaceId: number) {
  const queue = [startTile]
  const visited = new Set<string>()
  
  while (queue.length > 0) {
    const tile = queue.shift()
    if (!tile || visited.has(`${tile.x},${tile.y}`)) continue
    
    if (getTileId(tile) === targetId) {
      replaceTile(tile, replaceId)
      
      // Add adjacent tiles
      const neighbors = [
        tileMap.getTile(tile.x + 1, tile.y),
        tileMap.getTile(tile.x - 1, tile.y),
        tileMap.getTile(tile.x, tile.y + 1),
        tileMap.getTile(tile.x, tile.y - 1)
      ]
      
      neighbors.forEach(n => n && queue.push(n))
    }
    visited.add(`${tile.x},${tile.y}`)
  }
}
```

#### 5. Selection Tools
**Purpose:** Select and manipulate regions

```typescript
interface Selection {
  start: {x: number, y: number}
  end: {x: number, y: number}
  
  getTiles(): Tile[]
  move(dx: number, dy: number): void
  copy(): TileData[]
  paste(data: TileData[]): void
  clear(): void
}
```

## 📊 Implementation Guidelines

### When to Implement
Only consider these features when:
- Basic tile replacement works reliably
- No critical bugs in core functionality
- User feedback requests specific features

### Implementation Order
1. Save/Load (essential for practical use)
2. Undo/Redo (improves user experience)
3. Other features based on user needs

### Performance Considerations
- Batch tile operations for efficiency
- Use dirty rectangles for rendering optimization
- Implement viewport culling for large maps
- Consider web workers for heavy operations

## 🎯 Success Criteria

Each feature should:
- Work reliably without breaking core functionality
- Have clear user interface
- Include error handling
- Be properly documented
- Include basic testing

## 📋 Feature Checklist

### Save/Load
- [ ] Serialize map state
- [ ] Write to file system
- [ ] Handle errors gracefully
- [ ] Backup original files
- [ ] Show save confirmation

### Undo/Redo
- [ ] Command pattern implementation
- [ ] History size limit
- [ ] Memory management
- [ ] Keyboard shortcuts
- [ ] UI indicators

### Multi-Tile Brush
- [ ] Size selection UI
- [ ] Preview overlay
- [ ] Edge handling
- [ ] Performance optimization

### Fill Tool
- [ ] Flood fill algorithm
- [ ] Boundary detection
- [ ] Maximum area limit
- [ ] Progress indication

---

*These features enhance the editor but are not required for basic functionality. Implement based on actual user needs rather than assumptions.*