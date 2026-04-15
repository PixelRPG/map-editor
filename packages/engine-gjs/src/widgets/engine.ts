import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { CanvasWebGLWidget } from '@gjsify/webgl'
import { Canvas2DWidget } from '@gjsify/canvas2d'
import {
  EditorState,
  EngineEvent,
  EngineEventMap,
  EngineInterface,
  EngineStatus,
  ProjectLoadOptions,
  TypedEventEmitter,
} from '@pixelrpg/engine-core'
import { Engine as ExcaliburEngine } from '@pixelrpg/engine-excalibur'
import Template from './engine.blp'

function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ? `${err.message}\n${err.stack}` : err.message
  }
  try {
    return typeof err === 'string' ? err : JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export namespace Engine {
  export type ConstructorProps = Partial<Adw.Bin.ConstructorProps>

  export interface SignalProps {
    ready: []
    [EngineEvent.STATUS_CHANGED]: [EngineStatus]
    [EngineEvent.PROJECT_LOADED]: [string]
    [EngineEvent.MAP_LOADED]: [string]
    [EngineEvent.ERROR]: [string]
  }
}

/**
 * GJS engine widget.
 *
 * Hosts a gjsify CanvasWebGLWidget (WebGL 2, via Gtk.GLArea) and instantiates
 * the in-process Excalibur engine directly on its canvas. Falls back to
 * Canvas2DWidget (Cairo) if WebGL initialization fails.
 */
export class Engine extends Adw.Bin implements EngineInterface {
  declare private _canvasContainer: Gtk.Box

  private _widget: CanvasWebGLWidget | Canvas2DWidget | null = null
  private _excalibur: ExcaliburEngine | null = null
  private _ready = false

  public status: EngineStatus = EngineStatus.INITIALIZING
  public readonly events = new TypedEventEmitter<EngineEventMap>()

  static {
    GObject.registerClass(
      {
        GTypeName: 'Engine',
        Template,
        InternalChildren: ['canvasContainer'],
        Signals: {
          ready: {},
          [EngineEvent.STATUS_CHANGED]: {
            param_types: [GObject.TYPE_STRING],
          },
          [EngineEvent.PROJECT_LOADED]: {
            param_types: [GObject.TYPE_STRING],
          },
          [EngineEvent.MAP_LOADED]: {
            param_types: [GObject.TYPE_STRING],
          },
          [EngineEvent.ERROR]: {
            param_types: [GObject.TYPE_STRING],
          },
        },
      },
      this,
    )
  }

  constructor(params: Engine.ConstructorProps = {}) {
    super(params)
  }

  public async initialize(): Promise<void> {
    if (this._widget) return
    this._startWithWidget(false)
  }

  public async loadProject(
    projectPath: string,
    options?: ProjectLoadOptions,
  ): Promise<void> {
    await this._waitForReady()
    await this._excalibur!.loadProject(projectPath, options)
  }

  public async loadMap(mapId: string): Promise<void> {
    await this._waitForReady()
    await this._excalibur!.loadMap(mapId)
  }

  public async start(): Promise<void> {
    await this._waitForReady()
    await this._excalibur!.start()
  }

  public async stop(): Promise<void> {
    await this._waitForReady()
    await this._excalibur!.stop()
  }

  public setEditorState(state: Partial<EditorState>): void {
    this._excalibur?.setEditorState(state)
  }

  public getEditorState(): EditorState {
    return (
      this._excalibur?.getEditorState() ?? {
        tool: null,
        tileId: null,
        layerId: null,
      }
    )
  }

  public get excalibur(): ExcaliburEngine | null {
    return this._excalibur
  }

  private _startWithWidget(useFallback: boolean): void {
    let child = this._canvasContainer.get_first_child()
    while (child) {
      this._canvasContainer.remove(child)
      child = this._canvasContainer.get_first_child()
    }

    const widget = useFallback ? new Canvas2DWidget() : new CanvasWebGLWidget()
    widget.set_hexpand(true)
    widget.set_vexpand(true)
    widget.installGlobals()
    this._canvasContainer.append(widget)
    this._widget = widget

    widget.onReady(async (canvas: any) => {
      widget.grab_focus()
      canvas.width = widget.get_allocated_width() || 800
      canvas.height = widget.get_allocated_height() || 600

      widget.onResize((w: number, h: number) => {
        canvas.width = w
        canvas.height = h
        try {
          this._excalibur?.excalibur.screen.applyResolutionAndViewport()
        } catch {
          // screen not ready yet — ignore
        }
      })

      try {
        const engine = new ExcaliburEngine(canvas)
        this._forwardEvents(engine)
        this._excalibur = engine
        await engine.initialize()
        this._ready = true
        this.emit('ready')
      } catch (err) {
        const renderer = useFallback ? 'Canvas 2D' : 'WebGL'
        const detail = describeError(err)
        console.error(`[Engine] ${renderer} start failed: ${detail}`)
        this.status = EngineStatus.ERROR
        this.emit(EngineEvent.ERROR, detail)
        // Fallback disabled: swapping widgets after a failed GL init causes
        // libepoxy assertions (the dead GLArea context is still queried).
        // Re-enable once Excalibur cleanup is deterministic.
      }
    })
  }

  private _forwardEvents(engine: ExcaliburEngine): void {
    engine.events.on(EngineEvent.STATUS_CHANGED, (p) => {
      this.status = p.status
      this.events.emit(EngineEvent.STATUS_CHANGED, p)
      this.emit(EngineEvent.STATUS_CHANGED, p.status)
    })
    engine.events.on(EngineEvent.PROJECT_LOADED, (p) => {
      this.events.emit(EngineEvent.PROJECT_LOADED, p)
      this.emit(EngineEvent.PROJECT_LOADED, p.projectPath)
    })
    engine.events.on(EngineEvent.MAP_LOADED, (p) => {
      this.events.emit(EngineEvent.MAP_LOADED, p)
      this.emit(EngineEvent.MAP_LOADED, p.mapId)
    })
    engine.events.on(EngineEvent.ERROR, (p) => {
      this.events.emit(EngineEvent.ERROR, p)
      this.emit(EngineEvent.ERROR, p.message)
    })
    engine.events.on(EngineEvent.TILE_CLICKED, (p) => {
      this.events.emit(EngineEvent.TILE_CLICKED, p)
    })
    engine.events.on(EngineEvent.TILE_HOVERED, (p) => {
      this.events.emit(EngineEvent.TILE_HOVERED, p)
    })
    engine.events.on(EngineEvent.TILE_PLACED, (p) => {
      this.events.emit(EngineEvent.TILE_PLACED, p)
    })
  }

  private async _waitForReady(): Promise<void> {
    if (this._ready) return
    await new Promise<void>((resolve) => {
      const id = this.connect('ready', () => {
        this.disconnect(id)
        resolve()
      })
    })
  }
}
