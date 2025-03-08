import GObject from '@girs/gobject-2.0'

import { ApplicationWindow } from './application-window.ts'
import { EngineView } from './engine-view.ts'
import { LayerRowWidget } from './layer-row.widget.ts'
import { LayersWidget } from './layers.widget.ts'
import { PreferencesDialog } from './preferences-dialog.ts'
import { ProjectView } from './project-view.ts'
import { SidebarPageLayer } from './sidebar-page-layer.ts'
import { SidebarPageTilesets } from './sidebar-page-tilesets.ts'
import { Sidebar } from './sidebar.ts'
import { SpriteSheetWidget } from './sprite-sheet.widget.ts'
import { SpriteWidget } from './sprite.widget.ts'
import { WelcomeView } from './welcome-view.ts'

// Ensure widgets are loaded and can be used in the XML
// GObject.type_ensure(ApplicationWindow.$gtype)
// GObject.type_ensure(EngineView.$gtype)
// GObject.type_ensure(LayerRowWidget.$gtype)
// GObject.type_ensure(LayersWidget.$gtype)
// GObject.type_ensure(PreferencesDialog.$gtype)
// GObject.type_ensure(ProjectView.$gtype)
// GObject.type_ensure(SidebarPageLayer.$gtype)
// GObject.type_ensure(SidebarPageTilesets.$gtype)
// GObject.type_ensure(Sidebar.$gtype)
// GObject.type_ensure(SpriteSheetWidget.$gtype)
// GObject.type_ensure(SpriteWidget.$gtype)
// GObject.type_ensure(WelcomeView.$gtype)

export { ApplicationWindow, EngineView, LayerRowWidget, LayersWidget, PreferencesDialog, ProjectView, SidebarPageLayer, SidebarPageTilesets, Sidebar, SpriteSheetWidget, SpriteWidget, WelcomeView }