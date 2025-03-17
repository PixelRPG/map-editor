import Gtk from '@girs/gtk-4.0';
import GObject from '@girs/gobject-2.0';

/**
 * Custom event controller for handling input events
 */
export class EventControllerInput extends Gtk.EventControllerMotion {
    /**
     * Flag indicating if the pointer is outside the widget
     */
    private _isOutside = false;

    get isOutside() {
        return this._isOutside;
    }

    static {
        GObject.registerClass({
            GTypeName: 'EventControllerInput',
            // We don't need to define custom signals here since we're using the built-in ones
        }, this);
    }

    /**
     * Create a new event controller
     */
    constructor() {
        super();
        // Connect to the Gtk signals and emit our custom signals
        this.connect('motion', this._onMotion.bind(this));
        this.connect('enter', this._onEnter.bind(this));
        this.connect('leave', this._onLeave.bind(this));
    }

    private _onMotion(_controller: this, x: number, y: number) {
        this._isOutside = false;
        // this.emit('motion', x, y);
    }

    private _onLeave(_controller: this) {
        this._isOutside = true;
        // this.emit('leave');
    }

    private _onEnter(_controller: this) {
        this._isOutside = false;
        // this.emit('enter');
    }

    /**
     * Add this controller to a widget
     * @param widget The widget to add the controller to
     */
    addTo(widget: Gtk.Widget) {
        widget.add_controller(this);
    }
} 