import { Component } from 'excalibur'

/**
 * Editor tool currently active for tile-level mutations. Lives on the
 * session-singleton entity (see `docs/concepts/editor-architecture.md`).
 *
 * Canonical set is shared with the UI tool selector
 * (`@pixelrpg/gjs/widgets/editor/floating-top-bar`'s tool MenuButton)
 * — both sides import this type so adding / renaming a tool is a
 * single-file change. Adding a new tool: extend this union, update
 * the menu entries in FloatingTopBar's `_buildToolMenu`, implement
 * the system-side behaviour in `TileEditorSystem.applyClick`.
 */
export type EditorTool = 'pencil' | 'eraser' | 'eyedropper'

export class ActiveToolComponent extends Component {
  constructor(public tool: EditorTool) {
    super()
  }
}
