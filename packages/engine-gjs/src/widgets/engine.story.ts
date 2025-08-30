import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'

import {
  StoryWidget,
  StoryMeta,
  ControlType,
  StoryModule,
} from '@pixelrpg/story-gjs'
import { Engine } from './engine'
import { EngineStatus, EngineMessageType } from '@pixelrpg/engine-core'

// Import story templates
import EngineStoryTemplate from './engine.story.blp'

/**
 * Engine Story Widget
 * Showcases the Engine component with interactive controls
 */
export class EngineStoryWidget extends StoryWidget {
  // UI elements from template
  declare _status_label: Gtk.Label
  declare _start_button: Gtk.Button
  declare _stop_button: Gtk.Button
  declare _load_button: Gtk.Button
  declare _engine_frame: Gtk.Frame

  /** The engine instance being showcased */
  protected engine: Engine | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'EngineStoryWidget',
        Template: EngineStoryTemplate,
        InternalChildren: [
          'status_label',
          'start_button',
          'stop_button',
          'load_button',
          'engine_frame',
        ],
      },
      this,
    )
  }

  /**
   * Create a new Engine story widget
   */
  constructor(adwParams: Partial<Adw.Bin.ConstructorProps> = {}) {
    // Set default metadata if not provided
    const params = {
      story: 'Engine',
      args: {
        status: EngineStatus.INITIALIZING,
      },
      meta: EngineStoryWidget.getMetadata(),
    }

    // Create the widget
    super(params, adwParams)

    // Connect button signals
    this._connectSignals()
  }

  /**
   * Connect UI signals to handlers
   */
  private _connectSignals(): void {
    this._start_button.connect('clicked', this._onStartClicked.bind(this))
    this._stop_button.connect('clicked', this._onStopClicked.bind(this))
    this._load_button.connect('clicked', this._onLoadClicked.bind(this))
  }

  /**
   * Get the metadata for the Engine story
   */
  static getMetadata(): StoryMeta {
    return {
      title: 'Engine/Game Engine',
      description:
        'Interactive game engine widget with viewport controls and status management',
      component: Engine.$gtype,
      tags: ['autodocs'],
      controls: [
        {
          name: 'width',
          label: 'Width',
          type: ControlType.RANGE,
          min: 320,
          max: 1920,
          step: 16,
          defaultValue: 800,
          description: 'Width of the engine viewport in pixels',
        },
        {
          name: 'height',
          label: 'Height',
          type: ControlType.RANGE,
          min: 240,
          max: 1080,
          step: 16,
          defaultValue: 600,
          description: 'Height of the engine viewport in pixels',
        },
        {
          name: 'status',
          label: 'Status',
          type: ControlType.SELECT,
          options: Object.values(EngineStatus).map((status) => ({
            label: status,
            value: status,
          })),
          defaultValue: EngineStatus.INITIALIZING,
          description: 'Current status of the engine',
        },
      ],
    }
  }

  /**
   * Initialize the story
   * Creates the engine instance and sets up event handling
   */
  initialize(): void {
    try {
      // Create engine instance
      this.engine = new Engine()

      // Add engine to the frame
      this._engine_frame.set_child(this.engine)

      // Update status label and buttons
      const initialStatus = this.args.status || EngineStatus.INITIALIZING
      this._updateStatusLabel(initialStatus)
      this._updateButtons(initialStatus)

      // Connect to engine events
      this._connectEngineEvents()

      // Initialize the engine
      this.engine.initialize().catch((error) => {
        console.error('Failed to initialize engine:', error)
        this._updateStatusLabel(EngineStatus.ERROR)
      })
    } catch (error) {
      console.error('Error during story initialization:', error)
    }
  }

  /**
   * Connect to engine events
   */
  private _connectEngineEvents(): void {
    if (!this.engine) return

    // Connect to the new specific event signals
    this.engine.connect(
      EngineMessageType.STATUS_CHANGED,
      (_engine: Engine, status: EngineStatus) => {
        console.log('[EngineStoryWidget] Engine status changed:', status)
        this._updateStatusLabel(status)
        this._updateButtons(status)
      },
    )

    this.engine.connect(
      EngineMessageType.PROJECT_LOADED,
      (_engine: Engine, projectId: string) => {
        console.log('[EngineStoryWidget] Engine project loaded:', projectId)
      },
    )

    this.engine.connect(
      EngineMessageType.MAP_LOADED,
      (_engine: Engine, mapId: string) => {
        console.log('[EngineStoryWidget] Engine map loaded:', mapId)
      },
    )

    this.engine.connect(
      EngineMessageType.ERROR,
      (_engine: Engine, message: string, error: Error | null) => {
        console.error('Engine error:', message, error)
        this._updateStatusLabel(EngineStatus.ERROR)
        this._updateButtons(EngineStatus.ERROR)
      },
    )

    this.engine.connect('ready', () => {
      console.log('Engine ready')
      this._updateStatusLabel(EngineStatus.READY)
      this._updateButtons(EngineStatus.READY)
    })
  }

  /**
   * Update the story arguments
   * @param args - New arguments for the story
   */
  updateArgs(args: Record<string, any>): void {
    if (!this.engine) return

    // Update engine dimensions if provided
    if (args.width !== undefined) {
      this.engine.width_request = args.width
    }

    if (args.height !== undefined) {
      this.engine.height_request = args.height
    }

    // Update status if provided
    if (args.status !== undefined) {
      this._updateStatusLabel(args.status)
      this._updateButtons(args.status)
    }
  }

  /**
   * Update the status label
   * @param status - The new engine status
   */
  protected _updateStatusLabel(status: EngineStatus): void {
    if (!this._status_label) return
    this._status_label.set_label(`Status: ${status}`)
  }

  /**
   * Update button sensitivities based on engine status
   * @param status - The engine status
   */
  protected _updateButtons(status: EngineStatus): void {
    // Set button sensitivity based on engine status
    this._start_button.set_sensitive(status === EngineStatus.READY)
    this._stop_button.set_sensitive(status === EngineStatus.RUNNING)
    this._load_button.set_sensitive(status === EngineStatus.READY)
  }

  /**
   * Handle start button clicks
   */
  protected _onStartClicked(): void {
    if (!this.engine) return

    this.engine
      .start()
      .then(() => console.log('[EngineStoryWidget] Engine started'))
      .catch((error) =>
        console.error('[EngineStoryWidget] Failed to start engine:', error),
      )
  }

  /**
   * Handle stop button clicks
   */
  protected _onStopClicked(): void {
    if (!this.engine) return

    this.engine
      .stop()
      .then(() => console.log('[EngineStoryWidget] Engine stopped'))
      .catch((error) =>
        console.error('[EngineStoryWidget] Failed to stop engine:', error),
      )
  }

  /**
   * Handle load project button clicks
   */
  protected _onLoadClicked(): void {
    if (!this.engine) return

    this.engine
      .loadProject('../../games/zelda-like/game-project.json')
      .then(() => console.log('[EngineStoryWidget] Project loaded'))
      .catch((error) =>
        console.error('[EngineStoryWidget] Failed to load project:', error),
      )
  }
}

// Ensure the type is registered
GObject.type_ensure(EngineStoryWidget.$gtype)

/**
 * Collection of all engine story variants
 */
export const EngineStories: StoryModule = {
  stories: [EngineStoryWidget],
}
