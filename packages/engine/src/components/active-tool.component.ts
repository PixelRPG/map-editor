import { Component } from 'excalibur'

/**
 * Editor tool currently active for tile-level mutations. Lives on the
 * session-singleton entity (see `docs/concepts/editor-architecture.md`).
 *
 * Canonical set is shared with the UI tool rail
 * (`@pixelrpg/gjs/widgets/editor/floating-tool-rail`) — both sides
 * import this type so adding / renaming a tool is a single-file
 * change. Adding a new tool: extend this union, update the BLP
 * button, implement the system-side behaviour in
 * `TileEditorSystem.applyClick`.
 *
 * Today the engine acts on `'pencil'` / `'eraser'` / `'eyedropper'`;
 * the remaining tools (`'bucket'`, `'rect'`, `'select'`, `'stamp'`,
 * `'event'`) are accepted but `TileEditorSystem` short-circuits on
 * them so the UI can surface the buttons before the engine grows
 * their semantics.
 */
export type EditorTool = 'pencil' | 'bucket' | 'rect' | 'eraser' | 'eyedropper' | 'select' | 'stamp' | 'event'

export class ActiveToolComponent extends Component {
  constructor(public tool: EditorTool) {
    super()
  }
}
