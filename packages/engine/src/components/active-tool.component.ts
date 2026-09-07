import { Component } from 'excalibur'

/**
 * Editor tool currently active for tile-level mutations. Lives on the
 * session-singleton entity (see `docs/concepts/editor-architecture.md`).
 *
 * Canonical set is shared with the UI tool selector
 * (`@pixelrpg/gjs/widgets/editor/tool-group`) — both sides
 * import this type so adding / renaming a tool is a single-file change.
 * Adding a new tool: extend this union, add its entry to `TOOLS` in
 * `@pixelrpg/gjs`'s `ToolGroup` and its icon to `TOOL_ICONS` in
 * `brush-badge.geometry.ts` — the badge's corner disc draws from that
 * same table, so the chooser and the badge can never name different
 * tools — then implement the system-side behaviour in
 * `TileEditorSystem.applyClick`.
 *
 * `'select'` is the default — read-only inspect/select. Clicks
 * select an object placement at the pointer (highlight + inspector
 * sync) or clear the selection when the user clicks empty tile
 * space. Mutating tools (`'pencil'`, `'fill'`, `'eraser'`, `'object'`)
 * require an explicit pick from the tool menu so the user can't
 * accidentally paint over existing artwork. `'fill'` flood-fills the
 * contiguous region of tiles matching the clicked tile (on the active
 * layer) with the active tile. `'object'` stamps the active "object
 * brush" ({@link ActiveObjectComponent}) onto the clicked tile.
 */
export type EditorTool = 'select' | 'pencil' | 'fill' | 'eraser' | 'eyedropper' | 'object'

export class ActiveToolComponent extends Component {
  constructor(public tool: EditorTool) {
    super()
  }
}
