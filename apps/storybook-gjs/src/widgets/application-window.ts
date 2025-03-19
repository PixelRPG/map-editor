import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { ControlType, StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { StoryRow } from '../types'
import Template from './application-window.ui?raw'


/**
 * Main window for the Storybook application
 * Displays story modules in a sidebar and selected stories in the main content area
 */
export class StorybookWindow extends Adw.ApplicationWindow {
    /** Currently displayed story widget */
    private currentStory: StoryWidget | null = null

    // GObject internal children from template
    declare _sidebar_list: Gtk.ListBox
    declare _content_area: Gtk.Box
    declare _control_panel: Gtk.Box
    declare _preview_title: Adw.WindowTitle
    declare _show_controls_button: Gtk.ToggleButton
    declare _controls_split_view: Adw.OverlaySplitView
    declare _main_split_view: Adw.NavigationSplitView

    static {
        GObject.registerClass({
            GTypeName: 'StorybookWindow',
            Template,
            InternalChildren: [
                'sidebar_list',
                'content_area',
                'control_panel',
                'preview_title',
                'show_controls_button',
                'controls_split_view',
                'main_split_view'
            ],
        }, this)
    }

    /**
     * Create a new Storybook window
     */
    constructor(params: Partial<Adw.ApplicationWindow.ConstructorProps>) {
        super(params)

        // Connect sidebar selection
        this._sidebar_list.connect('row-selected', this._onStorySelected.bind(this))

        // Connect toggle button for controls sidebar
        this._show_controls_button.connect('toggled', this._onToggleControls.bind(this))

        // Set initial state for controls visibility
        this._controls_split_view.set_show_sidebar(true)
    }

    /**
     * Handle toggle button for controls sidebar
     * @param button - The toggle button that was clicked
     */
    private _onToggleControls(button: Gtk.ToggleButton): void {
        const isActive = button.get_active();
        this._controls_split_view.set_show_sidebar(isActive);
    }

    /**
     * Populates the sidebar with categories and stories from the provided modules
     * @param storyModules - The story modules to display
     */
    populateSidebar(storyModules: StoryModule[]): void {
        // Clear existing sidebar items
        this._clearSidebar()

        // Verify that modules have instances
        if (!storyModules.some(module => module.instances?.length)) {
            console.error('Story modules do not have instances. Call createStoryInstances first.')
            return
        }

        // Organize stories by categories
        const categories = this._groupStoriesByCategory(storyModules)

        // Create categories and stories in the sidebar
        categories.forEach((stories, category) => {
            this._addCategoryToSidebar(category)
            stories.forEach(story => this._addStoryToSidebar(story))
        })
    }

    /**
     * Clear all items from the sidebar
     */
    private _clearSidebar(): void {
        let child = this._sidebar_list.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            child.unparent();
            child = next;
        }
    }

    /**
     * Group stories from modules by their category
     */
    private _groupStoriesByCategory(storyModules: StoryModule[]): Map<string, StoryWidget[]> {
        const categories = new Map<string, StoryWidget[]>()

        storyModules.forEach(storyModule => {
            if (!storyModule.instances?.length) return;

            storyModule.instances.forEach(storyInstance => {
                const [category] = storyInstance.meta.title.split('/')

                if (!categories.has(category)) {
                    categories.set(category, [])
                }

                categories.get(category)!.push(storyInstance)
            })
        })

        return categories
    }

    /**
     * Add a category header to the sidebar
     */
    private _addCategoryToSidebar(category: string): void {
        // Category header
        const categoryRow = new Gtk.ListBoxRow({
            selectable: false,
        })

        const categoryLabel = new Gtk.Label({
            label: `<b>${category}</b>`,
            use_markup: true,
            halign: Gtk.Align.START,
            margin_top: 10,
            margin_bottom: 5,
            margin_start: 10,
            margin_end: 10,
        })

        categoryRow.set_child(categoryLabel)
        this._sidebar_list.append(categoryRow)
    }

    /**
     * Add a story item to the sidebar
     */
    private _addStoryToSidebar(story: StoryWidget): void {
        const storyName = story.meta.title.split('/')[1]

        // Create row for the story
        const storyRow = new Gtk.ListBoxRow() as StoryRow

        const storyLabel = new Gtk.Label({
            label: storyName,
            halign: Gtk.Align.START,
            margin_start: 20,
        })

        storyRow.set_child(storyLabel)
        this._sidebar_list.append(storyRow)

        // Store the Story Widget as data for the row
        storyRow.storyWidget = story
    }

    /**
     * Handles the selection of a story in the sidebar
     */
    private _onStorySelected(_listbox: Gtk.ListBox, row: Gtk.ListBoxRow | null): void {
        if (!row) return

        const storyRow = row as StoryRow
        if (!storyRow.storyWidget) return

        // Show the story
        this._showStory(storyRow.storyWidget)

        // In collapsed mode, show the content page
        if (this._main_split_view.get_collapsed()) {
            this._main_split_view.set_show_content(true)
        }
    }

    /**
     * Shows a story in the content area
     * @param storyWidget - The story widget to display
     */
    private _showStory(storyWidget: StoryWidget): void {
        this.currentStory = storyWidget

        // Update title
        this._preview_title.set_title(`${storyWidget.meta.title} - ${storyWidget.story}`)

        // Clear content area
        this._clearContentArea()

        // Add the story widget to the content area
        this._content_area.append(storyWidget)

        // Update the control panel
        this._updateControlPanel(storyWidget)
    }

    /**
     * Clears the content area
     */
    private _clearContentArea(): void {
        let child = this._content_area.get_first_child()
        while (child) {
            child.unparent()
            child = this._content_area.get_first_child()
        }
    }

    /**
     * Updates the control panel with controls for the story properties
     * @param storyWidget - The story widget to create controls for
     */
    private _updateControlPanel(storyWidget: StoryWidget): void {
        // Clear control panel
        this._clearControlPanel()

        // Create controls for each property
        Object.entries(storyWidget.meta.argTypes).forEach(([propName, argType]) => {
            const controlRow = this._createControlRow(storyWidget, propName, argType)
            if (controlRow) {
                this._control_panel.append(controlRow)
            }
        })

        // Show controls panel when a story is selected
        this._show_controls_button.set_active(true)
    }

    /**
     * Clears the control panel
     */
    private _clearControlPanel(): void {
        let child = this._control_panel.get_first_child()
        while (child) {
            child.unparent()
            child = this._control_panel.get_first_child()
        }
    }

    /**
     * Creates a control row for a property
     */
    private _createControlRow(storyWidget: StoryWidget, propName: string, argType: any): Gtk.Box | null {
        const controlRow = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_bottom: 15,
        })

        // Label with description
        const labelBox = this._createPropertyLabelBox(propName, argType.description)
        controlRow.append(labelBox)

        // Create the control based on the type
        const control = this._createControl(storyWidget, propName, argType.control)
        if (control) {
            controlRow.append(control)
            return controlRow
        }

        return null
    }

    /**
     * Creates a label box for a property
     */
    private _createPropertyLabelBox(propName: string, description?: string): Gtk.Box {
        const labelBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_bottom: 5,
        })

        const nameLabel = new Gtk.Label({
            label: `<b>${propName}</b>`,
            use_markup: true,
            halign: Gtk.Align.START,
        })
        labelBox.append(nameLabel)

        if (description) {
            const infoButton = new Gtk.Button({
                icon_name: 'help-about-symbolic',
                has_frame: false,
                halign: Gtk.Align.END,
                hexpand: true,
                tooltip_text: description,
            })
            labelBox.append(infoButton)
        }

        return labelBox
    }

    /**
     * Creates a control widget for a property
     * @param storyWidget - The story widget to create the control for
     * @param propName - The name of the property to control
     * @param config - The control configuration
     * @returns A GTK widget for controlling the property
     */
    private _createControl(
        storyWidget: StoryWidget,
        propName: string,
        config: { type: ControlType; min?: number; max?: number; step?: number; options?: any }
    ): Gtk.Widget | null {
        if (!config || !config.type) return null;

        const currentValue = storyWidget.args[propName]

        switch (config.type) {
            case ControlType.TEXT:
                return this._createTextControl(storyWidget, propName, currentValue)

            case ControlType.NUMBER:
                return this._createNumberControl(storyWidget, propName, currentValue, config)

            case ControlType.BOOLEAN:
                return this._createBooleanControl(storyWidget, propName, currentValue)

            case ControlType.RANGE:
                return this._createRangeControl(storyWidget, propName, currentValue, config)

            case ControlType.SELECT:
                return this._createSelectControl(storyWidget, propName, currentValue, config)

            case ControlType.COLOR:
                return this._createColorControl(storyWidget, propName, currentValue)

            default:
                console.warn(`Unsupported control type: ${config.type}`)
                return null
        }
    }

    /**
     * Creates a text input control
     */
    private _createTextControl(storyWidget: StoryWidget, propName: string, currentValue: any): Gtk.Entry {
        const entry = new Gtk.Entry({
            text: currentValue || '',
        })

        entry.connect('changed', () => {
            storyWidget.args = {
                ...storyWidget.args,
                [propName]: entry.get_text()
            }
        })

        return entry
    }

    /**
     * Creates a number input control
     */
    private _createNumberControl(
        storyWidget: StoryWidget,
        propName: string,
        currentValue: any,
        config: { min?: number; max?: number; step?: number }
    ): Gtk.SpinButton {
        const spinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: config.min ?? 0,
                upper: config.max ?? 100,
                step_increment: config.step ?? 1,
                value: currentValue ?? 0,
            }),
        })

        spinButton.connect('value-changed', () => {
            storyWidget.args = {
                ...storyWidget.args,
                [propName]: spinButton.get_value()
            }
        })

        return spinButton
    }

    /**
     * Creates a boolean toggle control
     */
    private _createBooleanControl(storyWidget: StoryWidget, propName: string, currentValue: any): Gtk.Switch {
        const switchControl = new Gtk.Switch({
            active: Boolean(currentValue),
            halign: Gtk.Align.START,
        })

        switchControl.connect('state-set', (_: any, state: boolean) => {
            storyWidget.args = {
                ...storyWidget.args,
                [propName]: state
            }
            return false
        })

        return switchControl
    }

    /**
     * Creates a range slider control
     */
    private _createRangeControl(
        storyWidget: StoryWidget,
        propName: string,
        currentValue: any,
        config: { min?: number; max?: number; step?: number }
    ): Gtk.Scale {
        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: config.min ?? 0,
                upper: config.max ?? 100,
                step_increment: config.step ?? 1,
                value: currentValue ?? 0,
            }),
            draw_value: true,
            hexpand: true,
        })

        scale.connect('value-changed', () => {
            storyWidget.args = {
                ...storyWidget.args,
                [propName]: scale.get_value()
            }
        })

        return scale
    }

    /**
     * Creates a select dropdown control
     */
    private _createSelectControl(
        storyWidget: StoryWidget,
        propName: string,
        currentValue: any,
        config: { options?: any }
    ): Gtk.Widget | null {
        // This would need to be implemented based on the options format
        // Not implemented in this refactoring
        return null
    }

    /**
     * Creates a color picker control
     */
    private _createColorControl(storyWidget: StoryWidget, propName: string, currentValue: any): Gtk.Widget | null {
        // This would need GTK color button implementation
        // Not implemented in this refactoring
        return null
    }
}

// Ensure the GType is registered
GObject.type_ensure(StorybookWindow.$gtype) 