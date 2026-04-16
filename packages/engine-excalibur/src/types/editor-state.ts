/**
 * Current editor-side state: which tool is active, which tile/layer is selected.
 * Held on the engine instance and updated directly (no RPC).
 */
export interface EditorState {
  tool: 'brush' | 'eraser' | 'fill' | null
  tileId: number | null
  layerId: string | null
}
