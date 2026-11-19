import GLib from '@girs/glib-2.0'
import Gio from '@girs/gio-2.0'
import { bindtextdomain, textdomain } from 'gettext'
import { APPLICATION_ID, PREFIX } from './constants.ts'

/**
 * Where the compiled catalogues are, most specific first.
 *
 * `GJSIFY_LOCALE_DIR` is what the `gjsify ship` launcher exports, so a packaged install points at
 * its own prefix. The workspace path covers `gjsify run` / a bare `gjsify build` in a checkout,
 * where nothing sets the environment and `packages/translations` is the only place `.mo` exists.
 * `/usr/share/locale` is last, for a distro package that installed them the ordinary way.
 */
function localeDir(): string {
  const shipped = GLib.getenv('GJSIFY_LOCALE_DIR')
  if (shipped) return shipped
  const workspace = GLib.build_filenamev([PREFIX, '..', '..', 'packages', 'translations', 'dist', 'locale'])
  if (Gio.File.new_for_path(workspace).query_exists(null)) return workspace
  return '/usr/share/locale'
}

// The text domain is the app id, never the per-instance one (`PIXELRPG_INSTANCE` only changes
// the D-Bus name). This module is imported first in main.ts: a string translated before the
// domain is bound keeps its English text for the rest of the run.
bindtextdomain(APPLICATION_ID, localeDir())
textdomain(APPLICATION_ID)
