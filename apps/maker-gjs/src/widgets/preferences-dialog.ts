import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'

import Template from './preferences-dialog.blp'
export class PreferencesDialog extends Adw.PreferencesDialog {
  static {
    GObject.registerClass(
      {
        GTypeName: 'PreferencesDialog',
        Template,
      },
      PreferencesDialog,
    )
  }

  constructor(params: Partial<Adw.PreferencesDialog.ConstructorProps> = {}) {
    super(params)
  }
}

GObject.type_ensure(PreferencesDialog.$gtype)
