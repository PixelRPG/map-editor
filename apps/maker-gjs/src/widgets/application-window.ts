import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { Engine, WebView } from '@pixelrpg/engine-gjs'
import { Sidebar } from './sidebar.ts'
import { SpriteSheetWidget } from './sprite-sheet.widget.ts'
import { LayersWidget } from './layers.widget.ts'

import { WelcomeView } from './welcome-view.ts'
import { ProjectView } from './project-view.ts'

import { SpriteSheet } from '../objects/sprite-sheet.ts'
import { Layer } from '../objects/layer.ts'


import type { ImageReference } from '@pixelrpg/data-core'
import { ImageResource } from '@pixelrpg/data-gjs'

import Template from './application-window.ui?raw'

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
    this.onCreateProject = this.onCreateProject.bind(this)
    this.onOpenProject = this.onOpenProject.bind(this)

    // Connect welcome view signals
    this._welcomeView?.connect('create-project', this.onCreateProject)
    this._welcomeView?.connect('open-project', this.onOpenProject)

    // Connect engine signals if project view is active
    const engine = this._projectView?.engine
    if (!engine) {
      throw new Error('GJS engine not found')
    }

    this.connect('realize', () => {
      this.initialize()
    })
  }

  protected async initialize() {
    await this._projectView?.engine?.initialize()
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
          try {
            this.openProject(file.get_path())
          } catch (error) {
            console.error('[ApplicationWindow] Failed to open project:', error)
          }
        }
      }
      dialog.destroy()
    })

    dialog.present()
  }

  protected createNewProject(name: string) {
    console.log('[ApplicationWindow] Creating new project:', name)
    // TODO: Implement project creation
    this._stack?.set_visible_child(this._projectView!)
  }

  protected openProject(path: string | null) {
    if (!path) {
      this.showToast(_("Invalid project path"))
      return
    }

    if (!this._projectView) {
      throw new Error('Project view not found')
    }

    console.log('[ApplicationWindow] Opening project:', path)

    // Load the project in the engine
    this._projectView.connect('ready', () => {
      try {
        console.log('[ApplicationWindow] Loading project:', path)
        this._projectView!.engine!.loadProject(path)
      } catch (error) {
        console.error('[ApplicationWindow] Failed to load project:', error)
      }
    })

    // Switch to project view
    this._stack?.set_visible_child(this._projectView!)
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

GObject.type_ensure(ApplicationWindow.$gtype)