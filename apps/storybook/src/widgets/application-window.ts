import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { StoryModule, StoryWidget } from '@pixelrpg/story-gjs'

import Template from './application-window.ui?raw'

export class StorybookWindow extends Adw.ApplicationWindow {
    private currentStory: StoryWidget | null = null

    // GObject internal children
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
     */
    private _onToggleControls(button: Gtk.ToggleButton): void {
        const isActive = button.get_active();
        this._controls_split_view.set_show_sidebar(isActive);
    }

    /**
     * Populates the sidebar with categories and stories
     * @param storyModules The story modules to display
     */
    populateSidebar(storyModules: StoryModule[]): void {
        // Organize stories by categories
        const categories = new Map<string, StoryWidget[]>()

        storyModules.forEach(storyModule => {
            // For each story in the module
            storyModule.stories.forEach(story => {
                const [category] = story.meta.title.split('/')
                if (!categories.has(category)) {
                    categories.set(category, [])
                }
                categories.get(category)!.push(story)
            })
        })

        // Create categories and stories in the sidebar
        categories.forEach((stories, category) => {
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

            // Stories in this category
            stories.forEach(story => {
                const storyName = story.meta.title.split('/')[1]
                const storyRow = new Gtk.ListBoxRow() as Gtk.ListBoxRow & { 'story-widget': StoryWidget }
                const storyLabel = new Gtk.Label({
                    label: storyName,
                    halign: Gtk.Align.START,
                    margin_start: 20,
                })
                storyRow.set_child(storyLabel)
                this._sidebar_list.append(storyRow)

                // Store the Story Widget as data for the row
                storyRow['story-widget'] = story
            })
        })
    }

    /**
     * Handles the selection of a story in the sidebar
     */
    private _onStorySelected(_listbox: Gtk.ListBox, row: Gtk.ListBoxRow | null): void {
        if (!row) return

        const storyWidget = (row as any)['story-widget'] as StoryWidget
        if (!storyWidget) return

        // Show the story
        this._showStory(storyWidget)

        // In collapsed mode, show the content page
        if (this._main_split_view.get_collapsed()) {
            this._main_split_view.set_show_content(true);
        }
    }

    /**
     * Shows a story in the content area
     */
    private _showStory(storyWidget: StoryWidget): void {
        this.currentStory = storyWidget

        // Update title
        this._preview_title.set_title(`${storyWidget.meta.title} - ${storyWidget.name}`)

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
     */
    private _updateControlPanel(storyWidget: StoryWidget): void {
        // Clear control panel
        let child = this._control_panel.get_first_child()
        while (child) {
            child.unparent()
            child = this._control_panel.get_first_child()
        }

        // Create controls for each property
        Object.entries(storyWidget.meta.argTypes).forEach(([propName, argType]) => {
            const controlRow = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                margin_bottom: 15,
            })

            // Label with description
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

            if (argType.description) {
                const infoButton = new Gtk.Button({
                    icon_name: 'help-about-symbolic',
                    has_frame: false,
                    halign: Gtk.Align.END,
                    hexpand: true,
                    tooltip_text: argType.description,
                })
                labelBox.append(infoButton)
            }

            controlRow.append(labelBox)

            // Create the control based on the type
            const control = this._createControl(storyWidget, propName, argType.control)
            if (control) {
                controlRow.append(control)
                this._control_panel.append(controlRow)
            }
        })

        // Show controls panel when a story is selected
        this._show_controls_button.set_active(true);
    }

    /**
     * Creates a control widget for a property
     */
    private _createControl(storyWidget: StoryWidget, propName: string, config: any): Gtk.Widget | null {
        let control: Gtk.Widget | null = null
        const currentValue = storyWidget.args[propName]

        switch (config.type) {
            case 'text':
                const entry = new Gtk.Entry({
                    text: currentValue || '',
                })
                entry.connect('changed', () => {
                    storyWidget.args = {
                        ...storyWidget.args,
                        [propName]: entry.get_text()
                    }
                })
                control = entry
                break

            case 'number':
                const spinButton = new Gtk.SpinButton({
                    adjustment: new Gtk.Adjustment({
                        lower: config.min || 0,
                        upper: config.max || 100,
                        step_increment: config.step || 1,
                        value: currentValue || 0,
                    }),
                })
                spinButton.connect('value-changed', () => {
                    storyWidget.args = {
                        ...storyWidget.args,
                        [propName]: spinButton.get_value()
                    }
                })
                control = spinButton
                break

            case 'boolean':
                const switchControl = new Gtk.Switch({
                    active: currentValue || false,
                    halign: Gtk.Align.START,
                })
                switchControl.connect('state-set', (_: any, state: boolean) => {
                    storyWidget.args = {
                        ...storyWidget.args,
                        [propName]: state
                    }
                    return false
                })
                control = switchControl
                break

            case 'range':
                const scale = new Gtk.Scale({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    adjustment: new Gtk.Adjustment({
                        lower: config.min || 0,
                        upper: config.max || 100,
                        step_increment: config.step || 1,
                        value: currentValue || 0,
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
                control = scale
                break

            // Weitere Control-Typen implementieren...
        }

        return control
    }
}

GObject.type_ensure(StorybookWindow.$gtype) 