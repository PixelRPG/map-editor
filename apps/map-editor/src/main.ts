import './global.d.ts'
import '@girs/gjs/dom'
import gjs from '@girs/gjs'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gio from '@girs/gio-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import WebKit from '@girs/webkit-6.0'
import system from 'system'

import { ApplicationWindow } from './widgets/application-window.ts'

const loop = GLib.MainLoop.new(null, false)

export const TestApplication = GObject.registerClass(
  class TestApplication extends Adw.Application {
    constructor() {
      super({
        applicationId: 'org.gnome.Example',
        flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
      })

      const quit_action = new Gio.SimpleAction({ name: 'quit' })
      quit_action.connect('activate', (_action) => {
        log('quit_action activated')
        this.quit()
      })
      this.add_action(quit_action)
      this.set_accels_for_action('app.quit', ['<primary>q'])

      const show_about_action = new Gio.SimpleAction({ name: 'about' })
      show_about_action.connect('activate', (_action) => {
        const aboutParams = {
          transient_for: this.active_window,
          application_name: 'test',
          application_icon: 'org.gnome.Example',
          developer_name: 'Pascal Garber',
          version: '0.1.0',
          developers: ['Pascal Garber'],
          copyright: '© 2024 Pascal Garber',
        }
        const aboutWindow = new Adw.AboutWindow(aboutParams)
        aboutWindow.present()
      })
      this.add_action(show_about_action)
    }

    vfunc_activate() {
      let { active_window } = this

      if (!active_window) active_window = new ApplicationWindow(this)

      active_window.present()
    }
  },
)

export function main(argv: string[]) {
  const application = new TestApplication()
  return application.runAsync(argv)
}

const exit_code = await main(
  [imports.system.programInvocationName].concat(ARGV),
)
log('exit_code: ' + exit_code)
system.exit(exit_code)

loop.run()
