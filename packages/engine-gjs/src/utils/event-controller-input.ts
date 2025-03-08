import Gtk from '@girs/gtk-4.0';
import GObject from '@girs/gobject-2.0';

/**
 * Custom event controller for handling input events
 */
export class EventControllerInput extends Gtk.EventControllerMotion {
    static {
        GObject.registerClass({
            GTypeName: 'EventControllerInput',
            Signals: {
                'motion': {
                    param_types: [GObject.TYPE_DOUBLE, GObject.TYPE_DOUBLE]
                },
                'enter': { param_types: [] },
                'leave': { param_types: [] }
            }
        }, this);
    }

    private _isOutside = false;

    get isOutside() {
        return this._isOutside;
    }

    constructor() {
        super();
        this.connect('motion', this._onMotion.bind(this));
        this.connect('enter', this._onEnter.bind(this));
        this.connect('leave', this._onLeave.bind(this));
    }

    private _onMotion(_controller: this, x: number, y: number) {
        this.emit('motion', x, y);
    }

    private _onEnter(_controller: this) {
        this._isOutside = false;
        this.emit('enter');
    }

    private _onLeave(_controller: this) {
        this._isOutside = true;
        this.emit('leave');
    }

    /**
     * Add this controller to a widget
     * @param widget The widget to add this controller to
     */
    public addTo(widget: Gtk.Widget) {
        widget.add_controller(this);
    }
} 