/**
 * Instance-label → D-Bus address routing for the MCP↔D-Bus bridge. Kept
 * dependency-free (no `gi://` import) so it unit-tests under the node
 * target — the rest of the bridge (`index.ts`) opens a live session bus at
 * module load and can only run under GJS.
 */

/** Well-known base bus name the maker owns for its default instance. */
export const BASE_NAME = 'org.pixelrpg.maker'
/** Base object path the maker exports its Control interface under. */
export const BASE_PATH = '/org/pixelrpg/maker'

/**
 * Coerce a label into the same app-id segment the app derives from
 * PIXELRPG_INSTANCE. CONTRACT: byte-identical mapping to
 * `apps/maker-gjs/src/instance-id.ts` `sanitizeInstanceId` (the bridge is
 * deliberately dependency-free, so it cannot import it). The maker-side
 * `instance-id.spec.ts` AND this package's `instance-routing.spec.ts` pin
 * the mapping — change all copies + both specs together.
 */
export function sanitizeLabel(label: string): string {
  const cleaned = label.toLowerCase().replace(/[^a-z0-9]/g, '')
  return /^[a-z]/.test(cleaned) ? cleaned : `i${cleaned || '0'}`
}

/**
 * Resolve an instance label to its D-Bus name + Control object path. The
 * default instance keeps the bare base name/path; a named instance gets a
 * `.<segment>` bus-name suffix and a `/<segment>/control` path — so the
 * bridge dials the right editor process when several run at once.
 */
export function resolve(label?: string): { busName: string; controlPath: string; label: string } {
  const l = label && label !== 'default' ? sanitizeLabel(label) : 'default'
  if (l === 'default') return { busName: BASE_NAME, controlPath: `${BASE_PATH}/control`, label: 'default' }
  return { busName: `${BASE_NAME}.${l}`, controlPath: `${BASE_PATH}/${l}/control`, label: l }
}
