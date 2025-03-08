import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { WebView } from '@pixelrpg/engine-gjs'
import { EngineView } from './engine-view.ts'
import { Sidebar } from './sidebar.ts'
import { SpriteSheetWidget } from './sprite-sheet.widget.ts'
import { LayersWidget } from './layers.widget.ts'

import { WelcomeView } from './welcome-view.ts'
import { ProjectView } from './project-view.ts'

import { SpriteSheet } from '../g-objects/sprite-sheet.ts'
import { Layer } from '../g-objects/layer.ts'

import { clientResourceManager } from '../managers/client-resource.manager.ts'

import type { ImageReference } from '@pixelrpg/data-core'
import { ImageResource } from '@pixelrpg/data-gjs'
import { MessageGeneric } from '@pixelrpg/messages-core'

import Template from './application-window.ui?raw'

// Ensure widgets are loaded and can be used in the XML
GObject.type_ensure(WebView.$gtype)
GObject.type_ensure(Sidebar.$gtype)
GObject.type_ensure(EngineView.$gtype)
GObject.type_ensure(WelcomeView.$gtype)
GObject.type_ensure(ProjectView.$gtype)

export class ApplicationWindow extends Adw.ApplicationWindow {

  // GObject internal children
  declare _welcomeView: WelcomeView | undefined
  declare _projectView: ProjectView | undefined
  declare _stack: Adw.ViewStack | undefined
  declare _toastOverlay: Adw.ToastOverlay | undefined

  static {
    GObject.registerClass({
      GTypeName: 'ApplicationWindow',
      Template,
      InternalChildren: ['welcomeView', 'projectView', 'stack', 'toastOverlay'],
    }, this);
  }

  constructor(application: Adw.Application) {
    super({ application })
    this.onEngineMessage = this.onEngineMessage.bind(this)
    this.onCreateProject = this.onCreateProject.bind(this)
    this.onOpenProject = this.onOpenProject.bind(this)

    // Connect welcome view signals
    this._welcomeView?.connect('create-project', this.onCreateProject)
    this._welcomeView?.connect('open-project', this.onOpenProject)

    // Connect engine signals if project view is active
    const engineView = this._projectView?.engineView
    if (engineView) {
      engineView.connect('message-received', (_source, message) => {
        this.onEngineMessage(JSON.parse(message))
      })
    }
  }

  protected onEngineMessage(message: MessageGeneric<'text'>) {
    console.log('Message from Engine:', message)
    this._projectView?.engineView?.sendMessage({ type: 'text', data: 'Hello back from GJS!' })
  }

  protected onCreateProject() {
    // Show dialog to create a new project
    const dialog = new Adw.MessageDialog({
      heading: _("Create New Project"),
      body: _("Enter a name for your new project:"),
      transient_for: this,
      modal: true,
    })

    dialog.add_response('cancel', _("Cancel"))
    dialog.add_response('create', _("Create"))
    dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED)

    const entry = new Gtk.Entry({
      placeholder_text: _("Project name"),
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12,
    })
    dialog.set_extra_child(entry)

    dialog.connect('response', (dialog, response) => {
      if (response === 'create') {
        const projectName = entry.get_text()
        if (projectName) {
          this.createNewProject(projectName)
        } else {
          this.showToast(_("Please enter a project name"))
        }
      }
      dialog.destroy()
    })

    dialog.present()
  }

  protected onOpenProject() {
    const dialog = new Gtk.FileChooserDialog({
      title: _("Open Project"),
      action: Gtk.FileChooserAction.OPEN,
      transient_for: this,
      modal: true,
    })

    dialog.add_button(_("Cancel"), Gtk.ResponseType.CANCEL)
    dialog.add_button(_("Open"), Gtk.ResponseType.ACCEPT)

    const filter = new Gtk.FileFilter()
    filter.set_name(_("PixelRPG Project Files"))
    filter.add_pattern("*.json")
    dialog.add_filter(filter)

    dialog.connect('response', (dialog, response) => {
      if (response === Gtk.ResponseType.ACCEPT) {
        const file = dialog.get_file()
        if (file) {
          this.openProject(file.get_path())
        }
      }
      dialog.destroy()
    })

    dialog.present()
  }

  protected createNewProject(name: string) {
    console.log('Creating new project:', name)
    // TODO: Implement project creation
    this._stack?.set_visible_child(this._projectView!)
  }

  protected openProject(path: string | null) {
    if (!path) {
      this.showToast(_("Invalid project path"))
      return
    }

    console.log('Opening project:', path)

    // Switch to project view
    this._stack?.set_visible_child(this._projectView!)

    // Load the project in the engine
    this._projectView?.engineView?.loadProject(path)
  }

  protected showToast(message: string) {
    const toast = new Adw.Toast({
      title: message,
      timeout: 3,
    })
    this._toastOverlay?.add_toast(toast)
  }

  parseImageResource(resource: ImageReference): ImageResource | null {
    if (!resource.path) {
      return null
    }

    return new ImageResource(resource.path)
  }
}
