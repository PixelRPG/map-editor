import Gio from '@girs/gio-2.0'
import { APPLICATION_ID, PKGDATADIR } from '../constants.ts'

/**
 * Locate the app's GSettings schema without aborting when it isn't
 * installed system-wide: `Gio.Settings.new()` hard-aborts the process on
 * a missing schema, so resolve through `Gio.SettingsSchemaSource` first
 * and fall back to the compiled schema shipped next to the app data
 * (`PKGDATADIR/gschemas.compiled`, produced by `gjsify run build:schemas`)
 * for uninstalled development runs.
 *
 * One `Gio.Settings` for the whole app: the theme and the view tier are
 * two keys of the same schema, and each service takes this object in
 * its `init`. Returns `null` when the schema is nowhere — the services
 * then fall back to non-persistent in-memory values with a warning, so
 * the app still starts.
 */
export function lookupAppSettings(): Gio.Settings | null {
  const defaultSource = Gio.SettingsSchemaSource.get_default()
  let schema = defaultSource?.lookup(APPLICATION_ID, true) ?? null
  if (!schema) {
    try {
      const devSource = Gio.SettingsSchemaSource.new_from_directory(PKGDATADIR, defaultSource, false)
      schema = devSource.lookup(APPLICATION_ID, false)
    } catch (error) {
      console.warn(`[AppSettings] No compiled schemas in ${PKGDATADIR}: ${error}`)
    }
  }
  if (!schema) return null
  return Gio.Settings.new_full(schema, null, null)
}
