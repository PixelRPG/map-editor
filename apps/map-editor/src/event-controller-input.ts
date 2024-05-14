import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

export const EventControllerInput = GObject.registerClass(
    {
        GTypeName: 'EventControllerInput',
    },
    class EventControllerInput extends Gtk.EventControllerMotion {

        protected _isOutside = false

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
        }

        public addTo(widget: Gtk.Widget) {
            widget.add_controller(this)
        }

        protected onMouseMotion(_source: InstanceType<typeof EventControllerInput>, x: number, y: number) {

        }

        protected onMouseLeave() {
            this._isOutside = true
        }

        protected onMouseEnter() {
            this._isOutside = false
        }

    }
);

