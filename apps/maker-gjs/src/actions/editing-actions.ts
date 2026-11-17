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
  /** Mirror the armed brush into the Brush-page grid + the context chip. */
  setViewObjectBrush(defId: string | null): void
  /**
   * Arm (or clear, on `null`) the terrain brush of the LOADED tileset.
   *
   * The id is the terrain's alone, not `<spriteSetId>/<terrainId>`: a
   * terrain id may contain a slash, and the view already knows which
   * sheet it has open.
   */
  setViewTerrain(terrainId: string | null): void
  setSelectedPlacements(placementIds: readonly string[]): void
  /** Fill the Selected page from the placement (or clear it on `null`). */
  highlightPlacement(placementId: string | null): void
  /**
   * Open the right inspector because a selection landed — a no-op on
   * phone, where REDESIGN § 5.4 answers a selection in the bottom bar
   * instead of over the map.
   */
  revealInspector(): void
  /** Show the Selected page for the current selection. */
  editPlacement(): void
  /** Duplicate the current selection one tile over, then select the copy. */
  copyPlacement(): void
  /**
   * Arm a one-shot move of the current selection: the next tap with the
   * select tool relocates it instead of changing the selection.
   */
  movePlacement(): void
  /** Remove the current selection from its layer. */
  deletePlacement(): void
  /**
   * Start § 6.2's "Goes to" flow for the current selection: ask which
   * map the door leads to, then open that map in pick mode. A no-op
   * when the selection is not a door.
   */
  doorTarget(): void
  undo(): void
  redo(): void
  /**
   * Append a fresh empty layer to the active scene's map, in `plane` —
   * or, for the empty string, in the active layer's plane.
   */
  createLayer(plane: string): void
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

  // The Brush page's Ground chips and the phone strip activate this. An
  // empty string clears the brush.
  //
  // Unlike an object brush a terrain is not a tool (TERRAIN.md § 6.2):
  // both the pencil and the fill paint one, so the tool only moves when
  // the armed one could not paint at all — `select` picks placements and
  // `object` stamps entities, and a chip that visibly does nothing is
  // worse than a tool that changed under the user.
  const setTerrainBrush = Gio.SimpleAction.new('set-terrain-brush', GLib.VariantType.new('s'))
  setTerrainBrush.connect('activate', (_a, parameter) => {
    const terrainId = parameter?.get_string()[0] ?? ''
    const current = tool.get_state()?.get_string()[0] as EditorTool | undefined
    if (terrainId && current !== 'pencil' && current !== 'fill') {
      tool.change_state(GLib.Variant.new_string('pencil'))
    }
    ctx.setViewTerrain(terrainId || null)
  })
  addAction(group, setTerrainBrush)

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

  // The entries of the touch long-press placement menu (REDESIGN § 9
  // step 1.4) and of the phone selection bar (§ 5.4), which offers the
  // same four verbs. Stateless like undo/redo: they read the current
  // selection rather than take an id, because the long press selects the
  // placement under the finger before the menu pops up — a parameter
  // would be a second, drift-prone statement of the same target.
  const editPlacement = new Gio.SimpleAction({ name: 'edit-placement' })
  editPlacement.connect('activate', () => ctx.editPlacement())
  addAction(group, editPlacement)

  const copyPlacement = new Gio.SimpleAction({ name: 'copy-placement' })
  copyPlacement.connect('activate', () => ctx.copyPlacement())
  addAction(group, copyPlacement)

  const movePlacement = new Gio.SimpleAction({ name: 'move-placement' })
  movePlacement.connect('activate', () => ctx.movePlacement())
  addAction(group, movePlacement)

  const deletePlacement = new Gio.SimpleAction({ name: 'delete-placement' })
  deletePlacement.connect('activate', () => ctx.deletePlacement())
  addAction(group, deletePlacement)

  // "Goes to…" — the fifth placement verb, and the only one that is not
  // in the phone selection bar: the bar's five slots are full at 360 px
  // and the Selected page carries the same thing as a row ("Goes to"),
  // which is where § 6.2 puts it in the first place. Stateless like the
  // other four. The context menu offers it only on a door, but the
  // action stays registered either way — an action that comes and goes
  // cannot be reached by a keyboard shortcut or by the Control plane.
  const doorTarget = new Gio.SimpleAction({ name: 'door-target' })
  doorTarget.connect('activate', () => ctx.doorTarget())
  addAction(group, doorTarget)

  const undo = new Gio.SimpleAction({ name: 'undo' })
  undo.connect('activate', () => ctx.undo())
  addAction(group, undo)

  const redo = new Gio.SimpleAction({ name: 'redo' })
  redo.connect('activate', () => ctx.redo())
  addAction(group, redo)

  undo.set_enabled(false)
  redo.set_enabled(false)

  // Instant-add (no name prompt) — the common editor gesture. Rides an
  // undoable + collab-synced `AddLayerCommand`. The parameter is the
  // plane to add to: Full view offers one "Add a layer" row per section
  // and names it, Simple view offers a single row and passes `''` for
  // "wherever the user is painting" (REDESIGN.md § 6.3).
  const newLayer = Gio.SimpleAction.new('new-layer', GLib.VariantType.new('s'))
  newLayer.connect('activate', (_a, parameter) => ctx.createLayer(parameter?.get_string()[0] ?? ''))
  addAction(group, newLayer)

  return { tool, undo, redo }
}
