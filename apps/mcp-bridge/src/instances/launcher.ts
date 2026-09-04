import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

/** Editor processes this orchestrator launched, keyed by sanitized label. */
const launched = new Map<string, Gio.Subprocess>()

/** Absolute path to the maker bundle (via CLAUDE_PROJECT_DIR, else relative to this bundle). */
export function makerBinary(): string {
  const projectDir = GLib.getenv('CLAUDE_PROJECT_DIR')
  if (projectDir) return GLib.build_filenamev([projectDir, 'apps', 'maker-gjs', 'org.pixelrpg.maker'])
  const [self] = GLib.filename_from_uri(import.meta.url)
  const dist = GLib.path_get_dirname(self) // …/apps/mcp-bridge/dist
  const repo = GLib.path_get_dirname(GLib.path_get_dirname(GLib.path_get_dirname(dist)))
  return GLib.build_filenamev([repo, 'apps', 'maker-gjs', 'org.pixelrpg.maker'])
}

/**
 * Start an editor process for `label` and remember it. Spawns through a
 * login shell so the user's full PATH (node, gjsify, ~/.local/bin) is
 * loaded — the MCP server's own env (inherited from the host app) is
 * typically too minimal for `gjsify run` to resolve node.
 */
export function spawnInstance(label: string): void {
  const launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE)
  launcher.setenv('PIXELRPG_INSTANCE', label, true)
  const shell = GLib.getenv('SHELL') || '/bin/bash'
  launched.set(label, launcher.spawnv([shell, '-lc', `exec gjsify run ${GLib.shell_quote(makerBinary())}`]))
}

/** Did this orchestrator start the instance for `label`? */
export function isManagedInstance(label: string): boolean {
  return launched.has(label)
}

/**
 * Force-exit the instance for `label` and forget it. Answers `false` when
 * this orchestrator never started it — the caller then asks it to quit over
 * D-Bus instead.
 */
export function terminateInstance(label: string): boolean {
  const proc = launched.get(label)
  if (!proc) return false
  forceExit(proc)
  launched.delete(label)
  return true
}

/** Force-exit every instance this orchestrator started (client disconnected, or a fatal error). */
export function killAllLaunched(): void {
  for (const proc of launched.values()) forceExit(proc)
  launched.clear()
}

function forceExit(proc: Gio.Subprocess): void {
  try {
    proc.force_exit()
  } catch {
    /* best-effort */
  }
}
