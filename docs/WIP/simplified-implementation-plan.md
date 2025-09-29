# Simplified Map Editor Implementation Plan

> 📍 **Note**: This document provides a high-level overview.  
> 🔧 **For detailed implementation**: See updated [Phase Documents](WIP/) 
> 🎯 **For the solution**: See [SOLUTION-tile-replacement.md](SOLUTION-tile-replacement.md)

## 🎯 Primary Goal
**Enable tile replacement in maps with a clean, maintainable architecture**

## 📊 Current Status

### ✅ Already Implemented
- **Excalibur (Engine) Side:**
  - MapEditorComponent & EditorToolComponent (ECS components)
  - MapEditorSystem & TileInteractionSystem (ECS systems) 
  - EditorInputSystem (input handling)
  - RPC types for tile interactions
  - Automatic system registration in engine

- **GJS (Host) Side:**
  - MapEditorPanel, TilesetSelector, LayerSelector (UI widgets)
  - WebView with RPC communication
  - Stories for UI testing

### ❌ Missing Critical Pieces
1. **Actual tile replacement functionality** - Systems exist but don't actually modify tiles
2. **Service layer coordination** - No MapEditorService to connect UI with engine
3. **Tool widgets** - No UI for brush/eraser selection
4. **Bidirectional state sync** - RPC events fire but aren't handled

## 🚀 Simplified Implementation (MVP)

### Implementation Phases

1. **[Phase 1 & 2](WIP/phase-1-ecs-components.md)** ✅ **Already Complete**
   - ECS Components and Systems implemented
   - Just missing actual tile modification

2. **[Phase 3: Simple GJS Integration](WIP/phase-3-gjs-integration.md)** (2-3 hours)
   - Create minimal MapEditorService
   - Add simple tool buttons
   - Connect UI to engine

3. **[Phase 5: MVP Testing](WIP/phase-5-testing-polish.md)** (1-2 hours)
   - Validate tile replacement works
   - Simple test checklist
   - Debug if needed

4. **[Phase 4: Future Enhancements](WIP/phase-4-tool-system.md)** (Optional)
   - Only after MVP works
   - Save/Load, Undo/Redo, etc.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    GJS Host (GTK)                        │
├─────────────────────────────────────────────────────────┤
│  MapEditorPanel                                          │
│  ├── TilesetSelector ──┐                                │
│  ├── LayerSelector     ├──> MapEditorService            │
│  └── ToolSelector ─────┘    (coordinates state)         │
└──────────────────────┬──────────────────────────────────┘
                       │ RPC
┌──────────────────────▼──────────────────────────────────┐
│                 Excalibur Engine                         │
├─────────────────────────────────────────────────────────┤
│  TileMap Entity                                          │
│  ├── MapEditorComponent (enables editing)               │
│  ├── EditorToolComponent (current tool/tile)            │
│  └── Systems                                             │
│      ├── EditorInputSystem (handles clicks)             │
│      ├── MapEditorSystem (coordinates)                  │
│      └── TileInteractionSystem (processes edits)        │
└─────────────────────────────────────────────────────────┘
```

## 🎯 Success Criteria

1. **Can select a tile** from TilesetSelector
2. **Can click on map** to replace tile with selected tile
3. **Can switch** between brush and eraser
4. **Changes persist** when saving the project
5. **Clean architecture** that's easy to extend

## 🚫 Out of Scope (for MVP)

- Multi-tile brush sizes
- Fill tool with flood fill algorithm
- Layer management beyond basic selection
- Undo/redo (can add later)
- Keyboard shortcuts
- Advanced tool options

## 💡 Key Simplifications

1. **No Dependency Injection** - Direct instantiation is fine for now
2. **Simple Tool System** - Just brush/eraser, no complex options
3. **Basic State Management** - Service holds state, no complex stores
4. **Minimal RPC** - Only essential messages
5. **Focus on Working** - Get basic tile replacement working first

## 📝 Next Steps After MVP

Once basic tile replacement works:
1. Add fill tool
2. Implement undo/redo
3. Add brush sizes
4. Improve performance with batching
5. Add more sophisticated state management if needed

## 🔧 Implementation Order

1. **Fix tile replacement** in EditorInputSystem (30 min)
2. **Create MapEditorService** (1 hour)
3. **Create ToolSelector widget** (30 min)
4. **Wire everything together** (1 hour)
5. **Test and debug** (2 hours)
6. **Polish and optimize** (2 hours)

**Total estimate: 1-2 days for working MVP**

## ⚠️ Critical Path

The most important thing is getting tiles to actually change when clicked. Everything else is secondary. Focus on:

1. Making `handleTilePlacement` actually modify the tile
2. Ensuring the visual update happens
3. Confirming the change persists

Once this works, everything else is just UI and convenience features.
