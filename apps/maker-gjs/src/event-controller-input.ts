import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Gdk from '@girs/gdk-4.0'

/**
 * Handles the input for the map editor.
 * The MapEditor is inside the WebView where we could just use the input events of the WebView environment,
 * but we forward those here from GTK/GJS to the WebView to have a native app feel.
 */
export class EventControllerInput extends Gtk.EventControllerMotion {

    static {
        GObject.registerClass({
            GTypeName: 'EventControllerInput',
        }, this);
    }

    protected _isOutside = false

    // Currently just for testing click events, not used outside atm
    protected click = new Gtk.GestureClick();

    get isOutside() {
        return this._isOutside
    }

    constructor() {
        super()

        this.onMouseLeave = this.onMouseLeave.bind(this)
        this.onMouseEnter = this.onMouseEnter.bind(this)
        this.onMouseMotion = this.onMouseMotion.bind(this)

        this.connect('leave', this.onMouseLeave)
        this.connect('enter', this.onMouseEnter)
        this.connect('motion', this.onMouseMotion)

        this.click.connect('pressed', (_source: Gtk.GestureClick, nPress: number, x: number, y: number) => {
            console.log('pressed', {
                nPress,
                x,
                y
            })
        })

        this.click.connect('released', (_source: Gtk.GestureClick, nPress: number, x: number, y: number) => {
            console.log('released', {
                nPress,
                x,
                y
            })
        })

        this.click.connect('stopped', (_source: Gtk.GestureClick) => {
            console.log('stopped')
        })

        this.click.connect('unpaired-release', (_source: Gtk.GestureClick, x: number, y: number, button: number, sequence: Gdk.EventSequence | null) => {
            console.log('unpaired-release', {
                x,
                y,
                button,
                sequence
            })
        })
    }

    public addTo(widget: Gtk.Widget) {
        widget.add_controller(this)
        widget.add_controller(this.click)
    }

    protected onMouseMotion(_source: EventControllerInput, x: number, y: number) {

    }

    protected onMouseLeave() {
        this._isOutside = true
    }

    protected onMouseEnter() {
        this._isOutside = false
    }

}
