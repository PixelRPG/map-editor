import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { WebView } from './webview.ts'
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
import type { State } from '@pixelrpg/data-core'
import type { MessageEvent, EventDataStateChanged, MessageText } from '@pixelrpg/messages-core'

import Template from './application-window.ui?raw'

// Ensure widgets are loaded and can be used in the XML
GObject.type_ensure(WebView.$gtype)
GObject.type_ensure(Sidebar.$gtype)
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
    this.onWebViewStateChanged = this.onWebViewStateChanged.bind(this)
    this.onWebViewMessage = this.onWebViewMessage.bind(this)
    this.onCreateProject = this.onCreateProject.bind(this)
    this.onOpenProject = this.onOpenProject.bind(this)

    // Connect welcome view signals
    this._welcomeView?.connect('create-project', this.onCreateProject)
    this._welcomeView?.connect('open-project', this.onOpenProject)

    // Connect webview signals if project view is active
    const webView = this._projectView?.webView
    if (webView) {
      webView.messagesService.onEvent('state-changed', this.onWebViewStateChanged)
      webView.messagesService.onMessage(this.onWebViewMessage)
    }
  }

  protected onWebViewMessage(message: MessageText) {
    console.log('Message from WebView:', message)
    this._projectView?.webView?.messagesService.send({ type: 'text', data: 'Hello back from GJS!' })
  }

  protected onWebViewStateChanged(event: MessageEvent<EventDataStateChanged<State>>) {
    const webView = this._projectView?.webView
    const state = webView?.messagesService.state

    if (!state) {
      console.error('No state in event')
      return
    }

    console.log('onWebViewStateChanged Property:', event.data.data.property)

    switch (event.data.data.property) {
      case "spriteSheets":
        if (!state?.spriteSheets.length) {
          console.log('No resources or spriteSheets in state')
          return
        }

        if (!state.spriteSheets[0].image) {
          console.error('No image in spriteSheet')
          return
        }

        const imageResource = this.parseImageResource(state.spriteSheets[0].image)
        if (!imageResource) {
          console.error('Failed to parse image resource')
          return
        }

        const spriteSheet = new SpriteSheet(state.spriteSheets[0], imageResource)

        const spriteSheetWidget = new SpriteSheetWidget(spriteSheet)
        this._projectView?.sidebar?.setSpriteSheet(spriteSheetWidget)
        break;

      case "map":
        console.log('onWebViewStateChanged Map:', event.data.data.value)
        break;
      case "layers":
        console.log('onWebViewStateChanged Layers:', event.data.data.value)
        const layers = state.layers.map((layer) => new Layer({ name: layer.name, type: layer.type }))
        const layersWidget = new LayersWidget(layers)
        this._projectView?.sidebar?.setLayers(layersWidget)
        break;

      default:
        break;
    }
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
    // Show dialog to open an existing project
    const dialog = new Gtk.FileChooserDialog({
      title: _("Open Project"),
      transient_for: this,
      modal: true,
      action: Gtk.FileChooserAction.OPEN,
    })

    dialog.add_button(_("Cancel"), Gtk.ResponseType.CANCEL)
    dialog.add_button(_("Open"), Gtk.ResponseType.ACCEPT)

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

    // Switch to project view
    this._stack?.set_visible_child_name('project-view')

    // Show toast notification
    this.showToast(`Project "${name}" created`)
  }

  protected openProject(path: string | null) {
    if (!path) return

    console.log('Opening project:', path)

    // Switch to project view
    this._stack?.set_visible_child_name('project-view')

    // Show toast notification
    this.showToast(`Project opened: ${path}`)
  }

  protected showToast(message: string) {
    const toast = new Adw.Toast({
      title: message,
      timeout: 3,
    })
    this._toastOverlay?.add_toast(toast)
  }

  // TODO: Move to a parser?
  parseImageResource(resource: ImageReference): ImageResource | null {
    const pixbuf = clientResourceManager.getPixbuf(resource.path)
    if (!pixbuf) {
      console.error('Failed to get pixbuf for resource:', resource.path)
      return null
    }
    const imageResource = ImageResource.fromPixbuf(pixbuf)
    return imageResource
  }
}
