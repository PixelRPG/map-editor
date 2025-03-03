import Gtk from '@girs/gtk-4.0';

/**
 * Common options for GTK widgets
 */
export interface WidgetOptions {
    /**
     * Width request for the widget
     */
    width?: number;

    /**
     * Height request for the widget
     */
    height?: number;

    /**
     * Whether the widget is expanded
     */
    expand?: boolean;

    /**
     * CSS classes to apply to the widget
     */
    cssClasses?: string[];

    /**
     * Parent widget to add this widget to
     */
    parent?: Gtk.Widget;
} 