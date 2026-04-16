// Minimal ambient typings for @pixelrpg/engine-excalibur.
//
// engine-excalibur's implementation lives in `src/`, which transitively imports
// the local excalibur fork's source files. Those files don't pass strict TS
// compilation in downstream workspaces (e.g. engine-gjs). To avoid cascading
// the fork's type errors across the workspace, we expose a minimal ambient
// declaration here and point `package.json#types` at this file. Runtime
// bundlers still resolve the real implementation via `exports['.']`.

export enum EngineStatus {
  INITIALIZING = 'initializing',
  READY = 'ready',
  LOADING = 'loading',
  RUNNING = 'running',
  ERROR = 'error',
}

export enum EngineEvent {
  STATUS_CHANGED = 'status-changed',
  PROJECT_LOADED = 'project-loaded',
  MAP_LOADED = 'map-loaded',
  ERROR = 'error',
  TILE_CLICKED = 'tile-clicked',
  TILE_HOVERED = 'tile-hovered',
  TILE_PLACED = 'tile-placed',
}

export interface EditorState {
  tool: 'brush' | 'eraser' | 'fill' | null
  tileId: number | null
  layerId: string | null
}

export interface ProjectLoadOptions {
  preloadAllSpriteSets?: boolean
  preloadAllMaps?: boolean
  initialMapId?: string
}

export interface EngineEventMap {
  [EngineEvent.STATUS_CHANGED]: { status: EngineStatus }
  [EngineEvent.PROJECT_LOADED]: { projectPath: string; options?: ProjectLoadOptions }
  [EngineEvent.MAP_LOADED]: { mapId: string }
  [EngineEvent.ERROR]: { message: string; cause?: Error }
  [EngineEvent.TILE_CLICKED]: { coords: { x: number; y: number }; tileMapId: string }
  [EngineEvent.TILE_HOVERED]: { coords: { x: number; y: number } | null; tileMapId: string }
  [EngineEvent.TILE_PLACED]: { coords: { x: number; y: number }; tileId: number; layerId: string }
}

export class TypedEventEmitter<M> {
  on<K extends keyof M>(type: K, cb: (payload: M[K]) => void): () => void
  off<K extends keyof M>(type: K, cb: (payload: M[K]) => void): void
  emit<K extends keyof M>(type: K, payload: M[K]): void
  clear(): void
}

export class Engine {
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
