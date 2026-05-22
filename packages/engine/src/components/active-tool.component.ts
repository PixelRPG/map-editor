import { Component } from 'excalibur'

/**
 * Editor tool currently active for tile-level mutations. Lives on the
 * session-singleton entity (see `docs/concepts/editor-architecture.md`).
 *
 * The string union is **open** — the engine only acts on tools it
 * understands (`'brush'` / `'eraser'` today; more will follow as
 * tool semantics land). Unknown values are tolerated by the systems
 * that read this component; they short-circuit on tools they don't
 * recognise so the editor's UI tool-rail can name new tools (e.g.
 * `'bucket'`, `'rect'`) before the engine implements them.
 */
export type EditorTool =
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'rect'
  | 'select'
  | 'stamp'
  | 'event'
  | (string & {})

export class ActiveToolComponent extends Component {
  constructor(public tool: EditorTool) {
    super()
  }
}
