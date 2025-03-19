import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { StoryMeta } from '../types/story'

import Template from './story.widget.ui?raw'

export namespace StoryWidget {
    export interface ConstructorProps {
        meta: StoryMeta,
        story: string,
        args: Record<string, any>
    }
}

/**
 * Base class for GJS story widgets
 */
export class StoryWidget extends Adw.Bin {
    // Story metadata
    private _meta: StoryMeta
    // Story name
    private _story: string
    // Story arguments
    private _args: Record<string, any>

    // UI elements
    declare _content_box: Gtk.Box
    declare _story_title: Gtk.Label
    declare _story_content: Gtk.Box

    static {
        GObject.registerClass({
            GTypeName: 'StoryWidget',
            Template,
            Properties: {
                'meta': GObject.ParamSpec.object(
                    'meta',
                    'Meta',
                    'Story metadata',
                    // @ts-ignore
                    GObject.ParamFlags.READWRITE,
                    GObject.Object
                ),
                'story': GObject.ParamSpec.string(
                    'story',
                    'Story Name',
                    'Story name',
                    // @ts-ignore
                    GObject.ParamFlags.READWRITE,
                    ''
                ),
                'args': GObject.ParamSpec.object(
                    'args',
                    'Args',
                    'Story arguments',
                    // @ts-ignore
                    GObject.ParamFlags.READWRITE,
                    GObject.Object
                ),
            },
            InternalChildren: ['content_box', 'story_title', 'story_content'],
        }, this)
    }

    /**
     * Create a new story widget
     * @param meta Story metadata
     * @param name Story name
     * @param args Story arguments
     */
    constructor(params: StoryWidget.ConstructorProps, adwParams: Partial<Adw.Bin.ConstructorProps> = {}) {
        super(adwParams)

        this._meta = params.meta
        this._story = params.story
        this._args = params.args

        this._updateTitle()
    }

    /**
     * Get the story metadata
     */
    get meta(): StoryMeta {
        return this._meta
    }

    /**
     * Set the story metadata
     */
    set meta(value: StoryMeta) {
        this._meta = value
        this._updateTitle()
    }

    /**
     * Get the story name
     */
    get story(): string {
        return this._story
    }

    /**
     * Set the story name
     */
    set story(value: string) {
        this._story = value
        this._updateTitle()
    }

    /**
     * Get the story arguments
     */
    get args(): Record<string, any> {
        return this._args
    }

    /**
     * Set the story arguments
     */
    set args(value: Record<string, any>) {
        this._args = value
        this.updateArgs(value)
    }

    /**
     * Update the story title
     */
    private _updateTitle(): void {
        if (this._story_title && this._meta) {
            this._story_title.set_label(`${this._meta.title} - ${this._story}`)
        }
    }

    /**
     * Initialize the story
     * Override this method in subclasses
     */
    initialize(): void {
        // Implement in subclasses
    }

    /**
     * Update the story arguments
     * Override this method in subclasses
     * @param args New arguments for the story
     */
    updateArgs(args: Record<string, any>): void {
        // Implement in subclasses
    }

    /**
     * Add a widget to the story content area
     * @param widget Widget to add
     */
    addContent(widget: Gtk.Widget): void {
        // Clear existing content
        let child = this._story_content.get_first_child()
        while (child) {
            child.unparent()
            child = this._story_content.get_first_child()
        }

        // Add new content
        this._story_content.append(widget)
    }
}

// Ensure the type is registered
GObject.type_ensure(StoryWidget.$gtype)

