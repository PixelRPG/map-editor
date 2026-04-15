import { EngineStatus } from '../types/engine-status.ts'
import { ProjectLoadOptions } from '../types/project-options.ts'
import { EngineEventMap } from '../types/engine-events.ts'
import { EditorState } from '../types/editor-state.ts'
import { TypedEventEmitter } from '../utils/emitter.ts'

/**
 * In-process engine API.
 *
 * The engine is constructed with a canvas element (in GJS via
 * `@gjsify/webgl`'s CanvasWebGLWidget, in the browser via `document.createElement`),
 * owns its lifecycle and emits events through a TypedEventEmitter.
 */
export interface EngineInterface {
  readonly status: EngineStatus
  readonly events: TypedEventEmitter<EngineEventMap>

  initialize(): Promise<void>
  loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void>
  loadMap(mapId: string): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>

  setEditorState(state: Partial<EditorState>): void
  getEditorState(): EditorState
}
