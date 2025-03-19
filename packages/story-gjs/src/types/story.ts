import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import type { StoryWidget } from '../widgets/story.widget'

/**
 * Describes the type of control to be rendered for a specific property
 */
export enum ControlType {
    TEXT = 'text',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
    SELECT = 'select',
    RANGE = 'range',
    COLOR = 'color',
}

/**
 * Configuration for a property control
 */
export interface ControlConfig {
    /** Type of the control to render */
    type: ControlType
    /** Optional minimum value for number/range controls */
    min?: number
    /** Optional maximum value for number/range controls */
    max?: number
    /** Optional step value for number/range controls */
    step?: number
    /** Optional options for select controls */
    options?: string[] | Record<string, string>
}

/**
 * Metadata for a story argument (widget property)
 */
export interface ArgType {
    /** Control configuration for this argument */
    control: ControlConfig
    /** Optional description of the argument */
    description?: string
    /** Optional default value for the argument */
    defaultValue?: any
}

/**
 * Metadata for a story component
 */
export interface StoryMeta {
    /** Title of the story (format: 'Category/Name') */
    title: string
    /** GType of the component */
    component: GObject.GType
    /** Optional list of tags */
    tags?: string[]
    /** Configuration for the arguments/properties */
    argTypes: Record<string, ArgType>
}

/**
 * Constructor type for story widget classes
 */
export interface StoryWidgetConstructor {
    new(adwParams?: Partial<Adw.Bin.ConstructorProps>): StoryWidget;
    $gtype: GObject.GType;
    getMetadata?: () => StoryMeta;
}

/**
 * A module containing stories for a component
 */
export interface StoryModule {
    /** Story classes in this module */
    stories: StoryWidgetConstructor[]
    /** Story instances (populated after initialization) */
    instances?: StoryWidget[]
}

/**
 * Registry for story modules
 */
export interface StoryRegistry {
    /** Register a story module */
    registerStory: (storyModule: StoryModule) => void
    /** Register multiple story modules */
    registerStories: (storyModules: StoryModule[]) => void
    /** Get all registered story modules */
    getStories: () => StoryModule[]
    /** Create instances of all story widgets */
    createStoryInstances: () => StoryModule[]
} 