# Phase 5: Testing & Validation

## 📋 Overview
**Status:** Ready when MVP implemented | **Estimate:** 1-2 hours | **Priority:** Critical

This phase validates that the tile replacement functionality works correctly.

## 🎯 Testing Focus

### Core Functionality Tests

#### Test 1: Basic Tile Placement
```
1. Open application
2. Load a test map (minimum 5x5 tiles)
3. Select tile ID 1 from TilesetSelector
4. Click on tile at position (2,2)
5. VERIFY: Tile graphic changes to selected tile
6. Click on tile at position (3,3)  
7. VERIFY: That tile also changes
```

#### Test 2: Eraser Functionality
```
1. Click eraser button
2. Click on a tile with graphics
3. VERIFY: Tile graphic disappears
4. VERIFY: Tile is no longer solid
```

#### Test 3: State Persistence
```
1. Select tile ID 5
2. Switch to eraser
3. Switch back to brush
4. Click on map
5. VERIFY: Places tile ID 5 (not ID 1)
```

#### Test 4: Tool Switching
```
1. Select brush tool
2. Place a tile
3. Select eraser tool
4. Remove a tile
5. VERIFY: Tools work independently
```

## 🐛 Debug Procedures

### If tiles don't change visually

Add debug logging at critical points:

```typescript
// In EditorInputSystem.handleTilePlacement
console.log('[Input] Tile clicked:', coords)
console.log('[Input] Tool state:', toolComponent.currentTool, toolComponent.selectedTileId)

// Before modification
console.log('[Input] Sprite found:', sprite !== null)
console.log('[Input] Graphics before:', tile.graphics)

// After clearGraphics
tile.clearGraphics()
console.log('[Input] Graphics cleared:', tile.graphics)

// After addGraphic
tile.addGraphic(sprite.clone())
console.log('[Input] Graphics after:', tile.graphics)
```

### If state doesn't sync

Check RPC communication:

```typescript
// In MapEditorService
console.log('[Service] Tile selected:', tileId)
console.log('[Service] Tool changed:', tool)
console.log('[Service] Sending state to engine:', state)

// In MapEditorSystem
console.log('[System] Received state:', params)
console.log('[System] Updated component:', toolComponent)
```

### Common Issues

#### Issue: "Sprite not found"
**Check:**
- Sprite sheet is loaded correctly
- Tile ID exists in sprite sheet
- Sprite sheet reference is accessible

#### Issue: "Graphics don't update"
**Check:**
- `clearGraphics()` is called
- `addGraphic()` receives valid sprite
- Scene is updating properly

#### Issue: "Wrong tile appears"
**Check:**
- Tile ID indexing matches sprite sheet
- State sync between UI and engine
- Selected tile ID is correct

## 📊 Performance Testing

### Small Map Test (10x10)
- Tile changes should be instant (< 16ms)
- No visible lag when clicking
- Memory usage stable

### Medium Map Test (50x50)
- Tile changes remain responsive
- No frame drops during editing
- Memory growth acceptable

### Large Map Test (100x100)
- Acceptable if response < 100ms
- Monitor for memory leaks
- Check for rendering issues

## ✅ Test Report Template

```markdown
## Map Editor Test Report

Date: _______
Tester: _______
Build: _______

### Environment
- OS: _______
- Browser: _______
- Map size: _______

### Core Functionality
- [ ] Tile selection works
- [ ] Tile placement works  
- [ ] Tiles visually change
- [ ] Eraser removes tiles
- [ ] Tool switching works

### State Management
- [ ] UI state updates engine
- [ ] No desync issues
- [ ] State persists correctly

### Performance
- [ ] Responsive on small maps
- [ ] Acceptable on medium maps
- [ ] No memory leaks detected

### Issues Found
1. Description: _______
   Steps to reproduce: _______
   Expected: _______
   Actual: _______

### Test Result: PASS / FAIL

### Notes
_______
```

## 🎯 Success Criteria

The MVP is validated when:
- All core functionality tests pass
- No blocking bugs found
- Performance is acceptable for small/medium maps
- Console shows no critical errors
- User can successfully edit a map

## 📋 Post-Testing Actions

### If all tests pass:
1. Commit working code with tag
2. Document any workarounds needed
3. Create list of minor issues for later
4. Proceed to feature development

### If critical issues found:
1. Document exact reproduction steps
2. Add debug logging
3. Fix blocking issues
4. Re-test affected functionality

## 🚀 Release Checklist

Before considering MVP complete:
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Known issues documented
- [ ] Code committed and tagged
- [ ] Basic user guide created

---

*Testing ensures the editor works as intended. Focus on core functionality first, optimize later.*