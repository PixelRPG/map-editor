// Minimal ambient typings for @pixelrpg/data-excalibur.
//
// Same pattern as engine-excalibur: the real implementation in `src/`
// imports types from the local excalibur fork (`../excalibur/src/engine/*`),
// which does not pass strict TypeScript compilation in downstream workspaces.
// To avoid cascading those fork errors, we expose a minimal ambient
// declaration and point `package.json#types` at this file. Runtime bundlers
// still resolve `src/index.ts` via `exports['.'].default`.

// -- Pure data types (no excalibur dependency in the type graph) -------------

export interface Loadable<T> {
  data: T
  load(): Promise<T>
  isLoaded(): boolean
}

export interface Vector { x: number; y: number }

export enum MapCategory {
  MAIN = 'main',
  SECONDARY = 'secondary',
}

export interface ResourceOptions {
  headless?: boolean
  baseDir?: string
}

export interface GameStartupConfig {
  initialMapId?: string
}

export interface Properties {
  [key: string]: string | number | boolean | undefined
}

// -- References ---------------------------------------------------------------

export interface FileReference { path: string }
export interface ImageReference extends FileReference { id?: string }
export interface AudioReference extends FileReference { id?: string }
export interface MapReference extends FileReference { id: string }
export interface SpriteSetReference extends FileReference {
  id: string
  type: 'spriteset'
  firstGid: number
}

// -- Sprite / Animation -------------------------------------------------------

export interface AnimationFrame {
  spriteId: number
  duration: number
}

export type AnimationStrategy = 'loop' | 'pingpong' | 'end' | 'freeze'

export interface AnimationData {
  id: string
  name?: string
  frames: AnimationFrame[]
  strategy: AnimationStrategy
}

export interface SpriteDataBase {
  id: number
  col: number
  row: number
  properties?: Properties
}

export type SpriteData = SpriteDataBase
export type SpriteDataSet = SpriteDataBase

export interface SpriteSetData {
  version: string
  id: string
  name: string
  image?: ImageReference
  rows: number
  columns: number
  spriteWidth: number
  spriteHeight: number
  spacing?: number
  sprites: SpriteDataSet[]
  animations?: AnimationData[]
}

// -- Map / Layer --------------------------------------------------------------

export interface ColliderShape {
  type: 'box' | 'circle' | 'edge' | 'polygon'
  [key: string]: unknown
}

export interface ObjectData {
  id: string
  name?: string
  x: number
  y: number
  width?: number
  height?: number
  properties?: Properties
  collider?: ColliderShape
}

export interface LayerData {
  id: string
  name?: string
  type: 'tile' | 'object' | 'group'
  data?: number[]
  objects?: ObjectData[]
  properties?: Properties
  visible?: boolean
}

export interface EditorMetadata {
  [key: string]: unknown
}

export interface MapData {
  id: string
  name?: string
  spriteSets?: SpriteSetReference[]
  pos?: { x: number; y: number }
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  layers: LayerData[]
  properties?: Properties
  editorMetadata?: EditorMetadata
}

// -- Game project -------------------------------------------------------------

export interface GameProjectEditorMetadata {
  [key: string]: unknown
}

export interface GameProjectData {
  id: string
  name?: string
  description?: string
  startup: GameStartupConfig
  maps: MapReference[]
  spriteSets: SpriteSetReference[]
  properties?: Properties
  editorMetadata?: GameProjectEditorMetadata
}

// -- Format classes (static deserializers) -----------------------------------

export class GameProjectFormat {
  static deserialize(input: string): GameProjectData
  static serialize(data: GameProjectData): string
}

export class MapFormat {
  static deserialize(input: string): MapData
  static serialize(data: MapData): string
}

export class SpriteSetFormat {
  static deserialize(input: string): SpriteSetData
  static serialize(data: SpriteSetData): string
}

// -- Resource classes (runtime types are excalibur-shaped; ambient as `any`) --

export interface MapResourceOptions extends ResourceOptions {
  headless?: boolean
}

export interface SpriteSetResourceOptions extends ResourceOptions {
  headless?: boolean
}

export interface GameProjectResourceOptions extends ResourceOptions {
  headless?: boolean
  baseDir?: string
  preloadAllSpriteSets?: boolean
  preloadAllMaps?: boolean
  initialMapId?: string
}

export class SpriteSetResource {
  constructor(path: string, options?: SpriteSetResourceOptions)
  readonly path: string
  data: SpriteSetData
  sprites: Record<number, any>
  animations: Record<string, any>
  spriteSheets: Map<string, any>
  load(): Promise<SpriteSetData>
  isLoaded(): boolean
  getSprite(id: number): any | undefined
}

export class MapResource implements Loadable<any> {
  constructor(path: string, options?: MapResourceOptions)
  readonly basePath: string
  readonly filename: string
  readonly mapData: MapData
  data: any
  load(): Promise<any>
  isLoaded(): boolean
  addToScene(scene: any): void
  getTileMaps(): any[]
  getFirstLayerId(): string | undefined
  getLayerIds(): string[]
}

export class GameProjectResource {
  constructor(path: string, options?: GameProjectResourceOptions)
  readonly path: string
  data: GameProjectData
  load(): Promise<GameProjectData>
  isLoaded(): boolean
  getMap(id: string): Promise<MapData | null>
  getSpriteSet(id: string): Promise<SpriteSetResource | null>
  loadMap(mapId: string): Promise<MapResource>
  resolvePath(path: string): string
  getMapResource(id: string): MapResource | undefined
  debugInfo(): void
}

// -- Utilities ---------------------------------------------------------------

export function extractDirectoryPath(path: string): string
export function getFilename(path: string): string
export function joinPaths(...parts: string[]): string
export function normalizePath(path: string): string
export function loadTextFile(path: string): Promise<string>
export function toFetchUrl(path: string): string
