import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import type { StoryWidget } from '../widgets/story.widget'

/**
 * Control types available for story property editors
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
    /** Minimum value for number/range controls */
    min?: number
    /** Maximum value for number/range controls */
    max?: number
    /** Step increment for number/range controls */
    step?: number
    /** Options for select controls */
    options?: string[] | Record<string, string>
}

/**
 * Metadata for a story property
 */
export interface ArgType<T = unknown> {
    /** Control configuration for this property */
    control: ControlConfig
    /** Description of the property */
    description?: string
    /** Default value for the property */
    defaultValue?: T
}

/**
 * Metadata for a story component
 */
export interface StoryMeta {
    /** Title of the story (format: 'Category/Name') */
    title: string
    /** GType of the component being showcased */
    component: GObject.GType
    /** Tags for filtering and organization */
    tags?: string[]
    /** Configuration for the component properties */
    argTypes: Record<string, ArgType>
}

/**
 * Constructor interface for story widget classes
 */
export interface StoryWidgetConstructor {
    new(adwParams?: Partial<Adw.Bin.ConstructorProps>): StoryWidget;
    $gtype: GObject.GType;
    getMetadata?: () => StoryMeta;
}

/**
 * A module containing related stories for a component
 */
export interface StoryModule {
    /** Story classes in this module */
    stories: StoryWidgetConstructor[]
    /** Story instances (populated after initialization) */
    instances?: StoryWidget[]
}

/**
 * Registry for managing story modules
 */
export interface StoryRegistry {
    /** Register a single story module */
    registerStory: (storyModule: StoryModule) => void
    /** Register multiple story modules */
    registerStories: (storyModules: StoryModule[]) => void
    /** Get all registered story modules */
    getStories: () => StoryModule[]
    /** Create instances of all story widgets and prepare them for display */
    createStoryInstances: () => StoryModule[]
} 