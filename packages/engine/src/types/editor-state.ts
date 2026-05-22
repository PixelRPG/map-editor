/**
 * Editor-side state still held on the engine instance — `tileId` and
 * `layerId` for tile painting. `tool` was migrated to
 * {@link ActiveToolComponent} on the session-singleton entity (see
 * `docs/concepts/editor-architecture.md` Phase 2). The remaining
 * fields follow in Phase 3.
 */
export interface EditorState {
  tileId: number | null
  layerId: string | null
}
