import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { WelcomeView } from './welcome-view.ts'
import { ProjectView } from './project-view.ts'

import type { ImageReference } from '@pixelrpg/data-excalibur'
import { ImageResource } from '@pixelrpg/ui-gjs/sprite'

import Template from './application-window.blp'

export class ApplicationWindow extends Adw.ApplicationWindow {
  // GObject internal children
  declare _welcomeView: WelcomeView | undefined
  declare _projectView: ProjectView | undefined
  declare _stack: Adw.ViewStack | undefined
  declare _toastOverlay: Adw.ToastOverlay | undefined

  // Signal management
  private _signalHandlers: number[] = []

  static {
    GObject.registerClass(
      {
        GTypeName: 'ApplicationWindow',
        Template,
        InternalChildren: [
          'welcomeView',
          'projectView',
          'stack',
          'toastOverlay',
        ],
      },
      this,
    )
  }

  constructor(application: Adw.Application) {
    super({ application })
    this.onCreateProject = this.onCreateProject.bind(this)
    this.onOpenProject = this.onOpenProject.bind(this)

    this.connect('realize', () => {
      this.initialize()
    })
  }

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()

    if (this._signalHandlers.length === 0) {
      // Connect welcome view signals
      if (this._welcomeView) {
        const createProjectHandlerId = this._welcomeView.connect(
          'create-project',
          this.onCreateProject,
        )
        const openProjectHandlerId = this._welcomeView.connect(
          'open-project',
          this.onOpenProject,
        )
        this._signalHandlers.push(createProjectHandlerId, openProjectHandlerId)
      }

    }
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    if (this._signalHandlers.length > 0) {
      // Disconnect all signal handlers
      let handlerIndex = 0
      if (this._welcomeView && handlerIndex < this._signalHandlers.length) {
        this._welcomeView.disconnect(this._signalHandlers[handlerIndex])
        handlerIndex++
        if (handlerIndex < this._signalHandlers.length) {
          this._welcomeView.disconnect(this._signalHandlers[handlerIndex])
          handlerIndex++
        }
      }
      this._signalHandlers = []
    }

    super.vfunc_unmap()
  }

  protected async initialize() {
    await this._projectView?.engine?.initialize()
  }

  protected onCreateProject() {
    // Show dialog to create a new project
    const dialog = new Adw.MessageDialog({
      heading: _('Create New Project'),
      body: _('Enter a name for your new project:'),
      transient_for: this,
      modal: true,
    })

    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('create', _('Create'))
    dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED)

    const entry = new Gtk.Entry({
      placeholder_text: _('Project name'),
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
          this.showToast(_('Please enter a project name'))
        }
      }
      dialog.destroy()
    })

    dialog.present()
  }

  protected onOpenProject() {
    const dialog = new Gtk.FileChooserDialog({
      title: _('Open Project'),
      action: Gtk.FileChooserAction.OPEN,
      transient_for: this,
      modal: true,
    })

    dialog.add_button(_('Cancel'), Gtk.ResponseType.CANCEL)
    dialog.add_button(_('Open'), Gtk.ResponseType.ACCEPT)

    const filter = new Gtk.FileFilter()
    filter.set_name(_('PixelRPG Project Files'))
    filter.add_pattern('*.json')
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

  protected async openProject(path: string | null) {
    if (!path) {
      this.showToast(_('Invalid project path'))
      return
    }

    if (!this._projectView) {
      throw new Error('Project view not found')
    }

    console.log('[ApplicationWindow] Opening project:', path)

    // Switch to project view first
    this._stack?.set_visible_child(this._projectView!)

    try {
      // Wait for the project view to be ready, then start parallel loading
      if (this._projectView.engine?.status !== 'ready') {
        await new Promise<void>((resolve) => {
          this._projectView!.connect('ready', () => resolve())
        })
      }

      console.log('[ApplicationWindow] Starting parallel project loading')

      // Start both loading operations in parallel
      const engineLoadPromise = this._projectView!.engine!.loadProject(path)
      const projectViewLoadPromise = this._projectView!.loadProject(path)

      // Wait for both to complete
      await Promise.all([engineLoadPromise, projectViewLoadPromise])

      console.log(
        '[ApplicationWindow] Parallel project loading completed successfully',
      )
      this.showToast(_('Project loaded successfully'))
    } catch (error) {
      console.error('[ApplicationWindow] Failed to load project:', error)
      this.showToast(_('Failed to load project'))
    }
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
