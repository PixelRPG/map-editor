/**
 * Defensive cleanup for `avahi-publish-service` subprocesses
 * orphaned by a previous maker crash / hard kill.
 *
 * The maker spawns `avahi-publish-service` via `Gio.Subprocess` to
 * advertise an active session. When the maker exits cleanly it
 * calls `LanPublisher.close()` which sends SIGINT and the
 * subprocess withdraws the mDNS record. But when the maker is
 * killed with SIGKILL, crashes inside the GJS bundle, or its
 * terminal is force-closed, the subprocess survives — `Gio.
 * Subprocess` doesn't set up the kernel parent-death link
 * (Linux's `PR_SET_PDEATHSIG`) and is not reparented to anything
 * that would notice the parent is gone. Result: the mDNS service
 * stays advertised indefinitely.
 *
 * User-visible symptom: a stale "Pixel RPG Adventure" entry in
 * the Welcome view's "Sessions on this network" list,
 * referencing a maker that no longer exists. Clicking it fails
 * with ECONNREFUSED because the WS server died with the parent.
 *
 * Fix: on every maker startup, scan `/proc/*` for
 * `avahi-publish-service` processes that
 *
 *   1. carry our service type (`_pixelrpg._tcp`) in their
 *      command line, AND
 *   2. have been re-parented to PID 1 — i.e. their original
 *      parent (the maker) is dead.
 *
 * Kill those with SIGTERM. Cross-user safety is automatic (Linux
 * refuses cross-uid kills). Two co-existing makers on the same
 * user are also safe — each publisher's parent is its own maker,
 * neither has ppid=1.
 *
 * Long-term: a Vala bridge that wraps `avahi_entry_group_add_
 * service` directly would skip the subprocess entirely; or a
 * thin C helper that sets `PR_SET_PDEATHSIG` between fork + exec
 * would make the subprocess die with the maker. Both are bigger
 * scope; the runtime scan here is the pragmatic fix.
 */

import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

import { SERVICE_TYPE } from './lan-discovery.ts'

const PROC_ROOT = '/proc'
const COMM_NAME = 'avahi-publish-service'

/**
 * Walk `/proc`, find every orphaned `avahi-publish-service`
 * advertising our service type, send each one SIGTERM. Best-
 * effort: errors are logged and the iteration continues — a
 * leftover that we can't kill is preferable to a noisy startup
 * crash.
 */
export function cleanupOrphanedPublishers(): { scanned: number; killed: number; errors: number } {
  let scanned = 0
  let killed = 0
  let errors = 0
  try {
    const procDir = Gio.File.new_for_path(PROC_ROOT)
    const enumerator = procDir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null)
    let info: Gio.FileInfo | null
    while ((info = enumerator.next_file(null)) !== null) {
      const name = info.get_name()
      if (!/^[0-9]+$/.test(name)) continue
      scanned++
      const pid = Number.parseInt(name, 10)
      if (!Number.isFinite(pid) || pid <= 1) continue
      try {
        if (!isOrphanedPixelrpgPublisher(pid)) continue
        if (sendSigterm(pid)) {
          killed++
          console.log(`[orphan-cleanup] killed leftover avahi-publish-service pid=${pid}`)
        }
      } catch (err) {
        errors++
        console.warn(`[orphan-cleanup] error inspecting pid=${pid}:`, err)
      }
    }
    enumerator.close(null)
  } catch (err) {
    errors++
    console.warn('[orphan-cleanup] failed to scan /proc:', err)
  }
  return { scanned, killed, errors }
}

/**
 * Return true when `pid` is an `avahi-publish-service` running
 * `_pixelrpg._tcp` with a dead parent (ppid === 1). Reads
 * `/proc/<pid>/comm`, `/proc/<pid>/cmdline`, and `/proc/<pid>/
 * status` to make the determination. Any I/O failure returns
 * false — we'd rather miss an orphan than kill the wrong
 * process.
 */
function isOrphanedPixelrpgPublisher(pid: number): boolean {
  const comm = readSmallFile(`${PROC_ROOT}/${pid}/comm`)
  if (!comm || !comm.trim().includes(COMM_NAME.slice(0, 15))) {
    // `/proc/.../comm` is truncated at 15 chars; check the
    // prefix instead of the full string.
    return false
  }
  const cmdline = readSmallFile(`${PROC_ROOT}/${pid}/cmdline`)
  if (!cmdline) return false
  // `cmdline` is NUL-separated argv. Split on `\0` so we can
  // tolerate args that include spaces (the service name often
  // does, e.g. "Pixel RPG Adventure").
  const args = cmdline.split('\0').filter((a) => a.length > 0)
  if (!args.includes(SERVICE_TYPE)) return false
  const status = readSmallFile(`${PROC_ROOT}/${pid}/status`)
  if (!status) return false
  // /proc/<pid>/status — one field per line, e.g. `PPid:\t1234`.
  const ppidMatch = status.match(/^PPid:\s*(\d+)/m)
  if (!ppidMatch) return false
  const ppid = Number.parseInt(ppidMatch[1], 10)
  return ppid === 1
}

function readSmallFile(path: string): string | null {
  try {
    const [ok, contents] = GLib.file_get_contents(path)
    if (!ok || !contents) return null
    return contents instanceof Uint8Array ? new TextDecoder('utf-8').decode(contents) : String(contents)
  } catch {
    return null
  }
}

/**
 * Send SIGTERM (15) to a pid via shell — `Gio.Subprocess` lacks a
 * direct way to address an arbitrary external pid, so we shell
 * out to `kill`. Returns true when the kill subprocess exited
 * successfully (which means the signal was at least DELIVERED,
 * not that the target acted on it within any timeframe).
 */
function sendSigterm(pid: number): boolean {
  try {
    const proc = Gio.Subprocess.new(
      ['kill', '-TERM', String(pid)],
      Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
    )
    proc.wait(null)
    return proc.get_successful()
  } catch (err) {
    console.warn(`[orphan-cleanup] kill -TERM ${pid} failed:`, err)
    return false
  }
}
