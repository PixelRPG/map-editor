// Minimal ambient typings for @pixelrpg/engine-excalibur.
//
// engine-excalibur's implementation lives in `src/`, which transitively imports
// the local excalibur fork's source files. Those files don't pass strict TS
// compilation in downstream workspaces (e.g. engine-gjs). To avoid cascading
// the fork's type errors across the workspace, we expose a minimal ambient
// declaration here and point `package.json#types` at this file. Runtime
// bundlers still resolve the real implementation via `exports['.']`.

import type {
  EditorState,
  EngineEventMap,
  EngineInterface,
  EngineStatus,
  ProjectLoadOptions,
  TypedEventEmitter,
} from '@pixelrpg/engine-core'

export class Engine implements EngineInterface {
  constructor(canvas: HTMLCanvasElement)
  readonly status: EngineStatus
  readonly events: TypedEventEmitter<EngineEventMap>
  readonly excalibur: any
  initialize(): Promise<void>
  loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void>
  loadMap(mapId: string): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  setEditorState(state: Partial<EditorState>): void
  getEditorState(): EditorState
}
