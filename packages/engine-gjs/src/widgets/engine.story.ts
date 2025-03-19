import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import { StoryWidget, StoryMeta, ControlType, StoryModule } from '@pixelrpg/story-gjs'
import { Engine } from './engine'
import { EngineStatus } from '@pixelrpg/engine-core'

// Import story templates
import BasicEngineStoryTemplate from './basic-engine.story.ui?raw'
import FullscreenEngineStoryTemplate from './fullscreen-engine.story.ui?raw'
import MobileEngineStoryTemplate from './mobile-engine.story.ui?raw'

/**
 * Base story widget for the Engine component
 * Provides common functionality for all engine story variants
 */
export abstract class EngineStoryWidget extends StoryWidget {
    // UI elements from template
    declare _status_label: Gtk.Label
    declare _start_button: Gtk.Button
    declare _stop_button: Gtk.Button
    declare _load_button: Gtk.Button
    declare _engine_frame: Gtk.Frame

    /** The engine instance being showcased */
    protected engine: Engine | null = null

    /**
     * Create a new Engine story widget
     */
    constructor(params: StoryWidget.ConstructorProps, adwParams: Partial<Adw.Bin.ConstructorProps> = {}) {
        // Set default metadata if not provided
        if (!params.meta) {
            params.meta = EngineStoryWidget.getMetadata()
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
            component: Engine.$gtype,
            tags: ['autodocs'],
            argTypes: {
                width: {
                    control: {
                        type: ControlType.RANGE,
                        min: 320,
                        max: 1920,
                        step: 16
                    },
                    description: 'Width of the engine viewport in pixels',
                    defaultValue: 800
                },
                height: {
                    control: {
                        type: ControlType.RANGE,
                        min: 240,
                        max: 1080,
                        step: 16
                    },
                    description: 'Height of the engine viewport in pixels',
                    defaultValue: 600
                },
                status: {
                    control: {
                        type: ControlType.SELECT,
                        options: Object.values(EngineStatus)
                    },
                    description: 'Current status of the engine',
                    defaultValue: EngineStatus.INITIALIZING
                }
            }
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
            this.engine.initialize().catch(error => {
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

        this.engine.connect('message-received', this._onEngineMessage.bind(this))
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
     * Handle engine messages
     * @param _engine - The engine that sent the message
     * @param message - The message data
     */
    protected _onEngineMessage(_engine: Engine, message: string): void {
        try {
            const event = JSON.parse(message)
            console.log('Engine event:', event)

            // Update status label if it's a status change
            if (event.type === 'statusChanged' && event.data) {
                this._updateStatusLabel(event.data)
                this._updateButtons(event.data)
            }
        } catch (error) {
            console.error('Failed to parse engine message:', error)
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

        this.engine.start()
            .then(() => console.log('Engine started'))
            .catch(error => console.error('Failed to start engine:', error))
    }

    /**
     * Handle stop button clicks
     */
    protected _onStopClicked(): void {
        if (!this.engine) return

        this.engine.stop()
            .then(() => console.log('Engine stopped'))
            .catch(error => console.error('Failed to stop engine:', error))
    }

    /**
     * Handle load project button clicks
     */
    protected _onLoadClicked(): void {
        if (!this.engine) return

        this.engine.loadProject('../../games/zelda-like/game-project.json')
            .then(() => console.log('Project loaded'))
            .catch(error => console.error('Failed to load project:', error))
    }
}

// Ensure the base type is registered
GObject.type_ensure(EngineStoryWidget.$gtype)

/**
 * Basic Engine Story Widget (800x600)
 * Standard desktop resolution for game testing
 */
export class BasicEngineStoryWidget extends EngineStoryWidget {
    static {
        GObject.registerClass({
            GTypeName: 'BasicEngineStoryWidget',
            Template: BasicEngineStoryTemplate,
            InternalChildren: ['status_label', 'start_button', 'stop_button', 'load_button', 'engine_frame'],
        }, this)
    }

    constructor(adwParams: Partial<Adw.Bin.ConstructorProps> = {}) {
        super({
            story: 'Basic',
            args: {
                status: EngineStatus.INITIALIZING
            },
            meta: EngineStoryWidget.getMetadata()
        }, adwParams)
    }
}

/**
 * Fullscreen Engine Story Widget (1920x1080)
 * Full HD resolution for testing high-resolution displays
 */
export class FullscreenEngineStoryWidget extends EngineStoryWidget {
    static {
        GObject.registerClass({
            GTypeName: 'FullscreenEngineStoryWidget',
            Template: FullscreenEngineStoryTemplate,
            InternalChildren: ['status_label', 'start_button', 'stop_button', 'load_button', 'engine_frame'],
        }, this)
    }

    constructor(adwParams: Partial<Adw.Bin.ConstructorProps> = {}) {
        super({
            story: 'Fullscreen',
            args: {
                status: EngineStatus.INITIALIZING
            },
            meta: EngineStoryWidget.getMetadata()
        }, adwParams)
    }
}

/**
 * Mobile Engine Story Widget (320x480)
 * Mobile phone portrait resolution for testing
 */
export class MobileEngineStoryWidget extends EngineStoryWidget {
    static {
        GObject.registerClass({
            GTypeName: 'MobileEngineStoryWidget',
            Template: MobileEngineStoryTemplate,
            InternalChildren: ['status_label', 'start_button', 'stop_button', 'load_button', 'engine_frame'],
        }, this)
    }

    constructor(adwParams: Partial<Adw.Bin.ConstructorProps> = {}) {
        super({
            story: 'Mobile',
            args: {
                status: EngineStatus.INITIALIZING
            },
            meta: EngineStoryWidget.getMetadata()
        }, adwParams)
    }
}

/**
 * Collection of all engine story variants
 */
export const EngineStories: StoryModule = {
    stories: [BasicEngineStoryWidget, FullscreenEngineStoryWidget, MobileEngineStoryWidget]
}