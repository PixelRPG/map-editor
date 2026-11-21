import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import { type StarterPackCard, StarterPackShelf } from '@pixelrpg/gjs'

import Template from './add-graphics-dialog.blp'

GObject.type_ensure(StarterPackShelf.$gtype)

export interface AddGraphicsDialogSignals extends Adw.Dialog.SignalSignatures {
  'pack-selected': (packId: string) => void
  'import-requested': () => void
}

/**
 * The choice behind the Tilesets "+": a starter pack or the child's own
 * image. Presentation only — it names the pick and closes itself; the
 * host runs `win.add-starter-pack` or the import dialog.
 */
export class AddGraphicsDialog extends Adw.Dialog {
  declare _shelf: StarterPackShelf
  declare _import_row: Adw.ButtonRow

  static {
    GObject.registerClass(
      {
        GTypeName: 'AddGraphicsDialog',
        Template,
        InternalChildren: ['shelf', 'import_row'],
        Signals: {
          'pack-selected': { param_types: [GObject.TYPE_STRING] },
          'import-requested': {},
        },
      },
      AddGraphicsDialog,
    )
  }

  declare connect: GObject.SignalMethods<this, AddGraphicsDialogSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, AddGraphicsDialogSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, AddGraphicsDialogSignals>['emit']

  constructor() {
    super()
    this._shelf.lockAdded = true
    this._shelf.connect('pack-selected', (_s: StarterPackShelf, packId: string) => {
      this.emit('pack-selected', packId)
      this.close()
    })
    this._import_row.connect('activated', () => {
      this.emit('import-requested')
      this.close()
    })
  }

  /** The packs to offer; one the project already holds shows as added. */
  setPacks(cards: readonly StarterPackCard[]): void {
    this._shelf.setCards(cards)
  }
}
