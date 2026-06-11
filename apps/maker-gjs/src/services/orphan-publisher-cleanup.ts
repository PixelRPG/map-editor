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
 *   2. have been re-parented to a SYSTEM REAPER process — i.e.
 *      their original parent (the maker) is dead. On modern
 *      systemd-user setups the reaper is the per-user systemd
 *      instance (typically PID != 1), NOT init. We treat
 *      `PPid == 1` AND `parent comm == 'systemd'` AS reaped.
 *
 * Kill those with SIGTERM. Cross-user safety is automatic (Linux
 * refuses cross-uid kills). Two co-existing makers on the same
 * user are also safe — each publisher's parent is its own
 * (alive) maker `gjs` process, not systemd.
 *
 * Why systemd-user matters: A previous version of this scan only
 * killed publishers with `PPid == 1`, which missed every orphan
 * on modern desktops where systemd-user is the orphan reaper. A
 * hand-test on 2026-05-30 found a 3-hour-old orphan with
 * `PPid == 6308` (the user's systemd-user PID) that the cleanup
 * silently skipped. This revision targets BOTH reaper kinds.
 *
 * Long-term: a Vala bridge that wraps `avahi_entry_group_add_
 * service` directly would skip the subprocess entirely; or a
 * thin C helper that sets `PR_SET_PDEATHSIG` between fork + exec
 * would make the subprocess die with the maker. Both are bigger
 * scope; the runtime scan here is the pragmatic fix.
 */

import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'

import { scopedLogger } from './collab-log.ts'
import { SERVICE_TYPE } from './lan-discovery.ts'

const log = scopedLogger('orphan-cleanup')
const PROC_ROOT = '/proc'
const COMM_NAME = 'avahi-publish-service'
const REAPER_COMMS = new Set(['systemd', 'init'])

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
    for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
      const name = info.get_name()
      if (!/^[0-9]+$/.test(name)) continue
      scanned++
      const pid = Number.parseInt(name, 10)
      if (!Number.isFinite(pid) || pid <= 1) continue
      try {
        if (!isOrphanedPixelrpgPublisher(pid)) continue
        if (sendSigterm(pid)) {
          killed++
          log.info(`killed leftover avahi-publish-service pid=${pid}`)
        }
      } catch (err) {
        errors++
        log.warn(`error inspecting pid=${pid}`, err)
      }
    }
    enumerator.close(null)
  } catch (err) {
    errors++
    log.warn('failed to scan /proc', err)
  }
  return { scanned, killed, errors }
}

/**
 * Return true when `pid` is an `avahi-publish-service` running
 * `_pixelrpg._tcp` whose parent looks like a system reaper —
 * meaning the original maker that spawned it is gone. Reads
 * `/proc/<pid>/comm`, `/proc/<pid>/cmdline`, `/proc/<pid>/
 * status`, and `/proc/<parent-pid>/comm` to make the
 * determination. Any I/O failure returns false — we'd rather
 * miss an orphan than kill the wrong process.
 *
 * Exported for unit-testing via the `readers` injection hook —
 * production passes the file-system-backed defaults; tests pass
 * in-memory fixtures so the cleanup logic can be exercised
 * without a real /proc tree.
 */
export function isOrphanedPixelrpgPublisher(pid: number, readers: ProcReaders = DEFAULT_PROC_READERS): boolean {
  const comm = readers.readComm(pid)
  if (!comm) return false
  if (!comm.trim().startsWith(COMM_NAME.slice(0, 15))) {
    // `/proc/.../comm` is truncated at 15 chars; check the
    // prefix instead of the full string.
    return false
  }
  const args = readers.readCmdlineArgs(pid)
  if (!args?.includes(SERVICE_TYPE)) return false
  const ppid = readers.readPpid(pid)
  if (ppid == null) return false
  // PID 1 = traditional init. Some systems (Fedora's containers,
  // early-boot, embedded) still use it as the orphan reaper.
  if (ppid === 1) return true
  // systemd-user — the per-user systemd instance is the reaper
  // for orphaned user-session processes on modern desktops. Check
  // the parent process's comm; if it's "systemd" (or "init",
  // historically), the publisher was reaped → orphan.
  const parentComm = readers.readComm(ppid)
  if (!parentComm) return false
  return REAPER_COMMS.has(parentComm.trim())
}

/** Reader bundle — injected for tests; production uses {@link DEFAULT_PROC_READERS}. */
export interface ProcReaders {
  readComm(pid: number): string | null
  readCmdlineArgs(pid: number): string[] | null
  readPpid(pid: number): number | null
}

export const DEFAULT_PROC_READERS: ProcReaders = {
  readComm: (pid) => readSmallFile(`${PROC_ROOT}/${pid}/comm`),
  readCmdlineArgs: (pid) => {
    const cmdline = readSmallFile(`${PROC_ROOT}/${pid}/cmdline`)
    if (!cmdline) return null
    return cmdline.split('\0').filter((a) => a.length > 0)
  },
  readPpid: (pid) => {
    const status = readSmallFile(`${PROC_ROOT}/${pid}/status`)
    if (!status) return null
    const match = status.match(/^PPid:\s*(\d+)/m)
    if (!match) return null
    const value = Number.parseInt(match[1], 10)
    return Number.isFinite(value) ? value : null
  },
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
    log.warn(`kill -TERM ${pid} failed`, err)
    return false
  }
}
