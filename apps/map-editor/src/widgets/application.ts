import GObject from '@girs/gobject-2.0'
import Gio from '@girs/gio-2.0'
import Adw from '@girs/adw-1'

import { ApplicationWindow } from './application-window.ts'
import { PreferencesDialog } from './preferences-dialog.ts'
import { APPLICATION_ID } from '../constants.ts'

export const Application = GObject.registerClass(
    class Application extends Adw.Application {
        constructor() {
            super({
                applicationId: APPLICATION_ID,
                flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
            })
            this.initActions()
        }

        initActions() {
            // Quit action
            const quitAction = new Gio.SimpleAction({ name: 'quit' })
            quitAction.connect('activate', (_action) => {
                log('quitAction activated')
                this.quit()
            })
            this.add_action(quitAction)
            this.set_accels_for_action('app.quit', ['<primary>q'])

            // About action
            const showAboutAction = new Gio.SimpleAction({ name: 'about' })
            showAboutAction.connect('activate', (_action) => {
                const aboutParams = {
                    transient_for: this.active_window,
                    application_name: 'PixelRPG Map Editor',
                    application_icon: APPLICATION_ID,
                    developer_name: 'Pascal Garber',
                    version: '0.1.0',
                    developers: ['Pascal Garber'],
                    copyright: '© 2024 Pascal Garber',
                }
                const aboutWindow = new Adw.AboutWindow(aboutParams)
                aboutWindow.present()
            })
            this.add_action(showAboutAction)

            const showPreferencesAction = new Gio.SimpleAction({ name: 'preferences' })
            showPreferencesAction.connect('activate', (_action) => {
                const preferencesDialog = new PreferencesDialog()
                preferencesDialog.present(this.active_window)
            })
            this.add_action(showPreferencesAction)
        }

        vfunc_activate() {
            let { active_window } = this

            if (!active_window) active_window = new ApplicationWindow(this)

            active_window.present()
        }
    },
)
