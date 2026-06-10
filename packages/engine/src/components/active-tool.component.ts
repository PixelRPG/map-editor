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
 *
 * `'select'` is the default — read-only inspect/select. Clicks
 * select an object placement at the pointer (highlight + inspector
 * sync) or clear the selection when the user clicks empty tile
 * space. Mutating tools (`'pencil'`, `'eraser'`, `'object'`) require an
 * explicit pick from the tool menu so the user can't accidentally paint
 * over existing artwork. `'object'` stamps the active "object brush"
 * ({@link ActiveObjectComponent}) onto the clicked tile.
 */
export type EditorTool = 'select' | 'pencil' | 'eraser' | 'eyedropper' | 'object'

export class ActiveToolComponent extends Component {
  constructor(public tool: EditorTool) {
    super()
  }
}
