import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import type { EditorTool } from '@pixelrpg/engine'
import { addAction } from './action-registry.ts'

/** What the canvas-editing actions need from the window. */
export interface EditingActionsContext {
  /** Write the tool into the engine's per-scene `ActiveToolComponent`. */
  setEngineTool(tool: EditorTool): void
  /** Mirror the tool onto the top-bar MenuButton icon + the tool rail. */
  setViewTool(tool: EditorTool): void
  /** Arm (or clear, on `null`) the entity the object tool stamps. */
  setEngineObjectBrush(defId: string | null): void
  /** Mirror the armed brush into the Tiles-tab grid + the context chip. */
  setViewObjectBrush(defId: string | null): void
  setSelectedPlacements(placementIds: readonly string[]): void
  /** Highlight the placement's row in the inspector's Objects tab. */
  highlightPlacement(placementId: string | null): void
  /** Open the right inspector (a hit selection has content to show). */
  revealInspector(): void
  undo(): void
  redo(): void
  /** Append a fresh empty layer to the active scene's map. */
  createLayer(): void
}

/**
 * Tool, brush, selection, history and layer creation — everything that
 * mutates or targets the live canvas.
 *
 * Undo / redo route through the engine's command stack (see
 * `docs/concepts/editor-architecture.md` § Phase 5) and start disabled:
 * on the welcome view Ctrl+Z is a no-op, but an enabled affordance
 * suggests otherwise. `EngineController`'s `undo-changed` event flips
 * them (wired in `engine-event-bridge.ts`).
 */
export function installEditingActions(
  group: Gio.SimpleActionGroup,
  ctx: EditingActionsContext,
): { tool: Gio.SimpleAction; undo: Gio.SimpleAction; redo: Gio.SimpleAction } {
  // Default to the read-only `select` tool: clicking the canvas picks an
  // object placement (or clears the selection) without mutating the map.
  // Mutating tools need an explicit pick so a misclick can't paint over
  // existing artwork.
  const tool = Gio.SimpleAction.new_stateful('set-tool', GLib.VariantType.new('s'), GLib.Variant.new_string('select'))
  tool.connect('change-state', (action, value) => {
    action.set_state(value!)
    // Tool ids are shared with the engine's `EditorTool` union, so the
    // GAction state string passes straight through.
    const next = value!.get_string()[0] as EditorTool
    ctx.setEngineTool(next)
    ctx.setViewTool(next)
  })
  addAction(group, tool)

  // Picking what to place also activates placement mode, so choosing a
  // brush is a single step. An empty string clears the brush.
  const setObjectBrush = Gio.SimpleAction.new('set-object-brush', GLib.VariantType.new('s'))
  setObjectBrush.connect('activate', (_a, parameter) => {
    const defId = parameter?.get_string()[0] ?? ''
    ctx.setEngineObjectBrush(defId || null)
    if (defId) tool.change_state(GLib.Variant.new_string('object'))
    ctx.setViewObjectBrush(defId || null)
  })
  addAction(group, setObjectBrush)

  // The driveable equivalent of a select-tool canvas click, so external
  // tooling can exercise the selection → Objects-row → Props flow.
  const selectPlacement = Gio.SimpleAction.new('select-placement', GLib.VariantType.new('s'))
  selectPlacement.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0] ?? ''
    ctx.setSelectedPlacements(id ? [id] : [])
    ctx.highlightPlacement(id || null)
    if (id) ctx.revealInspector()
  })
  addAction(group, selectPlacement)

  const undo = new Gio.SimpleAction({ name: 'undo' })
  undo.connect('activate', () => ctx.undo())
  addAction(group, undo)

  const redo = new Gio.SimpleAction({ name: 'redo' })
  redo.connect('activate', () => ctx.redo())
  addAction(group, redo)

  undo.set_enabled(false)
  redo.set_enabled(false)

  // Instant-add (no name prompt) — the common editor gesture. Rides an
  // undoable + collab-synced `AddLayerCommand`.
  const newLayer = new Gio.SimpleAction({ name: 'new-layer' })
  newLayer.connect('activate', () => ctx.createLayer())
  addAction(group, newLayer)

  return { tool, undo, redo }
}
